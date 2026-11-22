// Family access, managed by an Owner or Admin (F10; US-045; FR-PORT-001, FR-PORT-005, FR-PORT-007, FR-SEC-005,
// NFR-PORT-006; DEC-B37). Plan: docs/handover/F10-plan.md.
//
// - A Student login is linked to exactly one student record, and a student record to at most one Student login. It
//   is what lets that login see the student's published reports (FR-PORT-001).
// - A Parent login is linked to a student only by an Owner or Admin, after verifying the parent offline (in person, or
//   against the madrasa's own records), and the method is required and recorded (F10-AC16). There is no self-service
//   linking, invitation code, or search by name, phone, or email (F10-AC6). A Teacher gets 403 (`guardians.manage`).
// - Re-verifying records a new method and time on an active link; revoking ends it at once: the portal reads links on
//   every request, so the next request is refused (F10-AC7). Revoked rows are kept for history.
// - Every change is audited in the same transaction (F10-AC8): STUDENT_ACCOUNT_LINKED/UNLINKED, GUARDIAN_LINKED,
//   GUARDIAN_VERIFIED, GUARDIAN_LINK_REVOKED. Summaries hold ids and the method, never contact details.
// - Every record is loaded within the caller's madrasa; another madrasa's ids are 404, the same as missing ones.
import { v7 as uuidv7 } from 'uuid';
import {
  LinkGuardianRequest,
  LinkStudentAccountRequest,
  VerifyGuardianRequest,
  type FamilyAccountRef,
  type GuardianLinkView,
  type StudentAccessResponse,
} from '@hifz/contracts';
import { z } from 'zod';
import type { Clock } from '../../platform/clock.ts';
import type { Db, Tx } from '../../platform/db.ts';
import { AppError, fieldError, parse } from '../../platform/errors.ts';
import { withTenant } from '../../platform/tenant.ts';
import { recordAudit } from '../audit/audit.ts';
import type { Actor } from '../identity/auth-service.ts';
import { requireRole, uniqueViolation } from './shared.ts';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const FAMILY_ACCOUNTS_PAGE_SIZE = 25;

/**
 * The students a Student or Parent login may follow, read fresh on every request so a revoked link or an unlinked
 * login is refused on the next one (F10-AC7, NFR-PORT-006): a Student, the one student record their login is linked
 * to; a Parent, every student with an active (verified, not revoked) link. Empty for anyone else.
 */
export async function familyStudentIds(tx: Tx, actor: Pick<Actor, 'organizationId' | 'userId' | 'role'>): Promise<string[]> {
  if (actor.role === 'STUDENT') {
    const rows = await tx.selectFrom('student_accounts').select('student_id').where('organization_id', '=', actor.organizationId).where('user_id', '=', actor.userId).where('unlinked_at', 'is', null).execute();
    return rows.map((r) => r.student_id);
  }
  if (actor.role === 'PARENT') {
    const rows = await tx
      .selectFrom('student_guardians')
      .select('student_id')
      .where('organization_id', '=', actor.organizationId)
      .where('guardian_user_id', '=', actor.userId)
      .where('revoked_at', 'is', null)
      .orderBy('linked_at')
      .execute();
    return [...new Set(rows.map((r) => r.student_id))];
  }
  return [];
}

/** GET /family-accounts?role&page: the madrasa's active Student or Parent logins, for the Admin's picker. */
export const FamilyAccountsQuery = z.strictObject({ role: z.enum(['STUDENT', 'PARENT']), page: z.coerce.number().int().min(1).max(10_000).default(1) });

export interface FamilyAccountsResponse {
  items: FamilyAccountRef[];
  page: number;
  pageSize: number;
  total: number;
}

export class FamilyAccessService {
  private readonly db: Db;
  private readonly clock: Clock;

  constructor(db: Db, clock: Clock) {
    this.db = db;
    this.clock = clock;
  }

  // ---------- Reads ----------

  /** GET /students/:id/access: the student's login and every Parent link, active ones first. */
  async access(actor: Actor, studentId: string): Promise<StudentAccessResponse> {
    requireRole(actor, 'guardians.manage');
    return withTenant(this.db, actor.organizationId, async (tx) => {
      await this.student(tx, actor.organizationId, studentId);
      return this.view(tx, actor.organizationId, studentId);
    });
  }

  /** GET /family-accounts?role&page. */
  async accounts(actor: Actor, query: unknown): Promise<FamilyAccountsResponse> {
    requireRole(actor, 'guardians.manage');
    const q = parse(FamilyAccountsQuery, query);
    return withTenant(this.db, actor.organizationId, async (tx) => {
      const base = tx
        .selectFrom('users as u')
        .innerJoin('memberships as m', (j) => j.onRef('m.user_id', '=', 'u.id').onRef('m.organization_id', '=', 'u.organization_id'))
        .where('u.organization_id', '=', actor.organizationId)
        .where('m.role', '=', q.role)
        .where('m.status', '=', 'ACTIVE')
        .where('u.status', '=', 'ACTIVE');
      const rows = await base
        .select(['u.id', 'u.login_id', 'u.display_name'])
        .orderBy('u.login_id')
        .limit(FAMILY_ACCOUNTS_PAGE_SIZE)
        .offset((q.page - 1) * FAMILY_ACCOUNTS_PAGE_SIZE)
        .execute();
      const total = await base.select((eb) => eb.fn.countAll<string>().as('n')).executeTakeFirstOrThrow();
      return { items: rows.map((r) => ({ userId: r.id, loginId: r.login_id, displayName: r.display_name })), page: q.page, pageSize: FAMILY_ACCOUNTS_PAGE_SIZE, total: Number(total.n) };
    });
  }

  // ---------- Student login ----------

  /** POST /students/:id/student-account. Linking the same login again is a no-op. */
  async linkStudentAccount(actor: Actor, studentId: string, body: unknown): Promise<StudentAccessResponse> {
    requireRole(actor, 'guardians.manage');
    const input = parse(LinkStudentAccountRequest, body);
    const org = actor.organizationId;
    return withTenant(this.db, org, async (tx) => {
      await this.student(tx, org, studentId);
      if (!(await this.hasRole(tx, org, input.userId, 'STUDENT'))) throw fieldError('userId', 'NOT_A_STUDENT_ACCOUNT');
      const current = await tx
        .selectFrom('student_accounts')
        .select(['student_id', 'user_id'])
        .where('organization_id', '=', org)
        .where('unlinked_at', 'is', null)
        .where((eb) => eb.or([eb('student_id', '=', studentId), eb('user_id', '=', input.userId)]))
        .execute();
      if (current.some((c) => c.student_id === studentId && c.user_id === input.userId)) return this.view(tx, org, studentId);
      if (current.some((c) => c.student_id === studentId)) throw fieldError('studentId', 'STUDENT_ALREADY_LINKED');
      if (current.some((c) => c.user_id === input.userId)) throw fieldError('userId', 'ACCOUNT_ALREADY_LINKED');
      const now = this.clock.now();
      await tx
        .insertInto('student_accounts')
        .values({ id: uuidv7(), organization_id: org, student_id: studentId, user_id: input.userId, linked_by: actor.userId, linked_at: now, unlinked_by: null, unlinked_at: null })
        .execute();
      await recordAudit(tx, { organizationId: org, actorUserId: actor.userId, action: 'STUDENT_ACCOUNT_LINKED', targetType: 'STUDENT', targetId: studentId, summary: { studentId, userId: input.userId }, at: now });
      return this.view(tx, org, studentId);
    });
  }

  /** POST /students/:id/student-account/unlink. The login stops seeing the student's reports on its next request. */
  async unlinkStudentAccount(actor: Actor, studentId: string): Promise<StudentAccessResponse> {
    requireRole(actor, 'guardians.manage');
    const org = actor.organizationId;
    return withTenant(this.db, org, async (tx) => {
      await this.student(tx, org, studentId);
      const now = this.clock.now();
      const ended = await tx
        .updateTable('student_accounts')
        .set({ unlinked_by: actor.userId, unlinked_at: now })
        .where('organization_id', '=', org)
        .where('student_id', '=', studentId)
        .where('unlinked_at', 'is', null)
        .returning('user_id')
        .executeTakeFirst();
      if (ended) {
        await recordAudit(tx, { organizationId: org, actorUserId: actor.userId, action: 'STUDENT_ACCOUNT_UNLINKED', targetType: 'STUDENT', targetId: studentId, summary: { studentId, userId: ended.user_id }, at: now });
      }
      return this.view(tx, org, studentId);
    });
  }

  // ---------- Parent links (FR-PORT-007) ----------

  /** POST /students/:id/guardians: links a Parent login after offline verification; the method is required (F10-AC16). */
  async linkGuardian(actor: Actor, studentId: string, body: unknown): Promise<StudentAccessResponse> {
    requireRole(actor, 'guardians.manage');
    const input = parse(LinkGuardianRequest, body);
    const org = actor.organizationId;
    return withTenant(this.db, org, async (tx) => {
      await this.student(tx, org, studentId);
      if (!(await this.hasRole(tx, org, input.parentUserId, 'PARENT'))) throw fieldError('parentUserId', 'NOT_A_PARENT_ACCOUNT');
      const now = this.clock.now();
      const id = uuidv7();
      try {
        await tx
          .insertInto('student_guardians')
          .values({
            id,
            organization_id: org,
            student_id: studentId,
            guardian_user_id: input.parentUserId,
            verification_method: input.verificationMethod,
            verified_by: actor.userId,
            verified_at: now,
            linked_by: actor.userId,
            linked_at: now,
            revoked_by: null,
            revoked_at: null,
          })
          .execute();
      } catch (error) {
        if (uniqueViolation(error) === 'student_guardians_one_active') throw fieldError('parentUserId', 'ALREADY_LINKED');
        throw error;
      }
      await recordAudit(tx, {
        organizationId: org,
        actorUserId: actor.userId,
        action: 'GUARDIAN_LINKED',
        targetType: 'GUARDIAN_LINK',
        targetId: id,
        summary: { studentId, parentUserId: input.parentUserId, verificationMethod: input.verificationMethod },
        at: now,
      });
      return this.view(tx, org, studentId);
    });
  }

  /** POST /guardian-links/:id/verify: a new verification of an active link (method and time recorded). */
  async verifyGuardian(actor: Actor, linkId: string, body: unknown): Promise<StudentAccessResponse> {
    requireRole(actor, 'guardians.manage');
    const input = parse(VerifyGuardianRequest, body);
    const org = actor.organizationId;
    return withTenant(this.db, org, async (tx) => {
      const link = await this.link(tx, org, linkId);
      if (link.revoked_at !== null) throw fieldError('linkId', 'LINK_REVOKED');
      const now = this.clock.now();
      await tx.updateTable('student_guardians').set({ verification_method: input.verificationMethod, verified_by: actor.userId, verified_at: now }).where('organization_id', '=', org).where('id', '=', linkId).execute();
      await recordAudit(tx, {
        organizationId: org,
        actorUserId: actor.userId,
        action: 'GUARDIAN_VERIFIED',
        targetType: 'GUARDIAN_LINK',
        targetId: linkId,
        summary: { studentId: link.student_id, parentUserId: link.guardian_user_id, verificationMethod: input.verificationMethod, previousMethod: link.verification_method },
        at: now,
      });
      return this.view(tx, org, link.student_id);
    });
  }

  /** POST /guardian-links/:id/revoke: access stops on the Parent's next request (F10-AC7). Revoking twice is a no-op. */
  async revokeGuardian(actor: Actor, linkId: string): Promise<StudentAccessResponse> {
    requireRole(actor, 'guardians.manage');
    const org = actor.organizationId;
    return withTenant(this.db, org, async (tx) => {
      const link = await this.link(tx, org, linkId);
      if (link.revoked_at === null) {
        const now = this.clock.now();
        await tx.updateTable('student_guardians').set({ revoked_by: actor.userId, revoked_at: now }).where('organization_id', '=', org).where('id', '=', linkId).execute();
        await recordAudit(tx, {
          organizationId: org,
          actorUserId: actor.userId,
          action: 'GUARDIAN_LINK_REVOKED',
          targetType: 'GUARDIAN_LINK',
          targetId: linkId,
          summary: { studentId: link.student_id, parentUserId: link.guardian_user_id },
          at: now,
        });
      }
      return this.view(tx, org, link.student_id);
    });
  }

  // ---------- Internals ----------

  private async student(tx: Tx, org: string, studentId: string): Promise<void> {
    if (!UUID.test(studentId)) throw new AppError('NOT_FOUND');
    const s = await tx.selectFrom('students').select('id').where('organization_id', '=', org).where('id', '=', studentId).executeTakeFirst();
    if (!s) throw new AppError('NOT_FOUND');
  }

  private async link(tx: Tx, org: string, linkId: string) {
    if (!UUID.test(linkId)) throw new AppError('NOT_FOUND');
    const link = await tx
      .selectFrom('student_guardians')
      .select(['id', 'student_id', 'guardian_user_id', 'verification_method', 'revoked_at'])
      .where('organization_id', '=', org)
      .where('id', '=', linkId)
      .forUpdate()
      .executeTakeFirst();
    if (!link) throw new AppError('NOT_FOUND');
    return link;
  }

  /** The user is an active member of this madrasa with exactly this role (another madrasa's user is not). */
  private async hasRole(tx: Tx, org: string, userId: string, role: 'STUDENT' | 'PARENT'): Promise<boolean> {
    const m = await tx
      .selectFrom('memberships as m')
      .innerJoin('users as u', (j) => j.onRef('u.id', '=', 'm.user_id').onRef('u.organization_id', '=', 'm.organization_id'))
      .select('m.user_id')
      .where('m.organization_id', '=', org)
      .where('m.user_id', '=', userId)
      .where('m.role', '=', role)
      .where('m.status', '=', 'ACTIVE')
      .where('u.status', '=', 'ACTIVE')
      .executeTakeFirst();
    return m !== undefined;
  }

  private async view(tx: Tx, org: string, studentId: string): Promise<StudentAccessResponse> {
    const account = await tx
      .selectFrom('student_accounts as a')
      .innerJoin('users as u', 'u.id', 'a.user_id')
      .select(['a.user_id', 'u.login_id', 'u.display_name', 'a.linked_at'])
      .where('a.organization_id', '=', org)
      .where('a.student_id', '=', studentId)
      .where('a.unlinked_at', 'is', null)
      .executeTakeFirst();
    const links = await tx
      .selectFrom('student_guardians as g')
      .innerJoin('users as p', 'p.id', 'g.guardian_user_id')
      .innerJoin('users as v', 'v.id', 'g.verified_by')
      .select(['g.id', 'g.guardian_user_id', 'p.login_id', 'p.display_name', 'g.verification_method', 'g.verified_at', 'v.display_name as verified_by_name', 'g.linked_at', 'g.revoked_at'])
      .where('g.organization_id', '=', org)
      .where('g.student_id', '=', studentId)
      .orderBy('g.linked_at', 'desc')
      .execute();
    const guardians: GuardianLinkView[] = links
      .map((l) => ({
        id: l.id,
        parent: { userId: l.guardian_user_id, loginId: l.login_id, displayName: l.display_name },
        verificationMethod: l.verification_method,
        verifiedAt: l.verified_at.toISOString(),
        verifiedBy: l.verified_by_name,
        linkedAt: l.linked_at.toISOString(),
        revokedAt: l.revoked_at?.toISOString() ?? null,
      }))
      .sort((a, b) => Number(a.revokedAt !== null) - Number(b.revokedAt !== null));
    return {
      studentId,
      studentAccount: account ? { userId: account.user_id, loginId: account.login_id, displayName: account.display_name, linkedAt: account.linked_at.toISOString() } : null,
      guardians,
    };
  }
}
