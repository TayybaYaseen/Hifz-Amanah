// Shared hifz loaders and checks (F05; plan docs/handover/F05-plan.md §5). Every function runs inside the caller's
// tenant transaction (withTenant). The rules live in @hifz/domain/hifz, @hifz/domain/quantity, @hifz/domain/quran-ref,
// and @hifz/domain/roster; this file loads their inputs and maps their results to field issue codes.
import type { z } from 'zod';
import type { AttendanceStatus } from '@hifz/contracts';
import type { PortionFieldError, RangeReference } from '@hifz/domain/hifz';
import { quantity, type Quantity } from '@hifz/domain/quantity';
import { classOn, eligibleForEntry } from '@hifz/domain/roster';
import type { Executor, Tx } from '../../platform/db.ts';
import { authorize } from '../access/policy.ts';
import type { Actor } from '../identity/auth-service.ts';
import { rosterActor } from '../roster/shared.ts';
import { enrollmentsOf } from '../calendar/shared.ts';
import type { QuranMetadataService } from '../quran-ref/metadata-service.ts';

export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type Issues = Record<string, string>;

const CODE = /^[A-Z][A-Z0-9_]*$/;

/**
 * Field path → issue code for a strict hifz schema. Unlike the generic `issueFields`, a custom issue keeps its code
 * (SABAQ_PARA_NOT_ACCEPTED, QUALITY_NOT_ALLOWED, NO_MISTAKES_CONFLICT, …) so the app can localize it. Never values.
 */
export function schemaIssues(error: z.ZodError): Issues {
  const out: Issues = {};
  for (const issue of error.issues) {
    if (issue.code === 'unrecognized_keys') {
      for (const k of issue.keys) out[[...issue.path, k].join('.')] = 'NOT_ALLOWED';
      continue;
    }
    const key = issue.path.length ? issue.path.join('.') : '_';
    out[key] ??= issue.code === 'custom' && CODE.test(issue.message) ? issue.message : 'INVALID';
  }
  return out;
}

/** Domain field errors → the result's `fields` map: the first code per field, and `<field>.max`/`.min` limits. */
export function portionIssues(errors: readonly PortionFieldError[]): Issues {
  const out: Issues = {};
  for (const e of errors) {
    if (out[e.field] !== undefined) continue;
    out[e.field] = e.code;
    if (e.max !== undefined) out[`${e.field}.max`] = String(e.max);
    if (e.min !== undefined) out[`${e.field}.min`] = String(e.min);
  }
  return out;
}

export const hasIssues = (issues: Issues): boolean => Object.keys(issues).length > 0;

// ---------- Quantities and ranges as stored ----------

export interface QuantityColumns {
  unit: Quantity['unit'];
  num: number;
  den: number;
}

/** A canonical (reduced) quantity with its keys always in the same order, so conflict comparison is exact. */
export const canonical = (q: Quantity): Quantity => {
  const r = quantity(q.unit, q.numerator, q.denominator);
  return { unit: r.unit, numerator: r.numerator, denominator: r.denominator };
};

export const quantityOf = (unit: Quantity['unit'] | null, num: number | null, den: number | null): Quantity | null =>
  unit === null || num === null || den === null ? null : { unit, numerator: num, denominator: den };

export interface RangeValue {
  surahStart: number;
  ayahStart: number;
  surahEnd: number;
  ayahEnd: number;
}

export const rangeOf = (r: { surah_start: number | null; ayah_start: number | null; surah_end: number | null; ayah_end: number | null }): RangeValue | null =>
  r.surah_start === null || r.ayah_start === null || r.surah_end === null || r.ayah_end === null
    ? null
    : { surahStart: r.surah_start, ayahStart: r.ayah_start, surahEnd: r.surah_end, ayahEnd: r.ayah_end };

/** Remarks as stored: trimmed, blank → null. */
export function cleanRemarks(text: string | null | undefined): string | null {
  const t = text?.trim();
  return t ? t : null;
}

// ---------- Records ----------

export interface RecordContext {
  id: string;
  studentId: string;
  classId: string;
  reportDate: string;
}

export async function loadRecordContext(db: Executor, organizationId: string, id: string): Promise<RecordContext | null> {
  if (!UUID.test(id)) return null;
  const r = await db
    .selectFrom('daily_records')
    .select(['id', 'student_id', 'class_id', 'report_date'])
    .where('organization_id', '=', organizationId)
    .where('id', '=', id)
    .executeTakeFirst();
  return r ? { id: r.id, studentId: r.student_id, classId: r.class_id, reportDate: r.report_date } : null;
}

export interface PortionContext {
  record: RecordContext;
  portion: {
    id: string;
    section: 'SABAQ' | 'SABQI' | 'MANZIL';
    position: number;
    paraNumber: number | null;
    range: RangeValue | null;
    assigned: Quantity;
    totalLines: number | null;
    removed: boolean;
  };
}

export async function loadPortionContext(db: Executor, organizationId: string, id: string): Promise<PortionContext | null> {
  if (!UUID.test(id)) return null;
  const p = await db
    .selectFrom('lesson_portions as p')
    .innerJoin('daily_records as r', (j) => j.onRef('r.id', '=', 'p.daily_record_id').onRef('r.organization_id', '=', 'p.organization_id'))
    .select([
      'p.id',
      'p.section',
      'p.position',
      'p.para_number',
      'p.surah_start',
      'p.ayah_start',
      'p.surah_end',
      'p.ayah_end',
      'p.assigned_unit',
      'p.assigned_num',
      'p.assigned_den',
      'p.total_lines',
      'p.removed_at',
      'r.id as record_id',
      'r.student_id',
      'r.class_id',
      'r.report_date',
    ])
    .where('p.organization_id', '=', organizationId)
    .where('p.id', '=', id)
    .executeTakeFirst();
  if (!p) return null;
  return {
    record: { id: p.record_id, studentId: p.student_id, classId: p.class_id, reportDate: p.report_date },
    portion: {
      id: p.id,
      section: p.section,
      position: p.position,
      paraNumber: p.para_number,
      range: rangeOf(p),
      assigned: { unit: p.assigned_unit, numerator: p.assigned_num, denominator: p.assigned_den },
      totalLines: p.total_lines,
      removed: p.removed_at !== null,
    },
  };
}

// ---------- Scope, enrollment, attendance, mode ----------

/** The record's class is in the caller's `daily.write` scope (Teacher: assigned classes or "all classes"). */
export async function inDailyScope(tx: Tx, actor: Actor, classId: string): Promise<boolean> {
  return authorize(await rosterActor(tx, actor), 'daily.write', { organizationId: actor.organizationId, classIds: [classId] }) === 'ALLOW';
}

/**
 * Whether the student may have entries for the class on the date. New entries (CREATE) need an active student in an
 * active class on that date (F03 pickers); corrections only that the student was in that class then (records never
 * lock, FR-DAY-009, F05-AC19).
 */
export async function enrolledFor(tx: Tx, organizationId: string, target: { studentId: string; classId: string; reportDate: string }, mode: 'CREATE' | 'CORRECTION'): Promise<boolean> {
  const [klass, student] = await Promise.all([
    tx.selectFrom('classes').select(['id', 'status']).where('organization_id', '=', organizationId).where('id', '=', target.classId).executeTakeFirst(),
    tx.selectFrom('students').select(['id', 'status']).where('organization_id', '=', organizationId).where('id', '=', target.studentId).executeTakeFirst(),
  ]);
  if (!klass || !student) return false;
  const enrollments = (await enrollmentsOf(tx, organizationId, [student.id])).get(student.id) ?? [];
  return mode === 'CREATE'
    ? eligibleForEntry({ status: student.status, enrollments }, { id: klass.id, status: klass.status }, target.reportDate)
    : classOn(enrollments, target.reportDate) === target.classId;
}

/** The student's attendance status on the date, or null when unmarked (attendance is per day, FR-CAL-003). */
export async function attendanceOn(db: Executor, organizationId: string, studentId: string, date: string): Promise<AttendanceStatus | null> {
  const r = await db
    .selectFrom('attendance_records')
    .select('status')
    .where('organization_id', '=', organizationId)
    .where('student_id', '=', studentId)
    .where('report_date', '=', date)
    .executeTakeFirst();
  return r?.status ?? null;
}

export async function reportModeOf(db: Executor, organizationId: string): Promise<'SINGLE' | 'MULTI_SESSION'> {
  const org = await db.selectFrom('organizations').select('daily_report_mode').where('id', '=', organizationId).executeTakeFirstOrThrow();
  return org.daily_report_mode;
}

/** Records of a student on a date (for the report-mode rules), oldest first. */
export async function recordsOn(db: Executor, organizationId: string, studentId: string, date: string): Promise<{ id: string; sessionLabel: string | null }[]> {
  const rows = await db
    .selectFrom('daily_records')
    .select(['id', 'session_label'])
    .where('organization_id', '=', organizationId)
    .where('student_id', '=', studentId)
    .where('report_date', '=', date)
    .orderBy('created_at')
    .orderBy('id')
    .execute();
  return rows.map((r) => ({ id: r.id, sessionLabel: r.session_label }));
}

// ---------- Quran reference (F06 quran-ref service) ----------

/** The madrasa's active Quran metadata, or null when none is loaded (a Sabaq range is then refused, FR-SAB-007). */
export async function rangeReference(tx: Tx, quran: QuranMetadataService, organizationId: string): Promise<RangeReference | null> {
  const surahs = await quran.surahMeta(tx, organizationId);
  if (surahs.length === 0) return null;
  return { surahs, paras: await quran.paraBoundaries(tx, organizationId) };
}

// ---------- Lookups other modules use (replacing the F04/F06 stand-ins) ----------

/**
 * F04 `RecitedLookup` (FR-DAY-010, F04-AC19): the student has recited portions saved for the date — a non-removed
 * portion with at least one attempt on one of their daily records that day.
 */
export async function recitedPortions(db: Executor, organizationId: string, studentId: string, date: string): Promise<boolean> {
  const row = await db
    .selectFrom('portion_attempts as a')
    .innerJoin('lesson_portions as p', (j) => j.onRef('p.id', '=', 'a.lesson_portion_id').onRef('p.organization_id', '=', 'a.organization_id'))
    .innerJoin('daily_records as r', (j) => j.onRef('r.id', '=', 'p.daily_record_id').onRef('r.organization_id', '=', 'p.organization_id'))
    .select('a.id')
    .where('a.organization_id', '=', organizationId)
    .where('r.student_id', '=', studentId)
    .where('r.report_date', '=', date)
    .where('p.removed_at', 'is', null)
    .limit(1)
    .executeTakeFirst();
  return row !== undefined;
}

/** F04 `DailyRecordCounter` (F04-AC20): daily records on a date, for one class or the whole madrasa. */
export async function countDailyRecords(db: Executor, organizationId: string, date: string, classId: string | null): Promise<number> {
  let q = db.selectFrom('daily_records').select((eb) => eb.fn.countAll<string>().as('n')).where('organization_id', '=', organizationId).where('report_date', '=', date);
  if (classId) q = q.where('class_id', '=', classId);
  const { n } = await q.executeTakeFirstOrThrow();
  return Number(n);
}

/** F06 `RangeRecordSource` (FR-SAB-007, F06-AC19): every Sabaq portion's range, for the metadata review list. */
export async function sabaqRanges(db: Executor, organizationId: string): Promise<{ kind: string; id: string; range: { surah: number; ayahStart: number; ayahEnd: number } }[]> {
  const rows = await db
    .selectFrom('lesson_portions')
    .select(['id', 'surah_start', 'ayah_start', 'ayah_end'])
    .where('organization_id', '=', organizationId)
    .where('section', '=', 'SABAQ')
    .where('removed_at', 'is', null)
    .orderBy('created_at')
    .orderBy('id')
    .execute();
  return rows.flatMap((r) =>
    r.surah_start === null || r.ayah_start === null || r.ayah_end === null
      ? []
      : [{ kind: 'SABAQ_PORTION', id: r.id, range: { surah: r.surah_start, ayahStart: r.ayah_start, ayahEnd: r.ayah_end } }],
  );
}
