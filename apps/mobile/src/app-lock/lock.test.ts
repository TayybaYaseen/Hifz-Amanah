// F12 · Offline and synchronization — unit: app lock (F12-AC18, NFR-OFF-011; plan Q12)
import { describe, expect, it } from 'vitest';
import { testPinCrypto } from '../sync/testing/probe.ts';
import {
  AppLockManager,
  LOCK_AFTER_BACKGROUND_MS,
  MAX_WRONG_PINS,
  isValidPin,
  lockGate,
  lockRequiredFor,
  shouldLockAfterBackground,
  type KeyValueStore,
} from './lock.ts';

class MemoryStore implements KeyValueStore {
  readonly map = new Map<string, string>();
  async get(key: string) {
    return this.map.get(key) ?? null;
  }
  async set(key: string, value: string) {
    this.map.set(key, value);
  }
  async delete(key: string) {
    this.map.delete(key);
  }
}

const manager = (store = new MemoryStore(), user = 'b3f6c2a0-0000-4000-8000-00000000000a') => new AppLockManager(store, testPinCrypto, user, 10);

describe('F12 · app lock', () => {
  it('F12-AC18 (US-051) Owner and Admin must set an app lock at first sign-in; a Teacher may skip it', async () => {
    expect(lockRequiredFor('OWNER')).toBe(true);
    expect(lockRequiredFor('ADMIN')).toBe(true);
    expect(lockRequiredFor('TEACHER')).toBe(false);
    const fresh = await manager().status();
    expect(lockGate('OWNER', fresh, false)).toBe('SETUP_REQUIRED');
    expect(lockGate('ADMIN', fresh, false)).toBe('SETUP_REQUIRED');
    expect(lockGate('TEACHER', fresh, false)).toBe('SETUP_OFFERED');
    // Student and Parent are online-only: never offered.
    expect(lockGate('STUDENT', fresh, true)).toBe('OPEN');
    expect(lockGate('PARENT', fresh, true)).toBe('OPEN');

    const teacher = manager();
    await teacher.markOffered();
    expect(lockGate('TEACHER', await teacher.status(), true)).toBe('OPEN');
  });

  it('F12-AC18 (US-051) the app locks after 5 minutes in the background, and the PIN unlocks it', async () => {
    expect(shouldLockAfterBackground(null, 0)).toBe(false);
    expect(shouldLockAfterBackground(0, LOCK_AFTER_BACKGROUND_MS - 1)).toBe(false);
    expect(shouldLockAfterBackground(0, LOCK_AFTER_BACKGROUND_MS)).toBe(true);
    expect(shouldLockAfterBackground(10_000, 5_000)).toBe(true); // clock moved back: never fail open

    const lock = manager();
    await lock.setPin('482913');
    const status = await lock.status();
    expect(lockGate('ADMIN', status, true)).toBe('LOCKED');
    expect(lockGate('ADMIN', status, false)).toBe('OPEN');
    expect(await lock.verifyPin('482913')).toEqual({ ok: true });
  });

  it('F12-AC18 (US-051) 5 wrong PINs require signing in again; the count survives a restart', async () => {
    const store = new MemoryStore();
    let lock = manager(store);
    await lock.setPin('482913');
    for (let i = 1; i < MAX_WRONG_PINS; i++) {
      expect(await lock.verifyPin('000000')).toEqual({ ok: false, remaining: MAX_WRONG_PINS - i, lockedOut: false });
      lock = manager(store); // app killed and reopened: the counter is in secure storage
    }
    expect(await lock.verifyPin('000000')).toEqual({ ok: false, remaining: 0, lockedOut: true });
    // Even the right PIN no longer works.
    expect((await lock.verifyPin('482913')).ok).toBe(false);
    expect(lockGate('TEACHER', await lock.status(), true)).toBe('LOCKED_OUT');

    // After an online sign-in, the old PIN is forgotten and a new one is set.
    await lock.clearAfterReauth();
    expect(lockGate('OWNER', await lock.status(), true)).toBe('SETUP_REQUIRED');
    await lock.setPin('135790');
    expect(await lock.verifyPin('135790')).toEqual({ ok: true });
  });

  it('F12-AC18 (US-051) a right PIN resets the wrong count; "Forgot PIN" is the same as running out of tries', async () => {
    const lock = manager();
    await lock.setPin('482913');
    await lock.verifyPin('111111');
    await lock.verifyPin('482913');
    expect((await lock.status()).wrongAttempts).toBe(0);
    await lock.forgotPin();
    expect(lockGate('TEACHER', await lock.status(), true)).toBe('LOCKED_OUT');
  });

  it('F12 unit: only a salted hash of the PIN is stored, never the PIN; lock state is per account', async () => {
    const store = new MemoryStore();
    const a = manager(store, 'user-a');
    const b = manager(store, 'user-b');
    await a.setPin('482913');
    await b.setPin('482913');
    const values = [...store.map.values()];
    expect(values.some((v) => v.includes('482913'))).toBe(false);
    expect(store.map.get('hifz.lock.user-a.pinHash')).not.toBe(store.map.get('hifz.lock.user-b.pinHash'));
    expect([...store.map.keys()].every((k) => /^[A-Za-z0-9._-]+$/.test(k))).toBe(true);
  });

  it('F12 unit: a PIN is exactly 6 digits', () => {
    expect(isValidPin('123456')).toBe(true);
    for (const bad of ['12345', '1234567', '12345a', '۱۲۳۴۵۶', '']) expect(isValidPin(bad), bad).toBe(false);
  });

  it('F12 unit: fingerprint is an optional shortcut over the PIN', async () => {
    const lock = manager();
    await lock.setBiometric(true);
    expect((await lock.status()).biometric).toBe(false); // no PIN, no fingerprint
    await lock.setPin('482913');
    await lock.setBiometric(true);
    expect((await lock.status()).biometric).toBe(true);
    await lock.verifyPin('000000');
    await lock.biometricUnlocked();
    expect((await lock.status()).wrongAttempts).toBe(0);
  });
});
