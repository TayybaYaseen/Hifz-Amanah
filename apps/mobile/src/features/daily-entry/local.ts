// F05 · Daily Hifz records on the device (US-018…023; F05-AC1…AC22; AGENTS.md §7; plan docs/handover/F05-plan.md §6).
//
// Three offline entities, each with its local table and sync handler: `daily_record` → `lesson_portion` →
// `portion_attempt` (mistakes travel inside the attempt, plan §7.4). Every save writes the rows AND queues their
// operations in ONE SQLite transaction before the screen may say "Saved on this device" (F12-AC1); "Synced" is shown
// only once the server acknowledged every operation of the record (recordSyncState).
//
// - A portion's CREATE depends on its record's CREATE (and on an attendance change saved with it); an attempt's CREATE
//   depends on its portion's CREATE. IDs are client UUIDv7s and every op has its own op_id (F12-AC3).
// - Corrections are UPDATEs through `enqueueUpdate` (base version derived by the outbox, review N3). Coupled groups
//   travel whole (portion: Para/range/Total Lines/assigned; attempt: status/completed/quality/mistakes), so the server
//   never merges one side's lines with the other's range; conflicts go to Conflict Review (no last-write-wins).
// - A new attempt never changes an earlier one (F05-AC15). Removing a portion keeps its row and attempts.
// - Remarks are internal staff text: never in an op label, the Sync Queue, or a log.
// - The Sabaq Para is derived (FR-SAB-001): the device keeps its own derived Para for display only and sends null; the
//   server derives the stored one.
import type { AttendanceStatus, DailyRecordDetail, LessonPortionSyncFields, PortionAttemptSyncFields, DailyRecordSyncFields } from '@hifz/contracts';
import type { DailyReportMode } from '@hifz/domain/hifz';
import { DAILY_RECORD_FIELDS, LESSON_PORTION_FIELDS, PORTION_ATTEMPT_FIELDS, nextAttemptNo, type MistakeEntry, type PortionStatus, type TotalLinesSource } from '@hifz/domain/hifz';
import { fractionText, type Quantity, type QuantityUnit } from '@hifz/domain/quantity';
import type { MarkingRole } from '@hifz/domain/calendar';
import type { QueueState } from '@hifz/domain/sync';
import type { SqlDriver, SqlExecutor } from '../../local-db/driver.ts';
import type { Migration } from '../../local-db/migrations.ts';
import type { Outbox, OutboxItem } from '../../sync/outbox.ts';
import type { EntityRegistry, LocalEntityHandler } from '../../sync/registry.ts';
import { DAILY_RECORD_RETENTION_DAYS } from '../../sync/retention.ts';
import { writeMarkInTx, type MarkToSave } from '../attendance/local.ts';

export type Section = 'SABAQ' | 'SABQI' | 'MANZIL';
export const HIFZ_ENTITIES = ['daily_record', 'lesson_portion', 'portion_attempt'] as const;
export type HifzEntity = (typeof HIFZ_ENTITIES)[number];

/** Local schema for F05 (workspace migration 6). Additive only: the outbox is untouched (F12-AC16). */
export const dailyEntryMigration = (version: number): Migration => ({
  version,
  name: 'F05 daily records, lesson portions, portion attempts, cached daily-report mode',
  up: async (tx) => {
    await tx.exec(`
      CREATE TABLE daily_records (
        id                TEXT PRIMARY KEY,
        row_version       INTEGER,
        student_id        TEXT,
        class_id          TEXT,
        report_date       TEXT,
        session_label     TEXT,
        recorded_by       TEXT,
        recorded_by_name  TEXT,
        client_saved_at   TEXT,
        student_name      TEXT,
        class_name        TEXT
      );
      CREATE INDEX daily_records_student_date ON daily_records (student_id, report_date);
      CREATE TABLE lesson_portions (
        id                  TEXT PRIMARY KEY,
        row_version         INTEGER,
        daily_record_id     TEXT,
        report_date         TEXT,
        section             TEXT,
        position            INTEGER,
        is_extra            INTEGER NOT NULL DEFAULT 0,
        para_number         INTEGER,
        surah_start         INTEGER,
        ayah_start          INTEGER,
        surah_end           INTEGER,
        ayah_end            INTEGER,
        assigned_unit       TEXT,
        assigned_num        INTEGER,
        assigned_den        INTEGER,
        total_lines         INTEGER,
        total_lines_source  TEXT,
        line_count_edition  TEXT,
        removed             INTEGER NOT NULL DEFAULT 0
      );
      CREATE INDEX lesson_portions_record ON lesson_portions (daily_record_id);
      CREATE TABLE portion_attempts (
        id                 TEXT PRIMARY KEY,
        row_version        INTEGER,
        lesson_portion_id  TEXT,
        report_date        TEXT,
        attempt_no         INTEGER,
        attempted_at       TEXT,
        recorded_by        TEXT,
        recorded_by_name   TEXT,
        status             TEXT,
        completed_unit     TEXT,
        completed_num      INTEGER,
        completed_den      INTEGER,
        quality            INTEGER,
        no_mistakes        INTEGER NOT NULL DEFAULT 0,
        mistakes           TEXT NOT NULL DEFAULT '[]',
        remarks            TEXT
      );
      CREATE INDEX portion_attempts_portion ON portion_attempts (lesson_portion_id);
      ALTER TABLE sync_meta ADD COLUMN daily_report_mode TEXT;
    `);
  },
});

// ---------- Local shapes ----------

export interface LocalAttempt {
  id: string;
  rowVersion: number | null;
  lessonPortionId: string;
  attemptNo: number;
  attemptedAt: string;
  recordedBy: string | null;
  recordedByName: string | null;
  status: PortionStatus;
  completed: Quantity | null;
  quality: number | null;
  noMistakes: boolean;
  mistakes: MistakeEntry[];
  remarks: string | null;
}

export interface LocalRange {
  surahStart: number;
  ayahStart: number;
  surahEnd: number;
  ayahEnd: number;
}

export interface LocalPortion {
  id: string;
  rowVersion: number | null;
  dailyRecordId: string;
  section: Section;
  position: number;
  isExtra: boolean;
  paraNumber: number | null;
  range: LocalRange | null;
  assigned: Quantity | null;
  totalLines: number | null;
  totalLinesSource: TotalLinesSource | null;
  lineCountEdition: string | null;
  removed: boolean;
  /** Oldest first; the current attempt is last. */
  attempts: LocalAttempt[];
}

export interface LocalRecord {
  id: string;
  rowVersion: number | null;
  studentId: string;
  classId: string;
  reportDate: string;
  sessionLabel: string | null;
  recordedBy: string | null;
  recordedByName: string | null;
  clientSavedAt: string | null;
  studentName: string | null;
  className: string | null;
  /** Section order (Sabaq, Sabqi, Manzil), then position; removed portions included, flagged. */
  portions: LocalPortion[];
}

interface RecordRow {
  id: string;
  row_version: number | null;
  student_id: string;
  class_id: string;
  report_date: string;
  session_label: string | null;
  recorded_by: string | null;
  recorded_by_name: string | null;
  client_saved_at: string | null;
  student_name: string | null;
  class_name: string | null;
}

interface PortionRow {
  id: string;
  row_version: number | null;
  daily_record_id: string;
  section: Section;
  position: number;
  is_extra: number;
  para_number: number | null;
  surah_start: number | null;
  ayah_start: number | null;
  surah_end: number | null;
  ayah_end: number | null;
  assigned_unit: QuantityUnit | null;
  assigned_num: number | null;
  assigned_den: number | null;
  total_lines: number | null;
  total_lines_source: TotalLinesSource | null;
  line_count_edition: string | null;
  removed: number;
}

interface AttemptRow {
  id: string;
  row_version: number | null;
  lesson_portion_id: string;
  attempt_no: number;
  attempted_at: string;
  recorded_by: string | null;
  recorded_by_name: string | null;
  status: PortionStatus;
  completed_unit: QuantityUnit | null;
  completed_num: number | null;
  completed_den: number | null;
  quality: number | null;
  no_mistakes: number;
  mistakes: string;
  remarks: string | null;
}

const num = (v: number | null | undefined): number | null => (v === null || v === undefined ? null : Number(v));

const quantityOf = (unit: QuantityUnit | null, n: number | null, d: number | null): Quantity | null =>
  unit === null || n === null ? null : { unit, numerator: Number(n), denominator: d === null ? 1 : Number(d) };

const SECTION_ORDER: Record<Section, number> = { SABAQ: 0, SABQI: 1, MANZIL: 2 };

function parseMistakes(text: string): MistakeEntry[] {
  try {
    const list = JSON.parse(text) as unknown;
    return Array.isArray(list) ? (list as MistakeEntry[]).map(({ category, severity, repeated }) => ({ category, severity, repeated: Boolean(repeated) })) : [];
  } catch {
    return [];
  }
}

const toAttempt = (r: AttemptRow): LocalAttempt => ({
  id: r.id,
  rowVersion: num(r.row_version),
  lessonPortionId: r.lesson_portion_id,
  attemptNo: Number(r.attempt_no),
  attemptedAt: r.attempted_at,
  recordedBy: r.recorded_by,
  recordedByName: r.recorded_by_name,
  status: r.status,
  completed: quantityOf(r.completed_unit, num(r.completed_num), num(r.completed_den)),
  quality: num(r.quality),
  noMistakes: Boolean(Number(r.no_mistakes)),
  mistakes: parseMistakes(r.mistakes),
  remarks: r.remarks,
});

const toPortion = (r: PortionRow, attempts: LocalAttempt[]): LocalPortion => ({
  id: r.id,
  rowVersion: num(r.row_version),
  dailyRecordId: r.daily_record_id,
  section: r.section,
  position: Number(r.position),
  isExtra: Boolean(Number(r.is_extra)),
  paraNumber: num(r.para_number),
  range:
    r.surah_start === null || r.ayah_start === null || r.ayah_end === null
      ? null
      : { surahStart: Number(r.surah_start), ayahStart: Number(r.ayah_start), surahEnd: Number(r.surah_end ?? r.surah_start), ayahEnd: Number(r.ayah_end) },
  assigned: quantityOf(r.assigned_unit, num(r.assigned_num), num(r.assigned_den)),
  totalLines: num(r.total_lines),
  totalLinesSource: r.total_lines_source,
  lineCountEdition: r.line_count_edition,
  removed: Boolean(Number(r.removed)),
  attempts: attempts.filter((a) => a.lessonPortionId === r.id).sort((a, b) => a.attemptNo - b.attemptNo),
});

// ---------- Server rows → local rows (sync pull, record detail) ----------

async function upsertRecord(tx: SqlExecutor, id: string, rowVersion: number, f: Partial<DailyRecordSyncFields>): Promise<void> {
  await tx.run(
    `INSERT INTO daily_records (id, row_version, student_id, class_id, report_date, session_label, recorded_by, client_saved_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT (id) DO UPDATE SET row_version = excluded.row_version, student_id = excluded.student_id, class_id = excluded.class_id,
       report_date = excluded.report_date, session_label = excluded.session_label, recorded_by = excluded.recorded_by,
       client_saved_at = excluded.client_saved_at`,
    [id, rowVersion, f.studentId ?? null, f.classId ?? null, f.reportDate ?? null, f.sessionLabel ?? null, f.recordedBy ?? null, f.clientSavedAt ?? null],
  );
  // Portions or attempts pulled before their record get its date now (cache retention, F12-AC19).
  if (f.reportDate) {
    await tx.run('UPDATE lesson_portions SET report_date = ? WHERE daily_record_id = ? AND report_date IS NULL', [f.reportDate, id]);
    await tx.run(
      'UPDATE portion_attempts SET report_date = ? WHERE report_date IS NULL AND lesson_portion_id IN (SELECT id FROM lesson_portions WHERE daily_record_id = ?)',
      [f.reportDate, id],
    );
  }
}

async function upsertPortion(tx: SqlExecutor, id: string, rowVersion: number, f: Partial<LessonPortionSyncFields>): Promise<void> {
  const a = f.assigned ?? null;
  const r = f.range ?? null;
  await tx.run(
    `INSERT INTO lesson_portions (id, row_version, daily_record_id, report_date, section, position, is_extra, para_number, surah_start,
       ayah_start, surah_end, ayah_end, assigned_unit, assigned_num, assigned_den, total_lines, total_lines_source, line_count_edition, removed)
     VALUES (?, ?, ?, (SELECT report_date FROM daily_records WHERE id = ?), ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT (id) DO UPDATE SET row_version = excluded.row_version, daily_record_id = excluded.daily_record_id,
       report_date = COALESCE(excluded.report_date, lesson_portions.report_date), section = excluded.section,
       position = excluded.position, is_extra = excluded.is_extra, para_number = excluded.para_number,
       surah_start = excluded.surah_start, ayah_start = excluded.ayah_start, surah_end = excluded.surah_end, ayah_end = excluded.ayah_end,
       assigned_unit = excluded.assigned_unit, assigned_num = excluded.assigned_num, assigned_den = excluded.assigned_den,
       total_lines = excluded.total_lines, total_lines_source = excluded.total_lines_source,
       line_count_edition = excluded.line_count_edition, removed = excluded.removed`,
    [
      id,
      rowVersion,
      f.dailyRecordId ?? null,
      f.dailyRecordId ?? null,
      f.section ?? null,
      f.position ?? null,
      f.isExtra ? 1 : 0,
      f.paraNumber ?? null,
      r?.surahStart ?? null,
      r?.ayahStart ?? null,
      r?.surahEnd ?? null,
      r?.ayahEnd ?? null,
      a?.unit ?? null,
      a?.numerator ?? null,
      a?.denominator ?? null,
      f.totalLines ?? null,
      f.totalLinesSource ?? null,
      f.lineCountEdition ?? null,
      f.removed ? 1 : 0,
    ],
  );
}

async function upsertAttempt(tx: SqlExecutor, id: string, rowVersion: number, f: Partial<PortionAttemptSyncFields>): Promise<void> {
  const c = f.completed ?? null;
  await tx.run(
    `INSERT INTO portion_attempts (id, row_version, lesson_portion_id, report_date, attempt_no, attempted_at, recorded_by, status,
       completed_unit, completed_num, completed_den, quality, no_mistakes, mistakes, remarks)
     VALUES (?, ?, ?, (SELECT report_date FROM lesson_portions WHERE id = ?), ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT (id) DO UPDATE SET row_version = excluded.row_version, lesson_portion_id = excluded.lesson_portion_id,
       report_date = COALESCE(excluded.report_date, portion_attempts.report_date), attempt_no = excluded.attempt_no,
       attempted_at = excluded.attempted_at, recorded_by = excluded.recorded_by, status = excluded.status,
       completed_unit = excluded.completed_unit, completed_num = excluded.completed_num, completed_den = excluded.completed_den,
       quality = excluded.quality, no_mistakes = excluded.no_mistakes, mistakes = excluded.mistakes, remarks = excluded.remarks`,
    [
      id,
      rowVersion,
      f.lessonPortionId ?? null,
      f.lessonPortionId ?? null,
      f.attemptNo ?? null,
      f.attemptedAt ?? null,
      f.recordedBy ?? null,
      f.status ?? null,
      c?.unit ?? null,
      c?.numerator ?? null,
      c?.denominator ?? null,
      f.quality ?? null,
      f.noMistakes ? 1 : 0,
      JSON.stringify(f.mistakes ?? []),
      f.remarks ?? null,
    ],
  );
}

const QUANTITY_FIELDS = new Set(['assigned', 'completed']);

/** Conflict Review shows quantities and ranges as plain text; missing values stay null ("Not recorded"), never 0. */
function formatValue(field: string, value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (QUANTITY_FIELDS.has(field) && typeof value === 'object') {
    const q = value as Quantity;
    return `${fractionText(q)} ${q.unit}`;
  }
  if (field === 'range' && typeof value === 'object') {
    const r = value as LocalRange;
    return `${r.surahStart}:${r.ayahStart}–${r.surahEnd}:${r.ayahEnd}`;
  }
  if (field === 'mistakes' && Array.isArray(value)) return String(value.length);
  return typeof value === 'object' ? JSON.stringify(value) : String(value);
}

const retention = { dateColumn: 'report_date', days: DAILY_RECORD_RETENTION_DAYS };

export const dailyRecordHandler: LocalEntityHandler = {
  entity: 'daily_record',
  table: 'daily_records',
  fieldSpec: DAILY_RECORD_FIELDS,
  upsertFromServer: (tx, id, rowVersion, f) => upsertRecord(tx, id, rowVersion, f as Partial<DailyRecordSyncFields>),
  // The op label (student name · date) is shown; the fields carry nothing else safe to show.
  label: () => null,
  fieldLabelKey: (field) => ({ sessionLabel: 'daily.sessionLabel' })[field] ?? null,
  formatValue,
  retention,
  onDiscard: async (tx, op) => {
    if (op.opType === 'CREATE') await tx.run('DELETE FROM daily_records WHERE id = ?', [op.entityId]);
  },
};

export const lessonPortionHandler: LocalEntityHandler = {
  entity: 'lesson_portion',
  table: 'lesson_portions',
  fieldSpec: LESSON_PORTION_FIELDS,
  upsertFromServer: (tx, id, rowVersion, f) => upsertPortion(tx, id, rowVersion, f as Partial<LessonPortionSyncFields>),
  label: () => null,
  fieldGroups: [{ id: 'portion', labelKey: 'daily.conflictPortion', fields: ['paraNumber', 'range', 'totalLines', 'totalLinesSource', 'assigned'] }],
  fieldLabelKey: (field) =>
    ({ paraNumber: 'daily.para', range: 'quranRef.range.title', totalLines: 'quranRef.range.totalLines', totalLinesSource: 'quranRef.range.totalLines', assigned: 'daily.assigned', position: 'daily.position', removed: 'daily.removePortion', isExtra: 'daily.extra' })[field] ?? null,
  formatValue,
  retention,
  onDiscard: async (tx, op) => {
    if (op.opType === 'CREATE') await tx.run('DELETE FROM lesson_portions WHERE id = ?', [op.entityId]);
  },
};

export const portionAttemptHandler: LocalEntityHandler = {
  entity: 'portion_attempt',
  table: 'portion_attempts',
  fieldSpec: PORTION_ATTEMPT_FIELDS,
  upsertFromServer: (tx, id, rowVersion, f) => upsertAttempt(tx, id, rowVersion, f as Partial<PortionAttemptSyncFields>),
  label: () => null,
  fieldGroups: [{ id: 'outcome', labelKey: 'daily.conflictOutcome', fields: ['status', 'completed', 'quality', 'noMistakes', 'mistakes'] }],
  fieldLabelKey: (field) =>
    ({ status: 'daily.status', completed: 'daily.completedAmount', quality: 'quality.label', noMistakes: 'mistakes.none', mistakes: 'mistakes.title', remarks: 'daily.remarks', attemptedAt: 'daily.attemptedAt' })[field] ?? null,
  formatValue,
  retention,
  onDiscard: async (tx, op) => {
    if (op.opType === 'CREATE') await tx.run('DELETE FROM portion_attempts WHERE id = ?', [op.entityId]);
  },
};

/** Registers the three F05 entities once. */
export function registerDailyEntry(registry: EntityRegistry): void {
  for (const handler of [dailyRecordHandler, lessonPortionHandler, portionAttemptHandler]) {
    if (!registry.get(handler.entity)) registry.register(handler);
  }
}

// ---------- The cached daily-report mode (UI spec 8.8) ----------

/** The mode last fetched from GET /organization, or null when never fetched (the server then decides on sync). */
export async function readCachedReportMode(db: SqlExecutor): Promise<DailyReportMode | null> {
  const row = await db.get<{ daily_report_mode: string | null }>('SELECT daily_report_mode FROM sync_meta WHERE id = 1');
  const mode = row?.daily_report_mode ?? null;
  return mode === 'SINGLE' || mode === 'MULTI_SESSION' ? mode : null;
}

export async function cacheReportMode(db: SqlExecutor, mode: DailyReportMode): Promise<void> {
  await db.run('UPDATE sync_meta SET daily_report_mode = ? WHERE id = 1', [mode]);
}

// ---------- Reads ----------

export async function readRecord(db: SqlExecutor, id: string): Promise<LocalRecord | null> {
  const row = await db.get<RecordRow>('SELECT * FROM daily_records WHERE id = ?', [id]);
  if (!row) return null;
  const portions = await db.all<PortionRow>('SELECT * FROM lesson_portions WHERE daily_record_id = ?', [id]);
  const attempts = portions.length
    ? await db.all<AttemptRow>(
        `SELECT * FROM portion_attempts WHERE lesson_portion_id IN (${portions.map(() => '?').join(', ')})`,
        portions.map((p) => p.id),
      )
    : [];
  const list = attempts.map(toAttempt);
  return {
    id: row.id,
    rowVersion: num(row.row_version),
    studentId: row.student_id,
    classId: row.class_id,
    reportDate: row.report_date,
    sessionLabel: row.session_label,
    recordedBy: row.recorded_by,
    recordedByName: row.recorded_by_name,
    clientSavedAt: row.client_saved_at,
    studentName: row.student_name,
    className: row.class_name,
    portions: portions
      .map((p) => toPortion(p, list))
      .sort((a, b) => SECTION_ORDER[a.section] - SECTION_ORDER[b.section] || a.position - b.position),
  };
}

/** The records a student has on a date on this device (duplicate and session checks, F05-AC6, AC7). */
export async function recordsOn(db: SqlExecutor, studentId: string, date: string): Promise<Array<{ id: string; sessionLabel: string | null }>> {
  const rows = await db.all<{ id: string; session_label: string | null }>(
    'SELECT id, session_label FROM daily_records WHERE student_id = ? AND report_date = ? ORDER BY id',
    [studentId, date],
  );
  return rows.map((r) => ({ id: r.id, sessionLabel: r.session_label }));
}

export interface RecordListRow {
  id: string;
  reportDate: string;
  sessionLabel: string | null;
  portionCount: number;
  rowVersion: number | null;
}

/** A student's records on this device, newest first (student profile "Daily records"). */
export async function recordsForStudent(db: SqlExecutor, studentId: string): Promise<RecordListRow[]> {
  const rows = await db.all<{ id: string; report_date: string; session_label: string | null; row_version: number | null; n: number }>(
    `SELECT r.id, r.report_date, r.session_label, r.row_version,
       (SELECT COUNT(*) FROM lesson_portions p WHERE p.daily_record_id = r.id AND p.removed = 0) AS n
     FROM daily_records r WHERE r.student_id = ? ORDER BY r.report_date DESC, r.session_label`,
    [studentId],
  );
  return rows.map((r) => ({ id: r.id, reportDate: r.report_date, sessionLabel: r.session_label, portionCount: Number(r.n), rowVersion: num(r.row_version) }));
}

/** True when the student has a recited portion (a non-removed portion with an attempt) on the date (FR-DAY-010). */
export async function recitedOn(db: SqlExecutor, studentId: string, date: string): Promise<boolean> {
  const row = await db.get<{ n: number }>(
    `SELECT COUNT(*) AS n FROM portion_attempts a JOIN lesson_portions p ON p.id = a.lesson_portion_id
     JOIN daily_records r ON r.id = p.daily_record_id WHERE r.student_id = ? AND r.report_date = ? AND p.removed = 0`,
    [studentId, date],
  );
  return Number(row?.n ?? 0) > 0;
}

/**
 * Writes a server record detail to the device (online refresh of the record screen). Rows with an unsynced local
 * change are skipped: the engine reconciles them, never last-write-wins (NFR-OFF-006).
 */
export async function storeDetail(db: SqlDriver, detail: DailyRecordDetail, names: { studentName: string | null; className: string | null }): Promise<void> {
  const write = async (tx: SqlExecutor) => {
    const pending = new Set(
      (await tx.all<{ entity_id: string }>(`SELECT entity_id FROM outbox WHERE state != 'SYNCED' AND entity IN ('daily_record', 'lesson_portion', 'portion_attempt')`)).map((r) => r.entity_id),
    );
    const r = detail.record;
    if (!pending.has(r.id)) {
      await upsertRecord(tx, r.id, r.rowVersion, {
        studentId: r.studentId,
        classId: r.classId,
        reportDate: r.reportDate,
        sessionLabel: r.sessionLabel,
        recordedBy: r.recordedBy.userId,
        clientSavedAt: r.clientSavedAt,
      });
    }
    await tx.run('UPDATE daily_records SET student_name = COALESCE(?, student_name), class_name = COALESCE(?, class_name), recorded_by_name = COALESCE(recorded_by_name, ?) WHERE id = ?', [
      names.studentName ?? r.studentName,
      names.className,
      r.recordedBy.displayName,
      r.id,
    ]);
    for (const p of detail.portions) {
      if (!pending.has(p.id)) {
        await upsertPortion(tx, p.id, p.rowVersion, {
          dailyRecordId: r.id,
          section: p.section,
          position: p.position,
          isExtra: p.isExtra,
          paraNumber: p.paraNumber,
          range: p.range,
          assigned: p.assigned,
          totalLines: p.totalLines,
          totalLinesSource: p.totalLinesSource,
          lineCountEdition: p.lineCountEdition,
          removed: p.removed,
        });
      }
      for (const a of p.attempts) {
        if (pending.has(a.id)) continue;
        await upsertAttempt(tx, a.id, a.rowVersion, {
          lessonPortionId: p.id,
          attemptNo: a.attemptNo,
          attemptedAt: a.attemptedAt,
          recordedBy: a.recordedBy.userId,
          status: a.status,
          completed: a.completed,
          quality: a.quality,
          noMistakes: a.noMistakes,
          mistakes: a.mistakes.map(({ category, severity, repeated }) => ({ category, severity, repeated })),
          remarks: a.remarks,
        });
        await tx.run('UPDATE portion_attempts SET recorded_by_name = ? WHERE id = ?', [a.recordedBy.displayName, a.id]);
      }
    }
  };
  // One transaction; the driver serializes it with saves, and no operation is queued.
  await db.transaction(write);
}

// ---------- Writes ----------

export interface AttemptWrite {
  status: PortionStatus;
  /** Already normalized by the domain (FR-QTY-007: NOT_REMEMBERED → 0; COMPLETED → assigned). */
  completed: Quantity | null;
  quality: number | null;
  noMistakes: boolean;
  mistakes: MistakeEntry[];
  remarks: string | null;
}

export interface PortionWrite {
  section: Section;
  position: number;
  isExtra: boolean;
  /** Sabqi/Manzil: entered. Sabaq: the device's derived Para for display; never sent (the server derives it). */
  paraNumber: number | null;
  range: LocalRange | null;
  assigned: Quantity;
  totalLines: number | null;
  totalLinesSource: TotalLinesSource | null;
}

export interface Actor {
  userId: string;
  name: string;
}

export interface AttendanceWrite {
  input: MarkToSave;
  ctx: { classId: string; date: string; role: MarkingRole };
}

const portionSyncFields = (recordId: string, p: PortionWrite) => ({
  dailyRecordId: recordId,
  section: p.section,
  position: p.position,
  isExtra: p.isExtra,
  // FR-SAB-001: the server derives a Sabaq Para; the client never sends one.
  paraNumber: p.section === 'SABAQ' ? null : p.paraNumber,
  range: p.range,
  assigned: p.assigned,
  totalLines: p.section === 'SABAQ' ? p.totalLines : null,
  totalLinesSource: p.section === 'SABAQ' ? p.totalLinesSource : null,
});

const portionGroup = (p: PortionWrite) => {
  const { paraNumber, range, assigned, totalLines, totalLinesSource } = portionSyncFields('', p);
  return { paraNumber, range, assigned, totalLines, totalLinesSource };
};

const attemptOutcome = (a: AttemptWrite) => ({ status: a.status, completed: a.completed, quality: a.quality, noMistakes: a.noMistakes, mistakes: a.mistakes });

async function insertPortion(tx: SqlExecutor, id: string, recordId: string, reportDate: string, p: PortionWrite): Promise<void> {
  await tx.run(
    `INSERT INTO lesson_portions (id, row_version, daily_record_id, report_date, section, position, is_extra, para_number, surah_start, ayah_start,
       surah_end, ayah_end, assigned_unit, assigned_num, assigned_den, total_lines, total_lines_source, removed)
     VALUES (?, NULL, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)`,
    [
      id,
      recordId,
      reportDate,
      p.section,
      p.position,
      p.isExtra ? 1 : 0,
      p.paraNumber,
      p.range?.surahStart ?? null,
      p.range?.ayahStart ?? null,
      p.range?.surahEnd ?? null,
      p.range?.ayahEnd ?? null,
      p.assigned.unit,
      p.assigned.numerator,
      p.assigned.denominator,
      p.section === 'SABAQ' ? p.totalLines : null,
      p.section === 'SABAQ' ? p.totalLinesSource : null,
    ],
  );
}

async function insertAttempt(tx: SqlExecutor, id: string, portionId: string, reportDate: string, attemptNo: number, at: string, actor: Actor, a: AttemptWrite): Promise<void> {
  await tx.run(
    `INSERT INTO portion_attempts (id, row_version, lesson_portion_id, report_date, attempt_no, attempted_at, recorded_by, recorded_by_name, status,
       completed_unit, completed_num, completed_den, quality, no_mistakes, mistakes, remarks)
     VALUES (?, NULL, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      portionId,
      reportDate,
      attemptNo,
      at,
      actor.userId,
      actor.name,
      a.status,
      a.completed?.unit ?? null,
      a.completed?.numerator ?? null,
      a.completed?.denominator ?? null,
      a.quality,
      a.noMistakes ? 1 : 0,
      JSON.stringify(a.mistakes),
      a.remarks,
    ],
  );
}

async function updateAttemptRow(tx: SqlExecutor, id: string, a: AttemptWrite): Promise<void> {
  await tx.run(
    `UPDATE portion_attempts SET status = ?, completed_unit = ?, completed_num = ?, completed_den = ?, quality = ?, no_mistakes = ?, mistakes = ?,
       remarks = ? WHERE id = ?`,
    [a.status, a.completed?.unit ?? null, a.completed?.numerator ?? null, a.completed?.denominator ?? null, a.quality, a.noMistakes ? 1 : 0, JSON.stringify(a.mistakes), a.remarks, id],
  );
}

/** The unsynced CREATE of a row, if any: later operations on its children depend on it. */
async function pendingCreate(tx: SqlExecutor, outbox: Outbox, entity: HifzEntity, id: string): Promise<string | null> {
  const unsynced = await outbox.unsyncedForRow(entity, id, tx);
  return unsynced.find((i) => i.opType === 'CREATE')?.opId ?? null;
}

async function createPortionWithAttempt(
  tx: SqlExecutor,
  outbox: Outbox,
  ctx: { recordId: string; reportDate: string; label: string; actor: Actor; at: string; dependsOn: string[] },
  p: PortionWrite,
  attempt: AttemptWrite,
): Promise<{ portionId: string; attemptId: string }> {
  const portionId = outbox.newEntityId();
  await insertPortion(tx, portionId, ctx.recordId, ctx.reportDate, p);
  const { opId: portionOp } = await outbox.enqueue(tx, {
    entity: 'lesson_portion',
    entityId: portionId,
    opType: 'CREATE',
    baseVersion: null,
    fields: portionSyncFields(ctx.recordId, p),
    dependsOn: ctx.dependsOn,
    label: ctx.label,
  });
  const attemptId = outbox.newEntityId();
  await insertAttempt(tx, attemptId, portionId, ctx.reportDate, 1, ctx.at, ctx.actor, attempt);
  await outbox.enqueue(tx, {
    entity: 'portion_attempt',
    entityId: attemptId,
    opType: 'CREATE',
    baseVersion: null,
    fields: { lessonPortionId: portionId, attemptNo: 1, attemptedAt: ctx.at, ...attemptOutcome(attempt), remarks: attempt.remarks },
    dependsOn: [portionOp],
    label: ctx.label,
  });
  return { portionId, attemptId };
}

export interface NewEntryInput {
  studentId: string;
  classId: string;
  reportDate: string;
  sessionLabel: string | null;
  studentName: string;
  className: string;
  actor: Actor;
  /** An attendance change saved with the entry (written first; portions depend on it). */
  attendance: AttendanceWrite | null;
  portions: Array<{ portion: PortionWrite; attempt: AttemptWrite }>;
  /** Device time of the save, ISO. */
  now: string;
}

/**
 * Saves a new daily record with its portions and their first attempts, plus an attendance change, in ONE
 * transaction with all their operations (F12-AC1). Returns the new record ID. With no portion (Absent or Leave),
 * only the attendance is saved and null is returned (UI spec 8.6).
 */
export async function saveNewEntry(outbox: Outbox, input: NewEntryInput): Promise<string | null> {
  const label = `${input.studentName} · ${input.reportDate}`;
  const { result } = await outbox.saveWithOp(async (tx) => {
    const deps: string[] = [];
    if (input.attendance) deps.push((await writeMarkInTx(tx, outbox, input.attendance.input, input.attendance.ctx)).opId);
    if (input.portions.length === 0) return null;
    const recordId = outbox.newEntityId();
    await tx.run(
      `INSERT INTO daily_records (id, row_version, student_id, class_id, report_date, session_label, recorded_by, recorded_by_name, client_saved_at,
         student_name, class_name) VALUES (?, NULL, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [recordId, input.studentId, input.classId, input.reportDate, input.sessionLabel, input.actor.userId, input.actor.name, input.now, input.studentName, input.className],
    );
    const { opId: recordOp } = await outbox.enqueue(tx, {
      entity: 'daily_record',
      entityId: recordId,
      opType: 'CREATE',
      baseVersion: null,
      fields: { studentId: input.studentId, classId: input.classId, reportDate: input.reportDate, sessionLabel: input.sessionLabel, clientSavedAt: input.now },
      dependsOn: deps,
      label,
    });
    for (const { portion, attempt } of input.portions) {
      await createPortionWithAttempt(tx, outbox, { recordId, reportDate: input.reportDate, label, actor: input.actor, at: input.now, dependsOn: [recordOp, ...deps] }, portion, attempt);
    }
    return recordId;
  }, []);
  return result;
}

export interface PortionCorrection {
  /** null for a portion added while editing. */
  id: string | null;
  portion: PortionWrite;
  /** The portion's own fields changed (Para, range, Total Lines, assigned): queued as one group. */
  portionChanged: boolean;
  positionChanged: boolean;
  removed: boolean;
  /** The latest attempt's correction (8.7: earlier attempts are read-only), or the first attempt of a new portion. */
  attempt: AttemptWrite | null;
  latestAttemptId: string | null;
  outcomeChanged: boolean;
  remarksChanged: boolean;
}

export interface CorrectionInput {
  recordId: string;
  reportDate: string;
  studentName: string;
  /** A new session label (MULTI_SESSION), or undefined when unchanged. */
  sessionLabel?: string | null;
  attendance: AttendanceWrite | null;
  actor: Actor;
  portions: PortionCorrection[];
  now: string;
}

/**
 * An audited correction of an existing record (FR-DAY-009; F05-AC4): UPDATE operations for what changed, CREATEs for
 * portions added, `removed: true` for portions removed (their rows and attempts stay), all in ONE transaction.
 * Returns the number of operations queued.
 */
export async function saveCorrection(outbox: Outbox, input: CorrectionInput): Promise<number> {
  const label = `${input.studentName} · ${input.reportDate}`;
  const { result } = await outbox.saveWithOp(async (tx) => {
    let ops = 0;
    const deps: string[] = [];
    if (input.attendance) {
      deps.push((await writeMarkInTx(tx, outbox, input.attendance.input, input.attendance.ctx)).opId);
      ops += 1;
    }
    if (input.sessionLabel !== undefined) {
      await tx.run('UPDATE daily_records SET session_label = ? WHERE id = ?', [input.sessionLabel, input.recordId]);
      await outbox.enqueueUpdate(tx, { entity: 'daily_record', entityId: input.recordId, fields: { sessionLabel: input.sessionLabel }, label });
      ops += 1;
    }
    const recordCreate = await pendingCreate(tx, outbox, 'daily_record', input.recordId);
    for (const c of input.portions) {
      if (c.id === null) {
        if (c.removed || !c.attempt) continue;
        await createPortionWithAttempt(
          tx,
          outbox,
          { recordId: input.recordId, reportDate: input.reportDate, label, actor: input.actor, at: input.now, dependsOn: [...(recordCreate ? [recordCreate] : []), ...deps] },
          c.portion,
          c.attempt,
        );
        ops += 2;
        continue;
      }
      if (c.removed) {
        await tx.run('UPDATE lesson_portions SET removed = 1 WHERE id = ?', [c.id]);
        await outbox.enqueueUpdate(tx, { entity: 'lesson_portion', entityId: c.id, fields: { removed: true }, label });
        ops += 1;
        continue;
      }
      if (c.portionChanged || c.positionChanged) {
        const p = c.portion;
        await tx.run(
          `UPDATE lesson_portions SET position = ?, para_number = ?, surah_start = ?, ayah_start = ?, surah_end = ?, ayah_end = ?, assigned_unit = ?,
             assigned_num = ?, assigned_den = ?, total_lines = ?, total_lines_source = ? WHERE id = ?`,
          [
            p.position,
            p.paraNumber,
            p.range?.surahStart ?? null,
            p.range?.ayahStart ?? null,
            p.range?.surahEnd ?? null,
            p.range?.ayahEnd ?? null,
            p.assigned.unit,
            p.assigned.numerator,
            p.assigned.denominator,
            p.section === 'SABAQ' ? p.totalLines : null,
            p.section === 'SABAQ' ? p.totalLinesSource : null,
            c.id,
          ],
        );
        const fields = { ...(c.positionChanged ? { position: p.position } : {}), ...(c.portionChanged ? portionGroup(p) : {}) };
        await outbox.enqueueUpdate(tx, { entity: 'lesson_portion', entityId: c.id, fields, dependsOn: deps, label });
        ops += 1;
      }
      if (c.attempt && c.latestAttemptId && (c.outcomeChanged || c.remarksChanged)) {
        await updateAttemptRow(tx, c.latestAttemptId, c.attempt);
        const fields = { ...(c.outcomeChanged ? attemptOutcome(c.attempt) : {}), ...(c.remarksChanged ? { remarks: c.attempt.remarks } : {}) };
        await outbox.enqueueUpdate(tx, { entity: 'portion_attempt', entityId: c.latestAttemptId, fields, dependsOn: deps, label });
        ops += 1;
      }
    }
    return ops;
  }, []);
  return result;
}

/**
 * Adds a new attempt to a portion (F05-AC15): attempt number one above the highest, earlier attempts untouched, in
 * one transaction with its CREATE (depending on the portion's CREATE while that is unsynced). Returns the attempt ID.
 */
export async function addAttempt(outbox: Outbox, input: { portionId: string; reportDate: string; studentName: string; actor: Actor; attempt: AttemptWrite; now: string }): Promise<string> {
  const label = `${input.studentName} · ${input.reportDate}`;
  const { result } = await outbox.saveWithOp(async (tx) => {
    const existing = await tx.all<{ attempt_no: number }>('SELECT attempt_no FROM portion_attempts WHERE lesson_portion_id = ?', [input.portionId]);
    const attemptNo = nextAttemptNo(existing.map((r) => ({ attemptNo: Number(r.attempt_no) })));
    const id = outbox.newEntityId();
    await insertAttempt(tx, id, input.portionId, input.reportDate, attemptNo, input.now, input.actor, input.attempt);
    const portionCreate = await pendingCreate(tx, outbox, 'lesson_portion', input.portionId);
    await outbox.enqueue(tx, {
      entity: 'portion_attempt',
      entityId: id,
      opType: 'CREATE',
      baseVersion: null,
      fields: { lessonPortionId: input.portionId, attemptNo, attemptedAt: input.now, ...attemptOutcome(input.attempt), remarks: input.attempt.remarks },
      dependsOn: portionCreate ? [portionCreate] : [],
      label,
    });
    return id;
  }, []);
  return result;
}

// ---------- Sync state of one record (UI spec §4.1) ----------

export type RecordSyncState = QueueState;

/** Every entity ID belonging to the record: the record, its portions, and their attempts. */
export const recordEntityIds = (record: LocalRecord): Set<string> =>
  new Set([record.id, ...record.portions.flatMap((p) => [p.id, ...p.attempts.map((a) => a.id)])]);

/** The record's operations in the queue (Sync Queue items for its record, portions, and attempts). */
export const recordItems = (items: readonly OutboxItem[], record: LocalRecord): OutboxItem[] => {
  const ids = recordEntityIds(record);
  return items.filter((i) => (HIFZ_ENTITIES as readonly string[]).includes(i.entity) && ids.has(i.entityId));
};

/**
 * One state for the whole record: ACTION_REQUIRED > FAILED > SYNCING > PENDING; SYNCED only when nothing is left
 * unacknowledged and the server has acknowledged the record itself (never ✓ before acknowledgement).
 */
export function recordSyncState(items: readonly OutboxItem[], record: LocalRecord): RecordSyncState {
  const states = new Set(recordItems(items, record).map((i) => i.status.state));
  for (const s of ['ACTION_REQUIRED', 'FAILED', 'SYNCING', 'PENDING'] as const) if (states.has(s)) return s;
  return record.rowVersion === null ? 'PENDING' : 'SYNCED';
}

/** Attendance statuses that allow portions (re-exported for screens). */
export const PORTION_ATTENDANCE: readonly AttendanceStatus[] = ['PRESENT', 'LATE', 'HALF_DAY'];
