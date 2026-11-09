// F06 · The Surah/Ayat range fields' logic (US-025; FR-SAB-001, FR-SAB-008, FR-SAB-009; F06-AC6, AC7, AC22, AC24).
// Pure: the screen shows what this returns and never computes a rule itself (AGENTS §11). The rules are
// packages/domain's `evaluateRange`, the same function the server runs, on the device's cached snapshot.
//
// Without a snapshot the device cannot check the range offline: it says so and leaves the check to the server on
// sync (FR-SAB-009). Total Lines is then entered by hand, which is always allowed (FR-SAB-008).
import { canCheckOffline, evaluateRange, lineCountSource, type LineCountSource, type RangeEvaluation, type ReferenceIndex } from '@hifz/domain/quran-ref';

export interface RangeDraft {
  surah: string;
  ayahStart: string;
  ayahEnd: string;
}

/** A field's text as a whole number; '' is empty (null), anything else not whole is NOT_WHOLE. Western digits only. */
export function parseWhole(text: string): number | null | 'NOT_WHOLE' {
  const t = text.trim();
  if (t === '') return null;
  return /^\d{1,4}$/.test(t) ? Number(t) : 'NOT_WHOLE';
}

export type RangeCheck =
  /** Some field is still empty. */
  | { state: 'INCOMPLETE'; fieldErrors: Record<string, { code: string; max?: number }> }
  /** No usable reference data on the device for this Surah: checked by the server when the record syncs. */
  | { state: 'UNCHECKED'; fieldErrors: Record<string, { code: string; max?: number }> }
  | { state: 'CHECKED'; evaluation: RangeEvaluation; fieldErrors: Record<string, { code: string; max?: number }> };

export function checkRange(draft: RangeDraft, index: ReferenceIndex | null): RangeCheck {
  const values = { surah: parseWhole(draft.surah), ayahStart: parseWhole(draft.ayahStart), ayahEnd: parseWhole(draft.ayahEnd) };
  const fieldErrors: Record<string, { code: string; max?: number }> = {};
  for (const [field, v] of Object.entries(values)) if (v === 'NOT_WHOLE') fieldErrors[field] = { code: 'NOT_WHOLE' };
  if (Object.keys(fieldErrors).length) return { state: 'INCOMPLETE', fieldErrors };
  if (values.surah === null || values.ayahStart === null || values.ayahEnd === null) return { state: 'INCOMPLETE', fieldErrors };
  if (!index || index.surahs.length === 0 || !canCheckOffline(values.surah as number, index)) return { state: 'UNCHECKED', fieldErrors };
  const evaluation = evaluateRange({ surah: values.surah as number, ayahStart: values.ayahStart as number, ayahEnd: values.ayahEnd as number }, index);
  for (const issue of evaluation.issues) {
    fieldErrors[issue.field] ??= { code: issue.code, ...('max' in issue && issue.max !== undefined ? { max: issue.max } : {}) };
  }
  return { state: 'CHECKED', evaluation, fieldErrors };
}

/** Where the confirmed Total Lines came from (stored with the portion in F05): the layout pre-fill, or by hand. */
export function totalLinesSource(prefilled: number | null, confirmedText: string): LineCountSource | null {
  const confirmed = parseWhole(confirmedText);
  if (confirmed === null || confirmed === 'NOT_WHOLE') return null;
  return lineCountSource(prefilled, confirmed);
}
