// F06 · Quran portions and metadata — API E2E (docs/specs/07-f06-quran-portions-metadata.md)
// Screen journeys: e2e/mobile/f06-quran-portions/.
// SYNTHETIC DATA ONLY: Quran values come from the synthetic fixture (control.seedSyntheticQuran) or are invented here;
// none is real Quran metadata. Criteria that save portions (AC5, AC8…AC17) need F05's daily-entry endpoints and stay
// test.fixme; AC18 waits for the approved seed (DEFERRED: DEC-B31); AC19's record part waits for F05 records.
import { expect, test } from './support/fixtures';

const SURAH = { nameAr: 'اختبار ١', nameTranslit: 'Synthetic 1', ayahCount: 7, rowVersion: null };

test.describe('F06 · Quran portions and metadata', { tag: '@F06' }, () => {
  test('F06-AC1 (US-024) Admin Surah and Para boundary edits are saved per madrasa and audited', async ({ as, control }) => {
    const adminA = await as('admin.a');
    const surah = await adminA.put('quran/surahs/1', { data: SURAH });
    expect(surah.status()).toBe(200);
    await adminA.put('quran/surahs/2', { data: { ...SURAH, nameAr: 'اختبار ٢', nameTranslit: 'Synthetic 2', ayahCount: 20 } });
    const para = await adminA.put('quran/paras/1', { data: { start: { surah: 1, ayah: 1 }, end: { surah: 2, ayah: 10 }, rowVersion: null } });
    expect(para.status()).toBe(200);
    const paraId = (await para.json()).para.id;
    const edited = await adminA.put('quran/paras/1', { data: { start: { surah: 1, ayah: 1 }, end: { surah: 2, ayah: 12 }, rowVersion: 1 } });
    expect((await edited.json()).para.end).toEqual({ surah: 2, ayah: 12 });

    expect((await (await adminA.get('quran/surahs')).json()).items).toHaveLength(2);
    expect((await (await (await as('admin.b')).get('quran/surahs')).json()).items).toEqual([]);
    const surahAudit = await control.auditForTarget((await surah.json()).surah.id);
    expect(surahAudit.map((r) => r.action)).toEqual(['QURAN_SURAH_CREATED']);
    expect((await control.auditForTarget(paraId)).map((r) => r.action)).toEqual(['QURAN_PARA_CREATED', 'QURAN_PARA_UPDATED']);
  });

  test('F06-AC2 (US-024) a Teacher cannot edit Quran metadata', async ({ as }) => {
    const teacher = await as('teacher.a1');
    expect((await teacher.put('quran/surahs/1', { data: SURAH })).status()).toBe(403);
    expect((await teacher.put('quran/paras/1', { data: { start: { surah: 1, ayah: 1 }, end: { surah: 1, ayah: 2 }, rowVersion: null } })).status()).toBe(403);
    expect((await teacher.get('quran/surahs')).status()).toBe(200);
  });

  test('F06-AC3 (US-024) an Arabic Surah name is returned byte-identical in every locale', async ({ as }) => {
    const admin = await as('admin.a');
    // Not a real Surah name: synthetic Arabic text with diacritics and a decomposed madda, which must not be normalized.
    const nameAr = 'آختِبار';
    expect((await admin.put('quran/surahs/1', { data: { ...SURAH, nameAr } })).status()).toBe(200);
    for (const locale of ['en', 'ur', 'ur-Latn']) {
      const items = (await (await admin.get('quran/surahs', { headers: { 'accept-language': locale } })).json()).items;
      expect(Buffer.from(items[0].nameAr, 'utf8').equals(Buffer.from(nameAr, 'utf8'))).toBe(true);
    }
  });

  test('F06-AC4 (US-024) a Para boundary ending before it starts is rejected', async ({ as }) => {
    const admin = await as('admin.a');
    await admin.put('quran/surahs/1', { data: SURAH });
    const res = await admin.put('quran/paras/1', { data: { start: { surah: 1, ayah: 5 }, end: { surah: 1, ayah: 2 }, rowVersion: null } });
    expect(res.status()).toBe(400);
    expect((await res.json()).error.fields).toEqual({ end: 'END_BEFORE_START' });
  });

  test.fixme('F06-AC5 (US-025) Para 1–30 is accepted; 0 and 31 are rejected', async () => {
    // Save portions with Para 1, 30 → ok; 0, 31 → field errors.
  });

  test('F06-AC6 (US-025) an Ayat past the Surah end is rejected naming the maximum', async ({ as }) => {
    // Server-side range check through the Sabaq range lookup; F05 adds the same check on the portion save.
    await (await as('admin.a')).put('quran/surahs/1', { data: SURAH });
    const res = await (await as('teacher.a1')).get('quran/line-count?surah=1&ayahStart=3&ayahEnd=9');
    expect((await res.json()).issues).toEqual([{ field: 'ayahEnd', code: 'OUT_OF_RANGE', max: 7 }]);
  });

  test('F06-AC7 (US-025) an end Ayat before the start Ayat is rejected', async ({ as }) => {
    await (await as('admin.a')).put('quran/surahs/1', { data: SURAH });
    const res = await (await as('teacher.a1')).get('quran/line-count?surah=1&ayahStart=5&ayahEnd=2');
    expect((await res.json()).issues).toEqual([{ field: 'range', code: 'END_BEFORE_START' }]);
  });

  test.fixme('F06-AC8 (US-026) line quantities are whole LINES', async () => {
    // Save 10 LINES → stored unit LINES, 10/1; save 2.5 LINES → rejected.
  });

  test.fixme('F06-AC9 (US-026) 10 lines assigned and 6 completed leave 4 lines (AC-QTY-02)', async () => {
    // Read remaining for the portion → 4 LINES.
  });

  test.fixme('F06-AC10 (US-027) Salasah is stored as 3/4 Para (AC-QTY-01)', async () => {
    // Save SALASAH; stored PARA 3/4.
  });

  test.fixme('F06-AC11 (US-027) Rubu, Half, and Complete are stored exactly', async () => {
    // Stored as PARA 1/4, 1/2, 1/1.
  });

  test.fixme('F06-AC12 (US-027) 3/4 Para assigned and 1/2 completed leave 1/4 Para (AC-QTY-03)', async () => {
    // Read remaining → PARA 1/4.
  });

  test.fixme('F06-AC13 (US-027) LINES and PARA totals are never combined (AC-QTY-04)', async () => {
    // One day with a LINES portion and a PARA portion; totals are two entries, one per unit.
  });

  test.fixme('F06-AC14 (US-027) completed greater than assigned is rejected (AC-QTY-05)', async () => {
    // Assigned Half, completed Complete → field error on completed.
  });

  // Added by the decision review of 2026-10-30 (SRS §17).
  test.fixme('F06-AC16 (US-027) extra work is a separate Extra portion; completed never exceeds assigned', async () => {
    // Given 1/2 Para assigned and 3/4 Para recited, when the Teacher records completed 1/2 and adds an Extra portion of 1/4, then both portions are saved with completed ≤ assigned, and reports show the 1/4 as extra work. Entering completed 3/4 on the original portion is refused.
  });

  test.fixme('F06-AC17 (US-026) Lines, Ayat, and Pages are whole numbers only', async () => {
    // Given a Lines, Ayat, or Pages quantity, when 2.5 is entered, then it is rejected; whole numbers are accepted.
  });

  test.fixme('F06-AC18 (US-024) a new madrasa starts with the reviewed Quran metadata seed', async () => {
    // Given a newly created madrasa, when Quran metadata is opened, then it already contains 114 Surahs with their Ayat counts and 30 Para boundaries from the reviewed seed.
  });

  test.fixme('F06-AC19 (US-024) a metadata correction flags affected records and never changes them', async () => {
    // Given records that use a Para boundary, when the Admin corrects that boundary, then the records keep their stored ranges, any range that is no longer valid is listed for Admin review, and the edit is audited.
  });
});
