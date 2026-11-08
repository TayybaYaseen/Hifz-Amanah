// F12 · Offline and synchronization — unit: queue-item states, backoff, and client IDs (docs/specs/04-f12-offline-sync.md)
import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { BACKOFF, backoffCeiling, nextAttemptAt, nextAttemptDelay } from './backoff.ts';
import { initialQueueStatus, InvalidQueueTransitionError, QUEUE_STATES, transition, type QueueEvent, type QueueItemStatus } from './states.ts';
import { isUuidV7, uuidV7 } from './ids.ts';

const ctx = { nowMs: 1_000_000, random: () => 0.5 };
const syncing = (): QueueItemStatus => transition(initialQueueStatus(), { type: 'SEND' }, ctx);

describe('F12 · queue-item states', () => {
  it('F12-AC8 (US-053) each item is pending, syncing, synced, failed (with reason), or action required', () => {
    expect(QUEUE_STATES).toEqual(['PENDING', 'SYNCING', 'SYNCED', 'FAILED', 'ACTION_REQUIRED']);
    expect(initialQueueStatus().state).toBe('PENDING');
    expect(syncing().state).toBe('SYNCING');
    expect(transition(syncing(), { type: 'RESULT', result: { status: 'APPLIED', rowVersion: 3 } }, ctx)).toMatchObject({ state: 'SYNCED', rowVersion: 3 });
    expect(
      transition(syncing(), { type: 'RESULT', result: { status: 'REJECTED', code: 'VALIDATION', fields: { quality: 'INVALID' } } }, ctx),
    ).toMatchObject({ state: 'FAILED', failure: { code: 'VALIDATION', fields: { quality: 'INVALID' } } });
    expect(transition(syncing(), { type: 'RESULT', result: { status: 'CONFLICT', conflictId: 'c1' } }, ctx)).toMatchObject({
      state: 'ACTION_REQUIRED',
      conflictId: 'c1',
    });
  });

  it('F12-AC9 (US-053) an item is never synced until the server acknowledges it', () => {
    // From every state, only an APPLIED result (or a confirmed conflict resolution) reaches SYNCED.
    const events: QueueEvent[] = [
      { type: 'SEND' },
      { type: 'TRANSPORT_ERROR' },
      { type: 'INTERRUPTED' },
      { type: 'RETRY' },
      { type: 'RESULT', result: { status: 'RETRY', code: 'DEPENDENCY_PENDING' } },
      { type: 'RESULT', result: { status: 'REJECTED', code: 'NOT_FOUND' } },
      { type: 'RESULT', result: { status: 'CONFLICT', conflictId: 'c' } },
    ];
    for (const state of QUEUE_STATES) {
      for (const event of events) {
        try {
          expect(transition({ ...initialQueueStatus(), state }, event, ctx).state, `${state} + ${event.type}`).not.toBe('SYNCED');
        } catch (err) {
          expect(err).toBeInstanceOf(InvalidQueueTransitionError);
        }
      }
    }
  });

  it('F12-AC6 (US-052) temporary errors return the item to pending with a growing backoff ceiling, never failed', () => {
    let item = initialQueueStatus();
    for (let i = 1; i <= 12; i++) {
      item = transition(item, { type: 'SEND' }, ctx);
      item = i % 2 ? transition(item, { type: 'TRANSPORT_ERROR', code: 'HTTP_503' }, ctx) : transition(item, { type: 'RESULT', result: { status: 'RETRY', code: 'DEPENDENCY_PENDING' } }, ctx);
      expect(item.state).toBe('PENDING');
      expect(item.attempts).toBe(i);
      expect(item.nextAttemptAt).toBe(ctx.nowMs + Math.floor(0.5 * backoffCeiling(i)));
    }
  });

  it('F12 unit: an interrupted push (session refresh, upgrade required, access revoked) keeps the item pending without a penalty', () => {
    expect(transition(syncing(), { type: 'INTERRUPTED' }, ctx)).toEqual(initialQueueStatus());
  });

  it('F12 unit: Retry on a failed item makes it pending again; a resolved conflict is synced', () => {
    const failed = transition(syncing(), { type: 'RESULT', result: { status: 'REJECTED', code: 'VALIDATION' } }, ctx);
    expect(transition(failed, { type: 'RETRY' }, ctx)).toMatchObject({ state: 'PENDING', failure: null, attempts: 0 });
    const conflicted = transition(syncing(), { type: 'RESULT', result: { status: 'CONFLICT', conflictId: 'c' } }, ctx);
    expect(transition(conflicted, { type: 'CONFLICT_RESOLVED', rowVersion: 7 }, ctx)).toMatchObject({ state: 'SYNCED', rowVersion: 7, conflictId: null });
  });

  it('F12 unit: invalid transitions are refused', () => {
    expect(() => transition(initialQueueStatus(), { type: 'RESULT', result: { status: 'APPLIED', rowVersion: 1 } }, ctx)).toThrow(InvalidQueueTransitionError);
    expect(() => transition(syncing(), { type: 'SEND' }, ctx)).toThrow(InvalidQueueTransitionError);
    expect(() => transition(initialQueueStatus(), { type: 'RETRY' }, ctx)).toThrow(InvalidQueueTransitionError);
    expect(() => transition(initialQueueStatus(), { type: 'CONFLICT_RESOLVED', rowVersion: 1 }, ctx)).toThrow(InvalidQueueTransitionError);
    const synced = transition(syncing(), { type: 'RESULT', result: { status: 'APPLIED', rowVersion: 1 } }, ctx);
    expect(() => transition(synced, { type: 'SEND' }, ctx)).toThrow(InvalidQueueTransitionError);
  });
});

describe('F12 · backoff', () => {
  it('F12-AC6 (US-052) retries wait full-jitter exponential delays: 2 s base, doubling, capped at 5 minutes', () => {
    expect([1, 2, 3, 4, 5, 6, 7, 8, 9, 100, 10_000].map(backoffCeiling)).toEqual([2_000, 4_000, 8_000, 16_000, 32_000, 64_000, 128_000, 256_000, 300_000, 300_000, 300_000]);
    expect(nextAttemptDelay(3, () => 0)).toBe(0);
    expect(nextAttemptDelay(3, () => 0.25)).toBe(2_000);
    expect(nextAttemptAt(100, 1, () => 0.5)).toBe(1_100);
    expect(() => backoffCeiling(0)).toThrow(RangeError);
    expect(() => nextAttemptDelay(1, () => 1)).toThrow(RangeError);
  });

  it('F12-AC6 (US-052) (property) the delay stays within [0, ceiling) and the ceiling never decreases', () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 1_000 }), fc.double({ min: 0, max: 1, maxExcluded: true, noNaN: true }), (attempts, r) => {
        const delay = nextAttemptDelay(attempts, () => r);
        expect(delay).toBeGreaterThanOrEqual(0);
        expect(delay).toBeLessThan(Math.max(1, backoffCeiling(attempts)));
        expect(backoffCeiling(attempts + 1)).toBeGreaterThanOrEqual(backoffCeiling(attempts));
        expect(backoffCeiling(attempts)).toBeLessThanOrEqual(BACKOFF.capMs);
      }),
    );
  });
});

describe('F12 · client IDs', () => {
  it('F12-AC3 (US-051) client IDs are UUIDv7 built from an injected clock and random source', () => {
    const id = uuidV7(0x0190_1234_5678, new Uint8Array([0xff, 1, 0xff, 2, 3, 4, 5, 6, 7, 8]));
    expect(id).toBe('01901234-5678-7f01-bf02-030405060708');
    expect(isUuidV7(id)).toBe(true);
    expect(isUuidV7('01901234-5678-4f01-bf02-030405060708')).toBe(false); // v4
    expect(isUuidV7('01901234-5678-7f01-cf02-030405060708')).toBe(false); // wrong variant
    expect(isUuidV7(id.toUpperCase())).toBe(false);
    expect(isUuidV7(42)).toBe(false);
    expect(() => uuidV7(-1, new Uint8Array(10))).toThrow(RangeError);
    expect(() => uuidV7(1, new Uint8Array(9))).toThrow(RangeError);
  });

  it('F12 unit (property): every generated ID is a valid UUIDv7 and sorts by time', () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 2 ** 47 }), fc.uint8Array({ minLength: 10, maxLength: 10 }), fc.uint8Array({ minLength: 10, maxLength: 10 }), (ms, r1, r2) => {
        const a = uuidV7(ms, r1);
        const b = uuidV7(ms + 1, r2);
        expect(isUuidV7(a)).toBe(true);
        expect(a < b).toBe(true);
      }),
    );
  });
});
