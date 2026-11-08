// Session lifecycle shared by sign-in, two-factor, and every action that revokes sessions.
import { v7 as uuidv7 } from 'uuid';
import type { SessionTokens } from '@hifz/contracts';
import type { Executor } from '../../platform/db.ts';
import { ACCESS_TOKEN_TTL_MS, SESSION_TTL_MS } from './rules.ts';
import { newRefreshToken, sha256 } from './secrets.ts';
import type { TokenService } from './tokens.ts';

export type RevokeReason =
  | 'SIGN_OUT'
  | 'PASSWORD_RESET'
  | 'PASSWORD_CHANGED'
  | 'DEACTIVATED'
  | 'MEMBERSHIP_REVOKED'
  | 'TWO_FACTOR_RESET'
  | 'REFRESH_REUSE'
  | 'ROLE_CHANGED';

/**
 * Sessions ended because the person's access to the madrasa was removed. Requests on them answer
 * 403 ACCESS_REVOKED so the app can lock the workspace (F12-AC14, NFR-OFF-010); every other ending
 * (sign-out, password reset, expiry, refresh reuse) stays 401 SESSION_EXPIRED.
 */
const ACCESS_REVOKED_REASONS: ReadonlySet<string> = new Set<RevokeReason>(['DEACTIVATED', 'MEMBERSHIP_REVOKED']);

/** Why a session can no longer be used, or null when it is live. */
export function sessionRefusal(
  session: { revoked_at: Date | null; revoked_reason: string | null; expires_at: Date },
  access: { accountActive: boolean; membershipActive: boolean },
  now: Date,
): 'SESSION_EXPIRED' | 'ACCESS_REVOKED' | null {
  if (session.revoked_at) return session.revoked_reason && ACCESS_REVOKED_REASONS.has(session.revoked_reason) ? 'ACCESS_REVOKED' : 'SESSION_EXPIRED';
  if (session.expires_at <= now) return 'SESSION_EXPIRED';
  if (!access.accountActive || !access.membershipActive) return 'ACCESS_REVOKED';
  return null;
}

export async function createSession(
  db: Executor,
  tokens: TokenService,
  userId: string,
  deviceId: string | null,
  now: Date,
): Promise<SessionTokens> {
  const id = uuidv7();
  const refreshToken = newRefreshToken();
  await db
    .insertInto('sessions')
    .values({
      id,
      user_id: userId,
      refresh_token_hash: sha256(refreshToken),
      previous_refresh_token_hash: null,
      device_id: deviceId,
      authenticated_at: now,
      created_at: now,
      expires_at: new Date(now.getTime() + SESSION_TTL_MS),
      revoked_at: null,
      revoked_reason: null,
    })
    .execute();
  return {
    accessToken: await tokens.accessToken({ userId, sessionId: id }),
    refreshToken,
    expiresIn: ACCESS_TOKEN_TTL_MS / 1000,
  };
}

/** Revokes every live session of a user, optionally keeping the caller's own (F01-AC28). */
export async function revokeSessions(
  db: Executor,
  userId: string,
  now: Date,
  reason: RevokeReason,
  exceptSessionId?: string,
): Promise<void> {
  let query = db
    .updateTable('sessions')
    .set({ revoked_at: now, revoked_reason: reason })
    .where('user_id', '=', userId)
    .where('revoked_at', 'is', null);
  if (exceptSessionId) query = query.where('id', '!=', exceptSessionId);
  await query.execute();
}
