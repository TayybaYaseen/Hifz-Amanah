// App lock (F12-AC18, NFR-OFF-011; plan Q12, decided 2026-11-08). Plain TypeScript, tested with Vitest.
// - A 6-digit PIN is the base; fingerprint is an optional shortcut.
// - After 5 wrong PINs, or "Forgot PIN", the user signs in again online with User ID + password.
// - The app locks after 5 minutes in the background and on a cold start with a stored session.
// - Required for Owner/Admin (set at their first sign-in on the device); optional for Teacher.
// - Lock state is per account on this device. Only a salted, iterated hash of the PIN is stored (secure storage);
//   the PIN is never logged or kept in memory longer than the check.
import type { Role } from '@hifz/contracts';

export const PIN_LENGTH = 6;
export const MAX_WRONG_PINS = 5;
export const LOCK_AFTER_BACKGROUND_MS = 5 * 60_000;
/** Hash iterations: slows down guessing if the stored hash ever leaked from secure storage. */
export const PIN_HASH_ROUNDS = 1000;

export function isValidPin(pin: string): boolean {
  return new RegExp(`^\\d{${PIN_LENGTH}}$`).test(pin);
}

export function lockRequiredFor(role: Role): boolean {
  return role === 'OWNER' || role === 'ADMIN';
}

/** Student and Parent are online-only and read-only: no app lock is offered (AGENTS.md §7). */
export function lockOfferedTo(role: Role): boolean {
  return role === 'OWNER' || role === 'ADMIN' || role === 'TEACHER';
}

/** F12-AC18: true when the app was in the background for 5 minutes or more. */
export function shouldLockAfterBackground(backgroundedAtMs: number | null, nowMs: number): boolean {
  if (backgroundedAtMs === null) return false;
  // A clock moved backwards counts as elapsed: never fail open.
  return nowMs - backgroundedAtMs >= LOCK_AFTER_BACKGROUND_MS || nowMs < backgroundedAtMs;
}

/** Secure key-value storage (expo-secure-store in the app, a Map in tests). */
export interface KeyValueStore {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
  delete(key: string): Promise<void>;
}

export interface PinCrypto {
  /** One SHA-256 over the UTF-8 text, as lowercase hex. */
  sha256Hex(text: string): Promise<string>;
  randomHex(bytes: number): string;
}

export async function hashPin(crypto: PinCrypto, pin: string, salt: string, rounds = PIN_HASH_ROUNDS): Promise<string> {
  let hash = await crypto.sha256Hex(`${salt}:${pin}`);
  for (let i = 1; i < rounds; i++) hash = await crypto.sha256Hex(`${salt}:${hash}`);
  return hash;
}

function equalConstantTime(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export interface LockStatus {
  /** A PIN is set. */
  configured: boolean;
  biometric: boolean;
  wrongAttempts: number;
  /** Five wrong PINs or "Forgot PIN": only an online sign-in clears it. */
  lockedOut: boolean;
  /** The Teacher was offered the lock once (and may have skipped it). */
  offered: boolean;
}

export type VerifyResult = { ok: true } | { ok: false; remaining: number; lockedOut: boolean };

export class AppLockManager {
  private readonly store: KeyValueStore;
  private readonly crypto: PinCrypto;
  private readonly prefix: string;
  private readonly rounds: number;

  constructor(store: KeyValueStore, crypto: PinCrypto, userId: string, rounds = PIN_HASH_ROUNDS) {
    this.store = store;
    this.crypto = crypto;
    // SecureStore keys allow only [A-Za-z0-9._-].
    this.prefix = `hifz.lock.${userId.replace(/[^A-Za-z0-9._-]/g, '')}.`;
    this.rounds = rounds;
  }

  private key(name: string): string {
    return this.prefix + name;
  }

  async status(): Promise<LockStatus> {
    const [hash, biometric, wrong, lockedOut, offered] = await Promise.all([
      this.store.get(this.key('pinHash')),
      this.store.get(this.key('biometric')),
      this.store.get(this.key('wrong')),
      this.store.get(this.key('lockedOut')),
      this.store.get(this.key('offered')),
    ]);
    return {
      configured: hash !== null,
      biometric: hash !== null && biometric === '1',
      wrongAttempts: Number(wrong ?? 0) || 0,
      lockedOut: lockedOut === '1',
      offered: offered === '1',
    };
  }

  async setPin(pin: string): Promise<void> {
    if (!isValidPin(pin)) throw new RangeError('PIN must be 6 digits');
    const salt = this.crypto.randomHex(16);
    const hash = await hashPin(this.crypto, pin, salt, this.rounds);
    await this.store.set(this.key('salt'), salt);
    await this.store.set(this.key('pinHash'), hash);
    await this.store.delete(this.key('wrong'));
    await this.store.delete(this.key('lockedOut'));
    await this.store.set(this.key('offered'), '1');
  }

  /** Checks a PIN. Wrong attempts persist across restarts; the 5th wrong PIN locks the user out. */
  async verifyPin(pin: string): Promise<VerifyResult> {
    const status = await this.status();
    if (status.lockedOut || !status.configured) return { ok: false, remaining: 0, lockedOut: status.lockedOut };
    const [salt, stored] = await Promise.all([this.store.get(this.key('salt')), this.store.get(this.key('pinHash'))]);
    const ok = isValidPin(pin) && salt !== null && stored !== null && equalConstantTime(await hashPin(this.crypto, pin, salt, this.rounds), stored);
    if (ok) {
      await this.store.delete(this.key('wrong'));
      return { ok: true };
    }
    const wrong = status.wrongAttempts + 1;
    await this.store.set(this.key('wrong'), String(wrong));
    if (wrong >= MAX_WRONG_PINS) {
      await this.store.set(this.key('lockedOut'), '1');
      return { ok: false, remaining: 0, lockedOut: true };
    }
    return { ok: false, remaining: MAX_WRONG_PINS - wrong, lockedOut: false };
  }

  /** "Forgot PIN": the same as running out of tries. */
  async forgotPin(): Promise<void> {
    await this.store.set(this.key('lockedOut'), '1');
  }

  /** After a successful online sign-in: the old PIN is forgotten and a new one is set next. */
  async clearAfterReauth(): Promise<void> {
    for (const name of ['pinHash', 'salt', 'wrong', 'lockedOut', 'biometric']) await this.store.delete(this.key(name));
  }

  /** Fingerprint unlock succeeded: resets the wrong-PIN count (fingerprint failures never count, the OS limits them). */
  async biometricUnlocked(): Promise<void> {
    await this.store.delete(this.key('wrong'));
  }

  async setBiometric(enabled: boolean): Promise<void> {
    if (enabled) await this.store.set(this.key('biometric'), '1');
    else await this.store.delete(this.key('biometric'));
  }

  async markOffered(): Promise<void> {
    await this.store.set(this.key('offered'), '1');
  }

  /** Teacher only (the caller checks the role): turns the lock off after the current PIN was verified. */
  async disable(): Promise<void> {
    for (const name of ['pinHash', 'salt', 'wrong', 'lockedOut', 'biometric']) await this.store.delete(this.key(name));
  }
}

/** The gate the root navigator applies, in order (UI spec §5). */
export type LockGate = 'LOCKED_OUT' | 'LOCKED' | 'SETUP_REQUIRED' | 'SETUP_OFFERED' | 'OPEN';

export function lockGate(role: Role, status: LockStatus, locked: boolean): LockGate {
  if (!lockOfferedTo(role)) return 'OPEN';
  if (status.lockedOut) return 'LOCKED_OUT';
  if (status.configured && locked) return 'LOCKED';
  if (!status.configured && lockRequiredFor(role)) return 'SETUP_REQUIRED';
  if (!status.configured && !status.offered) return 'SETUP_OFFERED';
  return 'OPEN';
}
