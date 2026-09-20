import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { runUserFetch } from "@/lib/fetches";

/**
 * Start a per-user fetch (Phase 2).
 * Matches active companies against global jobs/fetches catalog — no live crawler on Vercel.
 * Morning ingest writes the same FetchRun shape via POST /api/ingest/daily.
 */
export async function POST() {
  const user = await requireUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const result = await runUserFetch(user);
  if (!result.ok) {
    return NextResponse.json(
      {
        error: result.error,
        nextEligibleDate: result.nextEligibleDate,
      },
      { status: result.status },
    );
  }

  return NextResponse.json({
    ok: true,
    run: result.run,
    nextEligibleDate: result.nextEligibleDate,
  });
}
