// F09 · buildReport(): one student's weekly or monthly report, derived from the source records (FR-WKR-001…008,
// FR-MNR-001…007, FR-RPT-001…009, FR-CAL-005, NFR-OFF-008; US-039…043; ARCHITECTURE.md §9.3). Pure, no I/O.
// Plan: docs/handover/F09-plan.md.
//
// Nothing here is stored or editable: the API and the app load the period's source rows and call this function, so a
// corrected record changes the next report (F09-AC3). The rules it applies, each from its own domain module:
// - Attendance is reported apart from performance. Scheduled days come from the class timetable minus exceptions;
//   holidays, closures, no-class and unscheduled days are never absences; days outside the student's enrollment (or
//   outside the viewer's classes) are not counted at all (F09-AC11, AC12, AC13, AC17; FR-CAL-005).
// - A record saved on a date that has since become a non-class day is excluded, never deleted (FR-CAL-009).
// - Current progress uses the latest attempt per portion; the assigned quantity counts once (F09-AC5, BR-16).
// - Quantities are totalled per unit only; lines and Para fractions are never added (F09-AC4, FR-RPT-005).
// - Quality averages use recorded ratings only and report how many (F09-AC7, FR-RPT-004). Like the F07 summary, every
//   attempt in the period is a recitation with its own rating and mistakes; "Not recorded" is never 0.
// - Draft homework is counted apart from confirmed homework (F09-AC6, FR-RPT-007).
// - Recurring difficulty: a Para (or, without a Para, a range) with a Major or Repeated mistake in 3 or more attempts,
//   or Not Remembered 3 or more times, in the period (F09-AC10, DEC-B34).
//
// The result is the staff view: it carries attempt remarks and mistake notes with their visibility. Outbound payloads
// for other audiences go through the API's projectFor(), which removes internal text (F09-AC15).
import { countDays, dayCategory, emptyCounts, type AttendanceCounts, type AttendanceStatus, type DayCategory, type LeaveStatus } from '../calendar/attendance.ts';
import { datesBetween, dayInfo, type CalendarException, type DayKind, type ScheduleVersion } from '../calendar/schedule.ts';
import type { HomeworkPortionProgress, HomeworkState } from '../homework/due.ts';
import type { HomeworkStatus } from '../homework/lifecycle.ts';
import { attemptHistory, portionProgress } from '../hifz/progress.ts';
import { PORTION_STATUSES, type MistakeCategory, type MistakeSeverity, type PortionStatus } from '../hifz/status.ts';
import { attemptMistakeCount, mistakeCounts, type MistakeCounts, type NoteVisibility } from '../mistakes/mistakes.ts';
import { countedScore, qualityAverage, type OverallLabel, type QualityAverage } from '../quality/quality.ts';
import { totalsByUnit, type Quantity } from '../quantity/quantity.ts';
import { SECTIONS, type Section } from '../quantity/sections.ts';
import { enrollmentOn, type Enrollment } from '../roster/enrollment.ts';
import { inPeriod, type ReportPeriod } from './period.ts';

// ---------- Input: the period's source rows ----------

export interface ReportRange {
  surahStart: number;
  ayahStart: number;
  surahEnd: number;
  ayahEnd: number;
}

export interface ReportAttendanceRow {
  date: string;
  classId: string;
  status: AttendanceStatus;
  leaveStatus: LeaveStatus;
}

export interface ReportMistake {
  category: MistakeCategory;
  severity: MistakeSeverity;
  repeated: boolean;
  /** Staff text; INTERNAL unless the Teacher shared it (FR-ATT-012). */
  note: string | null;
  noteVisibility: NoteVisibility;
}

export interface ReportAttempt {
  id: string;
  attemptNo: number;
  attemptedAt: string;
  status: PortionStatus;
  completed: Quantity | null;
  quality: number | null;
  noMistakes: boolean;
  mistakes: readonly ReportMistake[];
  /** An imported uncategorized MistakeCount (F14), or null. */
  uncategorizedCount?: number | null;
  /** Staff text (FR-WKR-008); a Student or Parent sees it only when the Teacher made it SHARED (FR-PORT-003, F10). */
  remarks: string | null;
  /** INTERNAL ("Private to staff", the default) or SHARED ("Visible to student/guardian"). Absent means INTERNAL. */
  remarksVisibility?: NoteVisibility;
}

export interface ReportPortion {
  id: string;
  section: Section;
  position: number;
  isExtra: boolean;
  /** Sabqi/Manzil: the chosen Para; Sabaq: the Para derived from the range. */
  paraNumber: number | null;
  range: ReportRange | null;
  assigned: Quantity;
  /** Sabaq only: Total Lines as confirmed by the Teacher. */
  totalLines: number | null;
  /** Removed portions keep their rows for audit but leave the record and every total. */
  removed: boolean;
  attempts: readonly ReportAttempt[];
}

export interface ReportRecord {
  id: string;
  date: string;
  classId: string;
  sessionLabel: string | null;
  overallLabel: OverallLabel | null;
  portions: readonly ReportPortion[];
}

export interface ReportHomeworkPortion {
  id: string;
  section: Section;
  paraNumber: number | null;
  assigned: Quantity | null;
  /** Carried forward from an earlier attempt (a suggestion, or a Teacher's edit of one), not added by hand. */
  carriedForward: boolean;
  /** The lesson portion the remaining work came from, when carried forward. */
  sourceLessonPortionId: string | null;
  removed: boolean;
  progress: HomeworkPortionProgress;
}

export interface ReportHomework {
  id: string;
  classId: string;
  status: HomeworkStatus;
  /** The display state as computed by @hifz/domain/homework (homeworkState) on `today`. */
  state: HomeworkState;
  assignedDate: string;
  dueDate: string;
  carriedOverReason: string | null;
  portions: readonly ReportHomeworkPortion[];
}

/** What the device knows about unsynced work (NFR-OFF-008). The server never passes it. */
export interface ReportSyncState {
  offline: boolean;
  pendingChanges: number;
  lastSyncedAt: string | null;
}

export interface ReportInput {
  period: ReportPeriod;
  /** Today in the madrasa's timezone: later days are not counted yet. */
  today: string;
  student: { id: string; name: string };
  enrollments: readonly Enrollment[];
  /** The classes the viewer reaches, or null for the whole madrasa (Owner, Admin, "all classes"). */
  scope: readonly string[] | null;
  schedules: readonly ScheduleVersion[];
  exceptions: readonly CalendarException[];
  attendance: readonly ReportAttendanceRow[];
  records: readonly ReportRecord[];
  homework: readonly ReportHomework[];
  sync?: ReportSyncState | null;
}

// ---------- Output ----------

export type ReportDayKind = DayKind | 'NOT_ENROLLED';

export interface ReportDay {
  date: string;
  /** The class the student was in that day (within the viewer's scope), or null. */
  classId: string | null;
  kind: ReportDayKind;
  category: DayCategory;
  /** The holiday, closure, or no-class label, when the day has one. */
  exceptionLabel: string | null;
}

export interface UnitTotals {
  /** Per unit; never summed across units. */
  assigned: Quantity[];
  /** Only portions whose completed amount is known; missing is never zero. */
  completed: Quantity[];
  remaining: Quantity[];
  /** Portions with no attempt yet. */
  notRecorded: number;
}

export type StatusCounts = Record<PortionStatus | 'NOT_RECORDED', number>;

export interface ReportAttemptSummary {
  attemptNo: number;
  attemptedAt: string;
  status: PortionStatus;
  completed: Quantity | null;
  quality: number | null;
  /** null = "Not recorded"; 0 only for an explicit "No mistakes". */
  mistakeCount: number | null;
}

export interface ReportPortionLine {
  portionId: string;
  recordId: string;
  date: string;
  section: Section;
  position: number;
  isExtra: boolean;
  paraNumber: number | null;
  range: ReportRange | null;
  totalLines: number | null;
  assigned: Quantity;
  /** The latest attempt's status; null = not recorded yet (never failure). */
  status: PortionStatus | null;
  completed: Quantity | null;
  remaining: Quantity | null;
  quality: number | null;
  mistakeCount: number | null;
  /** The latest attempt's mistakes, with their notes and visibility (staff view). */
  mistakes: ReportMistake[];
  /** The latest attempt's remarks (staff text, INTERNAL unless the Teacher shared it). */
  remarks: string | null;
  remarksVisibility: NoteVisibility;
  /** Every attempt, oldest first (FR-RPT-006: full history stays available, never double-counted). */
  attempts: ReportAttemptSummary[];
}

export interface ReportDailyRecord {
  recordId: string;
  date: string;
  classId: string;
  sessionLabel: string | null;
  overallLabel: OverallLabel | null;
  attendance: DayCategory | null;
  /** Each portion on its own line, Sabaq, Sabqi, Manzil, by position (F09-AC14). */
  portions: ReportPortionLine[];
  quality: QualityAverage;
}

export interface ParaProgress {
  /** null groups the portions without a Para. */
  paraNumber: number | null;
  portionCount: number;
  totals: UnitTotals;
  statusCounts: StatusCounts;
}

export interface PendingPortion {
  portionId: string;
  date: string;
  paraNumber: number | null;
  range: ReportRange | null;
  assigned: Quantity;
  completed: Quantity | null;
  /** null when the completed amount is unknown. */
  remaining: Quantity | null;
  status: PortionStatus | null;
  /** Live homework carrying this portion's remaining work forward, if any. */
  carriedInto: { assignmentId: string; status: HomeworkStatus; state: HomeworkState } | null;
}

export interface SectionReport {
  section: Section;
  /** Non-removed portions in the period (Extra included). */
  portionCount: number;
  /** Regular (non-Extra) portions; the assigned quantity counts once per portion (BR-16). */
  totals: UnitTotals;
  /** Extra work, kept apart from the assigned work (FR-QTY-006). */
  extraTotals: UnitTotals;
  statusCounts: StatusCounts;
  /** Para-wise progress (FR-MNR-004): Sabaq under its derived Para. */
  paras: ParaProgress[];
  /** Portions not finished on their latest attempt (FR-MNR-004). */
  pending: PendingPortion[];
  quality: QualityAverage;
  mistakes: MistakeCounts;
}

export interface QualityPoint {
  date: string;
  recordId: string;
  /** The day's average (lower is better); null = no ratings that day (a gap, never 0). */
  value: number | null;
  count: number;
}

export interface RecurringDifficulty {
  paraNumber: number | null;
  /** Set only when the portions have no Para. */
  range: ReportRange | null;
  sections: Section[];
  attempts: number;
  /** Attempts with at least one Major or Repeated mistake. */
  majorOrRepeatedAttempts: number;
  notRememberedAttempts: number;
  /** Mistakes by category over every attempt of this Para in the period. */
  byCategory: Record<MistakeCategory, number>;
  /** The dates of the attempts that make it a difficulty. */
  dates: string[];
}

export interface HomeworkMeasures {
  /** Confirmed assignments given in the period (AC-RPT-06). */
  confirmed: number;
  /** Draft suggestions in the period, never counted as homework given. */
  drafts: number;
  /** FR-MNR-005, by portion of confirmed homework given in the period: */
  assigned: number;
  attempted: number;
  completed: number;
  carriedForward: number;
  /** Confirmed assignments given in the period whose due day was missed (FR-HW-016): outstanding, never failed. */
  carriedOver: number;
  /** Confirmed assignments given by the period's end that are not fully attempted (FR-WKR-007). */
  outstanding: number;
  outstandingItems: { id: string; assignedDate: string; dueDate: string; state: HomeworkState; carriedOverReason: string | null; portionCount: number }[];
}

export interface StudentReport {
  period: ReportPeriod;
  today: string;
  student: { id: string; name: string };
  /** The classes the student was in during the period, within the viewer's scope (a move shows both, F09 edge case). */
  classes: { classId: string; from: string; to: string }[];
  /** false → "No records for this period", never a page of zeros. */
  hasData: boolean;
  attendance: { counts: AttendanceCounts; days: ReportDay[] };
  sections: SectionReport[];
  /** Daily record history (FR-WKR-002): only days with recorded work; absent days never appear here (F09-AC11). */
  days: ReportDailyRecord[];
  /** Records on a date that has since become a non-class day: excluded, kept (FR-CAL-009). */
  excludedRecords: { recordId: string; date: string; kind: ReportDayKind }[];
  quality: QualityAverage;
  qualityTrend: QualityPoint[];
  mistakes: MistakeCounts;
  overallLabels: Record<OverallLabel | 'NOT_CHOSEN', number>;
  recurringDifficulties: RecurringDifficulty[];
  homework: HomeworkMeasures;
  /** Set on a device report with unsynced work or no connection (NFR-OFF-008); null when authoritative. */
  provisional: { pendingChanges: number; lastSyncedAt: string | null; offline: boolean } | null;
}

/** The thresholds of DEC-B34 (FR-MNR-006). */
export const RECURRING_DIFFICULTY_MIN_ATTEMPTS = 3;

// ---------- Helpers ----------

const emptyStatusCounts = (): StatusCounts => Object.fromEntries([...PORTION_STATUSES, 'NOT_RECORDED'].map((s) => [s, 0])) as StatusCounts;

const emptyCategories = (): Record<MistakeCategory, number> =>
  ({ HARKAAT: 0, TAJWEED: 0, LAFZI: 0, AYAT_BHOOLNA: 0, TARTEEB: 0, WAQF_IBTIDA: 0 }) satisfies Record<MistakeCategory, number>;

const SECTION_RANK: Record<Section, number> = { SABAQ: 0, SABQI: 1, MANZIL: 2 };

function totalsOf(lines: readonly ReportPortionLine[]): UnitTotals {
  return {
    assigned: totalsByUnit(lines.map((l) => l.assigned)),
    completed: totalsByUnit(lines.flatMap((l) => (l.completed ? [l.completed] : []))),
    remaining: totalsByUnit(lines.flatMap((l) => (l.remaining ? [l.remaining] : []))),
    notRecorded: lines.filter((l) => l.status === null).length,
  };
}

function statusCountsOf(lines: readonly ReportPortionLine[]): StatusCounts {
  const out = emptyStatusCounts();
  for (const l of lines) out[l.status ?? 'NOT_RECORDED'] += 1;
  return out;
}

const qualityOf = (attempts: readonly ReportAttempt[]): QualityAverage => qualityAverage(attempts.map(countedScore));

const countsOf = (attempts: readonly ReportAttempt[]): MistakeCounts =>
  mistakeCounts(attempts.map((a) => ({ noMistakes: a.noMistakes, mistakes: a.mistakes, uncategorizedCount: a.uncategorizedCount ?? null })));

/** Unfinished on the latest attempt: Partial or Not Remembered with work left (or unknown), Pending, or not recorded. */
function isPending(line: ReportPortionLine): boolean {
  if (line.isExtra) return false;
  if (line.status === null || line.status === 'PENDING') return true;
  if (line.status !== 'PARTIAL' && line.status !== 'NOT_REMEMBERED') return false;
  return line.remaining === null || line.remaining.numerator > 0;
}

const rangeKey = (r: ReportRange | null): string => (r ? `${r.surahStart}:${r.ayahStart}-${r.surahEnd}:${r.ayahEnd}` : 'none');

function lineOf(record: ReportRecord, portion: ReportPortion): ReportPortionLine {
  const history = attemptHistory(portion.attempts);
  const progress = portionProgress(
    { assigned: portion.assigned },
    history.map((a) => ({ attemptNo: a.attemptNo, status: a.status, completed: a.completed, quality: a.quality })),
  );
  const latest = history.at(-1) ?? null;
  const countOf = (a: ReportAttempt): number | null => {
    const state = attemptMistakeCount({ noMistakes: a.noMistakes, mistakes: a.mistakes, uncategorizedCount: a.uncategorizedCount ?? null });
    return state.kind === 'COUNT' ? state.count : null;
  };
  return {
    portionId: portion.id,
    recordId: record.id,
    date: record.date,
    section: portion.section,
    position: portion.position,
    isExtra: portion.isExtra,
    paraNumber: portion.paraNumber,
    range: portion.range,
    totalLines: portion.totalLines,
    assigned: portion.assigned,
    status: progress.currentStatus,
    completed: progress.completed,
    remaining: progress.remaining,
    quality: progress.quality,
    mistakeCount: latest ? countOf(latest) : null,
    mistakes: latest ? latest.mistakes.map((m) => ({ ...m })) : [],
    remarks: latest?.remarks ?? null,
    remarksVisibility: latest?.remarksVisibility === 'SHARED' ? 'SHARED' : 'INTERNAL',
    attempts: history.map((a) => ({ attemptNo: a.attemptNo, attemptedAt: a.attemptedAt, status: a.status, completed: a.completed, quality: a.quality, mistakeCount: countOf(a) })),
  };
}

function paraProgress(lines: readonly ReportPortionLine[]): ParaProgress[] {
  const groups = new Map<number | null, ReportPortionLine[]>();
  for (const l of lines) groups.set(l.paraNumber, [...(groups.get(l.paraNumber) ?? []), l]);
  return [...groups.entries()]
    .sort(([a], [b]) => (a === null ? 1 : b === null ? -1 : a - b))
    .map(([paraNumber, group]) => {
      const regular = group.filter((l) => !l.isExtra);
      return { paraNumber, portionCount: group.length, totals: totalsOf(regular), statusCounts: statusCountsOf(group) };
    });
}

function recurringDifficulties(entries: readonly { section: Section; date: string; portion: ReportPortion }[]): RecurringDifficulty[] {
  interface Group {
    paraNumber: number | null;
    range: ReportRange | null;
    sections: Set<Section>;
    attempts: { date: string; attempt: ReportAttempt }[];
  }
  const groups = new Map<string, Group>();
  for (const e of entries) {
    const key = e.portion.paraNumber !== null ? `para:${e.portion.paraNumber}` : `range:${rangeKey(e.portion.range)}`;
    const g = groups.get(key) ?? { paraNumber: e.portion.paraNumber, range: e.portion.paraNumber === null ? e.portion.range : null, sections: new Set<Section>(), attempts: [] };
    g.sections.add(e.section);
    for (const attempt of e.portion.attempts) g.attempts.push({ date: e.date, attempt });
    groups.set(key, g);
  }
  const out: RecurringDifficulty[] = [];
  for (const g of groups.values()) {
    if (g.paraNumber === null && g.range === null) continue;
    const marked = g.attempts.filter(({ attempt }) => attempt.mistakes.some((m) => m.severity === 'MAJOR' || m.repeated));
    const notRemembered = g.attempts.filter(({ attempt }) => attempt.status === 'NOT_REMEMBERED');
    const byMistakes = marked.length >= RECURRING_DIFFICULTY_MIN_ATTEMPTS;
    const byNotRemembered = notRemembered.length >= RECURRING_DIFFICULTY_MIN_ATTEMPTS;
    if (!byMistakes && !byNotRemembered) continue;
    const byCategory = emptyCategories();
    for (const { attempt } of g.attempts) for (const m of attempt.mistakes) byCategory[m.category] += 1;
    const dates = new Set<string>([...(byMistakes ? marked : []), ...(byNotRemembered ? notRemembered : [])].map((x) => x.date));
    out.push({
      paraNumber: g.paraNumber,
      range: g.range,
      sections: SECTIONS.filter((s) => g.sections.has(s)),
      attempts: g.attempts.length,
      majorOrRepeatedAttempts: marked.length,
      notRememberedAttempts: notRemembered.length,
      byCategory,
      dates: [...dates].sort(),
    });
  }
  return out.sort((a, b) => (a.paraNumber ?? 999) - (b.paraNumber ?? 999) || rangeKey(a.range).localeCompare(rangeKey(b.range)));
}

function homeworkMeasures(period: ReportPeriod, items: readonly ReportHomework[]): HomeworkMeasures {
  const out: HomeworkMeasures = { confirmed: 0, drafts: 0, assigned: 0, attempted: 0, completed: 0, carriedForward: 0, carriedOver: 0, outstanding: 0, outstandingItems: [] };
  for (const h of items) {
    const given = inPeriod(period, h.assignedDate);
    const active = h.portions.filter((p) => !p.removed);
    if (given && h.status === 'DRAFT') out.drafts += 1;
    if (h.status !== 'CONFIRMED') continue;
    if (given) {
      out.confirmed += 1;
      out.assigned += active.length;
      out.attempted += active.filter((p) => p.progress.attempted).length;
      out.completed += active.filter((p) => p.progress.status === 'COMPLETED').length;
      out.carriedForward += active.filter((p) => p.carriedForward).length;
      if (h.state === 'CARRIED_OVER') out.carriedOver += 1;
    }
    if (h.assignedDate <= period.to && h.state !== 'ATTEMPTED') {
      out.outstanding += 1;
      out.outstandingItems.push({ id: h.id, assignedDate: h.assignedDate, dueDate: h.dueDate, state: h.state, carriedOverReason: h.carriedOverReason, portionCount: active.length });
    }
  }
  out.outstandingItems.sort((a, b) => a.dueDate.localeCompare(b.dueDate) || a.id.localeCompare(b.id));
  return out;
}

/** Whether a report built on the device is provisional (NFR-OFF-008, F09-AC16). */
export function provisionalOf(sync: ReportSyncState | null | undefined): StudentReport['provisional'] {
  if (!sync) return null;
  if (!sync.offline && sync.pendingChanges <= 0) return null;
  return { pendingChanges: Math.max(0, sync.pendingChanges), lastSyncedAt: sync.lastSyncedAt, offline: sync.offline };
}

// ---------- buildReport ----------

export function buildReport(input: ReportInput): StudentReport {
  const { period, today, scope } = input;
  const reaches = (classId: string | null): classId is string => classId !== null && (scope === null || scope.includes(classId));

  // Attendance: one entry per calendar date of the period (F09-AC12, AC17).
  const attendanceByDate = new Map<string, ReportAttendanceRow>();
  for (const a of input.attendance) if (inPeriod(period, a.date) && reaches(a.classId)) attendanceByDate.set(a.date, a);
  const days: ReportDay[] = datesBetween(period.from, period.to).map((date) => {
    const classId = enrollmentOn(input.enrollments, date)?.classId ?? null;
    if (!reaches(classId)) return { date, classId: null, kind: 'NOT_ENROLLED', category: 'NOT_ENROLLED', exceptionLabel: null };
    const info = dayInfo(classId, date, input.schedules, input.exceptions);
    const row = attendanceByDate.get(date);
    const record = row && row.classId === classId ? { status: row.status, leaveStatus: row.leaveStatus } : null;
    return { date, classId, kind: info.kind, category: dayCategory({ dayKind: info.kind, enrolled: true, date, today, record }), exceptionLabel: info.exception?.label ?? null };
  });
  const counts = days.length ? countDays(days.map((d) => d.category)) : emptyCounts();
  const categoryOn = new Map(days.map((d) => [d.date, d.category]));

  // The classes of the period, from the days the student was in a class the viewer reaches.
  const classes: StudentReport['classes'] = [];
  for (const d of days) {
    if (!d.classId) continue;
    const last = classes.at(-1);
    if (last && last.classId === d.classId) last.to = d.date;
    else classes.push({ classId: d.classId, from: d.date, to: d.date });
  }

  // Performance: records in scope on class days (FR-CAL-009 excludes the rest).
  const excludedRecords: StudentReport['excludedRecords'] = [];
  const included: ReportRecord[] = [];
  for (const r of input.records) {
    if (!inPeriod(period, r.date) || !reaches(r.classId)) continue;
    const kind = dayInfo(r.classId, r.date, input.schedules, input.exceptions).kind;
    if (kind !== 'SCHEDULED') {
      excludedRecords.push({ recordId: r.id, date: r.date, kind });
      continue;
    }
    included.push(r);
  }
  included.sort((a, b) => a.date.localeCompare(b.date) || (a.sessionLabel ?? '').localeCompare(b.sessionLabel ?? '') || a.id.localeCompare(b.id));

  const live = (r: ReportRecord) => r.portions.filter((p) => !p.removed).sort((a, b) => SECTION_RANK[a.section] - SECTION_RANK[b.section] || a.position - b.position || a.id.localeCompare(b.id));
  const dailyRecords: ReportDailyRecord[] = included
    .map((r) => {
      const portions = live(r);
      return {
        recordId: r.id,
        date: r.date,
        classId: r.classId,
        sessionLabel: r.sessionLabel,
        overallLabel: r.overallLabel,
        attendance: categoryOn.get(r.date) ?? null,
        portions: portions.map((p) => lineOf(r, p)),
        quality: qualityOf(portions.flatMap((p) => p.attempts)),
      };
    })
    .filter((d) => d.portions.length > 0);

  const allLines = dailyRecords.flatMap((d) => d.portions);
  const entries = included.flatMap((r) => live(r).map((portion) => ({ section: portion.section, date: r.date, portion })));
  const allAttempts = entries.flatMap((e) => e.portion.attempts);

  // Live homework that carries a portion's remaining work forward.
  const carriedInto = new Map<string, PendingPortion['carriedInto']>();
  for (const h of input.homework) {
    if (h.status !== 'DRAFT' && h.status !== 'CONFIRMED') continue;
    for (const p of h.portions) if (!p.removed && p.sourceLessonPortionId) carriedInto.set(p.sourceLessonPortionId, { assignmentId: h.id, status: h.status, state: h.state });
  }

  const sections: SectionReport[] = SECTIONS.map((section) => {
    const lines = allLines.filter((l) => l.section === section);
    const attempts = entries.filter((e) => e.section === section).flatMap((e) => e.portion.attempts);
    return {
      section,
      portionCount: lines.length,
      totals: totalsOf(lines.filter((l) => !l.isExtra)),
      extraTotals: totalsOf(lines.filter((l) => l.isExtra)),
      statusCounts: statusCountsOf(lines),
      paras: paraProgress(lines),
      pending: lines.filter(isPending).map((l) => ({
        portionId: l.portionId,
        date: l.date,
        paraNumber: l.paraNumber,
        range: l.range,
        assigned: l.assigned,
        completed: l.completed,
        remaining: l.remaining,
        status: l.status,
        carriedInto: carriedInto.get(l.portionId) ?? null,
      })),
      quality: qualityOf(attempts),
      mistakes: countsOf(attempts),
    };
  });

  const overallLabels: StudentReport['overallLabels'] = { EXCELLENT: 0, GOOD: 0, AVERAGE: 0, NEEDS_IMPROVEMENT: 0, NOT_CHOSEN: 0 };
  for (const d of dailyRecords) overallLabels[d.overallLabel ?? 'NOT_CHOSEN'] += 1;

  const homework = homeworkMeasures(
    period,
    input.homework.filter((h) => reaches(h.classId)),
  );
  const hasAttendance = days.some((d) => d.category !== 'NOT_ENROLLED' && d.category !== 'NOT_MARKED' && d.category !== 'FUTURE' && d.kind === 'SCHEDULED');
  const hasHomework = homework.confirmed + homework.drafts > 0;

  return {
    period,
    today,
    student: { id: input.student.id, name: input.student.name },
    classes,
    hasData: hasAttendance || dailyRecords.length > 0 || hasHomework,
    attendance: { counts, days },
    sections,
    days: dailyRecords,
    excludedRecords,
    quality: qualityOf(allAttempts),
    qualityTrend: dailyRecords.map((d) => ({ date: d.date, recordId: d.recordId, value: d.quality.value, count: d.quality.count })),
    mistakes: countsOf(allAttempts),
    overallLabels,
    recurringDifficulties: recurringDifficulties(entries),
    homework,
    provisional: provisionalOf(input.sync),
  };
}
