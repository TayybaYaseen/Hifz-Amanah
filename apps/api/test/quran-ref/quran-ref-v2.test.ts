// F06 · Quran reference v2 — integration against real Postgres: migration 0010, seed format 2, the source catalogue
// and licence gate, the sign-off check, and typed lines (ADR-017; FR-SAB-011…013; DEC-B71, DEC-B72).
// SYNTHETIC DATA ONLY: every Quran value comes from packages/domain/quran-ref/synthetic-fixture.ts, which matches no real
// Mushaf, and every registered source here is flagged synthetic. No real Quran metadata, source, or licence is used.
// No seed flagged non-synthetic is ever applied here; such seeds are only used to prove refusal.
import { sql } from 'kysely';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { syntheticSeed, syntheticSeedV2, syntheticSha } from '@hifz/domain/quran-ref/synthetic-fixture';
import type { QuranSeedV2, SeedSourceRef } from '@hifz/domain/quran-ref';
import { QuranSourceRegistry, SyntheticSourceNotAllowedError } from '../../src/modules/quran-ref/sources.ts';
import { withTenant } from '../../src/platform/tenant.ts';
import { startHarness, type Harness } from '../support/harness.ts';

let h: Harness;
let registry: QuranSourceRegistry;

beforeAll(async () => {
  h = await startHarness();
  registry = new QuranSourceRegistry(h.db, h.clock, { allowSynthetic: true });
}, 60_000);

afterAll(async () => {
  await h?.stop();
});

beforeEach(async () => {
  await h.reset();
});

const orgId = async (code: string) => (await h.db.selectFrom('organizations').select('id').where('code', '=', code).executeTakeFirstOrThrow()).id;
const seed = (body: object, code = 'ALIF') => h.control('POST', '/quran/seed', { organizationCode: code, seed: body });
const count = async (table: 'quran_imports' | 'mushaf_layout_lines' | 'quran_import_sources' | 'quran_surahs') =>
  Number(
    (await withTenant(h.db, await orgId('ALIF'), (tx) => tx.selectFrom(table).select((eb) => eb.fn.countAll<string>().as('n')).executeTakeFirstOrThrow())).n,
  );

/** Registers a synthetic test source (never a real file) and returns its catalogue id and seed reference. */
async function testSource(n: number, role: SeedSourceRef['role']): Promise<{ id: string; ref: SeedSourceRef }> {
  const fileSha256 = syntheticSha(n);
  const { id } = await registry.register(
    {
      provider: 'SYNTH',
      resourceName: `Synthetic test source ${n}`,
      resourceId: `test-${n}`,
      category: role === 'LAYOUT' ? 'LAYOUT' : role === 'WORDS' ? 'WORDS' : 'SURAHS',
      sourceUrl: 'https://example.invalid/synthetic',
      downloadUrl: null,
      downloadedOn: '2026-11-09',
      fileName: `synthetic-${n}.json`,
      fileSha256,
      sourceVersion: null,
      notes: 'Test fixture, not a Quran dataset',
      registeredBy: 'integration test',
    },
    { synthetic: true },
  );
  return { id, ref: { provider: 'SYNTH', resourceId: `test-${n}`, fileSha256, role } };
}

const grant = (sourceId: string, over: Record<string, unknown> = {}) =>
  registry.recordLicence(sourceId, {
    status: 'PERMISSION_GRANTED',
    licenceName: null,
    permissionRef: 'Synthetic permission letter (test)',
    publisherClearanceRef: null,
    attributionText: null,
    recordedBy: 'integration test',
    ...over,
  });

const productionShaped = (over: Partial<QuranSeedV2> = {}): QuranSeedV2 =>
  syntheticSeedV2({
    provenance: { sourceName: 'Synthetic', sourceUrl: null, licence: 'Synthetic', reviewedBy: 'Reviewer (synthetic)', approvedOn: '2026-11-09', synthetic: false },
    ...over,
  });

describe('F06 · migration 0010 and format-2 seeds (FR-SAB-012)', () => {
  it('a format-2 seed stores every printed line with its type; only Ayat lines count toward Total Lines', async () => {
    const res = await seed(syntheticSeedV2());
    expect(res.statusCode).toBe(200);
    const rows = await withTenant(h.db, await orgId('ALIF'), (tx) =>
      tx.selectFrom('mushaf_layout_lines').select(['line_type', 'ayah_start', 'word_start', 'is_centered', 'src_first_word_id']).orderBy('page').orderBy('line').execute(),
    );
    expect(rows.slice(0, 3)).toEqual([
      { line_type: 'SURAH_NAME', ayah_start: null, word_start: null, is_centered: true, src_first_word_id: null },
      { line_type: 'BASMALLAH', ayah_start: null, word_start: null, is_centered: true, src_first_word_id: null },
      { line_type: 'AYAH', ayah_start: 1, word_start: 1, is_centered: false, src_first_word_id: 1 },
    ]);
    const teacher = await h.signIn('teacher.a1');
    // Synthetic Surah 1, Ayat 1–4 = 24 words = 3 lines of 8; the heading and Bismillah above them are not counted.
    expect((await h.call('GET', '/quran/line-count?surah=1&ayahStart=1&ayahEnd=4', teacher)).json()).toMatchObject({ totalLines: 3, source: 'LAYOUT' });
  });

  it('format-1 lines keep working: stored as Ayat lines with unknown (NULL) word positions and alignment', async () => {
    expect((await seed(syntheticSeed())).statusCode).toBe(200);
    const row = await withTenant(h.db, await orgId('ALIF'), (tx) =>
      tx.selectFrom('mushaf_layout_lines').select(['line_type', 'word_start', 'is_centered']).limit(1).executeTakeFirstOrThrow(),
    );
    expect(row).toEqual({ line_type: 'AYAH', word_start: null, is_centered: null });
    const imports = (await h.call('GET', '/quran/imports', await h.signIn('admin.a'))).json().items;
    expect(imports.every((i: { seedFormatVersion: number; sources: unknown[] }) => i.seedFormatVersion === 1 && i.sources.length === 0)).toBe(true);
  });

  it('the database refuses a heading line that carries Ayat, and a production import row without a signed review', async () => {
    await seed(syntheticSeedV2());
    const org = await orgId('ALIF');
    const layoutImport = await withTenant(h.db, org, (tx) => tx.selectFrom('quran_imports').select('id').where('kind', '=', 'LAYOUT').executeTakeFirstOrThrow());
    await expect(
      withTenant(h.db, org, (tx) =>
        tx.insertInto('mushaf_layout_lines').values({ organization_id: org, import_id: layoutImport.id, page: 99, line: 1, surah: 1, line_type: 'SURAH_NAME', ayah_start: 1, ayah_end: 1 }).execute(),
      ),
    ).rejects.toThrow(/mushaf_layout_lines_ayah_iff_type/);
    await expect(
      sql`UPDATE quran_imports SET synthetic = false, reviewed_by = 'x', approved_on = '2026-11-09' WHERE id = ${layoutImport.id}`.execute(h.db),
    ).rejects.toThrow(/quran_imports_production_signed/);
  });
});

describe('F06 · the source catalogue (FR-SAB-011)', () => {
  it('a new source starts as LICENSE_REVIEW_REQUIRED; registering the same file again changes nothing', async () => {
    const first = await testSource(1, 'METADATA');
    const again = await registry.register(
      { provider: 'SYNTH', resourceName: 'Other name', resourceId: 'test-1', category: 'SURAHS', sourceUrl: 'https://example.invalid/x', downloadUrl: null, downloadedOn: '2026-11-10', fileName: 'x.json', fileSha256: syntheticSha(1), sourceVersion: null, notes: null, registeredBy: 'someone' },
      { synthetic: true },
    );
    expect(again).toEqual({ id: first.id, created: false });
    const [listed] = await registry.list();
    expect(listed).toMatchObject({ id: first.id, resourceName: 'Synthetic test source 1', licence: { status: 'LICENSE_REVIEW_REQUIRED' } });
  });

  it('licence history is append-only: the latest record is current, and nothing can be deleted', async () => {
    const { id } = await testSource(1, 'METADATA');
    await grant(id);
    await registry.recordLicence(id, { status: 'REFUSED', licenceName: null, permissionRef: null, publisherClearanceRef: null, attributionText: null, recordedBy: 'integration test' });
    expect((await registry.list())[0]!.licence!.status).toBe('REFUSED');
    const history = await h.db.selectFrom('quran_source_licences').select('status').where('source_id', '=', id).orderBy('recorded_at').orderBy('id').execute();
    expect(history.map((r) => r.status)).toEqual(['LICENSE_REVIEW_REQUIRED', 'PERMISSION_GRANTED', 'REFUSED']);
    await expect(sql`DELETE FROM quran_source_licences WHERE source_id = ${id}`.execute(h.db)).rejects.toThrow();
    await expect(sql`DELETE FROM quran_sources WHERE id = ${id}`.execute(h.db)).rejects.toThrow();
  });

  it('a cleared status must name its evidence; synthetic sources are refused outside tests', async () => {
    const { id } = await testSource(1, 'METADATA');
    await expect(grant(id, { permissionRef: null })).rejects.toThrow();
    await expect(sql`INSERT INTO quran_source_licences (id, source_id, status, recorded_at, recorded_by) VALUES (gen_random_uuid(), ${id}, 'PERMISSION_GRANTED', now(), 'x')`.execute(h.db)).rejects.toThrow();
    const strict = new QuranSourceRegistry(h.db, h.clock, { allowSynthetic: false });
    await expect(strict.register({}, { synthetic: true })).rejects.toThrow();
    await expect(
      strict.register(
        { provider: 'SYNTH', resourceName: 'x', resourceId: 'x', category: 'SURAHS', sourceUrl: 'https://example.invalid', downloadUrl: null, downloadedOn: '2026-11-09', fileName: 'x', fileSha256: syntheticSha(9), sourceVersion: null, notes: null, registeredBy: 'x' },
        { synthetic: true },
      ),
    ).rejects.toBeInstanceOf(SyntheticSourceNotAllowedError);
  });

  it('the tenant role can read the catalogue but never write it', async () => {
    await testSource(1, 'METADATA');
    const org = await orgId('ALIF');
    expect(await withTenant(h.db, org, (tx) => tx.selectFrom('quran_sources').select('id').execute())).toHaveLength(1);
    await expect(
      withTenant(h.db, org, (tx) =>
        tx
          .insertInto('quran_sources')
          .values({ id: '01934f5e-8a00-7000-8000-0000000000aa', provider: 'SYNTH', resource_name: 'x', resource_id: 'y', category: 'SURAHS', source_url: 'u', download_url: null, downloaded_on: '2026-11-09', file_name: 'f', file_sha256: syntheticSha(7), source_version: null, notes: null, synthetic: true, registered_at: new Date(), registered_by: 'x' })
          .execute(),
      ),
    ).rejects.toThrow(/permission denied/);
  });
});

describe('F06 · the licence gate on import (FR-SAB-011; DEC-B71)', () => {
  it('a seed citing an unregistered or uncleared source is refused whole, and nothing is written', async () => {
    const meta = await testSource(1, 'METADATA');
    const unregistered: SeedSourceRef = { provider: 'SYNTH', resourceId: 'nope', fileSha256: syntheticSha(99), role: 'LAYOUT' };
    const res = await seed(syntheticSeedV2({ sources: [meta.ref, unregistered] }));
    expect(res.statusCode).toBe(400);
    expect(res.json().issues).toEqual([
      { path: 'sources[0]', code: 'LICENCE_NOT_CLEARED' },
      { path: 'sources[1]', code: 'UNREGISTERED' },
    ]);
    expect(await count('quran_imports')).toBe(0);
    expect(await count('quran_surahs')).toBe(0);
  });

  it("a layout source also needs the printed edition's publisher clearance (Taj Company's position for a Taj layout)", async () => {
    const meta = await testSource(1, 'METADATA');
    const layout = await testSource(2, 'LAYOUT');
    await grant(meta.id);
    await grant(layout.id);
    const refused = await seed(syntheticSeedV2({ sources: [meta.ref, layout.ref] }));
    expect(refused.json().issues).toEqual([{ path: 'sources[1]', code: 'PUBLISHER_CLEARANCE_REQUIRED' }]);
    expect(await count('mushaf_layout_lines')).toBe(0);

    await grant(layout.id, { publisherClearanceRef: 'Synthetic publisher letter (test)' });
    expect((await seed(syntheticSeedV2({ sources: [meta.ref, layout.ref] }))).statusCode).toBe(200);
    const imports = (await h.call('GET', '/quran/imports', await h.signIn('admin.a'))).json().items as {
      kind: string;
      seedFormatVersion: number;
      sources: { role: string; licenceStatus: string; resourceId: string }[];
    }[];
    const byKind = Object.fromEntries(imports.map((i) => [i.kind, i]));
    expect(byKind.METADATA!.seedFormatVersion).toBe(2);
    expect(byKind.METADATA!.sources).toEqual([expect.objectContaining({ role: 'METADATA', resourceId: 'test-1', licenceStatus: 'PERMISSION_GRANTED' })]);
    expect(byKind.LAYOUT!.sources).toEqual([expect.objectContaining({ role: 'LAYOUT', resourceId: 'test-2', licenceStatus: 'PERMISSION_GRANTED' })]);
  });

  it('a source whose latest licence record is REFUSED is refused, even though it was granted before', async () => {
    const meta = await testSource(1, 'METADATA');
    await grant(meta.id);
    await registry.recordLicence(meta.id, { status: 'REFUSED', licenceName: null, permissionRef: null, publisherClearanceRef: null, attributionText: null, recordedBy: 'integration test' });
    const res = await seed(syntheticSeedV2({ sources: [meta.ref], layouts: [] }));
    expect(res.json().issues).toEqual([{ path: 'sources[0]', code: 'LICENCE_NOT_CLEARED' }]);
  });

  it('a production-flagged seed may not cite a synthetic source (proved by refusal; nothing is applied)', async () => {
    const meta = await testSource(1, 'METADATA');
    const layout = await testSource(2, 'LAYOUT');
    await grant(meta.id);
    await grant(layout.id, { publisherClearanceRef: 'Synthetic publisher letter (test)' });
    const report = { sha256: syntheticSha(3), decision: 'APPROVED' as const, signedBy: 'Reviewer (synthetic)', signedOn: '2026-11-09' };
    // Not a complete Quran, so it is refused for completeness too; the point here is the source check, which runs only
    // once the file is otherwise valid. Use a metadata-only seed to reach it.
    const res = await seed(productionShaped({ sources: [meta.ref], validationReport: report, layouts: [] }));
    expect(res.statusCode).toBe(400);
    expect(res.json().issues).toEqual([{ path: 'sources[0]', code: 'SYNTHETIC_SOURCE' }]);
    expect(await count('quran_imports')).toBe(0);
  });
});

describe('F06 · reviewer sign-off (FR-SAB-013; DEC-B72)', () => {
  it('a production seed in format 1 is refused', async () => {
    const v1 = syntheticSeed({ provenance: { sourceName: 'X', sourceUrl: null, licence: 'X', reviewedBy: 'R', approvedOn: '2026-11-09', synthetic: false } });
    const res = await seed(v1);
    expect(res.json().issues).toEqual([{ path: 'formatVersion', code: 'V2_REQUIRED' }]);
  });

  it('a production seed without the signed report, or with a rejected or pending review, is refused', async () => {
    expect((await seed(productionShaped({ layouts: [] }))).json().issues).toEqual(
      expect.arrayContaining([{ path: 'validationReport', code: 'REQUIRED' }, { path: 'sources', code: 'REQUIRED' }]),
    );
    for (const decision of ['REJECTED', 'PENDING']) {
      const res = await seed(productionShaped({ layouts: [], validationReport: { sha256: syntheticSha(3), decision: decision as 'REJECTED', signedBy: 'Reviewer (synthetic)', signedOn: '2026-11-09' } }));
      expect(res.json().issues).toEqual(expect.arrayContaining([{ path: 'validationReport.decision', code: 'NOT_APPROVED' }]));
    }
    expect(await count('quran_imports')).toBe(0);
  });

  it('an approving report on a synthetic seed is recorded on the import, with its hash', async () => {
    const report = { sha256: syntheticSha(5), decision: 'APPROVED_WITH_FINDINGS' as const, signedBy: 'Reviewer (synthetic)', signedOn: '2026-11-09' };
    expect((await seed(syntheticSeedV2({ validationReport: report }))).statusCode).toBe(200);
    const imports = (await h.call('GET', '/quran/imports', await h.signIn('admin.a'))).json().items as { reviewDecision: string; validationReportSha256: string }[];
    expect(imports.every((i) => i.reviewDecision === 'APPROVED_WITH_FINDINGS' && i.validationReportSha256 === syntheticSha(5))).toBe(true);
  });
});
