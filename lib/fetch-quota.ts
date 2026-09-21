import { u } from "./keys";
import { getRedis } from "./users";
import { todayIST } from "./plans";

/**
 * Manual "Run fetch" click quota — separate from the plan's fetch cadence
 * (which gates the automatic/eligibility-tracked run). Free-tier tenants
 * get a small number of manual clicks per calendar day (IST); the
 * `?fetch=more` query param on the run request raises that ceiling for the
 * same day, and a "special friend" account (admin-granted) always gets the
 * boosted ceiling with no param needed. Paid plans and admin are not
 * subject to this counter at all — they keep the existing cadence gate in
 * lib/fetches.ts.
 */
export const MANUAL_FETCH_LIMITS = {
  base: 2,
  boosted: 10,
} as const;

export interface ManualFetchState {
  count: number;
  limit: number;
  remaining: number;
  boosted: boolean;
  canRun: boolean;
  resetsAt: string;
}

/** Approximate next IST midnight, for display only (the Redis key uses the exact IST date string). */
function nextMidnightIstIso(now: Date = new Date()): string {
  const ist = new Date(now.toLocaleString("en-US", { timeZone: "Asia/Calcutta" }));
  const next = new Date(ist.getFullYear(), ist.getMonth(), ist.getDate() + 1, 0, 0, 0);
  return next.toISOString();
}

export async function getManualFetchCount(userId: string): Promise<number> {
  const redis = getRedis();
  if (!redis) return 0;
  try {
    const raw = await redis.get<string | number>(u(userId).manualFetches(todayIST()));
    return raw != null ? Number(raw) || 0 : 0;
  } catch {
    return 0;
  }
}

export async function incrManualFetchCount(userId: string): Promise<number> {
  const redis = getRedis();
  if (!redis) return 0;
  try {
    const key = u(userId).manualFetches(todayIST());
    const count = await redis.incr(key);
    if (count === 1) {
      await redis.expire(key, 60 * 60 * 48); // 2 days — comfortably covers the IST offset
    }
    return count;
  } catch {
    return 0;
  }
}

/** `limit` is the resolved daily ceiling — callers decide base vs boosted vs special-friend. */
export async function getManualFetchState(
  userId: string,
  limit: number,
): Promise<ManualFetchState> {
  const count = await getManualFetchCount(userId);
  return {
    count,
    limit,
    remaining: Math.max(0, limit - count),
    boosted: limit > MANUAL_FETCH_LIMITS.base,
    canRun: count < limit,
    resetsAt: nextMidnightIstIso(),
  };
}
