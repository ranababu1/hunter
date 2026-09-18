import { NextResponse } from "next/server";
import { getMePayload, requireUser } from "@/lib/auth";

export async function GET() {
  const user = await requireUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const payload = await getMePayload(user);
  return NextResponse.json(payload);
}
