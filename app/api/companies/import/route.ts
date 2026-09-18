import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import {
  checkStorageQuota,
  getCompanies,
  projectedBytesWithCompanies,
  saveCompanies,
} from "@/lib/redis";
import { getBilling } from "@/lib/users";
import { entitlementsForJson, resolveEntitlements } from "@/lib/plans";
import { uniqueId } from "@/lib/companies";
import type { CompanyProfile, QuotaErrorBody } from "@/lib/types";

type Skipped = { name: string; reason: string };

type ImportResult = {
  companies: CompanyProfile[];
  imported: number;
  updated: number;
  skipped: Skipped[];
  redisAvailable: boolean;
  entitlements: ReturnType<typeof entitlementsForJson>;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function withQuota(
  result: ImportResult,
  quota: QuotaErrorBody,
): ImportResult & QuotaErrorBody {
  return {
    ...result,
    error: quota.error,
    kind: quota.kind,
    limit: quota.limit,
    used: quota.used,
    message: quota.message,
  };
}

export async function POST(request: Request) {
  const user = await requireUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const authenticatedUser = user;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const mapping = isRecord(body) && "mapping" in body ? body.mapping : body;
  if (!isRecord(mapping)) {
    return NextResponse.json(
      { error: "Expected a JSON object mapping company names to URLs" },
      { status: 400 },
    );
  }

  const { companies, redisAvailable } = await getCompanies(user.id);
  const billing = await getBilling(user.id);
  const resolvedEntitlements = resolveEntitlements(user.role, billing);
  const entitlements = entitlementsForJson(resolvedEntitlements);
  const initial: ImportResult = {
    companies,
    imported: 0,
    updated: 0,
    skipped: [],
    redisAvailable,
    entitlements,
  };

  if (!redisAvailable) {
    return NextResponse.json(
      { ...initial, error: "Redis unavailable — cannot persist companies" },
      { status: 503 },
    );
  }

  const now = new Date().toISOString();
  const next = [...companies];
  const ids = new Set(next.map((company) => company.id));
  const names = new Map(
    next.map((company, index) => [company.name.trim().toLowerCase(), index]),
  );
  const skipped: Skipped[] = [];
  const parsedEntries: { name: string; url: string; key: string }[] = [];

  for (const [rawName, rawUrl] of Object.entries(mapping)) {
    const name = rawName.trim();
    if (!name) {
      skipped.push({ name: rawName, reason: "Company name is empty" });
      continue;
    }
    if (typeof rawUrl !== "string" || !/^https?:\/\//i.test(rawUrl.trim())) {
      skipped.push({
        name,
        reason: "URL must start with http:// or https://",
      });
      continue;
    }
    const key = name.toLowerCase();
    if (parsedEntries.some((entry) => entry.key === key)) {
      skipped.push({ name, reason: "Duplicate company name" });
      continue;
    }
    parsedEntries.push({ name, url: rawUrl.trim().slice(0, 500), key });
  }

  const existingEntries = parsedEntries.filter((entry) => names.has(entry.key));
  const newEntries = parsedEntries.filter((entry) => !names.has(entry.key));
  let imported = 0;
  let updated = 0;
  let planLimit: QuotaErrorBody | null = null;
  let storageLimit: QuotaErrorBody | null = null;

  async function tryApply(
    entry: { name: string; url: string; key: string },
    mode: "update" | "new",
  ): Promise<void> {
    const existingIndex = names.get(entry.key);
    if (mode === "update" && existingIndex == null) return;

    let candidate: CompanyProfile[];
    if (mode === "update") {
      candidate = [...next];
      candidate[existingIndex!] = {
        ...candidate[existingIndex!],
        careersUrl: entry.url,
        updatedAt: now,
      };
    } else {
      const company: CompanyProfile = {
        id: uniqueId(entry.name, ids),
        name: entry.name,
        valuation: "",
        headcount: "",
        bangaloreArea: "",
        industry: "",
        careersUrl: entry.url,
        priority: "medium",
        notes: "",
        active: true,
        updatedAt: now,
      };
      candidate = [...next, company];
    }

    const quota = await checkStorageQuota(
      authenticatedUser,
      await projectedBytesWithCompanies(authenticatedUser.id, candidate),
    );
    if (quota) {
      storageLimit ??= quota;
      skipped.push({ name: entry.name, reason: "Storage quota exceeded" });
      return;
    }

    next.splice(0, next.length, ...candidate);
    if (mode === "update") {
      updated += 1;
    } else {
      ids.add(candidate[candidate.length - 1].id);
      names.set(entry.key, candidate.length - 1);
      imported += 1;
    }
  }

  // Process updates before creates so a full company plan can still update URLs.
  for (const entry of existingEntries) {
    await tryApply(entry, "update");
  }

  for (const entry of newEntries) {
    if (next.length + 1 > resolvedEntitlements.maxCompanies) {
      planLimit ??= {
        error: "PLAN_LIMIT",
        kind: "companies",
        limit: Number.isFinite(resolvedEntitlements.maxCompanies)
          ? resolvedEntitlements.maxCompanies
          : -1,
        used: next.length,
        message: "Company limit reached — upgrade your plan",
      };
      skipped.push({ name: entry.name, reason: "Company limit reached" });
      continue;
    }
    await tryApply(entry, "new");
  }

  next.sort((a, b) => a.name.localeCompare(b.name));
  const result: ImportResult = {
    companies: next,
    imported,
    updated,
    skipped,
    redisAvailable,
    entitlements,
  };
  const limit = planLimit ?? storageLimit;

  if (imported > 0 || updated > 0) {
    const ok = await saveCompanies(user.id, next);
    if (!ok) {
      return NextResponse.json(
        { error: "Failed to write companies to Redis" },
        { status: 503 },
      );
    }
  }

  if (limit) {
    return NextResponse.json(withQuota(result, limit), { status: 402 });
  }
  return NextResponse.json(result);
}
