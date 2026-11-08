// F12 · Offline and synchronization — POST /sync/push against real Postgres (docs/specs/04-f12-offline-sync.md).
// Drives the engine through the test-only sync_probe entity (plan decision Q1).
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { sql } from 'kysely';
import { v7 as uuidv7 } from 'uuid';
import { CLASS_A1, CLASS_A2, count, op, probeRow, push, pushOk, resend, startSyncHarness, type SyncHarness } from './support.ts';

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
  s.assignments.set(await s.h.userId('teacher.a2'), [CLASS_A1, CLASS_A2]);
});

describe('F12 · push: client ids and idempotency', () => {
  it('F12-AC3 (US-051) the server keeps the client-generated UUIDv7 as the record id', async () => {
    const teacher = await s.h.signIn('teacher.a1');
    const create = op();
    const [result] = await pushOk(s.h, teacher, [create]);
    expect(result).toEqual({ opId: create.opId, status: 'APPLIED', rowVersion: 1, entityId: create.entityId });
    const row = await probeRow(s.h, create.entityId as string);
    expect(row).toMatchObject({ id: create.entityId, label: 'Probe', status: 'OPEN', class_id: CLASS_A1 });
    expect(Number(row!.row_version)).toBe(1);
  });

  it('F12-AC5 (US-052) replaying a CREATE and an UPDATE twice returns the stored results and creates nothing', async () => {
    const teacher = await s.h.signIn('teacher.a1');
    const create = op();
    const update = op({ opType: 'UPDATE', entityId: create.entityId as string, baseVersion: 1, fields: { status: 'DONE' } });
    const first = await pushOk(s.h, teacher, [create, update]);
    const second = await pushOk(s.h, teacher, [resend(create), resend(update)]);
    const third = await pushOk(s.h, teacher, [resend(create), resend(update)]);
    expect(second).toEqual(first);
    expect(third).toEqual(first);
    expect(first[1]).toMatchObject({ status: 'APPLIED', rowVersion: 2 });

    expect(await count(s.h, 'sync_probe')).toBe(1);
    expect(Number((await probeRow(s.h, create.entityId as string))!.row_version)).toBe(2);
    expect(await count(s.h, 'change_log')).toBe(2);
    expect(await count(s.h, 'sync_ops')).toBe(2);
  });

  it('F12-AC5 (US-052) a replayed REJECTED result is returned as stored', async () => {
    const teacher = await s.h.signIn('teacher.a1');
    const bad = op({ entity: 'attendance_record' });
    const first = await pushOk(s.h, teacher, [bad]);
    expect(await pushOk(s.h, teacher, [resend(bad)])).toEqual(first);
    expect(await count(s.h, 'sync_ops')).toBe(1);
  });

  it('F12 unit: a reused op id with another payload, another user, or another madrasa is OP_ID_REUSED and reveals nothing', async () => {
    const a1 = await s.h.signIn('teacher.a1');
    const create = op();
    await pushOk(s.h, a1, [create]);

    const changed = { ...resend(create), fields: { label: 'Changed', status: 'OPEN', classId: CLASS_A1 } };
    expect(await pushOk(s.h, a1, [changed])).toEqual([{ opId: create.opId, status: 'REJECTED', code: 'OP_ID_REUSED' }]);

    const a2 = await s.h.signIn('teacher.a2');
    expect(await pushOk(s.h, a2, [resend(create)])).toEqual([{ opId: create.opId, status: 'REJECTED', code: 'OP_ID_REUSED' }]);

    const otherMadrasa = await s.h.signIn('admin.b');
    const fresh = { ...resend(create), entityId: uuidv7() };
    expect(await pushOk(s.h, otherMadrasa, [fresh])).toEqual([{ opId: create.opId, status: 'REJECTED', code: 'OP_ID_REUSED' }]);
    // Nothing of the refused operations was written, in either madrasa.
    expect(await count(s.h, 'sync_probe')).toBe(1);
    expect(await count(s.h, 'change_log')).toBe(1);
    expect(await count(s.h, 'sync_ops')).toBe(1);
  });

  it('F12-AC3 (US-051) an id already used, in this or another madrasa, is REJECTED ID_TAKEN without detail', async () => {
    const teacher = await s.h.signIn('teacher.a1');
    const create = op();
    await pushOk(s.h, teacher, [create]);
    const again = op({ entityId: create.entityId as string });
    expect(await pushOk(s.h, teacher, [again])).toEqual([{ opId: again.opId, status: 'REJECTED', code: 'ID_TAKEN' }]);
    const adminB = await s.h.signIn('admin.b');
    const elsewhere = op({ entityId: create.entityId as string, fields: { label: 'B', status: 'OPEN' } });
    expect(await pushOk(s.h, adminB, [elsewhere])).toEqual([{ opId: elsewhere.opId, status: 'REJECTED', code: 'ID_TAKEN' }]);
    expect(await count(s.h, 'sync_probe')).toBe(1);
  });
});

describe('F12 · push: dependencies, validation, scope', () => {
  it('F12-AC4 (US-052) an operation whose dependency is not applied gets RETRY DEPENDENCY_PENDING and is not stored', async () => {
    const teacher = await s.h.signIn('teacher.a1');
    const create = op();
    const dependent = op({ opType: 'UPDATE', entityId: create.entityId as string, fields: { status: 'DONE' }, dependsOn: [create.opId as string] });
    expect(await pushOk(s.h, teacher, [dependent])).toEqual([{ opId: dependent.opId, status: 'RETRY', code: 'DEPENDENCY_PENDING' }]);
    expect((await s.h.control('GET', `/sync/ops/${dependent.opId}`)).statusCode).toBe(404);
    expect(await count(s.h, 'sync_probe')).toBe(0);

    // In outbox order, in one request, the record is applied first and then its dependent.
    const results = await pushOk(s.h, teacher, [create, resend(dependent)]);
    expect(results.map((r) => r.status)).toEqual(['APPLIED', 'APPLIED']);
    expect((await probeRow(s.h, create.entityId as string))!.status).toBe('DONE');
  });

  it('F12-AC4 (US-052) a dependency that was rejected keeps the dependent waiting', async () => {
    const teacher = await s.h.signIn('teacher.a1');
    const bad = op({ fields: { label: '', status: 'OPEN', classId: CLASS_A1 } });
    const dependent = op({ dependsOn: [bad.opId as string] });
    const results = await pushOk(s.h, teacher, [bad, dependent]);
    expect(results[0]).toMatchObject({ status: 'REJECTED', code: 'VALIDATION', fields: { label: 'INVALID' } });
    expect(results[1]).toEqual({ opId: dependent.opId, status: 'RETRY', code: 'DEPENDENCY_PENDING' });
  });

  it('F12 unit: an entity with no registered handler is REJECTED ENTITY_NOT_SUPPORTED', async () => {
    const teacher = await s.h.signIn('teacher.a1');
    const attendance = op({ entity: 'attendance_record', fields: { status: 'PRESENT' } });
    expect(await pushOk(s.h, teacher, [attendance])).toEqual([{ opId: attendance.opId, status: 'REJECTED', code: 'ENTITY_NOT_SUPPORTED' }]);
    const command = op({ opType: 'COMMAND', command: 'CONFIRM_HOMEWORK', baseVersion: 1, fields: {} });
    expect((await pushOk(s.h, teacher, [command]))[0]).toMatchObject({ status: 'REJECTED', code: 'VALIDATION', fields: { opType: 'NOT_SUPPORTED' } });
  });

  it('F12 unit: handler schemas are strict — client totals, roles, and unknown fields are refused', async () => {
    const teacher = await s.h.signIn('teacher.a1');
    const withTotal = op({ fields: { label: 'X', status: 'OPEN', classId: CLASS_A1, total: 5 } });
    expect((await pushOk(s.h, teacher, [withTotal]))[0]).toMatchObject({ status: 'REJECTED', code: 'VALIDATION', fields: { total: 'NOT_ALLOWED' } });
    // Reserved keys never get past the envelope.
    const withOrg = op({ fields: { label: 'X', status: 'OPEN', organizationId: uuidv7() } });
    const res = await push(s.h, teacher, [withOrg]);
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe('VALIDATION');
    expect(await count(s.h, 'sync_probe')).toBe(0);
  });

  it('F12 unit: one rejected operation does not roll back the others in the same push', async () => {
    const teacher = await s.h.signIn('teacher.a1');
    const good1 = op();
    const bad = op({ fields: { label: 'X', status: 'NOPE', classId: CLASS_A1 } });
    const good2 = op();
    const results = await pushOk(s.h, teacher, [good1, bad, good2]);
    expect(results.map((r) => r.status)).toEqual(['APPLIED', 'REJECTED', 'APPLIED']);
    expect(await count(s.h, 'sync_probe')).toBe(2);
  });

  it('F12-AC7 (US-052) a Teacher cannot create or change records outside their assigned classes (NOT_FOUND)', async () => {
    const teacher = await s.h.signIn('teacher.a1');
    const admin = await s.h.signIn('admin.a');
    const outside = op({ fields: { label: 'A2', status: 'OPEN', classId: CLASS_A2 } });
    expect(await pushOk(s.h, teacher, [outside])).toEqual([{ opId: outside.opId, status: 'REJECTED', code: 'NOT_FOUND' }]);

    const adminCreate = op({ fields: { label: 'A2', status: 'OPEN', classId: CLASS_A2 } });
    await pushOk(s.h, admin, [adminCreate]);
    const edit = op({ opType: 'UPDATE', entityId: adminCreate.entityId as string, fields: { status: 'DONE' } });
    expect(await pushOk(s.h, teacher, [edit])).toEqual([{ opId: edit.opId, status: 'REJECTED', code: 'NOT_FOUND' }]);
    // A madrasa-B admin cannot reach a Madrasa A record either.
    const adminB = await s.h.signIn('admin.b');
    const probe = op({ opType: 'UPDATE', entityId: adminCreate.entityId as string, fields: { status: 'DONE' } });
    expect(await pushOk(s.h, adminB, [probe])).toEqual([{ opId: probe.opId, status: 'REJECTED', code: 'NOT_FOUND' }]);
    expect((await probeRow(s.h, adminCreate.entityId as string))!.status).toBe('OPEN');
  });
});

describe('F12 · push and pull: whole-request refusals', () => {
  it('F12 unit: Students and Parents are refused with 403 FORBIDDEN on every sync route', async () => {
    for (const who of ['student.s1', 'parent.p1'] as const) {
      const token = await s.h.signIn(who);
      const id = uuidv7();
      const responses = [
        await push(s.h, token, [op()]),
        await s.h.call('GET', '/sync/pull', token),
        await s.h.call('GET', '/sync/conflicts', token),
        await s.h.call('GET', `/sync/conflicts/${id}`, token),
        await s.h.call('POST', `/sync/conflicts/${id}/resolve`, token, { choice: 'KEEP_SERVER' }),
      ];
      for (const res of responses) {
        expect(res.statusCode).toBe(403);
        expect(res.json().error.code).toBe('FORBIDDEN');
      }
    }
    expect(await count(s.h, 'sync_probe')).toBe(0);
  });

  it('F12 unit: without a session every sync route is 401', async () => {
    expect((await s.h.call('POST', '/sync/push', null, { protocolVersion: 1, deviceId: uuidv7(), ops: [op()] })).statusCode).toBe(401);
    expect((await s.h.call('GET', '/sync/pull', null)).statusCode).toBe(401);
  });

  it('F12-AC15 (US-052) a protocol below the minimum gets 426 UPGRADE_REQUIRED on push and pull and nothing is applied', async () => {
    const teacher = await s.h.signIn('teacher.a1');
    expect((await s.h.control('POST', '/sync/min-protocol', { version: 2 })).statusCode).toBe(200);
    const res = await push(s.h, teacher, [op()], 1);
    expect(res.statusCode).toBe(426);
    expect(res.json().error.code).toBe('UPGRADE_REQUIRED');
    const pulled = await s.h.call('GET', '/sync/pull', teacher);
    expect(pulled.statusCode).toBe(426);
    expect(pulled.json().error.code).toBe('UPGRADE_REQUIRED');
    expect(await count(s.h, 'sync_probe')).toBe(0);
    expect(await count(s.h, 'sync_ops')).toBe(0);

    expect((await push(s.h, teacher, [op()], 2)).statusCode).toBe(200);
    expect((await s.h.call('GET', '/sync/pull?protocolVersion=2', teacher)).statusCode).toBe(200);
    // The server reset restores the configured minimum.
    await s.h.reset();
    expect((await push(s.h, await s.h.signIn('teacher.a1'), [op()], 1)).statusCode).toBe(200);
  });

  it('F12-AC6 (US-052) test control makes the next push/pull fail temporarily, applying nothing', async () => {
    const teacher = await s.h.signIn('teacher.a1');
    await s.h.control('POST', '/sync/fail-next', { count: 2, status: 503 });
    const create = op();
    expect((await push(s.h, teacher, [create])).statusCode).toBe(503);
    expect((await s.h.call('GET', '/sync/pull', teacher)).statusCode).toBe(503);
    expect(await count(s.h, 'sync_probe')).toBe(0);
    expect((await push(s.h, teacher, [resend(create)])).statusCode).toBe(200);
    expect(await count(s.h, 'sync_probe')).toBe(1);
  });

  it('F12 unit: operation fields and note bodies never reach the logs, the audit log, or sync_ops', async () => {
    const SECRET = 'Private-note-body-5512';
    const teacher = await s.h.signIn('teacher.a1');
    const create = op({ fields: { label: 'Probe', status: 'OPEN', classId: CLASS_A1, note: SECRET } });
    const update = op({ opType: 'UPDATE', entityId: create.entityId as string, fields: { note: `${SECRET}-edited` } });
    const invalid = op({ fields: { label: 'Probe', status: 'BAD', note: `${SECRET}-invalid` } });
    expect((await pushOk(s.h, teacher, [create, update, invalid])).map((r) => r.status)).toEqual(['APPLIED', 'APPLIED', 'REJECTED']);
    await s.h.call('GET', '/sync/pull', teacher);
    expect(s.h.logSink.lines.length).toBeGreaterThan(0);
    expect(s.h.logSink.lines.filter((line) => line.includes(SECRET))).toEqual([]);
    for (const table of ['audit_logs', 'sync_ops', 'change_log']) {
      const { rows } = await sql<{ n: string }>`SELECT count(*) AS n FROM ${sql.table(table)} t WHERE strpos(t::text, ${SECRET}) > 0`.execute(s.h.db);
      expect(Number(rows[0]!.n), table).toBe(0);
    }
  });

  it('F12 unit: test control exposes a stored operation result without its fields', async () => {
    const teacher = await s.h.signIn('teacher.a1');
    const create = op({ fields: { label: 'Visible-Label-XYZ', status: 'OPEN', classId: CLASS_A1 } });
    await pushOk(s.h, teacher, [create]);
    const res = await s.h.control('GET', `/sync/ops/${create.opId}`);
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ opId: create.opId, status: 'APPLIED', userId: await s.h.userId('teacher.a1'), result: { status: 'APPLIED', rowVersion: 1 } });
    expect(res.body).not.toContain('Visible-Label-XYZ');
    const { rows } = await sql<{ n: string }>`SELECT count(*) AS n FROM sync_ops WHERE result::text LIKE '%Visible-Label-XYZ%'`.execute(s.h.db);
    expect(Number(rows[0]!.n)).toBe(0);
  });
});
