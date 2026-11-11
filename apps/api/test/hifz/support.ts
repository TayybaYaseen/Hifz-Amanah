// F05 integration helpers: sync operations for daily records, portions, and attempts, and the dates the seeded
// classes meet. Synthetic data only: the Quran reference is the SYNTHETIC fixture (every Surah has 20 Ayat; Para 1 =
// Surahs 1–3; the test layout covers Surahs 1–3 at 2 Ayat per line), never real metadata.
import { v7 as uuidv7 } from 'uuid';
import { expect } from 'vitest';
import { weekdayOf } from '@hifz/domain/calendar';
import { addDays, calendarDateIn } from '@hifz/domain/roster';
import type { Harness } from '../support/harness.ts';

export type StudentKey = 'S1' | 'S2' | 'S3' | 'SB1';
export type ClassKey = 'A1' | 'A2' | 'B1';
export type Ids = { classes: Record<ClassKey, string>; students: Record<StudentKey, string> };
export type OpResult = { opId: string; status: string; code?: string; fields?: Record<string, string>; rowVersion?: number; entityId?: string; conflictId?: string };
export type Quantity = { unit: string; numerator: number; denominator: number };

export const DEVICE = '0190f5c0-0000-4000-8000-0000000000f1';
export const DEVICE_2 = '0190f5c0-0000-4000-8000-0000000000f2';

let seq = 0;
const nextSeq = () => ++seq;

export const lines = (n: number): Quantity => ({ unit: 'LINES', numerator: n, denominator: 1 });
export const para = (numerator: number, denominator = 1): Quantity => ({ unit: 'PARA', numerator, denominator });

export function today(h: Harness): string {
  return calendarDateIn(h.clock.now(), 'Asia/Karachi');
}

/** The most recent Monday–Saturday on or before `back` days ago (a scheduled day for every seeded class). */
export function classDay(h: Harness, back = 1): string {
  let d = addDays(today(h), -back);
  while (weekdayOf(d) === 7) d = addDays(d, -1);
  return d;
}

/** The earliest Monday–Saturday on or after `back` days ago (inside the seeded 90-day enrollment). */
export function classDayFrom(h: Harness, back: number): string {
  let d = addDays(today(h), -back);
  while (weekdayOf(d) === 7) d = addDays(d, 1);
  return d;
}

function op(entity: string, opType: 'CREATE' | 'UPDATE', entityId: string, fields: Record<string, unknown>, baseVersion: number | null, dependsOn: string[] = []) {
  return { opId: uuidv7(), seq: nextSeq(), entity, entityId, opType, baseVersion, fields, dependsOn, clientSavedAt: new Date().toISOString() };
}

export const attendanceOp = (ids: Ids, student: StudentKey, date: string, status: string, classKey: ClassKey = 'A1', extra: Record<string, unknown> = {}) =>
  op('attendance_record', 'CREATE', uuidv7(), { studentId: ids.students[student], classId: ids.classes[classKey], reportDate: date, status, leaveReason: null, absentNote: null, ...extra }, null);

export const recordOp = (ids: Ids, student: StudentKey, date: string, opts: { classKey?: ClassKey; sessionLabel?: string | null; id?: string } = {}) =>
  op('daily_record', 'CREATE', opts.id ?? uuidv7(), { studentId: ids.students[student], classId: ids.classes[opts.classKey ?? 'A1'], reportDate: date, sessionLabel: opts.sessionLabel ?? null }, null);

export const recordUpdateOp = (id: string, base: number, sessionLabel: string | null) => op('daily_record', 'UPDATE', id, { sessionLabel }, base);

export interface PortionInput {
  section: 'SABAQ' | 'SABQI' | 'MANZIL';
  position?: number;
  isExtra?: boolean;
  paraNumber?: number | null;
  range?: { surahStart: number; ayahStart: number; surahEnd: number; ayahEnd: number } | null;
  assigned?: Quantity;
  totalLines?: number | null;
  totalLinesSource?: 'LAYOUT' | 'MANUAL' | null;
}

export function portionOp(recordId: string, p: PortionInput, id = uuidv7()) {
  const sabaq = p.section === 'SABAQ';
  const fields: Record<string, unknown> = {
    dailyRecordId: recordId,
    section: p.section,
    position: p.position ?? 1,
    isExtra: p.isExtra ?? false,
    paraNumber: p.paraNumber ?? null,
    range: p.range ?? null,
    totalLines: p.totalLines ?? null,
    totalLinesSource: p.totalLinesSource ?? (sabaq ? 'MANUAL' : null),
  };
  if (p.assigned !== undefined) fields.assigned = p.assigned;
  return op('lesson_portion', 'CREATE', id, fields, null);
}

export const portionUpdateOp = (id: string, base: number, fields: Record<string, unknown>) => op('lesson_portion', 'UPDATE', id, fields, base);

export interface AttemptInput {
  attemptNo?: number;
  status: string;
  completed?: Quantity | null;
  quality?: number | null;
  noMistakes?: boolean;
  mistakes?: { category: string; severity: string; repeated: boolean }[];
  remarks?: string | null;
}

export function attemptOp(portionId: string, a: AttemptInput, id = uuidv7()) {
  return op(
    'portion_attempt',
    'CREATE',
    id,
    {
      lessonPortionId: portionId,
      attemptNo: a.attemptNo ?? 1,
      attemptedAt: new Date().toISOString(),
      status: a.status,
      completed: a.completed ?? null,
      quality: a.quality ?? null,
      noMistakes: a.noMistakes ?? false,
      mistakes: a.mistakes ?? [],
      remarks: a.remarks ?? null,
    },
    null,
  );
}

export const attemptUpdateOp = (id: string, base: number, fields: Record<string, unknown>) => op('portion_attempt', 'UPDATE', id, fields, base);

export async function push(h: Harness, token: string, ops: object[], deviceId = DEVICE): Promise<OpResult[]> {
  const res = await h.call('POST', '/sync/push', token, { protocolVersion: 1, deviceId, ops });
  expect(res.statusCode, res.body).toBe(200);
  return res.json().results as OpResult[];
}

/** Pushes one op and expects it APPLIED; returns its entity id and row version. */
export async function applied(h: Harness, token: string, o: { entityId: string }, deviceId = DEVICE): Promise<{ id: string; rowVersion: number }> {
  const [r] = await push(h, token, [o], deviceId);
  expect(r, JSON.stringify(r)).toMatchObject({ status: 'APPLIED' });
  return { id: r!.entityId!, rowVersion: r!.rowVersion! };
}

export async function seedQuran(h: Harness, organizationCode = 'ALIF'): Promise<void> {
  const res = await h.control('POST', '/quran/seed', { organizationCode });
  expect(res.statusCode, res.body).toBe(200);
}

export async function detail(h: Harness, token: string, id: string) {
  const res = await h.call('GET', `/hifz/daily-records/${id}`, token);
  expect(res.statusCode, res.body).toBe(200);
  return res.json();
}

/**
 * A record for the student on the date with attendance PRESENT (so portions are allowed), as the given Teacher.
 * Returns the record id.
 */
export async function presentRecord(h: Harness, token: string, ids: Ids, student: StudentKey, date: string, classKey: ClassKey = 'A1'): Promise<string> {
  const [a, r] = await push(h, token, [attendanceOp(ids, student, date, 'PRESENT', classKey), recordOp(ids, student, date, { classKey })]);
  expect(a!.status, JSON.stringify(a)).toBe('APPLIED');
  expect(r!.status, JSON.stringify(r)).toBe('APPLIED');
  return r!.entityId!;
}
