// F06 · The Quran reference snapshot API — integration against real Postgres (ADR-018; FR-SAB-014; DEC-B75, DEC-B77,
// DEC-B78, DEC-B79; plan P1, P2; F06-AC24 server side, F06-AC26 distribution clause).
// SYNTHETIC DATA ONLY: every Quran value comes from packages/domain/quran-ref/synthetic-fixture.ts (20 Ayat per Surah,
// names "اختبار n"), which matches no real Mushaf. Sources are synthetic test entries; no real licence exists here.
import { createHash } from 'node:crypto';
import { sql } from 'kysely';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { ReferenceSnapshotV1Schema, ReferenceVersionResponse } from '@hifz/contracts';
import { evaluateRange, referenceIndex, type QuranSeedV2, type ReferenceSnapshotV1 } from '@hifz/domain/quran-ref';
import { syntheticSeedV2, syntheticSha } from '@hifz/domain/quran-ref/synthetic-fixture';
import { QuranReferenceService, servedFormat } from '../../src/modules/quran-ref/reference-service.ts';
import { QuranSourceRegistry } from '../../src/modules/quran-ref/sources.ts';
import { AppError } from '../../src/platform/errors.ts';
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

const sha = (text: string) => createHash('sha256').update(text, 'utf8').digest('hex');
const orgId = async (code: string) => (await h.db.selectFrom('organizations').select('id').where('code', '=', code).executeTakeFirstOrThrow()).id;
const seed = (body: object, code = 'ALIF') => h.control('POST', '/quran/seed', { organizationCode: code, seed: body });
const version = async (token: string, query = 'format=1') => h.call('GET', `/quran/reference/version?${query}`, token);
const snapshot = (token: string, headers: Record<string, string> = {}, query = 'format=1') =>
  h.app.inject({ method: 'GET', url: `/quran/reference/snapshot?${query}`, headers: { authorization: `Bearer ${token}`, ...headers } });

/** Registers a synthetic source and grants it (a layout with the publisher's clearance), returning its id and seed ref. */
async function grantedSource(n: number, role: 'METADATA' | 'LAYOUT' | 'WORDS', attribution: string | null = null) {
  const ref = { provider: 'SYNTH', resourceId: `res-${n}`, fileSha256: syntheticSha(100 + n), role };
  const { id } = await registry.register(
    {
      provider: ref.provider,
      resourceName: `Synthetic test source ${n}`,
      resourceId: ref.resourceId,
      category: role === 'LAYOUT' ? 'LAYOUT' : role === 'WORDS' ? 'WORDS' : 'SURAHS',
      sourceUrl: 'https://example.invalid/synthetic',
      downloadUrl: null,
      downloadedOn: '2026-11-09',
      fileName: `synthetic-${n}.json`,
      fileSha256: ref.fileSha256,
      sourceVersion: null,
      notes: 'Test fixture, not a Quran dataset',
      registeredBy: 'integration test',
    },
    { synthetic: true },
  );
  await registry.recordLicence(id, {
    status: 'PERMISSION_GRANTED',
    licenceName: null,
    permissionRef: 'Synthetic permission letter (test)',
    publisherClearanceRef: role === 'LAYOUT' ? 'Synthetic publisher letter (test)' : null,
    attributionText: attribution,
    recordedBy: 'integration test',
  });
  return { id, ref };
}

const withdraw = (id: string, status: 'REFUSED' | 'LICENSE_REVIEW_REQUIRED' = 'REFUSED') =>
  registry.recordLicence(id, { status, licenceName: null, permissionRef: null, publisherClearanceRef: null, attributionText: null, recordedBy: 'integration test' });

/** A synthetic format-2 seed built from two cleared synthetic sources (metadata and layout). */
async function sourcedSeed(over: Partial<QuranSeedV2> = {}) {
  const meta = await grantedSource(1, 'METADATA', 'Synthetic attribution (test)');
  const layout = await grantedSource(2, 'LAYOUT');
  const body = syntheticSeedV2({ sources: [meta.ref, layout.ref], ...over });
  expect((await seed(body)).statusCode).toBe(200);
  return { meta, layout };
}

const parseBody = (body: string) => ReferenceSnapshotV1Schema.parse(JSON.parse(body)) as ReferenceSnapshotV1;

describe('F06 · snapshot version and download (ADR-018 §3)', () => {
  it('the version check and the snapshot agree: sha256(body) = ETag = referenceVersion; the body is canonical and valid', async () => {
    await sourcedSeed();
    const teacher = await h.signIn('teacher.a1');
    const v = ReferenceVersionResponse.parse((await version(teacher)).json());
    const res = await snapshot(teacher);
    expect(res.statusCode).toBe(200);
    expect(res.headers.etag).toBe(`"${v.referenceVersion}"`);
    expect(res.headers['x-reference-version']).toBe(v.referenceVersion);
    expect(res.headers['cache-control']).toContain('no-store');
    expect(sha(res.body)).toBe(v.referenceVersion);
    expect(Buffer.byteLength(res.body)).toBe(v.bytes);
    const body = parseBody(res.body);
    expect(body.surahs).toHaveLength(114);
    expect(body.paras).toHaveLength(30);
    expect(body.attribution).toEqual(['Synthetic attribution (test)']);
    // Ayat lines only: no Surah-heading or Bismillah rows, no word positions or source word IDs (DEC-B77; FR-SAB-011).
    expect(body.lines.length).toBeGreaterThan(0);
    expect(body.lines.every((l) => l.length === 5)).toBe(true);
    const ayahLines = await withTenant(h.db, await orgId('ALIF'), (tx) =>
      tx.selectFrom('mushaf_layout_lines').select(sql<number>`count(*)::int`.as('n')).where('line_type', '=', 'AYAH').executeTakeFirstOrThrow(),
    );
    expect(body.lines).toHaveLength(ayahLines.n);
    // Deterministic: the same data gives the same version again.
    expect((await version(teacher)).json().referenceVersion).toBe(v.referenceVersion);
    expect(sha((await snapshot(teacher)).body)).toBe(v.referenceVersion);
  });

  it('If-None-Match with the current version answers 304 with no body; a stale one answers 200', async () => {
    await sourcedSeed();
    const admin = await h.signIn('admin.a');
    const current = (await version(admin)).json().referenceVersion as string;
    const same = await snapshot(admin, { 'if-none-match': `"${current}"` });
    expect(same.statusCode).toBe(304);
    expect(same.body).toBe('');
    expect((await snapshot(admin, { 'if-none-match': `"${syntheticSha(1)}"` })).statusCode).toBe(200);
  });

  it('the payload carries no Quran text, no word data, no user or student data, and no internal note (privacy)', async () => {
    await sourcedSeed();
    const raw = (await snapshot(await h.signIn('teacher.a1'))).body;
    expect(Object.keys(JSON.parse(raw)).sort()).toEqual(['attribution', 'edition', 'layout', 'lines', 'metadataWithdrawn', 'paras', 'snapshotFormatVersion', 'surahs']);
    for (const forbidden of ['word', 'note', 'student', 'login', 'email', 'organization', 'Word']) expect(raw).not.toContain(forbidden);
  });

  it('a madrasa with no reference data gets a valid, empty snapshot (the app shows "No Quran reference data yet")', async () => {
    const teacher = await h.signIn('teacher.a1');
    const v = (await version(teacher)).json();
    expect(v).toMatchObject({ empty: true, layout: { importId: null, verified: false, withdrawn: false }, metadataWithdrawn: false });
    const body = parseBody((await snapshot(teacher)).body);
    expect(body).toMatchObject({ surahs: [], paras: [], lines: [] });
  });

  it('the version changes after an Admin edit and after a new layout import; the old version is SUPERSEDED, not revoked', async () => {
    await sourcedSeed();
    const admin = await h.signIn('admin.a');
    const first = (await version(admin)).json().referenceVersion as string;
    const surah = (await h.call('GET', '/quran/surahs', admin)).json().items.find((s: { number: number }) => s.number === 5);
    expect((await h.call('PUT', '/quran/surahs/5', admin, { nameAr: surah.nameAr, nameTranslit: 'Synthetic five', ayahCount: 20, rowVersion: surah.rowVersion })).statusCode).toBe(200);
    const second = (await version(admin, `format=1&have=${first}`)).json();
    expect(second.referenceVersion).not.toBe(first);
    expect(second.cached).toEqual({ referenceVersion: first, status: 'SUPERSEDED' });
    expect((await version(admin, `format=1&have=${second.referenceVersion}`)).json().cached.status).toBe('CURRENT');
  });

  it('format negotiation: a newer app is served the newest format the server has; bad queries are refused', async () => {
    const teacher = await h.signIn('teacher.a1');
    expect((await version(teacher, 'format=7')).json().snapshotFormatVersion).toBe(1);
    expect(parseBody((await snapshot(teacher, {}, 'format=7')).body).snapshotFormatVersion).toBe(1);
    for (const q of ['', 'format=0', 'format=x', 'format=1&have=abc', `format=1&have=${'A'.repeat(64)}`, 'format=1&organizationId=x']) {
      expect((await version(teacher, q)).statusCode, q).toBe(400);
    }
    expect(servedFormat(1)).toBe(1);
    expect(() => servedFormat(0)).toThrow(AppError);
  });
});

describe('F06 · access and tenant isolation (AGENTS §6; AC-SEC)', () => {
  it('Owner, Admin, and Teacher may read the snapshot; Student and Parent get 403; no session gets 401', async () => {
    for (const who of ['owner.a', 'admin.a', 'teacher.a1'] as const) {
      const token = await h.signIn(who);
      expect((await version(token)).statusCode, who).toBe(200);
      expect((await snapshot(token)).statusCode, who).toBe(200);
    }
    for (const who of ['student.s1', 'parent.p1'] as const) {
      const token = await h.signIn(who);
      expect((await version(token)).statusCode, who).toBe(403);
      expect((await snapshot(token)).statusCode, who).toBe(403);
    }
    expect((await h.call('GET', '/quran/reference/version?format=1', null)).statusCode).toBe(401);
  });

  it("each madrasa gets only its own data; another madrasa's version is UNKNOWN, never revealed", async () => {
    await sourcedSeed();
    const a = (await version(await h.signIn('teacher.a1'))).json().referenceVersion as string;
    const b = await h.signIn('teacher.b1');
    expect(parseBody((await snapshot(b)).body).surahs).toEqual([]);
    expect((await version(b, `format=1&have=${a}`)).json().cached).toEqual({ referenceVersion: a, status: 'UNKNOWN' });
    const manifests = await withTenant(h.db, await orgId('BAA'), (tx) => tx.selectFrom('quran_reference_snapshots').select('reference_version').execute());
    expect(manifests.map((m) => m.reference_version)).not.toContain(a);
  });

  it('test data never leaves a test build: a production service distributes none of it, and nothing counts as verified', async () => {
    await sourcedSeed();
    const production = new QuranReferenceService(h.db, h.clock, { allowSynthetic: false });
    const actor = { userId: '00000000-0000-7000-8000-000000000000', organizationId: await orgId('ALIF'), role: 'TEACHER' as const, allClasses: false };
    const res = await production.snapshot(actor as never, { format: 1 }, undefined);
    if (res.status !== 200) throw new Error('expected a body');
    const body = parseBody(res.snapshot.body);
    expect(body).toMatchObject({ surahs: [], paras: [], lines: [], layout: { importId: null, verified: false } });
  });

  it('a light per-user limit applies to full downloads (429 RATE_LIMITED)', async () => {
    const limited = new QuranReferenceService(h.db, h.clock, { allowSynthetic: true, snapshotLimitPerHour: 2 });
    const actor = { userId: '00000000-0000-7000-8000-000000000001', organizationId: await orgId('ALIF'), role: 'TEACHER', allClasses: false };
    await limited.snapshot(actor as never, { format: 1 }, undefined);
    await limited.snapshot(actor as never, { format: 1 }, undefined);
    await expect(limited.snapshot(actor as never, { format: 1 }, undefined)).rejects.toMatchObject({ code: 'RATE_LIMITED' });
    h.clock.advance(3_600_001);
    await expect(limited.snapshot(actor as never, { format: 1 }, undefined)).resolves.toMatchObject({ status: 200 });
  });
});

describe('F06 · server and device answer identically (F06-AC24, server side)', () => {
  it('evaluateRange on the downloaded snapshot equals GET /quran/line-count for every case', async () => {
    await sourcedSeed();
    const teacher = await h.signIn('teacher.a1');
    const index = referenceIndex(parseBody((await snapshot(teacher)).body));
    const cases = [
      [1, 1, 4], [1, 1, 20], [2, 3, 9], [3, 19, 20], [1, 5, 5], // valid, single and multi-line
      [1, 1, 21], [1, 9, 3], [115, 1, 2], [4, 1, 2], [114, 1, 20], // beyond the count, end before start, unknown Surah, no layout
    ] as const;
    for (const [surah, ayahStart, ayahEnd] of cases) {
      const server = await h.call('GET', `/quran/line-count?surah=${surah}&ayahStart=${ayahStart}&ayahEnd=${ayahEnd}`, teacher);
      if (server.statusCode === 400) {
        // The query schema refuses Surah 115 before any rule runs; the device's rule refuses it as UNKNOWN.
        expect(evaluateRange({ surah, ayahStart, ayahEnd }, index).issues.length).toBeGreaterThan(0);
        continue;
      }
      const { edition: _edition, ...online } = server.json();
      expect(evaluateRange({ surah, ayahStart, ayahEnd }, index), `${surah}:${ayahStart}-${ayahEnd}`).toEqual(online);
    }
  });
});

describe('F06 · licence withdrawal (DEC-B79; plan P1, P2)', () => {
  it('withdrawing the layout licence revokes the versions that carried it, audits it, and stops distribution', async () => {
    const { layout } = await sourcedSeed();
    const teacher = await h.signIn('teacher.a1');
    const before = (await version(teacher)).json().referenceVersion as string;
    const org = await orgId('ALIF');
    const storedLines = async () => (await withTenant(h.db, org, (tx) => tx.selectFrom('mushaf_layout_lines').select(sql<number>`count(*)::int`.as('n')).executeTakeFirstOrThrow())).n;
    const linesBefore = await storedLines();

    expect(await withdraw(layout.id)).toEqual({ revokedVersions: 1 });
    const manifest = await withTenant(h.db, org, (tx) => tx.selectFrom('quran_reference_snapshots').selectAll().where('reference_version', '=', before).executeTakeFirstOrThrow());
    expect(manifest).toMatchObject({ revoked_reason: 'LICENCE_WITHDRAWN' });
    expect(manifest.revoked_at).not.toBeNull();
    const audited = await h.db.selectFrom('audit_logs').select(['action', 'target_type', 'target_id', 'summary']).where('action', '=', 'QURAN_REFERENCE_REVOKED').execute();
    expect(audited).toEqual([expect.objectContaining({ target_type: 'QURAN_SOURCE', target_id: layout.id, summary: expect.objectContaining({ referenceVersion: before, reason: 'LICENCE_WITHDRAWN' }) })]);

    // The device's copy is now REVOKED; the current snapshot no longer carries the layout.
    const now = (await version(teacher, `format=1&have=${before}`)).json();
    expect(now.cached).toMatchObject({ referenceVersion: before, status: 'REVOKED', reasonCode: 'LICENCE_WITHDRAWN' });
    expect(now.layout).toEqual({ importId: null, verified: false, withdrawn: true });
    const body = parseBody((await snapshot(teacher)).body);
    expect(body.lines).toEqual([]);
    expect(body.surahs).toHaveLength(114); // the metadata source is still licensed

    // Online too: no Total Lines from a withdrawn layout, and it is shown as withdrawn, not approved (P2).
    expect((await h.call('GET', '/quran/line-count?surah=1&ayahStart=1&ayahEnd=4', teacher)).json()).toMatchObject({ totalLines: null, source: 'UNAVAILABLE', layoutImportId: null });
    expect((await h.call('GET', '/quran/editions', teacher)).json().editions[0]).toMatchObject({ hasLayout: true, layoutVerified: false, layoutWithdrawn: true });
    // Nothing is deleted: the layout rows stay for audit and legal review (P2).
    expect(await storedLines()).toBe(linesBefore);
  });

  it('P1: rows from a withdrawn metadata source are left out even after an Admin edit; Admin-entered rows stay', async () => {
    const { meta } = await sourcedSeed();
    const admin = await h.signIn('admin.a');
    const s7 = (await h.call('GET', '/quran/surahs', admin)).json().items.find((s: { number: number }) => s.number === 7);
    expect((await h.call('PUT', '/quran/surahs/7', admin, { nameAr: s7.nameAr, nameTranslit: 'Edited by Admin', ayahCount: 20, rowVersion: s7.rowVersion })).statusCode).toBe(200);
    // An Admin-entered row with no imported origin: Para rows are replaced here only to prove the rule on a fresh row.
    await withTenant(h.db, await orgId('ALIF'), (tx) => tx.updateTable('quran_paras').set({ import_id: null, source: 'ADMIN' }).where('number', '=', 1).execute());
    const before = (await version(admin)).json().referenceVersion as string;

    await withdraw(meta.id, 'LICENSE_REVIEW_REQUIRED');
    const v = (await version(admin, `format=1&have=${before}`)).json();
    expect(v.cached.status).toBe('REVOKED');
    expect(v.metadataWithdrawn).toBe(true);
    const body = parseBody((await snapshot(admin)).body);
    expect(body.surahs).toEqual([]); // every Surah came from the withdrawn import, including the Admin-edited Surah 7
    expect(body.paras.map((p) => p[0])).toEqual([1]); // only the Admin-entered Para remains
    // The stored rows are untouched.
    expect((await h.call('GET', '/quran/surahs', admin)).json().items).toHaveLength(114);
  });

  it('the /version safety net revokes a withdrawn version even if the revocation step was skipped', async () => {
    const { layout } = await sourcedSeed();
    const teacher = await h.signIn('teacher.a1');
    const before = (await version(teacher)).json().referenceVersion as string;
    // A licence row written directly (bypassing the registry, as a manual DBA fix might).
    await h.db.insertInto('quran_source_licences').values({ id: '01900000-0000-7000-8000-00000000abcd', source_id: layout.id, status: 'REFUSED', licence_name: null, permission_ref: null, publisher_clearance_ref: null, attribution_text: null, recorded_at: h.clock.now(), recorded_by: 'integration test' }).execute();
    expect((await version(teacher, `format=1&have=${before}`)).json().cached.status).toBe('REVOKED');
  });

  it('a revoked manifest row cannot be un-revoked, changed, or deleted', async () => {
    const { layout } = await sourcedSeed();
    const before = (await version(await h.signIn('teacher.a1'))).json().referenceVersion as string;
    await withdraw(layout.id);
    const org = await orgId('ALIF');
    await expect(
      withTenant(h.db, org, (tx) => tx.updateTable('quran_reference_snapshots').set({ revoked_at: null, revoked_reason: null }).where('reference_version', '=', before).execute()),
    ).rejects.toThrow(/stays revoked/);
    await expect(sql`UPDATE quran_reference_snapshots SET bytes = 1 WHERE reference_version = ${before}`.execute(h.db)).rejects.toThrow(/stays revoked/);
    await expect(sql`DELETE FROM quran_reference_snapshots WHERE reference_version = ${before}`.execute(h.db)).rejects.toThrow();
  });

  it('a later re-grant makes the data distributable again; the revocation history is kept', async () => {
    const { layout } = await sourcedSeed();
    const teacher = await h.signIn('teacher.a1');
    const before = (await version(teacher)).json().referenceVersion as string;
    await withdraw(layout.id);
    await registry.recordLicence(layout.id, { status: 'PERMISSION_GRANTED', licenceName: null, permissionRef: 'Synthetic renewed letter (test)', publisherClearanceRef: 'Synthetic publisher letter (test)', attributionText: null, recordedBy: 'integration test' });
    const v = (await version(teacher, `format=1&have=${before}`)).json();
    expect(v.referenceVersion).toBe(before); // the same content again gives the same version
    expect(v.cached.status).toBe('CURRENT');
    const row = await withTenant(h.db, await orgId('ALIF'), (tx) => tx.selectFrom('quran_reference_snapshots').select('revoked_at').where('reference_version', '=', before).executeTakeFirstOrThrow());
    expect(row.revoked_at).not.toBeNull();
  });
});
