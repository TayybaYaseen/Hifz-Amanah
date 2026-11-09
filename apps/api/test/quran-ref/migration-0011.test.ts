// F06 · Migration 0011 on an existing database (ADR-018; DEC-B78, DEC-B79; plan P5). Fresh installs run 0011 in every
// other integration test (the harness applies all migrations). This file proves the upgrade path: a database at 0010
// with existing Quran rows is upgraded, keeps its data, enforces the new rules on new rows only, and a second run of
// the migrator changes nothing. SYNTHETIC DATA ONLY.
import { cpSync, mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { sql } from 'kysely';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { syntheticSha } from '@hifz/domain/quran-ref/synthetic-fixture';
import { createDb, type Db } from '../../src/platform/db.ts';
import { startEmbeddedPostgres, type EmbeddedPostgres } from '../../src/platform/embedded-postgres.ts';
import { MIGRATIONS_DIR, migrate } from '../../src/platform/migrate.ts';

let pg: EmbeddedPostgres;
let db: Db;
const upTo0010 = mkdtempSync(join(tmpdir(), 'hifz-migrations-0010-'));

beforeAll(async () => {
  pg = await startEmbeddedPostgres();
  db = createDb({ connectionString: pg.connectionString, maxConnections: 1 }).db;
  for (const file of readdirSync(MIGRATIONS_DIR).filter((f) => /^\d{4}_.+\.sql$/.test(f) && f < '0011')) cpSync(join(MIGRATIONS_DIR, file), join(upTo0010, file));
}, 60_000);

afterAll(async () => {
  await db?.destroy();
  await pg?.stop();
  rmSync(upTo0010, { recursive: true, force: true });
});

const ORG = '01900000-0000-7000-8000-000000000001';
const SYNTHETIC_IMPORT = '01900000-0000-7000-8000-000000000011';
const PRODUCTION_IMPORT = '01900000-0000-7000-8000-000000000012';

const importRow = (id: string, synthetic: boolean, version: string) => sql`
  INSERT INTO quran_imports (id, organization_id, kind, edition, dataset_key, dataset_version, source_name, licence, reviewed_by,
    approved_on, synthetic, checksum, counts, applied_at, seed_format_version, review_decision, validation_report_sha256)
  VALUES (${id}, ${ORG}, 'METADATA', NULL, 'synthetic-test', ${version}, 'Synthetic', 'Synthetic',
    ${synthetic ? null : 'Reviewer (synthetic)'}, ${synthetic ? null : '2026-11-09'}, ${synthetic}, ${syntheticSha(7)}, '{}'::jsonb, now(),
    2, ${synthetic ? null : 'APPROVED'}, ${synthetic ? null : syntheticSha(8)})`;

describe('F06 · migration 0011 upgrade path', () => {
  it('upgrades a 0010 database with existing rows, keeps them, and is a no-op when run again', async () => {
    const before = await migrate(db, upTo0010);
    expect(before.at(-1)).toBe('0010_quran_ref_v2.sql');
    await sql`INSERT INTO organizations (id, kind, name, code) VALUES (${ORG}, 'MADRASA', 'Madrasa (synthetic)', 'SYNMIG')`.execute(db);
    // Rows a 0010 database may hold: a synthetic import, and a signed production-shaped import without the new evidence.
    await importRow(SYNTHETIC_IMPORT, true, '1').execute(db);
    await importRow(PRODUCTION_IMPORT, false, '2').execute(db);

    expect(await migrate(db)).toEqual(['0011_quran_reference_snapshots.sql']);
    // Existing rows are kept unchanged (the evidence constraint is NOT VALID for them).
    const rows = await sql<{ id: string; mushaf_printing: string | null; validation_report: unknown }>`SELECT id, mushaf_printing, validation_report FROM quran_imports ORDER BY id`.execute(db);
    expect(rows.rows.map((r) => r.id)).toEqual([SYNTHETIC_IMPORT, PRODUCTION_IMPORT]);
    expect(rows.rows.every((r) => r.mushaf_printing === null && r.validation_report === null)).toBe(true);
    // Running the migrator again applies nothing.
    expect(await migrate(db)).toEqual([]);
  });

  it('new production rows must carry the evidence; test rows need not', async () => {
    await expect(importRow('01900000-0000-7000-8000-000000000013', false, '3').execute(db)).rejects.toThrow(/quran_imports_production_evidence/);
    await importRow('01900000-0000-7000-8000-000000000014', true, '4').execute(db);
    await sql`INSERT INTO quran_imports (id, organization_id, kind, dataset_key, dataset_version, source_name, licence, reviewed_by, approved_on,
        synthetic, checksum, counts, applied_at, seed_format_version, review_decision, validation_report_sha256, mushaf_printing, signoff_ref, validation_report)
      VALUES ('01900000-0000-7000-8000-000000000015', ${ORG}, 'METADATA', 'synthetic-test', '5', 'Synthetic', 'Synthetic', 'Reviewer (synthetic)', '2026-11-09',
        false, ${syntheticSha(7)}, '{}'::jsonb, now(), 2, 'APPROVED', ${syntheticSha(8)}, 'Synthetic printing (test)', 'Synthetic sign-off (test)', '{}'::jsonb)`.execute(db);
  });

  it('the snapshot manifest is tenant data with no delete path, and only its revocation columns are writable by the tenant role', async () => {
    const grants = await sql<{ privilege_type: string }>`
      SELECT privilege_type FROM information_schema.role_table_grants WHERE grantee = 'hifz_tenant' AND table_name = 'quran_reference_snapshots' ORDER BY 1`.execute(db);
    expect(grants.rows.map((g) => g.privilege_type)).toEqual(['INSERT', 'SELECT']);
    const columns = await sql<{ column_name: string }>`
      SELECT column_name FROM information_schema.column_privileges
      WHERE grantee = 'hifz_tenant' AND table_name = 'quran_reference_snapshots' AND privilege_type = 'UPDATE' ORDER BY 1`.execute(db);
    expect(columns.rows.map((c) => c.column_name)).toEqual(['revoked_at', 'revoked_by_licence_id', 'revoked_reason']);
    const rls = await sql<{ relrowsecurity: boolean; relforcerowsecurity: boolean }>`
      SELECT relrowsecurity, relforcerowsecurity FROM pg_class WHERE relname = 'quran_reference_snapshots'`.execute(db);
    expect(rls.rows[0]).toEqual({ relrowsecurity: true, relforcerowsecurity: true });
  });
});
