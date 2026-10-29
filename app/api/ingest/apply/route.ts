import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { resolveIngestUser } from "@/lib/ingest-auth";
import { hasApplyAddon } from "@/lib/auth";
import { getRedis } from "@/lib/users";
import {
  deleteApplyItems,
  getApplyItems,
  isApplyStatus,
  updateApplyItems,
  upsertApplyItems,
} from "@/lib/apply";

export const dynamic = "force-dynamic";

async function auth(req: NextRequest, email?: string) {
  const r = await resolveIngestUser(req, email);
  if ("error" in r) {
    return { res: NextResponse.json({ error: r.error }, { status: r.status }) };
  }
  if (!getRedis()) {
    return { res: NextResponse.json({ error: "Redis required" }, { status: 503 }) };
  }
  if (!hasApplyAddon(r.user)) {
    return {
      res: NextResponse.json(
        { error: "Apply add-on not enabled for this user" },
        { status: 403 },
      ),
    };
  }
  return { user: r.user };
}

async function readBody(req: NextRequest): Promise<Record<string, unknown> | null> {
  try {
    const b = await req.json();
    return b && typeof b === "object" ? (b as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

/**
 * GET /api/ingest/apply?email=…&status=approved[,needs_you]&decision=yes
 * Assistant reads items (default: all). Bearer HUNTER_INGEST_SECRET.
 */
export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const a = await auth(req, sp.get("email") ?? undefined);
  if ("res" in a) return a.res;
  const statuses = (sp.get("status") ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(isApplyStatus);
  const decision = sp.get("decision");
  let items = await getApplyItems(a.user.id);
  if (statuses.length) items = items.filter((i) => statuses.includes(i.status));
  if (decision === "yes" || decision === "no") {
    items = items.filter((i) => i.decision === decision);
  }
  return NextResponse.json({
    ok: true,
    userId: a.user.id,
    email: a.user.email,
    count: items.length,
    items,
  });
}

/**
 * POST /api/ingest/apply — upsert recommendations.
 * Body: { email?, items: ApplyItemInput[], replace?: boolean }
 * replace=true removes undecided pending items not in this payload.
 */
export async function POST(req: NextRequest) {
  const body = await readBody(req);
  if (!body) return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  const a = await auth(req, typeof body.email === "string" ? body.email : undefined);
  if ("res" in a) return a.res;
  if (!Array.isArray(body.items)) {
    return NextResponse.json({ error: "items must be an array" }, { status: 400 });
  }
  const { saved, rejected } = await upsertApplyItems(a.user.id, body.items);
  let removed = 0;
  if (body.replace === true) {
    const keep = new Set(saved.map((s) => s.id));
    const stale = (await getApplyItems(a.user.id))
      .filter((i) => !keep.has(i.id) && i.status === "pending" && i.decision == null)
      .map((i) => i.id);
    removed = await deleteApplyItems(a.user.id, stale);
  }
  const total = (await getApplyItems(a.user.id)).length;
  return NextResponse.json({
    ok: rejected.length === 0,
    userId: a.user.id,
    saved: saved.length,
    removed,
    rejected,
    total,
  });
}

/**
 * PATCH /api/ingest/apply — update status/notes on existing items.
 * Body: { email?, updates: [{ id, status?, assistantNotes?, tailoringNotes?, resume? }] }
 */
export async function PATCH(req: NextRequest) {
  const body = await readBody(req);
  if (!body) return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  const a = await auth(req, typeof body.email === "string" ? body.email : undefined);
  if ("res" in a) return a.res;
  if (!Array.isArray(body.updates)) {
    return NextResponse.json({ error: "updates must be an array" }, { status: 400 });
  }
  const { updated, errors } = await updateApplyItems(a.user.id, body.updates);
  return NextResponse.json({
    ok: errors.length === 0,
    updated: updated.length,
    errors,
    items: updated,
  });
}

/** DELETE /api/ingest/apply — Body: { email?, ids: string[] } */
export async function DELETE(req: NextRequest) {
  const body = await readBody(req);
  if (!body) return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  const a = await auth(req, typeof body.email === "string" ? body.email : undefined);
  if ("res" in a) return a.res;
  const ids = Array.isArray(body.ids)
    ? body.ids.filter((x): x is string => typeof x === "string")
    : [];
  const removed = await deleteApplyItems(a.user.id, ids);
  return NextResponse.json({ ok: true, removed });
}
