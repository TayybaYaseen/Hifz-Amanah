// F05 · Daily Entry form model (US-018, US-020…022; F05-AC3, AC5, AC10, AC12, AC14, AC20…AC22; UI spec §3).
// SYNTHETIC DATA ONLY: the synthetic Quran fixture (every Surah has 20 Ayat; the layout covers Surahs 1–3).
import { describe, expect, it } from 'vitest';
import { buildSnapshot, referenceIndex, type LayoutRow } from '@hifz/domain/quran-ref';
import { syntheticLayoutV2, syntheticParas, syntheticSurahs } from '@hifz/domain/quran-ref/synthetic-fixture';
import { en } from '../../i18n/locales/en.ts';
import { ur } from '../../i18n/locales/ur.ts';
import { urLatn } from '../../i18n/locales/ur-Latn.ts';
import {
  applyUnit,
  attemptWrite,
  newPortion,
  portionIssues,
  portionWrite,
  qualityBlocked,
  remainingFor,
  sabaqDerived,
  sectionControls,
  unitChange,
  withStatus,
  type FormIssue,
  type PortionForm,
} from './form.ts';

const lines: LayoutRow[] = syntheticLayoutV2(3).map((l) => ({ page: l.page, line: l.line, surah: l.surah, lineType: l.lineType, ayahStart: l.ayahStart ?? null, ayahEnd: l.ayahEnd ?? null }));
const index = referenceIndex(
  buildSnapshot({
    edition: { code: 'INDOPAK_16_LINE', linesPerPage: 16, publisher: null, printingId: null, pageCount: null },
    layout: { importId: '01900000-0000-7000-8000-0000000000a1', verified: false, withdrawn: false },
    metadataWithdrawn: false,
    surahs: syntheticSurahs(),
    paras: syntheticParas(),
    lines,
    attribution: [],
  }),
);

const sabaq = (over: Partial<PortionForm> = {}): PortionForm => ({ ...newPortion('s1', 'SABAQ'), surah: '1', ayahStart: '1', ayahEnd: '4', ...over });
const sabqi = (over: Partial<PortionForm> = {}): PortionForm => ({ ...newPortion('q1', 'SABQI'), para: '1', ...over });

/** The message an issue renders, in a locale, the way the screen builds it (UI spec §3.7). */
function message(cat: typeof en, issue: FormIssue): string {
  const flat = (path: string): string => path.split('.').reduce<unknown>((o, k) => (o as Record<string, unknown>)[k], cat) as string;
  const fill = (text: string, params: Record<string, string | number>) => text.replace(/\{(\w+)\}/g, (_, k: string) => String(params[k]));
  const section = flat(`sections.${issue.section}`);
  const portion = fill(flat('daily.portionTitle'), { section, number: issue.portionNumber });
  return fill(flat('daily.portionError'), { portion, message: fill(flat(`daily.fieldError.${issue.messageKey}`), issue.params ?? {}) });
}

describe('F05 · Daily Entry form', () => {
  it('F05-AC20 (US-021) the Sabaq card has no unit picker and no Para presets; Sabqi and Manzil have both', () => {
    expect(sectionControls('SABAQ')).toMatchObject({ unitPicker: false, paraPresets: false, range: true, paraInput: false, totalLines: true });
    expect(sectionControls('SABQI')).toMatchObject({ unitPicker: true, paraPresets: true, range: false, paraInput: true, totalLines: false });
    expect(sectionControls('MANZIL')).toMatchObject({ unitPicker: true, paraPresets: true });
  });

  it('F05-AC10, AC21 (US-021) Sabaq derives its Para, pre-fills Total Lines from the layout, and Assigned follows it until changed', () => {
    const d = sabaqDerived(sabaq(), index);
    expect(d).toMatchObject({ state: 'CHECKED', para: 1, source: 'LAYOUT' });
    expect(Number(d.totalLinesText)).toBeGreaterThan(0);
    expect(d.assignedText).toBe(d.totalLinesText);
    // The Teacher changes Total Lines: the source becomes MANUAL and Assigned follows the new value.
    const changed = sabaqDerived(sabaq({ totalLines: '3', linesTouched: true }), index);
    expect(changed).toMatchObject({ totalLinesText: '3', assignedText: '3', source: 'MANUAL' });
    // No layout on the device: nothing is guessed.
    expect(sabaqDerived(sabaq(), null)).toMatchObject({ state: 'UNCHECKED', para: null, layoutLines: null, totalLinesText: '' });
  });

  it('F05-AC12 (US-020) a new Sabqi portion defaults to the Sabaq Para; Manzil does not', () => {
    expect(newPortion('a', 'SABQI', { sabqiPara: 5 }).para).toBe('5');
    expect(newPortion('b', 'MANZIL', { sabqiPara: 5 }).para).toBe('');
    expect(newPortion('c', 'SABQI', { sabqiPara: null }).para).toBe('');
  });

  it('F05-AC3 (US-018) a missing unit gives "Sabqi · Portion 2: unit is required" and every value is kept', () => {
    const form = sabqi({ para: '4', perf: { ...newPortion('x', 'SABQI').perf, status: 'PARTIAL', remarks: 'kept' } });
    const before = structuredClone(form);
    const issues = portionIssues(form, 2, index);
    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatchObject({ section: 'SABQI', portionNumber: 2, field: 'unit', messageKey: 'unit.REQUIRED' });
    expect(message(en, issues[0]!)).toBe('Sabqi · Portion 2: unit is required');
    expect(form).toEqual(before);
  });

  it('F05-AC3 (US-018) language switch: issues are codes, so the same issue renders in each language and the form is untouched', () => {
    const form = sabqi({ para: '4', perf: { ...newPortion('x', 'SABQI').perf, status: 'PARTIAL' } });
    const issue = portionIssues(form, 2, index)[0]!;
    expect(message(ur as typeof en, issue)).toBe('سبقی · حصہ 2: اکائی لازمی ہے');
    expect(message(urLatn as typeof en, issue)).toBe('Sabqi · Hissa 2: unit lazmi hai');
    // Nothing in the form is localized text.
    expect(JSON.stringify(form)).not.toMatch(/Sabqi|سبقی/);
  });

  it('F05-AC21 (US-021) Sabaq range errors are on the right field with the portion prefix', () => {
    const end = portionIssues(sabaq({ ayahStart: '9', ayahEnd: '3', perf: { ...newPortion('x', 'SABAQ').perf, status: 'COMPLETED' } }), 1, index);
    expect(end.find((i) => i.field === 'ayahEnd')).toMatchObject({ messageKey: 'range.END_BEFORE_START' });
    const cross = portionIssues(sabaq({ surahEnd: '2', perf: { ...newPortion('x', 'SABAQ').perf, status: 'COMPLETED' } }), 1, index);
    const crossIssue = cross.find((i) => i.field === 'surahEnd')!;
    expect(message(en, crossIssue)).toBe('Sabaq · Portion 1: the range must stay within one Surah — add another portion for the next Surah');
    const over = portionIssues(sabaq({ ayahEnd: '25', perf: { ...newPortion('x', 'SABAQ').perf, status: 'COMPLETED' } }), 1, index);
    expect(over.find((i) => i.field === 'ayahEnd')).toMatchObject({ messageKey: 'ayah.OUT_OF_RANGE', params: { max: 20 } });
  });

  it('F05-AC21 (US-021) assigned above total and completed above assigned are refused on their fields', () => {
    const issues = portionIssues(sabaq({ totalLines: '4', linesTouched: true, assignedLines: '5', assignedTouched: true, perf: { ...newPortion('x', 'SABAQ').perf, status: 'PARTIAL', completedText: '2' } }), 1, index);
    expect(issues.find((i) => i.field === 'assigned')).toMatchObject({ messageKey: 'assigned.ABOVE_TOTAL' });
    const done = portionIssues(sabaq({ totalLines: '4', linesTouched: true, perf: { ...newPortion('x', 'SABAQ').perf, status: 'PARTIAL', completedText: '6' } }), 1, index);
    expect(done.find((i) => i.field === 'completed')).toMatchObject({ messageKey: 'completedLines.ABOVE_ASSIGNED' });
  });

  it('F05-AC14, AC22 (US-022) Not Remembered with completed empty: remaining = assigned and 0 is stored, the field stays empty', () => {
    const form = withStatus(sabqi({ unit: 'HALF' }), 'NOT_REMEMBERED', index);
    expect(form.perf.completedPreset).toBeNull();
    expect(remainingFor(form, index)).toEqual({ unit: 'PARA', numerator: 1, denominator: 2 });
    expect(attemptWrite(form, index).completed).toEqual({ unit: 'PARA', numerator: 0, denominator: 1 });
    const lines = withStatus(sabaq({ totalLines: '6', linesTouched: true }), 'NOT_REMEMBERED', index);
    expect(remainingFor(lines, index)).toEqual({ unit: 'LINES', numerator: 6, denominator: 1 });
  });

  it('F05-AC5 (US-018) quality is blocked and cleared for Absent, Not Assigned, and Pending; mistakes stay', () => {
    for (const s of ['ABSENT', 'NOT_ASSIGNED', 'PENDING'] as const) expect(qualityBlocked(s)).toBe(true);
    expect(qualityBlocked('NOT_REMEMBERED')).toBe(false);
    const rated = sabqi({ unit: 'COMPLETE', perf: { ...newPortion('x', 'SABQI').perf, status: 'COMPLETED', quality: 2, mistakes: [{ key: 'm', category: 'TAJWEED', severity: 'MINOR', repeated: false }] } });
    const pending = withStatus(rated, 'PENDING', index);
    expect(pending.perf.quality).toBeNull();
    expect(pending.perf.mistakes).toHaveLength(1);
    expect(attemptWrite(pending, index)).toMatchObject({ status: 'PENDING', quality: null, completed: null });
  });

  it('F05 unit: Completed with completed empty fills the assigned amount visibly', () => {
    expect(withStatus(sabqi({ unit: 'SALASAH' }), 'COMPLETED', index).perf.completedPreset).toBe('SALASAH');
    expect(withStatus(sabqi({ unit: 'PAGES', assignedAmount: '3' }), 'COMPLETED', index).perf.completedText).toBe('3');
  });

  it('F06-AC15 (US-027) a unit change is never reinterpreted silently', () => {
    const pages = sabqi({ unit: 'PAGES', assignedAmount: '3' });
    expect(unitChange(pages, 'AYAT')).toEqual({ kind: 'ASK_KEEP_OR_CLEAR', amount: '3', from: 'PAGES', to: 'AYAT' });
    expect(applyUnit(pages, 'AYAT', true).assignedAmount).toBe('3');
    expect(applyUnit(pages, 'AYAT', false).assignedAmount).toBe('');
    expect(unitChange(pages, 'HALF')).toEqual({ kind: 'ASK_CLEAR', to: 'HALF' });
    expect(applyUnit(pages, 'HALF', true)).toMatchObject({ unit: 'HALF', assignedAmount: '' });
    expect(unitChange(sabqi(), 'LINES')).toEqual({ kind: 'APPLY' });
  });

  it('F05 unit: mistakes need a category and severity; "repeated" is a separate flag', () => {
    const form = sabqi({ unit: 'HALF', perf: { ...newPortion('x', 'SABQI').perf, status: 'PARTIAL', completedPreset: 'RUBU', mistakes: [{ key: 'm', category: 'LAFZI', severity: null, repeated: true }] } });
    const issue = portionIssues(form, 1, index).find((i) => i.field === 'mistake')!;
    expect(issue).toMatchObject({ mistake: 1, messageKey: 'mistake.severity.REQUIRED' });
    expect(message(en, issue)).toBe('Sabqi · Portion 1: mistake 1: severity is required');
  });

  it('F05 unit: the Sabaq write sends lines over one Surah and records where Total Lines came from', () => {
    const form = withStatus(sabaq(), 'COMPLETED', index);
    expect(portionIssues(form, 1, index)).toEqual([]);
    const w = portionWrite(form, 1, index);
    expect(w).toMatchObject({ section: 'SABAQ', paraNumber: 1, range: { surahStart: 1, ayahStart: 1, surahEnd: 1, ayahEnd: 4 }, totalLinesSource: 'LAYOUT' });
    expect(w.assigned.unit).toBe('LINES');
    expect(w.assigned.numerator).toBe(w.totalLines);
  });
});
