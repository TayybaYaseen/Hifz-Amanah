// The Student and Parent portal (F10; US-044, US-045; FR-PORT-001, FR-PORT-002, FR-PORT-006, FR-SEC-004, FR-SEC-005,
// NFR-PORT-001…006). Plan: docs/handover/F10-plan.md.
//
// - Online and read-only: three GET routes and nothing else. There is no write route and no search (F10-AC1, AC6).
// - A Student follows the one student record their login is linked to; a Parent, the students they are verified-linked
//   to. The set is read fresh on every request, so a revoked link is refused on the next one (F10-AC7).
// - Any id outside that set, an unpublished or unknown report, or another madrasa's id is the same 404 (F10-AC2, AC3,
//   AC6, FR-SEC-008). Staff get 403: they read reports through /reports/*.
// - Every payload leaves through projectFor(STUDENT | PARENT): only allowlisted entities and fields (FR-PORT-006).
//   Nothing is cached on the device for these roles (NFR-PORT-005, F10-AC4); responses say `no-store`.
import { PortalReportListQuery, type PortalReportListResponse, type PortalReportResponse, type PortalStudentsResponse } from '@hifz/contracts';
import type { Clock } from '../../platform/clock.ts';
import type { Db, Tx } from '../../platform/db.ts';
import { AppError, parse } from '../../platform/errors.ts';
import { withTenant } from '../../platform/tenant.ts';
import { projectFor, type Audience } from '../access/projection.ts';
import type { Actor } from '../identity/auth-service.ts';
import type { PublishedReports } from '../reporting/published.ts';
import { familyStudentIds } from '../roster/family-access-service.ts';

/** Only Students and Parents use the portal. */
function familyAudience(actor: Actor): Audience {
  if (actor.role === 'STUDENT') return 'STUDENT';
  if (actor.role === 'PARENT') return 'PARENT';
  throw new AppError('FORBIDDEN');
}

export class PortalService {
  private readonly db: Db;
  private readonly clock: Clock;
  private readonly published: PublishedReports;

  constructor(db: Db, clock: Clock, published: PublishedReports) {
    this.db = db;
    this.clock = clock;
    this.published = published;
  }

  /** GET /portal/students: the students the caller follows (the Parent's switcher, F10-AC5). */
  async students(actor: Actor): Promise<PortalStudentsResponse> {
    const audience = familyAudience(actor);
    return withTenant(this.db, actor.organizationId, async (tx) => {
      const ids = await familyStudentIds(tx, actor);
      if (ids.length === 0) return { items: [] };
      const rows = await tx.selectFrom('students').select(['id', 'name']).where('organization_id', '=', actor.organizationId).where('id', 'in', ids).execute();
      const byId = new Map(rows.map((r) => [r.id, r]));
      const items = ids.flatMap((id) => {
        const r = byId.get(id);
        return r ? [projectFor(audience, 'portal_student', { id: r.id, name: r.name }) as PortalStudentsResponse['items'][number]] : [];
      });
      return { items };
    });
  }

  /** GET /portal/reports?studentId&kind&cursor: that student's published periods, newest first (F10-AC1, AC3). */
  async reports(actor: Actor, query: unknown): Promise<PortalReportListResponse> {
    familyAudience(actor);
    const q = parse(PortalReportListQuery, query);
    return withTenant(this.db, actor.organizationId, async (tx) => {
      await this.requireStudent(tx, actor, q.studentId);
      return this.published.listFor(tx, actor.organizationId, q.studentId, query);
    });
  }

  /** GET /portal/reports/:id: one published report in the FR-PORT-006 field set (F10-AC2, AC15, AC17). */
  async report(actor: Actor, id: string): Promise<PortalReportResponse> {
    const audience = familyAudience(actor);
    return withTenant(this.db, actor.organizationId, async (tx) => {
      const ids = await familyStudentIds(tx, actor);
      const loaded = await this.published.loadFor(tx, actor.organizationId, id, ids);
      const out = projectFor(audience, 'published_report', {
        published: true,
        id: loaded.id,
        publishedAt: loaded.publishedAt,
        updatedAt: loaded.updatedAt,
        teachers: loaded.teachers,
        report: loaded.report as unknown as Record<string, unknown>,
        generatedAt: this.clock.now().toISOString(),
      });
      // projectFor returns nothing for a row that is not published; never send an empty shell.
      if (Object.keys(out).length === 0) throw new AppError('NOT_FOUND');
      return out as unknown as PortalReportResponse;
    });
  }

  private async requireStudent(tx: Tx, actor: Actor, studentId: string): Promise<void> {
    if (!(await familyStudentIds(tx, actor)).includes(studentId)) throw new AppError('NOT_FOUND');
  }
}
