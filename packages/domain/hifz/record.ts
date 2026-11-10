// F05 · Daily records: the report date and the daily-report mode (FR-DAY-001, FR-DAY-008, DEC-B24; ARCHITECTURE
// §6.4; US-018, US-019). Pure rules, no I/O.
import { calendarDateIn, compareDates, isCalendarDate } from '../roster/dates.ts';
import { defineFieldSpec } from '../sync/fields.ts';

export const DAILY_REPORT_MODES = ['SINGLE', 'MULTI_SESSION'] as const;
export type DailyReportMode = (typeof DAILY_REPORT_MODES)[number];

/** Session labels: trimmed, 1–40 characters, compared case-insensitively (plan §7.1). */
export const SESSION_LABEL_MAX = 40;

// ---------- Report date (F05-AC1, AC2, AC17) ----------

/**
 * True when `reportDate` is after `today` (both calendar dates in the madrasa's timezone). Daily records are never
 * for future dates; back-dated entry is allowed (FR-DAY-001, F05-AC17).
 */
export function isFutureDate(reportDate: string, today: string): boolean {
  if (!isCalendarDate(reportDate) || !isCalendarDate(today)) throw new RangeError('not a calendar date');
  return compareDates(reportDate, today) > 0;
}

/** Same check from an instant: today is the calendar date of `now` in the madrasa's IANA timezone. */
export const isFutureReportDate = (reportDate: string, now: Date, timeZone: string): boolean => isFutureDate(reportDate, calendarDateIn(now, timeZone));

// ---------- Session labels and the report mode (F05-AC6…AC8) ----------

/** Trims the label; blank becomes null. The stored label keeps the Teacher's spelling. */
export function normalizeSessionLabel(label: string | null | undefined): string | null {
  const t = label?.trim();
  return t ? t : null;
}

/** The comparison key of a label: case-insensitive, like the database's `lower(session_label)` index. */
export const sessionLabelKey = (label: string): string => label.trim().toLowerCase();

export interface ExistingRecord {
  id: string;
  sessionLabel: string | null;
}

export type NewRecordCheck =
  | { ok: true; sessionLabel: string | null }
  /** SINGLE: the student already has a record on the date; the app opens it (F05-AC6). */
  | { ok: false; code: 'DUPLICATE_RECORD'; existingId: string }
  /** MULTI_SESSION: the label is taken on that date (compared case-insensitively). */
  | { ok: false; code: 'DUPLICATE_SESSION'; existingId: string }
  | { ok: false; code: 'SESSION_LABEL_REQUIRED' | 'SESSION_LABEL_NOT_ALLOWED' }
  | { ok: false; code: 'SESSION_LABEL_TOO_LONG'; max: number };

/**
 * Whether a new record for a student/date may be created, given the records already on that date (FR-DAY-008):
 * - SINGLE: no session label, and no other record on the date (F05-AC6);
 * - MULTI_SESSION: a label is required, and no record on the date has the same label (F05-AC7).
 */
export function checkNewRecord(mode: DailyReportMode, existingOnDate: readonly ExistingRecord[], sessionLabel: string | null | undefined): NewRecordCheck {
  const label = normalizeSessionLabel(sessionLabel);
  if (mode === 'SINGLE') {
    if (label !== null) return { ok: false, code: 'SESSION_LABEL_NOT_ALLOWED' };
    const first = existingOnDate[0];
    return first ? { ok: false, code: 'DUPLICATE_RECORD', existingId: first.id } : { ok: true, sessionLabel: null };
  }
  if (label === null) return { ok: false, code: 'SESSION_LABEL_REQUIRED' };
  if (label.length > SESSION_LABEL_MAX) return { ok: false, code: 'SESSION_LABEL_TOO_LONG', max: SESSION_LABEL_MAX };
  const key = sessionLabelKey(label);
  const taken = existingOnDate.find((r) => r.sessionLabel !== null && sessionLabelKey(r.sessionLabel) === key);
  return taken ? { ok: false, code: 'DUPLICATE_SESSION', existingId: taken.id } : { ok: true, sessionLabel: label };
}

export interface ModeRecord {
  id: string;
  studentId: string;
  reportDate: string;
  sessionLabel: string | null;
}

export interface ModeConflict {
  studentId: string;
  reportDate: string;
  recordIds: string[];
  /** The labels on that date, as stored (null for an unlabelled record). */
  sessionLabels: (string | null)[];
}

/**
 * Student/date pairs with more than one record (F05-AC8). Switching to SINGLE is blocked while any exist; the list is
 * what the Admin sees. Ordered by date, then student; records within a pair by label.
 */
export function modeSwitchConflicts(records: readonly ModeRecord[]): ModeConflict[] {
  const groups = new Map<string, ModeRecord[]>();
  for (const r of records) {
    const key = `${r.reportDate}\u0000${r.studentId}`;
    const list = groups.get(key);
    if (list) list.push(r);
    else groups.set(key, [r]);
  }
  const conflicts: ModeConflict[] = [];
  for (const list of groups.values()) {
    if (list.length < 2) continue;
    const sorted = [...list].sort((a, b) => (a.sessionLabel ?? '').localeCompare(b.sessionLabel ?? '') || a.id.localeCompare(b.id));
    const first = sorted[0] as ModeRecord;
    conflicts.push({ studentId: first.studentId, reportDate: first.reportDate, recordIds: sorted.map((r) => r.id), sessionLabels: sorted.map((r) => r.sessionLabel) });
  }
  return conflicts.sort((a, b) => compareDates(a.reportDate, b.reportDate) || a.studentId.localeCompare(b.studentId));
}

export type ModeSwitchCheck = { ok: true } | { ok: false; code: 'MODE_CONFLICTS'; conflicts: ModeConflict[] };

/** Switching to MULTI_SESSION is always allowed; switching to SINGLE only without conflicts (ARCHITECTURE §6.4). */
export function checkModeSwitch(target: DailyReportMode, records: readonly ModeRecord[]): ModeSwitchCheck {
  if (target === 'MULTI_SESSION') return { ok: true };
  const conflicts = modeSwitchConflicts(records);
  return conflicts.length === 0 ? { ok: true } : { ok: false, code: 'MODE_CONFLICTS', conflicts };
}

// ---------- Sync field classes (F12 plan Q4/Q5) ----------

/**
 * `daily_record`: student, class, and date are set on create only (moving a record is not supported); the session
 * label is the only editable field.
 */
export const DAILY_RECORD_FIELDS = defineFieldSpec({ entity: 'daily_record' });

/**
 * `lesson_portion`: the Para, range, Total Lines (and its source), and assigned quantity are one coupled group, so a
 * merge never pairs one side's range with the other side's lines. `removed` and `position` are separate meaningful
 * fields.
 */
export const LESSON_PORTION_FIELDS = defineFieldSpec({
  entity: 'lesson_portion',
  groups: [['paraNumber', 'range', 'totalLines', 'totalLinesSource', 'assigned']],
});

/**
 * `portion_attempt`: status, completed quantity, quality, "No mistakes", and the mistake list conflict as one group
 * (F12 fields.ts); remarks and the attempt time are separate meaningful fields.
 */
export const PORTION_ATTEMPT_FIELDS = defineFieldSpec({
  entity: 'portion_attempt',
  groups: [['status', 'completed', 'quality', 'noMistakes', 'mistakes']],
});
