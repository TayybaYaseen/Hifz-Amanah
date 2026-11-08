// The outbox (F12; NFR-OFF-002…007, FR-SYNC-006/007; ARCHITECTURE.md §8.1).
// - saveWithOp writes the entity and queues its operation in ONE SQLite transaction. The UI may say
//   "Saved on this device — waiting to sync" only after it resolves (F12-AC1); if either write fails, neither is kept.
// - Every operation gets a client UUIDv7 op_id; offline-created records get a client UUIDv7 entity ID that is never
//   rewritten (F12-AC3). `seq` is a monotonic outbox counter; device time is never used for ordering (F12-AC4).
// - Queue states follow the domain state machine (@hifz/domain/sync `transition`); SYNCED only from an APPLIED
//   result or a resolved conflict (F12-AC9). Nothing is discarded automatically (NFR-OFF-007).
// - Edits of an existing row go through `enqueueUpdate` / `saveWithUpdate` (review N3), which derive the base
//   version and the per-row dependencies. F04/F05/F08 must use them; a raw `enqueue` of an UPDATE is for the engine
//   (Retry keeps the original operation) and tests only.
import { RESERVED_FIELD_KEYS, type SyncEntity, type SyncOpType } from '@hifz/contracts';
import { initialQueueStatus, isHeldByOpenConflict, isUuidV7, type QueueItemStatus, type QueueState } from '@hifz/domain/sync';
import type { SqlDriver, SqlExecutor } from '../local-db/driver.ts';
import type { EntityRegistry } from './registry.ts';

export interface NewOp {
  entity: SyncEntity;
  entityId: string;
  opType: SyncOpType;
  command?: string;
  /** Server row version the change is based on; null for CREATE. */
  baseVersion: number | null;
  fields: Readonly<Record<string, unknown>>;
  /** Op IDs this operation depends on (e.g. a portion's CREATE depends on its daily record's CREATE). */
  dependsOn?: readonly string[];
  /** Safe display label for the Sync Queue (no note bodies). */
  label?: string | null;
}

/**
 * An UPDATE whose base version and dependencies the outbox derives from the row (review N3). F04/F05/F08 queue every
 * UPDATE through `enqueueUpdate` / `saveWithUpdate`, never by building `baseVersion` themselves.
 */
export interface NewUpdate {
  entity: SyncEntity;
  entityId: string;
  fields: Readonly<Record<string, unknown>>;
  /** Further op IDs this change depends on (the row's own CREATE and previous change are added automatically). */
  dependsOn?: readonly string[];
  /** Safe display label for the Sync Queue (no note bodies). */
  label?: string | null;
}

export interface OutboxItem {
  opId: string;
  seq: number;
  entity: SyncEntity;
  entityId: string;
  opType: SyncOpType;
  command: string | null;
  fields: Record<string, unknown>;
  baseVersion: number | null;
  dependsOn: string[];
  label: string | null;
  /** When it was saved on this device (display only; never used for ordering). */
  createdAt: string;
  syncedAt: string | null;
  /** Last temporary error code (network, 5xx), shown while the item waits to retry. */
  lastError: string | null;
  /**
   * How many times the operation was put in a push request. 0 = never sent; null = queued before this was tracked
   * (treated as possibly sent).
   */
  sentCount: number | null;
  status: QueueItemStatus;
}

interface OutboxRow {
  op_id: string;
  seq: number;
  entity: string;
  entity_id: string;
  op_type: string;
  command: string | null;
  payload: string;
  base_version: number | null;
  depends_on: string;
  state: string;
  attempts: number;
  last_error: string | null;
  next_attempt_at: number | null;
  failure_code: string | null;
  failure_fields: string | null;
  row_version: number | null;
  conflict_id: string | null;
  label: string | null;
  created_at: string;
  synced_at: string | null;
  sent_count: number | null;
}

export class OutboxValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'OutboxValidationError';
  }
}

/** Saves are refused while the account signs out (review N6): nothing may land between the count and the purge. */
export class OutboxBlockedError extends Error {
  constructor() {
    super('Saving is not possible while signing out');
    this.name = 'OutboxBlockedError';
  }
}

export interface OutboxDeps {
  /** Milliseconds since epoch. */
  clock: () => number;
  /** A new UUIDv7 (sync/ids.ts). */
  newId: () => string;
  /** Registered entities; `enqueueUpdate` reads a row's acknowledged version through them. */
  registry?: Pick<EntityRegistry, 'get'>;
}

export const UNSYNCED_STATES: readonly QueueState[] = ['PENDING', 'SYNCING', 'FAILED', 'ACTION_REQUIRED'];

function toItem(row: OutboxRow): OutboxItem {
  return {
    opId: row.op_id,
    seq: Number(row.seq),
    entity: row.entity as SyncEntity,
    entityId: row.entity_id,
    opType: row.op_type as SyncOpType,
    command: row.command,
    fields: JSON.parse(row.payload) as Record<string, unknown>,
    baseVersion: row.base_version === null ? null : Number(row.base_version),
    dependsOn: JSON.parse(row.depends_on) as string[],
    label: row.label,
    createdAt: row.created_at,
    syncedAt: row.synced_at,
    lastError: row.last_error,
    sentCount: row.sent_count === null || row.sent_count === undefined ? null : Number(row.sent_count),
    status: {
      state: row.state as QueueState,
      attempts: Number(row.attempts),
      nextAttemptAt: row.next_attempt_at === null ? null : Number(row.next_attempt_at),
      failure:
        row.failure_code === null
          ? null
          : row.failure_fields === null
            ? { code: row.failure_code }
            : { code: row.failure_code, fields: JSON.parse(row.failure_fields) as Record<string, string> },
      rowVersion: row.row_version === null ? null : Number(row.row_version),
      conflictId: row.conflict_id,
    },
  };
}

function validate(op: NewOp): void {
  if (!isUuidV7(op.entityId)) throw new OutboxValidationError('entityId must be a client UUIDv7');
  if (op.opType === 'CREATE' && op.baseVersion !== null) throw new OutboxValidationError('CREATE has no base version');
  if (op.opType === 'UPDATE' && op.baseVersion === null) throw new OutboxValidationError('UPDATE needs a base version');
  if ((op.opType === 'COMMAND') !== (op.command !== undefined)) throw new OutboxValidationError('command is for COMMAND only');
  for (const key of RESERVED_FIELD_KEYS) {
    // Tenant, role, visibility, and versions come from the server only (AGENTS.md §6).
    if (Object.hasOwn(op.fields, key)) throw new OutboxValidationError(`field "${key}" is not allowed`);
  }
  for (const dep of op.dependsOn ?? []) if (!isUuidV7(dep)) throw new OutboxValidationError('dependsOn must hold op IDs');
}

/**
 * Discard is offered only where the server has certainly not applied the change (review M5, NFR-OFF-007):
 * - never sent (PENDING, sent count 0);
 * - FAILED: the server rejected it (stored as REJECTED, never applied), it failed on the device before sending,
 *   or its conflict is no longer reachable;
 * - held behind another operation's open conflict (RETRY CONFLICT_OPEN is never applied).
 * A PENDING operation that was sent before (a timeout, a lost response, an app killed while sending) may already
 * be applied on the server, so discarding it could leave the phone and the server disagreeing; it syncs first.
 */
export function discardable(item: Pick<OutboxItem, 'status' | 'sentCount'>): boolean {
  if (item.status.state === 'FAILED') return true;
  if (isHeldByOpenConflict(item.status)) return true;
  return item.status.state === 'PENDING' && item.sentCount === 0;
}

export class Outbox {
  private readonly db: SqlDriver;
  private readonly deps: OutboxDeps;
  private readonly listeners = new Set<() => void>();
  private readonly savedListeners = new Set<() => void>();
  private blocked = false;
  private readonly inFlight = new Set<Promise<unknown>>();

  constructor(db: SqlDriver, deps: OutboxDeps) {
    this.db = db;
    this.deps = deps;
  }

  /** Called after every committed change to the outbox (save, state change, discard). */
  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /** Called after a save committed (the engine's "a save" trigger). */
  subscribeSaved(listener: () => void): () => void {
    this.savedListeners.add(listener);
    return () => this.savedListeners.delete(listener);
  }

  notify(): void {
    for (const listener of this.listeners) listener();
  }

  /** A new client UUIDv7, for an offline-created record's ID (F12-AC3). */
  newEntityId(): string {
    return this.deps.newId();
  }

  /** Queues an operation inside the caller's transaction. Returns the op ID and its outbox sequence. */
  async enqueue(tx: SqlExecutor, op: NewOp): Promise<{ opId: string; seq: number }> {
    validate(op);
    const meta = await tx.get<{ next_seq: number }>('SELECT next_seq FROM sync_meta WHERE id = 1');
    if (!meta) throw new Error('sync_meta is missing; run the migrations first');
    const seq = Number(meta.next_seq);
    await tx.run('UPDATE sync_meta SET next_seq = ? WHERE id = 1', [seq + 1]);
    const opId = await this.insert(tx, op, seq, new Date(this.deps.clock()).toISOString());
    return { opId, seq };
  }

  private async insert(tx: SqlExecutor, op: NewOp, seq: number, createdAt: string): Promise<string> {
    const opId = this.deps.newId();
    const status = initialQueueStatus();
    await tx.run(
      `INSERT INTO outbox (op_id, seq, entity, entity_id, op_type, command, payload, base_version, depends_on, state,
                           attempts, label, created_at, sent_count)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)`,
      [
        opId,
        seq,
        op.entity,
        op.entityId,
        op.opType,
        op.command ?? null,
        JSON.stringify(op.fields),
        op.baseVersion,
        JSON.stringify(op.dependsOn ?? []),
        status.state,
        status.attempts,
        op.label ?? null,
        createdAt,
      ],
    );
    return opId;
  }

  /**
   * Retry (review M1, N2): replaces `item` with the same change under a NEW op_id but the ORIGINAL seq and save
   * time, inside the caller's transaction. Keeping the seq keeps the change in its place among this device's
   * changes of the row, so it is never sent after a newer edit made on this device. The old row is deleted first
   * (seq is unique). The caller re-points dependents and records the old op_id.
   */
  async requeue(tx: SqlExecutor, item: OutboxItem): Promise<string> {
    const op: NewOp = {
      entity: item.entity,
      entityId: item.entityId,
      opType: item.opType,
      ...(item.command ? { command: item.command } : {}),
      baseVersion: item.baseVersion,
      fields: item.fields,
      dependsOn: item.dependsOn,
      label: item.label,
    };
    validate(op);
    await tx.run('DELETE FROM outbox WHERE op_id = ?', [item.opId]);
    return this.insert(tx, op, item.seq, item.createdAt);
  }

  /**
   * Queues an UPDATE of a row on this device, deriving what the server needs (review N3):
   * - the row was acknowledged by the server (`row_version` set): base version = that version;
   * - the row was created on this device and its CREATE is not synced yet: base version 1 (the version a CREATE
   *   gets) and a dependency on that CREATE;
   * - in both cases a dependency on the row's latest unsynced operation, so this device's changes of one row go
   *   out strictly in order (belt-and-braces with the domain's per-row ordering).
   * Throws OutboxValidationError if the entity is not registered or the row is not on the device.
   */
  async enqueueUpdate(tx: SqlExecutor, update: NewUpdate): Promise<{ opId: string; seq: number }> {
    const handler = this.deps.registry?.get(update.entity);
    if (!handler) throw new OutboxValidationError(`entity "${update.entity}" is not registered`);
    const row = await tx.get<{ row_version: number | null }>(`SELECT row_version FROM ${handler.table} WHERE id = ?`, [update.entityId]);
    if (!row) throw new OutboxValidationError('the row is not on this device');
    const unsynced = await this.unsyncedForRow(update.entity, update.entityId, tx);
    const dependsOn = new Set(update.dependsOn ?? []);
    let baseVersion: number;
    if (row.row_version !== null && row.row_version !== undefined) {
      baseVersion = Number(row.row_version);
    } else {
      const create = unsynced.find((i) => i.opType === 'CREATE');
      if (!create) throw new OutboxValidationError('the row was never acknowledged and has no queued CREATE');
      baseVersion = 1;
      dependsOn.add(create.opId);
    }
    const previous = unsynced.at(-1);
    if (previous) dependsOn.add(previous.opId);
    return this.enqueue(tx, {
      entity: update.entity,
      entityId: update.entityId,
      opType: 'UPDATE',
      baseVersion,
      fields: update.fields,
      dependsOn: [...dependsOn],
      label: update.label ?? null,
    });
  }

  /** F12-AC1 for an edit: writes the row and queues its derived UPDATE (`enqueueUpdate`) in one transaction. */
  async saveWithUpdate<T>(
    entityWrite: (tx: SqlExecutor) => Promise<T>,
    update: NewUpdate | ((result: T) => NewUpdate),
  ): Promise<{ result: T; opIds: string[] }> {
    return this.saving(async (tx) => {
      const result = await entityWrite(tx);
      const { opId } = await this.enqueueUpdate(tx, typeof update === 'function' ? update(result) : update);
      return { result, opIds: [opId] };
    });
  }

  /**
   * Review N6: refuses every new save from now on (OutboxBlockedError) and resolves once the saves already running
   * have committed or failed. Sign-out calls it before it counts and purges.
   */
  async block(): Promise<void> {
    this.blocked = true;
    await Promise.allSettled([...this.inFlight]);
  }

  get isBlocked(): boolean {
    return this.blocked;
  }

  private async saving<R>(work: (tx: SqlExecutor) => Promise<R>): Promise<R> {
    if (this.blocked) throw new OutboxBlockedError();
    const run = this.db.transaction(work);
    this.inFlight.add(run);
    try {
      const saved = await run;
      this.notify();
      for (const listener of this.savedListeners) listener();
      return saved;
    } finally {
      this.inFlight.delete(run);
    }
  }

  /**
   * F12-AC1: writes the entity and queues its operation(s) in one transaction. `entityWrite` gets the transaction;
   * `ops` may depend on what it returned. If anything throws, nothing is kept.
   */
  async saveWithOp<T>(
    entityWrite: (tx: SqlExecutor) => Promise<T>,
    ops: NewOp | readonly NewOp[] | ((result: T) => NewOp | readonly NewOp[]),
  ): Promise<{ result: T; opIds: string[] }> {
    return this.saving(async (tx) => {
      const result = await entityWrite(tx);
      const resolved = typeof ops === 'function' ? ops(result) : ops;
      const list: readonly NewOp[] = Array.isArray(resolved) ? resolved : [resolved as NewOp];
      const opIds: string[] = [];
      for (const op of list) opIds.push((await this.enqueue(tx, op)).opId);
      return { result, opIds };
    });
  }

  async list(executor: SqlExecutor = this.db): Promise<OutboxItem[]> {
    const rows = await executor.all<OutboxRow>('SELECT * FROM outbox ORDER BY seq');
    return rows.map(toItem);
  }

  async get(opId: string, executor: SqlExecutor = this.db): Promise<OutboxItem | null> {
    const row = await executor.get<OutboxRow>('SELECT * FROM outbox WHERE op_id = ?', [opId]);
    return row ? toItem(row) : null;
  }

  /** Items not yet acknowledged by the server: PENDING, SYNCING, FAILED, ACTION_REQUIRED. */
  async unsyncedCount(executor: SqlExecutor = this.db): Promise<number> {
    const row = await executor.get<{ n: number }>("SELECT COUNT(*) AS n FROM outbox WHERE state != 'SYNCED'");
    return Number(row?.n ?? 0);
  }

  async counts(executor: SqlExecutor = this.db): Promise<Record<QueueState, number>> {
    const rows = await executor.all<{ state: QueueState; n: number }>('SELECT state, COUNT(*) AS n FROM outbox GROUP BY state');
    const counts: Record<QueueState, number> = { PENDING: 0, SYNCING: 0, SYNCED: 0, FAILED: 0, ACTION_REQUIRED: 0 };
    for (const row of rows) counts[row.state] = Number(row.n);
    return counts;
  }

  /** Persists a new queue status (from the domain `transition`) inside the caller's transaction. */
  async writeStatus(tx: SqlExecutor, opId: string, status: QueueItemStatus, extra: { lastError?: string | null; syncedAt?: string | null } = {}): Promise<void> {
    const sets = [
      'state = ?',
      'attempts = ?',
      'next_attempt_at = ?',
      'failure_code = ?',
      'failure_fields = ?',
      'row_version = ?',
      'conflict_id = ?',
    ];
    const params: (string | number | null)[] = [
      status.state,
      status.attempts,
      status.nextAttemptAt,
      status.failure?.code ?? null,
      status.failure?.fields ? JSON.stringify(status.failure.fields) : null,
      status.rowVersion,
      status.conflictId,
    ];
    if (extra.lastError !== undefined) {
      sets.push('last_error = ?');
      params.push(extra.lastError);
    }
    if (extra.syncedAt !== undefined) {
      sets.push('synced_at = ?');
      params.push(extra.syncedAt);
    }
    params.push(opId);
    await tx.run(`UPDATE outbox SET ${sets.join(', ')} WHERE op_id = ?`, params);
  }

  /** Counts one more send of the operation (it is in a push request). */
  async markSent(tx: SqlExecutor, opId: string): Promise<void> {
    await tx.run('UPDATE outbox SET sent_count = COALESCE(sent_count, 0) + 1 WHERE op_id = ?', [opId]);
  }

  /** Unsynced operations on one record, in outbox order. */
  async unsyncedForRow(entity: string, entityId: string, executor: SqlExecutor = this.db): Promise<OutboxItem[]> {
    const rows = await executor.all<OutboxRow>("SELECT * FROM outbox WHERE entity = ? AND entity_id = ? AND state != 'SYNCED' ORDER BY seq", [entity, entityId]);
    return rows.map(toItem);
  }

  /** Unsynced operations that depend on `opId` (Discard is blocked while any exist). */
  async dependents(opId: string, executor: SqlExecutor = this.db): Promise<OutboxItem[]> {
    const items = await this.list(executor);
    return items.filter((item) => item.status.state !== 'SYNCED' && item.dependsOn.includes(opId));
  }
}
