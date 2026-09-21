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
import {
  CACHE_TTL,
  cacheGet,
  cacheSet,
  invalidateUser,
  userCacheKey,
} from "./cache";

export { getRedis };
export const COMPANIES_KEY = "hunter:companies"; // legacy global (migration source)

type CompaniesResult = {
  companies: CompanyProfile[];
  fromSeed: boolean;
  redisAvailable: boolean;
};

function utf8Bytes(s: string): number {
  return new TextEncoder().encode(s).length;
}

/** Approximate storage: companies JSON + profile JSON + kanban status/visited. */
export async function computeBytesUsed(userId: string): Promise<number> {
  const redis = getRedis();
  if (!redis) return 0;
  const keys = u(userId);
  try {
    const [companiesRaw, profileRaw, status, visited, fetchRunsRaw, jobsRaw, dailyDates] =
      await Promise.all([
        redis.get<string | CompanyProfile[]>(keys.companies),
        redis.get<string | UserProfile>(keys.profile),
        redis.hgetall<Record<string, string>>(keys.status),
        redis.smembers(keys.visited),
        redis.get<string>(keys.fetchRuns),
        redis.get<string>(keys.jobs),
        redis.smembers(keys.dailyDates),
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
    const jobsStr =
      jobsRaw == null
        ? "[]"
        : typeof jobsRaw === "string"
          ? jobsRaw
          : JSON.stringify(jobsRaw);
    let dailyBytes = 0;
    const dates = (dailyDates as string[]) ?? [];
    if (dates.length > 0) {
      const digests = await Promise.all(
        dates.map((d) => redis.get<string>(keys.daily(d))),
      );
      for (const raw of digests) {
        if (raw == null) continue;
        dailyBytes += utf8Bytes(
          typeof raw === "string" ? raw : JSON.stringify(raw),
        );
      }
    }
    return (
      utf8Bytes(companiesStr) +
      utf8Bytes(profileStr) +
      utf8Bytes(statusStr) +
      utf8Bytes(visitedStr) +
      utf8Bytes(fetchRunsStr) +
      utf8Bytes(jobsStr) +
      dailyBytes
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
  const ent = resolveEntitlements(user.role, billing, user.isSpecialFriend);
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
  const ent = resolveEntitlements(user.role, billing, user.isSpecialFriend);
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

export async function getCompanies(userId: string): Promise<CompaniesResult> {
  const ck = userCacheKey(userId, "companies");
  const hit = cacheGet<CompaniesResult>(ck);
  if (hit !== undefined) return hit;

  const redis = getRedis();
  if (!redis) {
    const companies = await loadSeedCompanies();
    const result: CompaniesResult = {
      companies,
      fromSeed: true,
      redisAvailable: false,
    };
    // Seed is static — short user TTL still fine as safety net
    cacheSet(ck, result, CACHE_TTL.USER);
    return result;
  }
  const key = u(userId).companies;
  try {
    const raw = await redis.get<string | CompanyProfile[]>(key);
    if (raw == null) {
      // New user: start empty (not shared seed) — admin migration copies globals
      const companies: CompanyProfile[] = [];
      await redis.set(key, JSON.stringify(companies));
      const result: CompaniesResult = {
        companies,
        fromSeed: false,
        redisAvailable: true,
      };
      // Redis write succeeded — write-through
      cacheSet(ck, result, CACHE_TTL.USER);
      return result;
    }
    const companies =
      typeof raw === "string" ? (JSON.parse(raw) as CompanyProfile[]) : raw;
    if (!Array.isArray(companies)) {
      await redis.set(key, JSON.stringify([]));
      const result: CompaniesResult = {
        companies: [],
        fromSeed: false,
        redisAvailable: true,
      };
      cacheSet(ck, result, CACHE_TTL.USER);
      return result;
    }
    const result: CompaniesResult = {
      companies,
      fromSeed: false,
      redisAvailable: true,
    };
    cacheSet(ck, result, CACHE_TTL.USER);
    return result;
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
    // setUsage already invalidateUser; ensure companies/me gone even if usage no-op
    invalidateUser(userId);
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

const IMPORT_HASH_LIMIT = 50;

/** Recent successful import content hashes (SHA-256 hex), newest last. */
export async function getImportHashes(userId: string): Promise<string[]> {
  const redis = getRedis();
  if (!redis) return [];
  try {
    const raw = await redis.get<string | string[]>(u(userId).importHashes);
    if (raw == null) return [];
    const arr =
      typeof raw === "string" ? (JSON.parse(raw) as unknown) : raw;
    if (!Array.isArray(arr)) return [];
    return arr.filter((h): h is string => typeof h === "string");
  } catch (err) {
    console.warn("[hunter] getImportHashes failed:", err);
    return [];
  }
}

export async function appendImportHash(
  userId: string,
  hash: string,
): Promise<boolean> {
  const redis = getRedis();
  if (!redis) return false;
  try {
    const prev = await getImportHashes(userId);
    const next = [...prev.filter((h) => h !== hash), hash].slice(
      -IMPORT_HASH_LIMIT,
    );
    await redis.set(u(userId).importHashes, JSON.stringify(next));
    return true;
  } catch (err) {
    console.warn("[hunter] appendImportHash failed:", err);
    return false;
  }
}
