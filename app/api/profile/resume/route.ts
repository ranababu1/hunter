import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { getProfile, saveProfile } from "@/lib/users";
import {
  checkStorageQuota,
  projectedBytesWithProfile,
  recomputeAndStoreUsage,
} from "@/lib/redis";
import {
  ACCEPTED_RESUME_EXTENSIONS,
  MAX_RESUME_UPLOAD_BYTES,
  detectResumeKind,
} from "@/lib/resume-limits";
import { extractResumeText } from "@/lib/resume-extract";
import type { UserProfile } from "@/lib/types";

const MAX_RESUME_CHARS = 200_000;

/**
 * POST /api/profile/resume — upload a resume FILE (pdf/doc/docx/txt),
 * extract its text server-side, and save it onto the caller's own profile.
 * Hard-capped at 500 KB; oversized or unsupported files are rejected before
 * any parsing is attempted.
 */
export async function POST(request: Request) {
  const user = await requireUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json(
      { error: "Expected multipart/form-data with a `file` field" },
      { status: 400 },
    );
  }

  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "No file provided" }, { status: 400 });
  }

  if (file.size === 0) {
    return NextResponse.json({ error: "File is empty" }, { status: 400 });
  }
  if (file.size > MAX_RESUME_UPLOAD_BYTES) {
    return NextResponse.json(
      {
        error: `File is too large — resumes are capped at ${Math.round(
          MAX_RESUME_UPLOAD_BYTES / 1024,
        )} KB. This one is ${Math.ceil(file.size / 1024)} KB.`,
      },
      { status: 413 },
    );
  }

  const kind = detectResumeKind(file.name, file.type);
  if (!kind) {
    return NextResponse.json(
      {
        error: `Unsupported file type. Upload one of: ${ACCEPTED_RESUME_EXTENSIONS.join(", ")}.`,
      },
      { status: 400 },
    );
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const extracted = await extractResumeText(buffer, file.name, file.type);
  if (!extracted.ok) {
    return NextResponse.json({ error: extracted.error }, { status: 422 });
  }

  const resumeText = extracted.text.trim().slice(0, MAX_RESUME_CHARS);
  if (!resumeText) {
    return NextResponse.json(
      {
        error:
          "No readable text found in this file — it may be a scanned image without selectable text.",
      },
      { status: 422 },
    );
  }

  const prev = await getProfile(user.id);
  const profile: UserProfile = {
    ...prev,
    resumeText,
    resumeMeta: {
      fileName: file.name.slice(0, 200),
      mimeType: file.type || `application/${kind}`,
      uploadedAt: new Date().toISOString(),
      charCount: resumeText.length,
    },
    updatedAt: new Date().toISOString(),
  };

  const projected = await projectedBytesWithProfile(user.id, profile);
  const quotaErr = await checkStorageQuota(user, projected);
  if (quotaErr) {
    return NextResponse.json(quotaErr, { status: 402 });
  }

  const saved = await saveProfile(user.id, profile);
  if (!saved) {
    return NextResponse.json(
      { error: "Failed to save profile — Redis required" },
      { status: 503 },
    );
  }
  await recomputeAndStoreUsage(user.id);

  return NextResponse.json({ profile });
}
