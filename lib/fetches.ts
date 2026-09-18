import { randomUUID } from "crypto";
import type {
  CompanyFetch,
  CompanyProfile,
  FetchRun,
  Job,
  UserProfile,
} from "./types";
import { getConsolidatedJobs, getFetchesSnapshot } from "./jobs";
import { getCompanies } from "./redis";
import {
  getBilling,
  getFetchRuns,
  getLastFetchDate,
  getProfile,
  saveFetchRuns,
  setLastFetchDate,
} from "./users";
import {
  canRunFetchToday,
  nextEligibleFetchDate,
  resolveEntitlements,
  todayIST,
} from "./plans";
import type { User } from "./types";
import { recomputeAndStoreUsage } from "./redis";

function normalizeName(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, " ");
}

/** Soft company name match (handles "Amazon / AWS" vs "Amazon"). */
function companyNamesMatch(a: string, b: string): boolean {
  const na = normalizeName(a);
  const nb = normalizeName(b);
  if (na === nb) return true;
  if (na.includes(nb) || nb.includes(na)) return true;
  // Split on / and &
  const partsA = na.split(/[\/|&]+/).map((p) => p.trim()).filter(Boolean);
  const partsB = nb.split(/[\/|&]+/).map((p) => p.trim()).filter(Boolean);
  return partsA.some((pa) => partsB.some((pb) => pa === pb || pa.includes(pb) || pb.includes(pa)));
}

function extractKeywords(profile: UserProfile): string[] {
  const fromRoles = profile.targetRoles.map((r) => r.label.toLowerCase());
  const resume = profile.resumeText.toLowerCase();
  const tokens = resume
    .split(/[^a-z0-9+#.]/i)
    .map((t) => t.trim())
    .filter((t) => t.length >= 3);
  // Prefer role labels; add frequent-ish resume tokens (dedupe)
  const set = new Set<string>([...fromRoles]);
  for (const t of tokens) {
    if (set.size >= 40) break;
    set.add(t);
  }
  return [...set];
}

function jobMatchesKeywords(job: Job, keywords: string[]): boolean {
  if (keywords.length === 0) return true; // no filter → count all for company
  const hay = `${job.role} ${job.aiFocus} ${job.level} ${job.whyMatch}`.toLowerCase();
  return keywords.some((k) => hay.includes(k));
}

/**
 * Phase 2 fetch without external crawler: match user's active companies
 * against global data/jobs.json + data/fetches.json (catalog/seed).
 * Morning agent will write the same FetchRun shape later.
 */
export async function runUserFetch(user: User): Promise<
  | { ok: true; run: FetchRun; nextEligibleDate: string }
  | {
      ok: false;
      status: number;
      error: string;
      nextEligibleDate?: string;
    }
> {
  const billing = await getBilling(user.id);
  const ent = resolveEntitlements(user.role, billing);

  if (!ent.fetchEnabled) {
    return { ok: false, status: 403, error: "FETCH_DISABLED" };
  }

  const lastFetchDate = await getLastFetchDate(user.id);
  if (!canRunFetchToday(lastFetchDate, ent.fetchCadence)) {
    const nextEligibleDate = nextEligibleFetchDate(
      lastFetchDate,
      ent.fetchCadence,
    );
    return {
      ok: false,
      status: 403,
      error: "FETCH_CADENCE",
      nextEligibleDate,
    };
  }

  const { companies } = await getCompanies(user.id);
  const active = companies.filter((c) => c.active);
  const profile = await getProfile(user.id);
  const keywords = extractKeywords(profile);

  let jobs: Job[] = [];
  let catalog: Awaited<ReturnType<typeof getFetchesSnapshot>> = null;
  try {
    jobs = await getConsolidatedJobs();
  } catch {
    jobs = [];
  }
  try {
    catalog = await getFetchesSnapshot();
  } catch {
    catalog = null;
  }

  const portalByCompany = new Map<string, string>();
  if (catalog) {
    for (const c of catalog.companies) {
      portalByCompany.set(normalizeName(c.company), c.careerPortal);
    }
  }

  const runDate = todayIST();
  const companyResults: CompanyFetch[] = [];
  let jobsFound = 0;

  for (const company of active) {
    const matchedJobs = jobs.filter(
      (j) =>
        companyNamesMatch(j.company, company.name) &&
        jobMatchesKeywords(j, keywords),
    );
    const seedRow = catalog?.companies.find((c) =>
      companyNamesMatch(c.company, company.name),
    );
    const portal =
      company.careersUrl ||
      seedRow?.careerPortal ||
      portalByCompany.get(normalizeName(company.name)) ||
      "";

    const count = matchedJobs.length;
    jobsFound += count;

    let outcome: CompanyFetch["outcome"] = "ok";
    let issue: string | undefined;
    let notes: string | undefined;

    if (count > 0) {
      outcome = "ok";
      notes = `Matched ${count} job(s) from catalog against profile keywords (source: catalog/seed)`;
    } else if (seedRow) {
      // Company known in seed but no keyword hits in jobs.json
      if (seedRow.outcome === "error") {
        outcome = "error";
        issue = seedRow.issue ?? "Seed reported fetch error";
      } else if (seedRow.jobsFetched === 0 || seedRow.outcome === "zero") {
        outcome = "zero";
        issue = seedRow.issue ?? "No matching jobs in catalog for active filters";
      } else {
        outcome = "zero";
        issue =
          "Company present in seed catalog but no jobs matched target roles / resume keywords";
        notes = `Seed had ${seedRow.jobsFetched} job(s); filtered to 0`;
      }
    } else {
      outcome = "zero";
      issue = "Company not found in global jobs/fetches catalog (Phase 2 seed match)";
    }

    companyResults.push({
      company: company.name,
      careerPortal: portal || company.careersUrl || "#",
      jobsFetched: count,
      lastFetched: runDate,
      outcome,
      issue,
      notes,
    });
  }

  let status: FetchRun["status"] = "ok";
  if (active.length === 0) {
    status = "skipped";
  } else if (companyResults.every((r) => r.outcome === "error")) {
    status = "error";
  } else if (
    companyResults.some((r) => r.outcome === "zero" || r.outcome === "error")
  ) {
    status = jobsFound > 0 ? "partial" : "partial";
  }

  const run: FetchRun = {
    id: randomUUID(),
    runDate,
    createdAt: new Date().toISOString(),
    status,
    cadenceApplied: ent.fetchCadence,
    companiesChecked: active.length,
    jobsFound,
    notes:
      active.length === 0
        ? "No active companies — add companies and mark them active"
        : `Phase 2 catalog/seed match · ${keywords.length} keyword(s) from profile`,
    source: "catalog",
    companyResults,
  };

  const prev = await getFetchRuns(user.id);
  const next = [run, ...prev];
  const max = ent.maxFetchHistory;
  const trimmed = Number.isFinite(max) ? next.slice(0, max) : next;

  const saved = await saveFetchRuns(user.id, trimmed);
  if (!saved) {
    return {
      ok: false,
      status: 503,
      error: "Failed to save fetch run — Redis required",
    };
  }
  await setLastFetchDate(user.id, runDate);
  await recomputeAndStoreUsage(user.id);

  return {
    ok: true,
    run,
    nextEligibleDate: nextEligibleFetchDate(runDate, ent.fetchCadence),
  };
}

export async function getFetchesPayload(user: User) {
  const billing = await getBilling(user.id);
  const ent = resolveEntitlements(user.role, billing);
  const runs = await getFetchRuns(user.id);
  const lastFetchDate = await getLastFetchDate(user.id);
  const nextEligibleDate = nextEligibleFetchDate(
    lastFetchDate,
    ent.fetchCadence,
  );
  const canRun = canRunFetchToday(lastFetchDate, ent.fetchCadence);

  // Latest snapshot: prefer newest user run; else synthesize from global seed
  let latest: FetchRun | null = runs[0] ?? null;
  let fromSeed = false;

  if (!latest) {
    const seed = await getFetchesSnapshot();
    if (seed) {
      fromSeed = true;
      latest = {
        id: "seed",
        runDate: seed.runDate,
        createdAt: seed.updatedAt,
        status: "ok",
        cadenceApplied: ent.fetchCadence,
        companiesChecked: seed.companies.length,
        jobsFound: seed.companies.reduce((s, c) => s + c.jobsFetched, 0),
        notes: "Global seed catalog (data/fetches.json) — run a personal fetch to start history",
        source: "seed",
        companyResults: seed.companies,
      };
    }
  }

  return {
    runs,
    latest,
    fromSeed,
    lastFetchDate,
    nextEligibleDate,
    canRun,
    cadence: ent.fetchCadence,
    maxFetchHistory: Number.isFinite(ent.maxFetchHistory)
      ? ent.maxFetchHistory
      : -1,
    entitlements: {
      fetchCadence: ent.fetchCadence,
      maxFetchHistory: Number.isFinite(ent.maxFetchHistory)
        ? ent.maxFetchHistory
        : -1,
      fetchEnabled: ent.fetchEnabled,
      isAdmin: ent.isAdmin,
    },
  };
}

/** Count fetch runs for admin table. */
export async function countFetchRuns(userId: string): Promise<number> {
  const runs = await getFetchRuns(userId);
  return runs.length;
}

export type { CompanyProfile };
