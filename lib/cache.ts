/**
 * Process-local in-memory cache for Redis/file reads.
 * Integrity: callers must write Redis (or fail) before cacheSet / invalidateUser.
 * Keys for user data MUST use userCacheKey / `u:{userId}:*` — never cross-user.
 */

type CacheEntry = { value: unknown; expiresAt: number };

const store = new Map<string, CacheEntry>();

/** Soft cap to avoid unbounded growth on long-lived Node processes. */
const MAX_ENTRIES = 500;

/** TTL defaults used across the app. */
export const CACHE_TTL = {
  /** Redis-backed user data (billing, usage, profile, companies, …) */
  USER: 20_000,
  /** Assembled GET /api/me payload */
  ME: 8_000,
  /** Static job files (jobs.json, digests, fetches.json) */
  STATIC: 90_000,
} as const;

export function userCacheKey(userId: string, part: string): string {
  return `u:${userId}:${part}`;
}

function evictIfNeeded(): void {
  while (store.size > MAX_ENTRIES) {
    const oldest = store.keys().next().value;
    if (oldest === undefined) break;
    store.delete(oldest);
  }
}

/** Touch for simple LRU: re-insert so it becomes newest. */
function touch(key: string, entry: CacheEntry): void {
  store.delete(key);
  store.set(key, entry);
}

export function cacheGet<T>(key: string): T | undefined {
  const entry = store.get(key);
  if (!entry) return undefined;
  if (Date.now() > entry.expiresAt) {
    store.delete(key);
    return undefined;
  }
  touch(key, entry);
  return entry.value as T;
}

export function cacheSet(key: string, value: unknown, ttlMs: number): void {
  if (ttlMs <= 0) {
    store.delete(key);
    return;
  }
  store.delete(key); // refresh LRU position
  store.set(key, { value, expiresAt: Date.now() + ttlMs });
  evictIfNeeded();
}

/**
 * Delete one key, or all keys that start with the given prefix
 * (e.g. `u:{userId}:` or an exact key).
 */
export function cacheDel(keyOrPrefix: string): void {
  if (store.has(keyOrPrefix)) {
    store.delete(keyOrPrefix);
  }
  // Prefix sweep (also covers exact key already deleted — harmless)
  for (const key of [...store.keys()]) {
    if (key.startsWith(keyOrPrefix)) {
      store.delete(key);
    }
  }
}

/** Drop every in-memory entry for a user (`u:{userId}:*`), including `me`. */
export function invalidateUser(userId: string): void {
  cacheDel(`u:${userId}:`);
}

/** Test / diagnostics helper — not used in request path. */
export function cacheSize(): number {
  return store.size;
}
