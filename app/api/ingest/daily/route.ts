import { randomUUID } from "crypto";
import { timingSafeEqual } from "crypto";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import {
  isAdminEmail,
  requireUser,
  ensureAdminPrivileges,
} from "@/lib/auth";
import {
  getRedis,
  findUserByEmail,
  ensureAdminBootstrap,
  getBilling,
  getFetchRuns,
  saveFetchRuns,
  setLastFetchDate,
} from "@/lib/users";
import {
  getUserJobs,
  saveUserJobs,
  saveUserDailyDigest,
  mergeJobsById,
  listUserDailyDates,
} from "@/lib/jobs";
import { resolveEntitlements } from "@/lib/plans";
import { invalidateUser } from "@/lib/cache";
import { recomputeAndStoreUsage } from "@/lib/redis";
import type {
  DailyDigest,
  FetchCadence,
  FetchRun,
  FetchRunStatus,
  Job,
  User,
} from "@/lib/types";

export const dynamic = "force-dynamic";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function safeEqualString(a: string, b: string): boolean {
  try {
    const ba = Buffer.from(a);
    const bb = Buffer.from(b);
    if (ba.length !== bb.length) return false;
    return timingSafeEqual(ba, bb);
  } catch {
    return false;
  }
}

function getBearerToken(req: NextRequest): string | null {
  const h = req.headers.get("authorization") || req.headers.get("Authorization");
  if (!h) return null;
  const m = /^Bearer\s+(.+)$/i.exec(h.trim());
  return m ? m[1].trim() : null;
}

function ingestSecretConfigured(): string | null {
  const s = process.env.HUNTER_INGEST_SECRET?.trim();
  return s || null;
}

function defaultAdminEmail(): string {
  return (
    process.env.ADMIN_EMAIL?.trim().toLowerCase() || "imrn.dev@gmail.com"
  );
}

function isJobLike(v: unknown): v is Job {
  if (!v || typeof v !== "object") return false;
  const j = v as Record<string, unknown>;
  return typeof j.id === "string" && j.id.length > 0;
}

function normalizeFetchRun(
  raw: Partial<FetchRun> & Record<string, unknown>,
  fallbackDate: string,
  cadence: FetchCadence,
): FetchRun {
  const companyResults = Array.isArray(raw.companyResults)
    ? raw.companyResults
    : [];
  const status = (
    ["ok", "partial", "error", "skipped"] as FetchRunStatus[]
  ).includes(raw.status as FetchRunStatus)
    ? (raw.status as FetchRunStatus)
    : "ok";
  return {
    id: typeof raw.id === "string" && raw.id ? raw.id : randomUUID(),
    runDate:
      typeof raw.runDate === "string" && DATE_RE.test(raw.runDate)
        ? raw.runDate
        : fallbackDate,
    createdAt:
      typeof raw.createdAt === "string" && raw.createdAt
        ? raw.createdAt
        : new Date().toISOString(),
    status,
    cadenceApplied:
      raw.cadenceApplied === "daily" || raw.cadenceApplied === "alternate"
        ? raw.cadenceApplied
        : cadence,
    companiesChecked:
      typeof raw.companiesChecked === "number"
        ? raw.companiesChecked
        : companyResults.length,
    jobsFound: typeof raw.jobsFound === "number" ? raw.jobsFound : 0,
    notes: typeof raw.notes === "string" ? raw.notes : undefined,
    issue: typeof raw.issue === "string" ? raw.issue : undefined,
    source:
      raw.source === "catalog" || raw.source === "seed"
        ? raw.source
        : undefined,
    companyResults,
  };
}

/**
 * Resolve target user for ingest:
 * - Session cookie → session user (email in body ignored)
 * - Bearer HUNTER_INGEST_SECRET → resolve by email (body.email, header
 *   X-Hunter-Email, or default ADMIN_EMAIL / imrn.dev@gmail.com).
 *   Email must be admin email or an existing user.
 */
async function resolveIngestUser(
  req: NextRequest,
  bodyEmail?: string,
): Promise<
  | { user: User; via: "session" | "bearer" }
  | { error: string; status: number }
> {
  const bearer = getBearerToken(req);
  const secret = ingestSecretConfigured();

  if (bearer && secret && safeEqualString(bearer, secret)) {
    const headerEmail =
      req.headers.get("x-hunter-email")?.trim().toLowerCase() ||
      req.headers.get("X-Hunter-Email")?.trim().toLowerCase() ||
      "";
    const email =
      (bodyEmail?.trim().toLowerCase() || headerEmail || defaultAdminEmail());

    if (!email.includes("@")) {
      return { error: "Valid email required with bearer auth", status: 400 };
    }

    await ensureAdminBootstrap();
    let user = await findUserByEmail(email);
    if (!user) {
      if (isAdminEmail(email)) {
        await ensureAdminBootstrap();
        user = await findUserByEmail(email);
      }
      if (!user) {
        return {
          error: `User not found for email ${email} — register first or use ADMIN_EMAIL`,
          status: 404,
        };
      }
    }
    // Only allow admin email OR already-existing user (existing covered above).
    // Existing non-admin is fine; unknown non-admin already 404'd.
    user = await ensureAdminPrivileges(user);
    return { user, via: "bearer" };
  }

  // Invalid / missing bearer: fall through to session
  if (bearer && secret && !safeEqualString(bearer, secret)) {
    return { error: "Invalid ingest secret", status: 401 };
  }
  if (bearer && !secret) {
    return {
      error: "HUNTER_INGEST_SECRET not configured",
      status: 503,
    };
  }

  const sessionUser = await requireUser();
  if (!sessionUser) {
    return {
      error:
        "Unauthorized — provide session cookie or Authorization: Bearer ${HUNTER_INGEST_SECRET}",
      status: 401,
    };
  }
  return { user: sessionUser, via: "session" };
}

type IngestBody = {
  email?: string;
  date?: string;
  title?: string;
  jobs?: unknown;
  fetchRun?: Partial<FetchRun> & Record<string, unknown>;
  mergeJobs?: boolean;
};

/**
 * POST /api/ingest/daily
 * Morning publish: write daily digest + merge jobs (+ optional FetchRun)
 * into a single tenant's Redis keys.
 */
export async function POST(req: NextRequest) {
  let body: IngestBody;
  try {
    body = (await req.json()) as IngestBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const resolved = await resolveIngestUser(req, body.email);
  if ("error" in resolved) {
    return NextResponse.json(
      { error: resolved.error },
      { status: resolved.status },
    );
  }
  const { user } = resolved;

  const date = typeof body.date === "string" ? body.date.trim() : "";
  if (!DATE_RE.test(date)) {
    return NextResponse.json(
      { error: "date required as YYYY-MM-DD (IST)" },
      { status: 400 },
    );
  }

  if (!Array.isArray(body.jobs)) {
    return NextResponse.json(
      { error: "jobs must be an array of Job objects" },
      { status: 400 },
    );
  }
  const jobs = (body.jobs as unknown[]).filter(isJobLike) as Job[];

  const redisOk = getRedis() != null;
  if (!redisOk) {
    return NextResponse.json(
      { error: "Redis required for tenant ingest" },
      { status: 503 },
    );
  }

  const title =
    typeof body.title === "string" && body.title.trim()
      ? body.title.trim()
      : `Daily digest — ${date}`;

  const digest: DailyDigest = {
    date,
    title,
    jobs,
  };

  const digestSaved = await saveUserDailyDigest(user.id, digest);
  if (!digestSaved) {
    return NextResponse.json(
      { error: "Failed to save daily digest" },
      { status: 503 },
    );
  }

  const mergeJobs = body.mergeJobs !== false; // default true
  let finalJobs: Job[];
  if (mergeJobs) {
    const existing = await getUserJobs(user.id);
    finalJobs = mergeJobsById(existing, jobs);
  } else {
    finalJobs = jobs;
  }
  const jobsSaved = await saveUserJobs(user.id, finalJobs);
  if (!jobsSaved) {
    return NextResponse.json(
      { error: "Failed to save user jobs" },
      { status: 503 },
    );
  }

  let fetchRunsCount = 0;
  if (body.fetchRun && typeof body.fetchRun === "object") {
    const billing = await getBilling(user.id);
    const ent = resolveEntitlements(user.role, billing, user.isSpecialFriend);
    const run = normalizeFetchRun(
      body.fetchRun,
      date,
      ent.fetchCadence,
    );
    const prev = await getFetchRuns(user.id);
    const next = [run, ...prev.filter((r) => r.id !== run.id)];
    const max = ent.maxFetchHistory;
    const trimmed = Number.isFinite(max) ? next.slice(0, max) : next;
    const ok = await saveFetchRuns(user.id, trimmed);
    if (!ok) {
      return NextResponse.json(
        { error: "Failed to save fetch run" },
        { status: 503 },
      );
    }
    fetchRunsCount = trimmed.length;
  } else {
    const prev = await getFetchRuns(user.id);
    fetchRunsCount = prev.length;
  }

  await setLastFetchDate(user.id, date);
  await recomputeAndStoreUsage(user.id);
  invalidateUser(user.id);

  const dailyDates = await listUserDailyDates(user.id);

  return NextResponse.json({
    ok: true,
    userId: user.id,
    email: user.email,
    jobCount: finalJobs.length,
    dailyCount: dailyDates.length,
    fetchRunsCount,
  });
}
