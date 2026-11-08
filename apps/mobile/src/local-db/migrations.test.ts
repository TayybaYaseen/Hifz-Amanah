// F12 · Offline and synchronization — unit: local schema migrations (F12-AC16, NFR-OFF-009)
import { describe, expect, it } from 'vitest';
import { openNodeDriver } from './testing/nodeDriver.ts';
import { DEVICE_MIGRATIONS, LocalSchemaTooNewError, WORKSPACE_MIGRATIONS, runMigrations, schemaVersion, type Migration } from './migrations.ts';
import type { SqlDriver } from './driver.ts';
import { FakeClock, makeOutbox, probeMigration, writeProbe } from '../sync/testing/probe.ts';

/** Every outbox row, every column, in seq order. */
const outboxSnapshot = (db: SqlDriver) => db.all<Record<string, unknown>>('SELECT * FROM outbox ORDER BY seq');

/** A populated outbox in every state, at schema version `upTo`. */
async function populated(upTo: readonly Migration[]) {
  const db = openNodeDriver();
  await runMigrations(db, upTo);
  const clock = new FakeClock();
  const outbox = makeOutbox(db, clock);
  const states = ['PENDING', 'SYNCING', 'SYNCED', 'FAILED', 'ACTION_REQUIRED'];
  for (const [i, state] of states.entries()) {
    const id = outbox.newEntityId();
    const { opIds } = await outbox.saveWithOp(writeProbe(id, { label: `row ${i}` }), {
      entity: 'sync_probe',
      entityId: id,
      opType: 'CREATE',
      baseVersion: null,
      fields: { label: `row ${i}`, note: 'نوٹ — Arabic/Urdu text stays intact' },
      label: `row ${i}`,
    });
    await db.run("UPDATE outbox SET state = ?, attempts = ?, failure_code = CASE WHEN ? = 'FAILED' THEN 'VALIDATION' END WHERE op_id = ?", [state, i, state, opIds[0]!]);
  }
  return db;
}

describe('F12 · local database upgrades', () => {
  it('F12-AC16 (US-051) every migration runs over a populated outbox and keeps every queued operation unchanged', async () => {
    // Start from the first version that has the outbox, then apply every later migration (including a future,
    // purely additive one like the ones F04/F05/F08 will add) and compare the outbox row by row.
    const base = [...WORKSPACE_MIGRATIONS, probeMigration(WORKSPACE_MIGRATIONS.length + 1)];
    const future: Migration = {
      version: base.length + 1,
      name: 'example later feature table + additive outbox column',
      up: async (tx) => {
        await tx.exec('CREATE TABLE example_entity (id TEXT PRIMARY KEY, row_version INTEGER, report_date TEXT)');
        await tx.exec("ALTER TABLE outbox ADD COLUMN example_hint TEXT DEFAULT 'x'");
      },
    };
    const db = await populated(base);
    const before = await outboxSnapshot(db);
    expect(before).toHaveLength(5);
    expect(await runMigrations(db, [...base, future])).toEqual([future.version]);
    const after = await outboxSnapshot(db);
    expect(after.map(({ example_hint: _hint, ...row }) => row)).toEqual(before);
    expect(after.every((row) => row.example_hint === 'x')).toBe(true);
    expect(await schemaVersion(db)).toBe(future.version);
    expect(await db.get('SELECT schema_version FROM sync_meta')).toEqual({ schema_version: future.version });
    // The upgraded outbox still syncs (UI and engine read it through the same code).
    const items = await makeOutbox(db, new FakeClock()).list();
    expect(items.map((i) => i.status.state)).toEqual(['PENDING', 'SYNCING', 'SYNCED', 'FAILED', 'ACTION_REQUIRED']);
    expect(items[0]!.fields.note).toBe('نوٹ — Arabic/Urdu text stays intact');
    await db.close();
  });

  it('F12-AC16 (US-051) the version 1 → 2 upgrade (sent count, last server time, deferred changes) keeps every queued operation', async () => {
    // A database written by the first build: version 1 only, with operations in every state.
    const db = openNodeDriver();
    await runMigrations(db, WORKSPACE_MIGRATIONS.slice(0, 1));
    const clock = new FakeClock();
    const states = ['PENDING', 'SYNCING', 'SYNCED', 'FAILED', 'ACTION_REQUIRED'];
    for (const [i, state] of states.entries()) {
      // Inserted the way build 1 did (no sent_count column yet).
      await db.run(
        `INSERT INTO outbox (op_id, seq, entity, entity_id, op_type, payload, base_version, depends_on, state, attempts, label, created_at, conflict_id)
         VALUES (?, ?, 'sync_probe', ?, 'UPDATE', ?, 1, '[]', ?, ?, ?, ?, ?)`,
        [
          `01934f5e-8a00-7000-8000-00000000030${i}`,
          i + 1,
          `01934f5e-8a00-7000-8000-00000000040${i}`,
          JSON.stringify({ label: `row ${i}`, note: 'نوٹ — Arabic/Urdu text stays intact' }),
          state,
          i,
          `row ${i}`,
          new Date(clock.read()).toISOString(),
          state === 'ACTION_REQUIRED' ? '6a9a3bd8-73a5-4f1b-9d3b-6d8f6c0d1e22' : null,
        ],
      );
    }
    await db.run("INSERT INTO discards (op_id, entity, entity_id, op_type, created_at, discarded_at) VALUES ('d1', 'sync_probe', 'e1', 'CREATE', 'x', 'y')");
    const before = await outboxSnapshot(db);

    expect(await runMigrations(db, WORKSPACE_MIGRATIONS)).toEqual(WORKSPACE_MIGRATIONS.slice(1).map((m) => m.version));
    const after = await outboxSnapshot(db);
    // Every row and value is unchanged; the new column is NULL ("unknown whether sent") for old rows.
    expect(after.map(({ sent_count: _sent, ...row }) => row)).toEqual(before);
    expect(after.every((row) => row.sent_count === null)).toBe(true);
    expect(await db.get('SELECT last_server_time FROM sync_meta')).toEqual({ last_server_time: null });
    expect(await db.get("SELECT reason FROM discards WHERE op_id = 'd1'")).toEqual({ reason: 'DISCARDED' });
    expect(await db.get('SELECT COUNT(*) AS n FROM deferred_changes')).toEqual({ n: 0 });
    // The upgraded items still read through the outbox; an old PENDING item counts as possibly sent.
    const items = await makeOutbox(db, clock).list();
    expect(items.map((i) => i.status.state)).toEqual(states);
    expect(items[0]!.sentCount).toBeNull();
    expect(items[0]!.fields.note).toBe('نوٹ — Arabic/Urdu text stays intact');
    await db.close();
  });

  it('F12-AC16 (US-051) a failing migration rolls back completely and leaves the outbox and version as they were', async () => {
    const base = [...WORKSPACE_MIGRATIONS, probeMigration(WORKSPACE_MIGRATIONS.length + 1)];
    const db = await populated(base);
    const before = await outboxSnapshot(db);
    const broken: Migration = {
      version: base.length + 1,
      name: 'broken',
      up: async (tx) => {
        await tx.exec('CREATE TABLE half_done (id TEXT)');
        await tx.exec('THIS IS NOT SQL');
      },
    };
    await expect(runMigrations(db, [...base, broken])).rejects.toThrow();
    expect(await schemaVersion(db)).toBe(base.length);
    expect(await db.get("SELECT name FROM sqlite_master WHERE name = 'half_done'")).toBeNull();
    expect(await outboxSnapshot(db)).toEqual(before);
    await db.close();
  });

  it('F12 unit: shipped migrations never rewrite or delete outbox rows (only additive columns after version 1)', () => {
    for (const migration of WORKSPACE_MIGRATIONS.slice(1)) {
      const source = migration.up.toString();
      expect(source, migration.name).not.toMatch(/\b(UPDATE|DELETE\s+FROM|DROP\s+TABLE|INSERT\s+INTO)\s+outbox\b/i);
      expect(source, migration.name).not.toMatch(/ALTER\s+TABLE\s+outbox\s+(?!ADD\s+COLUMN)/i);
    }
  });

  it('F12 unit: a database newer than the app is refused, not downgraded', async () => {
    const db = openNodeDriver();
    await runMigrations(db, WORKSPACE_MIGRATIONS);
    await db.exec('PRAGMA user_version = 99');
    await expect(runMigrations(db, WORKSPACE_MIGRATIONS)).rejects.toBeInstanceOf(LocalSchemaTooNewError);
    await db.close();
  });

  it('F12 unit: migrations are idempotent across launches (device index and workspace)', async () => {
    for (const list of [WORKSPACE_MIGRATIONS, DEVICE_MIGRATIONS]) {
      const db = openNodeDriver();
      expect(await runMigrations(db, list)).toEqual(list.map((m) => m.version));
      expect(await runMigrations(db, list)).toEqual([]);
      await db.close();
    }
  });
});
