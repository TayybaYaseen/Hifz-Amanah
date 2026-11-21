// F03 · Classes and students — API E2E (docs/specs/06-f03-classes-students.md)
// Screen journeys: e2e/mobile/f03-roster/.
// Daily records, attempts, and homework (F05/F08) are written through POST /sync/push (support/daily-entry.ts). Criteria
// parts that need reports (F09) stay test.fixme until F09 exists; the roster parts are also covered by
// apps/api/test/roster/roster.test.ts (docs/handover/F03-plan.md).
import type { APIRequestContext } from '@playwright/test';
import {
  applied,
  classDay,
  classDayBefore,
  confirmOp,
  draftOp,
  getJson,
  homeworkDetail,
  para,
  presentRecord,
  recite,
  recordDetail,
  sourcesOf,
  suggestedPortion,
  today,
  type Ids,
  type StudentKey,
  type ClassKey,
} from './support/daily-entry';
import { expect, test } from './support/fixtures';

/** A record with a partial Sabqi attempt and confirmed homework carrying it forward, plus a later draft. */
async function history(api: APIRequestContext, ids: Ids, student: StudentKey, day: string, classKey: ClassKey = 'A1') {
  const recordId = await presentRecord(api, ids, student, day, classKey);
  const sabqi = await recite(api, recordId, { section: 'SABQI', paraNumber: 3, assigned: para(3, 4) }, { status: 'PARTIAL', completed: para(1, 2) });
  const manzil = await recite(api, recordId, { section: 'MANZIL', position: 1, paraNumber: 9, assigned: para(1) }, { status: 'NOT_REMEMBERED' });
  const confirmed = await applied(api, draftOp(ids, student, { assignedDate: day, sourceDailyRecordId: recordId, portions: [suggestedPortion(sabqi.attemptId)] }));
  await applied(api, confirmOp(confirmed.id, confirmed.rowVersion, await sourcesOf(api, recordId)));
  const draft = await applied(api, draftOp(ids, student, { assignedDate: day, sourceDailyRecordId: recordId, portions: [suggestedPortion(manzil.attemptId, { section: 'MANZIL' })] }));
  return { recordId, sabqi, manzil, confirmedId: confirmed.id, draftId: draft.id };
}

/** Everything the student's history holds, as staff read it: records (with portions and attempts) and homework. */
async function snapshot(api: APIRequestContext, ids: Ids, student: StudentKey, from: string, to: string) {
  const records = (await getJson(api, `/hifz/daily-records?studentId=${ids.students[student]}&from=${from}&to=${to}`)).items as Array<{ id: string }>;
  const homework = await getJson(api, `/homework/assignments?studentId=${ids.students[student]}`);
  const strip = (h: Record<string, unknown>) => ({ ...h, state: undefined, carriedOver: undefined });
  return {
    records: await Promise.all(records.map((r) => recordDetail(api, r.id))),
    homework: await Promise.all((homework.items as Array<{ id: string }>).map(async (h) => strip(await homeworkDetail(api, h.id)))),
  };
}

const pickerStudents = async (api: APIRequestContext, classId: string) => ((await getJson(api, `/entry/classes/${classId}/students?date=${today()}`)).items as Array<{ id: string }>).map((s) => s.id);

type Student = { id: string; name: string; externalStudentId: string | null; status: string; currentClass: { id: string } | null };
type Page = { items: Student[]; nextCursor: string | null };

/** Today in Asia/Karachi (the seeded madrasas' timezone), moved by `days`. */
function karachiDate(days = 0): string {
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Karachi' }).format(new Date());
  const d = new Date(`${today}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

async function allPages(api: APIRequestContext, query: string): Promise<Student[]> {
  const items: Student[] = [];
  let cursor: string | null = null;
  do {
    const res = await api.get(`/students?${query}${cursor ? `&cursor=${cursor}` : ''}`);
    expect(res.status()).toBe(200);
    const page = (await res.json()) as Page;
    items.push(...page.items);
    cursor = page.nextCursor;
  } while (cursor);
  return items;
}

const classNames = async (api: APIRequestContext) => ((await (await api.get('/classes')).json()).items as Array<{ name: string }>).map((c) => c.name);

test.describe('F03 · Classes and students', { tag: '@F03' }, () => {
  test('F03-AC1 (US-010) a new class with teachers is visible to each assigned Teacher', async ({ as, control }) => {
    // As admin.a create class "Hifz A3" with teacher.a1 and teacher.a2; both list it.
    const admin = await as('admin.a');
    const teacherIds = [await control.userIdOf('teacher.a1'), await control.userIdOf('teacher.a2')];
    const res = await admin.post('/classes', { data: { name: 'Hifz A3', teacherIds } });
    expect(res.status()).toBe(201);
    const created = await res.json();
    expect(created).toMatchObject({ name: 'Hifz A3', status: 'ACTIVE' });
    expect((created.teachers as Array<{ userId: string }>).map((t) => t.userId).sort()).toEqual([...teacherIds].sort());
    expect(await classNames(admin)).toContain('Hifz A3');
    for (const who of ['teacher.a1', 'teacher.a2'] as const) expect(await classNames(await as(who))).toContain('Hifz A3');
  });

  test('F03-AC2 (US-010) an empty class name is rejected', async ({ as }) => {
    // As admin.a create a class with name "" → field error; no class created.
    const admin = await as('admin.a');
    const before = await classNames(admin);
    for (const name of ['', '   ']) {
      const res = await admin.post('/classes', { data: { name, teacherIds: [] } });
      expect(res.status()).toBe(400);
      expect((await res.json()).error).toMatchObject({ code: 'VALIDATION', fields: { name: 'REQUIRED' } });
    }
    expect(await classNames(admin)).toEqual(before);
  });

  test('F03-AC3 (US-010) a Teacher cannot create, edit, or deactivate a class', async ({ as, control }) => {
    // As teacher.a1 call each endpoint → forbidden; nothing changes.
    const { classes } = await control.rosterIds();
    const teacher = await as('teacher.a1');
    const before = await (await teacher.get(`/classes/${classes.A1}`)).json();
    for (const res of [
      await teacher.post('/classes', { data: { name: 'Teacher class', teacherIds: [] } }),
      await teacher.patch(`/classes/${classes.A1}`, { data: { name: 'Renamed' } }),
      await teacher.post(`/classes/${classes.A1}/deactivate`),
    ]) {
      expect(res.status()).toBe(403);
      expect((await res.json()).error.code).toBe('FORBIDDEN');
    }
    expect(await (await teacher.get(`/classes/${classes.A1}`)).json()).toEqual(before);
    expect(await classNames(await as('admin.a'))).toEqual(['Hifz A1', 'Hifz A2']);
  });

  test('F03-AC4 (US-010) a deactivated class leaves pickers but keeps its records', async ({ as, control }) => {
    // Seed attendance, a record, attempts, and homework in A2; admin.a deactivates A2.
    // Entry pickers exclude A2; the past A2 records and homework are still returned unchanged.
    const ids = await control.rosterIds();
    const day = classDay(1);
    const seeded = await history(await as('teacher.a2'), ids, 'S3', day, 'A2');
    const admin = await as('admin.a');
    const entryClasses = async () => ((await getJson(admin, '/entry/classes')).items as Array<{ id: string }>).map((c) => c.id);
    expect(await entryClasses()).toContain(ids.classes.A2);
    const before = await snapshot(admin, ids, 'S3', day, day);
    expect(before.records.map((r) => r.record.id)).toEqual([seeded.recordId]);

    expect((await admin.post(`/classes/${ids.classes.A2}/deactivate`)).status()).toBe(200);
    expect(await entryClasses()).not.toContain(ids.classes.A2);
    expect(await entryClasses()).toContain(ids.classes.A1);
    expect(await snapshot(admin, ids, 'S3', day, day)).toEqual(before);
    expect((await getJson(admin, `/hifz/daily-records?classId=${ids.classes.A2}&date=${day}`)).items.map((r: { id: string }) => r.id)).toEqual([seeded.recordId]);
    // Bulk Entry no longer offers the class; its past attendance is still counted.
    expect((await admin.get(`/attendance/sheet?classId=${ids.classes.A2}&date=${day}`)).status()).toBe(404);
    const summary = await getJson(admin, `/attendance/summary?classId=${ids.classes.A2}&from=${day}&to=${day}`);
    expect((summary.students as Array<{ studentId: string; counts: Record<string, number> }>).find((s) => s.studentId === ids.students.S3)!.counts).toMatchObject({ present: 1, attended: 1 });
  });

  test.fixme('F03-AC4 (US-010) past reports of a deactivated class still return its records', async () => {
    // Waits for F09 (weekly/monthly reports). Seed records in A2; admin.a deactivates A2; a past A2 report still returns them.
  });

  test('F03-AC6 (US-011) a new student is saved in the active madrasa and audited', async ({ as, control }) => {
    // As admin.a create a student with External Student ID and admission date; it is in Madrasa A; audit exists.
    const { classes } = await control.rosterIds();
    const admin = await as('admin.a');
    const res = await admin.post('/students', { data: { name: 'Test Student Four', classId: classes.A1, externalStudentId: 'EXT-A-004', admissionDate: '2026-09-15' } });
    expect(res.status()).toBe(201);
    const student = await res.json();
    expect(student).toMatchObject({ name: 'Test Student Four', externalStudentId: 'EXT-A-004', admissionDate: '2026-09-15', status: 'ACTIVE' });
    // In Madrasa A: Madrasa B cannot see it; Madrasa A lists it.
    expect((await (await as('admin.b')).get(`/students/${student.id}`)).status()).toBe(404);
    expect((await allPages(admin, 'q=EXT-A-004')).map((s) => s.id)).toEqual([student.id]);
    const audit = await control.auditForTarget(student.id);
    expect(audit).toHaveLength(1);
    expect(audit[0]).toMatchObject({ action: 'STUDENT_CREATED', actor_user_id: await control.userIdOf('admin.a'), target_type: 'STUDENT' });
  });

  test('F03-AC7 (US-011) a duplicate External Student ID in the same madrasa is rejected', async ({ as, control }) => {
    // As admin.a create a student with EXT-A-001 → field error.
    // As admin.b create a student with EXT-A-001 in Madrasa B → allowed.
    const { classes } = await control.rosterIds();
    const res = await (await as('admin.a')).post('/students', { data: { name: 'Copy', classId: classes.A1, externalStudentId: 'EXT-A-001' } });
    expect(res.status()).toBe(400);
    expect((await res.json()).error).toMatchObject({ code: 'VALIDATION', fields: { externalStudentId: 'TAKEN' } });
    const other = await (await as('admin.b')).post('/students', { data: { name: 'Bee Copy', classId: classes.B1, externalStudentId: 'EXT-A-001' } });
    expect(other.status()).toBe(201);
  });

  test('F03-AC8 (US-011) search and filters page through matching students only', async ({ as, control }) => {
    // Seed more than one page of students; search by name, by External Student ID, filter by class and status.
    // Each page contains only matches; paging returns every match exactly once.
    const { classes, students } = await control.rosterIds();
    const admin = await as('admin.a');
    for (let i = 1; i <= 30; i++) {
      const n = String(i).padStart(2, '0');
      const res = await admin.post('/students', { data: { name: `Zaid ${n}`, classId: i % 2 ? classes.A1 : classes.A2, externalStudentId: `ROLL-${n}` } });
      expect(res.status()).toBe(201);
    }
    const first = (await (await admin.get('/students?q=zaid')).json()) as Page;
    expect(first.items).toHaveLength(25);
    expect(first.nextCursor).not.toBeNull();
    const byName = await allPages(admin, 'q=zaid&limit=7');
    expect(byName).toHaveLength(30);
    expect(new Set(byName.map((s) => s.id)).size).toBe(30);
    expect(byName.every((s) => s.name.startsWith('Zaid'))).toBe(true);

    expect((await allPages(admin, 'q=roll-2')).map((s) => s.externalStudentId)).toEqual(
      ['ROLL-20', 'ROLL-21', 'ROLL-22', 'ROLL-23', 'ROLL-24', 'ROLL-25', 'ROLL-26', 'ROLL-27', 'ROLL-28', 'ROLL-29'],
    );
    const inA2 = await allPages(admin, `classId=${classes.A2}&limit=5`);
    expect(inA2).toHaveLength(16);
    expect(inA2.every((s) => s.currentClass?.id === classes.A2)).toBe(true);

    expect((await admin.post(`/students/${students.S2}/deactivate`)).status()).toBe(200);
    expect((await allPages(admin, 'status=INACTIVE')).map((s) => s.id)).toEqual([students.S2]);
    expect((await allPages(admin, `classId=${classes.A1}&q=Test`)).map((s) => s.id)).toEqual([students.S1]);
  });

  test('F03-AC9 (US-011) deactivating a student deletes nothing', async ({ as, control }) => {
    // Deactivate S2 (with records, attempts, homework); S2 leaves the entry pickers and all of it is still returned for
    // earlier periods.
    const ids = await control.rosterIds();
    const teacher = await as('teacher.a1');
    const d2 = classDay(1);
    const d1 = classDayBefore(d2);
    const first = await history(teacher, ids, 'S2', d1);
    await presentRecord(teacher, ids, 'S2', d2);
    const admin = await as('admin.a');
    const before = await snapshot(admin, ids, 'S2', d1, d2);
    expect(before.records).toHaveLength(2);
    expect(before.records.flatMap((r) => r.portions.flatMap((p: { attempts: unknown[] }) => p.attempts))).toHaveLength(2);
    expect(before.homework.map((h) => [h.id, h.status])).toEqual(expect.arrayContaining([[first.confirmedId, 'CONFIRMED'], [first.draftId, 'DRAFT']]));
    expect(await pickerStudents(admin, ids.classes.A1)).toContain(ids.students.S2);

    const res = await admin.post(`/students/${ids.students.S2}/deactivate`);
    expect(res.status(), await res.text()).toBe(200);
    expect((await res.json()).status).toBe('INACTIVE');
    expect(await pickerStudents(admin, ids.classes.A1)).not.toContain(ids.students.S2);
    expect(await pickerStudents(teacher, ids.classes.A1)).toEqual([ids.students.S1]);
    // Records, attempts, and homework are all still returned, unchanged.
    expect(await snapshot(admin, ids, 'S2', d1, d2)).toEqual(before);
    expect(await snapshot(teacher, ids, 'S2', d1, d2)).toEqual(before);
  });

  test.fixme('F03-AC9 (US-011) a deactivated student stays in reports for earlier periods', async () => {
    // Waits for F09 (weekly/monthly reports). Deactivate S2; a report for an earlier period still includes S2's records.
  });

  test('F03-AC10 (US-011) reactivating a student restores them to pickers with history intact', async ({ as, control }) => {
    // Reactivate S2; pickers include S2; records, attempts, and homework match those before deactivation.
    const ids = await control.rosterIds();
    const teacher = await as('teacher.a1');
    const d2 = classDay(1);
    const d1 = classDayBefore(d2);
    await history(teacher, ids, 'S2', d1);
    await presentRecord(teacher, ids, 'S2', d2);
    const admin = await as('admin.a');
    const before = await snapshot(admin, ids, 'S2', d1, d2);
    const counts = (await getJson(admin, `/homework/assignments?studentId=${ids.students.S2}`)).counts;
    expect((await admin.post(`/students/${ids.students.S2}/deactivate`)).status()).toBe(200);
    expect(await pickerStudents(admin, ids.classes.A1)).not.toContain(ids.students.S2);

    const res = await admin.post(`/students/${ids.students.S2}/reactivate`);
    expect(res.status(), await res.text()).toBe(200);
    expect((await res.json()).status).toBe('ACTIVE');
    expect(await pickerStudents(admin, ids.classes.A1)).toContain(ids.students.S2);
    expect(await pickerStudents(teacher, ids.classes.A1)).toEqual(expect.arrayContaining([ids.students.S1, ids.students.S2]));
    const after = await snapshot(admin, ids, 'S2', d1, d2);
    expect(after).toEqual(before);
    expect(after.records).toHaveLength(2);
    expect((await getJson(admin, `/homework/assignments?studentId=${ids.students.S2}`)).counts).toEqual(counts);
  });

  test('F03-AC11 (US-012) moving a student ends the old enrollment the day before', async ({ as, control }) => {
    // Move S2 from A1 to A2 from date D; enrollments: A1 ends D−1, A2 starts D.
    const { classes, students } = await control.rosterIds();
    const d = karachiDate(1);
    const res = await (await as('admin.a')).post(`/students/${students.S2}/enrollments`, { data: { classId: classes.A2, startDate: d } });
    expect(res.status()).toBe(200);
    const enrollments = (await res.json()).enrollments as Array<{ classId: string; startDate: string; endDate: string | null }>;
    expect(enrollments.map((e) => [e.classId, e.endDate])).toEqual([
      [classes.A1, karachiDate(0)],
      [classes.A2, null],
    ]);
    expect(enrollments[1]!.startDate).toBe(d);
  });

  test('F03-AC12 (US-012) records before a move still show the old class', async ({ as, control }) => {
    // S2 has a record, attempts, and homework in A1 on an earlier day; admin.a moves S2 to A2 from today.
    // The record, its homework, and the entry picker for the earlier date still show A1; the new class starts today.
    const ids = await control.rosterIds();
    const day = classDay(1);
    const seeded = await history(await as('teacher.a1'), ids, 'S2', day);
    const admin = await as('admin.a');
    const before = await snapshot(admin, ids, 'S2', day, day);
    const moved = await admin.post(`/students/${ids.students.S2}/enrollments`, { data: { classId: ids.classes.A2, startDate: today() } });
    expect(moved.status(), await moved.text()).toBe(200);
    expect((await moved.json()).currentClass.id).toBe(ids.classes.A2);

    const after = await snapshot(admin, ids, 'S2', day, day);
    expect(after).toEqual(before);
    expect(after.records.map((r) => r.record.classId)).toEqual([ids.classes.A1]);
    expect(after.homework.map((h) => h.classId)).toEqual([ids.classes.A1, ids.classes.A1]);
    expect((await getJson(admin, `/hifz/daily-records?classId=${ids.classes.A1}&date=${day}`)).items.map((r: { id: string }) => r.id)).toEqual([seeded.recordId]);
    expect((await getJson(admin, `/hifz/daily-records?classId=${ids.classes.A2}&date=${day}`)).items).toEqual([]);
    // On the earlier date S2 is still in A1's picker, not A2's; from today it is in A2's.
    const picker = async (classId: string, date: string) => ((await getJson(admin, `/entry/classes/${classId}/students?date=${date}`)).items as Array<{ id: string }>).map((s) => s.id);
    expect(await picker(ids.classes.A1, day)).toContain(ids.students.S2);
    expect(await picker(ids.classes.A2, day)).not.toContain(ids.students.S2);
    expect(await picker(ids.classes.A2, today())).toContain(ids.students.S2);
  });

  test.fixme('F03-AC12 (US-012) a report for a period before the move shows the old class', async () => {
    // Waits for F09 (weekly/monthly reports). A report for a period before D shows S2 in A1.
  });

  // Added by the decision review of 2026-10-30 (SRS §17).
  test('F03-AC14 (US-010) active class names are unique in a madrasa, ignoring case', async ({ as, control }) => {
    // Given an active class named "Hifz A", when the Admin creates or renames another class to "hifz a", then it is rejected with "Class name already in use". The name of a deactivated class may be reused.
    const { classes } = await control.rosterIds();
    const admin = await as('admin.a');
    const hifzA = await admin.post('/classes', { data: { name: 'Hifz A', teacherIds: [] } });
    expect(hifzA.status()).toBe(201);
    for (const res of [
      await admin.post('/classes', { data: { name: 'hifz a', teacherIds: [] } }),
      await admin.patch(`/classes/${classes.A1}`, { data: { name: 'hifz a' } }),
    ]) {
      expect(res.status()).toBe(400);
      expect((await res.json()).error.fields).toEqual({ name: 'TAKEN' });
    }
    expect((await admin.post(`/classes/${(await hifzA.json()).id}/deactivate`)).status()).toBe(200);
    expect((await admin.post('/classes', { data: { name: 'hifz a', teacherIds: [] } })).status()).toBe(201);
  });

  test('F03-AC15 (US-011) a Teacher adds and edits students only in assigned classes', async ({ as, control }) => {
    // Given a Teacher assigned to Class A, when they add or edit a student in Class A, then it is saved and audited. Adding or editing a student in a class they are not assigned to is refused.
    const { classes, students } = await control.rosterIds();
    const teacher = await as('teacher.a1');
    const added = await teacher.post('/students', { data: { name: 'Teacher Added', classId: classes.A1 } });
    expect(added.status()).toBe(201);
    const id = (await added.json()).id;
    const edited = await teacher.patch(`/students/${id}`, { data: { name: 'Teacher Edited' } });
    expect(edited.status()).toBe(200);
    expect((await edited.json()).name).toBe('Teacher Edited');
    const teacherId = await control.userIdOf('teacher.a1');
    expect((await control.auditForTarget(id)).map((r) => [r.action, r.actor_user_id])).toEqual([
      ['STUDENT_CREATED', teacherId],
      ['STUDENT_UPDATED', teacherId],
    ]);
    // Class A2 is not theirs: refused, like a missing class or student, and nothing changes.
    expect((await teacher.post('/students', { data: { name: 'Elsewhere', classId: classes.A2 } })).status()).toBe(404);
    expect((await teacher.patch(`/students/${students.S3}`, { data: { name: 'Hijacked' } })).status()).toBe(404);
    expect((await (await (await as('admin.a')).get(`/students/${students.S3}`)).json()).name).toBe('Test Student Three');
  });

  test('F03-AC16 (US-011) a Teacher cannot deactivate or move students or create login accounts', async ({ as, control }) => {
    // Given a Teacher, when they try to deactivate a student, move a student to another class, or create a Student or Parent login account, then there is no control for it, and the API returns forbidden.
    const { classes, students } = await control.rosterIds();
    const teacher = await as('teacher.a1');
    const account = (role: string, loginId: string) => ({ role, loginId, displayName: 'Not allowed', password: 'Long-enough-pass-1' });
    for (const res of [
      await teacher.post(`/students/${students.S1}/deactivate`),
      await teacher.post(`/students/${students.S1}/enrollments`, { data: { classId: classes.A2, startDate: karachiDate(1) } }),
      await teacher.post('/accounts', { data: account('STUDENT', 'ALIF-S99') }),
      await teacher.post('/accounts', { data: account('PARENT', 'ALIF-P99') }),
    ]) {
      expect(res.status()).toBe(403);
      expect((await res.json()).error.code).toBe('FORBIDDEN');
    }
    const s1 = await (await teacher.get(`/students/${students.S1}`)).json();
    expect(s1).toMatchObject({ status: 'ACTIVE', currentClass: { id: classes.A1 }, canManage: false });
  });

  test('F03-AC18 (US-012) a student has exactly one active class', async ({ as, control }) => {
    // Given a student with an active enrollment in Class A, when they are enrolled in Class B, then it is handled as a move: the Class A enrollment ends and only Class B is active.
    const { classes, students } = await control.rosterIds();
    const admin = await as('admin.a');
    const res = await admin.post(`/students/${students.S1}/enrollments`, { data: { classId: classes.A2, startDate: karachiDate(0) } });
    expect(res.status()).toBe(200);
    const body = await res.json();
    const open = (body.enrollments as Array<{ classId: string; endDate: string | null }>).filter((e) => e.endDate === null);
    expect(open.map((e) => e.classId)).toEqual([classes.A2]);
    expect(body.currentClass.id).toBe(classes.A2);
    // Enrolling again in the same class is not a second enrollment.
    const again = await admin.post(`/students/${students.S1}/enrollments`, { data: { classId: classes.A2, startDate: karachiDate(5) } });
    expect((await again.json()).error.fields).toEqual({ classId: 'SAME_CLASS' });
  });

  test('F03-AC19 (US-011) student lists page 25 at a time with server-side filters', async ({ as }) => {
    // Given a class with 60 students, when the list is requested, then the first page has 25 students and the next pages load on request, with search and filters applied on the server.
    const admin = await as('admin.a');
    const big = (await (await admin.post('/classes', { data: { name: 'Hifz Big', teacherIds: [] } })).json()).id as string;
    for (let i = 1; i <= 60; i++) {
      expect((await admin.post('/students', { data: { name: `Big ${String(i).padStart(2, '0')}`, classId: big } })).status()).toBe(201);
    }
    const sizes: number[] = [];
    let cursor: string | null = null;
    do {
      const page = (await (await admin.get(`/students?classId=${big}${cursor ? `&cursor=${cursor}` : ''}`)).json()) as Page;
      sizes.push(page.items.length);
      cursor = page.nextCursor;
    } while (cursor);
    expect(sizes).toEqual([25, 25, 10]);
    const searched = (await (await admin.get(`/students?classId=${big}&q=Big 0`)).json()) as Page;
    expect(searched.items.map((s) => s.name)).toEqual(['Big 01', 'Big 02', 'Big 03', 'Big 04', 'Big 05', 'Big 06', 'Big 07', 'Big 08', 'Big 09']);
    expect(searched.nextCursor).toBeNull();
  });
});
