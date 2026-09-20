import { NextResponse } from "next/server";
import { isOnboarded, requireUser, toPublicUser } from "@/lib/auth";
import {
  checkStorageQuota,
  getCompanies,
  projectedBytesWithCompanies,
  recomputeAndStoreUsage,
  saveCompanies,
} from "@/lib/redis";
import {
  getBilling,
  getProfile,
  markOnboardingComplete,
  saveProfile,
} from "@/lib/users";
import { entitlementsForJson, resolveEntitlements } from "@/lib/plans";
import { looksLikeHttpUrl, uniqueId } from "@/lib/companies";
import { EXPERIENCE_LEVELS } from "@/lib/types";
import type {
  CompanyProfile,
  ExperienceLevel,
  TargetRole,
  UserProfile,
} from "@/lib/types";

const MAX_ROLES = 10;
const MAX_LOCATIONS = 10;
const MAX_RESUME_CHARS = 200_000;

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function cleanStrings(v: unknown, maxLen: number, max: number): string[] {
  if (!Array.isArray(v)) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of v) {
    if (typeof item !== "string") continue;
    const s = item.trim().slice(0, maxLen);
    if (!s) continue;
    const k = s.toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(s);
    if (out.length >= max) break;
  }
  return out;
}

function slugRole(label: string, i: number): TargetRole {
  const slug = label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
  return { id: `role-${i}-${slug || "role"}`, label };
}

/** GET → onboarding status + plan limits for the wizard. */
export async function GET() {
  const user = await requireUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const [billing, profile, { companies }] = await Promise.all([
    getBilling(user.id),
    getProfile(user.id),
    getCompanies(user.id),
  ]);
  const entitlements = entitlementsForJson(
    resolveEntitlements(user.role, billing),
  );
  return NextResponse.json({
    user: toPublicUser(user),
    completed: isOnboarded(user),
    entitlements,
    existing: {
      targetRoles: profile.targetRoles,
      locations: profile.locations ?? [],
      experienceLevel: profile.experienceLevel ?? null,
      companiesCount: companies.length,
    },
  });
}

/**
 * POST → save roles / preferences / companies for THIS tenant only and mark
 * onboarding complete. Enforces plan company limit and storage quota.
 */
export async function POST(request: Request) {
  const user = await requireUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  if (!isRecord(body)) {
    return NextResponse.json(
      { error: "Expected a JSON object" },
      { status: 400 },
    );
  }

  const roleLabels = cleanStrings(body.targetRoles, 80, MAX_ROLES);
  if (roleLabels.length === 0) {
    return NextResponse.json(
      { error: "Add at least one desired role", field: "targetRoles" },
      { status: 400 },
    );
  }
  const locations = cleanStrings(body.locations, 60, MAX_LOCATIONS);

  let experienceLevel: ExperienceLevel | undefined;
  if (typeof body.experienceLevel === "string" && body.experienceLevel) {
    const lvl = body.experienceLevel;
    if (!EXPERIENCE_LEVELS.some((e) => e.id === lvl)) {
      return NextResponse.json(
        { error: "Invalid experience level", field: "experienceLevel" },
        { status: 400 },
      );
    }
    experienceLevel = lvl as ExperienceLevel;
  }

  const resumeText =
    typeof body.resumeText === "string"
      ? body.resumeText.slice(0, MAX_RESUME_CHARS)
      : "";

  // Companies: [{ name, careersUrl? }]
  type Incoming = { name: string; careersUrl: string };
  const incoming: Incoming[] = [];
  if (Array.isArray(body.companies)) {
    const seen = new Set<string>();
    for (const raw of body.companies) {
      if (!isRecord(raw)) continue;
      const name =
        typeof raw.name === "string" ? raw.name.trim().slice(0, 120) : "";
      if (!name) continue;
      const key = name.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      const url =
        typeof raw.careersUrl === "string"
          ? raw.careersUrl.trim().slice(0, 500)
          : "";
      if (url && !looksLikeHttpUrl(url)) {
        return NextResponse.json(
          {
            error: `Careers URL for "${name}" must start with http:// or https://`,
            field: "companies",
          },
          { status: 400 },
        );
      }
      incoming.push({ name, careersUrl: url });
    }
  }
  if (incoming.length === 0) {
    return NextResponse.json(
      { error: "Add at least one company to track", field: "companies" },
      { status: 400 },
    );
  }

  const [billing, prevProfile, companiesResult] = await Promise.all([
    getBilling(user.id),
    getProfile(user.id),
    getCompanies(user.id),
  ]);
  if (!companiesResult.redisAvailable) {
    return NextResponse.json(
      { error: "Redis unavailable — cannot save onboarding" },
      { status: 503 },
    );
  }
  const ent = resolveEntitlements(user.role, billing);

  // Merge companies into whatever the tenant already has (idempotent by name).
  const existing = companiesResult.companies;
  const byName = new Map(
    existing.map((c) => [c.name.trim().toLowerCase(), c]),
  );
  const ids = new Set(existing.map((c) => c.id));
  const now = new Date().toISOString();
  const next: CompanyProfile[] = [...existing];
  const newNames = incoming.filter((i) => !byName.has(i.name.toLowerCase()));
  if (next.length + newNames.length > ent.maxCompanies) {
    const limit = Number.isFinite(ent.maxCompanies) ? ent.maxCompanies : -1;
    const room = Math.max(0, ent.maxCompanies - next.length);
    return NextResponse.json(
      {
        error: "PLAN_LIMIT",
        kind: "companies",
        limit,
        used: next.length,
        field: "companies",
        message: `Your plan tracks up to ${limit} companies (${room} more can be added now). Remove ${
          newNames.length - room
        } or upgrade later from Billing.`,
      },
      { status: 402 },
    );
  }
  for (const inc of incoming) {
    const key = inc.name.toLowerCase();
    const prev = byName.get(key);
    if (prev) {
      if (inc.careersUrl && inc.careersUrl !== prev.careersUrl) {
        const idx = next.findIndex((c) => c.id === prev.id);
        const updated: CompanyProfile = {
          ...prev,
          careersUrl: inc.careersUrl,
          portalOk: true,
          updatedAt: now,
        };
        delete updated.portalIssue;
        next[idx] = updated;
      }
      continue;
    }
    const company: CompanyProfile = {
      id: uniqueId(inc.name, ids),
      name: inc.name,
      valuation: "",
      headcount: "",
      bangaloreArea: "",
      industry: "",
      careersUrl: inc.careersUrl,
      priority: "medium",
      notes: "",
      active: true,
      updatedAt: now,
    };
    if (company.careersUrl) company.portalOk = true;
    ids.add(company.id);
    byName.set(key, company);
    next.push(company);
  }
  next.sort((a, b) => a.name.localeCompare(b.name));

  const profile: UserProfile = {
    ...prevProfile,
    displayName: prevProfile.displayName || user.name,
    phone: prevProfile.phone ?? user.phone,
    resumeText: resumeText || prevProfile.resumeText,
    resumeMeta: resumeText
      ? {
          ...prevProfile.resumeMeta,
          charCount: resumeText.length,
          uploadedAt: now,
        }
      : prevProfile.resumeMeta,
    targetRoles: roleLabels.map(slugRole),
    locations,
    experienceLevel,
    updatedAt: now,
  };

  const projected =
    (await projectedBytesWithCompanies(user.id, next)) +
    new TextEncoder().encode(JSON.stringify(profile)).length;
  const quotaErr = await checkStorageQuota(user, projected);
  if (quotaErr) {
    return NextResponse.json(
      { ...quotaErr, field: "resumeText" },
      { status: 402 },
    );
  }

  const savedCompanies = await saveCompanies(user.id, next);
  if (!savedCompanies) {
    return NextResponse.json(
      { error: "Failed to save companies" },
      { status: 503 },
    );
  }
  const savedProfile = await saveProfile(user.id, profile);
  if (!savedProfile) {
    return NextResponse.json(
      { error: "Failed to save profile" },
      { status: 503 },
    );
  }
  await recomputeAndStoreUsage(user.id);
  const updated = await markOnboardingComplete(user.id);
  if (!updated) {
    return NextResponse.json(
      { error: "Failed to mark onboarding complete" },
      { status: 503 },
    );
  }

  return NextResponse.json({
    ok: true,
    user: toPublicUser(updated),
    companiesCount: next.length,
    targetRoles: profile.targetRoles,
  });
}
