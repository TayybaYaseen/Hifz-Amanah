// F07 · Mistakes and quality — integration against real Postgres (docs/specs/10-f07-mistakes-quality.md; plan
// docs/handover/F07-plan.md). Seeded fixtures: A1 (teacher.a1; S1, S2), A2 (teacher.a2; S3), B1 (teacher.b1; SB1).
// Writes go through POST /sync/push; the summary is GET /hifz/performance-summary. Synthetic data only.
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { startHarness, type Harness } from '../support/harness.ts';
import { applied, attemptOp, attemptUpdateOp, attendanceOp, classDay, detail, para, portionOp, presentRecord, push, recordOp, type Ids } from './support.ts';

/** A `daily_record` UPDATE of the overall label (F07, US-032). */
const labelOp = (id: string, base: number, overallLabel: string | null) => ({ ...recordOp(ids, 'S1', '2000-01-01'), opType: 'UPDATE' as const, entityId: id, baseVersion: base, fields: { overallLabel } });

let h: Harness;
let ids: Ids;

type AuditRow = { action: string; summary: Record<string, unknown> };
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

/** A Present record with one Sabqi portion (Para 1, one whole Para) for the student; returns the ids. */
async function sabqi(token: string, student: 'S1' | 'S2' | 'S3' = 'S1', back = 1, position = 1, recordId?: string) {
  const rid = recordId ?? (await presentRecord(h, token, ids, student, classDay(h, back), student === 'S3' ? 'A2' : 'A1'));
  const { id: portionId } = await applied(h, token, portionOp(rid, { section: 'SABQI', position, paraNumber: 1, assigned: para(1) }));
  return { recordId: rid, portionId };
}

const mistake = (category: string, severity = 'MINOR', repeated = false, extra: Record<string, unknown> = {}) => ({ category, severity, repeated, ...extra });

async function summary(token: string, student: string, from: string, to: string) {
  return h.call('GET', `/hifz/performance-summary?studentId=${student}&from=${from}&to=${to}`, token);
}

describe('F07 · mistakes (US-028, US-029, US-030)', () => {
  it('F07-AC1 (US-028) two mistakes are stored on the attempt, one category each; two categories are refused', async () => {
    const teacher = await h.signIn('teacher.a1');
    const { recordId, portionId } = await sabqi(teacher);
    const op = attemptOp(portionId, { status: 'PARTIAL', completed: para(1, 2), mistakes: [mistake('TAJWEED'), mistake('LAFZI')] });
    await applied(h, teacher, op);
    const a = (await detail(h, teacher, recordId)).portions[0].attempts[0];
    expect(a.mistakes).toEqual([
      { position: 1, category: 'TAJWEED', severity: 'MINOR', repeated: false, note: null, noteVisibility: 'INTERNAL' },
      { position: 2, category: 'LAFZI', severity: 'MINOR', repeated: false, note: null, noteVisibility: 'INTERNAL' },
    ]);
    expect(a.mistakeCount).toBe(2);
    const [bad] = await push(h, teacher, [attemptOp(portionId, { attemptNo: 2, status: 'PARTIAL', mistakes: [{ category: ['TAJWEED', 'LAFZI'], severity: 'MINOR', repeated: false } as never] })]);
    expect(bad).toMatchObject({ status: 'REJECTED', code: 'VALIDATION' });
    expect(bad!.fields!['mistakes.0.category']).toBeDefined();
  });

  it('F07-AC2 (US-028) the stored category is canonical; a localized label is refused', async () => {
    const teacher = await h.signIn('teacher.a1');
    const { portionId } = await sabqi(teacher);
    const [bad] = await push(h, teacher, [attemptOp(portionId, { status: 'COMPLETED', mistakes: [mistake('Tajweed')] })]);
    expect(bad).toMatchObject({ status: 'REJECTED', code: 'VALIDATION' });
    const ok = await applied(h, teacher, attemptOp(portionId, { status: 'COMPLETED', mistakes: [mistake('TAJWEED')] }));
    const pulled = (await h.call('GET', '/sync/pull', teacher)).json();
    const entry = (pulled.changes as Array<{ entity: string; entityId: string; fields: { mistakes: { category: string }[] } }>).find((c) => c.entity === 'portion_attempt' && c.entityId === ok.id);
    expect(entry?.fields.mistakes[0]?.category).toBe('TAJWEED');
  });

  it('F07-AC4 (US-029) severity MAJOR is stored; anything but MINOR or MAJOR is refused', async () => {
    const teacher = await h.signIn('teacher.a1');
    const { recordId, portionId } = await sabqi(teacher);
    for (const severity of ['CRITICAL', 'REPEATED', 'minor']) {
      const [r] = await push(h, teacher, [attemptOp(portionId, { status: 'PARTIAL', mistakes: [mistake('HARKAAT', severity)] })]);
      expect(r, severity).toMatchObject({ status: 'REJECTED', code: 'VALIDATION' });
    }
    await applied(h, teacher, attemptOp(portionId, { status: 'PARTIAL', mistakes: [mistake('HARKAAT', 'MAJOR')] }));
    expect((await detail(h, teacher, recordId)).portions[0].attempts[0].mistakes[0]).toMatchObject({ category: 'HARKAAT', severity: 'MAJOR' });
  });

  it('F07-AC5 (US-030) Repeated is its own flag and leaves severity unchanged', async () => {
    const teacher = await h.signIn('teacher.a1');
    const { recordId, portionId } = await sabqi(teacher);
    const created = await applied(h, teacher, attemptOp(portionId, { status: 'PARTIAL', mistakes: [mistake('TARTEEB', 'MINOR', false)] }));
    await applied(h, teacher, attemptUpdateOp(created.id, created.rowVersion, { status: 'PARTIAL', completed: null, quality: null, noMistakes: false, mistakes: [mistake('TARTEEB', 'MINOR', true)] }));
    expect((await detail(h, teacher, recordId)).portions[0].attempts[0].mistakes).toEqual([
      { position: 1, category: 'TARTEEB', severity: 'MINOR', repeated: true, note: null, noteVisibility: 'INTERNAL' },
    ]);
  });

  it('F07-AC14 (US-028) "No mistakes" stores 0; an empty list stays Not recorded', async () => {
    const teacher = await h.signIn('teacher.a1');
    const { recordId, portionId } = await sabqi(teacher);
    const { portionId: second } = await sabqi(teacher, 'S1', 1, 2, recordId);
    await applied(h, teacher, attemptOp(portionId, { status: 'COMPLETED', noMistakes: true }));
    await applied(h, teacher, attemptOp(second, { status: 'COMPLETED' }));
    const d = await detail(h, teacher, recordId);
    expect(d.portions.map((p: { attempts: { mistakeCount: number | null; noMistakes: boolean }[] }) => p.attempts[0]!.mistakeCount)).toEqual([0, null]);
    const day = classDay(h, 1);
    const s = (await summary(teacher, ids.students.S1, day, day)).json();
    expect(s.mistakes).toMatchObject({ total: 0, recordedAttempts: 1, noMistakesAttempts: 1, notRecordedAttempts: 1 });
    const [conflict] = await push(h, teacher, [attemptOp(portionId, { attemptNo: 2, status: 'COMPLETED', noMistakes: true, mistakes: [mistake('LAFZI')] })]);
    expect(conflict).toMatchObject({ status: 'REJECTED', code: 'VALIDATION', fields: { mistakes: 'NO_MISTAKES_CONFLICT' } });
  });

  it('F07-AC15 (US-028) a note is internal by default, trimmed, at most 200 characters, and never audited by value', async () => {
    const teacher = await h.signIn('teacher.a1');
    const { recordId, portionId } = await sabqi(teacher);
    const note = 'Synthetic note about madd';
    const created = await applied(h, teacher, attemptOp(portionId, { status: 'PARTIAL', mistakes: [mistake('TAJWEED', 'MINOR', false, { note: `  ${note}  ` }), mistake('LAFZI', 'MAJOR', false, { note: 'Synthetic shared note', noteVisibility: 'SHARED' })] }));
    const [m1, m2] = (await detail(h, teacher, recordId)).portions[0].attempts[0].mistakes;
    expect(m1).toMatchObject({ note, noteVisibility: 'INTERNAL' });
    expect(m2).toMatchObject({ note: 'Synthetic shared note', noteVisibility: 'SHARED' });
    const entries = await audit(created.id);
    expect(entries.length).toBeGreaterThan(0);
    expect(JSON.stringify(entries)).not.toContain('Synthetic');
    const [tooLong] = await push(h, teacher, [attemptOp(portionId, { attemptNo: 2, status: 'PARTIAL', mistakes: [mistake('TAJWEED', 'MINOR', false, { note: 'x'.repeat(201) })] })]);
    expect(tooLong).toMatchObject({ status: 'REJECTED', code: 'VALIDATION', fields: { mistakes: 'TOO_LONG', 'mistakes.max': '200' } });
    const [badVisibility] = await push(h, teacher, [attemptOp(portionId, { attemptNo: 2, status: 'PARTIAL', mistakes: [mistake('TAJWEED', 'MINOR', false, { noteVisibility: 'PUBLIC' })] })]);
    expect(badVisibility).toMatchObject({ status: 'REJECTED', code: 'VALIDATION' });
    // A blank note is no note.
    await applied(h, teacher, attemptOp(portionId, { attemptNo: 2, status: 'PARTIAL', mistakes: [mistake('TAJWEED', 'MINOR', false, { note: '   ' })] }));
    expect((await detail(h, teacher, recordId)).portions[0].attempts[1].mistakes[0].note).toBeNull();
  });
});

describe('F07 · quality (US-031)', () => {
  it('F07-AC7 (US-031) a portion saved without quality stores NULL, never 0', async () => {
    const teacher = await h.signIn('teacher.a1');
    const { recordId, portionId } = await sabqi(teacher);
    await applied(h, teacher, attemptOp(portionId, { status: 'COMPLETED' }));
    const p = (await detail(h, teacher, recordId)).portions[0];
    expect(p.attempts[0].quality).toBeNull();
    expect(p.progress.quality).toBeNull();
    const [zero] = await push(h, teacher, [attemptOp(portionId, { attemptNo: 2, status: 'COMPLETED', quality: 0 })]);
    expect(zero).toMatchObject({ status: 'REJECTED', code: 'VALIDATION' });
    const day = classDay(h, 1);
    expect((await summary(teacher, ids.students.S1, day, day)).json().quality).toEqual({ count: 0, value: null, display: null, nearestScore: null });
  });

  it('F07-AC10 (US-031) Absent, Not Assigned, and Pending refuse quality; without it they save and add no rating', async () => {
    const teacher = await h.signIn('teacher.a1');
    const { recordId, portionId } = await sabqi(teacher);
    const statuses = ['ABSENT', 'NOT_ASSIGNED', 'PENDING'];
    for (const status of statuses) {
      const [r] = await push(h, teacher, [attemptOp(portionId, { status, quality: 3 })]);
      expect(r, status).toMatchObject({ status: 'REJECTED', code: 'VALIDATION', fields: { quality: 'QUALITY_NOT_ALLOWED' } });
    }
    for (const [i, status] of statuses.entries()) {
      const { portionId: pid } = await sabqi(teacher, 'S1', 1, i + 2, recordId);
      await applied(h, teacher, attemptOp(pid, { status }));
    }
    await applied(h, teacher, attemptOp(portionId, { status: 'COMPLETED', quality: 2 }));
    const day = classDay(h, 1);
    expect((await summary(teacher, ids.students.S1, day, day)).json()).toMatchObject({ attemptCount: 4, quality: { count: 1, value: 2, nearestScore: 2 } });
  });

  it('F07-AC8 (US-031) scores 1, 2, 2 and one missing average 1.7 · Good (3 ratings)', async () => {
    const teacher = await h.signIn('teacher.a1');
    const scores = [1, 2, 2, null];
    let recordId: string | undefined;
    for (const [i, quality] of scores.entries()) {
      const s = await sabqi(teacher, 'S1', 1, i + 1, recordId);
      recordId = s.recordId;
      await applied(h, teacher, attemptOp(s.portionId, { status: 'COMPLETED', quality }));
    }
    const day = classDay(h, 1);
    const res = await summary(teacher, ids.students.S1, day, day);
    expect(res.statusCode, res.body).toBe(200);
    const q = res.json().quality;
    expect(q).toMatchObject({ count: 3, display: '1.7', nearestScore: 2 });
    expect(q.value).toBeCloseTo(5 / 3, 10);
  });

  it('F07-AC9 (US-031) an average of exactly 1.5 is labelled Good; an edited score recalculates on the next view', async () => {
    const teacher = await h.signIn('teacher.a1');
    const a = await sabqi(teacher);
    const b = await sabqi(teacher, 'S1', 1, 2, a.recordId);
    await applied(h, teacher, attemptOp(a.portionId, { status: 'COMPLETED', quality: 1 }));
    const second = await applied(h, teacher, attemptOp(b.portionId, { status: 'COMPLETED', quality: 2 }));
    const day = classDay(h, 1);
    expect((await summary(teacher, ids.students.S1, day, day)).json().quality).toEqual({ count: 2, value: 1.5, display: '1.5', nearestScore: 2 });
    await applied(h, teacher, attemptUpdateOp(second.id, second.rowVersion, { status: 'COMPLETED', completed: null, quality: 1, noMistakes: false, mistakes: [] }));
    expect((await summary(teacher, ids.students.S1, day, day)).json().quality).toMatchObject({ count: 2, value: 1, nearestScore: 1 });
  });

  it('F07-AC11 (US-031) no server process writes a quality score: sync replay and record edits leave it unchanged', async () => {
    const teacher = await h.signIn('teacher.a1');
    const { recordId, portionId } = await sabqi(teacher);
    const op = attemptOp(portionId, { status: 'PARTIAL' });
    await applied(h, teacher, op);
    // Replaying the same op, changing the record's overall label, and pulling never fill in a score.
    await push(h, teacher, [op]);
    const d0 = await detail(h, teacher, recordId);
    await applied(h, teacher, labelOp(recordId, d0.record.rowVersion, 'EXCELLENT'));
    expect((await h.call('GET', '/sync/pull', teacher)).statusCode).toBe(200);
    const d = await detail(h, teacher, recordId);
    expect(d.portions[0].attempts.map((a: { quality: number | null }) => a.quality)).toEqual([null]);
  });
});

describe('F07 · overall performance label (US-032)', () => {
  it('F07-AC12 (US-032) the overall label is stored once per record, apart from each portion\'s quality', async () => {
    const teacher = await h.signIn('teacher.a1');
    const day = classDay(h, 1);
    const [att] = await push(h, teacher, [attendanceOp(ids, 'S1', day, 'PRESENT')]);
    expect(att!.status).toBe('APPLIED');
    const created = recordOp(ids, 'S1', day);
    const withLabel = { ...created, fields: { ...created.fields, overallLabel: 'GOOD' } };
    const { id: recordId } = await applied(h, teacher, withLabel);
    const { portionId } = await sabqi(teacher, 'S1', 1, 1, recordId);
    await applied(h, teacher, attemptOp(portionId, { status: 'COMPLETED', quality: 4 }));
    const d = await detail(h, teacher, recordId);
    expect(d.record.overallLabel).toBe('GOOD');
    expect(d.portions[0].attempts[0].quality).toBe(4);
    const list = (await h.call('GET', `/hifz/daily-records?studentId=${ids.students.S1}&date=${day}`, teacher)).json();
    expect(list.items[0].overallLabel).toBe('GOOD');
    const [bad] = await push(h, teacher, [labelOp(recordId, d.record.rowVersion, 'WEAK')]);
    expect(bad).toMatchObject({ status: 'REJECTED', code: 'VALIDATION' });
    const changes = (await audit(recordId)).map((e) => e.action);
    expect(changes).toContain('DAILY_RECORD_CREATED');
  });

  it('F07-AC13 (US-032) the overall label and quality scores are never derived from each other', async () => {
    const teacher = await h.signIn('teacher.a1');
    const a = await sabqi(teacher);
    const b = await sabqi(teacher, 'S1', 1, 2, a.recordId);
    await applied(h, teacher, attemptOp(a.portionId, { status: 'COMPLETED', quality: 1 }));
    await applied(h, teacher, attemptOp(b.portionId, { status: 'COMPLETED', quality: 1 }));
    let d = await detail(h, teacher, a.recordId);
    expect(d.record.overallLabel).toBeNull();

    const s2 = await sabqi(teacher, 'S2', 2);
    await applied(h, teacher, attemptOp(s2.portionId, { status: 'COMPLETED' }));
    d = await detail(h, teacher, s2.recordId);
    await applied(h, teacher, labelOp(s2.recordId, d.record.rowVersion, 'NEEDS_IMPROVEMENT'));
    d = await detail(h, teacher, s2.recordId);
    expect(d.record.overallLabel).toBe('NEEDS_IMPROVEMENT');
    expect(d.portions[0].attempts[0].quality).toBeNull();
    const audits = await audit(s2.recordId);
    expect(audits.find((e) => e.action === 'DAILY_RECORD_UPDATED')?.summary).toMatchObject({ overallLabel: 'NEEDS_IMPROVEMENT', fields: ['overallLabel'] });
  });
});

describe('F07 · performance summary (US-028, US-031)', () => {
  it('F07-AC3 (US-028) counts mistakes per category over the week; other students and removed portions are excluded', async () => {
    const teacher = await h.signIn('teacher.a1');
    const d1 = await sabqi(teacher, 'S1', 1);
    const d2 = await sabqi(teacher, 'S1', 2);
    await applied(h, teacher, attemptOp(d1.portionId, { status: 'PARTIAL', mistakes: [mistake('TAJWEED', 'MAJOR'), mistake('LAFZI', 'MINOR', true)] }));
    await applied(h, teacher, attemptOp(d2.portionId, { status: 'PARTIAL', mistakes: [mistake('TAJWEED')] }));
    const other = await sabqi(teacher, 'S2', 1);
    await applied(h, teacher, attemptOp(other.portionId, { status: 'PARTIAL', mistakes: [mistake('HARKAAT')] }));
    const from = classDay(h, 8);
    const to = classDay(h, 0);
    const res = await summary(teacher, ids.students.S1, from, to);
    expect(res.statusCode, res.body).toBe(200);
    expect(res.json()).toMatchObject({
      recordCount: 2,
      attemptCount: 2,
      mistakes: { byCategory: { HARKAAT: 0, TAJWEED: 2, LAFZI: 1, AYAT_BHOOLNA: 0, TARTEEB: 0, WAQF_IBTIDA: 0 }, total: 3, major: 1, minor: 2, repeated: 1, uncategorized: 0 },
      overallLabels: { EXCELLENT: 0, GOOD: 0, AVERAGE: 0, NEEDS_IMPROVEMENT: 0, notChosen: 2 },
    });
  });

  it('F07 integration: the summary is staff-only and scoped; out of reach is 404; bad periods are refused', async () => {
    const day = classDay(h, 1);
    // Another class's Teacher, and another madrasa's Teacher, cannot read S1.
    expect((await summary(await h.signIn('teacher.a2'), ids.students.S1, day, day)).statusCode).toBe(404);
    expect((await summary(await h.signIn('teacher.b1'), ids.students.S1, day, day)).statusCode).toBe(404);
    expect((await summary(await h.signIn('teacher.a2'), ids.students.S3, day, day)).statusCode).toBe(200);
    const admin = await h.signIn('admin.a');
    expect((await summary(admin, ids.students.S1, day, day)).statusCode).toBe(200);
    expect((await summary(admin, ids.students.SB1, day, day)).statusCode).toBe(404);
    const teacher = await h.signIn('teacher.a1');
    expect((await summary(teacher, ids.students.S1, day, classDay(h, 2))).statusCode).toBe(400);
    expect((await summary(teacher, ids.students.S1, classDay(h, 80), day)).statusCode).toBe(400);
    expect((await h.call('GET', `/hifz/performance-summary?studentId=${ids.students.S1}&from=${day}`, teacher)).statusCode).toBe(400);
  });
});
