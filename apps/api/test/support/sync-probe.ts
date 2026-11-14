// TEST ONLY (F12 decision Q1): the `sync_probe` entity handler that drives the sync engine in integration tests
// before any real offline entity exists. Never registered by main.ts or the E2E server. Fields: `label`, `status`,
// `note` meaningful; `position` safe-merge (display order, F12-AC13); `classId` is the scope key (create only).
import { sql } from 'kysely';
import { z } from 'zod';
import { SYNC_PROBE_FIELDS } from '@hifz/domain/sync';
import type { Tx } from '../../src/platform/db.ts';
import type { SyncHandler, SyncRow } from '../../src/modules/sync/handler.ts';

const label = z.string().min(1).max(100);
const status = z.enum(['OPEN', 'DONE', 'HELD']);
const position = z.number().int().min(0).max(100_000);
const note = z.string().max(2000).nullable();

const COLUMNS: Record<string, string> = { label: 'label', status: 'status', position: 'position', note: 'note' };

interface ProbeRow {
  id: string;
  label: string;
  status: string;
  position: number;
  class_id: string | null;
  note: string | null;
  row_version: string | number;
}

const toRow = (r: ProbeRow): SyncRow => ({
  id: r.id,
  rowVersion: Number(r.row_version),
  fields: { label: r.label, status: r.status, position: r.position, classId: r.class_id, note: r.note },
  keys: { studentId: null, classId: r.class_id },
});

export const syncProbeHandler: SyncHandler = {
  entity: 'sync_probe',
  opTypes: ['CREATE', 'UPDATE'],
  createSchema: z.strictObject({
    label,
    status,
    position: position.default(0),
    classId: z.uuid().nullable().default(null),
    note: note.default(null),
  }),
  updateSchema: z
    .strictObject({ label: label.optional(), status: status.optional(), position: position.optional(), note: note.optional() })
    .refine((fields) => Object.keys(fields).length > 0, { message: 'EMPTY' }),
  fieldSpec: SYNC_PROBE_FIELDS,
  auditValueFields: ['status', 'position'],
  tables: ['sync_probe'],
  keysForCreate: (fields) => ({ studentId: null, classId: (fields.classId as string | null) ?? null }),

  async load(tx: Tx, organizationId, id, { forUpdate }) {
    const { rows } = await sql<ProbeRow>`
      SELECT id, label, status, position, class_id, note, row_version FROM sync_probe
      WHERE organization_id = ${organizationId} AND id = ${id} ${forUpdate ? sql`FOR UPDATE` : sql``}`.execute(tx);
    return rows[0] ? toRow(rows[0]) : null;
  },

  async loadMany(tx: Tx, organizationId, ids) {
    if (ids.length === 0) return [];
    const { rows } = await sql<ProbeRow>`
      SELECT id, label, status, position, class_id, note, row_version FROM sync_probe
      WHERE organization_id = ${organizationId} AND id = ANY(${[...ids]}::uuid[])`.execute(tx);
    return rows.map(toRow);
  },

  async insert(tx: Tx, organizationId, id, fields) {
    const { rows } = await sql<{ id: string }>`
      INSERT INTO sync_probe (id, organization_id, label, status, position, class_id, note, row_version)
      VALUES (${id}, ${organizationId}, ${fields.label as string}, ${fields.status as string}, ${fields.position as number},
              ${(fields.classId as string | null) ?? null}, ${(fields.note as string | null) ?? null}, 1)
      ON CONFLICT (id) DO NOTHING
      RETURNING id`.execute(tx);
    return rows.length === 1;
  },

  async update(tx: Tx, organizationId, id, changes, rowVersion) {
    const sets = Object.entries(changes).map(([field, value]) => {
      const column = COLUMNS[field];
      if (!column) throw new Error(`sync_probe: field ${field} is not updatable`);
      return sql`${sql.ref(column)} = ${value as string | number | null}`;
    });
    sets.push(sql`row_version = ${rowVersion}`);
    await sql`UPDATE sync_probe SET ${sql.join(sets)} WHERE organization_id = ${organizationId} AND id = ${id}`.execute(tx);
  },

  label: (row) => `Probe ${row.id.slice(-6)}`,
};
