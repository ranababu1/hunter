import { getDigestsPreferUser, getJobsPreferUser } from "@/lib/jobs";
import { getAppState } from "@/lib/redis";
import { requireUser } from "@/lib/auth";
import { DailyView } from "@/components/DailyView";

export const dynamic = "force-dynamic";

export default async function DailyPage() {
  const user = await requireUser();
  const userId = user?.id ?? null;
  const [{ dates, digests }, state, allJobs] = await Promise.all([
    getDigestsPreferUser(userId),
    user
      ? getAppState(user.id)
      : Promise.resolve({ visited: [] as string[], status: {} }),
    getJobsPreferUser(userId),
  ]);

  if (digests.length === 0) {
    return (
      <div className="glass p-10 text-center text-[var(--text-muted)]">
        No daily digests yet. Publish via{" "}
        <code className="text-[var(--accent)]">POST /api/ingest/daily</code>{" "}
        or drop a file into{" "}
        <code className="text-[var(--accent)]">data/daily/</code>.
      </div>
    );
  }

  const initialDate = dates[0] ?? digests[0].date;

  return (
    <DailyView
      dates={dates}
      digests={digests}
      initialDate={initialDate}
      initialState={state}
      allJobs={allJobs}
    />
  );
}
