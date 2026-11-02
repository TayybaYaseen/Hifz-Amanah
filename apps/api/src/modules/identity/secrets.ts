// Hashing and secret handling. Passwords use Argon2id (DEC-B05). OTPs and recovery codes are short, so they
// are hashed with a keyed HMAC (server-side pepper) to resist offline guessing. Refresh tokens are random
// 256-bit values stored as SHA-256 hashes. TOTP secrets are encrypted at rest with AES-256-GCM.
import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, randomInt, timingSafeEqual } from 'node:crypto';
import { hash, verify } from '@node-rs/argon2';

// OWASP-recommended Argon2id parameters (19 MiB, 2 iterations, 1 lane).
// The library's `Algorithm` is a const enum, which type stripping cannot read; 2 is Algorithm.Argon2id.
const ARGON2_ID = 2;
const ARGON2 = { algorithm: ARGON2_ID, memoryCost: 19_456, timeCost: 2, parallelism: 1 } as const;

export function hashPassword(password: string): Promise<string> {
  return hash(password, ARGON2);
}

export async function verifyPassword(passwordHash: string, password: string): Promise<boolean> {
  try {
    return await verify(passwordHash, password);
  } catch {
    return false;
  }
}

// A real hash of a random value, verified when the User ID is unknown so both paths cost the same.
let dummyHash: Promise<string> | undefined;
export async function burnPasswordCheck(password: string): Promise<void> {
  dummyHash ??= hashPassword(randomBytes(16).toString('hex'));
  await verifyPassword(await dummyHash, password);
}

export function keyedHash(pepper: string, value: string): string {
  return createHmac('sha256', pepper).update(value).digest('base64url');
}

export function sameHash(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

export function sha256(value: string): string {
  return createHash('sha256').update(value).digest('base64url');
}

export function newRefreshToken(): string {
  return randomBytes(32).toString('base64url');
}

/** A 6-digit OTP (FR-AUTH-014), uniformly random. */
export function newOtp(): string {
  return randomInt(0, 1_000_000).toString().padStart(6, '0');
}

// Crockford base32 without look-alike characters.
const CODE_ALPHABET = '23456789ABCDEFGHJKMNPQRSTVWXYZ';

/** A one-time recovery code, XXXXX-XXXXX (about 49 bits). */
export function newRecoveryCode(): string {
  const pick = () => Array.from({ length: 5 }, () => CODE_ALPHABET[randomInt(CODE_ALPHABET.length)]).join('');
  return `${pick()}-${pick()}`;
}

/** Canonical form for comparing a typed recovery code: upper case, no spaces or hyphens. */
export function canonicalRecoveryCode(code: string): string {
  return code.toUpperCase().replace(/[\s-]/g, '');
}

export function encryptSecret(key: Buffer, plaintext: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const data = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  return [iv, cipher.getAuthTag(), data].map((b) => b.toString('base64url')).join('.');
}

export function decryptSecret(key: Buffer, sealed: string): string {
  const [iv, tag, data] = sealed.split('.').map((part) => Buffer.from(part, 'base64url'));
  if (!iv || !tag || !data) throw new Error('Malformed sealed secret');
  const decipher = createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(data), decipher.final()]).toString('utf8');
}
