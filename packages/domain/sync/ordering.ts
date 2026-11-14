// F12 · Outbox ordering (FR-SYNC-006, F12-AC4, NFR-OFF-006). Pending operations go out in outbox `seq` order; an
// operation whose dependency is not yet SYNCED is held, and so is an operation whose row (entity, entityId) has an
// earlier operation that is not yet SYNCED. Device time is never used for ordering (edge case "wrong clock").
import type { QueueState } from './states.ts';

export interface OrderableOp {
  opId: string;
  /** Monotonic outbox sequence assigned when the operation was queued (kept when the user retries it). */
  seq: number;
  /** The row the operation writes: edits of one row go out one at a time, in `seq` order (review N1). */
  entity: string;
  entityId: string;
  state: QueueState;
  /** Op IDs this operation depends on (e.g. a portion depends on its daily record's CREATE). */
  dependsOn: readonly string[];
  /** Backoff: earliest send time in ms since epoch; null or absent = now. */
  nextAttemptAt?: number | null;
}

export const HOLD_REASONS = [
  /** A dependency is still pending or syncing. */
  'WAITING_FOR_DEPENDENCY',
  /**
   * A dependency, or an earlier edit of the same row, failed or needs action: shown to the user as "waiting for
   * record". It clears when that operation is retried and synced, its conflict is resolved, or it is discarded.
   */
  'WAITING_FOR_RECORD',
  /** An earlier edit of the same row is still pending or syncing (it goes first; review N1). */
  'WAITING_FOR_EARLIER_EDIT',
  /** The operation is backing off after a temporary failure. */
  'BACKOFF',
] as const;
export type HoldReason = (typeof HOLD_REASONS)[number];

export interface HeldOp<T extends OrderableOp> {
  op: T;
  reason: HoldReason;
  /** Op IDs of the dependencies or earlier same-row operations that hold it (empty for BACKOFF). */
  blockedBy: string[];
}

export interface SendPlan<T extends OrderableOp> {
  /** Operations to push now, in `seq` order. */
  send: T[];
  /** PENDING operations that may not be sent yet, in `seq` order. */
  held: HeldOp<T>[];
}

export interface NextSendableOptions {
  /** Current time in ms since epoch; needed to honour backoff. Without it, backoff is ignored. */
  nowMs?: number;
  /** At most this many operations in `send` (the push batch limit). */
  limit?: number;
}

const bySeq = (a: OrderableOp, b: OrderableOp) => a.seq - b.seq || (a.opId < b.opId ? -1 : a.opId > b.opId ? 1 : 0);

const needsAction = (state: QueueState) => state === 'FAILED' || state === 'ACTION_REQUIRED';

/**
 * Which PENDING operations can be sent now.
 *
 * - **Dependencies.** An operation is held while any operation it depends on is not SYNCED: a dependency that is
 *   FAILED or ACTION_REQUIRED holds it as WAITING_FOR_RECORD, one that is PENDING or SYNCING as
 *   WAITING_FOR_DEPENDENCY. A dependency that is no longer in the outbox (already synced and cleaned up) does not
 *   hold it; the server re-checks every dependency and answers DEPENDENCY_PENDING if it was never applied.
 * - **Same row (review N1).** An operation is held while any operation on the same (entity, entityId) with an
 *   earlier `seq` is not SYNCED: as WAITING_FOR_RECORD when that earlier operation is FAILED or ACTION_REQUIRED
 *   (its own conflict, or held behind another one's open conflict), otherwise as WAITING_FOR_EARLIER_EDIT. So at
 *   most one operation per row is ever in flight, and a later edit never reaches the server before an earlier one
 *   (which, applied afterwards, would otherwise overwrite it; the server also refuses that as a conflict). The
 *   successors of a held operation stay held until it is synced, resolved, or discarded; that is intended.
 * - **Backoff** holds an operation that is otherwise free until its next attempt time.
 */
export function nextSendable<T extends OrderableOp>(outbox: readonly T[], options: NextSendableOptions = {}): SendPlan<T> {
  const limit = options.limit ?? Number.POSITIVE_INFINITY;
  const byId = new Map<string, T>();
  for (const op of outbox) byId.set(op.opId, op);

  const send: T[] = [];
  const held: HeldOp<T>[] = [];
  /** Per row, the operations seen so far (earlier `seq`) that are not SYNCED. */
  const unsyncedByRow = new Map<string, T[]>();
  for (const op of [...outbox].sort(bySeq)) {
    const rowKey = JSON.stringify([op.entity, op.entityId]);
    const earlier = unsyncedByRow.get(rowKey) ?? [];
    if (op.state !== 'SYNCED') unsyncedByRow.set(rowKey, [...earlier, op]);
    if (op.state !== 'PENDING') continue;

    const failed: string[] = [];
    const waiting: string[] = [];
    for (const depId of op.dependsOn) {
      const dep = byId.get(depId);
      if (!dep || dep.state === 'SYNCED') continue;
      if (needsAction(dep.state)) failed.push(depId);
      else waiting.push(depId);
    }
    const earlierWaiting: string[] = [];
    for (const prior of earlier) {
      if (needsAction(prior.state)) {
        if (!failed.includes(prior.opId)) failed.push(prior.opId);
      } else if (!waiting.includes(prior.opId)) {
        earlierWaiting.push(prior.opId);
      }
    }
    // A dependency that is unsent or is held itself counts as waiting even if it sorts earlier in this batch:
    // dependents go out only after the server has acknowledged the dependency.
    if (failed.length > 0) {
      held.push({ op, reason: 'WAITING_FOR_RECORD', blockedBy: failed });
    } else if (waiting.length > 0) {
      held.push({ op, reason: 'WAITING_FOR_DEPENDENCY', blockedBy: waiting });
    } else if (earlierWaiting.length > 0) {
      held.push({ op, reason: 'WAITING_FOR_EARLIER_EDIT', blockedBy: earlierWaiting });
    } else if (options.nowMs !== undefined && op.nextAttemptAt != null && op.nextAttemptAt > options.nowMs) {
      held.push({ op, reason: 'BACKOFF', blockedBy: [] });
    } else if (send.length < limit) {
      send.push(op);
    }
  }
  return { send, held };
}
