import { getConsolidatedJobs } from "@/lib/jobs";
import { getAppState } from "@/lib/redis";
import { KanbanBoard } from "@/components/KanbanBoard";

export const dynamic = "force-dynamic";

export default async function KanbanPage() {
  const [jobs, state] = await Promise.all([
    getConsolidatedJobs(),
    getAppState(),
  ]);

  return <KanbanBoard jobs={jobs} initialState={state} />;
}
