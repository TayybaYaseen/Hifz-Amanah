// F06 · The device's Quran reference cache and its sync (ADR-018 §4; FR-SAB-014; DEC-B75, DEC-B79; plan P3;
// F06-AC24 device side). Runs on Node's SQLite behind the app's driver. SYNTHETIC DATA ONLY.
import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import type { ReferenceVersionResponse } from '@hifz/contracts';
import { buildSnapshot, canonicalJson, evaluateRange, referenceIndex, snapshotBody, type LayoutRow, type ReferenceSnapshotV1 } from '@hifz/domain/quran-ref';
import { syntheticLayoutV2, syntheticParas, syntheticSurahs } from '@hifz/domain/quran-ref/synthetic-fixture';
import { ApiFailure } from '../../api/client.ts';
import type { SqlDriver } from '../../local-db/driver.ts';
import { runMigrations, WORKSPACE_MIGRATIONS } from '../../local-db/migrations.ts';
import { openNodeDriver } from '../../local-db/testing/nodeDriver.ts';
import { applySnapshot, clearCache, loadIndex, readCacheMeta, SnapshotRejectedError, verifySnapshot } from './referenceCache.ts';
import { backoffMs, ReferenceSync, type ReferenceApi } from './referenceSync.ts';
import { referenceView } from './referenceView.ts';

const sha256 = async (text: string) => createHash('sha256').update(text, 'utf8').digest('hex');
const IMPORT_A = '01900000-0000-7000-8000-0000000000a1';

/** A snapshot exactly as the server builds it (domain buildSnapshot over synthetic rows). */
function serverSnapshot(over: { importId?: string | null; withdrawn?: boolean; ayahCount5?: number; surahs?: boolean } = {}): ReferenceSnapshotV1 {
  const surahs = syntheticSurahs();
  if (over.ayahCount5) surahs[4] = { ...surahs[4]!, ayahCount: over.ayahCount5 };
  const lines: LayoutRow[] = syntheticLayoutV2(3).map((l) => ({ page: l.page, line: l.line, surah: l.surah, lineType: l.lineType, ayahStart: l.ayahStart ?? null, ayahEnd: l.ayahEnd ?? null }));
  const importId = over.importId === undefined ? IMPORT_A : over.importId;
  return buildSnapshot({
    edition: { code: 'INDOPAK_16_LINE', linesPerPage: 16, publisher: null, printingId: null, pageCount: null },
    layout: { importId, verified: false, withdrawn: over.withdrawn ?? false },
    metadataWithdrawn: false,
    surahs: over.surahs === false ? [] : surahs,
    paras: over.surahs === false ? [] : syntheticParas(),
    lines: importId ? lines : [],
    attribution: [],
  });
}

const versionOf = (s: ReferenceSnapshotV1) => createHash('sha256').update(snapshotBody(s), 'utf8').digest('hex');

/** A fake server: holds the current snapshot, the revoked versions, and can fail on demand. */
class FakeServer implements ReferenceApi {
  current: ReferenceSnapshotV1;
  revoked = new Set<string>();
  known = new Set<string>();
  calls: string[] = [];
  failNext: (ApiFailure | Error)[] = [];
  /** What the next snapshot download returns instead of the real body (corruption, interruption). */
  tamper: ((s: unknown) => unknown) | null = null;
  constructor(s: ReferenceSnapshotV1) {
    this.current = s;
  }
  async version(have: string | null): Promise<ReferenceVersionResponse> {
    this.calls.push(`version:${have ? 'have' : 'none'}`);
    const err = this.failNext.shift();
    if (err) throw err;
    const v = versionOf(this.current);
    this.known.add(v);
    const base = { snapshotFormatVersion: 1, referenceVersion: v, bytes: snapshotBody(this.current).length, builtAt: '2026-11-09T00:00:00.000Z', layout: this.current.layout, metadataWithdrawn: false, empty: this.current.surahs.length === 0 };
    if (!have) return base;
    const status = have === v ? 'CURRENT' : this.revoked.has(have) ? 'REVOKED' : this.known.has(have) ? 'SUPERSEDED' : 'UNKNOWN';
    return { ...base, cached: { referenceVersion: have, status } };
  }
  async snapshot(): Promise<unknown> {
    this.calls.push('snapshot');
    const err = this.failNext.shift();
    if (err) throw err;
    const body = JSON.parse(snapshotBody(this.current));
    return this.tamper ? this.tamper(body) : body;
  }
}

async function device(server: FakeServer, clockStart = Date.parse('2026-11-09T08:00:00Z')) {
  const db = openNodeDriver();
  await runMigrations(db, WORKSPACE_MIGRATIONS);
  let now = clockStart;
  const revokedAccess: number[] = [];
  const sync = new ReferenceSync({ db, api: server, sha256, clock: () => now, onAccessRevoked: () => revokedAccess.push(now) });
  return { db, sync, advance: (ms: number) => (now += ms), revokedAccess };
}

const cachedRows = async (db: SqlDriver) => (await db.get<{ n: number }>('SELECT (SELECT count(*) FROM ref_surahs) + (SELECT count(*) FROM ref_layout_lines) AS n'))!.n;

describe('F06 · verification before activation (ADR-018 §4.2 step 3)', () => {
  it('accepts the exact snapshot the server built; the canonical re-serialization reproduces its bytes', async () => {
    const s = serverSnapshot();
    const payload = JSON.parse(snapshotBody(s));
    expect(canonicalJson(payload)).toBe(snapshotBody(s));
    await expect(verifySnapshot(payload, versionOf(s), sha256)).resolves.toEqual(s);
  });

  it('refuses a checksum mismatch, an unsupported format, a malformed body, and insane rows', async () => {
    const s = serverSnapshot();
    const v = versionOf(s);
    const reason = async (p: unknown, version = v) => ((await verifySnapshot(p, version, sha256).catch((e: unknown) => e)) as SnapshotRejectedError).reason;
    const changed = JSON.parse(snapshotBody(s));
    changed.surahs[0][3] = 19;
    expect(await reason(changed)).toBe('CHECKSUM_MISMATCH');
    expect(await reason({ ...JSON.parse(snapshotBody(s)), snapshotFormatVersion: 2 })).toBe('UNSUPPORTED_FORMAT');
    expect(await reason(null)).toBe('SCHEMA_INVALID');
    expect(await reason({ ...JSON.parse(snapshotBody(s)), extra: 1 })).toBe('SCHEMA_INVALID');
    const duplicate = JSON.parse(snapshotBody(s));
    duplicate.lines.push(duplicate.lines[0]);
    expect(await reason(duplicate)).toBe('SCHEMA_INVALID');
    const backwards = JSON.parse(snapshotBody(s));
    backwards.lines[0] = [1, 2, 1, 5, 3];
    expect(await reason(backwards)).toBe('SCHEMA_INVALID');
  });
});

describe('F06 · the cache (ADR-018 §4.1, §4.2 step 4)', () => {
  it('replaces the whole cache in one transaction; a failure leaves the previous snapshot intact', async () => {
    const db = openNodeDriver();
    await runMigrations(db, WORKSPACE_MIGRATIONS);
    const first = serverSnapshot();
    await applySnapshot(db, first, versionOf(first), '2026-11-09T08:00:00.000Z');
    const before = await cachedRows(db);
    const broken = { ...serverSnapshot({ ayahCount5: 18 }), lines: [...first.lines, first.lines[0]!] }; // duplicate key fails mid-way
    await expect(applySnapshot(db, broken as ReferenceSnapshotV1, 'x'.repeat(64), '2026-11-09T09:00:00.000Z')).rejects.toThrow();
    expect(await cachedRows(db)).toBe(before);
    expect((await readCacheMeta(db))!.referenceVersion).toBe(versionOf(first));
  });

  it('answers offline exactly as the snapshot does (F06-AC24 device side), with Arabic names byte-exact', async () => {
    const db = openNodeDriver();
    await runMigrations(db, WORKSPACE_MIGRATIONS);
    const s = serverSnapshot();
    await applySnapshot(db, s, versionOf(s), '2026-11-09T08:00:00.000Z');
    const local = (await loadIndex(db))!;
    const direct = referenceIndex(s);
    for (const [surah, a, b] of [[1, 1, 4], [2, 3, 9], [1, 1, 21], [1, 9, 3], [4, 1, 2], [115, 1, 1]] as const) {
      expect(evaluateRange({ surah, ayahStart: a, ayahEnd: b }, local)).toEqual(evaluateRange({ surah, ayahStart: a, ayahEnd: b }, direct));
    }
    expect(local.surahNames.get(1)!.nameAr).toBe(s.surahs[0]![1]);
  });

  it('is separate from records: the migration touches no outbox row, and clearing it touches no other table', async () => {
    const db = openNodeDriver();
    await runMigrations(db, WORKSPACE_MIGRATIONS.slice(0, 4));
    // A queued operation waiting to sync (synthetic values).
    await db.run(
      "INSERT INTO outbox (op_id, seq, entity, entity_id, op_type, payload, state, attempts, label, created_at, sent_count) VALUES ('op-1', 1, 'attendance_record', 'e1', 'CREATE', '{\"status\":\"PRESENT\"}', 'PENDING', 0, 'row', '2026-11-09T08:00:00.000Z', 0)",
    );
    const outboxBefore = await db.all('SELECT * FROM outbox');
    await runMigrations(db, WORKSPACE_MIGRATIONS);
    expect(await db.all('SELECT * FROM outbox')).toEqual(outboxBefore);
    const s = serverSnapshot();
    await applySnapshot(db, s, versionOf(s), '2026-11-09T08:00:00.000Z');
    await clearCache(db, '2026-11-09T09:00:00.000Z');
    expect(await db.all('SELECT * FROM outbox')).toEqual(outboxBefore);
    // No foreign key points into or out of the ref_* tables.
    for (const t of ['ref_meta', 'ref_surahs', 'ref_paras', 'ref_layout_lines', 'ref_attribution']) {
      expect(await db.all(`SELECT * FROM pragma_foreign_key_list('${t}')`)).toEqual([]);
    }
  });
});

describe('F06 · first sync, refresh, and offline start (ADR-018 §4.2)', () => {
  it('first sync downloads, verifies, and activates; the next check is CURRENT and downloads nothing', async () => {
    const server = new FakeServer(serverSnapshot());
    const { db, sync } = await device(server);
    expect(referenceView({ meta: await readCacheMeta(db), running: false, online: true, surahCount: 0 }).kind).toBe('INITIAL_PENDING');
    expect(await sync.check('START')).toBe('UPDATED');
    expect(server.calls).toEqual(['version:none', 'snapshot']);
    const meta = (await readCacheMeta(db))!;
    expect(meta).toMatchObject({ referenceVersion: versionOf(server.current), updateAvailable: false, lastErrorCode: null });
    expect(referenceView({ meta, running: false, online: true, surahCount: 114 }).kind).toBe('SYNCED');
    server.calls = [];
    expect(await sync.check('FOREGROUND')).toBe('CURRENT');
    expect(server.calls).toEqual(['version:have']);
  });

  it('an Admin edit on the server is picked up whole on the next check (full replacement, never partial)', async () => {
    const server = new FakeServer(serverSnapshot());
    const { db, sync } = await device(server);
    await sync.check('START');
    server.current = serverSnapshot({ ayahCount5: 18 });
    expect(await sync.check('AFTER_SYNC')).toBe('UPDATED');
    expect((await db.get<{ ayah_count: number }>('SELECT ayah_count FROM ref_surahs WHERE number = 5'))!.ayah_count).toBe(18);
    expect((await readCacheMeta(db))!.referenceVersion).toBe(versionOf(server.current));
  });

  it('offline at start: the cached snapshot stays usable, whatever its age (no expiry, P3)', async () => {
    const server = new FakeServer(serverSnapshot());
    const { db, sync, advance } = await device(server);
    await sync.check('START');
    advance(90 * 24 * 3_600_000); // three months later
    server.failNext.push(new ApiFailure('NETWORK', 0));
    expect(await sync.check('START')).toBe('FAILED');
    expect((await loadIndex(db))!.surahs).toHaveLength(114);
    const view = referenceView({ meta: await readCacheMeta(db), running: false, online: false, surahCount: 114 });
    expect(view).toMatchObject({ kind: 'OFFLINE_CACHED', usingCache: true });
  });

  it('a manual refresh runs a full check even during backoff', async () => {
    const server = new FakeServer(serverSnapshot());
    const { sync } = await device(server);
    server.failNext.push(new ApiFailure('NETWORK', 0));
    expect(await sync.check('START')).toBe('FAILED');
    expect(await sync.check('FOREGROUND')).toBe('BACKOFF');
    expect(await sync.check('MANUAL')).toBe('UPDATED');
  });

  it('overlapping triggers share one check (single flight)', async () => {
    const server = new FakeServer(serverSnapshot());
    const { sync } = await device(server);
    const [a, b] = await Promise.all([sync.check('START'), sync.check('ONLINE')]);
    expect([a, b]).toEqual(['UPDATED', 'UPDATED']);
    expect(server.calls.filter((c) => c === 'snapshot')).toHaveLength(1);
  });

  it('the daily check is due after 24 hours, and backoff doubles from 1 minute to at most 1 hour', async () => {
    const server = new FakeServer(serverSnapshot());
    const { sync, advance } = await device(server);
    expect(await sync.dailyDue()).toBe(true);
    await sync.check('START');
    expect(await sync.dailyDue()).toBe(false);
    advance(24 * 3_600_000);
    expect(await sync.dailyDue()).toBe(true);
    expect([0, 1, 2, 3, 6, 10].map(backoffMs)).toEqual([60_000, 120_000, 240_000, 480_000, 3_600_000, 3_600_000]);
  });
});

describe('F06 · failures never replace a valid cache (ADR-018 §4.4)', () => {
  it('no internet, a timeout or server error, and an interrupted download keep the last valid snapshot', async () => {
    const server = new FakeServer(serverSnapshot());
    const { db, sync } = await device(server);
    await sync.check('START');
    const good = (await readCacheMeta(db))!.referenceVersion;
    server.current = serverSnapshot({ ayahCount5: 17 });
    for (const failure of [new ApiFailure('NETWORK', 0), new ApiFailure('INTERNAL', 503)]) {
      server.failNext.push(failure);
      expect(await sync.check('MANUAL')).toBe('FAILED');
      expect((await readCacheMeta(db))!.referenceVersion).toBe(good);
    }
    // Interrupted after the version check: the download itself fails part-way.
    const interrupted = new FakeServer(server.current);
    interrupted.known = server.known;
    const originalSnapshot = interrupted.snapshot.bind(interrupted);
    interrupted.snapshot = async () => {
      throw new ApiFailure('NETWORK', 0);
    };
    const d2 = new ReferenceSync({ db, api: interrupted, sha256, clock: () => Date.parse('2026-11-10T00:00:00Z') });
    expect(await d2.check('MANUAL')).toBe('FAILED');
    expect((await readCacheMeta(db))!).toMatchObject({ referenceVersion: good, lastErrorCode: 'NETWORK', updateAvailable: true });
    expect(referenceView({ meta: await readCacheMeta(db), running: false, online: true, surahCount: 114 }).kind).toBe('UPDATE_AVAILABLE');
    interrupted.snapshot = originalSnapshot;
    expect(await d2.check('MANUAL')).toBe('UPDATED');
  });

  it('a malformed or tampered download is discarded and reported; the previous snapshot stays active', async () => {
    const server = new FakeServer(serverSnapshot());
    const { db, sync } = await device(server);
    await sync.check('START');
    const good = (await readCacheMeta(db))!.referenceVersion;
    server.current = serverSnapshot({ ayahCount5: 16 });
    server.tamper = (b) => ({ ...(b as object), surahs: [] }); // different content from the announced version
    expect(await sync.check('MANUAL')).toBe('FAILED');
    expect((await readCacheMeta(db))!).toMatchObject({ referenceVersion: good, lastErrorCode: 'CHECKSUM_MISMATCH' });
    expect(referenceView({ meta: await readCacheMeta(db), running: false, online: true, surahCount: 114 })).toMatchObject({ kind: 'CHECKSUM_MISMATCH', usingCache: true });
    server.tamper = () => '<html>proxy error</html>';
    expect(await sync.check('MANUAL')).toBe('FAILED');
    expect((await readCacheMeta(db))!.lastErrorCode).toBe('SCHEMA_INVALID');
    server.tamper = (b) => ({ ...(b as object), snapshotFormatVersion: 2 });
    expect(await sync.check('MANUAL')).toBe('FAILED');
    expect((await readCacheMeta(db))!).toMatchObject({ referenceVersion: good, lastErrorCode: 'UNSUPPORTED_FORMAT' });
    expect(referenceView({ meta: await readCacheMeta(db), running: false, online: true, surahCount: 114 }).kind).toBe('UNSUPPORTED_FORMAT');
  });

  it('a change between the version check and the download is retried once against the new version', async () => {
    const server = new FakeServer(serverSnapshot());
    const { db, sync } = await device(server);
    const v1 = versionOf(server.current);
    const original = server.snapshot.bind(server);
    let first = true;
    server.snapshot = async () => {
      if (first) {
        first = false;
        server.current = serverSnapshot({ ayahCount5: 15 }); // an Admin edit lands mid-check
      }
      return original();
    };
    expect(await sync.check('START')).toBe('UPDATED');
    expect((await readCacheMeta(db))!.referenceVersion).not.toBe(v1);
    expect((await readCacheMeta(db))!.referenceVersion).toBe(versionOf(server.current));
  });

  it('a session that expired keeps the cache and records no failure', async () => {
    const server = new FakeServer(serverSnapshot());
    const { db, sync } = await device(server);
    await sync.check('START');
    server.failNext.push(new ApiFailure('SESSION_EXPIRED', 401));
    expect(await sync.check('FOREGROUND')).toBe('SESSION_EXPIRED');
    expect((await readCacheMeta(db))!).toMatchObject({ lastErrorCode: null, failures: 0 });
    expect(await cachedRows(db)).toBeGreaterThan(0);
  });
});

describe('F06 · revocation on the device (DEC-B79; ADR-018 §4.5)', () => {
  it('a REVOKED version is deleted on the next successful check, then replaced by the current snapshot', async () => {
    const server = new FakeServer(serverSnapshot());
    const { db, sync } = await device(server);
    await sync.check('START');
    const old = (await readCacheMeta(db))!.referenceVersion!;
    // The layout licence is withdrawn: the old version is revoked and the new snapshot has no lines.
    server.revoked.add(old);
    server.current = serverSnapshot({ importId: null, withdrawn: true });
    expect(await sync.check('FOREGROUND')).toBe('REVOKED_REPLACED');
    const meta = (await readCacheMeta(db))!;
    expect(meta).toMatchObject({ revokedVersion: old, layoutImportId: null, layoutWithdrawn: true });
    expect(meta.revokedAt).not.toBeNull();
    expect((await db.get<{ n: number }>('SELECT count(*) AS n FROM ref_layout_lines'))!.n).toBe(0);
    const view = referenceView({ meta, running: false, online: true, surahCount: 114 });
    expect(view).toMatchObject({ kind: 'SYNCED', layout: 'WITHDRAWN', manualTotalLines: true, revokedNotice: true });
    expect(evaluateRange({ surah: 1, ayahStart: 1, ayahEnd: 4 }, (await loadIndex(db))!)).toMatchObject({ totalLines: null, source: 'UNAVAILABLE' });
  });

  it('a REVOKED version is deleted even when the new snapshot cannot be fetched yet; manual Total Lines stays', async () => {
    const server = new FakeServer(serverSnapshot());
    const { db, sync } = await device(server);
    await sync.check('START');
    const old = (await readCacheMeta(db))!.referenceVersion!;
    server.revoked.add(old);
    server.current = serverSnapshot({ importId: null, withdrawn: true });
    const original = server.snapshot.bind(server);
    server.snapshot = async () => {
      throw new ApiFailure('NETWORK', 0);
    };
    expect(await sync.check('FOREGROUND')).toBe('REVOKED_CLEARED');
    expect(await cachedRows(db)).toBe(0);
    const view = referenceView({ meta: await readCacheMeta(db), running: false, online: true, surahCount: 0 });
    expect(view).toMatchObject({ kind: 'REVOKED', usingCache: false, manualTotalLines: true, revokedNotice: true, errorCode: 'NETWORK' });
    server.snapshot = original;
    expect(await sync.check('MANUAL')).toBe('UPDATED');
  });

  it('an offline device keeps its copy: nothing is deleted until a check succeeds', async () => {
    const server = new FakeServer(serverSnapshot());
    const { db, sync } = await device(server);
    await sync.check('START');
    server.revoked.add((await readCacheMeta(db))!.referenceVersion!);
    server.failNext.push(new ApiFailure('NETWORK', 0));
    expect(await sync.check('START')).toBe('FAILED');
    expect(await cachedRows(db)).toBeGreaterThan(0);
  });

  it('403 ACCESS_REVOKED deletes the cache and tells the app to lock the workspace', async () => {
    const server = new FakeServer(serverSnapshot());
    const { db, sync, revokedAccess } = await device(server);
    await sync.check('START');
    server.failNext.push(new ApiFailure('ACCESS_REVOKED', 403));
    expect(await sync.check('FOREGROUND')).toBe('ACCESS_REVOKED');
    expect(await cachedRows(db)).toBe(0);
    expect(revokedAccess).toHaveLength(1);
  });

  it('a missing bookkeeping row is treated as no cache and rebuilt', async () => {
    const server = new FakeServer(serverSnapshot());
    const { db, sync } = await device(server);
    await sync.check('START');
    await db.run('DELETE FROM ref_meta');
    expect(await sync.check('START')).toBe('UPDATED');
    expect((await readCacheMeta(db))!.referenceVersion).toBe(versionOf(server.current));
  });
});

describe('F06 · status card states (design.md §8; no false success)', () => {
  const meta = (over: Record<string, unknown> = {}) => ({
    referenceVersion: 'a'.repeat(64), formatVersion: 1, layoutImportId: IMPORT_A, layoutVerified: false, layoutWithdrawn: false, metadataWithdrawn: false,
    fetchedAt: '2026-11-09T08:00:00.000Z', checkedAt: '2026-11-09T08:00:00.000Z', updateAvailable: false, lastErrorCode: null, lastErrorAt: null,
    failures: 0, nextAttemptAt: null, revokedVersion: null, revokedAt: null, ...over,
  });
  it('maps every cache state to one visible state', () => {
    const v = (m: ReturnType<typeof meta> | null, running = false, online = true, surahCount = 114) => referenceView({ meta: m, running, online, surahCount });
    expect(v(meta({ referenceVersion: null })).kind).toBe('INITIAL_PENDING');
    expect(v(meta({ referenceVersion: null }), true).kind).toBe('DOWNLOADING');
    expect(v(meta({ updateAvailable: true }), true).kind).toBe('DOWNLOADING');
    expect(v(meta()).kind).toBe('SYNCED');
    expect(v(meta(), false, false).kind).toBe('OFFLINE_CACHED');
    expect(v(meta({ updateAvailable: true })).kind).toBe('UPDATE_AVAILABLE');
    expect(v(meta({ lastErrorCode: 'SERVER' })).kind).toBe('FAILED');
    expect(v(meta({ referenceVersion: null, lastErrorCode: 'NETWORK' })).kind).toBe('FAILED');
    expect(v(meta({ lastErrorCode: 'CHECKSUM_MISMATCH' })).kind).toBe('CHECKSUM_MISMATCH');
    expect(v(meta({ lastErrorCode: 'UNSUPPORTED_FORMAT' })).kind).toBe('UNSUPPORTED_FORMAT');
    expect(v(meta({ referenceVersion: null, revokedAt: '2026-11-09T09:00:00.000Z' })).kind).toBe('REVOKED');
    expect(v(meta(), false, true, 0).kind).toBe('NO_DATA');
    // A running background check never flips a good state to "downloading" when nothing new is being fetched.
    expect(v(meta(), true)).toMatchObject({ kind: 'SYNCED', checking: true });
  });
  it('Total Lines is manual whenever no usable layout is on the device', () => {
    expect(referenceView({ meta: null, running: false, online: true, surahCount: 0 }).manualTotalLines).toBe(true);
    expect(referenceView({ meta: meta({ layoutImportId: null }), running: false, online: true, surahCount: 114 })).toMatchObject({ layout: 'NONE', manualTotalLines: true });
    expect(referenceView({ meta: meta({ layoutImportId: null, layoutWithdrawn: true }), running: false, online: true, surahCount: 114 }).layout).toBe('WITHDRAWN');
    expect(referenceView({ meta: meta(), running: false, online: true, surahCount: 114 })).toMatchObject({ layout: 'AVAILABLE', manualTotalLines: false, layoutVerified: false });
  });
});
