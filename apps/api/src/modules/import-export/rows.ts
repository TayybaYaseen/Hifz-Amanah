// Row rules for the Excel import (F14; FR-XLS-004, FR-XLS-010…013, NFR-XLS-001; SRS §15.1; AC-XLS-02…04, AC-XLS-07).
// Pure functions, no I/O: the import service loads the madrasa's students, classes, and portions and passes them in.
//
// - Parsing turns a row's text cells into typed values and field issues (types, enums, YYYY-MM-DD dates, lengths).
//   Nothing is guessed: an empty QualityRating is null (never 0), an empty MistakeCount is null (unknown), and a
//   Sabaq row with a Para preset is invalid ("Sabaq uses lines"), never converted (F14-AC10, AC23).
// - The DailyRecords portion and attempt checks reuse the app's rules (@hifz/domain/hifz validatePortion), so the
//   import accepts exactly what Daily Entry accepts (ARCHITECTURE §11); their issues are mapped to template columns.
// - Classification (FR-XLS-011): NEW, EXACT_MATCH, SUSPECTED_DUPLICATE, INVALID, PROPOSED_UPDATE. Identity comes only
//   from a stable key (ExternalStudentID, ExternalRecordID); a name or composite match without one is a suspected
//   duplicate for review, never the same record (FR-XLS-012, FR-XLS-013, F14-AC5). ADD_ONLY (the default) never
//   proposes a change to an existing record (F14-AC13); UPDATE lists field-level before/after values (F14-AC14).
// - A workbook never selects the tenant: there is no organization field here at all (FR-XLS-015, F14-AC8).
import type { ImportClassification, ImportFieldChange, ImportIssueCode, ImportMode, TemplateUnit } from '@hifz/contracts';
import { TEMPLATE_UNITS } from '@hifz/contracts';
import {
  MISTAKES_MAX,
  PORTION_STATUSES,
  REMARKS_MAX,
  SESSION_LABEL_MAX,
  normalizeAttempt,
  normalizeSessionLabel,
  sessionLabelKey,
  validatePortion,
  type PortionFieldError,
  type PortionStatus,
} from '@hifz/domain/hifz';
import { fractionText, isParaQuarter, quantity, type Quantity } from '@hifz/domain/quantity';
import type { Section } from '@hifz/domain/quantity';
import { isCalendarDate } from '@hifz/domain/roster';
import type { ParsedRow } from './workbook.ts';

export interface Issue {
  column: string | null;
  code: ImportIssueCode;
  severity: 'ERROR' | 'WARNING';
  params?: Record<string, string | number>;
}

export const error = (column: string | null, code: ImportIssueCode, params?: Record<string, string | number>): Issue => ({ column, code, severity: 'ERROR', ...(params ? { params } : {}) });
export const warning = (column: string | null, code: ImportIssueCode, params?: Record<string, string | number>): Issue => ({ column, code, severity: 'WARNING', ...(params ? { params } : {}) });
export const hasErrors = (issues: readonly Issue[]): boolean => issues.some((i) => i.severity === 'ERROR');

export interface Classified {
  rowNo: number;
  classification: ImportClassification;
  issues: Issue[];
  changes: ImportFieldChange[];
}

// ---------- Cell parsing ----------

const STUDENT_NAME_MAX = 200;
const EXTERNAL_ID_MAX = 50;
const EXTERNAL_RECORD_ID_MAX = 100;
const NOTES_MAX = 2000;
const CLASS_NAME_MAX = 100;

/** Cell-level read problems found by the workbook reader (a formula with no saved value). */
function cellIssues(row: ParsedRow): Issue[] {
  return Object.entries(row.cellIssues).map(([column, code]) => error(column, code === 'FORMULA_NO_VALUE' ? 'FORMULA_NO_VALUE' : 'INVALID'));
}

class Cells {
  readonly issues: Issue[];
  private readonly row: ParsedRow;
  constructor(row: ParsedRow) {
    this.row = row;
    this.issues = cellIssues(row);
  }
  private bad(column: string): boolean {
    return Object.hasOwn(this.row.cellIssues, column);
  }
  text(column: string, opts: { required?: boolean; max?: number } = {}): string | null {
    if (this.bad(column)) return null;
    const v = this.row.cells[column] ?? null;
    if (v === null) {
      if (opts.required) this.issues.push(error(column, 'REQUIRED', { column }));
      return null;
    }
    if (opts.max !== undefined && v.length > opts.max) {
      this.issues.push(error(column, 'TOO_LONG', { max: opts.max }));
      return null;
    }
    return v;
  }
  date(column: string, opts: { required?: boolean } = {}): string | null {
    const v = this.text(column, opts);
    if (v === null) return null;
    if (!isCalendarDate(v)) {
      this.issues.push(error(column, 'INVALID_DATE'));
      return null;
    }
    return v;
  }
  enumOf<T extends string>(column: string, allowed: readonly T[], opts: { required?: boolean } = {}): T | null {
    const v = this.text(column, opts);
    if (v === null) return null;
    const hit = allowed.find((a) => a === v.toUpperCase());
    if (!hit) {
      this.issues.push(error(column, 'INVALID_ENUM', { allowed: allowed.join(', ') }));
      return null;
    }
    return hit;
  }
  whole(column: string, opts: { required?: boolean; min?: number; max?: number } = {}): number | null {
    const v = this.text(column, opts);
    if (v === null) return null;
    const amount = parseAmount(v);
    if (amount === null) {
      this.issues.push(error(column, 'INVALID_NUMBER'));
      return null;
    }
    if (amount.den !== 1) {
      this.issues.push(error(column, 'NOT_WHOLE'));
      return null;
    }
    const n = amount.num;
    if ((opts.min !== undefined && n < opts.min) || (opts.max !== undefined && n > opts.max)) {
      this.issues.push(error(column, 'OUT_OF_RANGE', { min: opts.min ?? 0, max: opts.max ?? Number.MAX_SAFE_INTEGER }));
      return null;
    }
    return n;
  }
  amount(column: string, opts: { required?: boolean } = {}): { num: number; den: number } | null {
    const v = this.text(column, opts);
    if (v === null) return null;
    const a = parseAmount(v);
    if (a === null || a.num < 0) {
      this.issues.push(error(column, 'INVALID_NUMBER'));
      return null;
    }
    return a;
  }
}

const gcd = (a: number, b: number): number => (b === 0 ? Math.abs(a) : gcd(b, a % b));

/**
 * An exact non-negative rational from "3", "0.75", or "3/4" (never a float): "0.75" is 75/100 = 3/4. Null when it is
 * not a number of that form.
 */
export function parseAmount(text: string): { num: number; den: number } | null {
  const t = text.trim();
  let num: number;
  let den: number;
  const frac = /^(\d{1,6})\s*\/\s*(\d{1,6})$/.exec(t);
  const dec = /^(\d{1,6})(?:\.(\d{1,6}))?$/.exec(t);
  if (frac) {
    num = Number(frac[1]);
    den = Number(frac[2]);
    if (den === 0) return null;
  } else if (dec) {
    const digits = dec[2] ?? '';
    den = 10 ** digits.length;
    num = Number(dec[1]) * den + (digits ? Number(digits) : 0);
  } else return null;
  const g = gcd(num, den) || 1;
  return { num: num / g, den: den / g };
}

/** The Para size of each preset unit (Rubu 1/4, Half 1/2, Salasah 3/4, Complete 1). */
export const PRESET_SIZE: Readonly<Record<'RUBU' | 'HALF' | 'SALASAH' | 'COMPLETE', { num: number; den: number }>> = {
  RUBU: { num: 1, den: 4 },
  HALF: { num: 1, den: 2 },
  SALASAH: { num: 3, den: 4 },
  COMPLETE: { num: 1, den: 1 },
};

export const isPresetUnit = (u: TemplateUnit): u is keyof typeof PRESET_SIZE => Object.hasOwn(PRESET_SIZE, u);

/** A template amount in a template unit as a stored quantity, or the issue code that stops it. */
export function quantityOfTemplate(unit: TemplateUnit, amount: { num: number; den: number }): Quantity | 'NOT_WHOLE' | 'NOT_PARA_QUARTERS' {
  if (!isPresetUnit(unit)) {
    if (amount.den !== 1) return 'NOT_WHOLE';
    return quantity(unit, amount.num, 1);
  }
  const size = PRESET_SIZE[unit];
  const q = quantity('PARA', amount.num * size.num, amount.den * size.den);
  return isParaQuarter(q) ? q : 'NOT_PARA_QUARTERS';
}

// ---------- Students ----------

export const STUDENT_STATUSES = ['ACTIVE', 'INACTIVE'] as const;

export interface StudentRowValue {
  externalStudentId: string | null;
  name: string | null;
  className: string | null;
  admissionDate: string | null;
  status: (typeof STUDENT_STATUSES)[number] | null;
  notes: string | null;
}

export function parseStudentRow(row: ParsedRow): { value: StudentRowValue; issues: Issue[] } {
  const c = new Cells(row);
  const value: StudentRowValue = {
    externalStudentId: c.text('ExternalStudentID', { max: EXTERNAL_ID_MAX }),
    name: c.text('StudentName', { required: true, max: STUDENT_NAME_MAX }),
    className: c.text('ClassName', { max: CLASS_NAME_MAX }),
    admissionDate: c.date('AdmissionDate'),
    status: c.enumOf('Status', STUDENT_STATUSES),
    notes: c.text('Notes', { max: NOTES_MAX }),
  };
  return { value, issues: c.issues };
}

export interface ExistingStudent {
  id: string;
  name: string;
  externalStudentId: string | null;
  admissionDate: string | null;
  status: 'ACTIVE' | 'INACTIVE';
  notes: string | null;
  /** Classes the student is enrolled in now or later (Teacher scope). */
  classIds: readonly string[];
  /** The current class's name, or null. */
  className: string | null;
}

export interface ClassRef {
  id: string;
  name: string;
  status: 'ACTIVE' | 'INACTIVE';
}

export interface StudentImportContext {
  mode: ImportMode;
  /** Owner/Admin: any class, and may set a student's status. */
  canManage: boolean;
  /** A Teacher's classes (null = the whole madrasa: Owner, Admin, or "all classes"). */
  scopeClassIds: readonly string[] | null;
  classes: readonly ClassRef[];
  students: readonly ExistingStudent[];
}

export type StudentPlan =
  | { kind: 'CREATE'; value: StudentRowValue; classId: string }
  | { kind: 'UPDATE'; studentId: string; set: Partial<Pick<StudentRowValue, 'name' | 'admissionDate' | 'status' | 'notes'>> }
  | { kind: 'NONE' };

export interface StudentClassified extends Classified {
  plan: StudentPlan;
}

const lower = (s: string) => s.trim().toLowerCase();

/** Field-level differences of a keyed row against the stored student. Empty cells never clear a value. */
export function studentChanges(existing: ExistingStudent, v: StudentRowValue): { changes: ImportFieldChange[]; set: Partial<Pick<StudentRowValue, 'name' | 'admissionDate' | 'status' | 'notes'>> } {
  const changes: ImportFieldChange[] = [];
  const set: Partial<Pick<StudentRowValue, 'name' | 'admissionDate' | 'status' | 'notes'>> = {};
  if (v.name !== null && v.name !== existing.name) {
    changes.push({ column: 'StudentName', before: existing.name, after: v.name });
    set.name = v.name;
  }
  if (v.admissionDate !== null && v.admissionDate !== existing.admissionDate) {
    changes.push({ column: 'AdmissionDate', before: existing.admissionDate, after: v.admissionDate });
    set.admissionDate = v.admissionDate;
  }
  if (v.status !== null && v.status !== existing.status) {
    changes.push({ column: 'Status', before: existing.status, after: v.status });
    set.status = v.status;
  }
  if (v.notes !== null && v.notes !== existing.notes) {
    changes.push({ column: 'Notes', before: existing.notes, after: v.notes });
    set.notes = v.notes;
  }
  return { changes, set };
}

/**
 * Classifies parsed Students rows (F14-AC1, AC4, AC5, AC12, AC13, AC14, AC21). Rows sharing an ExternalStudentID
 * in the file are all invalid (duplicate key); a later row repeating an earlier row's name without a key is a
 * suspected duplicate.
 */
export function classifyStudentRows(rows: readonly { rowNo: number; value: StudentRowValue; issues: Issue[] }[], ctx: StudentImportContext): StudentClassified[] {
  const keyCount = new Map<string, number>();
  for (const r of rows) if (r.value.externalStudentId) keyCount.set(lower(r.value.externalStudentId), (keyCount.get(lower(r.value.externalStudentId)) ?? 0) + 1);
  const byKey = new Map(ctx.students.filter((s) => s.externalStudentId).map((s) => [lower(s.externalStudentId!), s]));
  const byName = new Map<string, ExistingStudent[]>();
  for (const s of ctx.students) byName.set(lower(s.name), [...(byName.get(lower(s.name)) ?? []), s]);
  const classByName = new Map(ctx.classes.map((c) => [lower(c.name), c]));
  const namesInFile = new Set<string>();
  const inScope = (classIds: readonly string[]) => ctx.scopeClassIds === null || classIds.some((id) => ctx.scopeClassIds!.includes(id));

  return rows.map((r): StudentClassified => {
    const issues = [...r.issues];
    const v = r.value;
    const done = (classification: ImportClassification, plan: StudentPlan, changes: ImportFieldChange[] = []): StudentClassified => ({ rowNo: r.rowNo, classification, issues, changes, plan });
    const invalid = () => done('INVALID', { kind: 'NONE' });
    if (v.externalStudentId && (keyCount.get(lower(v.externalStudentId)) ?? 0) > 1) issues.push(error('ExternalStudentID', 'DUPLICATE_KEY', { column: 'ExternalStudentID' }));
    if (hasErrors(issues)) return invalid();
    const name = v.name!;

    // ---- A stable key that matches: the same student (exact match or a proposed update). ----
    const existing = v.externalStudentId ? byKey.get(lower(v.externalStudentId)) : undefined;
    if (existing) {
      if (!inScope(existing.classIds)) {
        issues.push(error('ClassName', 'NOT_YOUR_CLASS'));
        return invalid();
      }
      if (v.className !== null && (existing.className === null || lower(existing.className) !== lower(v.className))) issues.push(warning('ClassName', 'CLASS_NOT_CHANGED'));
      const { changes, set } = studentChanges(existing, v);
      if (changes.length === 0) return done('EXACT_MATCH', { kind: 'NONE' });
      if (ctx.mode === 'ADD_ONLY') {
        issues.push(error(null, 'EXISTS_DIFFERENT'));
        return done('SUSPECTED_DUPLICATE', { kind: 'NONE' });
      }
      if (set.status !== undefined && !ctx.canManage) {
        issues.push(error('Status', 'STATUS_CHANGE_NOT_ALLOWED'));
        return invalid();
      }
      return done('PROPOSED_UPDATE', { kind: 'UPDATE', studentId: existing.id, set }, changes);
    }

    // ---- A new student: the class must exist, be active, and (for a Teacher) be assigned (DEC-B15). ----
    if (v.className === null) {
      issues.push(error('ClassName', 'CLASS_REQUIRED'));
      return invalid();
    }
    const klass = classByName.get(lower(v.className));
    // A Teacher sees "Not your class" for any class outside their scope, existing or not (no probing).
    if (ctx.scopeClassIds !== null && (!klass || !ctx.scopeClassIds.includes(klass.id))) {
      issues.push(error('ClassName', 'NOT_YOUR_CLASS'));
      return invalid();
    }
    if (!klass) {
      issues.push(error('ClassName', 'CLASS_NOT_FOUND'));
      return invalid();
    }
    if (klass.status !== 'ACTIVE') {
      issues.push(error('ClassName', 'CLASS_INACTIVE'));
      return invalid();
    }
    if (v.status === 'INACTIVE' && !ctx.canManage) {
      issues.push(error('Status', 'STATUS_CHANGE_NOT_ALLOWED'));
      return invalid();
    }
    // Never matched by name alone (FR-XLS-012): a same-name student without a key in common is for review.
    const sameName = (byName.get(lower(name)) ?? []).filter((s) => !v.externalStudentId || s.externalStudentId === null);
    const repeated = !v.externalStudentId && namesInFile.has(lower(name));
    if (!v.externalStudentId) namesInFile.add(lower(name));
    if (sameName.length > 0 || repeated) {
      issues.push(error('StudentName', 'NAME_MATCH'));
      return done('SUSPECTED_DUPLICATE', { kind: 'NONE' });
    }
    return done('NEW', { kind: 'CREATE', value: v, classId: klass.id });
  });
}

// ---------- DailyRecords ----------

export interface DailyRowValue {
  externalRecordId: string | null;
  externalStudentId: string | null;
  recordDate: string | null;
  sessionLabel: string | null;
  section: Section | null;
  position: number | null;
  paraNumber: number | null;
  range: { surahStart: number; ayahStart: number; surahEnd: number; ayahEnd: number } | null;
  totalLines: number | null;
  unit: TemplateUnit | null;
  assigned: Quantity | null;
  completed: Quantity | null;
  mistakeCount: number | null;
  status: PortionStatus | null;
  quality: number | null;
  teacherNotes: string | null;
}

const FIELD_COLUMN: Readonly<Record<PortionFieldError['field'], string | null>> = {
  position: 'PortionNumber',
  paraNumber: 'ParaNumber',
  surah: 'SurahStart',
  ayahStart: 'AyahStart',
  ayahEnd: 'AyahEnd',
  range: 'SurahStart',
  totalLines: 'TotalLines',
  unit: 'QuantityUnit',
  assigned: 'AssignedQuantity',
  status: 'PerformanceStatus',
  completed: 'CompletedQuantity',
  quality: 'QualityRating',
  mistakes: 'MistakeCount',
  remarks: 'TeacherNotes',
};

/** A domain portion/attempt issue as a template-column issue. */
export function portionIssue(e: Pick<PortionFieldError, 'field' | 'code' | 'max' | 'min'>, section: Section | null): Issue {
  const column = FIELD_COLUMN[e.field];
  const params: Record<string, string | number> = { ...(column ? { column } : {}), ...(e.max !== undefined ? { max: e.max } : {}), ...(e.min !== undefined ? { min: e.min } : {}) };
  switch (e.code) {
    case 'REQUIRED':
    case 'NOT_ALLOWED':
    case 'NOT_WHOLE':
    case 'ABOVE_TOTAL':
    case 'ABOVE_ASSIGNED':
    case 'QUALITY_NOT_ALLOWED':
    case 'TOO_LONG':
      return error(column, e.code, params);
    case 'OUT_OF_RANGE':
      return error(column, 'OUT_OF_RANGE', { min: e.min ?? 1, max: e.max ?? Number.MAX_SAFE_INTEGER });
    case 'NOT_POSITIVE':
      return error(column, 'OUT_OF_RANGE', { min: 1, max: e.max ?? Number.MAX_SAFE_INTEGER });
    case 'UNIT_NOT_ALLOWED':
    case 'UNIT_MISMATCH':
      return error('QuantityUnit', section === 'SABAQ' ? 'SABAQ_USES_LINES' : 'UNIT_NOT_ALLOWED');
    case 'NOT_A_PRESET':
      return error(column, 'NOT_PARA_QUARTERS');
    case 'CROSSES_SURAH':
      return error('SurahEnd', 'SABAQ_SURAH_END');
    case 'END_BEFORE_START':
    case 'PARA_UNKNOWN':
      return error(column, 'RANGE_INVALID');
    case 'TOO_MANY':
      return error(column, 'OUT_OF_RANGE', { min: 0, max: e.max ?? MISTAKES_MAX });
    default:
      return error(column, 'INVALID');
  }
}

/**
 * Parses one DailyRecords row and runs the app's structural portion checks (no Quran metadata here; the import
 * service re-checks a range against the madrasa's metadata). `mode` is the madrasa's daily-report mode.
 */
export function parseDailyRow(row: ParsedRow, opts: { mode: 'SINGLE' | 'MULTI_SESSION'; today: string }): { value: DailyRowValue; issues: Issue[] } {
  const c = new Cells(row);
  const externalRecordId = c.text('ExternalRecordID', { max: EXTERNAL_RECORD_ID_MAX });
  const externalStudentId = c.text('ExternalStudentID', { required: true, max: EXTERNAL_ID_MAX });
  const recordDate = c.date('RecordDate', { required: true });
  if (recordDate !== null && recordDate > opts.today) c.issues.push(error('RecordDate', 'FUTURE_DATE'));
  const rawLabel = c.text('SessionLabel', { max: SESSION_LABEL_MAX });
  const sessionLabel = normalizeSessionLabel(rawLabel);
  if (opts.mode === 'MULTI_SESSION' && sessionLabel === null && !Object.hasOwn(row.cellIssues, 'SessionLabel')) c.issues.push(error('SessionLabel', 'SESSION_LABEL_REQUIRED'));
  if (opts.mode === 'SINGLE' && sessionLabel !== null) c.issues.push(error('SessionLabel', 'SESSION_LABEL_NOT_ALLOWED'));
  const section = c.enumOf('SectionType', ['SABAQ', 'SABQI', 'MANZIL'] as const, { required: true });
  const position = c.whole('PortionNumber', { required: true, min: 1, max: 100 });
  const paraNumber = c.whole('ParaNumber', { min: 1, max: 30 });
  const surahStart = c.whole('SurahStart', { min: 1, max: 114 });
  const ayahStart = c.whole('AyahStart', { min: 1, max: 999 });
  const surahEnd = c.whole('SurahEnd', { min: 1, max: 114 });
  const ayahEnd = c.whole('AyahEnd', { min: 1, max: 999 });
  const totalLines = c.whole('TotalLines', { min: 1, max: 10000 });
  const unit = c.enumOf('QuantityUnit', TEMPLATE_UNITS, { required: true });
  const assignedAmount = c.amount('AssignedQuantity', { required: true });
  const completedAmount = c.amount('CompletedQuantity');
  const mistakeCount = c.whole('MistakeCount', { min: 0, max: 1000 });
  const status = c.enumOf('PerformanceStatus', PORTION_STATUSES, { required: true });
  const quality = c.whole('QualityRating', { min: 1, max: 5 });
  const teacherNotes = c.text('TeacherNotes', { max: REMARKS_MAX });
  const issues = c.issues;

  const sabaq = section === 'SABAQ';
  // Sabaq is counted in lines only; a Para preset is never converted (FR-SAB-010, AC-XLS-07, F14-AC23).
  if (sabaq && unit !== null && unit !== 'LINES') issues.push(error('QuantityUnit', 'SABAQ_USES_LINES'));
  if (sabaq) {
    for (const [col, v] of [['SurahStart', surahStart], ['AyahStart', ayahStart], ['AyahEnd', ayahEnd], ['TotalLines', totalLines]] as const) {
      if (v === null && !issues.some((i) => i.column === col)) issues.push(error(col, 'REQUIRED', { column: col }));
    }
    if (surahEnd !== null && surahStart !== null && surahEnd !== surahStart) issues.push(error('SurahEnd', 'SABAQ_SURAH_END'));
  } else if (section !== null && totalLines !== null) issues.push(error('TotalLines', 'NOT_ALLOWED', { column: 'TotalLines' }));

  const toQ = (column: string, a: { num: number; den: number } | null): Quantity | null => {
    if (a === null || unit === null || (sabaq && unit !== 'LINES')) return null;
    const q = quantityOfTemplate(unit, a);
    if (typeof q === 'string') {
      issues.push(error(column, q));
      return null;
    }
    return q;
  };
  const assigned = toQ('AssignedQuantity', assignedAmount);
  const completed = toQ('CompletedQuantity', completedAmount);

  let range: DailyRowValue['range'] = null;
  if (sabaq && surahStart !== null && ayahStart !== null && ayahEnd !== null) range = { surahStart, ayahStart, surahEnd: surahStart, ayahEnd };
  else if (!sabaq && (surahStart !== null || ayahStart !== null || surahEnd !== null || ayahEnd !== null)) {
    if (surahStart !== null && ayahStart !== null && surahEnd !== null && ayahEnd !== null) range = { surahStart, ayahStart, surahEnd, ayahEnd };
    else for (const [col, v] of [['SurahStart', surahStart], ['AyahStart', ayahStart], ['SurahEnd', surahEnd], ['AyahEnd', ayahEnd]] as const) if (v === null && !issues.some((i) => i.column === col)) issues.push(error(col, 'REQUIRED', { column: col }));
  }

  const value: DailyRowValue = {
    externalRecordId,
    externalStudentId,
    recordDate,
    sessionLabel: opts.mode === 'SINGLE' ? null : sessionLabel,
    section,
    position,
    paraNumber,
    range,
    totalLines,
    unit,
    assigned,
    completed,
    mistakeCount,
    status,
    quality,
    teacherNotes,
  };

  // The app's own portion and attempt rules, when the row is complete enough to check (no metadata here).
  if (!hasErrors(issues) && section !== null && position !== null && status !== null) {
    const errs = validatePortion(
      { section, position, isExtra: false, paraNumber: sabaq ? null : paraNumber, range, totalLines: sabaq ? totalLines : null, assigned },
      { status, completed, quality, noMistakes: false, mistakes: [], remarks: teacherNotes },
      null,
    );
    const seen = new Set<string>();
    for (const e of errs) {
      const issue = portionIssue(e, section);
      const key = `${issue.column}:${issue.code}`;
      if (!seen.has(key)) issues.push(issue);
      seen.add(key);
    }
  }
  return { value, issues };
}

/** The record a row belongs to: student, date, and session (F14-AC6). */
export const groupKeyOf = (studentId: string, date: string, sessionLabel: string | null): string => `${studentId}|${date}|${sessionLabel === null ? '' : sessionLabelKey(sessionLabel)}`;

/** The portion a row describes within its record (composite duplicate check, FR-XLS-013). */
export const portionKeyOf = (groupKey: string, section: string, position: number): string => `${groupKey}|${section}|${position}`;

/** The stored attempt fields a DailyRecords row can carry (update mode changes these only). */
export interface AttemptFields {
  status: PortionStatus;
  completed: Quantity | null;
  quality: number | null;
  mistakeCount: number | null;
  teacherNotes: string | null;
}

/** The attempt a row describes, with the app's status defaults applied (NOT_REMEMBERED → 0; COMPLETED → assigned). */
export function attemptOfRow(v: DailyRowValue): AttemptFields {
  const n = normalizeAttempt({ status: v.status!, assigned: v.assigned, completed: v.completed, quality: v.quality });
  return { status: n.status, completed: n.completed, quality: n.quality, mistakeCount: v.mistakeCount, teacherNotes: v.teacherNotes };
}

const qText = (q: Quantity | null): string | null => (q === null ? null : `${fractionText(q)} ${q.unit}`);
const sameQ = (a: Quantity | null, b: Quantity | null): boolean =>
  a === null || b === null ? a === b : a.unit === b.unit && a.numerator * b.denominator === b.numerator * a.denominator;

/** Field-level differences of a row's attempt against the stored latest attempt (F14-AC14). Empty cells never clear. */
export function attemptChanges(stored: AttemptFields, row: AttemptFields): { changes: ImportFieldChange[]; set: Partial<AttemptFields> } {
  const changes: ImportFieldChange[] = [];
  const set: Partial<AttemptFields> = {};
  if (row.status !== stored.status) {
    changes.push({ column: 'PerformanceStatus', before: stored.status, after: row.status });
    set.status = row.status;
  }
  if (row.completed !== null && !sameQ(row.completed, stored.completed)) {
    changes.push({ column: 'CompletedQuantity', before: qText(stored.completed), after: qText(row.completed) });
    set.completed = row.completed;
  }
  if (row.quality !== null && row.quality !== stored.quality) {
    changes.push({ column: 'QualityRating', before: stored.quality === null ? null : String(stored.quality), after: String(row.quality) });
    set.quality = row.quality;
  }
  if (row.mistakeCount !== null && row.mistakeCount !== stored.mistakeCount) {
    changes.push({ column: 'MistakeCount', before: stored.mistakeCount === null ? null : String(stored.mistakeCount), after: String(row.mistakeCount) });
    set.mistakeCount = row.mistakeCount;
  }
  if (row.teacherNotes !== null && row.teacherNotes !== stored.teacherNotes) {
    changes.push({ column: 'TeacherNotes', before: stored.teacherNotes, after: row.teacherNotes });
    set.teacherNotes = row.teacherNotes;
  }
  return { changes, set };
}

/** The stored portion fields a row must equal for update mode (the portion itself is never changed by import). */
export interface PortionFields {
  studentId: string;
  recordDate: string;
  sessionLabel: string | null;
  section: Section;
  position: number;
  paraNumber: number | null;
  range: DailyRowValue['range'];
  totalLines: number | null;
  assigned: Quantity;
}

/** Whether the row describes the same portion (identity and structure); ParaNumber is compared only when given. */
export function samePortion(stored: PortionFields, v: DailyRowValue, studentId: string): boolean {
  const r = v.range;
  const s = stored.range;
  const sameRange = r === null ? true : s !== null && r.surahStart === s.surahStart && r.ayahStart === s.ayahStart && r.surahEnd === s.surahEnd && r.ayahEnd === s.ayahEnd;
  return (
    stored.studentId === studentId &&
    stored.recordDate === v.recordDate &&
    (stored.sessionLabel === null ? v.sessionLabel === null : v.sessionLabel !== null && sessionLabelKey(stored.sessionLabel) === sessionLabelKey(v.sessionLabel)) &&
    stored.section === v.section &&
    stored.position === v.position &&
    (v.paraNumber === null || v.paraNumber === stored.paraNumber) &&
    sameRange &&
    (v.totalLines === null || v.totalLines === stored.totalLines) &&
    sameQ(stored.assigned, v.assigned)
  );
}

// ---------- Export helpers ----------

/**
 * A stored quantity pair as template values (unit, assigned, completed), exactly: LINES/AYAT/PAGES as whole numbers;
 * a Para amount in the largest preset both amounts are whole multiples of (e.g. Salasah 1), else Rubu quarters,
 * so the file imports back to the same values (NFR-XLS-004).
 */
export function templateQuantities(assigned: Quantity, completed: Quantity | null): { unit: TemplateUnit; assigned: number | string; completed: number | string | null } {
  if (assigned.unit !== 'PARA') return { unit: assigned.unit, assigned: assigned.numerator, completed: completed === null ? null : completed.numerator };
  const inUnit = (q: Quantity, size: { num: number; den: number }) => {
    // q / size = (q.n * size.den) / (q.d * size.num)
    const num = q.numerator * size.den;
    const den = q.denominator * size.num;
    return num % den === 0 ? num / den : null;
  };
  for (const unit of ['COMPLETE', 'SALASAH', 'HALF', 'RUBU'] as const) {
    const a = inUnit(assigned, PRESET_SIZE[unit]);
    const c = completed === null ? 0 : inUnit(completed, PRESET_SIZE[unit]);
    if (a !== null && c !== null && (unit !== 'COMPLETE' || a >= 1 || assigned.numerator === 0)) return { unit, assigned: a, completed: completed === null ? null : c };
  }
  // Quarters always fit a stored Para quantity (FR-QTY-002); this is unreachable for valid rows.
  return { unit: 'COMPLETE', assigned: `${assigned.numerator}/${assigned.denominator}`, completed: completed === null ? null : `${completed.numerator}/${completed.denominator}` };
}
