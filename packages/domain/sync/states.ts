// F12 · Queue-item state machine (FR-SYNC-007, F12-AC8, F12-AC9, F12-AC6).
// PENDING → SYNCING → SYNCED | FAILED | ACTION_REQUIRED. SYNCED is reached only from a server acknowledgement:
// an APPLIED result, or the server confirming that the item's conflict was resolved.
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
  | { type: 'CONFLICT_RESOLVED'; rowVersion: number };

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
      if (item.state !== 'ACTION_REQUIRED') throw invalid();
      return { ...item, state: 'SYNCED', rowVersion: event.rowVersion, conflictId: null };

    default: {
      const unknown: never = event;
      throw new Error(`Unknown queue event ${JSON.stringify(unknown)}`);
    }
  }
}
