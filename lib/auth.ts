import { newUserId } from "./auth-id";
import { cookies } from "next/headers";
import type { NextRequest } from "next/server";
import { hashPassword, verifyPassword } from "./password";
import {
  createUser,
  findUserByEmail,
  getUserById,
  ensureAdminBootstrap,
  maybeMigrateGlobalData,
  getBilling,
  getUsage,
  setBilling,
} from "./users";
import { CACHE_TTL, cacheGet, cacheSet, userCacheKey } from "./cache";
import {
  adminBilling,
  entitlementsForJson,
  resolveEntitlements,
} from "./plans";
import type { PublicUser, User } from "./types";
import {
  SESSION_TTL_SECONDS,
  createSessionToken,
  verifySessionToken as verifyToken,
} from "./session-token";
import { maybeMigrateSeedJobsToUser } from "./jobs";

export const UID_COOKIE = "hunter_uid";
export const SESSION_COOKIE = "hunter_session";

/** @deprecated legacy name — prefer SESSION_COOKIE */
export function getSessionCookieName() {
  return SESSION_COOKIE;
}

/**
 * Session signing secret. `SITE_PASSWORD` remains ONLY as a deprecated
 * fallback for deployments that never set AUTH_SECRET; the password-only
 * admin login it once powered has been removed.
 */
export function getAuthSecret(): string | null {
  return process.env.AUTH_SECRET || process.env.SITE_PASSWORD || null;
}

export function isAuthConfigured(): boolean {
  return Boolean(getAuthSecret() || process.env.ADMIN_EMAIL);
}

const HARDCODED_ADMIN_EMAIL = "imrn.dev@gmail.com";

/** True if email matches ADMIN_EMAIL env or hardcoded fallback (case-insensitive). */
export function isAdminEmail(email: string): boolean {
  const normalized = email.trim().toLowerCase();
  const fromEnv = process.env.ADMIN_EMAIL?.trim().toLowerCase();
  const admin = fromEnv || HARDCODED_ADMIN_EMAIL;
  return normalized === admin || normalized === HARDCODED_ADMIN_EMAIL;
}

/**
 * If user email is admin, promote role, upsert, set adminBilling, run migration.
 * Safe to call on every /api/me and authenticated API path.
 */
export async function ensureAdminPrivileges(user: User): Promise<User> {
  if (!isAdminEmail(user.email)) return user;
  let changed = false;
  if (user.role !== "admin") {
    user.role = "admin";
    user.updatedAt = new Date().toISOString();
    changed = true;
  }
  // The owner account never sees the onboarding wizard.
  if (!user.onboardingCompletedAt) {
    user.onboardingCompletedAt = new Date().toISOString();
    user.updatedAt = user.onboardingCompletedAt;
    changed = true;
  }
  if (changed) {
    await createUser(user); // upsert — invalidates user cache
  }
  // Only write billing when missing or not already admin entitlements (avoids
  // constant Redis + cache thrash on every /api/me).
  const billing = await getBilling(user.id);
  const desired = adminBilling();
  if (
    !billing ||
    billing.companyPlan !== desired.companyPlan ||
    billing.storagePlan !== desired.storagePlan
  ) {
    await setBilling(user.id, desired);
  }
  await maybeMigrateGlobalData(user.id);
  await maybeMigrateSeedJobsToUser(user.id);
  return user;
}

/** Tenants must finish onboarding before the app renders; admin is exempt. */
export function isOnboarded(user: User): boolean {
  return user.role === "admin" || Boolean(user.onboardingCompletedAt);
}

/**
 * Mint a signed, expiring session token (`v2.<exp>.<hmac>`) for userId.
 * Dev fallback without a secret: unsigned `dev:{userId}` marker.
 */
export async function signSession(userId: string): Promise<string> {
  return createSessionToken(userId, getAuthSecret(), SESSION_TTL_SECONDS);
}

/** Verify uid + token cookie pair: well-formed, unexpired, correctly signed. */
export async function verifySessionToken(
  userId: string | undefined,
  token: string | undefined,
): Promise<boolean> {
  return verifyToken(userId, token, getAuthSecret());
}

export function toPublicUser(u: User): PublicUser {
  return {
    id: u.id,
    email: u.email,
    name: u.name,
    phone: u.phone,
    role: u.role,
    createdAt: u.createdAt,
    onboardingCompletedAt: u.onboardingCompletedAt,
  };
}

export { newUserId };

export type SessionCookieOptions = {
  httpOnly: true;
  sameSite: "lax";
  secure: boolean;
  path: "/";
  maxAge: number;
};

export function sessionCookieOptions(
  maxAge: number = SESSION_TTL_SECONDS,
): SessionCookieOptions {
  return {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge,
  };
}

export async function setSessionCookies(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  res: { cookies: { set: (name: string, value: string, opts: any) => void } },
  userId: string,
) {
  const opts = sessionCookieOptions();
  res.cookies.set(UID_COOKIE, userId, opts);
  res.cookies.set(SESSION_COOKIE, await signSession(userId), opts);
}

export async function clearSessionCookies(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  res: { cookies: { set: (name: string, value: string, opts: any) => void } },
) {
  const opts = { ...sessionCookieOptions(0), maxAge: 0 };
  res.cookies.set(UID_COOKIE, "", opts);
  res.cookies.set(SESSION_COOKIE, "", opts);
}

/** Read session from Next.js cookies() (Route Handlers / Server Components). */
export async function getSessionUserId(): Promise<string | null> {
  const jar = await cookies();
  const uid = jar.get(UID_COOKIE)?.value;
  const token = jar.get(SESSION_COOKIE)?.value;
  if (!(await verifySessionToken(uid, token))) return null;
  return uid ?? null;
}

export async function requireUser(): Promise<User | null> {
  const uid = await getSessionUserId();
  if (!uid) return null;
  const user = await getUserById(uid);
  if (!user) return null;
  return ensureAdminPrivileges(user);
}

export async function getMePayload(user: User) {
  user = await ensureAdminPrivileges(user);
  const ck = userCacheKey(user.id, "me");
  const cached = cacheGet<{
    user: PublicUser;
    entitlements: ReturnType<typeof entitlementsForJson>;
    billing: NonNullable<Awaited<ReturnType<typeof getBilling>>> | {
      companyPlan: "free";
      storagePlan: "free";
      status: "none";
    };
    usage: { bytesUsed: number; updatedAt: string };
  }>(ck);
  if (cached) return cached;

  const [billingRaw, usageRaw] = await Promise.all([
    getBilling(user.id),
    getUsage(user.id),
  ]);
  const billing = billingRaw ?? (
    user.role === "admin" ? adminBilling() : null
  );
  const entitlements = resolveEntitlements(user.role, billing);
  const usage = usageRaw ?? {
    bytesUsed: 0,
    updatedAt: new Date().toISOString(),
  };
  const payload = {
    user: toPublicUser(user),
    entitlements: entitlementsForJson(entitlements),
    billing: billing ?? {
      companyPlan: "free" as const,
      storagePlan: "free" as const,
      status: "none" as const,
    },
    usage,
  };
  cacheSet(ck, payload, CACHE_TTL.ME);
  return payload;
}

/** Collapse whitespace/separators; keep leading + and digits (e.g. "+91 98765-43210" → "+919876543210"). */
export function normalizePhone(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return "";
  const plus = trimmed.startsWith("+") ? "+" : "";
  const digits = trimmed.replace(/\D/g, "");
  return digits ? `${plus}${digits}`.slice(0, 20) : "";
}

/** E.164-ish: optional +, 7–15 digits. */
export function isValidPhone(normalized: string): boolean {
  return /^\+?\d{7,15}$/.test(normalized);
}

export async function registerUser(input: {
  email: string;
  password: string;
  name?: string;
  phone?: string;
}): Promise<{ user: User } | { error: string; status: number }> {
  const email = input.email.trim().toLowerCase();
  if (!email || !email.includes("@")) {
    return { error: "Valid email required", status: 400 };
  }
  if (!input.password || input.password.length < 8) {
    return { error: "Password must be at least 8 characters", status: 400 };
  }
  const name = (input.name ?? "").trim().slice(0, 120);
  if (!name) {
    return { error: "Name is required", status: 400 };
  }
  const phone = normalizePhone(input.phone ?? "");
  if (!phone) {
    return { error: "Phone number is required", status: 400 };
  }
  if (!isValidPhone(phone)) {
    return {
      error: "Enter a valid phone number (7–15 digits, optional +country code)",
      status: 400,
    };
  }
  const existing = await findUserByEmail(email);
  if (existing) {
    return { error: "Email already registered", status: 409 };
  }

  await ensureAdminBootstrap();

  const role = isAdminEmail(email) ? "admin" : "user";
  const now = new Date().toISOString();
  const user: User = {
    id: newUserId(),
    email,
    passwordHash: await hashPassword(input.password),
    name,
    phone,
    role,
    createdAt: now,
    updatedAt: now,
  };
  const created = await createUser(user);
  if (!created) {
    return {
      error: "Could not create user — Redis required",
      status: 503,
    };
  }
  const promoted = await ensureAdminPrivileges(user);
  return { user: promoted };
}

export async function loginWithEmailPassword(
  email: string,
  password: string,
): Promise<{ user: User } | { error: string; status: number }> {
  await ensureAdminBootstrap();
  const user = await findUserByEmail(email.trim().toLowerCase());
  if (!user) {
    return { error: "Invalid email or password", status: 401 };
  }
  const ok = await verifyPassword(password, user.passwordHash);
  if (!ok) {
    return { error: "Invalid email or password", status: 401 };
  }
  const promoted = await ensureAdminPrivileges(user);
  return { user: promoted };
}

/** Request helper: parse uid+session from NextRequest cookies. */
export async function sessionFromRequest(
  req: NextRequest,
): Promise<string | null> {
  const uid = req.cookies.get(UID_COOKIE)?.value;
  const token = req.cookies.get(SESSION_COOKIE)?.value;
  if (!(await verifySessionToken(uid, token))) return null;
  return uid ?? null;
}
