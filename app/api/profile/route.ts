import { NextResponse } from "next/server";
import { requireUser, toPublicUser } from "@/lib/auth";
import {
  checkStorageQuota,
  projectedBytesWithProfile,
  recomputeAndStoreUsage,
} from "@/lib/redis";
import { getProfile, saveProfile, updateUserFields } from "@/lib/users";
import type { ExperienceLevel, TargetRole, UserProfile } from "@/lib/types";
import { EXPERIENCE_LEVELS } from "@/lib/types";

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
  return NextResponse.json({
    profile: {
      ...profile,
      phone: profile.phone ?? user.phone ?? "",
      displayName: profile.displayName || user.name,
    },
    user: toPublicUser(user),
  });
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

  let locations = prev.locations ?? [];
  if ("locations" in body) {
    if (!Array.isArray(body.locations)) {
      return NextResponse.json(
        { error: "locations must be an array of strings" },
        { status: 400 },
      );
    }
    const seen = new Set<string>();
    locations = body.locations
      .map((l) => (typeof l === "string" ? l.trim().slice(0, 60) : ""))
      .filter((l) => {
        if (!l) return false;
        const k = l.toLowerCase();
        if (seen.has(k)) return false;
        seen.add(k);
        return true;
      })
      .slice(0, 10);
  }

  let experienceLevel = prev.experienceLevel;
  if ("experienceLevel" in body) {
    const v = body.experienceLevel;
    if (v == null || v === "") {
      experienceLevel = undefined;
    } else if (
      typeof v === "string" &&
      EXPERIENCE_LEVELS.some((e) => e.id === v)
    ) {
      experienceLevel = v as ExperienceLevel;
    } else {
      return NextResponse.json(
        { error: "Invalid experienceLevel" },
        { status: 400 },
      );
    }
  }

  let phone = prev.phone ?? user.phone ?? "";
  if ("phone" in body) {
    phone = asString(body.phone).trim().slice(0, 40);
  }

  // Prefer User record for name/phone so admin table sees them
  if ("displayName" in body || "phone" in body) {
    await updateUserFields(user.id, {
      name: displayName || user.name,
      phone,
    });
  }

  const profile: UserProfile = {
    displayName,
    phone: phone || undefined,
    resumeText,
    resumeMeta,
    targetRoles,
    locations,
    experienceLevel,
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
  return NextResponse.json({
    profile,
    user: toPublicUser({ ...user, name: displayName || user.name, phone: phone || undefined }),
  });
}
