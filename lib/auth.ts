import { createHmac, timingSafeEqual } from "crypto";

const COOKIE_NAME = "hunter_session";

export function getSessionCookieName() {
  return COOKIE_NAME;
}

function getSecret(): string | null {
  return process.env.SITE_PASSWORD ?? null;
}

/** Must match middleware Edge HMAC (key=password, msg=`hunter:${password}`). */
export function createSessionToken(password: string): string {
  return createHmac("sha256", password)
    .update(`hunter:${password}`)
    .digest("hex");
}

export function verifySession(token: string | undefined): boolean {
  const password = getSecret();
  if (!password) {
    return true;
  }
  if (!token) return false;
  const expected = createSessionToken(password);
  try {
    const a = Buffer.from(token);
    const b = Buffer.from(expected);
    if (a.length !== b.length) return false;
    return timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

export function checkPassword(password: string): boolean {
  const expected = getSecret();
  if (!expected) return true;
  try {
    const a = Buffer.from(password);
    const b = Buffer.from(expected);
    if (a.length !== b.length) return false;
    return timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

export function isAuthConfigured(): boolean {
  return Boolean(process.env.SITE_PASSWORD);
}
