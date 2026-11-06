// My profile (US-071, FR-AUTH-006) and recovery-code regeneration (US-072, FR-AUTH-016).
// A user only ever reads or changes their own account here; the target is always the session's user.
import {
  TWO_FACTOR_ROLES,
  checkPassword,
  type Locale,
  type MeResponse,
  type RecoveryCodesResponse,
} from '@hifz/contracts';
import type { Clock } from '../../platform/clock.ts';
import type { Db } from '../../platform/db.ts';
import { AppError, fieldError } from '../../platform/errors.ts';
import { recordAudit } from '../audit/audit.ts';
import type { Actor, AuthService } from './auth-service.ts';
import { isRecentSignIn } from './rules.ts';
import { hashPassword } from './secrets.ts';
import { revokeSessions } from './sessions.ts';

export interface ProfilePatch {
  displayName?: string | undefined;
  email?: string | null | undefined;
  preferredLocale?: Locale | undefined;
  /** Required when the email changes (DEC-B69). Never stored or logged. */
  currentPassword?: string | undefined;
}

export class ProfileService {
  private readonly db: Db;
  private readonly clock: Clock;
  private readonly auth: AuthService;

  constructor(db: Db, clock: Clock, auth: AuthService) {
    this.db = db;
    this.clock = clock;
    this.auth = auth;
  }

  async me(actor: Actor): Promise<MeResponse> {
    const row = await this.db
      .selectFrom('users')
      .innerJoin('organizations', 'organizations.id', 'users.organization_id')
      .leftJoin('user_totp', 'user_totp.user_id', 'users.id')
      .select([
        'users.id',
        'users.login_id',
        'users.display_name',
        'users.email',
        'users.preferred_locale',
        'organizations.id as org_id',
        'organizations.name as org_name',
        'user_totp.enabled_at',
      ])
      .where('users.id', '=', actor.userId)
      .executeTakeFirstOrThrow();
    return {
      id: row.id,
      loginId: row.login_id,
      displayName: row.display_name,
      email: row.email,
      role: actor.role,
      organization: { id: row.org_id, name: row.org_name },
      preferredLocale: row.preferred_locale,
      twoFactorEnabled: row.enabled_at !== null,
    };
  }

  /**
   * Only display name, email, and language can change; the schema rejects anything else (F01-AC29).
   * Changing the email needs the current password, because the email receives password-reset codes: a borrowed
   * session must not be able to redirect recovery (DEC-B69). Nothing changes unless the password is right.
   */
  async update(actor: Actor, patch: ProfilePatch): Promise<MeResponse> {
    const changes: { display_name?: string; email?: string | null; preferred_locale?: Locale } = {};
    if (patch.displayName !== undefined) changes.display_name = patch.displayName;
    if (patch.email !== undefined) {
      const current = await this.db.selectFrom('users').select('email').where('id', '=', actor.userId).executeTakeFirstOrThrow();
      if (patch.email !== current.email) {
        if (!patch.currentPassword) throw fieldError('currentPassword', 'REQUIRED');
        // Same throttle and lock as sign-in, so this cannot be used to guess the password.
        const user = await this.auth.checkPasswordThrottled(actor.loginId, patch.currentPassword);
        if (!user || user.id !== actor.userId) throw new AppError('CURRENT_PASSWORD_INCORRECT');
        changes.email = patch.email;
      }
    }
    if (patch.preferredLocale !== undefined) changes.preferred_locale = patch.preferredLocale;
    const fields = Object.keys(changes);
    if (fields.length) {
      const now = this.clock.now();
      await this.db.transaction().execute(async (tx) => {
        await tx.updateTable('users').set({ ...changes, updated_at: now }).where('id', '=', actor.userId).execute();
        await recordAudit(tx, {
          organizationId: actor.organizationId,
          actorUserId: actor.userId,
          action: 'PROFILE_UPDATED',
          targetType: 'USER',
          targetId: actor.userId,
          summary: { fields },
          at: now,
        });
      });
    }
    return this.me(actor);
  }

  /** Needs the current password; revokes the user's other sessions and is audited (F01-AC28). */
  async changePassword(actor: Actor, currentPassword: string, newPassword: string): Promise<void> {
    // Guesses count toward the same lock as sign-in, so a borrowed session cannot brute-force it (code review L5).
    const user = await this.auth.checkPasswordThrottled(actor.loginId, currentPassword);
    if (!user || user.id !== actor.userId) throw new AppError('CURRENT_PASSWORD_INCORRECT');
    const issue = checkPassword(newPassword, user.login_id);
    if (issue) throw fieldError('newPassword', issue);
    const passwordHash = await hashPassword(newPassword);
    const now = this.clock.now();
    await this.db.transaction().execute(async (tx) => {
      await tx.updateTable('users').set({ password_hash: passwordHash, updated_at: now }).where('id', '=', actor.userId).execute();
      await revokeSessions(tx, actor.userId, now, 'PASSWORD_CHANGED', actor.sessionId);
      await recordAudit(tx, {
        organizationId: actor.organizationId,
        actorUserId: actor.userId,
        action: 'PASSWORD_CHANGED',
        targetType: 'USER',
        targetId: actor.userId,
        at: now,
      });
    });
  }

  /** Needs a sign-in within 15 minutes (DEC-B66) and an authenticator code; voids every earlier code (F01-AC32). */
  async regenerateRecoveryCodes(actor: Actor, code: string): Promise<RecoveryCodesResponse> {
    if (!TWO_FACTOR_ROLES.includes(actor.role)) throw new AppError('FORBIDDEN');
    const now = this.clock.now();
    if (!isRecentSignIn(actor.authenticatedAt, now)) throw new AppError('REAUTH_REQUIRED');
    if (!(await this.auth.checkTotpThrottled(await this.auth.userOf(actor), code))) throw new AppError('TWO_FACTOR_INVALID');
    return this.db.transaction().execute(async (tx) => {
      const recoveryCodes = await this.auth.replaceRecoveryCodes(tx, actor.userId, now);
      await recordAudit(tx, {
        organizationId: actor.organizationId,
        actorUserId: actor.userId,
        action: 'RECOVERY_CODES_REGENERATED',
        targetType: 'USER',
        targetId: actor.userId,
        at: now,
      });
      return { recoveryCodes };
    });
  }
}
