import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { runUserFetch } from "@/lib/fetches";

/**
 * Start a per-user live fetch: checks each active company's real careers
 * portal (see lib/live-fetch.ts) and merges any postings found into the
 * tenant's own job list.
 *
 * Free-tier tenants are gated by a manual daily click quota rather than the
 * plan cadence; `?fetch=more` on this request raises that quota's ceiling
 * for the rest of the day (see lib/fetch-quota.ts). Paid plans / admin keep
 * the existing cadence gate.
 */
export async function POST(request: NextRequest) {
  const user = await requireUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const boosted = request.nextUrl.searchParams.get("fetch") === "more";
  const result = await runUserFetch(user, { boosted });
  if (!result.ok) {
    return NextResponse.json(
      {
        error: result.error,
        nextEligibleDate: result.nextEligibleDate,
        manualFetch: result.manualFetch,
      },
      { status: result.status },
    );
  }

  return NextResponse.json({
    ok: true,
    run: result.run,
    nextEligibleDate: result.nextEligibleDate,
    manualFetch: result.manualFetch,
  });
}
