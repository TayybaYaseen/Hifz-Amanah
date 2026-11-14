// Access policy (ARCHITECTURE.md §7.2–7.3, SRS §17.1 / DEC-B12). Pure functions, no I/O: callers load the
// actor's membership and scope data (assigned classes from F03, guardian links from F10) and pass them in.
//
// Two outcomes refuse a request, and they mean different things:
// - FORBIDDEN: the actor's role never has this capability (e.g. a Teacher changing workspace settings).
// - NOT_FOUND: the role has the capability but this resource is outside the actor's scope (another madrasa,
//   an unassigned class, an unlinked student, an unpublished report). It is identical to a missing ID, so IDs
//   cannot be probed (FR-SEC-008, F02-AC7).
import type { Role } from '@hifz/contracts';

/**
 * How far a role's capability reaches.
 * - ALL: the whole madrasa.
 * - ASSIGNED: a Teacher's assigned classes, or every class with the "all classes" flag (FR-SEC-003).
 * - OWN: resources the actor owns (their own sync conflicts, their own audit actions).
 * - SELF_PUBLISHED: a Student's own published records.
 * - LINKED_PUBLISHED: a Parent's verified, non-revoked linked students' published records.
 */
export type Reach = 'ALL' | 'ASSIGNED' | 'OWN' | 'SELF_PUBLISHED' | 'LINKED_PUBLISHED';

type Grants = Partial<Record<Role, Reach>>;

const STAFF: Grants = { OWNER: 'ALL', ADMIN: 'ALL' };
const STAFF_AND_ASSIGNED: Grants = { OWNER: 'ALL', ADMIN: 'ALL', TEACHER: 'ASSIGNED' };

/** SRS §17.1, one entry per capability. A role that is absent has no access at all. */
export const MATRIX = {
  /** Org settings, daily-report mode, AI config, report template. */
  'organization.settings.update': STAFF,
  /** Any member may read their madrasa's name, timezone, and week start (read-only for non-staff). */
  'organization.settings.view': { OWNER: 'ALL', ADMIN: 'ALL', TEACHER: 'ALL', STUDENT: 'ALL', PARENT: 'ALL' },
  /** Add/remove Admins, transfer ownership: Owner only (FR-ORG-007, DEC-B02). */
  'admins.manage': { OWNER: 'ALL' },
  'ownership.transfer': { OWNER: 'ALL' },
  /** Create Teacher/Student/Parent accounts, set or reset passwords. Target-role limits: identity/rules.ts. */
  'accounts.manage': STAFF,
  /** Set a Teacher's "all classes" flag (DEC-B13). */
  'teacher.allClasses.set': STAFF,
  'classes.manage': STAFF,
  'classes.view': STAFF_AND_ASSIGNED,
  /** Student lists and profiles: whoever may add/edit students sees them (FR-STU-001, FR-STU-003). */
  'students.view': STAFF_AND_ASSIGNED,
  /** Add/edit students, including Excel import (DEC-B15). */
  'students.edit': STAFF_AND_ASSIGNED,
  'students.deactivateOrMove': STAFF,
  'guardians.manage': STAFF,
  'quran.manage': STAFF,
  'quran.view': { OWNER: 'ALL', ADMIN: 'ALL', TEACHER: 'ALL' },
  /** Attendance, daily entry, attempts, daily-record import. */
  'daily.write': STAFF_AND_ASSIGNED,
  /** Leave marked by a Teacher awaits approval; by Owner/Admin it is approved at once (FR-CAL-008). */
  'leave.mark': STAFF_AND_ASSIGNED,
  'leave.decide': STAFF,
  'homework.confirm': STAFF_AND_ASSIGNED,
  'homework.revise': STAFF,
  'conflict.resolve': { OWNER: 'ALL', ADMIN: 'ALL', TEACHER: 'OWN' },
  /** Publish reports; class summary. */
  'reports.publish': STAFF_AND_ASSIGNED,
  /** Reports, PDF, Excel export. */
  'reports.view': { OWNER: 'ALL', ADMIN: 'ALL', TEACHER: 'ASSIGNED', STUDENT: 'SELF_PUBLISHED', PARENT: 'LINKED_PUBLISHED' },
  'notes.internal.view': STAFF_AND_ASSIGNED,
  /** Also subject to the Admin's AI on/off setting (F15). */
  'ai.recommendations.view': STAFF_AND_ASSIGNED,
  'audit.view': { OWNER: 'ALL', ADMIN: 'ALL', TEACHER: 'OWN' },
  /** Audit records are append-only: no role, including Owner, may edit or delete them (F02-AC12). */
  'audit.modify': {},
} as const satisfies Record<string, Grants>;

export type Action = keyof typeof MATRIX;

/** The signed-in caller, as loaded from their membership. Never built from request input (FR-SEC-009). */
export interface AccessActor {
  userId: string;
  organizationId: string;
  role: Role;
  /** The Teacher's "all classes" flag (FR-SEC-003). Ignored for other roles. */
  allClasses: boolean;
  /** The classes the Teacher is assigned to right now (F03). Removing an assignment removes the access (F02-AC8). */
  assignedClassIds: ReadonlySet<string>;
  /** The student record of a Student account. */
  studentId: string | null;
  /** A Parent's verified, non-revoked linked students (F10). */
  linkedStudentIds: ReadonlySet<string>;
}

/** What a request touches, as loaded from the database (never as the client described it). */
export interface Resource {
  organizationId: string;
  /** The class itself, or every class the student is enrolled in. */
  classIds?: readonly string[];
  studentId?: string;
  /** Reports and records shown to Students and Parents must be published (FR-RPT-010). */
  published?: boolean;
  /** For OWN grants: the conflict's owner or the audit record's actor. */
  ownerUserId?: string;
}

export type Decision = 'ALLOW' | 'FORBIDDEN' | 'NOT_FOUND';

const EMPTY: ReadonlySet<string> = new Set();

/** An AccessActor with no class assignments, student record, or guardian links (filled in by F03 and F10). */
export function accessActor(
  membership: { userId: string; organizationId: string; role: Role; allClasses: boolean },
  scope: { assignedClassIds?: Iterable<string>; studentId?: string | null; linkedStudentIds?: Iterable<string> } = {},
): AccessActor {
  return {
    ...membership,
    allClasses: membership.role === 'TEACHER' && membership.allClasses,
    assignedClassIds: scope.assignedClassIds ? new Set(scope.assignedClassIds) : EMPTY,
    studentId: scope.studentId ?? null,
    linkedStudentIds: scope.linkedStudentIds ? new Set(scope.linkedStudentIds) : EMPTY,
  };
}

function reaches(actor: AccessActor, reach: Reach, resource: Resource): boolean {
  switch (reach) {
    case 'ALL':
      return true;
    case 'ASSIGNED':
      return actor.allClasses || (resource.classIds ?? []).some((id) => actor.assignedClassIds.has(id));
    case 'OWN':
      return resource.ownerUserId !== undefined && resource.ownerUserId === actor.userId;
    case 'SELF_PUBLISHED':
      return actor.studentId !== null && resource.studentId === actor.studentId && resource.published === true;
    case 'LINKED_PUBLISHED':
      return resource.studentId !== undefined && actor.linkedStudentIds.has(resource.studentId) && resource.published === true;
  }
}

/**
 * Decides whether `actor` may perform `action` on `resource`.
 * Without a resource, only the role is checked (e.g. a list, which is then narrowed with `scopeOf`).
 */
export function authorize(actor: AccessActor, action: Action, resource?: Resource): Decision {
  const reach = (MATRIX[action] as Grants)[actor.role];
  if (!reach) return 'FORBIDDEN';
  if (!resource) return 'ALLOW';
  if (resource.organizationId !== actor.organizationId) return 'NOT_FOUND';
  return reaches(actor, reach, resource) ? 'ALLOW' : 'NOT_FOUND';
}

export const can = (actor: AccessActor, action: Action, resource?: Resource): boolean =>
  authorize(actor, action, resource) === 'ALLOW';

/** The records a list may contain, from the membership alone. */
export type Scope =
  | { kind: 'ORGANIZATION' }
  | { kind: 'CLASSES'; classIds: ReadonlySet<string> }
  | { kind: 'STUDENTS'; studentIds: ReadonlySet<string> };

export function scopeOf(actor: AccessActor): Scope {
  switch (actor.role) {
    case 'OWNER':
    case 'ADMIN':
      return { kind: 'ORGANIZATION' };
    case 'TEACHER':
      return actor.allClasses ? { kind: 'ORGANIZATION' } : { kind: 'CLASSES', classIds: actor.assignedClassIds };
    case 'STUDENT':
      return { kind: 'STUDENTS', studentIds: actor.studentId ? new Set([actor.studentId]) : EMPTY };
    case 'PARENT':
      return { kind: 'STUDENTS', studentIds: actor.linkedStudentIds };
  }
}

/**
 * The students a scope may list, from enrollments `{ studentId, classId }`. Each student appears once, even when
 * enrolled in two of the Teacher's classes (F02 edge cases). Order follows the first enrollment seen.
 */
export function studentsInScope(scope: Scope, enrollments: ReadonlyArray<{ studentId: string; classId: string }>): string[] {
  const seen = new Set<string>();
  for (const { studentId, classId } of enrollments) {
    const visible =
      scope.kind === 'ORGANIZATION' ||
      (scope.kind === 'CLASSES' && scope.classIds.has(classId)) ||
      (scope.kind === 'STUDENTS' && scope.studentIds.has(studentId));
    if (visible) seen.add(studentId);
  }
  return [...seen];
}

// ---------- Membership invariants (FR-ORG-007) ----------

export interface MemberRole {
  userId: string;
  role: Role;
}

/** The active members after `userId` takes `newRole`, or leaves when `newRole` is null. */
function after(members: readonly MemberRole[], userId: string, newRole: Role | null): Role[] {
  return members.flatMap((m) => (m.userId !== userId ? [m.role] : newRole ? [newRole] : []));
}

/** A madrasa needs at least one Owner or Admin ("A madrasa needs at least one Admin"). */
export function leavesAnAdmin(members: readonly MemberRole[], userId: string, newRole: Role | null): boolean {
  return after(members, userId, newRole).some((r) => r === 'OWNER' || r === 'ADMIN');
}

/** A madrasa must always have at least one Owner (FR-ORG-007). */
export function leavesAnOwner(members: readonly MemberRole[], userId: string, newRole: Role | null): boolean {
  return after(members, userId, newRole).includes('OWNER');
}
