// SYNTHETIC TEST SOURCES — NOT QURAN DATA. Never ship, register as real, or import into production.
//
// Builds source files in the provider's published shapes (Surah list, Juz list, layout `pages` rows, word-by-word
// `words` rows) from the domain's synthetic fixture: 20 Ayat per Surah, 6 invented "words" per Ayat, 8 words per line.
// Word text is the placeholder "synthetic-word-n" (never Quran text), so tests can prove the converter discards it.
import { syntheticLayoutV2, syntheticParas, syntheticSurahs, SYNTHETIC_AYAH_COUNT, SYNTHETIC_WORDS_PER_AYAH } from '@hifz/domain/quran-ref/synthetic-fixture';
import type { SourceFileInput, SourceFileKey, SourceManifest } from './convert.ts';

export interface SyntheticSources {
  surahs: Record<string, Record<string, unknown>>;
  juz: Record<string, Record<string, unknown>>;
  layout: Record<string, unknown>[];
  words: Record<string, unknown>[];
}

export function syntheticSources(surahCount = 114, layoutSurahs = surahCount): SyntheticSources {
  const surahs: SyntheticSources['surahs'] = {};
  for (const s of syntheticSurahs().slice(0, surahCount)) {
    surahs[String(s.number)] = {
      id: s.number,
      name: s.nameTranslit,
      name_simple: s.nameTranslit,
      name_arabic: s.nameAr,
      revelation_order: s.number,
      revelation_place: s.number % 2 ? 'makkah' : 'madinah',
      verses_count: s.ayahCount,
      bismillah_pre: true,
    };
  }
  const juz: SyntheticSources['juz'] = {};
  for (const p of syntheticParas()) {
    juz[String(p.number)] = { juz_number: p.number, first_verse_key: `${p.start.surah}:${p.start.ayah}`, last_verse_key: `${p.end.surah}:${p.end.ayah}` };
  }
  const words: SyntheticSources['words'] = [];
  let index = 0;
  for (let s = 1; s <= surahCount; s++) {
    for (let a = 1; a <= SYNTHETIC_AYAH_COUNT; a++) {
      for (let w = 1; w <= SYNTHETIC_WORDS_PER_AYAH; w++) {
        index += 1;
        words.push({ word_index: index, word_key: `${s}:${a}:${w}`, surah: s, ayah: a, text: `synthetic-word-${index}` });
      }
    }
  }
  // The layout covers the first `layoutSurahs` Surahs; its word IDs match the word list because both count from 1.
  const layout = syntheticLayoutV2(layoutSurahs).map((l) => ({
    page_number: l.page,
    line_number: l.line,
    line_type: l.lineType === 'AYAH' ? 'ayah' : l.lineType === 'SURAH_NAME' ? 'surah_name' : 'basmallah',
    is_centered: l.isCentered ? 1 : 0,
    first_word_id: l.srcFirstWordId ?? null,
    last_word_id: l.srcLastWordId ?? null,
    surah_number: l.surah,
  }));
  // A partial layout only makes sense with a word list of the same Surahs (coverage is checked against the words).
  return { surahs, juz, layout, words: words.filter((w) => (w.surah as number) <= layoutSurahs) };
}

export const syntheticManifest = (over: Partial<SourceManifest> = {}): SourceManifest => ({
  format: 'hifz-quran-source-manifest',
  formatVersion: 1,
  datasetKey: 'synthetic-converter-test',
  datasetVersion: '1',
  provenance: { sourceName: 'Synthetic test sources', sourceUrl: null, licence: 'Test data, not Quran metadata', synthetic: true },
  edition: { code: 'INDOPAK_16_LINE', linesPerPage: 16, pageCount: null },
  files: {
    surahs: { path: 'surahs.json', provider: 'SYNTH', resourceId: 'surahs' },
    juz: { path: 'juz.json', provider: 'SYNTH', resourceId: 'juz' },
    layout: { path: 'layout.json', provider: 'SYNTH', resourceId: 'layout' },
    words: { path: 'words.json', provider: 'SYNTH', resourceId: 'words' },
  },
  ...over,
});

const encode = (value: unknown) => new TextEncoder().encode(JSON.stringify(value));

/** The source files as raw bytes, as the CLI would read them. */
export function syntheticFiles(src: SyntheticSources): Record<SourceFileKey, SourceFileInput> {
  return {
    surahs: { fileName: 'surahs.json', bytes: encode(src.surahs) },
    juz: { fileName: 'juz.json', bytes: encode(src.juz) },
    layout: { fileName: 'layout.json', bytes: encode(src.layout) },
    words: { fileName: 'words.json', bytes: encode(src.words) },
  };
}
