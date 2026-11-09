// F06 · Converter → catalogue → sign → seed loader, against real Postgres (ADR-017 §4–§7; FR-SAB-011…013;
// DEC-B71, DEC-B72). SYNTHETIC DATA ONLY: invented sources (synthetic-sources.ts) registered as synthetic. No seed
// flagged non-synthetic is ever applied here; such seeds are only used to prove refusal.
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { convertSources, type SourceStatusLookup } from '../../src/modules/quran-ref/converter/convert.ts';
import { signDataset } from '../../src/modules/quran-ref/converter/sign.ts';
import { syntheticFiles, syntheticManifest, syntheticSources } from '../../src/modules/quran-ref/converter/synthetic-sources.ts';
import { QuranSeedLoader, SeedRejectedError } from '../../src/modules/quran-ref/seed.ts';
import { QuranSourceRegistry } from '../../src/modules/quran-ref/sources.ts';
import { withTenant } from '../../src/platform/tenant.ts';
import { startHarness, type Harness } from '../support/harness.ts';

let h: Harness;
let registry: QuranSourceRegistry;
let loader: QuranSeedLoader;

beforeAll(async () => {
  h = await startHarness();
  registry = new QuranSourceRegistry(h.db, h.clock, { allowSynthetic: true });
  loader = new QuranSeedLoader(h.db, h.clock, { allowSynthetic: true });
}, 60_000);

afterAll(async () => {
  await h?.stop();
});

beforeEach(async () => {
  await h.reset();
});

const NOW = new Date('2026-11-09T10:00:00Z');
const orgId = async () => (await h.db.selectFrom('organizations').select('id').where('code', '=', 'ALIF').executeTakeFirstOrThrow()).id;
const review = {
  reviewer: 'Reviewer (synthetic)',
  qualification: 'Test only',
  mushafPrinting: 'Synthetic printing (test)',
  signOffRef: 'Synthetic sign-off register entry (test)',
  decision: 'APPROVED',
  signedOn: '2026-11-09',
  findings: [],
};

/** Registers every source file of a conversion in the catalogue (synthetic unless told), returning their ids by file. */
async function registerAll(sources: { file: string; provider: string; resourceId: string | null; fileName: string; fileSha256: string }[], synthetic = true) {
  const ids: Record<string, string> = {};
  for (const s of sources) {
    ids[s.file] = (
      await registry.register(
        {
          provider: s.provider,
          resourceName: `Synthetic ${s.file}`,
          resourceId: s.resourceId,
          category: s.file === 'layout' ? 'LAYOUT' : s.file === 'words' ? 'WORDS' : s.file === 'juz' ? 'JUZ' : 'SURAHS',
          sourceUrl: 'https://example.invalid/synthetic',
          downloadUrl: null,
          downloadedOn: '2026-11-09',
          fileName: s.fileName,
          fileSha256: s.fileSha256,
          sourceVersion: null,
          notes: 'Test fixture, not a Quran dataset',
          registeredBy: 'integration test',
        },
        { synthetic },
      )
    ).id;
  }
  return ids;
}

const grant = (id: string, publisherClearanceRef: string | null = null) =>
  registry.recordLicence(id, {
    status: 'PERMISSION_GRANTED',
    licenceName: null,
    permissionRef: 'Synthetic permission letter (test)',
    publisherClearanceRef,
    attributionText: null,
    recordedBy: 'integration test',
  });

/** The catalogue as the CLI's --check-sources sees it. */
async function catalogueLookup(): Promise<SourceStatusLookup> {
  const rows = await registry.list();
  return (ref) => {
    const row = rows.find((r) => r.provider === ref.provider && r.resourceId === ref.resourceId && r.fileSha256 === ref.fileSha256);
    return row?.licence ? { synthetic: row.synthetic, status: row.licence.status as never, publisherClearanceRef: row.licence.publisherClearanceRef } : null;
  };
}

describe('F06 · converted, signed synthetic data through the loader', () => {
  it('with every source registered and cleared (layout with publisher clearance), the signed seed is applied', async () => {
    const files = syntheticFiles(syntheticSources());
    const first = convertSources(syntheticManifest(), files, { now: NOW });
    const ids = await registerAll(first.report.sources);
    for (const file of ['surahs', 'juz', 'words']) await grant(ids[file]!);
    await grant(ids.layout!, 'Synthetic publisher letter (test)');

    // Re-run with the catalogue: the report now shows the licence status, and only the synthetic flag and review block.
    const converted = convertSources(syntheticManifest(), files, { now: NOW, sourceStatus: await catalogueLookup() });
    expect(converted.report.gate.blockers).toEqual(['SYNTHETIC_DATA', 'REVIEW_PENDING']);
    const signed = signDataset(converted.seed!, converted.report, review);

    const result = await loader.apply(await orgId(), signed.seed, null, { report: signed.report });
    expect(result).toMatchObject({ metadata: 'APPLIED', layouts: [{ edition: 'INDOPAK_16_LINE', status: 'APPLIED' }] });
    const imports = (await h.call('GET', '/quran/imports', await h.signIn('admin.a'))).json().items as {
      kind: string;
      reviewDecision: string;
      validationReportSha256: string;
      sources: { role: string }[];
    }[];
    const layout = imports.find((i) => i.kind === 'LAYOUT')!;
    expect(layout.reviewDecision).toBe('APPROVED');
    expect(layout.validationReportSha256).toBe(signed.reportSha256);
    expect(layout.sources.map((s) => s.role).sort()).toEqual(['LAYOUT', 'WORDS']);
    expect(imports.find((i) => i.kind === 'METADATA')!.sources.map((s) => s.role)).toEqual(['METADATA', 'METADATA']);

    const counted = (await h.call('GET', '/quran/line-count?surah=1&ayahStart=1&ayahEnd=4', await h.signIn('teacher.a1'))).json();
    expect(counted).toMatchObject({ totalLines: 3, source: 'LAYOUT' });
  });

  it('the loader refuses the same signed seed while a source is uncleared or the layout lacks publisher clearance', async () => {
    const files = syntheticFiles(syntheticSources());
    const converted = convertSources(syntheticManifest(), files, { now: NOW });
    const ids = await registerAll(converted.report.sources);
    const signed = signDataset(converted.seed!, converted.report, review);

    const refused = await loader.apply(await orgId(), signed.seed).catch((e: SeedRejectedError) => e);
    expect((refused as SeedRejectedError).issues.map((i) => i.code)).toEqual(['LICENCE_NOT_CLEARED', 'LICENCE_NOT_CLEARED', 'LICENCE_NOT_CLEARED', 'LICENCE_NOT_CLEARED']);

    for (const file of ['surahs', 'juz', 'words', 'layout']) await grant(ids[file]!);
    const noPublisher = await loader.apply(await orgId(), signed.seed).catch((e: SeedRejectedError) => e);
    expect((noPublisher as SeedRejectedError).issues).toEqual([{ path: 'sources[2]', code: 'PUBLISHER_CLEARANCE_REQUIRED' }]);
    const n = await withTenant(h.db, await orgId(), (tx) => tx.selectFrom('quran_imports').select('id').execute());
    expect(n).toHaveLength(0);
  });

  it('an unsigned or rejected conversion is refused by the loader even with every licence cleared', async () => {
    const files = syntheticFiles(syntheticSources());
    const converted = convertSources(syntheticManifest(), files, { now: NOW });
    const ids = await registerAll(converted.report.sources);
    for (const file of ['surahs', 'juz', 'words']) await grant(ids[file]!);
    await grant(ids.layout!, 'Synthetic publisher letter (test)');

    const rejected = signDataset(converted.seed!, converted.report, { ...review, decision: 'REJECTED', findings: [{ part: 'C4', description: 'Line break differs', blocking: true }] });
    const err = await loader.apply(await orgId(), rejected.seed).catch((e: SeedRejectedError) => e);
    expect((err as SeedRejectedError).issues).toEqual([{ path: 'validationReport.decision', code: 'NOT_APPROVED' }]);

    // A production-flagged conversion without the reviewer's signature (synthetic values; proved by refusal only).
    const production = convertSources(syntheticManifest({ provenance: { sourceName: 'X', sourceUrl: null, licence: 'X', synthetic: false } }), files, { now: NOW });
    const unsigned = await loader.apply(await orgId(), production.seed!).catch((e: SeedRejectedError) => e);
    expect((unsigned as SeedRejectedError).issues).toEqual(
      expect.arrayContaining([{ path: 'provenance.reviewedBy', code: 'REQUIRED' }, { path: 'validationReport', code: 'REQUIRED' }]),
    );
  });

  it('a production-flagged, signed conversion that cites synthetic sources is refused (never imported)', async () => {
    const files = syntheticFiles(syntheticSources());
    const production = convertSources(syntheticManifest({ provenance: { sourceName: 'X', sourceUrl: null, licence: 'X', synthetic: false } }), files, { now: NOW });
    const ids = await registerAll(production.report.sources);
    for (const file of ['surahs', 'juz', 'words']) await grant(ids[file]!);
    await grant(ids.layout!, 'Synthetic publisher letter (test)');
    const signed = signDataset(production.seed!, production.report, review);
    const err = await loader.apply(await orgId(), signed.seed, null, { report: signed.report }).catch((e: SeedRejectedError) => e);
    expect((err as SeedRejectedError).issues.every((i) => i.code === 'SYNTHETIC_SOURCE')).toBe(true);
    expect(await withTenant(h.db, await orgId(), (tx) => tx.selectFrom('quran_imports').select('id').execute())).toHaveLength(0);
  });

  it('P5 / DEC-B78: a production seed is applied only with its signed report, which is checked and stored with the evidence', async () => {
    // Production-FLAGGED synthetic values with their own provider, registered as non-test sources in this throwaway
    // database only, to prove the gate. No real source, licence, reviewer, or printing exists here.
    const files = syntheticFiles(syntheticSources());
    const manifest = syntheticManifest({ provenance: { sourceName: 'X', sourceUrl: null, licence: 'X', synthetic: false } });
    for (const f of Object.values(manifest.files)) f.provider = 'SYNTH_PROD';
    const production = convertSources(manifest, files, { now: NOW });
    const ids = await registerAll(production.report.sources, false);
    for (const file of ['surahs', 'juz', 'words']) await grant(ids[file]!);
    await grant(ids.layout!, 'Synthetic publisher letter (test)');
    const signed = signDataset(production.seed!, production.report, review);
    const org = await orgId();
    const imports = () => withTenant(h.db, org, (tx) => tx.selectFrom('quran_imports').selectAll().execute());
    const issuesOf = async (p: Promise<unknown>) => ((await p.catch((e: SeedRejectedError) => e)) as SeedRejectedError).issues;

    // Without the report: refused, nothing stored.
    expect(await issuesOf(loader.apply(org, signed.seed))).toEqual([{ path: 'validationReport.report', code: 'REQUIRED' }]);
    // A report whose content differs from what was signed: refused.
    const tampered = structuredClone(signed.report);
    tampered.review.mushafPrinting = 'A different printing';
    expect(await issuesOf(loader.apply(org, signed.seed, null, { report: tampered }))).toEqual([{ path: 'validationReport.report', code: 'HASH_MISMATCH' }]);
    // A seed whose evidence was edited after signing (hash kept): refused, naming the field.
    const edited = structuredClone(signed.seed);
    edited.validationReport!.signOffRef = 'Somewhere else';
    expect(await issuesOf(loader.apply(org, edited, null, { report: signed.report }))).toEqual([{ path: 'validationReport.report.review.signOffRef', code: 'REPORT_MISMATCH' }]);
    // The report of a different conversion: refused.
    const other = signDataset(convertSources({ ...manifest, datasetVersion: '9' }, files, { now: NOW }).seed!, convertSources({ ...manifest, datasetVersion: '9' }, files, { now: NOW }).report, review);
    expect((await issuesOf(loader.apply(org, signed.seed, null, { report: other.report })))[0]).toEqual({ path: 'validationReport.report', code: 'HASH_MISMATCH' });
    expect(await imports()).toHaveLength(0);

    // With its own signed report: applied, and the evidence is preserved on every import.
    expect(await loader.apply(org, signed.seed, null, { report: signed.report })).toMatchObject({ metadata: 'APPLIED', layouts: [{ status: 'APPLIED' }] });
    const rows = await imports();
    expect(rows).toHaveLength(2);
    for (const row of rows) {
      expect(row).toMatchObject({
        synthetic: false,
        reviewed_by: 'Reviewer (synthetic)',
        review_decision: 'APPROVED',
        validation_report_sha256: signed.reportSha256,
        mushaf_printing: 'Synthetic printing (test)',
        signoff_ref: 'Synthetic sign-off register entry (test)',
      });
      expect(row.validation_report).toEqual(JSON.parse(JSON.stringify(signed.report)));
    }
    const view = (await h.call('GET', '/quran/imports', await h.signIn('admin.a'))).json().items as Record<string, unknown>[];
    expect(view.every((i) => i.mushafPrinting === 'Synthetic printing (test)' && i.validationReportStored === true)).toBe(true);
    const edition = (await h.call('GET', '/quran/editions', await h.signIn('teacher.a1'))).json().editions[0];
    expect(edition).toMatchObject({ hasLayout: true, layoutVerified: true, layoutWithdrawn: false, verification: 'UNVERIFIED' });
  });
});
