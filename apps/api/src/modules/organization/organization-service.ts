// Workspace settings (US-007; FR-ORG-001/002, FR-CAL-006, F02-AC1…AC5, AC16).
// The organization is always the caller's own, taken from their membership (FR-SEC-009).
import { v7 as uuidv7 } from 'uuid';
import {
  checkPassword,
  isValidLoginId,
  loginIdKey,
  normalizeLoginId,
  type OrganizationKind,
  type OrganizationSettingsResponse,
  type UpdateOrganizationRequest,
  type WeekDay,
} from '@hifz/contracts';
import type { Clock } from '../../platform/clock.ts';
import type { Selectable } from 'kysely';
import type { Db, OrganizationsTable } from '../../platform/db.ts';
import { AppError, fieldError } from '../../platform/errors.ts';
import { accessActor, can } from '../access/policy.ts';
import { recordAudit } from '../audit/audit.ts';
import type { Actor } from '../identity/auth-service.ts';
import { hashPassword } from '../identity/secrets.ts';
import { isIanaTimeZone, normalizeWorkspaceName, settingsDiff } from './rules.ts';

export interface NewWorkspace {
  kind: OrganizationKind;
  name: string;
  /** Short madrasa code, suggested as the User ID prefix (FR-AUTH-013). */
  code: string;
  owner: { loginId: string; displayName: string; email: string | null; password: string };
}

type Organization = Selectable<OrganizationsTable>;

const toResponse = (org: Organization, canEdit: boolean): OrganizationSettingsResponse => ({
  id: org.id,
  name: org.name,
  kind: org.kind,
  timezone: org.timezone,
  weekStart: org.week_start,
  dailyReportMode: org.daily_report_mode,
  canEdit,
});

export class OrganizationService {
  private readonly db: Db;
  private readonly clock: Clock;

  constructor(db: Db, clock: Clock) {
    this.db = db;
    this.clock = clock;
  }

  private row(organizationId: string): Promise<Organization> {
    return this.db.selectFrom('organizations').selectAll().where('id', '=', organizationId).executeTakeFirstOrThrow();
  }

  async get(actor: Actor): Promise<OrganizationSettingsResponse> {
    const who = accessActor(actor);
    if (!can(who, 'organization.settings.view')) throw new AppError('FORBIDDEN');
    return toResponse(await this.row(actor.organizationId), can(who, 'organization.settings.update'));
  }

  /**
   * Saves a changed name, timezone, or week start with one ORGANIZATION_UPDATED audit record (F02-AC2).
   * Stored `report_date` values never change: they are calendar dates, not instants (F02-AC5, FR-CAL-006).
   */
  async update(actor: Actor, input: UpdateOrganizationRequest): Promise<OrganizationSettingsResponse> {
    if (!can(accessActor(actor), 'organization.settings.update')) throw new AppError('FORBIDDEN');
    const next: { name?: string; timezone?: string; weekStart?: WeekDay } = {};
    if (input.name !== undefined) {
      next.name = normalizeWorkspaceName(input.name);
      if (!next.name) throw fieldError('name', 'REQUIRED');
    }
    if (input.timezone !== undefined) {
      next.timezone = input.timezone.trim();
      if (!isIanaTimeZone(next.timezone)) throw fieldError('timezone', 'INVALID');
    }
    if (input.weekStart !== undefined) next.weekStart = input.weekStart;

    const now = this.clock.now();
    await this.db.transaction().execute(async (tx) => {
      const org = await tx.selectFrom('organizations').selectAll().where('id', '=', actor.organizationId).forUpdate().executeTakeFirstOrThrow();
      const changes = settingsDiff({ name: org.name, timezone: org.timezone, weekStart: org.week_start }, next);
      if (Object.keys(changes).length === 0) return; // nothing changed, nothing to audit
      await tx
        .updateTable('organizations')
        .set({
          ...(changes.name ? { name: changes.name.to } : {}),
          ...(changes.timezone ? { timezone: changes.timezone.to } : {}),
          ...(changes.weekStart ? { week_start: changes.weekStart.to } : {}),
        })
        .where('id', '=', actor.organizationId)
        .execute();
      await recordAudit(tx, {
        organizationId: actor.organizationId,
        actorUserId: actor.userId,
        action: 'ORGANIZATION_UPDATED',
        targetType: 'ORGANIZATION',
        targetId: actor.organizationId,
        summary: { changes },
        at: now,
      });
    });
    return this.get(actor);
  }

  /**
   * The platform operator creates a workspace and its first Owner (FR-ORG-001, DEC-B01). There is no public route
   * for this (F02-AC16): it is called by operator tooling only (today, the test-control API). Timezone, week start,
   * and daily-report mode come from the database defaults (F02-AC1). The Owner sets up two-factor sign-in at first
   * sign-in (FR-AUTH-016).
   */
  async createWorkspace(input: NewWorkspace): Promise<{ organizationId: string; ownerUserId: string }> {
    const loginId = normalizeLoginId(input.owner.loginId);
    if (!isValidLoginId(loginId)) throw fieldError('owner.loginId', 'LOGIN_ID_FORMAT');
    const issue = checkPassword(input.owner.password, loginId);
    if (issue) throw fieldError('owner.password', issue);
    const name = normalizeWorkspaceName(input.name);
    if (!name) throw fieldError('name', 'REQUIRED');
    const taken = await this.db
      .selectFrom('users')
      .select('id')
      .where((eb) => eb(eb.fn('lower', ['login_id']), '=', loginIdKey(loginId)))
      .executeTakeFirst();
    if (taken) throw new AppError('LOGIN_ID_TAKEN');

    const now = this.clock.now();
    const organizationId = uuidv7();
    const ownerUserId = uuidv7();
    const passwordHash = await hashPassword(input.owner.password);
    await this.db.transaction().execute(async (tx) => {
      await tx.insertInto('organizations').values({ id: organizationId, kind: input.kind, name, code: input.code, created_at: now }).execute();
      await tx
        .insertInto('users')
        .values({
          id: ownerUserId,
          organization_id: organizationId,
          login_id: loginId,
          password_hash: passwordHash,
          email: input.owner.email,
          display_name: input.owner.displayName,
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
          organization_id: organizationId,
          user_id: ownerUserId,
          role: 'OWNER',
          all_classes: false,
          status: 'ACTIVE',
          created_at: now,
          revoked_at: null,
        })
        .execute();
      // The operator is not a user of the madrasa, so these records have no actor.
      await recordAudit(tx, {
        organizationId,
        actorUserId: null,
        action: 'ORGANIZATION_CREATED',
        targetType: 'ORGANIZATION',
        targetId: organizationId,
        summary: { kind: input.kind, name },
        at: now,
      });
      await recordAudit(tx, {
        organizationId,
        actorUserId: null,
        action: 'ACCOUNT_CREATED',
        targetType: 'USER',
        targetId: ownerUserId,
        summary: { loginId, role: 'OWNER', hasEmail: input.owner.email != null },
        at: now,
      });
    });
    return { organizationId, ownerUserId };
  }
}
