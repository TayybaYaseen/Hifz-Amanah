// F14 · Excel import and export contracts (US-058…061; FR-XLS-001…018, NFR-XLS-001…004; SRS §15.1–15.2; DEC-B15,
// DEC-B43, DEC-B44). ARCHITECTURE.md §11. Plan: docs/handover/F14-plan.md.
//
// - Templates are the SRS §15.1 `Students` and `DailyRecords` sheets. Each workbook carries a hidden `_meta` sheet with
//   `TemplateName` and `TemplateVersion` (FR-XLS-018). DailyRecords is version 2: `TotalLines` after `AyahEnd` was added
//   on 2026-11-01, and version 1 workbooks are rejected (SRS §15.1).
// - At most 1,000 data rows per file (FR-XLS-017); commits run in batches of 200 rows (FR-XLS-018).
// - Every preview row is NEW, EXACT_MATCH, SUSPECTED_DUPLICATE, INVALID, or PROPOSED_UPDATE (FR-XLS-011). The default
//   mode is ADD_ONLY; UPDATE is an explicit choice that shows field-level before/after values (FR-XLS-012).
// - Stored values are canonical (`NOT_REMEMBERED`, `LINES`); messages are localized by the server in the caller's
//   language (NFR-XLS-003), and every issue also carries its code so the app can localize it again.
import { z } from 'zod';
import { REPORT_PERIOD_KINDS } from './reports.ts';

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const uuid = z.uuid();
const locale = z.enum(['en', 'ur', 'ur-Latn']);

export const IMPORT_TEMPLATES = ['Students', 'DailyRecords'] as const;
export type ImportTemplate = (typeof IMPORT_TEMPLATES)[number];

/** The current version of each template. An older or unknown version is rejected (FR-XLS-018). */
export const TEMPLATE_VERSIONS: Readonly<Record<ImportTemplate, string>> = { Students: '1', DailyRecords: '2' };

/** The `Students` sheet columns, in order (SRS §15.1). */
export const STUDENT_COLUMNS = ['ExternalStudentID', 'StudentName', 'ClassName', 'AdmissionDate', 'Status', 'Notes'] as const;
export type StudentColumn = (typeof STUDENT_COLUMNS)[number];

/** The `DailyRecords` sheet columns, in order (SRS §15.1; `TotalLines` follows `AyahEnd` since version 2). */
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
export type DailyRecordColumn = (typeof DAILY_RECORD_COLUMNS)[number];

/** Columns a workbook must have (a missing one rejects the file, F14-AC3). The rest may be absent or empty. */
export const REQUIRED_COLUMNS: Readonly<Record<ImportTemplate, readonly string[]>> = {
  Students: ['ExternalStudentID', 'StudentName'],
  DailyRecords: ['ExternalStudentID', 'RecordDate', 'SectionType', 'PortionNumber', 'AssignedQuantity', 'QuantityUnit', 'PerformanceStatus'],
};

/**
 * Template quantity units (SRS §15.1). RUBU, HALF, SALASAH, COMPLETE are the Para presets (1/4, 1/2, 3/4, 1 Para): a
 * quantity in one of them counts that unit (`AssignedQuantity` 2 in RUBU = 2/4 Para), and the Para amount must be whole
 * quarters. LINES, AYAT, and PAGES are whole numbers. Nothing is converted between units (FR-QTY-003).
 */
export const TEMPLATE_UNITS = ['RUBU', 'HALF', 'SALASAH', 'COMPLETE', 'LINES', 'AYAT', 'PAGES'] as const;
export type TemplateUnit = (typeof TEMPLATE_UNITS)[number];

export const IMPORT_ROW_LIMIT = 1000;
export const IMPORT_BATCH_SIZE = 200;
/** The largest upload accepted (bytes). A 1,000-row workbook is far smaller. */
export const IMPORT_FILE_MAX_BYTES = 5 * 1024 * 1024;
/** Uploaded workbook values are kept 7 days (NFR-PRV-005, DEC-B44); the job's results are kept. */
export const IMPORT_VALUES_RETENTION_DAYS = 7;
export const XLSX_CONTENT_TYPE = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

export const IMPORT_MODES = ['ADD_ONLY', 'UPDATE'] as const;
export type ImportMode = (typeof IMPORT_MODES)[number];

export const IMPORT_CLASSIFICATIONS = ['NEW', 'EXACT_MATCH', 'SUSPECTED_DUPLICATE', 'INVALID', 'PROPOSED_UPDATE'] as const;
export type ImportClassification = (typeof IMPORT_CLASSIFICATIONS)[number];

export const IMPORT_JOB_STATUSES = ['PREVIEWED', 'COMMITTING', 'COMMITTED', 'PARTIALLY_FAILED', 'EXPIRED'] as const;
export type ImportJobStatus = (typeof IMPORT_JOB_STATUSES)[number];

export const IMPORT_ROW_RESULTS = ['COMMITTED', 'FAILED', 'SKIPPED'] as const;
export type ImportRowResult = (typeof IMPORT_ROW_RESULTS)[number];

/** Why a whole workbook is refused before any row is processed (error code WORKBOOK_REJECTED, `fields.reason`). */
export const WORKBOOK_REJECTIONS = [
  'NOT_XLSX',
  'FILE_TOO_LARGE',
  'NO_META',
  'UNKNOWN_TEMPLATE',
  'WRONG_TEMPLATE',
  'WRONG_VERSION',
  'NO_SHEET',
  'MISSING_COLUMN',
  'NO_ROWS',
  'TOO_MANY_ROWS',
] as const;
export type WorkbookRejection = (typeof WORKBOOK_REJECTIONS)[number];

/** Row- and field-level issue codes (FR-XLS-004, FR-XLS-010, AC-XLS-02, AC-XLS-07). */
export const IMPORT_ISSUE_CODES = [
  'REQUIRED',
  'NOT_ALLOWED',
  'NOT_PARA_QUARTERS',
  'UNKNOWN_COLUMN',
  'INVALID_DATE',
  'FUTURE_DATE',
  'INVALID_NUMBER',
  'NOT_WHOLE',
  'OUT_OF_RANGE',
  'INVALID_ENUM',
  'TOO_LONG',
  'FORMULA_NO_VALUE',
  'DUPLICATE_KEY',
  'NAME_MATCH',
  'COMPOSITE_MATCH',
  'EXISTS_DIFFERENT',
  'STUDENT_NOT_FOUND',
  'CLASS_NOT_FOUND',
  'CLASS_INACTIVE',
  'CLASS_REQUIRED',
  'NOT_YOUR_CLASS',
  'STATUS_CHANGE_NOT_ALLOWED',
  'CLASS_NOT_CHANGED',
  'SESSION_LABEL_REQUIRED',
  'SESSION_LABEL_NOT_ALLOWED',
  'SABAQ_USES_LINES',
  'UNIT_NOT_ALLOWED',
  'SABAQ_SURAH_END',
  'PARA_MISMATCH',
  'ABOVE_TOTAL',
  'ABOVE_ASSIGNED',
  'QUALITY_NOT_ALLOWED',
  'ATTENDANCE_REQUIRED',
  'NOT_ENROLLED',
  'NOT_A_CLASS_DAY',
  'DUPLICATE_RECORD',
  'METADATA_UNAVAILABLE',
  'RANGE_INVALID',
  'PORTION_CHANGE_NOT_ALLOWED',
  'NO_ATTEMPT',
  'CONFLICT_OPEN',
  'BATCH_FAILED',
  'INVALID',
] as const;
export type ImportIssueCode = (typeof IMPORT_ISSUE_CODES)[number];

/** One problem on a row; `column` is the template column (null for the row as a whole). */
export interface ImportRowIssue {
  column: string | null;
  code: ImportIssueCode;
  /** ERROR makes the row INVALID (or explains a SUSPECTED_DUPLICATE); WARNING is information only. */
  severity: 'ERROR' | 'WARNING';
  /** Localized (NFR-XLS-003). Never contains another madrasa's data. */
  message: string;
  params?: Record<string, string | number>;
}

/** A proposed field change: before (stored) and after (workbook), as text (F14-AC14). */
export interface ImportFieldChange {
  column: string;
  before: string | null;
  after: string | null;
}

export interface ImportRowView {
  rowNo: number;
  classification: ImportClassification;
  issues: ImportRowIssue[];
  changes: ImportFieldChange[];
  /** Commit batch (1…), once confirmed. */
  batchNo: number | null;
  result: ImportRowResult | null;
  resultIssues: ImportRowIssue[];
}

export type ImportCounts = Record<ImportClassification, number>;
export type ImportResultCounts = Record<ImportRowResult, number>;

export interface ImportJobView {
  id: string;
  template: ImportTemplate;
  templateVersion: string;
  mode: ImportMode;
  status: ImportJobStatus;
  rowCount: number;
  counts: ImportCounts;
  resultCounts: ImportResultCounts | null;
  batchCount: number;
  createdAt: string;
  finishedAt: string | null;
  /** Workbook columns that are not in the template (e.g. an organization column): ignored, never read (F14-AC8). */
  ignoredColumns: string[];
  /** True once the uploaded values were purged (7 days, NFR-PRV-005): the job can no longer be confirmed. */
  valuesPurged: boolean;
}

export interface ImportRowsResponse {
  items: ImportRowView[];
  total: number;
}

// ---------- Requests ----------

/** POST /imports?template=…&locale=… with the `.xlsx` bytes as the body. */
export const UploadImportQuery = z.strictObject({ template: z.enum(IMPORT_TEMPLATES), locale: locale.optional() });
export type UploadImportQuery = z.infer<typeof UploadImportQuery>;

/** PUT /imports/:id/mode — re-runs the preview in the chosen mode; nothing is written to records (F14-AC14). */
export const SetImportModeRequest = z.strictObject({ mode: z.enum(IMPORT_MODES) });
export type SetImportModeRequest = z.infer<typeof SetImportModeRequest>;

/** POST /imports/:id/confirm — commits the previewed rows; a retry commits only rows not yet committed (F14-AC15). */
export const ConfirmImportRequest = z.strictObject({ mode: z.enum(IMPORT_MODES) });
export type ConfirmImportRequest = z.infer<typeof ConfirmImportRequest>;

export const ImportRowsQuery = z.strictObject({
  classification: z.enum(IMPORT_CLASSIFICATIONS).optional(),
  result: z.enum(IMPORT_ROW_RESULTS).optional(),
  offset: z.coerce.number().int().min(0).default(0),
  limit: z.coerce.number().int().min(1).max(IMPORT_ROW_LIMIT).default(100),
  locale: locale.optional(),
});
export type ImportRowsQuery = z.infer<typeof ImportRowsQuery>;

export const ImportJobQuery = z.strictObject({ locale: locale.optional() });

// ---------- Exports (US-061) ----------

/** Who will read the file: staff (private notes only when `includeNotes`), or a student/guardian (never, F14-AC17). */
export const EXPORT_AUDIENCES = ['STAFF', 'FAMILY'] as const;
export type ExportAudience = (typeof EXPORT_AUDIENCES)[number];

/** GET /exports/students — the Students template; same scope as the student list (FR-XLS-007). */
export const StudentsExportQuery = z.strictObject({
  classId: uuid.optional(),
  status: z.enum(['ACTIVE', 'INACTIVE', 'ALL']).default('ACTIVE'),
  includeNotes: z.stringbool().default(false),
  locale: locale.optional(),
});
export type StudentsExportQuery = z.infer<typeof StudentsExportQuery>;

/** GET /exports/daily-records — the DailyRecords template, one row per portion (its latest attempt). */
export const DailyRecordsExportQuery = z.strictObject({
  from: isoDate,
  to: isoDate,
  classId: uuid.optional(),
  studentId: uuid.optional(),
  audience: z.enum(EXPORT_AUDIENCES).default('STAFF'),
  includeNotes: z.stringbool().default(false),
  locale: locale.optional(),
});
export type DailyRecordsExportQuery = z.infer<typeof DailyRecordsExportQuery>;

/** GET /exports/report — a class's weekly or monthly report data with its period, timezone, filters, and flags. */
export const ReportExportQuery = z.strictObject({
  classId: uuid,
  kind: z.enum(REPORT_PERIOD_KINDS),
  date: isoDate.optional(),
  locale: locale.optional(),
});
export type ReportExportQuery = z.infer<typeof ReportExportQuery>;

/** Exports also hold at most 1,000 students or records per file (FR-XLS-017). */
export const EXPORT_ROW_LIMIT = 1000;
