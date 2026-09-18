import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import {
  checkStorageQuota,
  projectedBytesWithProfile,
  recomputeAndStoreUsage,
} from "@/lib/redis";
import { getProfile, saveProfile } from "@/lib/users";
import type { TargetRole, UserProfile } from "@/lib/types";

const MAX_RESUME_CHARS = 200_000;

function asString(v: unknown, fallback = ""): string {
  if (typeof v === "string") return v;
  return fallback;
}

export async function GET() {
  const user = await requireUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const profile = await getProfile(user.id);
  return NextResponse.json({ profile });
}

export async function PUT(request: Request) {
  const user = await requireUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: Record<string, unknown> = {};
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const prev = await getProfile(user.id);
  let resumeText = prev.resumeText;
  if ("resumeText" in body) {
    resumeText = asString(body.resumeText).slice(0, MAX_RESUME_CHARS);
  }

  const displayName =
    "displayName" in body
      ? asString(body.displayName).slice(0, 120)
      : prev.displayName;

  let targetRoles: TargetRole[] = prev.targetRoles;
  if ("targetRoles" in body) {
    if (!Array.isArray(body.targetRoles)) {
      return NextResponse.json(
        { error: "targetRoles must be an array" },
        { status: 400 },
      );
    }
    targetRoles = body.targetRoles
      .map((r, i) => {
        if (typeof r === "string") {
          const label = r.trim().slice(0, 80);
          if (!label) return null;
          return { id: `role-${i}-${label.toLowerCase().replace(/\s+/g, "-")}`, label };
        }
        if (r && typeof r === "object") {
          const obj = r as Record<string, unknown>;
          const label = asString(obj.label).trim().slice(0, 80);
          if (!label) return null;
          const id =
            asString(obj.id).slice(0, 64) ||
            `role-${i}-${label.toLowerCase().replace(/\s+/g, "-")}`;
          return { id, label };
        }
        return null;
      })
      .filter((x): x is TargetRole => x != null)
      .slice(0, 40);
  }

  let resumeMeta = prev.resumeMeta;
  if ("resumeMeta" in body && body.resumeMeta && typeof body.resumeMeta === "object") {
    const m = body.resumeMeta as Record<string, unknown>;
    resumeMeta = {
      fileName: asString(m.fileName).slice(0, 200) || undefined,
      mimeType: asString(m.mimeType).slice(0, 100) || undefined,
      uploadedAt: asString(m.uploadedAt) || new Date().toISOString(),
      charCount: resumeText.length,
    };
  } else if ("resumeText" in body) {
    resumeMeta = {
      ...prev.resumeMeta,
      charCount: resumeText.length,
      uploadedAt: new Date().toISOString(),
    };
  }

  const profile: UserProfile = {
    displayName,
    resumeText,
    resumeMeta,
    targetRoles,
    updatedAt: new Date().toISOString(),
  };

  const projected = await projectedBytesWithProfile(user.id, profile);
  const quotaErr = await checkStorageQuota(user, projected);
  if (quotaErr) {
    return NextResponse.json(quotaErr, { status: 402 });
  }

  const ok = await saveProfile(user.id, profile);
  if (!ok) {
    return NextResponse.json(
      { error: "Failed to save profile — Redis required" },
      { status: 503 },
    );
  }
  await recomputeAndStoreUsage(user.id);
  return NextResponse.json({ profile });
}
