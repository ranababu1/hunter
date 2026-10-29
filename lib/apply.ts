import { getRedis } from "./users";
import { u } from "./keys";
import { invalidateUser } from "./cache";
import type {
  ApplyDecision,
  ApplyItem,
  ApplyStatus,
  MatchLevel,
} from "./types";
import { APPLY_STATUSES } from "./types";

const STATUS_IDS = APPLY_STATUSES.map((s) => s.id);
const MATCHES: MatchLevel[] = ["Strong Match", "Good Match", "Possible Match"];

export function isApplyStatus(v: unknown): v is ApplyStatus {
  return typeof v === "string" && (STATUS_IDS as string[]).includes(v);
}

function str(v: unknown, max = 4000): string | undefined {
  return typeof v === "string" && v.trim() ? v.trim().slice(0, max) : undefined;
}

function parseItem(raw: unknown): ApplyItem | null {
  if (raw == null) return null;
  try {
    const v = typeof raw === "string" ? JSON.parse(raw) : raw;
    if (v && typeof v === "object" && typeof (v as ApplyItem).id === "string") {
      return v as ApplyItem;
    }
  } catch {
    /* ignore */
  }
  return null;
}

function sortItems(items: ApplyItem[]): ApplyItem[] {
  const rank: Record<string, number> = {
    "Strong Match": 0,
    "Good Match": 1,
    "Possible Match": 2,
  };
  return items.sort(
    (a, b) =>
      (a.priority ?? 999) - (b.priority ?? 999) ||
      (rank[a.match] ?? 9) - (rank[b.match] ?? 9) ||
      b.createdAt.localeCompare(a.createdAt),
  );
}

export async function getApplyItems(userId: string): Promise<ApplyItem[]> {
  const redis = getRedis();
  if (!redis) return [];
  try {
    const all = await redis.hgetall<Record<string, unknown>>(u(userId).apply);
    if (!all) return [];
    return sortItems(
      Object.values(all)
        .map(parseItem)
        .filter((x): x is ApplyItem => x != null),
    );
  } catch (err) {
    console.warn("[hunter] getApplyItems failed:", err);
    return [];
  }
}

export async function getApplyItem(
  userId: string,
  id: string,
): Promise<ApplyItem | null> {
  const redis = getRedis();
  if (!redis) return null;
  try {
    return parseItem(await redis.hget(u(userId).apply, id));
  } catch {
    return null;
  }
}

async function saveItems(userId: string, items: ApplyItem[]): Promise<boolean> {
  if (!items.length) return true;
  const redis = getRedis();
  if (!redis) return false;
  try {
    const rec: Record<string, string> = {};
    for (const it of items) rec[it.id] = JSON.stringify(it);
    await redis.hset(u(userId).apply, rec);
    invalidateUser(userId);
    return true;
  } catch (err) {
    console.warn("[hunter] saveApplyItems failed:", err);
    return false;
  }
}

export async function deleteApplyItems(
  userId: string,
  ids: string[],
): Promise<number> {
  const redis = getRedis();
  if (!redis || !ids.length) return 0;
  try {
    const n = await redis.hdel(u(userId).apply, ...ids);
    invalidateUser(userId);
    return n;
  } catch {
    return 0;
  }
}

/**
 * Assistant-side upsert. New items start pending/undecided. Existing items
 * keep the user's decision and status unless the payload sets status.
 */
export async function upsertApplyItems(
  userId: string,
  raws: unknown[],
): Promise<{ saved: ApplyItem[]; rejected: { index: number; error: string }[] }> {
  const now = new Date().toISOString();
  const existing = new Map(
    (await getApplyItems(userId)).map((i) => [i.id, i] as const),
  );
  const saved: ApplyItem[] = [];
  const rejected: { index: number; error: string }[] = [];
  raws.forEach((raw, index) => {
    if (!raw || typeof raw !== "object") {
      rejected.push({ index, error: "item must be an object" });
      return;
    }
    const r = raw as Record<string, unknown>;
    const id = str(r.id, 200) ?? str(r.jobId, 200);
    if (!id) {
      rejected.push({ index, error: "id (or jobId) required" });
      return;
    }
    const prev = existing.get(id);
    const company = str(r.company, 200) ?? prev?.company;
    const role = str(r.role, 300) ?? prev?.role;
    const url = str(r.url, 2000) ?? prev?.url;
    if (!company || !role || !url) {
      rejected.push({ index, error: "company, role and url required for new items" });
      return;
    }
    if (r.status !== undefined && !isApplyStatus(r.status)) {
      rejected.push({ index, error: `invalid status ${String(r.status)}` });
      return;
    }
    const match = MATCHES.includes(r.match as MatchLevel)
      ? (r.match as MatchLevel)
      : (prev?.match ?? "Possible Match");
    const gaps = Array.isArray(r.gaps)
      ? r.gaps.filter((g): g is string => typeof g === "string").map((g) => g.slice(0, 500))
      : (prev?.gaps ?? []);
    const status: ApplyStatus = (r.status as ApplyStatus) ?? prev?.status ?? "pending";
    const item: ApplyItem = {
      id,
      jobId: str(r.jobId, 200) ?? prev?.jobId,
      company,
      role,
      location: str(r.location, 200) ?? prev?.location,
      url,
      match,
      priority:
        typeof r.priority === "number" && Number.isFinite(r.priority)
          ? r.priority
          : prev?.priority,
      whyRecommended: str(r.whyRecommended) ?? prev?.whyRecommended ?? "",
      gaps,
      resume: str(r.resume, 300) ?? prev?.resume,
      tailoringNotes: str(r.tailoringNotes) ?? prev?.tailoringNotes,
      assistantNotes: str(r.assistantNotes) ?? prev?.assistantNotes,
      resumeId: str(r.resumeId, 200) ?? prev?.resumeId,
      status,
      decision: prev?.decision ?? null,
      decidedAt: prev?.decidedAt,
      appliedAt:
        status === "applied" ? (prev?.appliedAt ?? now) : prev?.appliedAt,
      createdAt: prev?.createdAt ?? now,
      updatedAt: now,
    };
    saved.push(item);
  });
  const ok = await saveItems(userId, saved);
  if (!ok) return { saved: [], rejected: [{ index: -1, error: "Redis write failed" }] };
  return { saved, rejected };
}

/** Assistant-side status/notes update for existing items. */
export async function updateApplyItems(
  userId: string,
  updates: unknown[],
): Promise<{ updated: ApplyItem[]; errors: { id?: string; error: string }[] }> {
  const now = new Date().toISOString();
  const updated: ApplyItem[] = [];
  const errors: { id?: string; error: string }[] = [];
  for (const raw of updates) {
    const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
    const id = str(r.id, 200);
    if (!id) {
      errors.push({ error: "id required" });
      continue;
    }
    const item = await getApplyItem(userId, id);
    if (!item) {
      errors.push({ id, error: "not found" });
      continue;
    }
    if (r.status !== undefined) {
      if (!isApplyStatus(r.status)) {
        errors.push({ id, error: `invalid status ${String(r.status)}` });
        continue;
      }
      item.status = r.status;
      if (r.status === "applied" && !item.appliedAt) item.appliedAt = now;
    }
    if (typeof r.assistantNotes === "string") item.assistantNotes = r.assistantNotes.slice(0, 4000);
    if (typeof r.tailoringNotes === "string") item.tailoringNotes = r.tailoringNotes.slice(0, 4000);
    if (typeof r.resume === "string") item.resume = r.resume.slice(0, 300);
    if (typeof r.resumeId === "string") item.resumeId = r.resumeId.slice(0, 200) || undefined;
    item.updatedAt = now;
    updated.push(item);
  }
  await saveItems(userId, updated);
  return { updated, errors };
}

/** User-side Yes/No. Yes → approved, No → skipped, null → back to pending. */
export async function decideApplyItem(
  userId: string,
  id: string,
  decision: ApplyDecision,
): Promise<ApplyItem | null> {
  const item = await getApplyItem(userId, id);
  if (!item) return null;
  const now = new Date().toISOString();
  item.decision = decision;
  item.decidedAt = decision ? now : undefined;
  // Don't rewind items the assistant is already working on / finished.
  const locked: ApplyStatus[] = ["applying", "applied", "already_in_touch"];
  if (!locked.includes(item.status)) {
    item.status =
      decision === "yes" ? "approved" : decision === "no" ? "skipped" : "pending";
  }
  item.updatedAt = now;
  const ok = await saveItems(userId, [item]);
  return ok ? item : null;
}
