// F09 · Class summary (FR-RPT-011, DEC-B35; US-073; F09-AC18). Pure, no I/O.
//
// Staff only: one row per student enrolled in the class during the period, each row taken from that student's own
// buildReport() with the class as its scope, so a student who moved mid-period shows only the days in this class
// (F09 edge case). Nothing here is stored or editable. Rows carry no notes or remarks of any kind.
//
// `classSummaryExportRows` is the flat, notes-free row set the PDF (F13) and Excel (F14) exports will render, so both
// files hold the same rows and values as the screen (F09-AC20, deferred to those features).
import { fractionText, type Quantity } from '../quantity/quantity.ts';
import { SECTIONS, type Section } from '../quantity/sections.ts';
import type { QualityAverage } from '../quality/quality.ts';
import type { ReportPeriod } from './period.ts';
import type { StudentReport } from './build-report.ts';

export interface ClassSummaryRow {
  studentId: string;
  studentName: string;
  /** The days of the period the student was in this class. */
  enrolledFrom: string;
  enrolledTo: string;
  hasData: boolean;
  attendance: {
    scheduled: number;
    attended: number;
    present: number;
    late: number;
    halfDay: number;
    leave: number;
    leaveAwaiting: number;
    absent: number;
    notMarked: number;
  };
  /** Completed per section, per unit (latest attempt per portion; never across units). Extra work apart. */
  completed: Record<Section, Quantity[]>;
  extraCompleted: Record<Section, Quantity[]>;
  quality: QualityAverage;
  /** Confirmed homework given by the period's end and not yet fully attempted. */
  outstandingHomework: number;
}

export interface ClassSummary {
  classId: string;
  period: ReportPeriod;
  today: string;
  rows: ClassSummaryRow[];
}

/** One summary row from a student's report built with `scope: [classId]`; null when the student was not in the class. */
export function classSummaryRow(report: StudentReport, classId: string): ClassSummaryRow | null {
  const spans = report.classes.filter((c) => c.classId === classId);
  const first = spans[0];
  const last = spans.at(-1);
  if (!first || !last) return null;
  const c = report.attendance.counts;
  const bySection = (pick: 'totals' | 'extraTotals') =>
    Object.fromEntries(SECTIONS.map((s) => [s, report.sections.find((x) => x.section === s)?.[pick].completed ?? []])) as Record<Section, Quantity[]>;
  return {
    studentId: report.student.id,
    studentName: report.student.name,
    enrolledFrom: first.from,
    enrolledTo: last.to,
    hasData: report.hasData,
    attendance: {
      scheduled: c.scheduled,
      attended: c.attended,
      present: c.present,
      late: c.late,
      halfDay: c.halfDay,
      leave: c.leave,
      leaveAwaiting: c.leaveAwaiting,
      absent: c.absent,
      notMarked: c.notMarked,
    },
    completed: bySection('totals'),
    extraCompleted: bySection('extraTotals'),
    quality: report.quality,
    outstandingHomework: report.homework.outstanding,
  };
}

/** The class summary: one row per student in the class during the period, by name (F09-AC18). */
export function classSummary(classId: string, period: ReportPeriod, today: string, reports: readonly StudentReport[]): ClassSummary {
  const rows = reports.flatMap((r) => {
    const row = classSummaryRow(r, classId);
    return row ? [row] : [];
  });
  rows.sort((a, b) => a.studentName.localeCompare(b.studentName) || a.studentId.localeCompare(b.studentId));
  return { classId, period, today, rows };
}

// ---------- Export rows (F09-AC20; rendered by F13 PDF and F14 Excel) ----------

export const CLASS_SUMMARY_COLUMNS = [
  'studentName',
  'scheduled',
  'attended',
  'present',
  'late',
  'halfDay',
  'leave',
  'absent',
  'sabaqCompleted',
  'sabqiCompleted',
  'manzilCompleted',
  'qualityAverage',
  'qualityRatings',
  'outstandingHomework',
] as const;
export type ClassSummaryColumn = (typeof CLASS_SUMMARY_COLUMNS)[number];

/** Per-unit totals as language-neutral text: "12 LINES; 3/4 PARA". Empty when nothing was completed. */
export const unitTotalsText = (totals: readonly Quantity[]): string => totals.map((q) => `${fractionText(q)} ${q.unit}`).join('; ');

/**
 * The summary as flat rows with canonical values (unit codes, numbers; labels are localized by the renderer). A missing
 * average is null ("Not recorded"), never 0. There is no column that could hold a note.
 */
export function classSummaryExportRows(summary: ClassSummary, unitText: (totals: readonly Quantity[]) => string = unitTotalsText): Record<ClassSummaryColumn, string | number | null>[] {
  const unitTotalsText = unitText;
  return summary.rows.map((r) => ({
    studentName: r.studentName,
    scheduled: r.attendance.scheduled,
    attended: r.attendance.attended,
    present: r.attendance.present,
    late: r.attendance.late,
    halfDay: r.attendance.halfDay,
    leave: r.attendance.leave,
    absent: r.attendance.absent,
    sabaqCompleted: unitTotalsText(r.completed.SABAQ),
    sabqiCompleted: unitTotalsText(r.completed.SABQI),
    manzilCompleted: unitTotalsText(r.completed.MANZIL),
    qualityAverage: r.quality.display,
    qualityRatings: r.quality.count,
    outstandingHomework: r.outstandingHomework,
  }));
}
