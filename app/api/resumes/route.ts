import { NextResponse } from "next/server";
import { requireResumesUser } from "@/lib/resume-guard";
import {
  MAX_RESUMES,
  cloneResume,
  countResumes,
  getResume,
  listResumes,
  sanitizeResume,
  saveResume,
} from "@/lib/resumes";
import { getApplyItem, updateApplyItems } from "@/lib/apply";

export const dynamic = "force-dynamic";

/** GET /api/resumes — list the caller's resume versions. */
export async function GET() {
  const g = await requireResumesUser();
  if ("res" in g) return g.res;
  return NextResponse.json({ resumes: await listResumes(g.user.id) });
}

/**
 * POST /api/resumes
 *  { action: "create", resume?: Partial<ResumeDoc> }
 *  { action: "duplicate", fromId }
 *  { action: "generate", baseId, name?, jdText?, jobId?, applyItemId? }
 *    → new tailored copy with status "draft_requested"; the assistant fills
 *      it via /api/ingest/resumes (no LLM key in this app).
 */
export async function POST(req: Request) {
  const g = await requireResumesUser();
  if ("res" in g) return g.res;
  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  if ((await countResumes(g.user.id)) >= MAX_RESUMES) {
    return NextResponse.json({ error: `Limit of ${MAX_RESUMES} resumes reached` }, { status: 400 });
  }
  const action = body.action;
  let doc;
  if (action === "duplicate" || action === "generate") {
    const srcId = String(action === "duplicate" ? body.fromId : body.baseId);
    const src = await getResume(g.user.id, srcId);
    if (!src) return NextResponse.json({ error: "Source resume not found" }, { status: 404 });
    if (action === "duplicate") {
      doc = cloneResume(src, { name: `${src.name} (copy)` });
    } else {
      const jdText = typeof body.jdText === "string" ? body.jdText.slice(0, 20000) : undefined;
      const applyItemId =
        typeof body.applyItemId === "string" && body.applyItemId ? body.applyItemId : undefined;
      let name = typeof body.name === "string" && body.name.trim() ? body.name.trim().slice(0, 200) : "";
      if (!name && applyItemId) {
        const it = await getApplyItem(g.user.id, applyItemId);
        if (it) name = `${it.company} — ${it.role}`;
      }
      doc = cloneResume(src, {
        name: name || `${src.name} — tailored`,
        kind: "tailored",
        status: "draft_requested",
        baseId: src.id,
        jdText,
        jobId: typeof body.jobId === "string" ? body.jobId : undefined,
        applyItemId,
        notes: undefined,
        rawText: undefined,
        sourceFileName: undefined,
      });
      if (applyItemId) await updateApplyItems(g.user.id, [{ id: applyItemId, resumeId: doc.id }]);
    }
  } else {
    doc = sanitizeResume(body.resume ?? {});
    doc.id = crypto.randomUUID();
  }
  if (!(await saveResume(g.user.id, doc))) {
    return NextResponse.json({ error: "Save failed" }, { status: 503 });
  }
  return NextResponse.json({ ok: true, resume: doc });
}
