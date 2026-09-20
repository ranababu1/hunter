import { promises as fs } from "fs";
import path from "path";
import type { DailyDigest, FetchesSnapshot, Job } from "./types";
import { CACHE_TTL, cacheGet, cacheSet, invalidateUser, userCacheKey } from "./cache";
import { getRedis } from "./users";
import { u } from "./keys";

const dataDir = path.join(process.cwd(), "data");

const KEYS = {
  consolidated: "static:jobs:consolidated",
  digests: "static:jobs:allDigests",
  fetches: "static:jobs:fetchesSnapshot",
  dailyDates: "static:jobs:dailyDates",
} as const;

export async function getConsolidatedJobs(): Promise<Job[]> {
  const hit = cacheGet<Job[]>(KEYS.consolidated);
  if (hit !== undefined) return hit;
  const raw = await fs.readFile(path.join(dataDir, "jobs.json"), "utf8");
  const jobs = JSON.parse(raw) as Job[];
  cacheSet(KEYS.consolidated, jobs, CACHE_TTL.STATIC);
  return jobs;
}

export async function getDailyDigest(
  date?: string,
): Promise<DailyDigest | null> {
  const dailyDir = path.join(dataDir, "daily");
  try {
    if (date) {
      const ck = `static:jobs:digest:${date}`;
      const hit = cacheGet<DailyDigest | null>(ck);
      if (hit !== undefined) return hit;
      const file = path.join(dailyDir, `${date}.json`);
      const raw = await fs.readFile(file, "utf8");
      const digest = JSON.parse(raw) as DailyDigest;
      cacheSet(ck, digest, CACHE_TTL.STATIC);
      return digest;
    }
    const files = (await fs.readdir(dailyDir))
      .filter((f) => f.endsWith(".json"))
      .sort()
      .reverse();
    if (files.length === 0) return null;
    const latestDate = files[0].replace(/\.json$/, "");
    return getDailyDigest(latestDate);
  } catch {
    return null;
  }
}

export async function listDailyDates(): Promise<string[]> {
  const hit = cacheGet<string[]>(KEYS.dailyDates);
  if (hit !== undefined) return hit;
  const dailyDir = path.join(dataDir, "daily");
  try {
    const dates = (await fs.readdir(dailyDir))
      .filter((f) => f.endsWith(".json"))
      .map((f) => f.replace(/\.json$/, ""))
      .sort()
      .reverse();
    cacheSet(KEYS.dailyDates, dates, CACHE_TTL.STATIC);
    return dates;
  } catch {
    return [];
  }
}

export async function getAllDailyDigests(): Promise<DailyDigest[]> {
  const hit = cacheGet<DailyDigest[]>(KEYS.digests);
  if (hit !== undefined) return hit;
  const dates = await listDailyDates();
  const digests: DailyDigest[] = [];
  for (const date of dates) {
    const d = await getDailyDigest(date);
    if (d) digests.push(d);
  }
  cacheSet(KEYS.digests, digests, CACHE_TTL.STATIC);
  return digests;
}

export async function getFetchesSnapshot(): Promise<FetchesSnapshot | null> {
  const hit = cacheGet<FetchesSnapshot | null>(KEYS.fetches);
  if (hit !== undefined) return hit;
  try {
    const raw = await fs.readFile(path.join(dataDir, "fetches.json"), "utf8");
    const snapshot = JSON.parse(raw) as FetchesSnapshot;
    cacheSet(KEYS.fetches, snapshot, CACHE_TTL.STATIC);
    return snapshot;
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
  // Preserve relative order: keep existing order for survivors, append new ids
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

/**
 * Prefer per-user Redis jobs when the list is non-empty; else global data/.
 * Keeps empty tenants working off the shared seed files.
 */
export async function getJobsPreferUser(
  userId: string | null | undefined,
): Promise<Job[]> {
  if (userId) {
    const userJobs = await getUserJobs(userId);
    if (userJobs.length > 0) return userJobs;
  }
  try {
    return await getConsolidatedJobs();
  } catch {
    return [];
  }
}

/**
 * Prefer per-user digests when present (length>0); else global data/daily/.
 */
export async function getDigestsPreferUser(
  userId: string | null | undefined,
): Promise<{ dates: string[]; digests: DailyDigest[] }> {
  if (userId) {
    const digests = await getUserDailyDigests(userId);
    if (digests.length > 0) {
      const dates = digests.map((d) => d.date);
      return { dates, digests };
    }
  }
  const [dates, digests] = await Promise.all([
    listDailyDates(),
    getAllDailyDigests(),
  ]);
  return { dates, digests };
}
