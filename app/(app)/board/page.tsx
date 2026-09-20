import { getJobsPreferUser } from "@/lib/jobs";
import { getAppState } from "@/lib/redis";
import { requireUser } from "@/lib/auth";
import { BoardView } from "@/components/BoardView";

export const dynamic = "force-dynamic";

export default async function BoardPage() {
  const user = await requireUser();
  const [jobs, state] = await Promise.all([
    getJobsPreferUser(user?.id),
    user
      ? getAppState(user.id)
      : Promise.resolve({ visited: [] as string[], status: {} }),
  ]);

  return <BoardView jobs={jobs} initialState={state} />;
}
