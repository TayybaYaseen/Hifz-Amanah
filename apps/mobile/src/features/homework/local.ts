// F08 · Homework on the device (US-033…038; F08-AC1…AC22; FR-HW-001…018; plan docs/handover/F08-plan.md §2).
//
// One offline entity, `homework_assignment`, with its portions inside it (plan §2.2): each portion has its own client
// UUIDv7 so a next-class lesson portion can link to it (FR-HW-015). Every write is ONE SQLite transaction with its
// outbox operation (F12-AC1):
// - CREATE: a DRAFT built by `suggest()` (packages/domain/homework) after a daily record is saved, or a Teacher's new
//   homework. It depends on the unsynced operations of its source record, portions, and attempts.
// - UPDATE (drafts only, through `enqueueUpdate`): due date, instructions, the active portion list, or REJECTED.
// - COMMAND CONFIRM_HOMEWORK (`enqueueCommand`): the device's confirmation time and the row versions of the sources it
//   saw (FR-HW-017). The local row stays a DRAFT until the server says otherwise: "Confirmed on device — waiting to
//   sync" is derived from the queued command (F08-AC20), and a confirmation that became a conflict is reviewed in
//   Conflict Review (F08-AC21), never confirmed silently.
// Confirmed homework is never edited here (FR-HW-012); revision is an online Owner/Admin request (HomeworkEditScreen).
// Instructions are staff text: never in an op label, the Sync Queue, or a log.
import type { HomeworkAssignmentSyncFields, HomeworkAssignmentView, HomeworkPortionInput } from '@hifz/contracts';
import { dayInfo, type CalendarException, type ScheduleVersion, type Weekday } from '@hifz/domain/calendar';
import {
  HOMEWORK_ASSIGNMENT_FIELDS,
  carryOver,
  homeworkCounts,
  homeworkPortionProgress,
  homeworkState,
  isLive,
  nextClassDay,
  portionFromSuggestion,
  rebuildDraft,
  suggest,
  type CarryOver,
  type HomeworkCounts,
  type HomeworkPortion,
  type HomeworkPortionProgress,
  type HomeworkState,
  type HomeworkStatus,
  type SourcePortion,
  type SuggestedPortion,
} from '@hifz/domain/homework';
import type { PortionStatus } from '@hifz/domain/hifz';
import { fractionText, type Quantity } from '@hifz/domain/quantity';
import type { QueueState } from '@hifz/domain/sync';
import type { SqlDriver, SqlExecutor } from '../../local-db/driver.ts';
import type { Migration } from '../../local-db/migrations.ts';
import { cacheWriteGuard, type CacheToken } from '../../sync/cacheEpoch.ts';
import type { Outbox, OutboxItem } from '../../sync/outbox.ts';
import type { EntityRegistry, LocalEntityHandler } from '../../sync/registry.ts';
import { DAILY_RECORD_RETENTION_DAYS } from '../../sync/retention.ts';
import type { LocalRecord } from '../daily-entry/local.ts';

export const HOMEWORK_ENTITY = 'homework_assignment' as const;
export const CONFIRM_COMMAND = 'CONFIRM_HOMEWORK' as const;

/**
 * Local schema for F08 (workspace migration 8). Additive only: the outbox is untouched (F12-AC16).
 * - homework_assignments: the entity table; portions are JSON on the row (they travel inside the assignment).
 * - lesson_portions.homework_portion_id: the next-class link (FR-HW-015, F08-AC16).
 * - sync_notices: facts an APPLIED result carried (CONFIRMED_HOMEWORK_UNCHANGED, F08-AC14, F05-AC4).
 * - class_calendar_cache: the class's schedule versions and calendar exceptions, so the due date defaults to the next
 *   class day offline too (FR-HW-004) and carried-over homework is computed on the device (FR-HW-016).
 */
export const homeworkMigration = (version: number): Migration => ({
  version,
  name: 'F08 homework assignments, next-class link, sync notices, class calendar cache',
  up: async (tx) => {
    await tx.exec(`
      CREATE TABLE homework_assignments (
        id                     TEXT PRIMARY KEY,
        row_version            INTEGER,
        student_id             TEXT,
        class_id               TEXT,
        source_daily_record_id TEXT,
        assigned_date          TEXT,
        due_date               TEXT,
        status                 TEXT,
        instructions           TEXT,
        created_by             TEXT,
        created_by_name        TEXT,
        confirmed_by           TEXT,
        confirmed_by_name      TEXT,
        confirmed_at           TEXT,
        revision_of            TEXT,
        superseded_by          TEXT,
        student_name           TEXT,
        portions               TEXT NOT NULL DEFAULT '[]'
      );
      CREATE INDEX homework_assignments_student ON homework_assignments (student_id, assigned_date);
      ALTER TABLE lesson_portions ADD COLUMN homework_portion_id TEXT;
      CREATE TABLE sync_notices (
        op_id       TEXT NOT NULL,
        notice      TEXT NOT NULL,
        entity      TEXT NOT NULL,
        entity_id   TEXT NOT NULL,
        created_at  TEXT NOT NULL,
        dismissed_at TEXT,
        PRIMARY KEY (op_id, notice)
      );
      CREATE INDEX sync_notices_row ON sync_notices (entity, entity_id);
      CREATE TABLE class_calendar_cache (
        class_id    TEXT PRIMARY KEY,
        versions    TEXT NOT NULL,
        exceptions  TEXT NOT NULL,
        fetched_at  TEXT NOT NULL
      );
    `);
  },
});

// ---------- Local shapes ----------

/** Why a portion was suggested (design.md §4.9): the source attempt's status and quantities. */
export interface PortionWhy {
  status: PortionStatus;
  assigned: Quantity;
  completed: Quantity | null;
  reason: 'REMAINING' | 'UNIT_MISMATCH' | 'UNKNOWN';
}

export interface LocalHomeworkPortion extends HomeworkPortion {
  /** The source record's date (design.md §4.9 "source record/attempt date"), when known. */
  sourceReportDate: string | null;
  why: PortionWhy | null;
}

export interface LocalAssignment {
  id: string;
  rowVersion: number | null;
  studentId: string;
  classId: string | null;
  sourceDailyRecordId: string | null;
  assignedDate: string;
  /** Null until the server set the default (created offline with no cached calendar). */
  dueDate: string | null;
  status: HomeworkStatus;
  instructions: string | null;
  createdBy: string | null;
  createdByName: string | null;
  confirmedBy: string | null;
  confirmedByName: string | null;
  confirmedAt: string | null;
  revisionOf: string | null;
  supersededBy: string | null;
  studentName: string | null;
  /** Active portions by section and position, then removed ones. */
  portions: LocalHomeworkPortion[];
}

interface AssignmentRow {
  id: string;
  row_version: number | null;
  student_id: string;
  class_id: string | null;
  source_daily_record_id: string | null;
  assigned_date: string;
  due_date: string | null;
  status: HomeworkStatus;
  instructions: string | null;
  created_by: string | null;
  created_by_name: string | null;
  confirmed_by: string | null;
  confirmed_by_name: string | null;
  confirmed_at: string | null;
  revision_of: string | null;
  superseded_by: string | null;
  student_name: string | null;
  portions: string;
}

const SECTION_ORDER = { SABAQ: 0, SABQI: 1, MANZIL: 2 } as const;

export const sortPortions = <T extends Pick<HomeworkPortion, 'section' | 'position' | 'removed'>>(list: readonly T[]): T[] =>
  [...list].sort((a, b) => Number(a.removed) - Number(b.removed) || SECTION_ORDER[a.section] - SECTION_ORDER[b.section] || a.position - b.position);

function parsePortions(text: string): LocalHomeworkPortion[] {
  try {
    const list = JSON.parse(text) as unknown;
    return Array.isArray(list) ? (list as LocalHomeworkPortion[]) : [];
  } catch {
    return [];
  }
}

const toAssignment = (r: AssignmentRow): LocalAssignment => ({
  id: r.id,
  rowVersion: r.row_version === null ? null : Number(r.row_version),
  studentId: r.student_id,
  classId: r.class_id,
  sourceDailyRecordId: r.source_daily_record_id,
  assignedDate: r.assigned_date,
  dueDate: r.due_date,
  status: r.status,
  instructions: r.instructions,
  createdBy: r.created_by,
  createdByName: r.created_by_name,
  confirmedBy: r.confirmed_by,
  confirmedByName: r.confirmed_by_name,
  confirmedAt: r.confirmed_at,
  revisionOf: r.revision_of,
  supersededBy: r.superseded_by,
  studentName: r.student_name,
  portions: sortPortions(parsePortions(r.portions)),
});

// ---------- Server rows → local rows ----------

/** Keeps what only the device knows about a portion (its source date and explanation) across a pull. */
async function mergeExtras(tx: SqlExecutor, id: string, incoming: readonly HomeworkPortion[]): Promise<LocalHomeworkPortion[]> {
  const row = await tx.get<{ portions: string }>('SELECT portions FROM homework_assignments WHERE id = ?', [id]);
  const known = new Map(parsePortions(row?.portions ?? '[]').map((p) => [p.id, p]));
  return incoming.map((p) => ({ ...p, sourceReportDate: known.get(p.id)?.sourceReportDate ?? null, why: known.get(p.id)?.why ?? null }));
}

async function upsertAssignment(tx: SqlExecutor, id: string, rowVersion: number, f: Partial<HomeworkAssignmentSyncFields>): Promise<void> {
  const portions = await mergeExtras(
    tx,
    id,
    (f.portions ?? []).map((p) => ({ ...p, lineCountEdition: p.lineCountEdition ?? null, removed: false })),
  );
  await tx.run(
    `INSERT INTO homework_assignments (id, row_version, student_id, class_id, source_daily_record_id, assigned_date, due_date, status, instructions,
       created_by, confirmed_by, confirmed_at, revision_of, portions)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT (id) DO UPDATE SET row_version = excluded.row_version, student_id = excluded.student_id, class_id = excluded.class_id,
       source_daily_record_id = excluded.source_daily_record_id, assigned_date = excluded.assigned_date, due_date = excluded.due_date,
       status = excluded.status, instructions = excluded.instructions, created_by = excluded.created_by, confirmed_by = excluded.confirmed_by,
       confirmed_at = excluded.confirmed_at, revision_of = excluded.revision_of, portions = excluded.portions,
       confirmed_by_name = CASE WHEN excluded.confirmed_by IS NULL THEN NULL ELSE homework_assignments.confirmed_by_name END`,
    [
      id,
      rowVersion,
      f.studentId ?? null,
      f.classId ?? null,
      f.sourceDailyRecordId ?? null,
      f.assignedDate ?? null,
      f.dueDate ?? null,
      f.status ?? 'DRAFT',
      f.instructions ?? null,
      f.createdBy ?? null,
      f.confirmedBy ?? null,
      f.confirmedAt ?? null,
      f.revisionOf ?? null,
      JSON.stringify(portions),
    ],
  );
}

const STATUS_LABEL_KEYS: Record<string, string> = { DRAFT: 'homework.statuses.DRAFT', CONFIRMED: 'homework.statuses.CONFIRMED', REJECTED: 'homework.statuses.REJECTED', SUPERSEDED: 'homework.statuses.SUPERSEDED' };

/** Conflict Review: the status reads as its canonical value (localized on screen through fieldLabelKey); missing → null. */
function formatValue(field: string, value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (field === 'portions' && Array.isArray(value)) {
    return (value as HomeworkPortion[])
      .map((p) => `${p.section} ${p.paraNumber ?? ''} ${p.assigned ? `${fractionText(p.assigned)} ${p.assigned.unit}` : '—'}`.replace(/\s+/g, ' ').trim())
      .join(' · ');
  }
  // Instructions are staff text: shown to staff in Conflict Review only, never logged.
  return typeof value === 'object' ? JSON.stringify(value) : String(value);
}

export const homeworkAssignmentHandler: LocalEntityHandler = {
  entity: HOMEWORK_ENTITY,
  table: 'homework_assignments',
  fieldSpec: HOMEWORK_ASSIGNMENT_FIELDS,
  upsertFromServer: (tx, id, rowVersion, f) => upsertAssignment(tx, id, rowVersion, f as Partial<HomeworkAssignmentSyncFields>),
  // The op label (student name · date) is shown; instructions are never a label.
  label: () => null,
  fieldLabelKey: (field) => ({ status: 'homework.statusField', dueDate: 'homework.dueDate', instructions: 'homework.instructions', portions: 'homework.portions' })[field] ?? null,
  formatValue,
  retention: { dateColumn: 'assigned_date', days: DAILY_RECORD_RETENTION_DAYS },
  onDiscard: async (tx, op) => {
    if (op.opType === 'CREATE') await tx.run('DELETE FROM homework_assignments WHERE id = ?', [op.entityId]);
  },
};

/** The i18n key of a stored status (localized labels only; the stored value stays canonical). */
export const statusLabelKey = (status: string): string => STATUS_LABEL_KEYS[status] ?? 'homework.statuses.DRAFT';

/** Registers `homework_assignment` once. */
export function registerHomework(registry: EntityRegistry): void {
  if (!registry.get(HOMEWORK_ENTITY)) registry.register(homeworkAssignmentHandler);
}

// ---------- Reads ----------

async function withSourceDates(db: SqlExecutor, list: LocalAssignment[]): Promise<LocalAssignment[]> {
  const missing = [...new Set(list.flatMap((a) => a.portions.filter((p) => p.sourceReportDate === null && p.sourceLessonPortionId).map((p) => p.sourceLessonPortionId as string)))];
  if (missing.length === 0) return list;
  const rows = await db.all<{ id: string; report_date: string | null }>(`SELECT id, report_date FROM lesson_portions WHERE id IN (${missing.map(() => '?').join(', ')})`, missing);
  const dates = new Map(rows.map((r) => [r.id, r.report_date]));
  return list.map((a) => ({ ...a, portions: a.portions.map((p) => (p.sourceReportDate === null && p.sourceLessonPortionId ? { ...p, sourceReportDate: dates.get(p.sourceLessonPortionId) ?? null } : p)) }));
}

export async function readAssignment(db: SqlExecutor, id: string): Promise<LocalAssignment | null> {
  const row = await db.get<AssignmentRow>('SELECT * FROM homework_assignments WHERE id = ?', [id]);
  return row ? (await withSourceDates(db, [toAssignment(row)]))[0]! : null;
}

/** A student's homework on this device, newest assigned first, then newest on this device. */
export async function assignmentsForStudent(db: SqlExecutor, studentId: string): Promise<LocalAssignment[]> {
  const rows = await db.all<AssignmentRow>('SELECT * FROM homework_assignments WHERE student_id = ? ORDER BY assigned_date DESC, rowid DESC', [studentId]);
  return withSourceDates(db, rows.map(toAssignment));
}

/** Attempt ids already carried forward by a live (draft or confirmed) assignment on this device. */
export async function carriedAttemptIds(db: SqlExecutor, exceptAssignment: string | null = null): Promise<Set<string>> {
  const rows = await db.all<AssignmentRow>("SELECT * FROM homework_assignments WHERE status IN ('DRAFT', 'CONFIRMED')");
  const out = new Set<string>();
  for (const a of rows.map(toAssignment)) {
    if (a.id === exceptAssignment) continue;
    for (const p of a.portions) if (!p.removed && p.sourceAttemptId) out.add(p.sourceAttemptId);
  }
  return out;
}

// ---------- Suggestions (domain suggest(), F08-AC3…AC6, AC22) ----------

/** A daily record's portions as the suggestion engine reads them (latest attempt decides, in the domain). */
export function sourcePortionsOf(record: LocalRecord): SourcePortion[] {
  return record.portions.flatMap((p) =>
    p.assigned === null
      ? []
      : [
          {
            id: p.id,
            section: p.section,
            position: p.position,
            isExtra: p.isExtra,
            removed: p.removed,
            paraNumber: p.paraNumber,
            range: p.range,
            totalLines: p.totalLines,
            lineCountEdition: p.lineCountEdition,
            assigned: p.assigned,
            homeworkPortionId: p.homeworkPortionId ?? null,
            rowVersion: p.rowVersion,
            attempts: p.attempts.map((a) => ({ id: a.id, attemptNo: a.attemptNo, status: a.status, completed: a.completed, rowVersion: a.rowVersion })),
          },
        ],
  );
}

/** The suggested draft portions for a record, numbered per section (empty: "Nothing to carry forward"). */
export function suggestionsFor(record: LocalRecord, alreadyCarried: ReadonlySet<string>): SuggestedPortion[] {
  return suggest({ portions: sourcePortionsOf(record), alreadyCarried });
}

/** Suggestions as new SUGGESTED draft portions (client UUIDv7 each), with their source date and explanation. */
export function draftPortions(suggestions: readonly SuggestedPortion[], reportDate: string, newId: () => string): LocalHomeworkPortion[] {
  return suggestions.map((s) => ({ ...portionFromSuggestion(s, newId()), sourceReportDate: reportDate, why: s.why }));
}

// ---------- Calendar cache (due date and carried-over homework on the device) ----------

export interface CachedCalendar {
  versions: ScheduleVersion[];
  exceptions: CalendarException[];
  fetchedAt: string;
}

/**
 * Caches a class calendar fetched online, only if the class was not dropped since the fetch began: `token` is what
 * readCacheToken returned for this class BEFORE the requests were sent (security review: a late answer never writes
 * back a dropped class; sync/cacheEpoch.ts). One conditional statement, so the check and the write are atomic.
 * Returns true when written; false when the class was dropped meanwhile.
 */
export async function cacheCalendar(
  db: SqlExecutor,
  token: CacheToken,
  classId: string,
  versions: ReadonlyArray<{ effectiveFrom: string; weekdays: readonly number[] }>,
  exceptions: ReadonlyArray<{ id: string; classId: string | null; date: string; kind: CalendarException['kind']; label: string }>,
  at: string,
): Promise<boolean> {
  const v: ScheduleVersion[] = versions.map((x) => ({ classId, effectiveFrom: x.effectiveFrom, weekdays: x.weekdays.filter((d): d is Weekday => d >= 1 && d <= 7) }));
  const e: CalendarException[] = exceptions.filter((x) => x.classId === null || x.classId === classId).map((x) => ({ id: x.id, classId: x.classId, date: x.date, kind: x.kind, label: x.label }));
  const guard = cacheWriteGuard(token, classId);
  const result = await db.run(
    `INSERT INTO class_calendar_cache (class_id, versions, exceptions, fetched_at) SELECT ?, ?, ?, ? WHERE ${guard.sql}
     ON CONFLICT (class_id) DO UPDATE SET versions = excluded.versions, exceptions = excluded.exceptions, fetched_at = excluded.fetched_at`,
    [classId, JSON.stringify(v), JSON.stringify(e), at, ...guard.params],
  );
  return result.changes > 0;
}

export async function readCalendar(db: SqlExecutor, classId: string): Promise<CachedCalendar | null> {
  const row = await db.get<{ versions: string; exceptions: string; fetched_at: string }>('SELECT versions, exceptions, fetched_at FROM class_calendar_cache WHERE class_id = ?', [classId]);
  if (!row) return null;
  try {
    return { versions: JSON.parse(row.versions) as ScheduleVersion[], exceptions: JSON.parse(row.exceptions) as CalendarException[], fetchedAt: row.fetched_at };
  } catch {
    return null;
  }
}

/** The default due date (FR-HW-004, F08-AC18) from the cached calendar, or null (the server sets it on sync). */
export async function defaultDueOnDevice(db: SqlExecutor, classId: string, assignedDate: string): Promise<string | null> {
  const cal = await readCalendar(db, classId);
  if (!cal || cal.versions.length === 0) return null;
  return nextClassDay(classId, assignedDate, cal.versions, cal.exceptions);
}

// ---------- Writes ----------

export interface Actor {
  userId: string;
  name: string;
}

/** A portion as the `homework_assignment` op carries it (contracts HomeworkPortionInput). Sabaq Para is the server's. */
export function portionInput(p: HomeworkPortion): HomeworkPortionInput {
  const sabaq = p.section === 'SABAQ';
  return {
    id: p.id,
    section: p.section,
    position: p.position,
    paraNumber: sabaq ? null : p.paraNumber,
    range: p.range ? { ...p.range } : null,
    totalLines: sabaq ? p.totalLines : null,
    assigned: p.assigned ? { ...p.assigned } : null,
    origin: p.origin,
    sourceAttemptId: p.origin === 'TEACHER_ADDED' ? null : p.sourceAttemptId,
    instructions: p.instructions,
  };
}

/** Renumbers active portions 1…n within each section, in their current order; removed portions keep theirs. */
export function renumber<T extends HomeworkPortion>(list: readonly T[]): T[] {
  const next = { SABAQ: 0, SABQI: 0, MANZIL: 0 };
  return list.map((p) => (p.removed ? p : { ...p, position: (next[p.section] += 1) }));
}

/** The latest unsynced operation of each row given: a new operation that refers to them waits for it. */
async function latestUnsynced(tx: SqlExecutor, outbox: Outbox, rows: ReadonlyArray<{ entity: string; id: string }>): Promise<string[]> {
  const out = new Set<string>();
  for (const r of rows) {
    const unsynced = await outbox.unsyncedForRow(r.entity, r.id, tx);
    const last = unsynced.at(-1);
    if (last) out.add(last.opId);
  }
  return [...out];
}

export interface NewAssignment {
  studentId: string;
  classId: string;
  studentName: string;
  sourceDailyRecordId: string | null;
  assignedDate: string;
  dueDate: string | null;
  instructions: string | null;
  portions: LocalHomeworkPortion[];
  actor: Actor;
}

/** Inserts a DRAFT and queues its CREATE inside the caller's transaction. Returns the assignment ID. */
export async function createDraftInTx(tx: SqlExecutor, outbox: Outbox, input: NewAssignment): Promise<string> {
  const id = outbox.newEntityId();
  const portions = renumber(sortPortions(input.portions));
  await tx.run(
    `INSERT INTO homework_assignments (id, row_version, student_id, class_id, source_daily_record_id, assigned_date, due_date, status, instructions,
       created_by, created_by_name, student_name, portions) VALUES (?, NULL, ?, ?, ?, ?, ?, 'DRAFT', ?, ?, ?, ?, ?)`,
    [id, input.studentId, input.classId, input.sourceDailyRecordId, input.assignedDate, input.dueDate, input.instructions, input.actor.userId, input.actor.name, input.studentName, JSON.stringify(portions)],
  );
  const sources: Array<{ entity: string; id: string }> = [];
  if (input.sourceDailyRecordId) sources.push({ entity: 'daily_record', id: input.sourceDailyRecordId });
  for (const p of portions) {
    if (p.sourceLessonPortionId) sources.push({ entity: 'lesson_portion', id: p.sourceLessonPortionId });
    if (p.sourceAttemptId) sources.push({ entity: 'portion_attempt', id: p.sourceAttemptId });
  }
  await outbox.enqueue(tx, {
    entity: HOMEWORK_ENTITY,
    entityId: id,
    opType: 'CREATE',
    baseVersion: null,
    fields: {
      studentId: input.studentId,
      sourceDailyRecordId: input.sourceDailyRecordId,
      assignedDate: input.assignedDate,
      dueDate: input.dueDate,
      instructions: input.instructions,
      portions: portions.filter((p) => !p.removed).map(portionInput),
    },
    dependsOn: await latestUnsynced(tx, outbox, sources),
    label: `${input.studentName} · ${input.assignedDate}`,
  });
  return id;
}

/**
 * The draft for a daily record just saved (plan §2.1): suggest() over its latest attempts, in the caller's transaction
 * (the record's save). Nothing is created when nothing is eligible. Returns the draft ID or null.
 */
export async function createDraftForRecordInTx(
  tx: SqlExecutor,
  outbox: Outbox,
  record: LocalRecord,
  ctx: { actor: Actor; studentName: string; dueDate: string | null },
): Promise<string | null> {
  const suggestions = suggestionsFor(record, await carriedAttemptIds(tx));
  if (suggestions.length === 0) return null;
  return createDraftInTx(tx, outbox, {
    studentId: record.studentId,
    classId: record.classId,
    studentName: ctx.studentName,
    sourceDailyRecordId: record.id,
    assignedDate: record.reportDate,
    dueDate: ctx.dueDate,
    instructions: null,
    portions: draftPortions(suggestions, record.reportDate, () => outbox.newEntityId()),
    actor: ctx.actor,
  });
}

/** Saves a new assignment (a Teacher's homework, or a suggestion built on demand) in one transaction with its CREATE. */
export async function saveNewAssignment(outbox: Outbox, input: NewAssignment): Promise<string> {
  const { result } = await outbox.saveWithOp((tx) => createDraftInTx(tx, outbox, input), []);
  return result;
}

export interface DraftEdits {
  dueDate?: string;
  instructions?: string | null;
  /** The full portion list (active and removed); active ones are sent, a removed one is left out (its row is kept). */
  portions?: LocalHomeworkPortion[];
}

async function writeEdits(tx: SqlExecutor, outbox: Outbox, a: LocalAssignment, edits: DraftEdits, dependsOn: readonly string[] = []): Promise<boolean> {
  const fields: Record<string, unknown> = {};
  if (edits.dueDate !== undefined && edits.dueDate !== a.dueDate) {
    await tx.run('UPDATE homework_assignments SET due_date = ? WHERE id = ?', [edits.dueDate, a.id]);
    fields.dueDate = edits.dueDate;
  }
  if (edits.instructions !== undefined && edits.instructions !== a.instructions) {
    await tx.run('UPDATE homework_assignments SET instructions = ? WHERE id = ?', [edits.instructions, a.id]);
    fields.instructions = edits.instructions;
  }
  if (edits.portions !== undefined) {
    const next = renumber(sortPortions(edits.portions));
    const active = (list: readonly HomeworkPortion[]) => JSON.stringify(list.filter((p) => !p.removed).map(portionInput));
    if (active(next) !== active(a.portions)) {
      await tx.run('UPDATE homework_assignments SET portions = ? WHERE id = ?', [JSON.stringify(next), a.id]);
      fields.portions = next.filter((p) => !p.removed).map(portionInput);
    }
  }
  if (Object.keys(fields).length === 0) return false;
  await outbox.enqueueUpdate(tx, { entity: HOMEWORK_ENTITY, entityId: a.id, fields, ...(dependsOn.length ? { dependsOn } : {}), label: `${a.studentName ?? ''} · ${a.assignedDate}` });
  return true;
}

export class NotDraftError extends Error {
  constructor() {
    super('Only a draft can be changed; confirmed homework is never edited (FR-HW-012)');
    this.name = 'NotDraftError';
  }
}

/** A draft whose confirmation is queued, syncing, in review, or acknowledged by the server: no longer edited here. */
export class ConfirmationPendingError extends NotDraftError {
  constructor() {
    super();
    this.message = 'This draft was confirmed on this device; it is not changed until the server answers';
    this.name = 'ConfirmationPendingError';
  }
}

/** The fields of a CONFIRM_HOMEWORK operation that decide whether it still holds the draft. */
type ConfirmOpState = Pick<OutboxItem, 'opId'> & { status: Pick<OutboxItem['status'], 'state' | 'conflictId' | 'rowVersion'> };

/**
 * True when the server applied this confirmation and the device has not pulled a newer row yet (review M1): the
 * operation is SYNCED from an APPLIED result (not a settled conflict) and the local row is still the draft at, or
 * before, the acknowledged version.
 */
export function confirmAcknowledged(op: ConfirmOpState, a: Pick<LocalAssignment, 'status' | 'rowVersion'>, settledConflictOps: ReadonlySet<string> = new Set()): boolean {
  if (a.status !== 'DRAFT' || op.status.state !== 'SYNCED' || op.status.conflictId !== null || settledConflictOps.has(op.opId)) return false;
  return a.rowVersion === null || op.status.rowVersion === null || a.rowVersion <= op.status.rowVersion;
}

/**
 * True when the draft's latest CONFIRM_HOMEWORK holds it (review L1, H1): queued, syncing, held or in conflict review,
 * or acknowledged by the server and not pulled yet. A FAILED confirmation (the server refused it) does not hold it.
 */
export async function confirmationHeld(tx: SqlExecutor, a: Pick<LocalAssignment, 'id' | 'status' | 'rowVersion'>): Promise<boolean> {
  const row = await tx.get<{ op_id: string; state: QueueState; conflict_id: string | null; row_version: number | null }>(
    'SELECT op_id, state, conflict_id, row_version FROM outbox WHERE entity = ? AND entity_id = ? AND command = ? ORDER BY seq DESC LIMIT 1',
    [HOMEWORK_ENTITY, a.id, CONFIRM_COMMAND],
  );
  if (!row || row.state === 'FAILED') return false;
  if (row.state !== 'SYNCED') return true;
  const settled = await tx.get<{ op_id: string }>('SELECT op_id FROM conflicts WHERE op_id = ?', [row.op_id]);
  const op: ConfirmOpState = { opId: row.op_id, status: { state: row.state, conflictId: row.conflict_id, rowVersion: row.row_version === null ? null : Number(row.row_version) } };
  return confirmAcknowledged(op, a, settled ? new Set([row.op_id]) : new Set());
}

/** Op IDs whose result was a sync conflict (open or settled): a SYNCED one settled a conflict, it was not applied. */
export async function conflictOpIds(db: SqlExecutor): Promise<Set<string>> {
  const rows = await db.all<{ op_id: string }>('SELECT op_id FROM conflicts WHERE entity = ?', [HOMEWORK_ENTITY]);
  return new Set(rows.map((r) => r.op_id));
}

async function draftOrThrow(tx: SqlExecutor, id: string): Promise<LocalAssignment> {
  const a = await readAssignment(tx, id);
  if (!a || a.status !== 'DRAFT') throw new NotDraftError();
  if (await confirmationHeld(tx, a)) throw new ConfirmationPendingError();
  return a;
}

/** Saves a draft's edits (F08-AC8) in one transaction with one UPDATE. Returns false when nothing changed. */
export async function saveDraftEdits(outbox: Outbox, id: string, edits: DraftEdits): Promise<boolean> {
  const { result } = await outbox.saveWithOp(async (tx) => writeEdits(tx, outbox, await draftOrThrow(tx, id), edits), []);
  return result;
}

/** Rejects a draft (F08-AC9): REJECTED, no longer homework. */
export async function rejectDraft(outbox: Outbox, id: string): Promise<void> {
  await outbox.saveWithOp(async (tx) => {
    const a = await draftOrThrow(tx, id);
    await tx.run("UPDATE homework_assignments SET status = 'REJECTED' WHERE id = ?", [id]);
    await outbox.enqueueUpdate(tx, { entity: HOMEWORK_ENTITY, entityId: id, fields: { status: 'REJECTED' }, label: `${a.studentName ?? ''} · ${a.assignedDate}` });
  }, []);
}

/** The sources a confirmation checks (FR-HW-017): every active portion's source attempt and lesson portion, with the version on this device. */
export async function confirmationSources(tx: SqlExecutor, portions: readonly HomeworkPortion[]): Promise<Array<{ entity: 'portion_attempt' | 'lesson_portion'; id: string; rowVersion: number | null }>> {
  const out: Array<{ entity: 'portion_attempt' | 'lesson_portion'; id: string; rowVersion: number | null }> = [];
  const seen = new Set<string>();
  const version = async (table: 'portion_attempts' | 'lesson_portions', id: string) => {
    const row = await tx.get<{ row_version: number | null }>(`SELECT row_version FROM ${table} WHERE id = ?`, [id]);
    return row?.row_version === null || row?.row_version === undefined ? null : Number(row.row_version);
  };
  for (const p of portions) {
    if (p.removed) continue;
    if (p.sourceAttemptId && !seen.has(`a:${p.sourceAttemptId}`)) {
      seen.add(`a:${p.sourceAttemptId}`);
      out.push({ entity: 'portion_attempt', id: p.sourceAttemptId, rowVersion: await version('portion_attempts', p.sourceAttemptId) });
    }
    if (p.sourceLessonPortionId && !seen.has(`l:${p.sourceLessonPortionId}`)) {
      seen.add(`l:${p.sourceLessonPortionId}`);
      out.push({ entity: 'lesson_portion', id: p.sourceLessonPortionId, rowVersion: await version('lesson_portions', p.sourceLessonPortionId) });
    }
  }
  return out;
}

/**
 * Explicit confirmation (F08-AC10, AC20): pending edits are saved first, then the CONFIRM_HOMEWORK command with the
 * device's time and the sources it saw, all in ONE transaction. The row stays a DRAFT until the server applies it.
 */
export async function confirmDraft(outbox: Outbox, id: string, input: { confirmedAt: string; edits?: DraftEdits }): Promise<void> {
  await outbox.saveWithOp(async (tx) => {
    let a = await draftOrThrow(tx, id);
    if (input.edits && (await writeEdits(tx, outbox, a, input.edits))) a = (await readAssignment(tx, id))!;
    await outbox.enqueueCommand(tx, {
      entity: HOMEWORK_ENTITY,
      entityId: id,
      command: CONFIRM_COMMAND,
      fields: { confirmedAt: input.confirmedAt, sources: await confirmationSources(tx, a.portions) },
      label: `${a.studentName ?? ''} · ${a.assignedDate}`,
    });
  }, []);
}

/**
 * A source correction on this device (review H1; FR-HW-011, AC-HW-06/07): rebuilds the local DRAFTs sourced from the
 * changed lesson portions with the domain `suggest()` + `rebuildDraft()` over the latest attempts, inside the caller's
 * transaction (the correction or new attempt), and queues each changed draft's UPDATE there too. It mirrors the
 * server's homework hook: suggested portions follow the source (or are removed when no longer eligible), a newly
 * eligible source is added, and the Teacher's edited, added, or removed portions are kept. CONFIRMED homework is never
 * touched, nor is a draft whose confirmation is queued or acknowledged (the server decides it, FR-HW-017).
 * Returns how many drafts changed.
 */
export async function rebuildDraftsInTx(tx: SqlExecutor, outbox: Outbox, record: LocalRecord, changedPortionIds: Iterable<string>): Promise<number> {
  const scope = new Set(changedPortionIds);
  if (scope.size === 0) return 0;
  const rows = await tx.all<AssignmentRow>("SELECT * FROM homework_assignments WHERE status = 'DRAFT' AND student_id = ? ORDER BY id", [record.studentId]);
  const drafts = rows
    .map(toAssignment)
    .filter((a) => a.sourceDailyRecordId === record.id || a.portions.some((p) => p.sourceLessonPortionId !== null && scope.has(p.sourceLessonPortionId)));
  if (drafts.length === 0) return 0;
  const sources = sourcePortionsOf(record).filter((p) => scope.has(p.id));
  // Each draft UPDATE is sent after the source change it was rebuilt from.
  const deps = await latestUnsynced(tx, outbox, [
    ...sources.map((p) => ({ entity: 'lesson_portion', id: p.id })),
    ...sources.flatMap((p) => p.attempts.map((x) => ({ entity: 'portion_attempt', id: x.id }))),
  ]);
  let rebuilt = 0;
  for (const draft of drafts) {
    // Re-read: an earlier draft in this loop may have taken an attempt over (never carried twice).
    const a = await readAssignment(tx, draft.id);
    if (!a || a.status !== 'DRAFT' || (await confirmationHeld(tx, a))) continue;
    const suggestions = suggest({ portions: sources, alreadyCarried: await carriedAttemptIds(tx, a.id) });
    const { assignment, changed } = rebuildDraft(
      {
        id: a.id,
        studentId: a.studentId,
        status: a.status,
        assignedDate: a.assignedDate,
        dueDate: a.dueDate ?? a.assignedDate,
        instructions: a.instructions,
        createdBy: a.createdBy ?? '',
        confirmedBy: null,
        confirmedAt: null,
        revisionOf: a.revisionOf,
        portions: a.portions,
      },
      suggestions,
      scope,
      () => outbox.newEntityId(),
    );
    if (!changed) continue;
    const known = new Map(a.portions.map((p) => [p.id, p]));
    const bySource = new Map(suggestions.map((s) => [s.sourceLessonPortionId, s]));
    const portions: LocalHomeworkPortion[] = assignment.portions.map((p) => {
      const before = known.get(p.id);
      const followed = !p.removed && p.origin === 'SUGGESTED' && p.sourceLessonPortionId !== null && scope.has(p.sourceLessonPortionId);
      const s = followed ? bySource.get(p.sourceLessonPortionId as string) : undefined;
      return { ...p, sourceReportDate: s ? record.reportDate : (before?.sourceReportDate ?? null), why: s ? s.why : (before?.why ?? null) };
    });
    if (await writeEdits(tx, outbox, a, { portions }, deps)) rebuilt += 1;
  }
  return rebuilt;
}

/**
 * Writes server views (GET /homework/assignments, a revision's answer) to the device: names, superseded links, and,
 * for rows with no unsynced local change, the row itself (never last-write-wins, NFR-OFF-006).
 */
export async function storeViews(db: SqlDriver, views: readonly HomeworkAssignmentView[]): Promise<void> {
  if (views.length === 0) return;
  await db.transaction(async (tx) => {
    const pending = new Set((await tx.all<{ entity_id: string }>(`SELECT entity_id FROM outbox WHERE state != 'SYNCED' AND entity = ?`, [HOMEWORK_ENTITY])).map((r) => r.entity_id));
    for (const v of views) {
      if (!pending.has(v.id)) {
        await upsertAssignment(tx, v.id, v.rowVersion, {
          studentId: v.studentId,
          classId: v.classId,
          sourceDailyRecordId: v.sourceDailyRecordId,
          assignedDate: v.assignedDate,
          dueDate: v.dueDate,
          status: v.status,
          instructions: v.instructions,
          createdBy: v.createdBy.userId,
          confirmedBy: v.confirmedBy?.userId ?? null,
          confirmedAt: v.confirmedAt,
          revisionOf: v.revisionOf,
          portions: v.portions.filter((p) => !p.removed),
        });
        // The view also knows why each portion was suggested and the source date (design.md §4.9).
        const local = (await readAssignment(tx, v.id))!;
        const extras = new Map(v.portions.map((p) => [p.id, p.source]));
        const portions = local.portions.map((p) => {
          const s = extras.get(p.id);
          return s ? { ...p, sourceReportDate: s.reportDate, why: p.why ?? { status: s.status, assigned: s.assigned, completed: s.completed, reason: p.needsReview ? (s.completed === null ? 'UNKNOWN' : 'UNIT_MISMATCH') : 'REMAINING' } } : p;
        });
        await tx.run('UPDATE homework_assignments SET portions = ? WHERE id = ?', [JSON.stringify(portions), v.id]);
      }
      await tx.run(
        'UPDATE homework_assignments SET student_name = ?, created_by_name = ?, confirmed_by_name = ?, superseded_by = ? WHERE id = ?',
        [v.studentName, v.createdBy.displayName, v.confirmedBy?.displayName ?? null, v.supersededBy, v.id],
      );
    }
  });
}

// ---------- Sync state of one assignment ----------

export type ConfirmState =
  /** No confirmation queued. */
  | 'NONE'
  /** "Confirmed on device — waiting to sync" (F08-AC20). */
  | 'ON_DEVICE'
  /** The server found a changed source: a conflict to review (F08-AC21). */
  | 'CONFLICT'
  /** The server refused it (e.g. a portion still needs review). */
  | 'FAILED'
  /**
   * The server applied it (SYNCED) and the confirmed row has not been pulled yet (review M1): shown as confirmed,
   * never back as "Suggestion — not confirmed".
   */
  | 'ACKNOWLEDGED';

export interface AssignmentSync {
  confirm: ConfirmState;
  conflictId: string | null;
  /** The device's confirmation time carried by the queued command (kept as the confirmation time, F08-AC20). */
  confirmedAt: string | null;
  /** All of the row's operations: ACTION_REQUIRED > FAILED > SYNCING > PENDING; SYNCED once acknowledged. */
  state: QueueState;
  failure: { code: string; fields?: Record<string, string> } | null;
}

/**
 * The sync state of one assignment from the outbox. `settledConflictOps` (conflictOpIds) tells a SYNCED confirmation
 * that settled a conflict (the server's row decides; the pull brings it) from one the server applied (ACKNOWLEDGED).
 */
export function assignmentSync(
  items: readonly OutboxItem[],
  a: Pick<LocalAssignment, 'id' | 'rowVersion' | 'status'>,
  settledConflictOps: ReadonlySet<string> = new Set(),
): AssignmentSync {
  const rowItems = items.filter((i) => i.entity === HOMEWORK_ENTITY && i.entityId === a.id);
  const mine = rowItems.filter((i) => i.status.state !== 'SYNCED');
  const confirm = [...mine].reverse().find((i) => i.command === CONFIRM_COMMAND) ?? null;
  // No confirmation waiting: the latest one may have been applied while the row is still the draft on this device.
  const lastConfirm = rowItems.filter((i) => i.command === CONFIRM_COMMAND).reduce<OutboxItem | null>((m, i) => (m === null || i.seq > m.seq ? i : m), null);
  const acknowledged = confirm === null && lastConfirm !== null && confirmAcknowledged(lastConfirm, a, settledConflictOps);
  const states = new Set(mine.map((i) => i.status.state));
  let state: QueueState = a.rowVersion === null ? 'PENDING' : 'SYNCED';
  for (const s of ['ACTION_REQUIRED', 'FAILED', 'SYNCING', 'PENDING'] as const) {
    if (states.has(s)) {
      state = s;
      break;
    }
  }
  const failed = mine.find((i) => i.status.state === 'FAILED') ?? null;
  const shown = confirm ?? (acknowledged ? lastConfirm : null);
  return {
    confirm: acknowledged ? 'ACKNOWLEDGED' : confirm === null ? 'NONE' : confirm.status.conflictId ? 'CONFLICT' : confirm.status.state === 'FAILED' ? 'FAILED' : 'ON_DEVICE',
    conflictId: confirm?.status.conflictId ?? null,
    confirmedAt: typeof shown?.fields.confirmedAt === 'string' ? shown.fields.confirmedAt : null,
    state,
    failure: failed?.status.failure ?? null,
  };
}

/** A DRAFT confirmed on this device and still waiting (ON_DEVICE) or applied by the server (ACKNOWLEDGED). */
const confirmedHere = (a: Pick<LocalAssignment, 'status'>, confirm: ConfirmState | undefined): boolean =>
  a.status === 'DRAFT' && (confirm === 'ON_DEVICE' || confirm === 'ACKNOWLEDGED');

/** Which tab an assignment is listed in: drafts (not confirmed on the device) are suggestions, never confirmed homework. */
export function tabOf(a: Pick<LocalAssignment, 'status'>, sync: Pick<AssignmentSync, 'confirm'>): 'SUGGESTED' | 'CONFIRMED' | 'NONE' {
  if (a.status === 'DRAFT') return confirmedHere(a, sync.confirm) || sync.confirm === 'CONFLICT' ? 'CONFIRMED' : 'SUGGESTED';
  if (a.status === 'CONFIRMED' || a.status === 'SUPERSEDED') return 'CONFIRMED';
  return 'NONE';
}

/**
 * The assignment as the list shows it (review M1): a draft whose confirmation the server applied reads as CONFIRMED by
 * the user who confirmed it on this device, at the device's confirmation time, until the pull brings the server's row.
 * Anything else is returned unchanged.
 */
export function displayedAssignment(a: LocalAssignment, sync: Pick<AssignmentSync, 'confirm' | 'confirmedAt'>, actor: Actor): LocalAssignment {
  if (a.status !== 'DRAFT' || sync.confirm !== 'ACKNOWLEDGED') return a;
  return { ...a, status: 'CONFIRMED', confirmedAt: a.confirmedAt ?? sync.confirmedAt, confirmedBy: a.confirmedBy ?? actor.userId, confirmedByName: a.confirmedByName ?? actor.name };
}

// ---------- Display state on the device (FR-HW-015, FR-HW-016; never "failed") ----------

/** The next-class attempts linked to each homework portion on this device (FR-HW-015). */
export async function linkedProgress(db: SqlExecutor, portionIds: readonly string[]): Promise<Map<string, HomeworkPortionProgress & { lessonPortionIds: string[] }>> {
  const out = new Map<string, HomeworkPortionProgress & { lessonPortionIds: string[] }>();
  if (portionIds.length === 0) return out;
  const rows = await db.all<{ hp: string; lp: string; attempt_no: number | null; attempted_at: string | null; status: PortionStatus | null }>(
    `SELECT p.homework_portion_id AS hp, p.id AS lp, a.attempt_no, a.attempted_at, a.status
     FROM lesson_portions p LEFT JOIN portion_attempts a ON a.lesson_portion_id = p.id
     WHERE p.removed = 0 AND p.homework_portion_id IN (${portionIds.map(() => '?').join(', ')})`,
    [...portionIds],
  );
  for (const id of portionIds) {
    const mine = rows.filter((r) => r.hp === id);
    const attempts = mine.flatMap((r) => (r.status && r.attempted_at && r.attempt_no !== null ? [{ attemptNo: Number(r.attempt_no), attemptedAt: r.attempted_at, status: r.status }] : []));
    out.set(id, { ...homeworkPortionProgress(attempts), lessonPortionIds: [...new Set(mine.map((r) => r.lp))] });
  }
  return out;
}

export interface DeviceState {
  state: HomeworkState;
  carry: CarryOver | null;
  progress: Map<string, HomeworkPortionProgress>;
}

/**
 * The display state computed on the device with the domain (homeworkState, carryOver): from the cached calendar and
 * the attendance on this device. Without a cached calendar no carry-over is computed (nothing is guessed).
 */
export async function deviceState(db: SqlExecutor, a: LocalAssignment, today: string): Promise<DeviceState> {
  const active = a.portions.filter((p) => !p.removed);
  const progress = await linkedProgress(db, active.map((p) => p.id));
  let carry: CarryOver | null = null;
  const cal = a.classId ? await readCalendar(db, a.classId) : null;
  if (a.status === 'CONFIRMED' && a.dueDate && cal && cal.versions.length && a.classId) {
    const classId = a.classId;
    const marks = await db.all<{ report_date: string; status: string }>(
      'SELECT report_date, status FROM attendance_records WHERE student_id = ? AND report_date >= ? AND report_date <= ?',
      [a.studentId, a.dueDate, today],
    );
    const byDate = new Map(marks.map((m) => [m.report_date, m.status as 'PRESENT' | 'LATE' | 'HALF_DAY' | 'LEAVE' | 'ABSENT']));
    carry = carryOver(a.dueDate, today, (d) => ({ kind: dayInfo(classId, d, cal.versions, cal.exceptions).kind, attendance: byDate.get(d) ?? null }));
  } else if (a.status === 'CONFIRMED' && a.dueDate) {
    carry = { effectiveDueDate: a.dueDate, reason: null };
  }
  const list = active.map((p) => progress.get(p.id) ?? { attempted: false, status: null });
  return { state: homeworkState(a, list, carry, today), carry, progress: new Map(active.map((p, i) => [p.id, list[i]!])) };
}

/**
 * Homework counts, each separate (FR-RPT-007); rejected and superseded homework counts nowhere (F08-AC9). A draft
 * confirmed on this device (waiting to sync, or applied and not pulled yet) counts as confirmed, as the tabs list it
 * (review L3); one whose confirmation became a conflict is not confirmed (F08-AC21) and stays a draft.
 */
export function countsOf(items: ReadonlyArray<{ status: HomeworkStatus; state: HomeworkState; portions: readonly HomeworkPortionProgress[]; confirm?: ConfirmState }>): HomeworkCounts {
  return homeworkCounts(
    items
      .filter((i) => isLive(i.status) || i.status === 'SUPERSEDED')
      .map((i) => ({ status: confirmedHere(i, i.confirm) ? ('CONFIRMED' as const) : i.status, state: i.state, portions: i.portions })),
  );
}

// ---------- Due homework in Daily Entry (FR-HW-015, F08-AC16) ----------

export interface DuePortion {
  assignmentId: string;
  portion: LocalHomeworkPortion;
}

/**
 * Confirmed homework portions due for the student by `date` and not yet recorded against on this device: Daily Entry
 * offers each as a prefilled portion linked to it.
 */
export async function duePortions(db: SqlExecutor, studentId: string, date: string): Promise<DuePortion[]> {
  const rows = await db.all<AssignmentRow>(
    "SELECT * FROM homework_assignments WHERE student_id = ? AND status = 'CONFIRMED' AND due_date IS NOT NULL AND due_date <= ? ORDER BY due_date, id",
    [studentId, date],
  );
  const list = rows.map(toAssignment);
  const ids = list.flatMap((a) => a.portions.filter((p) => !p.removed).map((p) => p.id));
  if (ids.length === 0) return [];
  const linked = new Set(
    (await db.all<{ hp: string }>(`SELECT homework_portion_id AS hp FROM lesson_portions WHERE removed = 0 AND homework_portion_id IN (${ids.map(() => '?').join(', ')})`, ids)).map((r) => r.hp),
  );
  return list.flatMap((a) => a.portions.filter((p) => !p.removed && !linked.has(p.id)).map((portion) => ({ assignmentId: a.id, portion })));
}

/** The latest unsynced operation of the assignment holding each homework portion: a linking lesson portion waits for it. */
export async function homeworkDepsInTx(tx: SqlExecutor, outbox: Outbox, homeworkPortionIds: readonly string[]): Promise<string[]> {
  if (homeworkPortionIds.length === 0) return [];
  const rows = await tx.all<AssignmentRow>("SELECT * FROM homework_assignments WHERE status IN ('DRAFT', 'CONFIRMED')");
  const wanted = new Set(homeworkPortionIds);
  const holders = rows.map(toAssignment).filter((a) => a.portions.some((p) => wanted.has(p.id)));
  return latestUnsynced(tx, outbox, holders.map((a) => ({ entity: HOMEWORK_ENTITY, id: a.id })));
}

// ---------- Sync notices (F08-AC14, F05-AC4) ----------

/** Open notices about any of the given rows (e.g. a daily record's portions and attempts). */
export async function noticesFor(db: SqlExecutor, entityIds: Iterable<string>): Promise<Array<{ opId: string; notice: string }>> {
  const ids = [...entityIds];
  if (ids.length === 0) return [];
  const rows = await db.all<{ op_id: string; notice: string }>(
    `SELECT op_id, notice FROM sync_notices WHERE dismissed_at IS NULL AND entity_id IN (${ids.map(() => '?').join(', ')}) ORDER BY created_at`,
    ids,
  );
  return rows.map((r) => ({ opId: r.op_id, notice: r.notice }));
}

export async function dismissNotices(db: SqlExecutor, opIds: readonly string[], at: string): Promise<void> {
  for (const id of opIds) await db.run('UPDATE sync_notices SET dismissed_at = ? WHERE op_id = ?', [at, id]);
}
