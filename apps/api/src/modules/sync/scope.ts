// The caller's sync scope (F12-AC7, NFR-OFF-010). Scope comes from the access module: Owner, Admin, and a
// Teacher with "all classes" see the whole madrasa; any other Teacher sees the classes they are assigned to and
// the students enrolled in them. Assignments and enrollments arrive with F03, which supplies a provider that
// loads them; until then a Teacher without "all classes" has an empty scope (fail closed).
import { accessActor, scopeOf } from '../access/policy.ts';
import type { Actor } from '../identity/auth-service.ts';
import type { ScopeKeys } from './handler.ts';

export type SyncScope =
  | { kind: 'ORGANIZATION' }
  | { kind: 'KEYS'; classIds: ReadonlySet<string>; studentIds: ReadonlySet<string> };

export interface SyncScopeProvider {
  scopeFor(actor: Actor): Promise<SyncScope>;
}

/** What F03 supplies: the actor's assigned classes and the students enrolled in them. */
export interface RosterScope {
  assignedClassIds: Iterable<string>;
  studentIds: Iterable<string>;
}

/** Builds a provider from a roster lookup (F03 passes one backed by its tables). */
export function scopeProvider(loadRoster: (actor: Actor) => Promise<RosterScope>): SyncScopeProvider {
  return {
    async scopeFor(actor) {
      const membership = { userId: actor.userId, organizationId: actor.organizationId, role: actor.role, allClasses: actor.allClasses };
      if (scopeOf(accessActor(membership)).kind === 'ORGANIZATION') return { kind: 'ORGANIZATION' };
      const roster = await loadRoster(actor);
      const scope = scopeOf(accessActor(membership, { assignedClassIds: roster.assignedClassIds }));
      if (scope.kind === 'ORGANIZATION') return scope;
      if (scope.kind === 'CLASSES') return { kind: 'KEYS', classIds: scope.classIds, studentIds: new Set(roster.studentIds) };
      return { kind: 'KEYS', classIds: new Set(), studentIds: scope.studentIds };
    },
  };
}

/** F12 default: no roster tables yet, so no assignments. */
export const rosterlessScope: SyncScopeProvider = scopeProvider(async () => ({ assignedClassIds: [], studentIds: [] }));

/** Rows with no scope key (organization-wide data) are visible only to a whole-madrasa scope. */
export function inScope(scope: SyncScope, keys: ScopeKeys): boolean {
  if (scope.kind === 'ORGANIZATION') return true;
  return (keys.classId !== null && scope.classIds.has(keys.classId)) || (keys.studentId !== null && scope.studentIds.has(keys.studentId));
}
