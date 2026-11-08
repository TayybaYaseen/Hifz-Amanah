// The sync engine (F12; NFR-OFF-003…010, FR-SYNC-006…009; ARCHITECTURE.md §8.2; plan §8).
// - Runs on: connectivity regained, app foreground, a save, a timer, and "Sync now". One run at a time; a trigger
//   during a run schedules one more run.
// - Push: PENDING operations in outbox order, batches of at most 100, dependencies first (domain `nextSendable`).
//   Each result goes through the domain `transition`; SYNCED only from APPLIED, or from the server confirming the
//   item's own conflict was resolved (F12-AC9).
// - An UPDATE on a row with an open conflict comes back RETRY CONFLICT_OPEN (decision Q7): the item is held as
//   action required (no conflict of its own, no backoff) and is sent again (CONFLICT_CLEARED) once that conflict is
//   no longer open: this device resolved it, reconciliation found it resolved, an operation on the row was applied,
//   or a pull brought a newer server version of the row.
// - Pull: from the stored cursor until hasMore = false. A pulled change never overwrites a row with unsynced local
//   changes (never last-write-wins, NFR-OFF-006); it is kept in `deferred_changes` and applied once the row has no
//   unsynced operation left. A change at the row's own version is applied again (review H1): after APPLIED the
//   server may hold different values at that version (a safe merge kept its display order, or other users' fields
//   were merged), and the server's version is the truth. scopeReset drops synced rows and re-bootstraps
//   (NFR-OFF-010).
// - After the pull, the device's own open conflicts are checked with the server (review H2): resolved elsewhere →
//   SYNCED; gone (404: out of scope or not this user's) → FAILED NOT_FOUND (decision Q8).
// - Whole-request refusals: 401 → the session refreshes once and resumes (SessionManager.authorized), else the
//   session-expired state; 426 → stop, keep everything (F12-AC15); 403 ACCESS_REVOKED → lock the workspace
//   (F12-AC14, AC20); network, 5xx, 429 → the operations stay PENDING with backoff (F12-AC6), never discarded.
import { PROTOCOL_VERSION, SYNC_LIMITS, SyncOp, type Change, type ConflictDetail, type PushRequest } from '@hifz/contracts';
import {
  isHeldByOpenConflict,
  nextSendable,
  transition,
  type OrderableOp,
  type QueueEvent,
  type QueueItemStatus,
} from '@hifz/domain/sync';
import { ApiFailure } from '../api/client.ts';
import { checkpoint, type SqlDriver, type SqlExecutor } from '../local-db/driver.ts';
import { discardable, type Outbox, type OutboxItem } from './outbox.ts';
import type { EntityRegistry, LocalEntityHandler } from './registry.ts';
import { cleanupDue, effectiveNow, pruneSyncedQueue, purgeSynced, runRetention } from './retention.ts';
import type { ConflictApi, SyncTransport } from './transport.ts';
import { lockWorkspace, noteServerTime, readMeta } from './workspace.ts';

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
  /** Reads a conflict's current state for reconciliation (review H2). Without it, no reconciliation runs. */
  conflicts?: Pick<ConflictApi, 'getConflict'>;
  deviceId: string;
  clock: () => number;
  /** In [0, 1); backoff jitter. */
  random: () => number;
  /** The protocol version this build speaks (overridable in tests). */
  protocolVersion?: number;
  /** Called once when a 403 ACCESS_REVOKED locked the workspace. */
  onAccessRevoked?: () => void;
  /** Called with each pull's server time (the device index keeps the latest for purge clocks, review L6). */
  onServerTime?: (serverTime: string) => void;
}

export type DiscardRefusal =
  /** Other unsynced changes depend on this one. */
  | 'DEPENDENTS'
  /** It was sent before and may already be applied on the server (review M5). */
  | 'MAYBE_SENT'
  /** Its state does not allow a discard (syncing, synced, or its own conflict to review). */
  | 'STATE';

export class DiscardNotAllowedError extends Error {
  readonly dependents: number;
  readonly reason: DiscardRefusal;
  constructor(message: string, reason: DiscardRefusal, dependents = 0) {
    super(message);
    this.name = 'DiscardNotAllowedError';
    this.reason = reason;
    this.dependents = dependents;
  }
}

/** Without a run in this long, the timer pulls even when nothing is queued. */
export const PULL_INTERVAL_MS = 5 * 60_000;
/** At most this many runs back to back for one trigger (held items resent, reconciliation follow-ups). */
const MAX_ROUNDS = 5;
/** Conflicts checked with the server per run (the least recently checked first, review N5). */
export const MAX_RECONCILE = 50;
/** A conflict is checked with the server at most once in this long by the automatic reconciliation (review N5). */
export const RECONCILE_INTERVAL_MS = 5 * 60_000;

export type RetryRefusal =
  /** A newer change of the same record made on this device has already synced (review N2). */
  'NEWER_SYNCED';

export class RetryNotAllowedError extends Error {
  readonly reason: RetryRefusal;
  constructor(message: string, reason: RetryRefusal) {
    super(message);
    this.name = 'RetryNotAllowedError';
    this.reason = reason;
  }
}

/** The row (entity, entityId) feeds the domain's per-row ordering: an operation waits while an earlier one on the same row is not SYNCED. */
const toOrderable = (item: OutboxItem): OrderableOp => ({
  opId: item.opId,
  entity: item.entity,
  entityId: item.entityId,
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

interface DeferredRow {
  row_version: number;
  op: Change['op'];
  fields: string | null;
}

export class SyncEngine {
  private readonly d: EngineDeps;
  private readonly protocolVersion: number;
  private current: Promise<SyncOutcome> | null = null;
  private again: { ignoreBackoff: boolean } | null = null;
  /** Set when held items were released or a conflict settled during a run: one more run sends and pulls them. */
  private followUp = false;
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

  /** The clock for purges and retention: never behind the last server time (security review L6). */
  private async purgeNow(executor: SqlExecutor = this.d.db): Promise<number> {
    return effectiveNow(this.d.clock(), (await readMeta(executor)).lastServerTime);
  }

  /**
   * On app start: an operation left SYNCING by a killed app goes back to PENDING (the server's op_id
   * idempotency makes resending it safe, F12-AC5); a build that speaks a different protocol version gets a fresh
   * try after "upgrade required" (the same build would only be refused again; "Sync now" still asks); and the
   * daily cleanup runs.
   */
  async start(): Promise<void> {
    const items = await this.d.outbox.list();
    await this.d.db.transaction(async (tx) => {
      for (const item of items) {
        if (item.status.state === 'SYNCING') await this.apply(tx, item, { type: 'INTERRUPTED' });
      }
      const meta = await readMeta(tx);
      if (meta.protocolVersion !== this.protocolVersion) {
        await tx.run('UPDATE sync_meta SET protocol_version = ?, upgrade_required_at = NULL WHERE id = 1', [this.protocolVersion]);
      }
    });
    await this.cleanupIfDue();
    this.d.outbox.notify();
  }

  /** F12-AC19 / Q16: daily removal of synced rows past retention and of synced queue items older than 24 hours. */
  async cleanupIfDue(force = false): Promise<boolean> {
    const meta = await readMeta(this.d.db);
    const now = effectiveNow(this.d.clock(), meta.lastServerTime);
    if (!force && !cleanupDue(meta.lastCleanupAt, now)) return false;
    const removed = await this.d.db.transaction(async (tx) => {
      const rows = await runRetention(tx, this.d.registry, now);
      return rows + (await pruneSyncedQueue(tx, now));
    });
    if (removed > 0) await checkpoint(this.d.db);
    this.d.outbox.notify();
    return true;
  }

  stop(): void {
    this.stopped = true;
  }

  /**
   * Resolves once no run is in progress (review N6). After `stop()` no new run starts, so sign-out awaits this
   * before it counts unsynced changes and purges: no push result or pulled change can land after the count.
   */
  async idle(): Promise<void> {
    while (this.current) {
      await this.current.then(
        () => undefined,
        () => undefined,
      );
    }
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
    // Stopped (signing out, workspace closing): no new run starts (review N6).
    if (this.stopped) return Promise.resolve(this.snapshot.lastOutcome ?? 'OK');
    const run = (async () => {
      this.update({ running: true });
      let outcome: SyncOutcome;
      let next: { ignoreBackoff: boolean } | null = { ignoreBackoff };
      let rounds = 0;
      try {
        do {
          this.again = null;
          this.followUp = false;
          outcome = await this.runOnce(next.ignoreBackoff);
          rounds++;
          next = this.again ?? (this.followUp && rounds < MAX_ROUNDS ? { ignoreBackoff: false } : null);
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
    // F12-AC15: after "upgrade required" only an explicit request (or a new build) asks the server again.
    if (meta.upgradeRequiredAt && !ignoreBackoff) return 'UPGRADE_REQUIRED';
    const pushed = await this.pushAll(ignoreBackoff);
    if (pushed !== 'OK') return pushed;
    const pulled = await this.pullAll();
    if (pulled !== 'OK') return pulled;
    const reconciled = await this.reconcileConflicts();
    if (reconciled !== 'OK') return reconciled;
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
          // From here the server may receive it: it is no longer "never sent" (review M5).
          await this.d.outbox.markSent(tx, fresh.opId);
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
                // The acknowledged version becomes the base of this device's next UPDATE of the row. The values
                // at that version are re-read by the pull (or from deferred_changes), never assumed.
                await tx.run(
                  `UPDATE ${handler.table} SET row_version = ? WHERE id = ? AND (row_version IS NULL OR row_version < ?)`,
                  [result.rowVersion, item.entityId, result.rowVersion],
                );
              }
              await this.markRowSynced(tx, item);
              // An operation on this row was applied, so the row has no open conflict any more.
              await this.rowSettled(tx, item.entity, item.entityId);
              break;
            }
            case 'CONFLICT':
              await this.apply(tx, item, { type: 'RESULT', result: { status: 'CONFLICT', conflictId: result.conflictId } }, { lastError: null });
              // The first operation recorded for a conflict keeps it (review L2): a replayed result never
              // re-links the conflict to another operation.
              await tx.run(
                `INSERT INTO conflicts (conflict_id, op_id, entity, entity_id, status, label, created_at)
                 VALUES (?, ?, ?, ?, 'OPEN', ?, ?)
                 ON CONFLICT (conflict_id) DO NOTHING`,
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
              // CONFLICT_OPEN (Q7): held as action required by the domain transition, not retried on a timer.
              await this.apply(tx, item, { type: 'RESULT', result: { status: 'RETRY', code: result.code } }, {
                lastError: result.code === 'CONFLICT_OPEN' ? null : result.code,
              });
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
      await lockWorkspace(this.d.db, this.d.registry, await this.purgeNow());
      this.d.onAccessRevoked?.();
    } else if (kind === 'UPGRADE_REQUIRED') {
      await this.d.db.run('UPDATE sync_meta SET upgrade_required_at = ? WHERE id = 1', [this.nowIso()]);
    }
    this.d.outbox.notify();
    return kind;
  }

  private async pullAll(): Promise<SyncOutcome> {
    // Review N4: a discard asked for the server's values again; this pull starts from a fresh snapshot, and the
    // request counts as done only once that pull has finished (a pull interrupted half-way starts over).
    const start = await this.d.db.get<{ last_pull_cursor: string | null; refetch_requested: number; refetch_done: number }>(
      'SELECT last_pull_cursor, refetch_requested, refetch_done FROM sync_meta WHERE id = 1',
    );
    const refetch = Number(start?.refetch_requested ?? 0);
    let cursor = refetch > Number(start?.refetch_done ?? 0) ? null : (start?.last_pull_cursor ?? null);
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
        await this.d.db.transaction(async (tx) => {
          await purgeSynced(tx, this.d.registry, { keepQueueHistory: true });
          await noteServerTime(tx, response.serverTime);
        });
        await checkpoint(this.d.db);
        cursor = null;
        rebootstrapped = true;
        continue;
      }
      const changes = response.changes;
      const nextCursor = response.cursor;
      await this.d.db.transaction(async (tx) => {
        for (const change of changes) await this.applyChange(tx, change);
        await tx.run('UPDATE sync_meta SET last_pull_cursor = ? WHERE id = 1', [nextCursor]);
        if (!response.hasMore) await tx.run('UPDATE sync_meta SET refetch_done = MAX(refetch_done, ?) WHERE id = 1', [refetch]);
        await noteServerTime(tx, response.serverTime);
      });
      this.d.onServerTime?.(response.serverTime);
      cursor = nextCursor;
      if (!response.hasMore) return 'OK';
    }
    return 'OK';
  }

  private async applyChange(tx: SqlExecutor, change: Change): Promise<void> {
    const handler = this.d.registry.get(change.entity);
    if (!handler) return; // an entity this build does not store
    const unsynced = await this.d.outbox.unsyncedForRow(change.entity, change.entityId, tx);
    if (unsynced.length > 0) {
      // Never overwrite or drop a row with unsynced local changes (NFR-OFF-006). The server's version is kept
      // aside and applied once those changes are applied, discarded, or their conflict is resolved.
      await tx.run(
        `INSERT INTO deferred_changes (entity, entity_id, row_version, op, fields) VALUES (?, ?, ?, ?, ?)
         ON CONFLICT (entity, entity_id) DO UPDATE SET row_version = excluded.row_version, op = excluded.op, fields = excluded.fields
         WHERE excluded.row_version >= deferred_changes.row_version`,
        [change.entity, change.entityId, change.rowVersion, change.op, change.fields === undefined ? null : JSON.stringify(change.fields)],
      );
      // Q7: a newer server version than the device knows means the row was written since the hold (every
      // conflict resolution writes a new version), so held items are sent again. If the conflict is in fact
      // still open, the server answers CONFLICT_OPEN again and they wait again; nothing is lost.
      if (unsynced.some((i) => isHeldByOpenConflict(i.status))) {
        const local = await tx.get<{ row_version: number | null }>(`SELECT row_version FROM ${handler.table} WHERE id = ?`, [change.entityId]);
        if (local?.row_version == null || change.rowVersion > Number(local.row_version)) await this.clearHeld(tx, unsynced);
      }
      return;
    }
    await this.writeChange(tx, handler, change);
  }

  /** Writes a server change to a row that has no unsynced operation. */
  private async writeChange(tx: SqlExecutor, handler: LocalEntityHandler, change: Pick<Change, 'entityId' | 'rowVersion' | 'op' | 'fields'>): Promise<void> {
    if (change.op === 'REMOVE_FROM_DEVICE') {
      await tx.run(`DELETE FROM ${handler.table} WHERE id = ?`, [change.entityId]);
      return;
    }
    const local = await tx.get<{ row_version: number | null }>(`SELECT row_version FROM ${handler.table} WHERE id = ?`, [change.entityId]);
    // Only an older change is skipped. The same version is written again (review H1): the device bumped its
    // row_version on APPLIED, but the server's values at that version can differ from what the device sent.
    if (local?.row_version != null && Number(local.row_version) > change.rowVersion) return;
    await handler.upsertFromServer(tx, change.entityId, change.rowVersion, change.fields ?? {});
  }

  /** Held items (RETRY CONFLICT_OPEN) among `items` go back to PENDING and are sent again. */
  private async clearHeld(tx: SqlExecutor, items: readonly OutboxItem[]): Promise<void> {
    for (const item of items) {
      if (!isHeldByOpenConflict(item.status)) continue;
      await this.apply(tx, item, { type: 'CONFLICT_CLEARED' });
      this.followUp = true;
    }
  }

  /**
   * The row's open conflict is gone or an operation on it was applied: held items on it are sent again, and if
   * nothing on the row is unsynced any more, the server change kept aside for it is applied.
   */
  private async rowSettled(tx: SqlExecutor, entity: string, entityId: string): Promise<void> {
    await this.clearHeld(tx, await this.d.outbox.unsyncedForRow(entity, entityId, tx));
    await this.applyDeferred(tx, entity, entityId);
  }

  private async applyDeferred(tx: SqlExecutor, entity: string, entityId: string): Promise<void> {
    const handler = this.d.registry.get(entity);
    if (!handler) return;
    if ((await this.d.outbox.unsyncedForRow(entity, entityId, tx)).length > 0) return;
    const deferred = await tx.get<DeferredRow>('SELECT row_version, op, fields FROM deferred_changes WHERE entity = ? AND entity_id = ?', [entity, entityId]);
    if (!deferred) return;
    await tx.run('DELETE FROM deferred_changes WHERE entity = ? AND entity_id = ?', [entity, entityId]);
    const fields = deferred.fields === null ? undefined : (JSON.parse(deferred.fields) as Record<string, unknown>);
    await this.writeChange(tx, handler, {
      entityId,
      rowVersion: Number(deferred.row_version),
      op: deferred.op,
      ...(fields === undefined ? {} : { fields }),
    });
  }

  // ---------- Conflicts ----------

  /** The outbox item whose own operation caused `conflictId` (review L2: by the conflict's recorded op_id). */
  private async conflictItem(tx: SqlExecutor, conflictId: string): Promise<OutboxItem | null> {
    const owns = (item: OutboxItem | null): item is OutboxItem =>
      item !== null && item.status.state === 'ACTION_REQUIRED' && item.status.conflictId === conflictId;
    const row = await tx.get<{ op_id: string }>('SELECT op_id FROM conflicts WHERE conflict_id = ?', [conflictId]);
    if (row) {
      const item = await this.d.outbox.get(row.op_id, tx);
      return owns(item) ? item : null;
    }
    // No local record of the conflict (cache purged): the item that carries it, if any.
    return (await this.d.outbox.list(tx)).find(owns) ?? null;
  }

  /**
   * H2: checks this device's open conflicts with the server after each pull. One resolved on another device or
   * by an Admin becomes SYNCED here; one the user can no longer reach (404) becomes FAILED NOT_FOUND (Q8).
   */
  private async reconcileConflicts(): Promise<SyncOutcome> {
    if (!this.d.conflicts) return 'OK';
    const nowMs = this.d.clock();
    // Review N5: each conflict at most once every RECONCILE_INTERVAL_MS, least recently checked first, at most
    // MAX_RECONCILE per run, so conflicts beyond the first 50 are reached in later runs.
    const due = await this.d.db.transaction(async (tx) => {
      const owners = new Map<string, OutboxItem>();
      for (const item of await this.d.outbox.list(tx)) {
        if (item.status.state === 'ACTION_REQUIRED' && item.status.conflictId !== null && !owners.has(item.status.conflictId)) {
          owners.set(item.status.conflictId, item);
        }
      }
      if (owners.size === 0) return [];
      // A conflict whose local record was purged (scope reset) is recorded again, so its check time is kept.
      for (const [conflictId, item] of owners) {
        await tx.run(
          `INSERT INTO conflicts (conflict_id, op_id, entity, entity_id, status, label, created_at)
           VALUES (?, ?, ?, ?, 'OPEN', ?, ?) ON CONFLICT (conflict_id) DO NOTHING`,
          [conflictId, item.opId, item.entity, item.entityId, item.label, this.nowIso()],
        );
      }
      const rows = await tx.all<{ conflict_id: string; last_checked_at: string | null }>('SELECT conflict_id, last_checked_at FROM conflicts');
      const checkedAt = new Map(rows.map((r) => [r.conflict_id, r.last_checked_at === null ? null : Date.parse(r.last_checked_at)]));
      const picked = [...owners.keys()]
        .map((id) => ({ id, at: checkedAt.get(id) ?? null }))
        .filter(({ at }) => at === null || Number.isNaN(at) || at > nowMs || nowMs - at >= RECONCILE_INTERVAL_MS)
        .sort((a, b) => (a.at ?? -Infinity) - (b.at ?? -Infinity) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
        .slice(0, MAX_RECONCILE)
        .map(({ id }) => id);
      for (const id of picked) await tx.run('UPDATE conflicts SET last_checked_at = ? WHERE conflict_id = ?', [this.nowIso(), id]);
      return picked;
    });
    for (const id of due) {
      if (this.stopped) return 'OK';
      const outcome = await this.reconcileConflict(id);
      if (outcome !== 'OK') return outcome;
    }
    return 'OK';
  }

  /**
   * Brings one conflict's local state in line with the server. Also called by Conflict Review when the server says
   * the conflict is already resolved (CONFLICT_CLOSED, or a detail with status RESOLVED), passing that detail.
   * Temporary failures leave everything as it is for the next run.
   */
  async reconcileConflict(conflictId: string, known?: ConflictDetail): Promise<SyncOutcome> {
    let detail = known;
    if (!detail) {
      if (!this.d.conflicts) return 'OK';
      try {
        detail = await this.d.conflicts.getConflict(conflictId);
      } catch (err) {
        if (err instanceof ApiFailure && err.status === 404) {
          await this.conflictGone(conflictId);
          return 'OK';
        }
        const failure = failureOf(err);
        if (failure.kind === 'ACCESS_REVOKED' || failure.kind === 'UPGRADE_REQUIRED' || failure.kind === 'SESSION_EXPIRED') {
          return this.onBlocked(failure.kind);
        }
        return 'OK';
      }
    }
    // A resolution always writes a new version on top of the conflict's server version.
    if (detail.status === 'RESOLVED') await this.settleConflict(conflictId, detail.serverVersion + 1);
    return 'OK';
  }

  /** The server confirmed a conflict was resolved (POST /sync/conflicts/:id/resolve → 200). */
  async conflictResolved(conflictId: string, rowVersion: number): Promise<void> {
    await this.settleConflict(conflictId, rowVersion);
    this.requestSync('manual');
  }

  private async settleConflict(conflictId: string, rowVersion: number): Promise<void> {
    await this.d.db.transaction(async (tx) => {
      await tx.run("UPDATE conflicts SET status = 'RESOLVED', resolved_at = ? WHERE conflict_id = ?", [this.nowIso(), conflictId]);
      const item = await this.conflictItem(tx, conflictId);
      if (!item) return;
      const deferred = await tx.get<{ row_version: number }>('SELECT row_version FROM deferred_changes WHERE entity = ? AND entity_id = ?', [
        item.entity,
        item.entityId,
      ]);
      // Only the operation that caused this conflict is settled; other items on the row keep their own state.
      await this.apply(tx, item, { type: 'CONFLICT_RESOLVED', rowVersion: Math.max(rowVersion, Number(deferred?.row_version ?? 0)) });
      await this.markRowSynced(tx, item);
      await this.rowSettled(tx, item.entity, item.entityId);
      this.followUp = true;
    });
    this.d.outbox.notify();
  }

  /** The conflict is no longer reachable for this user (404): out of scope or never theirs (decision Q8). */
  private async conflictGone(conflictId: string): Promise<void> {
    await this.d.db.transaction(async (tx) => {
      const item = await this.conflictItem(tx, conflictId);
      await tx.run('DELETE FROM conflicts WHERE conflict_id = ?', [conflictId]);
      if (!item) return;
      // Domain CONFLICT_GONE: ACTION_REQUIRED (own conflict) → FAILED NOT_FOUND. FAILED is never SYNCED; the user can
      // retry (a new op_id, same seq) or discard. Later edits of the row stay held behind it (per-row order).
      await this.apply(tx, item, { type: 'CONFLICT_GONE' });
      // Items the server held behind it (CONFLICT_OPEN) go back to PENDING; the server answers for each of them
      // (NOT_FOUND if out of scope) once the per-row order lets them go.
      await this.clearHeld(tx, await this.d.outbox.unsyncedForRow(item.entity, item.entityId, tx));
    });
    this.d.outbox.notify();
  }

  // ---------- User actions ----------

  /**
   * The user taps Retry on a FAILED item (review M1, N2). The server keeps a terminal result per op_id, so
   * resending the same op_id would only replay that result. Retry therefore queues the same change again under a
   * NEW op_id but its ORIGINAL seq (and save time, entity, fields, base version, dependencies), in one transaction
   * that also re-points its dependents to the new op_id and records the old one in `discards` with reason RETRIED.
   * Keeping the seq means the retried change still comes before every later change this device made to the row,
   * so it can never be applied after (and over) a newer edit.
   *
   * Refused with RetryNotAllowedError('NEWER_SYNCED') when a later change of the same row from this device has
   * already synced: replaying the older change now would either overwrite the newer one or conflict with it.
   * The user can discard it instead (FAILED is always discardable).
   */
  async retry(opId: string): Promise<void> {
    const done = await this.d.db.transaction(async (tx) => {
      const item = await this.d.outbox.get(opId, tx);
      if (!item || item.status.state !== 'FAILED') return false;
      if (await this.newerSynced(tx, item)) {
        throw new RetryNotAllowedError('A newer change of this record has already synced', 'NEWER_SYNCED');
      }
      const dependents = await this.d.outbox.dependents(opId, tx);
      await this.recordDiscard(tx, item, 'RETRIED');
      const newOpId = await this.d.outbox.requeue(tx, item);
      for (const dependent of dependents) {
        const deps = dependent.dependsOn.map((d) => (d === opId ? newOpId : d));
        await tx.run('UPDATE outbox SET depends_on = ? WHERE op_id = ?', [JSON.stringify(deps), dependent.opId]);
      }
      return true;
    });
    if (!done) return;
    this.d.outbox.notify();
    this.requestSync('manual');
  }

  /** A change of the same row with a later seq has synced (still listed, or remembered in row_sync_marks). */
  private async newerSynced(tx: SqlExecutor, item: OutboxItem): Promise<boolean> {
    const listed = await tx.get<{ n: number }>(
      "SELECT COUNT(*) AS n FROM outbox WHERE entity = ? AND entity_id = ? AND state = 'SYNCED' AND seq > ?",
      [item.entity, item.entityId, item.seq],
    );
    if (Number(listed?.n ?? 0) > 0) return true;
    const mark = await tx.get<{ last_synced_seq: number }>('SELECT last_synced_seq FROM row_sync_marks WHERE entity = ? AND entity_id = ?', [
      item.entity,
      item.entityId,
    ]);
    return mark !== null && mark !== undefined && Number(mark.last_synced_seq) > item.seq;
  }

  /** Remembers the highest seq of this device's operations the server acknowledged on the row (review N2). */
  private async markRowSynced(tx: SqlExecutor, item: OutboxItem): Promise<void> {
    await tx.run(
      `INSERT INTO row_sync_marks (entity, entity_id, last_synced_seq) VALUES (?, ?, ?)
       ON CONFLICT (entity, entity_id) DO UPDATE SET last_synced_seq = MAX(last_synced_seq, excluded.last_synced_seq)`,
      [item.entity, item.entityId, item.seq],
    );
  }

  private async recordDiscard(tx: SqlExecutor, item: OutboxItem, reason: 'DISCARDED' | 'RETRIED'): Promise<void> {
    await tx.run(
      `INSERT INTO discards (op_id, entity, entity_id, op_type, label, failure_code, created_at, discarded_at, reason)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [item.opId, item.entity, item.entityId, item.opType, item.label, item.status.failure?.code ?? null, item.createdAt, this.nowIso(), reason],
    );
  }

  /**
   * Discards an unsynced change after the user confirmed it (NFR-OFF-007). Only where the server has certainly not
   * applied it (`discardable`: never sent, FAILED, or held behind an open conflict; review M5), and never while
   * other unsynced items depend on it. The discard is recorded locally in `discards`.
   */
  async discard(opId: string): Promise<void> {
    let refetch = false;
    await this.d.db.transaction(async (tx) => {
      const item = await this.d.outbox.get(opId, tx);
      if (!item) return;
      if (!discardable(item)) {
        const maybeSent = item.status.state === 'PENDING';
        throw new DiscardNotAllowedError(
          maybeSent ? 'This change was sent before and may already be on the server' : `Cannot discard an item that is ${item.status.state}`,
          maybeSent ? 'MAYBE_SENT' : 'STATE',
        );
      }
      const dependents = await this.d.outbox.dependents(opId, tx);
      if (dependents.length > 0) throw new DiscardNotAllowedError('Other changes depend on this one', 'DEPENDENTS', dependents.length);
      await this.recordDiscard(tx, item, 'DISCARDED');
      const handler = this.d.registry.get(item.entity);
      await handler?.onDiscard?.(tx, { entityId: item.entityId, opType: item.opType });
      await tx.run('DELETE FROM outbox WHERE op_id = ?', [opId]);
      const deferred = await tx.get<{ n: number }>('SELECT COUNT(*) AS n FROM deferred_changes WHERE entity = ? AND entity_id = ?', [item.entity, item.entityId]);
      await this.applyDeferred(tx, item.entity, item.entityId);
      // Review N4: a discarded UPDATE/COMMAND left values in the local row that the server never had. With a
      // server change kept aside, that change restores the row (now, or once the row's other unsynced changes
      // settle). Without one, the server's current values are fetched again: the next pull starts from a fresh
      // snapshot, which rewrites every synced row at its server version. A row never acknowledged is re-read
      // anyway once its CREATE is applied (the pull delivers the applied version).
      if (item.opType !== 'CREATE' && handler && Number(deferred?.n ?? 0) === 0) {
        const row = await tx.get<{ row_version: number | null }>(`SELECT row_version FROM ${handler.table} WHERE id = ?`, [item.entityId]);
        if (row && row.row_version !== null && row.row_version !== undefined) {
          await tx.run('UPDATE sync_meta SET refetch_requested = refetch_requested + 1 WHERE id = 1');
          refetch = true;
        }
      }
    });
    this.d.outbox.notify();
    if (refetch) this.requestSync('save');
  }
}
