import { NextResponse } from "next/server";
import { requireResumesUser } from "@/lib/resume-guard";
import {
  ACCEPTED_RESUME_EXTENSIONS,
  MAX_RESUME_UPLOAD_BYTES,
  detectResumeKind,
} from "@/lib/resume-limits";
import { extractResumeText } from "@/lib/resume-extract";
import {
  MAX_RESUMES,
  countResumes,
  roughStructure,
  sanitizeResume,
  saveResume,
} from "@/lib/resumes";

export const dynamic = "force-dynamic";

/**
 * POST /api/resumes/upload (multipart: file, name?, track?)
 * Stores extracted text + a rough structure in Redis (no file blob storage).
 */
export async function POST(req: Request) {
  const g = await requireResumesUser();
  if ("res" in g) return g.res;
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: "Expected multipart/form-data" }, { status: 400 });
  }
  const file = form.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return NextResponse.json({ error: "No file provided" }, { status: 400 });
  }
  if (file.size > MAX_RESUME_UPLOAD_BYTES) {
    return NextResponse.json(
      { error: `File too large — max ${Math.round(MAX_RESUME_UPLOAD_BYTES / 1024)} KB` },
      { status: 413 },
    );
  }
  if (!detectResumeKind(file.name, file.type)) {
    return NextResponse.json(
      { error: `Unsupported type. Use ${ACCEPTED_RESUME_EXTENSIONS.join(", ")}` },
      { status: 400 },
    );
  }
  if ((await countResumes(g.user.id)) >= MAX_RESUMES) {
    return NextResponse.json({ error: `Limit of ${MAX_RESUMES} resumes reached` }, { status: 400 });
  }
  const buffer = Buffer.from(await file.arrayBuffer());
  const ex = await extractResumeText(buffer, file.name, file.type);
  if (!ex.ok) return NextResponse.json({ error: ex.error }, { status: 422 });
  const text = ex.text.trim();
  if (!text) return NextResponse.json({ error: "No readable text in file" }, { status: 422 });
  const rough = roughStructure(text);
  const name =
    (typeof form.get("name") === "string" && String(form.get("name")).trim()) ||
    file.name.replace(/\.[^.]+$/, "");
  const doc = sanitizeResume({
    name,
    track: typeof form.get("track") === "string" ? form.get("track") : "",
    kind: "base",
    status: "ready",
    contact: rough.contact,
    summary: rough.summary,
    rawText: text,
    sourceFileName: file.name,
    notes: "Uploaded — extracted text is attached; structure the sections in the editor (or ask your assistant).",
  });
  if (!(await saveResume(g.user.id, doc))) {
    return NextResponse.json({ error: "Save failed" }, { status: 503 });
  }
  return NextResponse.json({ ok: true, resume: doc });
}
