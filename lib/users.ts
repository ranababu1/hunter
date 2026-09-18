import { Redis } from "@upstash/redis";
import { hashPassword } from "./password";
import { GLOBAL, u, userKey } from "./keys";
import { adminBilling, DEFAULT_BILLING } from "./plans";
import { newUserId } from "./auth-id";
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
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;
  return new Redis({ url, token });
}

export async function getUserById(id: string): Promise<User | null> {
  const redis = getRedis();
  if (!redis) return null;
  try {
    const raw = await redis.get<string | User>(userKey(id));
    if (raw == null) return null;
    return typeof raw === "string" ? (JSON.parse(raw) as User) : raw;
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

/** Create or upsert user record + email index. */
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
  const redis = getRedis();
  if (!redis) return null;
  try {
    const raw = await redis.get<string | BillingAccount>(u(userId).billing);
    if (raw == null) return null;
    return typeof raw === "string"
      ? (JSON.parse(raw) as BillingAccount)
      : raw;
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
    return true;
  } catch {
    return false;
  }
}

export async function getUsage(userId: string): Promise<UsageMeter | null> {
  const redis = getRedis();
  if (!redis) return null;
  try {
    const raw = await redis.get<string | UsageMeter>(u(userId).usage);
    if (raw == null) return null;
    return typeof raw === "string" ? (JSON.parse(raw) as UsageMeter) : raw;
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
  const redis = getRedis();
  if (!redis) return empty;
  try {
    const raw = await redis.get<string | UserProfile>(u(userId).profile);
    if (raw == null) return empty;
    return typeof raw === "string" ? (JSON.parse(raw) as UserProfile) : raw;
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
    console.info("[hunter] Migrated global data → user", adminUserId);
  } catch (err) {
    console.warn("[hunter] maybeMigrateGlobalData failed:", err);
  }
}

export async function getUserAppState(userId: string): Promise<AppState> {
  const redis = getRedis();
  if (!redis) return { visited: [], status: {} };
  const keys = u(userId);
  try {
    const [visited, status] = await Promise.all([
      redis.smembers(keys.visited),
      redis.hgetall<Record<string, KanbanStatus>>(keys.status),
    ]);
    return {
      visited: (visited as string[]) ?? [],
      status: status ?? {},
    };
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

export async function getFetchRuns(userId: string): Promise<FetchRun[]> {
  const redis = getRedis();
  if (!redis) return [];
  try {
    const raw = await redis.get<string | FetchRun[]>(u(userId).fetchRuns);
    if (raw == null) return [];
    const runs = typeof raw === "string" ? (JSON.parse(raw) as FetchRun[]) : raw;
    return Array.isArray(runs) ? runs : [];
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
    return true;
  } catch {
    return false;
  }
}

export async function getLastFetchDate(userId: string): Promise<string | null> {
  const redis = getRedis();
  if (!redis) return null;
  try {
    const raw = await redis.get<string>(u(userId).lastFetchDate);
    if (raw == null) return null;
    return typeof raw === "string" ? raw : String(raw);
  } catch {
    return null;
  }
}

export async function setLastFetchDate(
  userId: string,
  date: string,
): Promise<void> {
  const redis = getRedis();
  if (!redis) return;
  try {
    await redis.set(u(userId).lastFetchDate, date);
  } catch (err) {
    console.warn("[hunter] setLastFetchDate failed:", err);
  }
}
