// TOTP for Owner/Admin two-factor sign-in (FR-AUTH-016): RFC 6238, SHA-1, 6 digits, 30-second steps,
// accepting one step of drift either way. Callers record the matched step so a code cannot be reused.
import { Secret, TOTP } from 'otpauth';
import type { Clock } from '../../platform/clock.ts';

const ISSUER = 'HifzAmanah';
const PERIOD_S = 30;

function totpFor(secretBase32: string, label: string): TOTP {
  return new TOTP({ issuer: ISSUER, label, algorithm: 'SHA1', digits: 6, period: PERIOD_S, secret: Secret.fromBase32(secretBase32) });
}

export function newTotpSecret(): string {
  return new Secret({ size: 20 }).base32;
}

export function totpUri(secretBase32: string, loginId: string): string {
  return totpFor(secretBase32, loginId).toString();
}

/** The time step of a millisecond timestamp. */
export function totpStep(ms: number): number {
  return Math.floor(ms / 1000 / PERIOD_S);
}

/** Returns the time step the code belongs to, or null when it matches none within ±1 step. */
export function matchTotpStep(secretBase32: string, code: string, clock: Clock): number | null {
  const now = clock.now().getTime();
  const delta = totpFor(secretBase32, 'x').validate({ token: code, timestamp: now, window: 1 });
  return delta === null ? null : totpStep(now) + delta;
}

/** A code for the given step. Used by the test-control API only (personas' seeded secrets). */
export function totpForStep(secretBase32: string, step: number): string {
  return totpFor(secretBase32, 'x').generate({ timestamp: step * PERIOD_S * 1000 });
}

/** The current code. Used by tests only. */
export function currentTotp(secretBase32: string, clock: Clock): string {
  return totpForStep(secretBase32, totpStep(clock.now().getTime()));
}
