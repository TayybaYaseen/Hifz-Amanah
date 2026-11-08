// F12 · Offline and synchronization — unit: outbox (docs/specs/04-f12-offline-sync.md)
// Runs the real SQL under Node's node:sqlite behind the app's driver interface; the server is a fake transport.
import { afterEach, describe, expect, it } from 'vitest';
import { isUuidV7 } from '@hifz/domain/sync';
import { nodeDatabaseFiles } from '../local-db/testing/nodeDriver.ts';
import { runMigrations } from '../local-db/migrations.ts';
import { OutboxValidationError } from './outbox.ts';
import {
  FakeClock,
  FakeTransport,
  PROBE_MIGRATIONS,
  failure,
  makeEngine,
  makeOutbox,
  probeDb,
  probeRegistry,
  writeProbe,
} from './testing/probe.ts';

const cleanups: Array<() => void> = [];
afterEach(() => {
  while (cleanups.length) cleanups.pop()!();
});

async function setup() {
  const clock = new FakeClock();
  const db = await probeDb();
  const outbox = makeOutbox(db, clock);
  const registry = probeRegistry();
  const transport = new FakeTransport();
  const engine = makeEngine(db, outbox, registry, transport, clock);
  return { clock, db, outbox, registry, transport, engine };
}

async function createProbe(outbox: ReturnType<typeof makeOutbox>, label: string, dependsOn: string[] = []) {
  const id = outbox.newEntityId();
  const { opIds } = await outbox.saveWithOp(writeProbe(id, { label, status: 'OPEN', position: 1 }), {
    entity: 'sync_probe',
    entityId: id,
    opType: 'CREATE',
    baseVersion: null,
    fields: { label, status: 'OPEN', position: 1 },
    dependsOn,
    label,
  });
  return { id, opId: opIds[0]! };
}

describe('F12 · saving on the device', () => {
  it('F12-AC1 (US-051) the entity write and its outbox operation commit in one transaction', async () => {
    const { db, outbox } = await setup();
    const { id } = await createProbe(outbox, 'Probe A');
    expect(await db.get('SELECT id FROM sync_probe WHERE id = ?', [id])).toEqual({ id });
    expect((await outbox.list()).map((i) => [i.entityId, i.status.state])).toEqual([[id, 'PENDING']]);
  });

  it('F12-AC1 (US-051) if queuing the operation fails, the entity write is rolled back too (and the reverse)', async () => {
    const { db, outbox } = await setup();
    const id = outbox.newEntityId();
    // The operation is invalid (reserved field), so the whole save must leave nothing behind.
    await expect(
      outbox.saveWithOp(writeProbe(id, { label: 'X' }), { entity: 'sync_probe', entityId: id, opType: 'CREATE', baseVersion: null, fields: { organizationId: 'o1' } }),
    ).rejects.toBeInstanceOf(OutboxValidationError);
    expect(await db.get('SELECT id FROM sync_probe WHERE id = ?', [id])).toBeNull();
    expect(await outbox.list()).toEqual([]);

    // The entity write fails: no operation is queued.
    await expect(
      outbox.saveWithOp(
        async (tx) => {
          await tx.run('INSERT INTO sync_probe (id) VALUES (?)', [id]);
          await tx.run('INSERT INTO sync_probe (id) VALUES (?)', [id]); // duplicate primary key
        },
        { entity: 'sync_probe', entityId: id, opType: 'CREATE', baseVersion: null, fields: {} },
      ),
    ).rejects.toThrow();
    expect(await db.get('SELECT id FROM sync_probe WHERE id = ?', [id])).toBeNull();
    expect(await outbox.list()).toEqual([]);
  });

  it('F12-AC2 (US-051) queued work survives closing and reopening the database (app force-closed)', async () => {
    const files = nodeDatabaseFiles();
    cleanups.push(() => files.dispose());
    const clock = new FakeClock();
    let db = await files.open('ws.db');
    await runMigrations(db, PROBE_MIGRATIONS);
    const { id, opId } = await createProbe(makeOutbox(db, clock), 'Survivor');
    await db.close();

    db = await files.open('ws.db');
    await runMigrations(db, PROBE_MIGRATIONS); // nothing to do; must not touch the outbox
    const reopened = makeOutbox(db, clock);
    const items = await reopened.list();
    expect(items.map((i) => [i.opId, i.entityId, i.status.state, i.label])).toEqual([[opId, id, 'PENDING', 'Survivor']]);
    expect(await db.get('SELECT label FROM sync_probe WHERE id = ?', [id])).toEqual({ label: 'Survivor' });
    await db.close();
  });

  it('F12-AC2 (US-051) an operation left SYNCING by a killed app goes back to PENDING on start and is resent', async () => {
    const { db, outbox, engine, transport } = await setup();
    const { opId } = await createProbe(outbox, 'Interrupted');
    await db.run("UPDATE outbox SET state = 'SYNCING' WHERE op_id = ?", [opId]);
    await engine.start();
    expect((await outbox.get(opId))!.status.state).toBe('PENDING');
    expect(await engine.syncNow()).toBe('OK');
    expect(transport.pushes[0]!.ops.map((o) => o.opId)).toEqual([opId]);
  });
});

describe('F12 · identifiers', () => {
  it('F12-AC3 (US-051) an offline-created record gets a client UUIDv7 that never changes, including after sync', async () => {
    const { db, outbox, engine, transport } = await setup();
    const { id, opId } = await createProbe(outbox, 'Keeps its ID');
    expect(isUuidV7(id)).toBe(true);
    expect(await engine.syncNow()).toBe('OK');
    expect(transport.pushes[0]!.ops[0]!.entityId).toBe(id);
    const item = (await outbox.get(opId))!;
    expect(item.entityId).toBe(id);
    expect(item.status.state).toBe('SYNCED');
    expect(await db.get('SELECT id, row_version FROM sync_probe')).toEqual({ id, row_version: 1 });
  });

  it('F12 unit: every operation has a unique op_id', async () => {
    const { outbox } = await setup();
    for (let i = 0; i < 50; i++) await createProbe(outbox, `P${i}`);
    const items = await outbox.list();
    expect(new Set(items.map((i) => i.opId)).size).toBe(50);
    expect(items.every((i) => isUuidV7(i.opId))).toBe(true);
    // seq is a strictly increasing outbox counter.
    expect(items.map((i) => i.seq)).toEqual(Array.from({ length: 50 }, (_, k) => k + 1));
  });
});

describe('F12 · ordering', () => {
  it('F12-AC4 (US-052) operations are sent in order, a record before its portions and attempts', async () => {
    const { outbox, engine, transport, clock } = await setup();
    const record = await createProbe(outbox, 'record');
    const portion = await createProbe(outbox, 'portion', [record.opId]);
    const attempt = await createProbe(outbox, 'attempt', [portion.opId]);
    // Device time going backwards must not reorder anything.
    clock.advance(-3_600_000);
    expect(await engine.syncNow()).toBe('OK');
    // Each dependent is sent only after its dependency was acknowledged: three pushes, in outbox order.
    expect(transport.pushes.map((p) => p.ops.map((o) => o.opId))).toEqual([[record.opId], [portion.opId], [attempt.opId]]);
    expect(transport.pushes[1]!.ops[0]!.dependsOn).toEqual([record.opId]);
  });

  it('F12-AC4 (US-052) a dependent waits while its record is FAILED ("waiting for record") and is not sent', async () => {
    const { outbox, engine, transport } = await setup();
    const record = await createProbe(outbox, 'record');
    const portion = await createProbe(outbox, 'portion', [record.opId]);
    transport.onPush = (req) => ({
      results: req.ops.map((op) => ({ opId: op.opId, status: 'REJECTED' as const, code: 'VALIDATION' as const, fields: { label: 'INVALID' } })),
      serverTime: new Date().toISOString(),
    });
    await engine.syncNow();
    expect(transport.pushes.flatMap((p) => p.ops.map((o) => o.opId))).toEqual([record.opId]);
    expect((await outbox.get(record.opId))!.status).toMatchObject({ state: 'FAILED', failure: { code: 'VALIDATION', fields: { label: 'INVALID' } } });
    expect((await outbox.get(portion.opId))!.status.state).toBe('PENDING');
  });

  it('F12 unit: pushes are batched at 100 operations', async () => {
    const { outbox, engine, transport } = await setup();
    for (let i = 0; i < 150; i++) await createProbe(outbox, `P${i}`);
    await engine.syncNow();
    expect(transport.pushes.map((p) => p.ops.length)).toEqual([100, 50]);
  });
});

describe('F12 · retries', () => {
  it('F12-AC6 (US-052) temporary errors retry with increasing delays and the operation stays pending', async () => {
    const { outbox, engine, transport, clock } = await setup();
    const { opId } = await createProbe(outbox, 'Retry me');
    transport.failWith(503, 'INTERNAL');
    const delays: number[] = [];
    for (let i = 1; i <= 4; i++) {
      expect(await engine.syncNow({ ignoreBackoff: true })).toBe('RETRY_LATER');
      const item = (await outbox.get(opId))!;
      expect(item.status.state).toBe('PENDING');
      expect(item.status.attempts).toBe(i);
      expect(item.status.failure).toEqual({ code: 'INTERNAL' });
      delays.push(item.status.nextAttemptAt! - clock.now);
    }
    // random() = 0.5 → delay = half the ceiling: 1 s, 2 s, 4 s, 8 s.
    expect(delays).toEqual([1_000, 2_000, 4_000, 8_000]);

    // Not resent before its time; resent after it; never discarded.
    const pushesBefore = transport.pushes.length;
    await engine.syncNow();
    expect(transport.pushes.length).toBe(pushesBefore);
    clock.advance(8_000);
    transport.onPush = new FakeTransport().onPush;
    transport.onPull = new FakeTransport().onPull;
    expect(await engine.syncNow()).toBe('OK');
    expect((await outbox.get(opId))!.status).toMatchObject({ state: 'SYNCED', attempts: 0, failure: null });
  });

  it('F12-AC6 (US-052) no connection keeps the operation PENDING and skips the pull', async () => {
    const { outbox, engine, transport } = await setup();
    const { opId } = await createProbe(outbox, 'Offline');
    transport.failWith(0, 'NETWORK');
    expect(await engine.syncNow()).toBe('OFFLINE');
    expect((await outbox.get(opId))!.status).toMatchObject({ state: 'PENDING', failure: { code: 'NETWORK' } });
    expect(transport.pulls).toEqual([]);
  });

  it('F12-AC6 (US-052) DEPENDENCY_PENDING from the server is a retry, not a failure', async () => {
    const { outbox, engine, transport } = await setup();
    const { opId } = await createProbe(outbox, 'Dependent');
    transport.onPush = (req) => ({
      results: req.ops.map((op) => ({ opId: op.opId, status: 'RETRY' as const, code: 'DEPENDENCY_PENDING' as const })),
      serverTime: new Date().toISOString(),
    });
    expect(await engine.syncNow({ ignoreBackoff: true })).toBe('OK');
    expect((await outbox.get(opId))!.status).toMatchObject({ state: 'PENDING', attempts: 1, failure: { code: 'DEPENDENCY_PENDING' } });
    // One push per run: the run does not spin on the same operation.
    expect(transport.pushes.length).toBe(1);
  });
});

describe('F12 · sync states', () => {
  it('F12-AC8 (US-053) each item is pending, syncing, synced, failed (with reason), or action required', async () => {
    const { outbox, engine, transport, db } = await setup();
    const applied = await createProbe(outbox, 'applied');
    const rejected = await createProbe(outbox, 'rejected');
    const conflicted = await createProbe(outbox, 'conflicted');
    const seen: string[] = [];
    transport.onPush = async (req) => {
      // While the request is in flight, the items are SYNCING.
      for (const op of req.ops) seen.push((await outbox.get(op.opId))!.status.state);
      return {
        results: [
          { opId: applied.opId, status: 'APPLIED', rowVersion: 3, entityId: applied.id },
          { opId: rejected.opId, status: 'REJECTED', code: 'ID_TAKEN' },
          { opId: conflicted.opId, status: 'CONFLICT', conflictId: '6a9a3bd8-73a5-4f1b-9d3b-6d8f6c0d1e22' },
        ],
        serverTime: new Date().toISOString(),
      };
    };
    expect((await outbox.get(applied.opId))!.status.state).toBe('PENDING');
    await engine.syncNow();
    expect(seen).toEqual(['SYNCING', 'SYNCING', 'SYNCING']);
    expect((await outbox.get(applied.opId))!.status).toMatchObject({ state: 'SYNCED', rowVersion: 3 });
    expect((await outbox.get(rejected.opId))!.status).toMatchObject({ state: 'FAILED', failure: { code: 'ID_TAKEN' } });
    expect((await outbox.get(conflicted.opId))!.status).toMatchObject({ state: 'ACTION_REQUIRED', conflictId: '6a9a3bd8-73a5-4f1b-9d3b-6d8f6c0d1e22' });
    expect(await db.get('SELECT status, entity_id FROM conflicts')).toEqual({ status: 'OPEN', entity_id: conflicted.id });
    expect(await outbox.counts()).toEqual({ PENDING: 0, SYNCING: 0, SYNCED: 1, FAILED: 1, ACTION_REQUIRED: 1 });

    // Retry on a FAILED item puts it back to PENDING; a resolved conflict becomes SYNCED only on the server's word.
    await engine.retry(rejected.opId);
    await engine.syncNow();
    await engine.conflictResolved('6a9a3bd8-73a5-4f1b-9d3b-6d8f6c0d1e22', 5);
    expect((await outbox.get(conflicted.opId))!.status).toMatchObject({ state: 'SYNCED', rowVersion: 5 });
  });

  it('F12-AC9 (US-053) an item is never synced until the server acknowledges it', async () => {
    const { outbox, engine, transport } = await setup();
    const { opId } = await createProbe(outbox, 'Unacknowledged');
    // The server answers, but not for this operation.
    transport.onPush = () => ({ results: [], serverTime: new Date().toISOString() });
    await engine.syncNow();
    expect((await outbox.get(opId))!.status.state).toBe('PENDING');
    // The request fails after sending.
    transport.failWith(503, 'INTERNAL');
    await engine.syncNow({ ignoreBackoff: true });
    expect((await outbox.get(opId))!.status.state).toBe('PENDING');
    expect((await outbox.get(opId))!.syncedAt).toBeNull();
  });

  it('F12-AC14 (US-052) "access revoked" stops syncing that workspace and keeps pending changes visible', async () => {
    let revokedCalls = 0;
    const clock = new FakeClock();
    const db = await probeDb();
    const outbox = makeOutbox(db, clock);
    const registry = probeRegistry();
    const transport = new FakeTransport();
    const engine = makeEngine(db, outbox, registry, transport, clock, { onAccessRevoked: () => revokedCalls++ });

    const synced = await createProbe(outbox, 'synced');
    await engine.syncNow();
    const pending = await createProbe(outbox, 'pending');
    transport.failWith(403, 'ACCESS_REVOKED');
    expect(await engine.syncNow()).toBe('ACCESS_REVOKED');
    expect(revokedCalls).toBe(1);

    // Synced data purged at once; the unsynced change is kept and visible.
    expect(await db.get('SELECT id FROM sync_probe WHERE id = ?', [synced.id])).toBeNull();
    expect(await db.get('SELECT id FROM sync_probe WHERE id = ?', [pending.id])).toEqual({ id: pending.id });
    expect((await outbox.list()).map((i) => [i.opId, i.status.state])).toEqual([[pending.opId, 'PENDING']]);
    expect(await db.get('SELECT workspace_state FROM sync_meta')).toEqual({ workspace_state: 'LOCKED_REVOKED' });

    // No further server calls for this workspace.
    const calls = transport.pushes.length + transport.pulls.length;
    transport.onPush = new FakeTransport().onPush;
    expect(await engine.syncNow({ ignoreBackoff: true })).toBe('ACCESS_REVOKED');
    expect(transport.pushes.length + transport.pulls.length).toBe(calls);
  });

  it('F12-AC15 (US-052) "upgrade required" keeps pending changes', async () => {
    const { outbox, engine, transport, db } = await setup();
    const a = await createProbe(outbox, 'a');
    const b = await createProbe(outbox, 'b');
    transport.failWith(426, 'UPGRADE_REQUIRED');
    expect(await engine.syncNow()).toBe('UPGRADE_REQUIRED');
    const items = await outbox.list();
    expect(items.map((i) => [i.opId, i.status.state, i.status.attempts])).toEqual([
      [a.opId, 'PENDING', 0],
      [b.opId, 'PENDING', 0],
    ]);
    expect(await db.get('SELECT COUNT(*) AS n FROM sync_probe')).toEqual({ n: 2 });
    // Automatic triggers do not ask again; saving more work locally still works.
    const pushes = transport.pushes.length;
    expect(await engine.syncNow()).toBe('UPGRADE_REQUIRED');
    expect(transport.pushes.length).toBe(pushes);
    await createProbe(outbox, 'c');
    expect(await outbox.unsyncedCount()).toBe(3);
    // A new app start (after the update) tries again, and the queue syncs.
    transport.onPush = new FakeTransport().onPush;
    transport.onPull = new FakeTransport().onPull;
    await engine.start();
    expect(await engine.syncNow()).toBe('OK');
    expect(await outbox.unsyncedCount()).toBe(0);
  });

  it('F12 unit: a 401 that cannot be refreshed stops the run and keeps everything PENDING without backoff', async () => {
    const { outbox, engine, transport } = await setup();
    const { opId } = await createProbe(outbox, 'Expired');
    transport.failWith(401, 'SESSION_EXPIRED');
    expect(await engine.syncNow()).toBe('SESSION_EXPIRED');
    expect((await outbox.get(opId))!.status).toMatchObject({ state: 'PENDING', attempts: 0, nextAttemptAt: null });
  });

  it('F12 unit: Discard needs PENDING or FAILED, is blocked by unsynced dependents, and is recorded locally', async () => {
    const { outbox, engine, db } = await setup();
    const record = await createProbe(outbox, 'record');
    const portion = await createProbe(outbox, 'portion', [record.opId]);
    await expect(engine.discard(record.opId)).rejects.toMatchObject({ name: 'DiscardNotAllowedError', dependents: 1 });
    await engine.discard(portion.opId);
    await engine.discard(record.opId);
    expect(await outbox.list()).toEqual([]);
    expect(await db.get('SELECT COUNT(*) AS n FROM sync_probe')).toEqual({ n: 0 });
    expect(await db.all('SELECT op_id FROM discards ORDER BY op_id')).toEqual([{ op_id: record.opId }, { op_id: portion.opId }].sort((x, y) => (x.op_id < y.op_id ? -1 : 1)));
  });
});

describe('F12 · pull', () => {
  it('F12 unit: pulls until hasMore is false, stores the cursor, and never overwrites unsynced local changes', async () => {
    const { outbox, engine, transport, db } = await setup();
    const local = await createProbe(outbox, 'local edit');
    transport.onPush = () => ({ results: [], serverTime: new Date().toISOString() }); // stays pending
    const serverId = '01934f5e-8a00-7000-8000-000000000001';
    transport.onPull = ({ cursor }) =>
      cursor === null
        ? {
            changes: [
              { entity: 'sync_probe', entityId: serverId, rowVersion: 2, op: 'UPSERT', fields: { label: 'from server', status: 'OPEN', position: 4 } },
              { entity: 'sync_probe', entityId: local.id, rowVersion: 9, op: 'UPSERT', fields: { label: 'server wins?', status: 'DONE', position: 1 } },
            ],
            cursor: 'p1',
            hasMore: true,
            scopeReset: false,
            serverTime: new Date().toISOString(),
          }
        : { changes: [{ entity: 'sync_probe', entityId: serverId, rowVersion: 3, op: 'UPSERT', fields: { label: 'newer', status: 'OPEN', position: 4 } }], cursor: 'p2', hasMore: false, scopeReset: false, serverTime: new Date().toISOString() };
    expect(await engine.syncNow()).toBe('OK');
    expect(transport.pulls.map((p) => p.cursor)).toEqual([null, 'p1']);
    expect(await db.get('SELECT last_pull_cursor FROM sync_meta')).toEqual({ last_pull_cursor: 'p2' });
    expect(await db.get('SELECT label, row_version FROM sync_probe WHERE id = ?', [serverId])).toEqual({ label: 'newer', row_version: 3 });
    expect(await db.get('SELECT label, row_version FROM sync_probe WHERE id = ?', [local.id])).toEqual({ label: 'local edit', row_version: null });
  });

  it('F12 unit: scopeReset drops synced rows outside the new scope and re-bootstraps; unsynced rows stay', async () => {
    const { outbox, engine, transport, db } = await setup();
    const keep = await createProbe(outbox, 'unsynced');
    transport.onPush = () => ({ results: [], serverTime: new Date().toISOString() });
    await db.run("INSERT INTO sync_probe (id, row_version, label) VALUES ('01934f5e-8a00-7000-8000-0000000000aa', 4, 'old class')");
    await db.run("UPDATE sync_meta SET last_pull_cursor = 'old'");
    const inScope = '01934f5e-8a00-7000-8000-0000000000bb';
    transport.onPull = ({ cursor }) =>
      cursor === 'old'
        ? { changes: [], cursor: 'x', hasMore: false, scopeReset: true, serverTime: new Date().toISOString() }
        : { changes: [{ entity: 'sync_probe', entityId: inScope, rowVersion: 1, op: 'UPSERT', fields: { label: 'new class' } }], cursor: 'snap', hasMore: false, scopeReset: false, serverTime: new Date().toISOString() };
    expect(await engine.syncNow()).toBe('OK');
    expect(transport.pulls.map((p) => p.cursor)).toEqual(['old', null]);
    expect((await db.all<{ id: string }>('SELECT id FROM sync_probe ORDER BY id')).map((r) => r.id).sort()).toEqual([keep.id, inScope].sort());
  });

  it('F12 unit: REMOVE_FROM_DEVICE removes a synced row but never one with unsynced changes', async () => {
    const { outbox, engine, transport, db } = await setup();
    const unsynced = await createProbe(outbox, 'mine');
    transport.onPush = () => ({ results: [], serverTime: new Date().toISOString() });
    const synced = '01934f5e-8a00-7000-8000-0000000000cc';
    await db.run('INSERT INTO sync_probe (id, row_version, label) VALUES (?, 1, ?)', [synced, 'theirs']);
    transport.onPull = () => ({
      changes: [
        { entity: 'sync_probe', entityId: synced, rowVersion: 2, op: 'REMOVE_FROM_DEVICE' },
        { entity: 'sync_probe', entityId: unsynced.id, rowVersion: 2, op: 'REMOVE_FROM_DEVICE' },
      ],
      cursor: 'c',
      hasMore: false,
      scopeReset: false,
      serverTime: new Date().toISOString(),
    });
    await engine.syncNow();
    expect(await db.all('SELECT id FROM sync_probe')).toEqual([{ id: unsynced.id }]);
    expect((await outbox.get(unsynced.opId))!.status.state).toBe('PENDING');
  });

  it('F12 unit: a failing pull with 503 keeps pushed results and returns RETRY_LATER', async () => {
    const { outbox, engine, transport } = await setup();
    const { opId } = await createProbe(outbox, 'pushed');
    transport.onPull = () => {
      throw failure(503, 'INTERNAL');
    };
    expect(await engine.syncNow()).toBe('RETRY_LATER');
    expect((await outbox.get(opId))!.status.state).toBe('SYNCED');
  });
});

describe('F12 · triggers', () => {
  it('F12 unit: regaining connectivity triggers a run; offline triggers are ignored', async () => {
    const { outbox, engine, transport } = await setup();
    engine.setOnline(false);
    await createProbe(outbox, 'queued offline');
    engine.requestSync('save');
    engine.requestSync('timer');
    await engine.tick();
    await new Promise((r) => setTimeout(r, 20));
    expect(transport.pushes.length).toBe(0);
    engine.setOnline(true);
    await new Promise((r) => setTimeout(r, 20));
    expect(transport.pushes.length).toBe(1);
    expect(await outbox.unsyncedCount()).toBe(0);
  });
});
