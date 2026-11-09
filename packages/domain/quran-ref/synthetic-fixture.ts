// SYNTHETIC TEST DATA — NOT QURAN METADATA. Never ship, seed, or display this outside tests.
//
// Every value here is invented so tests can exercise the rules without using real Quran metadata: every Surah has
// 20 Ayat, names are "اختبار n" ("test n") / "Synthetic n", and the 30 Paras split the 114 Surahs evenly. None of it
// matches the Quran. The production seed comes only from an approved, reviewed dataset (FR-SAB-007, DEC-B31).
// Not exported from the package index on purpose; tests import this file by path.
import type { LayoutLine, ParaBoundary, SurahRecord } from './range.ts';
import { SEED_FORMAT, SEED_FORMAT_VERSION, type QuranSeed } from './metadata.ts';

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

export const syntheticSeed = (overrides: Partial<QuranSeed> = {}): QuranSeed => ({
  format: SEED_FORMAT,
  formatVersion: SEED_FORMAT_VERSION,
  datasetKey: 'synthetic-test',
  datasetVersion: '1',
  provenance: { sourceName: 'Synthetic test fixture', sourceUrl: null, licence: 'Test data, not Quran metadata', reviewedBy: null, approvedOn: null, synthetic: true },
  metadata: { surahs: syntheticSurahs(), paras: syntheticParas() },
  layouts: [{ edition: 'INDOPAK_16_LINE', linesPerPage: 16, lines: syntheticLayout() }],
  ...overrides,
});
