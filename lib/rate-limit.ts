/**
 * Fixed-window rate limiter on Upstash Redis (INCR + EXPIRE).
 * Fail-open: if Redis is unavailable or errors, the request is allowed —
 * auth still works on a misconfigured deploy, it is just not throttled.
 */
import { getRedis } from "./users";

export type RateLimitResult =
  | { ok: true; remaining: number }
  | { ok: false; retryAfterSeconds: number };

function rlKey(scope: string, identifier: string): string {
  // identifier is lowercased/trimmed by callers; keep key charset sane
  const safe = identifier.replace(/[^a-zA-Z0-9@._:-]/g, "_").slice(0, 200);
  return `hunter:rl:${scope}:${safe}`;
}

export async function rateLimit(
  scope: string,
  identifier: string,
  limit: number,
  windowSeconds: number,
): Promise<RateLimitResult> {
  const redis = getRedis();
  if (!redis) return { ok: true, remaining: limit };
  const key = rlKey(scope, identifier);
  try {
    const count = await redis.incr(key);
    if (count === 1) {
      await redis.expire(key, windowSeconds);
    }
    if (count > limit) {
      let ttl = await redis.ttl(key);
      if (typeof ttl !== "number" || ttl < 0) {
        // Key without TTL (should not happen) — reset the window
        await redis.expire(key, windowSeconds);
        ttl = windowSeconds;
      }
      return { ok: false, retryAfterSeconds: Math.max(1, ttl) };
    }
    return { ok: true, remaining: Math.max(0, limit - count) };
  } catch (err) {
    console.warn("[hunter] rateLimit failed (allowing):", err);
    return { ok: true, remaining: limit };
  }
}

/** Best-effort client IP from proxy headers (Vercel sets x-forwarded-for). */
export function clientIp(request: Request): string {
  const xff = request.headers.get("x-forwarded-for");
  if (xff) {
    const first = xff.split(",")[0]?.trim();
    if (first) return first;
  }
  const real = request.headers.get("x-real-ip")?.trim();
  return real || "unknown";
}

export function retryAfterMessage(seconds: number): string {
  if (seconds < 90) return `Too many attempts. Try again in ${seconds}s.`;
  const mins = Math.ceil(seconds / 60);
  return `Too many attempts. Try again in ${mins} min.`;
}

/** Windows shared by the auth routes. */
export const AUTH_LIMITS = {
  loginPerIp: { limit: 20, windowSeconds: 15 * 60 },
  loginPerEmail: { limit: 10, windowSeconds: 15 * 60 },
  registerPerIp: { limit: 5, windowSeconds: 60 * 60 },
} as const;
