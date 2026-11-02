// Account management by Owner/Admin (US-003, US-004, US-006; FR-AUTH-009/013/015/016, SRS §17.1).
// Every lookup is scoped to the actor's organization; anything outside it is "not found" (FR-SEC-008).
import { v7 as uuidv7 } from 'uuid';
import {
  checkPassword,
  isValidLoginId,
  loginIdKey,
  normalizeLoginId,
  type AccountListResponse,
  type AccountResponse,
  type CreateAccountRequest,
  type LoginIdSuggestionResponse,
} from '@hifz/contracts';
import type { Clock } from '../../platform/clock.ts';
import type { Db } from '../../platform/db.ts';
import { AppError, fieldError } from '../../platform/errors.ts';
import { recordAudit } from '../audit/audit.ts';
import type { Actor } from './auth-service.ts';
import { canManageAccount } from './rules.ts';
import { hashPassword } from './secrets.ts';
import { revokeSessions } from './sessions.ts';

export const ACCOUNTS_PAGE_SIZE = 25; // NFR-PERF-001, DEC-B59

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const isStaff = (actor: Actor) => actor.role === 'OWNER' || actor.role === 'ADMIN';

export class AccountsService {
  private readonly db: Db;
  private readonly clock: Clock;

  constructor(db: Db, clock: Clock) {
    this.db = db;
    this.clock = clock;
  }

  private baseQuery(organizationId: string) {
    return this.db
      .selectFrom('users')
      .innerJoin('memberships', (join) =>
        join.onRef('memberships.user_id', '=', 'users.id').onRef('memberships.organization_id', '=', 'users.organization_id'),
      )
      .leftJoin('user_totp', 'user_totp.user_id', 'users.id')
      .select([
        'users.id',
        'users.login_id',
        'users.display_name',
        'users.email',
        'users.status',
        'users.locked_until',
        'users.created_at',
        'memberships.role',
        'user_totp.enabled_at',
      ])
      .where('users.organization_id', '=', organizationId)
      .where((eb) => eb.or([eb('memberships.status', '=', 'ACTIVE'), eb('users.status', '=', 'DEACTIVATED')]));
  }

  private toResponse(row: {
    id: string;
    login_id: string;
    display_name: string;
    email: string | null;
    status: 'ACTIVE' | 'DEACTIVATED';
    locked_until: Date | null;
    created_at: Date;
    role: AccountResponse['role'];
    enabled_at: Date | null;
  }): AccountResponse {
    const now = this.clock.now();
    return {
      id: row.id,
      loginId: row.login_id,
      displayName: row.display_name,
      email: row.email,
      role: row.role,
      status: row.status,
      lockedUntil: row.locked_until && row.locked_until > now ? row.locked_until.toISOString() : null,
      twoFactorEnabled: row.enabled_at !== null,
      createdAt: row.created_at.toISOString(),
    };
  }

  /** Loads an account in the actor's madrasa. Out of scope or missing is the same NOT_FOUND (F01-AC20). */
  private async load(actor: Actor, id: string) {
    if (!isStaff(actor) || !UUID.test(id)) throw new AppError('NOT_FOUND');
    const row = await this.baseQuery(actor.organizationId).where('users.id', '=', id).executeTakeFirst();
    if (!row) throw new AppError('NOT_FOUND');
    return row;
  }

  suggestLoginId(actor: Actor): Promise<LoginIdSuggestionResponse> {
    if (!isStaff(actor)) throw new AppError('FORBIDDEN');
    return this.db
      .selectFrom('organizations')
      .select('code')
      .where('id', '=', actor.organizationId)
      .executeTakeFirstOrThrow()
      .then(({ code }) => ({ prefix: `${code.toUpperCase()}-` }));
  }

  async create(actor: Actor, input: CreateAccountRequest): Promise<AccountResponse> {
    if (!isStaff(actor)) throw new AppError('FORBIDDEN');
    const loginId = normalizeLoginId(input.loginId);
    if (!isValidLoginId(loginId)) throw fieldError('loginId', 'LOGIN_ID_FORMAT');
    const issue = checkPassword(input.password, loginId);
    if (issue) throw fieldError('password', issue);
    const taken = await this.db
      .selectFrom('users')
      .select('id')
      .where((eb) => eb(eb.fn('lower', ['login_id']), '=', loginIdKey(loginId)))
      .executeTakeFirst();
    if (taken) throw new AppError('LOGIN_ID_TAKEN');

    const now = this.clock.now();
    const id = uuidv7();
    const passwordHash = await hashPassword(input.password);
    try {
      await this.db.transaction().execute(async (tx) => {
        await tx
          .insertInto('users')
          .values({
            id,
            organization_id: actor.organizationId,
            login_id: loginId,
            password_hash: passwordHash,
            email: input.email ?? null,
            display_name: input.displayName,
            preferred_locale: 'en',
            status: 'ACTIVE',
            locked_until: null,
            created_at: now,
            updated_at: now,
            deactivated_at: null,
          })
          .execute();
        await tx
          .insertInto('memberships')
          .values({
            id: uuidv7(),
            organization_id: actor.organizationId,
            user_id: id,
            role: input.role,
            all_classes: false,
            status: 'ACTIVE',
            created_at: now,
            revoked_at: null,
          })
          .execute();
        await recordAudit(tx, {
          organizationId: actor.organizationId,
          actorUserId: actor.userId,
          action: 'ACCOUNT_CREATED',
          targetType: 'USER',
          targetId: id,
          summary: { loginId, role: input.role, hasEmail: input.email != null },
          at: now,
        });
      });
    } catch (err) {
      // Two Admins racing for the same User ID: the unique index decides.
      if ((err as { code?: string }).code === '23505') throw new AppError('LOGIN_ID_TAKEN');
      throw err;
    }
    return this.get(actor, id);
  }

  async get(actor: Actor, id: string): Promise<AccountResponse> {
    return this.toResponse(await this.load(actor, id));
  }

  async list(actor: Actor, page: number): Promise<AccountListResponse> {
    if (!isStaff(actor)) throw new AppError('FORBIDDEN');
    const rows = await this.baseQuery(actor.organizationId)
      .orderBy('users.login_id')
      .limit(ACCOUNTS_PAGE_SIZE)
      .offset((page - 1) * ACCOUNTS_PAGE_SIZE)
      .execute();
    // Counted over the same rows the page lists (code review L8).
    const total = await this.baseQuery(actor.organizationId)
      .clearSelect()
      .select((eb) => eb.fn.countAll<string>().as('n'))
      .executeTakeFirstOrThrow();
    return { items: rows.map((r) => this.toResponse(r)), page, pageSize: ACCOUNTS_PAGE_SIZE, total: Number(total.n) };
  }

  /** Deactivates an account: it can no longer sign in and its sessions end at once (F01-AC21, AC22). */
  async deactivate(actor: Actor, id: string): Promise<AccountResponse> {
    const target = await this.load(actor, id);
    if (!canManageAccount(actor.role, target.role) || target.id === actor.userId) throw new AppError('FORBIDDEN');
    if (target.status === 'DEACTIVATED') return this.toResponse(target);
    const now = this.clock.now();
    await this.db.transaction().execute(async (tx) => {
      await tx.updateTable('users').set({ status: 'DEACTIVATED', deactivated_at: now, updated_at: now }).where('id', '=', id).execute();
      await revokeSessions(tx, id, now, 'DEACTIVATED');
      await recordAudit(tx, {
        organizationId: actor.organizationId,
        actorUserId: actor.userId,
        action: 'ACCOUNT_DEACTIVATED',
        targetType: 'USER',
        targetId: id,
        at: now,
      });
    });
    return this.get(actor, id);
  }

  /** Owner/Admin sets a user's password directly; only the Owner may do this for an Admin (F01-AC26). */
  async setPassword(actor: Actor, id: string, newPassword: string): Promise<void> {
    const target = await this.load(actor, id);
    if (!canManageAccount(actor.role, target.role)) throw new AppError('FORBIDDEN');
    const issue = checkPassword(newPassword, target.login_id);
    if (issue) throw fieldError('newPassword', issue);
    const passwordHash = await hashPassword(newPassword);
    const now = this.clock.now();
    await this.db.transaction().execute(async (tx) => {
      await tx.updateTable('users').set({ password_hash: passwordHash, updated_at: now }).where('id', '=', id).execute();
      await revokeSessions(tx, id, now, 'PASSWORD_RESET');
      await recordAudit(tx, {
        organizationId: actor.organizationId,
        actorUserId: actor.userId,
        action: 'PASSWORD_RESET',
        targetType: 'USER',
        targetId: id,
        summary: { method: 'ADMIN' },
        at: now,
      });
    });
  }

  /** Lost device: only the Owner resets an Admin's two-factor setup (F01-AC33). Owners are reset by the operator. */
  async resetTwoFactor(actor: Actor, id: string): Promise<void> {
    const target = await this.load(actor, id);
    if (actor.role !== 'OWNER' || target.role !== 'ADMIN') throw new AppError('FORBIDDEN');
    const now = this.clock.now();
    await this.db.transaction().execute(async (tx) => {
      await tx.deleteFrom('user_totp').where('user_id', '=', id).execute();
      await tx
        .updateTable('recovery_codes')
        .set({ invalidated_at: now })
        .where('user_id', '=', id)
        .where('used_at', 'is', null)
        .where('invalidated_at', 'is', null)
        .execute();
      await revokeSessions(tx, id, now, 'TWO_FACTOR_RESET');
      await recordAudit(tx, {
        organizationId: actor.organizationId,
        actorUserId: actor.userId,
        action: 'TWO_FACTOR_RESET',
        targetType: 'USER',
        targetId: id,
        at: now,
      });
    });
  }
}
