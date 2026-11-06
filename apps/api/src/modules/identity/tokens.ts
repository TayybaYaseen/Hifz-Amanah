// Access tokens (JWT, ~15 min) and two-factor challenge tokens. Both are checked against the server clock.
// An access token also names its session, and every request re-checks that the session is still live,
// so sign-out, password reset, and deactivation take effect at once (F01-AC5, AC10, AC22).
import { SignJWT, jwtVerify, errors } from 'jose';
import type { Clock } from '../../platform/clock.ts';
import { ACCESS_TOKEN_TTL_MS, TWO_FACTOR_CHALLENGE_TTL_MS } from './rules.ts';

const ISSUER = 'hifzamanah-api';

export interface AccessClaims {
  userId: string;
  sessionId: string;
}

export interface ChallengeClaims {
  userId: string;
  kind: 'TWO_FACTOR_REQUIRED' | 'TWO_FACTOR_SETUP_REQUIRED';
  /** Carried from the password step to the session it creates. */
  deviceId: string | null;
}

export type VerifyResult<T> = { ok: true; claims: T } | { ok: false; expired: boolean };

export class TokenService {
  private readonly key: Uint8Array;
  private readonly clock: Clock;

  constructor(key: Uint8Array, clock: Clock) {
    this.key = key;
    this.clock = clock;
  }

  private sign(payload: Record<string, unknown>, audience: string, subject: string, ttlMs: number): Promise<string> {
    const now = Math.floor(this.clock.now().getTime() / 1000);
    return new SignJWT(payload)
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuer(ISSUER)
      .setAudience(audience)
      .setSubject(subject)
      .setIssuedAt(now)
      .setExpirationTime(now + Math.floor(ttlMs / 1000))
      .sign(this.key);
  }

  private async verify(token: string, audience: string): Promise<VerifyResult<Record<string, unknown>>> {
    try {
      const { payload } = await jwtVerify(token, this.key, {
        issuer: ISSUER,
        audience,
        algorithms: ['HS256'],
        currentDate: this.clock.now(),
      });
      return { ok: true, claims: payload };
    } catch (err) {
      return { ok: false, expired: err instanceof errors.JWTExpired };
    }
  }

  accessToken({ userId, sessionId }: AccessClaims): Promise<string> {
    return this.sign({ sid: sessionId }, 'access', userId, ACCESS_TOKEN_TTL_MS);
  }

  async verifyAccess(token: string): Promise<VerifyResult<AccessClaims>> {
    const result = await this.verify(token, 'access');
    if (!result.ok) return result;
    const { sub, sid } = result.claims;
    if (typeof sub !== 'string' || typeof sid !== 'string') return { ok: false, expired: false };
    return { ok: true, claims: { userId: sub, sessionId: sid } };
  }

  challengeToken({ userId, kind, deviceId }: ChallengeClaims): Promise<string> {
    return this.sign({ kind, did: deviceId }, 'two-factor', userId, TWO_FACTOR_CHALLENGE_TTL_MS);
  }

  async verifyChallenge(token: string): Promise<VerifyResult<ChallengeClaims>> {
    const result = await this.verify(token, 'two-factor');
    if (!result.ok) return result;
    const { sub, kind, did } = result.claims;
    if (typeof sub !== 'string' || (kind !== 'TWO_FACTOR_REQUIRED' && kind !== 'TWO_FACTOR_SETUP_REQUIRED')) {
      return { ok: false, expired: false };
    }
    return { ok: true, claims: { userId: sub, kind, deviceId: typeof did === 'string' ? did : null } };
  }
}
