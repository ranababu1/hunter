import { redirect } from "next/navigation";
import { Nav } from "@/components/Nav";
import { AppMain } from "@/components/AppMain";
import { MeProvider } from "@/components/MeProvider";
import { getAuthSecret, requireUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

/**
 * Authenticated shell. Proxy already rejects unsigned/expired cookies;
 * this catches a *validly signed* session whose user no longer exists
 * (deleted account, wiped Redis) so tenants never see an empty shell
 * or someone else's data. Dev soft-open (no secret) is preserved.
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
  return (
    <MeProvider>
      <div className="min-h-screen">
        <Nav />
        <AppMain>{children}</AppMain>
      </div>
    </MeProvider>
  );
}
