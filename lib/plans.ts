import type {
  BillingAccount,
  CompanyPlanId,
  Entitlements,
  FetchCadence,
  PlanCatalogEntry,
  StoragePlanId,
  UserRole,
} from "./types";

export const MB = 1024 * 1024;

export const STORAGE_LIMITS: Record<StoragePlanId, number> = {
  free: 2 * MB,
  plus: 10 * MB,
  unlimited: 10 * MB, // admin uses 10MB per owner (not infinite)
};

export const COMPANY_LIMITS: Record<CompanyPlanId, number> = {
  free: 5,
  cos_20: 20,
  cos_45: 45,
  cos_100: 100,
  unlimited: Number.POSITIVE_INFINITY,
};

export const DEFAULT_BILLING: BillingAccount = {
  companyPlan: "free",
  storagePlan: "free",
  status: "none",
};

export const PLAN_CATALOG: PlanCatalogEntry[] = [
  {
    id: "free",
    kind: "company",
    label: "Free",
    maxCompanies: 5,
    maxStorageBytes: 2 * MB,
    monthlyPriceUsd: 0,
    description: "5 companies · 2 MB · alternate-day fetches · 30 fetch history",
  },
  {
    id: "cos_20",
    kind: "company",
    label: "Companies 20",
    maxCompanies: 20,
    monthlyPriceUsd: 5,
    description: "Up to 20 tracked companies · daily fetches",
  },
  {
    id: "cos_45",
    kind: "company",
    label: "Companies 45",
    maxCompanies: 45,
    monthlyPriceUsd: 10,
    description: "Up to 45 tracked companies · daily fetches",
  },
  {
    id: "cos_100",
    kind: "company",
    label: "Companies 100",
    maxCompanies: 100,
    monthlyPriceUsd: 20,
    description: "Up to 100 tracked companies · daily fetches",
  },
  {
    id: "storage_plus",
    kind: "storage",
    label: "Storage Plus",
    maxStorageBytes: 10 * MB,
    monthlyPriceUsd: 10,
    description: "10 MB profile & company storage (does not change fetch cadence)",
  },
];

export function adminBilling(): BillingAccount {
  return {
    companyPlan: "unlimited",
    storagePlan: "plus", // 10MB for admin
    status: "active",
  };
}

const PAID_COMPANY_PLANS: CompanyPlanId[] = ["cos_20", "cos_45", "cos_100"];

/** True for any paid company tier (cos_20/45/100) — not admin, not free. */
export function isPaidCompanyPlan(planId: CompanyPlanId): boolean {
  return PAID_COMPANY_PLANS.includes(planId);
}

export function resolveEntitlements(
  role: UserRole,
  billing: BillingAccount | null | undefined,
): Entitlements {
  const isAdmin = role === "admin";
  if (isAdmin) {
    return {
      companyPlan: "unlimited",
      storagePlan: "plus",
      maxCompanies: Number.POSITIVE_INFINITY,
      maxStorageBytes: 10 * MB,
      isAdmin: true,
      fetchCadence: "daily",
      maxFetchHistory: Number.POSITIVE_INFINITY,
      fetchEnabled: true,
    };
  }
  const b = billing ?? DEFAULT_BILLING;
  const companyPlan: CompanyPlanId =
    b.companyPlan === "unlimited" ? "free" : b.companyPlan;
  const storagePlan: StoragePlanId =
    b.storagePlan === "unlimited" ? "free" : b.storagePlan;

  const isPaidCompany = PAID_COMPANY_PLANS.includes(companyPlan);
  const fetchCadence: FetchCadence = isPaidCompany ? "daily" : "alternate";
  const maxFetchHistory = isPaidCompany
    ? Number.POSITIVE_INFINITY
    : 30;

  return {
    companyPlan,
    storagePlan,
    maxCompanies: COMPANY_LIMITS[companyPlan],
    maxStorageBytes: STORAGE_LIMITS[storagePlan],
    isAdmin: false,
    fetchCadence,
    maxFetchHistory,
    fetchEnabled: true,
  };
}

/** JSON-safe entitlements (Infinity → -1). */
export function entitlementsForJson(e: Entitlements) {
  return {
    ...e,
    maxCompanies: Number.isFinite(e.maxCompanies) ? e.maxCompanies : -1,
    maxFetchHistory: Number.isFinite(e.maxFetchHistory)
      ? e.maxFetchHistory
      : -1,
  };
}

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < MB) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / MB).toFixed(2)} MB`;
}

/** Today's calendar date in Asia/Calcutta as YYYY-MM-DD. */
export function todayIST(now: Date = new Date()): string {
  return now.toLocaleDateString("en-CA", { timeZone: "Asia/Calcutta" });
}

/** Parse YYYY-MM-DD as UTC midnight for day-diff arithmetic. */
function parseYmd(ymd: string): number {
  const [y, m, d] = ymd.split("-").map(Number);
  return Date.UTC(y, m - 1, d);
}

/**
 * Whether a fetch may run given lastFetchDate and cadence.
 * Alternate = at least 1 full calendar day gap in Asia/Calcutta
 * (e.g. last Mon → next eligible Wed).
 */
export function canRunFetchToday(
  lastFetchDate: string | null,
  cadence: FetchCadence,
  now: Date = new Date(),
): boolean {
  if (!lastFetchDate) return true;
  const today = todayIST(now);
  if (cadence === "daily") {
    return lastFetchDate < today;
  }
  // alternate: need ≥ 2 calendar days between last and today
  const diffDays =
    (parseYmd(today) - parseYmd(lastFetchDate)) / (24 * 60 * 60 * 1000);
  return diffDays >= 2;
}

/** Next YYYY-MM-DD (IST) when the user may run a fetch. */
export function nextEligibleFetchDate(
  lastFetchDate: string | null,
  cadence: FetchCadence,
  now: Date = new Date(),
): string {
  const today = todayIST(now);
  if (canRunFetchToday(lastFetchDate, cadence, now)) {
    return today;
  }
  if (!lastFetchDate) return today;
  if (cadence === "daily") {
    // already fetched today → tomorrow
    const next = new Date(parseYmd(lastFetchDate) + 24 * 60 * 60 * 1000);
    return next.toISOString().slice(0, 10);
  }
  // alternate: last + 2 calendar days
  const next = new Date(parseYmd(lastFetchDate) + 2 * 24 * 60 * 60 * 1000);
  return next.toISOString().slice(0, 10);
}

export function companyPlanLabel(id: CompanyPlanId): string {
  if (id === "unlimited") return "Admin · Unlimited";
  const entry = PLAN_CATALOG.find((p) => p.id === id);
  return entry?.label ?? id;
}

export function storagePlanLabel(id: StoragePlanId): string {
  if (id === "unlimited" || id === "plus") return "Storage Plus (10 MB)";
  return "Free (2 MB)";
}
