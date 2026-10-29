import { randomUUID } from "crypto";
import { getRedis } from "./users";
import { u } from "./keys";
import { invalidateUser } from "./cache";
import type {
  ResumeContact,
  ResumeDoc,
  ResumeExperience,
  ResumeSkillGroup,
  ResumeStatus,
} from "./types";

const STATUSES: ResumeStatus[] = ["ready", "draft_requested", "draft_ready"];
export const MAX_RESUMES = 100;

function s(v: unknown, max = 4000): string {
  return typeof v === "string" ? v.trim().slice(0, max) : "";
}
function opt(v: unknown, max = 4000): string | undefined {
  const x = s(v, max);
  return x || undefined;
}
function strArr(v: unknown, max = 1000, n = 200): string[] {
  return Array.isArray(v)
    ? v
        .filter((x): x is string => typeof x === "string")
        .map((x) => x.trim().slice(0, max))
        .filter(Boolean)
        .slice(0, n)
    : [];
}

function sanitizeContact(v: unknown): ResumeContact {
  const o = (v && typeof v === "object" ? v : {}) as Record<string, unknown>;
  return {
    name: s(o.name, 200),
    headline: opt(o.headline, 300),
    email: opt(o.email, 200),
    phone: opt(o.phone, 60),
    linkedin: opt(o.linkedin, 300),
    website: opt(o.website, 300),
    location: opt(o.location, 200),
  };
}

function sanitizeExperience(v: unknown): ResumeExperience[] {
  if (!Array.isArray(v)) return [];
  return v.slice(0, 40).map((raw) => {
    const o = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
    return {
      id: s(o.id, 80) || randomUUID(),
      company: s(o.company, 200),
      title: s(o.title, 200),
      location: opt(o.location, 200),
      start: s(o.start, 40),
      end: s(o.end, 40),
      bullets: strArr(o.bullets, 1500, 40),
    };
  });
}

function sanitizeSkills(v: unknown): ResumeSkillGroup[] {
  if (!Array.isArray(v)) return [];
  return v.slice(0, 30).map((raw) => {
    const o = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
    return { group: s(o.group, 120), items: strArr(o.items, 120, 80) };
  });
}

/** Normalise any incoming resume payload (from UI or assistant ingest). */
export function sanitizeResume(
  raw: unknown,
  prev?: ResumeDoc | null,
): ResumeDoc {
  const o = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const now = new Date().toISOString();
  const has = (k: string) => Object.prototype.hasOwnProperty.call(o, k);
  return {
    id: prev?.id ?? (s(o.id, 80) || randomUUID()),
    name: has("name") ? s(o.name, 200) || "Untitled resume" : (prev?.name ?? "Untitled resume"),
    track: has("track") ? s(o.track, 200) : (prev?.track ?? ""),
    tags: has("tags") ? strArr(o.tags, 60, 20) : (prev?.tags ?? []),
    kind: has("kind")
      ? o.kind === "tailored"
        ? "tailored"
        : "base"
      : (prev?.kind ?? "base"),
    status:
      has("status") && STATUSES.includes(o.status as ResumeStatus)
        ? (o.status as ResumeStatus)
        : (prev?.status ?? "ready"),
    baseId: has("baseId") ? opt(o.baseId, 80) : prev?.baseId,
    jobId: has("jobId") ? opt(o.jobId, 200) : prev?.jobId,
    applyItemId: has("applyItemId") ? opt(o.applyItemId, 200) : prev?.applyItemId,
    jdText: has("jdText") ? opt(o.jdText, 20000) : prev?.jdText,
    contact: has("contact") ? sanitizeContact(o.contact) : (prev?.contact ?? { name: "" }),
    summary: has("summary") ? s(o.summary, 4000) : (prev?.summary ?? ""),
    experience: has("experience") ? sanitizeExperience(o.experience) : (prev?.experience ?? []),
    skills: has("skills") ? sanitizeSkills(o.skills) : (prev?.skills ?? []),
    certifications: has("certifications")
      ? strArr(o.certifications, 300, 40)
      : (prev?.certifications ?? []),
    education: has("education") ? strArr(o.education, 300, 20) : (prev?.education ?? []),
    rawText: has("rawText") ? opt(o.rawText, 60000) : prev?.rawText,
    sourceFileName: has("sourceFileName") ? opt(o.sourceFileName, 200) : prev?.sourceFileName,
    notes: has("notes") ? opt(o.notes, 8000) : prev?.notes,
    createdAt: prev?.createdAt ?? now,
    updatedAt: now,
  };
}

function parse(raw: unknown): ResumeDoc | null {
  if (raw == null) return null;
  try {
    const v = typeof raw === "string" ? JSON.parse(raw) : raw;
    return v && typeof v === "object" && typeof (v as ResumeDoc).id === "string"
      ? (v as ResumeDoc)
      : null;
  } catch {
    return null;
  }
}

export async function listResumes(userId: string): Promise<ResumeDoc[]> {
  const redis = getRedis();
  if (!redis) return [];
  try {
    const all = await redis.hgetall<Record<string, unknown>>(u(userId).resumes);
    if (!all) return [];
    return Object.values(all)
      .map(parse)
      .filter((x): x is ResumeDoc => x != null)
      .sort(
        (a, b) =>
          (a.kind === b.kind ? 0 : a.kind === "base" ? -1 : 1) ||
          b.updatedAt.localeCompare(a.updatedAt),
      );
  } catch (err) {
    console.warn("[hunter] listResumes failed:", err);
    return [];
  }
}

export async function getResume(userId: string, id: string): Promise<ResumeDoc | null> {
  const redis = getRedis();
  if (!redis) return null;
  try {
    return parse(await redis.hget(u(userId).resumes, id));
  } catch {
    return null;
  }
}

export async function saveResume(userId: string, doc: ResumeDoc): Promise<boolean> {
  const redis = getRedis();
  if (!redis) return false;
  try {
    await redis.hset(u(userId).resumes, { [doc.id]: JSON.stringify(doc) });
    invalidateUser(userId);
    return true;
  } catch (err) {
    console.warn("[hunter] saveResume failed:", err);
    return false;
  }
}

export async function deleteResume(userId: string, id: string): Promise<boolean> {
  const redis = getRedis();
  if (!redis) return false;
  try {
    const n = await redis.hdel(u(userId).resumes, id);
    invalidateUser(userId);
    return n > 0;
  } catch {
    return false;
  }
}

export async function countResumes(userId: string): Promise<number> {
  const redis = getRedis();
  if (!redis) return 0;
  try {
    return await redis.hlen(u(userId).resumes);
  } catch {
    return 0;
  }
}

/** Copy a resume into a new id (used by Duplicate and Generate). */
export function cloneResume(
  src: ResumeDoc,
  over: Partial<ResumeDoc>,
): ResumeDoc {
  const now = new Date().toISOString();
  return {
    ...src,
    experience: src.experience.map((e) => ({ ...e, bullets: [...e.bullets] })),
    skills: src.skills.map((g) => ({ ...g, items: [...g.items] })),
    certifications: [...src.certifications],
    education: [...src.education],
    tags: [...src.tags],
    ...over,
    id: randomUUID(),
    createdAt: now,
    updatedAt: now,
  };
}

/** Very light text → structure guess for uploads; the user/assistant refines it. */
export function roughStructure(text: string): Pick<ResumeDoc, "summary" | "contact"> {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  const email = /[\w.+-]+@[\w-]+\.[\w.]+/.exec(text)?.[0];
  const phone = /(\+?\d[\d\s-]{8,}\d)/.exec(text)?.[0];
  const linkedin = /linkedin\.com\/in\/[\w-]+/i.exec(text)?.[0];
  return {
    contact: {
      name: lines[0]?.slice(0, 120) ?? "",
      email,
      phone,
      linkedin,
    },
    summary: "",
  };
}
