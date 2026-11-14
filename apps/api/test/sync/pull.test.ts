// F12 · Offline and synchronization — GET /sync/pull against real Postgres
// (docs/specs/04-us-052-sync-queued-changes.md, F12-AC7; NFR-OFF-010). Scope comes from a stand-in for F03.
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { recordScopeChange } from '../../src/modules/sync/change-log.ts';
import { withTenant } from '../../src/platform/tenant.ts';
import { CLASS_A1, CLASS_A2, op, orgIdOf, pull, pushOk, startSyncHarness, type SyncHarness } from './support.ts';

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
  s.assignments.set(await s.h.userId('teacher.a2'), [CLASS_A2]);
});

async function seedTwoClasses() {
  const admin = await s.h.signIn('admin.a');
  const inA1 = op({ fields: { label: 'In A1', status: 'OPEN', classId: CLASS_A1 } });
  const inA2 = op({ fields: { label: 'In A2', status: 'OPEN', classId: CLASS_A2 } });
  await pushOk(s.h, admin, [inA1, inA2]);
  return { admin, a1: inA1.entityId as string, a2: inA2.entityId as string };
}

const ids = (body: { changes: Array<{ entityId: string }> }) => body.changes.map((c) => c.entityId);

describe('F12 · pull', () => {
  it('F12-AC7 (US-052) the first pull bootstraps only the records in the Teacher’s scope', async () => {
    const { a1 } = await seedTwoClasses();
    const res = await pull(s.h, await s.h.signIn('teacher.a1'));
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body).toMatchObject({ hasMore: false, scopeReset: false });
    expect(body.changes).toEqual([
      { entity: 'sync_probe', entityId: a1, rowVersion: 1, op: 'UPSERT', fields: { label: 'In A1', status: 'OPEN', position: 0, classId: CLASS_A1, note: null } },
    ]);
    expect(typeof body.cursor).toBe('string');
  });

  it('F12-AC7 (US-052) a pull with a cursor returns only changes since it, filtered to the Teacher’s scope', async () => {
    const { admin, a1, a2 } = await seedTwoClasses();
    const teacher = await s.h.signIn('teacher.a1');
    const first = (await pull(s.h, teacher)).json();
    // Others change both records on the server.
    await pushOk(s.h, admin, [
      op({ opType: 'UPDATE', entityId: a1, baseVersion: 1, fields: { status: 'DONE' } }),
      op({ opType: 'UPDATE', entityId: a2, baseVersion: 1, fields: { status: 'DONE' } }),
    ]);
    const next = (await pull(s.h, teacher, { cursor: first.cursor })).json();
    expect(next.changes).toEqual([expect.objectContaining({ entityId: a1, rowVersion: 2, op: 'UPSERT', fields: expect.objectContaining({ status: 'DONE' }) })]);
    expect(next.hasMore).toBe(false);
    const after = (await pull(s.h, teacher, { cursor: next.cursor })).json();
    expect(after.changes).toEqual([]);
    expect(after.hasMore).toBe(false);

    // The other Teacher sees only class A2; the Admin sees both.
    expect(ids((await pull(s.h, await s.h.signIn('teacher.a2'))).json())).toEqual([a2]);
    expect(ids((await pull(s.h, admin)).json()).sort()).toEqual([a1, a2].sort());
  });

  it('F12-AC7 (US-052) pages are bounded by the limit and the cursor walks every change exactly once', async () => {
    const admin = await s.h.signIn('admin.a');
    const created = [op(), op(), op()];
    await pushOk(s.h, admin, created);
    const seen: string[] = [];
    let cursor: string | undefined;
    for (let i = 0; i < 5; i++) {
      const body = (await pull(s.h, admin, { limit: '1', ...(cursor ? { cursor } : {}) })).json();
      seen.push(...ids(body));
      cursor = body.cursor;
      if (!body.hasMore) break;
    }
    expect(seen).toEqual(created.map((c) => c.entityId));
  });

  it('F12-AC7 (US-052) another madrasa’s changes never appear, and a Teacher without classes gets nothing', async () => {
    await seedTwoClasses();
    expect((await pull(s.h, await s.h.signIn('admin.b'))).json().changes).toEqual([]);
    s.assignments.delete(await s.h.userId('teacher.a1'));
    expect((await pull(s.h, await s.h.signIn('teacher.a1'))).json().changes).toEqual([]);
  });

  it('F12 unit (decision Q8): a scope change after the cursor answers scopeReset and a fresh bootstrap of the new scope', async () => {
    const { a2 } = await seedTwoClasses();
    const teacher = await s.h.signIn('teacher.a1');
    const first = (await pull(s.h, teacher)).json();
    // F03 will do this when it assigns class A2 to teacher.a1.
    const userId = await s.h.userId('teacher.a1');
    s.assignments.set(userId, [CLASS_A2]);
    const org = await orgIdOf(s.h, 'teacher.a1');
    await withTenant(s.h.db, org, (tx) => recordScopeChange(tx, org, userId, s.h.clock.now()));

    const reset = (await pull(s.h, teacher, { cursor: first.cursor })).json();
    expect(reset).toMatchObject({ changes: [], scopeReset: true, hasMore: true });
    const rebooted = (await pull(s.h, teacher, { cursor: reset.cursor })).json();
    expect(rebooted.scopeReset).toBe(false);
    expect(ids(rebooted)).toEqual([a2]);
  });

  it('F12 unit: an invalid cursor is refused with 400 VALIDATION', async () => {
    const teacher = await s.h.signIn('teacher.a1');
    for (const cursor of ['garbage', 'v1.bm90LWpzb24', `v1.${Buffer.from(JSON.stringify({ m: 'LOG', a: '-1' })).toString('base64url')}`]) {
      const res = await pull(s.h, teacher, { cursor });
      expect(res.statusCode).toBe(400);
      expect(res.json().error).toMatchObject({ code: 'VALIDATION', fields: { cursor: 'INVALID' } });
    }
  });
});
