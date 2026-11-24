// F15 · Migration 0018: AI settings, request trail, and monthly usage (FR-AI-011…013, NFR-AI-003, NFR-PRV-005;
// DEC-B44, DEC-B45, DEC-B46). Constraint, grant, RLS, and retention-policy tests on a fresh database with every
// migration applied, and the upgrade path from 0017. SYNTHETIC DATA ONLY.
import { cpSync, mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { sql } from 'kysely';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createDb, type Db } from '../../src/platform/db.ts';
import { startEmbeddedPostgres, type EmbeddedPostgres } from '../../src/platform/embedded-postgres.ts';
import { MIGRATIONS_DIR, migrate } from '../../src/platform/migrate.ts';
import { withTenant } from '../../src/platform/tenant.ts';

let pg: EmbeddedPostgres;
let db: Db;
const upTo0017 = mkdtempSync(join(tmpdir(), 'hifz-migrations-0017-'));

const ORG_A = '01900000-0000-7000-8000-0000000000a1';
const ORG_B = '01900000-0000-7000-8000-0000000000b1';
const USER_A = '01900000-0000-7000-8000-0000000000a2';
const USER_B = '01900000-0000-7000-8000-0000000000b2';
const HASH = 'a'.repeat(64);
let seq = 0;
const nextId = () => `01900000-0000-7000-8000-${(0x100 + ++seq).toString(16).padStart(12, '0')}`;

beforeAll(async () => {
  pg = await startEmbeddedPostgres();
  db = createDb({ connectionString: pg.connectionString, maxConnections: 1 }).db;
  for (const file of readdirSync(MIGRATIONS_DIR).filter((f) => /^\d{4}_.+\.sql$/.test(f) && f < '0018')) cpSync(join(MIGRATIONS_DIR, file), join(upTo0017, file));
}, 60_000);

afterAll(async () => {
  await db?.destroy();
  await pg?.stop();
  rmSync(upTo0017, { recursive: true, force: true });
});

const insertRequest = (over: Partial<Record<'org' | 'user' | 'locale' | 'outcome' | 'created_at' | 'cost', string>> = {}) => sql`
  INSERT INTO ai_requests (id, organization_id, requested_by, provider, locale, payload, input_hash, outcome, cost_micro_usd, created_at)
  VALUES (${nextId()}, ${over.org ?? ORG_A}, ${over.user ?? USER_A}, 'synthetic-adapter', ${over.locale ?? 'en'}, '{"metrics":{}}'::jsonb,
    ${HASH}, ${over.outcome ?? 'OK'}, ${over.cost ?? '0'}::bigint, ${over.created_at ?? new Date().toISOString()}::timestamptz)`;

const expectCheck = (p: Promise<unknown>) => expect(p).rejects.toThrow(/check constraint/);

describe('F15 · migration 0018 (AI gateway schema)', () => {
  it('upgrades a 0017 database with existing organizations and is a no-op when run again', async () => {
    expect((await migrate(db, upTo0017)).at(-1)).toBe('0017_import_export.sql');
    for (const [org, user, code] of [[ORG_A, USER_A, 'SYNAIA'], [ORG_B, USER_B, 'SYNAIB']] as const) {
      await sql`INSERT INTO organizations (id, kind, name, code) VALUES (${org}, 'MADRASA', 'Madrasa (synthetic)', ${code})`.execute(db);
      await sql`INSERT INTO users (id, organization_id, login_id, password_hash, display_name)
        VALUES (${user}, ${org}, ${`${code}-T1`}, 'x', 'Teacher (synthetic)')`.execute(db);
    }
    expect(await migrate(db)).toEqual(['0018_analytics_ai.sql']);
    expect(await migrate(db)).toEqual([]);
  });

  it('F15-AC10, F15-AC12, F15-AC15 (US-064, US-065) · a fresh settings row has AI off, a USD 10 budget, a daily cap of 20, and all five data categories on', async () => {
    await sql`INSERT INTO org_ai_settings (organization_id) VALUES (${ORG_A})`.execute(db);
    const row = (await db.selectFrom('org_ai_settings').selectAll().where('organization_id', '=', ORG_A).executeTakeFirstOrThrow());
    expect(row).toMatchObject({
      enabled: false,
      provider: null,
      monthly_request_cap: null,
      teacher_daily_cap: 20,
      monthly_budget_micro_usd: '10000000',
      share_attendance: true,
      share_progress: true,
      share_mistakes: true,
      share_quality: true,
      share_homework: true,
      updated_by: null,
    });
    // NFR-AI-003, F15-AC16: there is no column that could opt names, contacts, or notes into a request.
    const cols = await sql<{ column_name: string }>`SELECT column_name FROM information_schema.columns WHERE table_name = 'org_ai_settings'`.execute(db);
    expect(cols.rows.map((c) => c.column_name).filter((c) => /name|contact|phone|email|note/i.test(c))).toEqual([]);
  });

  it('F15-AC11 (US-064) · the budget may only be lowered: above USD 10 or not positive is rejected', async () => {
    await expectCheck(sql`UPDATE org_ai_settings SET monthly_budget_micro_usd = 10000001 WHERE organization_id = ${ORG_A}`.execute(db));
    await expectCheck(sql`UPDATE org_ai_settings SET monthly_budget_micro_usd = 0 WHERE organization_id = ${ORG_A}`.execute(db));
    await sql`UPDATE org_ai_settings SET monthly_budget_micro_usd = 5000000 WHERE organization_id = ${ORG_A}`.execute(db);
  });

  it('F15-AC12 (US-064) · request caps must be positive', async () => {
    await expectCheck(sql`UPDATE org_ai_settings SET teacher_daily_cap = 0 WHERE organization_id = ${ORG_A}`.execute(db));
    await expectCheck(sql`UPDATE org_ai_settings SET teacher_daily_cap = -1 WHERE organization_id = ${ORG_A}`.execute(db));
    await expectCheck(sql`UPDATE org_ai_settings SET monthly_request_cap = 0 WHERE organization_id = ${ORG_A}`.execute(db));
    await sql`UPDATE org_ai_settings SET monthly_request_cap = 200, teacher_daily_cap = 5 WHERE organization_id = ${ORG_A}`.execute(db);
  });

  it('F15-AC10 (US-064) · AI cannot be enabled without a provider (DEC-B45: the vendor stays an opaque adapter id)', async () => {
    await expect(sql`UPDATE org_ai_settings SET enabled = true WHERE organization_id = ${ORG_A}`.execute(db)).rejects.toThrow(/org_ai_settings_enabled_needs_provider/);
    await sql`UPDATE org_ai_settings SET enabled = true, provider = 'synthetic-adapter' WHERE organization_id = ${ORG_A}`.execute(db);
  });

  it('F15-AC18 (US-064) · ai_requests rejects an unknown outcome or locale, a non-hex hash, and a negative cost', async () => {
    await insertRequest().execute(db);
    for (const outcome of ['OK', 'INVALID_OUTPUT', 'WRONG_LANGUAGE', 'TIMEOUT', 'PROVIDER_ERROR']) await insertRequest({ outcome }).execute(db);
    for (const locale of ['ur', 'ur-Latn']) await insertRequest({ locale }).execute(db);
    await expectCheck(insertRequest({ outcome: 'FAILED' }).execute(db));
    await expectCheck(insertRequest({ locale: 'ar' }).execute(db));
    await expectCheck(insertRequest({ cost: '-1' }).execute(db));
    await expectCheck(sql`INSERT INTO ai_requests (id, organization_id, requested_by, provider, locale, payload, input_hash, outcome)
      VALUES (${nextId()}, ${ORG_A}, ${USER_A}, 'p', 'en', '{}'::jsonb, 'not-a-hash', 'OK')`.execute(db));
    // NFR-AI-003: the request trail has no student id or name column.
    const cols = await sql<{ column_name: string }>`SELECT column_name FROM information_schema.columns WHERE table_name = 'ai_requests'`.execute(db);
    expect(cols.rows.map((c) => c.column_name).filter((c) => /student|name|contact|note/i.test(c))).toEqual([]);
  });

  it('F15-AC11 (US-064) · monthly usage rows key on the first day of the month and never go negative', async () => {
    await sql`INSERT INTO ai_usage_monthly (organization_id, month, requests, cost_micro_usd) VALUES (${ORG_A}, '2026-11-01', 1, 1500)`.execute(db);
    await expect(sql`INSERT INTO ai_usage_monthly (organization_id, month) VALUES (${ORG_A}, '2026-11-01')`.execute(db)).rejects.toThrow(/duplicate key/);
    await expectCheck(sql`INSERT INTO ai_usage_monthly (organization_id, month) VALUES (${ORG_A}, '2026-10-15')`.execute(db));
    await expectCheck(sql`INSERT INTO ai_usage_monthly (organization_id, month, requests) VALUES (${ORG_A}, '2026-09-01', -1)`.execute(db));
    await expectCheck(sql`INSERT INTO ai_usage_monthly (organization_id, month, cost_micro_usd) VALUES (${ORG_A}, '2026-08-01', -1)`.execute(db));
  });

  it('F15-AC11 (US-064) · the tenant role upserts usage totals, sees only its madrasa, and cannot delete settings', async () => {
    await withTenant(db, ORG_A, async (tx) => {
      await sql`INSERT INTO ai_usage_monthly (organization_id, month, requests, cost_micro_usd) VALUES (${ORG_A}, '2026-11-01', 1, 500)
        ON CONFLICT (organization_id, month) DO UPDATE SET requests = ai_usage_monthly.requests + EXCLUDED.requests,
          cost_micro_usd = ai_usage_monthly.cost_micro_usd + EXCLUDED.cost_micro_usd`.execute(tx);
      const usage = await tx.selectFrom('ai_usage_monthly').selectAll().where('month', '=', '2026-11-01').executeTakeFirstOrThrow();
      expect(usage).toMatchObject({ requests: 2, cost_micro_usd: '2000' });
    });
    // Madrasa B's rows cannot be written from Madrasa A.
    await expect(withTenant(db, ORG_A, (tx) => sql`INSERT INTO org_ai_settings (organization_id) VALUES (${ORG_B})`.execute(tx))).rejects.toThrow(/row-level security/);
    await sql`INSERT INTO org_ai_settings (organization_id) VALUES (${ORG_B})`.execute(db);
    await insertRequest({ org: ORG_B, user: USER_B }).execute(db);
    await withTenant(db, ORG_A, async (tx) => {
      expect(await tx.selectFrom('org_ai_settings').select('organization_id').execute()).toEqual([{ organization_id: ORG_A }]);
      const others = await tx.selectFrom('ai_requests').select('id').where('organization_id', '=', ORG_B).execute();
      expect(others).toEqual([]);
    });
    await expect(withTenant(db, ORG_A, (tx) => sql`DELETE FROM org_ai_settings`.execute(tx))).rejects.toThrow(/permission denied|never deleted/);
    await expect(sql`DELETE FROM org_ai_settings WHERE organization_id = ${ORG_A}`.execute(db)).rejects.toThrow(/never deleted/);
  });

  it('NFR-PRV-005 / DEC-B44 · the tenant role can delete only AI requests older than 90 days and usage older than a year; requests are never updated', async () => {
    const old = new Date(Date.now() - 91 * 86_400_000).toISOString();
    await insertRequest({ created_at: old }).execute(db);
    await sql`INSERT INTO ai_usage_monthly (organization_id, month) VALUES (${ORG_A}, '2020-01-01')`.execute(db);
    const before = Number((await sql<{ n: string }>`SELECT count(*) AS n FROM ai_requests WHERE organization_id = ${ORG_A}`.execute(db)).rows[0]!.n);
    await withTenant(db, ORG_A, async (tx) => {
      // An unfiltered delete removes only the expired rows; recent rows stay.
      const req = await sql`DELETE FROM ai_requests`.execute(tx);
      expect(Number(req.numAffectedRows)).toBe(1);
      const usage = await sql`DELETE FROM ai_usage_monthly`.execute(tx);
      expect(Number(usage.numAffectedRows)).toBe(1);
    });
    await expect(withTenant(db, ORG_A, (tx) => sql`UPDATE ai_requests SET outcome = 'OK'`.execute(tx))).rejects.toThrow(/permission denied/);
    const after = Number((await sql<{ n: string }>`SELECT count(*) AS n FROM ai_requests WHERE organization_id = ${ORG_A}`.execute(db)).rows[0]!.n);
    expect(after).toBe(before - 1);
    expect((await sql`SELECT 1 FROM ai_usage_monthly WHERE organization_id = ${ORG_A} AND month = '2026-11-01'`.execute(db)).rows).toHaveLength(1);
  });

  it('grants: least privilege for the tenant role, RLS forced on all three tables', async () => {
    const grants = await sql<{ table_name: string; privilege_type: string }>`
      SELECT table_name, privilege_type FROM information_schema.role_table_grants
      WHERE grantee = 'hifz_tenant' AND table_name IN ('org_ai_settings', 'ai_requests', 'ai_usage_monthly') ORDER BY 1, 2`.execute(db);
    expect(grants.rows).toEqual([
      { table_name: 'ai_requests', privilege_type: 'DELETE' },
      { table_name: 'ai_requests', privilege_type: 'INSERT' },
      { table_name: 'ai_requests', privilege_type: 'SELECT' },
      { table_name: 'ai_usage_monthly', privilege_type: 'DELETE' },
      { table_name: 'ai_usage_monthly', privilege_type: 'INSERT' },
      { table_name: 'ai_usage_monthly', privilege_type: 'SELECT' },
      { table_name: 'org_ai_settings', privilege_type: 'INSERT' },
      { table_name: 'org_ai_settings', privilege_type: 'SELECT' },
    ]);
    const rls = await sql<{ relname: string; relrowsecurity: boolean; relforcerowsecurity: boolean }>`
      SELECT relname, relrowsecurity, relforcerowsecurity FROM pg_class WHERE relname IN ('org_ai_settings', 'ai_requests', 'ai_usage_monthly') ORDER BY 1`.execute(db);
    expect(rls.rows.every((r) => r.relrowsecurity && r.relforcerowsecurity)).toBe(true);
    expect(rls.rows).toHaveLength(3);
  });
});
