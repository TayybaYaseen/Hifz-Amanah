// F06 · Quran portions and metadata — API E2E (docs/specs/07-f06-quran-portions-metadata.md)
// Screen journeys: e2e/mobile/f06-quran-portions/.
// SYNTHETIC DATA ONLY: Quran values come from the synthetic fixture (control.seedSyntheticQuran) or are invented here;
// none is real Quran metadata. Criteria that save portions (AC5, AC8…AC17) need F05's daily-entry endpoints and stay
// test.fixme; AC18 waits for the approved seed (DEFERRED: DEC-B31); AC19's record part waits for F05 records.
import { createHash } from 'node:crypto';
// The device's own pure functions (packages/domain), so AC24 checks exactly what the app runs offline.
import { evaluateRange, referenceIndex, type ReferenceSnapshotV1 } from '../../packages/domain/quran-ref/index.ts';
import { expect, test, type QuranConversion, type QuranReview, type TestControl } from './support/fixtures';

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

// ---------- F06-AC20…AC27: the Quran reference data pipeline (ADR-017; FR-SAB-011…014; DEC-B71…B73) ----------
// SYNTHETIC DATA ONLY. Datasets come from the converter run on the invented fixture (control.convertSyntheticQuran).
// "Production" datasets below are production-FLAGGED synthetic values in the throwaway E2E database, used only to
// prove the gates; nothing here is real Quran data, a real source, or a real licence or permission.

const REVIEW: QuranReview = {
  reviewer: 'Reviewer (synthetic)',
  qualification: 'Test only',
  mushafPrinting: 'Synthetic printing (test)',
  signOffRef: 'Synthetic sign-off register entry (test)',
  decision: 'APPROVED',
  signedOn: '2026-11-09',
  findings: [],
};
const CATEGORY: Record<string, string> = { surahs: 'SURAHS', juz: 'JUZ', layout: 'LAYOUT', words: 'WORDS' };
type Sources = QuranConversion['report']['sources'];
type Line = { page: number; line: number; lineType: string; surah: number; ayahStart?: number | null; ayahEnd?: number | null };

/** Registers every source of a conversion and, unless told otherwise, grants it (the layout with publisher clearance). */
async function catalogue(
  control: TestControl,
  sources: Sources,
  options: { synthetic: boolean; grant?: boolean; layoutClearance?: boolean } ,
): Promise<Record<string, string>> {
  const ids: Record<string, string> = {};
  for (const s of sources) {
    ids[s.file] = (await control.registerQuranSource({ provider: s.provider, resourceId: s.resourceId, category: CATEGORY[s.file]!, fileName: s.fileName, fileSha256: s.fileSha256, synthetic: options.synthetic })).id;
    if (options.grant === false) continue;
    const clearance = s.file === 'layout' && options.layoutClearance !== false ? 'Synthetic publisher letter (test)' : null;
    await control.recordQuranLicence(ids[s.file]!, { status: 'PERMISSION_GRANTED', permissionRef: 'Synthetic permission letter (test)', publisherClearanceRef: clearance });
  }
  return ids;
}

/** Converts, catalogues (cleared), and signs a synthetic dataset; returns the signed seed, report, and report hash. */
async function signedDataset(control: TestControl, options: { production?: boolean; datasetVersion?: string } = {}) {
  const conversion = await control.convertSyntheticQuran(options);
  const sourceIds = await catalogue(control, conversion.report.sources, { synthetic: !options.production });
  const signed = await control.signQuranDataset(conversion.seed, conversion.report, REVIEW);
  expect(signed.status).toBe(200);
  return {
    conversion,
    sourceIds,
    seed: signed.body.seed as Record<string, unknown> & { layouts: { lines: Line[] }[] },
    report: signed.body.report,
    reportSha256: signed.body.reportSha256 as string,
  };
}

const sha256 = (text: string) => createHash('sha256').update(text, 'utf8').digest('hex');

/** The oracle for Total Lines: the Ayat lines of the imported mapping that hold any Ayat of the range. */
const expectedLines = (lines: Line[], surah: number, from: number, to: number) =>
  lines.filter((l) => l.lineType === 'AYAH' && l.surah === surah && (l.ayahEnd ?? 0) >= from && (l.ayahStart ?? 0) <= to).length;

const issueCodes = (body: Record<string, unknown>) => (body.issues as { path: string; code: string }[]).map((i) => `${i.path}:${i.code}`);

test.describe('F06 · Quran reference data pipeline (ADR-017)', { tag: '@F06' }, () => {
  test('F06-AC20 (US-026) the edition shows its recorded publisher and printing, and a layout counts as verified only after a signed production review', async ({ as, control }) => {
    const admin = await as('admin.a');
    const edition = async (who = admin) => ((await (await who.get('quran/editions')).json()).editions as Record<string, unknown>[]).find((e) => e.code === 'INDOPAK_16_LINE')!;
    // The publisher and printing stay empty until the physical-Mushaf check records them (DEC-B71).
    expect(await edition()).toMatchObject({ publisher: null, printingId: null, pageCount: null, verification: 'UNVERIFIED', hasLayout: false, layoutVerified: false });

    // Signed test data: the layout is in use but never counts as verified.
    const test = await signedDataset(control);
    expect((await control.applyQuranSeed(test.seed)).status).toBe(200);
    expect(await edition()).toMatchObject({ hasLayout: true, layoutVerified: false });

    // A production-flagged dataset with cleared sources and a signed approval: verified for this madrasa only.
    const production = await signedDataset(control, { production: true, datasetVersion: '2' });
    // Without the signed report and its evidence it is refused (DEC-B78); with it, applied.
    expect(issueCodes((await control.applyQuranSeed(production.seed)).body)).toEqual(['validationReport.report:REQUIRED']);
    expect((await control.applyQuranSeed(production.seed, 'ALIF', production.report)).status).toBe(200);
    expect(await edition(await as('teacher.a1'))).toMatchObject({ hasLayout: true, layoutVerified: true, verification: 'UNVERIFIED' });
    expect(await edition(await as('admin.b'))).toMatchObject({ hasLayout: false, layoutVerified: false });

    // No role can mark an edition verified or set its publisher through the API.
    for (const who of ['owner.a', 'admin.a'] as const) {
      const api = await as(who);
      for (const path of ['quran/editions', 'quran/editions/INDOPAK_16_LINE']) {
        expect([404, 405]).toContain((await api.put(path, { data: { verification: 'VERIFIED', publisher: 'X' } })).status());
        expect([404, 405]).toContain((await api.post(path, { data: { verification: 'VERIFIED' } })).status());
      }
    }
  });

  test('F06-AC21 (US-026) Total Lines follows the imported page/line mapping, and a mapping with unmapped IDs, a Surah-spanning line, a gap, or an overlap is refused', async ({ as, control }) => {
    for (const defect of ['UNMAPPED_WORD_ID', 'LINE_SPANS_SURAHS', 'COVERAGE_GAP'] as const) {
      const refused = await control.convertSyntheticQuran({ defect });
      expect(refused.seed, defect).toBeNull();
      expect(refused.report.gate.blockers, defect).toContain('CHECKS_FAILED');
    }
    const { seed } = await signedDataset(control);
    const lines = seed.layouts[0]!.lines;

    // A gap or an overlap in a signed seed is refused whole at import; nothing is stored.
    const ayahAt = lines.map((l, i) => (l.lineType === 'AYAH' ? i : -1)).filter((i) => i >= 0);
    const gapped = { ...seed, layouts: [{ ...seed.layouts[0]!, lines: lines.filter((_, i) => i !== ayahAt[4]) }] };
    const gap = await control.applyQuranSeed(gapped);
    expect(gap.status).toBe(400);
    expect(issueCodes(gap.body)).toEqual(expect.arrayContaining([expect.stringMatching(/:GAP$/)]));
    const overlapping = structuredClone(seed);
    const o = overlapping.layouts[0]!.lines[ayahAt[5]!]! as Line & { wordStart: number };
    const prev = lines[ayahAt[4]!]! as Line & { wordEnd: number };
    Object.assign(o, { ayahStart: prev.ayahEnd, wordStart: prev.wordEnd });
    expect(issueCodes((await control.applyQuranSeed(overlapping)).body)).toEqual(expect.arrayContaining([expect.stringMatching(/:OVERLAP$/)]));
    const admin = await as('admin.a');
    expect((await (await admin.get('quran/imports')).json()).items).toEqual([]);

    // The intact signed seed: every Total Lines lookup equals the imported mapping.
    expect((await control.applyQuranSeed(seed)).status).toBe(200);
    const teacher = await as('teacher.a1');
    for (const [surah, from, to] of [[1, 1, 4], [2, 5, 9], [3, 20, 20], [57, 2, 17], [114, 1, 20]] as const) {
      const res = await (await teacher.get(`quran/line-count?surah=${surah}&ayahStart=${from}&ayahEnd=${to}`)).json();
      expect(res, `${surah}:${from}-${to}`).toMatchObject({ source: 'LAYOUT', totalLines: expectedLines(lines, surah, from, to) });
    }
  });

  test('F06-AC22 (US-025) ranges are validated against the active Ayat counts, including after an Admin correction', async ({ as, control }) => {
    await control.seedSyntheticQuran();
    const teacher = await as('teacher.a1');
    const check = async (q: string) => (await (await teacher.get(`quran/line-count?${q}`)).json()).issues;
    expect(await check('surah=2&ayahStart=1&ayahEnd=15')).toEqual([]);
    expect(await check('surah=2&ayahStart=1&ayahEnd=21')).toEqual([{ field: 'ayahEnd', code: 'OUT_OF_RANGE', max: 20 }]);
    expect(await check('surah=2&ayahStart=9&ayahEnd=3')).toEqual([{ field: 'range', code: 'END_BEFORE_START' }]);
    expect((await teacher.get('quran/line-count?surah=115&ayahStart=1&ayahEnd=2')).status()).toBe(400);

    // The Admin lowers Surah 2's Ayat count: a range valid a moment ago is now refused, naming the new maximum.
    const admin = await as('admin.a');
    const surah2 = ((await (await admin.get('quran/surahs')).json()).items as { number: number; rowVersion: number; nameAr: string; nameTranslit: string }[]).find((s) => s.number === 2)!;
    const saved = await admin.put('quran/surahs/2', { data: { nameAr: surah2.nameAr, nameTranslit: surah2.nameTranslit, ayahCount: 10, rowVersion: surah2.rowVersion } });
    expect(saved.status()).toBe(200);
    expect(await check('surah=2&ayahStart=1&ayahEnd=15')).toEqual([{ field: 'ayahEnd', code: 'OUT_OF_RANGE', max: 10 }]);
    // A range is not checked against a Para boundary (DEC-B73): Surah 2 Ayat 1–10 spans no Para rule here.
    expect(await check('surah=2&ayahStart=1&ayahEnd=10')).toEqual([]);
  });

  test('F06-AC23 (US-026) Surah-heading, Bismillah, and Ayat lines are stored apart, and only Ayat lines count toward Total Lines', async ({ as, control }) => {
    const defective = await control.convertSyntheticQuran({ defect: 'HEADING_WITH_WORDS' });
    expect(defective.seed).toBeNull();
    expect(defective.report.checks.find((c) => c.id === 'S6')).toMatchObject({ result: 'FAIL', details: [expect.stringContaining('a surah_name line carries word IDs')] });

    const { seed } = await signedDataset(control);
    const lines = seed.layouts[0]!.lines;
    const heading = structuredClone(seed);
    Object.assign(heading.layouts[0]!.lines.find((l) => l.lineType === 'SURAH_NAME')!, { ayahStart: 1, ayahEnd: 1 });
    expect(issueCodes((await control.applyQuranSeed(heading)).body)).toEqual(expect.arrayContaining([expect.stringMatching(/:NOT_AYAH_LINE$/)]));

    expect((await control.applyQuranSeed(seed)).status).toBe(200);
    const imports = (await (await (await as('admin.a')).get('quran/imports')).json()).items as { kind: string; counts: Record<string, number> }[];
    expect(imports.find((i) => i.kind === 'LAYOUT')!.counts).toMatchObject({
      surahNameLines: 114,
      basmallahLines: 114,
      ayahLines: lines.filter((l) => l.lineType === 'AYAH').length,
    });
    // Surah 1 starts with a heading and a Bismillah line; Ayat 1–4 sit on the Ayat lines after them, and only those count.
    const res = await (await (await as('teacher.a1')).get('quran/line-count?surah=1&ayahStart=1&ayahEnd=4')).json();
    expect(res.totalLines).toBe(expectedLines(lines, 1, 1, 4));
    expect(res.totalLines).toBeLessThan(lines.filter((l) => l.surah === 1 && l.page === 1).length);
  });

  test('F06-AC24 (US-025) offline lookups from the cached reference snapshot match the server', async ({ as, control }) => {
    // The device side of this criterion runs the same packages/domain functions on its SQLite cache; the mobile flow
    // is e2e/mobile/f06-quran-portions/offline-reference.yaml. Here: download exactly as the device does, verify, then
    // compare every answer with the server's for the same snapshot version.
    const { seed } = await signedDataset(control);
    expect((await control.applyQuranSeed(seed)).status).toBe(200);
    const teacher = await as('teacher.a1');
    const check = await (await teacher.get('quran/reference/version?format=1')).json();
    const res = await teacher.get('quran/reference/snapshot?format=1');
    expect(res.status()).toBe(200);
    const body = await res.text();
    // Verification before activation: sha256(body) = ETag = the version check.
    expect(sha256(body)).toBe(check.referenceVersion);
    expect(res.headers().etag).toBe(`"${check.referenceVersion}"`);
    const snapshot = JSON.parse(body) as ReferenceSnapshotV1;
    expect(snapshot.snapshotFormatVersion).toBe(1);
    const index = referenceIndex(snapshot);

    const ranges: [number, number, number][] = [
      [1, 1, 4], [1, 1, 20], [2, 3, 9], [3, 19, 20], [2, 7, 7], // valid: one line, several lines, a whole Surah
      [1, 1, 21], [1, 9, 3], [4, 1, 2], [114, 1, 20], [3, 0, 2], // beyond the count, end before start, no layout, Ayat 0
    ];
    for (const [surah, ayahStart, ayahEnd] of ranges) {
      const online = await teacher.get(`quran/line-count?surah=${surah}&ayahStart=${ayahStart}&ayahEnd=${ayahEnd}`);
      const offline = evaluateRange({ surah, ayahStart, ayahEnd }, index);
      if (online.status() === 400) {
        // The query schema refuses an impossible value before any rule runs; the device refuses it too.
        expect(offline.issues.length, `${surah}:${ayahStart}-${ayahEnd}`).toBeGreaterThan(0);
        continue;
      }
      const { edition: _edition, ...server } = await online.json();
      expect(offline, `${surah}:${ayahStart}-${ayahEnd}`).toEqual(server);
    }
    // Ayat lines only (DEC-B77): Total Lines equals the oracle from the imported mapping.
    expect(evaluateRange({ surah: 1, ayahStart: 1, ayahEnd: 4 }, index).totalLines).toBe(expectedLines(seed.layouts[0]!.lines, 1, 1, 4));
    // Unchanged data: the device's copy is CURRENT, and a conditional download answers 304.
    expect((await (await teacher.get(`quran/reference/version?format=1&have=${check.referenceVersion}`)).json()).cached.status).toBe('CURRENT');
    expect((await teacher.get('quran/reference/snapshot?format=1', { headers: { 'If-None-Match': `"${check.referenceVersion}"` } })).status()).toBe(304);
    // Student and Parent never receive reference data (online-only, read-only experiences).
    for (const who of ['student.s1', 'parent.p1'] as const) expect((await (await as(who)).get('quran/reference/snapshot?format=1')).status()).toBe(403);
  });

  test('DEC-B79 (US-025) a withdrawn layout licence revokes the cached version and stops distribution; nothing is deleted', async ({ as, control }) => {
    const { seed, sourceIds } = await signedDataset(control);
    expect((await control.applyQuranSeed(seed)).status).toBe(200);
    const teacher = await as('teacher.a1');
    const before = (await (await teacher.get('quran/reference/version?format=1')).json()).referenceVersion as string;
    expect(await control.recordQuranLicence(sourceIds.layout!, { status: 'REFUSED', permissionRef: null, publisherClearanceRef: null })).toMatchObject({ revokedVersions: 1 });
    const now = await (await teacher.get(`quran/reference/version?format=1&have=${before}`)).json();
    expect(now.cached).toMatchObject({ status: 'REVOKED', reasonCode: 'LICENCE_WITHDRAWN' });
    expect(now.layout).toEqual({ importId: null, verified: false, withdrawn: true });
    const snapshot = JSON.parse(await (await teacher.get('quran/reference/snapshot?format=1')).text()) as ReferenceSnapshotV1;
    expect(snapshot.lines).toEqual([]);
    expect((await (await teacher.get('quran/line-count?surah=1&ayahStart=1&ayahEnd=4')).json()).totalLines).toBeNull();
    // The import and its rows are kept for audit (plan P2); the layout is shown as withdrawn, not approved.
    expect((await (await (await as('admin.a')).get('quran/imports')).json()).items).toHaveLength(2);
    expect((await (await teacher.get('quran/editions')).json()).editions[0]).toMatchObject({ hasLayout: true, layoutWithdrawn: true, layoutVerified: false });
  });

  test('F06-AC25 (US-024) converting and importing the same dataset again changes nothing, and the stored hashes are the ones signed', async ({ as, control }) => {
    const first = await control.convertSyntheticQuran();
    const again = await control.convertSyntheticQuran();
    expect(again.report.seedSha256).toBe(first.report.seedSha256);

    const { seed, reportSha256 } = await signedDataset(control);
    expect((await control.applyQuranSeed(seed)).body).toMatchObject({ metadata: 'APPLIED', layouts: [{ status: 'APPLIED' }] });
    expect((await control.applyQuranSeed(seed)).body).toMatchObject({ metadata: 'ALREADY_APPLIED', layouts: [{ status: 'ALREADY_APPLIED' }] });
    const admin = await as('admin.a');
    const items = (await (await admin.get('quran/imports')).json()).items as { validationReportSha256: string; checksum: string; seedFormatVersion: number }[];
    expect(items).toHaveLength(2);
    expect(items.every((i) => i.validationReportSha256 === reportSha256 && i.seedFormatVersion === 2)).toBe(true);
    expect(new Set(items.map((i) => i.checksum)).size).toBe(1);

    // The same dataset version with changed content is refused.
    const changed = structuredClone(seed) as Record<string, unknown> & { metadata: { surahs: { nameTranslit: string }[] } };
    changed.metadata.surahs[0]!.nameTranslit = 'Synthetic 1 (changed)';
    const refused = await control.applyQuranSeed(changed);
    expect(refused.status).toBe(400);
    expect(issueCodes(refused.body)).toEqual(['datasetVersion:CONTENT_CHANGED']);
  });

  test('F06-AC26 (US-024) a seed citing an unregistered, uncleared, or refused source, or a layout without publisher clearance, is refused and nothing is stored', async ({ as, control }) => {
    const conversion = await control.convertSyntheticQuran();
    const signed = (await control.signQuranDataset(conversion.seed, conversion.report, REVIEW)).body.seed;
    const imported = async () => (await (await (await as('admin.a')).get('quran/imports')).json()).items as unknown[];

    expect(issueCodes((await control.applyQuranSeed(signed)).body)).toEqual(['sources[0]:UNREGISTERED', 'sources[1]:UNREGISTERED', 'sources[2]:UNREGISTERED', 'sources[3]:UNREGISTERED']);

    const ids = await catalogue(control, conversion.report.sources, { synthetic: true, grant: false });
    expect(issueCodes((await control.applyQuranSeed(signed)).body)).toEqual([
      'sources[0]:LICENCE_NOT_CLEARED', 'sources[1]:LICENCE_NOT_CLEARED', 'sources[2]:LICENCE_NOT_CLEARED', 'sources[3]:LICENCE_NOT_CLEARED',
    ]);

    const grant = (file: string, publisherClearanceRef: string | null = null) =>
      control.recordQuranLicence(ids[file]!, { status: 'PERMISSION_GRANTED', permissionRef: 'Synthetic permission letter (test)', publisherClearanceRef });
    for (const file of ['surahs', 'juz', 'layout', 'words']) await grant(file);
    expect(issueCodes((await control.applyQuranSeed(signed)).body)).toEqual(['sources[2]:PUBLISHER_CLEARANCE_REQUIRED']);

    await grant('layout', 'Synthetic publisher letter (test)');
    await control.recordQuranLicence(ids.juz!, { status: 'REFUSED', permissionRef: null, publisherClearanceRef: null });
    expect(issueCodes((await control.applyQuranSeed(signed)).body)).toEqual(['sources[1]:LICENCE_NOT_CLEARED']);

    // A production-flagged seed may never cite test sources, even cleared ones.
    await grant('juz');
    const production = await control.convertSyntheticQuran({ production: true });
    await catalogue(control, production.report.sources, { synthetic: true }); // cleared, but registered as test sources
    const productionSigned = (await control.signQuranDataset(production.seed, production.report, REVIEW)).body.seed;
    expect(issueCodes((await control.applyQuranSeed(productionSigned)).body)).toEqual([
      'sources[0]:SYNTHETIC_SOURCE', 'sources[1]:SYNTHETIC_SOURCE', 'sources[2]:SYNTHETIC_SOURCE', 'sources[3]:SYNTHETIC_SOURCE',
    ]);
    expect(await imported()).toEqual([]);
  });

  test('F06-AC27 (US-024) a production seed is imported only with an approving review signed by the named reviewer', async ({ as, control }) => {
    const conversion = await control.convertSyntheticQuran({ production: true });
    await catalogue(control, conversion.report.sources, { synthetic: false });
    const admin = await as('admin.a');
    const imported = async () => (await (await admin.get('quran/imports')).json()).items as Record<string, unknown>[];

    // Unsigned.
    expect(issueCodes((await control.applyQuranSeed(conversion.seed)).body)).toEqual(
      expect.arrayContaining(['provenance.reviewedBy:REQUIRED', 'validationReport:REQUIRED']),
    );
    // Rejected by the reviewer.
    const rejected = await control.signQuranDataset(conversion.seed, conversion.report, { ...REVIEW, decision: 'REJECTED', findings: [{ part: 'C4', description: 'A line break differs (test)', blocking: true }] });
    expect(issueCodes((await control.applyQuranSeed(rejected.body.seed)).body)).toEqual(['validationReport.decision:NOT_APPROVED']);
    // The sign step itself refuses an approval with a blocking finding.
    const blocked = await control.signQuranDataset(conversion.seed, conversion.report, { ...REVIEW, findings: [{ part: 'C1', description: 'Heading misplaced (test)', blocking: true }] });
    expect(blocked.status).toBe(400);
    expect(blocked.body.reasons).toEqual(expect.arrayContaining([expect.stringContaining('BLOCKING_FINDING')]));
    // An approval whose signer is not the named reviewer.
    const approved = await control.signQuranDataset(conversion.seed, conversion.report, REVIEW);
    const forged = structuredClone(approved.body.seed) as Record<string, unknown> & { validationReport: Record<string, unknown> };
    forged.validationReport.signedBy = 'Someone else';
    expect(issueCodes((await control.applyQuranSeed(forged)).body)).toEqual(['validationReport.signedBy:REVIEWER_MISMATCH']);
    // A production seed in format 1.
    const v1 = await control.applyQuranSeed({
      format: 'hifz-quran-seed', formatVersion: 1, datasetKey: 'synthetic-v1', datasetVersion: '1',
      provenance: { sourceName: 'X', sourceUrl: null, licence: 'X', reviewedBy: 'Reviewer (synthetic)', approvedOn: '2026-11-09', synthetic: false },
      metadata: null, layouts: [{ edition: 'INDOPAK_16_LINE', linesPerPage: 16, lines: [{ page: 1, line: 1, surah: 1, ayahStart: 1, ayahEnd: 1 }] }],
    });
    expect(issueCodes(v1.body)).toEqual(expect.arrayContaining(['formatVersion:V2_REQUIRED']));
    expect(await imported()).toEqual([]);

    // DEC-B78: without the signed report itself, or with a report that is not the signed one, it is refused.
    expect(issueCodes((await control.applyQuranSeed(approved.body.seed)).body)).toEqual(['validationReport.report:REQUIRED']);
    const otherReport = structuredClone(approved.body.report) as { review: Record<string, unknown> };
    otherReport.review.mushafPrinting = 'Another printing (test)';
    expect(issueCodes((await control.applyQuranSeed(approved.body.seed, 'ALIF', otherReport)).body)).toEqual(['validationReport.report:HASH_MISMATCH']);
    // An approval without a sign-off reference is refused by the sign step itself.
    const noSignOff = await control.signQuranDataset(conversion.seed, conversion.report, { ...REVIEW, signOffRef: null });
    expect(noSignOff.status).toBe(400);
    expect(noSignOff.body.reasons).toEqual(expect.arrayContaining([expect.stringContaining('SIGN_OFF_REF_REQUIRED')]));
    expect(await imported()).toEqual([]);

    // Signed approval, cleared sources, the signed report: applied, and every import preserves the reviewer, the
    // printing, the review date, the decision, the report hash, the stored report, and the sign-off reference.
    expect((await control.applyQuranSeed(approved.body.seed, 'ALIF', approved.body.report)).status).toBe(200);
    const items = await imported();
    expect(items).toHaveLength(2);
    for (const item of items) {
      expect(item).toMatchObject({
        synthetic: false,
        reviewedBy: 'Reviewer (synthetic)',
        approvedOn: '2026-11-09',
        reviewDecision: 'APPROVED',
        validationReportSha256: approved.body.reportSha256,
        mushafPrinting: 'Synthetic printing (test)',
        signOffRef: 'Synthetic sign-off register entry (test)',
        validationReportStored: true,
      });
    }
  });
});
