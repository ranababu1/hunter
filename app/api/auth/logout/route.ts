import { NextResponse } from "next/server";
import { clearSessionCookies } from "@/lib/auth";

export async function POST() {
  const res = NextResponse.json({ ok: true });
  await clearSessionCookies(res);
  return res;
}
