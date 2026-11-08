// F12 · Queue-item state machine (FR-SYNC-007, F12-AC8, F12-AC9, F12-AC6).
// PENDING → SYNCING → SYNCED | FAILED | ACTION_REQUIRED. SYNCED is reached only from a server acknowledgement:
// an APPLIED result, or the server confirming that the item's conflict was resolved.
// ACTION_REQUIRED has two forms: the item's own conflict (CONFLICT result, conflictId set; CONFLICT_RESOLVED →
// SYNCED), or held behind another operation's open conflict on the same row (RETRY CONFLICT_OPEN, decision Q7;
// conflictId null, failure CONFLICT_OPEN; CONFLICT_CLEARED → PENDING and sent again).
import { nextAttemptAt } from './backoff.ts';

export const QUEUE_STATES = ['PENDING', 'SYNCING', 'SYNCED', 'FAILED', 'ACTION_REQUIRED'] as const;
export type QueueState = (typeof QUEUE_STATES)[number];

/**
 * A per-operation server result, structurally compatible with the contracts' `OpResult`
 * (the domain does not depend on the contracts package).
 */
export type ServerOpResult =
  | { status: 'APPLIED'; rowVersion: number }
  | { status: 'CONFLICT'; conflictId: string }
  | { status: 'REJECTED'; code: string; fields?: Readonly<Record<string, string>> | undefined }
  | { status: 'RETRY'; code: string };

export interface QueueItemStatus {
  state: QueueState;
  /** Failed attempts since the last success or manual retry; drives the backoff. */
  attempts: number;
  /** Earliest time (ms since epoch) the item may be sent again; null = now. */
  nextAttemptAt: number | null;
  /** Why the item is FAILED (a REJECTED code and field issues), or why the last attempt was retried. */
  failure: { code: string; fields?: Readonly<Record<string, string>> | undefined } | null;
  /** Server row version after APPLIED or after the conflict was resolved. */
  rowVersion: number | null;
  /** Set while the item is ACTION_REQUIRED. */
  conflictId: string | null;
}

export type QueueEvent =
  /** The engine includes the item in a push. */
  | { type: 'SEND' }
  /** The server answered for this operation. */
  | { type: 'RESULT'; result: ServerOpResult }
  /** Network error, timeout, or a temporary server error (5xx, 429): no per-op answer. */
  | { type: 'TRANSPORT_ERROR'; code?: string }
  /** The push stopped for a reason that is not this operation's fault (401 refresh, 426, 403 ACCESS_REVOKED). */
  | { type: 'INTERRUPTED' }
  /** The user taps Retry on a failed item (after correcting it, or as is). */
  | { type: 'RETRY' }
  /** The server confirmed the conflict for this item was resolved (POST /sync/conflicts/:id/resolve). */
  | { type: 'CONFLICT_RESOLVED'; rowVersion: number }
  /**
   * The open conflict that held this item (RETRY CONFLICT_OPEN: another operation's conflict on the same row) is
   * no longer open, so the item is sent again. The resend may apply, or become its own explicit conflict.
   */
  | { type: 'CONFLICT_CLEARED' };

/**
 * RETRY code meaning "the row has an open conflict" (decision Q7): the item is held as ACTION_REQUIRED, without a
 * conflict of its own and without a backoff, until {@link QueueEvent} CONFLICT_CLEARED. Same value as the
 * contracts' OP_RETRY_CODES entry.
 */
export const CONFLICT_OPEN = 'CONFLICT_OPEN';

/** True for an item held because its row has someone else's open conflict (not its own conflict). */
export function isHeldByOpenConflict(item: QueueItemStatus): boolean {
  return item.state === 'ACTION_REQUIRED' && item.conflictId === null && item.failure?.code === CONFLICT_OPEN;
}

export interface TransitionContext {
  nowMs: number;
  /** Returns a number in [0, 1); used for backoff jitter. */
  random: () => number;
}

export class InvalidQueueTransitionError extends Error {
  readonly from: QueueState;
  readonly event: QueueEvent['type'];
  constructor(from: QueueState, event: QueueEvent['type']) {
    super(`Invalid queue transition: ${event} from ${from}`);
    this.name = 'InvalidQueueTransitionError';
    this.from = from;
    this.event = event;
  }
}

/** A newly queued operation. */
export function initialQueueStatus(): QueueItemStatus {
  return { state: 'PENDING', attempts: 0, nextAttemptAt: null, failure: null, rowVersion: null, conflictId: null };
}

function backToPending(item: QueueItemStatus, code: string | undefined, ctx: TransitionContext): QueueItemStatus {
  const attempts = item.attempts + 1;
  return {
    ...item,
    state: 'PENDING',
    attempts,
    nextAttemptAt: nextAttemptAt(ctx.nowMs, attempts, ctx.random),
    failure: code === undefined ? null : { code },
  };
}

/** Pure transition. Throws {@link InvalidQueueTransitionError} for a transition the machine does not allow. */
export function transition(item: QueueItemStatus, event: QueueEvent, ctx: TransitionContext): QueueItemStatus {
  const invalid = () => new InvalidQueueTransitionError(item.state, event.type);
  switch (event.type) {
    case 'SEND':
      if (item.state !== 'PENDING') throw invalid();
      return { ...item, state: 'SYNCING' };

    case 'RESULT': {
      if (item.state !== 'SYNCING') throw invalid();
      const result = event.result;
      switch (result.status) {
        case 'APPLIED':
          return {
            ...item,
            state: 'SYNCED',
            attempts: 0,
            nextAttemptAt: null,
            failure: null,
            rowVersion: result.rowVersion,
            conflictId: null,
          };
        case 'CONFLICT':
          return { ...item, state: 'ACTION_REQUIRED', nextAttemptAt: null, failure: null, conflictId: result.conflictId };
        case 'REJECTED':
          return {
            ...item,
            state: 'FAILED',
            nextAttemptAt: null,
            failure: result.fields === undefined ? { code: result.code } : { code: result.code, fields: result.fields },
          };
        case 'RETRY':
          // The row has an open conflict (Q7): held as action required, not retried on a timer, so its fields
          // stay on the device until the conflict is resolved (never dropped).
          if (result.code === CONFLICT_OPEN) {
            return { ...item, state: 'ACTION_REQUIRED', nextAttemptAt: null, failure: { code: CONFLICT_OPEN }, conflictId: null };
          }
          return backToPending(item, result.code, ctx);
        default: {
          const unknown: never = result;
          throw new Error(`Unknown server result ${JSON.stringify(unknown)}`);
        }
      }
    }

    case 'TRANSPORT_ERROR':
      if (item.state !== 'SYNCING') throw invalid();
      return backToPending(item, event.code, ctx);

    case 'INTERRUPTED':
      // Not the operation's fault: back to PENDING without counting an attempt or delaying it.
      if (item.state !== 'SYNCING') throw invalid();
      return { ...item, state: 'PENDING' };

    case 'RETRY':
      if (item.state !== 'FAILED') throw invalid();
      return { ...item, state: 'PENDING', attempts: 0, nextAttemptAt: null, failure: null };

    case 'CONFLICT_RESOLVED':
      // Only an item whose own operation caused the conflict is settled by its resolution.
      if (item.state !== 'ACTION_REQUIRED' || item.conflictId === null) throw invalid();
      return { ...item, state: 'SYNCED', rowVersion: event.rowVersion, conflictId: null };

    case 'CONFLICT_CLEARED':
      // Back to pending at once, with no backoff penalty: the wait was not this item's failure.
      if (!isHeldByOpenConflict(item)) throw invalid();
      return { ...item, state: 'PENDING', attempts: 0, nextAttemptAt: null, failure: null };

    default: {
      const unknown: never = event;
      throw new Error(`Unknown queue event ${JSON.stringify(unknown)}`);
    }
  }
}
