import { Redis } from "@upstash/redis";
import { getMemoryRedis, memoryRedisEnabled } from "./memory-redis";
import { hashPassword } from "./password";
import { GLOBAL, u, userKey } from "./keys";
import { adminBilling, DEFAULT_BILLING } from "./plans";
import { newUserId } from "./auth-id";
import {
  CACHE_TTL,
  cacheGet,
  cacheSet,
  invalidateUser,
  userCacheKey,
} from "./cache";
import type {
  AppState,
  BillingAccount,
  CompanyProfile,
  FetchRun,
  KanbanStatus,
  UsageMeter,
  User,
  UserProfile,
} from "./types";

export function getRedis(): Redis | null {
  // Local dev / smoke tests only — hard-disabled when VERCEL is set.
  if (memoryRedisEnabled()) {
    return getMemoryRedis() as unknown as Redis;
  }
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;
  return new Redis({ url, token });
}

export async function getUserById(id: string): Promise<User | null> {
  const ck = userCacheKey(id, "user");
  const hit = cacheGet<User | null>(ck);
  if (hit !== undefined) return hit;

  const redis = getRedis();
  if (!redis) return null;
  try {
    const raw = await redis.get<string | User>(userKey(id));
    if (raw == null) {
      cacheSet(ck, null, CACHE_TTL.USER);
      return null;
    }
    const user = typeof raw === "string" ? (JSON.parse(raw) as User) : raw;
    cacheSet(ck, user, CACHE_TTL.USER);
    return user;
  } catch (err) {
    console.warn("[hunter] getUserById failed:", err);
    return null;
  }
}

export async function findUserByEmail(email: string): Promise<User | null> {
  const redis = getRedis();
  if (!redis) return null;
  try {
    const id = await redis.hget<string>(GLOBAL.usersByEmail, email.toLowerCase());
    if (!id) return null;
    return getUserById(id);
  } catch (err) {
    console.warn("[hunter] findUserByEmail failed:", err);
    return null;
  }
}

/** Create or upsert user record + email index. Redis write before cache invalidate. */
export async function createUser(user: User): Promise<boolean> {
  const redis = getRedis();
  if (!redis) return false;
  try {
    await redis.set(userKey(user.id), JSON.stringify(user));
    await redis.hset(GLOBAL.usersByEmail, {
      [user.email.toLowerCase()]: user.id,
    });
    await redis.sadd(GLOBAL.userIds, user.id);
    // Ensure billing defaults
    const keys = u(user.id);
    const existingBilling = await redis.get(keys.billing);
    if (existingBilling == null) {
      const billing =
        user.role === "admin" ? adminBilling() : { ...DEFAULT_BILLING };
      await redis.set(keys.billing, JSON.stringify(billing));
    }
    const existingUsage = await redis.get(keys.usage);
    if (existingUsage == null) {
      await redis.set(
        keys.usage,
        JSON.stringify({
          bytesUsed: 0,
          updatedAt: new Date().toISOString(),
        } satisfies UsageMeter),
      );
    }
    invalidateUser(user.id);
    return true;
  } catch (err) {
    console.warn("[hunter] createUser failed:", err);
    return false;
  }
}

/**
 * On first boot: if ADMIN_EMAIL + ADMIN_BOOTSTRAP_PASSWORD set and no user,
 * create admin account.
 */
export async function ensureAdminBootstrap(): Promise<void> {
  const email =
    process.env.ADMIN_EMAIL?.trim().toLowerCase() || "imrn.dev@gmail.com";
  const pass = process.env.ADMIN_BOOTSTRAP_PASSWORD;
  if (!pass) return;
  const redis = getRedis();
  if (!redis) return;
  try {
    const existing = await findUserByEmail(email);
    if (existing) return;
    const now = new Date().toISOString();
    const user: User = {
      id: newUserId(),
      email,
      passwordHash: await hashPassword(pass),
      name: "Admin",
      role: "admin",
      createdAt: now,
      updatedAt: now,
    };
    await createUser(user);
    console.info("[hunter] Bootstrapped admin user for", email);
  } catch (err) {
    console.warn("[hunter] ensureAdminBootstrap failed:", err);
  }
}

export async function getBilling(userId: string): Promise<BillingAccount | null> {
  const ck = userCacheKey(userId, "billing");
  const hit = cacheGet<BillingAccount | null>(ck);
  if (hit !== undefined) return hit;

  const redis = getRedis();
  if (!redis) return null;
  try {
    const raw = await redis.get<string | BillingAccount>(u(userId).billing);
    if (raw == null) {
      cacheSet(ck, null, CACHE_TTL.USER);
      return null;
    }
    const billing =
      typeof raw === "string" ? (JSON.parse(raw) as BillingAccount) : raw;
    cacheSet(ck, billing, CACHE_TTL.USER);
    return billing;
  } catch {
    return null;
  }
}

export async function setBilling(
  userId: string,
  billing: BillingAccount,
): Promise<boolean> {
  const redis = getRedis();
  if (!redis) return false;
  try {
    await redis.set(u(userId).billing, JSON.stringify(billing));
    invalidateUser(userId);
    return true;
  } catch {
    return false;
  }
}

export async function getUsage(userId: string): Promise<UsageMeter | null> {
  const ck = userCacheKey(userId, "usage");
  const hit = cacheGet<UsageMeter | null>(ck);
  if (hit !== undefined) return hit;

  const redis = getRedis();
  if (!redis) return null;
  try {
    const raw = await redis.get<string | UsageMeter>(u(userId).usage);
    if (raw == null) {
      cacheSet(ck, null, CACHE_TTL.USER);
      return null;
    }
    const usage =
      typeof raw === "string" ? (JSON.parse(raw) as UsageMeter) : raw;
    cacheSet(ck, usage, CACHE_TTL.USER);
    return usage;
  } catch {
    return null;
  }
}

export async function setUsage(
  userId: string,
  usage: UsageMeter,
): Promise<void> {
  const redis = getRedis();
  if (!redis) return;
  try {
    await redis.set(u(userId).usage, JSON.stringify(usage));
    invalidateUser(userId);
  } catch (err) {
    console.warn("[hunter] setUsage failed:", err);
  }
}

export async function getProfile(userId: string): Promise<UserProfile> {
  const empty: UserProfile = {
    displayName: "",
    resumeText: "",
    resumeMeta: {},
    targetRoles: [],
    updatedAt: new Date().toISOString(),
  };
  const ck = userCacheKey(userId, "profile");
  const hit = cacheGet<UserProfile>(ck);
  if (hit !== undefined) return hit;

  const redis = getRedis();
  if (!redis) return empty;
  try {
    const raw = await redis.get<string | UserProfile>(u(userId).profile);
    if (raw == null) {
      cacheSet(ck, empty, CACHE_TTL.USER);
      return empty;
    }
    const profile =
      typeof raw === "string" ? (JSON.parse(raw) as UserProfile) : raw;
    cacheSet(ck, profile, CACHE_TTL.USER);
    return profile;
  } catch {
    return empty;
  }
}

export async function saveProfile(
  userId: string,
  profile: UserProfile,
): Promise<boolean> {
  const redis = getRedis();
  if (!redis) return false;
  try {
    await redis.set(u(userId).profile, JSON.stringify(profile));
    invalidateUser(userId);
    return true;
  } catch {
    return false;
  }
}

/**
 * One-time: copy global hunter:companies / visited / status into admin keys.
 * Does not delete globals. Sets hunter:migrated:v1.
 */
export async function maybeMigrateGlobalData(adminUserId: string): Promise<void> {
  const redis = getRedis();
  if (!redis) return;
  try {
    const flag = await redis.get(GLOBAL.migrated);
    if (flag) return;

    const keys = u(adminUserId);
    const [gCompanies, gVisited, gStatus] = await Promise.all([
      redis.get<string | CompanyProfile[]>(GLOBAL.companies),
      redis.smembers(GLOBAL.visited),
      redis.hgetall<Record<string, KanbanStatus>>(GLOBAL.status),
    ]);

    const existingCompanies = await redis.get(keys.companies);
    if (existingCompanies == null && gCompanies != null) {
      const companies =
        typeof gCompanies === "string"
          ? gCompanies
          : JSON.stringify(gCompanies);
      await redis.set(keys.companies, companies);
    }

    const visited = (gVisited as string[]) ?? [];
    if (visited.length > 0) {
      // Upstash sadd(key, ...members) — pass members as rest args safely
      await redis.sadd(keys.visited, visited[0], ...visited.slice(1));
    }

    if (gStatus && Object.keys(gStatus).length > 0) {
      await redis.hset(keys.status, gStatus);
    }

    await redis.set(GLOBAL.migrated, new Date().toISOString());
    invalidateUser(adminUserId);
    console.info("[hunter] Migrated global data → user", adminUserId);
  } catch (err) {
    console.warn("[hunter] maybeMigrateGlobalData failed:", err);
  }
}

export async function getUserAppState(userId: string): Promise<AppState> {
  const ck = userCacheKey(userId, "appState");
  const hit = cacheGet<AppState>(ck);
  if (hit !== undefined) return hit;

  const redis = getRedis();
  if (!redis) return { visited: [], status: {} };
  const keys = u(userId);
  try {
    const [visited, status] = await Promise.all([
      redis.smembers(keys.visited),
      redis.hgetall<Record<string, KanbanStatus>>(keys.status),
    ]);
    const state: AppState = {
      visited: (visited as string[]) ?? [],
      status: status ?? {},
    };
    cacheSet(ck, state, CACHE_TTL.USER);
    return state;
  } catch (err) {
    console.warn("[hunter] getUserAppState failed:", err);
    return { visited: [], status: {} };
  }
}

export async function markUserVisited(
  userId: string,
  jobId: string,
): Promise<void> {
  const redis = getRedis();
  if (!redis) return;
  try {
    await redis.sadd(u(userId).visited, jobId);
    invalidateUser(userId);
  } catch (err) {
    console.warn("[hunter] markUserVisited failed:", err);
  }
}

export async function setUserJobStatus(
  userId: string,
  jobId: string,
  status: KanbanStatus,
): Promise<void> {
  const redis = getRedis();
  if (!redis) return;
  try {
    await redis.hset(u(userId).status, { [jobId]: status });
    invalidateUser(userId);
  } catch (err) {
    console.warn("[hunter] setUserJobStatus failed:", err);
  }
}

export async function patchUserJobState(
  userId: string,
  jobId: string,
  patch: { visited?: boolean; status?: KanbanStatus },
): Promise<AppState> {
  if (patch.visited) await markUserVisited(userId, jobId);
  if (patch.status) await setUserJobStatus(userId, jobId, patch.status);
  return getUserAppState(userId);
}


/** Backfill hunter:users:ids from byEmail hash if the set is empty/missing. */
export async function ensureUserIdsIndex(): Promise<void> {
  const redis = getRedis();
  if (!redis) return;
  try {
    const existing = await redis.scard(GLOBAL.userIds);
    if (existing && existing > 0) return;
    const map = await redis.hgetall<Record<string, string>>(GLOBAL.usersByEmail);
    if (!map || Object.keys(map).length === 0) return;
    const ids = [...new Set(Object.values(map))];
    if (ids.length === 0) return;
    await redis.sadd(GLOBAL.userIds, ids[0], ...ids.slice(1));
    console.info("[hunter] Backfilled hunter:users:ids with", ids.length, "users");
  } catch (err) {
    console.warn("[hunter] ensureUserIdsIndex failed:", err);
  }
}

export async function listAllUsers(): Promise<User[]> {
  const redis = getRedis();
  if (!redis) return [];
  try {
    await ensureUserIdsIndex();
    let ids = (await redis.smembers(GLOBAL.userIds)) as string[];
    if (!ids || ids.length === 0) {
      const map = await redis.hgetall<Record<string, string>>(GLOBAL.usersByEmail);
      ids = map ? [...new Set(Object.values(map))] : [];
    }
    const users: User[] = [];
    for (const id of ids) {
      const u = await getUserById(id);
      if (u) users.push(u);
    }
    users.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    return users;
  } catch (err) {
    console.warn("[hunter] listAllUsers failed:", err);
    return [];
  }
}

export async function updateUserFields(
  userId: string,
  patch: { name?: string; phone?: string },
): Promise<User | null> {
  const user = await getUserById(userId);
  if (!user) return null;
  if (patch.name !== undefined) user.name = patch.name.trim().slice(0, 120);
  if (patch.phone !== undefined) {
    const p = patch.phone.trim().slice(0, 40);
    user.phone = p || undefined;
  }
  user.updatedAt = new Date().toISOString();
  const ok = await createUser(user);
  return ok ? user : null;
}

/** Stamp onboardingCompletedAt on the user record (idempotent). */
export async function markOnboardingComplete(
  userId: string,
): Promise<User | null> {
  const user = await getUserById(userId);
  if (!user) return null;
  if (user.onboardingCompletedAt) return user;
  user.onboardingCompletedAt = new Date().toISOString();
  user.updatedAt = user.onboardingCompletedAt;
  const ok = await createUser(user);
  return ok ? user : null;
}

export async function getFetchRuns(userId: string): Promise<FetchRun[]> {
  const ck = userCacheKey(userId, "fetchRuns");
  const hit = cacheGet<FetchRun[]>(ck);
  if (hit !== undefined) return hit;

  const redis = getRedis();
  if (!redis) return [];
  try {
    const raw = await redis.get<string | FetchRun[]>(u(userId).fetchRuns);
    if (raw == null) {
      cacheSet(ck, [], CACHE_TTL.USER);
      return [];
    }
    const runs = typeof raw === "string" ? (JSON.parse(raw) as FetchRun[]) : raw;
    const list = Array.isArray(runs) ? runs : [];
    cacheSet(ck, list, CACHE_TTL.USER);
    return list;
  } catch {
    return [];
  }
}

export async function saveFetchRuns(
  userId: string,
  runs: FetchRun[],
): Promise<boolean> {
  const redis = getRedis();
  if (!redis) return false;
  try {
    await redis.set(u(userId).fetchRuns, JSON.stringify(runs));
    invalidateUser(userId);
    return true;
  } catch {
    return false;
  }
}

export async function getLastFetchDate(userId: string): Promise<string | null> {
  const ck = userCacheKey(userId, "lastFetchDate");
  const hit = cacheGet<string | null>(ck);
  if (hit !== undefined) return hit;

  const redis = getRedis();
  if (!redis) return null;
  try {
    const raw = await redis.get<string>(u(userId).lastFetchDate);
    if (raw == null) {
      cacheSet(ck, null, CACHE_TTL.USER);
      return null;
    }
    const date = typeof raw === "string" ? raw : String(raw);
    cacheSet(ck, date, CACHE_TTL.USER);
    return date;
  } catch {
    return null;
  }
}

/**
 * Permanently delete a tenant: the user record, the email index, the id
 * index, and every `hunter:u:{id}:*` key (companies, profile, billing,
 * usage, fetch history, ingested jobs, every daily digest, dailyDates
 * index). Frees any storage quota the tenant was holding. Irreversible.
 */
export async function deleteUser(userId: string): Promise<boolean> {
  const redis = getRedis();
  if (!redis) return false;
  try {
    const user = await getUserById(userId);
    const keys = u(userId);

    const dailyDates = (await redis.smembers(keys.dailyDates)) as string[];
    const dailyKeys = (dailyDates ?? []).map((d) => keys.daily(d));

    const toDelete = [
      userKey(userId),
      keys.companies,
      keys.visited,
      keys.status,
      keys.profile,
      keys.usage,
      keys.billing,
      keys.fetchRuns,
      keys.lastFetchDate,
      keys.importHashes,
      keys.jobs,
      keys.dailyDates,
      ...dailyKeys,
    ];
    if (toDelete.length > 0) {
      await redis.del(...(toDelete as [string, ...string[]]));
    }
    if (user) {
      await redis.hdel(GLOBAL.usersByEmail, user.email.toLowerCase());
    }
    await redis.srem(GLOBAL.userIds, userId);
    invalidateUser(userId);
    return true;
  } catch (err) {
    console.warn("[hunter] deleteUser failed:", err);
    return false;
  }
}

export type AdminUserPatch = {
  name?: string;
  phone?: string;
  role?: "user" | "admin";
  companyPlan?: BillingAccount["companyPlan"];
  storagePlan?: BillingAccount["storagePlan"];
};

/**
 * Admin-only edit of another tenant: name/phone on the user record, plan
 * fields on billing. Refuses to demote the protected owner account
 * (isAdminEmail) away from admin — ensureAdminPrivileges would just
 * re-promote it on next request anyway, so blocking here avoids a
 * confusing UI flash.
 */
export async function adminUpdateUser(
  targetId: string,
  patch: AdminUserPatch,
  isProtectedEmail: (email: string) => boolean,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const user = await getUserById(targetId);
  if (!user) return { ok: false, error: "User not found" };

  if (
    patch.role !== undefined &&
    patch.role !== "admin" &&
    isProtectedEmail(user.email)
  ) {
    return { ok: false, error: "Cannot demote the protected admin account" };
  }

  let userChanged = false;
  if (patch.name !== undefined) {
    user.name = patch.name.trim().slice(0, 120) || user.name;
    userChanged = true;
  }
  if (patch.phone !== undefined) {
    const p = patch.phone.trim().slice(0, 40);
    user.phone = p || undefined;
    userChanged = true;
  }
  if (patch.role !== undefined) {
    user.role = patch.role;
    userChanged = true;
  }
  if (userChanged) {
    user.updatedAt = new Date().toISOString();
    const ok = await createUser(user);
    if (!ok) return { ok: false, error: "Failed to save user" };
  }

  if (patch.companyPlan !== undefined || patch.storagePlan !== undefined) {
    const billing = (await getBilling(targetId)) ?? { ...DEFAULT_BILLING };
    if (patch.companyPlan !== undefined) billing.companyPlan = patch.companyPlan;
    if (patch.storagePlan !== undefined) billing.storagePlan = patch.storagePlan;
    const ok = await setBilling(targetId, billing);
    if (!ok) return { ok: false, error: "Failed to save billing" };
  }

  invalidateUser(targetId);
  return { ok: true };
}

export async function setLastFetchDate(
  userId: string,
  date: string,
): Promise<void> {
  const redis = getRedis();
  if (!redis) return;
  try {
    await redis.set(u(userId).lastFetchDate, date);
    invalidateUser(userId);
  } catch (err) {
    console.warn("[hunter] setLastFetchDate failed:", err);
  }
}
