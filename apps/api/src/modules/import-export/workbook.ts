// Workbook reading and writing (F14; FR-XLS-009, FR-XLS-010, FR-XLS-017, FR-XLS-018, NFR-XLS-001, NFR-XLS-004;
// ARCHITECTURE.md §11). exceljs on the server (approved).
//
// Reading treats the workbook as DATA ONLY: exceljs never evaluates formulas and ignores macros. A formula cell is
// read as its cached (saved) result; a formula with no saved result is an invalid cell (F14 edge case). Checks run
// in order, before any row is classified: file type and size, the hidden `_meta` sheet (TemplateName,
// TemplateVersion), the data sheet, the required columns, then the row count (at most 1,000 data rows, FR-XLS-017).
// Columns that are not in the template (an `organization_id`, a madrasa name) are listed and never read (FR-XLS-015).
//
// Writing produces the same layout the reader accepts: an "About" first sheet that notes the template name and
// version (FR-XLS-018), the data sheet, and a hidden `_meta` sheet. Every text cell that starts with = + - @ tab or CR
// is prefixed with ' so a spreadsheet never runs it as a formula (FR-XLS-009); identifiers, dates, units, canonical
// statuses, and Arabic text are otherwise written unchanged (NFR-XLS-004).
import ExcelJS from 'exceljs';
import {
  DAILY_RECORD_COLUMNS,
  IMPORT_FILE_MAX_BYTES,
  IMPORT_ROW_LIMIT,
  IMPORT_TEMPLATES,
  REQUIRED_COLUMNS,
  STUDENT_COLUMNS,
  TEMPLATE_VERSIONS,
  type ImportTemplate,
  type WorkbookRejection,
} from '@hifz/contracts';

export const META_SHEET = '_meta';
export const ABOUT_SHEET = 'About';

export const TEMPLATE_COLUMNS: Readonly<Record<ImportTemplate, readonly string[]>> = { Students: STUDENT_COLUMNS, DailyRecords: DAILY_RECORD_COLUMNS };

/** A whole-workbook refusal, before any row is processed. `params` fill the localized message. */
export class WorkbookError extends Error {
  readonly reason: WorkbookRejection;
  readonly params: Record<string, string | number>;
  constructor(reason: WorkbookRejection, params: Record<string, string | number> = {}) {
    super(reason);
    this.reason = reason;
    this.params = params;
  }
}

export type CellIssue = 'FORMULA_NO_VALUE' | 'INVALID';

export interface ParsedRow {
  /** The spreadsheet row number (the header is row 1). */
  rowNo: number;
  /** Template column → text, or null when empty. */
  cells: Record<string, string | null>;
  /** Template column → why the cell could not be read. */
  cellIssues: Record<string, CellIssue>;
}

export interface ParsedWorkbook {
  template: ImportTemplate;
  version: string;
  rows: ParsedRow[];
  /** Header names outside the template, as written (ignored). */
  ignoredColumns: string[];
}

/** An exported text cell that starts with ' and then = + - @ tab or CR is read back without the escape. */
const ESCAPED = /^'[=+\-@\t\r]/;

/** FR-XLS-009: a text value a spreadsheet could read as a formula is prefixed with '. */
export function escapeCell(value: string | number | null): string | number | null {
  if (typeof value !== 'string') return value;
  return /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
}

/** The ' escape removed again on import, so an exported file round-trips unchanged. */
export const unescapeCell = (text: string): string => (ESCAPED.test(text) ? text.slice(1) : text);

const pad = (n: number, w = 2) => String(n).padStart(w, '0');

/** A date cell as YYYY-MM-DD (exceljs gives dates in UTC). */
const isoDateOf = (d: Date): string => `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;

type Read = { text: string | null } | { issue: CellIssue };

/** One cell as data. Formulas: their saved result only (never evaluated). */
export function readCell(value: ExcelJS.CellValue): Read {
  if (value === null || value === undefined) return { text: null };
  if (typeof value === 'string') return textOf(value);
  if (typeof value === 'number') return Number.isFinite(value) ? { text: String(value) } : { issue: 'INVALID' };
  if (typeof value === 'boolean') return { text: value ? 'TRUE' : 'FALSE' };
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? { issue: 'INVALID' } : { text: isoDateOf(value) };
  if (typeof value === 'object') {
    if ('formula' in value || 'sharedFormula' in value) {
      const result = (value as { result?: unknown }).result;
      if (result === undefined || result === null || (typeof result === 'object' && !(result instanceof Date) && 'error' in result)) return { issue: 'FORMULA_NO_VALUE' };
      return readCell(result as ExcelJS.CellValue);
    }
    if ('richText' in value) return textOf(value.richText.map((r) => r.text).join(''));
    if ('text' in value && typeof (value as { text: unknown }).text === 'string') return textOf((value as { text: string }).text);
    if ('error' in value) return { issue: 'INVALID' };
  }
  return { issue: 'INVALID' };
}

function textOf(raw: string): Read {
  // Outer whitespace only; inner text (Arabic, diacritics) is kept exactly, never normalized.
  const trimmed = unescapeCell(raw.trim()).trim();
  return { text: trimmed === '' ? null : trimmed };
}

const metaValue = (sheet: ExcelJS.Worksheet, key: string): string | null => {
  let out: string | null = null;
  sheet.eachRow((row) => {
    const k = readCell(row.getCell(1).value);
    if (out === null && 'text' in k && k.text === key) {
      const v = readCell(row.getCell(2).value);
      out = 'text' in v ? v.text : null;
    }
  });
  return out;
};

/**
 * Reads an uploaded workbook for the template the user chose. Throws WorkbookError for a refusal (F14-AC2, AC3,
 * AC22). Rows that are entirely empty are skipped.
 */
export async function readWorkbook(bytes: Buffer, expected: ImportTemplate): Promise<ParsedWorkbook> {
  const want = { template: expected, version: TEMPLATE_VERSIONS[expected] };
  if (bytes.length > IMPORT_FILE_MAX_BYTES) throw new WorkbookError('FILE_TOO_LARGE', { max: IMPORT_FILE_MAX_BYTES / (1024 * 1024) });
  // An .xlsx is a ZIP container ("PK\x03\x04"); .xls (OLE), .csv, and anything else are refused.
  if (bytes.length < 4 || bytes[0] !== 0x50 || bytes[1] !== 0x4b || bytes[2] !== 0x03 || bytes[3] !== 0x04) throw new WorkbookError('NOT_XLSX', want);
  const wb = new ExcelJS.Workbook();
  try {
    await wb.xlsx.load(bytes as unknown as ArrayBuffer);
  } catch {
    throw new WorkbookError('NOT_XLSX', want);
  }
  const meta = wb.getWorksheet(META_SHEET);
  if (!meta) throw new WorkbookError('NO_META', want);
  const name = metaValue(meta, 'TemplateName');
  const version = metaValue(meta, 'TemplateVersion');
  if (name === null || !(IMPORT_TEMPLATES as readonly string[]).includes(name)) throw new WorkbookError('UNKNOWN_TEMPLATE', want);
  if (name !== expected) throw new WorkbookError('WRONG_TEMPLATE', { ...want, found: name });
  if (version !== want.version) throw new WorkbookError('WRONG_VERSION', { ...want, found: version ?? '—' });

  const sheet = wb.getWorksheet(expected);
  if (!sheet) throw new WorkbookError('NO_SHEET', want);
  const known = TEMPLATE_COLUMNS[expected];
  const byLower = new Map(known.map((c) => [c.toLowerCase(), c]));
  const columnAt = new Map<number, string>();
  const ignoredColumns: string[] = [];
  sheet.getRow(1).eachCell({ includeEmpty: false }, (cell, col) => {
    const read = readCell(cell.value);
    const header = 'text' in read ? read.text : null;
    if (header === null) return;
    const canonical = byLower.get(header.toLowerCase());
    if (canonical && ![...columnAt.values()].includes(canonical)) columnAt.set(col, canonical);
    else ignoredColumns.push(header);
  });
  const present = new Set(columnAt.values());
  const missing = REQUIRED_COLUMNS[expected].find((c) => !present.has(c));
  if (missing) throw new WorkbookError('MISSING_COLUMN', { ...want, column: missing });

  // The row limit is checked on the sheet's extent first, so an oversized file is refused before any cell is read.
  if (sheet.actualRowCount - 1 > IMPORT_ROW_LIMIT) {
    let nonEmpty = 0;
    sheet.eachRow({ includeEmpty: false }, (_row, n) => {
      if (n > 1) nonEmpty += 1;
    });
    if (nonEmpty > IMPORT_ROW_LIMIT) throw new WorkbookError('TOO_MANY_ROWS', { max: IMPORT_ROW_LIMIT });
  }

  const rows: ParsedRow[] = [];
  sheet.eachRow({ includeEmpty: false }, (row, rowNo) => {
    if (rowNo === 1) return;
    const cells: Record<string, string | null> = Object.fromEntries(known.map((c) => [c, null]));
    const cellIssues: Record<string, CellIssue> = {};
    let any = false;
    for (const [col, column] of columnAt) {
      const read = readCell(row.getCell(col).value);
      if ('issue' in read) {
        cellIssues[column] = read.issue;
        any = true;
      } else if (read.text !== null) {
        cells[column] = read.text;
        any = true;
      }
    }
    if (any) rows.push({ rowNo, cells, cellIssues });
  });
  if (rows.length === 0) throw new WorkbookError('NO_ROWS', want);
  if (rows.length > IMPORT_ROW_LIMIT) throw new WorkbookError('TOO_MANY_ROWS', { max: IMPORT_ROW_LIMIT });
  return { template: expected, version: want.version, rows, ignoredColumns };
}

// ---------- Writing ----------

export interface SheetSpec {
  name: string;
  header: readonly string[];
  rows: readonly (readonly (string | number | null)[])[];
  rightToLeft?: boolean;
}

export interface WorkbookSpec {
  /** Template name and version for `_meta` (FR-XLS-018); a report export names itself. */
  templateName: string;
  templateVersion: string;
  /** "About" sheet lines, label then value (first sheet: the template and version are noted there). */
  about: readonly (readonly [string, string])[];
  sheets: readonly SheetSpec[];
  /** Extra `_meta` keys (period, timezone, filters, generated time, pending flag). */
  meta?: readonly (readonly [string, string])[];
  createdAt: Date;
}

export async function writeWorkbook(spec: WorkbookSpec): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.created = spec.createdAt;
  const about = wb.addWorksheet(ABOUT_SHEET);
  for (const [k, v] of spec.about) about.addRow([escapeCell(k), escapeCell(v)]);
  about.getColumn(1).width = 28;
  about.getColumn(2).width = 80;
  for (const s of spec.sheets) {
    const sheet = wb.addWorksheet(s.name, { views: [{ rightToLeft: s.rightToLeft ?? false, state: 'frozen', ySplit: 1 }] });
    sheet.addRow(s.header.map(escapeCell)).font = { bold: true };
    for (const r of s.rows) sheet.addRow(r.map(escapeCell));
    s.header.forEach((_h, i) => (sheet.getColumn(i + 1).width = 18));
  }
  const meta = wb.addWorksheet(META_SHEET, { state: 'hidden' });
  for (const [k, v] of [['TemplateName', spec.templateName], ['TemplateVersion', spec.templateVersion], ...(spec.meta ?? [])] as const) meta.addRow([k, escapeCell(v)]);
  return Buffer.from(await wb.xlsx.writeBuffer());
}
