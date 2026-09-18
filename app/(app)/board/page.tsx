import { getConsolidatedJobs } from "@/lib/jobs";
import { getAppState } from "@/lib/redis";
import { BoardView } from "@/components/BoardView";

export const dynamic = "force-dynamic";

export default async function BoardPage() {
  const [jobs, state] = await Promise.all([
    getConsolidatedJobs(),
    getAppState(),
  ]);

  return <BoardView jobs={jobs} initialState={state} />;
}
