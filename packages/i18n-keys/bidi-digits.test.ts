// F11 · Localization and accessibility — unit: bidi isolation and Western digits
// (docs/specs/02-f11-localization-accessibility.md)
import { describe, expect, it } from 'vitest';
import { LOCALES } from '@hifz/contracts';
import {
  FSI,
  LRI,
  PDI,
  formatCalendarDate,
  formatNumber,
  formatTime,
  isolate,
  isolateLtr,
  stripIsolation,
  surahRange,
  toWesternDigits,
} from './src/index.ts';

describe('F11 · bidi', () => {
  it('F11-AC9 (US-050) a Surah range holds its numbers left to right inside a right-to-left run (AC-I18N-06)', () => {
    const range = surahRange('البقرة', 2, 255, 260);
    // The whole reference is isolated, and so is "2:255–260", so the dash cannot reorder it as "260–2:255".
    expect(range).toBe(`${FSI}البقرة ${LRI}2:255–260${PDI}${PDI}`);
    expect(stripIsolation(range)).toBe('البقرة 2:255–260');
    expect(stripIsolation(surahRange('الفاتحة', 1, 7))).toBe('الفاتحة 1:7');
  });

  it('F11 unit: isolation adds marks around text and never changes a character of it', () => {
    const name = 'محمد عبداللہ';
    expect(isolate(name)).toBe(`${FSI}${name}${PDI}`);
    expect(isolateLtr('teacher-a1')).toBe(`${LRI}teacher-a1${PDI}`);
    expect(stripIsolation(isolate(name))).toBe(name);
  });
});

describe('F11 · Western digits', () => {
  it('F11-AC14 (US-048) numbers, dates, and times use Western digits in every locale (FR-I18N-009)', () => {
    for (const locale of LOCALES) {
      for (const text of [
        formatNumber(locale, 1234),
        formatNumber(locale, 15),
        formatCalendarDate(locale, '2026-11-06'),
        formatTime(locale, '2026-11-06T09:05:00Z', 'Asia/Karachi'),
      ]) {
        expect(text, `${locale} ${text}`).toMatch(/[0-9]/);
        expect(text, `${locale} ${text}`).not.toMatch(/[٠-٩۰-۹]/);
      }
    }
    expect(formatTime('ur', '2026-11-06T09:05:00Z', 'Asia/Karachi')).toMatch(/02:05/);
  });

  it('F11 unit: Urdu and Arabic-Indic digits convert to 0–9', () => {
    expect(toWesternDigits('۰۱۲۳۴۵۶۷۸۹')).toBe('0123456789');
    expect(toWesternDigits('٠١٢٣٤٥٦٧٨٩')).toBe('0123456789');
    expect(toWesternDigits('Para 5')).toBe('Para 5');
  });

  it('F11 unit: a calendar date never shifts by the device timezone', () => {
    // A shift west of UTC would show 31 Dec 2025.
    const text = formatCalendarDate('en', '2026-01-01');
    expect(text).toMatch(/Jan/);
    expect(text).toMatch(/2026/);
    expect(text).not.toMatch(/31|Dec|2025/);
  });
});
