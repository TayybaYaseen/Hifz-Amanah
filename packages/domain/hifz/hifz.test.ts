// F05 · Daily Hifz entry — unit (docs/specs/09-f05-daily-hifz-entry.md)
import { describe, expect, it } from 'vitest';
import { preset, whole, quantity, type Quantity } from '../quantity/index.ts';
import {
  allowsQuality,
  checkModeSwitch,
  checkNewRecord,
  isFailure,
  modeSwitchConflicts,
  normalizeAttempt,
  portionProgress,
  sabqiDefaultPara,
  sectionSummary,
  validatePortion,
  type AttemptLike,
  type PortionDraft,
  type PortionStatus,
  type SummaryPortion,
} from './index.ts';

const lines = (n: number) => whole('LINES', n);
const sabqi = (position: number, paraNumber: number, assigned: Quantity | null): PortionDraft => ({
  section: 'SABQI',
  position,
  paraNumber,
  range: null,
  totalLines: null,
  assigned,
});
const portion = (id: string, section: SummaryPortion['section'], position: number, assigned: Quantity, extra: Partial<SummaryPortion> = {}): SummaryPortion => ({
  id,
  section,
  position,
  isExtra: false,
  paraNumber: null,
  assigned,
  removed: false,
  ...extra,
});
const attempt = (attemptNo: number, status: PortionStatus, completed: Quantity | null, quality: number | null = null): AttemptLike => ({ attemptNo, status, completed, quality });

describe('F05 · status semantics', () => {
  it('F05-AC5 (US-018) an Absent student has no failed portion and no quality for the day', () => {
    // ABSENT is never a failed recitation (AC-ATT-02) and carries no quality.
    expect(isFailure('ABSENT')).toBe(false);
    expect(allowsQuality('ABSENT')).toBe(false);
    const n = normalizeAttempt({ status: 'ABSENT', assigned: preset('HALF'), completed: null, quality: null });
    expect(n).toMatchObject({ completed: null, quality: null, issues: [] });
    // A quality on an Absent portion is refused, never stored or zeroed.
    expect(normalizeAttempt({ status: 'ABSENT', assigned: preset('HALF'), completed: null, quality: 3 }).issues).toEqual([{ field: 'quality', code: 'QUALITY_NOT_ALLOWED' }]);
    // In the day's summary the portion has no failure and no quality.
    const [, sabqiSection] = sectionSummary([{ portion: portion('p1', 'SABQI', 1, preset('HALF')), attempts: [attempt(1, 'ABSENT', null)] }]);
    const progress = sabqiSection!.portions[0]!.progress;
    expect(progress.currentStatus).toBe('ABSENT');
    expect(progress.quality).toBeNull();
    expect(progress.completed).toBeNull();
    expect(progress.remaining).toBeNull();
  });

  it('F05-AC14 (US-022) Not Remembered without a completed quantity defaults completed to 0 and remaining to assigned', () => {
    const n = normalizeAttempt({ status: 'NOT_REMEMBERED', assigned: preset('SALASAH'), completed: null, quality: null });
    expect(n.completed).toEqual(quantity('PARA', 0));
    expect(n.completedDefaulted).toBe(true);
    const p = portionProgress({ assigned: preset('SALASAH') }, [attempt(1, 'NOT_REMEMBERED', n.completed)]);
    expect(p.remaining).toEqual(preset('SALASAH'));
    // The Teacher can correct it: an entered amount is kept, not overwritten by the default.
    expect(normalizeAttempt({ status: 'NOT_REMEMBERED', assigned: preset('SALASAH'), completed: preset('RUBU'), quality: 4 })).toMatchObject({ completed: preset('RUBU'), completedDefaulted: false, issues: [] });
    // Sabaq (F05-AC22): 10 assigned lines, Not Remembered → 0 completed, 10 remaining.
    const s = normalizeAttempt({ status: 'NOT_REMEMBERED', assigned: lines(10), completed: null, quality: null });
    expect(s.completed).toEqual(lines(0));
    expect(portionProgress({ assigned: lines(10) }, [attempt(1, 'NOT_REMEMBERED', s.completed)]).remaining).toEqual(lines(10));
  });

  it('F05 unit: Not Assigned and Pending portions accept and count no quality', () => {
    for (const status of ['NOT_ASSIGNED', 'PENDING'] as const) {
      expect(allowsQuality(status)).toBe(false);
      expect(isFailure(status)).toBe(false); // AC-ATT-03
      expect(normalizeAttempt({ status, assigned: lines(5), completed: null, quality: 2 }).issues).toEqual([{ field: 'quality', code: 'QUALITY_NOT_ALLOWED' }]);
      // Missing stays missing: no completed default, no zero quality.
      expect(normalizeAttempt({ status, assigned: lines(5), completed: null, quality: null })).toMatchObject({ completed: null, quality: null, issues: [] });
    }
  });
});

describe('F05 · validation', () => {
  it('F05-AC3 (US-018) a missing required field error names the section, portion number, and field', () => {
    const p2 = sabqi(2, 4, null);
    p2.assigned = { unit: null, numerator: 1, denominator: 2 };
    const errors = validatePortion(p2, { status: 'PARTIAL', completed: null, quality: null });
    // "Sabqi · Portion 2: unit is required"
    expect(errors).toEqual([{ section: 'SABQI', portionNumber: 2, field: 'unit', code: 'REQUIRED' }]);
    // The values are reported, never cleared: the input is unchanged.
    expect(p2.assigned).toEqual({ unit: null, numerator: 1, denominator: 2 });
    // A missing status is named the same way.
    expect(validatePortion(sabqi(1, 4, preset('HALF')), { status: null, completed: null, quality: null })).toEqual([
      { section: 'SABQI', portionNumber: 1, field: 'status', code: 'REQUIRED' },
    ]);
  });
});

describe('F05 · daily-report mode', () => {
  it('F05-AC6 (US-019) SINGLE mode allows one record per student and date', () => {
    expect(checkNewRecord('SINGLE', [], null)).toEqual({ ok: true, sessionLabel: null });
    expect(checkNewRecord('SINGLE', [{ id: 'rec-1', sessionLabel: null }], null)).toEqual({ ok: false, code: 'DUPLICATE_RECORD', existingId: 'rec-1' });
    // A blank label is no label; a real label is refused in SINGLE mode.
    expect(checkNewRecord('SINGLE', [], '   ')).toEqual({ ok: true, sessionLabel: null });
    expect(checkNewRecord('SINGLE', [], 'Fajr')).toEqual({ ok: false, code: 'SESSION_LABEL_NOT_ALLOWED' });
  });

  it('F05-AC7 (US-019) MULTI_SESSION mode requires a session label and allows distinct labels on the same date', () => {
    expect(checkNewRecord('MULTI_SESSION', [], null)).toEqual({ ok: false, code: 'SESSION_LABEL_REQUIRED' });
    expect(checkNewRecord('MULTI_SESSION', [], ' ')).toEqual({ ok: false, code: 'SESSION_LABEL_REQUIRED' });
    expect(checkNewRecord('MULTI_SESSION', [], ' Fajr ')).toEqual({ ok: true, sessionLabel: 'Fajr' });
    const existing = [{ id: 'rec-1', sessionLabel: 'Fajr' }];
    expect(checkNewRecord('MULTI_SESSION', existing, 'Asr')).toEqual({ ok: true, sessionLabel: 'Asr' });
    expect(checkNewRecord('MULTI_SESSION', existing, 'FAJR')).toEqual({ ok: false, code: 'DUPLICATE_SESSION', existingId: 'rec-1' });
    expect(checkNewRecord('MULTI_SESSION', [], 'x'.repeat(41))).toEqual({ ok: false, code: 'SESSION_LABEL_TOO_LONG', max: 40 });
    expect(checkNewRecord('MULTI_SESSION', [], 'x'.repeat(40))).toMatchObject({ ok: true });
  });

  it('F05-AC8 (US-019) switching to SINGLE is blocked while any student/date has two sessions, listing the conflicts', () => {
    const records = [
      { id: 'r1', studentId: 'stu-a', reportDate: '2026-11-02', sessionLabel: 'Fajr' },
      { id: 'r2', studentId: 'stu-a', reportDate: '2026-11-02', sessionLabel: 'Asr' },
      { id: 'r3', studentId: 'stu-b', reportDate: '2026-11-02', sessionLabel: 'Fajr' },
      { id: 'r4', studentId: 'stu-a', reportDate: '2026-11-03', sessionLabel: 'Fajr' },
      { id: 'r5', studentId: 'stu-b', reportDate: '2026-11-01', sessionLabel: 'Fajr' },
      { id: 'r6', studentId: 'stu-b', reportDate: '2026-11-01', sessionLabel: 'Maghrib' },
    ];
    expect(modeSwitchConflicts(records)).toEqual([
      { studentId: 'stu-b', reportDate: '2026-11-01', recordIds: ['r5', 'r6'], sessionLabels: ['Fajr', 'Maghrib'] },
      { studentId: 'stu-a', reportDate: '2026-11-02', recordIds: ['r2', 'r1'], sessionLabels: ['Asr', 'Fajr'] },
    ]);
    expect(checkModeSwitch('SINGLE', records)).toMatchObject({ ok: false, code: 'MODE_CONFLICTS' });
    expect(checkModeSwitch('SINGLE', records.filter((r) => r.id !== 'r2' && r.id !== 'r6'))).toEqual({ ok: true });
    expect(checkModeSwitch('MULTI_SESSION', records)).toEqual({ ok: true });
  });
});

describe('F05 · portions', () => {
  it('F05-AC11 (US-021) changing one Sabqi portion never changes another', () => {
    const para3 = portion('p3', 'SABQI', 1, preset('COMPLETE'), { paraNumber: 3 });
    const para4 = portion('p4', 'SABQI', 2, preset('COMPLETE'), { paraNumber: 4 });
    const before = sectionSummary([
      { portion: para3, attempts: [attempt(1, 'COMPLETED', preset('COMPLETE'), 1)] },
      { portion: para4, attempts: [attempt(1, 'PARTIAL', preset('HALF'), 3)] },
    ])[1]!;
    expect(before.portions.map((r) => r.progress.currentStatus)).toEqual(['COMPLETED', 'PARTIAL']);
    // Para 4 gets a second attempt; Para 3's progress is identical.
    const after = sectionSummary([
      { portion: para3, attempts: [attempt(1, 'COMPLETED', preset('COMPLETE'), 1)] },
      { portion: para4, attempts: [attempt(1, 'PARTIAL', preset('HALF'), 3), attempt(2, 'NOT_REMEMBERED', quantity('PARA', 0), 5)] },
    ])[1]!;
    expect(after.portions[0]).toEqual(before.portions[0]);
    expect(after.portions[1]!.progress.currentStatus).toBe('NOT_REMEMBERED');
    // Validation of one portion never reports another's fields.
    const errors = validatePortion(sabqi(2, 4, null), { status: 'PARTIAL', completed: null, quality: null });
    expect(errors.every((e) => e.portionNumber === 2)).toBe(true);
  });

  it('F05-AC12 (US-021) a new Sabqi portion defaults to the current Sabaq Para and may be changed', () => {
    expect(sabqiDefaultPara([{ position: 1, paraNumber: 5 }])).toBe(5);
    // Two Sabaq portions (a lesson into the next Surah): the current one is the last.
    expect(sabqiDefaultPara([{ position: 2, paraNumber: 6 }, { position: 1, paraNumber: 5 }])).toBe(6);
    expect(sabqiDefaultPara([{ position: 1, paraNumber: 5 }, { position: 2, paraNumber: 6, removed: true }])).toBe(5);
    expect(sabqiDefaultPara([])).toBeNull();
    expect(sabqiDefaultPara([{ position: 1, paraNumber: null }])).toBeNull();
    // Only a default: any other Para, and several Paras, are valid.
    for (const para of [1, 5, 17, 30]) expect(validatePortion(sabqi(1, para, preset('RUBU')), { status: 'COMPLETED', completed: null, quality: null })).toEqual([]);
  });

  it('F05-AC13 (US-022) three Manzil outcomes stay separate, never collapsed into one status (AC-QTY-06)', () => {
    const summary = sectionSummary([
      { portion: portion('m1', 'MANZIL', 1, preset('COMPLETE'), { paraNumber: 1 }), attempts: [attempt(1, 'COMPLETED', preset('COMPLETE'))] },
      { portion: portion('m2', 'MANZIL', 2, preset('COMPLETE'), { paraNumber: 5 }), attempts: [attempt(1, 'PARTIAL', preset('HALF'))] },
      { portion: portion('m3', 'MANZIL', 3, preset('COMPLETE'), { paraNumber: 10 }), attempts: [attempt(1, 'NOT_REMEMBERED', quantity('PARA', 0))] },
    ]);
    const manzil = summary.find((s) => s.section === 'MANZIL')!;
    expect(manzil.portions.map((r) => [r.paraNumber, r.progress.currentStatus])).toEqual([
      [1, 'COMPLETED'],
      [5, 'PARTIAL'],
      [10, 'NOT_REMEMBERED'],
    ]);
    expect(manzil.portions.map((r) => r.progress.remaining)).toEqual([quantity('PARA', 0), preset('HALF'), preset('COMPLETE')]);
    expect(manzil.totals.assigned).toEqual([quantity('PARA', 3)]);
    expect(manzil.totals.completed).toEqual([quantity('PARA', 3, 2)]);
    expect(manzil.totals.remaining).toEqual([quantity('PARA', 3, 2)]);
  });
});

describe('F05 · attempts', () => {
  it('F05-AC15 (US-023) adding a second attempt keeps the first unchanged (AC-ATT-05)', () => {
    const first = Object.freeze(attempt(1, 'PARTIAL', lines(6), 3));
    const history: readonly AttemptLike[] = Object.freeze([first]);
    const second = attempt(2, 'COMPLETED', lines(10), 2);
    const after = [...history, second];
    expect(after[0]).toBe(first);
    expect(after[0]).toEqual({ attemptNo: 1, status: 'PARTIAL', completed: lines(6), quality: 3 });
    // Computing progress never mutates any attempt.
    portionProgress({ assigned: lines(10) }, after);
    expect(first).toEqual({ attemptNo: 1, status: 'PARTIAL', completed: lines(6), quality: 3 });
    expect(portionProgress({ assigned: lines(10) }, after).attemptCount).toBe(2);
  });

  it('F05-AC16 (US-023) the latest attempt gives the current status and the assigned quantity is counted once', () => {
    const attempts = [attempt(2, 'COMPLETED', lines(10), 2), attempt(1, 'PARTIAL', lines(6), 3)];
    const p = portionProgress({ assigned: lines(10) }, attempts);
    expect(p).toEqual({ currentStatus: 'COMPLETED', assigned: lines(10), completed: lines(10), remaining: lines(0), quality: 2, attemptCount: 2, currentAttemptNo: 2 });
    const [sabaq] = sectionSummary([{ portion: portion('s1', 'SABAQ', 1, lines(10)), attempts }]);
    expect(sabaq!.totals.assigned).toEqual([lines(10)]); // not 20
    expect(sabaq!.totals.completed).toEqual([lines(10)]); // not 16
  });
});
