// F05 · Daily Entry form model (US-018, US-020…023; F05-AC3, AC5, AC10…AC14, AC20…AC22; UI spec §2–§3).
// Pure TypeScript: what the portion cards hold, how it becomes domain drafts, and how domain issue codes become
// per-portion messages. Every rule is @hifz/domain (validatePortion, normalizeAttempt, portionProgress, remaining,
// sabqiDefaultPara, rulesFor); this file only translates between form text and domain values (AGENTS §11).
//
// - Form state holds what the Teacher typed, never localized text, so switching language keeps every value and the
//   messages re-render in the new language (errors are stored as codes, not sentences).
// - Sabaq is measured in lines only: it has no unit control and no Para presets (F05-AC20, DEC-B60).
// - Missing data is never zero: an empty completed stays null except the domain defaults (NOT_REMEMBERED → 0,
//   COMPLETED → assigned), and quality is null until a score is chosen.
import {
  MISTAKES_MAX,
  allowsQuality,
  normalizeAttempt,
  validatePortion,
  type AttemptDraft,
  type MistakeCategory,
  type MistakeEntry,
  type MistakeSeverity,
  type PortionDraft,
  type PortionFieldError,
  type PortionIssueCode,
  type PortionStatus,
  type QuantityDraft,
  type RangeReference,
  type TotalLinesSource,
} from '@hifz/domain/hifz';
import { PARA_PRESETS, fractionText, presetOf, remaining, rulesFor, type ParaPreset, type Quantity, type QuantityUnit } from '@hifz/domain/quantity';
import { evaluateRange, lineCountSource, type ReferenceIndex } from '@hifz/domain/quran-ref';
import { checkRange } from '../quran/rangeCheck.ts';
import type { AttemptWrite, LocalAttempt, LocalPortion, PortionWrite, Section } from './local.ts';

export const SECTION_LIST: readonly Section[] = ['SABAQ', 'SABQI', 'MANZIL'];
export const sectionSlug = (s: Section): 'sabaq' | 'sabqi' | 'manzil' => s.toLowerCase() as 'sabaq' | 'sabqi' | 'manzil';

/** The assigned-unit chips of a Sabqi/Manzil card, in order: four Para presets, then Lines, Ayat, Pages. */
export const UNIT_CHOICES = ['RUBU', 'HALF', 'SALASAH', 'COMPLETE', 'LINES', 'AYAT', 'PAGES'] as const;
export type UnitChoice = (typeof UNIT_CHOICES)[number];
export const PARA_CHOICES = ['RUBU', 'HALF', 'SALASAH', 'COMPLETE'] as const satisfies readonly ParaPreset[];
type NumericUnit = 'LINES' | 'AYAT' | 'PAGES';
const isNumericUnit = (c: UnitChoice | null): c is NumericUnit => c === 'LINES' || c === 'AYAT' || c === 'PAGES';
const unitOfChoice = (c: UnitChoice): QuantityUnit => (isNumericUnit(c) ? c : 'PARA');

/** Which controls a section's card offers (rendering reads this; Sabaq: no unit picker, no presets). */
export function sectionControls(section: Section): { unitPicker: boolean; paraPresets: boolean; range: boolean; paraInput: boolean; totalLines: boolean } {
  const rules = rulesFor(section);
  return { unitPicker: rules.allowedUnits.length > 1, paraPresets: rules.offersParaPresets, range: rules.requiresRange, paraInput: rules.paraEntered, totalLines: rules.hasTotalLines };
}

export interface MistakeForm {
  key: string;
  category: MistakeCategory | null;
  severity: MistakeSeverity | null;
  repeated: boolean;
}

/** The attempt part of a card (shared with Add attempt). */
export interface PerformanceForm {
  status: PortionStatus | null;
  /** Sabaq lines, or the Sabqi/Manzil amount in Lines/Ayat/Pages. */
  completedText: string;
  /** Sabqi/Manzil with a Para unit. */
  completedPreset: ParaPreset | null;
  quality: number | null;
  noMistakes: boolean;
  mistakes: MistakeForm[];
  remarks: string;
}

export interface PortionForm {
  /** Stable key for React and for errors (the saved portion's ID, or a new local key). */
  key: string;
  /** The saved portion's ID; null for a portion added in this form. */
  savedId: string | null;
  section: Section;
  isExtra: boolean;
  // Sabaq (lines over one Surah's Ayat range)
  surah: string;
  /** Ending Surah; empty means the starting Surah (UI spec 8.1). */
  surahEnd: string;
  ayahStart: string;
  ayahEnd: string;
  totalLines: string;
  /** The Teacher typed Total Lines: the layout pre-fill no longer applies (FR-SAB-008). */
  linesTouched: boolean;
  assignedLines: string;
  /** The Teacher typed Assigned lines: it no longer follows Total Lines. */
  assignedTouched: boolean;
  /** Edit mode: the saved Total Lines and where it came from, kept while the Teacher leaves it unchanged. */
  savedLines: { text: string; source: TotalLinesSource | null } | null;
  // Sabqi / Manzil
  para: string;
  unit: UnitChoice | null;
  assignedAmount: string;
  perf: PerformanceForm;
  /** Saved attempts (edit mode); the card corrects the latest only (UI spec 8.7). */
  attemptCount: number;
  latestAttemptId: string | null;
}

export const emptyPerformance = (): PerformanceForm => ({ status: null, completedText: '', completedPreset: null, quality: null, noMistakes: false, mistakes: [], remarks: '' });

export function newPortion(key: string, section: Section, opts: { isExtra?: boolean; sabqiPara?: number | null } = {}): PortionForm {
  return {
    key,
    savedId: null,
    section,
    isExtra: opts.isExtra ?? false,
    surah: '',
    surahEnd: '',
    ayahStart: '',
    ayahEnd: '',
    totalLines: '',
    linesTouched: false,
    assignedLines: '',
    assignedTouched: false,
    savedLines: null,
    // FR-SBQ-003, F05-AC12: a Sabqi portion starts on today's Sabaq Para, a default the Teacher may change.
    para: section === 'SABQI' && opts.sabqiPara ? String(opts.sabqiPara) : '',
    unit: null,
    assignedAmount: '',
    perf: emptyPerformance(),
    attemptCount: 0,
    latestAttemptId: null,
  };
}

const textOf = (n: number | null | undefined): string => (n === null || n === undefined ? '' : String(n));

function choiceOf(q: Quantity | null): UnitChoice | null {
  if (!q) return null;
  if (q.unit === 'PARA') return presetOf(q);
  return q.unit;
}

/** Fills a card from a saved portion and its latest attempt (edit mode, UI spec §2.4). */
export function portionFromSaved(p: LocalPortion): PortionForm {
  const latest: LocalAttempt | null = p.attempts.at(-1) ?? null;
  const sabaq = p.section === 'SABAQ';
  const completed = latest?.completed ?? null;
  return {
    key: p.id,
    savedId: p.id,
    section: p.section,
    isExtra: p.isExtra,
    surah: textOf(p.range?.surahStart),
    surahEnd: p.range && p.range.surahEnd !== p.range.surahStart ? textOf(p.range.surahEnd) : '',
    ayahStart: textOf(p.range?.ayahStart),
    ayahEnd: textOf(p.range?.ayahEnd),
    totalLines: textOf(p.totalLines),
    // A saved Total Lines is what the Teacher confirmed: it is shown as saved, not re-filled from the layout.
    linesTouched: sabaq,
    assignedLines: sabaq ? textOf(p.assigned?.numerator) : '',
    assignedTouched: sabaq,
    savedLines: sabaq ? { text: textOf(p.totalLines), source: p.totalLinesSource } : null,
    para: sabaq ? '' : textOf(p.paraNumber),
    unit: sabaq ? null : choiceOf(p.assigned),
    assignedAmount: !sabaq && p.assigned && p.assigned.unit !== 'PARA' ? String(p.assigned.numerator) : '',
    perf: {
      status: latest?.status ?? null,
      completedText: completed && completed.unit !== 'PARA' ? String(completed.numerator) : '',
      completedPreset: completed && completed.unit === 'PARA' ? presetOf(completed) : null,
      quality: latest?.quality ?? null,
      noMistakes: latest?.noMistakes ?? false,
      mistakes: (latest?.mistakes ?? []).map((m, i) => ({ key: `${p.id}-m${i}`, ...m })),
      remarks: latest?.remarks ?? '',
    },
    attemptCount: p.attempts.length,
    latestAttemptId: latest?.id ?? null,
  };
}

// ---------- Text → numbers ----------

/** '' → null; ASCII digits → a number; anything else → 'BAD' (reported as NOT_WHOLE, value kept). */
export function parseNumber(text: string): number | null | 'BAD' {
  const t = text.trim();
  if (t === '') return null;
  return /^\d{1,6}$/.test(t) ? Number(t) : 'BAD';
}
const valueOf = (text: string): number | null => {
  const n = parseNumber(text);
  return n === 'BAD' ? null : n;
};

// ---------- Sabaq derived values (F06 reference, offline) ----------

export interface SabaqDerived {
  /** INCOMPLETE: fields still empty; UNCHECKED: no reference on the device (the server checks on sync). */
  state: 'INCOMPLETE' | 'UNCHECKED' | 'CHECKED';
  /** The derived Para, or null (never guessed). */
  para: number | null;
  /** The layout's line count for the range, or null. */
  layoutLines: number | null;
  /** What Total Lines shows: the Teacher's text once touched, else the pre-fill. */
  totalLinesText: string;
  /** What Assigned lines shows: the Teacher's text once touched, else Total Lines (F05-AC21). */
  assignedText: string;
  /** LAYOUT while the pre-fill is untouched; MANUAL once changed or with no layout; null while empty. */
  source: TotalLinesSource | null;
}

export function sabaqDerived(
  form: Pick<PortionForm, 'surah' | 'surahEnd' | 'ayahStart' | 'ayahEnd' | 'totalLines' | 'linesTouched' | 'assignedLines' | 'assignedTouched'> & { savedLines?: PortionForm['savedLines'] },
  index: ReferenceIndex | null,
): SabaqDerived {
  const crosses = form.surahEnd.trim() !== '' && form.surahEnd.trim() !== form.surah.trim();
  const check = checkRange({ surah: form.surah, ayahStart: form.ayahStart, ayahEnd: form.ayahEnd }, index);
  const ok = !crosses && check.state === 'CHECKED' && check.evaluation.issues.length === 0;
  const layoutLines = ok && check.state === 'CHECKED' ? check.evaluation.totalLines : null;
  const totalLinesText = form.linesTouched || layoutLines === null ? form.totalLines : String(layoutLines);
  const assignedText = form.assignedTouched ? form.assignedLines : totalLinesText;
  const total = valueOf(totalLinesText);
  return {
    state: check.state,
    para: ok && check.state === 'CHECKED' ? check.evaluation.para : null,
    layoutLines,
    totalLinesText,
    assignedText,
    source:
      total === null
        ? null
        : form.savedLines && form.savedLines.text === totalLinesText.trim() && form.savedLines.source
          ? form.savedLines.source
          : lineCountSource(form.linesTouched ? null : layoutLines, total),
  };
}

// ---------- Form → domain drafts ----------

export interface PortionValues {
  portion: PortionDraft;
  attempt: AttemptDraft;
  /** Fields whose text is not a whole number: reported as NOT_WHOLE, the value is kept in the form. */
  badText: Array<{ field: UiField; code: PortionIssueCode }>;
  /** Mistake rows missing category or severity (1-based). */
  incompleteMistakes: Array<{ index: number; missing: 'category' | 'severity' }>;
  derived: SabaqDerived | null;
}

function completedOf(form: PortionForm, assignedUnit: QuantityUnit | null): Quantity | null {
  if (form.section === 'SABAQ') {
    const n = valueOf(form.perf.completedText);
    return n === null ? null : { unit: 'LINES', numerator: n, denominator: 1 };
  }
  if (form.unit === null) return null;
  if (!isNumericUnit(form.unit)) {
    const p = form.perf.completedPreset;
    return p ? { unit: 'PARA', numerator: PARA_PRESETS[p].numerator, denominator: PARA_PRESETS[p].denominator } : null;
  }
  const n = valueOf(form.perf.completedText);
  return n === null || assignedUnit === null ? null : { unit: assignedUnit, numerator: n, denominator: 1 };
}

export function portionValues(form: PortionForm, position: number, index: ReferenceIndex | null): PortionValues {
  const badText: PortionValues['badText'] = [];
  const bad = (field: UiField, text: string) => {
    if (parseNumber(text) === 'BAD') badText.push({ field, code: 'NOT_WHOLE' });
  };
  let portion: PortionDraft;
  let derived: SabaqDerived | null = null;
  if (form.section === 'SABAQ') {
    derived = sabaqDerived(form, index);
    for (const [field, text] of [['surah', form.surah], ['surahEnd', form.surahEnd], ['ayahStart', form.ayahStart], ['ayahEnd', form.ayahEnd], ['totalLines', derived.totalLinesText], ['assigned', derived.assignedText], ['completed', form.perf.completedText]] as const) bad(field, text);
    const surahStart = valueOf(form.surah);
    portion = {
      section: 'SABAQ',
      position,
      isExtra: form.isExtra,
      paraNumber: null,
      range: { surahStart, ayahStart: valueOf(form.ayahStart), surahEnd: form.surahEnd.trim() === '' ? surahStart : valueOf(form.surahEnd), ayahEnd: valueOf(form.ayahEnd) },
      totalLines: valueOf(derived.totalLinesText),
      assigned: { unit: 'LINES', numerator: valueOf(derived.assignedText), denominator: 1 },
    };
  } else {
    bad('para', form.para);
    if (isNumericUnit(form.unit)) {
      bad('assignedAmount', form.assignedAmount);
      bad('completedAmount', form.perf.completedText);
    }
    let assigned: QuantityDraft;
    if (form.unit === null) assigned = { unit: null, numerator: null };
    else if (isNumericUnit(form.unit)) assigned = { unit: form.unit, numerator: valueOf(form.assignedAmount), denominator: 1 };
    else assigned = { unit: 'PARA', numerator: PARA_PRESETS[form.unit].numerator, denominator: PARA_PRESETS[form.unit].denominator };
    portion = { section: form.section, position, isExtra: form.isExtra, paraNumber: valueOf(form.para), range: null, totalLines: null, assigned };
  }
  const assignedUnit = form.section === 'SABAQ' ? 'LINES' : form.unit === null ? null : unitOfChoice(form.unit);
  const complete: MistakeEntry[] = [];
  const incompleteMistakes: PortionValues['incompleteMistakes'] = [];
  form.perf.mistakes.forEach((m, i) => {
    if (m.category === null) incompleteMistakes.push({ index: i + 1, missing: 'category' });
    else if (m.severity === null) incompleteMistakes.push({ index: i + 1, missing: 'severity' });
    else complete.push({ category: m.category, severity: m.severity, repeated: m.repeated });
  });
  const attempt: AttemptDraft = {
    status: form.perf.status,
    completed: completedOf(form, assignedUnit),
    quality: form.perf.quality,
    noMistakes: form.perf.noMistakes,
    mistakes: complete,
    remarks: form.perf.remarks.trim() === '' ? null : form.perf.remarks,
  };
  return { portion, attempt, badText, incompleteMistakes, derived };
}

// ---------- Issues: domain codes → UI field and message ----------

/** The control an issue is shown on (its testID suffix). */
export type UiField =
  | 'para'
  | 'surah'
  | 'surahEnd'
  | 'ayahStart'
  | 'ayahEnd'
  | 'totalLines'
  | 'unit'
  | 'assigned'
  | 'assignedAmount'
  | 'status'
  | 'completed'
  | 'completedAmount'
  | 'quality'
  | 'mistakes'
  | 'mistake'
  | 'remarks';

export interface FormIssue {
  portionKey: string;
  section: Section;
  /** Displayed portion number (1-based, non-removed portions in order). */
  portionNumber: number;
  field: UiField;
  /** i18n key under `daily.fieldError.` (e.g. `unit.REQUIRED`). */
  messageKey: string;
  params?: Record<string, number>;
  /** Mistake row (1-based) for `field: 'mistake'`. */
  mistake?: number;
}

const KNOWN_MESSAGES = new Set([
  'unit.REQUIRED',
  'amount.REQUIRED',
  'para.REQUIRED',
  'para.OUT_OF_RANGE',
  'status.REQUIRED',
  'surah.REQUIRED',
  'surah.UNKNOWN',
  'surah.OUT_OF_RANGE',
  'ayahStart.REQUIRED',
  'ayahEnd.REQUIRED',
  'ayah.OUT_OF_RANGE',
  'ayah.NOT_POSITIVE',
  'range.END_BEFORE_START',
  'range.CROSSES_SURAH',
  'range.PARA_UNKNOWN',
  'range.METADATA_UNAVAILABLE',
  'totalLines.REQUIRED',
  'lines.NOT_WHOLE',
  'amount.NOT_WHOLE',
  'amount.NOT_POSITIVE',
  'amount.NOT_A_PRESET',
  'assigned.ABOVE_TOTAL',
  'completedLines.ABOVE_ASSIGNED',
  'completed.ABOVE_ASSIGNED',
  'completed.UNIT_MISMATCH',
  'sabaq.UNIT_NOT_ALLOWED',
  'quality.QUALITY_NOT_ALLOWED',
  'mistake.category.REQUIRED',
  'mistake.severity.REQUIRED',
  'mistakes.TOO_MANY',
  'remarks.TOO_LONG',
]);

/** Maps one domain issue (or a server field issue) to the control and message (UI spec §3.7, §7.3). */
export function uiIssue(section: Section, unit: UnitChoice | null, e: { field: string; code: string; max?: number }): { field: UiField; messageKey: string; params?: Record<string, number> } {
  const sabaq = section === 'SABAQ';
  const paraUnit = !sabaq && unit !== null && !isNumericUnit(unit);
  const max = e.max !== undefined ? { max: e.max } : undefined;
  const pick = (field: UiField, key: string, params?: Record<string, number>) => ({ field, messageKey: KNOWN_MESSAGES.has(key) ? key : 'generic', ...(params ? { params } : {}) });
  switch (e.field) {
    case 'paraNumber':
    case 'para':
      return pick(sabaq ? 'ayahEnd' : 'para', e.code === 'REQUIRED' ? 'para.REQUIRED' : e.code === 'NOT_WHOLE' ? 'amount.NOT_WHOLE' : 'para.OUT_OF_RANGE');
    case 'surah':
    case 'surahStart':
      return pick('surah', e.code === 'NOT_WHOLE' ? 'amount.NOT_WHOLE' : e.code === 'UNKNOWN_SURAH' ? 'surah.UNKNOWN' : `surah.${e.code}`);
    case 'surahEnd':
      return pick('surahEnd', e.code === 'NOT_WHOLE' ? 'amount.NOT_WHOLE' : e.code === 'CROSSES_SURAH' ? 'range.CROSSES_SURAH' : `surah.${e.code}`);
    case 'ayahStart':
    case 'ayahEnd': {
      const field = e.field;
      if (e.code === 'REQUIRED') return pick(field, `${field}.REQUIRED`);
      if (e.code === 'NOT_WHOLE') return pick(field, 'amount.NOT_WHOLE');
      if (e.code === 'OUT_OF_RANGE') return max ? pick(field, 'ayah.OUT_OF_RANGE', max) : pick(field, 'ayah.NOT_POSITIVE');
      if (e.code === 'END_BEFORE_START') return pick('ayahEnd', 'range.END_BEFORE_START');
      return pick(field, `range.${e.code}`);
    }
    case 'range':
      if (e.code === 'CROSSES_SURAH') return pick('surahEnd', 'range.CROSSES_SURAH');
      return pick('ayahEnd', `range.${e.code}`);
    case 'totalLines':
    case 'totalLinesSource':
      return pick('totalLines', e.code === 'REQUIRED' ? 'totalLines.REQUIRED' : e.code === 'NOT_WHOLE' ? 'lines.NOT_WHOLE' : `amount.${e.code}`);
    case 'unit':
      return pick(sabaq ? 'assigned' : 'unit', e.code === 'UNIT_NOT_ALLOWED' ? 'sabaq.UNIT_NOT_ALLOWED' : 'unit.REQUIRED');
    case 'assigned':
    case 'assignedAmount': {
      const field: UiField = sabaq ? 'assigned' : paraUnit || unit === null ? 'unit' : 'assignedAmount';
      if (e.code === 'ABOVE_TOTAL') return pick(field, 'assigned.ABOVE_TOTAL');
      if (e.code === 'UNIT_NOT_ALLOWED') return pick(field, 'sabaq.UNIT_NOT_ALLOWED');
      if (e.code === 'NOT_WHOLE') return pick(field, sabaq ? 'lines.NOT_WHOLE' : 'amount.NOT_WHOLE');
      return pick(field, `amount.${e.code}`);
    }
    case 'status':
      return pick('status', 'status.REQUIRED');
    case 'completed':
    case 'completedAmount': {
      const field: UiField = sabaq ? 'completed' : paraUnit ? 'completed' : 'completedAmount';
      if (e.code === 'ABOVE_ASSIGNED') return pick(field, sabaq ? 'completedLines.ABOVE_ASSIGNED' : 'completed.ABOVE_ASSIGNED');
      if (e.code === 'NOT_WHOLE') return pick(field, sabaq ? 'lines.NOT_WHOLE' : 'amount.NOT_WHOLE');
      if (e.code === 'UNIT_MISMATCH') return pick(field, 'completed.UNIT_MISMATCH');
      if (e.code === 'UNIT_NOT_ALLOWED') return pick(field, 'sabaq.UNIT_NOT_ALLOWED');
      return pick(field, `amount.${e.code}`);
    }
    case 'quality':
      return pick('quality', `quality.${e.code}`);
    case 'mistakes':
    case 'noMistakes':
      return pick('mistakes', `mistakes.${e.code}`, e.code === 'TOO_MANY' ? { max: e.max ?? MISTAKES_MAX } : undefined);
    case 'remarks':
      return pick('remarks', `remarks.${e.code}`, max);
    default:
      return pick('status', 'generic');
  }
}

/**
 * Every issue of one card, in field order, with its section and portion number (F05-AC3). Nothing in the form is
 * changed or cleared. `sabaq.UNIT_NOT_ALLOWED` cannot arise from a card (Sabaq has no unit control); a missing unit
 * hides the "amount is required" that follows from it, so the Teacher sees one message for one missing choice.
 */
export function portionIssues(form: PortionForm, portionNumber: number, index: ReferenceIndex | null): FormIssue[] {
  const v = portionValues(form, portionNumber, index);
  const ref: RangeReference | null = index && index.surahs.length ? { surahs: index.surahs, paras: index.paras, metadataWithdrawn: index.metadataWithdrawn } : null;
  const base = { portionKey: form.key, section: form.section, portionNumber };
  const out: FormIssue[] = [];
  const seen = new Set<UiField>();
  for (const b of v.badText) {
    const u = uiIssue(form.section, form.unit, { field: b.field, code: b.code });
    out.push({ ...base, ...u });
    seen.add(u.field);
  }
  const domain: PortionFieldError[] = validatePortion(v.portion, v.attempt, ref);
  const unitMissing = domain.some((d) => d.field === 'unit' && d.code === 'REQUIRED');
  for (const d of domain) {
    if (unitMissing && d.field === 'assigned' && d.code === 'REQUIRED') continue;
    const u = uiIssue(form.section, form.unit, d);
    if (seen.has(u.field)) continue;
    out.push({ ...base, ...u });
    seen.add(u.field);
  }
  for (const m of v.incompleteMistakes) {
    out.push({ ...base, field: 'mistake', messageKey: `mistake.${m.missing}.REQUIRED`, params: { number: m.index }, mistake: m.index });
  }
  return out;
}

/** The key an issue is shown under on its card: the field, or `mistake.<m>`. */
export const issueSlot = (i: Pick<FormIssue, 'field' | 'mistake'>): string => (i.field === 'mistake' ? `mistake.${i.mistake}` : i.field);

// ---------- Display helpers (domain calculations only) ----------

/** The assigned quantity a card describes, or null while incomplete. */
export function assignedQuantity(form: PortionForm, index: ReferenceIndex | null): Quantity | null {
  const v = portionValues(form, 1, index);
  const a = v.portion.assigned;
  if (!a || a.unit === null || a.numerator === null || a.numerator <= 0) return null;
  return { unit: a.unit, numerator: a.numerator, denominator: a.denominator ?? 1 };
}

/**
 * Remaining for the card (F05-AC14, AC22): same portion, same unit, via the domain. NOT_REMEMBERED with completed
 * left empty takes the domain default 0, so remaining = assigned. Null when the inputs are incomplete.
 */
export function remainingFor(form: PortionForm, index: ReferenceIndex | null): Quantity | null {
  const assigned = assignedQuantity(form, index);
  if (!assigned) return null;
  const v = portionValues(form, 1, index);
  // Remaining is assigned − completed and shows as soon as both are known (F05-AC22, design.md §4.7). The status only
  // adds its default for an empty completed value (Not Remembered → 0, FR-QTY-007); with no status, none is assumed.
  const completed =
    form.perf.status === null
      ? v.attempt.completed
      : normalizeAttempt({ status: form.perf.status, assigned, completed: v.attempt.completed, quality: null }).completed;
  if (!completed || completed.unit !== assigned.unit) return null;
  return remaining(assigned, completed);
}

/** Quality is not entered for ABSENT, NOT_ASSIGNED, or PENDING (FR-ATT-007, F05-AC5). */
export const qualityBlocked = (status: PortionStatus | null): boolean => status !== null && !allowsQuality(status);

/** A quantity's parts for an i18n message: Para as a fraction ("1/2"), other units as a count. */
export function amountParts(q: Quantity): { key: string; params: Record<string, string | number> } {
  if (q.unit === 'PARA') return { key: 'units.amount.PARA', params: { fraction: fractionText(q) } };
  return { key: `units.amount.${q.unit}`, params: { count: q.numerator } };
}

// ---------- Status changes and unit changes (UI spec §3.1, §3.3) ----------

/**
 * Picking a status. COMPLETED with completed empty fills it with the assigned amount, visibly (plan §7.2);
 * a no-quality status clears a chosen score (it is never stored, F05-AC5). Mistakes stay (UI spec 8.10).
 */
export function withStatus(form: PortionForm, status: PortionStatus, index: ReferenceIndex | null): PortionForm {
  const perf = { ...form.perf, status };
  if (!allowsQuality(status)) perf.quality = null;
  if (status === 'COMPLETED') {
    const assigned = assignedQuantity(form, index);
    if (assigned) {
      if (assigned.unit === 'PARA' && perf.completedPreset === null) perf.completedPreset = presetOf(assigned);
      if (assigned.unit !== 'PARA' && perf.completedText.trim() === '') perf.completedText = String(assigned.numerator);
    }
  }
  return { ...form, perf };
}

export type UnitChange =
  | { kind: 'APPLY' }
  /** Numeric → numeric with an amount: keep the number in the new unit, or clear it (nothing is converted). */
  | { kind: 'ASK_KEEP_OR_CLEAR'; amount: string; from: NumericUnit; to: NumericUnit }
  /** PARA ↔ numeric with amounts entered: the amounts are cleared on confirmation. */
  | { kind: 'ASK_CLEAR'; to: UnitChoice };

/** What choosing a unit chip needs (F06-AC15: never reinterpreted silently). */
export function unitChange(form: PortionForm, to: UnitChoice): UnitChange {
  const from = form.unit;
  if (from === null || from === to) return { kind: 'APPLY' };
  if (isNumericUnit(from) && isNumericUnit(to)) {
    return form.assignedAmount.trim() !== '' || form.perf.completedText.trim() !== '' ? { kind: 'ASK_KEEP_OR_CLEAR', amount: form.assignedAmount, from, to } : { kind: 'APPLY' };
  }
  if (isNumericUnit(from) !== isNumericUnit(to)) {
    const hasAmounts = form.assignedAmount.trim() !== '' || form.perf.completedText.trim() !== '' || form.perf.completedPreset !== null;
    return hasAmounts ? { kind: 'ASK_CLEAR', to } : { kind: 'APPLY' };
  }
  // Para preset → another Para preset: a completed preset above the new assigned is caught by validation.
  return { kind: 'APPLY' };
}

/** Applies a unit choice. `keep` keeps typed numbers (numeric → numeric only); otherwise amounts are cleared. */
export function applyUnit(form: PortionForm, to: UnitChoice, keep: boolean): PortionForm {
  const from = form.unit;
  const crossing = from !== null && isNumericUnit(from) !== isNumericUnit(to);
  const clear = crossing || (!keep && from !== null && isNumericUnit(from) && isNumericUnit(to) && from !== to);
  return {
    ...form,
    unit: to,
    assignedAmount: clear ? '' : form.assignedAmount,
    perf: { ...form.perf, completedText: clear ? '' : form.perf.completedText, completedPreset: crossing ? null : form.perf.completedPreset },
  };
}

// ---------- Form → writes ----------

export function portionWrite(form: PortionForm, position: number, index: ReferenceIndex | null): PortionWrite {
  const v = portionValues(form, position, index);
  const p = v.portion;
  const a = p.assigned!;
  const assigned: Quantity = { unit: a.unit as QuantityUnit, numerator: a.numerator as number, denominator: a.denominator ?? 1 };
  if (form.section === 'SABAQ') {
    const r = p.range!;
    return {
      section: 'SABAQ',
      position,
      isExtra: form.isExtra,
      paraNumber: v.derived?.para ?? null,
      range: { surahStart: r.surahStart as number, ayahStart: r.ayahStart as number, surahEnd: r.surahEnd as number, ayahEnd: r.ayahEnd as number },
      assigned,
      totalLines: p.totalLines,
      totalLinesSource: v.derived?.source ?? 'MANUAL',
    };
  }
  return { section: form.section, position, isExtra: form.isExtra, paraNumber: p.paraNumber, range: null, assigned, totalLines: null, totalLinesSource: null };
}

/** The attempt to store, normalized by the domain (FR-QTY-007: NOT_REMEMBERED → 0; COMPLETED → assigned). */
export function attemptWrite(form: PortionForm, index: ReferenceIndex | null): AttemptWrite {
  const v = portionValues(form, 1, index);
  const assigned = assignedQuantity(form, index);
  const status = v.attempt.status as PortionStatus;
  const n = normalizeAttempt({ status, assigned, completed: v.attempt.completed, quality: v.attempt.quality });
  return {
    status,
    completed: n.completed,
    quality: allowsQuality(status) ? n.quality : null,
    noMistakes: v.attempt.mistakes && v.attempt.mistakes.length > 0 ? false : Boolean(v.attempt.noMistakes),
    mistakes: [...(v.attempt.mistakes ?? [])],
    remarks: v.attempt.remarks ?? null,
  };
}

const sameQuantity = (a: Quantity | null, b: Quantity | null): boolean =>
  a === b || (a !== null && b !== null && a.unit === b.unit && a.numerator * b.denominator === b.numerator * a.denominator);

/** What changed in a saved portion (edit mode diff; only changed groups are queued). */
export function portionDiff(saved: LocalPortion, write: PortionWrite, attempt: AttemptWrite): { portionChanged: boolean; positionChanged: boolean; outcomeChanged: boolean; remarksChanged: boolean } {
  const r1 = saved.range;
  const r2 = write.range;
  const rangeChanged = JSON.stringify(r1) !== JSON.stringify(r2);
  const portionChanged =
    rangeChanged ||
    !sameQuantity(saved.assigned, write.assigned) ||
    (saved.section !== 'SABAQ' && saved.paraNumber !== write.paraNumber) ||
    (saved.section === 'SABAQ' && (saved.totalLines !== write.totalLines || saved.totalLinesSource !== write.totalLinesSource));
  const latest = saved.attempts.at(-1) ?? null;
  const outcomeChanged =
    latest === null ||
    latest.status !== attempt.status ||
    !sameQuantity(latest.completed, attempt.completed) ||
    latest.quality !== attempt.quality ||
    latest.noMistakes !== attempt.noMistakes ||
    JSON.stringify(latest.mistakes) !== JSON.stringify(attempt.mistakes);
  const remarksChanged = (latest?.remarks ?? null) !== attempt.remarks;
  return { portionChanged, positionChanged: saved.position !== write.position, outcomeChanged, remarksChanged };
}

/** The Para a Sabaq card derives right now (for the Sabqi default), from the reference on the device. */
export function sabaqParaOf(form: PortionForm, index: ReferenceIndex | null): number | null {
  if (form.section !== 'SABAQ' || !index) return null;
  const s = valueOf(form.surah);
  const a = valueOf(form.ayahStart);
  const e = valueOf(form.ayahEnd);
  if (s === null || a === null || e === null) return null;
  const ev = evaluateRange({ surah: s, ayahStart: a, ayahEnd: e }, index);
  return ev.issues.length ? null : ev.para;
}
