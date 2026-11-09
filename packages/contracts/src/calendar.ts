// Calendar and attendance contracts shared by the API and the app (F04; FR-CAL-001…010, FR-DAY-002A, FR-DAY-007,
// FR-DAY-010, FR-ATT-002, NFR-UX-004; plan docs/handover/F04-plan.md). Organization, role, and scope always come
// from the signed-in membership: every request schema is strict.
//
// Attendance writes travel only through the sync outbox (`attendance_record` CREATE/UPDATE, POST /sync/push), so
// a Bulk Entry save offline and online is the same operation (F04-AC10, AC12). Leave decisions, schedules, and
// holidays are online Owner/Admin requests (ARCHITECTURE.md §8.3).
import { z } from 'zod';

export const ATTENDANCE_STATUSES = ['PRESENT', 'LATE', 'HALF_DAY', 'LEAVE', 'ABSENT'] as const;
export type AttendanceStatus = (typeof ATTENDANCE_STATUSES)[number];

export const LEAVE_STATUSES = ['NONE', 'REQUESTED', 'APPROVED', 'REJECTED'] as const;
export type LeaveStatus = (typeof LEAVE_STATUSES)[number];

export const EXCEPTION_KINDS = ['HOLIDAY', 'CLOSURE', 'NO_CLASS'] as const;
export type ExceptionKind = (typeof EXCEPTION_KINDS)[number];

export const DAY_KINDS = ['SCHEDULED', 'UNSCHEDULED', 'HOLIDAY', 'CLOSURE', 'NO_CLASS'] as const;
export type DayKind = (typeof DAY_KINDS)[number];

export const DAY_CATEGORIES = [
  'HOLIDAY',
  'CLOSURE',
  'NO_CLASS',
  'UNSCHEDULED',
  'NOT_ENROLLED',
  'FUTURE',
  'NOT_MARKED',
  'PRESENT',
  'LATE',
  'HALF_DAY',
  'LEAVE',
  'LEAVE_AWAITING',
  'ABSENT',
  'LEAVE_REJECTED',
] as const;
export type DayCategory = (typeof DAY_CATEGORIES)[number];

/** The Leave reason and the Absent-after-reciting note (both internal staff text). */
export const ATTENDANCE_TEXT_MAX = 500;
export const EXCEPTION_LABEL_MAX = 100;
/** The longest period one summary request may cover. */
export const SUMMARY_MAX_DAYS = 62;
export const LEAVE_PAGE_SIZE = 25;

/** Field issue codes F04 returns in `error.fields` and in rejected sync results (clients localize them). */
export const CALENDAR_FIELD_ISSUES = {
  REQUIRED: 'REQUIRED',
  TOO_LONG: 'TOO_LONG',
  INVALID: 'INVALID',
  /** reportDate is after today in the madrasa's timezone (FR-DAY-001). */
  FUTURE: 'FUTURE',
  /** reportDate is not a working day for the class (FR-CAL-009). */
  HOLIDAY: 'HOLIDAY',
  CLOSURE: 'CLOSURE',
  NO_CLASS: 'NO_CLASS',
  UNSCHEDULED: 'UNSCHEDULED',
  /** The student is not enrolled in that class on that date. */
  NOT_ENROLLED: 'NOT_ENROLLED',
  /** The class is inactive. */
  CLASS_INACTIVE: 'CLASS_INACTIVE',
  /** An exception of this kind already exists for that class (or the madrasa) on that date. */
  TAKEN: 'TAKEN',
} as const;

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const uuid = z.uuid();
const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);
const optionalText = z.string().max(ATTENDANCE_TEXT_MAX * 4).nullable().default(null);

// ---------- Schedules (US-013) ----------

/** Owner/Admin: the class meets on these ISO weekdays (1 = Monday … 7 = Sunday) from `effectiveFrom` (F04-AC2). */
export const SetScheduleRequest = z.strictObject({
  effectiveFrom: isoDate,
  weekdays: z.array(z.number().int().min(1).max(7)).max(7),
  startTime: time.nullable().default(null),
  endTime: time.nullable().default(null),
});
export type SetScheduleRequest = z.infer<typeof SetScheduleRequest>;

export interface ScheduleVersionView {
  effectiveFrom: string;
  /** The day before the next version starts, or null while it is the latest. */
  effectiveTo: string | null;
  weekdays: number[];
  startTime: string | null;
  endTime: string | null;
}

export interface ClassScheduleResponse {
  classId: string;
  /** The version in force today, or null when the class has no schedule yet. */
  current: ScheduleVersionView | null;
  /** Every version, oldest first. */
  versions: ScheduleVersionView[];
}

// ---------- Holidays, closures, no-class days (US-014) ----------

/**
 * Owner/Admin. `classId` null = the whole madrasa. When attendance or daily records already exist on the date the
 * request is refused with 409 RECORDS_EXIST (and `fields.records` = the count) unless `confirm` is true (F04-AC20).
 */
export const CreateExceptionRequest = z.strictObject({
  classId: uuid.nullable().default(null),
  date: isoDate,
  kind: z.enum(EXCEPTION_KINDS),
  label: z.string().max(EXCEPTION_LABEL_MAX),
  confirm: z.boolean().default(false),
});
export type CreateExceptionRequest = z.infer<typeof CreateExceptionRequest>;

export const ListExceptionsQuery = z.strictObject({ from: isoDate, to: isoDate });
export type ListExceptionsQuery = z.infer<typeof ListExceptionsQuery>;

export const ExceptionImpactQuery = z.strictObject({ date: isoDate, classId: uuid.optional() });
export type ExceptionImpactQuery = z.infer<typeof ExceptionImpactQuery>;

export interface ExceptionImpact {
  /** Attendance records on that date (in that class, or anywhere in the madrasa). */
  attendanceRecords: number;
  /** Daily Hifz records on that date (F05; 0 until daily records exist). */
  dailyRecords: number;
}

export interface CalendarExceptionView {
  id: string;
  classId: string | null;
  className: string | null;
  date: string;
  kind: ExceptionKind;
  label: string;
  createdAt: string;
}

export interface ExceptionListResponse {
  items: CalendarExceptionView[];
}

// ---------- Attendance records ----------

/** One attendance record as staff see it. Leave reason and absence note are internal (FR-CAL-008, FR-DAY-010). */
export interface AttendanceRecordView {
  id: string;
  studentId: string;
  classId: string;
  reportDate: string;
  status: AttendanceStatus;
  leaveStatus: LeaveStatus;
  leaveReason: string | null;
  absentNote: string | null;
  rowVersion: number;
}

/** Sync `fields` of an `attendance_record` CREATE. Leave status and recorder are set by the server. */
export const AttendanceCreateFields = z.strictObject({
  studentId: uuid,
  classId: uuid,
  reportDate: isoDate,
  status: z.enum(ATTENDANCE_STATUSES),
  leaveReason: optionalText,
  absentNote: optionalText,
});
export type AttendanceCreateFields = z.infer<typeof AttendanceCreateFields>;

/** Sync `fields` of an `attendance_record` UPDATE: the coupled group travels whole (F12 plan Q5). */
export const AttendanceUpdateFields = z.strictObject({
  status: z.enum(ATTENDANCE_STATUSES),
  leaveReason: z.string().max(ATTENDANCE_TEXT_MAX * 4).nullable(),
  absentNote: z.string().max(ATTENDANCE_TEXT_MAX * 4).nullable(),
});
export type AttendanceUpdateFields = z.infer<typeof AttendanceUpdateFields>;

/** Fields an `attendance_record` carries in a sync pull (staff projection). */
export interface AttendanceSyncFields {
  studentId: string;
  classId: string;
  reportDate: string;
  status: AttendanceStatus;
  leaveStatus: LeaveStatus;
  leaveReason: string | null;
  absentNote: string | null;
}

// ---------- Bulk Entry sheet (US-015) ----------

export const AttendanceSheetQuery = z.strictObject({ classId: uuid, date: isoDate });
export type AttendanceSheetQuery = z.infer<typeof AttendanceSheetQuery>;

export interface AttendanceSheetStudent {
  id: string;
  name: string;
  externalStudentId: string | null;
  record: AttendanceRecordView | null;
  /** Recited portions are already saved for the date (F05; FR-DAY-010). Always false until daily records exist. */
  recited: boolean;
}

export interface AttendanceSheetResponse {
  classId: string;
  className: string;
  date: string;
  /** Today in the madrasa's timezone. */
  today: string;
  day: { kind: DayKind; label: string | null };
  /** The students enrolled in the class on that date, by name. */
  students: AttendanceSheetStudent[];
}

// ---------- Leave (US-016, US-017) ----------

export const ListLeaveQuery = z.strictObject({
  status: z.enum(['REQUESTED', 'APPROVED', 'REJECTED']).default('REQUESTED'),
  cursor: z.string().max(200).optional(),
});
export type ListLeaveQuery = z.infer<typeof ListLeaveQuery>;

export interface LeaveItem {
  record: AttendanceRecordView;
  studentName: string;
  className: string;
  requestedBy: { userId: string; displayName: string } | null;
  decidedBy: { userId: string; displayName: string } | null;
  decidedAt: string | null;
}

export interface LeaveListResponse {
  items: LeaveItem[];
  nextCursor: string | null;
}

/** Owner/Admin, online only. `rowVersion` is the version shown, so a decision never applies to a changed record. */
export const LeaveDecisionRequest = z.strictObject({
  decision: z.enum(['APPROVE', 'REJECT']),
  rowVersion: z.number().int().min(1),
});
export type LeaveDecisionRequest = z.infer<typeof LeaveDecisionRequest>;

// ---------- Attendance summary (FR-CAL-005; reused by reports, F09) ----------

export const AttendanceSummaryQuery = z.strictObject({ classId: uuid, from: isoDate, to: isoDate });
export type AttendanceSummaryQuery = z.infer<typeof AttendanceSummaryQuery>;

export interface AttendanceCountsView {
  scheduled: number;
  attended: number;
  present: number;
  late: number;
  halfDay: number;
  leave: number;
  leaveAwaiting: number;
  absent: number;
  notMarked: number;
  holidays: number;
  closures: number;
  noClass: number;
  unscheduled: number;
}

export interface AttendanceSummaryResponse {
  classId: string;
  from: string;
  to: string;
  today: string;
  days: Array<{ date: string; kind: DayKind; label: string | null }>;
  students: Array<{ studentId: string; name: string; days: Record<string, DayCategory>; counts: AttendanceCountsView }>;
}
