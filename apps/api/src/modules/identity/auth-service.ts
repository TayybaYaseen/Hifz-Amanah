// Sign-in, two-factor sign-in, refresh, sign-out, request authentication, and password recovery
// (US-001, US-002, US-005, US-072; FR-AUTH-001…003, 007, 014, 016).
import { v7 as uuidv7 } from 'uuid';
import {
  TWO_FACTOR_ROLES,
  checkPassword,
  loginIdKey,
  type Role,
  type SignInResponse,
  type SessionTokens,
  type TwoFactorSetupConfirmResponse,
  type TwoFactorSetupResponse,
} from '@hifz/contracts';
import type { Clock } from '../../platform/clock.ts';
import type { Db, Executor } from '../../platform/db.ts';
import { AppError, fieldError } from '../../platform/errors.ts';
import type { Mailer } from '../../platform/mailer.ts';
import { recordAudit } from '../audit/audit.ts';
import { resetOtpEmail } from './email-templates.ts';
import {
  ACCESS_TOKEN_TTL_MS,
  LOCK_DURATION_MS,
  LOCK_THRESHOLD,
  LOCK_WINDOW_MS,
  OTP_MAX_ATTEMPTS,
  OTP_REQUEST_WINDOW_MS,
  OTP_TTL_MS,
  RECOVERY_CODE_COUNT,
  canSendOtp,
  reachesLock,
  signInDelayMs,
} from './rules.ts';
import {
  burnPasswordCheck,
  canonicalRecoveryCode,
  decryptSecret,
  encryptSecret,
  hashPassword,
  keyedHash,
  newOtp,
  newRecoveryCode,
  newRefreshToken,
  sameHash,
  sha256,
  verifyPassword,
} from './secrets.ts';
import { createSession, revokeSessions, sessionRefusal } from './sessions.ts';
import type { TokenService } from './tokens.ts';
import { matchTotpStep, newTotpSecret, totpUri } from './totp.ts';

/** The authenticated caller. Organization and role come from the membership, never from the request (FR-SEC-009). */
export interface Actor {
  userId: string;
  sessionId: string;
  organizationId: string;
  role: Role;
  /** A Teacher's "all classes" flag (FR-SEC-003), re-read from the membership on every request. */
  allClasses: boolean;
  loginId: string;
  authenticatedAt: Date;
}

export interface AuthDeps {
  db: Db;
  clock: Clock;
  tokens: TokenService;
  mailer: Mailer;
  hashPepper: string;
  totpKey: Buffer;
  sleep: (ms: number) => Promise<void>;
  log: { error: (obj: object, msg: string) => void };
}

interface UserRow {
  id: string;
  organization_id: string;
  login_id: string;
  password_hash: string;
  email: string | null;
  preferred_locale: 'en' | 'ur' | 'ur-Latn';
  role: Role;
}

/** Attempts are throttled per key: the typed User ID for passwords, and the account for second factors. */
const passwordKey = (loginId: string) => loginIdKey(loginId);
const secondFactorKey = (userId: string) => `2fa:${userId}`;

const invalidCredentials = () => new AppError('INVALID_CREDENTIALS');

export class AuthService {
  private readonly d: AuthDeps;

  constructor(deps: AuthDeps) {
    this.d = deps;
  }

  private activeUsers(db: Executor) {
    return db
      .selectFrom('users')
      .innerJoin('memberships', (join) =>
        join.onRef('memberships.user_id', '=', 'users.id').on('memberships.status', '=', 'ACTIVE'),
      )
      .select([
        'users.id',
        'users.organization_id',
        'users.login_id',
        'users.password_hash',
        'users.email',
        'users.preferred_locale',
        'memberships.role',
      ])
      .where('users.status', '=', 'ACTIVE');
  }

  /** An active account with an active membership, found by User ID only — never by email (F01-AC2). */
  private findActiveUser(key: string): Promise<UserRow | undefined> {
    return this.activeUsers(this.d.db)
      .where((eb) => eb(eb.fn('lower', ['users.login_id']), '=', key))
      .executeTakeFirst();
  }

  private findActiveUserById(id: string): Promise<UserRow | undefined> {
    return this.activeUsers(this.d.db).where('users.id', '=', id).executeTakeFirst();
  }

  // ---------- Throttling (FR-AUTH-014, DEC-B10, DEC-B67) ----------

  private async failuresInWindow(key: string, now: Date): Promise<number> {
    const row = await this.d.db
      .selectFrom('login_failures')
      .select((eb) => eb.fn.countAll<string>().as('n'))
      .where('login_key', '=', key)
      .where('failed_at', '>', new Date(now.getTime() - LOCK_WINDOW_MS))
      .executeTakeFirstOrThrow();
    return Number(row.n);
  }

  private async isLocked(key: string, now: Date): Promise<boolean> {
    const lock = await this.d.db.selectFrom('login_locks').select('locked_until').where('login_key', '=', key).executeTakeFirst();
    return !!lock && lock.locked_until.getTime() > now.getTime();
  }

  /**
   * Counts an attempt BEFORE checking the secret, so a burst of parallel requests cannot all slip under the
   * lock: each one sees the attempts recorded before it. A successful attempt clears the key afterwards.
   * Returns the number of attempts in the window, including this one.
   */
  private async beginAttempt(key: string, now: Date): Promise<number> {
    await this.d.db.insertInto('login_failures').values({ login_key: key, failed_at: now }).execute();
    return this.failuresInWindow(key, now);
  }

  private async clearAttempts(key: string): Promise<void> {
    await this.d.db.deleteFrom('login_failures').where('login_key', '=', key).execute();
  }

  /** Locks the key once the window reaches the threshold, and audits the lock for a real account (F01-AC25). */
  private async lockIfReached(key: string, user: UserRow | undefined, attempts: number, now: Date, reason: 'PASSWORD' | 'TWO_FACTOR'): Promise<void> {
    if (!reachesLock(attempts) || (await this.isLocked(key, now))) return;
    const lockedUntil = new Date(now.getTime() + LOCK_DURATION_MS);
    await this.d.db.transaction().execute(async (tx) => {
      await tx
        .insertInto('login_locks')
        .values({ login_key: key, locked_until: lockedUntil })
        .onConflict((oc) => oc.column('login_key').doUpdateSet({ locked_until: lockedUntil }))
        .execute();
      if (!user) return;
      if (reason === 'PASSWORD') {
        await tx.updateTable('users').set({ locked_until: lockedUntil }).where('id', '=', user.id).execute();
      }
      await recordAudit(tx, {
        organizationId: user.organization_id,
        actorUserId: null,
        action: 'ACCOUNT_LOCKED',
        targetType: 'USER',
        targetId: user.id,
        summary: { reason, lockedUntil: lockedUntil.toISOString() },
        at: now,
      });
    });
  }

  /**
   * Runs one throttled attempt: delay, lock check, attempt counted first, then `check`.
   * Returns whether `check` succeeded; a failure may lock the key.
   */
  private async throttled(key: string, user: UserRow | undefined, reason: 'PASSWORD' | 'TWO_FACTOR', check: () => Promise<boolean>): Promise<boolean> {
    const now = this.d.clock.now();
    await this.d.sleep(signInDelayMs(await this.failuresInWindow(key, now)));
    if (await this.isLocked(key, now)) return false;
    const attempts = await this.beginAttempt(key, now);
    if (attempts > LOCK_THRESHOLD) {
      await this.lockIfReached(key, user, attempts, now, reason);
      return false;
    }
    if (await check()) {
      await this.clearAttempts(key);
      return true;
    }
    await this.lockIfReached(key, user, attempts, now, reason);
    return false;
  }

  /** Checks an account's password under the sign-in throttle. Also used to confirm the current password. */
  async checkPasswordThrottled(loginId: string, password: string): Promise<UserRow | null> {
    const user = await this.findActiveUser(passwordKey(loginId));
    const ok = await this.throttled(passwordKey(loginId), user, 'PASSWORD', async () => {
      if (!user) {
        // A real hash check, so an unknown User ID costs the same time as a wrong password.
        await burnPasswordCheck(password);
        return false;
      }
      return verifyPassword(user.password_hash, password);
    });
    return ok && user ? user : null;
  }

  /**
   * Verifies an authenticator code under its own throttle, which a correct password never resets (code review H1).
   * The matched time step is recorded, so the same code cannot be used twice (code review L1).
   */
  async checkTotpThrottled(user: UserRow, code: string, opts: { enable?: boolean } = {}): Promise<boolean> {
    return this.throttled(secondFactorKey(user.id), user, 'TWO_FACTOR', async () => {
      const totp = await this.d.db.selectFrom('user_totp').selectAll().where('user_id', '=', user.id).executeTakeFirst();
      if (!totp || Boolean(totp.enabled_at) === Boolean(opts.enable)) return false;
      const step = matchTotpStep(decryptSecret(this.d.totpKey, totp.secret_encrypted), code, this.d.clock);
      if (step === null) return false;
      const used = await this.d.db
        .updateTable('user_totp')
        .set(opts.enable ? { last_used_step: step, enabled_at: this.d.clock.now() } : { last_used_step: step })
        .where('user_id', '=', user.id)
        .where((eb) => eb.or([eb('last_used_step', 'is', null), eb('last_used_step', '<', step)]))
        .where('enabled_at', opts.enable ? 'is' : 'is not', null)
        .returning('user_id')
        .executeTakeFirst();
      return used !== undefined;
    });
  }

  /** Loads the account behind an actor, for checks that need the stored secrets. */
  async userOf(actor: Actor): Promise<UserRow> {
    const user = await this.findActiveUserById(actor.userId);
    if (!user) throw new AppError('SESSION_EXPIRED');
    return user;
  }

  // ---------- Sign-in ----------

  async signIn(loginId: string, password: string, deviceId: string | null): Promise<SignInResponse> {
    // Every refusal is the same error, whether or not the User ID exists, and whether or not it is locked.
    const user = await this.checkPasswordThrottled(loginId, password);
    if (!user) throw invalidCredentials();
    const now = this.d.clock.now();

    if (TWO_FACTOR_ROLES.includes(user.role)) {
      const totp = await this.d.db.selectFrom('user_totp').select('enabled_at').where('user_id', '=', user.id).executeTakeFirst();
      const kind = totp?.enabled_at ? 'TWO_FACTOR_REQUIRED' : 'TWO_FACTOR_SETUP_REQUIRED';
      return { step: kind, challengeToken: await this.d.tokens.challengeToken({ userId: user.id, kind, deviceId }) };
    }
    return { step: 'SIGNED_IN', ...(await createSession(this.d.db, this.d.tokens, user.id, deviceId, now)) };
  }

  private async challengeUser(
    challengeToken: string,
    kind: 'TWO_FACTOR_REQUIRED' | 'TWO_FACTOR_SETUP_REQUIRED',
  ): Promise<{ user: UserRow; deviceId: string | null }> {
    const result = await this.d.tokens.verifyChallenge(challengeToken);
    if (!result.ok || result.claims.kind !== kind) throw new AppError('SESSION_EXPIRED');
    const user = await this.findActiveUserById(result.claims.userId);
    if (!user || !TWO_FACTOR_ROLES.includes(user.role)) throw new AppError('SESSION_EXPIRED');
    return { user, deviceId: result.claims.deviceId };
  }

  /** First sign-in of an Owner/Admin: issue a new authenticator secret (F01-AC30). */
  async startTwoFactorSetup(challengeToken: string): Promise<TwoFactorSetupResponse> {
    const { user } = await this.challengeUser(challengeToken, 'TWO_FACTOR_SETUP_REQUIRED');
    const now = this.d.clock.now();
    const existing = await this.d.db.selectFrom('user_totp').select('enabled_at').where('user_id', '=', user.id).executeTakeFirst();
    if (existing?.enabled_at) throw new AppError('FORBIDDEN');
    const secret = newTotpSecret();
    const sealed = encryptSecret(this.d.totpKey, secret);
    await this.d.db
      .insertInto('user_totp')
      .values({ user_id: user.id, secret_encrypted: sealed, created_at: now, enabled_at: null, last_used_step: null })
      .onConflict((oc) => oc.column('user_id').doUpdateSet({ secret_encrypted: sealed, created_at: now, last_used_step: null }))
      .execute();
    return { secret, otpauthUri: totpUri(secret, user.login_id) };
  }

  /** Confirms the authenticator, issues 10 recovery codes, then signs in (F01-AC30). */
  async confirmTwoFactorSetup(challengeToken: string, code: string): Promise<TwoFactorSetupConfirmResponse> {
    const { user, deviceId } = await this.challengeUser(challengeToken, 'TWO_FACTOR_SETUP_REQUIRED');
    // Enabling happens in the same guarded update that accepts the code, so two confirmations cannot both win.
    if (!(await this.checkTotpThrottled(user, code, { enable: true }))) throw new AppError('TWO_FACTOR_INVALID');
    const now = this.d.clock.now();
    return this.d.db.transaction().execute(async (tx) => {
      const recoveryCodes = await this.replaceRecoveryCodes(tx, user.id, now);
      await recordAudit(tx, {
        organizationId: user.organization_id,
        actorUserId: user.id,
        action: 'TWO_FACTOR_ENABLED',
        targetType: 'USER',
        targetId: user.id,
        at: now,
      });
      const tokens = await createSession(tx, this.d.tokens, user.id, deviceId, now);
      return { step: 'SIGNED_IN' as const, ...tokens, recoveryCodes };
    });
  }

  /** Every later Owner/Admin sign-in: an authenticator code or an unused recovery code (F01-AC31). */
  async verifyTwoFactor(challengeToken: string, proof: { code: string } | { recoveryCode: string }): Promise<{ step: 'SIGNED_IN' } & SessionTokens> {
    const { user, deviceId } = await this.challengeUser(challengeToken, 'TWO_FACTOR_REQUIRED');

    if ('code' in proof) {
      if (!(await this.checkTotpThrottled(user, proof.code))) throw new AppError('TWO_FACTOR_INVALID');
      return { step: 'SIGNED_IN', ...(await createSession(this.d.db, this.d.tokens, user.id, deviceId, this.d.clock.now())) };
    }

    const codeHash = keyedHash(this.d.hashPepper, canonicalRecoveryCode(proof.recoveryCode));
    let tokens: SessionTokens | null = null;
    const ok = await this.throttled(secondFactorKey(user.id), user, 'TWO_FACTOR', async () => {
      const now = this.d.clock.now();
      tokens = await this.d.db.transaction().execute(async (tx) => {
        // Marking the code used in the same statement that checks it makes reuse impossible, even concurrently.
        const used = await tx
          .updateTable('recovery_codes')
          .set({ used_at: now })
          .where('user_id', '=', user.id)
          .where('code_hash', '=', codeHash)
          .where('used_at', 'is', null)
          .where('invalidated_at', 'is', null)
          .returning('id')
          .executeTakeFirst();
        if (!used) return null;
        await recordAudit(tx, {
          organizationId: user.organization_id,
          actorUserId: user.id,
          action: 'RECOVERY_CODE_USED',
          targetType: 'USER',
          targetId: user.id,
          at: now,
        });
        return createSession(tx, this.d.tokens, user.id, deviceId, now);
      });
      return tokens !== null;
    });
    if (!ok || !tokens) throw new AppError('TWO_FACTOR_INVALID');
    return { step: 'SIGNED_IN', ...(tokens as SessionTokens) };
  }

  /** Invalidates every earlier recovery code and stores 10 new ones, hashed. Returns them once, in plain text. */
  async replaceRecoveryCodes(db: Executor, userId: string, now: Date): Promise<string[]> {
    await db
      .updateTable('recovery_codes')
      .set({ invalidated_at: now })
      .where('user_id', '=', userId)
      .where('used_at', 'is', null)
      .where('invalidated_at', 'is', null)
      .execute();
    const codes = Array.from({ length: RECOVERY_CODE_COUNT }, newRecoveryCode);
    await db
      .insertInto('recovery_codes')
      .values(
        codes.map((code) => ({
          id: uuidv7(),
          user_id: userId,
          code_hash: keyedHash(this.d.hashPepper, canonicalRecoveryCode(code)),
          created_at: now,
          used_at: null,
          invalidated_at: null,
        })),
      )
      .execute();
    return codes;
  }

  // ---------- Sessions ----------

  /** Rotates the refresh token. Presenting a token that was already rotated revokes the session. */
  async refresh(refreshToken: string): Promise<SessionTokens> {
    const now = this.d.clock.now();
    const presented = sha256(refreshToken);
    const session = await this.d.db
      .selectFrom('sessions')
      .innerJoin('users', 'users.id', 'sessions.user_id')
      .leftJoin('memberships', (join) =>
        join.onRef('memberships.user_id', '=', 'users.id').on('memberships.status', '=', 'ACTIVE'),
      )
      .select([
        'sessions.id',
        'sessions.user_id',
        'sessions.expires_at',
        'sessions.revoked_at',
        'sessions.revoked_reason',
        'users.status',
        'memberships.id as membership_id',
      ])
      .where('sessions.refresh_token_hash', '=', presented)
      .executeTakeFirst();
    if (!session) {
      // A token that was already rotated is being replayed: treat it as stolen and end that session.
      // This write must commit before the error is returned, so it is not inside a transaction that throws.
      await this.d.db
        .updateTable('sessions')
        .set({ revoked_at: now, revoked_reason: 'REFRESH_REUSE' })
        .where('previous_refresh_token_hash', '=', presented)
        .where('revoked_at', 'is', null)
        .execute();
      throw new AppError('SESSION_EXPIRED');
    }
    // Removed access answers 403 ACCESS_REVOKED; every other ending stays 401 SESSION_EXPIRED (F12-AC14).
    const refusal = sessionRefusal(session, { accountActive: session.status === 'ACTIVE', membershipActive: Boolean(session.membership_id) }, now);
    if (refusal) throw new AppError(refusal);
    const next = newRefreshToken();
    // Compare-and-swap on the presented hash, so two concurrent refreshes cannot both succeed.
    const rotated = await this.d.db
      .updateTable('sessions')
      .set({ refresh_token_hash: sha256(next), previous_refresh_token_hash: presented })
      .where('id', '=', session.id)
      .where('refresh_token_hash', '=', presented)
      .where('revoked_at', 'is', null)
      .returning('id')
      .executeTakeFirst();
    if (!rotated) throw new AppError('SESSION_EXPIRED');
    return {
      accessToken: await this.d.tokens.accessToken({ userId: session.user_id, sessionId: session.id }),
      refreshToken: next,
      expiresIn: ACCESS_TOKEN_TTL_MS / 1000,
    };
  }

  /** Ends this session only; the user's other devices stay signed in (F01-AC5). */
  async signOut(actor: Actor): Promise<void> {
    await this.d.db
      .updateTable('sessions')
      .set({ revoked_at: this.d.clock.now(), revoked_reason: 'SIGN_OUT' })
      .where('id', '=', actor.sessionId)
      .where('revoked_at', 'is', null)
      .execute();
  }

  /** Sign-out after the access token has expired: the refresh token alone identifies the session (code review L4). */
  async signOutByRefreshToken(refreshToken: string): Promise<void> {
    await this.d.db
      .updateTable('sessions')
      .set({ revoked_at: this.d.clock.now(), revoked_reason: 'SIGN_OUT' })
      .where('refresh_token_hash', '=', sha256(refreshToken))
      .where('revoked_at', 'is', null)
      .execute();
  }

  /** Resolves a bearer token to a live session, account, and membership (ARCHITECTURE.md §7.2). */
  async authenticate(accessToken: string | undefined): Promise<Actor> {
    if (!accessToken) throw new AppError('UNAUTHENTICATED');
    const result = await this.d.tokens.verifyAccess(accessToken);
    if (!result.ok) throw new AppError(result.expired ? 'SESSION_EXPIRED' : 'UNAUTHENTICATED');
    const now = this.d.clock.now();
    const row = await this.d.db
      .selectFrom('sessions')
      .innerJoin('users', 'users.id', 'sessions.user_id')
      .leftJoin('memberships', (join) =>
        join.onRef('memberships.user_id', '=', 'users.id').on('memberships.status', '=', 'ACTIVE'),
      )
      .select([
        'sessions.id as sessionId',
        'sessions.authenticated_at',
        'sessions.expires_at',
        'sessions.revoked_at',
        'sessions.revoked_reason',
        'users.id as userId',
        'users.login_id',
        'users.status',
        'memberships.organization_id',
        'memberships.role',
        'memberships.all_classes',
      ])
      .where('sessions.id', '=', result.claims.sessionId)
      .where('sessions.user_id', '=', result.claims.userId)
      .executeTakeFirst();
    if (!row) throw new AppError('SESSION_EXPIRED');
    // Removed access answers 403 ACCESS_REVOKED so the app can lock the workspace; expiry, sign-out, and
    // password resets stay 401 SESSION_EXPIRED (F12-AC14, plan §5 "Identity change").
    const refusal = sessionRefusal(row, { accountActive: row.status === 'ACTIVE', membershipActive: row.organization_id !== null }, now);
    if (refusal) throw new AppError(refusal);
    if (row.organization_id === null || row.role === null || row.all_classes === null) throw new AppError('ACCESS_REVOKED');
    return {
      userId: row.userId,
      sessionId: row.sessionId,
      organizationId: row.organization_id,
      role: row.role,
      allClasses: row.all_classes,
      loginId: row.login_id,
      authenticatedAt: row.authenticated_at,
    };
  }

  // ---------- Password recovery (US-002, US-005) ----------

  /** Always answers the same way; sends an OTP only to the account's own email, within the rate limit. */
  async requestPasswordReset(loginId: string): Promise<void> {
    const now = this.d.clock.now();
    const user = await this.findActiveUser(loginIdKey(loginId));
    if (!user?.email) return;
    const otp = newOtp();
    const sent = await this.d.db.transaction().execute(async (tx) => {
      const recent = await tx
        .selectFrom('password_reset_otps')
        .select((eb) => eb.fn.countAll<string>().as('n'))
        .where('user_id', '=', user.id)
        .where('created_at', '>', new Date(now.getTime() - OTP_REQUEST_WINDOW_MS))
        .executeTakeFirstOrThrow();
      if (!canSendOtp(Number(recent.n))) {
        await recordAudit(tx, {
          organizationId: user.organization_id,
          actorUserId: null,
          action: 'PASSWORD_RESET_RATE_LIMITED',
          targetType: 'USER',
          targetId: user.id,
          at: now,
        });
        return false;
      }
      // A new OTP replaces any earlier one (F01 edge case).
      await tx
        .updateTable('password_reset_otps')
        .set({ superseded_at: now })
        .where('user_id', '=', user.id)
        .where('consumed_at', 'is', null)
        .where('superseded_at', 'is', null)
        .execute();
      await tx
        .insertInto('password_reset_otps')
        .values({
          id: uuidv7(),
          user_id: user.id,
          otp_hash: keyedHash(this.d.hashPepper, `${user.id}:${otp}`),
          created_at: now,
          expires_at: new Date(now.getTime() + OTP_TTL_MS),
          attempts: 0,
          consumed_at: null,
          superseded_at: null,
        })
        .execute();
      return true;
    });
    if (!sent) return;
    const { subject, text } = resetOtpEmail(user.preferred_locale, otp);
    // Not awaited: the response must not take longer for real accounts than for unknown ones (code review M3).
    this.d.mailer
      .send({ to: user.email, subject, text, meta: { userId: user.login_id, kind: 'PASSWORD_RESET_OTP' }, otp })
      .catch((err: unknown) => this.d.log.error({ err: (err as Error).name, kind: 'PASSWORD_RESET_OTP' }, 'reset email failed'));
  }

  /** Sets a new password after a valid OTP; revokes every session and audits without secrets (F01-AC9, AC10). */
  async confirmPasswordReset(loginId: string, otp: string, newPassword: string): Promise<void> {
    const now = this.d.clock.now();
    const user = await this.findActiveUser(loginIdKey(loginId));
    if (!user) throw new AppError('OTP_INVALID');
    // Reserve one try in the same statement that checks the limits, so parallel guesses cannot exceed 5 (code review M1).
    const reserved = await this.d.db
      .updateTable('password_reset_otps')
      .set((eb) => ({ attempts: eb('attempts', '+', 1) }))
      .where('user_id', '=', user.id)
      .where('consumed_at', 'is', null)
      .where('superseded_at', 'is', null)
      .where('attempts', '<', OTP_MAX_ATTEMPTS)
      .where('expires_at', '>', now)
      .returning(['id', 'otp_hash'])
      .executeTakeFirst();
    if (!reserved || !sameHash(reserved.otp_hash, keyedHash(this.d.hashPepper, `${user.id}:${otp.trim()}`))) {
      throw new AppError('OTP_INVALID');
    }
    const issue = checkPassword(newPassword, user.login_id);
    if (issue) throw fieldError('newPassword', issue);
    const passwordHash = await hashPassword(newPassword);
    const consumed = await this.d.db.transaction().execute(async (tx) => {
      const row = await tx
        .updateTable('password_reset_otps')
        .set({ consumed_at: now })
        .where('id', '=', reserved.id)
        .where('consumed_at', 'is', null)
        .returning('id')
        .executeTakeFirst();
      if (!row) return false;
      await tx.updateTable('users').set({ password_hash: passwordHash, updated_at: now }).where('id', '=', user.id).execute();
      await revokeSessions(tx, user.id, now, 'PASSWORD_RESET');
      await recordAudit(tx, {
        organizationId: user.organization_id,
        actorUserId: user.id,
        action: 'PASSWORD_RESET',
        targetType: 'USER',
        targetId: user.id,
        summary: { method: 'EMAIL_OTP' },
        at: now,
      });
      return true;
    });
    if (!consumed) throw new AppError('OTP_INVALID');
  }
}
