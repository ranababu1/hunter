import { NextResponse } from "next/server";
import { isAdminEmail, requireUser } from "@/lib/auth";
import {
  adminUpdateUser,
  deleteUser,
  getBilling,
  getUserById,
} from "@/lib/users";
import { resolveEntitlements } from "@/lib/plans";
import type { AdminUserPatch } from "@/lib/users";
import type { CompanyPlanId, StoragePlanId } from "@/lib/types";

const COMPANY_PLAN_IDS: CompanyPlanId[] = [
  "free",
  "cos_20",
  "cos_45",
  "cos_100",
  "unlimited",
];
const STORAGE_PLAN_IDS: StoragePlanId[] = ["free", "plus", "unlimited"];

async function requireAdmin() {
  const user = await requireUser();
  if (!user) return { error: "Unauthorized", status: 401 as const };
  const ent = resolveEntitlements(user.role, await getBilling(user.id));
  if (!ent.isAdmin) return { error: "Forbidden", status: 403 as const };
  return { user };
}

/** PATCH /api/admin/users/[id] — edit another tenant's name/phone/role/plan. */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const guard = await requireAdmin();
  if ("error" in guard) {
    return NextResponse.json({ error: guard.error }, { status: guard.status });
  }
  const { id } = await params;

  let body: Record<string, unknown> = {};
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const patch: AdminUserPatch = {};
  if (typeof body.name === "string") patch.name = body.name;
  if (typeof body.phone === "string") patch.phone = body.phone;
  if (body.role !== undefined) {
    if (body.role !== "user" && body.role !== "admin") {
      return NextResponse.json({ error: "role must be user or admin" }, { status: 400 });
    }
    patch.role = body.role;
  }
  if (body.companyPlan !== undefined) {
    if (!COMPANY_PLAN_IDS.includes(body.companyPlan as CompanyPlanId)) {
      return NextResponse.json({ error: "Invalid companyPlan" }, { status: 400 });
    }
    patch.companyPlan = body.companyPlan as CompanyPlanId;
  }
  if (body.storagePlan !== undefined) {
    if (!STORAGE_PLAN_IDS.includes(body.storagePlan as StoragePlanId)) {
      return NextResponse.json({ error: "Invalid storagePlan" }, { status: 400 });
    }
    patch.storagePlan = body.storagePlan as StoragePlanId;
  }
  if (body.isSpecialFriend !== undefined) {
    if (typeof body.isSpecialFriend !== "boolean") {
      return NextResponse.json({ error: "isSpecialFriend must be boolean" }, { status: 400 });
    }
    patch.isSpecialFriend = body.isSpecialFriend;
  }

  const result = await adminUpdateUser(id, patch, isAdminEmail);
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }
  return NextResponse.json({ ok: true });
}

/** DELETE /api/admin/users/[id] — permanently remove a tenant and its data. */
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const guard = await requireAdmin();
  if ("error" in guard) {
    return NextResponse.json({ error: guard.error }, { status: guard.status });
  }
  const { id } = await params;

  if (id === guard.user.id) {
    return NextResponse.json(
      { error: "You cannot delete your own account" },
      { status: 400 },
    );
  }

  const target = await getUserById(id);
  if (!target) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }
  if (target.role === "admin" || isAdminEmail(target.email)) {
    return NextResponse.json(
      { error: "Cannot delete an admin account" },
      { status: 400 },
    );
  }

  const ok = await deleteUser(id);
  if (!ok) {
    return NextResponse.json(
      { error: "Failed to delete user — Redis required" },
      { status: 503 },
    );
  }
  return NextResponse.json({ ok: true });
}
