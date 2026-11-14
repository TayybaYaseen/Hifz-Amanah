// F11 · Localization and accessibility — unit: direction and bidi helpers (docs/specs/02-f11-localization-accessibility.md)
import { describe, expect, it } from 'vitest';
import { LOCALES } from '@hifz/contracts';
import { directionOf, isolate, resolveLocale, surahRange } from './direction.ts';
import { quranTextContent } from './quran.ts';

describe('F11 · direction', () => {
  it('F11-AC1 (US-047) en is left to right (AC-I18N-01)', () => {
    expect(directionOf('en')).toBe('ltr');
  });
  it('F11-AC2 (US-048) ur is right to left (AC-I18N-02)', () => {
    expect(directionOf('ur')).toBe('rtl');
  });
  it('F11-AC3 (US-049) ur-Latn is left to right (AC-I18N-03)', () => {
    expect(directionOf('ur-Latn')).toBe('ltr');
  });
});

describe('F11 · bidi', () => {
  it('F11-AC9 (US-050) "البقرة 2:255–260" is isolated so it reads correctly in English and Urdu sentences (AC-I18N-06)', () => {
    const isolated = surahRange('البقرة', 2, 255, 260);
    // First-strong isolate around the reference, and a left-to-right isolate around "2:255–260": the run keeps its
    // own direction inside either sentence, and the numbers keep their order inside the Arabic run.
    expect(isolated).toBe('⁨البقرة ⁦2:255–260⁩⁩');
    for (const sentence of [`Sabaq: ${isolated}.`, `سبق: ${isolated}۔`]) {
      expect(sentence.replace(/[⁦⁧⁨⁩]/g, '')).toContain('البقرة 2:255–260');
    }
  });
  it('F11-AC8 (US-050) Arabic text passes through unchanged in every locale', () => {
    const ayah = 'ٱللَّهُ لَآ إِلَٰهَ إِلَّا هُوَ ٱلۡحَيُّ ٱلۡقَيُّومُ';
    // A string that NFC normalization would change: it must still come out exactly as stored.
    const surah = 'البقرة';
    const unnormalized = 'اَلْبَقَرَةُ'.normalize('NFD');
    for (const _locale of LOCALES) {
      // What QuranText renders does not depend on the interface language.
      for (const stored of [ayah, surah, unnormalized]) {
        expect(quranTextContent(stored, false)).toBe(stored);
        // Isolation adds marks around the text and never alters a character of it (no normalization).
        expect(quranTextContent(stored, true).slice(1, -1)).toBe(stored);
        expect(isolate(stored).slice(1, -1)).toBe(stored);
      }
    }
  });
});

describe('F11 · fallback', () => {
  it('F11 unit: an unsupported device locale falls back to a supported locale', () => {
    expect(resolveLocale(['fr-FR', 'de-DE'])).toBe('en');
    expect(resolveLocale([])).toBe('en');
    expect(resolveLocale(['ur-PK'])).toBe('ur');
    expect(resolveLocale(['ur-Latn-PK'])).toBe('ur-Latn');
    expect(resolveLocale(['fr-FR', 'ur-IN'])).toBe('ur');
  });
});
