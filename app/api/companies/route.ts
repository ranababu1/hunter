import { NextResponse } from "next/server";
import { getCompanies, saveCompanies } from "@/lib/redis";
import type { CompanyPriority, CompanyProfile } from "@/lib/types";

const PRIORITIES = new Set<CompanyPriority>(["high", "medium", "low"]);

function slugify(name: string): string {
  const base = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
  return base || "company";
}

function shortRandom(): string {
  return Math.random().toString(36).slice(2, 6);
}

function uniqueId(name: string, existing: Set<string>): string {
  let id = slugify(name);
  if (!existing.has(id)) return id;
  id = `${slugify(name)}-${shortRandom()}`;
  while (existing.has(id)) {
    id = `${slugify(name)}-${shortRandom()}`;
  }
  return id;
}

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
  const { companies, fromSeed, redisAvailable } = await getCompanies();
  return NextResponse.json({ companies, fromSeed, redisAvailable });
}

export async function POST(request: Request) {
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

  const { companies, redisAvailable } = await getCompanies();
  if (!redisAvailable) {
    return NextResponse.json(
      {
        error:
          "Redis unavailable — cannot persist companies. Set UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN.",
      },
      { status: 503 },
    );
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
  const ok = await saveCompanies(next);
  if (!ok) {
    return NextResponse.json(
      { error: "Failed to write companies to Redis" },
      { status: 503 },
    );
  }
  return NextResponse.json({ company, companies: next }, { status: 201 });
}

export async function PUT(request: Request) {
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

  const { companies, redisAvailable } = await getCompanies();
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

  const ok = await saveCompanies(next);
  if (!ok) {
    return NextResponse.json(
      { error: "Failed to write companies to Redis" },
      { status: 503 },
    );
  }
  return NextResponse.json({ company: updated, companies: next });
}

export async function DELETE(request: Request) {
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

  const { companies, redisAvailable } = await getCompanies();
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

  const ok = await saveCompanies(next);
  if (!ok) {
    return NextResponse.json(
      { error: "Failed to write companies to Redis" },
      { status: 503 },
    );
  }
  return NextResponse.json({ ok: true, companies: next });
}
