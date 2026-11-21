// Daily-entry helpers shared by API E2E specs that need F05 records, portions, and attempts, or F08 homework, to
// verify an earlier feature's criterion (F02, F03, F06). Writes go through POST /sync/push, the app's one path; reads
// are GET /hifz/daily-records/:id and GET /homework/assignments/:id. Synthetic values only.
import { randomBytes } from 'node:crypto';
import type { APIRequestContext } from '@playwright/test';
import { expect } from './fixtures';

export type StudentKey = 'S1' | 'S2' | 'S3';
export type ClassKey = 'A1' | 'A2';
export type Ids = { classes: Record<string, string>; students: Record<string, string> };
export type Quantity = { unit: string; numerator: number; denominator: number };
export type OpResult = { opId: string; status: string; code?: string; fields?: Record<string, string>; rowVersion?: number; entityId?: string; notices?: string[] };

export const DEVICE = '0190f5c0-0000-4000-8000-0000000000e2';

/** A canonical lowercase UUIDv7, as the app generates for offline-created entities and op IDs. */
export function uuidv7(): string {
  const bytes = randomBytes(16);
  const ms = BigInt(Date.now());
  for (let i = 0; i < 6; i++) bytes[i] = Number((ms >> BigInt(8 * (5 - i))) & 0xffn);
  bytes[6] = (bytes[6]! & 0x0f) | 0x70;
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;
  const hex = bytes.toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export function addDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

const weekday = (date: string) => new Date(`${date}T00:00:00Z`).getUTCDay() || 7;

/** Today in Asia/Karachi (the seeded madrasas' timezone). */
export const today = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Karachi' }).format(new Date());

/** The most recent Monday–Saturday on or before `back` days ago: a scheduled day for every seeded class. */
export function classDay(back = 1): string {
  let d = addDays(today(), -back);
  while (weekday(d) === 7) d = addDays(d, -1);
  return d;
}

/** The Monday–Saturday before `date`. */
export function classDayBefore(date: string): string {
  let d = addDays(date, -1);
  while (weekday(d) === 7) d = addDays(d, -1);
  return d;
}

/** The first Monday–Saturday on or after `back` days ago (the seed enrols students from 90 days ago). */
export function classDayFrom(back: number): string {
  let d = addDays(today(), -back);
  while (weekday(d) === 7) d = addDays(d, 1);
  return d;
}

export const lines = (n: number): Quantity => ({ unit: 'LINES', numerator: n, denominator: 1 });
export const para = (numerator: number, denominator = 1): Quantity => ({ unit: 'PARA', numerator, denominator });

let seq = 0;

export function op(entity: string, opType: 'CREATE' | 'UPDATE' | 'COMMAND', entityId: string, fields: Record<string, unknown>, baseVersion: number | null = null, command?: string) {
  return { opId: uuidv7(), seq: ++seq, entity, entityId, opType, ...(command ? { command } : {}), baseVersion, fields, dependsOn: [] as string[], clientSavedAt: new Date().toISOString() };
}

export async function push(api: APIRequestContext, ops: object[], deviceId = DEVICE): Promise<OpResult[]> {
  const res = await api.post('/sync/push', { data: { protocolVersion: 1, deviceId, ops } });
  expect(res.status(), await res.text()).toBe(200);
  return (await res.json()).results as OpResult[];
}

export async function applied(api: APIRequestContext, o: object): Promise<{ id: string; rowVersion: number; notices?: string[] }> {
  const [r] = await push(api, [o]);
  expect(r, JSON.stringify(r)).toMatchObject({ status: 'APPLIED' });
  return { id: r!.entityId!, rowVersion: r!.rowVersion!, ...(r!.notices ? { notices: r!.notices } : {}) };
}

export async function getJson(api: APIRequestContext, url: string) {
  const res = await api.get(url);
  expect(res.status(), await res.text()).toBe(200);
  return res.json();
}

export const recordDetail = (api: APIRequestContext, id: string) => getJson(api, `/hifz/daily-records/${id}`);
export const homeworkDetail = (api: APIRequestContext, id: string) => getJson(api, `/homework/assignments/${id}`);

export const attendanceOp = (ids: Ids, student: StudentKey, date: string, status: string, classKey: ClassKey = 'A1') =>
  op('attendance_record', 'CREATE', uuidv7(), { studentId: ids.students[student], classId: ids.classes[classKey], reportDate: date, status, leaveReason: null, absentNote: null });

export const recordOp = (ids: Ids, student: StudentKey, date: string, classKey: ClassKey = 'A1', extra: Record<string, unknown> = {}) =>
  op('daily_record', 'CREATE', uuidv7(), { studentId: ids.students[student], classId: ids.classes[classKey], reportDate: date, sessionLabel: null, ...extra });

/** Attendance PRESENT and a daily record for the student and date; returns the record id. */
export async function presentRecord(api: APIRequestContext, ids: Ids, student: StudentKey, date: string, classKey: ClassKey = 'A1'): Promise<string> {
  const results = await push(api, [attendanceOp(ids, student, date, 'PRESENT', classKey), recordOp(ids, student, date, classKey)]);
  expect(results.map((r) => r.status), JSON.stringify(results)).toEqual(['APPLIED', 'APPLIED']);
  return results[1]!.entityId!;
}

export interface PortionInput {
  section: 'SABAQ' | 'SABQI' | 'MANZIL';
  position?: number;
  isExtra?: boolean;
  paraNumber?: number | null;
  range?: { surahStart: number; ayahStart: number; surahEnd: number; ayahEnd: number } | null;
  assigned?: Quantity;
  totalLines?: number | null;
}

export const portionOp = (recordId: string, p: PortionInput) =>
  op('lesson_portion', 'CREATE', uuidv7(), {
    dailyRecordId: recordId,
    section: p.section,
    position: p.position ?? 1,
    isExtra: p.isExtra ?? false,
    paraNumber: p.paraNumber ?? null,
    range: p.range ?? null,
    totalLines: p.totalLines ?? null,
    totalLinesSource: p.section === 'SABAQ' ? 'MANUAL' : null,
    ...(p.assigned ? { assigned: p.assigned } : {}),
  });

export interface AttemptInput {
  attemptNo?: number;
  status: string;
  completed?: Quantity | null;
  quality?: number | null;
  mistakes?: object[];
}

export const attemptOp = (portionId: string, a: AttemptInput) =>
  op('portion_attempt', 'CREATE', uuidv7(), {
    lessonPortionId: portionId,
    attemptNo: a.attemptNo ?? 1,
    attemptedAt: new Date().toISOString(),
    status: a.status,
    completed: a.completed ?? null,
    quality: a.quality ?? null,
    noMistakes: false,
    mistakes: a.mistakes ?? [],
    remarks: null,
  });

/** A correction of an attempt: the outcome group travels whole. */
export const correctAttemptOp = (id: string, base: number, outcome: { status: string; completed: Quantity | null; quality?: number | null; mistakes?: object[] }) =>
  op('portion_attempt', 'UPDATE', id, { quality: null, noMistakes: false, mistakes: [], ...outcome }, base);

/** A portion row plus its first attempt. */
export async function recite(api: APIRequestContext, recordId: string, p: PortionInput, a: AttemptInput) {
  const portion = await applied(api, portionOp(recordId, p));
  const attempt = await applied(api, attemptOp(portion.id, a));
  return { portionId: portion.id, attemptId: attempt.id };
}

/** What a device saw when it built a draft: every portion and attempt of the record with its row version. */
export async function sourcesOf(api: APIRequestContext, recordId: string) {
  const d = await recordDetail(api, recordId);
  return d.portions.flatMap((p: { id: string; rowVersion: number; attempts: { id: string; rowVersion: number }[] }) => [
    { entity: 'lesson_portion', id: p.id, rowVersion: p.rowVersion },
    ...p.attempts.map((x) => ({ entity: 'portion_attempt', id: x.id, rowVersion: x.rowVersion })),
  ]);
}

/** A carry-forward portion of a homework draft built from an eligible attempt. */
export const suggestedPortion = (sourceAttemptId: string, over: Record<string, unknown> = {}) => ({
  id: uuidv7(),
  section: 'SABQI',
  position: 1,
  paraNumber: null,
  range: null,
  totalLines: null,
  assigned: null,
  origin: 'SUGGESTED',
  sourceAttemptId,
  instructions: null,
  ...over,
});

export const draftOp = (ids: Ids, student: StudentKey, fields: { assignedDate: string; sourceDailyRecordId?: string | null; portions: object[] }, id = uuidv7()) =>
  op('homework_assignment', 'CREATE', id, { studentId: ids.students[student], sourceDailyRecordId: null, dueDate: null, instructions: null, ...fields });

export const confirmOp = (id: string, base: number | null, sources: object[]) =>
  op('homework_assignment', 'COMMAND', id, { confirmedAt: new Date().toISOString(), sources }, base, 'CONFIRM_HOMEWORK');

/** Every page of a sync pull from a fresh bootstrap: the entities and ids the caller receives. */
export async function pullAll(api: APIRequestContext): Promise<{ entity: string; entityId: string; fields?: Record<string, unknown> }[]> {
  const out: { entity: string; entityId: string; fields?: Record<string, unknown> }[] = [];
  let cursor: string | null = null;
  for (let i = 0; i < 50; i++) {
    const res = await api.get(`/sync/pull${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ''}`);
    expect(res.status(), await res.text()).toBe(200);
    const body = (await res.json()) as { changes: { entity: string; entityId: string; fields?: Record<string, unknown> }[]; cursor: string; hasMore: boolean };
    out.push(...body.changes);
    cursor = body.cursor;
    if (!body.hasMore) return out;
  }
  throw new Error('sync pull did not finish');
}
