import { NextResponse } from "next/server";
import { registerUser, setSessionCookies, toPublicUser } from "@/lib/auth";
import {
  AUTH_LIMITS,
  clientIp,
  rateLimit,
  retryAfterMessage,
} from "@/lib/rate-limit";

export async function POST(request: Request) {
  const ipLimit = await rateLimit(
    "register:ip",
    clientIp(request),
    AUTH_LIMITS.registerPerIp.limit,
    AUTH_LIMITS.registerPerIp.windowSeconds,
  );
  if (!ipLimit.ok) {
    return NextResponse.json(
      {
        error: retryAfterMessage(ipLimit.retryAfterSeconds),
        code: "RATE_LIMITED",
        retryAfterSeconds: ipLimit.retryAfterSeconds,
      },
      {
        status: 429,
        headers: { "Retry-After": String(ipLimit.retryAfterSeconds) },
      },
    );
  }

  let body: { email?: string; password?: string; name?: string; phone?: string } = {};
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const result = await registerUser({
    email: body.email ?? "",
    password: body.password ?? "",
    name: body.name,
    phone: body.phone,
  });

  if ("error" in result) {
    return NextResponse.json(
      { error: result.error },
      { status: result.status },
    );
  }

  const res = NextResponse.json(
    { ok: true, user: toPublicUser(result.user) },
    { status: 201 },
  );
  await setSessionCookies(res, result.user.id);
  return res;
}
