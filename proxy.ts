import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { verifySessionToken } from "@/lib/session-token";

/**
 * Next.js 16 Proxy (formerly middleware): optimistic session check.
 * Full user lookup / authorization happens in `requireUser` and the
 * `(app)` layout — this only gates obviously unauthenticated traffic.
 */

const UID_COOKIE = "hunter_uid";
const SESSION_COOKIE = "hunter_session";

const PUBLIC_PREFIXES = [
  // Marketing site (exact "/" only — see isPublic; "/daily" etc. stay gated)
  "/",
  "/about",
  "/pricing",
  "/contact",
  "/api/contact",
  "/login",
  "/register",
  "/api/auth/login",
  "/api/auth/register",
  // Morning ingest: route enforces its own auth (Bearer HUNTER_INGEST_SECRET or session).
  // Same exemption the previous middleware.ts carried.
  "/api/ingest",
  "/_next",
  "/favicon",
];

function isPublic(pathname: string): boolean {
  if (pathname === "/icon.svg") return true;
  return PUBLIC_PREFIXES.some(
    (p) => pathname === p || (p !== "/" && pathname.startsWith(p + "/")),
  );
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (isPublic(pathname)) {
    return NextResponse.next();
  }

  const secret =
    process.env.AUTH_SECRET || process.env.SITE_PASSWORD || null;

  const uid = request.cookies.get(UID_COOKIE)?.value;
  const token = request.cookies.get(SESSION_COOKIE)?.value;

  if (await verifySessionToken(uid, token, secret)) {
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
  loginUrl.search = "";
  loginUrl.searchParams.set("from", pathname);
  if (uid || token) loginUrl.searchParams.set("reason", "expired");
  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
