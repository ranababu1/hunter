import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import {
  appendImportHash,
  checkStorageQuota,
  getCompanies,
  getImportHashes,
  projectedBytesWithCompanies,
  saveCompanies,
} from "@/lib/redis";
import { createHash } from "crypto";
import { canonicalizeImportMapping } from "@/lib/import-hash";
import { getBilling } from "@/lib/users";
import { entitlementsForJson, resolveEntitlements } from "@/lib/plans";
import {
  checkPortalUrl,
  looksLikeHttpUrl,
  mapPool,
  uniqueId,
} from "@/lib/companies";
import type { CompanyProfile, QuotaErrorBody } from "@/lib/types";

type Skipped = { name: string; reason: string };

type ImportResult = {
  companies: CompanyProfile[];
  imported: number;
  updated: number;
  skipped: Skipped[];
  problematic: number;
  redisAvailable: boolean;
  entitlements: ReturnType<typeof entitlementsForJson>;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hashImportMapping(mapping: Record<string, unknown>): string {
  return createHash("sha256")
    .update(canonicalizeImportMapping(mapping))
    .digest("hex");
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

  if (!isRecord(body)) {
    return NextResponse.json(
      { error: "Expected a JSON object mapping company names to URLs" },
      { status: 400 },
    );
  }

  let validatePortals = false;
  let mapping: Record<string, unknown>;

  if ("mapping" in body) {
    if (!isRecord(body.mapping)) {
      return NextResponse.json(
        { error: "Expected a JSON object mapping company names to URLs" },
        { status: 400 },
      );
    }
    mapping = body.mapping;
    validatePortals = body.validatePortals === true;
  } else {
    // Raw mapping object — validatePortals defaults false
    mapping = body;
    validatePortals = false;
  }

  const importHash = hashImportMapping(mapping);
  const recentHashes = await getImportHashes(user.id);
  if (recentHashes.includes(importHash)) {
    return NextResponse.json(
      {
        error: "DUPLICATE_IMPORT",
        message: "This company list was already imported.",
      },
      { status: 409 },
    );
  }

  const { companies, redisAvailable } = await getCompanies(user.id);
  const billing = await getBilling(user.id);
  const resolvedEntitlements = resolveEntitlements(user.role, billing, user.isSpecialFriend);
  const entitlements = entitlementsForJson(resolvedEntitlements);
  const initial: ImportResult = {
    companies,
    imported: 0,
    updated: 0,
    skipped: [],
    problematic: 0,
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
  type ParsedEntry = {
    name: string;
    url: string;
    key: string;
    portalOk?: boolean;
    portalIssue?: string;
  };
  const parsedEntries: ParsedEntry[] = [];

  for (const [rawName, rawUrl] of Object.entries(mapping)) {
    const name = rawName.trim();
    if (!name) {
      skipped.push({ name: rawName, reason: "Company name is empty" });
      continue;
    }
    if (typeof rawUrl !== "string" || !looksLikeHttpUrl(rawUrl)) {
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

  if (validatePortals && parsedEntries.length > 0) {
    const checks = await mapPool(parsedEntries, 5, async (entry) => {
      const result = await checkPortalUrl(entry.url);
      return { key: entry.key, result };
    });
    const byKey = new Map(checks.map((c) => [c.key, c.result]));
    for (const entry of parsedEntries) {
      const result = byKey.get(entry.key);
      if (!result) continue;
      if (result.ok) {
        entry.portalOk = true;
        entry.portalIssue = undefined;
      } else {
        entry.portalOk = false;
        entry.portalIssue = result.issue;
      }
    }
  }

  const existingEntries = parsedEntries.filter((entry) => names.has(entry.key));
  const newEntries = parsedEntries.filter((entry) => !names.has(entry.key));
  let imported = 0;
  let updated = 0;
  let problematic = 0;
  let planLimit: QuotaErrorBody | null = null;
  let storageLimit: QuotaErrorBody | null = null;

  async function tryApply(
    entry: ParsedEntry,
    mode: "update" | "new",
  ): Promise<void> {
    const existingIndex = names.get(entry.key);
    if (mode === "update" && existingIndex == null) return;

    let candidate: CompanyProfile[];
    if (mode === "update") {
      candidate = [...next];
      const prev = candidate[existingIndex!];
      const updatedRow: CompanyProfile = {
        ...prev,
        careersUrl: entry.url,
        updatedAt: now,
      };
      if (validatePortals) {
        if (entry.portalOk === false) {
          updatedRow.portalOk = false;
          updatedRow.portalIssue = entry.portalIssue;
        } else {
          updatedRow.portalOk = true;
          delete updatedRow.portalIssue;
        }
      } else {
        // New URL without live check — clear prior flags (legacy ok)
        delete updatedRow.portalOk;
        delete updatedRow.portalIssue;
      }
      candidate[existingIndex!] = updatedRow;
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
      if (validatePortals) {
        if (entry.portalOk === false) {
          company.portalOk = false;
          if (entry.portalIssue) company.portalIssue = entry.portalIssue;
        } else {
          company.portalOk = true;
        }
      }
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
    if (validatePortals && entry.portalOk === false) problematic += 1;
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
    problematic,
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
    await appendImportHash(user.id, importHash);
  } else if (parsedEntries.length > 0) {
    // Valid mapping processed with no row changes (e.g. identical URLs) — still mark seen
    await appendImportHash(user.id, importHash);
  }

  if (limit) {
    return NextResponse.json(
      { ...withQuota(result, limit), importHash },
      { status: 402 },
    );
  }
  return NextResponse.json({ ...result, importHash });
}
