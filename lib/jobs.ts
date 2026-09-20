import { promises as fs } from "fs";
import path from "path";
import type { DailyDigest, FetchRun, FetchesSnapshot, Job } from "./types";
import {
  CACHE_TTL,
  cacheGet,
  cacheSet,
  invalidateUser,
  userCacheKey,
} from "./cache";
import {
  getFetchRuns,
  getLastFetchDate,
  getRedis,
  saveFetchRuns,
  setLastFetchDate,
} from "./users";
import { GLOBAL, u } from "./keys";

/**
 * Job data is STRICTLY per tenant. Every read below takes a userId and
 * touches only `hunter:u:{userId}:*`. The `data/*.json` files are a legacy
 * seed that belongs to the owner account; they are copied into the admin
 * tenant exactly once (see maybeMigrateSeedJobsToUser) and are never served
 * to any other user.
 */

const dataDir = path.join(process.cwd(), "data");

// ── Legacy seed files (admin migration only — never serve to tenants) ──

async function readSeedJobsFile(): Promise<Job[]> {
  try {
    const raw = await fs.readFile(path.join(dataDir, "jobs.json"), "utf8");
    const jobs = JSON.parse(raw) as Job[];
    return Array.isArray(jobs) ? jobs : [];
  } catch {
    return [];
  }
}

async function readSeedDigestsFile(): Promise<DailyDigest[]> {
  const dailyDir = path.join(dataDir, "daily");
  try {
    const files = (await fs.readdir(dailyDir))
      .filter((f) => f.endsWith(".json"))
      .sort();
    const digests: DailyDigest[] = [];
    for (const f of files) {
      try {
        const raw = await fs.readFile(path.join(dailyDir, f), "utf8");
        const d = parseDigest(JSON.parse(raw) as DailyDigest);
        if (d) digests.push(d);
      } catch {
        // skip unreadable file
      }
    }
    return digests;
  } catch {
    return [];
  }
}

async function readSeedFetchesFile(): Promise<FetchesSnapshot | null> {
  try {
    const raw = await fs.readFile(path.join(dataDir, "fetches.json"), "utf8");
    const snap = JSON.parse(raw) as FetchesSnapshot;
    if (!snap || !Array.isArray(snap.companies)) return null;
    return snap;
  } catch {
    return null;
  }
}

// ── Per-user Redis jobs / digests ───────────────────────────────────

function parseJobs(raw: string | Job[] | null): Job[] {
  if (raw == null) return [];
  const jobs = typeof raw === "string" ? (JSON.parse(raw) as Job[]) : raw;
  return Array.isArray(jobs) ? jobs : [];
}

function parseDigest(raw: string | DailyDigest | null): DailyDigest | null {
  if (raw == null) return null;
  const digest =
    typeof raw === "string" ? (JSON.parse(raw) as DailyDigest) : raw;
  if (!digest || typeof digest !== "object" || !digest.date) return null;
  if (!Array.isArray(digest.jobs)) digest.jobs = [];
  return digest;
}

/** Consolidated Job[] for a tenant. Empty array if unset / no Redis. */
export async function getUserJobs(userId: string): Promise<Job[]> {
  const ck = userCacheKey(userId, "jobs");
  const hit = cacheGet<Job[]>(ck);
  if (hit !== undefined) return hit;

  const redis = getRedis();
  if (!redis) return [];
  try {
    const raw = await redis.get<string | Job[]>(u(userId).jobs);
    const jobs = parseJobs(raw);
    cacheSet(ck, jobs, CACHE_TTL.USER);
    return jobs;
  } catch (err) {
    console.warn("[hunter] getUserJobs failed:", err);
    return [];
  }
}

export async function saveUserJobs(
  userId: string,
  jobs: Job[],
): Promise<boolean> {
  const redis = getRedis();
  if (!redis) return false;
  try {
    await redis.set(u(userId).jobs, JSON.stringify(jobs));
    invalidateUser(userId);
    return true;
  } catch (err) {
    console.warn("[hunter] saveUserJobs failed:", err);
    return false;
  }
}

/**
 * Merge incoming jobs into the user's consolidated list by id.
 * Newer incoming wins (replaces existing with same id); order: existing
 * (minus overridden) then incoming appended for brand-new ids, with
 * overridden slots replaced in-place by the incoming copy.
 */
export function mergeJobsById(existing: Job[], incoming: Job[]): Job[] {
  const map = new Map<string, Job>();
  for (const j of existing) {
    if (j?.id) map.set(j.id, j);
  }
  for (const j of incoming) {
    if (j?.id) map.set(j.id, j); // newer wins
  }
  const seen = new Set<string>();
  const out: Job[] = [];
  for (const j of existing) {
    if (!j?.id) continue;
    const merged = map.get(j.id);
    if (merged && !seen.has(j.id)) {
      out.push(merged);
      seen.add(j.id);
    }
  }
  for (const j of incoming) {
    if (!j?.id || seen.has(j.id)) continue;
    out.push(j);
    seen.add(j.id);
  }
  return out;
}

export async function getUserDailyDigest(
  userId: string,
  date: string,
): Promise<DailyDigest | null> {
  const ck = userCacheKey(userId, `digest:${date}`);
  const hit = cacheGet<DailyDigest | null>(ck);
  if (hit !== undefined) return hit;

  const redis = getRedis();
  if (!redis) return null;
  try {
    const raw = await redis.get<string | DailyDigest>(u(userId).daily(date));
    const digest = parseDigest(raw);
    cacheSet(ck, digest, CACHE_TTL.USER);
    return digest;
  } catch (err) {
    console.warn("[hunter] getUserDailyDigest failed:", err);
    return null;
  }
}

export async function saveUserDailyDigest(
  userId: string,
  digest: DailyDigest,
): Promise<boolean> {
  const redis = getRedis();
  if (!redis) return false;
  try {
    const keys = u(userId);
    await redis.set(keys.daily(digest.date), JSON.stringify(digest));
    await redis.sadd(keys.dailyDates, digest.date);
    invalidateUser(userId);
    return true;
  } catch (err) {
    console.warn("[hunter] saveUserDailyDigest failed:", err);
    return false;
  }
}

export async function listUserDailyDates(userId: string): Promise<string[]> {
  const ck = userCacheKey(userId, "dailyDates");
  const hit = cacheGet<string[]>(ck);
  if (hit !== undefined) return hit;

  const redis = getRedis();
  if (!redis) return [];
  try {
    const members = (await redis.smembers(u(userId).dailyDates)) as string[];
    const dates = (members ?? []).filter(Boolean).sort().reverse();
    cacheSet(ck, dates, CACHE_TTL.USER);
    return dates;
  } catch (err) {
    console.warn("[hunter] listUserDailyDates failed:", err);
    return [];
  }
}

export async function getUserDailyDigests(
  userId: string,
): Promise<DailyDigest[]> {
  const ck = userCacheKey(userId, "allDigests");
  const hit = cacheGet<DailyDigest[]>(ck);
  if (hit !== undefined) return hit;

  const dates = await listUserDailyDates(userId);
  const digests: DailyDigest[] = [];
  for (const date of dates) {
    const d = await getUserDailyDigest(userId, date);
    if (d) digests.push(d);
  }
  cacheSet(ck, digests, CACHE_TTL.USER);
  return digests;
}

// ── One-time seed → admin tenant migration ──────────────────────────

const MIGRATED_JOBS_CACHE_KEY = "global:migratedJobs";

/**
 * Copy the legacy `data/jobs.json`, `data/daily/*.json` and
 * `data/fetches.json` into ONE tenant (the owner/admin) exactly once, then
 * set `hunter:migrated:jobs:v1`. Jobs already ingested into Redis win over
 * the seed copy. Safe to call on every authenticated request (flag is
 * cached in-process for 60s).
 */
export async function maybeMigrateSeedJobsToUser(
  userId: string,
): Promise<void> {
  if (cacheGet<boolean>(MIGRATED_JOBS_CACHE_KEY)) return;
  const redis = getRedis();
  if (!redis) return;
  try {
    const flag = await redis.get(GLOBAL.migratedJobs);
    if (flag) {
      cacheSet(MIGRATED_JOBS_CACHE_KEY, true, 60_000);
      return;
    }

    const seedJobs = await readSeedJobsFile();
    if (seedJobs.length > 0) {
      const existing = await getUserJobs(userId);
      // existing (ingested) is "incoming" so it wins over the seed copy
      await saveUserJobs(userId, mergeJobsById(seedJobs, existing));
    }

    const seedDigests = await readSeedDigestsFile();
    for (const d of seedDigests) {
      const already = await getUserDailyDigest(userId, d.date);
      if (!already) await saveUserDailyDigest(userId, d);
    }

    const snap = await readSeedFetchesFile();
    if (snap) {
      const runs = await getFetchRuns(userId);
      if (runs.length === 0) {
        const run: FetchRun = {
          id: `seed-${snap.runDate}`,
          runDate: snap.runDate,
          createdAt: snap.updatedAt || new Date().toISOString(),
          status: "ok",
          cadenceApplied: "daily",
          companiesChecked: snap.companies.length,
          jobsFound: snap.companies.reduce(
            (s, c) => s + (c.jobsFetched || 0),
            0,
          ),
          notes:
            "Imported from legacy data/fetches.json during tenant migration",
          source: "seed",
          companyResults: snap.companies,
        };
        await saveFetchRuns(userId, [run]);
        const last = await getLastFetchDate(userId);
        if (!last) await setLastFetchDate(userId, snap.runDate);
      }
    }

    await redis.set(GLOBAL.migratedJobs, new Date().toISOString());
    cacheSet(MIGRATED_JOBS_CACHE_KEY, true, 60_000);
    invalidateUser(userId);
    console.info(
      "[hunter] Migrated seed job files → tenant",
      userId,
      `(${seedJobs.length} jobs, ${seedDigests.length} digests)`,
    );
  } catch (err) {
    console.warn("[hunter] maybeMigrateSeedJobsToUser failed:", err);
  }
}
