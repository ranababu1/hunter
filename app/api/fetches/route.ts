import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { getFetchesPayload } from "@/lib/fetches";

export async function GET() {
  const user = await requireUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const payload = await getFetchesPayload(user);
  return NextResponse.json(payload);
}
