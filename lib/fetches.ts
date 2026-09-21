import { randomUUID } from "crypto";
import { after } from "next/server";
import type {
  CompanyFetch,
  CompanyProfile,
  FetchRun,
  Job,
  UserProfile,
} from "./types";
import {
  getUserDailyDigest,
  getUserJobs,
  mergeJobsById,
  saveUserDailyDigest,
  saveUserJobs,
} from "./jobs";
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
  isPaidCompanyPlan,
  nextEligibleFetchDate,
  resolveEntitlements,
  todayIST,
} from "./plans";
import { MANUAL_FETCH_LIMITS, getManualFetchState, incrManualFetchCount } from "./fetch-quota";
import { mapPool } from "./companies";
import { classifyMatch, computeJobId, fetchCompanyLive, type LiveJob } from "./live-fetch";
import type { User } from "./types";
import { recomputeAndStoreUsage } from "./redis";

const FETCH_CONCURRENCY = 4;

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

function liveJobToJob(
  company: CompanyProfile,
  liveJob: LiveJob,
  keywords: string[],
  seenIds: Set<string>,
): Job {
  const id = computeJobId(company.name, liveJob.url, liveJob.title);
  const { match, whyMatch } = classifyMatch(liveJob, keywords);
  return {
    id,
    company: company.name,
    role: liveJob.title,
    level: "",
    aiFocus: liveJob.team ?? "",
    location: liveJob.location || "Not specified",
    postedOrUpdated: liveJob.postedOrUpdated || todayIST(),
    match,
    url: liveJob.url,
    whyMatch,
    dateSeen: todayIST(),
    isNew: !seenIds.has(id),
  };
}

/** Fetch-and-normalize one company. Never throws — every path returns a CompanyFetch + jobs. */
async function fetchOneCompany(
  company: CompanyProfile,
  keywords: string[],
  seenIds: Set<string>,
): Promise<{ result: CompanyFetch; jobs: Job[]; retryable: boolean }> {
  const runDate = todayIST();
  if (!company.careersUrl) {
    return {
      result: {
        company: company.name,
        careerPortal: "#",
        jobsFetched: 0,
        lastFetched: runDate,
        outcome: "error",
        issue: "No careers URL set — add one from Companies",
      },
      jobs: [],
      retryable: false,
    };
  }

  const live = await fetchCompanyLive(company.careersUrl);
  const jobs = live.jobs.map((j) => liveJobToJob(company, j, keywords, seenIds));
  const retryable =
    live.outcome === "error" && !(live.issue ?? "").toLowerCase().includes("block");

  return {
    result: {
      company: company.name,
      careerPortal: company.careersUrl,
      jobsFetched: jobs.length,
      lastFetched: runDate,
      outcome: live.outcome,
      issue: live.issue,
      notes:
        live.outcome === "ok"
          ? `Live fetch via ${live.source} — ${jobs.length} open posting(s)`
          : undefined,
    },
    jobs,
    retryable,
  };
}

/** Upsert today's daily digest with newly discovered jobs, merging by id with whatever the day already had (from ingest or an earlier run today). */
async function upsertTodayDigest(userId: string, runDate: string, newJobs: Job[]): Promise<void> {
  if (newJobs.length === 0) return;
  const existing = await getUserDailyDigest(userId, runDate);
  const jobs = existing ? mergeJobsById(existing.jobs, newJobs) : newJobs;
  await saveUserDailyDigest(userId, {
    date: runDate,
    title: existing?.title ?? `Live fetch — ${runDate}`,
    jobs,
  });
}

function summarizeStatus(results: CompanyFetch[]): FetchRun["status"] {
  if (results.length === 0) return "skipped";
  if (results.every((r) => r.outcome === "error")) return "error";
  if (results.some((r) => r.outcome === "zero" || r.outcome === "error")) return "partial";
  return "ok";
}

/**
 * Re-attempt only the companies that failed with a transient (non-blocking)
 * error, scheduled via Next's `after()` so it runs once the initial
 * response has already reached the client. This runs within the same
 * serverless invocation's remaining execution budget — a short, best-effort
 * second pass, not a durable background job. A real queue (Vercel Cron /
 * QStash) would be needed for retries that must survive minutes, which is
 * out of scope here.
 */
async function runBackgroundRetries(
  userId: string,
  runId: string,
  retryCompanies: CompanyProfile[],
  keywords: string[],
): Promise<void> {
  try {
    const existingJobs = await getUserJobs(userId);
    const seenIds = new Set(existingJobs.map((j) => j.id));

    const outcomes = await mapPool(retryCompanies, FETCH_CONCURRENCY, (c) =>
      fetchOneCompany(c, keywords, seenIds),
    );

    const newJobs = outcomes.flatMap((o) => o.jobs);
    if (newJobs.length > 0) {
      const merged = mergeJobsById(existingJobs, newJobs);
      await saveUserJobs(userId, merged);
      await upsertTodayDigest(userId, todayIST(), newJobs);
    }

    const byCompany = new Map(outcomes.map((o) => [o.result.company, o.result]));
    const runs = await getFetchRuns(userId);
    const idx = runs.findIndex((r) => r.id === runId);
    if (idx === -1) return;

    const run = runs[idx];
    const nextResults = run.companyResults.map((r) => byCompany.get(r.company) ?? r);
    const jobsFound = nextResults.reduce((sum, r) => sum + r.jobsFetched, 0);
    const updated: FetchRun = {
      ...run,
      companyResults: nextResults,
      jobsFound,
      status: summarizeStatus(nextResults),
      pendingRetry: false,
      retriesCompletedAt: new Date().toISOString(),
    };
    runs[idx] = updated;
    await saveFetchRuns(userId, runs);
    await recomputeAndStoreUsage(userId);
  } catch (err) {
    console.warn("[hunter] runBackgroundRetries failed:", err);
  }
}

/**
 * Live per-tenant fetch: for each active company, hit the real careers
 * portal (known ATS API, or schema.org JobPosting data on the page) and
 * merge whatever is found into the tenant's own job list. See
 * lib/live-fetch.ts for exactly what this does and does not do.
 *
 * Gating differs by plan:
 * - Paid company plans / admin: the existing cadence gate (daily), tracked
 *   via lastFetchDate — unchanged from before.
 * - Free plan: a manual click quota (2/day, 10/day with `boosted`) instead
 *   of the cadence gate, so free tenants can check more than once every
 *   other day, but not unboundedly.
 */
export async function runUserFetch(
  user: User,
  opts: { boosted?: boolean } = {},
): Promise<
  | { ok: true; run: FetchRun; nextEligibleDate: string; manualFetch?: { count: number; limit: number; remaining: number } }
  | {
      ok: false;
      status: number;
      error: string;
      nextEligibleDate?: string;
      manualFetch?: { count: number; limit: number; remaining: number; resetsAt: string };
    }
> {
  const billing = await getBilling(user.id);
  const ent = resolveEntitlements(user.role, billing, user.isSpecialFriend);

  if (!ent.fetchEnabled) {
    return { ok: false, status: 403, error: "FETCH_DISABLED" };
  }

  const usesCadenceGate = ent.isAdmin || isPaidCompanyPlan(ent.companyPlan);
  // Special friends always get the boosted ceiling — no ?fetch=more needed.
  const manualLimit = ent.isSpecialFriend
    ? MANUAL_FETCH_LIMITS.boosted
    : opts.boosted === true
      ? MANUAL_FETCH_LIMITS.boosted
      : MANUAL_FETCH_LIMITS.base;
  let manualState: Awaited<ReturnType<typeof getManualFetchState>> | null = null;

  if (usesCadenceGate) {
    const lastFetchDate = await getLastFetchDate(user.id);
    if (!canRunFetchToday(lastFetchDate, ent.fetchCadence)) {
      return {
        ok: false,
        status: 403,
        error: "FETCH_CADENCE",
        nextEligibleDate: nextEligibleFetchDate(lastFetchDate, ent.fetchCadence),
      };
    }
  } else {
    manualState = await getManualFetchState(user.id, manualLimit);
    if (!manualState.canRun) {
      return {
        ok: false,
        status: 429,
        error: "MANUAL_FETCH_LIMIT",
        manualFetch: manualState,
      };
    }
  }

  const { companies } = await getCompanies(user.id);
  const active = companies.filter((c) => c.active);
  const profile = await getProfile(user.id);
  const keywords = extractKeywords(profile);
  const existingJobs = await getUserJobs(user.id);
  const seenIds = new Set(existingJobs.map((j) => j.id));

  const outcomes = await mapPool(active, FETCH_CONCURRENCY, (c) =>
    fetchOneCompany(c, keywords, seenIds),
  );

  const newJobs = outcomes.flatMap((o) => o.jobs);
  const runDateForDigest = todayIST();
  if (newJobs.length > 0) {
    const merged = mergeJobsById(existingJobs, newJobs);
    await saveUserJobs(user.id, merged);
    await upsertTodayDigest(user.id, runDateForDigest, newJobs);
  }

  const companyResults = outcomes.map((o) => o.result);
  const jobsFound = companyResults.reduce((sum, r) => sum + r.jobsFetched, 0);
  const retryCompanies = active.filter((c, i) => outcomes[i].retryable);
  const runDate = todayIST();

  const run: FetchRun = {
    id: randomUUID(),
    runDate,
    createdAt: new Date().toISOString(),
    status: summarizeStatus(companyResults),
    cadenceApplied: ent.fetchCadence,
    companiesChecked: active.length,
    jobsFound,
    notes:
      active.length === 0
        ? "No active companies — add companies and mark them active"
        : `Live fetch across ${active.length} compan${active.length === 1 ? "y" : "ies"}`,
    source: "catalog",
    companyResults,
    pendingRetry: retryCompanies.length > 0,
  };

  const prev = await getFetchRuns(user.id);
  const nextRuns = [run, ...prev];
  const max = ent.maxFetchHistory;
  const trimmed = Number.isFinite(max) ? nextRuns.slice(0, max) : nextRuns;

  const saved = await saveFetchRuns(user.id, trimmed);
  if (!saved) {
    return { ok: false, status: 503, error: "Failed to save fetch run — Redis required" };
  }
  await setLastFetchDate(user.id, runDate);
  await recomputeAndStoreUsage(user.id);

  if (!usesCadenceGate) {
    await incrManualFetchCount(user.id);
    manualState = await getManualFetchState(user.id, manualLimit);
  }

  if (retryCompanies.length > 0) {
    after(() => runBackgroundRetries(user.id, run.id, retryCompanies, keywords));
  }

  return {
    ok: true,
    run,
    nextEligibleDate: nextEligibleFetchDate(runDate, ent.fetchCadence),
    manualFetch: manualState
      ? { count: manualState.count, limit: manualState.limit, remaining: manualState.remaining }
      : undefined,
  };
}

export async function getFetchesPayload(user: User) {
  const billing = await getBilling(user.id);
  const ent = resolveEntitlements(user.role, billing, user.isSpecialFriend);
  const runs = await getFetchRuns(user.id);
  const lastFetchDate = await getLastFetchDate(user.id);
  const nextEligibleDate = nextEligibleFetchDate(lastFetchDate, ent.fetchCadence);
  const usesCadenceGate = ent.isAdmin || isPaidCompanyPlan(ent.companyPlan);
  const canRun = usesCadenceGate ? canRunFetchToday(lastFetchDate, ent.fetchCadence) : true;

  const latest: FetchRun | null = runs[0] ?? null;
  const displayManualLimit = ent.isSpecialFriend
    ? MANUAL_FETCH_LIMITS.boosted
    : MANUAL_FETCH_LIMITS.base;
  const manualFetch = usesCadenceGate
    ? null
    : await getManualFetchState(user.id, displayManualLimit);

  return {
    runs,
    latest,
    fromSeed: false,
    lastFetchDate,
    nextEligibleDate,
    canRun,
    cadence: ent.fetchCadence,
    usesCadenceGate,
    manualFetch,
    maxFetchHistory: Number.isFinite(ent.maxFetchHistory) ? ent.maxFetchHistory : -1,
    entitlements: {
      fetchCadence: ent.fetchCadence,
      maxFetchHistory: Number.isFinite(ent.maxFetchHistory) ? ent.maxFetchHistory : -1,
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
