import { NextResponse } from "next/server";
import { requireResumesUser } from "@/lib/resume-guard";
import { deleteResume, getResume, sanitizeResume, saveResume } from "@/lib/resumes";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: Request, { params }: Ctx) {
  const g = await requireResumesUser();
  if ("res" in g) return g.res;
  const { id } = await params;
  const doc = await getResume(g.user.id, id);
  if (!doc) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ resume: doc });
}

/** PATCH /api/resumes/[id] — partial update; any ResumeDoc field. */
export async function PATCH(req: Request, { params }: Ctx) {
  const g = await requireResumesUser();
  if ("res" in g) return g.res;
  const { id } = await params;
  const prev = await getResume(g.user.id, id);
  if (!prev) return NextResponse.json({ error: "Not found" }, { status: 404 });
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const doc = sanitizeResume(body, prev);
  if (!(await saveResume(g.user.id, doc))) {
    return NextResponse.json({ error: "Save failed" }, { status: 503 });
  }
  return NextResponse.json({ ok: true, resume: doc });
}

export async function DELETE(_req: Request, { params }: Ctx) {
  const g = await requireResumesUser();
  if ("res" in g) return g.res;
  const { id } = await params;
  const ok = await deleteResume(g.user.id, id);
  return NextResponse.json({ ok }, { status: ok ? 200 : 404 });
}
