import { NextResponse } from "next/server";
import { getAppState, patchJobState } from "@/lib/redis";
import type { KanbanStatus } from "@/lib/types";
import { ALL_STATUSES, normalizeStatus } from "@/lib/types";

const VALID = new Set(ALL_STATUSES.map((c) => c.id));

export async function GET() {
  const state = await getAppState();
  const status: Record<string, KanbanStatus> = {};
  for (const [k, v] of Object.entries(state.status)) {
    status[k] = normalizeStatus(v);
  }
  return NextResponse.json({ ...state, status });
}

export async function PATCH(request: Request) {
  let body: {
    jobId?: string;
    visited?: boolean;
    status?: string;
  } = {};
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (!body.jobId || typeof body.jobId !== "string") {
    return NextResponse.json({ error: "jobId required" }, { status: 400 });
  }

  let status: KanbanStatus | undefined;
  if (body.status) {
    const normalized = normalizeStatus(body.status);
    if (!VALID.has(normalized) && body.status !== normalized) {
      // allow legacy via normalize, but reject unknown
    }
    if (!VALID.has(normalized)) {
      return NextResponse.json({ error: "Invalid status" }, { status: 400 });
    }
    status = normalized;
  }

  const state = await patchJobState(body.jobId, {
    visited: body.visited,
    status,
  });

  const outStatus: Record<string, KanbanStatus> = {};
  for (const [k, v] of Object.entries(state.status)) {
    outStatus[k] = normalizeStatus(v);
  }
  return NextResponse.json({ ...state, status: outStatus });
}
