import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const UID_COOKIE = "hunter_uid";
const SESSION_COOKIE = "hunter_session";

async function verifySessionEdge(
  userId: string | undefined,
  token: string | undefined,
  secret: string | null,
): Promise<boolean> {
  if (!userId || !token) return false;
  if (!secret) {
    return token === `dev:${userId}`;
  }
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign(
    "HMAC",
    key,
    enc.encode(`hunter:uid:${userId}`),
  );
  const expected = Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  if (expected.length !== token.length) return false;
  let out = 0;
  for (let i = 0; i < expected.length; i++) {
    out |= expected.charCodeAt(i) ^ token.charCodeAt(i);
  }
  return out === 0;
}

const PUBLIC_PREFIXES = [
  "/login",
  "/register",
  "/api/auth/login",
  "/api/auth/register",
  // Bearer-auth morning ingest (route validates HUNTER_INGEST_SECRET or session)
  "/api/ingest",
  "/_next",
  "/favicon",
];

function isPublic(pathname: string): boolean {
  if (pathname === "/icon.svg") return true;
  return PUBLIC_PREFIXES.some(
    (p) => pathname === p || pathname.startsWith(p + "/"),
  );
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (isPublic(pathname)) {
    return NextResponse.next();
  }

  const secret =
    process.env.AUTH_SECRET || process.env.SITE_PASSWORD || null;

  const uid = request.cookies.get(UID_COOKIE)?.value;
  const token = request.cookies.get(SESSION_COOKIE)?.value;

  if (await verifySessionEdge(uid, token, secret)) {
    return NextResponse.next();
  }

  // Dev soft-open: no secret configured → allow (with warning)
  if (!secret && process.env.NODE_ENV !== "production") {
    console.warn(
      "[hunter] AUTH_SECRET/SITE_PASSWORD not set — allowing routes without session (dev only).",
    );
    return NextResponse.next();
  }

  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const loginUrl = request.nextUrl.clone();
  loginUrl.pathname = "/login";
  loginUrl.searchParams.set("from", pathname);
  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
