/**
 * PBKDF2-SHA256 password hashing via Web Crypto (Edge + Node).
 * Stored format: pbkdf2$<iterations>$<saltHex>$<hashHex>
 */

const ITERATIONS = 100_000;
const KEY_LEN = 32;
const SALT_LEN = 16;

function toHex(buf: ArrayBuffer | Uint8Array): string {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function fromHex(hex: string): Uint8Array {
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) {
    out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
}

function randomSalt(): Uint8Array {
  const salt = new Uint8Array(SALT_LEN);
  crypto.getRandomValues(salt);
  return salt;
}

async function derive(
  password: string,
  salt: Uint8Array,
  iterations: number,
): Promise<ArrayBuffer> {
  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    enc.encode(password),
    "PBKDF2",
    false,
    ["deriveBits"],
  );
  return crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      salt: salt as BufferSource,
      iterations,
      hash: "SHA-256",
    },
    keyMaterial,
    KEY_LEN * 8,
  );
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomSalt();
  const hash = await derive(password, salt, ITERATIONS);
  return `pbkdf2$${ITERATIONS}$${toHex(salt)}$${toHex(hash)}`;
}

export async function verifyPassword(
  password: string,
  stored: string,
): Promise<boolean> {
  const parts = stored.split("$");
  if (parts.length !== 4 || parts[0] !== "pbkdf2") return false;
  const iterations = parseInt(parts[1], 10);
  if (!Number.isFinite(iterations) || iterations < 1000) return false;
  const salt = fromHex(parts[2]);
  const expectedHex = parts[3];
  const actual = await derive(password, salt, iterations);
  const actualHex = toHex(actual);
  if (actualHex.length !== expectedHex.length) return false;
  let out = 0;
  for (let i = 0; i < actualHex.length; i++) {
    out |= actualHex.charCodeAt(i) ^ expectedHex.charCodeAt(i);
  }
  return out === 0;
}
