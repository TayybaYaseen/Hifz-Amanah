// F12 · Row-level security on the sync tables (ADR-006, plan decision Q9) and the append-only change log.
// With app.current_org_id set to Madrasa A inside a tenant transaction, Madrasa B's rows in every sync table are
// invisible and cannot be written. The embedded database connects as a superuser, which bypasses RLS, so these
// tests also prove that withTenant()'s role switch is what makes the policies apply.
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { sql } from 'kysely';
import { v7 as uuidv7 } from 'uuid';
import { withTenant } from '../../src/platform/tenant.ts';
import type { Db, Tx } from '../../src/platform/db.ts';
import { orgIdOf, startSyncHarness, type SyncHarness } from './support.ts';

let s: SyncHarness;
let orgA: string;
let orgB: string;
let userA: string;
let userB: string;

const TABLES = ['sync_ops', 'change_log', 'sync_conflicts', 'scope_changes'] as const;

beforeAll(async () => {
  s = await startSyncHarness();
}, 60_000);

afterAll(async () => {
  await s?.h.stop();
});

/** Inserts one row per sync table for an organization, as the (superuser) owner connection. */
async function seed(db: Db, org: string, user: string): Promise<void> {
  const opId = uuidv7();
  const now = new Date();
  await db.transaction().execute(async (tx) => {
    await tx
      .insertInto('sync_ops')
      .values({ op_id: opId, organization_id: org, user_id: user, device_id: uuidv7(), entity: 'sync_probe', entity_id: uuidv7(), op_hash: Buffer.alloc(32), status: 'CONFLICT', result: '{}', received_at: now })
      .execute();
    await tx
      .insertInto('change_log')
      .values({ organization_id: org, entity: 'sync_probe', entity_id: uuidv7(), row_version: 1, op: 'UPSERT', changed_fields: ['label'], student_id: null, class_id: null, actor_user_id: user, op_id: opId, at: now })
      .execute();
    await tx
      .insertInto('sync_conflicts')
      .values({
        id: uuidv7(),
        organization_id: org,
        entity: 'sync_probe',
        entity_id: uuidv7(),
        base_version: 1,
        server_version: 2,
        device_fields: '{}',
        server_fields: '{}',
        conflict_fields: ['status'],
        student_id: null,
        class_id: null,
        caused_by_user_id: user,
        op_id: opId,
        status: 'OPEN',
        resolved_by: null,
        resolved_at: null,
        resolution: null,
        created_at: now,
      })
      .execute();
    await tx.insertInto('scope_changes').values({ organization_id: org, user_id: user, at: now }).execute();
  });
}

async function orgsVisible(table: string, org: string | null): Promise<string[]> {
  if (org === null) {
    // The tenant role with no organization set: nothing is visible (fail closed).
    return s.h.db.transaction().execute(async (tx) => {
      await sql`SET LOCAL ROLE hifz_tenant`.execute(tx);
      const { rows } = await sql<{ organization_id: string }>`SELECT organization_id FROM ${sql.table(table)}`.execute(tx);
      return rows.map((r) => r.organization_id);
    });
  }
  return withTenant(s.h.db, org, async (tx) => {
    const { rows } = await sql<{ organization_id: string }>`SELECT DISTINCT organization_id FROM ${sql.table(table)}`.execute(tx);
    return rows.map((r) => r.organization_id);
  });
}

beforeEach(async () => {
  await s.h.reset();
  orgA = await orgIdOf(s.h, 'admin.a');
  orgB = await orgIdOf(s.h, 'admin.b');
  userA = await s.h.userId('admin.a');
  userB = await s.h.userId('admin.b');
  await seed(s.h.db, orgA, userA);
  await seed(s.h.db, orgB, userB);
});

describe('F12 · row-level security (decision Q9)', () => {
  for (const table of TABLES) {
    it(`F12 unit: with Madrasa A's setting, Madrasa B's ${table} rows are invisible`, async () => {
      expect(await orgsVisible(table, orgA)).toEqual([orgA]);
      expect(await orgsVisible(table, orgB)).toEqual([orgB]);
      expect(await orgsVisible(table, null)).toEqual([]);
    });
  }

  it('F12 unit: with Madrasa A’s setting, rows for Madrasa B cannot be inserted into any sync table', async () => {
    const now = new Date();
    const attempts: Record<string, (tx: Tx) => Promise<unknown>> = {
      sync_ops: (tx) =>
        tx
          .insertInto('sync_ops')
          .values({ op_id: uuidv7(), organization_id: orgB, user_id: userB, device_id: uuidv7(), entity: 'sync_probe', entity_id: uuidv7(), op_hash: Buffer.alloc(32), status: 'REJECTED', result: '{}', received_at: now })
          .execute(),
      change_log: (tx) =>
        tx
          .insertInto('change_log')
          .values({ organization_id: orgB, entity: 'sync_probe', entity_id: uuidv7(), row_version: 1, op: 'UPSERT', changed_fields: [], student_id: null, class_id: null, actor_user_id: userB, op_id: null, at: now })
          .execute(),
      sync_conflicts: async (tx) => {
        const opId = uuidv7();
        await tx
          .insertInto('sync_ops')
          .values({ op_id: opId, organization_id: orgA, user_id: userA, device_id: uuidv7(), entity: 'sync_probe', entity_id: uuidv7(), op_hash: Buffer.alloc(32), status: 'CONFLICT', result: '{}', received_at: now })
          .execute();
        return tx
          .insertInto('sync_conflicts')
          .values({
            id: uuidv7(),
            organization_id: orgB,
            entity: 'sync_probe',
            entity_id: uuidv7(),
            base_version: 1,
            server_version: 2,
            device_fields: '{}',
            server_fields: '{}',
            conflict_fields: [],
            student_id: null,
            class_id: null,
            caused_by_user_id: userB,
            op_id: opId,
            status: 'OPEN',
            resolved_by: null,
            resolved_at: null,
            resolution: null,
            created_at: now,
          })
          .execute();
      },
      scope_changes: (tx) => tx.insertInto('scope_changes').values({ organization_id: orgB, user_id: userB, at: now }).execute(),
    };
    for (const [table, attempt] of Object.entries(attempts)) {
      await expect(withTenant(s.h.db, orgA, attempt), table).rejects.toThrow(/row-level security/);
    }
    for (const table of TABLES) expect(await orgsVisible(table, orgB)).toEqual([orgB]);
    const { rows } = await sql<{ n: string }>`SELECT count(*) AS n FROM sync_ops WHERE organization_id = ${orgB}`.execute(s.h.db);
    expect(Number(rows[0]!.n)).toBe(1);
  });

  it('F12 unit: a tenant transaction cannot move a conflict to another madrasa', async () => {
    await withTenant(s.h.db, orgA, async (tx) => {
      const result = await tx.updateTable('sync_conflicts').set({ status: 'RESOLVED', resolved_at: new Date(), resolved_by: userA }).where('organization_id', '=', orgB).executeTakeFirst();
      expect(Number(result.numUpdatedRows)).toBe(0);
    });
    await expect(
      withTenant(s.h.db, orgA, (tx) => tx.updateTable('sync_conflicts').set({ organization_id: orgB }).where('organization_id', '=', orgA).execute()),
    ).rejects.toThrow(/row-level security/);
  });
});

describe('F12 · append-only history', () => {
  it('F12 unit: change_log rows cannot be updated or deleted, even by the owner connection', async () => {
    await expect(sql`UPDATE change_log SET row_version = 9`.execute(s.h.db)).rejects.toThrow(/append-only/);
    await expect(sql`DELETE FROM change_log`.execute(s.h.db)).rejects.toThrow(/append-only/);
  });

  it('F12 unit: the tenant role has no UPDATE or DELETE on change_log and sync_ops', async () => {
    for (const statement of [sql`UPDATE change_log SET row_version = 9`, sql`DELETE FROM sync_ops`, sql`UPDATE sync_ops SET status = 'APPLIED'`]) {
      await expect(withTenant(s.h.db, orgA, (tx) => statement.execute(tx))).rejects.toThrow(/permission denied/);
    }
  });
});
