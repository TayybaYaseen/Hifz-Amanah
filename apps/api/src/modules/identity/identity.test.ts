// F01 · Identity and authentication — unit (docs/specs/01-f01-identity-authentication.md)
import { describe, expect, it } from 'vitest';
import { checkPassword, isValidLoginId, loginIdKey, normalizeLoginId } from '@hifz/contracts';
import { Clock, MINUTE } from '../../platform/clock.ts';
import {
  OTP_MAX_ATTEMPTS,
  OTP_TTL_MS,
  canManageAccount,
  canSendOtp,
  isOtpUsable,
  isRecentSignIn,
  reachesLock,
  signInDelayMs,
} from './rules.ts';
import {
  canonicalRecoveryCode,
  decryptSecret,
  encryptSecret,
  hashPassword,
  keyedHash,
  newOtp,
  newRecoveryCode,
  verifyPassword,
} from './secrets.ts';
import { TokenService } from './tokens.ts';
import { currentTotp, matchTotpStep, newTotpSecret, totpStep } from './totp.ts';

describe('F01 · password policy', () => {
  // Password policy FR-AUTH-012: 8–64 characters, no composition rules, common passwords and the User ID rejected.
  it('F01-AC16 (US-004) rejects an initial password that does not meet the policy', () => {
    expect(checkPassword('Abc-123', 'ALIF-T1')).toBe('PASSWORD_TOO_SHORT');
    expect(checkPassword('', 'ALIF-T1')).toBe('PASSWORD_TOO_SHORT');
    expect(checkPassword('a'.repeat(65), 'ALIF-T1')).toBe('PASSWORD_TOO_LONG');
  });

  it('F01-AC16 (US-004) accepts a password that meets the policy', () => {
    expect(checkPassword('qmvzrtke', 'ALIF-T1')).toBeNull();
    expect(checkPassword('E2e-Test-Pass-1', 'teacher-a1')).toBeNull();
  });
});

describe('F01 · password hashing', () => {
  it('F01-AC15 (US-004) stores only a hash; the hash never contains the plain password', async () => {
    const password = 'Unique-Plain-Value-42';
    const stored = await hashPassword(password);
    expect(stored).toMatch(/^\$argon2id\$/);
    expect(stored).not.toContain(password);
    expect(await verifyPassword(stored, password)).toBe(true);
    expect(await verifyPassword(stored, 'Unique-Plain-Value-43')).toBe(false);
    expect(await hashPassword(password)).not.toBe(stored); // salted
  });

  it('F01 unit: a malformed stored hash fails closed', async () => {
    expect(await verifyPassword('not-a-hash', 'anything')).toBe(false);
  });
});

describe('F01 · User ID', () => {
  it('F01 unit: trims surrounding whitespace from the User ID before lookup', () => {
    expect(normalizeLoginId('  ALIF-T014 \t')).toBe('ALIF-T014');
    expect(loginIdKey(' ALIF-T014 ')).toBe('alif-t014');
    expect(isValidLoginId(' ALIF-T014 ')).toBe(true);
  });

  it('F01-AC2 (US-001) an email address typed as User ID never matches an account by email', () => {
    // Sign-in looks up only by User ID, and no User ID can contain "@" or ".", so an email can never match one.
    expect(isValidLoginId('teacher.a1@example.test')).toBe(false);
    expect(loginIdKey('teacher.a1@example.test')).toBe('teacher.a1@example.test');
  });

  it('F01-AC24 (US-003) User IDs are 3–32 letters, digits, and hyphens, compared case-insensitively', () => {
    for (const ok of ['abc', 'A'.repeat(32), 'ALIF-T014', '123', 'a-b-c']) expect(isValidLoginId(ok)).toBe(true);
    for (const bad of ['ab', 'A'.repeat(33), 'bad.id', 'bad id', 'bad_id', 'نام-123', '']) expect(isValidLoginId(bad)).toBe(false);
    expect(loginIdKey('ALIF-T014')).toBe(loginIdKey('alif-t014'));
  });
});

describe('F01 · recovery OTP', () => {
  const now = new Date('2026-11-02T10:00:00Z');
  const fresh = { expiresAt: new Date(now.getTime() + OTP_TTL_MS), attempts: 0, consumedAt: null, supersededAt: null };

  it('F01 unit: an OTP is 6 digits', () => {
    for (let i = 0; i < 200; i++) expect(newOtp()).toMatch(/^\d{6}$/);
  });

  it('F01-AC9 (US-002) rejects an expired OTP', () => {
    expect(isOtpUsable(fresh, now)).toBe(true);
    expect(isOtpUsable(fresh, new Date(now.getTime() + OTP_TTL_MS - 1))).toBe(true);
    expect(isOtpUsable(fresh, new Date(now.getTime() + OTP_TTL_MS))).toBe(false);
    expect(OTP_TTL_MS).toBe(10 * MINUTE);
  });

  it('F01-AC9 (US-002) rejects an OTP after the maximum number of wrong tries', () => {
    expect(OTP_MAX_ATTEMPTS).toBe(5);
    expect(isOtpUsable({ ...fresh, attempts: 4 }, now)).toBe(true);
    expect(isOtpUsable({ ...fresh, attempts: 5 }, now)).toBe(false);
  });

  it('F01 unit: a used or replaced OTP is not usable', () => {
    expect(isOtpUsable({ ...fresh, consumedAt: now }, now)).toBe(false);
    expect(isOtpUsable({ ...fresh, supersededAt: now }, now)).toBe(false);
  });

  it('F01-AC11 (US-002) refuses a new OTP while the request limit window is active', () => {
    expect(canSendOtp(3)).toBe(false);
    expect(canSendOtp(10)).toBe(false);
  });

  it('F01-AC11 (US-002) allows a new OTP once the limit window has passed', () => {
    // Once older requests leave the 60-minute window they no longer count.
    expect(canSendOtp(0)).toBe(true);
    expect(canSendOtp(2)).toBe(true);
  });

  it('F01 unit: OTP hashes are keyed, so the same OTP hashes differently under another pepper', () => {
    const a = keyedHash('pepper-one-'.padEnd(32, 'x'), 'user:123456');
    expect(a).not.toContain('123456');
    expect(keyedHash('pepper-two-'.padEnd(32, 'x'), 'user:123456')).not.toBe(a);
  });
});

describe('F01 · lockout (FR-AUTH-014, DEC-B67)', () => {
  it('F01-AC25 (US-001) the 10th failure in the window locks the account', () => {
    expect(reachesLock(9)).toBe(false);
    expect(reachesLock(10)).toBe(true);
  });

  it('F01 unit: progressive delay is 0 for 5 failures, then 1, 2, 4, 8 s, capped at 8 s', () => {
    expect([0, 4, 5, 6, 7, 8, 9, 10, 50].map(signInDelayMs)).toEqual([0, 0, 1000, 2000, 4000, 8000, 8000, 8000, 8000]);
  });
});

describe('F01 · account management (SRS §17.1, FR-AUTH-015)', () => {
  it('F01-AC26 (US-002) an Admin manages Teacher, Student, and Parent accounts only; the Owner also manages Admins', () => {
    for (const role of ['TEACHER', 'STUDENT', 'PARENT']) {
      expect(canManageAccount('ADMIN', role)).toBe(true);
      expect(canManageAccount('OWNER', role)).toBe(true);
    }
    expect(canManageAccount('ADMIN', 'ADMIN')).toBe(false);
    expect(canManageAccount('ADMIN', 'OWNER')).toBe(false);
    expect(canManageAccount('OWNER', 'ADMIN')).toBe(true);
    expect(canManageAccount('OWNER', 'OWNER')).toBe(false);
    for (const role of ['TEACHER', 'STUDENT', 'PARENT']) expect(canManageAccount(role, 'STUDENT')).toBe(false);
  });
});

describe('F01 · two-factor (FR-AUTH-016)', () => {
  it('F01-AC31 (US-072) the current authenticator code verifies to its time step; a wrong or old one does not', () => {
    const clock = new Clock();
    const secret = newTotpSecret();
    const code = currentTotp(secret, clock);
    expect(matchTotpStep(secret, code, clock)).toBe(totpStep(clock.now().getTime()));
    expect(matchTotpStep(secret, ((Number(code) + 1) % 1_000_000).toString().padStart(6, '0'), clock)).toBeNull();
    clock.advance(10 * MINUTE);
    expect(matchTotpStep(secret, code, clock)).toBeNull();
  });

  it('F01-AC32 (US-072) a sign-in is recent for 15 minutes', () => {
    const signedIn = new Date('2026-11-02T10:00:00Z');
    expect(isRecentSignIn(signedIn, new Date(signedIn.getTime() + 15 * MINUTE))).toBe(true);
    expect(isRecentSignIn(signedIn, new Date(signedIn.getTime() + 15 * MINUTE + 1))).toBe(false);
  });

  it('F01 unit: recovery codes are 10 characters plus a hyphen and compare without case or spacing', () => {
    const code = newRecoveryCode();
    expect(code).toMatch(/^[2-9A-Z]{5}-[2-9A-Z]{5}$/);
    expect(canonicalRecoveryCode(` ${code.toLowerCase()} `)).toBe(code.replace('-', ''));
  });

  it('F01 unit: authenticator secrets are encrypted at rest and tamper-evident', () => {
    const key = Buffer.alloc(32, 7);
    const sealed = encryptSecret(key, 'JBSWY3DPEHPK3PXP');
    expect(sealed).not.toContain('JBSWY3DPEHPK3PXP');
    expect(decryptSecret(key, sealed)).toBe('JBSWY3DPEHPK3PXP');
    const [iv, tag, data] = sealed.split('.');
    const flipped = `${iv}.${tag}.${data!.slice(0, -2)}${data!.endsWith('AA') ? 'BB' : 'AA'}`;
    expect(() => decryptSecret(key, flipped)).toThrow();
  });
});

describe('F01 · access tokens', () => {
  const key = new TextEncoder().encode('k'.repeat(32));

  it('F01-AC6 (US-001) an access token stops verifying after 15 minutes and reports expiry', async () => {
    const clock = new Clock();
    const tokens = new TokenService(key, clock);
    const token = await tokens.accessToken({ userId: 'u1', sessionId: 's1' });
    expect(await tokens.verifyAccess(token)).toEqual({ ok: true, claims: { userId: 'u1', sessionId: 's1' } });
    clock.advance(15 * MINUTE + 1000);
    expect(await tokens.verifyAccess(token)).toEqual({ ok: false, expired: true });
  });

  it('F01 unit: a challenge token cannot be used as an access token, nor a token signed with another key', async () => {
    const clock = new Clock();
    const tokens = new TokenService(key, clock);
    const challenge = await tokens.challengeToken({ userId: 'u1', kind: 'TWO_FACTOR_REQUIRED', deviceId: null });
    expect((await tokens.verifyAccess(challenge)).ok).toBe(false);
    const other = new TokenService(new TextEncoder().encode('z'.repeat(32)), clock);
    expect((await tokens.verifyAccess(await other.accessToken({ userId: 'u1', sessionId: 's1' }))).ok).toBe(false);
  });
});

describe('Decision review 2026-10-30 (SRS §17)', () => {
  it('F01-AC23 (US-004) the password policy is 8–64 characters with a common-password and User ID blocklist', () => {
    expect(checkPassword('1234567', 'ALIF-T1')).toBe('PASSWORD_TOO_SHORT');
    expect(checkPassword('Password123', 'ALIF-T1')).toBe('PASSWORD_TOO_COMMON');
    expect(checkPassword('PAKISTAN786', 'ALIF-T1')).toBe('PASSWORD_TOO_COMMON');
    expect(checkPassword('alif-t014', 'ALIF-T014')).toBe('PASSWORD_EQUALS_USER_ID');
    // No composition rules; counted in characters, not bytes.
    for (const ok of ['qmvzrtke', 'a calm river', 'حفظ امانہ', 'k'.repeat(64)]) expect(checkPassword(ok, 'ALIF-T1')).toBeNull();
    expect(checkPassword('حفظامان', 'ALIF-T1')).toBe('PASSWORD_TOO_SHORT');
  });
});
