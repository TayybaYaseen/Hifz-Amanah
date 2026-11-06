// Session lifecycle shared by sign-in, two-factor, and every action that revokes sessions.
import { v7 as uuidv7 } from 'uuid';
import type { SessionTokens } from '@hifz/contracts';
import type { Executor } from '../../platform/db.ts';
import { ACCESS_TOKEN_TTL_MS, SESSION_TTL_MS } from './rules.ts';
import { newRefreshToken, sha256 } from './secrets.ts';
import type { TokenService } from './tokens.ts';

export type RevokeReason = 'SIGN_OUT' | 'PASSWORD_RESET' | 'PASSWORD_CHANGED' | 'DEACTIVATED' | 'TWO_FACTOR_RESET' | 'REFRESH_REUSE';

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
