import { promises as fs } from "fs";
import path from "path";
import type { DailyDigest, Job } from "./types";

const dataDir = path.join(process.cwd(), "data");

export async function getConsolidatedJobs(): Promise<Job[]> {
  const raw = await fs.readFile(path.join(dataDir, "jobs.json"), "utf8");
  return JSON.parse(raw) as Job[];
}

export async function getDailyDigest(
  date?: string,
): Promise<DailyDigest | null> {
  const dailyDir = path.join(dataDir, "daily");
  try {
    if (date) {
      const file = path.join(dailyDir, `${date}.json`);
      const raw = await fs.readFile(file, "utf8");
      return JSON.parse(raw) as DailyDigest;
    }
    const files = (await fs.readdir(dailyDir))
      .filter((f) => f.endsWith(".json"))
      .sort()
      .reverse();
    if (files.length === 0) return null;
    const raw = await fs.readFile(path.join(dailyDir, files[0]), "utf8");
    return JSON.parse(raw) as DailyDigest;
  } catch {
    return null;
  }
}

export async function listDailyDates(): Promise<string[]> {
  const dailyDir = path.join(dataDir, "daily");
  try {
    return (await fs.readdir(dailyDir))
      .filter((f) => f.endsWith(".json"))
      .map((f) => f.replace(/\.json$/, ""))
      .sort()
      .reverse();
  } catch {
    return [];
  }
}
