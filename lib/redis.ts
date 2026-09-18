import { Redis } from "@upstash/redis";
import { readFile } from "fs/promises";
import path from "path";
import type { AppState, CompanyProfile, KanbanStatus } from "./types";

const VISITED_KEY = "hunter:visited";
const STATUS_KEY = "hunter:status";
export const COMPANIES_KEY = "hunter:companies";

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

export async function loadSeedCompanies(): Promise<CompanyProfile[]> {
  const file = path.join(process.cwd(), "data", "companies.json");
  const raw = await readFile(file, "utf8");
  const parsed = JSON.parse(raw) as CompanyProfile[];
  if (!Array.isArray(parsed)) return [];
  return parsed;
}

export async function getCompanies(): Promise<{
  companies: CompanyProfile[];
  fromSeed: boolean;
  redisAvailable: boolean;
}> {
  const redis = getRedis();
  if (!redis) {
    const companies = await loadSeedCompanies();
    return { companies, fromSeed: true, redisAvailable: false };
  }
  try {
    const raw = await redis.get<string | CompanyProfile[]>(COMPANIES_KEY);
    if (raw == null) {
      const companies = await loadSeedCompanies();
      await redis.set(COMPANIES_KEY, JSON.stringify(companies));
      return { companies, fromSeed: true, redisAvailable: true };
    }
    const companies =
      typeof raw === "string" ? (JSON.parse(raw) as CompanyProfile[]) : raw;
    if (!Array.isArray(companies) || companies.length === 0) {
      const seeded = await loadSeedCompanies();
      await redis.set(COMPANIES_KEY, JSON.stringify(seeded));
      return { companies: seeded, fromSeed: true, redisAvailable: true };
    }
    return { companies, fromSeed: false, redisAvailable: true };
  } catch (err) {
    console.warn("[hunter] Redis getCompanies failed:", err);
    const companies = await loadSeedCompanies();
    return { companies, fromSeed: true, redisAvailable: false };
  }
}

export async function saveCompanies(
  companies: CompanyProfile[],
): Promise<boolean> {
  const redis = getRedis();
  if (!redis) return false;
  try {
    await redis.set(COMPANIES_KEY, JSON.stringify(companies));
    return true;
  } catch (err) {
    console.warn("[hunter] Redis saveCompanies failed:", err);
    return false;
  }
}
