// Daily Hifz entry contracts shared by the API and the app (F05; FR-DAY-001…011, FR-SAB-001…004, FR-SAB-008…010,
// FR-SBQ-001…004, FR-MNZ-001…004, FR-QTY-001…010, FR-ATT-001…011; plan docs/handover/F05-plan.md §4).
//
// Writes travel only through the sync outbox (POST /sync/push) as `daily_record`, `lesson_portion`, and
// `portion_attempt` operations; each handler validates `fields` with the strict schemas below, so unknown keys (an
// organization ID, a role, a visibility flag, a row version, a client total) are refused. The server derives the
// Sabaq Para and the line-count edition and never accepts them from the client. Domain rules (ranges, units by
// section, completed ≤ assigned, status defaults) are @hifz/domain/hifz; these schemas check shape only.
//
// Quantities are exact: `{unit, numerator, denominator}` integers, never floats; LINES, AYAT, and PAGES are whole
// numbers (denominator 1).
import { z } from 'zod';
import type { AttendanceStatus } from './calendar.ts';
import { DAILY_REPORT_MODES, type DailyReportMode } from './organization.ts';

// ---------- Enums and limits ----------

export const SECTIONS = ['SABAQ', 'SABQI', 'MANZIL'] as const;
export type Section = (typeof SECTIONS)[number];

export const QUANTITY_UNITS = ['PARA', 'LINES', 'AYAT', 'PAGES'] as const;
export type QuantityUnit = (typeof QUANTITY_UNITS)[number];

export const PORTION_STATUSES = ['COMPLETED', 'PARTIAL', 'NOT_REMEMBERED', 'ABSENT', 'NOT_ASSIGNED', 'PENDING'] as const;
export type PortionStatus = (typeof PORTION_STATUSES)[number];

/** No quality is entered or counted for these (FR-ATT-007). */
export const NO_QUALITY_STATUSES = ['ABSENT', 'NOT_ASSIGNED', 'PENDING'] as const;

export const MISTAKE_CATEGORIES = ['HARKAAT', 'TAJWEED', 'LAFZI', 'AYAT_BHOOLNA', 'TARTEEB', 'WAQF_IBTIDA'] as const;
export type MistakeCategory = (typeof MISTAKE_CATEGORIES)[number];

/** `repeated` is a separate flag, never a severity (FR-ATT-010). */
export const MISTAKE_SEVERITIES = ['MINOR', 'MAJOR'] as const;
export type MistakeSeverity = (typeof MISTAKE_SEVERITIES)[number];

/** A mistake note: INTERNAL (staff only, the default) or SHARED with the Student and Parent (FR-ATT-012, DEC-B28). */
export const NOTE_VISIBILITIES = ['INTERNAL', 'SHARED'] as const;
export type NoteVisibility = (typeof NOTE_VISIBILITIES)[number];

/**
 * The overall performance label, once per daily record and optional (US-032). Not a quality score and never
 * converted to or from one (FR-ATT-009).
 */
export const OVERALL_LABELS = ['EXCELLENT', 'GOOD', 'AVERAGE', 'NEEDS_IMPROVEMENT'] as const;
export type OverallLabel = (typeof OVERALL_LABELS)[number];

/** LAYOUT: counted on the edition's layout. MANUAL: entered or corrected by the Teacher (FR-SAB-008). */
export const TOTAL_LINES_SOURCES = ['LAYOUT', 'MANUAL'] as const;
export type TotalLinesSource = (typeof TOTAL_LINES_SOURCES)[number];

/** Whether portions may be added for the student's attendance on the date (FR-DAY-011, F05-AC18). */
export const PORTIONS_ALLOWED = ['ALLOWED', 'CHANGE_TO_LATE', 'ATTENDANCE_REQUIRED'] as const;
export type PortionsAllowed = (typeof PORTIONS_ALLOWED)[number];

/** Session labels: trimmed, 1–40 characters, case-insensitive (plan §7.1). */
export const SESSION_LABEL_MAX = 40;
/** Attempt remarks (internal staff text); same limit as the F04 Leave reason and absence note. */
export const REMARKS_MAX = 500;
/** Mistakes per attempt. */
export const MISTAKES_MAX = 50;
/** A mistake note, after trimming (DEC-B86). */
export const MISTAKE_NOTE_MAX = 200;
/** The longest period one performance summary may cover (a month and a bit, like the record list). */
export const PERFORMANCE_SUMMARY_MAX_DAYS = 62;
export const QUALITY_MIN = 1;
export const QUALITY_MAX = 5;
/** Largest amount accepted in any unit; a guard against junk, not a domain limit. */
export const QUANTITY_AMOUNT_MAX = 100_000;
export const DAILY_RECORD_PAGE_SIZE = 25;
export const DAILY_RECORD_PAGE_SIZE_MAX = 100;
/** The longest period one list request may cover. */
export const DAILY_RECORD_RANGE_MAX_DAYS = 62;

/**
 * Field issue codes F05 returns in `error.fields` and in rejected sync results (clients localize them). The portion
 * codes are the ones @hifz/domain/hifz emits; the rest are the handlers'.
 */
export const HIFZ_FIELD_ISSUES = {
  REQUIRED: 'REQUIRED',
  INVALID: 'INVALID',
  TOO_LONG: 'TOO_LONG',
  TOO_MANY: 'TOO_MANY',
  /** The field does not belong to this section (Total Lines on Sabqi/Manzil) or was set by the server. */
  NOT_ALLOWED: 'NOT_ALLOWED',
  // Ranges and Para (F06 quran-ref).
  UNKNOWN: 'UNKNOWN',
  NOT_WHOLE: 'NOT_WHOLE',
  OUT_OF_RANGE: 'OUT_OF_RANGE',
  END_BEFORE_START: 'END_BEFORE_START',
  /** A Sabaq range runs into a second Surah; record a second portion (DEC-B62, F05-AC21). */
  CROSSES_SURAH: 'CROSSES_SURAH',
  /** No Para boundary in the metadata covers the Sabaq range; nothing is guessed (FR-SAB-001). */
  PARA_UNKNOWN: 'PARA_UNKNOWN',
  /** No active Quran metadata is loaded, so a Sabaq range cannot be checked (FR-SAB-007). */
  METADATA_UNAVAILABLE: 'METADATA_UNAVAILABLE',
  /** A Sabaq Para sent by the client; the server derives it (FR-SAB-001). */
  SABAQ_PARA_NOT_ACCEPTED: 'SABAQ_PARA_NOT_ACCEPTED',
  // Quantities (F06 quantity).
  UNIT_NOT_ALLOWED: 'UNIT_NOT_ALLOWED',
  UNIT_MISMATCH: 'UNIT_MISMATCH',
  NOT_A_PRESET: 'NOT_A_PRESET',
  NOT_POSITIVE: 'NOT_POSITIVE',
  ABOVE_TOTAL: 'ABOVE_TOTAL',
  ABOVE_ASSIGNED: 'ABOVE_ASSIGNED',
  // Attempts.
  /** Quality on ABSENT, NOT_ASSIGNED, or PENDING (FR-ATT-007). */
  QUALITY_NOT_ALLOWED: 'QUALITY_NOT_ALLOWED',
  /** "No mistakes" together with a mistake list (FR-ATT-011). */
  NO_MISTAKES_CONFLICT: 'NO_MISTAKES_CONFLICT',
  /** The attempt number is already used on that portion; attempts are append-only (F05-AC15). */
  ATTEMPT_NO_TAKEN: 'ATTEMPT_NO_TAKEN',
  /** The portion was removed; no new attempt is added to it. */
  PORTION_REMOVED: 'PORTION_REMOVED',
  // Record context.
  /** reportDate is after today in the madrasa's timezone (FR-DAY-001, F05-AC17). */
  FUTURE: 'FUTURE',
  NOT_ENROLLED: 'NOT_ENROLLED',
  /** SINGLE mode: a record exists for the student and date; `existingId` names it (F05-AC6). */
  DUPLICATE_RECORD: 'DUPLICATE_RECORD',
  /** MULTI_SESSION mode: the session label is taken on that date (F05-AC7). */
  DUPLICATE_SESSION: 'DUPLICATE_SESSION',
  SESSION_LABEL_REQUIRED: 'SESSION_LABEL_REQUIRED',
  SESSION_LABEL_NOT_ALLOWED: 'SESSION_LABEL_NOT_ALLOWED',
  SESSION_LABEL_TOO_LONG: 'SESSION_LABEL_TOO_LONG',
  /** Attendance is Absent or Leave; Daily Entry offers "Change to Late" (FR-DAY-011, F05-AC18). */
  ATTENDANCE_CHANGE_TO_LATE: 'ATTENDANCE_CHANGE_TO_LATE',
  /** No attendance is marked for the student on the date (plan §7.5). */
  ATTENDANCE_REQUIRED: 'ATTENDANCE_REQUIRED',
} as const;
export type HifzFieldIssue = (typeof HIFZ_FIELD_ISSUES)[keyof typeof HIFZ_FIELD_ISSUES];

/**
 * Error codes F05 adds to the API error envelope. `MODE_CONFLICTS` (409) is returned by PUT
 * /organization/daily-report-mode with the conflict list (F05-AC8). The API registers it in ERROR_CODES.
 */
export const HIFZ_ERROR_CODES = ['MODE_CONFLICTS'] as const;
export type HifzErrorCode = (typeof HIFZ_ERROR_CODES)[number];

// ---------- Building blocks ----------

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const datetime = z.iso.datetime({ offset: true });
const uuid = z.uuid();
const whole = z.number().int().min(0).max(QUANTITY_AMOUNT_MAX);
const surah = z.number().int().min(1).max(114);
const ayah = z.number().int().min(1).max(999);
const paraNumber = z.number().int().min(1).max(30);

/**
 * An exact quantity: integer parts, denominator ≥ 1. LINES, AYAT, and PAGES are whole numbers (denominator 1);
 * whether a Para amount is a quarter, and which units a section allows, is the domain's check.
 */
export const QuantitySchema = z
  .strictObject({
    unit: z.enum(QUANTITY_UNITS),
    numerator: whole,
    denominator: z.number().int().min(1).max(QUANTITY_AMOUNT_MAX),
  })
  .superRefine((q, ctx) => {
    if (q.unit !== 'PARA' && q.denominator !== 1) ctx.addIssue({ code: 'custom', path: ['denominator'], message: HIFZ_FIELD_ISSUES.NOT_WHOLE });
  });
export type QuantityValue = z.infer<typeof QuantitySchema>;

/** A Surah/Ayat range. Sabaq ranges stay in one Surah (checked by the domain, F05-AC21). */
export const AyahRangeSchema = z.strictObject({ surahStart: surah, ayahStart: ayah, surahEnd: surah, ayahEnd: ayah });
export type AyahRangeValue = z.infer<typeof AyahRangeSchema>;

/**
 * One mistake: exactly one category, MINOR or MAJOR, and the separate `repeated` flag (FR-ATT-010). The optional note
 * (F07, FR-ATT-012) is internal unless `noteVisibility` is SHARED; it is accepted up to 4× the limit so the handler can
 * answer TOO_LONG. Omitted, `note` is null and `noteVisibility` INTERNAL.
 */
export const MistakeSchema = z.strictObject({
  category: z.enum(MISTAKE_CATEGORIES),
  severity: z.enum(MISTAKE_SEVERITIES),
  repeated: z.boolean(),
  note: z.string().max(MISTAKE_NOTE_MAX * 4).nullable().default(null),
  noteVisibility: z.enum(NOTE_VISIBILITIES).default('INTERNAL'),
});
export type MistakeValue = z.infer<typeof MistakeSchema>;
export type MistakeInput = z.input<typeof MistakeSchema>;

const overallLabel = z.enum(OVERALL_LABELS).nullable();

const quality = z.number().int().min(QUALITY_MIN).max(QUALITY_MAX).nullable();
/** Accepts up to 4× the limit so the handler can answer with a TOO_LONG field error (as F04 does). */
const remarks = z.string().max(REMARKS_MAX * 4).nullable();
const sessionLabel = z.string().max(SESSION_LABEL_MAX * 4).nullable();

const PORTION_GROUP = ['paraNumber', 'range', 'totalLines', 'totalLinesSource', 'assigned'] as const;
const ATTEMPT_GROUP = ['status', 'completed', 'quality', 'noMistakes', 'mistakes'] as const;

/** A coupled field group travels whole in an UPDATE (F12 plan Q5), so a merge never mixes two people's entries. */
function groupWhole(fields: Record<string, unknown>, group: readonly string[], ctx: z.RefinementCtx): void {
  const present = group.filter((k) => Object.hasOwn(fields, k));
  if (present.length > 0 && present.length < group.length) {
    for (const k of group) if (!Object.hasOwn(fields, k)) ctx.addIssue({ code: 'custom', path: [k], message: 'GROUP_INCOMPLETE' });
  }
}

function notEmpty(fields: Record<string, unknown>, ctx: z.RefinementCtx): void {
  if (Object.keys(fields).length === 0) ctx.addIssue({ code: 'custom', path: [], message: 'NO_FIELDS' });
}

// ---------- Sync fields: daily_record ----------

/** `daily_record` CREATE. Recorder, organization, and receive time are the server's. */
export const DailyRecordCreateFields = z.strictObject({
  studentId: uuid,
  classId: uuid,
  /** The calendar date the Teacher chose; never changed by save or sync time (F05-AC1, AC2). */
  reportDate: isoDate,
  /** Required in MULTI_SESSION, null in SINGLE (checked against the madrasa's mode by the handler). */
  sessionLabel,
  /** The overall performance label (US-032); optional, never derived from quality (F07-AC13). */
  overallLabel: overallLabel.default(null),
  /** When the device saved it (informational). */
  clientSavedAt: datetime.optional(),
});
export type DailyRecordCreateFields = z.infer<typeof DailyRecordCreateFields>;

/**
 * `daily_record` UPDATE: the session label and/or the overall performance label; moving a record to another student or
 * date is not supported.
 */
export const DailyRecordUpdateFields = z
  .strictObject({ sessionLabel: sessionLabel.optional(), overallLabel: overallLabel.optional() })
  .superRefine((f, ctx) => notEmpty(f, ctx));
export type DailyRecordUpdateFields = z.infer<typeof DailyRecordUpdateFields>;

// ---------- Sync fields: lesson_portion ----------

/**
 * `lesson_portion` CREATE.
 * - Sabaq: `range` and `assigned` (LINES) required, `totalLines` required, `paraNumber` must be null (the server
 *   derives it, FR-SAB-001) and `totalLinesSource` says whether Total Lines came from the layout (FR-SAB-008).
 * - Sabqi/Manzil: `paraNumber` required; `range` optional; `totalLines` and `totalLinesSource` null.
 */
export const LessonPortionCreateFields = z
  .strictObject({
    dailyRecordId: uuid,
    section: z.enum(SECTIONS),
    /** Portion number within the section, from 1. */
    position: z.number().int().min(1).max(100),
    isExtra: z.boolean(),
    paraNumber: paraNumber.nullable(),
    range: AyahRangeSchema.nullable(),
    assigned: QuantitySchema,
    totalLines: z.number().int().min(0).max(QUANTITY_AMOUNT_MAX).nullable(),
    totalLinesSource: z.enum(TOTAL_LINES_SOURCES).nullable(),
    /**
     * F08 (FR-HW-015, F08-AC16): the confirmed homework portion this lesson portion is the next-class work for. It must
     * be the same student's, in the same section, and confirmed. Omitted means none.
     */
    homeworkPortionId: uuid.nullable().default(null),
  })
  .superRefine((p, ctx) => {
    const issue = (path: string, message: string) => ctx.addIssue({ code: 'custom', path: [path], message });
    if (p.section === 'SABAQ') {
      if (p.paraNumber !== null) issue('paraNumber', HIFZ_FIELD_ISSUES.SABAQ_PARA_NOT_ACCEPTED);
      if (p.range === null) issue('range', HIFZ_FIELD_ISSUES.REQUIRED);
      if (p.totalLines === null) issue('totalLines', HIFZ_FIELD_ISSUES.REQUIRED);
      if (p.totalLinesSource === null) issue('totalLinesSource', HIFZ_FIELD_ISSUES.REQUIRED);
    } else {
      if (p.paraNumber === null) issue('paraNumber', HIFZ_FIELD_ISSUES.REQUIRED);
      if (p.totalLines !== null) issue('totalLines', HIFZ_FIELD_ISSUES.NOT_ALLOWED);
      if (p.totalLinesSource !== null) issue('totalLinesSource', HIFZ_FIELD_ISSUES.NOT_ALLOWED);
    }
  });
export type LessonPortionCreateFields = z.infer<typeof LessonPortionCreateFields>;

/**
 * `lesson_portion` UPDATE (a correction, audited; FR-DAY-009). The section and the record never change. The Para,
 * range, Total Lines (and source), and assigned quantity travel together; `removed: true` removes the portion
 * (its row and attempts are kept). The handler refuses a Para on a Sabaq portion.
 */
export const LessonPortionUpdateFields = z
  .strictObject({
    position: z.number().int().min(1).max(100).optional(),
    isExtra: z.boolean().optional(),
    paraNumber: paraNumber.nullable().optional(),
    range: AyahRangeSchema.nullable().optional(),
    assigned: QuantitySchema.optional(),
    totalLines: z.number().int().min(0).max(QUANTITY_AMOUNT_MAX).nullable().optional(),
    totalLinesSource: z.enum(TOTAL_LINES_SOURCES).nullable().optional(),
    removed: z.literal(true).optional(),
  })
  .superRefine((f, ctx) => {
    notEmpty(f, ctx);
    groupWhole(f, PORTION_GROUP, ctx);
  });
export type LessonPortionUpdateFields = z.infer<typeof LessonPortionUpdateFields>;

// ---------- Sync fields: portion_attempt ----------

const attemptRules = (a: { status?: PortionStatus; quality?: number | null; noMistakes?: boolean; mistakes?: MistakeValue[] }, ctx: z.RefinementCtx) => {
  if (a.status !== undefined && a.quality != null && (NO_QUALITY_STATUSES as readonly string[]).includes(a.status)) {
    ctx.addIssue({ code: 'custom', path: ['quality'], message: HIFZ_FIELD_ISSUES.QUALITY_NOT_ALLOWED });
  }
  if (a.noMistakes && a.mistakes && a.mistakes.length > 0) {
    ctx.addIssue({ code: 'custom', path: ['mistakes'], message: HIFZ_FIELD_ISSUES.NO_MISTAKES_CONFLICT });
  }
};

/**
 * `portion_attempt` CREATE: a new attempt never changes an earlier one (F05-AC15). Mistakes travel inside the
 * attempt (plan §7.4). `completed` null with NOT_REMEMBERED or COMPLETED takes the domain default; otherwise it stays
 * unknown. Remarks are internal: never logged, audited by field name only, never sent to Students or Parents.
 */
export const PortionAttemptCreateFields = z
  .strictObject({
    lessonPortionId: uuid,
    attemptNo: z.number().int().min(1).max(1000),
    /** When the recitation happened (device time; informational, never used for ordering). */
    attemptedAt: datetime,
    status: z.enum(PORTION_STATUSES),
    completed: QuantitySchema.nullable(),
    quality,
    noMistakes: z.boolean(),
    mistakes: z.array(MistakeSchema).max(MISTAKES_MAX),
    remarks,
  })
  .superRefine(attemptRules);
export type PortionAttemptCreateFields = z.infer<typeof PortionAttemptCreateFields>;

/** `portion_attempt` UPDATE: a correction of that attempt (audited, FR-DAY-009); the outcome group travels whole. */
export const PortionAttemptUpdateFields = z
  .strictObject({
    attemptedAt: datetime.optional(),
    status: z.enum(PORTION_STATUSES).optional(),
    completed: QuantitySchema.nullable().optional(),
    quality: quality.optional(),
    noMistakes: z.boolean().optional(),
    mistakes: z.array(MistakeSchema).max(MISTAKES_MAX).optional(),
    remarks: remarks.optional(),
  })
  .superRefine((f, ctx) => {
    notEmpty(f, ctx);
    groupWhole(f, ATTEMPT_GROUP, ctx);
    attemptRules(f, ctx);
  });
export type PortionAttemptUpdateFields = z.infer<typeof PortionAttemptUpdateFields>;

// ---------- REST: daily records (staff only) ----------

/**
 * GET /hifz/daily-records. Either `studentId` + `date`, or a `from`–`to` period (at most 62 days), optionally for a
 * student or a class. Paginated by cursor. Scope comes from the membership (Teacher: assigned classes).
 */
export const DailyRecordListQuery = z
  .strictObject({
    studentId: uuid.optional(),
    classId: uuid.optional(),
    date: isoDate.optional(),
    from: isoDate.optional(),
    to: isoDate.optional(),
    cursor: z.string().max(200).optional(),
    limit: z.coerce.number().int().min(1).max(DAILY_RECORD_PAGE_SIZE_MAX).default(DAILY_RECORD_PAGE_SIZE),
  })
  .superRefine((q, ctx) => {
    const period = q.from !== undefined || q.to !== undefined;
    if (q.date !== undefined && period) ctx.addIssue({ code: 'custom', path: ['date'], message: HIFZ_FIELD_ISSUES.INVALID });
    if (q.date === undefined && !period) ctx.addIssue({ code: 'custom', path: ['date'], message: HIFZ_FIELD_ISSUES.REQUIRED });
    if (period && (q.from === undefined || q.to === undefined)) ctx.addIssue({ code: 'custom', path: [q.from === undefined ? 'from' : 'to'], message: HIFZ_FIELD_ISSUES.REQUIRED });
    if (q.from !== undefined && q.to !== undefined && q.from > q.to) ctx.addIssue({ code: 'custom', path: ['to'], message: HIFZ_FIELD_ISSUES.END_BEFORE_START });
  });
export type DailyRecordListQuery = z.infer<typeof DailyRecordListQuery>;

export const DailyRecordParam = z.strictObject({ id: uuid });
export type DailyRecordParam = z.infer<typeof DailyRecordParam>;

export interface UserRef {
  userId: string;
  displayName: string;
}

/** One row of the list. */
export interface DailyRecordView {
  id: string;
  studentId: string;
  studentName: string;
  classId: string;
  /** The Teacher's chosen date (F05-AC1); separate from save and sync time. */
  reportDate: string;
  sessionLabel: string | null;
  /** The record's overall performance label (US-032), or null when the Teacher chose none. */
  overallLabel: OverallLabel | null;
  recordedBy: UserRef;
  /** Non-removed portions. */
  portionCount: number;
  clientSavedAt: string | null;
  serverReceivedAt: string;
  rowVersion: number;
}

export interface DailyRecordListResponse {
  items: DailyRecordView[];
  nextCursor: string | null;
}

export interface MistakeView extends MistakeValue {
  position: number;
}

/** One attempt as staff see it (remarks are internal and appear only in staff projections). */
export interface PortionAttemptView {
  id: string;
  attemptNo: number;
  attemptedAt: string;
  recordedBy: UserRef;
  status: PortionStatus;
  completed: QuantityValue | null;
  quality: number | null;
  noMistakes: boolean;
  /** Mistake count: the list length, 0 only for "No mistakes", null when not recorded (FR-ATT-011). */
  mistakeCount: number | null;
  mistakes: MistakeView[];
  remarks: string | null;
  rowVersion: number;
}

/** Current progress of a portion: from the latest attempt; assigned counted once (F05-AC16). */
export interface PortionProgressView {
  currentStatus: PortionStatus | null;
  assigned: QuantityValue;
  completed: QuantityValue | null;
  /** max(0, assigned − completed) in the same unit; null when completed is unknown. */
  remaining: QuantityValue | null;
  quality: number | null;
  attemptCount: number;
  currentAttemptNo: number | null;
}

export interface LessonPortionView {
  id: string;
  section: Section;
  position: number;
  isExtra: boolean;
  /** Sabaq: derived from the range by the server (FR-SAB-001). */
  paraNumber: number | null;
  range: AyahRangeValue | null;
  assigned: QuantityValue;
  totalLines: number | null;
  totalLinesSource: TotalLinesSource | null;
  /** The edition Total Lines was counted on (Sabaq only). */
  lineCountEdition: string | null;
  /** F08: the confirmed homework portion this is the next-class work for (FR-HW-015), or null. */
  homeworkPortionId: string | null;
  removed: boolean;
  removedAt: string | null;
  /** Oldest first; the current attempt is last (FR-ATT-005). */
  attempts: PortionAttemptView[];
  progress: PortionProgressView;
  rowVersion: number;
}

export interface UnitTotalsView {
  /** One entry per unit; never summed across units (FR-QTY-004). */
  assigned: QuantityValue[];
  completed: QuantityValue[];
  remaining: QuantityValue[];
  notRecorded: number;
}

export interface SectionSummaryView {
  section: Section;
  /** Portion ids in position order; each keeps its own outcome (F05-AC13). */
  portionIds: string[];
  totals: UnitTotalsView;
  extraTotals: UnitTotalsView;
}

/** GET /hifz/daily-records/:id (staff). */
export interface DailyRecordDetail {
  record: DailyRecordView;
  /** The student's attendance on the date, and whether portions may be added (F05-AC18). */
  attendance: { status: AttendanceStatus | null; portionsAllowed: PortionsAllowed };
  /** Portions in section order (Sabaq, Sabqi, Manzil), then position; removed portions included, flagged. */
  portions: LessonPortionView[];
  /** Per section, excluding removed portions. */
  sectionSummary: SectionSummaryView[];
}

/** Fields each entity carries in a sync pull (staff projection). */
export interface DailyRecordSyncFields {
  studentId: string;
  classId: string;
  reportDate: string;
  sessionLabel: string | null;
  overallLabel: OverallLabel | null;
  recordedBy: string;
  clientSavedAt: string | null;
}

export interface LessonPortionSyncFields {
  dailyRecordId: string;
  section: Section;
  position: number;
  isExtra: boolean;
  paraNumber: number | null;
  range: AyahRangeValue | null;
  assigned: QuantityValue;
  totalLines: number | null;
  totalLinesSource: TotalLinesSource | null;
  lineCountEdition: string | null;
  /** F08: the confirmed homework portion this is the next-class work for (FR-HW-015), or null. */
  homeworkPortionId: string | null;
  removed: boolean;
}

export interface PortionAttemptSyncFields {
  lessonPortionId: string;
  attemptNo: number;
  attemptedAt: string;
  recordedBy: string;
  status: PortionStatus;
  completed: QuantityValue | null;
  quality: number | null;
  noMistakes: boolean;
  mistakes: MistakeValue[];
  remarks: string | null;
}

// ---------- REST: performance summary (F07; staff only) ----------

/**
 * GET /hifz/performance-summary?studentId&from&to (inclusive report dates, at most 62 days). Staff only
 * (`daily.write`; a Teacher reaches assigned classes). F09 builds the full weekly/monthly report on the same domain
 * functions (@hifz/domain/quality, @hifz/domain/mistakes).
 */
export const PerformanceSummaryQuery = z
  .strictObject({ studentId: uuid, from: isoDate, to: isoDate })
  .superRefine((q, ctx) => {
    if (q.from > q.to) ctx.addIssue({ code: 'custom', path: ['to'], message: HIFZ_FIELD_ISSUES.END_BEFORE_START });
  });
export type PerformanceSummaryQuery = z.infer<typeof PerformanceSummaryQuery>;

/** A quality average: the exact value, one decimal, the nearest score's label key, and the ratings used. */
export interface QualityAverageView {
  /** Ratings used; NULL scores and Absent/Not Assigned/Pending attempts are not ratings (FR-RPT-004). */
  count: number;
  /** Exact average (lower is better); null with no ratings ("Not recorded"). */
  value: number | null;
  /** One decimal, half up ("1.7"); null with no ratings. */
  display: string | null;
  /** Nearest whole score, .5 up (1.5 → 2); null with no ratings. The label comes from the approved scale. */
  nearestScore: number | null;
}

export interface MistakeCountsView {
  byCategory: Record<MistakeCategory, number>;
  /** Imported uncategorized MistakeCount totals (F14), never split into categories. */
  uncategorized: number;
  major: number;
  minor: number;
  repeated: number;
  total: number;
  /** Attempts with a known count (mistakes listed or "No mistakes"). */
  recordedAttempts: number;
  /** Attempts with an explicit "No mistakes" (0). */
  noMistakesAttempts: number;
  /** Attempts whose mistakes were not recorded; never counted as 0. */
  notRecordedAttempts: number;
}

export interface PerformanceSummary {
  studentId: string;
  from: string;
  to: string;
  /** Daily records in the period. */
  recordCount: number;
  /** Attempts on non-removed portions in the period (every attempt; each is its own recitation). */
  attemptCount: number;
  mistakes: MistakeCountsView;
  quality: QualityAverageView;
  /** How often each overall label was chosen; records without one are `notChosen` (never derived from quality). */
  overallLabels: Record<OverallLabel, number> & { notChosen: number };
}

// ---------- REST: the daily-report mode (US-019) ----------

/** PUT /organization/daily-report-mode. Owner/Admin only (SRS §17.1); a Teacher gets 403 (F05-AC9). Audited. */
export const SetDailyReportModeRequest = z.strictObject({ mode: z.enum(DAILY_REPORT_MODES) });
export type SetDailyReportModeRequest = z.infer<typeof SetDailyReportModeRequest>;

export interface DailyReportModeResponse {
  mode: DailyReportMode;
}

/** One student/date with more than one record, blocking a switch to SINGLE (F05-AC8). */
export interface ReportModeConflict {
  studentId: string;
  studentName: string;
  reportDate: string;
  /** The labels on that date, as stored (null for an unlabelled record). */
  sessionLabels: (string | null)[];
}

/** 409 body of a blocked switch. */
export interface ModeConflictsResponse {
  error: {
    code: 'MODE_CONFLICTS';
    message: string;
    conflicts: ReportModeConflict[];
  };
}
