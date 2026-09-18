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
