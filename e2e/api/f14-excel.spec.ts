// F14 · Excel import and export — API E2E (docs/specs/14-f14-excel-import-export.md; plan docs/handover/F14-plan.md)
// Workbooks are built by the test from synthetic data (e2e/fixtures/workbooks.ts; see e2e/fixtures/workbooks.md).
// Screen journeys: e2e/mobile/f14-excel/. Black box: every check goes through the API or test control.
import type { APIRequestContext } from '@playwright/test';
import { MIXED_STUDENTS, dailyRecordsWorkbook, readKeyValues, readSheet, sabqiRow, studentsWorkbook, syntheticStudents, type Row } from '../fixtures/workbooks';
import { attendanceOp, classDay, getJson, push, type Ids } from './support/daily-entry';
import { expect, test } from './support/fixtures';

const XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
let ids: Ids;

const upload = (api: APIRequestContext, template: 'Students' | 'DailyRecords', bytes: Buffer, locale?: string) =>
  api.post(`/imports?template=${template}${locale ? `&locale=${locale}` : ''}`, { data: bytes, headers: { 'content-type': XLSX } });

async function preview(api: APIRequestContext, template: 'Students' | 'DailyRecords', bytes: Buffer, locale?: string) {
  const res = await upload(api, template, bytes, locale);
  expect(res.status(), await res.text()).toBe(201);
  return res.json();
}

async function rowsOf(api: APIRequestContext, jobId: string, locale?: string) {
  return (await getJson(api, `/imports/${jobId}/rows?limit=1000${locale ? `&locale=${locale}` : ''}`)).items as Array<{
    rowNo: number;
    classification: string;
    issues: Array<{ column: string | null; code: string; message: string }>;
    changes: Array<{ column: string; before: string | null; after: string | null }>;
    batchNo: number | null;
    result: string | null;
  }>;
}

async function confirm(api: APIRequestContext, jobId: string, mode: 'ADD_ONLY' | 'UPDATE' = 'ADD_ONLY') {
  const res = await api.post(`/imports/${jobId}/confirm`, { data: { mode } });
  expect(res.status(), await res.text()).toBe(200);
  return res.json();
}

async function file(api: APIRequestContext, url: string): Promise<Buffer> {
  const res = await api.get(url);
  expect(res.status(), await res.text()).toBe(200);
  expect(res.headers()['content-type']).toBe(XLSX);
  return res.body();
}

const studentsMatching = async (api: APIRequestContext, q: string) => (await getJson(api, `/students?q=${encodeURIComponent(q)}&status=ALL&limit=100`)).items as Array<{ id: string; name: string; externalStudentId: string | null }>;

async function present(api: APIRequestContext, pairs: Array<['S1' | 'S2' | 'S3', string]>) {
  const results = await push(api, pairs.map(([s, d]) => attendanceOp(ids, s, d, 'PRESENT', s === 'S3' ? 'A2' : 'A1')));
  for (const r of results) expect(r.status, JSON.stringify(r)).toBe('APPLIED');
}

const sabqi = sabqiRow;
const MIXED = MIXED_STUDENTS;

test.describe('F14 · Excel import and export', { tag: '@F14' }, () => {
  test.beforeEach(async ({ control }) => {
    await control.reset();
    ids = await control.rosterIds();
  });

  test('F14-AC1 (US-058) a valid 50-row Students workbook imports after preview and confirm (AC-XLS-01)', async ({ as }) => {
    const admin = await as('admin.a');
    const job = await preview(admin, 'Students', await studentsWorkbook(syntheticStudents(50)));
    expect(job.counts).toEqual({ NEW: 50, EXACT_MATCH: 0, SUSPECTED_DUPLICATE: 0, INVALID: 0, PROPOSED_UPDATE: 0 });
    expect(await studentsMatching(admin, 'EXT-I-')).toHaveLength(0);
    expect((await confirm(admin, job.id)).resultCounts).toEqual({ COMMITTED: 50, FAILED: 0, SKIPPED: 0 });
    expect(await studentsMatching(admin, 'EXT-I-')).toHaveLength(50);
  });

  test('F14-AC2 (US-058) more than 1,000 rows is rejected before processing', async ({ as }) => {
    const admin = await as('admin.a');
    const res = await upload(admin, 'Students', await studentsWorkbook(syntheticStudents(1001)));
    expect(res.status()).toBe(422);
    expect((await res.json()).error).toMatchObject({ code: 'WORKBOOK_REJECTED', message: 'Maximum 1,000 rows per file — split into several files', fields: { reason: 'TOO_MANY_ROWS' } });
    expect(await studentsMatching(admin, 'EXT-I-')).toHaveLength(0);
  });

  test('F14-AC3 (US-058) a wrong version or missing column is rejected with details', async ({ as }) => {
    const admin = await as('admin.a');
    const old = await upload(admin, 'Students', await studentsWorkbook(syntheticStudents(2), { version: '0' }));
    expect(old.status()).toBe(422);
    expect((await old.json()).error.fields).toMatchObject({ reason: 'WRONG_VERSION', template: 'Students', version: '1' });
    const missing = await upload(admin, 'Students', await studentsWorkbook(syntheticStudents(2), { columns: ['ExternalStudentID', 'ClassName'] }));
    const body = await missing.json();
    expect(body.error.fields).toMatchObject({ reason: 'MISSING_COLUMN', column: 'StudentName', version: '1' });
    expect(body.error.message).toContain('StudentName');
  });

  test('F14-AC4 (US-058) re-importing with stable ExternalStudentIDs creates nothing (AC-XLS-03)', async ({ as }) => {
    const admin = await as('admin.a');
    const bytes = await studentsWorkbook(syntheticStudents(50));
    await confirm(admin, (await preview(admin, 'Students', bytes)).id);
    const again = await preview(admin, 'Students', bytes);
    expect(again.counts).toEqual({ NEW: 0, EXACT_MATCH: 50, SUSPECTED_DUPLICATE: 0, INVALID: 0, PROPOSED_UPDATE: 0 });
    expect((await confirm(admin, again.id)).resultCounts).toEqual({ COMMITTED: 0, FAILED: 0, SKIPPED: 50 });
    expect(await studentsMatching(admin, 'EXT-I-')).toHaveLength(50);
  });

  test('F14-AC5 (US-058) a name match without an external ID is a suspected duplicate', async ({ as }) => {
    const admin = await as('admin.a');
    const job = await preview(admin, 'Students', await studentsWorkbook([{ ExternalStudentID: null, StudentName: 'Test Student One', ClassName: 'Hifz A1' }]));
    const [row] = await rowsOf(admin, job.id);
    expect(row).toMatchObject({ classification: 'SUSPECTED_DUPLICATE', issues: [{ column: 'StudentName', code: 'NAME_MATCH' }] });
    await confirm(admin, job.id);
    expect((await studentsMatching(admin, 'Test Student One')).map((s) => s.id)).toEqual([ids.students.S1]);
  });

  test('F14-AC6 (US-059) DailyRecords rows group into daily records and reports recalculate', async ({ as, control }) => {
    await control.seedSyntheticQuran();
    const admin = await as('admin.a');
    const date = classDay(2);
    await present(admin, [['S1', date]]);
    const sabaq: Row = { ExternalRecordID: 'D-1', ExternalStudentID: 'EXT-A-001', RecordDate: date, SectionType: 'SABAQ', PortionNumber: 1, SurahStart: 2, AyahStart: 1, AyahEnd: 10, TotalLines: 10, AssignedQuantity: 10, CompletedQuantity: 10, QuantityUnit: 'LINES', PerformanceStatus: 'COMPLETED', QualityRating: 1 };
    const job = await preview(admin, 'DailyRecords', await dailyRecordsWorkbook([sabaq, sabqi('D-2', date, 1), sabqi('D-3', date, 2), sabqi('D-4', date, 3), sabqi('D-5', date, 1, { SectionType: 'MANZIL', ParaNumber: 10 }), sabqi('D-6', date, 2, { SectionType: 'MANZIL', ParaNumber: 11 })]));
    expect(job.counts.NEW).toBe(6);
    await confirm(admin, job.id);
    const report = (await getJson(admin, `/reports/student?studentId=${ids.students.S1}&kind=WEEK&date=${date}`)).report;
    expect(report.days.filter((r: { date: string }) => r.date === date)).toHaveLength(1);
    expect(Object.fromEntries(report.sections.map((s: { section: string; portionCount: number }) => [s.section, s.portionCount]))).toEqual({ SABAQ: 1, SABQI: 3, MANZIL: 2 });
  });

  test('F14-AC7 (US-059) an unknown ExternalStudentID is invalid', async ({ as }) => {
    const admin = await as('admin.a');
    const job = await preview(admin, 'DailyRecords', await dailyRecordsWorkbook([sabqi('D-1', classDay(2), 1, { ExternalStudentID: 'EXT-B-001' })]));
    expect((await rowsOf(admin, job.id))[0]).toMatchObject({ classification: 'INVALID', issues: [{ column: 'ExternalStudentID', code: 'STUDENT_NOT_FOUND', message: 'Student not found in this madrasa' }] });
  });

  test('F14-AC8 (US-059) an organization named in the workbook is ignored', async ({ as }) => {
    const admin = await as('admin.a');
    const bytes = await studentsWorkbook(
      [
        { ExternalStudentID: 'EXT-O-001', StudentName: 'Org Column One', ClassName: 'Hifz A1', organization_id: 'BAA' },
        { ExternalStudentID: 'EXT-O-002', StudentName: 'Org Column Two', ClassName: 'Hifz B1', organization_id: 'BAA' },
      ],
      { columns: ['ExternalStudentID', 'StudentName', 'ClassName', 'organization_id'] },
    );
    const job = await preview(admin, 'Students', bytes);
    expect(job.ignoredColumns).toEqual(['organization_id']);
    expect((await rowsOf(admin, job.id)).map((r) => r.classification)).toEqual(['NEW', 'INVALID']);
    await confirm(admin, job.id);
    expect(await studentsMatching(admin, 'EXT-O-')).toHaveLength(1);
    // Madrasa B neither sees the job nor the student.
    const adminB = await as('admin.b');
    expect((await adminB.get(`/imports/${job.id}`)).status()).toBe(404);
    expect(await studentsMatching(adminB, 'EXT-O-')).toHaveLength(0);
  });

  test('F14-AC23 (US-059) Sabaq rows need a range, TotalLines, and LINES (AC-XLS-07)', async ({ as, control }) => {
    await control.seedSyntheticQuran();
    const admin = await as('admin.a');
    const date = classDay(2);
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
    const rows = await rowsOf(admin, job.id);
    expect(rows.map((r) => r.classification)).toEqual(['NEW', 'INVALID', 'INVALID', 'NEW']);
    expect(rows[1]!.issues).toMatchObject([{ code: 'SABAQ_USES_LINES', message: 'Sabaq uses lines' }]);
    expect(rows[2]!.issues).toMatchObject([{ column: 'AyahEnd', code: 'REQUIRED' }]);
  });

  test('F14-AC9 (US-059) MistakeCount becomes uncategorized mistakes', async ({ as }) => {
    const admin = await as('admin.a');
    const date = classDay(2);
    await present(admin, [['S1', date]]);
    await confirm(admin, (await preview(admin, 'DailyRecords', await dailyRecordsWorkbook([sabqi('D-1', date, 1, { MistakeCount: 3 })]))).id);
    const report = (await getJson(admin, `/reports/student?studentId=${ids.students.S1}&kind=WEEK&date=${date}`)).report;
    expect(report.mistakes).toMatchObject({ uncategorized: 3, total: 3 });
    expect(Object.values(report.mistakes.byCategory as Record<string, number>).every((n) => n === 0)).toBe(true);
  });

  test('F14-AC10 (US-059) an empty QualityRating is NULL', async ({ as }) => {
    const admin = await as('admin.a');
    const date = classDay(2);
    await present(admin, [['S1', date]]);
    await confirm(admin, (await preview(admin, 'DailyRecords', await dailyRecordsWorkbook([sabqi('D-1', date, 1, { QualityRating: null })]))).id);
    const report = (await getJson(admin, `/reports/student?studentId=${ids.students.S1}&kind=WEEK&date=${date}`)).report;
    expect(report.quality).toMatchObject({ count: 0, value: null });
  });

  test('F14-AC11 (US-060) the preview counts every row class with localized errors', async ({ as }) => {
    const admin = await as('admin.a');
    const job = await preview(admin, 'Students', await studentsWorkbook(MIXED), 'ur');
    expect(job.counts).toEqual({ NEW: 1, EXACT_MATCH: 1, SUSPECTED_DUPLICATE: 1, INVALID: 4, PROPOSED_UPDATE: 0 });
    const messages = (await rowsOf(admin, job.id, 'ur')).flatMap((r) => r.issues.map((i) => i.message));
    expect(messages.length).toBeGreaterThan(0);
    expect(messages.every((m) => /[؀-ۿ]/.test(m))).toBe(true);
    const update = await admin.put(`/imports/${job.id}/mode`, { data: { mode: 'UPDATE' } });
    expect((await update.json()).counts).toHaveProperty('PROPOSED_UPDATE');
  });

  test('F14-AC12 (US-060) each problem is reported on its row and field (AC-XLS-02)', async ({ as }) => {
    const admin = await as('admin.a');
    const job = await preview(admin, 'Students', await studentsWorkbook(MIXED));
    const byRow = new Map((await rowsOf(admin, job.id)).map((r) => [r.rowNo, r.issues.map((i) => `${i.column}:${i.code}`)]));
    expect(byRow.get(5)).toEqual(['AdmissionDate:INVALID_DATE']);
    expect(byRow.get(6)).toEqual(['Status:INVALID_ENUM']);
    expect(byRow.get(7)).toEqual(['ExternalStudentID:DUPLICATE_KEY']);
    expect(byRow.get(8)).toEqual(['ExternalStudentID:DUPLICATE_KEY']);
  });

  test('F14-AC13 (US-060) add-new-only mode changes no existing record (AC-XLS-04)', async ({ as }) => {
    const admin = await as('admin.a');
    const job = await preview(admin, 'Students', await studentsWorkbook([{ ExternalStudentID: 'EXT-A-001', StudentName: 'Test Student One Renamed', ClassName: 'Hifz A1' }]));
    expect(job.counts.SUSPECTED_DUPLICATE).toBe(1);
    await confirm(admin, job.id);
    expect((await getJson(admin, `/students/${ids.students.S1}`)).name).toBe('Test Student One');
  });

  test('F14-AC14 (US-060) update mode previews before and after and writes nothing until confirmed', async ({ as }) => {
    const admin = await as('admin.a');
    const job = await preview(admin, 'Students', await studentsWorkbook([{ ExternalStudentID: 'EXT-A-001', StudentName: 'Test Student One Renamed', ClassName: 'Hifz A1' }]));
    const update = await admin.put(`/imports/${job.id}/mode`, { data: { mode: 'UPDATE' } });
    expect((await update.json()).counts.PROPOSED_UPDATE).toBe(1);
    expect((await rowsOf(admin, job.id))[0]!.changes).toEqual([{ column: 'StudentName', before: 'Test Student One', after: 'Test Student One Renamed' }]);
    expect((await getJson(admin, `/students/${ids.students.S1}`)).name).toBe('Test Student One');
    await confirm(admin, job.id, 'UPDATE');
    expect((await getJson(admin, `/students/${ids.students.S1}`)).name).toBe('Test Student One Renamed');
  });

  test('F14-AC15 (US-060) a retried import after a failed batch does not duplicate committed rows', async ({ as, control }) => {
    const admin = await as('admin.a');
    const job = await preview(admin, 'Students', await studentsWorkbook(syntheticStudents(600, 'Hifz A1', 'EXT-R-')));
    await control.failImportBatch(2);
    const first = await confirm(admin, job.id);
    expect(first).toMatchObject({ status: 'PARTIALLY_FAILED', batchCount: 3, resultCounts: { COMMITTED: 400, FAILED: 200, SKIPPED: 0 } });
    const failed = (await rowsOf(admin, job.id)).filter((r) => r.result === 'FAILED');
    expect(failed).toHaveLength(200);
    expect(new Set(failed.map((r) => r.batchNo))).toEqual(new Set([2]));
    const retry = await confirm(admin, job.id);
    expect(retry).toMatchObject({ status: 'COMMITTED', resultCounts: { COMMITTED: 600, FAILED: 0, SKIPPED: 0 } });
    // Each student exists once: spot-check the first and last row of every batch.
    for (const n of ['0001', '0200', '0201', '0400', '0401', '0600'].map((x) => `EXT-R-${x.slice(1)}`)) expect(await studentsMatching(admin, n)).toHaveLength(1);
  });

  test('F14-AC16 (US-061) a Teacher export contains only assigned students and the date range (AC-XLS-05)', async ({ as }) => {
    const admin = await as('admin.a');
    const date = classDay(2);
    const earlier = classDay(9);
    await present(admin, [['S1', date], ['S2', date], ['S3', date], ['S1', earlier]]);
    await confirm(
      admin,
      (await preview(admin, 'DailyRecords', await dailyRecordsWorkbook([sabqi('E-1', date, 1), sabqi('E-2', date, 1, { ExternalStudentID: 'EXT-A-002' }), sabqi('E-3', date, 1, { ExternalStudentID: 'EXT-A-003' }), sabqi('E-0', earlier, 1)]))).id,
    );
    const teacher = await as('teacher.a1');
    const sheet = await readSheet(await file(teacher, `/exports/daily-records?from=${date}&to=${date}`), 'DailyRecords');
    const col = (n: string) => sheet.header.indexOf(n);
    expect(sheet.rows.map((r) => r[col('ExternalStudentID')]).sort()).toEqual(['EXT-A-001', 'EXT-A-002']);
    expect(sheet.rows.every((r) => r[col('RecordDate')] === date)).toBe(true);
  });

  test('F14-AC17 (US-061) Student and Parent exports contain no internal notes (AC-XLS-06)', async ({ as }) => {
    const admin = await as('admin.a');
    const date = classDay(2);
    const marker = 'Synthetic F14 private note marker';
    await present(admin, [['S1', date]]);
    await confirm(admin, (await preview(admin, 'DailyRecords', await dailyRecordsWorkbook([sabqi('E-1', date, 1, { TeacherNotes: marker })]))).id);
    const family = await readSheet(await file(admin, `/exports/daily-records?from=${date}&to=${date}&audience=FAMILY&includeNotes=true`), 'DailyRecords');
    expect(JSON.stringify(family.rows)).not.toContain(marker);
    expect(family.rows).toHaveLength(1);
    const staff = await readSheet(await file(admin, `/exports/daily-records?from=${date}&to=${date}&includeNotes=true`), 'DailyRecords');
    expect(JSON.stringify(staff.rows)).toContain(marker);
    for (const who of ['student.s1', 'parent.p1'] as const) expect((await (await as(who)).get(`/exports/daily-records?from=${date}&to=${date}`)).status()).toBe(403);
  });

  test('F14-AC18 (US-061) formula-like text is escaped (AC-XLS-06)', async ({ as }) => {
    const admin = await as('admin.a');
    const names = ['=1+1', '+cmd', '-2', '@SUM(A1)'];
    await confirm(admin, (await preview(admin, 'Students', await studentsWorkbook(names.map((n, i) => ({ ExternalStudentID: `EXT-X-00${i + 1}`, StudentName: n, ClassName: 'Hifz A1' }))))).id);
    const sheet = await readSheet(await file(admin, '/exports/students'), 'Students');
    const exported = sheet.rows.filter((r) => String(r[0]).startsWith('EXT-X-')).map((r) => r[1]);
    expect(exported.sort()).toEqual(names.map((n) => `'${n}`).sort());
    expect(sheet.types.flat().every((t) => t !== 6 /* formula */)).toBe(true);
  });

  test('F14-AC19 (US-061) exports keep IDs, dates, units, statuses, Arabic, and report metadata', async ({ as }) => {
    const admin = await as('admin.a');
    const date = classDay(2);
    const arabic = 'قَالَ رَبِّ اشْرَحْ لِي صَدْرِي';
    await present(admin, [['S1', date]]);
    await confirm(admin, (await preview(admin, 'DailyRecords', await dailyRecordsWorkbook([sabqi('E-1', date, 1, { TeacherNotes: arabic, QuantityUnit: 'SALASAH', CompletedQuantity: null, PerformanceStatus: 'NOT_REMEMBERED', QualityRating: 4 })]))).id);
    const bytes = await file(admin, `/exports/daily-records?from=${date}&to=${date}&includeNotes=true`);
    const sheet = await readSheet(bytes, 'DailyRecords');
    const row = Object.fromEntries(sheet.header.map((h, i) => [h, sheet.rows[0]![i]]));
    expect(row).toMatchObject({ ExternalRecordID: 'E-1', ExternalStudentID: 'EXT-A-001', RecordDate: date, QuantityUnit: 'SALASAH', PerformanceStatus: 'NOT_REMEMBERED', TeacherNotes: arabic });
    // The same file imports back as an exact match.
    expect((await preview(admin, 'DailyRecords', bytes)).counts.EXACT_MATCH).toBe(1);
    const meta = await readKeyValues(await file(admin, `/exports/report?classId=${ids.classes.A1}&kind=WEEK&date=${date}`), '_meta');
    expect(meta).toMatchObject({ ReportType: 'WEEK', TimeZone: 'Asia/Karachi', PendingOfflineChanges: 'false' });
    expect(meta.PeriodFrom! <= date && date <= meta.PeriodTo!).toBe(true);
    expect(meta.Filters).toContain(ids.classes.A1);
    expect(Number.isNaN(Date.parse(meta.GeneratedAt!))).toBe(false);
  });

  test('F14-AC20 (US-058) every import and export is audited without student details', async ({ as, control }) => {
    const admin = await as('admin.a');
    const job = await preview(admin, 'Students', await studentsWorkbook(syntheticStudents(5)));
    await confirm(admin, job.id);
    await file(admin, '/exports/students');
    const jobAudit = await control.auditForTarget(job.id);
    expect(jobAudit.map((a) => a.action)).toEqual(['IMPORT_PREVIEWED', 'IMPORT_COMMITTED']);
    const committed = jobAudit[1]!;
    expect(committed).toMatchObject({ actor_user_id: await control.userIdOf('admin.a'), summary: { template: 'Students', results: { COMMITTED: 5, FAILED: 0, SKIPPED: 0 } } });
    expect(committed.organization_id).toBeTruthy();
    expect(committed.created_at).toBeTruthy();
    const exports = await control.auditForAction('EXPORT_CREATED');
    expect(exports).toHaveLength(1);
    expect(exports[0]).toMatchObject({ summary: { kind: 'STUDENTS' } });
    expect(JSON.stringify([...jobAudit, ...exports].map((a) => a.summary))).not.toMatch(/Imported Student|Test Student|EXT-I-/);
  });

  // Added by the decision review of 2026-10-30 (SRS §17).
  test('F14-AC21 (US-058) a Teacher imports students into assigned classes only', async ({ as }) => {
    const teacher = await as('teacher.a1');
    const bytes = await studentsWorkbook([...syntheticStudents(4, 'Hifz A1', 'EXT-TA-'), ...syntheticStudents(2, 'Hifz A2', 'EXT-TB-').map((r, i) => ({ ...r, StudentName: `Other Class Student ${i + 1}` }))]);
    const job = await preview(teacher, 'Students', bytes);
    expect(job.counts).toMatchObject({ NEW: 4, INVALID: 2 });
    const invalid = (await rowsOf(teacher, job.id)).filter((r) => r.classification === 'INVALID');
    expect(invalid.flatMap((r) => r.issues.map((i) => i.message))).toEqual(['Not your class', 'Not your class']);
    expect((await confirm(teacher, job.id)).resultCounts).toEqual({ COMMITTED: 4, FAILED: 0, SKIPPED: 2 });
    const admin = await as('admin.a');
    expect(await studentsMatching(admin, 'EXT-TA-')).toHaveLength(4);
    expect(await studentsMatching(admin, 'EXT-TB-')).toHaveLength(0);
    // Profiles only: no login account was linked to any of them (FR-XLS-001).
    for (const s of await studentsMatching(admin, 'EXT-TA-')) expect((await getJson(admin, `/students/${s.id}/access`)).studentAccount).toBeNull();
  });

  test('F14-AC22 (US-060) templates carry a _meta version and imports commit 200 rows per batch', async ({ as }) => {
    const admin = await as('admin.a');
    const noMeta = await upload(admin, 'Students', await studentsWorkbook(syntheticStudents(3), { noMeta: true }));
    expect(noMeta.status()).toBe(422);
    expect((await noMeta.json()).error.fields).toMatchObject({ reason: 'NO_META', template: 'Students', version: '1' });
    const unknown = await upload(admin, 'Students', await studentsWorkbook(syntheticStudents(3), { version: '9' }));
    expect((await unknown.json()).error.fields).toMatchObject({ reason: 'WRONG_VERSION', template: 'Students', version: '1' });
    expect(await readKeyValues(await file(admin, '/imports/templates/Students'), '_meta')).toMatchObject({ TemplateName: 'Students', TemplateVersion: '1' });
    const job = await preview(admin, 'Students', await studentsWorkbook(syntheticStudents(1000, 'Hifz A1', 'EXT-K-')));
    expect(await confirm(admin, job.id)).toMatchObject({ batchCount: 5, resultCounts: { COMMITTED: 1000, FAILED: 0, SKIPPED: 0 } });
    const perBatch = new Map<number, number>();
    for (const r of await rowsOf(admin, job.id)) perBatch.set(r.batchNo!, (perBatch.get(r.batchNo!) ?? 0) + 1);
    expect([...perBatch.values()]).toEqual([200, 200, 200, 200, 200]);
  });
});
