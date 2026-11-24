// F10 · Student and Parent access — integration against real Postgres (docs/specs/13-f10-student-parent-access.md;
// plan docs/handover/F10-plan.md). Seeded fixtures (e2e/fixtures/personas.ts): A1 (teacher.a1; S1, S2), A2 (teacher.a2;
// S3); student.s1 → S1, student.s3 → S3; parent.p1 verified-linked to S1 and S2; parent.p2's link to S3 revoked.
// Writes go through POST /sync/push; publishing through POST /reports/publish; reads through /portal/*.
// Synthetic data only; Quran data is the SYNTHETIC fixture.
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { weekOf } from '@hifz/domain/calendar';
import { addDays } from '@hifz/domain/roster';
import { startHarness, type Harness } from '../support/harness.ts';
import { applied, attemptOp, attemptUpdateOp, attendanceOp, op, para, portionOp, presentRecord, push, seedQuran, today, type AttemptInput, type Ids, type PortionInput } from '../hifz/support.ts';

let h: Harness;
let ids: Ids;

beforeAll(async () => {
  h = await startHarness();
}, 60_000);

afterAll(async () => {
  await h?.stop();
});

beforeEach(async () => {
  await h.reset();
  ids = (await h.control('GET', '/roster/ids')).json();
  await seedQuran(h);
});

// Unique synthetic markers: each must never appear in any Student or Parent output.
const PRIVATE = 'ZZ-F10-PRIVATE-REMARK-41c7';
const SHARED = 'ZZ-F10-SHARED-REMARK-8d02';
const PRIVATE_NOTE = 'ZZ-F10-PRIVATE-NOTE-3b9e';
const LEAVE_REASON = 'ZZ-F10-LEAVE-REASON-77aa';
const RANDOM_ID = '0190f5c0-0000-7000-8000-00000000dead';

const lastWeek = () => weekOf(addDays(today(h), -7));
const day = (offset: number) => addDays(lastWeek().from, offset); // 0 = Monday … 6 = Sunday

async function recite(token: string, recordId: string, p: PortionInput, a: AttemptInput) {
  const { id: portionId } = await applied(h, token, portionOp(recordId, p));
  const { id: attemptId, rowVersion } = await applied(h, token, attemptOp(portionId, a));
  return { portionId, attemptId, rowVersion };
}

/** S1 last Monday: a private remark and internal note on Para 4, a shared remark on Para 5; S2 Monday, S1 Tuesday Leave. */
async function seedWeek(teacher: string) {
  const mon = await presentRecord(h, teacher, ids, 'S1', day(0));
  const p4 = await recite(teacher, mon, { section: 'SABQI', position: 1, paraNumber: 4, assigned: para(1) }, {
    status: 'PARTIAL',
    completed: para(1, 2),
    quality: 2,
    remarks: PRIVATE,
    mistakes: [{ category: 'TAJWEED', severity: 'MAJOR', repeated: false, note: PRIVATE_NOTE, noteVisibility: 'INTERNAL' } as never],
  });
  const p5 = await recite(teacher, mon, { section: 'SABQI', position: 2, paraNumber: 5, assigned: para(1, 2) }, { status: 'COMPLETED', completed: para(1, 2), quality: 1, remarks: SHARED, remarksVisibility: 'SHARED' });
  const s2 = await presentRecord(h, teacher, ids, 'S2', day(0));
  await recite(teacher, s2, { section: 'MANZIL', paraNumber: 1, assigned: para(1) }, { status: 'COMPLETED', completed: para(1) });
  // A Leave with a reason (internal staff text) on Tuesday.
  await push(h, teacher, [attendanceOp(ids, 'S1', day(1), 'LEAVE', 'A1', { leaveReason: LEAVE_REASON })]);
  return { mon, p4, p5 };
}

const publish = (token: string, body: Record<string, unknown>) => h.call('POST', '/reports/publish', token, { kind: 'WEEK', date: day(2), pendingChanges: 0, ...body });

async function list(token: string, student: 'S1' | 'S2' | 'S3', kind?: 'WEEK' | 'MONTH') {
  return h.call('GET', `/portal/reports?studentId=${ids.students[student]}${kind ? `&kind=${kind}` : ''}`, token);
}

async function firstReportId(token: string, student: 'S1' | 'S2' | 'S3'): Promise<string> {
  const res = await list(token, student);
  expect(res.statusCode, res.body).toBe(200);
  const id = res.json().items[0]?.id as string | undefined;
  expect(id).toBeTruthy();
  return id!;
}

const auditsOf = async (action: string) => h.db.selectFrom('audit_logs').selectAll().where('action', '=', action).orderBy('created_at').execute();

describe('F10 · publishing (US-044; FR-RPT-010)', () => {
  it('F10-AC13 (US-044) the Teacher of the class publishes its week: each student and their linked Parents see it; audited', async () => {
    const teacher = await h.signIn('teacher.a1');
    await seedWeek(teacher);
    const res = await publish(teacher, { classId: ids.classes.A1 });
    expect(res.statusCode, res.body).toBe(200);
    expect(res.json()).toMatchObject({ count: 2, period: { kind: 'WEEK', from: day(0), to: day(6) } });

    const student = await h.signIn('student.s1');
    const parent = await h.signIn('parent.p1');
    for (const [token, who] of [
      [student, 'S1'],
      [parent, 'S1'],
      [parent, 'S2'],
    ] as const) {
      const items = (await list(token, who)).json().items;
      expect(items, who).toHaveLength(1);
      expect(items[0]).toMatchObject({ kind: 'WEEK', from: day(0), to: day(6), updatedAt: null });
    }
    const audits = await auditsOf('REPORT_PUBLISHED');
    expect(audits).toHaveLength(1);
    expect(audits[0]).toMatchObject({ actor_user_id: await h.userId('teacher.a1'), target_type: 'CLASS', target_id: ids.classes.A1 });
    expect(audits[0]!.summary).toMatchObject({ periodKind: 'WEEK', periodFrom: day(0), periodTo: day(6), students: 2 });
    // The staff publication list agrees.
    const status = (await h.call('GET', `/reports/publication?kind=WEEK&date=${day(0)}&classId=${ids.classes.A1}`, teacher)).json();
    expect(status.items.map((i: { publishedAt: string | null }) => i.publishedAt !== null)).toEqual([true, true]);
  });

  it('F10-AC13 (US-044) an Admin publishes one student; another Teacher, a Student, and a Parent cannot publish', async () => {
    const teacher = await h.signIn('teacher.a1');
    await seedWeek(teacher);
    const admin = await h.signIn('admin.a');
    expect((await publish(admin, { studentId: ids.students.S1 })).json()).toMatchObject({ count: 1 });
    // Only S1 was published.
    const parent = await h.signIn('parent.p1');
    expect((await list(parent, 'S1')).json().items).toHaveLength(1);
    expect((await list(parent, 'S2')).json().items).toHaveLength(0);
    // teacher.a2 is not assigned to A1: the class and its students are "not found" to them.
    const other = await h.signIn('teacher.a2');
    expect((await publish(other, { classId: ids.classes.A1 })).statusCode).toBe(404);
    expect((await publish(other, { studentId: ids.students.S2 })).statusCode).toBe(404);
    for (const who of ['student.s1', 'parent.p1'] as const) {
      const token = await h.signIn(who);
      expect((await publish(token, { classId: ids.classes.A1 })).statusCode, who).toBe(403);
      expect((await h.call('POST', '/reports/unpublish', token, { kind: 'WEEK', date: day(0), classId: ids.classes.A1 })).statusCode, who).toBe(403);
    }
    // Exactly one target is required.
    expect((await publish(admin, {})).statusCode).toBe(400);
    expect((await publish(admin, { classId: ids.classes.A1, studentId: ids.students.S1 })).statusCode).toBe(400);
  });

  it('F10-AC14 (US-044) unsynced device changes, an open conflict, or a period not started refuse publishing with the reason', async () => {
    const teacher = await h.signIn('teacher.a1');
    const { p4 } = await seedWeek(teacher);
    const pending = await publish(teacher, { classId: ids.classes.A1, pendingChanges: 3 });
    expect(pending.statusCode).toBe(409);
    expect(pending.json().error).toMatchObject({ code: 'PUBLISH_REFUSED', fields: { reason: 'UNSYNCED_CHANGES' } });

    // Two devices edit the same attempt from the same base: the second becomes an open conflict for S1 in the period.
    const outcome = { status: 'COMPLETED', completed: para(1), quality: 1, noMistakes: false, mistakes: [] };
    const [first] = await push(h, teacher, [attemptUpdateOp(p4.attemptId, p4.rowVersion, outcome)], '0190f5c0-0000-4000-8000-0000000000a1');
    expect(first!.status).toBe('APPLIED');
    const [second] = await push(h, teacher, [attemptUpdateOp(p4.attemptId, p4.rowVersion, { ...outcome, quality: 4 })], '0190f5c0-0000-4000-8000-0000000000a2');
    expect(second!.status).toBe('CONFLICT');
    const conflicted = await publish(teacher, { studentId: ids.students.S1 });
    expect(conflicted.statusCode).toBe(409);
    expect(conflicted.json().error.fields).toEqual({ reason: 'UNSYNCED_CHANGES' });
    // The conflict is S1's only: S2 publishes.
    expect((await publish(teacher, { studentId: ids.students.S2 })).statusCode).toBe(200);
    // A later week has not started.
    const future = await publish(teacher, { classId: ids.classes.A1, date: addDays(today(h), 14) });
    expect(future.json().error.fields).toEqual({ reason: 'PERIOD_NOT_STARTED' });
    // Nothing refused was published or audited.
    expect(await auditsOf('REPORT_PUBLISHED')).toHaveLength(1);
  });

  it('F10-AC15 (US-044) a correction after publishing shows the corrected value with "Updated on"; days passing alone do not', async () => {
    const teacher = await h.signIn('teacher.a1');
    const { p5 } = await seedWeek(teacher);
    const monday = day(0); // before the clock moves: day() follows "today"
    await publish(teacher, { classId: ids.classes.A1 });
    const student = await h.signIn('student.s1');
    const id = await firstReportId(student, 'S1');
    const before = (await h.call('GET', `/portal/reports/${id}`, student)).json();
    expect(before.updatedAt).toBeNull();
    expect(before.report.days[0].portions[1].quality).toBe(1);

    // A day later, with no correction, it is not "updated".
    await h.control('POST', '/clock', { advanceMs: 24 * 60 * 60 * 1000 });
    const studentAgain = await h.signIn('student.s1');
    expect((await h.call('GET', `/portal/reports/${id}`, studentAgain)).json().updatedAt).toBeNull();

    // The Teacher corrects Para 5's rating: the corrected value shows at once, with "Updated on". (A day passed: the
    // Teacher signs in again.)
    const teacherAgain = await h.signIn('teacher.a1');
    const [r] = await push(h, teacherAgain, [attemptUpdateOp(p5.attemptId, p5.rowVersion, { status: 'COMPLETED', completed: para(1, 2), quality: 3, noMistakes: false, mistakes: [] })]);
    expect(r!.status).toBe('APPLIED');
    const after = (await h.call('GET', `/portal/reports/${id}`, studentAgain)).json();
    expect(after.report.days[0].portions[1].quality).toBe(3);
    expect(after.updatedAt).not.toBeNull();
    expect(Date.parse(after.updatedAt)).toBeGreaterThan(Date.parse(after.publishedAt));
    // The Parent's list and the staff publication list say so too.
    const parent = await h.signIn('parent.p1');
    expect((await list(parent, 'S1')).json().items[0].updatedAt).toBe(after.updatedAt);
    const status = (await h.call('GET', `/reports/publication?kind=WEEK&date=${monday}&studentId=${ids.students.S1}`, teacherAgain)).json();
    expect(status.items[0].updatedAt).toBe(after.updatedAt);
  });

  it('F10 edge case: an unpublished report disappears on the next fetch; publishing again brings it back', async () => {
    const teacher = await h.signIn('teacher.a1');
    await seedWeek(teacher);
    await publish(teacher, { classId: ids.classes.A1 });
    const parent = await h.signIn('parent.p1');
    const id = await firstReportId(parent, 'S1');
    expect((await h.call('GET', `/portal/reports/${id}`, parent)).statusCode).toBe(200);
    const undo = await h.call('POST', '/reports/unpublish', teacher, { kind: 'WEEK', date: day(0), studentId: ids.students.S1 });
    expect(undo.json()).toMatchObject({ count: 1 });
    expect((await h.call('GET', `/portal/reports/${id}`, parent)).statusCode).toBe(404);
    expect((await list(parent, 'S1')).json().items).toEqual([]);
    expect(await auditsOf('REPORT_UNPUBLISHED')).toHaveLength(1);
    await publish(teacher, { studentId: ids.students.S1 });
    expect((await h.call('GET', `/portal/reports/${id}`, parent)).statusCode).toBe(200);
  });
});

describe('F10 · Student access (US-044)', () => {
  it('F10-AC1 (US-044) a Student lists only their own published reports and has no write access', async () => {
    const teacher = await h.signIn('teacher.a1');
    await seedWeek(teacher);
    await publish(teacher, { classId: ids.classes.A1 });
    const student = await h.signIn('student.s1');
    expect((await h.call('GET', '/portal/students', student)).json()).toEqual({ items: [{ id: ids.students.S1, name: 'Test Student One' }] });
    expect((await list(student, 'S1')).json().items).toHaveLength(1);
    expect((await list(student, 'S2')).statusCode).toBe(404);
    // Writes and staff reads are refused.
    const recordId = uuidv7Like();
    const pushRes = await h.call('POST', '/sync/push', student, { protocolVersion: 1, deviceId: '0190f5c0-0000-4000-8000-0000000000b1', ops: [op('daily_record', 'CREATE', recordId, { studentId: ids.students.S1, classId: ids.classes.A1, reportDate: day(3), sessionLabel: null }, null)] });
    expect([401, 403]).toContain(pushRes.statusCode);
    for (const [method, url] of [
      ['GET', `/reports/student?studentId=${ids.students.S1}&kind=WEEK`],
      ['GET', `/reports/class-summary?classId=${ids.classes.A1}&kind=WEEK`],
      ['GET', '/students'],
      ['POST', '/portal/reports'],
      ['PATCH', `/portal/reports/${RANDOM_ID}`],
    ] as const) {
      expect([403, 404], `${method} ${url}`).toContain((await h.call(method, url, student, {})).statusCode);
    }
    // Staff are not portal users.
    expect((await h.call('GET', '/portal/students', teacher)).statusCode).toBe(403);
  });

  it('F10-AC2 (US-044) another student\'s report by id is "not found", the same as a random id', async () => {
    const teacher = await h.signIn('teacher.a1');
    await seedWeek(teacher);
    await publish(teacher, { classId: ids.classes.A1 });
    const s2Report = await firstReportId(await h.signIn('parent.p1'), 'S2');
    const student = await h.signIn('student.s1');
    const other = await h.call('GET', `/portal/reports/${s2Report}`, student);
    const random = await h.call('GET', `/portal/reports/${RANDOM_ID}`, student);
    const malformed = await h.call('GET', '/portal/reports/not-an-id', student);
    expect([other.statusCode, random.statusCode, malformed.statusCode]).toEqual([404, 404, 404]);
    expect(other.json()).toEqual(random.json());
    // Madrasa B's Admin cannot reach A's records by id either.
    const adminB = await h.signIn('admin.b');
    expect((await h.call('GET', `/students/${ids.students.S1}/access`, adminB)).statusCode).toBe(404);
  });

  it('F10-AC3 (US-044) an unpublished period is not listed and its data is in no response', async () => {
    const teacher = await h.signIn('teacher.a1');
    await seedWeek(teacher);
    const student = await h.signIn('student.s1');
    const parent = await h.signIn('parent.p1');
    const bodies = [(await list(student, 'S1')).body, (await list(parent, 'S1')).body, (await list(parent, 'S2')).body, (await h.call('GET', '/portal/students', parent)).body];
    for (const b of bodies) {
      expect(b).not.toContain(day(0));
      expect(b).not.toContain(SHARED);
    }
    expect((await list(student, 'S1')).json()).toEqual({ items: [], nextCursor: null });
  });

  it('F10-AC17 (US-044) a published report has exactly the approved fields and none of the private ones', async () => {
    const teacher = await h.signIn('teacher.a1');
    await seedWeek(teacher);
    // A draft suggestion for S1 in the week: never shown, not even as a count.
    await push(h, teacher, [op('homework_assignment', 'CREATE', uuidv7Like(), { studentId: ids.students.S1, sourceDailyRecordId: null, dueDate: null, instructions: null, assignedDate: day(0), portions: [{ id: uuidv7Like(), section: 'SABQI', position: 1, paraNumber: 3, range: null, totalLines: null, assigned: para(1, 4), origin: 'TEACHER_ADDED', sourceAttemptId: null, instructions: null }] }, null)]);
    await publish(teacher, { classId: ids.classes.A1 });
    for (const who of ['student.s1', 'parent.p1'] as const) {
      const token = await h.signIn(who);
      const res = await h.call('GET', `/portal/reports/${await firstReportId(token, 'S1')}`, token);
      expect(res.statusCode).toBe(200);
      expect(res.headers['cache-control']).toBe('no-store');
      const body = res.json();
      expect(Object.keys(body).sort()).toEqual(['generatedAt', 'id', 'publishedAt', 'report', 'teachers', 'updatedAt']);
      expect(body.teachers).toEqual([{ name: 'Test teacher.a1' }]);
      const r = body.report;
      expect(r).not.toHaveProperty('provisional');
      expect(r).not.toHaveProperty('excludedRecords');
      expect(r.homework).not.toHaveProperty('drafts');
      // Attendance apart from performance; the Leave is counted, its reason absent.
      expect(r.attendance.counts).toMatchObject({ present: 1, leaveAwaiting: 1 });
      const [p4, p5] = r.days[0].portions;
      expect(p4).toMatchObject({ section: 'SABQI', paraNumber: 4, status: 'PARTIAL', quality: 2, completed: para(1, 2), assigned: para(1), mistakeCount: 1, mistakes: [{ category: 'TAJWEED', severity: 'MAJOR', repeated: false }] });
      expect(p5).toMatchObject({ status: 'COMPLETED', quality: 1, remarks: SHARED });
      expect(r.mistakes.byCategory.TAJWEED).toBe(1);
      for (const secret of [PRIVATE, PRIVATE_NOTE, LEAVE_REASON, 'pendingChanges', 'remarksVisibility', 'noteVisibility']) expect(res.body, `${who} ${secret}`).not.toContain(secret);
    }
  });

  it('F10 edge case: a Student login that was unlinked sees no student and no report', async () => {
    const teacher = await h.signIn('teacher.a1');
    await seedWeek(teacher);
    await publish(teacher, { classId: ids.classes.A1 });
    const student = await h.signIn('student.s1');
    const id = await firstReportId(student, 'S1');
    const admin = await h.signIn('admin.a');
    expect((await h.call('POST', `/students/${ids.students.S1}/student-account/unlink`, admin)).json().studentAccount).toBeNull();
    expect((await h.call('GET', '/portal/students', student)).json().items).toEqual([]);
    expect((await h.call('GET', `/portal/reports/${id}`, student)).statusCode).toBe(404);
    expect(await auditsOf('STUDENT_ACCOUNT_UNLINKED')).toHaveLength(1);
    // Linking again needs a Student account of this madrasa.
    const studentUser = await h.userId('student.s1');
    expect((await h.call('POST', `/students/${ids.students.S1}/student-account`, admin, { userId: await h.userId('parent.p1') })).json().error.fields).toEqual({ userId: 'NOT_A_STUDENT_ACCOUNT' });
    expect((await h.call('POST', `/students/${ids.students.S1}/student-account`, admin, { userId: studentUser })).json().studentAccount).toMatchObject({ userId: studentUser, loginId: 'student-s1' });
    expect((await h.call('POST', `/students/${ids.students.S2}/student-account`, admin, { userId: studentUser })).json().error.fields).toEqual({ userId: 'ACCOUNT_ALREADY_LINKED' });
    expect((await h.call('GET', `/portal/reports/${id}`, student)).statusCode).toBe(200);
  });
});

describe('F10 · Parent access (US-045)', () => {
  it('F10-AC5 (US-045) a Parent with two verified links can access exactly those children', async () => {
    const teacher = await h.signIn('teacher.a1');
    await seedWeek(teacher);
    await publish(teacher, { classId: ids.classes.A1 });
    const parent = await h.signIn('parent.p1');
    const students = (await h.call('GET', '/portal/students', parent)).json().items.map((s: { id: string }) => s.id);
    expect(students.sort()).toEqual([ids.students.S1, ids.students.S2].sort());
    for (const s of ['S1', 'S2'] as const) expect((await list(parent, s)).statusCode).toBe(200);
    expect((await list(parent, 'S3')).statusCode).toBe(404);
    // parent.p2's only link was revoked: no students at all.
    expect((await h.call('GET', '/portal/students', await h.signIn('parent.p2'))).json().items).toEqual([]);
  });

  it('F10-AC6 (US-045) a Parent has no student search and gets "not found" for other students', async () => {
    const parent = await h.signIn('parent.p1');
    for (const url of ['/students?q=Test', '/students?q=EXT-A-003', '/entry/classes', `/students/${ids.students.S3}`, '/family-accounts?role=STUDENT']) {
      expect([403, 404], url).toContain((await h.call('GET', url, parent)).statusCode);
    }
    // Query parameters cannot widen the portal list.
    expect((await h.call('GET', '/portal/students?name=Test%20Student%20Three', parent)).json().items).toHaveLength(2);
    expect((await h.call('GET', `/portal/reports?studentId=${ids.students.S3}`, parent)).statusCode).toBe(404);
  });

  it('F10-AC7 (US-045) a revoked link refuses that child at once and removes it from the list', async () => {
    const teacher = await h.signIn('teacher.a1');
    await seedWeek(teacher);
    await publish(teacher, { classId: ids.classes.A1 });
    const parent = await h.signIn('parent.p1');
    const s2Report = await firstReportId(parent, 'S2');
    const admin = await h.signIn('admin.a');
    const access = (await h.call('GET', `/students/${ids.students.S2}/access`, admin)).json();
    const link = access.guardians.find((g: { parent: { loginId: string } }) => g.parent.loginId === 'parent-p1');
    const revoked = await h.call('POST', `/guardian-links/${link.id}/revoke`, admin);
    expect(revoked.statusCode, revoked.body).toBe(200);
    // The same session, next request.
    expect((await h.call('GET', `/portal/reports/${s2Report}`, parent)).statusCode).toBe(404);
    expect((await list(parent, 'S2')).statusCode).toBe(404);
    expect((await h.call('GET', '/portal/students', parent)).json().items.map((s: { id: string }) => s.id)).toEqual([ids.students.S1]);
    // Revoking twice is a no-op (one audit); re-verifying a revoked link is refused.
    await h.call('POST', `/guardian-links/${link.id}/revoke`, admin);
    expect(await auditsOf('GUARDIAN_LINK_REVOKED')).toHaveLength(1);
    expect((await h.call('POST', `/guardian-links/${link.id}/verify`, admin, { verificationMethod: 'IN_PERSON' })).json().error.fields).toEqual({ linkId: 'LINK_REVOKED' });
  });

  it('F10-AC8 (US-045) linking, verifying, and revoking a Parent are each audited, with no contact details', async () => {
    const admin = await h.signIn('admin.a');
    const parent2 = await h.userId('parent.p2');
    const linked = await h.call('POST', `/students/${ids.students.S1}/guardians`, admin, { parentUserId: parent2, verificationMethod: 'MADRASA_RECORDS' });
    expect(linked.statusCode, linked.body).toBe(200);
    const link = linked.json().guardians.find((g: { parent: { userId: string }; revokedAt: string | null }) => g.parent.userId === parent2 && g.revokedAt === null);
    expect(link).toMatchObject({ verificationMethod: 'MADRASA_RECORDS', verifiedBy: 'Test admin.a', revokedAt: null });
    await h.call('POST', `/guardian-links/${link.id}/verify`, admin, { verificationMethod: 'IN_PERSON' });
    await h.call('POST', `/guardian-links/${link.id}/revoke`, admin);
    const rows = await h.db.selectFrom('audit_logs').selectAll().where('target_id', '=', link.id).orderBy('created_at').execute();
    expect(rows.map((r) => r.action)).toEqual(['GUARDIAN_LINKED', 'GUARDIAN_VERIFIED', 'GUARDIAN_LINK_REVOKED']);
    expect(rows.every((r) => r.actor_user_id !== null && r.target_type === 'GUARDIAN_LINK')).toBe(true);
    expect(rows[0]!.summary).toMatchObject({ studentId: ids.students.S1, parentUserId: parent2, verificationMethod: 'MADRASA_RECORDS' });
    expect(rows[1]!.summary).toMatchObject({ verificationMethod: 'IN_PERSON', previousMethod: 'MADRASA_RECORDS' });
    expect(JSON.stringify(rows)).not.toContain('@example.test');
    // parent.p2 sees S1 while linked, and not after the revoke.
    expect((await h.call('GET', '/portal/students', await h.signIn('parent.p2'))).json().items).toEqual([]);
  });

  it('F10-AC16 (US-045) a Parent link needs a recorded verification method and is Owner/Admin only', async () => {
    const admin = await h.signIn('admin.a');
    const parent2 = await h.userId('parent.p2');
    const missing = await h.call('POST', `/students/${ids.students.S1}/guardians`, admin, { parentUserId: parent2 });
    expect(missing.statusCode).toBe(400);
    expect(missing.json().error.fields).toHaveProperty('verificationMethod');
    expect((await h.call('POST', `/students/${ids.students.S1}/guardians`, admin, { parentUserId: parent2, verificationMethod: 'PHONE_CALL' })).statusCode).toBe(400);
    // Not a Parent account (a Teacher), or another madrasa's account: refused, nothing linked.
    expect((await h.call('POST', `/students/${ids.students.S1}/guardians`, admin, { parentUserId: await h.userId('teacher.a1'), verificationMethod: 'IN_PERSON' })).json().error.fields).toEqual({ parentUserId: 'NOT_A_PARENT_ACCOUNT' });
    expect((await h.call('POST', `/students/${ids.students.S1}/guardians`, admin, { parentUserId: await h.userId('admin.b'), verificationMethod: 'IN_PERSON' })).json().error.fields).toEqual({ parentUserId: 'NOT_A_PARENT_ACCOUNT' });
    // Linking the same parent twice is refused.
    expect((await h.call('POST', `/students/${ids.students.S1}/guardians`, admin, { parentUserId: await h.userId('parent.p1'), verificationMethod: 'IN_PERSON' })).json().error.fields).toEqual({ parentUserId: 'ALREADY_LINKED' });
    // A Teacher (even of the class) cannot link or revoke, or read the links.
    const teacher = await h.signIn('teacher.a1');
    expect((await h.call('POST', `/students/${ids.students.S1}/guardians`, teacher, { parentUserId: parent2, verificationMethod: 'IN_PERSON' })).statusCode).toBe(403);
    const link = (await h.call('GET', `/students/${ids.students.S1}/access`, admin)).json().guardians[0];
    expect((await h.call('POST', `/guardian-links/${link.id}/revoke`, teacher)).statusCode).toBe(403);
    expect((await h.call('GET', `/students/${ids.students.S1}/access`, teacher)).statusCode).toBe(403);
    // The Owner may.
    const owner = await h.signIn('owner.a');
    const ok = await h.call('POST', `/students/${ids.students.S1}/guardians`, owner, { parentUserId: parent2, verificationMethod: 'IN_PERSON' });
    expect(ok.statusCode, ok.body).toBe(200);
    const stored = await h.db.selectFrom('student_guardians').select(['verification_method', 'verified_by']).where('guardian_user_id', '=', parent2).where('revoked_at', 'is', null).executeTakeFirstOrThrow();
    expect(stored).toEqual({ verification_method: 'IN_PERSON', verified_by: await h.userId('owner.a') });
  });
});

describe('F10 · private teacher notes (US-046)', () => {
  it('F10-AC9 (US-046) a remark saved without a visibility is private to staff', async () => {
    const teacher = await h.signIn('teacher.a1');
    const { p4, p5 } = await seedWeek(teacher);
    const rows = await h.db.selectFrom('portion_attempts').select(['id', 'remarks_visibility']).where('id', 'in', [p4.attemptId, p5.attemptId]).execute();
    expect(Object.fromEntries(rows.map((r) => [r.id, r.remarks_visibility]))).toEqual({ [p4.attemptId]: 'INTERNAL', [p5.attemptId]: 'SHARED' });
    // Staff see it, labelled.
    const detailRes = await h.call('GET', `/hifz/daily-records/${(await h.db.selectFrom('lesson_portions').select('daily_record_id').where('id', '=', p4.portionId).executeTakeFirstOrThrow()).daily_record_id}`, teacher);
    const attempts = detailRes.json().portions.flatMap((p: { attempts: { remarks: string; remarksVisibility: string }[] }) => p.attempts);
    expect(attempts.map((a: { remarksVisibility: string }) => a.remarksVisibility).sort()).toEqual(['INTERNAL', 'SHARED']);
  });

  it('F10-AC10 (US-046) a private note never reaches any Student or Parent response, log, or staff-only export they could call (AC-SEC-04)', async () => {
    const teacher = await h.signIn('teacher.a1');
    await seedWeek(teacher);
    await publish(teacher, { classId: ids.classes.A1 });
    for (const who of ['student.s1', 'parent.p1'] as const) {
      const token = await h.signIn(who);
      const id = await firstReportId(token, 'S1');
      const responses = [
        await h.call('GET', '/portal/students', token),
        await list(token, 'S1'),
        await list(token, 'S1', 'WEEK'),
        await h.call('GET', `/portal/reports/${id}`, token),
        // Staff channels answer a family audience with an error only.
        await h.call('GET', `/reports/student?studentId=${ids.students.S1}&kind=WEEK&date=${day(0)}`, token),
        await h.call('GET', `/reports/class-summary/export?classId=${ids.classes.A1}&kind=WEEK&date=${day(0)}&format=xlsx`, token),
        await h.call('GET', `/reports/class-summary/export?classId=${ids.classes.A1}&kind=WEEK&date=${day(0)}&format=pdf`, token),
        await h.call('GET', `/sync/pull?protocolVersion=1&deviceId=0190f5c0-0000-4000-8000-0000000000c1`, token),
      ];
      for (const res of responses) {
        for (const secret of [PRIVATE, PRIVATE_NOTE, LEAVE_REASON]) expect(res.rawPayload.toString('latin1'), `${who} ${res.raw.req.url}`).not.toContain(secret);
      }
      expect(responses[3]!.body).toContain(SHARED);
    }
    // Never logged (FR-AUD-003).
    expect(h.logSink.lines.some((l) => l.includes(PRIVATE) || l.includes(PRIVATE_NOTE))).toBe(false);
  });

  it('F10-AC11 (US-046) a remark visible to student/guardian is shown to the Student and the linked Parent', async () => {
    const teacher = await h.signIn('teacher.a1');
    await seedWeek(teacher);
    await publish(teacher, { classId: ids.classes.A1 });
    for (const who of ['student.s1', 'parent.p1'] as const) {
      const token = await h.signIn(who);
      const body = (await h.call('GET', `/portal/reports/${await firstReportId(token, 'S1')}`, token)).json();
      expect(body.report.days[0].portions[1].remarks, who).toBe(SHARED);
      expect(body.report.days[0].portions[0], who).not.toHaveProperty('remarks');
    }
  });

  it('F10-AC12 (US-046) changing a remark\'s visibility is audited with the old and new visibility and no text', async () => {
    const teacher = await h.signIn('teacher.a1');
    const { p4 } = await seedWeek(teacher);
    const [r] = await push(h, teacher, [attemptUpdateOp(p4.attemptId, p4.rowVersion, { remarksVisibility: 'SHARED' })]);
    expect(r!.status).toBe('APPLIED');
    const rows = await h.db.selectFrom('audit_logs').selectAll().where('target_id', '=', p4.attemptId).where('action', '=', 'NOTE_VISIBILITY_CHANGED').execute();
    expect(rows).toHaveLength(1);
    expect(rows[0]!.summary).toMatchObject({ textKind: 'ATTEMPT_REMARKS', from: 'INTERNAL', to: 'SHARED', studentId: ids.students.S1, reportDate: day(0) });
    expect(rows[0]!.actor_user_id).toBe(await h.userId('teacher.a1'));
    // And back again: a second record.
    await push(h, teacher, [attemptUpdateOp(p4.attemptId, r!.rowVersion!, { remarksVisibility: 'INTERNAL' })]);
    const all = await h.db.selectFrom('audit_logs').selectAll().where('target_id', '=', p4.attemptId).where('action', '=', 'NOTE_VISIBILITY_CHANGED').orderBy('created_at').execute();
    expect(all.map((x) => [(x.summary as { from: string }).from, (x.summary as { to: string }).to])).toEqual([
      ['INTERNAL', 'SHARED'],
      ['SHARED', 'INTERNAL'],
    ]);
    // Sending the same visibility again changes nothing and audits nothing.
    const after = await h.db.selectFrom('portion_attempts').select('row_version').where('id', '=', p4.attemptId).executeTakeFirstOrThrow();
    await push(h, teacher, [attemptUpdateOp(p4.attemptId, Number(after.row_version), { remarksVisibility: 'INTERNAL' })]);
    expect(await h.db.selectFrom('audit_logs').select('id').where('target_id', '=', p4.attemptId).where('action', '=', 'NOTE_VISIBILITY_CHANGED').execute()).toHaveLength(2);
    expect(JSON.stringify(all)).not.toContain(PRIVATE);
  });
});

/** A canonical lowercase UUIDv7 for offline-created ids. */
function uuidv7Like(): string {
  const hex = [...crypto.getRandomValues(new Uint8Array(16))].map((b) => b.toString(16).padStart(2, '0')).join('');
  const ms = Date.now().toString(16).padStart(12, '0');
  return `${ms.slice(0, 8)}-${ms.slice(8, 12)}-7${hex.slice(13, 16)}-${((parseInt(hex[16]!, 16) & 0x3) | 0x8).toString(16)}${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}
