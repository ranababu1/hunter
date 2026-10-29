import { timingSafeEqual } from "crypto";
import type { NextRequest } from "next/server";
import { isAdminEmail, requireUser, ensureAdminPrivileges } from "@/lib/auth";
import { findUserByEmail, ensureAdminBootstrap } from "@/lib/users";
import type { User } from "@/lib/types";

/* Shared bearer/session auth for assistant ingest endpoints (copied from
 * /api/ingest/daily so that route stays untouched). */

function safeEqualString(a: string, b: string): boolean {
  try {
    const ba = Buffer.from(a);
    const bb = Buffer.from(b);
    if (ba.length !== bb.length) return false;
    return timingSafeEqual(ba, bb);
  } catch {
    return false;
  }
}

function getBearerToken(req: NextRequest): string | null {
  const h = req.headers.get("authorization") || req.headers.get("Authorization");
  if (!h) return null;
  const m = /^Bearer\s+(.+)$/i.exec(h.trim());
  return m ? m[1].trim() : null;
}

function ingestSecretConfigured(): string | null {
  const s = process.env.HUNTER_INGEST_SECRET?.trim();
  return s || null;
}

function defaultAdminEmail(): string {
  return (
    process.env.ADMIN_EMAIL?.trim().toLowerCase() || "imrn.dev@gmail.com"
  );
}

/**
 * Resolve target user for ingest:
 * - Session cookie → session user (email in body ignored)
 * - Bearer HUNTER_INGEST_SECRET → resolve by email (body.email, header
 *   X-Hunter-Email, or default ADMIN_EMAIL / imrn.dev@gmail.com).
 *   Email must be admin email or an existing user.
 */
export async function resolveIngestUser(
  req: NextRequest,
  bodyEmail?: string,
): Promise<
  | { user: User; via: "session" | "bearer" }
  | { error: string; status: number }
> {
  const bearer = getBearerToken(req);
  const secret = ingestSecretConfigured();

  if (bearer && secret && safeEqualString(bearer, secret)) {
    const headerEmail =
      req.headers.get("x-hunter-email")?.trim().toLowerCase() ||
      req.headers.get("X-Hunter-Email")?.trim().toLowerCase() ||
      "";
    const email =
      (bodyEmail?.trim().toLowerCase() || headerEmail || defaultAdminEmail());

    if (!email.includes("@")) {
      return { error: "Valid email required with bearer auth", status: 400 };
    }

    await ensureAdminBootstrap();
    let user = await findUserByEmail(email);
    if (!user) {
      if (isAdminEmail(email)) {
        await ensureAdminBootstrap();
        user = await findUserByEmail(email);
      }
      if (!user) {
        return {
          error: `User not found for email ${email} — register first or use ADMIN_EMAIL`,
          status: 404,
        };
      }
    }
    // Only allow admin email OR already-existing user (existing covered above).
    // Existing non-admin is fine; unknown non-admin already 404'd.
    user = await ensureAdminPrivileges(user);
    return { user, via: "bearer" };
  }

  // Invalid / missing bearer: fall through to session
  if (bearer && secret && !safeEqualString(bearer, secret)) {
    return { error: "Invalid ingest secret", status: 401 };
  }
  if (bearer && !secret) {
    return {
      error: "HUNTER_INGEST_SECRET not configured",
      status: 503,
    };
  }

  const sessionUser = await requireUser();
  if (!sessionUser) {
    return {
      error:
        "Unauthorized — provide session cookie or Authorization: Bearer ${HUNTER_INGEST_SECRET}",
      status: 401,
    };
  }
  return { user: sessionUser, via: "session" };
}

