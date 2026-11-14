// F07 · Quality Rating Scale, averages, and the overall performance label (FR-ATT-008, FR-ATT-009, FR-RPT-004,
// FR-AI-004; US-031, US-032; F07-AC6…AC13). Pure rules, no I/O.
//
// The approved scale (SRS FR-ATT-009) is LOWER-IS-BETTER: 1 Excellent … 5 Weak. This file is the single source of
// the score → label table for the app, PDFs, Excel exports, and charts. Only the integer score is stored; labels are
// for display. A missing score is NULL ("Not recorded"), never 0, and is excluded from averages.
//
// The overall performance label (EXCELLENT, GOOD, AVERAGE, NEEDS_IMPROVEMENT) is a separate, optional, once-per-record
// teacher choice. Nothing here converts between it and the score, in either direction.
import { allowsQuality, isQualityScore, QUALITY_MAX, QUALITY_MIN, type PortionStatus } from '../hifz/status.ts';

export { QUALITY_MAX, QUALITY_MIN, isQualityScore };

export const QUALITY_SCORES = [1, 2, 3, 4, 5] as const;
export type QualityScore = (typeof QUALITY_SCORES)[number];

/** Interface languages that show a quality label (FR-I18N). */
export const QUALITY_LOCALES = ['en', 'ur', 'ur-Latn'] as const;
export type QualityLocale = (typeof QUALITY_LOCALES)[number];

export interface QualityScaleEntry {
  score: QualityScore;
  /** Language-neutral key, for i18n catalogues and exports. */
  key: 'EXCELLENT' | 'GOOD' | 'AVERAGE' | 'NEEDS_IMPROVEMENT' | 'WEAK';
  labels: Readonly<Record<QualityLocale, string>>;
}

/** The approved Quality Rating Scale (SRS FR-ATT-009, approved 2026-10-30). 1 is the best. */
export const QUALITY_SCALE: readonly QualityScaleEntry[] = Object.freeze([
  { score: 1, key: 'EXCELLENT', labels: { en: 'Excellent', ur: 'ممتاز', 'ur-Latn': 'Mumtaz' } },
  { score: 2, key: 'GOOD', labels: { en: 'Good', ur: 'اچھا', 'ur-Latn': 'Achha' } },
  { score: 3, key: 'AVERAGE', labels: { en: 'Average', ur: 'اوسط', 'ur-Latn': 'Ausat' } },
  { score: 4, key: 'NEEDS_IMPROVEMENT', labels: { en: 'Needs Improvement', ur: 'مزید محنت کی ضرورت', 'ur-Latn': 'Mazeed mehnat ki zaroorat' } },
  { score: 5, key: 'WEAK', labels: { en: 'Weak', ur: 'کمزور', 'ur-Latn': 'Kamzor' } },
] as const);

const isLocale = (locale: string): locale is QualityLocale => (QUALITY_LOCALES as readonly string[]).includes(locale);

/** The approved label of a score in a language. Throws on a non-score: a label is never invented. */
export function qualityLabel(score: number, locale: QualityLocale): string {
  const entry = QUALITY_SCALE.find((e) => e.score === score);
  if (!entry || !isLocale(locale)) throw new RangeError(`qualityLabel: ${String(score)} / ${String(locale)} is not on the approved scale`);
  return entry.labels[locale];
}

/** Score → label for one language, as an i18n catalogue fragment (`{ "1": "Excellent", … }`). */
export function qualityLabelCatalogue(locale: QualityLocale): Record<`${QualityScore}`, string> {
  return Object.fromEntries(QUALITY_SCALE.map((e) => [String(e.score), e.labels[locale]])) as Record<`${QualityScore}`, string>;
}

/**
 * "{score} · {label}" with Western digits in every language (DEC-B38, FR-I18N-009): "1 · Excellent", "1 · ممتاز",
 * "1 · Mumtaz". Callers isolate the text for bidi when it sits inside RTL text.
 */
export const qualityText = (score: number, locale: QualityLocale): string => `${String(score)} · ${qualityLabel(score, locale)}`;

export interface QualityOption {
  /** null is "Not assessed" (nothing stored). */
  score: QualityScore | null;
  /** The option text; null for "Not assessed", which the UI localizes. */
  text: string | null;
}

/**
 * The quality selector (F07-AC6, design.md §4.7): "Not assessed" first and selected by default, then 1 … 5 in that
 * order with their approved labels. Never pre-selects a score.
 */
export function qualitySelector(locale: QualityLocale): { selected: null; options: QualityOption[] } {
  return {
    selected: null,
    options: [{ score: null, text: null }, ...QUALITY_SCALE.map((e) => ({ score: e.score, text: qualityText(e.score, locale) }))],
  };
}

// ---------- Missing ratings ----------

/** How a stored score is shown: the score, or "Not recorded" for NULL (F07-AC7). Never 0. */
export type QualityDisplay = { kind: 'SCORE'; score: QualityScore } | { kind: 'NOT_RECORDED' };

export function qualityDisplay(stored: number | null | undefined): QualityDisplay {
  if (stored === null || stored === undefined) return { kind: 'NOT_RECORDED' };
  if (!isQualityScore(stored)) throw new RangeError('qualityDisplay: a stored quality must be 1–5 or NULL');
  return { kind: 'SCORE', score: stored as QualityScore };
}

/**
 * The score an attempt contributes to an average: its quality when the status carries one (COMPLETED, PARTIAL,
 * NOT_REMEMBERED) and it was recorded; otherwise nothing. ABSENT, NOT_ASSIGNED, and PENDING never count, even if a
 * value was somehow stored (F07-AC10, FR-ATT-007).
 */
export function countedScore(attempt: { status: PortionStatus; quality: number | null }): QualityScore | null {
  if (!allowsQuality(attempt.status) || attempt.quality === null || !isQualityScore(attempt.quality)) return null;
  return attempt.quality as QualityScore;
}

// ---------- Averages ----------

export interface QualityAverage {
  /** Ratings used; NULLs are not ratings (FR-RPT-004). */
  count: number;
  /** Sum of the ratings used (exact integer). */
  sum: number;
  /** Exact average, sum / count; null with no ratings ("Not recorded"). Reports and analytics use this value. */
  value: number | null;
  /** The average to one decimal, half up, as text with Western digits ("1.7"); null with no ratings. */
  display: string | null;
  /** Nearest whole score, .5 rounding up to the higher number (1.5 → 2); null with no ratings. Display only. */
  nearestScore: QualityScore | null;
}

/**
 * Average of the recorded scores (F07-AC8, AC9; FR-ATT-009, FR-RPT-004). NULL is excluded, never 0. Integer arithmetic
 * keeps the rounding exact: 1.5 is 2, 1.45 (from 29/20) is 1 for the label and "1.5" for one decimal.
 */
export function qualityAverage(scores: readonly (number | null | undefined)[]): QualityAverage {
  let sum = 0;
  let count = 0;
  for (const s of scores) {
    if (s === null || s === undefined) continue;
    if (!isQualityScore(s)) throw new RangeError('qualityAverage: a score must be an integer 1–5 or NULL');
    sum += s;
    count += 1;
  }
  if (count === 0) return { count: 0, sum: 0, value: null, display: null, nearestScore: null };
  // Half up to a whole score: floor((2·sum + count) / (2·count)).
  const nearest = Math.floor((2 * sum + count) / (2 * count));
  // Half up to one decimal, in tenths: floor((20·sum + count) / (2·count)).
  const tenths = Math.floor((20 * sum + count) / (2 * count));
  return {
    count,
    sum,
    value: sum / count,
    display: `${String(Math.floor(tenths / 10))}.${String(tenths % 10)}`,
    nearestScore: Math.min(QUALITY_MAX, Math.max(QUALITY_MIN, nearest)) as QualityScore,
  };
}

/** The average of attempts' scores, counting only what `countedScore` counts (F07-AC10). */
export const attemptsQualityAverage = (attempts: readonly { status: PortionStatus; quality: number | null }[]): QualityAverage =>
  qualityAverage(attempts.map(countedScore));

/** The label of an average's nearest score, or null when there were no ratings. */
export const averageLabel = (avg: QualityAverage, locale: QualityLocale): string | null =>
  avg.nearestScore === null ? null : qualityLabel(avg.nearestScore, locale);

// ---------- Direction (lower is better) ----------

export type QualityTrend = 'IMPROVED' | 'DECLINED' | 'UNCHANGED' | 'UNKNOWN';

/**
 * Direction between two averages. Lower is better, so a FALLING average is an improvement (FR-ATT-009). Missing on
 * either side is UNKNOWN, never a change from zero.
 */
export function qualityTrend(previous: number | null, current: number | null): QualityTrend {
  if (previous === null || current === null) return 'UNKNOWN';
  if (current < previous) return 'IMPROVED';
  if (current > previous) return 'DECLINED';
  return 'UNCHANGED';
}

// ---------- Overall performance label (US-032) ----------

/** The four overall labels (FR-ATT-009 note, design.md §4.7). Not quality scores; not converted to or from them. */
export const OVERALL_LABELS = ['EXCELLENT', 'GOOD', 'AVERAGE', 'NEEDS_IMPROVEMENT'] as const;
export type OverallLabel = (typeof OVERALL_LABELS)[number];

export const isOverallLabel = (value: unknown): value is OverallLabel => typeof value === 'string' && (OVERALL_LABELS as readonly string[]).includes(value);

export interface RecordPerformance {
  /** The record's overall label exactly as the Teacher chose it, or null when not chosen (F07-AC13). */
  overallLabel: OverallLabel | null;
  /** The portions' recorded scores, as stored; each NULL stays NULL. */
  portionScores: (QualityScore | null)[];
  /** The average of the recorded scores. */
  quality: QualityAverage;
}

/**
 * The performance a daily record shows (F07-AC12, AC13): its one overall label and its portions' quality, side by
 * side. Neither is filled in from the other: no label leaves the label null whatever the scores are, and no scores
 * leave every score null whatever the label is.
 */
export function recordPerformance(record: { overallLabel: OverallLabel | null }, attempts: readonly { status: PortionStatus; quality: number | null }[]): RecordPerformance {
  if (record.overallLabel !== null && !isOverallLabel(record.overallLabel)) throw new RangeError('recordPerformance: unknown overall label');
  const portionScores = attempts.map(countedScore);
  return { overallLabel: record.overallLabel, portionScores, quality: qualityAverage(portionScores) };
}
