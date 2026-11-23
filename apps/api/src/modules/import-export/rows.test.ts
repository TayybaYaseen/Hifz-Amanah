// F14 · Excel import and export — unit (docs/specs/14-f14-excel-import-export.md). Synthetic data only.
import ExcelJS from 'exceljs';
import { describe, expect, it } from 'vitest';
import { IMPORT_ISSUE_CODES, LOCALES, WORKBOOK_REJECTIONS } from '@hifz/contracts';
import { dailyRecordsWorkbook, readSheet, studentsWorkbook, syntheticStudents, type Row } from '../../../../../e2e/fixtures/workbooks.ts';
import { batchesOf, localize } from './import-service.ts';
import { catalogues, issueMessage, localeOf, rejectionMessage } from './messages.ts';
import {
  attemptChanges,
  attemptOfRow,
  classifyStudentRows,
  groupKeyOf,
  parseAmount,
  parseDailyRow,
  parseStudentRow,
  quantityOfTemplate,
  samePortion,
  templateQuantities,
  type ExistingStudent,
  type StudentImportContext,
} from './rows.ts';
import { escapeCell, readCell, readWorkbook, WorkbookError, writeWorkbook, type ParsedRow } from './workbook.ts';

const TODAY = '2026-11-20';
const CLASS_A = { id: '0190f5c0-0000-7000-8000-00000000000a', name: 'Hifz A1', status: 'ACTIVE' as const };
const CLASS_B = { id: '0190f5c0-0000-7000-8000-00000000000b', name: 'Hifz A2', status: 'ACTIVE' as const };
const S1: ExistingStudent = { id: '0190f5c0-0000-7000-8000-000000000001', name: 'Test Student One', externalStudentId: 'EXT-A-001', admissionDate: null, status: 'ACTIVE', notes: null, classIds: [CLASS_A.id], className: 'Hifz A1' };
const NAMED_ONLY: ExistingStudent = { ...S1, id: '0190f5c0-0000-7000-8000-000000000002', name: 'Test Student Two', externalStudentId: null };

const row = (cells: Record<string, string | null>, rowNo = 2, cellIssues: ParsedRow['cellIssues'] = {}): ParsedRow => ({ rowNo, cells, cellIssues });

const ctx = (over: Partial<StudentImportContext> = {}): StudentImportContext => ({ mode: 'ADD_ONLY', canManage: true, scopeClassIds: null, classes: [CLASS_A, CLASS_B], students: [S1, NAMED_ONLY], ...over });

const students = (cells: Record<string, string | null>[], over: Partial<StudentImportContext> = {}) =>
  classifyStudentRows(
    cells.map((c, i) => ({ rowNo: i + 2, ...parseStudentRow(row(c, i + 2)) })),
    ctx(over),
  );

const daily = (cells: Record<string, string | null>, mode: 'SINGLE' | 'MULTI_SESSION' = 'SINGLE') => parseDailyRow(row(cells), { mode, today: TODAY });

const SABQI_ROW = {
  ExternalRecordID: 'R-1',
  ExternalStudentID: 'EXT-A-001',
  RecordDate: '2026-11-18',
  SectionType: 'SABQI',
  PortionNumber: '1',
  ParaNumber: '3',
  AssignedQuantity: '1',
  CompletedQuantity: '1',
  QuantityUnit: 'HALF',
  PerformanceStatus: 'COMPLETED',
  QualityRating: '2',
};
const SABAQ_ROW = {
  ExternalStudentID: 'EXT-A-001',
  RecordDate: '2026-11-18',
  SectionType: 'SABAQ',
  PortionNumber: '1',
  SurahStart: '2',
  AyahStart: '1',
  AyahEnd: '10',
  TotalLines: '10',
  AssignedQuantity: '10',
  CompletedQuantity: '10',
  QuantityUnit: 'LINES',
  PerformanceStatus: 'COMPLETED',
};

const codes = (issues: readonly { column: string | null; code: string }[]) => issues.map((i) => `${i.column}:${i.code}`);

async function rejection(bytes: Buffer, template: 'Students' | 'DailyRecords' = 'Students'): Promise<WorkbookError> {
  try {
    await readWorkbook(bytes, template);
  } catch (e) {
    if (e instanceof WorkbookError) return e;
    throw e;
  }
  throw new Error('workbook was accepted');
}

describe('F14 · workbook checks', () => {
  it('F14-AC2 (US-058) more than 1,000 rows is rejected before processing', async () => {
    const e = await rejection(await studentsWorkbook(syntheticStudents(1001)));
    expect(e.reason).toBe('TOO_MANY_ROWS');
    expect(rejectionMessage('en', e.reason, e.params)).toBe('Maximum 1,000 rows per file — split into several files');
    // Exactly 1,000 is accepted (FR-XLS-017).
    expect((await readWorkbook(await studentsWorkbook(syntheticStudents(1000)), 'Students')).rows).toHaveLength(1000);
  });

  it('F14-AC3 (US-058) a wrong template version or missing column is rejected, naming the expected version and column', async () => {
    const old = await rejection(await studentsWorkbook(syntheticStudents(2), { version: '0' }));
    expect(old.reason).toBe('WRONG_VERSION');
    expect(rejectionMessage('en', old.reason, old.params)).toBe('Template version 0 is not supported. Expected template Students version 1');
    const missing = await rejection(await studentsWorkbook(syntheticStudents(2), { columns: ['ExternalStudentID', 'ClassName'] }));
    expect(missing.reason).toBe('MISSING_COLUMN');
    expect(missing.params).toMatchObject({ column: 'StudentName', template: 'Students', version: '1' });
    expect(rejectionMessage('en', missing.reason, missing.params)).toContain('StudentName');
    // DailyRecords version 1 (before TotalLines) is refused (SRS §15.1, 2026-11-01).
    const v1 = await rejection(await dailyRecordsWorkbook([SABQI_ROW], { version: '1' }), 'DailyRecords');
    expect(v1.params).toMatchObject({ template: 'DailyRecords', version: '2', found: '1' });
    // The other template, no rows, no _meta, not a workbook.
    expect((await rejection(await dailyRecordsWorkbook([SABQI_ROW]))).reason).toBe('WRONG_TEMPLATE');
    expect((await rejection(await studentsWorkbook([]))).reason).toBe('NO_ROWS');
    expect(rejectionMessage('en', 'NO_ROWS', { template: 'Students' })).toBe('No rows found in the Students sheet');
    expect((await rejection(await studentsWorkbook(syntheticStudents(1), { noMeta: true }))).reason).toBe('NO_META');
    expect((await rejection(Buffer.from('ExternalStudentID,StudentName\nX,Y\n'))).reason).toBe('NOT_XLSX');
  });

  it('F14 unit: formulas and macros are read as data, never evaluated', async () => {
    // A cached result is the value; a formula without one is an invalid cell; nothing is computed.
    expect(readCell({ formula: '1+1', result: 2 } as ExcelJS.CellValue)).toEqual({ text: '2' });
    expect(readCell({ formula: 'NOW()' } as ExcelJS.CellValue)).toEqual({ issue: 'FORMULA_NO_VALUE' });
    const parsed = await readWorkbook(
      await studentsWorkbook([
        { ExternalStudentID: 'EXT-F-1', StudentName: { formula: 'CONCAT("A","B")', result: 'Cached Name' }, ClassName: 'Hifz A1' },
        { ExternalStudentID: 'EXT-F-2', StudentName: { formula: 'CONCAT("A","B")' }, ClassName: 'Hifz A1' },
      ]),
      'Students',
    );
    expect(parsed.rows[0]!.cells.StudentName).toBe('Cached Name');
    expect(parsed.rows[1]!.cellIssues.StudentName).toBe('FORMULA_NO_VALUE');
    expect(codes(parseStudentRow(parsed.rows[1]!).issues)).toContain('StudentName:FORMULA_NO_VALUE');
    // Dates typed as Excel dates become YYYY-MM-DD; Arabic text is kept exactly.
    expect(readCell(new Date(Date.UTC(2026, 9, 30)))).toEqual({ text: '2026-10-30' });
    const arabic = 'بِسْمِ اللَّهِ الرَّحْمَٰنِ الرَّحِيمِ';
    expect(readCell(arabic)).toEqual({ text: arabic });
  });

  it('F14 unit: unknown columns are listed and ignored, never read (an organization column)', async () => {
    const bytes = await studentsWorkbook([{ ExternalStudentID: 'EXT-O-1', StudentName: 'Org Column', ClassName: 'Hifz A1', organization_id: '0190f5c0-0000-7000-8000-0000000000ff' }], {
      columns: ['ExternalStudentID', 'StudentName', 'ClassName', 'organization_id'],
    });
    const parsed = await readWorkbook(bytes, 'Students');
    expect(parsed.ignoredColumns).toEqual(['organization_id']);
    expect(Object.keys(parsed.rows[0]!.cells)).not.toContain('organization_id');
  });
});

describe('F14 · row validation', () => {
  it('F14-AC12 (US-060) invalid columns, malformed dates, invalid statuses, and duplicate keys report on their row and field (AC-XLS-02)', () => {
    const out = students([
      { ExternalStudentID: 'EXT-N-1', StudentName: 'Bad Date', ClassName: 'Hifz A1', AdmissionDate: '30/10/2026' },
      { ExternalStudentID: 'EXT-N-2', StudentName: 'Bad Status', ClassName: 'Hifz A1', Status: 'GRADUATED' },
      { ExternalStudentID: 'EXT-DUP', StudentName: 'Dup One', ClassName: 'Hifz A1' },
      { ExternalStudentID: 'ext-dup', StudentName: 'Dup Two', ClassName: 'Hifz A1' },
      { ExternalStudentID: 'EXT-N-5', StudentName: null, ClassName: 'Hifz A1' },
    ]);
    expect(out.map((r) => r.classification)).toEqual(['INVALID', 'INVALID', 'INVALID', 'INVALID', 'INVALID']);
    expect(codes(out[0]!.issues)).toEqual(['AdmissionDate:INVALID_DATE']);
    expect(issueMessage('en', 'INVALID_DATE')).toContain('YYYY-MM-DD');
    expect(codes(out[1]!.issues)).toEqual(['Status:INVALID_ENUM']);
    expect(codes(out[2]!.issues)).toEqual(['ExternalStudentID:DUPLICATE_KEY']);
    expect(codes(out[3]!.issues)).toEqual(['ExternalStudentID:DUPLICATE_KEY']);
    expect(codes(out[4]!.issues)).toEqual(['StudentName:REQUIRED']);
    // DailyRecords: a bad status and a bad date on their own fields.
    expect(codes(daily({ ...SABQI_ROW, PerformanceStatus: 'DONE', RecordDate: '2026/11/18' }).issues)).toEqual(['RecordDate:INVALID_DATE', 'PerformanceStatus:INVALID_ENUM']);
  });

  it('F14-AC7 (US-059) an unknown ExternalStudentID is invalid: "Student not found in this madrasa"', () => {
    // The lookup is the service's (active madrasa only); the code and its message are fixed here.
    expect(issueMessage('en', 'STUDENT_NOT_FOUND')).toBe('Student not found in this madrasa');
    for (const locale of LOCALES) expect(issueMessage(locale, 'STUDENT_NOT_FOUND').length).toBeGreaterThan(5);
    expect(codes(daily({ ...SABQI_ROW, ExternalStudentID: null }).issues)).toContain('ExternalStudentID:REQUIRED');
  });

  it('F14-AC8 (US-059) an organization_id or madrasa named in the workbook is ignored', () => {
    const parsed = daily({ ...SABQI_ROW, organization_id: '0190f5c0-0000-7000-8000-0000000000ff', Madrasa: 'Madrasa Baa (test)' } as Record<string, string>);
    expect(parsed.issues).toEqual([]);
    // The parsed value has no tenant field at all: the service takes the organization from the membership.
    expect(Object.keys(parsed.value).some((k) => /org|madrasa|tenant/i.test(k))).toBe(false);
  });

  it('F14-AC9 (US-059) MistakeCount = 3 yields 3 uncategorized mistakes and no categories', () => {
    const v = daily({ ...SABQI_ROW, MistakeCount: '3' }).value;
    expect(v.mistakeCount).toBe(3);
    expect(attemptOfRow(v).mistakeCount).toBe(3);
    // An empty MistakeCount is unknown, never 0.
    expect(daily({ ...SABQI_ROW, MistakeCount: null }).value.mistakeCount).toBeNull();
    expect(codes(daily({ ...SABQI_ROW, MistakeCount: '2.5' }).issues)).toEqual(['MistakeCount:NOT_WHOLE']);
  });

  it('F14-AC10 (US-059) an empty QualityRating is NULL, not 0', () => {
    expect(daily({ ...SABQI_ROW, QualityRating: null }).value.quality).toBeNull();
    expect(codes(daily({ ...SABQI_ROW, QualityRating: '0' }).issues)).toEqual(['QualityRating:OUT_OF_RANGE']);
    expect(codes(daily({ ...SABQI_ROW, QualityRating: '6' }).issues)).toEqual(['QualityRating:OUT_OF_RANGE']);
    // Quality is never recorded for Absent, Not assigned, or Pending (FR-ATT-007).
    expect(codes(daily({ ...SABQI_ROW, PerformanceStatus: 'ABSENT', CompletedQuantity: null, QualityRating: '2' }).issues)).toEqual(['QualityRating:QUALITY_NOT_ALLOWED']);
  });

  it('F14 unit: SessionLabel is required in multi-session mode and refused in single mode', () => {
    expect(codes(daily({ ...SABQI_ROW, SessionLabel: null }, 'MULTI_SESSION').issues)).toEqual(['SessionLabel:SESSION_LABEL_REQUIRED']);
    expect(issueMessage('en', 'SESSION_LABEL_REQUIRED')).toBe('Session label required');
    expect(daily({ ...SABQI_ROW, SessionLabel: 'Fajr' }, 'MULTI_SESSION').value.sessionLabel).toBe('Fajr');
    expect(codes(daily({ ...SABQI_ROW, SessionLabel: 'Fajr' }).issues)).toEqual(['SessionLabel:SESSION_LABEL_NOT_ALLOWED']);
    expect(codes(daily({ ...SABQI_ROW, RecordDate: '2026-11-21' }).issues)).toEqual(['RecordDate:FUTURE_DATE']);
  });

  it('F14 unit: Para-preset quantities are exact counts of the unit; no floats, whole quarters only', () => {
    expect(parseAmount('0.75')).toEqual({ num: 3, den: 4 });
    expect(parseAmount('3/4')).toEqual({ num: 3, den: 4 });
    expect(parseAmount('abc')).toBeNull();
    expect(quantityOfTemplate('RUBU', { num: 2, den: 1 })).toEqual({ unit: 'PARA', numerator: 1, denominator: 2 });
    expect(quantityOfTemplate('SALASAH', { num: 1, den: 1 })).toEqual({ unit: 'PARA', numerator: 3, denominator: 4 });
    // The app's rule: a Para portion is Rubu to one complete Para (FR-QTY-002); 2 Paras are two portions.
    expect(quantityOfTemplate('COMPLETE', { num: 1, den: 1 })).toEqual({ unit: 'PARA', numerator: 1, denominator: 1 });
    expect(quantityOfTemplate('COMPLETE', { num: 2, den: 1 })).toBe('NOT_PARA_QUARTERS');
    expect(quantityOfTemplate('SALASAH', { num: 1, den: 3 })).toEqual({ unit: 'PARA', numerator: 1, denominator: 4 });
    expect(quantityOfTemplate('SALASAH', { num: 1, den: 2 })).toBe('NOT_PARA_QUARTERS');
    expect(quantityOfTemplate('LINES', { num: 1, den: 2 })).toBe('NOT_WHOLE');
    // Completed above assigned is refused by the app's own rule.
    expect(codes(daily({ ...SABQI_ROW, CompletedQuantity: '2' }).issues)).toEqual(['CompletedQuantity:ABOVE_ASSIGNED']);
  });
});

describe('F14 · row classification', () => {
  it('F14-AC4 (US-058) a re-imported row with a stable ExternalStudentID is an exact match (AC-XLS-03)', () => {
    const [r] = students([{ ExternalStudentID: 'ext-a-001', StudentName: 'Test Student One', ClassName: 'Hifz A1' }]);
    expect(r!.classification).toBe('EXACT_MATCH');
    expect(r!.plan.kind).toBe('NONE');
    // An empty cell never counts as a change (nothing is cleared by an import).
    const [blank] = students([{ ExternalStudentID: 'EXT-A-001', StudentName: 'Test Student One', AdmissionDate: null, Notes: null }]);
    expect(blank!.classification).toBe('EXACT_MATCH');
  });

  it('F14-AC5 (US-058) a name match without ExternalStudentID is a suspected duplicate, never the same student', () => {
    const [r] = students([{ ExternalStudentID: null, StudentName: 'test student one', ClassName: 'Hifz A1' }]);
    expect(r!.classification).toBe('SUSPECTED_DUPLICATE');
    expect(codes(r!.issues)).toEqual(['StudentName:NAME_MATCH']);
    expect(r!.plan.kind).toBe('NONE');
    // A key that matches nobody, with the name of a student who has no key, is also for review.
    expect(students([{ ExternalStudentID: 'EXT-NEW', StudentName: 'Test Student Two', ClassName: 'Hifz A1' }])[0]!.classification).toBe('SUSPECTED_DUPLICATE');
    // The same name twice in the file without keys: the later row is for review.
    const twice = students([
      { StudentName: 'Fresh Name', ClassName: 'Hifz A1' },
      { StudentName: 'Fresh Name', ClassName: 'Hifz A1' },
    ]);
    expect(twice.map((t) => t.classification)).toEqual(['NEW', 'SUSPECTED_DUPLICATE']);
  });

  it('F14-AC13 (US-060) add-new-only mode never proposes changes to existing records (AC-XLS-04)', () => {
    const [r] = students([{ ExternalStudentID: 'EXT-A-001', StudentName: 'Renamed Student', ClassName: 'Hifz A1' }]);
    expect(r!.classification).toBe('SUSPECTED_DUPLICATE');
    expect(r!.changes).toEqual([]);
    expect(r!.plan.kind).toBe('NONE');
    expect(codes(r!.issues)).toEqual(['null:EXISTS_DIFFERENT']);
  });

  it('F14-AC14 (US-060) update mode shows field-level before and after values', () => {
    const [r] = students([{ ExternalStudentID: 'EXT-A-001', StudentName: 'Renamed Student', ClassName: 'Hifz A1', Notes: 'نوٹ' }], { mode: 'UPDATE' });
    expect(r!.classification).toBe('PROPOSED_UPDATE');
    expect(r!.changes).toEqual([
      { column: 'StudentName', before: 'Test Student One', after: 'Renamed Student' },
      { column: 'Notes', before: null, after: 'نوٹ' },
    ]);
    expect(r!.plan).toEqual({ kind: 'UPDATE', studentId: S1.id, set: { name: 'Renamed Student', notes: 'نوٹ' } });
    // A Teacher may not change a student's status (DEC-B14).
    const [status] = students([{ ExternalStudentID: 'EXT-A-001', StudentName: 'Test Student One', Status: 'INACTIVE' }], { mode: 'UPDATE', canManage: false, scopeClassIds: [CLASS_A.id] });
    expect(status!.classification).toBe('INVALID');
    expect(codes(status!.issues)).toEqual(['Status:STATUS_CHANGE_NOT_ALLOWED']);
    // DailyRecords: the result's before/after, and the portion compared as a whole.
    const stored = { status: 'PARTIAL' as const, completed: { unit: 'PARA' as const, numerator: 1, denominator: 4 }, quality: 3, mistakeCount: null, teacherNotes: null };
    const v = daily({ ...SABQI_ROW, MistakeCount: '1' }).value;
    expect(attemptChanges(stored, attemptOfRow(v)).changes).toEqual([
      { column: 'PerformanceStatus', before: 'PARTIAL', after: 'COMPLETED' },
      { column: 'CompletedQuantity', before: '1/4 PARA', after: '1/2 PARA' },
      { column: 'QualityRating', before: '3', after: '2' },
      { column: 'MistakeCount', before: null, after: '1' },
    ]);
    const portion = { studentId: S1.id, recordDate: '2026-11-18', sessionLabel: null, section: 'SABQI' as const, position: 1, paraNumber: 3, range: null, totalLines: null, assigned: { unit: 'PARA' as const, numerator: 1, denominator: 2 } };
    expect(samePortion(portion, v, S1.id)).toBe(true);
    expect(samePortion({ ...portion, paraNumber: 4 }, v, S1.id)).toBe(false);
  });

  it('F14-AC6 (US-059) DailyRecords rows with the same student, date, and session form one daily record', () => {
    expect(groupKeyOf(S1.id, '2026-11-18', 'Fajr')).toBe(groupKeyOf(S1.id, '2026-11-18', ' fajr '));
    expect(groupKeyOf(S1.id, '2026-11-18', null)).not.toBe(groupKeyOf(S1.id, '2026-11-18', 'Fajr'));
    expect(groupKeyOf(S1.id, '2026-11-18', null)).not.toBe(groupKeyOf(S1.id, '2026-11-19', null));
    // A record's rows are never split across commit batches; 1,000 single rows are 5 batches of 200 (F14-AC22).
    const rows = Array.from({ length: 1000 }, (_, i) => ({ rowNo: i + 2, groupKey: null }));
    expect(batchesOf(rows).map((b) => b.length)).toEqual([200, 200, 200, 200, 200]);
    const grouped = Array.from({ length: 203 }, (_, i) => ({ rowNo: i + 2, groupKey: i < 198 ? `g${Math.floor(i / 6)}` : 'tail' }));
    const batches = batchesOf(grouped);
    expect(batches.map((b) => b.length)).toEqual([198, 5]);
  });

  it('F14-AC23 (US-059) a SABAQ row needs SurahStart, AyahStart, AyahEnd, TotalLines, and LINES; a Para preset makes it invalid (AC-XLS-07)', () => {
    const ok = daily(SABAQ_ROW);
    expect(ok.issues).toEqual([]);
    expect(ok.value.range).toEqual({ surahStart: 2, ayahStart: 1, surahEnd: 2, ayahEnd: 10 });
    expect(ok.value.assigned).toEqual({ unit: 'LINES', numerator: 10, denominator: 1 });
    for (const unit of ['RUBU', 'HALF', 'SALASAH', 'COMPLETE']) {
      const bad = daily({ ...SABAQ_ROW, QuantityUnit: unit, AssignedQuantity: '1', CompletedQuantity: null });
      expect(codes(bad.issues), unit).toEqual(['QuantityUnit:SABAQ_USES_LINES']);
      expect(bad.value.assigned, 'never converted').toBeNull();
    }
    expect(issueMessage('en', 'SABAQ_USES_LINES')).toBe('Sabaq uses lines');
    expect(codes(daily({ ...SABAQ_ROW, AyahEnd: null }).issues)).toEqual(['AyahEnd:REQUIRED']);
    expect(codes(daily({ ...SABAQ_ROW, TotalLines: null }).issues)).toEqual(['TotalLines:REQUIRED']);
    expect(codes(daily({ ...SABAQ_ROW, SurahEnd: '3' }).issues)).toEqual(['SurahEnd:SABAQ_SURAH_END']);
    expect(codes(daily({ ...SABAQ_ROW, AssignedQuantity: '12', CompletedQuantity: null }).issues)).toEqual(['AssignedQuantity:ABOVE_TOTAL']);
    // Sabqi and Manzil are validated as before: a Salasah is fine; TotalLines is not used.
    expect(daily({ ...SABQI_ROW, QuantityUnit: 'SALASAH', CompletedQuantity: null, PerformanceStatus: 'PENDING', QualityRating: null }).issues).toEqual([]);
    expect(codes(daily({ ...SABQI_ROW, SectionType: 'MANZIL', TotalLines: '5' }).issues)).toEqual(['TotalLines:NOT_ALLOWED']);
    expect(codes(daily({ ...SABQI_ROW, ParaNumber: null }).issues)).toEqual(['ParaNumber:REQUIRED']);
  });

  it('F14-AC21 (US-058) a Teacher sees rows for another class as "Not your class"', () => {
    const out = students(
      [
        { ExternalStudentID: 'EXT-T-1', StudentName: 'Teacher Row One', ClassName: 'Hifz A1' },
        { ExternalStudentID: 'EXT-T-2', StudentName: 'Teacher Row Two', ClassName: 'Hifz A2' },
        { ExternalStudentID: 'EXT-T-3', StudentName: 'Teacher Row Three', ClassName: 'Hifz B1' },
      ],
      { canManage: false, scopeClassIds: [CLASS_A.id] },
    );
    expect(out.map((r) => r.classification)).toEqual(['NEW', 'INVALID', 'INVALID']);
    expect(codes(out[1]!.issues)).toEqual(['ClassName:NOT_YOUR_CLASS']);
    expect(codes(out[2]!.issues)).toEqual(['ClassName:NOT_YOUR_CLASS']);
    expect(issueMessage('en', 'NOT_YOUR_CLASS')).toBe('Not your class');
    // An Admin sees an unknown class as not found, and a new student needs a class.
    expect(codes(students([{ StudentName: 'No Such Class', ClassName: 'Hifz Z9' }])[0]!.issues)).toEqual(['ClassName:CLASS_NOT_FOUND']);
    expect(codes(students([{ StudentName: 'No Class' }])[0]!.issues)).toEqual(['ClassName:CLASS_REQUIRED']);
  });
});

describe('F14 · export escaping', () => {
  it('F14-AC18 (US-061) cells starting with = + - @ tab or CR are escaped as text (AC-XLS-06)', async () => {
    for (const v of ['=1+1', '+cmd', '-2', '@SUM(A1)', '\tTab', '\rCR']) expect(escapeCell(v)).toBe(`'${v}`);
    expect(escapeCell('Plain')).toBe('Plain');
    expect(escapeCell(-2)).toBe(-2);
    const bytes = await writeWorkbook({ templateName: 'Students', templateVersion: '1', createdAt: new Date(0), about: [], sheets: [{ name: 'Students', header: ['StudentName'], rows: [['=1+1'], ['@SUM(A1)']] }] });
    const sheet = await readSheet(bytes, 'Students');
    expect(sheet.rows).toEqual([["'=1+1"], ["'@SUM(A1)"]]);
    // Every cell is a plain string, never a formula.
    expect(sheet.types.flat().every((t) => t === ExcelJS.ValueType.String)).toBe(true);
    // Imported back, the escape is removed so the value round-trips.
    expect(readCell("'=1+1")).toEqual({ text: '=1+1' });
  });

  it('F14-AC19 (US-061) IDs, dates, units, canonical statuses, and Arabic text are exported unchanged', async () => {
    const arabic = 'قَالَ رَبِّ اشْرَحْ لِي صَدْرِي';
    const bytes = await writeWorkbook({
      templateName: 'DailyRecords',
      templateVersion: '2',
      createdAt: new Date(0),
      about: [],
      sheets: [{ name: 'DailyRecords', header: ['ExternalRecordID', 'RecordDate', 'QuantityUnit', 'PerformanceStatus', 'TeacherNotes'], rows: [['00123', '2026-10-30', 'SALASAH', 'NOT_REMEMBERED', arabic]] }],
    });
    expect((await readSheet(bytes, 'DailyRecords')).rows).toEqual([['00123', '2026-10-30', 'SALASAH', 'NOT_REMEMBERED', arabic]]);
    // Stored quantities become template values that import back exactly.
    expect(templateQuantities({ unit: 'PARA', numerator: 3, denominator: 4 }, null)).toEqual({ unit: 'SALASAH', assigned: 1, completed: null });
    expect(templateQuantities({ unit: 'PARA', numerator: 3, denominator: 4 }, { unit: 'PARA', numerator: 1, denominator: 2 })).toEqual({ unit: 'RUBU', assigned: 3, completed: 2 });
    expect(templateQuantities({ unit: 'PARA', numerator: 1, denominator: 1 }, { unit: 'PARA', numerator: 1, denominator: 1 })).toEqual({ unit: 'COMPLETE', assigned: 1, completed: 1 });
    expect(templateQuantities({ unit: 'LINES', numerator: 10, denominator: 1 }, { unit: 'LINES', numerator: 7, denominator: 1 })).toEqual({ unit: 'LINES', assigned: 10, completed: 7 });
    const back = quantityOfTemplate('RUBU', { num: 3, den: 1 });
    expect(back).toEqual({ unit: 'PARA', numerator: 3, denominator: 4 });
  });
});

describe('F14 · localization (NFR-XLS-003)', () => {
  it('F14-AC11 (US-060) every issue and rejection has a message in en, ur, and ur-Latn', () => {
    for (const locale of LOCALES) {
      for (const code of IMPORT_ISSUE_CODES) expect(catalogues.ISSUES[locale][code], `${locale} ${code}`).toBeTruthy();
      for (const code of WORKBOOK_REJECTIONS) expect(catalogues.REJECTIONS[locale][code], `${locale} ${code}`).toBeTruthy();
    }
    const [issue] = localize([{ column: 'ClassName', code: 'NOT_YOUR_CLASS', severity: 'ERROR' }], 'ur');
    expect(issue).toMatchObject({ column: 'ClassName', code: 'NOT_YOUR_CLASS', severity: 'ERROR', message: 'آپ کی جماعت نہیں' });
    expect(localeOf(undefined, 'ur-PK,ur;q=0.9,en;q=0.8')).toBe('ur');
    expect(localeOf(undefined, 'ur-Latn')).toBe('ur-Latn');
    expect(localeOf('en', 'ur')).toBe('en');
    expect(localeOf(undefined, undefined)).toBe('en');
  });
});

/** Rows used by the integration tests are the same synthetic shapes (types only). */
export type { Row };
