// F15 · Deterministic analytics (FR-AI-001, NFR-AI-002, NFR-OFF-008, AC-AI-02; US-062; F15-AC1…AC3; BR-8, BR-17;
// ARCHITECTURE.md §9.4). Pure, no I/O.
//
// Analytics are the source of truth for every AI explanation. They are derived from the same source rows as the F09
// report and reuse `buildReport`, so every rule (latest attempt per portion, totals per unit only, Extra kept apart,
// recorded ratings only, holidays never absences, records on a later holiday excluded) is applied in one place. This
// module only regroups what the report already computed, plus a weekly mistake trend read from the same included
// attempts and a direction for the quality trend.
//
// Quality is LOWER-IS-BETTER (1 Excellent … 5 Weak). The trend direction comes from `qualityTrend` in the quality
// module: a falling average is improvement. Missing ratings are gaps, never 0; unrecorded mistakes are "not recorded",
// never 0. Absence, Pending and Not Assigned are never failure.
import { weekOf, type WeekStart } from '../calendar/schedule.ts';
import type { AttendanceCounts } from '../calendar/attendance.ts';
import { addDays } from '../roster/dates.ts';
import { allowsQuality, type MistakeCategory, type MistakeSeverity } from '../hifz/status.ts';
import { mistakeCounts, type MistakeCounts } from '../mistakes/mistakes.ts';
import { qualityAverageOf, qualityTrend, type QualityAverage } from '../quality/quality.ts';
import type { Section } from '../quantity/sections.ts';
import {
  buildReport,
  type HomeworkMeasures,
  type ParaProgress,
  type QualityPoint,
  type RecurringDifficulty,
  type ReportAttempt,
  type ReportInput,
  type StatusCounts,
  type StudentReport,
  type UnitTotals,
} from '../reports/build-report.ts';
import type { ReportPeriod } from '../reports/period.ts';

// NOT APPROVED: placeholder threshold; the spec only says "2 records in a month" is insufficient. Confirm with the product owner.
export const ANALYTICS_MIN_RECORDED_DAYS = 3;

/** Rated points needed in EACH half of the quality trend before a direction is stated. */
export const QUALITY_TREND_MIN_POINTS_PER_HALF = 2;

// ---------- Output ----------

export interface SectionProgress {
  section: Section;
  /** Non-removed portions in the period (Extra included). */
  portionCount: number;
  /** Latest attempt per portion; NOT_RECORDED = no attempt yet (never failure). */
  statusCounts: StatusCounts;
  /** Regular portions, per unit; never summed across units. */
  totals: UnitTotals;
  /** Extra work, kept apart from assigned work (FR-QTY-006). */
  extraTotals: UnitTotals;
  /** Para-wise progress (Sabaq under its derived Para). */
  paras: ParaProgress[];
  /** Portions not finished on their latest attempt. */
  pendingCount: number;
}

export type SeverityCounts = Record<MistakeSeverity, number>;

export interface MistakeBucket {
  /** Attempts in the bucket (each attempt of a portion, as in the F09 counts). */
  attempts: number;
  /** Attempts with a known count (mistakes listed, an imported count, or an explicit "No mistakes"). */
  recordedAttempts: number;
  noMistakesAttempts: number;
  /** Attempts whose mistakes were not recorded: unknown, never 0. */
  notRecorded: number;
  byCategory: Record<MistakeCategory, number>;
  /** Severity only. */
  bySeverity: SeverityCounts;
  /** Repeated mistakes, counted apart: `repeated` is a flag, not a severity. */
  repeated: number;
  /** Imported uncategorized counts (F14), never split into categories. */
  uncategorized: number;
  total: number;
  /** false when no attempt in the bucket has a known count: show "no data", not zeros. */
  hasData: boolean;
}

export interface MistakeWeek extends MistakeBucket {
  /** The week's dates, clipped to the period. */
  from: string;
  to: string;
}

export interface MistakeTrend {
  weekStart: WeekStart;
  weeks: MistakeWeek[];
  totals: MistakeBucket;
}

export type QualityDirection = 'IMPROVING' | 'DECLINING' | 'STEADY' | 'NOT_ENOUGH_DATA';

export interface QualityTrendView {
  /** One point per daily record; value null = no ratings that day (a gap, never 0). */
  points: QualityPoint[];
  /** Exact average (`value`) with the nearest-score rule of the quality module (.5 rounds up). */
  average: QualityAverage;
  /** The chart axis: 1 · Excellent at the top, 5 · Weak at the bottom. */
  axis: { top: 1; bottom: 5 };
  /** Average of the rated points in the first and second half of the rated points; null when not stated. */
  firstHalf: QualityAverage | null;
  secondHalf: QualityAverage | null;
  /** A LOWER later average is IMPROVING. */
  direction: QualityDirection;
}

export interface QualityCoverage {
  /** Portions whose latest status carries a rating and that have one. */
  rated: number;
  /** Portions whose latest status carries a rating but none was recorded ("Not recorded", never 0). */
  unrated: number;
  /** Portions Absent, Not Assigned, Pending, or not recorded yet: no rating applies. */
  notApplicable: number;
  /** true when most ratable portions have no rating, or none has: "quality data is limited". */
  limited: boolean;
}

export type AnalyticsHomework = Omit<HomeworkMeasures, 'outstandingItems'>;

export interface StudentAnalytics {
  period: ReportPeriod;
  today: string;
  /** false → "No records for this period", never a page of zeros. */
  hasData: boolean;
  /** Distinct dates with at least one recorded attempt. */
  recordedDays: number;
  /** true → "Not enough data for this period"; trends are not drawn. */
  insufficientData: boolean;
  progress: SectionProgress[];
  mistakeTrend: MistakeTrend;
  qualityTrend: QualityTrendView;
  qualityCoverage: QualityCoverage;
  difficultPortions: RecurringDifficulty[];
  /** attended = Present + Late + Half day; Leave apart; holidays never absences (FR-CAL-005). */
  attendance: AttendanceCounts;
  homework: AnalyticsHomework;
  /** Device analytics with unsynced work or no connection (NFR-OFF-008, AC-AI-02); null when authoritative. */
  provisional: StudentReport['provisional'];
}

export interface AnalyticsOptions {
  /** Week start for the mistake trend; defaults to the period's (org-configured) week start, else Monday. */
  weekStart?: WeekStart;
}

// ---------- Helpers ----------

function bucketOf(counts: MistakeCounts, attempts: number): MistakeBucket {
  return {
    attempts,
    recordedAttempts: counts.recordedAttempts,
    noMistakesAttempts: counts.noMistakesAttempts,
    notRecorded: counts.notRecordedAttempts,
    byCategory: { ...counts.byCategory },
    bySeverity: { MINOR: counts.minor, MAJOR: counts.major },
    repeated: counts.repeated,
    uncategorized: counts.uncategorized,
    total: counts.total,
    hasData: counts.recordedAttempts > 0,
  };
}

const countable = (a: ReportAttempt) => ({ noMistakes: a.noMistakes, mistakes: a.mistakes, uncategorizedCount: a.uncategorizedCount ?? null });

/** The weeks that overlap the period, each clipped to it. */
function weeksOf(period: { from: string; to: string }, weekStart: WeekStart): { from: string; to: string }[] {
  const out: { from: string; to: string }[] = [];
  let cursor = period.from;
  while (cursor <= period.to) {
    const w = weekOf(cursor, weekStart);
    const from = w.from < period.from ? period.from : w.from;
    const to = w.to > period.to ? period.to : w.to;
    out.push({ from, to });
    cursor = addDays(w.to, 1);
  }
  return out;
}

function mistakeTrend(input: ReportInput, report: StudentReport, weekStart: WeekStart): MistakeTrend {
  // The attempts buildReport counted: the included records (in period, in scope, on a class day), non-removed portions.
  const included = new Set(report.days.map((d) => d.recordId));
  const dated = input.records
    .filter((r) => included.has(r.id))
    .flatMap((r) => r.portions.filter((p) => !p.removed).flatMap((p) => p.attempts.map((a) => ({ date: r.date, attempt: a }))));
  const weeks = weeksOf(report.period, weekStart).map((w) => {
    const inWeek = dated.filter((d) => d.date >= w.from && d.date <= w.to).map((d) => d.attempt);
    return { from: w.from, to: w.to, ...bucketOf(mistakeCounts(inWeek.map(countable)), inWeek.length) };
  });
  return { weekStart, weeks, totals: bucketOf(report.mistakes, dated.length) };
}

function qualityTrendView(report: StudentReport, insufficient: boolean): QualityTrendView {
  // report.qualityTrend and report.days are built from the same daily records, in the same order.
  const rated = report.days.filter((d) => d.quality.count > 0).map((d) => d.quality);
  const half = Math.floor(rated.length / 2);
  const enough = !insufficient && half >= QUALITY_TREND_MIN_POINTS_PER_HALF;
  const combine = (parts: readonly QualityAverage[]) =>
    qualityAverageOf(
      parts.reduce((n, q) => n + q.sum, 0),
      parts.reduce((n, q) => n + q.count, 0),
    );
  // An odd middle point belongs to neither half.
  const firstHalf = enough ? combine(rated.slice(0, half)) : null;
  const secondHalf = enough ? combine(rated.slice(rated.length - half)) : null;
  let direction: QualityDirection = 'NOT_ENOUGH_DATA';
  if (firstHalf && secondHalf) {
    // Lower is better: qualityTrend reads a falling average as IMPROVED.
    const t = qualityTrend(firstHalf.value, secondHalf.value);
    direction = t === 'IMPROVED' ? 'IMPROVING' : t === 'DECLINED' ? 'DECLINING' : t === 'UNCHANGED' ? 'STEADY' : 'NOT_ENOUGH_DATA';
  }
  return {
    points: report.qualityTrend.map((p) => ({ ...p })),
    average: report.quality,
    axis: { top: 1, bottom: 5 },
    firstHalf,
    secondHalf,
    direction,
  };
}

function qualityCoverage(report: StudentReport): QualityCoverage {
  let rated = 0;
  let unrated = 0;
  let notApplicable = 0;
  for (const line of report.days.flatMap((d) => d.portions)) {
    if (line.status === null || !allowsQuality(line.status)) notApplicable += 1;
    else if (line.quality === null) unrated += 1;
    else rated += 1;
  }
  return { rated, unrated, notApplicable, limited: rated === 0 || unrated > rated };
}

// ---------- buildAnalytics ----------

export function buildAnalytics(input: ReportInput, options: AnalyticsOptions = {}): StudentAnalytics {
  const report = buildReport(input);
  const weekStart = options.weekStart ?? report.period.weekStart;
  const recordedDays = new Set(report.days.filter((d) => d.portions.some((p) => p.status !== null)).map((d) => d.date)).size;
  const insufficientData = recordedDays < ANALYTICS_MIN_RECORDED_DAYS;
  const h = report.homework;
  const homework: AnalyticsHomework = {
    confirmed: h.confirmed,
    drafts: h.drafts,
    assigned: h.assigned,
    attempted: h.attempted,
    completed: h.completed,
    carriedForward: h.carriedForward,
    carriedOver: h.carriedOver,
    outstanding: h.outstanding,
  };
  return {
    period: report.period,
    today: report.today,
    hasData: report.hasData,
    recordedDays,
    insufficientData,
    progress: report.sections.map((s) => ({
      section: s.section,
      portionCount: s.portionCount,
      statusCounts: s.statusCounts,
      totals: s.totals,
      extraTotals: s.extraTotals,
      paras: s.paras,
      pendingCount: s.pending.length,
    })),
    mistakeTrend: mistakeTrend(input, report, weekStart),
    qualityTrend: qualityTrendView(report, insufficientData),
    qualityCoverage: qualityCoverage(report),
    difficultPortions: report.recurringDifficulties,
    attendance: report.attendance.counts,
    homework,
    provisional: report.provisional,
  };
}
