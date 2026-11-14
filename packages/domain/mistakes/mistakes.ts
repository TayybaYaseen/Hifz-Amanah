// F07 · Mistakes: shape, notes, and counts (FR-ATT-010…012, FR-QTY-008, FR-WKR-005; US-028…030; F07-AC1…AC5,
// AC14, AC15; DEC-B27, DEC-B28, DEC-B86). Pure rules, no I/O.
//
// - A mistake has exactly one category (a canonical, language-neutral value such as TAJWEED), a severity of MINOR or
//   MAJOR, and a separate `repeated` flag. Repeated is not a severity and never changes it.
// - A mistake may carry a short note (at most 200 characters, DEC-B86). The note is INTERNAL (staff only) by default;
//   SHARED makes it visible to the Student and Parent (FR-ATT-012, FR-PORT-003).
// - Counts: an attempt with mistakes counts them; "No mistakes" counts 0; an empty list without that choice is
//   "Not recorded" and is never 0 (FR-ATT-011). An imported `MistakeCount` stays uncategorized (SRS §15.1, F14).
import { MISTAKE_CATEGORIES, MISTAKE_NOTE_MAX, MISTAKE_SEVERITIES, MISTAKES_MAX, type MistakeCategory, type MistakeSeverity } from '../hifz/status.ts';

export { MISTAKE_CATEGORIES, MISTAKE_NOTE_MAX, MISTAKE_SEVERITIES, MISTAKES_MAX, type MistakeCategory, type MistakeSeverity };

/** INTERNAL: staff only (the default). SHARED: also shown to the Student and Parent (FR-ATT-012). */
export const NOTE_VISIBILITIES = ['INTERNAL', 'SHARED'] as const;
export type NoteVisibility = (typeof NOTE_VISIBILITIES)[number];
export const DEFAULT_NOTE_VISIBILITY: NoteVisibility = 'INTERNAL';

export const isMistakeCategory = (value: unknown): value is MistakeCategory => typeof value === 'string' && (MISTAKE_CATEGORIES as readonly string[]).includes(value);
export const isMistakeSeverity = (value: unknown): value is MistakeSeverity => typeof value === 'string' && (MISTAKE_SEVERITIES as readonly string[]).includes(value);
export const isNoteVisibility = (value: unknown): value is NoteVisibility => typeof value === 'string' && (NOTE_VISIBILITIES as readonly string[]).includes(value);

/** A stored mistake. */
export interface Mistake {
  category: MistakeCategory;
  severity: MistakeSeverity;
  repeated: boolean;
  /** Trimmed, 1–200 characters, or null. Internal staff text unless `noteVisibility` is SHARED. */
  note: string | null;
  noteVisibility: NoteVisibility;
}

export type MistakeIssue =
  | { field: 'category'; code: 'REQUIRED' | 'INVALID' }
  | { field: 'severity'; code: 'REQUIRED' | 'INVALID' }
  | { field: 'repeated'; code: 'INVALID' }
  | { field: 'note'; code: 'TOO_LONG'; max: number }
  | { field: 'note'; code: 'INVALID' }
  | { field: 'noteVisibility'; code: 'INVALID' };

/** A mistake as entered: anything may be missing or wrong until checked. */
export interface MistakeInput {
  category?: unknown;
  severity?: unknown;
  repeated?: unknown;
  note?: unknown;
  noteVisibility?: unknown;
}

/** A note as stored: trimmed, and an empty or blank note is no note. */
export function cleanNote(note: string | null | undefined): string | null {
  if (note === null || note === undefined) return null;
  const trimmed = note.trim();
  return trimmed.length === 0 ? null : trimmed;
}

/**
 * Checks one mistake (F07-AC1, AC4, AC5, AC15). Exactly one category from the six (a list of categories is INVALID);
 * severity MINOR or MAJOR only; `repeated` a boolean; the note at most 200 characters after trimming; visibility
 * INTERNAL or SHARED. Returns the stored form, with the defaults (repeated false, note null, INTERNAL) applied.
 */
export function checkMistake(input: MistakeInput): { ok: true; mistake: Mistake } | { ok: false; issues: MistakeIssue[] } {
  const issues: MistakeIssue[] = [];
  if (input.category === undefined || input.category === null) issues.push({ field: 'category', code: 'REQUIRED' });
  else if (!isMistakeCategory(input.category)) issues.push({ field: 'category', code: 'INVALID' });
  if (input.severity === undefined || input.severity === null) issues.push({ field: 'severity', code: 'REQUIRED' });
  else if (!isMistakeSeverity(input.severity)) issues.push({ field: 'severity', code: 'INVALID' });
  if (input.repeated !== undefined && typeof input.repeated !== 'boolean') issues.push({ field: 'repeated', code: 'INVALID' });
  let note: string | null = null;
  if (input.note !== undefined && input.note !== null) {
    if (typeof input.note !== 'string') issues.push({ field: 'note', code: 'INVALID' });
    else {
      note = cleanNote(input.note);
      if (note !== null && note.length > MISTAKE_NOTE_MAX) issues.push({ field: 'note', code: 'TOO_LONG', max: MISTAKE_NOTE_MAX });
    }
  }
  if (input.noteVisibility !== undefined && !isNoteVisibility(input.noteVisibility)) issues.push({ field: 'noteVisibility', code: 'INVALID' });
  if (issues.length > 0) return { ok: false, issues };
  return {
    ok: true,
    mistake: {
      category: input.category as MistakeCategory,
      severity: input.severity as MistakeSeverity,
      repeated: input.repeated === true,
      note,
      noteVisibility: (input.noteVisibility as NoteVisibility | undefined) ?? DEFAULT_NOTE_VISIBILITY,
    },
  };
}

/** Sets or clears Repeated. The severity, category, and note are unchanged (F07-AC5). */
export const withRepeated = <M extends { repeated: boolean }>(mistake: M, repeated: boolean): M => ({ ...mistake, repeated });

/** The note a Student or Parent may see: only a SHARED note; an INTERNAL one is absent (F07-AC15). */
export const noteForFamily = (mistake: { note: string | null; noteVisibility: NoteVisibility }): string | null =>
  mistake.noteVisibility === 'SHARED' ? mistake.note : null;

// ---------- Counts ----------

/** The attempt fields the counts need. */
export interface CountableAttempt {
  noMistakes: boolean;
  mistakes: readonly { category: MistakeCategory; severity: MistakeSeverity; repeated: boolean }[];
  /** An imported uncategorized `MistakeCount` (F14), or null. Never split into categories. */
  uncategorizedCount?: number | null;
}

export type MistakeCountState = { kind: 'COUNT'; count: number } | { kind: 'NOT_RECORDED' };

/**
 * One attempt's mistake count (FR-ATT-011, F07-AC14): the listed mistakes plus any imported uncategorized count; 0 only
 * for an explicit "No mistakes"; otherwise "Not recorded", never 0.
 */
export function attemptMistakeCount(attempt: CountableAttempt): MistakeCountState {
  const uncategorized = attempt.uncategorizedCount ?? null;
  if (attempt.mistakes.length > 0 || uncategorized !== null) return { kind: 'COUNT', count: attempt.mistakes.length + (uncategorized ?? 0) };
  return attempt.noMistakes ? { kind: 'COUNT', count: 0 } : { kind: 'NOT_RECORDED' };
}

export interface MistakeCounts {
  /** Per category, every category present (0 when none of that category was recorded on a recorded attempt). */
  byCategory: Record<MistakeCategory, number>;
  /** Imported uncategorized totals, shown apart from the categories (SRS §15.1). */
  uncategorized: number;
  /** MAJOR mistakes and Repeated mistakes, counted separately (a Repeated MINOR is still MINOR). */
  major: number;
  minor: number;
  repeated: number;
  /** Categorized + uncategorized. */
  total: number;
  /** Attempts with a known count (mistakes listed, imported count, or "No mistakes"). */
  recordedAttempts: number;
  /** Attempts with an explicit "No mistakes" (count 0). */
  noMistakesAttempts: number;
  /** Attempts whose mistakes were not recorded; they add nothing and are never read as 0. */
  notRecordedAttempts: number;
}

/**
 * Mistake counts over a period's attempts, grouped by category (F07-AC3, FR-WKR-005). Each attempt's mistakes count
 * once: a mistake belongs to the attempt it was recorded on. "Not recorded" attempts are counted apart.
 */
export function mistakeCounts(attempts: readonly CountableAttempt[]): MistakeCounts {
  const byCategory = Object.fromEntries(MISTAKE_CATEGORIES.map((c) => [c, 0])) as Record<MistakeCategory, number>;
  let uncategorized = 0;
  let major = 0;
  let minor = 0;
  let repeated = 0;
  let recordedAttempts = 0;
  let noMistakesAttempts = 0;
  let notRecordedAttempts = 0;
  for (const a of attempts) {
    const state = attemptMistakeCount(a);
    if (state.kind === 'NOT_RECORDED') {
      notRecordedAttempts += 1;
      continue;
    }
    recordedAttempts += 1;
    if (state.count === 0) noMistakesAttempts += 1;
    uncategorized += a.uncategorizedCount ?? 0;
    for (const m of a.mistakes) {
      byCategory[m.category] += 1;
      if (m.severity === 'MAJOR') major += 1;
      else minor += 1;
      if (m.repeated) repeated += 1;
    }
  }
  const categorized = MISTAKE_CATEGORIES.reduce((n, c) => n + byCategory[c], 0);
  return { byCategory, uncategorized, major, minor, repeated, total: categorized + uncategorized, recordedAttempts, noMistakesAttempts, notRecordedAttempts };
}
