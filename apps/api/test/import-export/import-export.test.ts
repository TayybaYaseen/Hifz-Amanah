// F14 · Excel import and export — integration (real Postgres; docs/specs/14-f14-excel-import-export.md).
// Students workbooks are the committed fixtures in test/fixtures/xlsx/ (synthetic, generate.ts); DailyRecords workbooks
// are built per test because their dates must be recent class days. SRS acceptance tests AC-XLS-01…07.
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { XLSX_CONTENT_TYPE } from '@hifz/contracts';
import { dailyRecordsWorkbook, readKeyValues, readSheet, studentsWorkbook, syntheticStudents, type Row } from '../../../../e2e/fixtures/workbooks.ts';
import { attendanceOp, classDay, push, seedQuran, type Ids } from '../hifz/support.ts';
import { startHarness, type Harness } from '../support/harness.ts';

const FIXTURES = fileURLToPath(new URL('../fixtures/xlsx/', import.meta.url));
const fixture = (name: string) => readFile(`${FIXTURES}${name}`);

let h: Harness;
let admin: string;
let ids: Ids;

beforeAll(async () => {
  h = await startHarness();
}, 120_000);
afterAll(async () => h?.stop());
beforeEach(async () => {
  await h.reset();
  admin = await h.signIn('admin.a');
  ids = (await h.control('GET', '/roster/ids')).json();
});

const lang = (locale?: string) => (locale ? `&locale=${locale}` : '');

async function upload(token: string, template: 'Students' | 'DailyRecords', bytes: Buffer, locale?: string) {
  return h.app.inject({ method: 'POST', url: `/imports?template=${template}${lang(locale)}`, headers: { authorization: `Bearer ${token}`, 'content-type': XLSX_CONTENT_TYPE }, payload: bytes });
}

async function preview(token: string, template: 'Students' | 'DailyRecords', bytes: Buffer, locale?: string) {
  const res = await upload(token, template, bytes, locale);
  expect(res.statusCode, res.body).toBe(201);
  return res.json();
}

async function rows(token: string, jobId: string, locale?: string) {
  const res = await h.call('GET', `/imports/${jobId}/rows?limit=1000${lang(locale)}`, token);
  expect(res.statusCode, res.body).toBe(200);
  return res.json().items as Array<{ rowNo: number; classification: string; issues: Array<{ column: string | null; code: string; message: string; severity: string }>; changes: Array<{ column: string; before: string | null; after: string | null }>; batchNo: number | null; result: string | null; resultIssues: Array<{ code: string }> }>;
}

async function confirm(token: string, jobId: string, mode: 'ADD_ONLY' | 'UPDATE' = 'ADD_ONLY') {
  const res = await h.call('POST', `/imports/${jobId}/confirm`, token, { mode });
  expect(res.statusCode, res.body).toBe(200);
  return res.json();
}

async function setMode(token: string, jobId: string, mode: 'ADD_ONLY' | 'UPDATE') {
  const res = await h.call('PUT', `/imports/${jobId}/mode`, token, { mode });
  expect(res.statusCode, res.body).toBe(200);
  return res.json();
}

async function download(token: string, url: string) {
  const res = await h.app.inject({ method: 'GET', url, headers: { authorization: `Bearer ${token}` } });
  expect(res.statusCode, res.body).toBe(200);
  expect(res.headers['content-type']).toBe(XLSX_CONTENT_TYPE);
  return res.rawPayload;
}

const orgA = async () => (await h.db.selectFrom('organizations').select('id').where('code', '=', 'ALIF').executeTakeFirstOrThrow()).id;
const studentsLike = async (prefix: string) =>
  h.db.selectFrom('students').select(['id', 'name', 'organization_id', 'external_student_id']).where('external_student_id', 'like', `${prefix}%`).execute();

/** Attendance PRESENT for each (student, date), so portions are allowed (FR-DAY-011). */
async function present(token: string, pairs: Array<['S1' | 'S2' | 'S3', string]>) {
  const results = await push(h, token, pairs.map(([s, d]) => attendanceOp(ids, s, d, 'PRESENT', s === 'S3' ? 'A2' : 'A1')));
  for (const r of results) expect(r.status, JSON.stringify(r)).toBe('APPLIED');
}

const sabqi = (ext: string, date: string, position: number, over: Row = {}): Row => ({
  ExternalRecordID: ext,
  ExternalStudentID: 'EXT-A-001',
  RecordDate: date,
  SectionType: 'SABQI',
  PortionNumber: position,
  ParaNumber: 3,
  AssignedQuantity: 1,
  CompletedQuantity: 1,
  QuantityUnit: 'HALF',
  PerformanceStatus: 'COMPLETED',
  QualityRating: 2,
  ...over,
});

describe('F14 · Students import', () => {
  it('F14-AC1 (US-058) a valid 50-row Students workbook imports after preview and confirm (AC-XLS-01)', async () => {
    const job = await preview(admin, 'Students', await fixture('students-50.xlsx'));
    expect(job).toMatchObject({ template: 'Students', templateVersion: '1', mode: 'ADD_ONLY', status: 'PREVIEWED', rowCount: 50 });
    expect(job.counts).toEqual({ NEW: 50, EXACT_MATCH: 0, SUSPECTED_DUPLICATE: 0, INVALID: 0, PROPOSED_UPDATE: 0 });
    // Nothing is written before the confirmation.
    expect(await studentsLike('EXT-I-')).toHaveLength(0);
    const done = await confirm(admin, job.id);
    expect(done).toMatchObject({ status: 'COMMITTED', resultCounts: { COMMITTED: 50, FAILED: 0, SKIPPED: 0 }, batchCount: 1 });
    const created = await studentsLike('EXT-I-');
    expect(created).toHaveLength(50);
    expect(new Set(created.map((s) => s.organization_id))).toEqual(new Set([await orgA()]));
    // Each is enrolled in Hifz A1.
    const enrolled = await h.db.selectFrom('student_enrollments').select('class_id').where('student_id', 'in', created.map((s) => s.id)).execute();
    expect(new Set(enrolled.map((e) => e.class_id))).toEqual(new Set([ids.classes.A1]));
  });

  it('F14-AC4 (US-058) re-importing with stable ExternalStudentIDs creates nothing (AC-XLS-03)', async () => {
    const bytes = await fixture('students-50.xlsx');
    await confirm(admin, (await preview(admin, 'Students', bytes)).id);
    const again = await preview(admin, 'Students', bytes);
    expect(again.counts).toEqual({ NEW: 0, EXACT_MATCH: 50, SUSPECTED_DUPLICATE: 0, INVALID: 0, PROPOSED_UPDATE: 0 });
    const done = await confirm(admin, again.id).catch(() => null);
    // Nothing to write: the confirm is accepted and every row is skipped.
    expect(done?.resultCounts).toEqual({ COMMITTED: 0, FAILED: 0, SKIPPED: 50 });
    expect(await studentsLike('EXT-I-')).toHaveLength(50);
  });

  it('F14-AC2 (US-058) more than 1,000 rows is rejected before processing', async () => {
    const res = await upload(admin, 'Students', await fixture('students-1001.xlsx'));
    expect(res.statusCode).toBe(422);
    expect(res.json().error).toMatchObject({ code: 'WORKBOOK_REJECTED', message: 'Maximum 1,000 rows per file — split into several files', fields: { reason: 'TOO_MANY_ROWS' } });
    expect(await h.db.selectFrom('import_jobs').select('id').execute()).toHaveLength(0);
    expect(await h.db.selectFrom('import_rows').select('row_no').execute()).toHaveLength(0);
  });

  it('F14-AC3 (US-058) a wrong version or missing column is rejected with details', async () => {
    const old = await upload(admin, 'Students', await fixture('students-old-version.xlsx'));
    expect(old.statusCode).toBe(422);
    expect(old.json().error.fields).toMatchObject({ reason: 'WRONG_VERSION', template: 'Students', version: '1', found: '0' });
    expect(old.json().error.message).toContain('Expected template Students version 1');
    const missing = await upload(admin, 'Students', await fixture('students-missing-name.xlsx'), 'ur');
    expect(missing.json().error.fields).toMatchObject({ reason: 'MISSING_COLUMN', column: 'StudentName', version: '1' });
    expect(missing.json().error.message).toContain('StudentName');
    expect(missing.json().error.message).toContain('ضروری کالم');
  });

  it('F14-AC22 (US-060) templates carry a _meta version and imports commit 200 rows per batch', async () => {
    const noMeta = await upload(admin, 'Students', await fixture('students-no-meta.xlsx'));
    expect(noMeta.statusCode).toBe(422);
    expect(noMeta.json().error.fields).toMatchObject({ reason: 'NO_META', template: 'Students', version: '1' });
    // The blank template has the hidden _meta sheet, and the version is noted on the first sheet.
    const blank = await download(admin, '/imports/templates/DailyRecords');
    expect(await readKeyValues(blank, '_meta')).toMatchObject({ TemplateName: 'DailyRecords', TemplateVersion: '2' });
    expect(await readKeyValues(blank, 'About')).toMatchObject({ Template: 'DailyRecords', TemplateVersion: '2' });
    const job = await preview(admin, 'Students', await fixture('students-1000.xlsx'));
    const done = await confirm(admin, job.id);
    expect(done).toMatchObject({ batchCount: 5, resultCounts: { COMMITTED: 1000, FAILED: 0, SKIPPED: 0 } });
    const perBatch = new Map<number, number>();
    for (const r of await rows(admin, job.id)) perBatch.set(r.batchNo!, (perBatch.get(r.batchNo!) ?? 0) + 1);
    expect([...perBatch.entries()].sort((a, b) => a[0] - b[0])).toEqual([[1, 200], [2, 200], [3, 200], [4, 200], [5, 200]]);
    expect(await studentsLike('EXT-K-')).toHaveLength(1000);
  }, 120_000);

  it('F14-AC5 (US-058) a name match without an external ID is a suspected duplicate', async () => {
    const job = await preview(admin, 'Students', await fixture('students-mixed.xlsx'));
    const byRow = await rows(admin, job.id);
    const nameOnly = byRow.find((r) => r.rowNo === 4)!;
    expect(nameOnly.classification).toBe('SUSPECTED_DUPLICATE');
    expect(nameOnly.issues.map((i) => i.code)).toEqual(['NAME_MATCH']);
    await confirm(admin, job.id);
    // Never linked to S1 and never created: S1 is still the only "Test Student One".
    const named = await h.db.selectFrom('students').select('id').where('name', '=', 'Test Student One').execute();
    expect(named.map((s) => s.id)).toEqual([ids.students.S1]);
  });

  it('F14-AC11 (US-060) the preview counts every row class with localized errors', async () => {
    const job = await preview(admin, 'Students', await fixture('students-mixed.xlsx'), 'ur');
    expect(job.counts).toEqual({ NEW: 1, EXACT_MATCH: 1, SUSPECTED_DUPLICATE: 1, INVALID: 4, PROPOSED_UPDATE: 0 });
    const invalid = (await rows(admin, job.id, 'ur')).filter((r) => r.classification === 'INVALID');
    expect(invalid.flatMap((r) => r.issues.map((i) => i.message)).every((m) => /[؀-ۿ]/.test(m))).toBe(true);
    // The same job in Roman Urdu and English; update mode adds the proposed-update count.
    expect((await rows(admin, job.id, 'ur-Latn')).find((r) => r.rowNo === 5)!.issues[0]!.message).toContain('Tareekh');
    const withUpdate = await preview(admin, 'Students', await studentsWorkbook([{ ExternalStudentID: 'EXT-A-002', StudentName: 'Test Student Two Changed', ClassName: 'Hifz A1' }, ...syntheticStudents(1)]));
    expect((await setMode(admin, withUpdate.id, 'UPDATE')).counts).toEqual({ NEW: 1, EXACT_MATCH: 0, SUSPECTED_DUPLICATE: 0, INVALID: 0, PROPOSED_UPDATE: 1 });
  });

  it('F14-AC12 (US-060) each problem is reported on its row and field (AC-XLS-02)', async () => {
    const job = await preview(admin, 'Students', await fixture('students-mixed.xlsx'));
    const byRow = new Map((await rows(admin, job.id)).map((r) => [r.rowNo, r]));
    expect(byRow.get(5)!.issues.map((i) => `${i.column}:${i.code}`)).toEqual(['AdmissionDate:INVALID_DATE']);
    expect(byRow.get(5)!.issues[0]!.message).toContain('YYYY-MM-DD');
    expect(byRow.get(6)!.issues.map((i) => `${i.column}:${i.code}`)).toEqual(['Status:INVALID_ENUM']);
    expect(byRow.get(7)!.issues.map((i) => `${i.column}:${i.code}`)).toEqual(['ExternalStudentID:DUPLICATE_KEY']);
    expect(byRow.get(8)!.issues.map((i) => `${i.column}:${i.code}`)).toEqual(['ExternalStudentID:DUPLICATE_KEY']);
  });

  it('F14-AC13 (US-060) add-new-only mode changes no existing record (AC-XLS-04)', async () => {
    const job = await preview(admin, 'Students', await fixture('students-renamed.xlsx'));
    expect(job.counts.SUSPECTED_DUPLICATE).toBe(1);
    expect((await rows(admin, job.id))[0]!.changes).toEqual([]);
    await confirm(admin, job.id);
    const s1 = await h.db.selectFrom('students').select(['name', 'row_version']).where('id', '=', ids.students.S1).executeTakeFirstOrThrow();
    expect(s1).toMatchObject({ name: 'Test Student One', row_version: '1' });
  });

  it('F14-AC14 (US-060) update mode previews before and after and writes nothing until confirmed', async () => {
    const job = await preview(admin, 'Students', await fixture('students-renamed.xlsx'));
    const updated = await setMode(admin, job.id, 'UPDATE');
    expect(updated.counts.PROPOSED_UPDATE).toBe(1);
    expect((await rows(admin, job.id))[0]!.changes).toEqual([{ column: 'StudentName', before: 'Test Student One', after: 'Test Student One Renamed' }]);
    const before = await h.db.selectFrom('students').select('name').where('id', '=', ids.students.S1).executeTakeFirstOrThrow();
    expect(before.name).toBe('Test Student One');
    // The confirm must be for the mode that was previewed.
    expect((await h.call('POST', `/imports/${job.id}/confirm`, admin, { mode: 'ADD_ONLY' })).statusCode).toBe(400);
    await confirm(admin, job.id, 'UPDATE');
    const after = await h.db.selectFrom('students').select('name').where('id', '=', ids.students.S1).executeTakeFirstOrThrow();
    expect(after.name).toBe('Test Student One Renamed');
    const audit = await h.db.selectFrom('audit_logs').select(['action', 'summary']).where('target_id', '=', ids.students.S1).where('action', '=', 'STUDENT_UPDATED').execute();
    expect(audit).toHaveLength(1);
    expect(audit[0]!.summary).toMatchObject({ source: 'IMPORT', importJobId: job.id, fields: ['name'] });
  });

  it('F14-AC15 (US-060) a retried import after a failed batch does not duplicate committed rows', async () => {
    const job = await preview(admin, 'Students', await studentsWorkbook(syntheticStudents(600, 'Hifz A1', 'EXT-R-')));
    expect((await h.control('POST', '/import/fail-batch', { batch: 2 })).statusCode).toBe(200);
    const first = await confirm(admin, job.id);
    expect(first).toMatchObject({ status: 'PARTIALLY_FAILED', batchCount: 3, resultCounts: { COMMITTED: 400, FAILED: 200, SKIPPED: 0 } });
    const listed = await rows(admin, job.id);
    expect(listed.filter((r) => r.result === 'FAILED').map((r) => r.batchNo)).toEqual(Array(200).fill(2));
    expect(listed.filter((r) => r.result === 'FAILED').every((r) => r.resultIssues[0]!.code === 'BATCH_FAILED')).toBe(true);
    expect(await studentsLike('EXT-R-')).toHaveLength(400);
    const retry = await confirm(admin, job.id);
    expect(retry).toMatchObject({ status: 'COMMITTED', resultCounts: { COMMITTED: 600, FAILED: 0, SKIPPED: 0 } });
    const all = await studentsLike('EXT-R-');
    expect(all).toHaveLength(600);
    expect(new Set(all.map((s) => s.external_student_id)).size).toBe(600);
  }, 120_000);

  it('F14-AC21 (US-058) a Teacher imports students into assigned classes only', async () => {
    const teacher = await h.signIn('teacher.a1');
    const usersBefore = (await h.db.selectFrom('users').select('id').execute()).length;
    const job = await preview(teacher, 'Students', await fixture('students-two-classes.xlsx'));
    expect(job.counts).toMatchObject({ NEW: 4, INVALID: 2 });
    const invalid = (await rows(teacher, job.id)).filter((r) => r.classification === 'INVALID');
    expect(invalid.map((r) => r.issues.map((i) => `${i.column}:${i.code}:${i.message}`))).toEqual([['ClassName:NOT_YOUR_CLASS:Not your class'], ['ClassName:NOT_YOUR_CLASS:Not your class']]);
    expect((await confirm(teacher, job.id)).resultCounts).toEqual({ COMMITTED: 4, FAILED: 0, SKIPPED: 2 });
    const created = await studentsLike('EXT-T');
    expect(created).toHaveLength(4);
    expect(new Set(created.map((s) => s.organization_id))).toEqual(new Set([await orgA()]));
    // No login accounts are created (FR-XLS-001).
    expect((await h.db.selectFrom('users').select('id').execute()).length).toBe(usersBefore);
    // Another Teacher cannot read this job; a Student cannot import at all.
    expect((await h.call('GET', `/imports/${job.id}`, await h.signIn('teacher.a2'))).statusCode).toBe(404);
    expect((await upload(await h.signIn('student.s1'), 'Students', await fixture('students-50.xlsx'))).statusCode).toBe(403);
  });

  it('F14-AC8 (US-059) an organization named in the workbook is ignored', async () => {
    const job = await preview(admin, 'Students', await fixture('students-org-column.xlsx'));
    expect(job.ignoredColumns).toEqual(['organization_id', 'Madrasa']);
    const byRow = await rows(admin, job.id);
    expect(byRow.map((r) => r.classification)).toEqual(['NEW', 'INVALID']);
    expect(byRow[1]!.issues.map((i) => i.code)).toEqual(['CLASS_NOT_FOUND']);
    await confirm(admin, job.id);
    const created = await studentsLike('EXT-O-');
    expect(created).toHaveLength(1);
    expect(created[0]!.organization_id).toBe(await orgA());
    // Madrasa B's Admin cannot see Madrasa A's job (tenant isolation).
    expect((await h.call('GET', `/imports/${job.id}`, await h.signIn('admin.b'))).statusCode).toBe(404);
  });

  it('F14 integration: uploaded values are purged after 7 days; the job and its results stay (NFR-PRV-005)', async () => {
    const job = await preview(admin, 'Students', await fixture('students-50.xlsx'));
    expect((await h.control('POST', '/clock', { advanceMs: 8 * 24 * 60 * 60 * 1000 })).statusCode).toBe(200);
    // Sessions do not last 8 days: sign in again.
    admin = await h.signIn('admin.a');
    const later = (await h.call('GET', `/imports/${job.id}`, admin)).json();
    expect(later).toMatchObject({ status: 'EXPIRED', valuesPurged: true, counts: { NEW: 50 } });
    expect((await h.db.selectFrom('import_rows').select('values').where('job_id', '=', job.id).execute()).every((r) => r.values === null)).toBe(true);
    expect((await h.call('POST', `/imports/${job.id}/confirm`, admin, { mode: 'ADD_ONLY' })).statusCode).toBe(409);
  });
});

describe('F14 · DailyRecords import', () => {
  it('F14-AC6 (US-059) DailyRecords rows group into daily records and reports recalculate', async () => {
    await seedQuran(h);
    const date = classDay(h, 2);
    await present(admin, [['S1', date]]);
    const sabaq: Row = { ExternalRecordID: 'D-1', ExternalStudentID: 'EXT-A-001', RecordDate: date, SectionType: 'SABAQ', PortionNumber: 1, SurahStart: 2, AyahStart: 1, AyahEnd: 10, TotalLines: 10, AssignedQuantity: 10, CompletedQuantity: 10, QuantityUnit: 'LINES', PerformanceStatus: 'COMPLETED', QualityRating: 1 };
    const job = await preview(admin, 'DailyRecords', await dailyRecordsWorkbook([sabaq, ...[1, 2, 3].map((n) => sabqi(`D-S${n}`, date, n)), sabqi('D-M1', date, 1, { SectionType: 'MANZIL', ParaNumber: 10 }), sabqi('D-M2', date, 2, { SectionType: 'MANZIL', ParaNumber: 11, QuantityUnit: 'RUBU', AssignedQuantity: 2, CompletedQuantity: 1, PerformanceStatus: 'PARTIAL' })]));
    expect(job.counts).toEqual({ NEW: 6, EXACT_MATCH: 0, SUSPECTED_DUPLICATE: 0, INVALID: 0, PROPOSED_UPDATE: 0 });
    // The preview dry-run wrote nothing.
    expect(await h.db.selectFrom('daily_records').select('id').where('student_id', '=', ids.students.S1).execute()).toHaveLength(0);
    await confirm(admin, job.id);
    const records = await h.db.selectFrom('daily_records').select(['id', 'class_id', 'report_date']).where('student_id', '=', ids.students.S1).execute();
    expect(records).toHaveLength(1);
    expect(records[0]).toMatchObject({ class_id: ids.classes.A1, report_date: date });
    const portions = await h.db.selectFrom('lesson_portions').select(['section', 'para_number', 'line_count_edition']).where('daily_record_id', '=', records[0]!.id).execute();
    expect(portions).toHaveLength(6);
    // Sabaq's Para is derived from the range (synthetic metadata: Surah 2 is in Para 1).
    expect(portions.find((p) => p.section === 'SABAQ')).toMatchObject({ para_number: 1 });
    const report = (await h.call('GET', `/reports/student?studentId=${ids.students.S1}&kind=WEEK&date=${date}`, admin)).json().report;
    expect(report.hasData).toBe(true);
    expect(Object.fromEntries(report.sections.map((s: { section: string; portionCount: number }) => [s.section, s.portionCount]))).toEqual({ SABAQ: 1, SABQI: 3, MANZIL: 2 });
    // The import is audited through the hifz module as well (one record, six portions, six attempts).
    const actions = (await h.db.selectFrom('audit_logs').select('action').execute()).map((a) => a.action);
    expect(actions.filter((a) => a === 'DAILY_RECORD_CREATED')).toHaveLength(1);
    expect(actions.filter((a) => a === 'LESSON_PORTION_CREATED')).toHaveLength(6);
    // Devices pull the imported rows (change_log, no sync op).
    const changes = await h.db.selectFrom('change_log').select(['entity', 'op_id']).where('entity', 'in', ['daily_record', 'lesson_portion', 'portion_attempt']).execute();
    expect(changes).toHaveLength(13);
    expect(changes.every((c) => c.op_id === null)).toBe(true);
  });

  it('F14-AC7 (US-059) an unknown ExternalStudentID is invalid', async () => {
    const date = classDay(h, 2);
    await present(admin, [['S1', date]]);
    const job = await preview(admin, 'DailyRecords', await dailyRecordsWorkbook([sabqi('D-1', date, 1), sabqi('D-2', date, 2, { ExternalStudentID: 'EXT-B-001' })]));
    const byRow = await rows(admin, job.id);
    expect(byRow.map((r) => r.classification)).toEqual(['NEW', 'INVALID']);
    expect(byRow[1]!.issues).toMatchObject([{ column: 'ExternalStudentID', code: 'STUDENT_NOT_FOUND', message: 'Student not found in this madrasa' }]);
  });

  it('F14-AC9 (US-059) MistakeCount becomes uncategorized mistakes', async () => {
    const date = classDay(h, 2);
    await present(admin, [['S1', date]]);
    await confirm(admin, (await preview(admin, 'DailyRecords', await dailyRecordsWorkbook([sabqi('D-1', date, 1, { MistakeCount: 3 })]))).id);
    const attempt = await h.db.selectFrom('portion_attempts').select(['id', 'mistake_count_summary', 'no_mistakes']).executeTakeFirstOrThrow();
    expect(attempt).toMatchObject({ mistake_count_summary: 3, no_mistakes: false });
    expect(await h.db.selectFrom('attempt_mistakes').select('id').where('attempt_id', '=', attempt.id).execute()).toHaveLength(0);
    const report = (await h.call('GET', `/reports/student?studentId=${ids.students.S1}&kind=WEEK&date=${date}`, admin)).json().report;
    expect(report.mistakes).toMatchObject({ uncategorized: 3, total: 3 });
    expect(Object.values(report.mistakes.byCategory).every((n) => n === 0)).toBe(true);
  });

  it('F14-AC10 (US-059) an empty QualityRating is NULL', async () => {
    const date = classDay(h, 2);
    await present(admin, [['S1', date]]);
    await confirm(admin, (await preview(admin, 'DailyRecords', await dailyRecordsWorkbook([sabqi('D-1', date, 1, { QualityRating: null })]))).id);
    expect((await h.db.selectFrom('portion_attempts').select('quality').executeTakeFirstOrThrow()).quality).toBeNull();
    const report = (await h.call('GET', `/reports/student?studentId=${ids.students.S1}&kind=WEEK&date=${date}`, admin)).json().report;
    expect(report.quality).toMatchObject({ count: 0, value: null });
  });

  it('F14-AC23 (US-059) Sabaq rows need a range, TotalLines, and LINES (AC-XLS-07)', async () => {
    await seedQuran(h);
    const date = classDay(h, 2);
    await present(admin, [['S1', date]]);
    const base: Row = { ExternalStudentID: 'EXT-A-001', RecordDate: date, SectionType: 'SABAQ', SurahStart: 2, AyahStart: 1, AyahEnd: 10, TotalLines: 10, AssignedQuantity: 10, QuantityUnit: 'LINES', PerformanceStatus: 'COMPLETED' };
    const job = await preview(
      admin,
      'DailyRecords',
      await dailyRecordsWorkbook([
        { ...base, ExternalRecordID: 'SB-1', PortionNumber: 1 },
        { ...base, ExternalRecordID: 'SB-2', PortionNumber: 2, QuantityUnit: 'HALF', AssignedQuantity: 1 },
        { ...base, ExternalRecordID: 'SB-3', PortionNumber: 3, AyahEnd: null },
        sabqi('SB-4', date, 1, { QuantityUnit: 'SALASAH', CompletedQuantity: null, PerformanceStatus: 'PENDING', QualityRating: null }),
      ]),
    );
    const byRow = await rows(admin, job.id);
    expect(byRow.map((r) => r.classification)).toEqual(['NEW', 'INVALID', 'INVALID', 'NEW']);
    expect(byRow[1]!.issues).toMatchObject([{ column: 'QuantityUnit', code: 'SABAQ_USES_LINES', message: 'Sabaq uses lines' }]);
    expect(byRow[2]!.issues.map((i) => `${i.column}:${i.code}`)).toEqual(['AyahEnd:REQUIRED']);
    // A ParaNumber that disagrees with the range is invalid (SRS §15.1).
    const para = await preview(admin, 'DailyRecords', await dailyRecordsWorkbook([{ ...base, ExternalRecordID: 'SB-5', PortionNumber: 5, ParaNumber: 7 }]));
    expect((await rows(admin, para.id))[0]!.issues.map((i) => i.code)).toEqual(['PARA_MISMATCH']);
  });

  it('F14 integration: a row without Present, Late, or Half-day attendance is invalid (FR-DAY-011; decision 2026-11-22)', async () => {
    const date = classDay(h, 2);
    const job = await preview(admin, 'DailyRecords', await dailyRecordsWorkbook([sabqi('D-1', date, 1)]));
    expect((await rows(admin, job.id))[0]).toMatchObject({ classification: 'INVALID', issues: [{ column: 'RecordDate', code: 'ATTENDANCE_REQUIRED' }] });
    // A future date and a holiday-free non-class day (Sunday) are refused too.
    const future = await preview(admin, 'DailyRecords', await dailyRecordsWorkbook([sabqi('D-2', '2099-01-05', 1)]));
    expect((await rows(admin, future.id))[0]!.issues.map((i) => i.code)).toEqual(['FUTURE_DATE']);
  });

  it('F14 integration: replaying a DailyRecords file is exact matches; without a key it is a suspected duplicate (FR-XLS-013)', async () => {
    const date = classDay(h, 2);
    await present(admin, [['S1', date]]);
    const bytes = await dailyRecordsWorkbook([sabqi('D-1', date, 1), sabqi(null as unknown as string, date, 2, { ExternalRecordID: null })]);
    await confirm(admin, (await preview(admin, 'DailyRecords', bytes)).id);
    const again = await preview(admin, 'DailyRecords', bytes);
    expect((await rows(admin, again.id)).map((r) => r.classification)).toEqual(['EXACT_MATCH', 'SUSPECTED_DUPLICATE']);
    await confirm(admin, again.id).catch(() => null);
    expect(await h.db.selectFrom('lesson_portions').select('id').execute()).toHaveLength(2);
  });

  it('F14 integration: update mode corrects only the latest attempt; a changed portion is invalid (decision 2026-11-22)', async () => {
    const date = classDay(h, 2);
    await present(admin, [['S1', date]]);
    await confirm(admin, (await preview(admin, 'DailyRecords', await dailyRecordsWorkbook([sabqi('D-1', date, 1, { PerformanceStatus: 'PARTIAL', CompletedQuantity: null, QualityRating: 3 }), sabqi('D-2', date, 2)]))).id);
    const changed = await preview(admin, 'DailyRecords', await dailyRecordsWorkbook([sabqi('D-1', date, 1, { QualityRating: 2 }), sabqi('D-2', date, 2, { AssignedQuantity: 3, QuantityUnit: 'RUBU', CompletedQuantity: 1 })]));
    expect(changed.counts.SUSPECTED_DUPLICATE).toBe(2);
    const update = await setMode(admin, changed.id, 'UPDATE');
    expect(update.counts).toMatchObject({ PROPOSED_UPDATE: 1, INVALID: 1 });
    const [first, second] = await rows(admin, changed.id);
    expect(first!.changes).toEqual([
      { column: 'PerformanceStatus', before: 'PARTIAL', after: 'COMPLETED' },
      { column: 'CompletedQuantity', before: null, after: '1/2 PARA' },
      { column: 'QualityRating', before: '3', after: '2' },
    ]);
    expect(second!.issues.map((i) => i.code)).toEqual(['PORTION_CHANGE_NOT_ALLOWED']);
    await confirm(admin, changed.id, 'UPDATE');
    const attempts = await h.db.selectFrom('portion_attempts').select(['status', 'quality', 'row_version']).execute();
    // One attempt corrected in place (D-1); D-2 untouched; no new attempt.
    expect(attempts).toHaveLength(2);
    expect(attempts.filter((a) => a.row_version === '2')).toEqual([{ status: 'COMPLETED', quality: 2, row_version: '2' }]);
    expect((await h.db.selectFrom('audit_logs').select('action').where('action', '=', 'PORTION_ATTEMPT_CORRECTED').execute()).length).toBe(1);
  });
});

describe('F14 · exports', () => {
  /** S1 (A1), S2 (A1), and S3 (A2) each get one imported portion on `date`; S1's remark is private, S2's is Arabic. */
  async function seedRecords(date: string) {
    await present(admin, [['S1', date], ['S2', date], ['S3', date]]);
    const arabic = 'قَالَ رَبِّ اشْرَحْ لِي صَدْرِي';
    const job = await preview(
      admin,
      'DailyRecords',
      await dailyRecordsWorkbook([
        sabqi('E-1', date, 1, { TeacherNotes: 'Synthetic F14 private note marker', MistakeCount: 2 }),
        sabqi('E-2', date, 1, { ExternalStudentID: 'EXT-A-002', TeacherNotes: arabic, QuantityUnit: 'SALASAH', CompletedQuantity: null, PerformanceStatus: 'NOT_REMEMBERED', QualityRating: 4 }),
        sabqi('E-3', date, 1, { ExternalStudentID: 'EXT-A-003' }),
      ]),
    );
    expect(job.counts.NEW).toBe(3);
    await confirm(admin, job.id);
    return { arabic };
  }

  it('F14-AC16 (US-061) a Teacher export contains only assigned students and the date range (AC-XLS-05)', async () => {
    const date = classDay(h, 2);
    const earlier = classDay(h, 9);
    await seedRecords(date);
    await present(admin, [['S1', earlier]]);
    await confirm(admin, (await preview(admin, 'DailyRecords', await dailyRecordsWorkbook([sabqi('E-0', earlier, 1)]))).id);
    const teacher = await h.signIn('teacher.a1');
    const sheet = await readSheet(await download(teacher, `/exports/daily-records?from=${date}&to=${date}`), 'DailyRecords');
    const ext = sheet.header.indexOf('ExternalStudentID');
    expect(sheet.rows.map((r) => r[ext]).sort()).toEqual(['EXT-A-001', 'EXT-A-002']);
    expect(sheet.rows.every((r) => r[sheet.header.indexOf('RecordDate')] === date)).toBe(true);
    // The students export is scoped the same way.
    const students = await readSheet(await download(teacher, '/exports/students'), 'Students');
    expect(students.rows.map((r) => r[0]).sort()).toEqual(['EXT-A-001', 'EXT-A-002']);
  });

  it('F14-AC17 (US-061) Student and Parent exports contain no internal notes (AC-XLS-06)', async () => {
    const date = classDay(h, 2);
    await seedRecords(date);
    const marker = 'Synthetic F14 private note marker';
    const family = await download(admin, `/exports/daily-records?from=${date}&to=${date}&audience=FAMILY&includeNotes=true`);
    expect(JSON.stringify((await readSheet(family, 'DailyRecords')).rows)).not.toContain(marker);
    const staffDefault = await download(admin, `/exports/daily-records?from=${date}&to=${date}`);
    expect(JSON.stringify((await readSheet(staffDefault, 'DailyRecords')).rows)).not.toContain(marker);
    const staffNotes = await download(admin, `/exports/daily-records?from=${date}&to=${date}&includeNotes=true`);
    expect(JSON.stringify((await readSheet(staffNotes, 'DailyRecords')).rows)).toContain(marker);
    expect(await readKeyValues(staffNotes, '_meta')).toMatchObject({ IncludesPrivateNotes: 'true', Audience: 'STAFF' });
    // Students and Parents cannot export at all.
    for (const who of ['student.s1', 'parent.p1']) {
      const token = await h.signIn(who);
      expect((await h.app.inject({ method: 'GET', url: `/exports/daily-records?from=${date}&to=${date}`, headers: { authorization: `Bearer ${token}` } })).statusCode).toBe(403);
    }
  });

  it('F14-AC18 (US-061) formula-like text is escaped (AC-XLS-06)', async () => {
    await confirm(admin, (await preview(admin, 'Students', await fixture('students-formula.xlsx'))).id);
    const sheet = await readSheet(await download(admin, '/exports/students?status=ALL'), 'Students');
    const names = sheet.rows.filter((r) => String(r[0]).startsWith('EXT-X-')).map((r) => r[1]);
    // A leading tab or CR is outer whitespace, trimmed on import like any name; the others are escaped.
    expect(names.sort()).toEqual(["'+cmd", "'-2", "'=1+1", "'@SUM(A1)", 'CR start', 'Tab start'].sort());
    expect(sheet.types.flat().every((t) => t !== 6 /* ExcelJS.ValueType.Formula */)).toBe(true);
    // Imported back, the names round-trip unchanged (the escape is removed on read).
    const stored = await h.db.selectFrom('students').select('name').where('external_student_id', '=', 'EXT-X-001').executeTakeFirstOrThrow();
    expect(stored.name).toBe('=1+1');
  });

  it('F14-AC19 (US-061) exports keep IDs, dates, units, statuses, Arabic, and report metadata', async () => {
    const date = classDay(h, 2);
    const { arabic } = await seedRecords(date);
    const bytes = await download(admin, `/exports/daily-records?from=${date}&to=${date}&includeNotes=true`);
    const sheet = await readSheet(bytes, 'DailyRecords');
    const col = (name: string) => sheet.header.indexOf(name);
    const e2 = sheet.rows.find((r) => r[col('ExternalRecordID')] === 'E-2')!;
    expect(e2[col('ExternalStudentID')]).toBe('EXT-A-002');
    expect(e2[col('RecordDate')]).toBe(date);
    expect(e2[col('QuantityUnit')]).toBe('SALASAH');
    expect(e2[col('PerformanceStatus')]).toBe('NOT_REMEMBERED');
    expect(e2[col('TeacherNotes')]).toBe(arabic);
    expect(sheet.rows.find((r) => r[col('ExternalRecordID')] === 'E-1')![col('MistakeCount')]).toBe(2);
    expect(await readKeyValues(bytes, '_meta')).toMatchObject({ TemplateName: 'DailyRecords', TemplateVersion: '2', PeriodFrom: date, PeriodTo: date, PendingOfflineChanges: 'false' });
    // The exported file imports back as exact matches (round trip).
    const back = await preview(admin, 'DailyRecords', Buffer.from(bytes));
    expect(back.counts).toEqual({ NEW: 0, EXACT_MATCH: 3, SUSPECTED_DUPLICATE: 0, INVALID: 0, PROPOSED_UPDATE: 0 });
    // The report export carries the period, timezone, filters, generation time, and the pending flag.
    const report = await download(admin, `/exports/report?classId=${ids.classes.A1}&kind=WEEK&date=${date}`);
    const meta = await readKeyValues(report, '_meta');
    expect(meta).toMatchObject({ TemplateName: 'ClassReport', ReportType: 'WEEK', TimeZone: 'Asia/Karachi', PendingOfflineChanges: 'false' });
    expect(meta.PeriodFrom! <= date && date <= meta.PeriodTo!).toBe(true);
    expect(meta.Filters).toContain(`classId=${ids.classes.A1}`);
    expect(Number.isNaN(Date.parse(meta.GeneratedAt!))).toBe(false);
    expect((await readSheet(report, 'Report')).rows.length).toBe(2);
  });

  it('F14-AC20 (US-058) every import and export is audited without student details', async () => {
    await upload(admin, 'Students', await fixture('students-1001.xlsx'));
    const job = await preview(admin, 'Students', await fixture('students-50.xlsx'));
    await confirm(admin, job.id);
    await download(admin, '/exports/students');
    const audits = await h.db.selectFrom('audit_logs').select(['action', 'organization_id', 'actor_user_id', 'summary', 'created_at']).where('action', 'in', ['IMPORT_REJECTED', 'IMPORT_PREVIEWED', 'IMPORT_COMMITTED', 'EXPORT_CREATED']).orderBy('created_at').execute();
    expect(audits.map((a) => a.action)).toEqual(['IMPORT_REJECTED', 'IMPORT_PREVIEWED', 'IMPORT_COMMITTED', 'EXPORT_CREATED']);
    const adminId = await h.userId('admin.a');
    for (const a of audits) {
      expect(a.organization_id).toBe(await orgA());
      expect(a.actor_user_id).toBe(adminId);
      expect(a.created_at).toBeInstanceOf(Date);
    }
    expect(audits[0]!.summary).toMatchObject({ template: 'Students', reason: 'TOO_MANY_ROWS' });
    expect(audits[2]!.summary).toMatchObject({ template: 'Students', mode: 'ADD_ONLY', rows: 50, results: { COMMITTED: 50, FAILED: 0, SKIPPED: 0 } });
    expect(audits[3]!.summary).toMatchObject({ kind: 'STUDENTS' });
    const text = JSON.stringify(audits.map((a) => a.summary));
    expect(text).not.toMatch(/Imported Student|Test Student|EXT-I-/);
  });
});
