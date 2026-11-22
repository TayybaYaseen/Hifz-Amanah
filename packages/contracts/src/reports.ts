// Weekly and monthly report contracts (F09; FR-WKR-001…008, FR-MNR-001…007, FR-RPT-001…009, FR-RPT-011, FR-CAL-005,
// NFR-OFF-008; US-039…043, US-073; plan docs/handover/F09-plan.md).
//
// Reports are read-only and derived: there is no write route and no stored total (FR-RPT-001). These routes are staff
// only (Owner, Admin, assigned Teacher); Students and Parents read published reports through the F10 portal
// (packages/contracts/src/portal.ts, FR-RPT-010). The shapes below mirror @hifz/domain/reports; the API's return types
// keep them in step.
//
// Quantities are exact `{unit, numerator, denominator}` and listed per unit (never summed across units). A missing value
// is null ("Not recorded"), never 0.
import { z } from 'zod';
import type { AttendanceStatus } from './calendar.ts';
import type { MistakeCategory, MistakeSeverity, NoteVisibility, OverallLabel, PortionStatus, QuantityUnit, Section } from './hifz.ts';
import type { HomeworkState, HomeworkStatus } from './homework.ts';

export const REPORT_PERIOD_KINDS = ['WEEK', 'MONTH'] as const;
export type ReportPeriodKind = (typeof REPORT_PERIOD_KINDS)[number];

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const uuid = z.uuid();

// ---------- Queries ----------

/** GET /reports/student?studentId&kind&date: the period holding `date` (default: today in the madrasa's timezone). */
export const StudentReportQuery = z.strictObject({ studentId: uuid, kind: z.enum(REPORT_PERIOD_KINDS), date: isoDate.optional() });
export type StudentReportQuery = z.infer<typeof StudentReportQuery>;

/** GET /reports/class-summary?classId&kind&date (FR-RPT-011; staff only). */
export const ClassSummaryQuery = z.strictObject({ classId: uuid, kind: z.enum(REPORT_PERIOD_KINDS), date: isoDate.optional() });
export type ClassSummaryQuery = z.infer<typeof ClassSummaryQuery>;

/**
 * GET /reports/class-summary/export (F09-AC20): the same summary as a file, `.xlsx` or PDF, in `locale` (default the
 * caller's language). Staff only; audited CLASS_SUMMARY_EXPORTED. The file holds the screen's rows and no notes.
 */
export const CLASS_SUMMARY_EXPORT_FORMATS = ['xlsx', 'pdf'] as const;
export const ClassSummaryExportQuery = z.strictObject({
  classId: uuid,
  kind: z.enum(REPORT_PERIOD_KINDS),
  date: isoDate.optional(),
  format: z.enum(CLASS_SUMMARY_EXPORT_FORMATS),
  locale: z.enum(['en', 'ur', 'ur-Latn']).optional(),
});
export type ClassSummaryExportQuery = z.infer<typeof ClassSummaryExportQuery>;

// ---------- Views ----------

export interface ReportQuantity {
  unit: QuantityUnit;
  numerator: number;
  denominator: number;
}

export interface ReportPeriodView {
  kind: ReportPeriodKind;
  from: string;
  to: string;
  timeZone: string;
  weekStart: string;
  /** `from` 00:00 and `to` 23:59 in `timeZone`, as ISO UTC instants (AC-RPT-07). */
  startsAt: string;
  endsAt: string;
}

export type ReportDayCategory =
  | 'HOLIDAY'
  | 'CLOSURE'
  | 'NO_CLASS'
  | 'UNSCHEDULED'
  | 'NOT_ENROLLED'
  | 'FUTURE'
  | 'NOT_MARKED'
  | AttendanceStatus
  | 'LEAVE_AWAITING'
  | 'LEAVE_REJECTED';

export interface ReportDayView {
  date: string;
  classId: string | null;
  kind: 'SCHEDULED' | 'UNSCHEDULED' | 'HOLIDAY' | 'CLOSURE' | 'NO_CLASS' | 'NOT_ENROLLED';
  category: ReportDayCategory;
  exceptionLabel: string | null;
}

export interface ReportAttendanceCounts {
  scheduled: number;
  /** Present + Late + Half day (FR-CAL-005). */
  attended: number;
  present: number;
  late: number;
  halfDay: number;
  /** Approved Leave. */
  leave: number;
  leaveAwaiting: number;
  /** Absent plus rejected Leave. */
  absent: number;
  notMarked: number;
  holidays: number;
  closures: number;
  noClass: number;
  unscheduled: number;
}

export interface ReportQualityAverage {
  count: number;
  sum: number;
  /** Exact average (lower is better); null = "Not recorded". */
  value: number | null;
  display: string | null;
  nearestScore: number | null;
}

export interface ReportMistakeCounts {
  byCategory: Record<MistakeCategory, number>;
  uncategorized: number;
  major: number;
  minor: number;
  repeated: number;
  total: number;
  recordedAttempts: number;
  noMistakesAttempts: number;
  notRecordedAttempts: number;
}

export interface ReportRangeView {
  surahStart: number;
  ayahStart: number;
  surahEnd: number;
  ayahEnd: number;
}

export interface ReportMistakeView {
  category: MistakeCategory;
  severity: MistakeSeverity;
  repeated: boolean;
  /** Staff view only. A Student/Parent projection keeps a note only when SHARED (F09-AC15). */
  note: string | null;
  noteVisibility: NoteVisibility;
}

export interface ReportUnitTotals {
  assigned: ReportQuantity[];
  completed: ReportQuantity[];
  remaining: ReportQuantity[];
  notRecorded: number;
}

export type ReportStatusCounts = Record<PortionStatus | 'NOT_RECORDED', number>;

export interface ReportPortionLineView {
  portionId: string;
  recordId: string;
  date: string;
  section: Section;
  position: number;
  isExtra: boolean;
  paraNumber: number | null;
  range: ReportRangeView | null;
  totalLines: number | null;
  assigned: ReportQuantity;
  status: PortionStatus | null;
  completed: ReportQuantity | null;
  remaining: ReportQuantity | null;
  quality: number | null;
  mistakeCount: number | null;
  mistakes: ReportMistakeView[];
  /** Staff text (FR-WKR-008); sent to a Student or Parent only when `remarksVisibility` is SHARED (F10). */
  remarks: string | null;
  remarksVisibility: NoteVisibility;
  attempts: { attemptNo: number; attemptedAt: string; status: PortionStatus; completed: ReportQuantity | null; quality: number | null; mistakeCount: number | null }[];
}

export interface ReportDailyRecordView {
  recordId: string;
  date: string;
  classId: string;
  sessionLabel: string | null;
  overallLabel: OverallLabel | null;
  attendance: ReportDayCategory | null;
  portions: ReportPortionLineView[];
  quality: ReportQualityAverage;
}

export interface ReportSectionView {
  section: Section;
  portionCount: number;
  totals: ReportUnitTotals;
  extraTotals: ReportUnitTotals;
  statusCounts: ReportStatusCounts;
  paras: { paraNumber: number | null; portionCount: number; totals: ReportUnitTotals; statusCounts: ReportStatusCounts }[];
  pending: {
    portionId: string;
    date: string;
    paraNumber: number | null;
    range: ReportRangeView | null;
    assigned: ReportQuantity;
    completed: ReportQuantity | null;
    remaining: ReportQuantity | null;
    status: PortionStatus | null;
    carriedInto: { assignmentId: string; status: HomeworkStatus; state: HomeworkState } | null;
  }[];
  quality: ReportQualityAverage;
  mistakes: ReportMistakeCounts;
}

export interface ReportRecurringDifficultyView {
  paraNumber: number | null;
  range: ReportRangeView | null;
  sections: Section[];
  attempts: number;
  majorOrRepeatedAttempts: number;
  notRememberedAttempts: number;
  byCategory: Record<MistakeCategory, number>;
  dates: string[];
}

export interface ReportHomeworkMeasures {
  confirmed: number;
  drafts: number;
  assigned: number;
  attempted: number;
  completed: number;
  carriedForward: number;
  carriedOver: number;
  outstanding: number;
  outstandingItems: { id: string; assignedDate: string; dueDate: string; state: HomeworkState; carriedOverReason: string | null; portionCount: number }[];
}

export interface StudentReportView {
  period: ReportPeriodView;
  today: string;
  student: { id: string; name: string };
  classes: { classId: string; from: string; to: string }[];
  /** false → "No records for this period". */
  hasData: boolean;
  attendance: { counts: ReportAttendanceCounts; days: ReportDayView[] };
  sections: ReportSectionView[];
  days: ReportDailyRecordView[];
  excludedRecords: { recordId: string; date: string; kind: ReportDayView['kind'] }[];
  quality: ReportQualityAverage;
  qualityTrend: { date: string; recordId: string; value: number | null; count: number }[];
  mistakes: ReportMistakeCounts;
  overallLabels: Record<OverallLabel | 'NOT_CHOSEN', number>;
  recurringDifficulties: ReportRecurringDifficultyView[];
  homework: ReportHomeworkMeasures;
  /** Server reports are authoritative (null); a device report is provisional (NFR-OFF-008). */
  provisional: { pendingChanges: number; lastSyncedAt: string | null; offline: boolean } | null;
}

/** GET /reports/student. */
export interface StudentReportResponse {
  report: StudentReportView;
  /** When the server built this report from source (cached or not). */
  generatedAt: string;
}

export interface ClassSummaryRowView {
  studentId: string;
  studentName: string;
  enrolledFrom: string;
  enrolledTo: string;
  hasData: boolean;
  attendance: { scheduled: number; attended: number; present: number; late: number; halfDay: number; leave: number; leaveAwaiting: number; absent: number; notMarked: number };
  completed: Record<Section, ReportQuantity[]>;
  extraCompleted: Record<Section, ReportQuantity[]>;
  quality: ReportQualityAverage;
  outstandingHomework: number;
}

/** GET /reports/class-summary (staff only; never shown to Students or Parents). */
export interface ClassSummaryResponse {
  classId: string;
  className: string;
  period: ReportPeriodView;
  today: string;
  rows: ClassSummaryRowView[];
  generatedAt: string;
}
