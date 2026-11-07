// Role and membership changes (US-007, US-008; FR-ORG-003/007, FR-SEC-003, SRS §17.1, DEC-B02, DEC-B13).
// Decisions taken with the user on 2026-11-06 (docs/handover/F02-plan.md):
// - The Owner adds or removes an Admin by changing an existing member's role: Teacher → Admin, Admin → Teacher.
// - Ownership transfer grants the Owner role to an active Admin; the former Owner stays Owner.
// - Removing or demoting an Owner is not built: who may do it is still an open question for the user.
import type { AccountResponse, RoleChangeRole } from '@hifz/contracts';
import type { Clock } from '../../platform/clock.ts';
import type { Db } from '../../platform/db.ts';
import { AppError, fieldError } from '../../platform/errors.ts';
import { accessActor, can, leavesAnAdmin, leavesAnOwner, type Action } from '../access/policy.ts';
import { recordAudit } from '../audit/audit.ts';
import type { AccountsService } from '../identity/accounts-service.ts';
import type { Actor } from '../identity/auth-service.ts';
import { revokeSessions } from '../identity/sessions.ts';
import { activeMemberRoles } from './members.ts';

export class MembershipService {
  private readonly db: Db;
  private readonly clock: Clock;
  private readonly accounts: AccountsService;

  constructor(db: Db, clock: Clock, accounts: AccountsService) {
    this.db = db;
    this.clock = clock;
    this.accounts = accounts;
  }

  /** The role check comes first, so an Admin gets FORBIDDEN even for an ID outside the madrasa. */
  private async target(actor: Actor, action: Action, id: string) {
    if (!can(accessActor(actor), action)) throw new AppError('FORBIDDEN');
    return this.accounts.load(actor, id);
  }

  /**
   * Owner only: adds an Admin (Teacher → Admin) or removes one (Admin → Teacher) (F02-AC15).
   * A new Admin's sessions end, so their next sign-in sets up two-factor sign-in (FR-AUTH-016).
   */
  async changeRole(actor: Actor, id: string, role: RoleChangeRole): Promise<AccountResponse> {
    const target = await this.target(actor, 'admins.manage', id);
    if (target.status !== 'ACTIVE' || (target.role !== 'ADMIN' && target.role !== 'TEACHER')) throw fieldError('role', 'INVALID');
    if (target.role === role) return this.accounts.respond(target);
    const now = this.clock.now();
    await this.db.transaction().execute(async (tx) => {
      if (role === 'TEACHER' && !leavesAnAdmin(await activeMemberRoles(tx, actor.organizationId), id, role)) throw new AppError('LAST_ADMIN');
      await tx
        .updateTable('memberships')
        // An Admin already reaches every class; the flag starts cleared whichever way the role changes.
        .set({ role, all_classes: false })
        .where('user_id', '=', id)
        .where('organization_id', '=', actor.organizationId)
        .where('status', '=', 'ACTIVE')
        .execute();
      if (role === 'ADMIN') await revokeSessions(tx, id, now, 'ROLE_CHANGED');
      await recordAudit(tx, {
        organizationId: actor.organizationId,
        actorUserId: actor.userId,
        action: role === 'ADMIN' ? 'ADMIN_ADDED' : 'ADMIN_REMOVED',
        targetType: 'USER',
        targetId: id,
        summary: { from: target.role, to: role },
        at: now,
      });
    });
    return this.accounts.get(actor, id);
  }

  /** Owner only: makes an active Admin an Owner too. The current Owner keeps the role (F02-AC15, FR-ORG-007). */
  async grantOwner(actor: Actor, id: string): Promise<AccountResponse> {
    const target = await this.target(actor, 'ownership.transfer', id);
    if (target.status !== 'ACTIVE' || target.role !== 'ADMIN') throw fieldError('role', 'INVALID');
    const now = this.clock.now();
    await this.db.transaction().execute(async (tx) => {
      // Granting never removes an Owner; checked anyway so any later change to this path keeps FR-ORG-007.
      if (!leavesAnOwner(await activeMemberRoles(tx, actor.organizationId), id, 'OWNER')) throw new AppError('LAST_ADMIN');
      await tx
        .updateTable('memberships')
        .set({ role: 'OWNER', all_classes: false })
        .where('user_id', '=', id)
        .where('organization_id', '=', actor.organizationId)
        .where('status', '=', 'ACTIVE')
        .execute();
      await recordAudit(tx, {
        organizationId: actor.organizationId,
        actorUserId: actor.userId,
        action: 'OWNER_ADDED',
        targetType: 'USER',
        targetId: id,
        summary: { from: 'ADMIN', to: 'OWNER' },
        at: now,
      });
    });
    return this.accounts.get(actor, id);
  }

  /**
   * Owner or Admin: sets or clears a Teacher's "all classes" flag (F02-AC14, FR-SEC-003). With it, the Teacher keeps
   * Teacher permissions but over every class in the madrasa. The flag is re-read on every request.
   */
  async setAllClasses(actor: Actor, id: string, allClasses: boolean): Promise<AccountResponse> {
    const target = await this.target(actor, 'teacher.allClasses.set', id);
    if (target.status !== 'ACTIVE' || target.role !== 'TEACHER') throw fieldError('allClasses', 'INVALID');
    if (target.all_classes === allClasses) return this.accounts.respond(target);
    const now = this.clock.now();
    await this.db.transaction().execute(async (tx) => {
      await tx
        .updateTable('memberships')
        .set({ all_classes: allClasses })
        .where('user_id', '=', id)
        .where('organization_id', '=', actor.organizationId)
        .where('status', '=', 'ACTIVE')
        .execute();
      await recordAudit(tx, {
        organizationId: actor.organizationId,
        actorUserId: actor.userId,
        action: allClasses ? 'ALL_CLASSES_SET' : 'ALL_CLASSES_CLEARED',
        targetType: 'USER',
        targetId: id,
        summary: { allClasses },
        at: now,
      });
    });
    return this.accounts.get(actor, id);
  }
}
