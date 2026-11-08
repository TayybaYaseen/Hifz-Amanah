// F12 · Offline and synchronization — unit: engine review fixes (docs/specs/04-f12-offline-sync.md; F12 review
// B1, H1, H2, M1, M5, L2, L3; security review L5, L6). Real SQL under node:sqlite; the server is a fake transport.
import { statSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import type { ConflictDetail, OpResult, PushRequest } from '@hifz/contracts';
import { ApiFailure } from '../api/client.ts';
import { prepareForDelete } from '../local-db/driver.ts';
import { nodeDatabaseFiles } from '../local-db/testing/nodeDriver.ts';
import { runMigrations } from '../local-db/migrations.ts';
import { DiscardNotAllowedError } from './engine.ts';
import { discardable } from './outbox.ts';
import { effectiveNow } from './retention.ts';
import { lockWorkspace, readMeta, signOutAction } from './workspace.ts';
import { FakeClock, FakeTransport, PROBE_MIGRATIONS, makeEngine, makeOutbox, probeDb, probeRegistry, writeProbe } from './testing/probe.ts';

const cleanups: Array<() => void> = [];
afterEach(() => {
  while (cleanups.length) cleanups.pop()!();
});

const CONFLICT_1 = '6a9a3bd8-73a5-4f1b-9d3b-6d8f6c0d1e22';
const now = () => new Date().toISOString();

class FakeConflicts {
  calls: string[] = [];
  /** By default every conflict is still open on the server. */
  answer: (id: string) => ConflictDetail | Error = (id) => detail(id, ROW, 'OPEN', 1);
  async getConflict(id: string): Promise<ConflictDetail> {
    this.calls.push(id);
    const a = this.answer(id);
    if (a instanceof Error) throw a;
    return a;
  }
}

const detail = (id: string, entityId: string, status: 'OPEN' | 'RESOLVED', serverVersion: number): ConflictDetail => ({
  id,
  entity: 'sync_probe',
  entityId,
  status,
  baseVersion: 1,
  serverVersion,
  device: {},
  server: {},
  fieldDiff: [],
  createdAt: now(),
  causedBy: { userId: 'b3f6c2a0-0000-4000-8000-00000000000a', displayName: 'Test teacher' },
});

async function setup() {
  const clock = new FakeClock();
  const db = await probeDb();
  const outbox = makeOutbox(db, clock);
  const registry = probeRegistry();
  const transport = new FakeTransport();
  const conflicts = new FakeConflicts();
  const engine = makeEngine(db, outbox, registry, transport, clock, { conflicts });
  return { clock, db, outbox, registry, transport, conflicts, engine };
}

type Setup = Awaited<ReturnType<typeof setup>>;

/** A probe row the device already has from the server at `version`. */
async function serverRow(db: Setup['db'], id: string, version: number, fields: { label: string; status: string; position: number }) {
  await db.run('INSERT INTO sync_probe (id, row_version, label, status, position) VALUES (?, ?, ?, ?, ?)', [id, version, fields.label, fields.status, fields.position]);
}

/** A local edit of a synced row: UPDATE from the version the device last knew (plan §5 UPDATE rule). */
async function edit(outbox: Setup['outbox'], id: string, baseVersion: number, fields: Record<string, unknown>) {
  const { opIds } = await outbox.saveWithOp(
    async (tx) => {
      for (const [k, v] of Object.entries(fields)) await tx.run(`UPDATE sync_probe SET ${k} = ? WHERE id = ?`, [v as string | number, id]);
    },
    { entity: 'sync_probe', entityId: id, opType: 'UPDATE', baseVersion, fields, label: 'Probe row' },
  );
  return opIds[0]!;
}

async function create(outbox: Setup['outbox'], label: string, dependsOn: string[] = []) {
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

const respond = (fn: (op: PushRequest['ops'][number]) => OpResult) => (req: PushRequest) => ({ results: req.ops.map(fn), serverTime: now() });
const ROW = '01934f5e-8a00-7000-8000-000000000101';

describe('F12 · held behind an open conflict (decision Q7, review B1)', () => {
  it('F12-AC11 (US-054) a follow-up edit of a row with an open conflict is held, then sent again once it is resolved', async () => {
    const { db, outbox, engine, transport } = await setup();
    await serverRow(db, ROW, 1, { label: 'Probe', status: 'OPEN', position: 1 });
    const first = await edit(outbox, ROW, 1, { status: 'DONE' });
    let open = false;
    transport.onPush = respond((op) => {
      if (op.opId === first) {
        open = true;
        return { opId: op.opId, status: 'CONFLICT', conflictId: CONFLICT_1 };
      }
      return open ? { opId: op.opId, status: 'RETRY', code: 'CONFLICT_OPEN' } : { opId: op.opId, status: 'APPLIED', rowVersion: 3, entityId: op.entityId };
    });
    await engine.syncNow();
    const second = await edit(outbox, ROW, 1, { label: 'Renamed' });
    await engine.syncNow();

    const held = (await outbox.get(second))!;
    expect(held.status).toMatchObject({ state: 'ACTION_REQUIRED', conflictId: null, failure: { code: 'CONFLICT_OPEN' }, nextAttemptAt: null });
    expect(held.syncedAt).toBeNull();
    // Held items are not resent on their own (no timer retry, no backoff).
    const pushes = transport.pushes.length;
    await engine.syncNow({ ignoreBackoff: true });
    expect(transport.pushes.length).toBe(pushes);

    // This device resolves the conflict: only the operation that caused it is settled (review L2); the held edit
    // goes back to PENDING and is resent, and is SYNCED only from its own APPLIED ack (F12-AC9).
    open = false;
    await engine.conflictResolved(CONFLICT_1, 2);
    await engine.syncNow();
    expect((await outbox.get(first))!.status).toMatchObject({ state: 'SYNCED', rowVersion: 2 });
    expect(transport.pushes.slice(pushes).flatMap((p) => p.ops.map((o) => o.opId))).toEqual([second]);
    expect((await outbox.get(second))!.status).toMatchObject({ state: 'SYNCED', rowVersion: 3 });
  });

  it('F12-AC9 (US-053) a held item resent while the conflict is still open is held again, never marked synced', async () => {
    const { db, outbox, engine, transport } = await setup();
    await serverRow(db, ROW, 1, { label: 'Probe', status: 'OPEN', position: 1 });
    const opId = await edit(outbox, ROW, 1, { label: 'Mine' });
    transport.onPush = respond((op) => ({ opId: op.opId, status: 'RETRY', code: 'CONFLICT_OPEN' }));
    // A pull brings a newer version of the row (someone wrote it): the held item is released and resent once.
    transport.onPull = ({ cursor }) => ({
      changes: cursor === null ? [{ entity: 'sync_probe', entityId: ROW, rowVersion: 2, op: 'UPSERT', fields: { label: 'Theirs', status: 'OPEN', position: 1 } }] : [],
      cursor: 'c1',
      hasMore: false,
      scopeReset: false,
      serverTime: now(),
    });
    await engine.syncNow();
    expect(transport.pushes.length).toBe(2);
    const item = (await outbox.get(opId))!;
    expect(item.status).toMatchObject({ state: 'ACTION_REQUIRED', failure: { code: 'CONFLICT_OPEN' } });
    expect(item.syncedAt).toBeNull();
    // The server's row was not written over the unsynced local edit (NFR-OFF-006)…
    expect(await db.get('SELECT label FROM sync_probe WHERE id = ?', [ROW])).toEqual({ label: 'Mine' });
    // …and nothing more is sent until something else changes.
    await engine.syncNow();
    expect(transport.pushes.length).toBe(2);
  });

  it('F12-AC11 (US-054) a pull with a newer server version releases held items; they apply and the row is re-read', async () => {
    const { db, outbox, engine, transport } = await setup();
    await serverRow(db, ROW, 1, { label: 'Probe', status: 'OPEN', position: 1 });
    const opId = await edit(outbox, ROW, 1, { label: 'Mine' });
    let open = true;
    transport.onPush = respond((op) => (open ? { opId: op.opId, status: 'RETRY', code: 'CONFLICT_OPEN' } : { opId: op.opId, status: 'APPLIED', rowVersion: 3, entityId: op.entityId }));
    transport.onPull = ({ cursor }) => {
      if (cursor === null) {
        open = false; // the conflict was resolved elsewhere (version 2)
        return { changes: [{ entity: 'sync_probe', entityId: ROW, rowVersion: 2, op: 'UPSERT', fields: { label: 'Probe', status: 'DONE', position: 1 } }], cursor: 'c1', hasMore: false, scopeReset: false, serverTime: now() };
      }
      return {
        changes: [{ entity: 'sync_probe', entityId: ROW, rowVersion: 3, op: 'UPSERT', fields: { label: 'Mine', status: 'DONE', position: 1 } }],
        cursor: 'c2',
        hasMore: false,
        scopeReset: false,
        serverTime: now(),
      };
    };
    expect(await engine.syncNow()).toBe('OK');
    expect((await outbox.get(opId))!.status).toMatchObject({ state: 'SYNCED', rowVersion: 3 });
    expect(await db.get('SELECT label, status, row_version FROM sync_probe WHERE id = ?', [ROW])).toEqual({ label: 'Mine', status: 'DONE', row_version: 3 });
  });
});

describe('F12 · server values after APPLIED (review H1)', () => {
  it('F12-AC13 (US-054) the device pushes position 9, the server keeps 5: the local row ends at 5', async () => {
    const { db, outbox, engine, transport } = await setup();
    await serverRow(db, ROW, 1, { label: 'Probe', status: 'OPEN', position: 1 });
    const opId = await edit(outbox, ROW, 1, { position: 9 });
    transport.onPush = respond((op) => ({ opId: op.opId, status: 'APPLIED', rowVersion: 2, entityId: op.entityId }));
    transport.onPull = () => ({
      changes: [{ entity: 'sync_probe', entityId: ROW, rowVersion: 2, op: 'UPSERT', fields: { label: 'Probe', status: 'OPEN', position: 5 } }],
      cursor: 'c1',
      hasMore: false,
      scopeReset: false,
      serverTime: now(),
    });
    expect(await engine.syncNow()).toBe('OK');
    expect((await outbox.get(opId))!.status.state).toBe('SYNCED');
    expect(await db.get('SELECT position, row_version FROM sync_probe WHERE id = ?', [ROW])).toEqual({ position: 5, row_version: 2 });
  });

  it('F12-AC13 (US-054) a server change pulled while the edit was unsynced is kept aside and applied after APPLIED', async () => {
    const { db, outbox, engine, transport } = await setup();
    await serverRow(db, ROW, 1, { label: 'Probe', status: 'OPEN', position: 1 });
    await edit(outbox, ROW, 1, { position: 9 });
    transport.onPush = () => ({ results: [], serverTime: now() }); // no answer: stays pending
    transport.onPull = ({ cursor }) => ({
      changes: cursor === null ? [{ entity: 'sync_probe', entityId: ROW, rowVersion: 2, op: 'UPSERT', fields: { label: 'Probe', status: 'OPEN', position: 5 } }] : [],
      cursor: 'c1',
      hasMore: false,
      scopeReset: false,
      serverTime: now(),
    });
    await engine.syncNow();
    expect(await db.get('SELECT position FROM sync_probe WHERE id = ?', [ROW])).toEqual({ position: 9 }); // never overwritten while unsynced
    transport.onPush = respond((op) => ({ opId: op.opId, status: 'APPLIED', rowVersion: 2, entityId: op.entityId }));
    await engine.syncNow();
    expect(await db.get('SELECT position, row_version FROM sync_probe WHERE id = ?', [ROW])).toEqual({ position: 5, row_version: 2 });
    expect(await db.get('SELECT COUNT(*) AS n FROM deferred_changes')).toEqual({ n: 0 });
  });

  it('F12 unit: an older pulled change never overwrites a newer local version', async () => {
    const { db, engine, transport } = await setup();
    await serverRow(db, ROW, 4, { label: 'Newer', status: 'OPEN', position: 1 });
    transport.onPull = () => ({
      changes: [{ entity: 'sync_probe', entityId: ROW, rowVersion: 3, op: 'UPSERT', fields: { label: 'Older', status: 'OPEN', position: 1 } }],
      cursor: 'c1',
      hasMore: false,
      scopeReset: false,
      serverTime: now(),
    });
    await engine.syncNow();
    expect(await db.get('SELECT label, row_version FROM sync_probe WHERE id = ?', [ROW])).toEqual({ label: 'Newer', row_version: 4 });
  });
});

describe('F12 · conflicts closed elsewhere (review H2)', () => {
  async function conflicted(s: Setup) {
    await serverRow(s.db, ROW, 1, { label: 'Probe', status: 'OPEN', position: 1 });
    const opId = await edit(s.outbox, ROW, 1, { status: 'DONE' });
    s.transport.onPush = respond((op) => ({ opId: op.opId, status: 'CONFLICT', conflictId: CONFLICT_1 }));
    s.conflicts.answer = (id) => detail(id, ROW, 'OPEN', 2);
    await s.engine.syncNow();
    expect((await s.outbox.get(opId))!.status).toMatchObject({ state: 'ACTION_REQUIRED', conflictId: CONFLICT_1 });
    return opId;
  }

  it('F12-AC12 (US-054) a conflict resolved on another device becomes synced here, and the resolved row is applied', async () => {
    const s = await setup();
    const opId = await conflicted(s);
    // The resolution (version 3) arrives in a pull while the item is still action required: kept aside.
    s.transport.onPull = ({ cursor }) => ({
      changes: cursor === 'c0' ? [{ entity: 'sync_probe', entityId: ROW, rowVersion: 3, op: 'UPSERT', fields: { label: 'Probe', status: 'DONE', position: 1 } }] : [],
      cursor: 'c1',
      hasMore: false,
      scopeReset: false,
      serverTime: now(),
    });
    s.conflicts.answer = (id) => detail(id, ROW, 'RESOLVED', 2);
    expect(await s.engine.syncNow()).toBe('OK');
    expect(s.conflicts.calls).toContain(CONFLICT_1);
    expect((await s.outbox.get(opId))!.status).toMatchObject({ state: 'SYNCED', rowVersion: 3, conflictId: null });
    expect(await s.db.get('SELECT status, row_version FROM sync_probe WHERE id = ?', [ROW])).toEqual({ status: 'DONE', row_version: 3 });
    expect(await s.db.get('SELECT status FROM conflicts WHERE conflict_id = ?', [CONFLICT_1])).toEqual({ status: 'RESOLVED' });
  });

  it('F12-AC17 (US-054) a conflict this user can no longer open (404) becomes failed NOT_FOUND, never synced (Q8)', async () => {
    const s = await setup();
    const opId = await conflicted(s);
    s.conflicts.answer = () => new ApiFailure('NOT_FOUND', 404);
    await s.engine.syncNow();
    const item = (await s.outbox.get(opId))!;
    expect(item.status).toMatchObject({ state: 'FAILED', failure: { code: 'NOT_FOUND' }, conflictId: null });
    expect(item.syncedAt).toBeNull();
    expect(await s.db.get('SELECT COUNT(*) AS n FROM conflicts')).toEqual({ n: 0 });
  });

  it('F12 unit: a still-open conflict, or a temporary error while checking, changes nothing', async () => {
    const s = await setup();
    const opId = await conflicted(s);
    s.conflicts.answer = () => new ApiFailure('INTERNAL', 503);
    expect(await s.engine.syncNow()).toBe('OK');
    expect((await s.outbox.get(opId))!.status).toMatchObject({ state: 'ACTION_REQUIRED', conflictId: CONFLICT_1 });
  });

  it('F12-AC12 (US-054) Conflict Review reporting the conflict already resolved settles the item (CONFLICT_CLOSED)', async () => {
    const s = await setup();
    const opId = await conflicted(s);
    await s.engine.reconcileConflict(CONFLICT_1, detail(CONFLICT_1, ROW, 'RESOLVED', 2));
    expect((await s.outbox.get(opId))!.status).toMatchObject({ state: 'SYNCED', rowVersion: 3 });
  });

  it('F12 unit (review L2): the local conflict keeps its op_id; resolving moves only that operation', async () => {
    const s = await setup();
    await serverRow(s.db, ROW, 1, { label: 'Probe', status: 'OPEN', position: 1 });
    const a = await edit(s.outbox, ROW, 1, { status: 'DONE' });
    const b = await edit(s.outbox, ROW, 1, { label: 'Other' });
    // A misbehaving replay names the same conflict for both operations.
    s.transport.onPush = respond((op) => ({ opId: op.opId, status: 'CONFLICT', conflictId: CONFLICT_1 }));
    await s.engine.syncNow();
    expect(await s.db.all('SELECT op_id FROM conflicts')).toEqual([{ op_id: a }]);
    await s.engine.conflictResolved(CONFLICT_1, 2);
    expect((await s.outbox.get(a))!.status.state).toBe('SYNCED');
    expect((await s.outbox.get(b))!.status.state).toBe('ACTION_REQUIRED');
  });
});

describe('F12 · retry and discard (review M1, M5)', () => {
  it('F12-AC8 (US-053) Retry on a server-rejected item queues it again as a new operation, in one transaction', async () => {
    const { db, outbox, engine, transport } = await setup();
    const record = await create(outbox, 'record');
    const portion = await create(outbox, 'portion', [record.opId]);
    let reject = true;
    transport.onPush = respond((op) =>
      reject ? { opId: op.opId, status: 'REJECTED', code: 'NOT_FOUND' } : { opId: op.opId, status: 'APPLIED', rowVersion: 1, entityId: op.entityId },
    );
    await engine.syncNow();
    const failed = (await outbox.get(record.opId))!;
    expect(failed.status.state).toBe('FAILED');

    reject = false;
    await engine.retry(record.opId);
    await engine.syncNow();
    // The old op_id (whose REJECTED result the server keeps for ever) is gone and recorded as retried.
    expect(await outbox.get(record.opId)).toBeNull();
    expect(await db.get('SELECT reason, failure_code FROM discards WHERE op_id = ?', [record.opId])).toEqual({ reason: 'RETRIED', failure_code: 'NOT_FOUND' });
    const items = await outbox.list();
    const again = items.find((i) => i.entityId === record.id)!;
    expect(again.opId).not.toBe(record.opId);
    expect(again).toMatchObject({ opType: 'CREATE', fields: failed.fields, createdAt: failed.createdAt });
    expect(again.seq).toBeGreaterThan((await outbox.get(portion.opId))!.seq);
    // Its dependent now waits for the new operation, and both sync in dependency order.
    expect((await outbox.get(portion.opId))!.dependsOn).toEqual([again.opId]);
    const sent = transport.pushes.flatMap((p) => p.ops.map((o) => o.opId));
    expect(sent.slice(-2)).toEqual([again.opId, portion.opId]);
    expect(items.every((i) => i.status.state === 'SYNCED')).toBe(true);
  });

  it('F12 unit (review M5): Discard is offered only where the server certainly did not apply the change', async () => {
    const { outbox, engine, transport, db } = await setup();
    // Never sent: discardable.
    const fresh = await create(outbox, 'fresh');
    expect(discardable((await outbox.get(fresh.opId))!)).toBe(true);
    await engine.discard(fresh.opId);
    expect(await db.get('SELECT reason FROM discards WHERE op_id = ?', [fresh.opId])).toEqual({ reason: 'DISCARDED' });

    // Sent, but the request failed (503): it may be on the server, so it is not discardable.
    const sent = await create(outbox, 'sent once');
    transport.failWith(503, 'INTERNAL');
    await engine.syncNow();
    const maybe = (await outbox.get(sent.opId))!;
    expect(maybe.status.state).toBe('PENDING');
    expect(maybe.sentCount).toBe(1);
    expect(discardable(maybe)).toBe(false);
    await expect(engine.discard(sent.opId)).rejects.toMatchObject({ name: 'DiscardNotAllowedError', reason: 'MAYBE_SENT' });

    // Rejected by the server (FAILED): discardable (the spec's "kept for correction or explicit discard").
    transport.onPush = respond((op) => ({ opId: op.opId, status: 'REJECTED', code: 'VALIDATION', fields: { label: 'INVALID' } }));
    transport.onPull = new FakeTransport().onPull;
    await engine.syncNow({ ignoreBackoff: true });
    expect((await outbox.get(sent.opId))!.status.state).toBe('FAILED');
    await engine.discard(sent.opId);
    expect(await outbox.get(sent.opId)).toBeNull();
  });

  it('F12 unit (review M5): an item with its own conflict cannot be discarded; one held behind it can', async () => {
    const { db, outbox, engine, transport } = await setup();
    await serverRow(db, ROW, 1, { label: 'Probe', status: 'OPEN', position: 1 });
    const own = await edit(outbox, ROW, 1, { status: 'DONE' });
    transport.onPush = respond((op) => (op.opId === own ? { opId: op.opId, status: 'CONFLICT', conflictId: CONFLICT_1 } : { opId: op.opId, status: 'RETRY', code: 'CONFLICT_OPEN' }));
    await engine.syncNow();
    const held = await edit(outbox, ROW, 1, { label: 'Held' });
    await engine.syncNow();
    await expect(engine.discard(own)).rejects.toBeInstanceOf(DiscardNotAllowedError);
    await engine.discard(held);
    expect(await outbox.get(held)).toBeNull();
  });
});

describe('F12 · sign-out rule (review M3)', () => {
  it('F12-AC10 (US-053) signing out never deletes unsynced changes unless the workspace is locked after revocation', () => {
    expect(signOutAction({ remaining: 0, locked: false })).toBe('DELETE');
    expect(signOutAction({ remaining: 3, locked: false })).toBe('HOLD');
    // F12-AC20: a revoked workspace is deleted with everything in it on sign-out.
    expect(signOutAction({ remaining: 3, locked: true })).toBe('DELETE');
    expect(signOutAction({ remaining: 0, locked: true })).toBe('DELETE');
  });
});

describe('F12 · device storage hardening (security review L5, L6)', () => {
  it('F12-AC20 (US-052) deleted rows are zeroed (secure_delete) and the WAL is truncated after a purge', async () => {
    const files = nodeDatabaseFiles();
    cleanups.push(() => files.dispose());
    const db = await files.open('ws.db');
    expect(await db.get('PRAGMA secure_delete')).toEqual({ secure_delete: 1 });
    await db.exec('PRAGMA journal_mode = WAL;');
    await runMigrations(db, PROBE_MIGRATIONS);
    for (let i = 0; i < 20; i++) await db.run('INSERT INTO sync_probe (id, row_version, label) VALUES (?, 1, ?)', [`01934f5e-8a00-7000-8000-0000000002${String(i).padStart(2, '0')}`, `synced ${i}`]);
    expect(statSync(join(files.dir, 'ws.db-wal')).size).toBeGreaterThan(0);
    await lockWorkspace(db, probeRegistry(), Date.now());
    expect(await db.get('SELECT COUNT(*) AS n FROM sync_probe')).toEqual({ n: 0 });
    expect(statSync(join(files.dir, 'ws.db-wal')).size).toBe(0);

    // Before a workspace file is deleted, WAL mode is left, so closing removes the -wal and -shm files.
    await prepareForDelete(db);
    await db.close();
    expect(files.exists('ws.db-wal')).toBe(false);
    expect(files.exists('ws.db-shm')).toBe(false);
    await files.delete('ws.db');
    expect(files.exists('ws.db')).toBe(false);
  });

  it('F12-AC19 (US-051) retention never runs behind the last server time, even if the phone clock is set back', async () => {
    const clock = new FakeClock(); // 2026-11-08
    const db = await probeDb();
    const outbox = makeOutbox(db, clock);
    const transport = new FakeTransport();
    const engine = makeEngine(db, outbox, probeRegistry(120), transport, clock);
    // A record dated 2026-10-01 is not past 120 days by the phone clock…
    await db.run("INSERT INTO sync_probe (id, row_version, label, report_date) VALUES (?, 1, 'r', '2026-10-01')", [ROW]);
    // …but the server says it is 2027-03-01.
    transport.onPull = () => ({ changes: [], cursor: 'c1', hasMore: false, scopeReset: false, serverTime: '2027-03-01T00:00:00.000Z' });
    await engine.syncNow();
    expect((await readMeta(db)).lastServerTime).toBe('2027-03-01T00:00:00.000Z');
    await engine.cleanupIfDue(true);
    expect(await db.get('SELECT COUNT(*) AS n FROM sync_probe')).toEqual({ n: 0 });
    // An older server time never moves it back.
    transport.onPull = () => ({ changes: [], cursor: 'c2', hasMore: false, scopeReset: false, serverTime: '2026-01-01T00:00:00.000Z' });
    await engine.syncNow();
    expect((await readMeta(db)).lastServerTime).toBe('2027-03-01T00:00:00.000Z');
    expect(effectiveNow(Date.parse('2027-04-01T00:00:00Z'), '2027-03-01T00:00:00.000Z')).toBe(Date.parse('2027-04-01T00:00:00Z'));
    expect(effectiveNow(0, null)).toBe(0);
  });
});
