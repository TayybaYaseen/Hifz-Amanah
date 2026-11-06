// Identity rules as pure functions (no I/O), so they are unit-tested exhaustively.
// Values: FR-AUTH-014 / DEC-B10 (OTP and lockout), ARCHITECTURE.md §7.1 (access token),
// DEC-B65 (session lifetime), DEC-B66 (recent sign-in), DEC-B67 (progressive delay).
import { DAY, MINUTE } from '../../platform/clock.ts';

export const ACCESS_TOKEN_TTL_MS = 15 * MINUTE;
export const SESSION_TTL_MS = 30 * DAY; // DEC-B65: absolute, from sign-in
export const TWO_FACTOR_CHALLENGE_TTL_MS = 5 * MINUTE;
export const RECENT_SIGN_IN_MS = 15 * MINUTE; // DEC-B66

export const OTP_TTL_MS = 10 * MINUTE;
export const OTP_MAX_ATTEMPTS = 5;
export const OTP_REQUESTS_PER_WINDOW = 3;
export const OTP_REQUEST_WINDOW_MS = 60 * MINUTE;

export const LOCK_THRESHOLD = 10;
export const LOCK_WINDOW_MS = 15 * MINUTE;
export const LOCK_DURATION_MS = 15 * MINUTE;
export const DELAY_AFTER_FAILURES = 5;
export const MAX_DELAY_MS = 8_000;

export const RECOVERY_CODE_COUNT = 10;

export interface OtpState {
  expiresAt: Date;
  attempts: number;
  consumedAt: Date | null;
  supersededAt: Date | null;
}

/** An OTP can still be tried: not expired, not used, not replaced by a newer one, tries left (F01-AC9). */
export function isOtpUsable(otp: OtpState, now: Date): boolean {
  return (
    otp.consumedAt === null &&
    otp.supersededAt === null &&
    otp.attempts < OTP_MAX_ATTEMPTS &&
    now.getTime() < otp.expiresAt.getTime()
  );
}

/** Whether another OTP may be sent, given how many were sent in the last window (F01-AC11). */
export function canSendOtp(sentInWindow: number): boolean {
  return sentInWindow < OTP_REQUESTS_PER_WINDOW;
}

/**
 * Delay before answering a sign-in attempt, given the failures already recorded in the window (DEC-B67):
 * none for the first 5, then 1 s, 2 s, 4 s, 8 s, capped at 8 s.
 */
export function signInDelayMs(priorFailures: number): number {
  if (priorFailures < DELAY_AFTER_FAILURES) return 0;
  return Math.min(MAX_DELAY_MS, 1000 * 2 ** (priorFailures - DELAY_AFTER_FAILURES));
}

/** The failure just recorded brings the window to the lock threshold (F01-AC25). */
export function reachesLock(failuresInWindow: number): boolean {
  return failuresInWindow >= LOCK_THRESHOLD;
}

/** Recovery-code regeneration needs a sign-in within the recent window (F01-AC32). */
export function isRecentSignIn(authenticatedAt: Date, now: Date): boolean {
  return now.getTime() - authenticatedAt.getTime() <= RECENT_SIGN_IN_MS;
}

/** Account roles an actor may manage (reset password, deactivate, reset 2FA) — SRS §17.1, FR-AUTH-015. */
export function canManageAccount(actorRole: string, targetRole: string): boolean {
  if (actorRole === 'OWNER') return targetRole !== 'OWNER';
  if (actorRole === 'ADMIN') return targetRole === 'TEACHER' || targetRole === 'STUDENT' || targetRole === 'PARENT';
  return false;
}
