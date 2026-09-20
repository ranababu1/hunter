import { redirect } from "next/navigation";
import { Nav } from "@/components/Nav";
import { AppMain } from "@/components/AppMain";
import { MeProvider } from "@/components/MeProvider";
import { getAuthSecret, isOnboarded, requireUser } from "@/lib/auth";
import { getCompanies } from "@/lib/redis";
import { getProfile, markOnboardingComplete } from "@/lib/users";

export const dynamic = "force-dynamic";

/**
 * Authenticated shell.
 * 1. Proxy already rejects unsigned/expired cookies; this catches a validly
 *    signed session whose user no longer exists.
 * 2. Tenants who have not finished onboarding are sent to /onboarding so a
 *    brand-new account starts from a blank, self-configured workspace.
 *    Accounts created before onboarding existed are grandfathered in when
 *    they already have companies or target roles.
 */
export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await requireUser();
  if (!user && getAuthSecret()) {
    redirect("/login?reason=expired");
  }

  if (user && !isOnboarded(user)) {
    const [{ companies }, profile] = await Promise.all([
      getCompanies(user.id),
      getProfile(user.id),
    ]);
    const hasSetup = companies.length > 0 || profile.targetRoles.length > 0;
    if (hasSetup) {
      await markOnboardingComplete(user.id);
    } else {
      redirect("/onboarding");
    }
  }

  return (
    <MeProvider>
      <div className="min-h-screen">
        <Nav />
        <AppMain>{children}</AppMain>
      </div>
    </MeProvider>
  );
}
