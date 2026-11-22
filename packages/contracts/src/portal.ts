// Student and Parent access contracts (F10; US-044…046; FR-PORT-001…007, FR-SEC-004…006, FR-RPT-010, NFR-PORT-001…006;
// DEC-B33, DEC-B36, DEC-B37). Plan: docs/handover/F10-plan.md.
//
// Three groups of routes:
// - Portal (Student, Parent): online and read-only. A Student sees their own published reports; a Parent sees the
//   published reports of students they are verified-linked to. There is no search. Anything outside that, including
//   an unpublished period and a revoked link, is 404, identical to a missing id (F10-AC2, AC3, AC6, AC7). Every
//   payload leaves through projectFor(audience): internal notes, Leave reasons, draft homework, AI output, audit and
//   sync details are absent, not blanked (FR-PORT-006, F10-AC10, AC17).
// - Publishing (Teacher for assigned classes, Owner, Admin): publish or unpublish a week or month for a class or one
//   student. Refused with a reason while changes for the period are not on the server (F10-AC13, AC14). Audited.
// - Family access (Owner, Admin): link a Student login to its student record, and link, re-verify, or revoke a
//   Parent after verifying them offline; the method is required and recorded (FR-PORT-007, F10-AC8, AC16). Audited.
import { z } from 'zod';
import type { MistakeCategory, MistakeSeverity, OverallLabel, PortionStatus, Section } from './hifz.ts';
import type { HomeworkState } from './homework.ts';
import {
  REPORT_PERIOD_KINDS,
  type ReportAttendanceCounts,
  type ReportDayCategory,
  type ReportDayView,
  type ReportMistakeCounts,
  type ReportPeriodKind,
  type ReportPeriodView,
  type ReportQualityAverage,
  type ReportQuantity,
  type ReportRangeView,
  type ReportRecurringDifficultyView,
  type ReportStatusCounts,
  type ReportUnitTotals,
} from './reports.ts';

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const uuid = z.uuid();

/** Page size of the published-report list (NFR-PERF-001). */
export const PORTAL_REPORTS_PAGE_SIZE = 25;

// ---------- Portal (Student, Parent) ----------

/** GET /portal/students: the students the caller may follow. A Student: themself; a Parent: verified, active links. */
export interface PortalStudentsResponse {
  items: { id: string; name: string }[];
}

/** GET /portal/reports?studentId&kind&cursor: that student's published periods, newest first. */
export const PortalReportListQuery = z.strictObject({
  studentId: uuid,
  kind: z.enum(REPORT_PERIOD_KINDS).optional(),
  /** The `nextCursor` of the previous page. */
  cursor: z.string().max(100).optional(),
});
export type PortalReportListQuery = z.infer<typeof PortalReportListQuery>;

export interface PortalReportListItem {
  /** The published report's id (GET /portal/reports/:id). */
  id: string;
  kind: ReportPeriodKind;
  from: string;
  to: string;
  publishedAt: string;
  /** Set once a correction changed what the family sees after publishing ("Updated on …", F10-AC15). */
  updatedAt: string | null;
}

export interface PortalReportListResponse {
  items: PortalReportListItem[];
  nextCursor: string | null;
}

/** A portion line as a Student or Parent sees it: remarks and a mistake's note only when the Teacher shared them. */
export interface FamilyPortionLineView {
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
  mistakes: { category: MistakeCategory; severity: MistakeSeverity; repeated: boolean; note?: string }[];
  /** Present only when the Teacher made the remark "Visible to student/guardian". */
  remarks?: string;
  attempts: { attemptNo: number; attemptedAt: string; status: PortionStatus; completed: ReportQuantity | null; quality: number | null; mistakeCount: number | null }[];
}

export interface FamilySectionView {
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
    /** Only confirmed homework carrying this work forward; a draft suggestion is never shown (FR-PORT-006). */
    carriedInto: { assignmentId: string; state: HomeworkState } | null;
  }[];
  quality: ReportQualityAverage;
  mistakes: ReportMistakeCounts;
}

/** The FR-PORT-006 field set of a published report. No draft counts, Leave reasons, notes, AI, audit, or sync state. */
export interface FamilyReportView {
  period: ReportPeriodView;
  student: { id: string; name: string };
  classes: { classId: string; from: string; to: string }[];
  hasData: boolean;
  attendance: { counts: ReportAttendanceCounts; days: ReportDayView[] };
  sections: FamilySectionView[];
  days: {
    recordId: string;
    date: string;
    classId: string;
    sessionLabel: string | null;
    overallLabel: OverallLabel | null;
    attendance: ReportDayCategory | null;
    portions: FamilyPortionLineView[];
    quality: ReportQualityAverage;
  }[];
  quality: ReportQualityAverage;
  qualityTrend: { date: string; recordId: string; value: number | null; count: number }[];
  mistakes: ReportMistakeCounts;
  overallLabels: Record<OverallLabel | 'NOT_CHOSEN', number>;
  recurringDifficulties: ReportRecurringDifficultyView[];
  /** Confirmed homework only. */
  homework: {
    confirmed: number;
    assigned: number;
    attempted: number;
    completed: number;
    carriedForward: number;
    carriedOver: number;
    outstanding: number;
    outstandingItems: { id: string; assignedDate: string; dueDate: string; state: HomeworkState; carriedOverReason: string | null; portionCount: number }[];
  };
}

/** GET /portal/reports/:id. */
export interface PortalReportResponse {
  id: string;
  publishedAt: string;
  updatedAt: string | null;
  /** The teachers of the report's classes during the period (FR-PORT-006 "the teacher's name"). */
  teachers: { name: string }[];
  report: FamilyReportView;
  generatedAt: string;
}

// ---------- Publishing (Teacher for assigned classes, Owner, Admin) ----------

export const PUBLISH_REFUSALS = ['UNSYNCED_CHANGES', 'PERIOD_NOT_STARTED'] as const;
export type PublishRefusalCode = (typeof PUBLISH_REFUSALS)[number];

const target = { classId: uuid.optional(), studentId: uuid.optional() };
const exactlyOneTarget = (v: { classId?: string | undefined; studentId?: string | undefined }) => (v.classId === undefined) !== (v.studentId === undefined);

/**
 * POST /reports/publish: publishes the period holding `date` for a class (every student enrolled in it during the
 * period) or one student. `pendingChanges` is the publishing device's count of changes not yet acknowledged by the
 * server; anything above 0 refuses (F10-AC14). The server also refuses while a sync conflict is open for the period.
 */
export const PublishReportsRequest = z
  .strictObject({ kind: z.enum(REPORT_PERIOD_KINDS), date: isoDate, ...target, pendingChanges: z.number().int().min(0).max(1_000_000) })
  .refine(exactlyOneTarget, { message: 'TARGET_REQUIRED', path: ['classId'] });
export type PublishReportsRequest = z.infer<typeof PublishReportsRequest>;

/** POST /reports/unpublish: the period disappears from Student and Parent views on their next request. */
export const UnpublishReportsRequest = z.strictObject({ kind: z.enum(REPORT_PERIOD_KINDS), date: isoDate, ...target }).refine(exactlyOneTarget, { message: 'TARGET_REQUIRED', path: ['classId'] });
export type UnpublishReportsRequest = z.infer<typeof UnpublishReportsRequest>;

/** GET /reports/publication?kind&date&classId|studentId: whether each student's report for the period is published. */
export const PublicationQuery = z.strictObject({ kind: z.enum(REPORT_PERIOD_KINDS), date: isoDate.optional(), ...target }).refine(exactlyOneTarget, { message: 'TARGET_REQUIRED', path: ['classId'] });
export type PublicationQuery = z.infer<typeof PublicationQuery>;

export interface PublicationItem {
  studentId: string;
  studentName: string;
  publishedAt: string | null;
  updatedAt: string | null;
}

export interface PublicationResponse {
  period: ReportPeriodView;
  items: PublicationItem[];
}

export interface PublishReportsResponse {
  period: ReportPeriodView;
  /** How many students' reports were published (or unpublished). */
  count: number;
}

// ---------- Family access (Owner, Admin) ----------

/** How the Admin verified the Parent, offline (FR-PORT-007): in person, or against the madrasa's own records. */
export const GUARDIAN_VERIFICATION_METHODS = ['IN_PERSON', 'MADRASA_RECORDS'] as const;
export type GuardianVerificationMethod = (typeof GUARDIAN_VERIFICATION_METHODS)[number];

/** POST /students/:id/guardians. The method is required (F10-AC16). */
export const LinkGuardianRequest = z.strictObject({ parentUserId: uuid, verificationMethod: z.enum(GUARDIAN_VERIFICATION_METHODS) });
export type LinkGuardianRequest = z.infer<typeof LinkGuardianRequest>;

/** POST /guardian-links/:id/verify: records a new verification of an active link. */
export const VerifyGuardianRequest = z.strictObject({ verificationMethod: z.enum(GUARDIAN_VERIFICATION_METHODS) });
export type VerifyGuardianRequest = z.infer<typeof VerifyGuardianRequest>;

/** POST /students/:id/student-account: the Student login that sees this student's reports. */
export const LinkStudentAccountRequest = z.strictObject({ userId: uuid });
export type LinkStudentAccountRequest = z.infer<typeof LinkStudentAccountRequest>;

export interface FamilyAccountRef {
  userId: string;
  loginId: string;
  displayName: string;
}

export interface GuardianLinkView {
  id: string;
  parent: FamilyAccountRef;
  verificationMethod: GuardianVerificationMethod;
  verifiedAt: string;
  verifiedBy: string;
  linkedAt: string;
  /** null while the link gives access. */
  revokedAt: string | null;
}

/** GET /students/:id/access. */
export interface StudentAccessResponse {
  studentId: string;
  studentAccount: (FamilyAccountRef & { linkedAt: string }) | null;
  /** Active links first, then revoked ones (kept for history). */
  guardians: GuardianLinkView[];
}
