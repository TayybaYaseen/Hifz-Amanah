// Roster contracts shared by the API and the app (F03; FR-CLS-001…003, FR-STU-001…006, NFR-PERF-001, NFR-PRV-001,
// DEC-B14, DEC-B56…B59). Organization, role, and scope always come from the signed-in membership: every request
// schema is strict, so a body carrying `organizationId`, a status, or a field outside DEC-B56 is rejected.
import { z } from 'zod';

export const ROSTER_STATUSES = ['ACTIVE', 'INACTIVE'] as const;
export type RosterStatus = (typeof ROSTER_STATUSES)[number];

export const CLASS_NAME_MAX = 100;
export const STUDENT_NAME_MAX = 200;
export const EXTERNAL_STUDENT_ID_MAX = 50;
export const PRIVATE_NOTES_MAX = 2000;
export const CLASS_TEACHERS_MAX = 20;

/** Student lists load 25 per page, more on scroll (NFR-PERF-001, DEC-B59). */
export const STUDENT_PAGE_SIZE = 25;
export const STUDENT_PAGE_SIZE_MAX = 100;

/** Field issue codes the roster returns in `error.fields` (clients map them to localized messages). */
export const ROSTER_FIELD_ISSUES = {
  /** Blank after trimming (F03-AC2). */
  REQUIRED: 'REQUIRED',
  /** "Class name already in use" (F03-AC14) or "External Student ID already in use" (F03-AC7). */
  TAKEN: 'TAKEN',
  INVALID: 'INVALID',
  /** The student's open enrollment is already in this class. */
  SAME_CLASS: 'SAME_CLASS',
  /** A move must start after the current enrollment started. */
  BEFORE_CURRENT_START: 'BEFORE_CURRENT_START',
  /** Without an open enrollment, the new one must start after the last one ended. */
  OVERLAPS_HISTORY: 'OVERLAPS_HISTORY',
  /** A new student or an enrollment needs an active class. */
  CLASS_INACTIVE: 'CLASS_INACTIVE',
} as const;

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const uuid = z.uuid();

// ---------- Classes (US-010) ----------

/** Owner/Admin. A blank name is reported as `fields.name: REQUIRED` (F03-AC2); teachers may be none or several. */
export const CreateClassRequest = z.strictObject({
  name: z.string().max(CLASS_NAME_MAX),
  teacherIds: z.array(uuid).max(CLASS_TEACHERS_MAX).default([]),
});
export type CreateClassRequest = z.infer<typeof CreateClassRequest>;

/** `teacherIds`, when given, is the full new set of assigned Teachers. */
export const UpdateClassRequest = z.strictObject({
  name: z.string().max(CLASS_NAME_MAX).optional(),
  teacherIds: z.array(uuid).max(CLASS_TEACHERS_MAX).optional(),
});
export type UpdateClassRequest = z.infer<typeof UpdateClassRequest>;

export const ListClassesQuery = z.strictObject({
  status: z.enum([...ROSTER_STATUSES, 'ALL']).default('ALL'),
});
export type ListClassesQuery = z.infer<typeof ListClassesQuery>;

export interface ClassTeacher {
  userId: string;
  displayName: string;
}

export interface ClassResponse {
  id: string;
  name: string;
  status: RosterStatus;
  teachers: ClassTeacher[];
  /** Active students enrolled in the class today (the deactivation warning lists them). */
  activeStudentCount: number;
  /** Whether the caller may edit, deactivate, or reactivate the class (Owner/Admin). The server enforces it regardless. */
  canManage: boolean;
}

export interface ClassListResponse {
  items: ClassResponse[];
}

/** Active Teachers of the madrasa, for the class form's teacher picker (Owner/Admin). */
export interface TeacherOptionsResponse {
  items: ClassTeacher[];
}

// ---------- Students (US-011) ----------

/**
 * Only name and class are required; roll number / External Student ID, admission date, and private notes are
 * optional. There is no date of birth, address, phone, or photo field (F03-AC17, DEC-B56, NFR-PRV-001).
 */
export const CreateStudentRequest = z.strictObject({
  name: z.string().max(STUDENT_NAME_MAX),
  classId: uuid,
  externalStudentId: z.string().max(EXTERNAL_STUDENT_ID_MAX).nullish(),
  admissionDate: isoDate.nullish(),
  privateNotes: z.string().max(PRIVATE_NOTES_MAX).nullish(),
});
export type CreateStudentRequest = z.infer<typeof CreateStudentRequest>;

/** The class is not editable here: moving a student is a separate, Owner/Admin-only action (DEC-B14). */
export const UpdateStudentRequest = z.strictObject({
  name: z.string().max(STUDENT_NAME_MAX).optional(),
  externalStudentId: z.string().max(EXTERNAL_STUDENT_ID_MAX).nullish(),
  admissionDate: isoDate.nullish(),
  privateNotes: z.string().max(PRIVATE_NOTES_MAX).nullish(),
});
export type UpdateStudentRequest = z.infer<typeof UpdateStudentRequest>;

/** Owner/Admin: enroll a student in a class from a date. A student already in a class is moved (F03-AC11, AC18). */
export const EnrollStudentRequest = z.strictObject({
  classId: uuid,
  startDate: isoDate,
});
export type EnrollStudentRequest = z.infer<typeof EnrollStudentRequest>;

/** Search by name or External Student ID; filter by class and status; server-side keyset pages (F03-AC8, AC19). */
export const ListStudentsQuery = z.strictObject({
  q: z.string().max(100).optional(),
  classId: uuid.optional(),
  status: z.enum([...ROSTER_STATUSES, 'ALL']).default('ACTIVE'),
  cursor: z.string().max(400).optional(),
  limit: z.coerce.number().int().min(1).max(STUDENT_PAGE_SIZE_MAX).default(STUDENT_PAGE_SIZE),
});
export type ListStudentsQuery = z.infer<typeof ListStudentsQuery>;

export interface ClassRef {
  id: string;
  name: string;
}

export interface StudentSummary {
  id: string;
  name: string;
  /** Shown in lists so students with the same name can be told apart (F03 edge cases). */
  externalStudentId: string | null;
  status: RosterStatus;
  /** The class the student is in today, or null. */
  currentClass: ClassRef | null;
  /** A class the student moves to on a later date (future-dated enrollment), or null. */
  upcomingClass: (ClassRef & { startDate: string }) | null;
}

export interface StudentListResponse {
  items: StudentSummary[];
  /** Pass as `cursor` for the next page; null on the last page. */
  nextCursor: string | null;
}

export interface EnrollmentResponse {
  id: string;
  classId: string;
  className: string;
  startDate: string;
  /** Inclusive; null while open-ended. */
  endDate: string | null;
}

export interface StudentResponse extends StudentSummary {
  admissionDate: string | null;
  /** Internal staff notes. Staff-only route; never sent to a Student or Parent. */
  privateNotes: string | null;
  /** Oldest first (F03-AC13). */
  enrollments: EnrollmentResponse[];
  /** What the caller may do; the server enforces each regardless. */
  canEdit: boolean;
  /** Deactivate, reactivate, and move are Owner/Admin only (DEC-B14). */
  canManage: boolean;
}

// ---------- Entry pickers (F03-AC4, AC9, AC10; used by F04/F05) ----------

export const EntryStudentsQuery = z.strictObject({ date: isoDate.optional() });
export type EntryStudentsQuery = z.infer<typeof EntryStudentsQuery>;

export interface EntryClassesResponse {
  items: ClassRef[];
}

export interface EntryStudentsResponse {
  date: string;
  items: Array<Pick<StudentSummary, 'id' | 'name' | 'externalStudentId'>>;
}
