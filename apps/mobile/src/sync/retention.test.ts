// F12 · Offline and synchronization — unit: cache retention, revocation purge, sign-out hold (F12-AC19, AC20; Q14)
import { afterEach, describe, expect, it } from 'vitest';
import { nodeDatabaseFiles } from '../local-db/testing/nodeDriver.ts';
import { cacheRoster, forgetRoster, keepRostersOf } from '../features/attendance/local.ts';
import { refreshCalendar } from '../features/homework/api.ts';
import { cacheCalendar } from '../features/homework/local.ts';
import { readCacheToken, type CacheToken } from './cacheEpoch.ts';
import { DeviceIndex, openWorkspaceDb, workspaceDbName } from './deviceIndex.ts';
import { randomUuid } from './ids.ts';
import { DAY_MS, cleanupDue, heldExpired, isPastRetention, purgeSynced, retentionCutoff, todayIn } from './retention.ts';
import { holdForSignOut, lockWorkspace, readMeta, resumeHeld } from './workspace.ts';
import { FakeClock, FakeTransport, PROBE_MIGRATIONS, makeEngine, makeOutbox, probeDb, probeRegistry, testRandomBytes, writeProbe } from './testing/probe.ts';

const cleanups: Array<() => void> = [];
afterEach(() => {
  while (cleanups.length) cleanups.pop()!();
});

async function syncedProbe(db: Awaited<ReturnType<typeof probeDb>>, id: string, reportDate: string) {
  await db.run('INSERT INTO sync_probe (id, row_version, label, report_date) VALUES (?, 1, ?, ?)', [id, id, reportDate]);
}

describe('F12 · cache retention', () => {
  it('F12-AC19 (US-051) the 120-day window is measured by report_date against today in the madrasa timezone', () => {
    // 2026-11-08T20:30Z is already 2026-11-09 in Asia/Karachi (UTC+5).
    const now = Date.parse('2026-11-08T20:30:00Z');
    expect(todayIn(now, 'Asia/Karachi')).toBe('2026-11-09');
    expect(todayIn(now, 'UTC')).toBe('2026-11-08');
    expect(todayIn(now, 'Not/AZone')).toBe('2026-11-09'); // unknown zone → madrasa default
    expect(retentionCutoff('2026-11-09', 120)).toBe('2026-07-12');
    expect(isPastRetention('2026-07-12', '2026-11-09')).toBe(false); // exactly 120 days old: kept
    expect(isPastRetention('2026-07-11', '2026-11-09')).toBe(true);
    expect(isPastRetention('not a date', '2026-11-09')).toBe(false);
    // Leap-year boundary.
    expect(retentionCutoff('2028-03-01', 1)).toBe('2028-02-29');
  });

  it('F12-AC19 (US-051) cleanup removes synced rows past retention; unsynced rows are never removed', async () => {
    const clock = new FakeClock(); // 2026-11-08 in Karachi
    const db = await probeDb();
    const outbox = makeOutbox(db, clock);
    const registry = probeRegistry(120);
    const engine = makeEngine(db, outbox, registry, new FakeTransport(), clock);
    await syncedProbe(db, '01934f5e-8a00-7000-8000-000000000001', '2026-07-10'); // old, synced → removed
    await syncedProbe(db, '01934f5e-8a00-7000-8000-000000000002', '2026-10-01'); // recent → kept
    const oldUnsynced = outbox.newEntityId();
    await outbox.saveWithOp(writeProbe(oldUnsynced, { label: 'old but unsynced', reportDate: '2026-01-01' }), {
      entity: 'sync_probe', entityId: oldUnsynced, opType: 'CREATE', baseVersion: null, fields: { label: 'old but unsynced' },
    });
    expect(await engine.cleanupIfDue()).toBe(true);
    const ids = (await db.all<{ id: string }>('SELECT id FROM sync_probe ORDER BY id')).map((r) => r.id);
    expect(ids).toEqual(['01934f5e-8a00-7000-8000-000000000002', oldUnsynced].sort());
    expect(await outbox.unsyncedCount()).toBe(1);
    // Runs once a day.
    expect(await engine.cleanupIfDue()).toBe(false);
    clock.advance(DAY_MS);
    expect(await engine.cleanupIfDue()).toBe(true);
  });

  it('F12 unit (Q16): synced queue items stay listed for 24 hours, then leave the queue', async () => {
    const clock = new FakeClock();
    const db = await probeDb();
    const outbox = makeOutbox(db, clock);
    const engine = makeEngine(db, outbox, probeRegistry(), new FakeTransport(), clock);
    const id = outbox.newEntityId();
    await outbox.saveWithOp(writeProbe(id, { label: 'x' }), { entity: 'sync_probe', entityId: id, opType: 'CREATE', baseVersion: null, fields: { label: 'x' } });
    await engine.syncNow();
    await engine.cleanupIfDue(true);
    expect((await outbox.list()).map((i) => i.status.state)).toEqual(['SYNCED']);
    clock.advance(DAY_MS + 1);
    await engine.cleanupIfDue(true);
    expect(await outbox.list()).toEqual([]);
    // The record itself is still on the device.
    expect(await db.get('SELECT id FROM sync_probe')).toEqual({ id });
  });

  it('F12 unit: cleanup is due on start and every 24 hours', () => {
    const now = Date.parse('2026-11-08T00:00:00Z');
    expect(cleanupDue(null, now)).toBe(true);
    expect(cleanupDue(new Date(now - DAY_MS + 1).toISOString(), now)).toBe(false);
    expect(cleanupDue(new Date(now - DAY_MS).toISOString(), now)).toBe(true);
  });
});

describe('F04/F08 · per-class caches (class roster, class calendar)', () => {
  const CLASS_A = '0190f5c0-0000-7000-8000-00000000c1a6';
  const ROSTER = JSON.stringify([{ id: '0190f5c0-0000-7000-8000-0000000051a1', name: 'Test Student One', externalStudentId: 'EXT-A-001' }]);
  async function cacheBoth(db: Awaited<ReturnType<typeof probeDb>>) {
    await db.run('INSERT INTO class_roster_cache (class_id, class_name, students, fetched_at) VALUES (?, ?, ?, ?)', [CLASS_A, 'Hifz A1', ROSTER, '2026-11-01T00:00:00.000Z']);
    await db.run("INSERT INTO class_calendar_cache (class_id, versions, exceptions, fetched_at) VALUES (?, '[]', '[]', '2026-11-01T00:00:00.000Z')", [CLASS_A]);
  }
  const rosters = (db: Awaited<ReturnType<typeof probeDb>>) => db.all('SELECT class_id FROM class_roster_cache');
  const calendars = (db: Awaited<ReturnType<typeof probeDb>>) => db.all('SELECT class_id FROM class_calendar_cache');

  it('F08 unit (re-review L2): a routine refetch keeps both caches, so offline entry keeps working', async () => {
    const db = await probeDb();
    await cacheBoth(db);
    await db.transaction((tx) => purgeSynced(tx, probeRegistry(), { keepQueueHistory: true }));
    expect(await rosters(db)).toEqual([{ class_id: CLASS_A }]);
    expect(await calendars(db)).toEqual([{ class_id: CLASS_A }]);
  });

  it('F04 (security re-review, F12-AC20) revocation removes cached student names and IDs at once', async () => {
    const clock = new FakeClock();
    const db = await probeDb();
    await cacheBoth(db);
    await lockWorkspace(db, probeRegistry(), clock.now);
    expect(await rosters(db)).toEqual([]);
    expect(await calendars(db)).toEqual([]);
  });

  it('F04 (security re-review, Q14) "sign out anyway" removes the cached roster with the rest of the synced cache', async () => {
    const clock = new FakeClock();
    const db = await probeDb();
    await cacheBoth(db);
    await holdForSignOut(db, probeRegistry(), clock.now);
    expect(await rosters(db)).toEqual([]);
    expect(await calendars(db)).toEqual([]);
  });

  it('F04 (security re-review, NFR-OFF-010) a scope change reported by the server removes the per-class caches', async () => {
    const clock = new FakeClock();
    const db = await probeDb();
    const registry = probeRegistry();
    const transport = new FakeTransport();
    const engine = makeEngine(db, makeOutbox(db, clock), registry, transport, clock);
    await cacheBoth(db);
    await db.run("UPDATE sync_meta SET last_pull_cursor = 'c9'");
    // The server answers the stored cursor with scopeReset (a class left the user's reach), then an empty snapshot.
    transport.onPull = ({ cursor }) => ({ changes: [], cursor: 'c10', hasMore: false, scopeReset: cursor === 'c9', serverTime: new Date(clock.now).toISOString() });
    expect(await engine.syncNow()).toBe('OK');
    expect(await rosters(db)).toEqual([]);
    expect(await calendars(db)).toEqual([]);
  });

  it('F04 (security re-review) another account or madrasa on the device never sees the previous roster', async () => {
    const files = nodeDatabaseFiles();
    cleanups.push(() => files.dispose());
    const clock = new FakeClock();
    const index = await DeviceIndex.open(files, () => randomUuid(testRandomBytes));
    const teacherA = { userId: 'b3f6c2a0-0000-4000-8000-00000000001a', orgId: 'b3f6c2a0-0000-4000-8000-0000000001aa', loginId: 'teacher-a1', orgName: 'Madrasa A', role: 'TEACHER' as const };
    const teacherB = { userId: 'b3f6c2a0-0000-4000-8000-00000000001b', orgId: 'b3f6c2a0-0000-4000-8000-0000000001bb', loginId: 'teacher-b1', orgName: 'Madrasa B', role: 'TEACHER' as const };
    const sameUserOtherOrg = { ...teacherA, orgId: teacherB.orgId, orgName: 'Madrasa B' };
    const a = await index.activate(teacherA, clock.now);
    const dbA = await openWorkspaceDb(files, a.dbName, PROBE_MIGRATIONS);
    await dbA.run('INSERT INTO class_roster_cache (class_id, class_name, students, fetched_at) VALUES (?, ?, ?, ?)', [CLASS_A, 'Hifz A1', ROSTER, '2026-11-01T00:00:00.000Z']);
    await dbA.close();
    for (const other of [teacherB, sameUserOtherOrg]) {
      const entry = await index.activate(other, clock.now);
      expect(entry.dbName).not.toBe(a.dbName);
      const db = await openWorkspaceDb(files, entry.dbName, PROBE_MIGRATIONS);
      expect(await db.all('SELECT class_id FROM class_roster_cache')).toEqual([]);
      await db.close();
    }
    await index.close();
  });
});

describe('F04/F08 · a late server answer never re-caches a dropped class (security review: cache tokens)', () => {
  const CLASS_X = '0190f5c0-0000-7000-8000-00000000c1a7';
  const CLASS_Y = '0190f5c0-0000-7000-8000-00000000c1a8';
  const STUDENTS = [{ id: '0190f5c0-0000-7000-8000-0000000051a2', name: 'Test Student Two', externalStudentId: 'EXT-X-002' }];
  const VERSIONS = [{ effectiveFrom: '2026-01-01', weekdays: [1, 2, 3, 4, 5, 6] }];
  const AT = '2026-11-17T00:00:00.000Z';
  type Db = Awaited<ReturnType<typeof probeDb>>;
  const writeBoth = async (db: Db, token: CacheToken, classId = CLASS_X) => [
    await cacheRoster(db, token, classId, `Hifz ${classId.slice(-2)}`, STUDENTS, AT),
    await cacheCalendar(db, token, classId, VERSIONS, [], AT),
  ];
  const cached = async (db: Db, classId = CLASS_X) => [
    (await db.all('SELECT class_id FROM class_roster_cache WHERE class_id = ?', [classId])).length,
    (await db.all('SELECT class_id FROM class_calendar_cache WHERE class_id = ?', [classId])).length,
  ];

  // Each invalidation that drops class X, run between "request sent" (token read) and "answer arrives" (cache write).
  // X was never cached before: the refusal must not depend on a cached row existing.
  const invalidations: Array<[string, (db: Db) => Promise<void>]> = [
    ['the class list no longer has the class (keepRostersOf)', (db) => keepRostersOf(db, [CLASS_Y])],
    ['the server refused the class (forgetRoster)', (db) => forgetRoster(db, CLASS_X)],
    ['revocation lock (purgeSynced)', (db) => lockWorkspace(db, probeRegistry(), new FakeClock().now)],
    ['sign-out hold (purgeSynced)', (db) => holdForSignOut(db, probeRegistry(), new FakeClock().now)],
    ['scope reset (purgeSynced scopeChanged)', (db) => db.transaction((tx) => purgeSynced(tx, probeRegistry(), { keepQueueHistory: true, scopeChanged: true }))],
  ];

  for (const [name, invalidate] of invalidations) {
    it(`F04/F08 unit (FR-SEC-003, NFR-OFF-010): ${name} while a sheet is in flight: the late answer is not cached; a fresh fetch is`, async () => {
      const db = await probeDb();
      const before = await readCacheToken(db, CLASS_X); // captured before the request is sent
      await invalidate(db);
      expect(await writeBoth(db, before)).toEqual([false, false]);
      expect(await cached(db)).toEqual([0, 0]);
      // A new fetch (the server answered it, so it authorized X again) captures a new token and caches normally.
      expect(await writeBoth(db, await readCacheToken(db, CLASS_X))).toEqual([true, true]);
      expect(await cached(db)).toEqual([1, 1]);
    });
  }

  it('F04-AC12 regression: a concurrent class list that still lists X does not block X’s roster or calendar (first online open, then offline)', async () => {
    const db = await probeDb();
    const token = await readCacheToken(db, CLASS_X); // sheet request sent
    await keepRostersOf(db, [CLASS_Y, CLASS_X]); // GET /classes answers first, X still assigned
    await keepRostersOf(db, [CLASS_X]); // and again (another screen)
    expect(await writeBoth(db, token)).toEqual([true, true]);
    expect(await cached(db)).toEqual([1, 1]);
  });

  it('F04/F08 unit (re-review M1, FR-SEC-003): an OLDER class list arriving after a newer one that dropped X cannot revive X’s in-flight write', async () => {
    const db = await probeDb();
    await keepRostersOf(db, [CLASS_Y, CLASS_X]); // X is assigned and on the allow-list
    const token = await readCacheToken(db, CLASS_X); // sheet for X sent
    await keepRostersOf(db, [CLASS_Y]); // a newer GET /classes answers: X dropped
    await keepRostersOf(db, [CLASS_Y, CLASS_X]); // the older GET /classes answers last and lists X again
    expect(await writeBoth(db, token)).toEqual([false, false]);
    expect(await cached(db)).toEqual([0, 0]);
    // Listed again, a fresh fetch for X (the server answers it, so it authorizes X) is cached; Y is not affected.
    expect(await writeBoth(db, await readCacheToken(db, CLASS_X))).toEqual([true, true]);
    expect(await cached(db)).toEqual([1, 1]);
  });

  it('F04/F08 unit (re-review M1): the same holds for a class never listed or cached before the sheet was sent (first open)', async () => {
    const db = await probeDb();
    const token = await readCacheToken(db, CLASS_X); // no class list answered yet; X unknown to the device
    await keepRostersOf(db, [CLASS_Y]); // newer list: X not assigned
    await keepRostersOf(db, [CLASS_Y, CLASS_X]); // older list, late: lists X
    expect(await writeBoth(db, token)).toEqual([false, false]);
    expect(await cached(db)).toEqual([0, 0]);
  });

  it('F04/F08 unit: forgetRoster(Y) refuses only Y’s writes in flight; X’s are cached', async () => {
    const db = await probeDb();
    const tokenX = await readCacheToken(db, CLASS_X);
    const tokenY = await readCacheToken(db, CLASS_Y);
    await forgetRoster(db, CLASS_Y);
    expect(await writeBoth(db, tokenX)).toEqual([true, true]);
    expect(await writeBoth(db, tokenY, CLASS_Y)).toEqual([false, false]);
    expect(await cached(db)).toEqual([1, 1]);
    expect(await cached(db, CLASS_Y)).toEqual([0, 0]);
  });

  it('F04/F08 unit: a class list without X refuses X in flight (never cached before) and still caches listed Y in flight', async () => {
    const db = await probeDb();
    const tokenX = await readCacheToken(db, CLASS_X);
    const tokenY = await readCacheToken(db, CLASS_Y);
    expect(await cached(db)).toEqual([0, 0]);
    await keepRostersOf(db, [CLASS_Y]);
    expect(await writeBoth(db, tokenX)).toEqual([false, false]);
    expect(await writeBoth(db, tokenY, CLASS_Y)).toEqual([true, true]);
    expect(await cached(db)).toEqual([0, 0]);
    // An empty list (no classes at all) refuses everything in flight.
    const tokenY2 = await readCacheToken(db, CLASS_Y);
    await keepRostersOf(db, []);
    expect(await writeBoth(db, tokenY2, CLASS_Y)).toEqual([false, false]);
  });

  it('F04/F08 unit: once a later class list lists X again, a fresh capture for X is cached', async () => {
    const db = await probeDb();
    await keepRostersOf(db, [CLASS_Y]); // X unassigned
    const whileDropped = await readCacheToken(db, CLASS_X);
    await keepRostersOf(db, [CLASS_Y, CLASS_X]); // X assigned again
    const fresh = await readCacheToken(db, CLASS_X);
    expect(await writeBoth(db, fresh)).toEqual([true, true]);
    // The capture taken while dropped is also no longer stale: the server authorizes X again.
    expect(await writeBoth(db, whileDropped)).toEqual([true, true]);
    // A later list that drops X again refuses the capture taken while it was listed.
    const listed = await readCacheToken(db, CLASS_X);
    await keepRostersOf(db, [CLASS_Y]);
    expect(await writeBoth(db, listed)).toEqual([false, false]);
  });

  it('F04/F08 unit: a purge refuses writes in flight even for classes still listed (global epoch)', async () => {
    const db = await probeDb();
    await keepRostersOf(db, [CLASS_X]);
    const token = await readCacheToken(db, CLASS_X);
    await lockWorkspace(db, probeRegistry(), new FakeClock().now);
    expect(await writeBoth(db, token)).toEqual([false, false]);
  });

  it('F04/F08 unit: a stale answer cannot overwrite a fresher cache entry; a valid token updates in place', async () => {
    const db = await probeDb();
    const old = await readCacheToken(db, CLASS_X);
    expect(await cacheRoster(db, old, CLASS_X, 'Hifz X', STUDENTS, AT)).toBe(true);
    expect(await cacheRoster(db, old, CLASS_X, 'Hifz X renamed', STUDENTS, AT)).toBe(true);
    await forgetRoster(db, CLASS_X);
    expect(await cacheRoster(db, await readCacheToken(db, CLASS_X), CLASS_X, 'Hifz X fresh', STUDENTS, AT)).toBe(true);
    expect(await cacheRoster(db, old, CLASS_X, 'Hifz X stale', STUDENTS, AT)).toBe(false);
    expect(await db.get('SELECT class_name FROM class_roster_cache WHERE class_id = ?', [CLASS_X])).toEqual({ class_name: 'Hifz X fresh' });
  });

  it('F08 unit (re-review L2): a routine refetch (keepQueueHistory only) changes no token, so in-flight answers are still cached', async () => {
    const db = await probeDb();
    const before = await readCacheToken(db, CLASS_X);
    await db.transaction((tx) => purgeSynced(tx, probeRegistry(), { keepQueueHistory: true }));
    expect(await readCacheToken(db, CLASS_X)).toEqual(before);
    expect(await writeBoth(db, before)).toEqual([true, true]);
  });

  it('F04/F08 unit: refreshCalendar reads the token before its requests; a class forgotten while they run is not cached, and a closed workspace is ignored', async () => {
    const db = await probeDb();
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const session = {
      authorized: async <T,>(path: string): Promise<T> => {
        await gate;
        return (path.includes('/schedule') ? { versions: VERSIONS } : { items: [] }) as T;
      },
    };
    const inFlight = refreshCalendar(session, db, CLASS_X, '2026-11-17');
    await new Promise((r) => setTimeout(r, 0));
    await forgetRoster(db, CLASS_X);
    release();
    expect(await inFlight).toBe(false);
    expect(await cached(db)).toEqual([0, 0]);
    expect(await refreshCalendar(session, db, CLASS_X, '2026-11-17')).toBe(true);
    // Sign-out closed the workspace while the requests were running: the write is dropped, never thrown.
    const closing = await probeDb();
    let releaseClosed!: () => void;
    const closedGate = new Promise<void>((r) => (releaseClosed = r));
    const late = refreshCalendar({ authorized: async <T,>(path: string) => { await closedGate; return (path.includes('/schedule') ? { versions: VERSIONS } : { items: [] }) as T; } }, closing, CLASS_X, '2026-11-17');
    await new Promise((r) => setTimeout(r, 0));
    await closing.close();
    releaseClosed();
    expect(await late).toBe(false);
  });
});

describe('F12 · revocation and sign-out', () => {
  it('F12-AC20 (US-052) on revocation synced data is purged at once; unsynced changes stay locked and visible', async () => {
    const clock = new FakeClock();
    const db = await probeDb();
    const outbox = makeOutbox(db, clock);
    const registry = probeRegistry();
    await syncedProbe(db, '01934f5e-8a00-7000-8000-000000000003', '2026-11-01');
    const mine = outbox.newEntityId();
    await outbox.saveWithOp(writeProbe(mine, { label: 'unsent' }), { entity: 'sync_probe', entityId: mine, opType: 'CREATE', baseVersion: null, fields: { label: 'unsent' } });
    await db.run("UPDATE sync_meta SET last_pull_cursor = 'c9'");
    // F08 (security review L1): a cached class calendar is workspace data and goes with the lock too.
    await db.run("INSERT INTO class_calendar_cache (class_id, versions, exceptions, fetched_at) VALUES ('0190f5c0-0000-7000-8000-00000000c1a5', '[]', '[]', '2026-11-01T00:00:00.000Z')");
    await lockWorkspace(db, registry, clock.now);
    expect(await db.all('SELECT class_id FROM class_calendar_cache')).toEqual([]);
    const meta = await readMeta(db);
    expect(meta.workspaceState).toBe('LOCKED_REVOKED');
    expect(meta.revokedAt).toBe(new Date(clock.now).toISOString());
    expect(meta.lastPullCursor).toBeNull();
    expect(await db.all('SELECT id FROM sync_probe')).toEqual([{ id: mine }]);
    expect(await outbox.unsyncedCount()).toBe(1);
    // A second lock keeps the first revoked_at (the 30-day clock does not restart).
    clock.advance(DAY_MS);
    await lockWorkspace(db, registry, clock.now);
    expect((await readMeta(db)).revokedAt).toBe(meta.revokedAt);
  });

  it('F12-AC20 (US-052) unsynced changes of a locked workspace are purged on sign-out or after 30 days', async () => {
    const files = nodeDatabaseFiles();
    cleanups.push(() => files.dispose());
    const clock = new FakeClock();
    const index = await DeviceIndex.open(files, () => randomUuid(testRandomBytes));
    const a = { userId: 'b3f6c2a0-0000-4000-8000-00000000000a', orgId: 'b3f6c2a0-0000-4000-8000-0000000000aa', loginId: 'teacher-a1', orgName: 'Madrasa A', role: 'TEACHER' as const };
    const b = { ...a, userId: 'b3f6c2a0-0000-4000-8000-00000000000b', loginId: 'teacher-b1' };
    const entryA = await index.activate(a, clock.now);
    const entryB = await index.activate(b, clock.now);
    for (const e of [entryA, entryB]) await (await openWorkspaceDb(files, e.dbName, PROBE_MIGRATIONS)).close();
    await index.setState(entryA.dbName, 'LOCKED_REVOKED', clock.now);
    await index.setState(entryB.dbName, 'HELD', clock.now);

    clock.advance(30 * DAY_MS - 1);
    expect(await index.purgeExpired(clock.now)).toEqual([]);
    clock.advance(1);
    // The open workspace is never deleted under the app's feet.
    expect(await index.purgeExpired(clock.now, entryB.dbName)).toEqual([entryA.dbName]);
    expect(files.exists(entryA.dbName)).toBe(false);
    expect(files.exists(entryB.dbName)).toBe(true);
    expect(await index.purgeExpired(clock.now)).toEqual([entryB.dbName]);
    expect(await index.entries()).toEqual([]);
    await index.close();

    expect(heldExpired(null, clock.now)).toBe(false);
  });

  it('F12-AC10 / Q14 (US-053) "Sign out anyway" purges the synced cache and keeps unsynced changes for the same account', async () => {
    const files = nodeDatabaseFiles();
    cleanups.push(() => files.dispose());
    const clock = new FakeClock();
    const registry = probeRegistry();
    const index = await DeviceIndex.open(files, () => randomUuid(testRandomBytes));
    const me = { userId: 'b3f6c2a0-0000-4000-8000-00000000000a', orgId: 'b3f6c2a0-0000-4000-8000-0000000000aa', loginId: 'teacher-a1', orgName: 'Madrasa A', role: 'TEACHER' as const };
    const entry = await index.activate(me, clock.now);
    expect(entry.dbName).toBe(workspaceDbName(me.userId, me.orgId));
    let db = await openWorkspaceDb(files, entry.dbName, PROBE_MIGRATIONS);
    const outbox = makeOutbox(db, clock);
    await syncedProbe(db, '01934f5e-8a00-7000-8000-000000000004', '2026-11-01');
    const mine = outbox.newEntityId();
    const { opIds } = await outbox.saveWithOp(writeProbe(mine, { label: 'unsent' }), { entity: 'sync_probe', entityId: mine, opType: 'CREATE', baseVersion: null, fields: { label: 'unsent' } });

    await holdForSignOut(db, registry, clock.now);
    await index.setState(entry.dbName, 'HELD', clock.now);
    await db.close();
    expect((await index.find(entry.dbName))!.state).toBe('HELD');

    // The same account signs in again: the held changes resume and sync.
    clock.advance(3 * DAY_MS);
    await index.activate(me, clock.now);
    expect((await index.find(entry.dbName))!).toMatchObject({ state: 'ACTIVE', since: null });
    db = await openWorkspaceDb(files, entry.dbName, PROBE_MIGRATIONS);
    expect(await db.all('SELECT id FROM sync_probe')).toEqual([{ id: mine }]);
    expect(await resumeHeld(db)).toBe(1);
    expect(await resumeHeld(db)).toBeNull(); // the notice is one-time
    const transport = new FakeTransport();
    const engine = makeEngine(db, makeOutbox(db, clock), registry, transport, clock);
    expect(await engine.syncNow()).toBe('OK');
    expect(transport.pushes[0]!.ops.map((o) => o.opId)).toEqual(opIds);
    await db.close();
    await index.close();
  });
});

describe('F12 · held changes expire', () => {
  it('F12-AC20 / Q14 (US-052) signing in again after 30 days does not resume held changes; they were deleted', async () => {
    const files = nodeDatabaseFiles();
    cleanups.push(() => files.dispose());
    const clock = new FakeClock();
    const index = await DeviceIndex.open(files, () => randomUuid(testRandomBytes));
    const me = { userId: 'b3f6c2a0-0000-4000-8000-00000000000c', orgId: 'b3f6c2a0-0000-4000-8000-0000000000aa', loginId: 'teacher-c1', orgName: 'Madrasa A', role: 'TEACHER' as const };
    const entry = await index.activate(me, clock.now);
    let db = await openWorkspaceDb(files, entry.dbName, PROBE_MIGRATIONS);
    const outbox = makeOutbox(db, clock);
    const id = outbox.newEntityId();
    await outbox.saveWithOp(writeProbe(id, { label: 'held' }), { entity: 'sync_probe', entityId: id, opType: 'CREATE', baseVersion: null, fields: { label: 'held' } });
    await holdForSignOut(db, probeRegistry(), clock.now);
    await index.setState(entry.dbName, 'HELD', clock.now);
    await db.close();

    clock.advance(30 * DAY_MS);
    // The app's sign-in path: purge expired first, then activate.
    await index.purgeExpired(clock.now, null);
    await index.activate(me, clock.now);
    db = await openWorkspaceDb(files, entry.dbName, PROBE_MIGRATIONS);
    expect(await makeOutbox(db, clock).unsyncedCount()).toBe(0);
    expect(await resumeHeld(db)).toBeNull();
    await db.close();
    await index.close();
  });
});
