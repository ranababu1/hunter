import { getDailyDigest } from "@/lib/jobs";
import { getAppState } from "@/lib/redis";
import { DailyView } from "@/components/DailyView";

export const dynamic = "force-dynamic";

export default async function DailyPage() {
  const [digest, state] = await Promise.all([
    getDailyDigest(),
    getAppState(),
  ]);

  if (!digest) {
    return (
      <div className="glass p-10 text-center text-[var(--text-muted)]">
        No daily digests yet. Drop a file into{" "}
        <code className="text-[var(--accent)]">data/daily/</code>.
      </div>
    );
  }

  return (
    <DailyView
      title={digest.title}
      date={digest.date}
      jobs={digest.jobs}
      initialState={state}
    />
  );
}
