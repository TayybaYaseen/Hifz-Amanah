// F11 · Localization and accessibility — unit: direction and bidi helpers (docs/specs/02-f11-localization-accessibility.md)
import { describe, expect, it } from 'vitest';
import { directionOf, isolate, resolveLocale } from './direction.ts';

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
    const range = 'البقرة 2:255–260';
    const isolated = isolate(range);
    // First-strong isolate … pop directional isolate: the run keeps its own direction inside either sentence.
    expect(isolated).toBe(`⁨${range}⁩`);
    expect(`Sabaq: ${isolated}`).toContain(range);
    expect(`سبق: ${isolated}`).toContain(range);
  });
  it('F11-AC8 (US-050) Arabic text passes through unchanged in every locale', () => {
    const ayah = 'ٱللَّهُ لَآ إِلَٰهَ إِلَّا هُوَ ٱلۡحَيُّ ٱلۡقَيُّومُ';
    // Isolation adds marks around the text and never alters a character of it (no normalization).
    expect(isolate(ayah).slice(1, -1)).toBe(ayah);
    expect(isolate(ayah).slice(1, -1).normalize('NFC') === ayah.normalize('NFC')).toBe(true);
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
