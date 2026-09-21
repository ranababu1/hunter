import { createHash } from "crypto";
import type { MatchLevel } from "./types";

/**
 * Live company-portal fetcher.
 *
 * What this does: for careers pages built on a known ATS (Greenhouse, Lever,
 * Ashby, SmartRecruiters, Workday), it calls the SAME public JSON endpoint
 * that platform's own careers page loads in a real visitor's browser — this
 * is documented, intended-for-machines data, not a bypass of anything. For
 * everything else, it fetches the page with realistic browser headers and
 * looks for schema.org `JobPosting` structured data, the same markup search
 * engines read — again, data the site chose to publish for machine
 * consumption.
 *
 * What this deliberately does NOT do: solve CAPTCHAs, spoof browser
 * fingerprints to defeat bot-detection challenges, or rotate proxies to
 * evade IP/rate-limit blocks. When a portal is actively blocking automated
 * requests, that is reported honestly as an error rather than faked.
 */

const BROWSER_HEADERS: Record<string, string> = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36",
  Accept:
    "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
  "Accept-Language": "en-US,en;q=0.9",
};

const JSON_HEADERS: Record<string, string> = {
  ...BROWSER_HEADERS,
  Accept: "application/json, text/plain, */*",
};

/**
 * Workday's CXS endpoint parses `Accept-Language` as a literal locale
 * string rather than a weighted list — a normal browser-style header like
 * "en-US,en;q=0.9" makes it respond 400. Omit the weights entirely here.
 */
const WORKDAY_HEADERS: Record<string, string> = {
  "User-Agent": BROWSER_HEADERS["User-Agent"],
  Accept: "application/json, text/plain, */*",
  // Explicit, single-value locale — Workday parses this literally and 400s
  // on a weighted list (or, empirically, when left for the runtime to fill
  // in a default of its own).
  "Accept-Language": "en-US",
};

export type LiveOutcome = "ok" | "zero" | "error";
export type LiveSource =
  | "greenhouse"
  | "lever"
  | "ashby"
  | "smartrecruiters"
  | "workday"
  | "jsonld"
  | "unsupported";

export interface LiveJob {
  id: string;
  title: string;
  url: string;
  location: string;
  team?: string;
  postedOrUpdated: string;
}

export interface LiveFetchResult {
  outcome: LiveOutcome;
  source: LiveSource;
  jobs: LiveJob[];
  issue?: string;
}

class HttpError extends Error {
  constructor(public status: number) {
    super(`HTTP ${status}`);
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  timeoutMs: number,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

/** Retries transient failures (timeout/network/5xx/429) with backoff + jitter. Never retries 4xx (except 429). */
async function withRetry<T>(
  fn: () => Promise<T>,
  attempts = 3,
  baseDelayMs = 500,
): Promise<T> {
  let lastErr: unknown;
  for (let attempt = 0; attempt < attempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      const retryable =
        err instanceof HttpError
          ? err.status >= 500 || err.status === 429
          : true; // network error / timeout / abort
      if (!retryable || attempt === attempts - 1) throw err;
      const jitter = Math.random() * 200;
      await sleep(baseDelayMs * 2 ** attempt + jitter);
    }
  }
  throw lastErr;
}

const BLOCK_SIGNATURES = [
  "attention required",
  "cf-error",
  "cloudflare",
  "captcha",
  "access denied",
  "unusual traffic",
  "are you a robot",
  "request unsuccessful",
  "bot detection",
  "pardon our interruption",
];

function looksBlocked(status: number, bodySnippet: string): string | null {
  if (status === 403 || status === 429 || status === 503) {
    const lower = bodySnippet.toLowerCase();
    for (const sig of BLOCK_SIGNATURES) {
      if (lower.includes(sig)) {
        return "Portal is actively blocking automated requests (bot protection detected)";
      }
    }
    return `Portal returned HTTP ${status} — may be rate-limiting or blocking automated requests`;
  }
  return null;
}

/** Stable id so the same posting doesn't duplicate across fetch runs. */
export function computeJobId(companyName: string, sourceUrl: string, title: string): string {
  const hash = createHash("sha1")
    .update(`${companyName}|${title}|${sourceUrl}`)
    .digest("hex")
    .slice(0, 16);
  return `live-${hash}`;
}

// ── Adapters (each hits the platform's own public job-board JSON API) ──

async function fetchGreenhouse(slug: string): Promise<LiveJob[]> {
  const res = await fetchWithTimeout(
    `https://boards-api.greenhouse.io/v1/boards/${slug}/jobs?content=true`,
    { headers: JSON_HEADERS },
    8000,
  );
  if (!res.ok) throw new HttpError(res.status);
  const data = (await res.json()) as {
    jobs?: {
      id: number | string;
      title: string;
      absolute_url: string;
      updated_at?: string;
      location?: { name?: string };
      departments?: { name: string }[];
    }[];
  };
  return (data.jobs ?? []).map((j) => ({
    id: String(j.id),
    title: j.title,
    url: j.absolute_url,
    location: j.location?.name ?? "",
    team: j.departments?.[0]?.name,
    postedOrUpdated: j.updated_at ?? "",
  }));
}

async function fetchLever(slug: string): Promise<LiveJob[]> {
  const res = await fetchWithTimeout(
    `https://api.lever.co/v0/postings/${slug}?mode=json`,
    { headers: JSON_HEADERS },
    8000,
  );
  if (!res.ok) throw new HttpError(res.status);
  const data = (await res.json()) as {
    id: string;
    text: string;
    hostedUrl: string;
    createdAt?: number;
    categories?: { location?: string; team?: string };
  }[];
  if (!Array.isArray(data)) return [];
  return data.map((p) => ({
    id: p.id,
    title: p.text,
    url: p.hostedUrl,
    location: p.categories?.location ?? "",
    team: p.categories?.team,
    postedOrUpdated: p.createdAt ? new Date(p.createdAt).toISOString() : "",
  }));
}

async function fetchAshby(slug: string): Promise<LiveJob[]> {
  const res = await fetchWithTimeout(
    `https://api.ashbyhq.com/posting-api/job-board/${slug}`,
    { headers: JSON_HEADERS },
    8000,
  );
  if (!res.ok) throw new HttpError(res.status);
  const data = (await res.json()) as {
    jobs?: {
      id: string;
      title: string;
      location?: string;
      department?: string;
      publishedAt?: string;
      jobUrl?: string;
    }[];
  };
  return (data.jobs ?? []).map((j) => ({
    id: j.id,
    title: j.title,
    url: j.jobUrl ?? `https://jobs.ashbyhq.com/${slug}/${j.id}`,
    location: j.location ?? "",
    team: j.department,
    postedOrUpdated: j.publishedAt ?? "",
  }));
}

async function fetchSmartRecruiters(slug: string): Promise<LiveJob[]> {
  const res = await fetchWithTimeout(
    `https://api.smartrecruiters.com/v1/companies/${slug}/postings?limit=50`,
    { headers: JSON_HEADERS },
    8000,
  );
  if (!res.ok) throw new HttpError(res.status);
  const data = (await res.json()) as {
    content?: {
      id: string;
      name: string;
      releasedDate?: string;
      location?: { city?: string; region?: string; country?: string };
      department?: { label?: string };
    }[];
  };
  return (data.content ?? []).map((p) => ({
    id: p.id,
    title: p.name,
    url: `https://jobs.smartrecruiters.com/${slug}/${p.id}`,
    location: [p.location?.city, p.location?.region, p.location?.country]
      .filter(Boolean)
      .join(", "),
    team: p.department?.label,
    postedOrUpdated: p.releasedDate ?? "",
  }));
}

async function fetchWorkday(
  tenant: string,
  host: string,
  site: string,
): Promise<LiveJob[]> {
  const origin = `https://${host}`;
  const res = await fetchWithTimeout(
    `${origin}/wday/cxs/${tenant}/${site}/jobs`,
    {
      method: "POST",
      headers: { ...WORKDAY_HEADERS, "Content-Type": "application/json" },
      body: JSON.stringify({
        appliedFacets: {},
        limit: 50,
        offset: 0,
        searchText: "",
      }),
      cache: "no-store",
    },
    9000,
  );
  if (!res.ok) throw new HttpError(res.status);
  const data = (await res.json()) as {
    jobPostings?: {
      title: string;
      externalPath: string;
      locationsText?: string;
      postedOn?: string;
      bulletFields?: string[];
    }[];
  };
  return (data.jobPostings ?? []).map((j) => ({
    id: j.bulletFields?.[0] ?? j.externalPath,
    title: j.title,
    url: j.externalPath.startsWith("/")
      ? `${origin}${j.externalPath}`
      : `${origin}/${site}/${j.externalPath}`,
    location: j.locationsText ?? "",
    postedOrUpdated: j.postedOn ?? "",
  }));
}

/** Best-effort schema.org JobPosting extraction from a plain HTML fetch. */
async function fetchJsonLdFallback(
  url: string,
): Promise<{ jobs: LiveJob[]; blockedIssue?: string }> {
  const res = await fetchWithTimeout(url, { headers: BROWSER_HEADERS }, 9000);
  const text = await res.text();
  if (!res.ok) {
    const blocked = looksBlocked(res.status, text.slice(0, 2000));
    if (blocked) return { jobs: [], blockedIssue: blocked };
    throw new HttpError(res.status);
  }

  const blocked = looksBlocked(200, text.slice(0, 2000));
  if (blocked) return { jobs: [], blockedIssue: blocked };

  const jobs: LiveJob[] = [];
  const scriptRe =
    /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let match: RegExpExecArray | null;
  while ((match = scriptRe.exec(text)) !== null) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(match[1].trim());
    } catch {
      continue;
    }
    const candidates = Array.isArray(parsed) ? parsed : [parsed];
    for (const c of candidates) {
      const items =
        c && typeof c === "object" && Array.isArray((c as { "@graph"?: unknown[] })["@graph"])
          ? (c as { "@graph": unknown[] })["@graph"]
          : [c];
      for (const item of items) {
        if (
          !item ||
          typeof item !== "object" ||
          (item as Record<string, unknown>)["@type"] !== "JobPosting"
        ) {
          continue;
        }
        const j = item as Record<string, unknown>;
        const title = typeof j.title === "string" ? j.title : "";
        if (!title) continue;
        const org = j.hiringOrganization as { name?: string } | undefined;
        const jobLoc = j.jobLocation as
          | { address?: { addressLocality?: string; addressRegion?: string } }
          | { address?: { addressLocality?: string; addressRegion?: string } }[]
          | undefined;
        const loc = Array.isArray(jobLoc) ? jobLoc[0] : jobLoc;
        const locality = loc?.address?.addressLocality ?? "";
        const region = loc?.address?.addressRegion ?? "";
        jobs.push({
          id: typeof j.identifier === "string" ? j.identifier : title,
          title,
          url: typeof j.url === "string" ? j.url : url,
          location: [locality, region].filter(Boolean).join(", ") || (org?.name ?? ""),
          postedOrUpdated:
            typeof j.datePosted === "string" ? j.datePosted : "",
        });
      }
    }
  }
  return { jobs };
}

interface Adapter {
  source: LiveSource;
  detect: (url: URL) => Record<string, string> | null;
  fetch: (groups: Record<string, string>) => Promise<LiveJob[]>;
}

const ADAPTERS: Adapter[] = [
  {
    source: "greenhouse",
    detect: (u) => {
      const m = /^(?:boards|job-boards)\.greenhouse\.io$/.test(u.hostname)
        ? /^\/([a-z0-9-]+)/i.exec(u.pathname)
        : null;
      return m ? { slug: m[1] } : null;
    },
    fetch: ({ slug }) => fetchGreenhouse(slug),
  },
  {
    source: "lever",
    detect: (u) => {
      const m =
        u.hostname === "jobs.lever.co" ? /^\/([a-z0-9-]+)/i.exec(u.pathname) : null;
      return m ? { slug: m[1] } : null;
    },
    fetch: ({ slug }) => fetchLever(slug),
  },
  {
    source: "ashby",
    detect: (u) => {
      const m =
        u.hostname === "jobs.ashbyhq.com"
          ? /^\/([a-z0-9-]+)/i.exec(u.pathname)
          : null;
      return m ? { slug: m[1] } : null;
    },
    fetch: ({ slug }) => fetchAshby(slug),
  },
  {
    source: "smartrecruiters",
    detect: (u) => {
      const m =
        u.hostname === "careers.smartrecruiters.com"
          ? /^\/([a-z0-9-]+)/i.exec(u.pathname)
          : null;
      return m ? { slug: m[1] } : null;
    },
    fetch: ({ slug }) => fetchSmartRecruiters(slug),
  },
  {
    source: "workday",
    detect: (u) => {
      const m = /^([a-z0-9-]+)\.(wd\d+)\.myworkdayjobs\.com$/i.exec(u.hostname);
      if (!m) return null;
      const path = /^\/(?:[a-z]{2}-[A-Z]{2}\/)?([a-z0-9_-]+)/i.exec(u.pathname);
      if (!path) return null;
      return { tenant: m[1], host: u.hostname, site: path[1] };
    },
    fetch: ({ tenant, host, site }) => fetchWorkday(tenant, host, site),
  },
];

/**
 * Fetch live postings for one company's careers URL. Retries transient
 * failures; reports bot-blocking and permanent errors honestly instead of
 * pretending success.
 */
export async function fetchCompanyLive(careersUrl: string): Promise<LiveFetchResult> {
  let url: URL;
  try {
    url = new URL(careersUrl);
  } catch {
    return { outcome: "error", source: "unsupported", jobs: [], issue: "Invalid careers URL" };
  }

  for (const adapter of ADAPTERS) {
    const groups = adapter.detect(url);
    if (!groups) continue;
    try {
      const jobs = await withRetry(() => adapter.fetch(groups));
      return {
        outcome: jobs.length > 0 ? "ok" : "zero",
        source: adapter.source,
        jobs,
        issue: jobs.length === 0 ? "No open postings returned by the portal" : undefined,
      };
    } catch (err) {
      if (err instanceof HttpError) {
        return {
          outcome: "error",
          source: adapter.source,
          jobs: [],
          issue: `Portal API returned HTTP ${err.status} after retries`,
        };
      }
      return {
        outcome: "error",
        source: adapter.source,
        jobs: [],
        issue: "Network error or timeout reaching the portal API after retries",
      };
    }
  }

  // No known ATS matched — fall back to structured data on the page itself.
  try {
    const { jobs, blockedIssue } = await withRetry(() => fetchJsonLdFallback(careersUrl));
    if (blockedIssue) {
      return { outcome: "error", source: "jsonld", jobs: [], issue: blockedIssue };
    }
    return {
      outcome: jobs.length > 0 ? "ok" : "zero",
      source: "jsonld",
      jobs,
      issue:
        jobs.length === 0
          ? "Could not detect structured job data (schema.org JobPosting) on this portal"
          : undefined,
    };
  } catch (err) {
    if (err instanceof HttpError) {
      return {
        outcome: "error",
        source: "jsonld",
        jobs: [],
        issue: `Portal returned HTTP ${err.status} after retries`,
      };
    }
    return {
      outcome: "error",
      source: "jsonld",
      jobs: [],
      issue: "Network error or timeout reaching the portal after retries",
    };
  }
}

/** Rough relevance scoring against the tenant's own keywords — no external calls. */
export function classifyMatch(
  liveJob: LiveJob,
  keywords: string[],
): { match: MatchLevel; whyMatch: string } {
  if (keywords.length === 0) {
    return { match: "Possible Match", whyMatch: "Added to your watchlist" };
  }
  const hay = `${liveJob.title} ${liveJob.team ?? ""}`.toLowerCase();
  const hits = keywords.filter((k) => hay.includes(k));
  if (hits.length >= 2) {
    return {
      match: "Strong Match",
      whyMatch: `Matches ${hits.slice(0, 3).join(", ")} from your target roles`,
    };
  }
  if (hits.length === 1) {
    return { match: "Good Match", whyMatch: `Matches "${hits[0]}" from your target roles` };
  }
  return { match: "Possible Match", whyMatch: "From a company on your watchlist" };
}
