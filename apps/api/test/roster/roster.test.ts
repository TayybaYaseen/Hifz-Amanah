// F03 · Classes and students — integration against real Postgres (docs/specs/06-f03-classes-students.md).
// Seeded fixtures (e2e/fixtures/personas.ts): A1 (teacher.a1; S1, S2), A2 (teacher.a2; S3), B1 (teacher.b1; SB1).
import { sql } from 'kysely';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { addDays, calendarDateIn } from '@hifz/domain/roster';
import { withTenant } from '../../src/platform/tenant.ts';
import { rosterScope } from '../../src/modules/roster/scope.ts';
import { startHarness, type Harness } from '../support/harness.ts';

let h: Harness;
let ids: { classes: Record<'A1' | 'A2' | 'B1', string>; students: Record<'S1' | 'S2' | 'S3' | 'SB1', string> };

type AuditRow = { action: string; actor_user_id: string | null; target_type: string; summary: Record<string, unknown> };
type StudentItem = { id: string; name: string; externalStudentId: string | null; currentClass: { id: string } };
type EnrollmentItem = { classId: string; className: string; startDate: string; endDate: string | null };

beforeAll(async () => {
  h = await startHarness();
}, 60_000);

afterAll(async () => {
  await h?.stop();
});

beforeEach(async () => {
  await h.reset();
  ids = (await h.control('GET', '/roster/ids')).json();
});

const today = () => calendarDateIn(h.clock.now(), 'Asia/Karachi');
const audit = async (targetId: string) => (await h.control('GET', `/audit-target/${targetId}`)).json().items as AuditRow[];
const scopeChanges = async (userId: string) =>
  (await sql<{ n: string }>`SELECT count(*) AS n FROM scope_changes WHERE user_id = ${userId}`.execute(h.db)).rows[0]!.n;

async function createClass(token: string, name: string, teachers: string[] = []) {
  const teacherIds = await Promise.all(teachers.map((t) => h.userId(t)));
  return h.call('POST', '/classes', token, { name, teacherIds });
}

async function createStudent(token: string, body: Record<string, unknown>) {
  return h.call('POST', '/students', token, body);
}

async function allPages(token: string, query: string): Promise<StudentItem[]> {
  const items: StudentItem[] = [];
  let cursor: string | null = null;
  do {
    const res = await h.call('GET', `/students?${query}${cursor ? `&cursor=${cursor}` : ''}`, token);
    expect(res.statusCode).toBe(200);
    const body = res.json();
    items.push(...body.items);
    cursor = body.nextCursor;
  } while (cursor);
  return items;
}

describe('F03 · classes (US-010)', () => {
  it('F03-AC1 (US-010) a class created with Teachers is listed and visible to each assigned Teacher', async () => {
    const admin = await h.signIn('admin.a');
    const res = await createClass(admin, '  Hifz A3  ', ['teacher.a1', 'teacher.a2']);
    expect(res.statusCode).toBe(201);
    const created = res.json();
    expect(created).toMatchObject({ name: 'Hifz A3', status: 'ACTIVE', activeStudentCount: 0, canManage: true });
    expect(created.teachers.map((t: { displayName: string }) => t.displayName).sort()).toEqual(['Test teacher.a1', 'Test teacher.a2']);

    const adminList = (await h.call('GET', '/classes', admin)).json().items.map((c: { name: string }) => c.name);
    expect(adminList).toEqual(['Hifz A1', 'Hifz A2', 'Hifz A3']);
    for (const who of ['teacher.a1', 'teacher.a2'] as const) {
      const list = (await h.call('GET', '/classes', await h.signIn(who))).json().items;
      expect(list.map((c: { name: string }) => c.name)).toContain('Hifz A3');
      expect(list.every((c: { canManage: boolean }) => !c.canManage)).toBe(true);
    }
    // teacher.a1 is not assigned to A2 and does not see it.
    expect((await h.call('GET', '/classes', await h.signIn('teacher.a1'))).json().items.map((c: { name: string }) => c.name)).toEqual(['Hifz A1', 'Hifz A3']);
    expect((await h.call('GET', `/classes/${ids.classes.A2}`, await h.signIn('teacher.a1'))).statusCode).toBe(404);

    const [entry] = await audit(created.id);
    expect(entry).toMatchObject({ action: 'CLASS_CREATED', actor_user_id: await h.userId('admin.a'), target_type: 'CLASS' });
    // Each newly assigned Teacher's device re-syncs its scope (F12 decision Q8).
    expect(Number(await scopeChanges(await h.userId('teacher.a1')))).toBe(1);
  });

  it('F03-AC2 (US-010) an empty class name is a field error and nothing is saved', async () => {
    const admin = await h.signIn('admin.a');
    for (const name of ['', '   ']) {
      const res = await createClass(admin, name, ['teacher.a1']);
      expect(res.statusCode).toBe(400);
      expect(res.json().error).toMatchObject({ code: 'VALIDATION', fields: { name: 'REQUIRED' } });
    }
    expect((await h.call('PATCH', `/classes/${ids.classes.A1}`, admin, { name: ' ' })).json().error.fields).toEqual({ name: 'REQUIRED' });
    expect((await h.call('GET', '/classes', admin)).json().items).toHaveLength(2);
  });

  it('F03-AC3 (US-010) a Teacher cannot create, edit, deactivate, or reactivate a class', async () => {
    const teacher = await h.signIn('teacher.a1');
    const attempts = [
      h.call('POST', '/classes', teacher, { name: 'Teacher class', teacherIds: [] }),
      h.call('PATCH', `/classes/${ids.classes.A1}`, teacher, { name: 'Renamed' }),
      h.call('POST', `/classes/${ids.classes.A1}/deactivate`, teacher),
      h.call('POST', `/classes/${ids.classes.A1}/reactivate`, teacher),
      h.call('GET', '/roster/teachers', teacher),
    ];
    for (const res of await Promise.all(attempts)) {
      expect(res.statusCode).toBe(403);
      expect(res.json().error.code).toBe('FORBIDDEN');
    }
    for (const who of ['student.s1', 'parent.p1'] as const) {
      expect((await h.call('GET', '/classes', await h.signIn(who))).statusCode).toBe(403);
    }
    const a1 = (await h.call('GET', `/classes/${ids.classes.A1}`, teacher)).json();
    expect(a1).toMatchObject({ name: 'Hifz A1', status: 'ACTIVE', canManage: false });
  });

  it('F03-AC4 (US-010) a deactivated class leaves the entry pickers; its enrollments and students are kept', async () => {
    const admin = await h.signIn('admin.a');
    const teacher = await h.signIn('teacher.a2');
    expect((await h.call('GET', '/entry/classes', teacher)).json().items.map((c: { id: string }) => c.id)).toEqual([ids.classes.A2]);

    const res = await h.call('POST', `/classes/${ids.classes.A2}/deactivate`, admin);
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ status: 'INACTIVE', activeStudentCount: 1 });

    expect((await h.call('GET', '/entry/classes', teacher)).json().items).toEqual([]);
    expect((await h.call('GET', `/entry/classes/${ids.classes.A2}/students`, teacher)).statusCode).toBe(404);
    // Not unenrolled (F03 edge cases): S3 still shows A2 as their class, and the class is still listed for history.
    const s3 = (await h.call('GET', `/students/${ids.students.S3}`, admin)).json();
    expect(s3.currentClass).toEqual({ id: ids.classes.A2, name: 'Hifz A2' });
    expect(s3.enrollments).toHaveLength(1);
    expect((await h.call('GET', '/classes?status=INACTIVE', teacher)).json().items.map((c: { id: string }) => c.id)).toEqual([ids.classes.A2]);
    expect((await audit(ids.classes.A2)).map((r) => [r.action, r.summary])).toEqual([['CLASS_DEACTIVATED', { activeStudentsKept: 1 }]]);
  });

  it('F03-AC5 (US-010) a madrasa with no classes lists none', async () => {
    await h.control('POST', '/organizations', { name: 'Madrasa Jeem (test)', code: 'JEEM', owner: { loginId: 'JEEM-owner' } });
    const res = await h.call('GET', '/classes', await h.signIn('JEEM-owner'));
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ items: [] });
  });

  it('F03-AC14 (US-010) active class names are unique per madrasa ignoring case; a deactivated name may be reused', async () => {
    const admin = await h.signIn('admin.a');
    expect((await createClass(admin, 'Hifz A')).statusCode).toBe(201);
    for (const res of [await createClass(admin, 'hifz a'), await h.call('PATCH', `/classes/${ids.classes.A1}`, admin, { name: ' HIFZ A ' })]) {
      expect(res.statusCode).toBe(400);
      expect(res.json().error.fields).toEqual({ name: 'TAKEN' });
    }
    // Another madrasa may use the name.
    expect((await createClass(await h.signIn('admin.b'), 'Hifz A')).statusCode).toBe(201);
    // Deactivate "Hifz A1"; its name is free again, and reactivating the old one is then refused.
    expect((await h.call('POST', `/classes/${ids.classes.A1}/deactivate`, admin)).statusCode).toBe(200);
    expect((await createClass(admin, 'hifz a1')).statusCode).toBe(201);
    const reactivate = await h.call('POST', `/classes/${ids.classes.A1}/reactivate`, admin);
    expect(reactivate.statusCode).toBe(400);
    expect(reactivate.json().error.fields).toEqual({ name: 'TAKEN' });
  });

  it('F03 unit: editing teachers ends old assignments (kept as history) and resets both Teachers’ sync scope', async () => {
    const admin = await h.signIn('admin.a');
    const [a1, a2] = [await h.userId('teacher.a1'), await h.userId('teacher.a2')];
    const res = await h.call('PATCH', `/classes/${ids.classes.A1}`, admin, { teacherIds: [a2] });
    expect(res.json().teachers.map((t: { userId: string }) => t.userId)).toEqual([a2]);
    expect((await h.call('GET', `/classes/${ids.classes.A1}`, await h.signIn('teacher.a1'))).statusCode).toBe(404);
    const rows = await sql<{ teacher_user_id: string; unassigned_at: Date | null }>`
      SELECT teacher_user_id, unassigned_at FROM class_teachers WHERE class_id = ${ids.classes.A1} ORDER BY assigned_at`.execute(h.db);
    expect(rows.rows.map((r) => [r.teacher_user_id, r.unassigned_at !== null])).toEqual([
      [a1, true],
      [a2, false],
    ]);
    expect(Number(await scopeChanges(a1))).toBe(1);
    expect(Number(await scopeChanges(a2))).toBe(1);
    // Only active Teachers of this madrasa may be assigned.
    for (const bad of [await h.userId('admin.a'), await h.userId('teacher.b1'), '0190a1b2-c3d4-7e5f-8a6b-7c8d9e0f1a2b']) {
      const r = await h.call('PATCH', `/classes/${ids.classes.A1}`, admin, { teacherIds: [bad] });
      expect(r.json().error.fields).toEqual({ teacherIds: 'INVALID' });
    }
  });
});

describe('F03 · students (US-011)', () => {
  it('F03-AC6 (US-011) a new student is saved in the active madrasa and audited', async () => {
    const admin = await h.signIn('admin.a');
    const res = await createStudent(admin, { name: 'Test Student Four', classId: ids.classes.A1, externalStudentId: ' EXT-A-004 ', admissionDate: '2026-09-15' });
    expect(res.statusCode).toBe(201);
    const s = res.json();
    expect(s).toMatchObject({
      name: 'Test Student Four',
      externalStudentId: 'EXT-A-004',
      admissionDate: '2026-09-15',
      status: 'ACTIVE',
      privateNotes: null,
      enrollments: [{ classId: ids.classes.A1, className: 'Hifz A1', startDate: '2026-09-15', endDate: null }],
      canEdit: true,
      canManage: true,
    });
    const row = await sql<{ organization_id: string }>`SELECT organization_id FROM students WHERE id = ${s.id}`.execute(h.db);
    expect(row.rows[0]!.organization_id).toBe((await h.call('GET', '/organization', admin)).json().id);
    const [entry] = await audit(s.id);
    expect(entry).toMatchObject({ action: 'STUDENT_CREATED', actor_user_id: await h.userId('admin.a'), target_type: 'STUDENT' });
    expect(entry!.summary).toMatchObject({ classId: ids.classes.A1, startDate: '2026-09-15' });
    // Unknown, cross-tenant, or organization-carrying bodies are refused.
    expect((await createStudent(admin, { name: 'X', classId: ids.classes.B1 })).statusCode).toBe(404);
    const withOrg = await createStudent(admin, { name: 'X', classId: ids.classes.A1, organizationId: ids.classes.B1 });
    expect(withOrg.json().error.fields).toMatchObject({ organizationId: 'NOT_ALLOWED' });
  });

  it('F03-AC6 (US-011) without an admission date the enrollment starts today in the madrasa timezone', async () => {
    const res = await createStudent(await h.signIn('admin.a'), { name: 'Today Student', classId: ids.classes.A1 });
    expect(res.json().enrollments[0].startDate).toBe(today());
    expect(res.json().currentClass).toEqual({ id: ids.classes.A1, name: 'Hifz A1' });
  });

  it('F03-AC7 (US-011) a duplicate External Student ID in the same madrasa is rejected; another madrasa may use it', async () => {
    const admin = await h.signIn('admin.a');
    for (const externalStudentId of ['EXT-A-001', 'ext-a-001 ']) {
      const res = await createStudent(admin, { name: 'Copy', classId: ids.classes.A1, externalStudentId });
      expect(res.statusCode).toBe(400);
      expect(res.json().error.fields).toEqual({ externalStudentId: 'TAKEN' });
    }
    const edit = await h.call('PATCH', `/students/${ids.students.S2}`, admin, { externalStudentId: 'EXT-A-001' });
    expect(edit.json().error.fields).toEqual({ externalStudentId: 'TAKEN' });
    // Keeping one's own ID is not a clash.
    expect((await h.call('PATCH', `/students/${ids.students.S1}`, admin, { externalStudentId: 'EXT-A-001', name: 'Renamed One' })).statusCode).toBe(200);
    expect((await createStudent(await h.signIn('admin.b'), { name: 'Bee Two', classId: ids.classes.B1, externalStudentId: 'EXT-A-001' })).statusCode).toBe(201);
  });

  it('F03-AC8 (US-011) search by name or External Student ID and filters by class and status page through matches only', async () => {
    const admin = await h.signIn('admin.a');
    for (let i = 1; i <= 30; i++) {
      const n = String(i).padStart(2, '0');
      await createStudent(admin, { name: `Zaid ${n}`, classId: i % 2 ? ids.classes.A1 : ids.classes.A2, externalStudentId: `ROLL-${n}` });
    }
    const zaid = await allPages(admin, 'q=zaid&limit=7');
    expect(zaid).toHaveLength(30);
    expect(new Set(zaid.map((s) => s.id)).size).toBe(30);
    expect(zaid.map((s) => s.name)).toEqual([...zaid.map((s) => s.name)].sort());

    expect((await allPages(admin, 'q=ROLL-1')).map((s) => s.externalStudentId)).toEqual(
      ['ROLL-10', 'ROLL-11', 'ROLL-12', 'ROLL-13', 'ROLL-14', 'ROLL-15', 'ROLL-16', 'ROLL-17', 'ROLL-18', 'ROLL-19'],
    );
    const inA2 = await allPages(admin, `classId=${ids.classes.A2}&limit=4`);
    expect(inA2).toHaveLength(16); // 15 new + S3
    expect(inA2.every((s) => s.currentClass.id === ids.classes.A2)).toBe(true);

    await h.call('POST', `/students/${ids.students.S2}/deactivate`, admin);
    expect((await allPages(admin, 'status=INACTIVE')).map((s) => s.id)).toEqual([ids.students.S2]);
    expect((await allPages(admin, 'q=Test Student')).map((s) => s.name)).toEqual(['Test Student One', 'Test Student Three']);
    expect((await allPages(admin, 'q=Test Student&status=ALL')).length).toBe(3);
    // Wildcards are literal; nothing matches.
    expect(await allPages(admin, 'q=%25')).toEqual([]);
    expect((await h.call('GET', '/students?cursor=not-a-cursor', admin)).json().error.fields).toEqual({ cursor: 'INVALID' });
  });

  it('F03-AC9 (US-011) deactivating a student deletes nothing and leaves the entry pickers', async () => {
    const admin = await h.signIn('admin.a');
    const teacher = await h.signIn('teacher.a1');
    const before = (await h.call('GET', `/students/${ids.students.S2}`, admin)).json();
    const res = await h.call('POST', `/students/${ids.students.S2}/deactivate`, admin);
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ status: 'INACTIVE', enrollments: before.enrollments, currentClass: before.currentClass });
    const picker = (await h.call('GET', `/entry/classes/${ids.classes.A1}/students`, teacher)).json();
    expect(picker.items.map((s: { id: string }) => s.id)).toEqual([ids.students.S1]);
    // Still visible to the Teacher (for earlier periods), with its history.
    expect((await h.call('GET', `/students/${ids.students.S2}`, teacher)).json().enrollments).toEqual(before.enrollments);
    expect((await audit(ids.students.S2)).map((r) => r.action)).toEqual(['STUDENT_DEACTIVATED']);
  });

  it('F03-AC10 (US-011) a reactivated student is back in the entry pickers with history intact', async () => {
    const admin = await h.signIn('admin.a');
    const teacher = await h.signIn('teacher.a1');
    const before = (await h.call('GET', `/students/${ids.students.S2}`, admin)).json();
    await h.call('POST', `/students/${ids.students.S2}/deactivate`, admin);
    const res = await h.call('POST', `/students/${ids.students.S2}/reactivate`, admin);
    expect(res.json()).toMatchObject({ status: 'ACTIVE', enrollments: before.enrollments });
    const picker = (await h.call('GET', `/entry/classes/${ids.classes.A1}/students`, teacher)).json();
    expect(picker.items.map((s: { id: string }) => s.id).sort()).toEqual([ids.students.S1, ids.students.S2].sort());
    expect((await audit(ids.students.S2)).map((r) => r.action)).toEqual(['STUDENT_DEACTIVATED', 'STUDENT_REACTIVATED']);
  });

  it('F03-AC15 (US-011) a Teacher adds and edits students only in assigned classes, audited', async () => {
    const teacher = await h.signIn('teacher.a1');
    const added = await createStudent(teacher, { name: 'Teacher Added', classId: ids.classes.A1 });
    expect(added.statusCode).toBe(201);
    expect(added.json()).toMatchObject({ canEdit: true, canManage: false });
    const edited = await h.call('PATCH', `/students/${added.json().id}`, teacher, { name: 'Teacher Edited', privateNotes: 'Needs quiet seat' });
    expect(edited.json()).toMatchObject({ name: 'Teacher Edited', privateNotes: 'Needs quiet seat' });
    const trail = await audit(added.json().id);
    expect(trail.map((r) => [r.action, r.actor_user_id])).toEqual([
      ['STUDENT_CREATED', await h.userId('teacher.a1')],
      ['STUDENT_UPDATED', await h.userId('teacher.a1')],
    ]);
    // The note body never reaches the audit trail.
    expect(JSON.stringify(trail)).not.toContain('quiet seat');

    // Not assigned to A2: refused like a missing class or student.
    expect((await createStudent(teacher, { name: 'Elsewhere', classId: ids.classes.A2 })).statusCode).toBe(404);
    expect((await h.call('PATCH', `/students/${ids.students.S3}`, teacher, { name: 'Hijack' })).statusCode).toBe(404);
    expect((await h.call('GET', `/students/${ids.students.S3}`, teacher)).statusCode).toBe(404);
    expect((await allPages(teacher, 'status=ALL')).map((s) => s.name).sort()).toEqual(['Teacher Edited', 'Test Student One', 'Test Student Two']);
    // With "all classes", the Teacher reaches every class.
    await h.call('POST', `/accounts/${await h.userId('teacher.a1')}/all-classes`, await h.signIn('admin.a'), { allClasses: true });
    expect((await h.call('PATCH', `/students/${ids.students.S3}`, teacher, { name: 'Test Student Three' })).statusCode).toBe(200);
  });

  it('F03-AC16 (US-011) a Teacher cannot deactivate, reactivate, or move students, or create login accounts', async () => {
    const teacher = await h.signIn('teacher.a1');
    const attempts = [
      h.call('POST', `/students/${ids.students.S1}/deactivate`, teacher),
      h.call('POST', `/students/${ids.students.S1}/reactivate`, teacher),
      h.call('POST', `/students/${ids.students.S1}/enrollments`, teacher, { classId: ids.classes.A2, startDate: today() }),
      h.call('POST', '/accounts', teacher, { role: 'STUDENT', loginId: 'ALIF-S99', displayName: 'X', password: 'Long-enough-pass-1' }),
      h.call('POST', '/accounts', teacher, { role: 'PARENT', loginId: 'ALIF-P99', displayName: 'X', password: 'Long-enough-pass-1' }),
    ];
    for (const res of await Promise.all(attempts)) expect(res.statusCode).toBe(403);
    const s1 = (await h.call('GET', `/students/${ids.students.S1}`, teacher)).json();
    expect(s1).toMatchObject({ status: 'ACTIVE', currentClass: { id: ids.classes.A1 }, canManage: false });
  });

  it('F03-AC17 (US-011) only name and class are required; fields outside DEC-B56 are refused', async () => {
    const admin = await h.signIn('admin.a');
    const missing = await createStudent(admin, {});
    expect(missing.statusCode).toBe(400);
    expect(Object.keys(missing.json().error.fields).sort()).toEqual(['classId', 'name']);
    for (const extra of ['dateOfBirth', 'address', 'phone', 'photo']) {
      const res = await createStudent(admin, { name: 'Minimal', classId: ids.classes.A1, [extra]: 'x' });
      expect(res.json().error.fields).toMatchObject({ [extra]: 'NOT_ALLOWED' });
    }
    expect((await createStudent(admin, { name: 'Minimal', classId: ids.classes.A1 })).statusCode).toBe(201);
    expect((await createStudent(admin, { name: 'Bad date', classId: ids.classes.A1, admissionDate: '2026-02-30' })).json().error.fields).toEqual({
      admissionDate: 'INVALID',
    });
  });

  it('F03-AC19 (US-011) a class of 60 lists 25 per page, with search and filters applied on the server', async () => {
    const admin = await h.signIn('admin.a');
    const big = (await createClass(admin, 'Hifz Big')).json().id;
    for (let i = 1; i <= 60; i++) await createStudent(admin, { name: `Big ${String(i).padStart(2, '0')}`, classId: big });
    const first = (await h.call('GET', `/students?classId=${big}`, admin)).json();
    expect(first.items).toHaveLength(25);
    expect(first.items[0].name).toBe('Big 01');
    const second = (await h.call('GET', `/students?classId=${big}&cursor=${first.nextCursor}`, admin)).json();
    expect(second.items.map((s: { name: string }) => s.name)[0]).toBe('Big 26');
    const third = (await h.call('GET', `/students?classId=${big}&cursor=${second.nextCursor}`, admin)).json();
    expect(third.items).toHaveLength(10);
    expect(third.nextCursor).toBeNull();
    const searched = (await h.call('GET', `/students?classId=${big}&q=Big 5`, admin)).json();
    expect(searched.items.map((s: { name: string }) => s.name)).toEqual(['Big 50', 'Big 51', 'Big 52', 'Big 53', 'Big 54', 'Big 55', 'Big 56', 'Big 57', 'Big 58', 'Big 59']);
    expect((await h.call('GET', '/students?limit=101', admin)).statusCode).toBe(400);
  });
});

describe('F03 · enrollments (US-012)', () => {
  it('F03-AC11 (US-012) moving a student ends the old enrollment the day before the new one starts', async () => {
    const admin = await h.signIn('admin.a');
    const d = addDays(today(), 3);
    const res = await h.call('POST', `/students/${ids.students.S2}/enrollments`, admin, { classId: ids.classes.A2, startDate: d });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.enrollments.map((e: EnrollmentItem) => [e.classId, e.endDate])).toEqual([
      [ids.classes.A1, addDays(d, -1)],
      [ids.classes.A2, null],
    ]);
    expect(body.enrollments[1].startDate).toBe(d);
    // A future move: still in A1 today, with A2 upcoming (F03 edge cases).
    expect(body.currentClass).toEqual({ id: ids.classes.A1, name: 'Hifz A1' });
    expect(body.upcomingClass).toEqual({ id: ids.classes.A2, name: 'Hifz A2', startDate: d });
    const [entry] = await audit(ids.students.S2);
    expect(entry).toMatchObject({ action: 'STUDENT_MOVED', summary: { fromClassId: ids.classes.A1, toClassId: ids.classes.A2, startDate: d, previousEndDate: addDays(d, -1) } });
    // Both classes' Teachers re-sync their scope (F12 decision Q8).
    expect(Number(await scopeChanges(await h.userId('teacher.a1')))).toBe(1);
    expect(Number(await scopeChanges(await h.userId('teacher.a2')))).toBe(1);
  });

  it('F03-AC12 (US-012) the enrollment history still shows the old class for dates before the move', async () => {
    const admin = await h.signIn('admin.a');
    await h.call('POST', `/students/${ids.students.S2}/enrollments`, admin, { classId: ids.classes.A2, startDate: today() });
    const yesterday = addDays(today(), -1);
    const teacherA1 = await h.signIn('teacher.a1');
    // Today's picker follows the move; yesterday's still lists S2 in A1.
    const a1Today = (await h.call('GET', `/entry/classes/${ids.classes.A1}/students`, teacherA1)).json();
    expect(a1Today.items.map((s: { id: string }) => s.id)).toEqual([ids.students.S1]);
    const a1Yesterday = (await h.call('GET', `/entry/classes/${ids.classes.A1}/students?date=${yesterday}`, teacherA1)).json();
    expect(a1Yesterday.items.map((s: { id: string }) => s.id).sort()).toEqual([ids.students.S1, ids.students.S2].sort());
  });

  it('F03-AC13 (US-012) the profile lists the full enrollment history with start and end dates', async () => {
    const admin = await h.signIn('admin.a');
    const third = (await createClass(admin, 'Hifz A3')).json().id;
    await h.call('POST', `/students/${ids.students.S1}/enrollments`, admin, { classId: ids.classes.A2, startDate: addDays(today(), -10) });
    await h.call('POST', `/students/${ids.students.S1}/enrollments`, admin, { classId: third, startDate: addDays(today(), -2) });
    const s1 = (await h.call('GET', `/students/${ids.students.S1}`, admin)).json();
    expect(s1.enrollments.map((e: EnrollmentItem) => [e.className, e.startDate, e.endDate])).toEqual([
      ['Hifz A1', addDays(today(), -90), addDays(today(), -11)],
      ['Hifz A2', addDays(today(), -10), addDays(today(), -3)],
      ['Hifz A3', addDays(today(), -2), null],
    ]);
  });

  it('F03-AC18 (US-012) enrolling a student who has a class is a move: exactly one active class', async () => {
    const admin = await h.signIn('admin.a');
    await h.call('POST', `/students/${ids.students.S3}/enrollments`, admin, { classId: ids.classes.A1, startDate: today() });
    const open = await sql<{ n: string }>`SELECT count(*) AS n FROM student_enrollments WHERE student_id = ${ids.students.S3} AND end_date IS NULL`.execute(h.db);
    expect(open.rows[0]!.n).toBe('1');
    const s3 = (await h.call('GET', `/students/${ids.students.S3}`, admin)).json();
    expect(s3.currentClass.id).toBe(ids.classes.A1);
    // Refusals: same class, not after the current start, an inactive class, a bad date.
    const same = await h.call('POST', `/students/${ids.students.S3}/enrollments`, admin, { classId: ids.classes.A1, startDate: addDays(today(), 5) });
    expect(same.json().error.fields).toEqual({ classId: 'SAME_CLASS' });
    const early = await h.call('POST', `/students/${ids.students.S3}/enrollments`, admin, { classId: ids.classes.A2, startDate: today() });
    expect(early.json().error.fields).toEqual({ startDate: 'BEFORE_CURRENT_START' });
    await h.call('POST', `/classes/${ids.classes.A2}/deactivate`, admin);
    const inactive = await h.call('POST', `/students/${ids.students.S3}/enrollments`, admin, { classId: ids.classes.A2, startDate: addDays(today(), 5) });
    expect(inactive.json().error.fields).toEqual({ classId: 'CLASS_INACTIVE' });
    const bad = await h.call('POST', `/students/${ids.students.S3}/enrollments`, admin, { classId: ids.classes.A1, startDate: '2026-13-01' });
    expect(bad.json().error.fields).toEqual({ startDate: 'INVALID' });
  });
});

describe('F03 · tenancy, history, and sync scope', () => {
  it('F03 security: another madrasa’s classes and students are 404 to every role (FR-SEC-008)', async () => {
    const adminB = await h.signIn('admin.b');
    for (const url of [`/classes/${ids.classes.A1}`, `/students/${ids.students.S1}`, `/entry/classes/${ids.classes.A1}/students`]) {
      expect((await h.call('GET', url, adminB)).statusCode).toBe(404);
    }
    expect((await h.call('PATCH', `/students/${ids.students.S1}`, adminB, { name: 'x' })).statusCode).toBe(404);
    expect((await h.call('POST', `/students/${ids.students.S1}/deactivate`, adminB)).statusCode).toBe(404);
    expect((await h.call('POST', `/classes/${ids.classes.A1}/deactivate`, adminB)).statusCode).toBe(404);
    expect((await h.call('GET', '/students?status=ALL', adminB)).json().items.map((s: { name: string }) => s.name)).toEqual(['Test Student Bee']);
    expect((await h.call('GET', `/students?classId=${ids.classes.A1}`, adminB)).json().items).toEqual([]);
  });

  it('F03 Done: no delete route exists and the database refuses deletes of roster rows', async () => {
    const admin = await h.signIn('admin.a');
    for (const url of [`/classes/${ids.classes.A1}`, `/students/${ids.students.S1}`]) {
      expect((await h.call('DELETE', url, admin)).statusCode).toBe(404);
    }
    for (const table of ['student_enrollments', 'class_teachers', 'students', 'classes']) {
      await expect(sql`DELETE FROM ${sql.table(table)}`.execute(h.db)).rejects.toThrow(/never deleted/);
    }
  });

  it('F03 security: row-level security hides other madrasas’ roster rows and the tenant role cannot delete', async () => {
    const orgA = (await h.call('GET', '/organization', await h.signIn('admin.a'))).json().id;
    const seen = await withTenant(h.db, orgA, async (tx) => (await tx.selectFrom('students').select('id').execute()).map((r) => r.id));
    expect(seen.sort()).toEqual([ids.students.S1, ids.students.S2, ids.students.S3].sort());
    await expect(withTenant(h.db, orgA, (tx) => sql`DELETE FROM students`.execute(tx))).rejects.toThrow(/permission denied/);
  });

  it('F03 unit: the sync scope of a Teacher is their classes and the students enrolled in them (F12-AC7)', async () => {
    const provider = rosterScope(h.db, h.clock);
    const actorOf = async (who: 'teacher.a1' | 'admin.a') => {
      const me = (await h.call('GET', '/me', await h.signIn(who))).json();
      return { userId: me.id, organizationId: me.organization.id, role: me.role, allClasses: false } as never;
    };
    const scope = await provider.scopeFor(await actorOf('teacher.a1'));
    expect(scope.kind).toBe('KEYS');
    if (scope.kind !== 'KEYS') return;
    expect([...scope.classIds]).toEqual([ids.classes.A1]);
    expect([...scope.studentIds].sort()).toEqual([ids.students.S1, ids.students.S2].sort());
    expect((await provider.scopeFor(await actorOf('admin.a'))).kind).toBe('ORGANIZATION');
  });

  it('F03 unit: setting or clearing "all classes" resets the Teacher’s sync scope (F12 decision Q8)', async () => {
    const admin = await h.signIn('admin.a');
    const teacher = await h.userId('teacher.a1');
    await h.call('POST', `/accounts/${teacher}/all-classes`, admin, { allClasses: true });
    await h.call('POST', `/accounts/${teacher}/all-classes`, admin, { allClasses: false });
    expect(Number(await scopeChanges(teacher))).toBe(2);
  });

  it('F03 edge case: long names and Urdu script are stored and returned exactly', async () => {
    const admin = await h.signIn('admin.a');
    const name = 'محمد عبداللہ بن عبدالرحمٰن '.repeat(6).trim();
    const res = await createStudent(admin, { name, classId: ids.classes.A1 });
    expect(res.json().name).toBe(name);
    expect((await allPages(admin, `q=${encodeURIComponent('عبداللہ')}`)).map((s) => s.id)).toEqual([res.json().id]);
    // Same name twice is allowed; the roll number tells them apart (F03 edge cases).
    expect((await createStudent(admin, { name, classId: ids.classes.A1, externalStudentId: 'ROLL-2' })).statusCode).toBe(201);
  });
});
