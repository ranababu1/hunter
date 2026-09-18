import { createHmac, timingSafeEqual } from "crypto";
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
import {
  adminBilling,
  entitlementsForJson,
  resolveEntitlements,
} from "./plans";
import type { PublicUser, User } from "./types";

export const UID_COOKIE = "hunter_uid";
export const SESSION_COOKIE = "hunter_session";

/** @deprecated legacy name — prefer SESSION_COOKIE */
export function getSessionCookieName() {
  return SESSION_COOKIE;
}

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
  if (changed) {
    await createUser(user); // upsert
  } else {
    // Still ensure billing + migration even if already admin
  }
  await setBilling(user.id, adminBilling());
  await maybeMigrateGlobalData(user.id);
  return user;
}

/** HMAC-SHA256 hex of message with auth secret (Node). */
export function signSession(userId: string): string {
  const secret = getAuthSecret();
  if (!secret) {
    // Dev fallback: unsigned marker (middleware also soft-allows)
    return `dev:${userId}`;
  }
  return createHmac("sha256", secret)
    .update(`hunter:uid:${userId}`)
    .digest("hex");
}

export function verifySessionToken(
  userId: string | undefined,
  token: string | undefined,
): boolean {
  if (!userId || !token) return false;
  const secret = getAuthSecret();
  if (!secret) {
    return token === `dev:${userId}`;
  }
  const expected = signSession(userId);
  try {
    const a = Buffer.from(token);
    const b = Buffer.from(expected);
    if (a.length !== b.length) return false;
    return timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

/** Edge-compatible verify used by middleware (Web Crypto). */
export async function verifySessionEdge(
  userId: string | undefined,
  token: string | undefined,
  secret: string | null,
): Promise<boolean> {
  if (!userId || !token) return false;
  if (!secret) {
    return token === `dev:${userId}`;
  }
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign(
    "HMAC",
    key,
    enc.encode(`hunter:uid:${userId}`),
  );
  const expected = Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  if (expected.length !== token.length) return false;
  let out = 0;
  for (let i = 0; i < expected.length; i++) {
    out |= expected.charCodeAt(i) ^ token.charCodeAt(i);
  }
  return out === 0;
}

export function toPublicUser(u: User): PublicUser {
  return {
    id: u.id,
    email: u.email,
    name: u.name,
    phone: u.phone,
    role: u.role,
    createdAt: u.createdAt,
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

export function sessionCookieOptions(maxAge = 60 * 60 * 24 * 30): SessionCookieOptions {
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
  res.cookies.set(SESSION_COOKIE, signSession(userId), opts);
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
  if (!verifySessionToken(uid, token)) return null;
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
  const billing = (await getBilling(user.id)) ?? (
    user.role === "admin" ? adminBilling() : null
  );
  const entitlements = resolveEntitlements(user.role, billing);
  const usage = (await getUsage(user.id)) ?? {
    bytesUsed: 0,
    updatedAt: new Date().toISOString(),
  };
  return {
    user: toPublicUser(user),
    entitlements: entitlementsForJson(entitlements),
    billing: billing ?? {
      companyPlan: "free" as const,
      storagePlan: "free" as const,
      status: "none" as const,
    },
    usage,
  };
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
  const existing = await findUserByEmail(email);
  if (existing) {
    return { error: "Email already registered", status: 409 };
  }

  await ensureAdminBootstrap();

  const role = isAdminEmail(email) ? "admin" : "user";
  const now = new Date().toISOString();
  const phone = (input.phone ?? "").trim().slice(0, 40) || undefined;
  const user: User = {
    id: newUserId(),
    email,
    passwordHash: await hashPassword(input.password),
    name: (input.name ?? "").trim() || email.split("@")[0],
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

/**
 * Legacy SITE_PASSWORD login → admin user tied to ADMIN_EMAIL.
 */
export async function loginWithSitePassword(
  password: string,
): Promise<{ user: User } | { error: string; status: number }> {
  const site = process.env.SITE_PASSWORD;
  if (!site) {
    return { error: "Legacy password login not configured", status: 401 };
  }
  try {
    const a = Buffer.from(password);
    const b = Buffer.from(site);
    if (a.length !== b.length || !timingSafeEqual(a, b)) {
      return { error: "Invalid password", status: 401 };
    }
  } catch {
    return { error: "Invalid password", status: 401 };
  }

  const adminEmail =
    process.env.ADMIN_EMAIL?.trim().toLowerCase() || HARDCODED_ADMIN_EMAIL;
  if (!adminEmail) {
    return {
      error: "ADMIN_EMAIL required for SITE_PASSWORD login",
      status: 503,
    };
  }

  await ensureAdminBootstrap();
  let user = await findUserByEmail(adminEmail);
  if (!user) {
    const now = new Date().toISOString();
    const bootstrap =
      process.env.ADMIN_BOOTSTRAP_PASSWORD || site;
    user = {
      id: newUserId(),
      email: adminEmail,
      passwordHash: await hashPassword(bootstrap),
      name: "Admin",
      role: "admin",
      createdAt: now,
      updatedAt: now,
    };
    const ok = await createUser(user);
    if (!ok) {
      return { error: "Redis required to create admin user", status: 503 };
    }
  }
  const promoted = await ensureAdminPrivileges(user);
  return { user: promoted };
}

/** Request helper: parse uid+session from NextRequest cookies. */
export function sessionFromRequest(req: NextRequest): string | null {
  const uid = req.cookies.get(UID_COOKIE)?.value;
  const token = req.cookies.get(SESSION_COOKIE)?.value;
  if (!verifySessionToken(uid, token)) return null;
  return uid ?? null;
}

// Keep old helpers for any leftover imports during transition
export function createSessionToken(password: string): string {
  return createHmac("sha256", password)
    .update(`hunter:${password}`)
    .digest("hex");
}

export function checkPassword(password: string): boolean {
  const expected = process.env.SITE_PASSWORD;
  if (!expected) return false;
  try {
    const a = Buffer.from(password);
    const b = Buffer.from(expected);
    if (a.length !== b.length) return false;
    return timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

export function verifySession(token: string | undefined): boolean {
  // Legacy no-op — prefer verifySessionToken
  if (!token) return false;
  return false;
}
