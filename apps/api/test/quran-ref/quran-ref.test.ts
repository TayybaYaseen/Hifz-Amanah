// F06 · Quran reference — integration against real Postgres (docs/specs/07-f06-quran-portions-metadata.md).
// SYNTHETIC DATA ONLY: every Quran value here comes from packages/domain/quran-ref/synthetic-fixture.ts (20 Ayat per
// Surah, names "اختبار n"), which matches no real Mushaf. No real Quran metadata is used or loaded.
import { sql } from 'kysely';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { syntheticLayout, syntheticSeed, syntheticSurahs } from '@hifz/domain/quran-ref/synthetic-fixture';
import type { QuranSeed } from '@hifz/domain/quran-ref';
import { OrganizationService } from '../../src/modules/organization/organization-service.ts';
import { QuranMetadataService } from '../../src/modules/quran-ref/metadata-service.ts';
import { QuranSeedLoader, SeedRejectedError, parseSeed, seedChecksum } from '../../src/modules/quran-ref/seed.ts';
import { withTenant } from '../../src/platform/tenant.ts';
import { startHarness, type Harness } from '../support/harness.ts';

let h: Harness;
type AuditRow = { action: string; actor_user_id: string | null; target_type: string; summary: Record<string, unknown> };

beforeAll(async () => {
  h = await startHarness();
}, 60_000);

afterAll(async () => {
  await h?.stop();
});

beforeEach(async () => {
  await h.reset();
});

const orgId = async (code: string) => (await h.db.selectFrom('organizations').select('id').where('code', '=', code).executeTakeFirstOrThrow()).id;
const seed = (code = 'ALIF', body?: object) => h.control('POST', '/quran/seed', { organizationCode: code, ...(body ? { seed: body } : {}) });
const audit = async (targetId: string) => (await h.control('GET', `/audit-target/${targetId}`)).json().items as AuditRow[];

const SURAH_BODY = { nameAr: 'اختبار ٢', nameTranslit: 'Synthetic 2', ayahCount: 20, rowVersion: null };

describe('F06 · metadata reads and the empty state', () => {
  it('a new madrasa with no approved seed has no Quran data, and says so (edge case)', async () => {
    const teacher = await h.signIn('teacher.a1');
    for (const path of ['/quran/surahs', '/quran/paras']) {
      const res = await h.call('GET', path, teacher);
      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual({ items: [], empty: true });
    }
    const editions = (await h.call('GET', '/quran/editions', teacher)).json();
    expect(editions.active).toBe('INDOPAK_16_LINE');
    expect(editions.editions).toEqual([
      { code: 'INDOPAK_16_LINE', name: '16-line Indo-Pak Mushaf', linesPerPage: 16, publisher: null, printingId: null, pageCount: null, verification: 'UNVERIFIED', hasLayout: false, layoutVerified: false, layoutWithdrawn: false },
    ]);
  });

  it('Students and Parents cannot read Quran metadata', async () => {
    for (const who of ['student.s1', 'parent.p1'] as const) {
      expect((await h.call('GET', '/quran/surahs', await h.signIn(who))).statusCode).toBe(403);
    }
  });
});

describe('F06 · Admin edits (US-024)', () => {
  it('F06-AC1 (US-024) an Admin adds and edits a Surah and a Para boundary; each change is audited', async () => {
    const admin = await h.signIn('admin.a');
    const created = await h.call('PUT', '/quran/surahs/2', admin, SURAH_BODY);
    expect(created.statusCode).toBe(200);
    const surah = created.json().surah;
    expect(surah).toMatchObject({ number: 2, nameAr: 'اختبار ٢', ayahCount: 20, source: 'ADMIN', rowVersion: 1 });

    const edited = await h.call('PUT', '/quran/surahs/2', admin, { ...SURAH_BODY, ayahCount: 21, rowVersion: 1 });
    expect(edited.json().surah).toMatchObject({ ayahCount: 21, rowVersion: 2 });

    const adminId = await h.userId('admin.a');
    const rows = await audit(surah.id);
    expect(rows.map((r) => r.action)).toEqual(['QURAN_SURAH_CREATED', 'QURAN_SURAH_UPDATED']);
    expect(rows[1]).toMatchObject({ actor_user_id: adminId, target_type: 'QURAN_SURAH' });
    expect(rows[1]!.summary).toMatchObject({ surah: 2, before: { ayahCount: 20 }, after: { ayahCount: 21 } });

    await h.call('PUT', '/quran/surahs/1', admin, { ...SURAH_BODY, nameAr: 'اختبار ١', nameTranslit: 'Synthetic 1' });
    const para = await h.call('PUT', '/quran/paras/1', admin, { start: { surah: 1, ayah: 1 }, end: { surah: 2, ayah: 10 }, rowVersion: null });
    expect(para.statusCode).toBe(200);
    expect(para.json().para).toMatchObject({ number: 1, start: { surah: 1, ayah: 1 }, end: { surah: 2, ayah: 10 }, source: 'ADMIN' });
    expect((await audit(para.json().para.id)).map((r) => r.action)).toEqual(['QURAN_PARA_CREATED']);

    // Madrasa B does not see Madrasa A's metadata (tenant isolation).
    expect((await h.call('GET', '/quran/surahs', await h.signIn('admin.b'))).json().items).toEqual([]);
  });

  it('a stale edit is refused instead of overwriting another Admin’s change', async () => {
    const admin = await h.signIn('admin.a');
    await h.call('PUT', '/quran/surahs/2', admin, SURAH_BODY);
    const stale = await h.call('PUT', '/quran/surahs/2', admin, { ...SURAH_BODY, rowVersion: null });
    expect(stale.statusCode).toBe(409);
    expect(stale.json().error.code).toBe('CONFLICT_STALE');
  });

  it('F06-AC2 (US-024) a Teacher cannot edit Quran metadata: the API returns forbidden', async () => {
    const teacher = await h.signIn('teacher.a1');
    expect((await h.call('PUT', '/quran/surahs/2', teacher, SURAH_BODY)).statusCode).toBe(403);
    expect((await h.call('PUT', '/quran/paras/1', teacher, { start: { surah: 1, ayah: 1 }, end: { surah: 1, ayah: 2 }, rowVersion: null })).statusCode).toBe(403);
    expect((await h.call('GET', '/quran/review', teacher)).statusCode).toBe(403);
    expect((await h.call('GET', '/quran/imports', teacher)).statusCode).toBe(403);
    expect((await h.call('GET', '/quran/surahs', await h.signIn('admin.a'))).json().items).toEqual([]);
  });

  it('F06-AC3 (US-024) the Arabic name is stored and returned byte-identical in every interface language', async () => {
    const admin = await h.signIn('admin.a');
    // Diacritics, a decomposed madda, tatweel, and a trailing space: none may be normalized or trimmed.
    const nameAr = 'آلـبَقَرَة ';
    await h.call('PUT', '/quran/surahs/2', admin, { ...SURAH_BODY, nameAr });
    const stored = await withTenant(h.db, await orgId('ALIF'), (tx) => tx.selectFrom('quran_surahs').select('name_ar').where('number', '=', 2).executeTakeFirstOrThrow());
    expect(Buffer.from(stored.name_ar, 'utf8').equals(Buffer.from(nameAr, 'utf8'))).toBe(true);
    for (const locale of ['en', 'ur', 'ur-Latn']) {
      const res = await h.app.inject({ method: 'GET', url: '/quran/surahs', headers: { authorization: `Bearer ${admin}`, 'accept-language': locale } });
      expect(res.json().items[0].nameAr).toBe(nameAr);
    }
  });

  it('F06-AC4 (US-024) a Para boundary whose end is before its start is rejected with a field error', async () => {
    const admin = await h.signIn('admin.a');
    await h.call('PUT', '/quran/surahs/1', admin, { ...SURAH_BODY, nameAr: 'اختبار ١', nameTranslit: 'Synthetic 1' });
    const res = await h.call('PUT', '/quran/paras/1', admin, { start: { surah: 1, ayah: 10 }, end: { surah: 1, ayah: 2 }, rowVersion: null });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.fields).toEqual({ end: 'END_BEFORE_START' });
    const beyond = await h.call('PUT', '/quran/paras/1', admin, { start: { surah: 1, ayah: 1 }, end: { surah: 1, ayah: 25 }, rowVersion: null });
    expect(beyond.json().error.fields).toEqual({ end: 'OUT_OF_RANGE', 'end.max': '20' });
  });

  it('invalid Surah rows are refused with field errors (F06-AC5 range for the number)', async () => {
    const admin = await h.signIn('admin.a');
    expect((await h.call('PUT', '/quran/surahs/115', admin, SURAH_BODY)).statusCode).toBe(400);
    const res = await h.call('PUT', '/quran/surahs/2', admin, { ...SURAH_BODY, nameAr: '  ', ayahCount: 0 });
    expect(res.json().error.fields).toMatchObject({ nameAr: 'REQUIRED', ayahCount: 'OUT_OF_RANGE' });
  });
});

describe('F06 · review list (F06-AC19, DEC-B32)', () => {
  it('lists missing metadata and the missing 16-line layout; an edit that breaks a Para boundary is listed, not changed', async () => {
    const admin = await h.signIn('admin.a');
    const empty = (await h.call('GET', '/quran/review', admin)).json();
    expect(empty.findings.map((f: { code: string }) => f.code)).toEqual(['MISSING_SURAHS', 'MISSING_PARAS', 'LAYOUT_MISSING']);
    expect(empty.findings[2]).toEqual({ code: 'LAYOUT_MISSING', edition: 'INDOPAK_16_LINE' });
    expect(empty.records).toEqual([]);

    expect((await seed()).statusCode).toBe(200);
    expect((await h.call('GET', '/quran/review', admin)).json().findings).toEqual([]);

    // Shrink Surah 114 below the end of Para 30: the boundary stays as stored and is flagged for review.
    const s114 = (await h.call('GET', '/quran/surahs', admin)).json().items.find((s: { number: number }) => s.number === 114);
    const res = await h.call('PUT', '/quran/surahs/114', admin, { nameAr: s114.nameAr, nameTranslit: s114.nameTranslit, ayahCount: 10, rowVersion: s114.rowVersion });
    expect(res.statusCode).toBe(200);
    const para30 = (await h.call('GET', '/quran/paras', admin)).json().items.find((p: { number: number }) => p.number === 30);
    expect(para30.end).toEqual({ surah: 114, ayah: 20 });
    expect((await h.call('GET', '/quran/review', admin)).json().findings).toEqual([
      { code: 'PARA_INVALID', para: 30, issues: [{ field: 'end', code: 'OUT_OF_RANGE', max: 10 }] },
    ]);
  });

  it('records holding a range that no longer fits are listed for review and left unchanged', async () => {
    const admin = await h.signIn('admin.a');
    await seed();
    const ranges = [
      { kind: 'SABAQ_PORTION', id: '0190f5c0-0000-7000-8000-00000000000a', range: { surah: 5, ayahStart: 15, ayahEnd: 20 } },
      { kind: 'SABAQ_PORTION', id: '0190f5c0-0000-7000-8000-00000000000b', range: { surah: 5, ayahStart: 1, ayahEnd: 3 } },
    ];
    const service = new QuranMetadataService(h.db, h.clock, async () => ranges, { allowSynthetic: true });
    const actor = { userId: await h.userId('admin.a'), organizationId: await orgId('ALIF'), role: 'ADMIN' as const, allClasses: false };
    const surahs = (await h.call('GET', '/quran/surahs', admin)).json().items;
    const s5 = surahs.find((s: { number: number }) => s.number === 5);
    const saved = await service.saveSurah(actor as never, 5, { nameAr: s5.nameAr, nameTranslit: s5.nameTranslit, ayahCount: 12, rowVersion: s5.rowVersion });
    expect(saved.recordsNeedingReview).toBe(1);
    const review = await service.review(actor as never);
    expect(review.records).toEqual([{ ...ranges[0], issues: [{ field: 'ayahStart', code: 'OUT_OF_RANGE', max: 12 }, { field: 'ayahEnd', code: 'OUT_OF_RANGE', max: 12 }] }]);
    expect(ranges[0]!.range).toEqual({ surah: 5, ayahStart: 15, ayahEnd: 20 });
  });
});

describe('F06 · Total Lines lookup on the 16-line edition (FR-SAB-008)', () => {
  it('without a verified layout the count is unavailable, so the Teacher enters it; the Para is still derived', async () => {
    const loader = new QuranSeedLoader(h.db, h.clock, { allowSynthetic: true });
    await loader.apply(await orgId('ALIF'), syntheticSeed({ layouts: [] }));
    const teacher = await h.signIn('teacher.a1');
    const res = (await h.call('GET', '/quran/line-count?surah=1&ayahStart=1&ayahEnd=6', teacher)).json();
    expect(res).toEqual({ edition: 'INDOPAK_16_LINE', totalLines: null, source: 'UNAVAILABLE', layoutImportId: null, para: 1, issues: [] });
  });

  it('with a verified layout the count is pre-filled from it; ranges outside the Surah name the maximum Ayat', async () => {
    await seed();
    const teacher = await h.signIn('teacher.a1');
    const res = (await h.call('GET', '/quran/line-count?surah=1&ayahStart=1&ayahEnd=6', teacher)).json();
    expect(res).toMatchObject({ edition: 'INDOPAK_16_LINE', totalLines: 3, source: 'LAYOUT', para: 1, issues: [] });
    expect(res.layoutImportId).toMatch(/^[0-9a-f-]{36}$/);
    // Layout covers only Surahs 1–3 in the fixture: Surah 4 (synthetic Para 2) has no line data, so nothing is guessed.
    expect((await h.call('GET', '/quran/line-count?surah=4&ayahStart=1&ayahEnd=2', teacher)).json()).toMatchObject({ totalLines: null, source: 'UNAVAILABLE', para: 2 });
    const bad = (await h.call('GET', '/quran/line-count?surah=1&ayahStart=3&ayahEnd=25', teacher)).json();
    expect(bad).toMatchObject({ totalLines: null, para: null, issues: [{ field: 'ayahEnd', code: 'OUT_OF_RANGE', max: 20 }] });
    expect((await h.call('GET', '/quran/editions', teacher)).json().editions[0].hasLayout).toBe(true);
  });
});

describe('F06 · seed loader (FR-SAB-007, DEC-B31)', () => {
  it('records provenance for each import, and re-applying the same version is a no-op (repeatable)', async () => {
    const first = (await seed()).json();
    expect(first).toEqual({ metadata: 'APPLIED', layouts: [{ edition: 'INDOPAK_16_LINE', status: 'APPLIED' }], keptAdminEdits: { surahs: [], paras: [] } });
    const again = (await seed()).json();
    expect(again).toEqual({ metadata: 'ALREADY_APPLIED', layouts: [{ edition: 'INDOPAK_16_LINE', status: 'ALREADY_APPLIED' }], keptAdminEdits: { surahs: [], paras: [] } });

    const admin = await h.signIn('admin.a');
    const imports = (await h.call('GET', '/quran/imports', admin)).json().items;
    expect(imports).toHaveLength(2);
    for (const i of imports) {
      expect(i).toMatchObject({ datasetKey: 'synthetic-test', datasetVersion: '1', sourceName: 'Synthetic test fixture', synthetic: true, active: true });
      expect(i.checksum).toBe(seedChecksum(syntheticSeed()));
      const rows = await audit(i.id);
      expect(rows.map((r) => r.action)).toEqual([i.kind === 'METADATA' ? 'QURAN_SEED_APPLIED' : 'QURAN_LAYOUT_APPLIED']);
    }
    expect(imports.find((i: { kind: string }) => i.kind === 'LAYOUT').counts).toEqual({
      lines: syntheticLayout().length,
      pages: new Set(syntheticLayout().map((l) => l.page)).size,
      // Format-1 lines are all Ayat lines (migration 0010 counts each line type).
      ayahLines: syntheticLayout().length,
      surahNameLines: 0,
      basmallahLines: 0,
    });
    const { n } = await withTenant(h.db, await orgId('ALIF'), (tx) => tx.selectFrom('quran_surahs').select((eb) => eb.fn.countAll<string>().as('n')).executeTakeFirstOrThrow());
    expect(Number(n)).toBe(114);
  });

  it('the same version with different content is refused, and nothing is written', async () => {
    await seed();
    const changed = syntheticSeed();
    changed.metadata!.surahs[0] = { ...changed.metadata!.surahs[0]!, nameTranslit: 'Synthetic one (changed)' };
    const res = await seed('ALIF', changed);
    expect(res.statusCode).toBe(400);
    expect(res.json().issues).toEqual([{ path: 'datasetVersion', code: 'CONTENT_CHANGED' }]);
  });

  it('a newer version updates rows still as seeded but keeps every Admin edit', async () => {
    await seed();
    const admin = await h.signIn('admin.a');
    const s7 = (await h.call('GET', '/quran/surahs', admin)).json().items.find((s: { number: number }) => s.number === 7);
    await h.call('PUT', '/quran/surahs/7', admin, { nameAr: s7.nameAr, nameTranslit: 'Synthetic seven (Admin)', ayahCount: 20, rowVersion: s7.rowVersion });
    const v2 = syntheticSeed({ datasetVersion: '2', layouts: [] });
    v2.metadata!.surahs = v2.metadata!.surahs.map((s) => ({ ...s, nameTranslit: `${s.nameTranslit} v2` }));
    const res = (await seed('ALIF', v2)).json();
    expect(res).toMatchObject({ metadata: 'APPLIED', keptAdminEdits: { surahs: [7], paras: [] } });
    const items = (await h.call('GET', '/quran/surahs', admin)).json().items;
    expect(items.find((s: { number: number }) => s.number === 6)).toMatchObject({ nameTranslit: 'Synthetic 6 v2', source: 'SEED', rowVersion: 2 });
    expect(items.find((s: { number: number }) => s.number === 7)).toMatchObject({ nameTranslit: 'Synthetic seven (Admin)', source: 'ADMIN' });
  });

  it('a newer layout is a new import; the old lines stay and the active layout moves', async () => {
    await seed();
    const v2 = syntheticSeed({ datasetVersion: '2', metadata: null, layouts: [{ edition: 'INDOPAK_16_LINE', linesPerPage: 16, lines: syntheticLayout(4) }] });
    expect((await seed('ALIF', v2)).json().layouts).toEqual([{ edition: 'INDOPAK_16_LINE', status: 'APPLIED' }]);
    const admin = await h.signIn('admin.a');
    const imports = (await h.call('GET', '/quran/imports', admin)).json().items.filter((i: { kind: string }) => i.kind === 'LAYOUT');
    expect(imports.map((i: { datasetVersion: string; active: boolean }) => [i.datasetVersion, i.active])).toEqual([['2', true], ['1', false]]);
    const lines = await withTenant(h.db, await orgId('ALIF'), (tx) => tx.selectFrom('mushaf_layout_lines').select((eb) => eb.fn.countAll<string>().as('n')).executeTakeFirstOrThrow());
    expect(Number(lines.n)).toBe(syntheticLayout(3).length + syntheticLayout(4).length);
    expect((await h.call('GET', '/quran/line-count?surah=4&ayahStart=1&ayahEnd=2', admin)).json()).toMatchObject({ totalLines: 1, source: 'LAYOUT' });
  });

  it('an invalid seed is refused whole: nothing is written', async () => {
    const bad = syntheticSeed();
    bad.layouts[0]!.lines.push({ page: 1, line: 17, surah: 1, ayahStart: 1, ayahEnd: 1 });
    const res = await seed('ALIF', bad);
    expect(res.statusCode).toBe(400);
    expect(res.json().issues.map((i: { path: string; code: string }) => `${i.path}:${i.code}`)).toContain(`layouts[0].lines[${bad.layouts[0]!.lines.length - 1}].line:OUT_OF_RANGE`);
    const admin = await h.signIn('admin.a');
    expect((await h.call('GET', '/quran/surahs', admin)).json().empty).toBe(true);
    expect((await h.call('GET', '/quran/imports', admin)).json().items).toEqual([]);
    expect((await seed('ALIF', { format: 'nope' })).statusCode).toBe(400);
  });

  it('a synthetic seed is refused outside tests, and a production seed without a reviewer is refused', async () => {
    const prodLoader = new QuranSeedLoader(h.db, h.clock, { allowSynthetic: false });
    const organizationId = await orgId('ALIF');
    await expect(prodLoader.apply(organizationId, syntheticSeed())).rejects.toBeInstanceOf(SeedRejectedError);
    const unreviewed: QuranSeed = { ...syntheticSeed(), provenance: { ...syntheticSeed().provenance, synthetic: false } };
    const error = await prodLoader.apply(organizationId, unreviewed).catch((e: SeedRejectedError) => e);
    expect((error as SeedRejectedError).issues.map((i) => i.path)).toEqual(['provenance.reviewedBy', 'provenance.approvedOn', 'formatVersion']); // production needs format 2 (DEC-B72)
    // The database also refuses a non-synthetic import without a reviewer and approval date.
    await expect(
      sql`INSERT INTO quran_imports (id, organization_id, kind, dataset_key, dataset_version, source_name, licence, synthetic, checksum, counts, applied_at)
          VALUES (gen_random_uuid(), ${organizationId}, 'METADATA', 'x-test', '1', 'x', 'x', false, ${'0'.repeat(64)}, '{}', now())`.execute(h.db),
    ).rejects.toThrow();
  });

  it('a new madrasa starts from the configured seed in the same transaction (F06-AC18 mechanism; synthetic here)', async () => {
    const loader = new QuranSeedLoader(h.db, h.clock, { allowSynthetic: true });
    const orgs = new OrganizationService(h.db, h.clock, async (tx, organizationId) => void (await loader.applyInTx(tx, organizationId, syntheticSeed(), null)));
    const owner = { loginId: 'JEEM-owner', displayName: 'Owner (test)', email: null, password: 'a-long-test-passphrase' };
    const { organizationId } = await orgs.createWorkspace({ kind: 'MADRASA', name: 'Madrasa Jeem (test)', code: 'JEEM', owner });
    const counts = await withTenant(h.db, organizationId, async (tx) => ({
      surahs: Number((await tx.selectFrom('quran_surahs').select((eb) => eb.fn.countAll<string>().as('n')).executeTakeFirstOrThrow()).n),
      paras: Number((await tx.selectFrom('quran_paras').select((eb) => eb.fn.countAll<string>().as('n')).executeTakeFirstOrThrow()).n),
    }));
    expect(counts).toEqual({ surahs: 114, paras: 30 });

    // A seed failure rolls the whole workspace back.
    const failing = new OrganizationService(h.db, h.clock, async () => {
      throw new SeedRejectedError([{ path: 'x', code: 'TEST' }]);
    });
    await expect(failing.createWorkspace({ kind: 'MADRASA', name: 'Madrasa Daal (test)', code: 'DAAL', owner: { ...owner, loginId: 'DAAL-owner' } })).rejects.toBeInstanceOf(SeedRejectedError);
    expect(await h.db.selectFrom('organizations').select('id').where('code', '=', 'DAAL').executeTakeFirst()).toBeUndefined();
  });

  it('parses the documented file format and rejects unknown keys', () => {
    expect(parseSeed(JSON.parse(JSON.stringify(syntheticSeed())))).toEqual(syntheticSeed());
    expect(() => parseSeed({ ...syntheticSeed(), extra: 1 })).toThrow(SeedRejectedError);
    expect(syntheticSurahs()).toHaveLength(114);
  });
});

describe('F06 · multiple Mushaf editions', () => {
  it('a second edition is a catalogue row, and a madrasa can count on it without any schema change', async () => {
    await sql`INSERT INTO mushaf_editions (code, name, lines_per_page) VALUES ('TEST_13_LINE', 'Synthetic 13-line test edition', 13)`.execute(h.db);
    try {
      const both = syntheticSeed({
        layouts: [
          { edition: 'INDOPAK_16_LINE', linesPerPage: 16, lines: syntheticLayout(3, 16) },
          { edition: 'TEST_13_LINE', linesPerPage: 13, lines: syntheticLayout(3, 13) },
        ],
      });
      expect((await seed('ALIF', both)).json().layouts).toEqual([
        { edition: 'INDOPAK_16_LINE', status: 'APPLIED' },
        { edition: 'TEST_13_LINE', status: 'APPLIED' },
      ]);
      const admin = await h.signIn('admin.a');
      const editions = (await h.call('GET', '/quran/editions', admin)).json();
      expect(editions.editions.map((e: { code: string; hasLayout: boolean }) => [e.code, e.hasLayout])).toEqual([['INDOPAK_16_LINE', true], ['TEST_13_LINE', true]]);
      await sql`UPDATE organizations SET mushaf_edition = 'TEST_13_LINE' WHERE code = 'ALIF'`.execute(h.db);
      const res = (await h.call('GET', '/quran/line-count?surah=1&ayahStart=1&ayahEnd=6', admin)).json();
      expect(res).toMatchObject({ edition: 'TEST_13_LINE', totalLines: 3, source: 'LAYOUT' });
    } finally {
      await sql`UPDATE organizations SET mushaf_edition = 'INDOPAK_16_LINE'`.execute(h.db);
      await h.reset();
      await sql`DELETE FROM mushaf_editions WHERE code = 'TEST_13_LINE'`.execute(h.db);
    }
  });
});
