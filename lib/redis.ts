import { Redis } from "@upstash/redis";
import type { AppState, KanbanStatus } from "./types";

const VISITED_KEY = "hunter:visited";
const STATUS_KEY = "hunter:status";

function getRedis(): Redis | null {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;
  return new Redis({ url, token });
}

export async function getAppState(): Promise<AppState> {
  const redis = getRedis();
  if (!redis) {
    return { visited: [], status: {} };
  }
  try {
    const [visited, status] = await Promise.all([
      redis.smembers(VISITED_KEY),
      redis.hgetall<Record<string, KanbanStatus>>(STATUS_KEY),
    ]);
    return {
      visited: (visited as string[]) ?? [],
      status: status ?? {},
    };
  } catch (err) {
    console.warn("[hunter] Redis getAppState failed:", err);
    return { visited: [], status: {} };
  }
}

export async function markVisited(jobId: string): Promise<void> {
  const redis = getRedis();
  if (!redis) return;
  try {
    await redis.sadd(VISITED_KEY, jobId);
  } catch (err) {
    console.warn("[hunter] Redis markVisited failed:", err);
  }
}

export async function setJobStatus(
  jobId: string,
  status: KanbanStatus,
): Promise<void> {
  const redis = getRedis();
  if (!redis) return;
  try {
    await redis.hset(STATUS_KEY, { [jobId]: status });
  } catch (err) {
    console.warn("[hunter] Redis setJobStatus failed:", err);
  }
}

export async function patchJobState(
  jobId: string,
  patch: { visited?: boolean; status?: KanbanStatus },
): Promise<AppState> {
  if (patch.visited) {
    await markVisited(jobId);
  }
  if (patch.status) {
    await setJobStatus(jobId, patch.status);
  }
  return getAppState();
}
