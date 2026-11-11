// F05 · Daily Hifz entry — integration against real Postgres (docs/specs/09-f05-daily-hifz-entry.md; plan
// docs/handover/F05-plan.md §5). Seeded fixtures (e2e/fixtures/personas.ts): A1 (teacher.a1; S1, S2), A2 (teacher.a2;
// S3), B1 (teacher.b1; SB1); every class meets Monday–Saturday from 90 days ago. Writes go through POST /sync/push.
// Quran data is the SYNTHETIC fixture only (control /quran/seed): never real metadata.
import { sql } from 'kysely';
import { v7 as uuidv7 } from 'uuid';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { addDays, calendarDateIn } from '@hifz/domain/roster';
import { withTenant } from '../../src/platform/tenant.ts';
import { startHarness, type Harness } from '../support/harness.ts';
import {
  DEVICE_2,
  applied,
  attemptOp,
  attemptUpdateOp,
  attendanceOp,
  classDay,
  classDayFrom,
  detail,
  lines,
  para,
  portionOp,
  portionUpdateOp,
  presentRecord,
  push,
  recordOp,
  recordUpdateOp,
  seedQuran,
  today,
  type Ids,
} from './support.ts';

let h: Harness;
let ids: Ids;

type AuditRow = { action: string; actor_user_id: string | null; target_type: string; summary: Record<string, unknown> };
const audit = async (targetId: string) => (await h.control('GET', `/audit-target/${targetId}`)).json().items as AuditRow[];

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

const SABAQ_2_1_10 = { surahStart: 2, ayahStart: 1, surahEnd: 2, ayahEnd: 10 };

describe('F05 · daily records (US-018, US-019)', () => {
  it('F05-AC1 (US-018) stores the Teacher\'s report date apart from save and receive times', async () => {
    const teacher = await h.signIn('teacher.a1');
    const day = classDay(h, 1);
    const { id } = await applied(h, teacher, recordOp(ids, 'S1', day));
    const d = await detail(h, teacher, id);
    expect(d.record).toMatchObject({ id, reportDate: day, studentId: ids.students.S1, classId: ids.classes.A1, sessionLabel: null, portionCount: 0, rowVersion: 1 });
    expect(calendarDateIn(new Date(d.record.serverReceivedAt), 'Asia/Karachi')).toBe(today(h));
    expect(day < today(h)).toBe(true);
    expect(await audit(id)).toEqual([expect.objectContaining({ action: 'DAILY_RECORD_CREATED', target_type: 'DAILY_RECORD' })]);
  });

  it('F05-AC2 (US-018) a record synced the next day keeps its report date', async () => {
    const day = classDay(h, 0);
    const saved = recordOp(ids, 'S1', day);
    const op = { ...saved, fields: { ...saved.fields, clientSavedAt: h.clock.now().toISOString() } };
    // Synced a day later: the Teacher's date stands.
    h.clock.advance(24 * 60 * 60 * 1000);
    const teacher = await h.signIn('teacher.a1');
    const { id } = await applied(h, teacher, op);
    const d = await detail(h, teacher, id);
    expect(d.record.reportDate).toBe(day);
    expect(d.record.clientSavedAt).not.toBeNull();
    expect(d.record.serverReceivedAt > d.record.clientSavedAt).toBe(true);
  });

  it('F05-AC17 (US-018) refuses a future date; a scheduled earlier date is accepted; a non-class day is refused', async () => {
    const teacher = await h.signIn('teacher.a1');
    const [future] = await push(h, teacher, [recordOp(ids, 'S1', addDays(today(h), 1))]);
    expect(future).toMatchObject({ status: 'REJECTED', code: 'VALIDATION', fields: { reportDate: 'FUTURE' } });
    let sunday = addDays(today(h), -1);
    while (new Date(`${sunday}T00:00:00Z`).getUTCDay() !== 0) sunday = addDays(sunday, -1);
    const [unscheduled] = await push(h, teacher, [recordOp(ids, 'S1', sunday)]);
    expect(unscheduled).toMatchObject({ status: 'REJECTED', fields: { reportDate: 'UNSCHEDULED' } });
    const [ok] = await push(h, teacher, [recordOp(ids, 'S1', classDay(h, 3))]);
    expect(ok!.status).toBe('APPLIED');
  });

  it('F05-AC6 (US-019) SINGLE refuses a second record for the student and date, naming the existing one', async () => {
    const teacher = await h.signIn('teacher.a1');
    const day = classDay(h, 1);
    const { id } = await applied(h, teacher, recordOp(ids, 'S1', day));
    const [dup] = await push(h, teacher, [recordOp(ids, 'S1', day)]);
    expect(dup).toMatchObject({ status: 'REJECTED', code: 'VALIDATION', fields: { reportDate: 'DUPLICATE_RECORD', 'reportDate.existingId': id } });
    const [labelled] = await push(h, teacher, [recordOp(ids, 'S2', day, { sessionLabel: 'Fajr' })]);
    expect(labelled).toMatchObject({ status: 'REJECTED', fields: { sessionLabel: 'SESSION_LABEL_NOT_ALLOWED' } });
    const { rows } = await sql<{ n: string }>`SELECT count(*)::text AS n FROM daily_records`.execute(h.db);
    expect(rows[0]!.n).toBe('1');
  });

  it('F05-AC7 (US-019) MULTI_SESSION needs a label, allows distinct labels, refuses a reused one (any case)', async () => {
    const admin = await h.signIn('admin.a');
    expect((await h.call('PUT', '/organization/daily-report-mode', admin, { mode: 'MULTI_SESSION' })).json()).toEqual({ mode: 'MULTI_SESSION' });
    const teacher = await h.signIn('teacher.a1');
    const day = classDay(h, 1);
    const [none] = await push(h, teacher, [recordOp(ids, 'S1', day)]);
    expect(none).toMatchObject({ status: 'REJECTED', fields: { sessionLabel: 'SESSION_LABEL_REQUIRED' } });
    const fajr = await applied(h, teacher, recordOp(ids, 'S1', day, { sessionLabel: ' Fajr ' }));
    await applied(h, teacher, recordOp(ids, 'S1', day, { sessionLabel: 'Asr' }));
    const [again] = await push(h, teacher, [recordOp(ids, 'S1', day, { sessionLabel: 'fajr' })]);
    expect(again).toMatchObject({ status: 'REJECTED', fields: { sessionLabel: 'DUPLICATE_SESSION', 'sessionLabel.existingId': fajr.id } });
    const [long] = await push(h, teacher, [recordOp(ids, 'S1', day, { sessionLabel: 'x'.repeat(41) })]);
    expect(long).toMatchObject({ status: 'REJECTED', fields: { sessionLabel: 'SESSION_LABEL_TOO_LONG', 'sessionLabel.max': '40' } });
    expect((await detail(h, teacher, fajr.id)).record.sessionLabel).toBe('Fajr');
    // Renaming to a label already used that day is refused too.
    const [rename] = await push(h, teacher, [recordUpdateOp(fajr.id, 1, 'ASR')]);
    expect(rename).toMatchObject({ status: 'REJECTED', fields: { sessionLabel: 'DUPLICATE_SESSION' } });
  });

  it('F05-AC8 (US-019) switching back to SINGLE is blocked while a student has two records on a date', async () => {
    const admin = await h.signIn('admin.a');
    await h.call('PUT', '/organization/daily-report-mode', admin, { mode: 'MULTI_SESSION' });
    const teacher = await h.signIn('teacher.a1');
    const day = classDay(h, 1);
    await applied(h, teacher, recordOp(ids, 'S1', day, { sessionLabel: 'Fajr' }));
    await applied(h, teacher, recordOp(ids, 'S1', day, { sessionLabel: 'Asr' }));
    await applied(h, teacher, recordOp(ids, 'S2', day, { sessionLabel: 'Fajr' }));
    const res = await h.call('PUT', '/organization/daily-report-mode', admin, { mode: 'SINGLE' });
    expect(res.statusCode).toBe(409);
    expect(res.json().error).toMatchObject({
      code: 'MODE_CONFLICTS',
      conflicts: [{ studentId: ids.students.S1, studentName: 'Test Student One', reportDate: day, sessionLabels: ['Asr', 'Fajr'] }],
    });
    expect((await h.call('GET', '/organization', admin)).json().dailyReportMode).toBe('MULTI_SESSION');
    const changes = (await audit((await h.call('GET', '/organization', admin)).json().id)).filter((a) => a.action === 'DAILY_REPORT_MODE_CHANGED');
    expect(changes.map((a) => a.summary)).toEqual([{ from: 'SINGLE', to: 'MULTI_SESSION' }]);
  });

  it('F05-AC9 (US-019) only Owner and Admin change the mode; Teacher, Student, Parent get 403', async () => {
    for (const who of ['teacher.a1', 'student.s1', 'parent.p1'] as const) {
      const res = await h.call('PUT', '/organization/daily-report-mode', await h.signIn(who), { mode: 'MULTI_SESSION' });
      expect(res.statusCode, who).toBe(403);
      expect(res.json().error.code).toBe('FORBIDDEN');
    }
    expect((await h.call('PUT', '/organization/daily-report-mode', await h.signIn('owner.a'), { mode: 'MULTI_SESSION' })).statusCode).toBe(200);
    // Another madrasa is untouched.
    expect((await h.call('GET', '/organization', await h.signIn('admin.b'))).json().dailyReportMode).toBe('SINGLE');
  });
});

describe('F05 · portions and attempts (US-018, US-020…023)', () => {
  it('F05-AC10 (US-020) a Sabaq portion stores range, lines, derived Para, edition, and the attempt with mistakes', async () => {
    await seedQuran(h);
    const teacher = await h.signIn('teacher.a1');
    const recordId = await presentRecord(h, teacher, ids, 'S1', classDay(h, 1));
    // Total 10 entered by hand (the synthetic layout counts 5 lines for Surah 2 Ayat 1–10) → MANUAL.
    const portion = await applied(h, teacher, portionOp(recordId, { section: 'SABAQ', range: SABAQ_2_1_10, totalLines: 10, totalLinesSource: 'LAYOUT', assigned: lines(10) }));
    const attempt = await applied(
      h,
      teacher,
      attemptOp(portion.id, { status: 'COMPLETED', completed: lines(10), quality: 2, mistakes: [{ category: 'TAJWEED', severity: 'MINOR', repeated: true }], remarks: 'Synthetic remark one' }),
    );
    const d = await detail(h, teacher, recordId);
    expect(d.portions).toHaveLength(1);
    expect(d.portions[0]).toMatchObject({
      id: portion.id,
      section: 'SABAQ',
      paraNumber: 1,
      range: SABAQ_2_1_10,
      assigned: lines(10),
      totalLines: 10,
      totalLinesSource: 'MANUAL',
      lineCountEdition: 'INDOPAK_16_LINE',
      removed: false,
      progress: { currentStatus: 'COMPLETED', assigned: lines(10), completed: lines(10), remaining: lines(0), quality: 2, attemptCount: 1 },
    });
    expect(d.portions[0].attempts[0]).toMatchObject({
      id: attempt.id,
      attemptNo: 1,
      status: 'COMPLETED',
      completed: lines(10),
      quality: 2,
      mistakeCount: 1,
      mistakes: [{ category: 'TAJWEED', severity: 'MINOR', repeated: true, position: 1 }],
      remarks: 'Synthetic remark one',
    });
    // Total 5 = the layout's count → LAYOUT.
    const second = await applied(h, teacher, portionOp(recordId, { section: 'SABAQ', position: 2, range: SABAQ_2_1_10, totalLines: 5, totalLinesSource: 'MANUAL', assigned: lines(5) }));
    expect((await detail(h, teacher, recordId)).portions.find((p: { id: string }) => p.id === second.id).totalLinesSource).toBe('LAYOUT');
  });

  it('F05-AC20 (US-020) a Sabaq Para unit is refused and nothing stored; a client Sabaq Para is refused; Sabqi/Manzil take presets', async () => {
    await seedQuran(h);
    const teacher = await h.signIn('teacher.a1');
    const recordId = await presentRecord(h, teacher, ids, 'S1', classDay(h, 1));
    const [half] = await push(h, teacher, [portionOp(recordId, { section: 'SABAQ', range: SABAQ_2_1_10, totalLines: 10, assigned: para(1, 2) })]);
    expect(half).toMatchObject({ status: 'REJECTED', code: 'VALIDATION', fields: { unit: 'UNIT_NOT_ALLOWED' } });
    const [clientPara] = await push(h, teacher, [portionOp(recordId, { section: 'SABAQ', paraNumber: 1, range: SABAQ_2_1_10, totalLines: 10, assigned: lines(10) })]);
    expect(clientPara).toMatchObject({ status: 'REJECTED', fields: { paraNumber: 'SABAQ_PARA_NOT_ACCEPTED' } });
    const [sabqi, manzil] = await push(h, teacher, [
      portionOp(recordId, { section: 'SABQI', paraNumber: 3, assigned: para(3, 4) }),
      portionOp(recordId, { section: 'MANZIL', paraNumber: 10, assigned: para(1, 4) }),
    ]);
    expect([sabqi!.status, manzil!.status]).toEqual(['APPLIED', 'APPLIED']);
    const d = await detail(h, teacher, recordId);
    expect(d.portions.map((p: { section: string }) => p.section)).toEqual(['SABQI', 'MANZIL']);
  });

  it('F05-AC21 (US-020) one Surah per Sabaq portion, start ≤ end, assigned defaults to Total Lines; no metadata → refused', async () => {
    const teacher = await h.signIn('teacher.a1');
    const recordId = await presentRecord(h, teacher, ids, 'S1', classDay(h, 1));
    const [noMeta] = await push(h, teacher, [portionOp(recordId, { section: 'SABAQ', range: SABAQ_2_1_10, totalLines: 10, assigned: lines(10) })]);
    expect(noMeta).toMatchObject({ status: 'REJECTED', fields: { range: 'METADATA_UNAVAILABLE' } });
    await seedQuran(h);
    const [cross] = await push(h, teacher, [portionOp(recordId, { section: 'SABAQ', range: { surahStart: 1, ayahStart: 5, surahEnd: 2, ayahEnd: 3 }, totalLines: 4, assigned: lines(4) })]);
    expect(cross).toMatchObject({ status: 'REJECTED', fields: { range: 'CROSSES_SURAH' } });
    const [backwards] = await push(h, teacher, [portionOp(recordId, { section: 'SABAQ', range: { surahStart: 2, ayahStart: 10, surahEnd: 2, ayahEnd: 1 }, totalLines: 4, assigned: lines(4) })]);
    expect(backwards).toMatchObject({ status: 'REJECTED', fields: { range: 'END_BEFORE_START' } });
    const [beyond] = await push(h, teacher, [portionOp(recordId, { section: 'SABAQ', range: { surahStart: 2, ayahStart: 1, surahEnd: 2, ayahEnd: 21 }, totalLines: 4, assigned: lines(4) })]);
    expect(beyond).toMatchObject({ status: 'REJECTED', fields: { ayahEnd: 'OUT_OF_RANGE', 'ayahEnd.max': '20' } });
    const portion = await applied(h, teacher, portionOp(recordId, { section: 'SABAQ', range: SABAQ_2_1_10, totalLines: 10 }));
    expect((await detail(h, teacher, recordId)).portions[0]).toMatchObject({ id: portion.id, assigned: lines(10), totalLines: 10 });
  });

  it('F05-AC22 (US-020) remaining lines, line limits, and the Not Remembered default', async () => {
    await seedQuran(h);
    const teacher = await h.signIn('teacher.a1');
    const recordId = await presentRecord(h, teacher, ids, 'S1', classDay(h, 1));
    const [above] = await push(h, teacher, [portionOp(recordId, { section: 'SABAQ', range: SABAQ_2_1_10, totalLines: 10, assigned: lines(12) })]);
    expect(above).toMatchObject({ status: 'REJECTED', fields: { assigned: 'ABOVE_TOTAL', 'assigned.max': '10' } });
    const p1 = await applied(h, teacher, portionOp(recordId, { section: 'SABAQ', range: SABAQ_2_1_10, totalLines: 10, assigned: lines(10) }));
    const [eleven] = await push(h, teacher, [attemptOp(p1.id, { status: 'PARTIAL', completed: lines(11) })]);
    expect(eleven).toMatchObject({ status: 'REJECTED', fields: { completed: 'ABOVE_ASSIGNED' } });
    const [fraction] = await push(h, teacher, [attemptOp(p1.id, { status: 'PARTIAL', completed: { unit: 'LINES', numerator: 5, denominator: 2 } })]);
    expect(fraction).toMatchObject({ status: 'REJECTED', code: 'VALIDATION' });
    await applied(h, teacher, attemptOp(p1.id, { status: 'PARTIAL', completed: lines(7), quality: 3 }));
    const p2 = await applied(h, teacher, portionOp(recordId, { section: 'SABAQ', position: 2, range: { surahStart: 3, ayahStart: 1, surahEnd: 3, ayahEnd: 20 }, totalLines: 10, assigned: lines(10) }));
    await applied(h, teacher, attemptOp(p2.id, { status: 'NOT_REMEMBERED' }));
    const d = await detail(h, teacher, recordId);
    expect(d.portions[0].progress).toMatchObject({ completed: lines(7), remaining: lines(3) });
    expect(d.portions[1].progress).toMatchObject({ currentStatus: 'NOT_REMEMBERED', completed: lines(0), remaining: lines(10) });
    expect(d.sectionSummary[0]).toMatchObject({ section: 'SABAQ', portionIds: [p1.id, p2.id], totals: { assigned: [lines(20)], completed: [lines(7)], remaining: [lines(13)] } });
  });

  it('F05-AC11 (US-021) Sabqi portions keep independent statuses; correcting one leaves the other unchanged', async () => {
    const teacher = await h.signIn('teacher.a1');
    const recordId = await presentRecord(h, teacher, ids, 'S1', classDay(h, 1));
    const p3 = await applied(h, teacher, portionOp(recordId, { section: 'SABQI', paraNumber: 3, assigned: para(1) }));
    const p4 = await applied(h, teacher, portionOp(recordId, { section: 'SABQI', position: 2, paraNumber: 4, assigned: para(1) }));
    await applied(h, teacher, attemptOp(p3.id, { status: 'COMPLETED' }));
    const a4 = await applied(h, teacher, attemptOp(p4.id, { status: 'PARTIAL', completed: para(1, 2) }));
    await applied(h, teacher, attemptUpdateOp(a4.id, 1, { status: 'PARTIAL', completed: para(3, 4), quality: 2, noMistakes: true, mistakes: [] }));
    const d = await detail(h, teacher, recordId);
    expect(d.portions[0].progress).toMatchObject({ currentStatus: 'COMPLETED', completed: para(1), remaining: para(0) });
    expect(d.portions[1].progress).toMatchObject({ currentStatus: 'PARTIAL', completed: para(3, 4), remaining: para(1, 4), quality: 2 });
    expect(d.portions[0].rowVersion).toBe(1);
    expect((await audit(a4.id)).map((a) => a.action)).toEqual(['PORTION_ATTEMPT_CREATED', 'PORTION_ATTEMPT_CORRECTED']);
  });

  it('F05-AC13 (US-022) three Manzil outcomes stay separate in the record and its summary (AC-QTY-06)', async () => {
    const teacher = await h.signIn('teacher.a1');
    const recordId = await presentRecord(h, teacher, ids, 'S1', classDay(h, 1));
    const m1 = await applied(h, teacher, portionOp(recordId, { section: 'MANZIL', paraNumber: 1, assigned: para(1) }));
    const m5 = await applied(h, teacher, portionOp(recordId, { section: 'MANZIL', position: 2, paraNumber: 5, assigned: para(1) }));
    const m10 = await applied(h, teacher, portionOp(recordId, { section: 'MANZIL', position: 3, paraNumber: 10, assigned: para(1) }));
    await push(h, teacher, [attemptOp(m1.id, { status: 'COMPLETED' }), attemptOp(m5.id, { status: 'PARTIAL', completed: para(1, 2) }), attemptOp(m10.id, { status: 'NOT_REMEMBERED' })]);
    const d = await detail(h, teacher, recordId);
    expect(d.portions.map((p: { paraNumber: number; progress: { currentStatus: string } }) => [p.paraNumber, p.progress.currentStatus])).toEqual([
      [1, 'COMPLETED'],
      [5, 'PARTIAL'],
      [10, 'NOT_REMEMBERED'],
    ]);
    const manzil = d.sectionSummary.find((s: { section: string }) => s.section === 'MANZIL');
    expect(manzil.portionIds).toEqual([m1.id, m5.id, m10.id]);
    expect(manzil.totals).toMatchObject({ assigned: [para(3)], completed: [para(3, 2)], remaining: [para(3, 2)] });
  });

  it('F05-AC14 (US-022) Not Remembered defaults completed to 0; a later correction to Rubu is accepted', async () => {
    const teacher = await h.signIn('teacher.a1');
    const recordId = await presentRecord(h, teacher, ids, 'S1', classDay(h, 1));
    const p = await applied(h, teacher, portionOp(recordId, { section: 'MANZIL', paraNumber: 2, assigned: para(1, 2) }));
    const a = await applied(h, teacher, attemptOp(p.id, { status: 'NOT_REMEMBERED' }));
    let d = await detail(h, teacher, recordId);
    expect(d.portions[0].attempts[0]).toMatchObject({ completed: { unit: 'PARA', numerator: 0, denominator: 1 }, mistakeCount: null });
    expect(d.portions[0].progress.remaining).toEqual(para(1, 2));
    await applied(h, teacher, attemptUpdateOp(a.id, 1, { status: 'PARTIAL', completed: para(1, 4), quality: null, noMistakes: false, mistakes: [] }));
    d = await detail(h, teacher, recordId);
    expect(d.portions[0].progress).toMatchObject({ currentStatus: 'PARTIAL', completed: para(1, 4), remaining: para(1, 4) });
  });

  it('F05-AC15 (US-023) a second attempt leaves the first unchanged; attempt numbers are not reused (AC-ATT-05)', async () => {
    const teacher = await h.signIn('teacher.a1');
    const recordId = await presentRecord(h, teacher, ids, 'S1', classDay(h, 1));
    const p = await applied(h, teacher, portionOp(recordId, { section: 'SABQI', paraNumber: 3, assigned: para(1) }));
    await applied(h, teacher, attemptOp(p.id, { status: 'PARTIAL', completed: para(1, 2), quality: 4 }));
    const before = (await detail(h, teacher, recordId)).portions[0].attempts[0];
    h.clock.advance(60_000);
    const [taken] = await push(h, await h.signIn('admin.a'), [attemptOp(p.id, { attemptNo: 1, status: 'COMPLETED' })]);
    expect(taken).toMatchObject({ status: 'REJECTED', fields: { attemptNo: 'ATTEMPT_NO_TAKEN' } });
    await applied(h, await h.signIn('admin.a'), attemptOp(p.id, { attemptNo: 2, status: 'COMPLETED', quality: 1 }));
    const attempts = (await detail(h, teacher, recordId)).portions[0].attempts;
    expect(attempts).toHaveLength(2);
    expect(attempts[0]).toEqual(before);
    expect(attempts[1].recordedBy.displayName).toBe('Test admin.a');
  });

  it('F05-AC16 (US-023) the latest attempt drives status; the assigned quantity counts once', async () => {
    const teacher = await h.signIn('teacher.a1');
    const recordId = await presentRecord(h, teacher, ids, 'S1', classDay(h, 1));
    const p = await applied(h, teacher, portionOp(recordId, { section: 'SABQI', paraNumber: 3, assigned: para(1, 2) }));
    await applied(h, teacher, attemptOp(p.id, { status: 'PARTIAL', completed: para(1, 4) }));
    await applied(h, teacher, attemptOp(p.id, { attemptNo: 2, status: 'COMPLETED' }));
    const d = await detail(h, teacher, recordId);
    expect(d.portions[0].progress).toMatchObject({ currentStatus: 'COMPLETED', assigned: para(1, 2), completed: para(1, 2), attemptCount: 2, currentAttemptNo: 2 });
    expect(d.sectionSummary.find((s: { section: string }) => s.section === 'SABQI').totals.assigned).toEqual([para(1, 2)]);
  });

  it('F05-AC5 / AC18 (US-018) no portion while Absent, on Leave, or unmarked; no quality on Absent/Pending', async () => {
    const teacher = await h.signIn('teacher.a1');
    const day = classDay(h, 1);
    const [att, rec] = await push(h, teacher, [attendanceOp(ids, 'S1', day, 'ABSENT'), recordOp(ids, 'S1', day)]);
    expect([att!.status, rec!.status]).toEqual(['APPLIED', 'APPLIED']);
    const [absent] = await push(h, teacher, [portionOp(rec!.entityId!, { section: 'SABQI', paraNumber: 3, assigned: para(1) })]);
    expect(absent).toMatchObject({ status: 'REJECTED', fields: { attendance: 'ATTENDANCE_CHANGE_TO_LATE' } });
    expect((await detail(h, teacher, rec!.entityId!)).attendance).toEqual({ status: 'ABSENT', portionsAllowed: 'CHANGE_TO_LATE' });
    const unmarked = await applied(h, teacher, recordOp(ids, 'S2', day));
    const [none] = await push(h, teacher, [portionOp(unmarked.id, { section: 'SABQI', paraNumber: 3, assigned: para(1) })]);
    expect(none).toMatchObject({ status: 'REJECTED', fields: { attendance: 'ATTENDANCE_REQUIRED' } });
    // Changed to Late: portions are allowed; an Absent or Pending outcome carries no quality.
    await applied(h, teacher, attendanceOpUpdate(att!.entityId!, 'LATE'));
    const p = await applied(h, teacher, portionOp(rec!.entityId!, { section: 'SABQI', paraNumber: 3, assigned: para(1) }));
    const [withQuality] = await push(h, teacher, [attemptOp(p.id, { status: 'PENDING', quality: 3 })]);
    expect(withQuality).toMatchObject({ status: 'REJECTED', fields: { quality: 'QUALITY_NOT_ALLOWED' } });
    await applied(h, teacher, attemptOp(p.id, { status: 'ABSENT' }));
    const d = await detail(h, teacher, rec!.entityId!);
    expect(d.portions[0].progress).toMatchObject({ currentStatus: 'ABSENT', quality: null, completed: null, remaining: null });
  });

  it('F05-AC19 (US-023) a 90-day-old record is corrected by the assigned Teacher, audited (no edit lock)', async () => {
    const teacher = await h.signIn('teacher.a1');
    const old = classDayFrom(h, 90);
    const recordId = await presentRecord(h, teacher, ids, 'S1', old);
    const p = await applied(h, teacher, portionOp(recordId, { section: 'MANZIL', paraNumber: 7, assigned: para(1) }));
    const a = await applied(h, teacher, attemptOp(p.id, { status: 'PARTIAL', completed: para(1, 4) }));
    const fixed = await applied(h, teacher, attemptUpdateOp(a.id, 1, { status: 'COMPLETED', completed: null, quality: 2, noMistakes: true, mistakes: [] }));
    expect(fixed.rowVersion).toBe(2);
    expect((await detail(h, teacher, recordId)).portions[0].progress).toMatchObject({ currentStatus: 'COMPLETED', completed: para(1) });
    const corrected = (await audit(a.id)).find((x) => x.action === 'PORTION_ATTEMPT_CORRECTED')!;
    expect(corrected.summary).toMatchObject({ status: 'COMPLETED', completed: para(1), quality: 2, mistakeCount: 0, rowVersion: 2 });
  });

  it('removing a portion keeps its row and attempts, is audited, and takes no new attempt', async () => {
    const teacher = await h.signIn('teacher.a1');
    const day = classDay(h, 1);
    const recordId = await presentRecord(h, teacher, ids, 'S1', day);
    const p = await applied(h, teacher, portionOp(recordId, { section: 'SABQI', paraNumber: 3, assigned: para(1) }));
    await applied(h, teacher, attemptOp(p.id, { status: 'COMPLETED' }));
    const sheet = async () => (await h.call('GET', `/attendance/sheet?classId=${ids.classes.A1}&date=${day}`, teacher)).json().students.find((s: { id: string }) => s.id === ids.students.S1).recited;
    expect(await sheet()).toBe(true);
    await applied(h, teacher, portionUpdateOp(p.id, 1, { removed: true }));
    const d = await detail(h, teacher, recordId);
    expect(d.portions[0]).toMatchObject({ removed: true, attempts: [expect.objectContaining({ status: 'COMPLETED' })] });
    expect(d.record.portionCount).toBe(0);
    expect(d.sectionSummary.find((s: { section: string }) => s.section === 'SABQI').portionIds).toEqual([]);
    expect((await audit(p.id)).map((a) => a.action)).toEqual(['LESSON_PORTION_CREATED', 'LESSON_PORTION_REMOVED']);
    expect((await audit(p.id))[1]!.summary).toMatchObject({ attemptsKept: 1 });
    const [late] = await push(h, teacher, [attemptOp(p.id, { attemptNo: 2, status: 'COMPLETED' })]);
    expect(late).toMatchObject({ status: 'REJECTED', fields: { lessonPortionId: 'PORTION_REMOVED' } });
    expect(await sheet()).toBe(false);
  });

  it('a portion correction is refused when a recorded attempt would no longer fit the assigned quantity', async () => {
    const teacher = await h.signIn('teacher.a1');
    const recordId = await presentRecord(h, teacher, ids, 'S1', classDay(h, 1));
    const p = await applied(h, teacher, portionOp(recordId, { section: 'SABQI', paraNumber: 3, assigned: para(1) }));
    await applied(h, teacher, attemptOp(p.id, { status: 'PARTIAL', completed: para(3, 4) }));
    const [smaller] = await push(h, teacher, [portionUpdateOp(p.id, 1, { paraNumber: 3, range: null, totalLines: null, totalLinesSource: null, assigned: para(1, 2) })]);
    expect(smaller).toMatchObject({ status: 'REJECTED', fields: { assigned: 'ABOVE_ASSIGNED' } });
    const [unit] = await push(h, teacher, [portionUpdateOp(p.id, 1, { paraNumber: 3, range: null, totalLines: null, totalLinesSource: null, assigned: lines(20) })]);
    expect(unit).toMatchObject({ status: 'REJECTED', fields: { assigned: 'UNIT_MISMATCH' } });
    await applied(h, teacher, portionUpdateOp(p.id, 1, { paraNumber: 4, range: null, totalLines: null, totalLinesSource: null, assigned: para(1) }));
    expect((await audit(p.id)).map((a) => a.action)).toEqual(['LESSON_PORTION_CREATED', 'LESSON_PORTION_UPDATED']);
  });

  it('a Sabaq correction re-derives the Para; a client Para on update is refused', async () => {
    await seedQuran(h);
    const teacher = await h.signIn('teacher.a1');
    const recordId = await presentRecord(h, teacher, ids, 'S1', classDay(h, 1));
    const p = await applied(h, teacher, portionOp(recordId, { section: 'SABAQ', range: SABAQ_2_1_10, totalLines: 10, assigned: lines(10) }));
    const [clientPara] = await push(h, teacher, [portionUpdateOp(p.id, 1, { paraNumber: 2, range: SABAQ_2_1_10, totalLines: 10, totalLinesSource: 'MANUAL', assigned: lines(8) })]);
    expect(clientPara).toMatchObject({ status: 'REJECTED', fields: { paraNumber: 'SABAQ_PARA_NOT_ACCEPTED' } });
    // Surah 12 Ayat 1–4 is in synthetic Para 4 (Para k starts at Surah floor((k−1)·114/30)+1).
    await applied(h, teacher, portionUpdateOp(p.id, 1, { paraNumber: null, range: { surahStart: 12, ayahStart: 1, surahEnd: 12, ayahEnd: 4 }, totalLines: 3, totalLinesSource: 'LAYOUT', assigned: lines(3) }));
    expect((await detail(h, teacher, recordId)).portions[0]).toMatchObject({ paraNumber: 4, totalLines: 3, totalLinesSource: 'MANUAL', assigned: lines(3) });
  });
});

/** An attendance status change for an existing attendance row (F04 handler), from its first version. */
function attendanceOpUpdate(id: string, status: string) {
  return {
    opId: uuidv7(),
    seq: Date.now(),
    entity: 'attendance_record',
    entityId: id,
    opType: 'UPDATE',
    baseVersion: 1,
    fields: { status, leaveReason: null, absentNote: null },
    dependsOn: [],
    clientSavedAt: new Date().toISOString(),
  };
}

describe('F05 · authorization, tenancy, sync safety (AC-SEC-01…05, FR-SYNC-008)', () => {
  async function fixture() {
    const teacher = await h.signIn('teacher.a1');
    const recordId = await presentRecord(h, teacher, ids, 'S1', classDay(h, 1));
    const portion = await applied(h, teacher, portionOp(recordId, { section: 'SABQI', paraNumber: 3, assigned: para(1) }));
    const attempt = await applied(h, teacher, attemptOp(portion.id, { status: 'PARTIAL', completed: para(1, 2), quality: 3, remarks: 'Synthetic internal remark F05' }));
    return { teacher, recordId, portionId: portion.id, attemptId: attempt.id };
  }

  it('role × endpoint matrix for list, detail, push, and the mode switch', async () => {
    const f = await fixture();
    const day = classDay(h, 1);
    // all-classes Teacher: teacher.a2 with the flag (FR-SEC-003).
    const owner = await h.signIn('owner.a');
    expect((await h.call('POST', `/accounts/${await h.userId('teacher.a2')}/all-classes`, owner, { allClasses: true })).statusCode).toBe(200);
    const matrix: Array<{ who: string; list: number; detail: number; inList: boolean; push: string }> = [
      { who: 'owner.a', list: 200, detail: 200, inList: true, push: 'APPLIED' },
      { who: 'admin.a', list: 200, detail: 200, inList: true, push: 'APPLIED' },
      { who: 'teacher.a1', list: 200, detail: 200, inList: true, push: 'APPLIED' },
      { who: 'teacher.a2', list: 200, detail: 200, inList: true, push: 'APPLIED' },
      { who: 'admin.b', list: 200, detail: 404, inList: false, push: 'NOT_FOUND' },
      { who: 'teacher.b1', list: 200, detail: 404, inList: false, push: 'NOT_FOUND' },
    ];
    let attemptNo = 2;
    for (const m of matrix) {
      const token = await h.signIn(m.who);
      const list = await h.call('GET', `/hifz/daily-records?date=${day}`, token);
      expect(list.statusCode, m.who).toBe(m.list);
      expect(list.json().items.some((r: { id: string }) => r.id === f.recordId), m.who).toBe(m.inList);
      expect((await h.call('GET', `/hifz/daily-records/${f.recordId}`, token)).statusCode, m.who).toBe(m.detail);
      const [r] = await push(h, token, [attemptOp(f.portionId, { attemptNo: attemptNo++, status: 'COMPLETED' })]);
      expect(m.push === 'APPLIED' ? r!.status : r!.code, m.who).toBe(m.push);
    }
    // An unassigned Teacher (no flag) in the same madrasa: 404 and NOT_FOUND, like a missing id.
    expect((await h.call('POST', `/accounts/${await h.userId('teacher.a2')}/all-classes`, owner, { allClasses: false })).statusCode).toBe(200);
    const unassigned = await h.signIn('teacher.a2');
    expect((await h.call('GET', `/hifz/daily-records/${f.recordId}`, unassigned)).statusCode).toBe(404);
    expect((await h.call('GET', `/hifz/daily-records?date=${day}`, unassigned)).json().items).toEqual([]);
    expect((await h.call('GET', `/hifz/daily-records?date=${day}&classId=${ids.classes.A1}`, unassigned)).statusCode).toBe(404);
    const [probe] = await push(h, unassigned, [attemptOp(f.portionId, { attemptNo: 50, status: 'COMPLETED' }), recordOp(ids, 'S2', day)]);
    expect(probe).toMatchObject({ status: 'REJECTED', code: 'NOT_FOUND' });
    // Students and Parents never reach staff records or sync.
    for (const who of ['student.s1', 'parent.p1']) {
      const token = await h.signIn(who);
      expect((await h.call('GET', `/hifz/daily-records?date=${day}`, token)).statusCode, who).toBe(403);
      expect((await h.call('GET', `/hifz/daily-records/${f.recordId}`, token)).statusCode, who).toBe(403);
      expect((await h.call('POST', '/sync/push', token, { protocolVersion: 1, deviceId: DEVICE_2, ops: [attemptOp(f.portionId, { attemptNo: 60, status: 'COMPLETED' })] })).statusCode, who).toBe(403);
    }
  });

  it('cross-tenant ID probes are 404 / NOT_FOUND and change nothing', async () => {
    const f = await fixture();
    const other = await h.signIn('admin.b');
    expect((await h.call('GET', `/hifz/daily-records/${f.recordId}`, other)).statusCode).toBe(404);
    expect((await h.call('GET', `/hifz/daily-records/${uuidv7()}`, other)).statusCode).toBe(404);
    expect((await h.call('GET', '/hifz/daily-records/not-a-uuid', other)).statusCode).toBe(404);
    const results = await push(h, other, [
      portionOp(f.recordId, { section: 'MANZIL', paraNumber: 1, assigned: para(1) }),
      attemptOp(f.portionId, { attemptNo: 9, status: 'COMPLETED' }),
      recordUpdateOp(f.recordId, 1, null),
      portionUpdateOp(f.portionId, 1, { removed: true }),
      attemptUpdateOp(f.attemptId, 1, { status: 'COMPLETED', completed: null, quality: 1, noMistakes: true, mistakes: [] }),
    ]);
    for (const r of results) expect(r, JSON.stringify(r)).toMatchObject({ status: 'REJECTED', code: 'NOT_FOUND' });
    // A record naming this madrasa's class is refused like an unknown class id (nothing is revealed).
    const [foreignClass] = await push(h, other, [recordOp(ids, 'S1', classDay(h, 2), { classKey: 'A1' })]);
    const [unknownClass] = await push(h, other, [{ ...recordOp(ids, 'SB1', classDay(h, 2), { classKey: 'B1' }), fields: { studentId: ids.students.SB1, classId: uuidv7(), reportDate: classDay(h, 2), sessionLabel: null } }]);
    expect(foreignClass).toMatchObject({ status: 'REJECTED', fields: { classId: 'INVALID' } });
    expect(unknownClass).toMatchObject({ status: 'REJECTED', fields: { classId: 'INVALID' } });
    const d = await detail(h, f.teacher, f.recordId);
    expect(d.portions).toHaveLength(1);
    expect(d.portions[0]).toMatchObject({ removed: false, attempts: [expect.objectContaining({ status: 'PARTIAL', rowVersion: 1 })] });
  });

  it('RLS: another madrasa\'s tenant transaction sees none of these rows', async () => {
    await fixture();
    const orgB = (await h.call('GET', '/organization', await h.signIn('admin.b'))).json().id as string;
    const seen = await withTenant(h.db, orgB, async (tx) => ({
      records: (await tx.selectFrom('daily_records').select('id').execute()).length,
      portions: (await tx.selectFrom('lesson_portions').select('id').execute()).length,
      attempts: (await tx.selectFrom('portion_attempts').select('id').execute()).length,
      mistakes: (await tx.selectFrom('attempt_mistakes').select('id').execute()).length,
    }));
    expect(seen).toEqual({ records: 0, portions: 0, attempts: 0, mistakes: 0 });
    await expect(sql`DELETE FROM daily_records`.execute(h.db)).rejects.toThrow();
  });

  it('a replayed op_id creates nothing new and returns the stored result', async () => {
    const teacher = await h.signIn('teacher.a1');
    const day = classDay(h, 1);
    const attendance = attendanceOp(ids, 'S1', day, 'PRESENT');
    const record = recordOp(ids, 'S1', day);
    await push(h, teacher, [attendance, record]);
    const [again] = await push(h, teacher, [record]);
    expect(again).toMatchObject({ status: 'APPLIED', entityId: record.entityId, rowVersion: 1 });
    const portion = portionOp(record.entityId, { section: 'SABQI', paraNumber: 3, assigned: para(1) });
    await push(h, teacher, [portion]);
    const attempt = attemptOp(portion.entityId, { status: 'COMPLETED', mistakes: [{ category: 'LAFZI', severity: 'MAJOR', repeated: false }] });
    const a1 = await push(h, teacher, [attempt]);
    const a2 = await push(h, teacher, [portion, attempt]);
    expect(a2[1]).toEqual(a1[0]);
    const { rows } = await sql<{ r: string; p: string; a: string; m: string }>`
      SELECT (SELECT count(*) FROM daily_records)::text AS r, (SELECT count(*) FROM lesson_portions)::text AS p,
             (SELECT count(*) FROM portion_attempts)::text AS a, (SELECT count(*) FROM attempt_mistakes)::text AS m`.execute(h.db);
    expect(rows[0]).toEqual({ r: '1', p: '1', a: '1', m: '1' });
    expect((await audit(attempt.entityId)).length).toBe(1);
  });

  it('two edits of one attempt from the same base version become a conflict, never last-write-wins', async () => {
    const f = await fixture();
    const admin = await h.signIn('admin.a');
    await applied(h, f.teacher, attemptUpdateOp(f.attemptId, 1, { status: 'COMPLETED', completed: null, quality: 2, noMistakes: true, mistakes: [] }));
    const [clash] = await push(h, admin, [attemptUpdateOp(f.attemptId, 1, { status: 'PARTIAL', completed: para(3, 4), quality: 4, noMistakes: false, mistakes: [{ category: 'HARKAAT', severity: 'MINOR', repeated: false }] })], DEVICE_2);
    expect(clash!.status).toBe('CONFLICT');
    const conflicts = (await h.control('GET', '/sync/conflicts')).json().items;
    expect(conflicts).toEqual([expect.objectContaining({ entity: 'portion_attempt', entityId: f.attemptId, conflictFields: ['status', 'completed', 'quality', 'noMistakes', 'mistakes'] })]);
    // The first edit stands until the conflict is resolved explicitly.
    const d = await detail(h, f.teacher, f.recordId);
    expect(d.portions[0].attempts[0]).toMatchObject({ status: 'COMPLETED', completed: para(1), quality: 2, mistakeCount: 0, rowVersion: 2 });
    // Resolution through Conflict Review writes the chosen version and re-validates it.
    const resolved = await h.call('POST', `/sync/conflicts/${clash!.conflictId}/resolve`, admin, { choice: 'KEEP_DEVICE' });
    expect(resolved.statusCode, resolved.body).toBe(200);
    const after = (await detail(h, f.teacher, f.recordId)).portions[0].attempts[0];
    expect(after).toMatchObject({ status: 'PARTIAL', completed: para(3, 4), quality: 4, mistakes: [{ category: 'HARKAAT', severity: 'MINOR', repeated: false, position: 1 }] });
    // The replaced mistake list is kept, detached.
    const { rows } = await sql<{ n: string }>`SELECT count(*)::text AS n FROM attempt_mistakes WHERE attempt_id = ${f.attemptId}`.execute(h.db);
    expect(rows[0]!.n).toBe('1');
  });

  it('two edits of one portion\'s quantity from the same base version become a conflict', async () => {
    const f = await fixture();
    await applied(h, f.teacher, portionUpdateOp(f.portionId, 1, { paraNumber: 3, range: null, totalLines: null, totalLinesSource: null, assigned: para(3, 4) }));
    const [clash] = await push(h, await h.signIn('admin.a'), [portionUpdateOp(f.portionId, 1, { paraNumber: 3, range: null, totalLines: null, totalLinesSource: null, assigned: para(2) })], DEVICE_2);
    expect(clash!.status).toBe('CONFLICT');
    expect((await detail(h, f.teacher, f.recordId)).portions[0].assigned).toEqual(para(3, 4));
  });

  it('audit rows name fields, never the remark text; remarks never reach logs', async () => {
    const f = await fixture();
    await applied(h, f.teacher, attemptUpdateOp(f.attemptId, 1, { remarks: 'Synthetic internal remark F05 changed' }));
    const rows = await audit(f.attemptId);
    expect(rows.map((r) => r.action)).toEqual(['PORTION_ATTEMPT_CREATED', 'PORTION_ATTEMPT_CORRECTED']);
    expect(rows[1]!.summary.fields).toEqual(['remarks']);
    for (const r of rows) expect(JSON.stringify(r.summary)).not.toContain('Synthetic internal remark');
    const found = (await h.control('POST', '/search', { text: 'Synthetic internal remark F05' })).json();
    // Only the attempt row itself holds it (no audit, change log, sync op, or log line).
    expect(found).toEqual({ database: 1, logs: 0 });
  });

  it('F04 stand-ins replaced: exception impact counts daily records; the Quran review lists Sabaq ranges', async () => {
    await seedQuran(h);
    const teacher = await h.signIn('teacher.a1');
    const day = classDay(h, 1);
    const recordId = await presentRecord(h, teacher, ids, 'S1', day);
    const p = await applied(h, teacher, portionOp(recordId, { section: 'SABAQ', range: SABAQ_2_1_10, totalLines: 10, assigned: lines(10) }));
    const admin = await h.signIn('admin.a');
    expect((await h.call('GET', `/calendar/exceptions/impact?date=${day}`, admin)).json()).toEqual({ attendanceRecords: 1, dailyRecords: 1 });
    const surah = (await h.call('GET', '/quran/surahs', admin)).json().items.find((s: { number: number }) => s.number === 2);
    const saved = await h.call('PUT', '/quran/surahs/2', admin, { nameAr: surah.nameAr, nameTranslit: surah.nameTranslit, ayahCount: 5, rowVersion: surah.rowVersion });
    expect(saved.statusCode, saved.body).toBe(200);
    expect(saved.json().recordsNeedingReview).toBe(1);
    const review = (await h.call('GET', '/quran/review', admin)).json();
    expect(review.records).toEqual([expect.objectContaining({ kind: 'SABAQ_PORTION', id: p.id, range: { surah: 2, ayahStart: 1, ayahEnd: 10 } })]);
    // The stored portion is never rewritten (FR-SAB-007).
    expect((await detail(h, teacher, recordId)).portions[0]).toMatchObject({ range: SABAQ_2_1_10, totalLines: 10 });
  });
});
