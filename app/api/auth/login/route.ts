import { NextResponse } from "next/server";
import {
  loginWithEmailPassword,
  loginWithSitePassword,
  setSessionCookies,
  toPublicUser,
} from "@/lib/auth";
import { maybeMigrateGlobalData } from "@/lib/users";

export async function POST(request: Request) {
  let body: { email?: string; password?: string } = {};
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const password = body.password ?? "";
  const email = body.email?.trim();

  let result:
    | { user: import("@/lib/types").User }
    | { error: string; status: number };

  if (email) {
    result = await loginWithEmailPassword(email, password);
  } else if (password) {
    // Legacy SITE_PASSWORD → admin
    result = await loginWithSitePassword(password);
  } else {
    return NextResponse.json(
      { error: "email and password required" },
      { status: 400 },
    );
  }

  if ("error" in result) {
    return NextResponse.json(
      { error: result.error },
      { status: result.status },
    );
  }

  if (result.user.role === "admin") {
    await maybeMigrateGlobalData(result.user.id);
  }

  const res = NextResponse.json({
    ok: true,
    user: toPublicUser(result.user),
  });
  await setSessionCookies(res, result.user.id);
  return res;
}
