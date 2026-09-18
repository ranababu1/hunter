import { readFile } from "fs/promises";
import path from "path";
import type {
  AppState,
  CompanyProfile,
  KanbanStatus,
  QuotaErrorBody,
  UserProfile,
} from "./types";
import { getRedis } from "./users";
import { u } from "./keys";
import {
  getBilling,
  getUsage,
  getUserAppState,
  markUserVisited,
  patchUserJobState,
  setUsage,
  setUserJobStatus,
} from "./users";
import { resolveEntitlements } from "./plans";
import type { User } from "./types";

export { getRedis };
export const COMPANIES_KEY = "hunter:companies"; // legacy global (migration source)

function utf8Bytes(s: string): number {
  return new TextEncoder().encode(s).length;
}

/** Approximate storage: companies JSON + profile JSON + kanban status/visited. */
export async function computeBytesUsed(userId: string): Promise<number> {
  const redis = getRedis();
  if (!redis) return 0;
  const keys = u(userId);
  try {
    const [companiesRaw, profileRaw, status, visited, fetchRunsRaw] =
      await Promise.all([
        redis.get<string | CompanyProfile[]>(keys.companies),
        redis.get<string | UserProfile>(keys.profile),
        redis.hgetall<Record<string, string>>(keys.status),
        redis.smembers(keys.visited),
        redis.get<string>(keys.fetchRuns),
      ]);
    const companiesStr =
      companiesRaw == null
        ? "[]"
        : typeof companiesRaw === "string"
          ? companiesRaw
          : JSON.stringify(companiesRaw);
    const profileStr =
      profileRaw == null
        ? "{}"
        : typeof profileRaw === "string"
          ? profileRaw
          : JSON.stringify(profileRaw);
    const statusStr = JSON.stringify(status ?? {});
    const visitedStr = JSON.stringify(visited ?? []);
    const fetchRunsStr =
      fetchRunsRaw == null
        ? "[]"
        : typeof fetchRunsRaw === "string"
          ? fetchRunsRaw
          : JSON.stringify(fetchRunsRaw);
    return (
      utf8Bytes(companiesStr) +
      utf8Bytes(profileStr) +
      utf8Bytes(statusStr) +
      utf8Bytes(visitedStr) +
      utf8Bytes(fetchRunsStr)
    );
  } catch (err) {
    console.warn("[hunter] computeBytesUsed failed:", err);
    return 0;
  }
}

export async function recomputeAndStoreUsage(userId: string): Promise<number> {
  const bytesUsed = await computeBytesUsed(userId);
  await setUsage(userId, {
    bytesUsed,
    updatedAt: new Date().toISOString(),
  });
  return bytesUsed;
}

export async function checkStorageQuota(
  user: User,
  projectedBytes: number,
): Promise<QuotaErrorBody | null> {
  const billing = await getBilling(user.id);
  const ent = resolveEntitlements(user.role, billing);
  if (projectedBytes > ent.maxStorageBytes) {
    const usage = await getUsage(user.id);
    return {
      error: "QUOTA_EXCEEDED",
      kind: "storage",
      limit: ent.maxStorageBytes,
      used: usage?.bytesUsed ?? projectedBytes,
      message: "Free tier maxxed out. Continue for $10/mo",
    };
  }
  return null;
}

export async function checkCompanyLimit(
  user: User,
  nextCount: number,
): Promise<QuotaErrorBody | null> {
  const billing = await getBilling(user.id);
  const ent = resolveEntitlements(user.role, billing);
  if (nextCount > ent.maxCompanies) {
    return {
      error: "PLAN_LIMIT",
      kind: "companies",
      limit: Number.isFinite(ent.maxCompanies) ? ent.maxCompanies : -1,
      used: nextCount - 1,
      message: "Company limit reached — upgrade your plan",
    };
  }
  return null;
}

export async function loadSeedCompanies(): Promise<CompanyProfile[]> {
  const file = path.join(process.cwd(), "data", "companies.json");
  const raw = await readFile(file, "utf8");
  const parsed = JSON.parse(raw) as CompanyProfile[];
  if (!Array.isArray(parsed)) return [];
  return parsed;
}

export async function getCompanies(userId: string): Promise<{
  companies: CompanyProfile[];
  fromSeed: boolean;
  redisAvailable: boolean;
}> {
  const redis = getRedis();
  if (!redis) {
    const companies = await loadSeedCompanies();
    return { companies, fromSeed: true, redisAvailable: false };
  }
  const key = u(userId).companies;
  try {
    const raw = await redis.get<string | CompanyProfile[]>(key);
    if (raw == null) {
      // New user: start empty (not shared seed) — admin migration copies globals
      const companies: CompanyProfile[] = [];
      await redis.set(key, JSON.stringify(companies));
      return { companies, fromSeed: false, redisAvailable: true };
    }
    const companies =
      typeof raw === "string" ? (JSON.parse(raw) as CompanyProfile[]) : raw;
    if (!Array.isArray(companies)) {
      await redis.set(key, JSON.stringify([]));
      return { companies: [], fromSeed: false, redisAvailable: true };
    }
    return { companies, fromSeed: false, redisAvailable: true };
  } catch (err) {
    console.warn("[hunter] getCompanies failed:", err);
    return { companies: [], fromSeed: false, redisAvailable: false };
  }
}

export async function saveCompanies(
  userId: string,
  companies: CompanyProfile[],
): Promise<boolean> {
  const redis = getRedis();
  if (!redis) return false;
  try {
    await redis.set(u(userId).companies, JSON.stringify(companies));
    await recomputeAndStoreUsage(userId);
    return true;
  } catch (err) {
    console.warn("[hunter] saveCompanies failed:", err);
    return false;
  }
}

/** Estimate bytes if companies list were replaced (for pre-check). */
export async function projectedBytesWithCompanies(
  userId: string,
  companies: CompanyProfile[],
): Promise<number> {
  const redis = getRedis();
  if (!redis) return utf8Bytes(JSON.stringify(companies));
  const keys = u(userId);
  try {
    const [profileRaw, status, visited, fetchRunsRaw] = await Promise.all([
      redis.get<string | UserProfile>(keys.profile),
      redis.hgetall<Record<string, string>>(keys.status),
      redis.smembers(keys.visited),
      redis.get<string>(keys.fetchRuns),
    ]);
    const profileStr =
      profileRaw == null
        ? "{}"
        : typeof profileRaw === "string"
          ? profileRaw
          : JSON.stringify(profileRaw);
    const fetchRunsStr =
      fetchRunsRaw == null
        ? "[]"
        : typeof fetchRunsRaw === "string"
          ? fetchRunsRaw
          : JSON.stringify(fetchRunsRaw);
    return (
      utf8Bytes(JSON.stringify(companies)) +
      utf8Bytes(profileStr) +
      utf8Bytes(JSON.stringify(status ?? {})) +
      utf8Bytes(JSON.stringify(visited ?? [])) +
      utf8Bytes(fetchRunsStr)
    );
  } catch {
    return utf8Bytes(JSON.stringify(companies));
  }
}

export async function projectedBytesWithProfile(
  userId: string,
  profile: UserProfile,
): Promise<number> {
  const redis = getRedis();
  if (!redis) return utf8Bytes(JSON.stringify(profile));
  const keys = u(userId);
  try {
    const [companiesRaw, status, visited, fetchRunsRaw] = await Promise.all([
      redis.get<string | CompanyProfile[]>(keys.companies),
      redis.hgetall<Record<string, string>>(keys.status),
      redis.smembers(keys.visited),
      redis.get<string>(keys.fetchRuns),
    ]);
    const companiesStr =
      companiesRaw == null
        ? "[]"
        : typeof companiesRaw === "string"
          ? companiesRaw
          : JSON.stringify(companiesRaw);
    const fetchRunsStr =
      fetchRunsRaw == null
        ? "[]"
        : typeof fetchRunsRaw === "string"
          ? fetchRunsRaw
          : JSON.stringify(fetchRunsRaw);
    return (
      utf8Bytes(companiesStr) +
      utf8Bytes(JSON.stringify(profile)) +
      utf8Bytes(JSON.stringify(status ?? {})) +
      utf8Bytes(JSON.stringify(visited ?? [])) +
      utf8Bytes(fetchRunsStr)
    );
  } catch {
    return utf8Bytes(JSON.stringify(profile));
  }
}

// ── Back-compat wrappers (require userId — callers updated) ─────────

export async function getAppState(userId: string): Promise<AppState> {
  return getUserAppState(userId);
}

export async function markVisited(userId: string, jobId: string): Promise<void> {
  await markUserVisited(userId, jobId);
  await recomputeAndStoreUsage(userId);
}

export async function setJobStatus(
  userId: string,
  jobId: string,
  status: KanbanStatus,
): Promise<void> {
  await setUserJobStatus(userId, jobId, status);
  await recomputeAndStoreUsage(userId);
}

export async function patchJobState(
  userId: string,
  jobId: string,
  patch: { visited?: boolean; status?: KanbanStatus },
): Promise<AppState> {
  const state = await patchUserJobState(userId, jobId, patch);
  await recomputeAndStoreUsage(userId);
  return state;
}
