/**
 * Stable canonical form of a name→url mapping:
 * trimmed keys/values, empty names dropped, keys sorted.
 * Shared by server (Node SHA-256) and client (Web Crypto).
 */
export function canonicalizeImportMapping(
  mapping: Record<string, unknown>,
): string {
  const pairs: [string, string][] = [];
  for (const [rawName, rawUrl] of Object.entries(mapping)) {
    const name = rawName.trim();
    if (!name) continue;
    const url = typeof rawUrl === "string" ? rawUrl.trim() : "";
    pairs.push([name, url]);
  }
  pairs.sort((a, b) => a[0].localeCompare(b[0]));
  return JSON.stringify(Object.fromEntries(pairs));
}
