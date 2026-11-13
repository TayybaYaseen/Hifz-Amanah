// F08 · Homework and carry forward — unit (docs/specs/11-f08-homework-carry-forward.md; plan docs/handover/F08-plan.md)
import { describe, expect, it } from 'vitest';
import { PORTION_STATUSES, type PortionStatus } from '../hifz/status.ts';
import { quantity, type Quantity } from '../quantity/quantity.ts';
import type { CalendarException, ScheduleVersion } from '../calendar/schedule.ts';
import {
  HomeworkConfirmError,
  HomeworkTransitionError,
  canTransition,
  carryOver,
  confirmDraft,
  confirmIssues,
  defaultDueDate,
  dueDateIssue,
  homeworkCounts,
  homeworkPortionProgress,
  homeworkState,
  isEditable,
  isLive,
  nextClassDay,
  originAfterEdit,
  portionFromSuggestion,
  rebuildDraft,
  rejectDraft,
  remainingOf,
  reviseAssignment,
  suggest,
  suggestFor,
  type DayFacts,
  type HomeworkAssignment,
  type HomeworkPortion,
  type SourceAttempt,
  type SourcePortion,
} from './index.ts';

const para = (n: number, d = 1): Quantity => quantity('PARA', n, d);
const lines = (n: number): Quantity => quantity('LINES', n, 1);

let n = 0;
const id = (prefix: string) => `${prefix}-${++n}`;

function attempt(status: PortionStatus, completed: Quantity | null, attemptNo = 1, rowVersion = 1): SourceAttempt {
  return { id: id('att'), attemptNo, status, completed, rowVersion };
}

function portion(p: Partial<SourcePortion> & { attempts: SourceAttempt[] }): SourcePortion {
  return {
    id: id('lp'),
    section: 'SABQI',
    position: 1,
    isExtra: false,
    removed: false,
    paraNumber: 3,
    range: null,
    totalLines: null,
    assigned: para(3, 4),
    homeworkPortionId: null,
    rowVersion: 1,
    ...p,
  };
}

const AL_BAQARAH_1_10 = { surahStart: 2, ayahStart: 1, surahEnd: 2, ayahEnd: 10 };
const sabaq = (attempts: SourceAttempt[], assigned = lines(10)) =>
  portion({ section: 'SABAQ', paraNumber: 1, range: AL_BAQARAH_1_10, totalLines: 10, lineCountEdition: 'INDOPAK_16_LINE', assigned, attempts });

function draft(portions: HomeworkPortion[], over: Partial<HomeworkAssignment> = {}): HomeworkAssignment {
  return {
    id: 'hw-1',
    studentId: 'S1',
    status: 'DRAFT',
    assignedDate: '2026-11-07',
    dueDate: '2026-11-09',
    instructions: null,
    createdBy: 'teacher.a1',
    confirmedBy: null,
    confirmedAt: null,
    revisionOf: null,
    portions,
    ...over,
  };
}

const hp = (over: Partial<HomeworkPortion> = {}): HomeworkPortion => ({
  id: id('hp'),
  section: 'SABQI',
  position: 1,
  paraNumber: 3,
  range: null,
  totalLines: null,
  assigned: para(1, 4),
  needsReview: false,
  origin: 'SUGGESTED',
  sourceAttemptId: null,
  sourceLessonPortionId: null,
  sourceHomeworkPortionId: null,
  instructions: null,
  removed: false,
  ...over,
});

describe('F08 · suggest() eligibility', () => {
  it('F08-AC5 (US-035) PARTIAL with remaining > 0 is suggested with its remaining quantity and source attempt (AC-HW-01, AC-HW-08)', () => {
    const a = attempt('PARTIAL', para(1, 2), 1, 4);
    const p = portion({ attempts: [a], homeworkPortionId: 'hp-prev', rowVersion: 2 });
    const [s] = suggest({ portions: [p] });
    expect(s).toMatchObject({
      sourceAttemptId: a.id,
      sourceLessonPortionId: p.id,
      sourceHomeworkPortionId: 'hp-prev',
      section: 'SABQI',
      paraNumber: 3,
      assigned: para(1, 4),
      needsReview: false,
      position: 1,
      sourceVersions: { lessonPortion: 2, attempt: 4 },
      why: { status: 'PARTIAL', reason: 'REMAINING' },
    });
  });

  it('F08-AC5 (US-035) NOT_REMEMBERED with remaining > 0 is suggested with its remaining quantity and source attempt', () => {
    const a = attempt('NOT_REMEMBERED', para(0));
    const [s] = suggest({ portions: [portion({ assigned: para(1, 2), attempts: [a] })] });
    expect(s).toMatchObject({ sourceAttemptId: a.id, assigned: para(1, 2), needsReview: false });
  });

  it('F08-AC6 (US-035) ABSENT, NOT_ASSIGNED, PENDING, and COMPLETED are not suggested (AC-HW-09)', () => {
    const excluded: PortionStatus[] = ['ABSENT', 'NOT_ASSIGNED', 'PENDING', 'COMPLETED'];
    const portions = excluded.map((status, i) => portion({ position: i + 1, attempts: [attempt(status, status === 'COMPLETED' ? para(3, 4) : null)] }));
    expect(suggest({ portions })).toEqual([]);
    // Exactly PARTIAL and NOT_REMEMBERED carry forward, from the full status list.
    expect(PORTION_STATUSES.filter((s) => suggestFor(portion({ attempts: [attempt(s, para(0))] })) !== null)).toEqual(['PARTIAL', 'NOT_REMEMBERED']);
  });

  it('F08 unit: eligibility uses only the latest attempt per portion', () => {
    const first = attempt('PARTIAL', para(1, 4), 1);
    const second = attempt('COMPLETED', para(3, 4), 2);
    // An earlier partial attempt does not add a suggestion once the latest is completed.
    expect(suggest({ portions: [portion({ attempts: [second, first] })] })).toEqual([]);
    // A later partial attempt decides, and the assigned quantity is counted once.
    const third = attempt('PARTIAL', para(1, 2), 3);
    const s = suggest({ portions: [portion({ attempts: [first, second, third] })] });
    expect(s).toHaveLength(1);
    expect(s[0]).toMatchObject({ sourceAttemptId: third.id, assigned: para(1, 4) });
  });

  it('F08 unit: a portion with no attempt, a removed portion, an Extra portion, and a fully recited one are not suggested', () => {
    expect(suggest({ portions: [portion({ attempts: [] })] })).toEqual([]);
    expect(suggest({ portions: [portion({ removed: true, attempts: [attempt('PARTIAL', para(1, 4))] })] })).toEqual([]);
    expect(suggest({ portions: [portion({ isExtra: true, attempts: [attempt('PARTIAL', para(1, 4))] })] })).toEqual([]);
    // PARTIAL with completed = assigned leaves no remaining.
    expect(suggest({ portions: [portion({ attempts: [attempt('PARTIAL', para(3, 4))] })] })).toEqual([]);
  });

  it('F08 unit: an attempt already carried forward by another live assignment is not suggested twice', () => {
    const a = attempt('PARTIAL', para(1, 4));
    expect(suggest({ portions: [portion({ attempts: [a] })], alreadyCarried: new Set([a.id]) })).toEqual([]);
  });

  it('F08 unit: suggestions are in Sabaq, Sabqi, Manzil order and numbered within each section', () => {
    const portions = [
      portion({ section: 'MANZIL', position: 2, paraNumber: 2, attempts: [attempt('NOT_REMEMBERED', para(0))] }),
      portion({ section: 'SABQI', position: 2, paraNumber: 4, attempts: [attempt('PARTIAL', para(1, 4))] }),
      portion({ section: 'SABQI', position: 1, paraNumber: 3, attempts: [attempt('PARTIAL', para(1, 4))] }),
      sabaq([attempt('PARTIAL', lines(6))]),
    ];
    expect(suggest({ portions }).map((s) => [s.section, s.position, s.paraNumber])).toEqual([
      ['SABAQ', 1, 1],
      ['SABQI', 1, 3],
      ['SABQI', 2, 4],
      ['MANZIL', 1, 2],
    ]);
  });
});

describe('F08 · Sabaq carry-forward (2026-11-01)', () => {
  it('F08-AC22 (US-035) a partial Sabaq keeps its Surah, Ayat range, and Total Lines, and suggests the remaining lines (AC-HW-10)', () => {
    const a = attempt('PARTIAL', lines(6));
    const p = sabaq([a]);
    const [s] = suggest({ portions: [p] });
    expect(s).toMatchObject({
      section: 'SABAQ',
      range: AL_BAQARAH_1_10,
      totalLines: 10,
      lineCountEdition: 'INDOPAK_16_LINE',
      paraNumber: 1,
      assigned: lines(4),
      needsReview: false,
      sourceAttemptId: a.id,
      sourceLessonPortionId: p.id,
    });
    // The suggestion is a copy: the source range is never shared.
    expect(s!.range).not.toBe(p.range);
  });

  it('F08-AC22 (US-035) Sabqi and Manzil suggestions keep their Para and unit unchanged', () => {
    const range = { surahStart: 3, ayahStart: 1, surahEnd: 3, ayahEnd: 20 };
    const out = suggest({
      portions: [
        portion({ section: 'SABQI', paraNumber: 3, range, assigned: para(3, 4), attempts: [attempt('PARTIAL', para(1, 2))] }),
        portion({ section: 'MANZIL', paraNumber: 7, assigned: quantity('PAGES', 5), attempts: [attempt('PARTIAL', quantity('PAGES', 2))] }),
      ],
    });
    expect(out.map((s) => ({ section: s.section, para: s.paraNumber, range: s.range, assigned: s.assigned, totalLines: s.totalLines }))).toEqual([
      { section: 'SABQI', para: 3, range, assigned: para(1, 4), totalLines: null },
      { section: 'MANZIL', para: 7, range: null, assigned: quantity('PAGES', 3), totalLines: null },
    ]);
  });
});

describe('F08 · remaining', () => {
  it('F08-AC3 (US-034) 3/4 Para assigned, 1/2 completed → 1/4 Para', () => {
    expect(remainingOf(para(3, 4), para(1, 2))).toEqual({ kind: 'REMAINING', quantity: para(1, 4) });
    expect(suggest({ portions: [portion({ assigned: para(3, 4), attempts: [attempt('PARTIAL', para(1, 2))] })] })[0]!.assigned).toEqual(para(1, 4));
  });

  it('F08-AC4 (US-034) different units → no remaining, portion flagged for review', () => {
    expect(remainingOf(para(1, 2), lines(6))).toEqual({ kind: 'UNIT_MISMATCH' });
    const [s] = suggest({ portions: [portion({ assigned: para(1, 2), attempts: [attempt('PARTIAL', lines(6))] })] });
    expect(s).toMatchObject({ assigned: null, needsReview: true, why: { reason: 'UNIT_MISMATCH' } });
  });

  it('F08 unit: a PARTIAL attempt without a completed amount gives an unknown remaining, never "all of it"', () => {
    expect(remainingOf(para(1), null)).toEqual({ kind: 'UNKNOWN' });
    const [s] = suggest({ portions: [portion({ assigned: para(1), attempts: [attempt('PARTIAL', null)] })] });
    expect(s).toMatchObject({ assigned: null, needsReview: true, why: { reason: 'UNKNOWN', completed: null } });
  });
});

describe('F08 · draft lifecycle', () => {
  it('F08-AC8 (US-036) each draft portion records whether it was suggested, edited, or added (AC-HW-02)', () => {
    const suggested = hp({ origin: 'SUGGESTED', assigned: para(1, 4) });
    expect(originAfterEdit(suggested, { assigned: para(1, 2) })).toBe('TEACHER_EDITED');
    expect(originAfterEdit(suggested, { assigned: para(1, 4) })).toBe('SUGGESTED');
    expect(originAfterEdit(hp({ origin: 'TEACHER_ADDED' }), { assigned: para(1) })).toBe('TEACHER_ADDED');
    const s = suggest({ portions: [portion({ attempts: [attempt('PARTIAL', para(1, 2))] })] })[0]!;
    expect(portionFromSuggestion(s, 'hp-x')).toMatchObject({ id: 'hp-x', origin: 'SUGGESTED', sourceAttemptId: s.sourceAttemptId, removed: false, instructions: null });
  });

  it('F08-AC9 (US-036) a rejected draft has status REJECTED and is not counted as homework', () => {
    const rejected = rejectDraft(draft([hp()]));
    expect(rejected.status).toBe('REJECTED');
    expect(isLive(rejected.status)).toBe(false);
    expect(homeworkCounts([{ status: rejected.status, state: 'REJECTED', portions: [] }])).toEqual({ draft: 0, confirmed: 0, attemptedPortions: 0, completedPortions: 0, carriedOver: 0 });
    expect(() => rejectDraft(rejected)).toThrow(HomeworkTransitionError);
  });

  it('F08-AC10 (US-037) confirming records the confirming Teacher and time (AC-HW-04)', () => {
    const d = draft([hp()]);
    const c = confirmDraft(d, { userId: 'teacher.a1', at: '2026-11-07T10:00:00.000Z' });
    expect(c).toMatchObject({ status: 'CONFIRMED', confirmedBy: 'teacher.a1', confirmedAt: '2026-11-07T10:00:00.000Z' });
    expect(d.status).toBe('DRAFT');
    expect(isEditable(c.status)).toBe(false);
    expect(() => confirmDraft(c, { userId: 'teacher.a1', at: '2026-11-07T10:00:00.000Z' })).toThrow(HomeworkTransitionError);
  });

  it('F08-AC11 (US-037) a draft is never confirmed automatically (AC-HW-03)', () => {
    // The only way to CONFIRMED is the explicit confirmDraft call; nothing derives it from time or the schedule.
    const d = draft([hp()]);
    expect(homeworkState(d, [], carryOver(d.dueDate, '2026-12-31', () => ({ kind: 'SCHEDULED', attendance: 'PRESENT' })), '2026-12-31')).toBe('DRAFT');
    expect(rebuildDraft(d, [], new Set(), () => 'x').assignment.status).toBe('DRAFT');
    expect(canTransition('DRAFT', 'SUPERSEDED')).toBe(false);
  });

  it('F08 unit: a draft that cannot be fully confirmed confirms nothing (F08-AC12)', () => {
    const needsReview = hp({ assigned: null, needsReview: true });
    const d = draft([hp(), needsReview]);
    expect(() => confirmDraft(d, { userId: 't', at: 'now' })).toThrow(HomeworkConfirmError);
    expect(confirmIssues(d.portions)).toEqual([{ portionId: needsReview.id, field: 'assigned', code: 'REQUIRED' }]);
    expect(confirmIssues([hp({ removed: true })])).toEqual([{ portionId: null, field: 'portions', code: 'REQUIRED' }]);
    expect(confirmIssues(Array.from({ length: 31 }, () => hp()))).toEqual([{ portionId: null, field: 'portions', code: 'TOO_MANY' }]);
    // The F05 section rules apply: a Para preset on Sabaq is refused.
    const badSabaq = hp({ section: 'SABAQ', range: AL_BAQARAH_1_10, totalLines: 10, assigned: para(1, 2) });
    expect(confirmIssues([badSabaq]).map((i) => [i.field, i.code])).toContainEqual(['unit', 'UNIT_NOT_ALLOWED']);
  });
});

describe('F08 · recalculation and revision', () => {
  it('F08-AC14 (US-038) correcting a source attempt rebuilds drafts and leaves confirmed homework unchanged (AC-HW-06, AC-HW-07)', () => {
    const corrected = attempt('PARTIAL', para(1, 4), 1, 2);
    const lp = portion({ assigned: para(3, 4), attempts: [corrected] });
    const before = hp({ sourceLessonPortionId: lp.id, sourceAttemptId: corrected.id, assigned: para(1, 4), instructions: 'Revise twice' });
    const suggestions = suggest({ portions: [lp] });
    const rebuilt = rebuildDraft(draft([before]), suggestions, new Set([lp.id]), () => 'new');
    expect(rebuilt.changed).toBe(true);
    expect(rebuilt.assignment.portions[0]).toMatchObject({ id: before.id, assigned: para(1, 2), instructions: 'Revise twice', origin: 'SUGGESTED' });

    const confirmed = draft([before], { status: 'CONFIRMED', confirmedBy: 't', confirmedAt: 'then' });
    const kept = rebuildDraft(confirmed, suggestions, new Set([lp.id]), () => 'new');
    expect(kept).toEqual({ assignment: confirmed, changed: false });
    expect(kept.assignment.portions[0]!.assigned).toEqual(para(1, 4));
  });

  it('F08 unit: a rebuild removes no-longer-eligible suggestions, adds newly eligible ones, and keeps the Teacher\'s portions', () => {
    const now = portion({ attempts: [attempt('COMPLETED', para(3, 4))] });
    const newly = portion({ section: 'MANZIL', paraNumber: 9, attempts: [attempt('NOT_REMEMBERED', para(0))] });
    const removedByTeacher = portion({ section: 'MANZIL', paraNumber: 8, attempts: [attempt('PARTIAL', para(1, 4))] });
    const edited = portion({ section: 'SABQI', paraNumber: 5, attempts: [attempt('PARTIAL', para(1, 4))] });
    const d = draft([
      hp({ sourceLessonPortionId: now.id, position: 1 }),
      hp({ origin: 'TEACHER_EDITED', sourceLessonPortionId: edited.id, assigned: para(1), position: 2 }),
      hp({ section: 'MANZIL', sourceLessonPortionId: removedByTeacher.id, removed: true }),
      hp({ origin: 'TEACHER_ADDED', section: 'MANZIL', paraNumber: 1, position: 1 }),
    ]);
    const scope = new Set([now.id, newly.id, removedByTeacher.id, edited.id]);
    const { assignment, changed } = rebuildDraft(d, suggest({ portions: [now, newly, removedByTeacher, edited] }), scope, () => 'hp-new');
    expect(changed).toBe(true);
    expect(assignment.portions.map((p) => [p.origin, p.removed, p.section, p.position])).toEqual([
      ['SUGGESTED', true, 'SABQI', 1],
      ['TEACHER_EDITED', false, 'SABQI', 2],
      ['SUGGESTED', true, 'MANZIL', 1],
      ['TEACHER_ADDED', false, 'MANZIL', 1],
      ['SUGGESTED', false, 'MANZIL', 2],
    ]);
    expect(assignment.portions[1]!.assigned).toEqual(para(1));
    expect(assignment.portions[4]).toMatchObject({ id: 'hp-new', paraNumber: 9, sourceLessonPortionId: newly.id });
    // Out of scope and unchanged → nothing to write.
    expect(rebuildDraft(d, [], new Set(), () => 'x').changed).toBe(false);
  });

  it('F08-AC15 (US-038) an Admin revision creates a linked new assignment and marks the old one SUPERSEDED', () => {
    const old = draft([hp()], { status: 'CONFIRMED', confirmedBy: 'teacher.a1', confirmedAt: 'then' });
    const { superseded, created } = reviseAssignment(
      old,
      { id: 'hw-2', assignedDate: old.assignedDate, dueDate: '2026-11-10', instructions: 'Revised', portions: [hp({ assigned: para(1, 2) })] },
      { userId: 'admin.a', at: 'now' },
    );
    expect(superseded).toMatchObject({ id: old.id, status: 'SUPERSEDED', confirmedBy: 'teacher.a1', portions: old.portions });
    expect(created).toMatchObject({ id: 'hw-2', status: 'CONFIRMED', revisionOf: old.id, confirmedBy: 'admin.a', createdBy: 'admin.a', studentId: old.studentId });
    expect(old.status).toBe('CONFIRMED');
    expect(() => reviseAssignment(draft([hp()]), { id: 'x', assignedDate: 'a', dueDate: 'b', instructions: null, portions: [hp()] }, { userId: 'a', at: 'n' })).toThrow(HomeworkTransitionError);
  });

  it('F08-AC13 (US-038) a new assignment never modifies an earlier confirmed one (AC-HW-05)', () => {
    const first = confirmDraft(draft([hp()], { id: 'hw-1' }), { userId: 't', at: '1' });
    const snapshot = JSON.stringify(first);
    const second = confirmDraft(draft([hp({ assigned: para(1, 2) })], { id: 'hw-2' }), { userId: 't', at: '2' });
    rebuildDraft(first, suggest({ portions: [portion({ attempts: [attempt('PARTIAL', para(0))] })] }), new Set(['any']), () => 'x');
    expect(JSON.stringify(first)).toBe(snapshot);
    expect(second.id).not.toBe(first.id);
  });
});

describe('Decision review 2026-10-30 (SRS §17)', () => {
  const MON_SAT: ScheduleVersion[] = [{ classId: 'A1', effectiveFrom: '2026-01-01', weekdays: [1, 2, 3, 4, 5, 6] }];
  const holiday = (date: string, classId: string | null = null): CalendarException => ({ id: id('ex'), classId, date, kind: 'HOLIDAY', label: 'Synthetic holiday' });

  it('F08-AC18 (US-036) the due date defaults to the next scheduled class day', () => {
    // 2026-11-07 is a Saturday; 2026-11-09 the Monday after.
    expect(defaultDueDate('A1', '2026-11-07', MON_SAT, [])).toBe('2026-11-09');
    expect(defaultDueDate('A1', '2026-11-07', MON_SAT, [holiday('2026-11-09')])).toBe('2026-11-10');
    expect(nextClassDay('A1', '2026-11-04', MON_SAT, [])).toBe('2026-11-05');
    // No schedule → no default (nothing is guessed).
    expect(nextClassDay('A1', '2026-11-07', [], [])).toBeNull();
    expect(dueDateIssue('2026-11-07', '2026-11-06')).toBe('DUE_BEFORE_ASSIGNED');
    expect(dueDateIssue('2026-11-07', '2026-11-07')).toBeNull();
    expect(() => nextClassDay('A1', 'Saturday', MON_SAT, [])).toThrow(RangeError);
  });

  it('F08-AC19 (US-038) homework missed through absence or a holiday carries over unchanged', () => {
    const days: Record<string, DayFacts> = {
      '2026-11-09': { kind: 'SCHEDULED', attendance: 'ABSENT' },
      '2026-11-10': { kind: 'HOLIDAY', attendance: null },
      '2026-11-11': { kind: 'SCHEDULED', attendance: 'PRESENT' },
    };
    const dayOf = (d: string): DayFacts => days[d] ?? { kind: 'SCHEDULED', attendance: null };
    // Absent on the due day, then a holiday: shown again on the next class day, labelled with the first reason.
    expect(carryOver('2026-11-09', '2026-11-11', dayOf)).toEqual({ effectiveDueDate: '2026-11-11', reason: 'ABSENT' });
    // Seen on the holiday itself: due on the next class day.
    expect(carryOver('2026-11-09', '2026-11-10', dayOf)).toEqual({ effectiveDueDate: '2026-11-11', reason: 'ABSENT' });
    // A due day that became a holiday.
    expect(carryOver('2026-11-10', '2026-11-12', dayOf)).toEqual({ effectiveDueDate: '2026-11-11', reason: 'HOLIDAY' });
    // Leave counts the same; attended on the due day → not carried over.
    expect(carryOver('2026-11-09', '2026-11-09', () => ({ kind: 'SCHEDULED', attendance: 'LEAVE' })).reason).toBe('LEAVE');
    expect(carryOver('2026-11-11', '2026-11-12', dayOf)).toEqual({ effectiveDueDate: '2026-11-11', reason: null });
    // Not counted as failed: the state is CARRIED_OVER, then OUTSTANDING or ATTEMPTED, never a failure.
    const confirmed = { status: 'CONFIRMED' as const };
    const notAttempted = [{ attempted: false, status: null }];
    expect(homeworkState(confirmed, notAttempted, { effectiveDueDate: '2026-11-11', reason: 'ABSENT' }, '2026-11-11')).toBe('CARRIED_OVER');
    expect(homeworkState(confirmed, [{ attempted: true, status: 'PARTIAL' as const }], { effectiveDueDate: '2026-11-11', reason: 'ABSENT' }, '2026-11-11')).toBe('ATTEMPTED');
    expect(homeworkCounts([{ status: 'CONFIRMED', state: 'CARRIED_OVER', portions: notAttempted }])).toMatchObject({ confirmed: 1, carriedOver: 1, completedPortions: 0 });
  });

  it('F08 unit: display states, next-class progress, and counts', () => {
    const c = { status: 'CONFIRMED' as const };
    const open = [{ attempted: false, status: null }];
    expect(homeworkState(c, open, { effectiveDueDate: '2026-11-12', reason: null }, '2026-11-11')).toBe('UPCOMING');
    expect(homeworkState(c, open, { effectiveDueDate: '2026-11-11', reason: null }, '2026-11-11')).toBe('DUE');
    expect(homeworkState(c, open, { effectiveDueDate: '2026-11-10', reason: null }, '2026-11-11')).toBe('OUTSTANDING');
    expect(homeworkState(c, open, null, '2026-11-11')).toBe('OUTSTANDING');
    expect(homeworkState({ status: 'SUPERSEDED' }, open, null, '2026-11-11')).toBe('SUPERSEDED');
    expect(homeworkPortionProgress([])).toEqual({ attempted: false, status: null });
    expect(
      homeworkPortionProgress([
        { attemptNo: 1, attemptedAt: '2026-11-11T09:00:00Z', status: 'PARTIAL' },
        { attemptNo: 1, attemptedAt: '2026-11-12T09:00:00Z', status: 'COMPLETED' },
      ]),
    ).toEqual({ attempted: true, status: 'COMPLETED' });
    expect(
      homeworkCounts([
        { status: 'DRAFT', state: 'DRAFT', portions: [] },
        { status: 'CONFIRMED', state: 'ATTEMPTED', portions: [{ attempted: true, status: 'COMPLETED' }, { attempted: true, status: 'PARTIAL' }] },
        { status: 'SUPERSEDED', state: 'SUPERSEDED', portions: [{ attempted: true, status: 'COMPLETED' }] },
      ]),
    ).toEqual({ draft: 1, confirmed: 1, attemptedPortions: 2, completedPortions: 1, carriedOver: 0 });
    // Past today with nothing but non-class days ahead: the next class day is where it shows.
    expect(carryOver('2026-11-15', '2026-11-11', (d) => ({ kind: d === '2026-11-15' ? 'UNSCHEDULED' : 'SCHEDULED', attendance: null }))).toEqual({ effectiveDueDate: '2026-11-16', reason: 'UNSCHEDULED' });
  });
});
