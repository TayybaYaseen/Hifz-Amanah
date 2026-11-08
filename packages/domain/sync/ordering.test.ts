// F12 · Offline and synchronization — unit: outbox ordering and dependencies (docs/specs/04-f12-offline-sync.md)
import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { nextSendable, type OrderableOp } from './ordering.ts';
import { QUEUE_STATES, type QueueState } from './states.ts';

// Each operation writes its own row unless `entityId` says otherwise.
const op = (opId: string, seq: number, state: QueueState = 'PENDING', dependsOn: string[] = [], nextAttemptAt: number | null = null, entityId = opId): OrderableOp => ({
  opId,
  seq,
  entity: 'daily_record',
  entityId,
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

  it('F12-AC11 (US-054) review N1: edits of one row go out one at a time, in seq order, each after the earlier is synced', () => {
    const first = op('first', 10, 'PENDING', [], null, 'R');
    const second = op('second', 11, 'PENDING', [], null, 'R');
    const otherRow = op('other', 12);
    // Shuffled input; the earlier edit goes first, the later one waits even though nothing else holds it.
    let plan = nextSendable([second, otherRow, first]);
    expect(plan.send.map((o) => o.opId)).toEqual(['first', 'other']);
    expect(plan.held).toEqual([{ op: second, reason: 'WAITING_FOR_EARLIER_EDIT', blockedBy: ['first'] }]);

    // In flight, or backing off after a transport error: the later edit still waits (it must never overtake).
    plan = nextSendable([{ ...first, state: 'SYNCING' }, second]);
    expect(plan.held).toEqual([{ op: second, reason: 'WAITING_FOR_EARLIER_EDIT', blockedBy: ['first'] }]);
    plan = nextSendable([{ ...first, nextAttemptAt: 5_000 }, second], { nowMs: 1_000 });
    expect(plan.send).toEqual([]);
    expect(plan.held.map((h) => [h.op.opId, h.reason])).toEqual([
      ['first', 'BACKOFF'],
      ['second', 'WAITING_FOR_EARLIER_EDIT'],
    ]);

    plan = nextSendable([{ ...first, state: 'SYNCED' }, second]);
    expect(plan.send.map((o) => o.opId)).toEqual(['second']);
    // Synced and cleaned up: gone from the outbox, no longer holds anything.
    expect(nextSendable([second]).send).toEqual([second]);
  });

  it('F12 edge case (review N1): an earlier edit of the row that failed or needs action holds later edits as "waiting for record"', () => {
    const later = op('later', 3, 'PENDING', [], null, 'R');
    for (const state of ['FAILED', 'ACTION_REQUIRED'] as const) {
      const plan = nextSendable([op('earlier', 2, state, [], null, 'R'), later]);
      expect(plan.send).toEqual([]);
      expect(plan.held).toEqual([{ op: later, reason: 'WAITING_FOR_RECORD', blockedBy: ['earlier'] }]);
    }
    // A later edit never holds an earlier one.
    expect(nextSendable([op('earlier', 2, 'PENDING', [], null, 'R'), { ...later, state: 'FAILED' }]).send.map((o) => o.opId)).toEqual(['earlier']);
  });

  it('F12-AC4 (US-052) an UPDATE that depends on its row’s CREATE is held once, as waiting for the dependency', () => {
    const plan = nextSendable([op('create', 1, 'PENDING', [], null, 'R'), op('update', 2, 'PENDING', ['create'], null, 'R')]);
    expect(plan.send.map((o) => o.opId)).toEqual(['create']);
    expect(plan.held).toEqual([{ op: expect.objectContaining({ opId: 'update' }), reason: 'WAITING_FOR_DEPENDENCY', blockedBy: ['create'] }]);
  });

  it('F12 unit: the same entity id under another entity is another row', () => {
    const a = op('a', 1, 'PENDING', [], null, 'R');
    const b = { ...op('b', 2, 'PENDING', [], null, 'R'), entity: 'lesson_portion' };
    expect(nextSendable([a, b]).send.map((o) => o.opId)).toEqual(['a', 'b']);
  });

  it('F12 unit: only PENDING operations are sent; syncing, synced, failed, and action-required ones are not', () => {
    const plan = nextSendable(QUEUE_STATES.map((s, i) => op(s, i, s)));
    expect(plan.send.map((o) => o.opId)).toEqual(['PENDING']);
  });
});

// Random outboxes: distinct seqs, dependencies only on earlier ops (as the app records them), random states, and
// a few rows shared by several operations.
const outboxArb = fc
  .array(
    fc.record({ state: fc.constantFrom(...QUEUE_STATES), deps: fc.array(fc.nat(), { maxLength: 3 }), backoff: fc.boolean(), row: fc.integer({ min: 0, max: 4 }) }),
    { maxLength: 30 },
  )
  .chain((items) =>
    fc.shuffledSubarray(
      items.map((item, i): OrderableOp => ({
        opId: `op${i}`,
        seq: i * 2 + 1,
        entity: 'daily_record',
        entityId: `row${item.row}`,
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
        // Per row (review N1): nothing is sent while an earlier operation on that row is not SYNCED, so at most one
        // operation per row is sent and each row advances strictly in seq order.
        for (const sent of plan.send) {
          const earlier = outbox.filter((o) => o.entity === sent.entity && o.entityId === sent.entityId && o.seq < sent.seq);
          for (const prior of earlier) expect(prior.state).toBe('SYNCED');
        }
        const rows = plan.send.map((o) => `${o.entity}:${o.entityId}`);
        expect(new Set(rows).size).toBe(rows.length);
        // Every pending operation is either sent or held, exactly once.
        const pending = outbox.filter((o) => o.state === 'PENDING').map((o) => o.opId).sort();
        expect([...plan.send.map((o) => o.opId), ...plan.held.map((h) => h.op.opId)].sort()).toEqual(pending);
      }),
    );
  });
});
