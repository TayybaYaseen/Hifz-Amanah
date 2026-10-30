// F06 · Quran portions — unit: Quran reference validation (docs/specs/07-f06-quran-portions-metadata/)
import { describe, it } from 'vitest';

describe('F06 · Para', () => {
  it.todo('F06-AC5 (US-025) Para 1–30 is accepted; Para 0 and Para 31 are rejected');
});

describe('F06 · Ayat range', () => {
  it.todo('F06-AC6 (US-025) Ayat 3–9 in a 7-Ayat Surah is rejected with an error naming the maximum Ayat');
  it.todo('F06-AC7 (US-025) an end Ayat before the start Ayat is rejected');
  it.todo('F06 property: every range within 1..ayatCount with start ≤ end is accepted');
});

describe('F06 · metadata', () => {
  it.todo('F06-AC4 (US-024) a Para boundary whose end is before its start is rejected');
  it.todo('F06-AC3 (US-024) an Arabic Surah name is kept byte-identical (no normalization or transliteration)');
});
