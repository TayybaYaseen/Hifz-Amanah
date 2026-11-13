// Homework contracts shared by the API and the app (F08; FR-HW-001…018, FR-RPT-007; plan docs/handover/F08-plan.md).
//
// Drafts are client-created (UUIDv7) and travel through the sync outbox as `homework_assignment` operations; their
// portions travel inside the assignment (`portions`), each with its own client UUIDv7. Schemas are strict: unknown keys
// (an organization, a role, a confirmer, a status other than REJECTED) are refused. The server re-derives every
// SUGGESTED portion from its source attempt and never trusts a client quantity for it (AGENTS.md §6).
//
// Confirmation is the COMMAND `CONFIRM_HOMEWORK` (offline too, FR-HW-017): it carries the row versions of the sources the
// device built the draft from; a source changed since then becomes a sync conflict instead of a confirmation.
// Revision is an online Owner/Admin request (FR-HW-012, DEC-B17).
import { z } from 'zod';
import { AyahRangeSchema, QuantitySchema, SECTIONS, type AyahRangeValue, type PortionStatus, type QuantityValue, type Section, type UserRef } from './hifz.ts';
import { UuidV7 } from './sync.ts';

export const HOMEWORK_STATUSES = ['DRAFT', 'CONFIRMED', 'SUPERSEDED', 'REJECTED'] as const;
export type HomeworkStatus = (typeof HOMEWORK_STATUSES)[number];

/** Where a draft portion came from (F08-AC8, AC-HW-02). */
export const HOMEWORK_PORTION_ORIGINS = ['SUGGESTED', 'TEACHER_EDITED', 'TEACHER_ADDED'] as const;
export type HomeworkPortionOrigin = (typeof HOMEWORK_PORTION_ORIGINS)[number];

/** The display state of an assignment, computed on read (never stored, never "failed"). */
export const HOMEWORK_STATES = ['DRAFT', 'REJECTED', 'SUPERSEDED', 'UPCOMING', 'DUE', 'CARRIED_OVER', 'OUTSTANDING', 'ATTEMPTED'] as const;
export type HomeworkState = (typeof HOMEWORK_STATES)[number];

/** Why confirmed homework moved to a later class day (FR-HW-016). */
export const CARRY_OVER_REASONS = ['ABSENT', 'LEAVE', 'HOLIDAY', 'CLOSURE', 'NO_CLASS', 'UNSCHEDULED'] as const;
export type CarryOverReason = (typeof CARRY_OVER_REASONS)[number];

/** The only command of `homework_assignment`. */
export const HOMEWORK_COMMANDS = ['CONFIRM_HOMEWORK'] as const;

/** Sync notices an APPLIED result may carry (shown to the Teacher, F08-AC14, F05-AC4). */
export const SYNC_NOTICES = ['CONFIRMED_HOMEWORK_UNCHANGED'] as const;
export type SyncNotice = (typeof SYNC_NOTICES)[number];

export const HOMEWORK_INSTRUCTIONS_MAX = 500;
export const HOMEWORK_PORTIONS_MAX = 30;
export const HOMEWORK_PAGE_SIZE = 25;
export const HOMEWORK_PAGE_SIZE_MAX = 100;

/** Field issue codes F08 returns (clients localize them). Portion field codes are F05's (HIFZ_FIELD_ISSUES). */
export const HOMEWORK_FIELD_ISSUES = {
  REQUIRED: 'REQUIRED',
  TOO_LONG: 'TOO_LONG',
  TOO_MANY: 'TOO_MANY',
  /** The due date is before the assigned date (F08 edge case). */
  DUE_BEFORE_ASSIGNED: 'DUE_BEFORE_ASSIGNED',
  /** The class has no scheduled day ahead, so no due date can be defaulted; the Teacher picks one. */
  NO_CLASS_DAY: 'NO_CLASS_DAY',
  FUTURE: 'FUTURE',
  NOT_ENROLLED: 'NOT_ENROLLED',
  /** The source attempt is not PARTIAL/NOT_REMEMBERED with remaining work (FR-HW-013). */
  NOT_ELIGIBLE: 'NOT_ELIGIBLE',
  /** A later attempt on the same portion decides eligibility (FR-ATT-005). */
  NOT_LATEST: 'NOT_LATEST',
  /** The source attempt is already carried forward by another draft or confirmed assignment. */
  ALREADY_ASSIGNED: 'ALREADY_ASSIGNED',
  /** A suggested or edited portion needs its source attempt; an added one has none. */
  SOURCE_REQUIRED: 'SOURCE_REQUIRED',
  SOURCE_NOT_ALLOWED: 'SOURCE_NOT_ALLOWED',
  /** Two portions share an id. */
  DUPLICATE_ID: 'DUPLICATE_ID',
  /** The assignment is not a draft: confirmed homework is never edited (FR-HW-012). */
  NOT_DRAFT: 'NOT_DRAFT',
  /** Revision is for confirmed homework only. */
  NOT_CONFIRMED: 'NOT_CONFIRMED',
  /** The next-class portion's homework portion is another student's, another section's, or not confirmed (F08-AC16). */
  HOMEWORK_PORTION_MISMATCH: 'HOMEWORK_PORTION_MISMATCH',
} as const;

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const datetime = z.iso.datetime({ offset: true });
const uuid = z.uuid();
const paraNumber = z.number().int().min(1).max(30);
/** Accepted up to 4× the limit so the handler can answer TOO_LONG (as F04/F05 do). */
const instructions = z.string().max(HOMEWORK_INSTRUCTIONS_MAX * 4).nullable();

// ---------- Sync fields: homework_assignment ----------

/**
 * One draft portion. SUGGESTED: `sourceAttemptId` required; the server derives section, Para, range, Total Lines, and
 * the quantity from it (client values are ignored). TEACHER_EDITED: a suggested portion the Teacher changed; keeps its
 * source and the Teacher's values. TEACHER_ADDED: no source. `assigned` null is allowed only while a SUGGESTED portion
 * needs review; confirmation refuses it.
 */
export const HomeworkPortionInput = z.strictObject({
  id: UuidV7,
  section: z.enum(SECTIONS),
  position: z.number().int().min(1).max(100),
  /** Sabaq: null (derived from the range by the server, FR-SAB-001). */
  paraNumber: paraNumber.nullable(),
  range: AyahRangeSchema.nullable(),
  totalLines: z.number().int().min(0).max(100_000).nullable(),
  assigned: QuantitySchema.nullable(),
  origin: z.enum(HOMEWORK_PORTION_ORIGINS),
  sourceAttemptId: uuid.nullable(),
  instructions: instructions.default(null),
});
export type HomeworkPortionInput = z.infer<typeof HomeworkPortionInput>;

const portionList = z.array(HomeworkPortionInput).max(HOMEWORK_PORTIONS_MAX * 2);

/** `homework_assignment` CREATE: a DRAFT. Creator, organization, class, and status are the server's. */
export const HomeworkAssignmentCreateFields = z.strictObject({
  studentId: uuid,
  /** The daily record the suggestion was built from, if any. */
  sourceDailyRecordId: uuid.nullable().default(null),
  /** The calendar date the homework is set (not in the future). */
  assignedDate: isoDate,
  /** Null: the next scheduled class day after the assigned date (FR-HW-004, F08-AC18). */
  dueDate: isoDate.nullable().default(null),
  instructions: instructions.default(null),
  portions: portionList,
});
export type HomeworkAssignmentCreateFields = z.infer<typeof HomeworkAssignmentCreateFields>;

/**
 * `homework_assignment` UPDATE, drafts only: the due date, the instructions, the full list of active portions (a portion
 * left out is removed; its row is kept), or `status: REJECTED` (F08-AC8, AC9). Confirmation is the CONFIRM_HOMEWORK
 * command, never an UPDATE.
 */
export const HomeworkAssignmentUpdateFields = z
  .strictObject({
    dueDate: isoDate.optional(),
    instructions: instructions.optional(),
    portions: portionList.optional(),
    status: z.literal('REJECTED').optional(),
  })
  .superRefine((f, ctx) => {
    if (Object.keys(f).length === 0) ctx.addIssue({ code: 'custom', path: [], message: 'NO_FIELDS' });
  });
export type HomeworkAssignmentUpdateFields = z.infer<typeof HomeworkAssignmentUpdateFields>;

/** One source the device built the draft from, with the row version it saw (null: created on the device, unsynced). */
export const HomeworkSourceVersion = z.strictObject({
  entity: z.enum(['portion_attempt', 'lesson_portion']),
  id: uuid,
  rowVersion: z.number().int().min(1).nullable(),
});
export type HomeworkSourceVersion = z.infer<typeof HomeworkSourceVersion>;

/**
 * COMMAND `CONFIRM_HOMEWORK` (FR-HW-009, FR-HW-017): the device's confirmation time and the sources it saw. The server
 * confirms only when none of them, and not the draft itself, changed since (by another user or device).
 */
export const ConfirmHomeworkFields = z.strictObject({
  /** When the Teacher confirmed (device time, kept as the confirmation time, F08-AC20). */
  confirmedAt: datetime,
  sources: z.array(HomeworkSourceVersion).max(HOMEWORK_PORTIONS_MAX * 2),
});
export type ConfirmHomeworkFields = z.infer<typeof ConfirmHomeworkFields>;

/** A portion as stored and pulled (staff projection). */
export interface HomeworkPortionValue {
  id: string;
  section: Section;
  position: number;
  paraNumber: number | null;
  range: AyahRangeValue | null;
  totalLines: number | null;
  lineCountEdition: string | null;
  assigned: QuantityValue | null;
  needsReview: boolean;
  origin: HomeworkPortionOrigin;
  sourceAttemptId: string | null;
  sourceLessonPortionId: string | null;
  sourceHomeworkPortionId: string | null;
  instructions: string | null;
}

/** Fields of a `homework_assignment` in a sync pull. `portions` lists the active portions, by section and position. */
export interface HomeworkAssignmentSyncFields {
  studentId: string;
  classId: string;
  sourceDailyRecordId: string | null;
  assignedDate: string;
  dueDate: string;
  status: HomeworkStatus;
  instructions: string | null;
  createdBy: string;
  confirmedBy: string | null;
  confirmedAt: string | null;
  revisionOf: string | null;
  portions: HomeworkPortionValue[];
}

// ---------- REST ----------

/** GET /homework/assignments: a student's homework (staff), newest assigned first. */
export const HomeworkListQuery = z.strictObject({
  studentId: uuid,
  status: z.enum(HOMEWORK_STATUSES).optional(),
  limit: z.coerce.number().int().min(1).max(HOMEWORK_PAGE_SIZE_MAX).default(HOMEWORK_PAGE_SIZE),
  cursor: z.string().min(1).max(512).optional(),
});
export type HomeworkListQuery = z.infer<typeof HomeworkListQuery>;

/** GET /homework/suggestion?dailyRecordId: the server's suggest() over the record's latest attempts. */
export const HomeworkSuggestionQuery = z.strictObject({ dailyRecordId: uuid });
export type HomeworkSuggestionQuery = z.infer<typeof HomeworkSuggestionQuery>;

/** POST /homework/assignments/:id/revise (Owner/Admin): the revised content; confirmed at once by the reviser. */
export const ReviseHomeworkRequest = z.strictObject({
  /** The new assignment's id (client UUIDv7, so a retry does not create two). */
  id: UuidV7,
  dueDate: isoDate,
  instructions: instructions.default(null),
  /**
   * The revised portions. `revisesPortionId` names the old assignment's portion a revised portion replaces: it keeps
   * that portion's source attempt and links back to it (FR-HW-014). Without it the portion is new (TEACHER_ADDED).
   */
  portions: z
    .array(HomeworkPortionInput.omit({ origin: true, sourceAttemptId: true }).extend({ revisesPortionId: uuid.nullable().default(null) }))
    .min(1)
    .max(HOMEWORK_PORTIONS_MAX),
});
export type ReviseHomeworkRequest = z.infer<typeof ReviseHomeworkRequest>;

export interface HomeworkPortionProgressView {
  attempted: boolean;
  /** The latest next-class attempt's status, or null when not attempted yet (never "failed"). */
  status: PortionStatus | null;
  /** The lesson portions recorded against this homework portion (FR-HW-015). */
  lessonPortionIds: string[];
}

export interface HomeworkPortionView extends HomeworkPortionValue {
  removed: boolean;
  /** Why it was suggested (design.md §4.9): the source attempt's status and quantities, when it has a source. */
  source: { attemptId: string; lessonPortionId: string; reportDate: string; status: PortionStatus; assigned: QuantityValue; completed: QuantityValue | null } | null;
  progress: HomeworkPortionProgressView;
}

export interface HomeworkAssignmentView {
  id: string;
  studentId: string;
  studentName: string;
  classId: string;
  sourceDailyRecordId: string | null;
  assignedDate: string;
  dueDate: string;
  status: HomeworkStatus;
  /** The display state on today (computed, never stored). */
  state: HomeworkState;
  /** Confirmed homework whose due day was missed or not a class day: where it shows now and why (FR-HW-016). */
  carriedOver: { reason: CarryOverReason; effectiveDueDate: string } | null;
  instructions: string | null;
  createdBy: UserRef;
  confirmedBy: UserRef | null;
  confirmedAt: string | null;
  revisionOf: string | null;
  /** The assignment that superseded this one, if any. */
  supersededBy: string | null;
  createdAt: string;
  rowVersion: number;
  /** Active portions first (by section and position), then removed ones (drafts only keep removed rows). */
  portions: HomeworkPortionView[];
}

export interface HomeworkCountsView {
  draft: number;
  confirmed: number;
  attemptedPortions: number;
  completedPortions: number;
  carriedOver: number;
}

export interface HomeworkListResponse {
  items: HomeworkAssignmentView[];
  nextCursor: string | null;
  /** Counts over every live assignment of the student (not just this page); rejected and superseded count nowhere. */
  counts: HomeworkCountsView;
}

export interface HomeworkSuggestionPortion {
  section: Section;
  position: number;
  paraNumber: number | null;
  range: AyahRangeValue | null;
  totalLines: number | null;
  assigned: QuantityValue | null;
  needsReview: boolean;
  sourceAttemptId: string;
  sourceLessonPortionId: string;
  sourceHomeworkPortionId: string | null;
  why: { status: PortionStatus; assigned: QuantityValue; completed: QuantityValue | null; reason: 'REMAINING' | 'UNIT_MISMATCH' | 'UNKNOWN' };
  sourceVersions: { lessonPortion: number | null; attempt: number | null };
}

export interface HomeworkSuggestionResponse {
  dailyRecordId: string;
  studentId: string;
  assignedDate: string;
  /** The next scheduled class day, or null when the class has none ahead. */
  defaultDueDate: string | null;
  /** Empty: "Nothing to carry forward". */
  portions: HomeworkSuggestionPortion[];
}

export interface ReviseHomeworkResponse {
  created: HomeworkAssignmentView;
  superseded: HomeworkAssignmentView;
}
