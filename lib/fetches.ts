import { randomUUID } from "crypto";
import type {
  CompanyFetch,
  CompanyProfile,
  FetchRun,
  Job,
  UserProfile,
} from "./types";
import { getUserJobs } from "./jobs";
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
  return s.trim().toLowerCase().replace(/[ ]+/g, " ");
}

/** Soft company name match (handles "Amazon / AWS" vs "Amazon"). */
function companyNamesMatch(a: string, b: string): boolean {
  const na = normalizeName(a);
  const nb = normalizeName(b);
  if (na === nb) return true;
  if (na.includes(nb) || nb.includes(na)) return true;
  const partsA = na.split(/[/|&]+/).map((p) => p.trim()).filter(Boolean);
  const partsB = nb.split(/[/|&]+/).map((p) => p.trim()).filter(Boolean);
  return partsA.some((pa) =>
    partsB.some((pb) => pa === pb || pa.includes(pb) || pb.includes(pa)),
  );
}

function extractKeywords(profile: UserProfile): string[] {
  const fromRoles = profile.targetRoles.map((r) => r.label.toLowerCase());
  const resume = profile.resumeText.toLowerCase();
  const tokens = resume
    .split(/[^a-z0-9+#.]/i)
    .map((t) => t.trim())
    .filter((t) => t.length >= 3);
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
 * Per-tenant fetch (no external crawler on Vercel): match the user's active
 * companies against the user's OWN ingested jobs (`hunter:u:{id}:jobs`).
 * Nothing global is consulted. Morning ingest (POST /api/ingest/daily)
 * writes the same FetchRun shape.
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
  const jobs = await getUserJobs(user.id);

  const runDate = todayIST();
  const companyResults: CompanyFetch[] = [];
  let jobsFound = 0;

  for (const company of active) {
    const matchedJobs = jobs.filter(
      (j) =>
        companyNamesMatch(j.company, company.name) &&
        jobMatchesKeywords(j, keywords),
    );
    const count = matchedJobs.length;
    jobsFound += count;

    let outcome: CompanyFetch["outcome"] = "ok";
    let issue: string | undefined;
    let notes: string | undefined;

    if (count > 0) {
      notes = `Matched ${count} job(s) in your feed against your target roles / resume keywords`;
    } else if (jobs.length === 0) {
      outcome = "zero";
      issue = "No jobs in your feed yet — the next morning ingest will populate it";
    } else if (company.portalOk === false) {
      outcome = "error";
      issue = company.portalIssue
        ? `Careers portal flagged: ${company.portalIssue}`
        : "Careers portal flagged as problematic";
    } else {
      outcome = "zero";
      issue = "No jobs from this company in your feed matched your target roles";
    }

    companyResults.push({
      company: company.name,
      careerPortal: company.careersUrl || "#",
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
    status = "partial";
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
        : `Matched against ${jobs.length} job(s) in your feed · ${keywords.length} keyword(s) from profile`,
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

  // Strictly the tenant's own history. No global seed fallback.
  const latest: FetchRun | null = runs[0] ?? null;

  return {
    runs,
    latest,
    fromSeed: false,
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
