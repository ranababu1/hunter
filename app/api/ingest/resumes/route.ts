import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { resolveIngestUser } from "@/lib/ingest-auth";
import { hasResumesAddon } from "@/lib/auth";
import { getRedis } from "@/lib/users";
import {
  deleteResume,
  getResume,
  listResumes,
  sanitizeResume,
  saveResume,
} from "@/lib/resumes";
import { updateApplyItems } from "@/lib/apply";
import type { ResumeDoc } from "@/lib/types";

export const dynamic = "force-dynamic";

async function auth(req: NextRequest, email?: string) {
  const r = await resolveIngestUser(req, email);
  if ("error" in r) return { res: NextResponse.json({ error: r.error }, { status: r.status }) };
  if (!getRedis()) return { res: NextResponse.json({ error: "Redis required" }, { status: 503 }) };
  if (!hasResumesAddon(r.user)) {
    return {
      res: NextResponse.json({ error: "Resume Manager add-on not enabled for this user" }, { status: 403 }),
    };
  }
  return { user: r.user };
}

/**
 * GET /api/ingest/resumes?email=…&status=draft_requested&id=…
 * Assistant reads resumes (e.g. pending tailoring requests with their JD + base).
 */
export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const a = await auth(req, sp.get("email") ?? undefined);
  if ("res" in a) return a.res;
  const id = sp.get("id");
  if (id) {
    const doc = await getResume(a.user.id, id);
    return doc
      ? NextResponse.json({ ok: true, resume: doc })
      : NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const status = sp.get("status");
  let list = await listResumes(a.user.id);
  if (status) list = list.filter((r) => r.status === status);
  return NextResponse.json({ ok: true, userId: a.user.id, count: list.length, resumes: list });
}

/**
 * POST /api/ingest/resumes — upsert resumes.
 * Body: { email?, resumes: Partial<ResumeDoc>[] }  (id optional; existing id = partial update)
 * Filling a draft: send { id, status: "draft_ready", summary, experience, skills, …, notes }.
 * If applyItemId is set, the Apply item gets resumeId linked.
 */
export async function POST(req: NextRequest) {
  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const a = await auth(req, typeof body.email === "string" ? body.email : undefined);
  if ("res" in a) return a.res;
  if (!Array.isArray(body.resumes)) {
    return NextResponse.json({ error: "resumes must be an array" }, { status: 400 });
  }
  const saved: ResumeDoc[] = [];
  const errors: { index: number; error: string }[] = [];
  for (let i = 0; i < body.resumes.length; i++) {
    const raw = body.resumes[i] as Record<string, unknown>;
    const id = raw && typeof raw.id === "string" ? raw.id : undefined;
    const prev = id ? await getResume(a.user.id, id) : null;
    const doc = sanitizeResume(raw, prev);
    if (!(await saveResume(a.user.id, doc))) {
      errors.push({ index: i, error: "save failed" });
      continue;
    }
    if (doc.applyItemId) {
      await updateApplyItems(a.user.id, [{ id: doc.applyItemId, resumeId: doc.id }]);
    }
    saved.push(doc);
  }
  return NextResponse.json({
    ok: errors.length === 0,
    saved: saved.map((d) => ({ id: d.id, name: d.name, status: d.status, kind: d.kind })),
    errors,
  });
}

/** DELETE /api/ingest/resumes — Body: { email?, ids: string[] } */
export async function DELETE(req: NextRequest) {
  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const a = await auth(req, typeof body.email === "string" ? body.email : undefined);
  if ("res" in a) return a.res;
  const ids = Array.isArray(body.ids) ? body.ids.filter((x): x is string => typeof x === "string") : [];
  let removed = 0;
  for (const id of ids) if (await deleteResume(a.user.id, id)) removed++;
  return NextResponse.json({ ok: true, removed });
}
