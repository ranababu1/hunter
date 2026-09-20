export type MatchLevel = "Strong Match" | "Good Match" | "Possible Match";

export type KanbanStatus =
  | "identified"
  | "applied"
  | "responded"
  | "interviewing"
  | "end_selected"
  | "end_rejected"
  | "end_ignored"
  | "end_closed";

export interface Job {
  id: string;
  company: string;
  role: string;
  level: string;
  aiFocus: string;
  location: string;
  postedOrUpdated: string;
  match: MatchLevel;
  url: string;
  whyMatch: string;
  dateSeen: string;
  isNew: boolean;
}

export interface DailyDigest {
  date: string;
  title: string;
  jobs: Job[];
}

export interface AppState {
  visited: string[];
  status: Record<string, KanbanStatus>;
}

/** Pipeline columns shown on the board (End is a UI-only droppable). */
export const KANBAN_BOARD_COLUMNS = [
  { id: "identified", label: "Identified" },
  { id: "applied", label: "Applied" },
  { id: "responded", label: "Responded" },
  { id: "interviewing", label: "Interviewing" },
  { id: "end", label: "End" },
] as const;

export const END_OUTCOMES = [
  { id: "end_selected", label: "Selected" },
  { id: "end_rejected", label: "Got rejected" },
  { id: "end_ignored", label: "I ignored" },
  { id: "end_closed", label: "Position closed" },
] as const;

/** All selectable statuses for drawer / API validation. */
export const ALL_STATUSES: { id: KanbanStatus; label: string }[] = [
  { id: "identified", label: "Identified" },
  { id: "applied", label: "Applied" },
  { id: "responded", label: "Responded" },
  { id: "interviewing", label: "Interviewing" },
  { id: "end_selected", label: "End · Selected" },
  { id: "end_rejected", label: "End · Got rejected" },
  { id: "end_ignored", label: "End · I ignored" },
  { id: "end_closed", label: "End · Position closed" },
];

/** @deprecated use KANBAN_BOARD_COLUMNS / ALL_STATUSES */
export const KANBAN_COLUMNS = ALL_STATUSES;

export function normalizeStatus(s?: string): KanbanStatus {
  if (!s) return "identified";
  switch (s) {
    case "identified":
    case "applied":
    case "responded":
    case "interviewing":
    case "end_selected":
    case "end_rejected":
    case "end_ignored":
    case "end_closed":
      return s;
    case "read_jd":
    case "not_applied":
      return "identified";
    case "response":
      return "responded";
    case "offer":
      return "end_selected";
    case "rejected":
      return "end_rejected";
    case "ignored":
      return "end_ignored";
    default:
      return "identified";
  }
}

export function isEndStatus(s: KanbanStatus): boolean {
  return (
    s === "end_selected" ||
    s === "end_rejected" ||
    s === "end_ignored" ||
    s === "end_closed"
  );
}

export function statusLabel(s: KanbanStatus): string {
  const found = ALL_STATUSES.find((c) => c.id === s);
  if (found) {
    if (isEndStatus(s)) {
      const outcome = END_OUTCOMES.find((o) => o.id === s);
      return outcome?.label ?? found.label;
    }
    return found.label;
  }
  return s.replace(/_/g, " ");
}

export type FetchOutcome = "ok" | "zero" | "error";

export interface CompanyFetch {
  company: string;
  careerPortal: string; // absolute URL to careers home/search
  jobsFetched: number;
  lastFetched: string; // YYYY-MM-DD
  outcome: FetchOutcome;
  issue?: string; // why zero/error / blockers
  notes?: string;
}

export interface FetchesSnapshot {
  runDate: string;
  updatedAt: string; // ISO
  companies: CompanyFetch[];
}

export type FetchRunStatus = "ok" | "partial" | "error" | "skipped";

/** Per-user fetch run (Phase 2). Morning agent will write the same shape later. */
export interface FetchRun {
  id: string;
  runDate: string; // YYYY-MM-DD IST
  createdAt: string; // ISO
  status: FetchRunStatus;
  cadenceApplied: FetchCadence;
  companiesChecked: number;
  jobsFound: number;
  notes?: string;
  issue?: string;
  /** catalog | seed — Phase 2 matches against global jobs/fetches JSON (no live crawler). */
  source?: "catalog" | "seed";
  companyResults: CompanyFetch[];
}

export type CompanyPriority = "high" | "medium" | "low";

export interface CompanyProfile {
  id: string;
  name: string;
  valuation: string;
  headcount: string;
  bangaloreArea: string;
  industry: string;
  careersUrl: string;
  priority: CompanyPriority;
  notes: string;
  active: boolean;
  updatedAt: string; // ISO
  /** false = problematic portal; true/undefined = ok (legacy ok) */
  portalOk?: boolean;
  /** short reason when portalOk===false */
  portalIssue?: string;
  /** ISO timestamp set when enrich fills any metadata field */
  metadataCheckedAt?: string;
}

export const COMPANY_PRIORITIES: { id: CompanyPriority; label: string }[] = [
  { id: "high", label: "High" },
  { id: "medium", label: "Med" },
  { id: "low", label: "Low" },
];

// ── Multi-user Phase 1 ──────────────────────────────────────────────

export type UserRole = "admin" | "user";

export type CompanyPlanId = "free" | "cos_20" | "cos_45" | "cos_100" | "unlimited";
export type StoragePlanId = "free" | "plus" | "unlimited";

export type BillingStatus = "none" | "active" | "past_due" | "canceled";

export interface User {
  id: string;
  email: string;
  passwordHash: string;
  name: string;
  phone?: string;
  role: UserRole;
  createdAt: string;
  updatedAt: string;
  /** ISO timestamp once the tenant finished onboarding (roles + companies). */
  onboardingCompletedAt?: string;
}

/** Public user shape (no password hash). */
export interface PublicUser {
  id: string;
  email: string;
  name: string;
  phone?: string;
  role: UserRole;
  createdAt: string;
  onboardingCompletedAt?: string;
}

export type FetchCadence = "daily" | "alternate";

export interface Entitlements {
  companyPlan: CompanyPlanId;
  storagePlan: StoragePlanId;
  maxCompanies: number; // Infinity serialized as -1 for JSON
  maxStorageBytes: number;
  isAdmin: boolean;
  fetchCadence: FetchCadence;
  maxFetchHistory: number; // Infinity serialized as -1 for JSON
  fetchEnabled: boolean;
}

export interface BillingAccount {
  companyPlan: CompanyPlanId;
  storagePlan: StoragePlanId;
  stripeCustomerId?: string;
  stripeSubscriptionId?: string;
  stripePriceIds?: string[];
  status: BillingStatus;
  currentPeriodEnd?: string;
}

export interface UsageMeter {
  bytesUsed: number;
  updatedAt: string;
}

export interface TargetRole {
  id: string;
  label: string;
}

export interface ResumeMeta {
  fileName?: string;
  mimeType?: string;
  uploadedAt?: string;
  charCount?: number;
}

export const EXPERIENCE_LEVELS = [
  { id: "junior", label: "Junior (0–3 yrs)" },
  { id: "mid", label: "Mid (3–6 yrs)" },
  { id: "senior", label: "Senior (6–10 yrs)" },
  { id: "staff", label: "Staff / Principal (10+ yrs)" },
  { id: "leadership", label: "Leadership (EM / Director+)" },
] as const;

export type ExperienceLevel = (typeof EXPERIENCE_LEVELS)[number]["id"];

export interface UserProfile {
  displayName: string;
  phone?: string;
  resumeText: string;
  resumeMeta: ResumeMeta;
  targetRoles: TargetRole[];
  /** Preferred locations, e.g. "Bengaluru", "Remote" */
  locations?: string[];
  experienceLevel?: ExperienceLevel;
  updatedAt: string;
}

export interface PlanCatalogEntry {
  id: string;
  kind: "company" | "storage";
  label: string;
  maxCompanies?: number;
  maxStorageBytes?: number;
  monthlyPriceUsd: number | null;
  description: string;
}

export type LimitErrorKind = "storage" | "companies";

export interface QuotaErrorBody {
  error: "QUOTA_EXCEEDED" | "PLAN_LIMIT";
  kind: LimitErrorKind;
  limit: number;
  used: number;
  message?: string;
}
