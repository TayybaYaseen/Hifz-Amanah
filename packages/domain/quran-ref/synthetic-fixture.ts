// SYNTHETIC TEST DATA — NOT QURAN METADATA. Never ship, seed, or display this outside tests.
//
// Every value here is invented so tests can exercise the rules without using real Quran metadata: every Surah has
// 20 Ayat, names are "اختبار n" ("test n") / "Synthetic n", and the 30 Paras split the 114 Surahs evenly. None of it
// matches the Quran. The production seed comes only from an approved, reviewed dataset (FR-SAB-007, DEC-B31).
// Not exported from the package index on purpose; tests import this file by path.
import type { LayoutLine, ParaBoundary, SurahRecord } from './range.ts';
import { SEED_FORMAT, SEED_FORMAT_VERSION, type QuranSeedV1, type QuranSeedV2, type SeedLineV2 } from './metadata.ts';

export const SYNTHETIC_AYAH_COUNT = 20;

export const syntheticSurahs = (): SurahRecord[] =>
  Array.from({ length: 114 }, (_, i) => ({
    number: i + 1,
    nameAr: `اختبار ${i + 1}`,
    nameTranslit: `Synthetic ${i + 1}`,
    ayahCount: SYNTHETIC_AYAH_COUNT,
  }));

/** 30 contiguous Paras over the synthetic Surahs: Para k starts at Surah floor((k−1)·114/30)+1, Ayat 1. */
export const syntheticParas = (): ParaBoundary[] => {
  const startSurah = (k: number) => Math.floor(((k - 1) * 114) / 30) + 1;
  return Array.from({ length: 30 }, (_, i) => {
    const k = i + 1;
    const endSurah = k === 30 ? 114 : startSurah(k + 1) - 1;
    return { number: k, start: { surah: startSurah(k), ayah: 1 }, end: { surah: endSurah, ayah: SYNTHETIC_AYAH_COUNT } };
  });
};

/** A synthetic 16-line layout for the first `surahs` Surahs: 2 Ayat per line, one header line per Surah skipped. */
export const syntheticLayout = (surahs = 3, linesPerPage = 16): LayoutLine[] => {
  const lines: LayoutLine[] = [];
  let page = 1;
  let line = 1;
  const advance = () => {
    line += 1;
    if (line > linesPerPage) {
      line = 1;
      page += 1;
    }
  };
  for (let s = 1; s <= surahs; s++) {
    advance(); // the Surah-name line has no layout row
    for (let a = 1; a <= SYNTHETIC_AYAH_COUNT; a += 2) {
      lines.push({ page, line, surah: s, ayahStart: a, ayahEnd: a + 1 });
      advance();
    }
  }
  return lines;
};

export const syntheticSeed = (overrides: Partial<QuranSeedV1> = {}): QuranSeedV1 => ({
  format: SEED_FORMAT,
  formatVersion: SEED_FORMAT_VERSION,
  datasetKey: 'synthetic-test',
  datasetVersion: '1',
  provenance: { sourceName: 'Synthetic test fixture', sourceUrl: null, licence: 'Test data, not Quran metadata', reviewedBy: null, approvedOn: null, synthetic: true },
  metadata: { surahs: syntheticSurahs(), paras: syntheticParas() },
  layouts: [{ edition: 'INDOPAK_16_LINE', linesPerPage: 16, lines: syntheticLayout() }],
  ...overrides,
});

// ---------- Format 2 (typed lines with word positions; ADR-017 §6.1) ----------
// Invented shapes only: every synthetic Ayat has SYNTHETIC_WORDS_PER_AYAH "words" and a line holds
// SYNTHETIC_WORDS_PER_LINE of them, so Ayat break across lines; each Surah gets a heading line and a Bismillah line.
// Word IDs are 1, 2, 3, … across the fixture. None of it describes a real Mushaf page.

export const SYNTHETIC_WORDS_PER_AYAH = 6;
export const SYNTHETIC_WORDS_PER_LINE = 8;

export const syntheticLayoutV2 = (surahs = 3, linesPerPage = 16): SeedLineV2[] => {
  const lines: SeedLineV2[] = [];
  let page = 1;
  let line = 0;
  let wordId = 0;
  const next = () => {
    line += 1;
    if (line > linesPerPage) {
      line = 1;
      page += 1;
    }
    return { page, line };
  };
  for (let s = 1; s <= surahs; s++) {
    lines.push({ ...next(), lineType: 'SURAH_NAME', isCentered: true, surah: s });
    lines.push({ ...next(), lineType: 'BASMALLAH', isCentered: true, surah: s });
    const total = SYNTHETIC_AYAH_COUNT * SYNTHETIC_WORDS_PER_AYAH;
    for (let first = 0; first < total; first += SYNTHETIC_WORDS_PER_LINE) {
      const last = Math.min(first + SYNTHETIC_WORDS_PER_LINE, total) - 1;
      const at = (k: number) => ({ ayah: Math.floor(k / SYNTHETIC_WORDS_PER_AYAH) + 1, word: (k % SYNTHETIC_WORDS_PER_AYAH) + 1 });
      const a = at(first);
      const b = at(last);
      lines.push({
        ...next(),
        lineType: 'AYAH',
        isCentered: false,
        surah: s,
        ayahStart: a.ayah,
        wordStart: a.word,
        ayahEnd: b.ayah,
        wordEnd: b.word,
        srcFirstWordId: wordId + 1,
        srcLastWordId: wordId + (last - first + 1),
      });
      wordId += last - first + 1;
    }
  }
  return lines;
};

export const syntheticSeedV2 = (overrides: Partial<QuranSeedV2> = {}): QuranSeedV2 => ({
  format: SEED_FORMAT,
  formatVersion: 2,
  datasetKey: 'synthetic-test-v2',
  datasetVersion: '1',
  provenance: { sourceName: 'Synthetic test fixture', sourceUrl: null, licence: 'Test data, not Quran metadata', reviewedBy: null, approvedOn: null, synthetic: true },
  sources: [],
  validationReport: null,
  metadata: { surahs: syntheticSurahs(), paras: syntheticParas() },
  layouts: [{ edition: 'INDOPAK_16_LINE', linesPerPage: 16, lines: syntheticLayoutV2() }],
  ...overrides,
});

/** A synthetic SHA-256-shaped value (not the hash of anything). */
export const syntheticSha = (n: number): string => n.toString(16).padStart(64, '0');
