// The roster-backed sync scope (F12-AC7, NFR-OFF-010): replaces F12's rosterless default. A Teacher without
// "all classes" syncs the classes they are assigned to and the students with a not-yet-ended enrollment in them,
// matching the roster's own Teacher visibility (student-service.ts).
import type { Clock } from '../../platform/clock.ts';
import type { Db } from '../../platform/db.ts';
import { withTenant } from '../../platform/tenant.ts';
import { scopeProvider, type SyncScopeProvider } from '../sync/scope.ts';
import { assignedClassIds, todayFor } from './shared.ts';

export function rosterScope(db: Db, clock: Clock): SyncScopeProvider {
  return scopeProvider((actor) =>
    withTenant(db, actor.organizationId, async (tx) => {
      const classIds = await assignedClassIds(tx, actor.organizationId, actor.userId);
      if (!classIds.length) return { assignedClassIds: [], studentIds: [] };
      const today = await todayFor(tx, actor.organizationId, clock);
      const rows = await tx
        .selectFrom('student_enrollments')
        .select('student_id')
        .distinct()
        .where('organization_id', '=', actor.organizationId)
        .where('class_id', 'in', classIds)
        .where((eb) => eb.or([eb('end_date', 'is', null), eb('end_date', '>=', today)]))
        .execute();
      return { assignedClassIds: classIds, studentIds: rows.map((r) => r.student_id) };
    }),
  );
}
