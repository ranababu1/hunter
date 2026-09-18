import { NextResponse } from "next/server";
import { PLAN_CATALOG } from "@/lib/plans";

export async function GET() {
  return NextResponse.json({ plans: PLAN_CATALOG });
}
