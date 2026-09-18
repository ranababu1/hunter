import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import {
  checkCompanyLimit,
  checkStorageQuota,
  getCompanies,
  projectedBytesWithCompanies,
  saveCompanies,
} from "@/lib/redis";
import { getBilling } from "@/lib/users";
import { entitlementsForJson, resolveEntitlements } from "@/lib/plans";
import type { CompanyPriority, CompanyProfile } from "@/lib/types";
import { uniqueId } from "@/lib/companies";

const PRIORITIES = new Set<CompanyPriority>(["high", "medium", "low"]);

function asString(v: unknown, fallback = ""): string {
  if (typeof v === "string") return v.trim();
  if (typeof v === "number" && Number.isFinite(v)) return String(v);
  return fallback;
}

function parsePriority(v: unknown): CompanyPriority | null {
  if (typeof v !== "string") return null;
  const p = v.toLowerCase() as CompanyPriority;
  return PRIORITIES.has(p) ? p : null;
}

function validateBody(
  body: Record<string, unknown>,
  opts: { requireName: boolean },
): { error: string } | { data: Partial<CompanyProfile> & { name?: string } } {
  const data: Partial<CompanyProfile> & { name?: string } = {};

  if ("name" in body || opts.requireName) {
    const name = asString(body.name);
    if (!name) return { error: "name is required" };
    if (name.length > 120) return { error: "name too long" };
    data.name = name;
  }

  if ("valuation" in body) data.valuation = asString(body.valuation).slice(0, 200);
  if ("headcount" in body) data.headcount = asString(body.headcount).slice(0, 80);
  if ("bangaloreArea" in body)
    data.bangaloreArea = asString(body.bangaloreArea).slice(0, 200);
  if ("industry" in body) data.industry = asString(body.industry).slice(0, 200);
  if ("careersUrl" in body) {
    const url = asString(body.careersUrl);
    if (url && !/^https?:\/\//i.test(url)) {
      return { error: "careersUrl must start with http:// or https://" };
    }
    data.careersUrl = url.slice(0, 500);
  }
  if ("priority" in body) {
    const p = parsePriority(body.priority);
    if (!p) return { error: "priority must be high, medium, or low" };
    data.priority = p;
  }
  if ("notes" in body) data.notes = asString(body.notes).slice(0, 2000);
  if ("active" in body) {
    if (typeof body.active !== "boolean") {
      return { error: "active must be boolean" };
    }
    data.active = body.active;
  }

  return { data };
}

export async function GET() {
  const user = await requireUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { companies, fromSeed, redisAvailable } = await getCompanies(user.id);
  const billing = await getBilling(user.id);
  const entitlements = entitlementsForJson(
    resolveEntitlements(user.role, billing),
  );
  return NextResponse.json(
    {
      companies,
      fromSeed,
      redisAvailable,
      entitlements,
      companyCount: companies.length,
    },
    {
      headers: {
        "Cache-Control": "private, max-age=0, stale-while-revalidate=15",
      },
    },
  );
}

export async function POST(request: Request) {
  const user = await requireUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: Record<string, unknown> = {};
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = validateBody(body, { requireName: true });
  if ("error" in parsed) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }

  const { companies, redisAvailable } = await getCompanies(user.id);
  if (!redisAvailable) {
    return NextResponse.json(
      {
        error:
          "Redis unavailable — cannot persist companies. Set UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN.",
      },
      { status: 503 },
    );
  }

  const planErr = await checkCompanyLimit(user, companies.length + 1);
  if (planErr) {
    return NextResponse.json(planErr, { status: 402 });
  }

  const ids = new Set(companies.map((c) => c.id));
  const name = parsed.data.name!;
  const now = new Date().toISOString();
  const company: CompanyProfile = {
    id: uniqueId(name, ids),
    name,
    valuation: parsed.data.valuation ?? "",
    headcount: parsed.data.headcount ?? "",
    bangaloreArea: parsed.data.bangaloreArea ?? "",
    industry: parsed.data.industry ?? "",
    careersUrl: parsed.data.careersUrl ?? "",
    priority: parsed.data.priority ?? "medium",
    notes: parsed.data.notes ?? "",
    active: parsed.data.active ?? true,
    updatedAt: now,
  };

  const next = [...companies, company].sort((a, b) =>
    a.name.localeCompare(b.name),
  );

  const projected = await projectedBytesWithCompanies(user.id, next);
  const quotaErr = await checkStorageQuota(user, projected);
  if (quotaErr) {
    return NextResponse.json(quotaErr, { status: 402 });
  }

  const ok = await saveCompanies(user.id, next);
  if (!ok) {
    return NextResponse.json(
      { error: "Failed to write companies to Redis" },
      { status: 503 },
    );
  }
  return NextResponse.json({ company, companies: next }, { status: 201 });
}

export async function PUT(request: Request) {
  const user = await requireUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: Record<string, unknown> = {};
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const id = asString(body.id);
  if (!id) {
    return NextResponse.json({ error: "id is required" }, { status: 400 });
  }

  const parsed = validateBody(body, { requireName: false });
  if ("error" in parsed) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }

  const { companies, redisAvailable } = await getCompanies(user.id);
  if (!redisAvailable) {
    return NextResponse.json(
      {
        error:
          "Redis unavailable — cannot persist companies. Set UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN.",
      },
      { status: 503 },
    );
  }

  const idx = companies.findIndex((c) => c.id === id);
  if (idx < 0) {
    return NextResponse.json({ error: "Company not found" }, { status: 404 });
  }

  const prev = companies[idx];
  const updated: CompanyProfile = {
    ...prev,
    ...parsed.data,
    id: prev.id,
    updatedAt: new Date().toISOString(),
  };

  const next = [...companies];
  next[idx] = updated;
  next.sort((a, b) => a.name.localeCompare(b.name));

  const projected = await projectedBytesWithCompanies(user.id, next);
  const quotaErr = await checkStorageQuota(user, projected);
  if (quotaErr) {
    return NextResponse.json(quotaErr, { status: 402 });
  }

  const ok = await saveCompanies(user.id, next);
  if (!ok) {
    return NextResponse.json(
      { error: "Failed to write companies to Redis" },
      { status: 503 },
    );
  }
  return NextResponse.json({ company: updated, companies: next });
}

export async function DELETE(request: Request) {
  const user = await requireUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(request.url);
  let id = url.searchParams.get("id") ?? "";

  if (!id) {
    try {
      const body = (await request.json()) as { id?: string };
      id = typeof body.id === "string" ? body.id : "";
    } catch {
      // no body
    }
  }

  if (!id) {
    return NextResponse.json({ error: "id is required" }, { status: 400 });
  }

  const { companies, redisAvailable } = await getCompanies(user.id);
  if (!redisAvailable) {
    return NextResponse.json(
      {
        error:
          "Redis unavailable — cannot persist companies. Set UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN.",
      },
      { status: 503 },
    );
  }

  const next = companies.filter((c) => c.id !== id);
  if (next.length === companies.length) {
    return NextResponse.json({ error: "Company not found" }, { status: 404 });
  }

  const ok = await saveCompanies(user.id, next);
  if (!ok) {
    return NextResponse.json(
      { error: "Failed to write companies to Redis" },
      { status: 503 },
    );
  }
  return NextResponse.json({ ok: true, companies: next });
}
