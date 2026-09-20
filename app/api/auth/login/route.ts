import { NextResponse } from "next/server";
import {
  loginWithEmailPassword,
  loginWithSitePassword,
  setSessionCookies,
  toPublicUser,
} from "@/lib/auth";
import { maybeMigrateGlobalData } from "@/lib/users";
import {
  AUTH_LIMITS,
  clientIp,
  rateLimit,
  retryAfterMessage,
} from "@/lib/rate-limit";

function tooMany(retryAfterSeconds: number) {
  return NextResponse.json(
    {
      error: retryAfterMessage(retryAfterSeconds),
      code: "RATE_LIMITED",
      retryAfterSeconds,
    },
    { status: 429, headers: { "Retry-After": String(retryAfterSeconds) } },
  );
}

export async function POST(request: Request) {
  let body: { email?: string; password?: string } = {};
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const password = body.password ?? "";
  const email = body.email?.trim();

  const ip = clientIp(request);
  const ipLimit = await rateLimit(
    "login:ip",
    ip,
    AUTH_LIMITS.loginPerIp.limit,
    AUTH_LIMITS.loginPerIp.windowSeconds,
  );
  if (!ipLimit.ok) return tooMany(ipLimit.retryAfterSeconds);
  if (email) {
    const emailLimit = await rateLimit(
      "login:email",
      email.toLowerCase(),
      AUTH_LIMITS.loginPerEmail.limit,
      AUTH_LIMITS.loginPerEmail.windowSeconds,
    );
    if (!emailLimit.ok) return tooMany(emailLimit.retryAfterSeconds);
  }

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
