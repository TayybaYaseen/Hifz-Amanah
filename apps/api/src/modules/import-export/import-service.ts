// Excel import (F14; US-058, US-059, US-060; FR-XLS-001…005, FR-XLS-010…018, NFR-XLS-001…003; DEC-B15, DEC-B43,
// DEC-B44; ARCHITECTURE.md §11). Plan: docs/handover/F14-plan.md.
//
// Upload → validate → preview → (mode) → explicit confirm → commit in batches → results:
// - Upload reads the workbook as data only and refuses it before any row is processed when the template, version,
//   required columns, or the 1,000-row limit are wrong (F14-AC2, AC3, AC22). The tenant is the caller's membership;
//   any organization column in the file is ignored (FR-XLS-015, F14-AC8).
// - The preview classifies every row (NEW, EXACT_MATCH, SUSPECTED_DUPLICATE, INVALID, PROPOSED_UPDATE) with row- and
//   field-level issues in the caller's language (F14-AC11, AC12). For DailyRecords the NEW rows are DRY-RUN through
//   the real write path (the F05 entity handlers: scope, enrollment, attendance, class day, report mode, Quran
//   metadata, quantities) in a transaction that is always rolled back, so the preview says exactly what the commit
//   will accept and writes nothing (F14-AC14).
// - Nothing is written to records until the user confirms. The default mode is ADD_ONLY: existing records are never
//   changed (F14-AC13). UPDATE needs a stable key; it changes a student's profile fields, or a portion's result
//   (status, completed, quality, MistakeCount, TeacherNotes) on its latest attempt as an audited correction; the
//   portion itself is never changed (user decision 2026-11-22, plan §2). Confirmed homework is never rewritten:
//   source changes go through the F08 hooks, which rebuild drafts only (FR-XLS-016).
// - The commit runs in batches of 200 rows (FR-XLS-018); a DailyRecords batch never splits one daily record. Each
//   batch is one transaction that re-classifies its rows against the current data and stores each row's result in
//   import_rows (job, row number). A failed batch rolls back whole and is marked FAILED; a retry commits only rows not
//   yet COMMITTED, so nothing is duplicated (F14-AC15). Within a batch, a refused row is rolled back alone (savepoint)
//   and the rest of the batch is kept.
// - Audited: IMPORT_REJECTED, IMPORT_PREVIEWED, IMPORT_COMMITTED with counts only (F14-AC20); each created or changed
//   record is also audited by its owning module.
// - Uploaded values are purged 7 days after upload; the job and its results are kept (NFR-PRV-005, DEC-B44).
import { createHash } from 'node:crypto';
import { sql, type Selectable } from 'kysely';
import { v7 as uuidv7 } from 'uuid';
import {
  ConfirmImportRequest,
  IMPORT_BATCH_SIZE,
  IMPORT_CLASSIFICATIONS,
  IMPORT_ROW_RESULTS,
  IMPORT_VALUES_RETENTION_DAYS,
  ImportJobQuery,
  ImportRowsQuery,
  SetImportModeRequest,
  TEMPLATE_VERSIONS,
  UploadImportQuery,
  type ImportClassification,
  type ImportCounts,
  type ImportFieldChange,
  type ImportJobView,
  type ImportMode,
  type ImportResultCounts,
  type ImportRowIssue,
  type ImportRowsResponse,
  type ImportRowView,
  type ImportTemplate,
  type Locale,
} from '@hifz/contracts';
import { deriveSabaqPara } from '@hifz/domain/hifz';
import { classOn } from '@hifz/domain/roster';
import type { Clock } from '../../platform/clock.ts';
import type { Db, ImportJobsTable, ImportRowValuesColumn, Tx } from '../../platform/db.ts';
import { AppError, fieldError, parse } from '../../platform/errors.ts';
import { withTenant } from '../../platform/tenant.ts';
import { scopeOf } from '../access/policy.ts';
import { recordAudit } from '../audit/audit.ts';
import { enrollmentsOf } from '../calendar/shared.ts';
import { recordsOnDates, setImportedMistakeCount, storedPortions, type StoredPortion } from '../hifz/import-support.ts';
import { rangeReference, reportModeOf, UUID } from '../hifz/shared.ts';
import type { Actor } from '../identity/auth-service.ts';
import type { QuranMetadataService } from '../quran-ref/metadata-service.ts';
import { insertImportedStudent, updateImportedStudent } from '../roster/import-writes.ts';
import { requireRole, rosterActor, todayFor } from '../roster/shared.ts';
import type { SyncHandler, SyncRegistry } from '../sync/handler.ts';
import { serverCreate, serverUpdate, type ServerApply } from '../sync/server-apply.ts';
import { issueMessage, localeOf, rejectionMessage } from './messages.ts';
import {
  attemptChanges,
  attemptOfRow,
  classifyStudentRows,
  error,
  groupKeyOf,
  hasErrors,
  parseDailyRow,
  parseStudentRow,
  portionIssue,
  portionKeyOf,
  samePortion,
  warning,
  type AttemptFields,
  type DailyRowValue,
  type ExistingStudent,
  type Issue,
} from './rows.ts';
import { readWorkbook, WorkbookError, type ParsedRow } from './workbook.ts';

/** Test-only fault switch (F14-AC15): the batch with this number throws after its writes, so it rolls back. */
export const importFaults: { failBatch: number | null } = { failBatch: null };

const DAY_MS = 24 * 60 * 60 * 1000;
/** A job left COMMITTING (a crashed request) may be confirmed again after this long. */
const STALE_COMMIT_MS = 5 * 60 * 1000;

class Rollback extends Error {}

interface RowState {
  rowNo: number;
  classification: ImportClassification;
  issues: Issue[];
  changes: ImportFieldChange[];
  groupKey: string | null;
}

interface CommitOutcome {
  rowNo: number;
  result: 'COMMITTED' | 'FAILED' | 'SKIPPED';
  issues: Issue[];
  entityId: string | null;
}

const zeroCounts = (): ImportCounts => Object.fromEntries(IMPORT_CLASSIFICATIONS.map((c) => [c, 0])) as ImportCounts;
const zeroResults = (): ImportResultCounts => Object.fromEntries(IMPORT_ROW_RESULTS.map((c) => [c, 0])) as ImportResultCounts;

export interface ImportServiceDeps {
  db: Db;
  clock: Clock;
  registry: SyncRegistry;
  quran: QuranMetadataService;
}

export class ImportService {
  private readonly d: ImportServiceDeps;

  constructor(deps: ImportServiceDeps) {
    this.d = deps;
  }

  private handler(entity: 'daily_record' | 'lesson_portion' | 'portion_attempt'): SyncHandler {
    const h = this.d.registry.get(entity);
    if (!h) throw new Error(`import: no ${entity} handler`);
    return h;
  }

  // ---------- Upload and preview ----------

  async upload(actor: Actor, query: unknown, bytes: Buffer, acceptLanguage: string | undefined): Promise<ImportJobView> {
    const q = parse(UploadImportQuery, query);
    const locale = localeOf(q.locale, acceptLanguage);
    requireRole(actor, roleFor(q.template));
    const now = this.d.clock.now();
    let parsed;
    try {
      parsed = await readWorkbook(bytes, q.template);
    } catch (e) {
      if (!(e instanceof WorkbookError)) throw e;
      await withTenant(this.d.db, actor.organizationId, (tx) =>
        recordAudit(tx, {
          organizationId: actor.organizationId,
          actorUserId: actor.userId,
          action: 'IMPORT_REJECTED',
          targetType: 'IMPORT_JOB',
          targetId: null,
          summary: { template: q.template, reason: e.reason },
          at: now,
        }),
      );
      throw new AppError('WORKBOOK_REJECTED', { reason: e.reason, ...stringify(e.params) }, undefined, rejectionMessage(locale, e.reason, e.params));
    }
    const id = uuidv7();
    const states = await this.classify(actor, q.template, parsed.rows, 'ADD_ONLY');
    await withTenant(this.d.db, actor.organizationId, async (tx) => {
      await this.purgeExpired(tx, actor.organizationId, now);
      await tx
        .insertInto('import_jobs')
        .values({
          id,
          organization_id: actor.organizationId,
          template_name: q.template,
          template_version: parsed.version,
          mode: 'ADD_ONLY',
          status: 'PREVIEWED',
          file_sha256: createHash('sha256').update(bytes).digest('hex'),
          row_count: parsed.rows.length,
          ignored_columns: JSON.stringify(parsed.ignoredColumns),
          counts: JSON.stringify(countsOf(states)),
          created_by: actor.userId,
          created_at: now,
          updated_at: now,
          confirmed_by: null,
          confirmed_at: null,
          finished_at: null,
          values_purge_at: new Date(now.getTime() + IMPORT_VALUES_RETENTION_DAYS * DAY_MS),
          values_purged_at: null,
        })
        .execute();
      const byRow = new Map(states.map((s) => [s.rowNo, s]));
      for (let i = 0; i < parsed.rows.length; i += 250) {
        await tx
          .insertInto('import_rows')
          .values(
            parsed.rows.slice(i, i + 250).map((r) => {
              const s = byRow.get(r.rowNo)!;
              return {
                organization_id: actor.organizationId,
                job_id: id,
                row_no: r.rowNo,
                values: JSON.stringify({ cells: r.cells, cellIssues: r.cellIssues } satisfies ImportRowValuesColumn),
                classification: s.classification,
                issues: JSON.stringify(s.issues),
                changes: JSON.stringify(s.changes),
                group_key: s.groupKey,
                batch_no: null,
                result: null,
                result_issues: '[]',
                entity_id: null,
                committed_at: null,
              };
            }),
          )
          .execute();
      }
      await recordAudit(tx, {
        organizationId: actor.organizationId,
        actorUserId: actor.userId,
        action: 'IMPORT_PREVIEWED',
        targetType: 'IMPORT_JOB',
        targetId: id,
        summary: { template: q.template, version: parsed.version, mode: 'ADD_ONLY', rows: parsed.rows.length, counts: countsOf(states), ignoredColumns: parsed.ignoredColumns.length },
        at: now,
      });
    });
    return this.view(actor, id, locale);
  }

  /** Re-runs the preview in another mode. Records are never written (F14-AC14). */
  async setMode(actor: Actor, id: string, body: unknown, query: unknown, acceptLanguage: string | undefined): Promise<ImportJobView> {
    const { mode } = parse(SetImportModeRequest, body);
    const locale = localeOf(parse(ImportJobQuery, query).locale, acceptLanguage);
    const job = await this.jobFor(actor, id);
    if (job.status !== 'PREVIEWED' || job.values_purged_at !== null) throw new AppError('IMPORT_STATE');
    const rows = await this.parsedRows(actor, id);
    const states = await this.classify(actor, job.template_name, rows, mode);
    await withTenant(this.d.db, actor.organizationId, async (tx) => {
      const locked = await tx.selectFrom('import_jobs').select('status').where('organization_id', '=', actor.organizationId).where('id', '=', id).forUpdate().executeTakeFirstOrThrow();
      if (locked.status !== 'PREVIEWED') throw new AppError('IMPORT_STATE');
      for (const s of states) {
        await tx
          .updateTable('import_rows')
          .set({ classification: s.classification, issues: JSON.stringify(s.issues), changes: JSON.stringify(s.changes), group_key: s.groupKey })
          .where('organization_id', '=', actor.organizationId)
          .where('job_id', '=', id)
          .where('row_no', '=', s.rowNo)
          .execute();
      }
      await tx
        .updateTable('import_jobs')
        .set({ mode, counts: JSON.stringify(countsOf(states)), updated_at: this.d.clock.now() })
        .where('organization_id', '=', actor.organizationId)
        .where('id', '=', id)
        .execute();
    });
    return this.view(actor, id, locale);
  }

  // ---------- Confirm and commit ----------

  /**
   * Commits the previewed rows in batches of 200 (F14-AC22). A retry after a failure commits only the rows not yet
   * committed (F14-AC15). The mode sent must be the mode previewed.
   */
  async confirm(actor: Actor, id: string, body: unknown, query: unknown, acceptLanguage: string | undefined): Promise<ImportJobView> {
    const { mode } = parse(ConfirmImportRequest, body);
    const locale = localeOf(parse(ImportJobQuery, query).locale, acceptLanguage);
    const org = actor.organizationId;
    const now = this.d.clock.now();
    const job = await this.jobFor(actor, id);
    requireRole(actor, roleFor(job.template_name));
    if (job.mode !== mode) throw fieldError('mode', 'NOT_PREVIEWED');
    const retry = job.status === 'PARTIALLY_FAILED' || job.status === 'COMMITTING';

    // Claim the job (one commit at a time) and fix the batches on the first confirm.
    await withTenant(this.d.db, org, async (tx) => {
      const j = await tx.selectFrom('import_jobs').select(['status', 'updated_at', 'values_purged_at', 'batch_count']).where('organization_id', '=', org).where('id', '=', id).forUpdate().executeTakeFirstOrThrow();
      const stale = j.status === 'COMMITTING' && now.getTime() - j.updated_at.getTime() > STALE_COMMIT_MS;
      if (j.values_purged_at !== null || !(j.status === 'PREVIEWED' || j.status === 'PARTIALLY_FAILED' || stale)) throw new AppError('IMPORT_STATE');
      if (j.batch_count === 0) {
        const rows = await tx.selectFrom('import_rows').select(['row_no', 'group_key']).where('organization_id', '=', org).where('job_id', '=', id).orderBy('row_no').execute();
        const batches = batchesOf(rows.map((r) => ({ rowNo: r.row_no, groupKey: r.group_key })));
        for (const [n, rowNos] of batches.entries()) {
          await tx.updateTable('import_rows').set({ batch_no: n + 1 }).where('organization_id', '=', org).where('job_id', '=', id).where('row_no', 'in', rowNos).execute();
        }
        await tx.updateTable('import_jobs').set({ batch_count: batches.length }).where('organization_id', '=', org).where('id', '=', id).execute();
      }
      await tx
        .updateTable('import_jobs')
        .set({ status: 'COMMITTING', updated_at: now, confirmed_by: actor.userId, confirmed_at: now })
        .where('organization_id', '=', org)
        .where('id', '=', id)
        .execute();
    });

    const all = await this.parsedRows(actor, id);
    const meta = await withTenant(this.d.db, org, (tx) =>
      tx.selectFrom('import_rows').select(['row_no', 'batch_no', 'result']).where('organization_id', '=', org).where('job_id', '=', id).orderBy('row_no').execute(),
    );
    const batchCount = Math.max(0, ...meta.map((m) => m.batch_no ?? 0));
    for (let batch = 1; batch <= batchCount; batch++) {
      const pending = new Set(meta.filter((m) => m.batch_no === batch && m.result !== 'COMMITTED' && m.result !== 'SKIPPED').map((m) => m.row_no));
      if (pending.size === 0) continue;
      try {
        await withTenant(this.d.db, org, async (tx) => {
          const outcomes = await this.commitBatch(tx, actor, job.template_name, mode, all, pending, id);
          await this.storeOutcomes(tx, org, id, outcomes);
          if (importFaults.failBatch === batch) {
            importFaults.failBatch = null;
            throw new Error('import batch failed (test fault)');
          }
        });
      } catch {
        // The batch rolled back whole: none of its rows is committed (F14-AC15). The reason is never logged with values.
        await withTenant(this.d.db, org, (tx) =>
          this.storeOutcomes(tx, org, id, [...pending].map((rowNo) => ({ rowNo, result: 'FAILED' as const, issues: [error(null, 'BATCH_FAILED')], entityId: null }))),
        );
      }
    }

    await withTenant(this.d.db, org, async (tx) => {
      const results = await tx.selectFrom('import_rows').select(['result']).where('organization_id', '=', org).where('job_id', '=', id).execute();
      const counts = zeroResults();
      for (const r of results) counts[r.result ?? 'FAILED'] += 1;
      const at = this.d.clock.now();
      const status = counts.FAILED > 0 ? 'PARTIALLY_FAILED' : 'COMMITTED';
      await tx
        .updateTable('import_jobs')
        .set({ status, result_counts: JSON.stringify(counts), updated_at: at, finished_at: at })
        .where('organization_id', '=', org)
        .where('id', '=', id)
        .execute();
      await recordAudit(tx, {
        organizationId: org,
        actorUserId: actor.userId,
        action: 'IMPORT_COMMITTED',
        targetType: 'IMPORT_JOB',
        targetId: id,
        summary: { template: job.template_name, mode, rows: job.row_count, batches: batchCount, retry, status, results: counts, counts: job.counts },
        at,
      });
    });
    return this.view(actor, id, locale);
  }

  private async commitBatch(tx: Tx, actor: Actor, template: ImportTemplate, mode: ImportMode, all: ParsedRow[], pending: ReadonlySet<number>, jobId: string): Promise<CommitOutcome[]> {
    const at = this.d.clock.now();
    if (template === 'Students') {
      const { classified } = await this.studentStates(tx, actor, all, mode);
      const today = await todayFor(tx, actor.organizationId, this.d.clock);
      const out: CommitOutcome[] = [];
      for (const c of classified) {
        if (!pending.has(c.rowNo)) continue;
        if (c.plan.kind === 'CREATE') {
          const v = c.plan.value;
          const entityId = await insertImportedStudent(tx, actor, { name: v.name!, externalStudentId: v.externalStudentId, admissionDate: v.admissionDate, status: v.status, notes: v.notes, classId: c.plan.classId }, { jobId, today, at });
          out.push({ rowNo: c.rowNo, result: 'COMMITTED', issues: c.issues, entityId });
        } else if (c.plan.kind === 'UPDATE' && mode === 'UPDATE') {
          const set = c.plan.set;
          await updateImportedStudent(
            tx,
            actor,
            c.plan.studentId,
            { ...(set.name ? { name: set.name } : {}), ...(set.admissionDate ? { admissionDate: set.admissionDate } : {}), ...(set.notes ? { notes: set.notes } : {}), ...(set.status ? { status: set.status } : {}) },
            { jobId, at },
          );
          out.push({ rowNo: c.rowNo, result: 'COMMITTED', issues: c.issues, entityId: c.plan.studentId });
        } else out.push({ rowNo: c.rowNo, result: 'SKIPPED', issues: c.issues, entityId: null });
      }
      return out;
    }
    const daily = await this.dailyStates(tx, actor, all, mode);
    const applied = await this.applyDaily(tx, actor, daily.items.filter((i) => pending.has(i.rowNo)), mode, jobId, at);
    return daily.items
      .filter((i) => pending.has(i.rowNo))
      .map((i) => {
        const a = applied.get(i.rowNo);
        if (a) return a.ok ? { rowNo: i.rowNo, result: 'COMMITTED' as const, issues: i.state.issues, entityId: a.entityId } : { rowNo: i.rowNo, result: 'FAILED' as const, issues: a.issues, entityId: null };
        return { rowNo: i.rowNo, result: 'SKIPPED' as const, issues: i.state.issues, entityId: null };
      });
  }

  private async storeOutcomes(tx: Tx, org: string, jobId: string, outcomes: readonly CommitOutcome[]): Promise<void> {
    const at = this.d.clock.now();
    for (const o of outcomes) {
      await tx
        .updateTable('import_rows')
        .set({ result: o.result, result_issues: JSON.stringify(o.issues), entity_id: o.entityId, committed_at: o.result === 'COMMITTED' ? at : null })
        .where('organization_id', '=', org)
        .where('job_id', '=', jobId)
        .where('row_no', '=', o.rowNo)
        .execute();
    }
  }

  // ---------- Classification ----------

  /** Classifies every row; DailyRecords NEW rows are dry-run through the real write path, then rolled back. */
  private async classify(actor: Actor, template: ImportTemplate, rows: ParsedRow[], mode: ImportMode): Promise<RowState[]> {
    if (template === 'Students') {
      return withTenant(this.d.db, actor.organizationId, async (tx) => {
        const { classified } = await this.studentStates(tx, actor, rows, mode);
        return classified.map((c) => ({ rowNo: c.rowNo, classification: c.classification, issues: c.issues, changes: c.changes, groupKey: null }));
      });
    }
    let states: RowState[] = [];
    try {
      await withTenant(this.d.db, actor.organizationId, async (tx) => {
        const daily = await this.dailyStates(tx, actor, rows, mode);
        const dry = await this.applyDaily(tx, actor, daily.items, 'ADD_ONLY', null, this.d.clock.now(), { creates: true, updates: false });
        states = daily.items.map((i) => {
          const a = dry.get(i.rowNo);
          return a && !a.ok ? { ...i.state, classification: 'INVALID' as const, issues: [...i.state.issues.filter((x) => x.severity === 'WARNING'), ...a.issues] } : i.state;
        });
        throw new Rollback();
      });
    } catch (e) {
      if (!(e instanceof Rollback)) throw e;
    }
    return states;
  }

  private async studentStates(tx: Tx, actor: Actor, rows: ParsedRow[], mode: ImportMode) {
    const org = actor.organizationId;
    const access = await rosterActor(tx, actor);
    const scope = scopeOf(access);
    const today = await todayFor(tx, org, this.d.clock);
    const [classes, students] = await Promise.all([
      tx.selectFrom('classes').select(['id', 'name', 'status']).where('organization_id', '=', org).execute(),
      tx.selectFrom('students').select(['id', 'name', 'external_student_id', 'admission_date', 'status', 'private_notes']).where('organization_id', '=', org).execute(),
    ]);
    const enrollments = await enrollmentsOf(tx, org, students.map((s) => s.id));
    const className = new Map(classes.map((c) => [c.id, c.name]));
    const existing: ExistingStudent[] = students.map((s) => {
      const list = enrollments.get(s.id) ?? [];
      const current = classOn(list, today);
      return {
        id: s.id,
        name: s.name,
        externalStudentId: s.external_student_id,
        admissionDate: s.admission_date,
        status: s.status,
        notes: s.private_notes,
        classIds: list.filter((e) => e.endDate === null || e.endDate >= today).map((e) => e.classId),
        className: current ? (className.get(current) ?? null) : null,
      };
    });
    const parsed = rows.map((r) => ({ rowNo: r.rowNo, ...parseStudentRow(r) }));
    const classified = classifyStudentRows(parsed, {
      mode,
      canManage: actor.role === 'OWNER' || actor.role === 'ADMIN',
      scopeClassIds: scope.kind === 'CLASSES' ? [...scope.classIds] : null,
      classes,
      students: existing,
    });
    return { classified };
  }

  /** Static DailyRecords classification: parsing, students, keys, composite matches, in-file duplicates, scope. */
  private async dailyStates(tx: Tx, actor: Actor, rows: ParsedRow[], mode: ImportMode) {
    const org = actor.organizationId;
    const reportMode = await reportModeOf(tx, org);
    const today = await todayFor(tx, org, this.d.clock);
    const access = await rosterActor(tx, actor);
    const scope = scopeOf(access);
    const parsed = rows.map((r) => ({ rowNo: r.rowNo, ...parseDailyRow(r, { mode: reportMode, today }) }));

    // Students by ExternalStudentID, in the active madrasa only (F14-AC7, AC8).
    const extIds = [...new Set(parsed.map((p) => p.value.externalStudentId?.toLowerCase()).filter((x): x is string => !!x))];
    const students = extIds.length
      ? await tx.selectFrom('students').select(['id', 'external_student_id']).where('organization_id', '=', org).where(sql<string>`lower(btrim(external_student_id))`, 'in', extIds).execute()
      : [];
    const studentByExt = new Map(students.map((s) => [s.external_student_id!.trim().toLowerCase(), s.id]));
    const enrollments = await enrollmentsOf(tx, org, students.map((s) => s.id));

    // Stable keys: an ExternalRecordID imported before, or an exported portion id (round trip).
    const keys = [...new Set(parsed.map((p) => p.value.externalRecordId).filter((x): x is string => !!x))];
    const keyed = keys.length
      ? await tx.selectFrom('import_record_keys').select(['external_record_id', 'lesson_portion_id']).where('organization_id', '=', org).where(sql<string>`lower(external_record_id)`, 'in', keys.map((k) => k.toLowerCase())).execute()
      : [];
    const portionByKey = new Map(keyed.map((k) => [k.external_record_id.toLowerCase(), k.lesson_portion_id]));
    for (const k of keys) if (!portionByKey.has(k.toLowerCase()) && UUID.test(k)) portionByKey.set(k.toLowerCase(), k.toLowerCase());
    const keyedPortions = new Map((await storedPortions(tx, org, { portionIds: [...new Set(portionByKey.values())] })).map((p) => [p.id, p]));

    // Composite matches (same student, date, session, section, and portion number) for rows without a known key.
    const dates = [...new Set(parsed.map((p) => p.value.recordDate).filter((x): x is string => !!x))];
    const existingPortions = await storedPortions(tx, org, { studentIds: students.map((s) => s.id), dates });
    const composite = new Set(existingPortions.map((p) => portionKeyOf(groupKeyOf(p.studentId, p.recordDate, p.sessionLabel), p.section, p.position)));

    // In-file duplicates: a repeated ExternalRecordID (every such row), or a repeated portion (later rows).
    const keyCount = new Map<string, number>();
    for (const p of parsed) if (p.value.externalRecordId) keyCount.set(p.value.externalRecordId.toLowerCase(), (keyCount.get(p.value.externalRecordId.toLowerCase()) ?? 0) + 1);
    const seenPortions = new Set<string>();

    const items = parsed.map((p) => {
      const v = p.value;
      const issues = [...p.issues];
      let plan: DailyPlan = { kind: 'NONE' };
      const state = (classification: ImportClassification, groupKey: string | null, changes: ImportFieldChange[] = []): RowState => ({ rowNo: p.rowNo, classification, issues, changes, groupKey });
      if (v.externalRecordId && (keyCount.get(v.externalRecordId.toLowerCase()) ?? 0) > 1) issues.push(error('ExternalRecordID', 'DUPLICATE_KEY', { column: 'ExternalRecordID' }));
      const studentId = v.externalStudentId ? studentByExt.get(v.externalStudentId.toLowerCase()) : undefined;
      if (v.externalStudentId && !studentId && !p.issues.some((i) => i.column === 'ExternalStudentID')) issues.push(error('ExternalStudentID', 'STUDENT_NOT_FOUND'));
      const groupKey = studentId && v.recordDate ? groupKeyOf(studentId, v.recordDate, v.sessionLabel) : null;
      if (hasErrors(issues) || !studentId || !groupKey) return { rowNo: p.rowNo, value: v, studentId: studentId ?? null, state: state('INVALID', groupKey), plan };
      // A Teacher imports records only for students in their classes on that date (FR-SEC-003).
      const classId = classOn(enrollments.get(studentId) ?? [], v.recordDate!);
      if (scope.kind === 'CLASSES' && classId !== null && !scope.classIds.has(classId)) {
        issues.push(error('ExternalStudentID', 'NOT_YOUR_CLASS'));
        return { rowNo: p.rowNo, value: v, studentId, state: state('INVALID', groupKey), plan };
      }
      const pKey = portionKeyOf(groupKey, v.section!, v.position!);
      if (seenPortions.has(pKey)) {
        issues.push(error('PortionNumber', 'DUPLICATE_KEY', { column: 'PortionNumber' }));
        return { rowNo: p.rowNo, value: v, studentId, state: state('INVALID', groupKey), plan };
      }
      seenPortions.add(pKey);

      // ---- A stable key that names an existing portion: exact match, or a proposed update of its result. ----
      const stored = v.externalRecordId ? keyedPortions.get(portionByKey.get(v.externalRecordId.toLowerCase()) ?? '') : undefined;
      if (stored) {
        const same = samePortion(
          { studentId: stored.studentId, recordDate: stored.recordDate, sessionLabel: stored.sessionLabel, section: stored.section, position: stored.position, paraNumber: stored.paraNumber, range: stored.range, totalLines: stored.totalLines, assigned: stored.assigned },
          v,
          studentId,
        );
        const storedAttempt = stored.latest ? storedAttemptFields(stored) : null;
        const diff = storedAttempt ? attemptChanges(storedAttempt, attemptOfRow(v)) : null;
        if (same && diff && diff.changes.length === 0) return { rowNo: p.rowNo, value: v, studentId, state: state('EXACT_MATCH', groupKey), plan };
        if (mode === 'ADD_ONLY') {
          issues.push(error(null, 'EXISTS_DIFFERENT'));
          return { rowNo: p.rowNo, value: v, studentId, state: state('SUSPECTED_DUPLICATE', groupKey), plan };
        }
        if (!same) {
          issues.push(error(null, 'PORTION_CHANGE_NOT_ALLOWED'));
          return { rowNo: p.rowNo, value: v, studentId, state: state('INVALID', groupKey), plan };
        }
        if (!storedAttempt || !diff) {
          issues.push(error(null, 'NO_ATTEMPT'));
          return { rowNo: p.rowNo, value: v, studentId, state: state('INVALID', groupKey), plan };
        }
        if (diff.set.mistakeCount != null && diff.set.mistakeCount < stored.latest!.categorizedCount) {
          issues.push(error('MistakeCount', 'OUT_OF_RANGE', { min: stored.latest!.categorizedCount, max: 1000 }));
          return { rowNo: p.rowNo, value: v, studentId, state: state('INVALID', groupKey), plan };
        }
        plan = { kind: 'UPDATE', attemptId: stored.latest!.id, categorized: stored.latest!.categorizedCount, set: diff.set };
        return { rowNo: p.rowNo, value: v, studentId, state: state('PROPOSED_UPDATE', groupKey, diff.changes), plan };
      }

      // ---- No known key: a portion already at the same place is for review, never the same record (FR-XLS-013). ----
      if (composite.has(pKey)) {
        issues.push(error('PortionNumber', 'COMPOSITE_MATCH'));
        return { rowNo: p.rowNo, value: v, studentId, state: state('SUSPECTED_DUPLICATE', groupKey), plan };
      }
      plan = { kind: 'CREATE', studentId, classId };
      return { rowNo: p.rowNo, value: v, studentId, state: state('NEW', groupKey), plan };
    });
    return { items, reportMode };
  }

  /**
   * Writes the planned rows through the hifz handlers (creates: record → portion → attempt; updates: the latest
   * attempt). Each row is its own savepoint: a refused row is rolled back alone and reported with its issues.
   */
  private async applyDaily(
    tx: Tx,
    actor: Actor,
    items: readonly DailyItem[],
    mode: ImportMode,
    jobId: string | null,
    at: Date,
    which: { creates: boolean; updates: boolean } = { creates: true, updates: true },
  ): Promise<Map<number, { ok: true; entityId: string } | { ok: false; issues: Issue[] }>> {
    const org = actor.organizationId;
    const out = new Map<number, { ok: true; entityId: string } | { ok: false; issues: Issue[] }>();
    const recordH = this.handler('daily_record');
    const portionH = this.handler('lesson_portion');
    const attemptH = this.handler('portion_attempt');
    const creates = which.creates ? items.filter((i) => i.plan.kind === 'CREATE') : [];
    const updates = which.updates && mode === 'UPDATE' ? items.filter((i) => i.plan.kind === 'UPDATE') : [];
    const ref = creates.some((i) => i.value.section === 'SABAQ') ? await rangeReference(tx, this.d.quran, org) : null;
    const reportMode = await reportModeOf(tx, org);
    const existingRecords = await recordsOnDates(tx, org, [...new Set(creates.map((i) => i.studentId!))], [...new Set(creates.map((i) => i.value.recordDate!))]);
    const recordFor = new Map<string, string>();
    for (const r of existingRecords) {
      const key = reportMode === 'SINGLE' ? groupKeyOf(r.studentId, r.date, null) : r.sessionLabel === null ? null : groupKeyOf(r.studentId, r.date, r.sessionLabel);
      if (key && !recordFor.has(key)) recordFor.set(key, r.id);
    }
    let sp = 0;
    const savepoint = async <T>(work: () => Promise<{ ok: true; value: T } | { ok: false; issues: Issue[] }>): Promise<{ ok: true; value: T } | { ok: false; issues: Issue[] }> => {
      const name = sql.raw(`import_sp_${++sp}`);
      await sql`SAVEPOINT ${name}`.execute(tx);
      const result = await work();
      await sql`${sql.raw(result.ok ? 'RELEASE SAVEPOINT' : 'ROLLBACK TO SAVEPOINT')} ${name}`.execute(tx);
      return result;
    };

    for (const item of creates) {
      const v = item.value;
      const plan = item.plan as Extract<DailyPlan, { kind: 'CREATE' }>;
      const sabaq = v.section === 'SABAQ';
      if (sabaq && v.paraNumber !== null && v.range && ref) {
        const derived = deriveSabaqPara(v.range, ref);
        if (derived !== null && derived !== v.paraNumber) {
          out.set(item.rowNo, { ok: false, issues: [error('ParaNumber', 'PARA_MISMATCH')] });
          continue;
        }
      }
      const groupKey = item.state.groupKey!;
      const result = await savepoint<string>(async () => {
        let recordId = recordFor.get(groupKey);
        if (!recordId) {
          if (plan.classId === null) return { ok: false, issues: [error('RecordDate', 'NOT_ENROLLED')] };
          const created = await serverCreate(tx, recordH, actor, uuidv7(), { studentId: plan.studentId, classId: plan.classId, reportDate: v.recordDate, sessionLabel: v.sessionLabel, overallLabel: null }, at);
          if (!created.ok) return { ok: false, issues: handlerIssues(created, v) };
          recordId = created.entityId;
        }
        const portion = await serverCreate(
          tx,
          portionH,
          actor,
          uuidv7(),
          {
            dailyRecordId: recordId,
            section: v.section,
            position: v.position,
            isExtra: false,
            paraNumber: sabaq ? null : v.paraNumber,
            range: v.range,
            assigned: v.assigned,
            totalLines: sabaq ? v.totalLines : null,
            totalLinesSource: sabaq ? 'MANUAL' : null,
            homeworkPortionId: null,
          },
          at,
        );
        if (!portion.ok) return { ok: false, issues: handlerIssues(portion, v) };
        const attempt = await serverCreate(
          tx,
          attemptH,
          actor,
          uuidv7(),
          {
            lessonPortionId: portion.entityId,
            attemptNo: 1,
            attemptedAt: `${v.recordDate}T00:00:00.000Z`,
            status: v.status,
            completed: v.completed,
            quality: v.quality,
            noMistakes: false,
            mistakes: [],
            remarks: v.teacherNotes,
            remarksVisibility: 'INTERNAL',
          },
          at,
        );
        if (!attempt.ok) return { ok: false, issues: handlerIssues(attempt, v) };
        // MistakeCount is one uncategorized total on the attempt; no mistake category is created (F14-AC9).
        if (v.mistakeCount !== null) await setImportedMistakeCount(tx, org, attempt.entityId, v.mistakeCount, at, actor.userId);
        if (v.externalRecordId && jobId) {
          await tx
            .insertInto('import_record_keys')
            .values({ organization_id: org, external_record_id: v.externalRecordId, lesson_portion_id: portion.entityId, attempt_id: attempt.entityId, job_id: jobId, created_at: at })
            .execute();
        }
        recordFor.set(groupKey, recordId);
        return { ok: true, value: portion.entityId };
      });
      out.set(item.rowNo, result.ok ? { ok: true, entityId: result.value } : result);
    }

    for (const item of updates) {
      const plan = item.plan as Extract<DailyPlan, { kind: 'UPDATE' }>;
      const result = await savepoint<string>(async () => {
        const row = await attemptH.load(tx, org, plan.attemptId, { forUpdate: false });
        if (!row) return { ok: false, issues: [error(null, 'NO_ATTEMPT')] };
        const set = plan.set;
        const changes: Record<string, unknown> = {};
        if (set.status !== undefined || set.completed !== undefined || set.quality !== undefined) {
          const status = set.status ?? row.fields.status;
          const statusOnlyChanged = set.status !== undefined && set.completed === undefined;
          changes.status = status;
          // A changed status recomputes its default (NOT_REMEMBERED → 0, COMPLETED → assigned) unless a quantity was given.
          changes.completed = set.completed !== undefined ? set.completed : statusOnlyChanged ? null : row.fields.completed;
          changes.quality = set.quality !== undefined ? set.quality : ['ABSENT', 'NOT_ASSIGNED', 'PENDING'].includes(String(status)) ? null : row.fields.quality;
          changes.noMistakes = row.fields.noMistakes;
          changes.mistakes = row.fields.mistakes;
        }
        if (set.teacherNotes !== undefined) changes.remarks = set.teacherNotes;
        if (Object.keys(changes).length > 0) {
          const updated = await serverUpdate(tx, attemptH, actor, plan.attemptId, changes, at);
          if (!updated.ok) return { ok: false, issues: handlerIssues(updated, item.value) };
        }
        // The stored uncategorized count is the file's total minus the categorized mistakes recorded in the app.
        if (set.mistakeCount != null) await setImportedMistakeCount(tx, org, plan.attemptId, set.mistakeCount - plan.categorized, at, actor.userId);
        return { ok: true, value: plan.attemptId };
      });
      out.set(item.rowNo, result.ok ? { ok: true, entityId: result.value } : result);
    }
    return out;
  }

  // ---------- Reads ----------

  async get(actor: Actor, id: string, query: unknown, acceptLanguage: string | undefined): Promise<ImportJobView> {
    const locale = localeOf(parse(ImportJobQuery, query).locale, acceptLanguage);
    await this.jobFor(actor, id);
    return this.view(actor, id, locale);
  }

  async rows(actor: Actor, id: string, query: unknown, acceptLanguage: string | undefined): Promise<ImportRowsResponse> {
    const q = parse(ImportRowsQuery, query);
    const locale = localeOf(q.locale, acceptLanguage);
    await this.jobFor(actor, id);
    return withTenant(this.d.db, actor.organizationId, async (tx) => {
      let base = tx.selectFrom('import_rows').where('organization_id', '=', actor.organizationId).where('job_id', '=', id);
      if (q.classification) base = base.where('classification', '=', q.classification);
      if (q.result) base = base.where('result', '=', q.result);
      const { n } = await base.select((eb) => eb.fn.countAll<string>().as('n')).executeTakeFirstOrThrow();
      const rows = await base
        .select(['row_no', 'classification', 'issues', 'changes', 'batch_no', 'result', 'result_issues'])
        .orderBy('row_no')
        .offset(q.offset)
        .limit(q.limit)
        .execute();
      return {
        total: Number(n),
        items: rows.map(
          (r): ImportRowView => ({
            rowNo: r.row_no,
            classification: r.classification,
            issues: localize(r.issues as Issue[], locale),
            changes: r.changes as ImportFieldChange[],
            batchNo: r.batch_no,
            result: r.result,
            resultIssues: localize(r.result_issues as Issue[], locale),
          }),
        ),
      };
    });
  }

  private async view(actor: Actor, id: string, _locale: Locale): Promise<ImportJobView> {
    const job = await this.jobFor(actor, id);
    const counts = { ...zeroCounts(), ...(job.counts as Partial<ImportCounts>) };
    return {
      id: job.id,
      template: job.template_name,
      templateVersion: job.template_version,
      mode: job.mode,
      status: job.status,
      rowCount: job.row_count,
      counts,
      resultCounts: job.result_counts ? { ...zeroResults(), ...(job.result_counts as Partial<ImportResultCounts>) } : null,
      batchCount: job.batch_count,
      createdAt: job.created_at.toISOString(),
      finishedAt: job.finished_at ? job.finished_at.toISOString() : null,
      ignoredColumns: job.ignored_columns,
      valuesPurged: job.values_purged_at !== null,
    };
  }

  /** The job, visible to its uploader and to Owner/Admin of the madrasa; anything else is the same 404. */
  private async jobFor(actor: Actor, id: string): Promise<Selectable<ImportJobsTable>> {
    if (!UUID.test(id)) throw new AppError('NOT_FOUND');
    const job = await withTenant(this.d.db, actor.organizationId, async (tx) => {
      await this.purgeExpired(tx, actor.organizationId, this.d.clock.now());
      return tx.selectFrom('import_jobs').selectAll().where('organization_id', '=', actor.organizationId).where('id', '=', id).executeTakeFirst();
    });
    if (!job) throw new AppError('NOT_FOUND');
    const manager = actor.role === 'OWNER' || actor.role === 'ADMIN';
    if (!manager && job.created_by !== actor.userId) throw new AppError('NOT_FOUND');
    if (actor.role !== 'OWNER' && actor.role !== 'ADMIN' && actor.role !== 'TEACHER') throw new AppError('NOT_FOUND');
    return job;
  }

  private async parsedRows(actor: Actor, id: string): Promise<ParsedRow[]> {
    const rows = await withTenant(this.d.db, actor.organizationId, (tx) =>
      tx.selectFrom('import_rows').select(['row_no', 'values']).where('organization_id', '=', actor.organizationId).where('job_id', '=', id).orderBy('row_no').execute(),
    );
    if (rows.some((r) => r.values === null)) throw new AppError('IMPORT_STATE');
    return rows.map((r) => ({ rowNo: r.row_no, cells: r.values!.cells, cellIssues: r.values!.cellIssues }));
  }

  /** NFR-PRV-005: uploaded values are kept 7 days; the job and its results stay. An unconfirmed job expires. */
  private async purgeExpired(tx: Tx, org: string, now: Date): Promise<void> {
    const due = await tx.selectFrom('import_jobs').select(['id', 'status']).where('organization_id', '=', org).where('values_purged_at', 'is', null).where('values_purge_at', '<=', now).execute();
    for (const j of due) {
      await tx.updateTable('import_rows').set({ values: null }).where('organization_id', '=', org).where('job_id', '=', j.id).execute();
      await tx
        .updateTable('import_jobs')
        .set({ values_purged_at: now, updated_at: now, ...(j.status === 'PREVIEWED' ? { status: 'EXPIRED' as const } : {}) })
        .where('organization_id', '=', org)
        .where('id', '=', j.id)
        .execute();
    }
  }

  /** An empty template workbook to fill in (design §4.15 step 2: the expected template and version). */
  templateFor(actor: Actor, template: ImportTemplate): { template: ImportTemplate; version: string } {
    requireRole(actor, roleFor(template));
    return { template, version: TEMPLATE_VERSIONS[template] };
  }
}

type DailyPlan =
  | { kind: 'CREATE'; studentId: string; classId: string | null }
  | { kind: 'UPDATE'; attemptId: string; categorized: number; set: Partial<AttemptFields> }
  | { kind: 'NONE' };

interface DailyItem {
  rowNo: number;
  value: DailyRowValue;
  studentId: string | null;
  state: RowState;
  plan: DailyPlan;
}

const roleFor = (template: ImportTemplate) => (template === 'Students' ? ('students.edit' as const) : ('daily.write' as const));

const stringify = (params: Record<string, string | number>): Record<string, string> => Object.fromEntries(Object.entries(params).map(([k, v]) => [k, String(v)]));

function countsOf(states: readonly RowState[]): ImportCounts {
  const c = zeroCounts();
  for (const s of states) c[s.classification] += 1;
  return c;
}

/** The stored latest attempt in the fields a row carries; MistakeCount is the attempt's total (categorized + imported). */
function storedAttemptFields(p: StoredPortion): AttemptFields {
  const a = p.latest!;
  const known = a.categorizedCount > 0 || a.mistakeCountSummary !== null || a.noMistakes;
  return {
    status: a.status,
    completed: a.completed,
    quality: a.quality,
    mistakeCount: known ? a.categorizedCount + (a.mistakeCountSummary ?? 0) : null,
    teacherNotes: a.remarks,
  };
}

/**
 * Commit batches of at most 200 rows in row order (FR-XLS-018). Rows of one daily record (group key) stay in one
 * batch; a group larger than a batch is a batch of its own.
 */
export function batchesOf(rows: readonly { rowNo: number; groupKey: string | null }[]): number[][] {
  const groups: number[][] = [];
  const at = new Map<string, number>();
  for (const r of rows) {
    if (r.groupKey === null) groups.push([r.rowNo]);
    else if (at.has(r.groupKey)) groups[at.get(r.groupKey)!]!.push(r.rowNo);
    else {
      at.set(r.groupKey, groups.length);
      groups.push([r.rowNo]);
    }
  }
  const batches: number[][] = [];
  let current: number[] = [];
  for (const g of groups) {
    if (current.length > 0 && current.length + g.length > IMPORT_BATCH_SIZE) {
      batches.push(current);
      current = [];
    }
    current.push(...g);
  }
  if (current.length > 0) batches.push(current);
  return batches;
}

/** A handler refusal as template-column issues (F05 field codes → F14 codes). */
function handlerIssues(result: Exclude<ServerApply, { ok: true }>, v: DailyRowValue): Issue[] {
  if ('notFound' in result) return [error('ExternalStudentID', 'NOT_YOUR_CLASS')];
  if ('conflictOpen' in result) return [error(null, 'CONFLICT_OPEN')];
  const out: Issue[] = [];
  for (const [key, code] of Object.entries(result.issues)) {
    if (key.includes('.')) continue;
    const max = result.issues[`${key}.max`];
    out.push(mapHandlerIssue(key, code, v, max === undefined ? undefined : Number(max)));
  }
  return out.length ? out : [error(null, 'INVALID')];
}

function mapHandlerIssue(key: string, code: string, v: DailyRowValue, max: number | undefined): Issue {
  switch (key) {
    case 'attendance':
      return error('RecordDate', 'ATTENDANCE_REQUIRED');
    case 'reportDate':
      if (code === 'FUTURE') return error('RecordDate', 'FUTURE_DATE');
      if (code === 'DUPLICATE_RECORD') return error('RecordDate', 'DUPLICATE_RECORD');
      if (code === 'INVALID') return error('RecordDate', 'INVALID_DATE');
      return error('RecordDate', 'NOT_A_CLASS_DAY');
    case 'sessionLabel':
      if (code === 'SESSION_LABEL_REQUIRED' || code === 'SESSION_LABEL_NOT_ALLOWED') return error('SessionLabel', code);
      if (code === 'SESSION_LABEL_TOO_LONG') return error('SessionLabel', 'TOO_LONG', { max: max ?? 40 });
      return error('SessionLabel', 'DUPLICATE_RECORD');
    case 'studentId':
    case 'classId':
      return error('RecordDate', 'NOT_ENROLLED');
    case 'range':
      if (code === 'METADATA_UNAVAILABLE') return error('SurahStart', 'METADATA_UNAVAILABLE');
      return error('SurahStart', code === 'CROSSES_SURAH' ? 'SABAQ_SURAH_END' : 'RANGE_INVALID');
    case 'paraNumber':
    case 'surah':
    case 'ayahStart':
    case 'ayahEnd':
    case 'totalLines':
    case 'unit':
    case 'assigned':
    case 'completed':
    case 'quality':
    case 'remarks':
    case 'status':
    case 'position':
      return portionIssue({ field: key, code: code as never, ...(max !== undefined ? { max } : {}) }, v.section);
    default:
      return error(null, 'INVALID');
  }
}

/** Issues with their messages in the caller's language (NFR-XLS-003). */
export function localize(issues: readonly Issue[], locale: Locale): ImportRowIssue[] {
  return issues.map((i) => ({ column: i.column, code: i.code, severity: i.severity, message: issueMessage(locale, i.code, { ...(i.column ? { column: i.column } : {}), ...(i.params ?? {}) }), ...(i.params ? { params: i.params } : {}) }));
}

export { warning };
