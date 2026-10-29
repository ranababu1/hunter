import { NextResponse } from "next/server";
import { hasApplyAddon, requireUser } from "@/lib/auth";
import { decideApplyItem, getApplyItems } from "@/lib/apply";

export const dynamic = "force-dynamic";

/** GET /api/apply — session user's Apply items (add-on required). */
export async function GET() {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasApplyAddon(user)) {
    return NextResponse.json({ error: "ADDON_REQUIRED", addon: "apply" }, { status: 402 });
  }
  const items = await getApplyItems(user.id);
  return NextResponse.json({ items });
}

/** PATCH /api/apply — Body: { id, decision: "yes" | "no" | null } */
export async function PATCH(req: Request) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasApplyAddon(user)) {
    return NextResponse.json({ error: "ADDON_REQUIRED", addon: "apply" }, { status: 402 });
  }
  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const id = typeof body.id === "string" ? body.id : "";
  const d = body.decision;
  if (!id || !(d === "yes" || d === "no" || d === null)) {
    return NextResponse.json(
      { error: "id and decision (yes|no|null) required" },
      { status: 400 },
    );
  }
  const item = await decideApplyItem(user.id, id, d);
  if (!item) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ ok: true, item });
}
