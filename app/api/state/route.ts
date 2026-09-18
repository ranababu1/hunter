import { NextResponse } from "next/server";
import { getAppState, patchJobState } from "@/lib/redis";
import type { KanbanStatus } from "@/lib/types";
import { KANBAN_COLUMNS } from "@/lib/types";

const VALID = new Set(KANBAN_COLUMNS.map((c) => c.id));

export async function GET() {
  const state = await getAppState();
  return NextResponse.json(state);
}

export async function PATCH(request: Request) {
  let body: {
    jobId?: string;
    visited?: boolean;
    status?: KanbanStatus;
  } = {};
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (!body.jobId || typeof body.jobId !== "string") {
    return NextResponse.json({ error: "jobId required" }, { status: 400 });
  }

  if (body.status && !VALID.has(body.status)) {
    return NextResponse.json({ error: "Invalid status" }, { status: 400 });
  }

  const state = await patchJobState(body.jobId, {
    visited: body.visited,
    status: body.status,
  });

  return NextResponse.json(state);
}
