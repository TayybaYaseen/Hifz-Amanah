// F02 · Organization and roles — unit: can(actor, action, resource) (docs/specs/03-f02-organization-roles.md)
import { describe, expect, it } from 'vitest';
import { DEFAULT_ORGANIZATION_SETTINGS, ROLES, type Role } from '@hifz/contracts';
import {
  MATRIX,
  accessActor,
  authorize,
  can,
  leavesAnAdmin,
  leavesAnOwner,
  scopeOf,
  studentsInScope,
  type AccessActor,
  type Action,
  type Resource,
} from './policy.ts';

const ORG = 'org-a';
const OTHER_ORG = 'org-b';

const actor = (role: Role, extra: Partial<Parameters<typeof accessActor>[1]> & { allClasses?: boolean } = {}): AccessActor => {
  const { allClasses = false, ...scope } = extra;
  return accessActor({ userId: `${role.toLowerCase()}-1`, organizationId: ORG, role, allClasses }, scope);
};

const teacherA1 = actor('TEACHER', { assignedClassIds: ['A1'] });
const studentIn = (classId: string, studentId: string, published?: boolean): Resource => ({
  organizationId: ORG,
  classIds: [classId],
  studentId,
  ...(published === undefined ? {} : { published }),
});

// Class A1 has S1 and S2; class A2 has S3 (e2e/fixtures/personas.ts).
const enrollments = [
  { studentId: 'S1', classId: 'A1' },
  { studentId: 'S2', classId: 'A1' },
  { studentId: 'S3', classId: 'A2' },
];

describe('F02 · default organization settings', () => {
  it('F02-AC1 (US-007) a new madrasa defaults to Asia/Karachi, Monday week start, and SINGLE daily-report mode', () => {
    expect(DEFAULT_ORGANIZATION_SETTINGS).toEqual({ timezone: 'Asia/Karachi', weekStart: 'MONDAY', dailyReportMode: 'SINGLE' });
  });
});

describe('F02 · can() — workspace settings', () => {
  it('F02-AC2 (US-007) Owner and Admin may update name, timezone, and week start', () => {
    for (const role of ['OWNER', 'ADMIN'] as const) expect(can(actor(role), 'organization.settings.update', { organizationId: ORG })).toBe(true);
  });

  it('F02-AC4 (US-007) Teacher, Student, and Parent may not update workspace settings', () => {
    for (const role of ['TEACHER', 'STUDENT', 'PARENT'] as const) {
      expect(authorize(actor(role), 'organization.settings.update')).toBe('FORBIDDEN');
      // The "all classes" flag widens class scope only; it never adds Owner/Admin capabilities.
      expect(authorize(actor(role, { allClasses: true }), 'organization.settings.update')).toBe('FORBIDDEN');
    }
  });

  it('F02 unit: every member may read the settings; only Owner and Admin see them as editable', () => {
    for (const role of ROLES) expect(can(actor(role), 'organization.settings.view')).toBe(true);
  });

  it('F02-AC15 (US-007) only the Owner adds or removes Admins and transfers ownership', () => {
    for (const action of ['admins.manage', 'ownership.transfer'] as const) {
      expect(can(actor('OWNER'), action)).toBe(true);
      for (const role of ['ADMIN', 'TEACHER', 'STUDENT', 'PARENT'] as const) expect(authorize(actor(role), action)).toBe('FORBIDDEN');
    }
  });
});

describe('F02 · can() — scope', () => {
  it('F02-AC6 (US-008) Teacher sees only students enrolled in their assigned classes', () => {
    expect(studentsInScope(scopeOf(teacherA1), enrollments)).toEqual(['S1', 'S2']);
    expect(can(teacherA1, 'students.edit', studentIn('A1', 'S1'))).toBe(true);
    expect(can(teacherA1, 'students.edit', studentIn('A2', 'S3'))).toBe(false);
  });

  it('F02 unit: a student in two of the Teacher’s classes is listed once', () => {
    const teacher = actor('TEACHER', { assignedClassIds: ['A1', 'A2'] });
    const twice = [...enrollments, { studentId: 'S1', classId: 'A2' }];
    expect(studentsInScope(scopeOf(teacher), twice)).toEqual(['S1', 'S2', 'S3']);
  });

  it('F02 unit: a Teacher with no class assignments sees no students', () => {
    expect(studentsInScope(scopeOf(actor('TEACHER')), enrollments)).toEqual([]);
  });

  it('F02-AC7 (US-008) an out-of-scope resource resolves to NOT_FOUND, identical to a missing ID', () => {
    // A Class B student, record, or report: the role has the capability, the resource is outside its scope.
    for (const action of ['students.edit', 'daily.write', 'reports.view', 'notes.internal.view'] as const) {
      expect(authorize(teacherA1, action, studentIn('A2', 'S3'))).toBe('NOT_FOUND');
    }
    expect(authorize(teacherA1, 'classes.view', { organizationId: ORG, classIds: ['A2'] })).toBe('NOT_FOUND');
    // Another madrasa is NOT_FOUND for every role, Owner included (FR-SEC-008).
    for (const role of ROLES) {
      expect(authorize(actor(role), 'organization.settings.view', { organizationId: OTHER_ORG })).toBe('NOT_FOUND');
    }
  });

  it('F02-AC8 (US-008) a Teacher removed from a class loses access to that class', () => {
    expect(can(teacherA1, 'daily.write', studentIn('A1', 'S1'))).toBe(true);
    const removed = actor('TEACHER', { assignedClassIds: [] });
    expect(authorize(removed, 'daily.write', studentIn('A1', 'S1'))).toBe('NOT_FOUND');
    expect(studentsInScope(scopeOf(removed), enrollments)).toEqual([]);
  });

  it('F02-AC9 (US-008) scope comes from the membership; client-sent organization_id, role, or class is ignored', () => {
    // The actor is built from the membership only; nothing in a resource can change who the actor is.
    const forged: Resource & { role?: string } = { organizationId: OTHER_ORG, classIds: ['A1'], studentId: 'S1', role: 'ADMIN' };
    expect(authorize(teacherA1, 'daily.write', forged)).toBe('NOT_FOUND');
    // Naming a class the Teacher is not assigned to does not reach it.
    expect(authorize(teacherA1, 'daily.write', { organizationId: ORG, classIds: ['A2'], studentId: 'S1' })).toBe('NOT_FOUND');
    // The all-classes flag only counts on a Teacher membership.
    expect(accessActor({ userId: 'u', organizationId: ORG, role: 'STUDENT', allClasses: true }).allClasses).toBe(false);
  });

  it('F02-AC14 (US-008) with the all-classes flag a Teacher reaches every class, with Teacher permissions only', () => {
    const wide = actor('TEACHER', { allClasses: true });
    expect(scopeOf(wide)).toEqual({ kind: 'ORGANIZATION' });
    expect(studentsInScope(scopeOf(wide), enrollments)).toEqual(['S1', 'S2', 'S3']);
    expect(can(wide, 'daily.write', studentIn('A2', 'S3'))).toBe(true);
    // Still a Teacher: no Owner/Admin-only capability, and still never another madrasa.
    for (const action of ['students.deactivateOrMove', 'guardians.manage', 'homework.revise', 'leave.decide', 'classes.manage', 'teacher.allClasses.set'] as const) {
      expect(authorize(wide, action, studentIn('A2', 'S3'))).toBe('FORBIDDEN');
    }
    expect(authorize(wide, 'daily.write', { organizationId: OTHER_ORG, classIds: ['B1'], studentId: 'SB1' })).toBe('NOT_FOUND');
    // Only Owner and Admin can set the flag.
    expect(can(actor('OWNER'), 'teacher.allClasses.set')).toBe(true);
    expect(can(actor('ADMIN'), 'teacher.allClasses.set')).toBe(true);
    expect(authorize(actor('TEACHER'), 'teacher.allClasses.set')).toBe('FORBIDDEN');
  });

  it('F02 unit: Student may access only their own records', () => {
    const s1 = actor('STUDENT', { studentId: 'S1' });
    expect(studentsInScope(scopeOf(s1), enrollments)).toEqual(['S1']);
    expect(can(s1, 'reports.view', studentIn('A1', 'S1', true))).toBe(true);
    expect(authorize(s1, 'reports.view', studentIn('A1', 'S2', true))).toBe('NOT_FOUND');
    // Only published reports (FR-RPT-010), and never internal notes or any write.
    expect(authorize(s1, 'reports.view', studentIn('A1', 'S1', false))).toBe('NOT_FOUND');
    expect(authorize(s1, 'notes.internal.view', studentIn('A1', 'S1', true))).toBe('FORBIDDEN');
    expect(authorize(s1, 'daily.write', studentIn('A1', 'S1'))).toBe('FORBIDDEN');
    // A Student account with no student record sees nothing.
    expect(studentsInScope(scopeOf(actor('STUDENT')), enrollments)).toEqual([]);
  });

  it('F02 unit: Parent may access only verified, non-revoked linked students', () => {
    // parent.p1 is linked to S1 and S2; a revoked link is simply not in the list the caller loads.
    const p1 = actor('PARENT', { linkedStudentIds: ['S1', 'S2'] });
    expect(studentsInScope(scopeOf(p1), enrollments)).toEqual(['S1', 'S2']);
    expect(can(p1, 'reports.view', studentIn('A1', 'S2', true))).toBe(true);
    expect(authorize(p1, 'reports.view', studentIn('A2', 'S3', true))).toBe('NOT_FOUND');
    expect(authorize(p1, 'reports.view', studentIn('A1', 'S1', false))).toBe('NOT_FOUND');
    expect(authorize(p1, 'notes.internal.view', studentIn('A1', 'S1', true))).toBe('FORBIDDEN');
  });

  it('F02 unit: own-only capabilities reach only the actor’s own conflicts and audit actions', () => {
    const t = actor('TEACHER');
    expect(can(t, 'conflict.resolve', { organizationId: ORG, ownerUserId: t.userId })).toBe(true);
    expect(authorize(t, 'conflict.resolve', { organizationId: ORG, ownerUserId: 'someone-else' })).toBe('NOT_FOUND');
    expect(can(t, 'audit.view', { organizationId: ORG, ownerUserId: t.userId })).toBe(true);
    expect(authorize(t, 'audit.view', { organizationId: ORG, ownerUserId: 'someone-else' })).toBe('NOT_FOUND');
  });
});

describe('F02 · can() — audit', () => {
  it('F02-AC12 (US-009) no role, including Owner, may edit or delete an audit record', () => {
    for (const role of ROLES) {
      expect(authorize(actor(role), 'audit.modify')).toBe('FORBIDDEN');
      expect(authorize(actor(role, { allClasses: true }), 'audit.modify', { organizationId: ORG })).toBe('FORBIDDEN');
    }
  });
});

describe('F02 · role matrix (SRS §17.1)', () => {
  // ✔ = whole madrasa, A = assigned classes, O = own, S = own published, L = linked published, — = none.
  const expected: Record<Action, string> = {
    'organization.settings.update': '✔✔———',
    'organization.settings.view': '✔✔✔✔✔',
    'admins.manage': '✔————',
    'ownership.transfer': '✔————',
    'accounts.manage': '✔✔———',
    'teacher.allClasses.set': '✔✔———',
    'classes.manage': '✔✔———',
    'classes.view': '✔✔A——',
    'students.view': '✔✔A——',
    'students.edit': '✔✔A——',
    'students.deactivateOrMove': '✔✔———',
    'guardians.manage': '✔✔———',
    'quran.manage': '✔✔———',
    'quran.view': '✔✔✔——',
    'daily.write': '✔✔A——',
    'leave.mark': '✔✔A——',
    'leave.decide': '✔✔———',
    'homework.confirm': '✔✔A——',
    'homework.revise': '✔✔———',
    'conflict.resolve': '✔✔O——',
    'reports.publish': '✔✔A——',
    'reports.view': '✔✔ASL',
    'notes.internal.view': '✔✔A——',
    'ai.recommendations.view': '✔✔A——',
    'audit.view': '✔✔O——',
    'audit.modify': '—————',
  };
  const symbol = { ALL: '✔', ASSIGNED: 'A', OWN: 'O', SELF_PUBLISHED: 'S', LINKED_PUBLISHED: 'L' } as const;

  it('F02 unit: the matrix grants exactly the approved reach to each role', () => {
    expect(Object.keys(MATRIX).sort()).toEqual(Object.keys(expected).sort());
    for (const [action, grants] of Object.entries(MATRIX)) {
      const row = ROLES.map((role) => {
        const reach = (grants as Partial<Record<Role, keyof typeof symbol>>)[role];
        return reach ? symbol[reach] : '—';
      }).join('');
      expect(row, action).toBe(expected[action as Action]);
    }
  });
});

describe('F02 · membership invariants (FR-ORG-007)', () => {
  const members = [
    { userId: 'owner', role: 'OWNER' as const },
    { userId: 'admin', role: 'ADMIN' as const },
  ];

  it('F02 unit: removing an Admin is allowed while another Owner or Admin remains', () => {
    expect(leavesAnAdmin(members, 'admin', 'TEACHER')).toBe(true);
    expect(leavesAnAdmin(members, 'admin', null)).toBe(true);
  });

  it('F02 unit: the last Owner/Admin cannot be removed ("A madrasa needs at least one Admin")', () => {
    expect(leavesAnAdmin([{ userId: 'admin', role: 'ADMIN' }], 'admin', 'TEACHER')).toBe(false);
    expect(leavesAnAdmin([{ userId: 'owner', role: 'OWNER' }], 'owner', null)).toBe(false);
  });

  it('F02 unit: a madrasa always keeps at least one Owner', () => {
    expect(leavesAnOwner(members, 'admin', 'OWNER')).toBe(true);
    expect(leavesAnOwner(members, 'owner', 'ADMIN')).toBe(false);
    expect(leavesAnOwner([...members, { userId: 'owner2', role: 'OWNER' }], 'owner', 'ADMIN')).toBe(true);
  });
});
