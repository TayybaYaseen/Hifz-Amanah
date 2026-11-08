// F12 · Offline and synchronization — unit: re-review fixes N2–N6 (docs/specs/04-f12-offline-sync.md; NFR-OFF-006,
// NFR-OFF-007, FR-SYNC-006). Real SQL under node:sqlite; the server is a fake transport.
import { describe, expect, it } from 'vitest';
import type { ConflictDetail, OpResult, PushRequest, PushResponse } from '@hifz/contracts';
import { nextSendable } from '@hifz/domain/sync';
import { MAX_RECONCILE, RECONCILE_INTERVAL_MS, RetryNotAllowedError } from './engine.ts';
import { Outbox, OutboxBlockedError, OutboxValidationError } from './outbox.ts';
import { SYNCED_LISTED_MS } from './retention.ts';
import { quiesceForSignOut } from './workspace.ts';
import { FakeClock, FakeTransport, makeEngine, makeOutbox, probeDb, probeRegistry, writeProbe } from './testing/probe.ts';

const ROW = '01934f5e-8a00-7000-8000-000000000201';
const now = () => new Date().toISOString();
const respond = (fn: (op: PushRequest['ops'][number]) => OpResult) => (req: PushRequest) => ({ results: req.ops.map(fn), serverTime: now() });
const applied = (rowVersion: number) => (op: PushRequest['ops'][number]): OpResult => ({ opId: op.opId, status: 'APPLIED', rowVersion, entityId: op.entityId });

class FakeConflicts {
  calls: string[] = [];
  async getConflict(id: string): Promise<ConflictDetail> {
    this.calls.push(id);
    return {
      id,
      entity: 'sync_probe',
      entityId: ROW,
      status: 'OPEN',
      baseVersion: 1,
      serverVersion: 2,
      device: {},
      server: {},
      fieldDiff: [],
      createdAt: now(),
      causedBy: { userId: 'b3f6c2a0-0000-4000-8000-00000000000a', displayName: 'Test teacher' },
    };
  }
}

async function setup() {
  const clock = new FakeClock();
  const db = await probeDb();
  const registry = probeRegistry();
  const outbox = makeOutbox(db, clock, registry);
  const transport = new FakeTransport();
  const conflicts = new FakeConflicts();
  const engine = makeEngine(db, outbox, registry, transport, clock, { conflicts });
  return { clock, db, outbox, registry, transport, conflicts, engine };
}
type Setup = Awaited<ReturnType<typeof setup>>;

/** A probe row the device already has from the server at `version`. */
async function serverRow(db: Setup['db'], id: string, version: number, label = 'Probe') {
  await db.run('INSERT INTO sync_probe (id, row_version, label, status, position) VALUES (?, ?, ?, ?, ?)', [id, version, label, 'OPEN', 1]);
}

/** An edit the way F04/F05/F08 make one: the row and its derived UPDATE in one transaction (review N3). */
async function update(outbox: Setup['outbox'], id: string, fields: { label?: string; status?: string }) {
  const { opIds } = await outbox.saveWithUpdate(
    async (tx) => {
      for (const [k, v] of Object.entries(fields)) await tx.run(`UPDATE sync_probe SET ${k} = ? WHERE id = ?`, [v, id]);
    },
    { entity: 'sync_probe', entityId: id, fields, label: 'Probe row' },
  );
  return opIds[0]!;
}

async function create(outbox: Setup['outbox'], label: string) {
  const id = outbox.newEntityId();
  const { opIds } = await outbox.saveWithOp(writeProbe(id, { label, status: 'OPEN', position: 1 }), {
    entity: 'sync_probe',
    entityId: id,
    opType: 'CREATE',
    baseVersion: null,
    fields: { label, status: 'OPEN', position: 1 },
    label,
  });
  return { id, opId: opIds[0]! };
}

const sentOps = (t: FakeTransport) => t.pushes.flatMap((p) => p.ops.map((o) => o.opId));

describe('F12 · Retry keeps the original order (review N2)', () => {
  it('F12-AC4 (US-052) a retried change keeps its seq under a new op_id and goes out before a later edit of the same row', async () => {
    const { db, outbox, engine, transport } = await setup();
    await serverRow(db, ROW, 1);
    const older = await update(outbox, ROW, { status: 'DONE' });
    transport.onPush = respond((op) => ({ opId: op.opId, status: 'REJECTED', code: 'NOT_FOUND' }));
    await engine.syncNow();
    const failed = (await outbox.get(older))!;
    expect(failed.status.state).toBe('FAILED');

    // A newer edit of the same row waits behind the failed one (domain per-row order); it is never sent first.
    const newer = await update(outbox, ROW, { label: 'Newer' });
    await engine.syncNow();
    expect(sentOps(transport)).toEqual([older]);

    transport.onPush = respond(applied(2));
    await engine.retry(older);
    await engine.syncNow();
    const items = await outbox.list();
    const again = items.find((i) => i.opId !== newer)!;
    expect(again.opId).not.toBe(older);
    expect(again.seq).toBe(failed.seq);
    expect(again.seq).toBeLessThan((await outbox.get(newer))!.seq);
    // The older change reaches the server before the newer one, so it can never overwrite it.
    expect(sentOps(transport).slice(1)).toEqual([again.opId, newer]);
    expect(items.every((i) => i.status.state === 'SYNCED')).toBe(true);
    expect(await db.get('SELECT reason FROM discards WHERE op_id = ?', [older])).toEqual({ reason: 'RETRIED' });
  });

  it('F12 unit: Retry is refused once a newer change of the same row from this device synced (also after it left the queue); Discard stays possible', async () => {
    const { db, outbox, engine, transport, clock } = await setup();
    await serverRow(db, ROW, 1);
    // A queue left by an earlier build, which sent edits of one row without waiting for the earlier one: the older
    // edit is set aside here so the newer one syncs, then it comes back FAILED.
    const older = await update(outbox, ROW, { status: 'DONE' });
    await db.run("UPDATE outbox SET state = 'SYNCED' WHERE op_id = ?", [older]);
    const newer = await update(outbox, ROW, { label: 'Newer' });
    transport.onPush = respond(applied(3));
    await engine.syncNow();
    expect((await outbox.get(newer))!.status.state).toBe('SYNCED');
    await db.run("UPDATE outbox SET state = 'FAILED', failure_code = 'NOT_FOUND', synced_at = NULL WHERE op_id = ?", [older]);
    // The engine remembered the newer synced seq for the row.
    expect(await db.get('SELECT last_synced_seq FROM row_sync_marks WHERE entity_id = ?', [ROW])).toEqual({ last_synced_seq: (await outbox.get(newer))!.seq });

    await expect(engine.retry(older)).rejects.toMatchObject({ name: 'RetryNotAllowedError', reason: 'NEWER_SYNCED' });
    expect((await outbox.get(older))!.status.state).toBe('FAILED');

    // 24 hours later the synced item is pruned from the queue (Q16); the mark still refuses the replay.
    clock.advance(SYNCED_LISTED_MS + 1);
    await engine.cleanupIfDue(true);
    expect(await outbox.get(newer)).toBeNull();
    await expect(engine.retry(older)).rejects.toBeInstanceOf(RetryNotAllowedError);

    const pushes = transport.pushes.length;
    await engine.discard(older);
    expect(await outbox.get(older)).toBeNull();
    expect(transport.pushes.length).toBe(pushes);
    // Nothing unsynced is left on the row, so its mark is no longer kept.
    await engine.cleanupIfDue(true);
    expect(await db.get('SELECT COUNT(*) AS n FROM row_sync_marks')).toEqual({ n: 0 });
  });
});

describe('F12 · UPDATE derivation (review N3)', () => {
  it('F12 unit: an UPDATE of a row the server acknowledged is based on its row version', async () => {
    const { db, outbox } = await setup();
    await serverRow(db, ROW, 4);
    const opId = await update(outbox, ROW, { label: 'Mine' });
    expect(await outbox.get(opId)).toMatchObject({ opType: 'UPDATE', baseVersion: 4, dependsOn: [], fields: { label: 'Mine' } });
    expect(await db.get('SELECT label FROM sync_probe WHERE id = ?', [ROW])).toEqual({ label: 'Mine' });
  });

  it('F12-AC4 (US-052) an UPDATE of a row whose CREATE is unsynced is based on version 1 and depends on that CREATE', async () => {
    const { outbox, engine, transport } = await setup();
    const record = await create(outbox, 'record');
    const opId = await update(outbox, record.id, { label: 'Renamed' });
    expect(await outbox.get(opId)).toMatchObject({ baseVersion: 1, dependsOn: [record.opId] });
    await engine.syncNow();
    // The CREATE is acknowledged before the UPDATE is sent (separate pushes).
    expect(transport.pushes.map((p) => p.ops.map((o) => o.opId))).toEqual([[record.opId], [opId]]);
    expect(transport.pushes[1]!.ops[0]).toMatchObject({ baseVersion: 1, dependsOn: [record.opId] });
  });

  it('F12 unit: two successive edits chain on the row: the second depends on the first', async () => {
    const { db, outbox, engine, transport } = await setup();
    await serverRow(db, ROW, 2);
    const first = await update(outbox, ROW, { status: 'DONE' });
    const second = await update(outbox, ROW, { label: 'Two' });
    expect(await outbox.get(first)).toMatchObject({ baseVersion: 2, dependsOn: [] });
    expect(await outbox.get(second)).toMatchObject({ baseVersion: 2, dependsOn: [first] });

    // After an unsynced CREATE: CREATE ← first ← second.
    const record = await create(outbox, 'record');
    const a = await update(outbox, record.id, { status: 'DONE' });
    const b = await update(outbox, record.id, { label: 'B' });
    expect(await outbox.get(a)).toMatchObject({ baseVersion: 1, dependsOn: [record.opId] });
    expect(await outbox.get(b)).toMatchObject({ baseVersion: 1, dependsOn: [record.opId, a] });

    transport.onPush = respond(applied(3));
    await engine.syncNow();
    const order = sentOps(transport);
    expect(order.indexOf(first)).toBeLessThan(order.indexOf(second));
    expect(order.indexOf(record.opId)).toBeLessThan(order.indexOf(a));
    expect(order.indexOf(a)).toBeLessThan(order.indexOf(b));
    expect((await outbox.list()).every((i) => i.status.state === 'SYNCED')).toBe(true);
  });

  it('F12 unit: an UPDATE of an unregistered entity, a row not on the device, or a row never acknowledged without a CREATE is refused', async () => {
    const { db, outbox } = await setup();
    await expect(db.transaction((tx) => outbox.enqueueUpdate(tx, { entity: 'sync_probe', entityId: ROW, fields: { label: 'x' } }))).rejects.toBeInstanceOf(
      OutboxValidationError,
    );
    await db.run('INSERT INTO sync_probe (id, row_version, label) VALUES (?, NULL, ?)', [ROW, 'orphan']);
    await expect(db.transaction((tx) => outbox.enqueueUpdate(tx, { entity: 'sync_probe', entityId: ROW, fields: { label: 'x' } }))).rejects.toBeInstanceOf(
      OutboxValidationError,
    );
    const unregistered = new Outbox(db, { clock: () => 0, newId: () => ROW }); // no registry
    await expect(db.transaction((tx) => unregistered.enqueueUpdate(tx, { entity: 'sync_probe', entityId: ROW, fields: {} }))).rejects.toBeInstanceOf(
      OutboxValidationError,
    );
    expect(await db.get('SELECT COUNT(*) AS n FROM outbox')).toEqual({ n: 0 });
  });
});

describe('F12 · Discard restores the server values (review N4)', () => {
  it('F12 unit (NFR-OFF-007): discarding an UPDATE with no server change kept aside re-reads the row from a fresh snapshot', async () => {
    const { db, outbox, engine, transport } = await setup();
    await serverRow(db, ROW, 2, 'Server');
    await engine.syncNow(); // the stored cursor is now c0
    const opId = await update(outbox, ROW, { label: 'Mine' });
    transport.onPush = respond((op) => ({ opId: op.opId, status: 'REJECTED', code: 'VALIDATION' }));
    await engine.syncNow();
    expect((await outbox.get(opId))!.status.state).toBe('FAILED');
    expect(await db.get('SELECT label FROM sync_probe WHERE id = ?', [ROW])).toEqual({ label: 'Mine' });

    transport.onPull = ({ cursor }) => ({
      changes: cursor === null ? [{ entity: 'sync_probe', entityId: ROW, rowVersion: 2, op: 'UPSERT', fields: { label: 'Server', status: 'OPEN', position: 1 } }] : [],
      cursor: 'c-snapshot',
      hasMore: false,
      scopeReset: false,
      serverTime: now(),
    });
    const pullsBefore = transport.pulls.length;
    await engine.discard(opId); // also triggers a run
    await engine.syncNow();
    expect(transport.pulls[pullsBefore]).toMatchObject({ cursor: null });
    expect(await db.get('SELECT label, row_version FROM sync_probe WHERE id = ?', [ROW])).toEqual({ label: 'Server', row_version: 2 });
    expect(await db.get('SELECT refetch_requested, refetch_done FROM sync_meta')).toEqual({ refetch_requested: 1, refetch_done: 1 });
    // The next pull continues from the stored cursor again.
    await engine.syncNow();
    expect(transport.pulls.at(-1)).toMatchObject({ cursor: 'c-snapshot' });
  });

  it('F12 unit: a refetch asked for while a pull is running is not lost; a server change kept aside needs no refetch', async () => {
    const { db, outbox, engine, transport } = await setup();
    await serverRow(db, ROW, 2, 'Server');
    const opId = await update(outbox, ROW, { label: 'Mine' });
    transport.onPush = respond((op) => ({ opId: op.opId, status: 'REJECTED', code: 'VALIDATION' }));
    await engine.syncNow();
    // The discard lands while the next pull is on the wire.
    let discarded = false;
    transport.onPull = async ({ cursor }) => {
      if (!discarded) {
        discarded = true;
        await engine.discard(opId);
      }
      return { changes: [], cursor: cursor === null ? 'boot' : 'c9', hasMore: false, scopeReset: false, serverTime: now() };
    };
    await engine.syncNow();
    // The pull that was running (from c0) did not count as the refetch; the run after it started from a snapshot.
    expect(transport.pulls.map((p) => p.cursor)).toEqual([null, 'c0', null]);
    expect(await db.get('SELECT refetch_requested, refetch_done FROM sync_meta')).toEqual({ refetch_requested: 1, refetch_done: 1 });

    // A server change kept aside while the edit was unsynced restores the row by itself: no refetch.
    const second = await update(outbox, ROW, { label: 'Mine again' });
    transport.onPull = ({ cursor }) => ({
      changes: [{ entity: 'sync_probe', entityId: ROW, rowVersion: 5, op: 'UPSERT', fields: { label: 'Theirs', status: 'OPEN', position: 1 } }],
      cursor: cursor ?? 'x',
      hasMore: false,
      scopeReset: false,
      serverTime: now(),
    });
    await engine.syncNow();
    expect((await outbox.get(second))!.status.state).toBe('FAILED');
    await engine.discard(second);
    expect(await db.get('SELECT label, row_version FROM sync_probe WHERE id = ?', [ROW])).toEqual({ label: 'Theirs', row_version: 5 });
    expect(await db.get('SELECT refetch_requested FROM sync_meta')).toEqual({ refetch_requested: 1 });
  });
});

describe('F12 · conflict reconciliation rotates (review N5)', () => {
  it('F12 unit: each conflict is checked at most once every 5 minutes, and those beyond the first 50 are reached', async () => {
    const { db, outbox, engine, transport, conflicts, clock } = await setup();
    const conflictOf = new Map<string, string>();
    for (let i = 0; i < 60; i++) {
      const id = `01934f5e-8a00-7000-8000-${String(300 + i).padStart(12, '0')}`;
      await serverRow(db, id, 1);
      conflictOf.set(await update(outbox, id, { status: 'DONE' }), `6a9a3bd8-73a5-4f1b-9d3b-${String(i).padStart(12, '0')}`);
    }
    transport.onPush = (req): PushResponse => ({
      results: req.ops.map((op) => ({ opId: op.opId, status: 'CONFLICT', conflictId: conflictOf.get(op.opId)! })),
      serverTime: now(),
    });
    const all = [...conflictOf.values()].sort();

    await engine.syncNow();
    expect(conflicts.calls).toHaveLength(MAX_RECONCILE);
    const firstRound = new Set(conflicts.calls);

    clock.advance(60_000);
    conflicts.calls = [];
    await engine.syncNow();
    // Only the 10 never checked; the first 50 were checked a minute ago.
    expect(conflicts.calls.sort()).toEqual(all.filter((id) => !firstRound.has(id)));

    conflicts.calls = [];
    await engine.syncNow();
    expect(conflicts.calls).toEqual([]);

    clock.advance(RECONCILE_INTERVAL_MS - 60_000);
    conflicts.calls = [];
    await engine.syncNow();
    // Least recently checked first: the first round's 50 are due again; the other 10 are not yet.
    expect(new Set(conflicts.calls)).toEqual(firstRound);

    clock.advance(60_000);
    conflicts.calls = [];
    await engine.syncNow();
    expect(conflicts.calls.sort()).toEqual(all.filter((id) => !firstRound.has(id)));
  });
});

describe('F12 · sign-out waits for the engine and blocks saves (review N6)', () => {
  it('F12-AC10 (US-053) sign-out counts only after the run in flight finished, and refuses saves meanwhile', async () => {
    const { outbox, engine, transport } = await setup();
    await create(outbox, 'record');
    let release!: () => void;
    const gate = new Promise<void>((resolve) => (release = resolve));
    let pushed!: () => void;
    const pushStarted = new Promise<void>((resolve) => (pushed = resolve));
    const defaultPush = transport.onPush;
    transport.onPush = async (req) => {
      pushed();
      await gate;
      return defaultPush(req);
    };
    const run = engine.syncNow();
    await pushStarted;

    let quiet = false;
    const quiesce = quiesceForSignOut({ engine, outbox }).then(() => (quiet = true));
    await new Promise((r) => setTimeout(r, 10));
    expect(quiet).toBe(false);
    // A save attempted while signing out is refused; nothing is written.
    await expect(create(outbox, 'too late')).rejects.toBeInstanceOf(OutboxBlockedError);

    release();
    await quiesce;
    await run;
    // The push result landed before the count: nothing unsynced, and the refused save left no trace.
    expect(await outbox.unsyncedCount()).toBe(0);
    expect(await outbox.list()).toHaveLength(1);
    // A stopped engine starts no new run.
    const pushes = transport.pushes.length;
    await engine.syncNow({ ignoreBackoff: true });
    expect(transport.pushes.length).toBe(pushes);
  });

  it('F12 unit: blocking waits for a save already in its transaction, which is then counted', async () => {
    const { outbox } = await setup();
    let release!: () => void;
    const gate = new Promise<void>((resolve) => (release = resolve));
    const id = outbox.newEntityId();
    const saving = outbox.saveWithOp(
      async (tx) => {
        await gate;
        await writeProbe(id, { label: 'in flight' })(tx);
      },
      { entity: 'sync_probe', entityId: id, opType: 'CREATE', baseVersion: null, fields: { label: 'in flight' } },
    );
    let blocked = false;
    const block = outbox.block().then(() => (blocked = true));
    await new Promise((r) => setTimeout(r, 10));
    expect(blocked).toBe(false);
    release();
    await block;
    await saving;
    expect(await outbox.unsyncedCount()).toBe(1);
    expect(outbox.isBlocked).toBe(true);
  });
});

describe('F12 · per-row order is passed to the domain (review N1)', () => {
  it('F12 unit: queue items carry their row, so a later edit of a row waits for the earlier one', async () => {
    const { db, outbox } = await setup();
    await serverRow(db, ROW, 1);
    const first = await update(outbox, ROW, { status: 'DONE' });
    const second = await update(outbox, ROW, { label: 'Two' });
    // Even without the dependency the outbox adds, the domain holds the second edit behind the first.
    await db.run("UPDATE outbox SET depends_on = '[]' WHERE op_id = ?", [second]);
    const items = await outbox.list();
    const plan = nextSendable(items.map((i) => ({ opId: i.opId, seq: i.seq, entity: i.entity, entityId: i.entityId, state: i.status.state, dependsOn: i.dependsOn })));
    expect(plan.send.map((o) => o.opId)).toEqual([first]);
    expect(plan.held).toEqual([expect.objectContaining({ reason: 'WAITING_FOR_EARLIER_EDIT', blockedBy: [first] })]);
  });
});
