// F10 · Student and Parent access — API E2E (docs/specs/13-f10-student-parent-access.md; plan docs/handover/F10-plan.md)
// Screen journeys: e2e/mobile/f10-portal/.
// Seeded fixtures: A1 (teacher.a1; S1, S2), A2 (teacher.a2; S3); student.s1 → S1; parent.p1 verified-linked to S1 and
// S2; parent.p2's link to S3 revoked. Records are written through POST /sync/push (the app's path), reports published
// through POST /reports/publish, and read through /portal/*. Synthetic data only; Quran data is the SYNTHETIC fixture.
import type { APIRequestContext } from '@playwright/test';
import { addDays, applied, op, para, portionOp, presentRecord, push, today, uuidv7, type Ids } from './support/daily-entry';
import { expect, test } from './support/fixtures';

// Unique synthetic markers: none may appear in any Student or Parent output (AC-SEC-04).
const PRIVATE = 'E2E-F10-PRIVATE-REMARK-c41e';
const SHARED = 'E2E-F10-SHARED-REMARK-90b3';
const PRIVATE_NOTE = 'E2E-F10-PRIVATE-NOTE-5d2a';
const LEAVE_REASON = 'E2E-F10-LEAVE-REASON-e7f1';
const RANDOM_ID = '0190f5c0-0000-7000-8000-00000000beef';

const weekday = (date: string) => new Date(`${date}T00:00:00Z`).getUTCDay() || 7;
const lastMonday = () => addDays(addDays(today(), -7), -(weekday(addDays(today(), -7)) - 1));
const day = (offset: number) => addDays(lastMonday(), offset); // 0 = Monday … 6 = Sunday

let ids: Ids;

type Vis = 'INTERNAL' | 'SHARED';

const attempt = (portionId: string, a: { status: string; completed: object | null; quality: number | null; remarks?: string | null; remarksVisibility?: Vis; mistakes?: object[] }) =>
  op('portion_attempt', 'CREATE', uuidv7(), {
    lessonPortionId: portionId,
    attemptNo: 1,
    attemptedAt: new Date().toISOString(),
    status: a.status,
    completed: a.completed,
    quality: a.quality,
    noMistakes: false,
    mistakes: a.mistakes ?? [],
    remarks: a.remarks ?? null,
    ...(a.remarksVisibility ? { remarksVisibility: a.remarksVisibility } : {}),
  });

/** S1 last Monday: Para 4 with a private remark and an internal mistake note, Para 5 with a shared remark; S2 Monday; S1 Tuesday Leave. */
async function seedWeek(teacher: APIRequestContext) {
  const mon = await presentRecord(teacher, ids, 'S1', day(0));
  const p4 = await applied(teacher, portionOp(mon, { section: 'SABQI', position: 1, paraNumber: 4, assigned: para(1) }));
  const a4 = await applied(teacher, attempt(p4.id, { status: 'PARTIAL', completed: para(1, 2), quality: 2, remarks: PRIVATE, mistakes: [{ category: 'TAJWEED', severity: 'MAJOR', repeated: false, note: PRIVATE_NOTE, noteVisibility: 'INTERNAL' }] }));
  const p5 = await applied(teacher, portionOp(mon, { section: 'SABQI', position: 2, paraNumber: 5, assigned: para(1, 2) }));
  const a5 = await applied(teacher, attempt(p5.id, { status: 'COMPLETED', completed: para(1, 2), quality: 1, remarks: SHARED, remarksVisibility: 'SHARED' }));
  const s2 = await presentRecord(teacher, ids, 'S2', day(0));
  const m1 = await applied(teacher, portionOp(s2, { section: 'MANZIL', paraNumber: 1, assigned: para(1) }));
  await applied(teacher, attempt(m1.id, { status: 'COMPLETED', completed: para(1), quality: null }));
  await push(teacher, [op('attendance_record', 'CREATE', uuidv7(), { studentId: ids.students.S1, classId: ids.classes.A1, reportDate: day(1), status: 'LEAVE', leaveReason: LEAVE_REASON, absentNote: null })]);
  return { a4, a5 };
}

const publish = (api: APIRequestContext, body: Record<string, unknown>) => api.post('/reports/publish', { data: { kind: 'WEEK', date: day(2), pendingChanges: 0, ...body } });
const list = (api: APIRequestContext, student: 'S1' | 'S2' | 'S3') => api.get(`/portal/reports?studentId=${ids.students[student]}`);

async function firstReportId(api: APIRequestContext, student: 'S1' | 'S2'): Promise<string> {
  const res = await list(api, student);
  expect(res.status(), await res.text()).toBe(200);
  const items = (await res.json()).items as { id: string }[];
  expect(items.length).toBeGreaterThan(0);
  return items[0]!.id;
}

async function guardianLink(admin: APIRequestContext, student: 'S1' | 'S2', parentLoginId: string) {
  const access = await (await admin.get(`/students/${ids.students[student]}/access`)).json();
  return (access.guardians as { id: string; parent: { loginId: string }; revokedAt: string | null }[]).find((g) => g.parent.loginId === parentLoginId && g.revokedAt === null)!;
}

test.describe('F10 · Student and Parent access', { tag: '@F10' }, () => {
  test.beforeEach(async ({ control }) => {
    ids = await control.rosterIds();
    await control.seedSyntheticQuran();
  });

  test('F10-AC1 (US-044) a Student lists only their own published reports and cannot write', async ({ as }) => {
    const teacher = await as('teacher.a1');
    await seedWeek(teacher);
    expect((await publish(teacher, { classId: ids.classes.A1 })).status()).toBe(200);
    const student = await as('student.s1');
    expect(await (await student.get('/portal/students')).json()).toEqual({ items: [{ id: ids.students.S1, name: 'Test Student One' }] });
    const items = (await (await list(student, 'S1')).json()).items;
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ kind: 'WEEK', from: day(0), to: day(6) });
    expect((await list(student, 'S2')).status()).toBe(404);
    // No write endpoint is open to a Student.
    const write = await student.post('/sync/push', { data: { protocolVersion: 1, deviceId: '0190f5c0-0000-4000-8000-0000000000e9', ops: [op('daily_record', 'CREATE', uuidv7(), { studentId: ids.students.S1, classId: ids.classes.A1, reportDate: day(3), sessionLabel: null })] } });
    expect([401, 403]).toContain(write.status());
    expect((await student.post('/reports/publish', { data: { kind: 'WEEK', date: day(0), studentId: ids.students.S1, pendingChanges: 0 } })).status()).toBe(403);
    expect((await student.post(`/students/${ids.students.S1}/guardians`, { data: { parentUserId: RANDOM_ID, verificationMethod: 'IN_PERSON' } })).status()).toBe(403);
    expect([403, 404]).toContain((await student.post('/portal/reports', { data: {} })).status());
  });

  test('F10-AC2 (US-044) another student report by ID returns not found', async ({ as }) => {
    const teacher = await as('teacher.a1');
    await seedWeek(teacher);
    await publish(teacher, { classId: ids.classes.A1 });
    const s2Report = await firstReportId(await as('parent.p1'), 'S2');
    const student = await as('student.s1');
    const other = await student.get(`/portal/reports/${s2Report}`);
    const random = await student.get(`/portal/reports/${RANDOM_ID}`);
    expect([other.status(), random.status()]).toEqual([404, 404]);
    expect(await other.json()).toEqual(await random.json());
  });

  test('F10-AC3 (US-044) unpublished periods are absent from every response', async ({ as }) => {
    const teacher = await as('teacher.a1');
    await seedWeek(teacher);
    const student = await as('student.s1');
    expect(await (await list(student, 'S1')).json()).toEqual({ items: [], nextCursor: null });
    // Published, then unpublished: gone from the list, and its id is not found.
    await publish(teacher, { classId: ids.classes.A1 });
    const id = await firstReportId(student, 'S1');
    expect((await teacher.post('/reports/unpublish', { data: { kind: 'WEEK', date: day(0), classId: ids.classes.A1 } })).status()).toBe(200);
    expect((await student.get(`/portal/reports/${id}`)).status()).toBe(404);
    for (const res of [await list(student, 'S1'), await student.get('/portal/students'), await student.get(`/portal/reports/${id}`)]) {
      const body = await res.text();
      expect(body).not.toContain(SHARED);
      expect(body).not.toContain(day(0));
    }
  });

  test('F10-AC5 (US-045) a Parent with two verified links can access exactly those children', async ({ as }) => {
    const teacher = await as('teacher.a1');
    await seedWeek(teacher);
    await publish(teacher, { classId: ids.classes.A1 });
    const parent = await as('parent.p1');
    const children = (await (await parent.get('/portal/students')).json()).items.map((s: { id: string }) => s.id);
    expect(children.sort()).toEqual([ids.students.S1, ids.students.S2].sort());
    for (const s of ['S1', 'S2'] as const) expect((await (await list(parent, s)).json()).items, s).toHaveLength(1);
    expect((await list(parent, 'S3')).status()).toBe(404);
  });

  test('F10-AC6 (US-045) a Parent has no student search and gets not found for other students', async ({ as }) => {
    const parent = await as('parent.p1');
    for (const url of ['/students?q=Test%20Student%20Three', '/students?q=EXT-A-003', `/students/${ids.students.S3}`, '/entry/classes', '/family-accounts?role=STUDENT']) {
      expect([403, 404], url).toContain((await parent.get(url)).status());
    }
    // Knowing a name, phone, or email does not widen the list, and the student's id is not found.
    expect((await (await parent.get('/portal/students?name=Test%20Student%20Three&email=family1%40example.test')).json()).items).toHaveLength(2);
    expect((await list(parent, 'S3')).status()).toBe(404);
  });

  test('F10-AC7 (US-045) a revoked link refuses that child and removes it from the list', async ({ as }) => {
    const teacher = await as('teacher.a1');
    await seedWeek(teacher);
    await publish(teacher, { classId: ids.classes.A1 });
    const parent = await as('parent.p1');
    const s2Report = await firstReportId(parent, 'S2');
    const admin = await as('admin.a');
    const link = await guardianLink(admin, 'S2', 'parent-p1');
    expect((await admin.post(`/guardian-links/${link.id}/revoke`)).status()).toBe(200);
    // The same session's next requests.
    expect((await parent.get(`/portal/reports/${s2Report}`)).status()).toBe(404);
    expect((await list(parent, 'S2')).status()).toBe(404);
    expect((await (await parent.get('/portal/students')).json()).items.map((s: { id: string }) => s.id)).toEqual([ids.students.S1]);
  });

  test('F10-AC8 (US-045) linking, verifying, and revoking a Parent are audited', async ({ as, control }) => {
    const admin = await as('admin.a');
    const parent2 = await control.userIdOf('parent.p2');
    const linked = await admin.post(`/students/${ids.students.S1}/guardians`, { data: { parentUserId: parent2, verificationMethod: 'MADRASA_RECORDS' } });
    expect(linked.status(), await linked.text()).toBe(200);
    const link = await guardianLink(admin, 'S1', 'parent-p2');
    expect((await admin.post(`/guardian-links/${link.id}/verify`, { data: { verificationMethod: 'IN_PERSON' } })).status()).toBe(200);
    expect((await admin.post(`/guardian-links/${link.id}/revoke`)).status()).toBe(200);
    const rows = (await control.auditForTarget(link.id)) as { action: string; actor_user_id: string; summary: Record<string, unknown> }[];
    expect(rows.map((r) => r.action)).toEqual(['GUARDIAN_LINKED', 'GUARDIAN_VERIFIED', 'GUARDIAN_LINK_REVOKED']);
    const adminId = await control.userIdOf('admin.a');
    expect(rows.every((r) => r.actor_user_id === adminId)).toBe(true);
    expect(rows[0]!.summary).toMatchObject({ studentId: ids.students.S1, parentUserId: parent2, verificationMethod: 'MADRASA_RECORDS' });
    expect(rows[1]!.summary).toMatchObject({ verificationMethod: 'IN_PERSON' });
    expect(JSON.stringify(rows)).not.toContain('@example.test');
  });

  test('F10-AC9 (US-046) a note saved without visibility is private to staff', async ({ as }) => {
    const teacher = await as('teacher.a1');
    const rec = await presentRecord(teacher, ids, 'S1', day(0));
    const p = await applied(teacher, portionOp(rec, { section: 'SABQI', paraNumber: 4, assigned: para(1) }));
    await applied(teacher, attempt(p.id, { status: 'COMPLETED', completed: para(1), quality: 1, remarks: PRIVATE, mistakes: [{ category: 'LAFZI', severity: 'MINOR', repeated: false, note: PRIVATE_NOTE }] }));
    const detail = await (await teacher.get(`/hifz/daily-records/${rec}`)).json();
    const a = detail.portions[0].attempts[0];
    expect(a).toMatchObject({ remarks: PRIVATE, remarksVisibility: 'INTERNAL' });
    expect(a.mistakes[0]).toMatchObject({ note: PRIVATE_NOTE, noteVisibility: 'INTERNAL' });
  });

  test('F10-AC10 (US-046) private note text never reaches Student or Parent channels (AC-SEC-04)', async ({ as, control }) => {
    const teacher = await as('teacher.a1');
    await seedWeek(teacher);
    await publish(teacher, { classId: ids.classes.A1 });
    for (const who of ['student.s1', 'parent.p1'] as const) {
      const api = await as(who);
      const id = await firstReportId(api, 'S1');
      // Every route a Student or Parent can call, plus the staff report and export routes (refused for them).
      // PDF and Excel exports for families (F13, F14) and push (F16) do not exist yet; each adds its own leak check.
      const responses = [
        await api.get('/portal/students'),
        await list(api, 'S1'),
        await api.get(`/portal/reports?studentId=${ids.students.S1}&kind=WEEK`),
        await api.get(`/portal/reports/${id}`),
        await api.get(`/reports/student?studentId=${ids.students.S1}&kind=WEEK&date=${day(0)}`),
        await api.get(`/reports/class-summary/export?classId=${ids.classes.A1}&kind=WEEK&date=${day(0)}&format=xlsx`),
        await api.get(`/reports/class-summary/export?classId=${ids.classes.A1}&kind=WEEK&date=${day(0)}&format=pdf`),
        await api.get(`/hifz/daily-records?studentId=${ids.students.S1}`),
      ];
      for (const res of responses) {
        const raw = (await res.body()).toString('latin1');
        for (const secret of [PRIVATE, PRIVATE_NOTE, LEAVE_REASON]) expect(raw, `${who} ${res.url()}`).not.toContain(secret);
      }
      expect(await responses[3]!.text()).toContain(SHARED);
    }
    // The notes are stored (staff need them) and never written to the API logs.
    for (const secret of [PRIVATE, PRIVATE_NOTE]) {
      const found = await control.search(secret);
      expect(found.database, secret).toBeGreaterThan(0);
      if (found.logs !== null) expect(found.logs, secret).toBe(0);
    }
  });

  test('F10-AC11 (US-046) a shared note is visible to the Student and linked Parent', async ({ as }) => {
    const teacher = await as('teacher.a1');
    await seedWeek(teacher);
    await publish(teacher, { classId: ids.classes.A1 });
    for (const who of ['student.s1', 'parent.p1'] as const) {
      const api = await as(who);
      const body = await (await api.get(`/portal/reports/${await firstReportId(api, 'S1')}`)).json();
      const [p4, p5] = body.report.days[0].portions;
      expect(p5.remarks, who).toBe(SHARED);
      expect(p4, who).not.toHaveProperty('remarks');
    }
  });

  test('F10-AC12 (US-046) changing note visibility is audited', async ({ as, control }) => {
    const teacher = await as('teacher.a1');
    const { a4 } = await seedWeek(teacher);
    const [r] = await push(teacher, [op('portion_attempt', 'UPDATE', a4.id, { remarksVisibility: 'SHARED' }, a4.rowVersion)]);
    expect(r).toMatchObject({ status: 'APPLIED' });
    const rows = ((await control.auditForTarget(a4.id)) as { action: string; actor_user_id: string; summary: Record<string, unknown> }[]).filter((x) => x.action === 'NOTE_VISIBILITY_CHANGED');
    expect(rows).toHaveLength(1);
    expect(rows[0]!.summary).toMatchObject({ textKind: 'ATTEMPT_REMARKS', from: 'INTERNAL', to: 'SHARED', studentId: ids.students.S1, reportDate: day(0) });
    expect(rows[0]!.actor_user_id).toBe(await control.userIdOf('teacher.a1'));
    expect(JSON.stringify(await control.auditForTarget(a4.id))).not.toContain(PRIVATE);
  });

  // Added by the decision review of 2026-10-30 (SRS §17).
  test('F10-AC13 (US-044) a Teacher or Admin publishes a class’s weekly reports', async ({ as, control }) => {
    const teacher = await as('teacher.a1');
    await seedWeek(teacher);
    const res = await publish(teacher, { classId: ids.classes.A1 });
    expect(res.status(), await res.text()).toBe(200);
    expect(await res.json()).toMatchObject({ count: 2, period: { kind: 'WEEK', from: day(0), to: day(6) } });
    for (const [who, student] of [
      ['student.s1', 'S1'],
      ['parent.p1', 'S1'],
      ['parent.p1', 'S2'],
    ] as const) {
      expect((await (await list(await as(who), student)).json()).items, `${who} ${student}`).toHaveLength(1);
    }
    const audits = ((await control.auditForTarget(ids.classes.A1)) as { action: string; actor_user_id: string; summary: Record<string, unknown> }[]).filter((x) => x.action === 'REPORT_PUBLISHED');
    expect(audits).toHaveLength(1);
    expect(audits[0]!.actor_user_id).toBe(await control.userIdOf('teacher.a1'));
    expect(audits[0]!.summary).toMatchObject({ periodKind: 'WEEK', periodFrom: day(0), periodTo: day(6), students: 2 });
    // An Admin publishes too; a Teacher of another class cannot.
    expect((await publish(await as('admin.a'), { classId: ids.classes.A1, kind: 'MONTH', date: day(0) })).status()).toBe(200);
    expect((await publish(await as('teacher.a2'), { classId: ids.classes.A1 })).status()).toBe(404);
  });

  test('F10-AC14 (US-044) publishing is refused while the period has unsynced changes', async ({ as }) => {
    const teacher = await as('teacher.a1');
    const { a4 } = await seedWeek(teacher);
    const pending = await publish(teacher, { classId: ids.classes.A1, pendingChanges: 2 });
    expect(pending.status()).toBe(409);
    expect((await pending.json()).error).toMatchObject({ code: 'PUBLISH_REFUSED', fields: { reason: 'UNSYNCED_CHANGES' } });
    // A change the server holds as an open conflict for S1 in the period also refuses.
    const outcome = { status: 'COMPLETED', completed: para(1), quality: 1, noMistakes: false, mistakes: [] };
    expect((await push(teacher, [op('portion_attempt', 'UPDATE', a4.id, outcome, a4.rowVersion)], '0190f5c0-0000-4000-8000-0000000000d1'))[0]).toMatchObject({ status: 'APPLIED' });
    expect((await push(teacher, [op('portion_attempt', 'UPDATE', a4.id, { ...outcome, quality: 4 }, a4.rowVersion)], '0190f5c0-0000-4000-8000-0000000000d2'))[0]).toMatchObject({ status: 'CONFLICT' });
    const conflicted = await publish(teacher, { studentId: ids.students.S1 });
    expect(conflicted.status()).toBe(409);
    expect((await conflicted.json()).error.fields).toEqual({ reason: 'UNSYNCED_CHANGES' });
    // Nothing was published.
    expect((await (await list(await as('student.s1'), 'S1')).json()).items).toEqual([]);
  });

  test('F10-AC15 (US-044) a corrected published report shows Updated on', async ({ as, control }) => {
    const teacher = await as('teacher.a1');
    const { a5 } = await seedWeek(teacher);
    await publish(teacher, { classId: ids.classes.A1 });
    const student = await as('student.s1');
    const id = await firstReportId(student, 'S1');
    const before = await (await student.get(`/portal/reports/${id}`)).json();
    expect(before.updatedAt).toBeNull();
    expect(before.report.days[0].portions[1].quality).toBe(1);
    // A day passes with no correction: not "updated".
    await control.advanceClock(24 * 60 * 60 * 1000);
    const studentNextDay = await as('student.s1');
    expect((await (await studentNextDay.get(`/portal/reports/${id}`)).json()).updatedAt).toBeNull();
    // The Teacher corrects the rating.
    const [r] = await push(await as('teacher.a1'), [op('portion_attempt', 'UPDATE', a5.id, { status: 'COMPLETED', completed: para(1, 2), quality: 3, noMistakes: false, mistakes: [] }, a5.rowVersion)]);
    expect(r).toMatchObject({ status: 'APPLIED' });
    for (const who of ['student.s1', 'parent.p1'] as const) {
      const api = await as(who);
      const after = await (await api.get(`/portal/reports/${id}`)).json();
      expect(after.report.days[0].portions[1].quality, who).toBe(3);
      expect(after.updatedAt, who).not.toBeNull();
      expect(Date.parse(after.updatedAt)).toBeGreaterThan(Date.parse(after.publishedAt));
    }
  });

  test('F10-AC16 (US-045) Parent links need a recorded verification method and are Admin-only', async ({ as, control }) => {
    const admin = await as('admin.a');
    const parent2 = await control.userIdOf('parent.p2');
    const missing = await admin.post(`/students/${ids.students.S1}/guardians`, { data: { parentUserId: parent2 } });
    expect(missing.status()).toBe(400);
    expect((await missing.json()).error.fields).toHaveProperty('verificationMethod');
    const teacher = await as('teacher.a1');
    expect((await teacher.post(`/students/${ids.students.S1}/guardians`, { data: { parentUserId: parent2, verificationMethod: 'IN_PERSON' } })).status()).toBe(403);
    const link = await guardianLink(admin, 'S1', 'parent-p1');
    expect((await teacher.post(`/guardian-links/${link.id}/revoke`)).status()).toBe(403);
    // Saved with the method, and it is recorded.
    expect((await admin.post(`/students/${ids.students.S1}/guardians`, { data: { parentUserId: parent2, verificationMethod: 'IN_PERSON' } })).status()).toBe(200);
    expect(await guardianLink(admin, 'S1', 'parent-p2')).toMatchObject({ verificationMethod: 'IN_PERSON', verifiedBy: 'Test admin.a' });
  });

  test('F10-AC17 (US-044) Student and Parent reports contain exactly the approved fields', async ({ as }) => {
    const teacher = await as('teacher.a1');
    await seedWeek(teacher);
    // A draft homework suggestion in the week: never shown, not even as a count.
    await push(teacher, [op('homework_assignment', 'CREATE', uuidv7(), { studentId: ids.students.S1, sourceDailyRecordId: null, dueDate: null, instructions: null, assignedDate: day(0), portions: [{ id: uuidv7(), section: 'SABQI', position: 1, paraNumber: 3, range: null, totalLines: null, assigned: para(1, 4), origin: 'TEACHER_ADDED', sourceAttemptId: null, instructions: null }] })]);
    await publish(teacher, { classId: ids.classes.A1 });
    for (const who of ['student.s1', 'parent.p1'] as const) {
      const api = await as(who);
      const res = await api.get(`/portal/reports/${await firstReportId(api, 'S1')}`);
      expect(res.headers()['cache-control']).toBe('no-store');
      const body = await res.json();
      expect(Object.keys(body).sort()).toEqual(['generatedAt', 'id', 'publishedAt', 'report', 'teachers', 'updatedAt']);
      expect(body.teachers).toEqual([{ name: 'Test teacher.a1' }]);
      const r = body.report;
      expect(Object.keys(r).sort()).toEqual(['attendance', 'classes', 'days', 'hasData', 'homework', 'mistakes', 'overallLabels', 'period', 'quality', 'qualityTrend', 'recurringDifficulties', 'sections', 'student'].sort());
      expect(r.attendance.counts).toMatchObject({ present: 1, leaveAwaiting: 1 });
      expect(r.days[0].portions[0]).toMatchObject({ section: 'SABQI', paraNumber: 4, status: 'PARTIAL', quality: 2, assigned: para(1), completed: para(1, 2), mistakeCount: 1, mistakes: [{ category: 'TAJWEED', severity: 'MAJOR', repeated: false }] });
      expect(r.mistakes.byCategory.TAJWEED).toBe(1);
      expect(r.homework).not.toHaveProperty('drafts');
      const raw = await res.text();
      for (const secret of [PRIVATE, PRIVATE_NOTE, LEAVE_REASON, 'provisional', 'excludedRecords', 'remarksVisibility', 'noteVisibility', 'pendingChanges']) expect(raw, `${who} ${secret}`).not.toContain(secret);
    }
  });
});
