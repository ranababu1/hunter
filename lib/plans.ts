import type {
  BillingAccount,
  CompanyPlanId,
  Entitlements,
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
  free: 10,
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
    maxCompanies: 10,
    maxStorageBytes: 2 * MB,
    monthlyPriceUsd: 0,
    description: "10 companies · 2 MB storage",
  },
  {
    id: "cos_20",
    kind: "company",
    label: "Companies 20",
    maxCompanies: 20,
    monthlyPriceUsd: 5,
    description: "Up to 20 tracked companies",
  },
  {
    id: "cos_45",
    kind: "company",
    label: "Companies 45",
    maxCompanies: 45,
    monthlyPriceUsd: 10,
    description: "Up to 45 tracked companies",
  },
  {
    id: "cos_100",
    kind: "company",
    label: "Companies 100",
    maxCompanies: 100,
    monthlyPriceUsd: 20,
    description: "Up to 100 tracked companies",
  },
  {
    id: "storage_plus",
    kind: "storage",
    label: "Storage Plus",
    maxStorageBytes: 10 * MB,
    monthlyPriceUsd: 10,
    description: "10 MB profile & company storage",
  },
];

export function adminBilling(): BillingAccount {
  return {
    companyPlan: "unlimited",
    storagePlan: "plus", // 10MB for admin
    status: "active",
  };
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
    };
  }
  const b = billing ?? DEFAULT_BILLING;
  const companyPlan: CompanyPlanId =
    b.companyPlan === "unlimited" ? "free" : b.companyPlan;
  const storagePlan: StoragePlanId =
    b.storagePlan === "unlimited" ? "free" : b.storagePlan;
  return {
    companyPlan,
    storagePlan,
    maxCompanies: COMPANY_LIMITS[companyPlan],
    maxStorageBytes: STORAGE_LIMITS[storagePlan],
    isAdmin: false,
  };
}

/** JSON-safe entitlements (Infinity → -1). */
export function entitlementsForJson(e: Entitlements) {
  return {
    ...e,
    maxCompanies: Number.isFinite(e.maxCompanies) ? e.maxCompanies : -1,
  };
}

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < MB) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / MB).toFixed(2)} MB`;
}
