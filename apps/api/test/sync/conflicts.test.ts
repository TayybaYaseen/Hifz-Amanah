// F12 · Offline and synchronization — conflicts and resolution against real Postgres
// (docs/specs/04-us-054-resolve-conflicting-edits.md). Uses the test-only sync_probe entity (decision Q1).
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { sql } from 'kysely';
import { CLASS_A1, CLASS_A2, count, op, probeRow, pushOk, resend, startSyncHarness, type SyncHarness } from './support.ts';

let s: SyncHarness;

beforeAll(async () => {
  s = await startSyncHarness();
}, 60_000);

afterAll(async () => {
  await s?.h.stop();
});

beforeEach(async () => {
  await s.h.reset();
  s.assignments.clear();
  s.assignments.set(await s.h.userId('teacher.a1'), [CLASS_A1]);
  // teacher.a2 is also assigned to class A1 (the shared-student case of F12-AC17).
  s.assignments.set(await s.h.userId('teacher.a2'), [CLASS_A1, CLASS_A2]);
});

/** A record at version 1, a change already synced from another device (version 2), and a conflicting op. */
async function openConflict(options: { firstFields?: Record<string, unknown>; secondFields?: Record<string, unknown> } = {}) {
  const admin = await s.h.signIn('admin.a');
  const teacher = await s.h.signIn('teacher.a1');
  const create = op({ fields: { label: 'Probe', status: 'OPEN', classId: CLASS_A1, note: null } });
  await pushOk(s.h, admin, [create]);
  const id = create.entityId as string;
  const serverEdit = op({ opType: 'UPDATE', entityId: id, baseVersion: 1, fields: options.firstFields ?? { status: 'DONE' } });
  expect((await pushOk(s.h, admin, [serverEdit]))[0]).toMatchObject({ status: 'APPLIED', rowVersion: 2 });
  const deviceEdit = op({ opType: 'UPDATE', entityId: id, baseVersion: 1, fields: options.secondFields ?? { status: 'HELD' } });
  const [result] = await pushOk(s.h, teacher, [deviceEdit]);
  return { admin, teacher, id, deviceEdit, result: result as { status: string; conflictId?: string } };
}

const audits = async (action: string) =>
  (await s.h.db.selectFrom('audit_logs').selectAll().where('action', '=', action).execute()) as Array<{ summary: Record<string, unknown>; actor_user_id: string; target_id: string }>;

describe('F12 · conflict detection', () => {
  it('F12-AC11 (US-054) two edits of a meaningful field from one base version create a conflict holding both versions', async () => {
    const { id, deviceEdit, result, teacher } = await openConflict();
    expect(result).toEqual({ opId: deviceEdit.opId, status: 'CONFLICT', conflictId: expect.any(String) });
    // Nothing was overwritten (never last-write-wins).
    const row = await probeRow(s.h, id);
    expect(row!.status).toBe('DONE');
    expect(Number(row!.row_version)).toBe(2);

    const detail = await s.h.call('GET', `/sync/conflicts/${result.conflictId}`, teacher);
    expect(detail.statusCode).toBe(200);
    expect(detail.json()).toMatchObject({
      entity: 'sync_probe',
      entityId: id,
      status: 'OPEN',
      baseVersion: 1,
      serverVersion: 2,
      device: { status: 'HELD' },
      server: { status: 'DONE', label: 'Probe' },
      fieldDiff: [{ field: 'status', device: 'HELD', server: 'DONE', conflicting: true, group: null }],
      causedBy: { userId: await s.h.userId('teacher.a1') },
    });
    // The replayed op answers with the same conflict.
    expect(await pushOk(s.h, teacher, [resend(deviceEdit)])).toEqual([result]);
  });

  it('F12-AC11 (US-054) the same value on both sides, or different fields, is not a conflict', async () => {
    const admin = await s.h.signIn('admin.a');
    const teacher = await s.h.signIn('teacher.a1');
    const create = op();
    await pushOk(s.h, admin, [create]);
    const id = create.entityId as string;
    await pushOk(s.h, admin, [op({ opType: 'UPDATE', entityId: id, baseVersion: 1, fields: { status: 'DONE' } })]);
    const same = await pushOk(s.h, teacher, [op({ opType: 'UPDATE', entityId: id, baseVersion: 1, fields: { status: 'DONE' } })]);
    expect(same[0]).toMatchObject({ status: 'APPLIED', rowVersion: 2 });
    const disjoint = await pushOk(s.h, teacher, [op({ opType: 'UPDATE', entityId: id, baseVersion: 1, fields: { label: 'Renamed' } })]);
    expect(disjoint[0]).toMatchObject({ status: 'APPLIED', rowVersion: 3 });
    expect(await probeRow(s.h, id)).toMatchObject({ status: 'DONE', label: 'Renamed' });
    expect(await count(s.h, 'sync_conflicts')).toBe(0);
  });

  it('F12-AC13 (US-054) display order merges without a conflict: the server value is kept, other changes apply', async () => {
    const { id, result } = await openConflict({ firstFields: { position: 5 }, secondFields: { position: 9, label: 'Device label' } });
    expect(result).toMatchObject({ status: 'APPLIED', rowVersion: 3 });
    expect(await probeRow(s.h, id)).toMatchObject({ position: 5, label: 'Device label' });
    expect(await count(s.h, 'sync_conflicts')).toBe(0);
  });

  it('F12 unit (decision Q7): a row with an open conflict answers further edits with that conflict, never a second one', async () => {
    const { id, result, teacher } = await openConflict();
    const later = op({ opType: 'UPDATE', entityId: id, baseVersion: 2, fields: { label: 'Later' } });
    expect(await pushOk(s.h, teacher, [later])).toEqual([{ opId: later.opId, status: 'CONFLICT', conflictId: result.conflictId }]);
    const admin = await s.h.signIn('admin.a');
    const another = op({ opType: 'UPDATE', entityId: id, baseVersion: 2, fields: { status: 'OPEN' } });
    expect((await pushOk(s.h, admin, [another]))[0]).toMatchObject({ status: 'CONFLICT', conflictId: result.conflictId });
    expect(await count(s.h, 'sync_conflicts')).toBe(1);
    expect((await probeRow(s.h, id))!.label).toBe('Probe');
  });
});

describe('F12 · conflict resolution', () => {
  it('F12-AC12 (US-054) the author resolves a conflict as one audited change; the row version and change log advance', async () => {
    const { id, result, teacher } = await openConflict();
    const logBefore = await count(s.h, 'change_log');
    const res = await s.h.call('POST', `/sync/conflicts/${result.conflictId}/resolve`, teacher, { choice: 'KEEP_DEVICE' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ rowVersion: 3 });
    const row = await probeRow(s.h, id);
    expect(row!.status).toBe('HELD');
    expect(Number(row!.row_version)).toBe(3);
    expect(await count(s.h, 'change_log')).toBe(logBefore + 1);

    const conflict = await s.h.db.selectFrom('sync_conflicts').selectAll().where('id', '=', result.conflictId!).executeTakeFirstOrThrow();
    expect(conflict).toMatchObject({ status: 'RESOLVED', resolved_by: await s.h.userId('teacher.a1') });
    expect(conflict.resolution).toEqual({ choice: 'KEEP_DEVICE', picks: { status: 'DEVICE' } });

    const entries = await audits('SYNC_CONFLICT_RESOLVED');
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({ actor_user_id: await s.h.userId('teacher.a1'), target_id: result.conflictId });
    expect(entries[0]!.summary).toEqual({
      entity: 'sync_probe',
      entityId: id,
      choice: 'KEEP_DEVICE',
      fields: ['status'],
      picks: { status: 'DEVICE' },
      values: { status: { from: 'DONE', to: 'HELD' } },
    });

    // Already resolved → 409 CONFLICT_CLOSED; nothing else changes.
    const again = await s.h.call('POST', `/sync/conflicts/${result.conflictId}/resolve`, teacher, { choice: 'KEEP_SERVER' });
    expect(again.statusCode).toBe(409);
    expect(again.json().error.code).toBe('CONFLICT_CLOSED');
    expect(await audits('SYNC_CONFLICT_RESOLVED')).toHaveLength(1);
  });

  it('F12-AC12 (US-054) an Admin resolves a Teacher’s conflict; KEEP_SERVER still advances the version so devices re-read', async () => {
    const { id, result, admin } = await openConflict();
    const res = await s.h.call('POST', `/sync/conflicts/${result.conflictId}/resolve`, admin, { choice: 'KEEP_SERVER' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ rowVersion: 3 });
    expect(await probeRow(s.h, id)).toMatchObject({ status: 'DONE' });
    expect(await audits('SYNC_CONFLICT_RESOLVED')).toHaveLength(1);
  });

  it('F12-AC12 (US-054) MERGE takes a pick per differing field and refuses missing or unknown picks', async () => {
    const { id, result, teacher } = await openConflict({ firstFields: { status: 'DONE' }, secondFields: { status: 'HELD', label: 'Device' } });
    const missing = await s.h.call('POST', `/sync/conflicts/${result.conflictId}/resolve`, teacher, { choice: 'MERGE', picks: { status: 'SERVER' } });
    expect(missing.statusCode).toBe(400);
    expect(missing.json().error).toMatchObject({ code: 'VALIDATION', fields: { label: 'PICK_MISSING' } });
    const unknown = await s.h.call('POST', `/sync/conflicts/${result.conflictId}/resolve`, teacher, {
      choice: 'MERGE',
      picks: { status: 'SERVER', label: 'DEVICE', position: 'DEVICE' },
    });
    expect(unknown.statusCode).toBe(400);
    const ok = await s.h.call('POST', `/sync/conflicts/${result.conflictId}/resolve`, teacher, { choice: 'MERGE', picks: { status: 'SERVER', label: 'DEVICE' } });
    expect(ok.statusCode).toBe(200);
    expect(await probeRow(s.h, id)).toMatchObject({ status: 'DONE', label: 'Device' });
  });

  it('F12-AC12 (US-054) a server row that changed since the conflict opened is 409 CONFLICT_STALE', async () => {
    const { id, result, teacher } = await openConflict();
    // Another write path (not sync) changed the row after the conflict opened.
    await sql`UPDATE sync_probe SET status = 'OPEN', row_version = row_version + 1 WHERE id = ${id}`.execute(s.h.db);
    const res = await s.h.call('POST', `/sync/conflicts/${result.conflictId}/resolve`, teacher, { choice: 'KEEP_DEVICE' });
    expect(res.statusCode).toBe(409);
    expect(res.json().error.code).toBe('CONFLICT_STALE');
    expect(await audits('SYNC_CONFLICT_RESOLVED')).toHaveLength(0);
    expect((await probeRow(s.h, id))!.status).toBe('OPEN');
  });

  it('F12-AC17 (US-054) another Teacher assigned to the same class cannot see or resolve the conflict (404)', async () => {
    const { result } = await openConflict();
    const other = await s.h.signIn('teacher.a2');
    const detail = await s.h.call('GET', `/sync/conflicts/${result.conflictId}`, other);
    expect(detail.statusCode).toBe(404);
    const res = await s.h.call('POST', `/sync/conflicts/${result.conflictId}/resolve`, other, { choice: 'KEEP_SERVER' });
    expect(res.statusCode).toBe(404);
    expect(res.json().error.code).toBe('NOT_FOUND');
    expect((await s.h.call('GET', '/sync/conflicts', other)).json()).toMatchObject({ items: [], total: 0 });
    const conflict = await s.h.db.selectFrom('sync_conflicts').select('status').where('id', '=', result.conflictId!).executeTakeFirstOrThrow();
    expect(conflict.status).toBe('OPEN');
  });

  it('F12-AC17 (US-054) the author loses the conflict when the class is no longer theirs; another madrasa never sees it', async () => {
    const { result, teacher } = await openConflict();
    s.assignments.set(await s.h.userId('teacher.a1'), [CLASS_A2]);
    expect((await s.h.call('POST', `/sync/conflicts/${result.conflictId}/resolve`, teacher, { choice: 'KEEP_DEVICE' })).statusCode).toBe(404);
    const adminB = await s.h.signIn('admin.b');
    expect((await s.h.call('GET', `/sync/conflicts/${result.conflictId}`, adminB)).statusCode).toBe(404);
    expect((await s.h.call('POST', `/sync/conflicts/${result.conflictId}/resolve`, adminB, { choice: 'KEEP_SERVER' })).statusCode).toBe(404);
    expect((await s.h.call('GET', '/sync/conflicts', adminB)).json()).toMatchObject({ items: [], total: 0 });
    expect((await s.h.call('GET', '/sync/conflicts/not-a-uuid', adminB)).statusCode).toBe(404);
  });

  it('F12 unit: the conflict list shows Owner/Admin every conflict and a Teacher only their own, with a safe label', async () => {
    const { result } = await openConflict();
    const owner = await s.h.signIn('owner.a');
    const list = await s.h.call('GET', '/sync/conflicts', owner);
    expect(list.statusCode).toBe(200);
    expect(list.json()).toMatchObject({ page: 1, pageSize: 50, total: 1 });
    expect(list.json().items[0]).toMatchObject({
      id: result.conflictId,
      entity: 'sync_probe',
      status: 'OPEN',
      label: expect.stringMatching(/^Probe /),
      causedBy: { userId: await s.h.userId('teacher.a1'), displayName: expect.any(String) },
    });
    const mine = await s.h.call('GET', '/sync/conflicts?status=OPEN', await s.h.signIn('teacher.a1'));
    expect(mine.json().total).toBe(1);
    expect((await s.h.call('GET', '/sync/conflicts?status=RESOLVED', owner)).json().total).toBe(0);
  });
});

describe('F12 · privacy of conflict data', () => {
  it('F12 unit: note bodies in conflicting fields never reach the audit log or the server logs', async () => {
    const SECRET = 'Private-note-body-7731';
    const { result, teacher } = await openConflict({ firstFields: { note: 'Server-side-note-4410' }, secondFields: { note: SECRET } });
    expect(result.status).toBe('CONFLICT');
    const res = await s.h.call('POST', `/sync/conflicts/${result.conflictId}/resolve`, teacher, { choice: 'KEEP_DEVICE' });
    expect(res.statusCode).toBe(200);
    const [entry] = await audits('SYNC_CONFLICT_RESOLVED');
    expect(entry!.summary).toMatchObject({ fields: ['note'], values: {} });
    expect(JSON.stringify(entry)).not.toContain(SECRET);
    expect(JSON.stringify(entry)).not.toContain('Server-side-note-4410');
    expect(s.h.logSink.lines.some((line) => line.includes(SECRET))).toBe(false);
    const { rows } = await sql<{ n: string }>`SELECT count(*) AS n FROM audit_logs WHERE summary::text LIKE ${`%${SECRET}%`}`.execute(s.h.db);
    expect(Number(rows[0]!.n)).toBe(0);
  });
});
