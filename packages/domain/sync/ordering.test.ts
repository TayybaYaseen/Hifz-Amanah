// F12 · Offline and synchronization — unit: outbox ordering and dependencies (docs/specs/04-f12-offline-sync.md)
import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { nextSendable, type OrderableOp } from './ordering.ts';
import { QUEUE_STATES, type QueueState } from './states.ts';

const op = (opId: string, seq: number, state: QueueState = 'PENDING', dependsOn: string[] = [], nextAttemptAt: number | null = null): OrderableOp => ({
  opId,
  seq,
  state,
  dependsOn,
  nextAttemptAt,
});

describe('F12 · ordering', () => {
  it('F12-AC4 (US-052) pending operations go out in outbox order, a record before its portions and attempts', () => {
    const record = op('record', 1);
    const portion = op('portion', 2, 'PENDING', ['record']);
    const attempt = op('attempt', 3, 'PENDING', ['portion']);
    const other = op('other', 4);

    // Shuffled input: the order comes from seq, never from the array or device time.
    let plan = nextSendable([attempt, other, portion, record]);
    expect(plan.send.map((o) => o.opId)).toEqual(['record', 'other']);
    expect(plan.held.map((h) => [h.op.opId, h.reason])).toEqual([
      ['portion', 'WAITING_FOR_DEPENDENCY'],
      ['attempt', 'WAITING_FOR_DEPENDENCY'],
    ]);

    plan = nextSendable([{ ...record, state: 'SYNCED' }, portion, attempt, { ...other, state: 'SYNCED' }]);
    expect(plan.send.map((o) => o.opId)).toEqual(['portion']);

    plan = nextSendable([{ ...record, state: 'SYNCED' }, { ...portion, state: 'SYNCED' }, attempt]);
    expect(plan.send.map((o) => o.opId)).toEqual(['attempt']);
  });

  it('F12 edge case: a failed dependency holds its dependents as "waiting for record"', () => {
    const plan = nextSendable([op('record', 1, 'FAILED'), op('portion', 2, 'PENDING', ['record']), op('conflicted', 3, 'ACTION_REQUIRED'), op('x', 4, 'PENDING', ['conflicted'])]);
    expect(plan.send).toEqual([]);
    expect(plan.held).toEqual([
      { op: expect.objectContaining({ opId: 'portion' }), reason: 'WAITING_FOR_RECORD', blockedBy: ['record'] },
      { op: expect.objectContaining({ opId: 'x' }), reason: 'WAITING_FOR_RECORD', blockedBy: ['conflicted'] },
    ]);
  });

  it('F12 unit: a dependency that already left the outbox does not hold its dependent', () => {
    expect(nextSendable([op('portion', 2, 'PENDING', ['gone'])]).send.map((o) => o.opId)).toEqual(['portion']);
  });

  it('F12-AC6 (US-052) an operation backing off stays pending and is held until its next attempt time', () => {
    const plan = nextSendable([op('a', 1, 'PENDING', [], 5_000), op('b', 2)], { nowMs: 1_000 });
    expect(plan.send.map((o) => o.opId)).toEqual(['b']);
    expect(plan.held).toEqual([{ op: expect.objectContaining({ opId: 'a', state: 'PENDING' }), reason: 'BACKOFF', blockedBy: [] }]);
    expect(nextSendable([op('a', 1, 'PENDING', [], 5_000)], { nowMs: 5_000 }).send).toHaveLength(1);
  });

  it('F12 unit: the batch limit keeps the first operations in seq order', () => {
    const outbox = Array.from({ length: 150 }, (_, i) => op(`op${i}`, 150 - i));
    const plan = nextSendable(outbox, { limit: 100 });
    expect(plan.send).toHaveLength(100);
    expect(plan.send[0]!.seq).toBe(1);
    expect(plan.send[99]!.seq).toBe(100);
  });

  it('F12 unit: only PENDING operations are sent; syncing, synced, failed, and action-required ones are not', () => {
    const plan = nextSendable(QUEUE_STATES.map((s, i) => op(s, i, s)));
    expect(plan.send.map((o) => o.opId)).toEqual(['PENDING']);
  });
});

// Random outboxes: distinct seqs, dependencies only on earlier ops (as the app records them), random states.
const outboxArb = fc
  .array(fc.record({ state: fc.constantFrom(...QUEUE_STATES), deps: fc.array(fc.nat(), { maxLength: 3 }), backoff: fc.boolean() }), { maxLength: 30 })
  .chain((items) =>
    fc.shuffledSubarray(
      items.map((item, i): OrderableOp => ({
        opId: `op${i}`,
        seq: i * 2 + 1,
        state: item.state,
        dependsOn: i === 0 ? [] : [...new Set(item.deps.map((d) => `op${d % i}`))],
        nextAttemptAt: item.backoff ? 10 : null,
      })),
      { minLength: items.length, maxLength: items.length },
    ),
  );

describe('F12 · ordering properties', () => {
  it('F12-AC4 (US-052) (property) the plan is in seq order and never sends a dependent before its dependency is synced', () => {
    fc.assert(
      fc.property(outboxArb, fc.integer({ min: 0, max: 20 }), (outbox, nowMs) => {
        const byId = new Map(outbox.map((o) => [o.opId, o]));
        const plan = nextSendable(outbox, { nowMs });
        const seqs = plan.send.map((o) => o.seq);
        expect(seqs).toEqual([...seqs].sort((a, b) => a - b));
        for (const sent of plan.send) {
          expect(sent.state).toBe('PENDING');
          for (const dep of sent.dependsOn) expect(byId.get(dep)?.state ?? 'SYNCED').toBe('SYNCED');
        }
        // Every pending operation is either sent or held, exactly once.
        const pending = outbox.filter((o) => o.state === 'PENDING').map((o) => o.opId).sort();
        expect([...plan.send.map((o) => o.opId), ...plan.held.map((h) => h.op.opId)].sort()).toEqual(pending);
      }),
    );
  });
});
