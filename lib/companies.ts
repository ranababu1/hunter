export function slugify(name: string): string {
  const base = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
  return base || "company";
}

function shortRandom(): string {
  return Math.random().toString(36).slice(2, 6);
}

export function uniqueId(name: string, existing: Set<string>): string {
  let id = slugify(name);
  if (!existing.has(id)) return id;
  id = `${slugify(name)}-${shortRandom()}`;
  while (existing.has(id)) {
    id = `${slugify(name)}-${shortRandom()}`;
  }
  return id;
}

/** True if string looks like an http(s) URL (syntax only). */
export function looksLikeHttpUrl(raw: string): boolean {
  const s = raw.trim();
  if (!/^https?:\/\//i.test(s)) return false;
  try {
    const u = new URL(s);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

export type PortalCheckResult =
  | { ok: true }
  | { ok: false; issue: string };

const PORTAL_TIMEOUT_MS = 7000;

/**
 * Server-side HEAD (then GET fallback) to see if a careers URL responds.
 * Does not throw; returns ok/issue for flagging on import.
 */
export async function checkPortalUrl(url: string): Promise<PortalCheckResult> {
  let parsed: URL;
  try {
    parsed = new URL(url.trim());
  } catch {
    return { ok: false, issue: "Invalid URL" };
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return { ok: false, issue: "URL must be http or https" };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), PORTAL_TIMEOUT_MS);

  async function attempt(method: "HEAD" | "GET"): Promise<Response> {
    return fetch(parsed.href, {
      method,
      redirect: "follow",
      signal: controller.signal,
      headers: {
        "User-Agent": "HunterPortalCheck/1.0",
        Accept: "*/*",
      },
    });
  }

  try {
    let res: Response;
    try {
      res = await attempt("HEAD");
      // Some hosts reject HEAD with 405/403/501 — fall back to GET
      if (res.status === 405 || res.status === 501 || res.status === 403) {
        res = await attempt("GET");
      }
    } catch (headErr) {
      // Network/abort on HEAD — try GET once if not already aborted for timeout
      if (controller.signal.aborted) throw headErr;
      res = await attempt("GET");
    }

    const status = res.status || 0;
    if (status >= 400 || status === 0) {
      return { ok: false, issue: `HTTP ${status || 0}` };
    }
    // 2xx / 3xx (after follow, usually 2xx) count as ok
    return { ok: true };
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      return { ok: false, issue: "Timeout" };
    }
    const msg = err instanceof Error ? err.message : "Network error";
    return { ok: false, issue: msg.slice(0, 120) || "Network error" };
  } finally {
    clearTimeout(timer);
  }
}

/** Run async work over items with a concurrency limit. */
export async function mapPool<T, R>(
  items: T[],
  concurrency: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  const workers = Array.from(
    { length: Math.min(concurrency, Math.max(items.length, 1)) },
    async () => {
      while (true) {
        const i = next++;
        if (i >= items.length) break;
        results[i] = await fn(items[i], i);
      }
    },
  );
  if (items.length === 0) return results;
  await Promise.all(workers);
  return results;
}
