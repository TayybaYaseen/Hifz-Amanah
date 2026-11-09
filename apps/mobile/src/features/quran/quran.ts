// F06 · Quran metadata in the app: form checks and message keys (US-024…026; F06-AC1…AC4, AC6, AC19). Plain
// TypeScript, unit-tested. The rules themselves are @hifz/domain/quran-ref's; this file only turns their issues and the
// API's into i18n keys. The server re-checks everything.
//
// Arabic names are passed through exactly as typed: nothing here trims, normalizes, or transliterates them (BR-15).
import type { MetadataFindingView, ParaView, SurahView } from '@hifz/contracts';
import { parseWhole } from '@hifz/domain/quantity';
import { validateParaBoundary, validateSurah, type MetadataIssue, type SurahMeta } from '@hifz/domain/quran-ref';

/** An i18n key with its ICU values. */
export interface Message {
  key: string;
  values?: Record<string, string | number>;
}

/** A domain issue as a field message. A limit is named when the rule gives one (F06-AC6). */
export function issueMessage(issue: { code: string; max?: number }): Message {
  if (issue.code === 'OUT_OF_RANGE' && issue.max !== undefined) return { key: 'fields.OUT_OF_RANGE_MAX', values: { max: issue.max } };
  if (issue.code === 'NOT_WHOLE') return { key: 'quran.form.wholeNumber' };
  const known = ['REQUIRED', 'TOO_LONG', 'OUT_OF_RANGE', 'END_BEFORE_START', 'UNKNOWN_SURAH', 'UNKNOWN'];
  return { key: known.includes(issue.code) ? `fields.${issue.code}` : 'fields.INVALID' };
}

export interface SurahDraft {
  number: string;
  nameAr: string;
  nameTranslit: string;
  ayahCount: string;
}

export interface SurahRequest {
  number: number;
  body: { nameAr: string; nameTranslit: string; ayahCount: number; rowVersion: number | null };
}

/**
 * Checks a Surah form with the shared rule. Numbers must be typed as whole numbers (no "2.5"). The Arabic name goes
 * to the server exactly as typed (F06-AC3).
 */
export function checkSurah(draft: SurahDraft, existing: SurahView | null): { request: SurahRequest | null; errors: Record<string, Message> } {
  const errors: Record<string, Message> = {};
  const number = parseWhole(draft.number);
  const ayahCount = parseWhole(draft.ayahCount);
  if (number === null) errors.number = { key: draft.number.trim() ? 'quran.form.wholeNumber' : 'fields.REQUIRED' };
  if (ayahCount === null) errors.ayahCount = { key: draft.ayahCount.trim() ? 'quran.form.wholeNumber' : 'fields.REQUIRED' };
  const issues: MetadataIssue[] = validateSurah({ number: number ?? 1, nameAr: draft.nameAr, nameTranslit: draft.nameTranslit, ayahCount: ayahCount ?? 1 });
  for (const issue of issues) {
    if (issue.field === 'number' && number === null) continue;
    if (issue.field === 'ayahCount' && ayahCount === null) continue;
    errors[issue.field] ??= issueMessage(issue);
  }
  if (Object.keys(errors).length || number === null || ayahCount === null) return { request: null, errors };
  return {
    request: { number, body: { nameAr: draft.nameAr, nameTranslit: draft.nameTranslit, ayahCount, rowVersion: existing?.rowVersion ?? null } },
    errors,
  };
}

export interface ParaDraft {
  number: string;
  startSurah: string;
  startAyah: string;
  endSurah: string;
  endAyah: string;
}

export interface ParaRequest {
  number: number;
  body: { start: { surah: number; ayah: number }; end: { surah: number; ayah: number }; rowVersion: number | null };
}

/** Checks a Para boundary against the madrasa's Surahs (F06-AC4: an end before the start is refused). */
export function checkPara(draft: ParaDraft, existing: ParaView | null, surahs: readonly SurahMeta[]): { request: ParaRequest | null; errors: Record<string, Message> } {
  const errors: Record<string, Message> = {};
  const parsed: Record<keyof ParaDraft, number | null> = {
    number: parseWhole(draft.number),
    startSurah: parseWhole(draft.startSurah),
    startAyah: parseWhole(draft.startAyah),
    endSurah: parseWhole(draft.endSurah),
    endAyah: parseWhole(draft.endAyah),
  };
  for (const key of Object.keys(parsed) as (keyof ParaDraft)[]) {
    if (parsed[key] === null) errors[key] = { key: draft[key].trim() ? 'quran.form.wholeNumber' : 'fields.REQUIRED' };
  }
  if (Object.keys(errors).length) return { request: null, errors };
  const boundary = {
    number: parsed.number!,
    start: { surah: parsed.startSurah!, ayah: parsed.startAyah! },
    end: { surah: parsed.endSurah!, ayah: parsed.endAyah! },
  };
  for (const issue of validateParaBoundary(boundary, surahs)) {
    // The domain names the side ("start"/"end"); the form shows Surah problems on the Surah box, others on the Ayat box.
    const field = issue.field === 'number' ? 'number' : `${issue.field}${issue.code === 'UNKNOWN_SURAH' ? 'Surah' : 'Ayah'}`;
    errors[field] ??= issueMessage(issue);
  }
  if (Object.keys(errors).length) return { request: null, errors };
  return { request: { number: boundary.number, body: { start: boundary.start, end: boundary.end, rowVersion: existing?.rowVersion ?? null } }, errors };
}

/** Maps an API `fields` key for a Para to the form box it belongs to. */
export const paraFieldOf = (apiField: string, issue: string): string => {
  if (apiField === 'start' || apiField === 'end') return `${apiField}${issue === 'UNKNOWN_SURAH' ? 'Surah' : 'Ayah'}`;
  if (apiField === 'start.surah' || apiField === 'end.surah') return `${apiField.split('.')[0]}Surah`;
  if (apiField === 'start.ayah' || apiField === 'end.ayah') return `${apiField.split('.')[0]}Ayah`;
  return apiField;
};

/** What a review finding says, as a message (F06-AC19). */
export function findingMessage(finding: MetadataFindingView): Message {
  switch (finding.code) {
    case 'MISSING_SURAHS':
      return { key: 'quran.review.missingSurahs', values: { count: finding.numbers.length, list: compactList(finding.numbers) } };
    case 'MISSING_PARAS':
      return { key: 'quran.review.missingParas', values: { count: finding.numbers.length, list: compactList(finding.numbers) } };
    case 'PARA_INVALID':
      return { key: 'quran.review.paraInvalid', values: { para: finding.para } };
    case 'PARA_OVERLAP':
      return { key: 'quran.review.paraOverlap', values: { para: finding.para, next: finding.next } };
    case 'PARA_GAP':
      return { key: 'quran.review.paraGap', values: { para: finding.para, next: finding.next } };
    case 'LAYOUT_MISSING':
      return { key: 'quran.review.layoutMissing' };
  }
}

/** "1–3, 5, 7–9": runs of consecutive numbers collapsed, so 114 missing Surahs fit on one line. */
export function compactList(numbers: readonly number[]): string {
  const sorted = [...new Set(numbers)].sort((a, b) => a - b);
  const parts: string[] = [];
  for (let i = 0; i < sorted.length; ) {
    let j = i;
    while (j + 1 < sorted.length && sorted[j + 1] === sorted[j]! + 1) j++;
    parts.push(i === j ? `${sorted[i]}` : `${sorted[i]}–${sorted[j]}`);
    i = j + 1;
  }
  return parts.join(', ');
}

/** "2:142" — Surah and Ayat as canonical digits (Western 0–9 in every locale, DEC-B38). */
export const refText = (ref: { surah: number; ayah: number }): string => `${ref.surah}:${ref.ayah}`;
