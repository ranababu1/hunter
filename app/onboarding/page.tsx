import { redirect } from "next/navigation";
import { getAuthSecret, isOnboarded, requireUser } from "@/lib/auth";
import { OnboardingWizard } from "@/components/OnboardingWizard";

export const dynamic = "force-dynamic";

/**
 * Standalone onboarding (no app shell). A tenant lands here right after
 * registering and cannot reach the app until it is complete.
 */
export default async function OnboardingPage() {
  const user = await requireUser();
  if (!user) {
    if (getAuthSecret()) redirect("/login?from=%2Fonboarding");
    return (
      <main className="flex min-h-screen items-center justify-center px-4 py-16">
        <div className="glass max-w-md p-8 text-sm text-[var(--text-muted)]">
          Sign in to start onboarding.
        </div>
      </main>
    );
  }
  if (isOnboarded(user)) redirect("/daily");

  return (
    <main className="relative flex min-h-screen items-start justify-center px-4 py-10 sm:py-16">
      <OnboardingWizard userName={user.name} />
    </main>
  );
}
