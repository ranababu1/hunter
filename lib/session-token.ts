/**
 * Signed, expiring session tokens (v2).
 *
 * Format: `v2.<expUnixSeconds>.<hmacSha256Hex>`
 * where the MAC covers `hunter:uid:{userId}:{exp}` with AUTH_SECRET
 * (or SITE_PASSWORD fallback).
 *
 * Uses Web Crypto only so the same code runs in `proxy.ts` and in Node
 * route handlers — one implementation, no drift.
 *
 * Dev fallback (no secret configured): unsigned `dev:{userId}` marker.
 */

export const SESSION_TTL_SECONDS = 30 * 24 * 60 * 60; // 30 days

const VERSION = "v2";

function toHex(buf: ArrayBuffer): string {
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

async function hmacHex(secret: string, message: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(message));
  return toHex(sig);
}

/** Constant-time string compare (both inputs are short hex/ASCII). */
function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let out = 0;
  for (let i = 0; i < a.length; i++) {
    out |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return out === 0;
}

function sessionMessage(userId: string, exp: number): string {
  return `hunter:uid:${userId}:${exp}`;
}

export function devSessionToken(userId: string): string {
  return `dev:${userId}`;
}

/** Mint a token for userId that expires `ttlSeconds` from `now`. */
export async function createSessionToken(
  userId: string,
  secret: string | null,
  ttlSeconds: number = SESSION_TTL_SECONDS,
  now: number = Date.now(),
): Promise<string> {
  if (!secret) return devSessionToken(userId);
  const exp = Math.floor(now / 1000) + ttlSeconds;
  const mac = await hmacHex(secret, sessionMessage(userId, exp));
  return `${VERSION}.${exp}.${mac}`;
}

/**
 * Verify token belongs to userId, is well-formed, unexpired and correctly signed.
 * Without a secret only the dev marker is accepted.
 */
export async function verifySessionToken(
  userId: string | undefined,
  token: string | undefined,
  secret: string | null,
  now: number = Date.now(),
): Promise<boolean> {
  if (!userId || !token) return false;
  if (!secret) return token === devSessionToken(userId);

  const parts = token.split(".");
  if (parts.length !== 3 || parts[0] !== VERSION) return false;
  const exp = Number(parts[1]);
  if (!Number.isInteger(exp) || exp <= 0) return false;
  if (exp * 1000 <= now) return false;
  if (!/^[0-9a-f]{64}$/.test(parts[2])) return false;

  const expected = await hmacHex(secret, sessionMessage(userId, exp));
  return constantTimeEqual(expected, parts[2]);
}

/** Seconds until the token expires (0 if invalid/expired/unparseable). */
export function sessionSecondsRemaining(
  token: string | undefined,
  now: number = Date.now(),
): number {
  if (!token) return 0;
  const parts = token.split(".");
  if (parts.length !== 3) return 0;
  const exp = Number(parts[1]);
  if (!Number.isInteger(exp)) return 0;
  return Math.max(0, exp - Math.floor(now / 1000));
}
