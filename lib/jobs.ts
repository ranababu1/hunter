import { promises as fs } from "fs";
import path from "path";
import type { DailyDigest, FetchesSnapshot, Job } from "./types";
import { CACHE_TTL, cacheGet, cacheSet } from "./cache";

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
