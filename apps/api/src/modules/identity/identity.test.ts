// F01 · Identity and authentication — unit (docs/specs/01-f01-identity-authentication/)
import { describe, it } from 'vitest';

describe('F01 · password policy', () => {
  // Password policy FR-AUTH-012: 8–64 characters, no composition rules, common passwords and the User ID rejected.
  it.todo('F01-AC16 (US-004) rejects an initial password that does not meet the policy');
  it.todo('F01-AC16 (US-004) accepts a password that meets the policy');
});

describe('F01 · password hashing', () => {
  it.todo('F01-AC15 (US-004) stores only a hash; the hash never contains the plain password');
});

describe('F01 · User ID', () => {
  it.todo('F01 unit: trims surrounding whitespace from the User ID before lookup');
  it.todo('F01-AC2 (US-001) an email address typed as User ID never matches an account by email');
});

describe('F01 · recovery OTP', () => {
  it.todo('F01-AC9 (US-002) rejects an expired OTP');
  it.todo('F01-AC9 (US-002) rejects an OTP after the maximum number of wrong tries');
  it.todo('F01-AC11 (US-002) refuses a new OTP while the request limit window is active');
  it.todo('F01-AC11 (US-002) allows a new OTP once the limit window has passed');
});

describe('Decision review 2026-10-30 (SRS §17)', () => {
  it.todo('F01-AC23 (US-004) the password policy is 8–64 characters with a common-password and User ID blocklist');
});
