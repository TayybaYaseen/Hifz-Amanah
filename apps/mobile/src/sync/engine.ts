// The sync engine (F12; NFR-OFF-003…010, FR-SYNC-006…009; ARCHITECTURE.md §8.2; plan §8).
// - Runs on: connectivity regained, app foreground, a save, a timer, and "Sync now". One run at a time; a trigger
//   during a run schedules one more run.
// - Push: PENDING operations in outbox order, batches of at most 100, dependencies first (domain `nextSendable`).
//   Each result goes through the domain `transition`; SYNCED only from APPLIED (F12-AC9).
// - Pull: from the stored cursor until hasMore = false. A pulled change never overwrites a row with unsynced local
//   changes (never last-write-wins, NFR-OFF-006); scopeReset drops synced rows and re-bootstraps (NFR-OFF-010).
// - Whole-request refusals: 401 → the session refreshes once and resumes (SessionManager.authorized), else the
//   session-expired state; 426 → stop, keep everything (F12-AC15); 403 ACCESS_REVOKED → lock the workspace
//   (F12-AC14, AC20); network, 5xx, 429 → the operations stay PENDING with backoff (F12-AC6), never discarded.
import { PROTOCOL_VERSION, SYNC_LIMITS, SyncOp, type Change, type PushRequest } from '@hifz/contracts';
import { nextSendable, transition, type OrderableOp, type QueueEvent, type QueueItemStatus } from '@hifz/domain/sync';
import { ApiFailure } from '../api/client.ts';
import type { SqlDriver, SqlExecutor } from '../local-db/driver.ts';
import type { Outbox, OutboxItem } from './outbox.ts';
import type { EntityRegistry } from './registry.ts';
import { cleanupDue, pruneSyncedQueue, purgeSynced, runRetention } from './retention.ts';
import type { SyncTransport } from './transport.ts';
import { lockWorkspace, readMeta } from './workspace.ts';

export type SyncOutcome =
  /** Everything that could be sent was sent and the pull finished. */
  | 'OK'
  /** No connection: operations stay PENDING. */
  | 'OFFLINE'
  /** A temporary server error: operations stay PENDING with backoff. */
  | 'RETRY_LATER'
  | 'SESSION_EXPIRED'
  | 'UPGRADE_REQUIRED'
  | 'ACCESS_REVOKED';

export type SyncTrigger = 'connectivity' | 'foreground' | 'save' | 'timer' | 'manual' | 'start';

export interface EngineSnapshot {
  running: boolean;
  online: boolean;
  lastOutcome: SyncOutcome | null;
}

export interface EngineDeps {
  db: SqlDriver;
  outbox: Outbox;
  registry: EntityRegistry;
  transport: SyncTransport;
  deviceId: string;
  clock: () => number;
  /** In [0, 1); backoff jitter. */
  random: () => number;
  /** The protocol version this build speaks (overridable in tests). */
  protocolVersion?: number;
  /** Called once when a 403 ACCESS_REVOKED locked the workspace. */
  onAccessRevoked?: () => void;
}

export class DiscardNotAllowedError extends Error {
  readonly dependents: number;
  constructor(message: string, dependents = 0) {
    super(message);
    this.name = 'DiscardNotAllowedError';
    this.dependents = dependents;
  }
}

/** Without a run in this long, the timer pulls even when nothing is queued. */
export const PULL_INTERVAL_MS = 5 * 60_000;

const toOrderable = (item: OutboxItem): OrderableOp => ({
  opId: item.opId,
  seq: item.seq,
  state: item.status.state,
  dependsOn: item.dependsOn,
  nextAttemptAt: item.status.nextAttemptAt,
});

function failureOf(err: unknown): { kind: SyncOutcome; code: string } {
  if (err instanceof ApiFailure) {
    if (err.code === 'ACCESS_REVOKED') return { kind: 'ACCESS_REVOKED', code: err.code };
    if (err.status === 426 || err.code === 'UPGRADE_REQUIRED') return { kind: 'UPGRADE_REQUIRED', code: 'UPGRADE_REQUIRED' };
    if (err.status === 401 || err.code === 'SESSION_EXPIRED') return { kind: 'SESSION_EXPIRED', code: 'SESSION_EXPIRED' };
    if (err.code === 'NETWORK') return { kind: 'OFFLINE', code: 'NETWORK' };
    return { kind: 'RETRY_LATER', code: err.code };
  }
  return { kind: 'RETRY_LATER', code: 'INTERNAL' };
}

export class SyncEngine {
  private readonly d: EngineDeps;
  private readonly protocolVersion: number;
  private current: Promise<SyncOutcome> | null = null;
  private again: { ignoreBackoff: boolean } | null = null;
  private snapshot: EngineSnapshot = { running: false, online: true, lastOutcome: null };
  private lastRunAt = 0;
  private readonly listeners = new Set<(s: EngineSnapshot) => void>();
  private stopped = false;

  constructor(deps: EngineDeps) {
    this.d = deps;
    this.protocolVersion = deps.protocolVersion ?? PROTOCOL_VERSION;
  }

  get state(): EngineSnapshot {
    return this.snapshot;
  }

  subscribe(listener: (s: EngineSnapshot) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private update(patch: Partial<EngineSnapshot>): void {
    this.snapshot = { ...this.snapshot, ...patch };
    for (const listener of this.listeners) listener(this.snapshot);
  }

  private ctx() {
    return { nowMs: this.d.clock(), random: this.d.random };
  }

  private nowIso(): string {
    return new Date(this.d.clock()).toISOString();
  }

  /**
   * On app start: an operation left SYNCING by a killed app goes back to PENDING (the server's op_id
   * idempotency makes resending it safe, F12-AC5); a new app version gets a fresh try after "upgrade required";
   * and the daily cleanup runs.
   */
  async start(): Promise<void> {
    const items = await this.d.outbox.list();
    await this.d.db.transaction(async (tx) => {
      for (const item of items) {
        if (item.status.state === 'SYNCING') await this.apply(tx, item, { type: 'INTERRUPTED' });
      }
      const meta = await readMeta(tx);
      if (meta.upgradeRequiredAt) await tx.run('UPDATE sync_meta SET upgrade_required_at = NULL WHERE id = 1');
      if (meta.protocolVersion !== this.protocolVersion) {
        await tx.run('UPDATE sync_meta SET protocol_version = ? WHERE id = 1', [this.protocolVersion]);
      }
    });
    await this.cleanupIfDue();
    this.d.outbox.notify();
  }

  /** F12-AC19 / Q16: daily removal of synced rows past retention and of synced queue items older than 24 hours. */
  async cleanupIfDue(force = false): Promise<boolean> {
    const meta = await readMeta(this.d.db);
    const now = this.d.clock();
    if (!force && !cleanupDue(meta.lastCleanupAt, now)) return false;
    await this.d.db.transaction(async (tx) => {
      await runRetention(tx, this.d.registry, now);
      await pruneSyncedQueue(tx, now);
    });
    this.d.outbox.notify();
    return true;
  }

  stop(): void {
    this.stopped = true;
  }

  /** Connectivity from NetInfo. Regaining it triggers a run. */
  setOnline(online: boolean): void {
    const regained = online && !this.snapshot.online;
    this.update({ online });
    if (regained) this.requestSync('connectivity');
  }

  /** Fire-and-forget trigger. Ignored while offline (except manual), after stop, and while blocked. */
  requestSync(trigger: SyncTrigger): void {
    if (this.stopped) return;
    if (!this.snapshot.online && trigger !== 'manual') return;
    void this.syncNow({ ignoreBackoff: trigger === 'manual' }).catch(() => undefined);
  }

  /** Timer tick: runs if an operation is due, or if nothing ran for a while (to pull others' changes). */
  async tick(): Promise<void> {
    if (this.stopped || !this.snapshot.online) return;
    const now = this.d.clock();
    const items = await this.d.outbox.list();
    const due = nextSendable(items.map(toOrderable), { nowMs: now, limit: 1 }).send.length > 0;
    if (due || now - this.lastRunAt >= PULL_INTERVAL_MS) this.requestSync('timer');
  }

  /** One sync run (push then pull). Concurrent calls share the run; a call during a run schedules one more. */
  syncNow(options: { ignoreBackoff?: boolean } = {}): Promise<SyncOutcome> {
    const ignoreBackoff = options.ignoreBackoff ?? false;
    if (this.current) {
      this.again = { ignoreBackoff: ignoreBackoff || (this.again?.ignoreBackoff ?? false) };
      return this.current;
    }
    const run = (async () => {
      this.update({ running: true });
      let outcome: SyncOutcome;
      let next: { ignoreBackoff: boolean } | null = { ignoreBackoff };
      try {
        do {
          this.again = null;
          outcome = await this.runOnce(next.ignoreBackoff);
          next = this.again;
        } while (next && outcome === 'OK' && !this.stopped);
      } finally {
        this.lastRunAt = this.d.clock();
        this.current = null;
      }
      this.update({ running: false, lastOutcome: outcome });
      this.d.outbox.notify();
      return outcome;
    })();
    this.current = run;
    return run.catch((err: unknown) => {
      this.update({ running: false });
      throw err;
    });
  }

  private async runOnce(ignoreBackoff: boolean): Promise<SyncOutcome> {
    const meta = await readMeta(this.d.db);
    if (meta.workspaceState === 'LOCKED_REVOKED') return 'ACCESS_REVOKED';
    // F12-AC15: after "upgrade required" only an explicit request (or the next app start) asks the server again.
    if (meta.upgradeRequiredAt && !ignoreBackoff) return 'UPGRADE_REQUIRED';
    const pushed = await this.pushAll(ignoreBackoff);
    if (pushed !== 'OK') return pushed;
    const pulled = await this.pullAll();
    if (pulled !== 'OK') return pulled;
    await this.d.db.run('UPDATE sync_meta SET last_success_at = ?, upgrade_required_at = NULL WHERE id = 1', [this.nowIso()]);
    return 'OK';
  }

  /** Applies one domain transition and persists it (inside the caller's transaction). */
  private async apply(tx: SqlExecutor, item: OutboxItem, event: QueueEvent, extra: { lastError?: string | null } = {}): Promise<QueueItemStatus> {
    const next = transition(item.status, event, this.ctx());
    await this.d.outbox.writeStatus(tx, item.opId, next, {
      ...extra,
      ...(next.state === 'SYNCED' ? { syncedAt: this.nowIso() } : {}),
    });
    return next;
  }

  private async pushAll(ignoreBackoff: boolean): Promise<SyncOutcome> {
    const attempted = new Set<string>();
    for (;;) {
      if (this.stopped) return 'OK';
      const items = await this.d.outbox.list();
      const plan = nextSendable(items.map(toOrderable), ignoreBackoff ? {} : { nowMs: this.d.clock() });
      const byId = new Map(items.map((i) => [i.opId, i]));
      const batch = plan.send
        .filter((op) => !attempted.has(op.opId))
        .slice(0, SYNC_LIMITS.maxPushOps)
        .map((op) => byId.get(op.opId)!);
      if (batch.length === 0) return 'OK';
      for (const item of batch) attempted.add(item.opId);

      // Mark SYNCING; an operation discarded or changed since it was read is skipped. Operations this build
      // cannot express in the protocol are failed locally with VALIDATION instead of being sent.
      const sending: OutboxItem[] = [];
      const ops: PushRequest['ops'] = [];
      await this.d.db.transaction(async (tx) => {
        for (const item of batch) {
          const fresh = await this.d.outbox.get(item.opId, tx);
          if (!fresh || fresh.status.state !== 'PENDING') continue;
          const op = {
            opId: fresh.opId,
            seq: fresh.seq,
            entity: fresh.entity,
            entityId: fresh.entityId,
            opType: fresh.opType,
            ...(fresh.command ? { command: fresh.command } : {}),
            baseVersion: fresh.baseVersion,
            fields: fresh.fields,
            dependsOn: fresh.dependsOn,
            clientSavedAt: fresh.createdAt,
          };
          const syncing = { ...fresh, status: await this.apply(tx, fresh, { type: 'SEND' }) };
          const parsed = SyncOp.safeParse(op);
          if (!parsed.success) {
            await this.apply(tx, syncing, { type: 'RESULT', result: { status: 'REJECTED', code: 'VALIDATION' } });
            continue;
          }
          sending.push(syncing);
          ops.push(parsed.data);
        }
      });
      this.d.outbox.notify();
      if (sending.length === 0) continue;

      let response;
      try {
        response = await this.d.transport.push({ protocolVersion: this.protocolVersion, deviceId: this.d.deviceId, ops });
      } catch (err) {
        return this.failRequest(err, sending);
      }

      const results = new Map(response.results.map((r) => [r.opId, r]));
      await this.d.db.transaction(async (tx) => {
        for (const item of sending) {
          const result = results.get(item.opId);
          if (!result) {
            // No answer for this operation: not its fault; it is sent again in a later run.
            await this.apply(tx, item, { type: 'INTERRUPTED' });
            continue;
          }
          switch (result.status) {
            case 'APPLIED': {
              await this.apply(tx, item, { type: 'RESULT', result: { status: 'APPLIED', rowVersion: result.rowVersion } }, { lastError: null });
              const handler = this.d.registry.get(item.entity);
              if (handler) {
                await tx.run(
                  `UPDATE ${handler.table} SET row_version = ? WHERE id = ? AND (row_version IS NULL OR row_version < ?)`,
                  [result.rowVersion, item.entityId, result.rowVersion],
                );
              }
              break;
            }
            case 'CONFLICT':
              await this.apply(tx, item, { type: 'RESULT', result: { status: 'CONFLICT', conflictId: result.conflictId } }, { lastError: null });
              await tx.run(
                `INSERT OR REPLACE INTO conflicts (conflict_id, op_id, entity, entity_id, status, label, created_at)
                 VALUES (?, ?, ?, ?, 'OPEN', ?, ?)`,
                [result.conflictId, item.opId, item.entity, item.entityId, item.label, this.nowIso()],
              );
              break;
            case 'REJECTED':
              await this.apply(tx, item, {
                type: 'RESULT',
                result: result.fields ? { status: 'REJECTED', code: result.code, fields: result.fields } : { status: 'REJECTED', code: result.code },
              });
              break;
            case 'RETRY':
              await this.apply(tx, item, { type: 'RESULT', result: { status: 'RETRY', code: result.code } }, { lastError: result.code });
              break;
          }
        }
      });
      this.d.outbox.notify();
    }
  }

  /** A whole push request failed: every operation in it goes back to PENDING, with or without backoff. */
  private async failRequest(err: unknown, sending: OutboxItem[]): Promise<SyncOutcome> {
    const failure = failureOf(err);
    const temporary = failure.kind === 'OFFLINE' || failure.kind === 'RETRY_LATER';
    await this.d.db.transaction(async (tx) => {
      for (const item of sending) {
        if (temporary) await this.apply(tx, item, { type: 'TRANSPORT_ERROR', code: failure.code }, { lastError: failure.code });
        else await this.apply(tx, item, { type: 'INTERRUPTED' });
      }
    });
    return this.onBlocked(failure.kind);
  }

  private async onBlocked(kind: SyncOutcome): Promise<SyncOutcome> {
    if (kind === 'ACCESS_REVOKED') {
      await lockWorkspace(this.d.db, this.d.registry, this.d.clock());
      this.d.onAccessRevoked?.();
    } else if (kind === 'UPGRADE_REQUIRED') {
      await this.d.db.run('UPDATE sync_meta SET upgrade_required_at = ? WHERE id = 1', [this.nowIso()]);
    }
    this.d.outbox.notify();
    return kind;
  }

  private async pullAll(): Promise<SyncOutcome> {
    let cursor = (await readMeta(this.d.db)).lastPullCursor;
    let rebootstrapped = false;
    for (let page = 0; page < 10_000; page++) {
      if (this.stopped) return 'OK';
      let response;
      try {
        response = await this.d.transport.pull({ cursor, limit: SYNC_LIMITS.maxPullLimit, protocolVersion: this.protocolVersion });
      } catch (err) {
        return this.onBlocked(failureOf(err).kind);
      }
      if (response.scopeReset && cursor !== null && !rebootstrapped) {
        // NFR-OFF-010, plan Q8: the scope changed. Drop every synced row and start again from a snapshot of the
        // new scope. Rows with unsynced changes stay; the server answers NOT_FOUND if they are now out of scope.
        await this.d.db.transaction((tx) => purgeSynced(tx, this.d.registry, { keepQueueHistory: true }));
        cursor = null;
        rebootstrapped = true;
        continue;
      }
      const changes = response.changes;
      const nextCursor = response.cursor;
      await this.d.db.transaction(async (tx) => {
        for (const change of changes) await this.applyChange(tx, change);
        await tx.run('UPDATE sync_meta SET last_pull_cursor = ? WHERE id = 1', [nextCursor]);
      });
      cursor = nextCursor;
      if (!response.hasMore) return 'OK';
    }
    return 'OK';
  }

  private async applyChange(tx: SqlExecutor, change: Change): Promise<void> {
    const handler = this.d.registry.get(change.entity);
    if (!handler) return; // an entity this build does not store
    const unsynced = await tx.get(
      "SELECT 1 AS x FROM outbox WHERE entity = ? AND entity_id = ? AND state != 'SYNCED' LIMIT 1",
      [change.entity, change.entityId],
    );
    // Never overwrite or drop a row with unsynced local changes (NFR-OFF-006). The server's version reaches the
    // device after those changes are applied or their conflict is resolved.
    if (unsynced) return;
    if (change.op === 'REMOVE_FROM_DEVICE') {
      await tx.run(`DELETE FROM ${handler.table} WHERE id = ?`, [change.entityId]);
      return;
    }
    const local = await tx.get<{ row_version: number | null }>(`SELECT row_version FROM ${handler.table} WHERE id = ?`, [change.entityId]);
    if (local?.row_version != null && Number(local.row_version) >= change.rowVersion) return;
    await handler.upsertFromServer(tx, change.entityId, change.rowVersion, change.fields ?? {});
  }

  /** The user taps Retry on a FAILED item. */
  async retry(opId: string): Promise<void> {
    await this.d.db.transaction(async (tx) => {
      const item = await this.d.outbox.get(opId, tx);
      if (!item || item.status.state !== 'FAILED') return;
      await this.apply(tx, item, { type: 'RETRY' });
    });
    this.d.outbox.notify();
    this.requestSync('manual');
  }

  /**
   * Discards an unsynced change after the user confirmed it (NFR-OFF-007). Only PENDING or FAILED items; never
   * while other unsynced items depend on it. The discard is recorded locally in `discards`.
   */
  async discard(opId: string): Promise<void> {
    await this.d.db.transaction(async (tx) => {
      const item = await this.d.outbox.get(opId, tx);
      if (!item) return;
      if (item.status.state !== 'PENDING' && item.status.state !== 'FAILED') {
        throw new DiscardNotAllowedError(`Cannot discard an item that is ${item.status.state}`);
      }
      const dependents = await this.d.outbox.dependents(opId, tx);
      if (dependents.length > 0) throw new DiscardNotAllowedError('Other changes depend on this one', dependents.length);
      await tx.run(
        `INSERT INTO discards (op_id, entity, entity_id, op_type, label, failure_code, created_at, discarded_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [item.opId, item.entity, item.entityId, item.opType, item.label, item.status.failure?.code ?? null, item.createdAt, this.nowIso()],
      );
      await this.d.registry.get(item.entity)?.onDiscard?.(tx, { entityId: item.entityId, opType: item.opType });
      await tx.run('DELETE FROM outbox WHERE op_id = ?', [opId]);
    });
    this.d.outbox.notify();
  }

  /** The server confirmed a conflict was resolved (POST /sync/conflicts/:id/resolve → 200). */
  async conflictResolved(conflictId: string, rowVersion: number): Promise<void> {
    const items = await this.d.outbox.list();
    await this.d.db.transaction(async (tx) => {
      for (const item of items) {
        if (item.status.state === 'ACTION_REQUIRED' && item.status.conflictId === conflictId) {
          await this.apply(tx, item, { type: 'CONFLICT_RESOLVED', rowVersion });
        }
      }
      await tx.run("UPDATE conflicts SET status = 'RESOLVED', resolved_at = ? WHERE conflict_id = ?", [this.nowIso(), conflictId]);
    });
    this.d.outbox.notify();
    this.requestSync('manual');
  }
}
