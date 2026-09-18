import {
  getAllDailyDigests,
  getConsolidatedJobs,
  listDailyDates,
} from "@/lib/jobs";
import { getAppState } from "@/lib/redis";
import { requireUser } from "@/lib/auth";
import { DailyView } from "@/components/DailyView";

export const dynamic = "force-dynamic";

export default async function DailyPage() {
  const user = await requireUser();
  const [dates, digests, state, allJobs] = await Promise.all([
    listDailyDates(),
    getAllDailyDigests(),
    user
      ? getAppState(user.id)
      : Promise.resolve({ visited: [] as string[], status: {} }),
    getConsolidatedJobs(),
  ]);

  if (digests.length === 0) {
    return (
      <div className="glass p-10 text-center text-[var(--text-muted)]">
        No daily digests yet. Drop a file into{" "}
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
