import type { CompanyPriority, CompanyProfile } from "./types";
import { loadSeedCompanies } from "./redis";

const PRIORITIES = new Set<CompanyPriority>(["high", "medium", "low"]);

const STRING_LIMITS: Record<string, number> = {
  valuation: 200,
  headcount: 80,
  bangaloreArea: 200,
  industry: 200,
};

/** Lowercase, strip common suffixes / punctuation for fuzzy name match. */
export function normalizeCompanyName(name: string): string {
  return name
    .toLowerCase()
    .replace(
      /\b(incorporated|corporation|company|limited|labs?|inc|ltd|llc|corp|co)\b\.?/gi,
      "",
    )
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

/**
 * Alias → seed normalized name. Covers import labels that differ from seed.
 * Keys and values are normalizeCompanyName results.
 */
const ALIAS_TO_SEED: Record<string, string> = {
  amazon: "amazon aws",
  aws: "amazon aws",
  sap: "sap",
  vmware: "broadcom vmware",
  broadcom: "broadcom vmware",
  walmart: "walmart global tech",
  jpmorgan: "jpmorgan chase",
  "jp morgan": "jpmorgan chase",
  "jp morgan chase": "jpmorgan chase",
};

function isEmpty(v: unknown): boolean {
  return v == null || (typeof v === "string" && !v.trim());
}

function saneString(raw: unknown, maxLen: number): string | null {
  if (typeof raw !== "string") return null;
  const t = raw.trim();
  if (!t || t.length > maxLen) return null;
  return t.slice(0, maxLen);
}

function sanePriority(raw: unknown): CompanyPriority | null {
  if (typeof raw !== "string") return null;
  const p = raw.toLowerCase() as CompanyPriority;
  return PRIORITIES.has(p) ? p : null;
}

function saneActive(raw: unknown): boolean | null {
  if (typeof raw === "boolean") return raw;
  return null;
}

export type EnrichDetail = {
  id: string;
  name: string;
  fieldsUpdated: string[];
};

export type EnrichResult = {
  companies: CompanyProfile[];
  updated: number;
  unchanged: number;
  details: EnrichDetail[];
};

type SeedMeta = Pick<
  CompanyProfile,
  | "valuation"
  | "headcount"
  | "bangaloreArea"
  | "industry"
  | "priority"
  | "active"
>;

let seedMapCache: Map<string, SeedMeta> | null = null;

async function getSeedMap(): Promise<Map<string, SeedMeta>> {
  if (seedMapCache) return seedMapCache;
  const seed = await loadSeedCompanies();
  const map = new Map<string, SeedMeta>();
  for (const c of seed) {
    const key = normalizeCompanyName(c.name);
    if (!key) continue;
    map.set(key, {
      valuation: c.valuation ?? "",
      headcount: c.headcount ?? "",
      bangaloreArea: c.bangaloreArea ?? "",
      industry: c.industry ?? "",
      priority: c.priority,
      active: c.active,
    });
  }
  seedMapCache = map;
  return map;
}

function lookupSeed(
  name: string,
  seedMap: Map<string, SeedMeta>,
): SeedMeta | null {
  const norm = normalizeCompanyName(name);
  if (!norm) return null;
  const direct = seedMap.get(norm);
  if (direct) return direct;
  const alias = ALIAS_TO_SEED[norm];
  if (alias) {
    const via = seedMap.get(alias);
    if (via) return via;
  }
  return null;
}

/**
 * Safe merge: fill empty string fields from seed; never wipe with blanks.
 * priority/active applied from seed only when present and valid.
 */
export function mergeEnrichment(
  company: CompanyProfile,
  seed: SeedMeta,
): { company: CompanyProfile; fieldsUpdated: string[] } {
  const fieldsUpdated: string[] = [];
  const next: CompanyProfile = { ...company };

  for (const field of [
    "valuation",
    "headcount",
    "bangaloreArea",
    "industry",
  ] as const) {
    if (!isEmpty(next[field])) continue;
    const max = STRING_LIMITS[field] ?? 200;
    const val = saneString(seed[field], max);
    if (val == null) continue;
    next[field] = val;
    fieldsUpdated.push(field);
  }

  // priority/active: set from seed when present and valid; leave as-is otherwise
  const pri = sanePriority(seed.priority);
  if (pri != null && next.priority !== pri) {
    next.priority = pri;
    fieldsUpdated.push("priority");
  }
  const act = saneActive(seed.active);
  if (act != null && next.active !== act) {
    next.active = act;
    fieldsUpdated.push("active");
  }

  if (fieldsUpdated.length > 0) {
    const now = new Date().toISOString();
    next.updatedAt = now;
    next.metadataCheckedAt = now;
  }

  return { company: next, fieldsUpdated };
}

/**
 * Enrich user companies from seed data/companies.json.
 * Safe merge only — never wipes good data with blanks.
 */
export async function enrichCompaniesFromSeed(
  companies: CompanyProfile[],
  opts?: { companyIds?: string[] },
): Promise<EnrichResult> {
  const seedMap = await getSeedMap();
  const idFilter =
    opts?.companyIds && opts.companyIds.length > 0
      ? new Set(opts.companyIds)
      : null;

  const details: EnrichDetail[] = [];
  let updated = 0;
  let unchanged = 0;

  const next = companies.map((c) => {
    if (idFilter && !idFilter.has(c.id)) {
      return c;
    }
    const seed = lookupSeed(c.name, seedMap);
    if (!seed) {
      unchanged += 1;
      return c;
    }
    const { company: merged, fieldsUpdated } = mergeEnrichment(c, seed);
    if (fieldsUpdated.length === 0) {
      unchanged += 1;
      return c;
    }
    updated += 1;
    details.push({ id: c.id, name: c.name, fieldsUpdated });
    return merged;
  });

  return { companies: next, updated, unchanged, details };
}
