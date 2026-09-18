/** Redis key helpers for multi-user tenancy. */

export const GLOBAL = {
  companies: "hunter:companies",
  visited: "hunter:visited",
  status: "hunter:status",
  migrated: "hunter:migrated:v1",
  usersByEmail: "hunter:users:byEmail",
  userIds: "hunter:users:ids",
} as const;

export function userKey(id: string) {
  return `hunter:user:${id}`;
}

export function u(userId: string) {
  return {
    companies: `hunter:u:${userId}:companies`,
    visited: `hunter:u:${userId}:visited`,
    status: `hunter:u:${userId}:status`,
    profile: `hunter:u:${userId}:profile`,
    usage: `hunter:u:${userId}:usage`,
    billing: `hunter:u:${userId}:billing`,
    fetchRuns: `hunter:u:${userId}:fetchRuns`,
    lastFetchDate: `hunter:u:${userId}:lastFetchDate`,
    importHashes: `hunter:u:${userId}:importHashes`,
  };
}
