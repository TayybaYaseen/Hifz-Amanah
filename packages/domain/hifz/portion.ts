// F05 · Lesson portion and attempt validation (FR-DAY-003…005, FR-SAB-001…004, FR-SAB-008…010, FR-SBQ-001…004,
// FR-MNZ-001…004, FR-QTY-004…010, FR-ATT-004, FR-ATT-008, FR-ATT-011; US-018, US-020…022). Pure rules, no I/O.
//
// Errors are codes, never sentences: each names the section, the portion number, and the field, so the app can show
// "Sabqi · Portion 2: unit is required" in the user's language (F05-AC3). Values are never changed or cleared here.
//
// Quantities reuse @hifz/domain/quantity (`validateQuantities`: the units-by-section rule, F05-AC20/AC22) and ranges
// reuse @hifz/domain/quran-ref (`validateAyahRange`, `validateSpan`, `paraFor`). Nothing here holds Quran metadata.
import { QUANTITY_UNITS, type Quantity, type QuantityUnit } from '../quantity/quantity.ts';
import { rulesFor, validateQuantities, type QuantityIssue, type Section } from '../quantity/sections.ts';
import {
  SURAH_MAX,
  SURAH_MIN,
  compareRef,
  paraFor,
  validateAyahRange,
  validatePara,
  validateSpan,
  type ParaBoundary,
  type RangeIssue,
  type SurahMeta,
} from '../quran-ref/range.ts';
import { canCheckOffline } from '../quran-ref/snapshot.ts';
import {
  MISTAKES_MAX,
  MISTAKE_NOTE_MAX,
  REMARKS_MAX,
  normalizeAttempt,
  type MistakeEntry,
  type PortionStatus,
} from './status.ts';

/** Where Total Lines came from: counted on the edition's layout, or entered/corrected by hand (FR-SAB-008). */
export const TOTAL_LINES_SOURCES = ['LAYOUT', 'MANUAL'] as const;
export type TotalLinesSource = (typeof TOTAL_LINES_SOURCES)[number];

/** A Surah/Ayat range as entered. Sabaq keeps one Surah (`surahEnd` = `surahStart`, DEC-B62). */
export interface RangeDraft {
  surahStart: number | null;
  ayahStart: number | null;
  surahEnd: number | null;
  ayahEnd: number | null;
}

/** A quantity as a form holds it: the unit or the amount may still be missing (F05-AC3). A `Quantity` fits. */
export interface QuantityDraft {
  unit: QuantityUnit | null;
  numerator: number | null;
  denominator?: number | null;
}

/** One lesson portion as entered (no attempt fields). */
export interface PortionDraft {
  section: Section;
  /** The portion number within its section, from 1 ("Portion 2"). */
  position: number;
  isExtra?: boolean;
  /** Sabqi/Manzil: entered, 1–30. Sabaq: ignored here; the server derives it from the range (FR-SAB-001). */
  paraNumber: number | null;
  range: RangeDraft | null;
  /** Sabaq only. */
  totalLines: number | null;
  assigned: QuantityDraft | null;
}

/** One attempt as entered. */
export interface AttemptDraft {
  status: PortionStatus | null;
  completed: Quantity | null;
  quality: number | null;
  noMistakes?: boolean;
  mistakes?: readonly MistakeEntry[];
  remarks?: string | null;
}

/** The madrasa's reference rows a check may use (the device cache or the server's active metadata). */
export interface RangeReference {
  surahs: readonly SurahMeta[];
  paras: readonly ParaBoundary[];
  /** Licence withdrawal removed Surah rows: a missing Surah is then left to the server (F06 `canCheckOffline`). */
  metadataWithdrawn?: boolean;
}

export type PortionField =
  | 'position'
  | 'paraNumber'
  | 'surah'
  | 'ayahStart'
  | 'ayahEnd'
  | 'range'
  | 'totalLines'
  | 'unit'
  | 'assigned'
  | 'status'
  | 'completed'
  | 'quality'
  | 'mistakes'
  | 'remarks';

export const PORTION_ISSUE_CODES = [
  'REQUIRED',
  'NOT_ALLOWED',
  'UNKNOWN',
  'NOT_WHOLE',
  'OUT_OF_RANGE',
  'END_BEFORE_START',
  'CROSSES_SURAH',
  'PARA_UNKNOWN',
  'UNIT_NOT_ALLOWED',
  'UNIT_MISMATCH',
  'NOT_A_PRESET',
  'NOT_POSITIVE',
  'ABOVE_TOTAL',
  'ABOVE_ASSIGNED',
  'QUALITY_NOT_ALLOWED',
  'NO_MISTAKES_CONFLICT',
  'TOO_MANY',
  'TOO_LONG',
] as const;
export type PortionIssueCode = (typeof PORTION_ISSUE_CODES)[number];

/** "Sabqi · Portion 2: unit is required" = `{section: 'SABQI', portionNumber: 2, field: 'unit', code: 'REQUIRED'}`. */
export interface PortionFieldError {
  section: Section;
  portionNumber: number;
  field: PortionField;
  code: PortionIssueCode;
  /** The limit crossed, e.g. the Surah's Ayat count or Total Lines. */
  max?: number;
  min?: number;
}

const FIELD_ORDER: readonly PortionField[] = [
  'position',
  'paraNumber',
  'surah',
  'ayahStart',
  'ayahEnd',
  'range',
  'totalLines',
  'unit',
  'assigned',
  'status',
  'completed',
  'quality',
  'mistakes',
  'remarks',
];

type Issue = Omit<PortionFieldError, 'section' | 'portionNumber'>;

const isWhole = (n: unknown): n is number => typeof n === 'number' && Number.isSafeInteger(n);

const fromRange = (i: RangeIssue): Issue => {
  const field: PortionField = i.field === 'para' ? 'paraNumber' : i.field;
  const out: Issue = { field, code: i.code };
  if ('max' in i && i.max !== undefined) out.max = i.max;
  if ('min' in i && i.min !== undefined) out.min = i.min;
  return out;
};

const fromQuantity = (i: QuantityIssue): Issue => {
  // A unit the section does not allow is reported on the unit control (F05-AC20); everything else on the amount.
  const field: PortionField = i.field === 'assigned' && i.code === 'UNIT_NOT_ALLOWED' ? 'unit' : i.field;
  const out: Issue = { field, code: i.code };
  if (i.code === 'ABOVE_TOTAL') out.max = i.max;
  return out;
};

// Structural checks used when no metadata may be consulted (offline without a cache, or withdrawn rows): the
// server re-checks against the active metadata on sync (FR-SAB-009).
function structuralSurah(surah: number | null): Issue[] {
  if (surah === null) return [{ field: 'surah', code: 'REQUIRED' }];
  return isWhole(surah) && surah >= SURAH_MIN && surah <= SURAH_MAX ? [] : [{ field: 'surah', code: 'OUT_OF_RANGE', min: SURAH_MIN, max: SURAH_MAX }];
}

function structuralAyah(field: 'ayahStart' | 'ayahEnd', ayah: number | null): Issue[] {
  if (ayah === null) return [{ field, code: 'REQUIRED' }];
  if (!isWhole(ayah)) return [{ field, code: 'NOT_WHOLE' }];
  return ayah < 1 ? [{ field, code: 'OUT_OF_RANGE', min: 1 }] : [];
}

const withdrawnOf = (ref: RangeReference) => ({ surahs: [...ref.surahs], metadataWithdrawn: ref.metadataWithdrawn ?? false });

function sabaqRange(range: RangeDraft | null, ref: RangeReference | null | undefined): Issue[] {
  if (range === null) return [{ field: 'surah', code: 'REQUIRED' }, { field: 'ayahStart', code: 'REQUIRED' }, { field: 'ayahEnd', code: 'REQUIRED' }];
  // One Surah per Sabaq portion (FR-SAB-002, DEC-B62); a lesson into the next Surah is a second portion.
  if (range.surahStart !== null && range.surahEnd !== null && range.surahEnd !== range.surahStart) {
    return [{ field: 'range', code: 'CROSSES_SURAH' }];
  }
  const single = { surah: range.surahStart, ayahStart: range.ayahStart, ayahEnd: range.ayahEnd };
  if (ref && canCheckOffline(range.surahStart, withdrawnOf(ref))) {
    const issues = validateAyahRange(single, ref.surahs).map(fromRange);
    if (issues.length === 0 && range.surahStart !== null && range.ayahStart !== null) {
      // The Para is derived, never entered (FR-SAB-001); with no boundary covering it nothing is guessed.
      if (paraFor({ surah: range.surahStart, ayah: range.ayahStart }, ref.paras) === null) issues.push({ field: 'range', code: 'PARA_UNKNOWN' });
    }
    return issues;
  }
  const issues = [...structuralSurah(range.surahStart), ...structuralAyah('ayahStart', range.ayahStart), ...structuralAyah('ayahEnd', range.ayahEnd)];
  if (issues.length === 0 && (range.ayahStart as number) > (range.ayahEnd as number)) issues.push({ field: 'range', code: 'END_BEFORE_START' });
  return issues;
}

function revisionRange(range: RangeDraft | null, ref: RangeReference | null | undefined): Issue[] {
  // Optional for Sabqi/Manzil (ARCHITECTURE §9.1); when given, it may span Surahs but must be complete and ordered.
  if (range === null) return [];
  const { surahStart, ayahStart, surahEnd, ayahEnd } = range;
  if (surahStart === null && ayahStart === null && surahEnd === null && ayahEnd === null) return [];
  if (surahStart === null || ayahStart === null || surahEnd === null || ayahEnd === null) {
    const out: Issue[] = [];
    if (surahStart === null || surahEnd === null) out.push({ field: 'surah', code: 'REQUIRED' });
    if (ayahStart === null) out.push({ field: 'ayahStart', code: 'REQUIRED' });
    if (ayahEnd === null) out.push({ field: 'ayahEnd', code: 'REQUIRED' });
    return out;
  }
  const span = { start: { surah: surahStart, ayah: ayahStart }, end: { surah: surahEnd, ayah: ayahEnd } };
  if (ref && canCheckOffline(surahStart, withdrawnOf(ref)) && canCheckOffline(surahEnd, withdrawnOf(ref))) {
    return validateSpan(span, ref.surahs).map(fromRange);
  }
  const surahIssues = [...structuralSurah(surahStart), ...structuralSurah(surahEnd)].slice(0, 1);
  const issues = [...surahIssues, ...structuralAyah('ayahStart', ayahStart), ...structuralAyah('ayahEnd', ayahEnd)];
  if (issues.length === 0 && compareRef(span.start, span.end) > 0) issues.push({ field: 'range', code: 'END_BEFORE_START' });
  return issues;
}

/**
 * The assigned quantity the draft describes, or the field issues that stop it from being one. Sabaq has no unit
 * control (lines only, F05-AC20), so a Sabaq amount without a unit is read as LINES; Sabqi/Manzil need the unit.
 */
export function assignedOf(section: Section, draft: QuantityDraft | null): { quantity: Quantity | null; issues: Issue[] } {
  const sabaq = section === 'SABAQ';
  const issues: Issue[] = [];
  const unit = draft?.unit ?? (sabaq ? rulesFor('SABAQ').allowedUnits[0] ?? null : null);
  if (unit === null) issues.push({ field: 'unit', code: 'REQUIRED' });
  else if (!(QUANTITY_UNITS as readonly string[]).includes(unit)) issues.push({ field: 'unit', code: 'UNIT_NOT_ALLOWED' });
  const numerator = draft?.numerator ?? null;
  if (numerator === null) issues.push({ field: 'assigned', code: 'REQUIRED' });
  if (issues.length > 0 || unit === null || numerator === null) return { quantity: null, issues };
  return { quantity: { unit, numerator, denominator: draft?.denominator ?? 1 }, issues };
}

const sortIssues = (section: Section, portionNumber: number, issues: Issue[]): PortionFieldError[] =>
  issues
    .map((i, n) => ({ i, n }))
    .sort((a, b) => FIELD_ORDER.indexOf(a.i.field) - FIELD_ORDER.indexOf(b.i.field) || a.n - b.n)
    .map(({ i }) => ({ section, portionNumber, ...i }));

/**
 * The portion's own fields: number, Para (Sabqi/Manzil), range, Total Lines (Sabaq), and the assigned quantity.
 * `ref` is the madrasa's reference rows; without it only structural checks run (the server re-checks on sync).
 */
export function validatePortionFields(portion: PortionDraft, ref?: RangeReference | null): PortionFieldError[] {
  const issues: Issue[] = [];
  const sabaq = portion.section === 'SABAQ';
  if (!isWhole(portion.position) || portion.position < 1) issues.push({ field: 'position', code: 'OUT_OF_RANGE', min: 1 });
  if (sabaq) {
    issues.push(...sabaqRange(portion.range, ref));
  } else {
    if (portion.paraNumber === null) issues.push({ field: 'paraNumber', code: 'REQUIRED' });
    else issues.push(...validatePara(portion.paraNumber).map(fromRange));
    issues.push(...revisionRange(portion.range, ref));
    if (portion.totalLines !== null) issues.push({ field: 'totalLines', code: 'NOT_ALLOWED' });
  }
  const assigned = assignedOf(portion.section, portion.assigned);
  issues.push(...assigned.issues);
  const quantityIssues = validateQuantities(portion.section, { totalLines: sabaq ? portion.totalLines : undefined, assigned: assigned.quantity, completed: null });
  issues.push(...quantityIssues.map(fromQuantity));
  return sortIssues(portion.section, portion.position, issues);
}

/**
 * One attempt on a portion: a status is always required; completed must fit the assigned quantity (same unit,
 * ≤ assigned, whole or a Para quarter); quality only on a recitation and only 1–5; "No mistakes" excludes a mistake
 * list; remarks and mistakes are bounded.
 */
export function validateAttemptFields(portion: PortionDraft, attempt: AttemptDraft | null): PortionFieldError[] {
  const issues: Issue[] = [];
  if (attempt === null || attempt.status === null) {
    issues.push({ field: 'status', code: 'REQUIRED' });
  }
  if (attempt) {
    const assigned = assignedOf(portion.section, portion.assigned).quantity;
    if (attempt.completed) {
      const sabaq = portion.section === 'SABAQ';
      const q = validateQuantities(portion.section, { totalLines: sabaq ? portion.totalLines : undefined, assigned, completed: attempt.completed });
      issues.push(...q.filter((i) => i.field === 'completed').map(fromQuantity));
    }
    if (attempt.status !== null) {
      issues.push(...normalizeAttempt({ status: attempt.status, assigned, completed: attempt.completed, quality: attempt.quality }).issues.map((i): Issue => (i.code === 'OUT_OF_RANGE' ? { field: 'quality', code: 'OUT_OF_RANGE', min: i.min, max: i.max } : { field: 'quality', code: i.code })));
    }
    const mistakes = attempt.mistakes ?? [];
    if (attempt.noMistakes && mistakes.length > 0) issues.push({ field: 'mistakes', code: 'NO_MISTAKES_CONFLICT' });
    if (mistakes.length > MISTAKES_MAX) issues.push({ field: 'mistakes', code: 'TOO_MANY', max: MISTAKES_MAX });
    // A mistake note is short (F07, DEC-B86); the stored note is trimmed.
    if (mistakes.some((m) => typeof m.note === 'string' && m.note.trim().length > MISTAKE_NOTE_MAX)) issues.push({ field: 'mistakes', code: 'TOO_LONG', max: MISTAKE_NOTE_MAX });
    if (attempt.remarks && attempt.remarks.length > REMARKS_MAX) issues.push({ field: 'remarks', code: 'TOO_LONG', max: REMARKS_MAX });
  }
  return sortIssues(portion.section, portion.position, issues);
}

/**
 * Everything Daily Entry checks before saving one portion with its attempt (F05-AC3): the portion's fields and the
 * attempt's, sorted by field. Empty means it may be saved.
 */
export function validatePortion(portion: PortionDraft, attempt: AttemptDraft | null, ref?: RangeReference | null): PortionFieldError[] {
  // Array.prototype.sort is stable, so each field keeps its own issue order.
  return [...validatePortionFields(portion, ref), ...validateAttemptFields(portion, attempt)].sort((a, b) => FIELD_ORDER.indexOf(a.field) - FIELD_ORDER.indexOf(b.field));
}

/** Validates every portion of a record; errors keep their own section and portion number. */
export function validateEntry(entries: readonly { portion: PortionDraft; attempt: AttemptDraft | null }[], ref?: RangeReference | null): PortionFieldError[] {
  return entries.flatMap((e) => validatePortion(e.portion, e.attempt, ref));
}

/** The Para a Sabaq range starts in (FR-SAB-001), or null when the metadata has none for it (never guessed). */
export function deriveSabaqPara(range: { surahStart: number; ayahStart: number }, ref: Pick<RangeReference, 'paras'>): number | null {
  return paraFor({ surah: range.surahStart, ayah: range.ayahStart }, ref.paras);
}

/**
 * How a Sabaq Total Lines is recorded (FR-SAB-008): LAYOUT when it equals the count from the edition's layout,
 * MANUAL when the Teacher entered or corrected it, or the layout had no count for the range.
 */
export function totalLinesSource(totalLines: number, layoutCount: number | null): TotalLinesSource {
  return layoutCount !== null && layoutCount === totalLines ? 'LAYOUT' : 'MANUAL';
}
