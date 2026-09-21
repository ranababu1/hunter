/**
 * In-process stand-in for the subset of @upstash/redis used by Hunter.
 *
 * DEV / SMOKE-TEST ONLY. Activated by `HUNTER_MEMORY_REDIS=1` and hard-disabled
 * whenever `VERCEL` is set, so it can never replace the real store on a deploy.
 * Data lives only as long as the Node process.
 *
 * Semantics mirror Upstash closely enough for our call sites:
 * - get returns the stored string (callers JSON.parse when needed)
 * - hgetall returns null for a missing/empty hash
 * - ttl returns -2 for a missing key, -1 when no expiry is set
 */

type Entry =
  | { kind: "string"; value: string }
  | { kind: "hash"; value: Map<string, string> }
  | { kind: "set"; value: Set<string> };

export class MemoryRedis {
  private store = new Map<string, Entry>();
  private expires = new Map<string, number>();

  private purge(key: string): void {
    const at = this.expires.get(key);
    if (at !== undefined && Date.now() >= at) {
      this.store.delete(key);
      this.expires.delete(key);
    }
  }

  private read(key: string): Entry | undefined {
    this.purge(key);
    return this.store.get(key);
  }

  async get<T = string>(key: string): Promise<T | null> {
    const e = this.read(key);
    if (!e || e.kind !== "string") return null;
    return e.value as unknown as T;
  }

  async set(key: string, value: string | number): Promise<"OK"> {
    this.store.set(key, { kind: "string", value: String(value) });
    this.expires.delete(key);
    return "OK";
  }

  async incr(key: string): Promise<number> {
    const e = this.read(key);
    const current = e && e.kind === "string" ? Number(e.value) || 0 : 0;
    const next = current + 1;
    this.store.set(key, { kind: "string", value: String(next) });
    return next;
  }

  async expire(key: string, seconds: number): Promise<0 | 1> {
    if (!this.read(key)) return 0;
    this.expires.set(key, Date.now() + seconds * 1000);
    return 1;
  }

  async ttl(key: string): Promise<number> {
    if (!this.read(key)) return -2;
    const at = this.expires.get(key);
    if (at === undefined) return -1;
    return Math.max(0, Math.ceil((at - Date.now()) / 1000));
  }

  async hset(key: string, fields: Record<string, unknown>): Promise<number> {
    const e = this.read(key);
    const map =
      e && e.kind === "hash" ? e.value : new Map<string, string>();
    let added = 0;
    for (const [f, v] of Object.entries(fields)) {
      if (!map.has(f)) added += 1;
      map.set(f, typeof v === "string" ? v : JSON.stringify(v));
    }
    this.store.set(key, { kind: "hash", value: map });
    return added;
  }

  async hget<T = string>(key: string, field: string): Promise<T | null> {
    const e = this.read(key);
    if (!e || e.kind !== "hash") return null;
    const v = e.value.get(field);
    return v === undefined ? null : (v as unknown as T);
  }

  async hgetall<T = Record<string, string>>(key: string): Promise<T | null> {
    const e = this.read(key);
    if (!e || e.kind !== "hash" || e.value.size === 0) return null;
    return Object.fromEntries(e.value) as unknown as T;
  }

  async sadd(key: string, ...members: string[]): Promise<number> {
    const e = this.read(key);
    const set = e && e.kind === "set" ? e.value : new Set<string>();
    let added = 0;
    for (const m of members) {
      if (!set.has(m)) {
        set.add(m);
        added += 1;
      }
    }
    this.store.set(key, { kind: "set", value: set });
    return added;
  }

  async smembers(key: string): Promise<string[]> {
    const e = this.read(key);
    if (!e || e.kind !== "set") return [];
    return [...e.value];
  }

  async scard(key: string): Promise<number> {
    const e = this.read(key);
    if (!e || e.kind !== "set") return 0;
    return e.value.size;
  }

  async srem(key: string, ...members: string[]): Promise<number> {
    const e = this.read(key);
    if (!e || e.kind !== "set") return 0;
    let removed = 0;
    for (const m of members) {
      if (e.value.delete(m)) removed += 1;
    }
    return removed;
  }

  async del(...keys: string[]): Promise<number> {
    let removed = 0;
    for (const k of keys) {
      if (this.store.delete(k)) removed += 1;
      this.expires.delete(k);
    }
    return removed;
  }

  async hdel(key: string, ...fields: string[]): Promise<number> {
    const e = this.read(key);
    if (!e || e.kind !== "hash") return 0;
    let removed = 0;
    for (const f of fields) {
      if (e.value.delete(f)) removed += 1;
    }
    return removed;
  }
}

// Next bundles pages and route handlers separately, so a module-level
// singleton would be duplicated per bundle. Pin it on globalThis instead.
const GLOBAL_KEY = "__hunterMemoryRedis";
type GlobalWithStore = typeof globalThis & { [GLOBAL_KEY]?: MemoryRedis };

/** True only for local dev/smoke runs; never on Vercel. */
export function memoryRedisEnabled(): boolean {
  return process.env.HUNTER_MEMORY_REDIS === "1" && !process.env.VERCEL;
}

export function getMemoryRedis(): MemoryRedis {
  const g = globalThis as GlobalWithStore;
  if (!g[GLOBAL_KEY]) {
    g[GLOBAL_KEY] = new MemoryRedis();
    console.warn(
      "[hunter] HUNTER_MEMORY_REDIS=1 — using in-process memory store (dev/smoke only, data is not persisted).",
    );
  }
  return g[GLOBAL_KEY];
}
