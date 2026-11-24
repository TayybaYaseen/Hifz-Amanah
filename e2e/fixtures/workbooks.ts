// Synthetic Excel workbooks for the F14 tests (e2e/fixtures/workbooks.md). Built with exceljs in the SRS §15.1 layout
// the API reads: an About sheet, the data sheet, and a hidden `_meta` sheet (TemplateName, TemplateVersion). Never real
// student names or records (AGENTS.md §6).
import ExcelJS from 'exceljs';

export const STUDENT_COLUMNS = ['ExternalStudentID', 'StudentName', 'ClassName', 'AdmissionDate', 'Status', 'Notes'] as const;
export const DAILY_RECORD_COLUMNS = [
  'ExternalRecordID',
  'ExternalStudentID',
  'RecordDate',
  'SessionLabel',
  'SectionType',
  'PortionNumber',
  'ParaNumber',
  'SurahStart',
  'AyahStart',
  'SurahEnd',
  'AyahEnd',
  'TotalLines',
  'AssignedQuantity',
  'CompletedQuantity',
  'QuantityUnit',
  'MistakeCount',
  'PerformanceStatus',
  'QualityRating',
  'TeacherNotes',
] as const;

/** A cell: a value, empty, or a formula with an optional saved result (never evaluated by the API). */
export type Cell = string | number | null | undefined | { formula: string; result?: string | number };
export type Row = Record<string, Cell>;

export interface WorkbookOptions {
  /** Default: the current version (Students 1, DailyRecords 2). */
  version?: string;
  /** Omit the hidden `_meta` sheet (F14-AC22). */
  noMeta?: boolean;
  /** The header row; default the template's columns. Lets a test drop or add a column. */
  columns?: readonly string[];
  /** `_meta` TemplateName; default the template. */
  templateName?: string;
}

async function build(sheetName: 'Students' | 'DailyRecords', defaultColumns: readonly string[], defaultVersion: string, rows: readonly Row[], opts: WorkbookOptions): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  const about = wb.addWorksheet('About');
  about.addRow(['Template', opts.templateName ?? sheetName]);
  about.addRow(['TemplateVersion', opts.version ?? defaultVersion]);
  const columns = opts.columns ?? defaultColumns;
  const sheet = wb.addWorksheet(sheetName);
  sheet.addRow([...columns]);
  for (const r of rows) {
    const row = sheet.addRow(columns.map(() => null));
    columns.forEach((c, i) => {
      const v = r[c];
      if (v === undefined || v === null) return;
      row.getCell(i + 1).value = typeof v === 'object' ? ({ formula: v.formula, ...(v.result !== undefined ? { result: v.result } : {}) } as ExcelJS.CellFormulaValue) : v;
    });
  }
  if (!opts.noMeta) {
    const meta = wb.addWorksheet('_meta', { state: 'hidden' });
    meta.addRow(['TemplateName', opts.templateName ?? sheetName]);
    meta.addRow(['TemplateVersion', opts.version ?? defaultVersion]);
  }
  return Buffer.from(await wb.xlsx.writeBuffer());
}

export const studentsWorkbook = (rows: readonly Row[], opts: WorkbookOptions = {}) => build('Students', STUDENT_COLUMNS, '1', rows, opts);
export const dailyRecordsWorkbook = (rows: readonly Row[], opts: WorkbookOptions = {}) => build('DailyRecords', DAILY_RECORD_COLUMNS, '2', rows, opts);

const pad = (n: number, w = 3) => String(n).padStart(w, '0');

/** `count` synthetic students EXT-I-001… "Imported Student 001" in class `className`. */
export const syntheticStudents = (count: number, className = 'Hifz A1', prefix = 'EXT-I-'): Row[] =>
  Array.from({ length: count }, (_, i) => ({ ExternalStudentID: `${prefix}${pad(i + 1, count > 999 ? 4 : 3)}`, StudentName: `Imported Student ${pad(i + 1, count > 999 ? 4 : 3)}`, ClassName: className, AdmissionDate: '2026-09-01', Status: 'ACTIVE' }));

/** students-mixed.xlsx (sheet rows 2–8): new, exact match, name-only match of S1, bad date, bad status, a repeated key. */
export const MIXED_STUDENTS: Row[] = [
  { ExternalStudentID: 'EXT-M-001', StudentName: 'Mixed New Student', ClassName: 'Hifz A1' },
  { ExternalStudentID: 'EXT-A-001', StudentName: 'Test Student One', ClassName: 'Hifz A1' },
  { ExternalStudentID: null, StudentName: 'Test Student One', ClassName: 'Hifz A1' },
  { ExternalStudentID: 'EXT-M-004', StudentName: 'Mixed Bad Date', ClassName: 'Hifz A1', AdmissionDate: '30/10/2026' },
  { ExternalStudentID: 'EXT-M-005', StudentName: 'Mixed Bad Status', ClassName: 'Hifz A1', Status: 'GRADUATED' },
  { ExternalStudentID: 'EXT-M-DUP', StudentName: 'Mixed Duplicate One', ClassName: 'Hifz A1' },
  { ExternalStudentID: 'EXT-M-DUP', StudentName: 'Mixed Duplicate Two', ClassName: 'Hifz A1' },
];

/** The staff-private TeacherNotes marker in daily-records-s1.xlsx (synthetic). */
export const PRIVATE_NOTE_MARKER = 'Synthetic F14 private note marker';

/** A Sabqi row for S1 on `date`, Para 3, 1/2 Para assigned and completed, quality 2. */
export const sabqiRow = (ext: string | null, date: string, position: number, over: Row = {}): Row => ({
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

/**
 * The workbooks the F14 Maestro flows pick on the device (e2e/mobile/f14-excel; pushed by e2e/scripts/push-workbooks.mjs).
 * `recordDate` is the day the IMPORT seed scenario marks S1, S2, and S3 Present (last week's Monday, Asia/Karachi).
 */
export async function mobileWorkbooks(recordDate: string): Promise<Record<string, Buffer>> {
  const sabaq: Row = { ExternalRecordID: 'D-1', ExternalStudentID: 'EXT-A-001', RecordDate: recordDate, SectionType: 'SABAQ', PortionNumber: 1, SurahStart: 2, AyahStart: 1, AyahEnd: 10, TotalLines: 10, AssignedQuantity: 10, CompletedQuantity: 10, QuantityUnit: 'LINES', PerformanceStatus: 'COMPLETED', QualityRating: 1 };
  return {
    'students-50.xlsx': await studentsWorkbook(syntheticStudents(50)),
    'students-1001.xlsx': await studentsWorkbook(syntheticStudents(1001)),
    'students-missing-name.xlsx': await studentsWorkbook(syntheticStudents(2), { columns: ['ExternalStudentID', 'ClassName'] }),
    'students-mixed.xlsx': await studentsWorkbook(MIXED_STUDENTS),
    'students-renamed.xlsx': await studentsWorkbook([{ ExternalStudentID: 'EXT-A-001', StudentName: 'Test Student One Renamed', ClassName: 'Hifz A1' }]),
    'students-two-classes.xlsx': await studentsWorkbook([...syntheticStudents(4, 'Hifz A1', 'EXT-TA-'), ...syntheticStudents(2, 'Hifz A2', 'EXT-TB-').map((r, i) => ({ ...r, StudentName: `Other Class Student ${i + 1}` }))]),
    // Sheet rows 2–7 are S1's six portions (Sabaq, three Sabqi, two Manzil), row 8 S2's, row 9 S3's (Hifz A2), and
    // row 10 a Madrasa B student (invalid here).
    'daily-records-s1.xlsx': await dailyRecordsWorkbook([
      sabaq,
      sabqiRow('D-2', recordDate, 1, { MistakeCount: 3 }),
      sabqiRow('D-3', recordDate, 2, { QualityRating: null }),
      sabqiRow('D-4', recordDate, 3, { TeacherNotes: PRIVATE_NOTE_MARKER }),
      sabqiRow('D-5', recordDate, 1, { SectionType: 'MANZIL', ParaNumber: 10 }),
      sabqiRow('D-6', recordDate, 2, { SectionType: 'MANZIL', ParaNumber: 11 }),
      sabqiRow('D-7', recordDate, 1, { ExternalStudentID: 'EXT-A-002' }),
      sabqiRow('D-8', recordDate, 1, { ExternalStudentID: 'EXT-A-003' }),
      sabqiRow('D-9', recordDate, 1, { ExternalStudentID: 'EXT-B-001' }),
    ]),
  };
}

/** Reads a sheet back as rows of raw cell values (for export checks). */
export async function readSheet(bytes: Buffer | ArrayBuffer, name: string): Promise<{ header: string[]; rows: ExcelJS.CellValue[][]; types: number[][] }> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(bytes as ArrayBuffer);
  const sheet = wb.getWorksheet(name);
  if (!sheet) throw new Error(`no sheet ${name}`);
  const header = (sheet.getRow(1).values as ExcelJS.CellValue[]).slice(1).map((v) => String(v));
  const rows: ExcelJS.CellValue[][] = [];
  const types: number[][] = [];
  sheet.eachRow((row, n) => {
    if (n === 1) return;
    rows.push(header.map((_h, i) => row.getCell(i + 1).value));
    types.push(header.map((_h, i) => row.getCell(i + 1).type));
  });
  return { header, rows, types };
}

/** `_meta` (or About) key → value. */
export async function readKeyValues(bytes: Buffer | ArrayBuffer, name: '_meta' | 'About'): Promise<Record<string, string>> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(bytes as ArrayBuffer);
  const out: Record<string, string> = {};
  wb.getWorksheet(name)?.eachRow((row) => {
    out[String(row.getCell(1).value ?? '')] = String(row.getCell(2).value ?? '');
  });
  return out;
}
