// F12 · Offline and synchronization — coupled field groups at push and in resolution (review M2; plan decision
// Q5; docs/specs/04-us-054-resolve-conflicting-edits.md). TEST ONLY: a variant of the sync_probe handler whose
// `status` and `note` form one coupled group, standing in for F04/F05 groups such as attempt status + completed +
// quality + mistakes. Synthetic data only.
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { defineFieldSpec } from '@hifz/domain/sync';
import type { SyncHandler } from '../../src/modules/sync/handler.ts';
import { syncProbeHandler } from '../support/sync-probe.ts';
import { CLASS_A1, count, op, probeRow, pushOk, startSyncHarness, type SyncHarness } from './support.ts';

const groupedProbeHandler: SyncHandler = {
  ...syncProbeHandler,
  fieldSpec: defineFieldSpec({ entity: 'sync_probe', safe: { position: 'SERVER_WINS' }, groups: [['status', 'note']] }),
};

let s: SyncHarness;

beforeAll(async () => {
  s = await startSyncHarness([groupedProbeHandler]);
}, 60_000);

afterAll(async () => {
  await s?.h.stop();
});

beforeEach(async () => {
  await s.h.reset();
  s.assignments.clear();
  s.assignments.set(await s.h.userId('teacher.a1'), [CLASS_A1]);
});

async function created(): Promise<{ admin: string; teacher: string; id: string }> {
  const admin = await s.h.signIn('admin.a');
  const teacher = await s.h.signIn('teacher.a1');
  const create = op({ fields: { label: 'Probe', status: 'OPEN', classId: CLASS_A1, note: null } });
  await pushOk(s.h, admin, [create]);
  return { admin, teacher, id: create.entityId as string };
}

describe('F12 · coupled groups travel whole (Q5)', () => {
  it('F12-AC11 (US-054) an UPDATE carrying part of a coupled group is REJECTED VALIDATION naming the missing members', async () => {
    const { teacher, id } = await created();
    const partial = op({ opType: 'UPDATE', entityId: id, baseVersion: 1, fields: { status: 'DONE', label: 'L' } });
    expect(await pushOk(s.h, teacher, [partial])).toEqual([{ opId: partial.opId, status: 'REJECTED', code: 'VALIDATION', fields: { note: 'GROUP_INCOMPLETE' } }]);
    expect(await probeRow(s.h, id)).toMatchObject({ status: 'OPEN', label: 'Probe' });
    // The whole group, or no member of it, is accepted.
    const whole = op({ opType: 'UPDATE', entityId: id, baseVersion: 1, fields: { status: 'DONE', note: null } });
    const outside = op({ opType: 'UPDATE', entityId: id, baseVersion: 2, fields: { label: 'L' } });
    expect((await pushOk(s.h, teacher, [whole, outside])).map((r) => r.status)).toEqual(['APPLIED', 'APPLIED']);
  });

  it('F12-AC12 (US-054) a conflicting group is compared, picked, and kept as a unit; KEEP_DEVICE never writes a partial group', async () => {
    const { admin, teacher, id } = await created();
    // The server changed only the note; the device changed only the status. Same group: one conflict.
    await pushOk(s.h, admin, [op({ opType: 'UPDATE', entityId: id, baseVersion: 1, fields: { status: 'OPEN', note: 'Server note' } })]);
    const [result] = await pushOk(s.h, teacher, [op({ opType: 'UPDATE', entityId: id, baseVersion: 1, fields: { status: 'HELD', note: null } })]);
    expect(result).toMatchObject({ status: 'CONFLICT' });
    const conflictId = (result as { conflictId: string }).conflictId;

    const detail = (await s.h.call('GET', `/sync/conflicts/${conflictId}`, teacher)).json();
    expect(detail.fieldDiff).toEqual([
      { field: 'status', device: 'HELD', server: 'OPEN', conflicting: true, group: ['status', 'note'] },
      { field: 'note', device: null, server: 'Server note', conflicting: true, group: ['status', 'note'] },
    ]);

    const resolveWith = (body: Record<string, unknown>) => s.h.call('POST', `/sync/conflicts/${conflictId}/resolve`, teacher, body);
    // Every field shown needs a pick, and a group cannot be split.
    expect((await resolveWith({ choice: 'MERGE', picks: { status: 'DEVICE' } })).json().error).toMatchObject({ code: 'VALIDATION', fields: { note: 'PICK_MISSING' } });
    expect((await resolveWith({ choice: 'MERGE', picks: { status: 'DEVICE', note: 'SERVER' } })).json().error).toMatchObject({
      code: 'VALIDATION',
      fields: { status: 'PICK_SPLITS_GROUP', note: 'PICK_SPLITS_GROUP' },
    });
    expect(await count(s.h, 'sync_conflicts')).toBe(1);

    // KEEP_DEVICE writes the device's whole group: status HELD with the device's (empty) note, not the server's.
    const kept = await resolveWith({ choice: 'KEEP_DEVICE' });
    expect(kept.statusCode).toBe(200);
    expect(await probeRow(s.h, id)).toMatchObject({ status: 'HELD', note: null });
  });
});
