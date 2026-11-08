// F12 · Outbox ordering (FR-SYNC-006, F12-AC4). Pending operations go out in outbox `seq` order; an operation
// whose dependency is not yet SYNCED is held. Device time is never used for ordering (edge case "wrong clock").
import type { QueueState } from './states.ts';

export interface OrderableOp {
  opId: string;
  /** Monotonic outbox sequence assigned when the operation was queued. */
  seq: number;
  state: QueueState;
  /** Op IDs this operation depends on (e.g. a portion depends on its daily record's CREATE). */
  dependsOn: readonly string[];
  /** Backoff: earliest send time in ms since epoch; null or absent = now. */
  nextAttemptAt?: number | null;
}

export const HOLD_REASONS = [
  /** A dependency is still pending or syncing. */
  'WAITING_FOR_DEPENDENCY',
  /** A dependency failed or needs action: shown to the user as "waiting for record". */
  'WAITING_FOR_RECORD',
  /** The operation is backing off after a temporary failure. */
  'BACKOFF',
] as const;
export type HoldReason = (typeof HOLD_REASONS)[number];

export interface HeldOp<T extends OrderableOp> {
  op: T;
  reason: HoldReason;
  /** Op IDs of the dependencies that hold it (empty for BACKOFF). */
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

/**
 * Which PENDING operations can be sent now. An operation is held while any operation it depends on is not
 * SYNCED: a dependency that is FAILED or ACTION_REQUIRED holds it as WAITING_FOR_RECORD, one that is
 * PENDING or SYNCING as WAITING_FOR_DEPENDENCY. A dependency that is no longer in the outbox (already synced
 * and cleaned up) does not hold it; the server re-checks every dependency and answers DEPENDENCY_PENDING if
 * it was never applied.
 */
export function nextSendable<T extends OrderableOp>(outbox: readonly T[], options: NextSendableOptions = {}): SendPlan<T> {
  const limit = options.limit ?? Number.POSITIVE_INFINITY;
  const byId = new Map<string, T>();
  for (const op of outbox) byId.set(op.opId, op);

  const send: T[] = [];
  const held: HeldOp<T>[] = [];
  for (const op of [...outbox].sort(bySeq)) {
    if (op.state !== 'PENDING') continue;

    const failed: string[] = [];
    const waiting: string[] = [];
    for (const depId of op.dependsOn) {
      const dep = byId.get(depId);
      if (!dep || dep.state === 'SYNCED') continue;
      if (dep.state === 'FAILED' || dep.state === 'ACTION_REQUIRED') failed.push(depId);
      else waiting.push(depId);
    }
    // A dependency that is unsent or is held itself counts as waiting even if it sorts earlier in this batch:
    // dependents go out only after the server has acknowledged the dependency.
    if (failed.length > 0) {
      held.push({ op, reason: 'WAITING_FOR_RECORD', blockedBy: failed });
    } else if (waiting.length > 0) {
      held.push({ op, reason: 'WAITING_FOR_DEPENDENCY', blockedBy: waiting });
    } else if (options.nowMs !== undefined && op.nextAttemptAt != null && op.nextAttemptAt > options.nowMs) {
      held.push({ op, reason: 'BACKOFF', blockedBy: [] });
    } else if (send.length < limit) {
      send.push(op);
    }
  }
  return { send, held };
}
