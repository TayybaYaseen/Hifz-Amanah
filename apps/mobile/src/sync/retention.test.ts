// F12 · Offline and synchronization — unit: cache retention, revocation purge, sign-out hold (F12-AC19, AC20; Q14)
import { afterEach, describe, expect, it } from 'vitest';
import { nodeDatabaseFiles } from '../local-db/testing/nodeDriver.ts';
import { DeviceIndex, openWorkspaceDb, workspaceDbName } from './deviceIndex.ts';
import { randomUuid } from './ids.ts';
import { DAY_MS, cleanupDue, heldExpired, isPastRetention, retentionCutoff, todayIn } from './retention.ts';
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
    await lockWorkspace(db, registry, clock.now);
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
