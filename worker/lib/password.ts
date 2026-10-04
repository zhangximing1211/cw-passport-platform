// PBKDF2-SHA256 via WebCrypto (native in Workers; no bcrypt/argon2 native modules needed).
// Stored format: pbkdf2-sha256$<iterations>$<salt b64>$<hash b64>
// 100k iterations is the maximum the Workers runtime allows for PBKDF2.

const ITERATIONS = 100_000;
const encoder = new TextEncoder();

const toB64 = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes));
const fromB64 = (b64: string) => Uint8Array.from(atob(b64), (ch) => ch.charCodeAt(0));

async function derive(password: string, salt: Uint8Array, iterations: number): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey("raw", encoder.encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt, iterations }, key, 256);
  return new Uint8Array(bits);
}

export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  return `pbkdf2-sha256$${ITERATIONS}$${toB64(salt)}$${toB64(await derive(password, salt, ITERATIONS))}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [scheme, iterations, salt, hash] = stored.split("$");
  if (scheme !== "pbkdf2-sha256" || !iterations || !salt || !hash) return false;
  const actual = await derive(password, fromB64(salt), Number(iterations));
  const expected = fromB64(hash);
  if (actual.length !== expected.length) return false;
  // Constant-time comparison.
  let diff = 0;
  for (let i = 0; i < actual.length; i++) diff |= actual[i] ^ expected[i];
  return diff === 0;
}

/** Burns the same CPU as a real check, so unknown usernames can't be detected by timing. */
export async function fakeVerify(password: string): Promise<false> {
  await derive(password, new Uint8Array(16), ITERATIONS);
  return false;
}
