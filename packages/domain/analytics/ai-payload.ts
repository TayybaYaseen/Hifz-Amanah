// F15 · The minimized AI payload and its PII scanner (FR-AI-002, FR-AI-013, NFR-AI-002; US-063, US-065; F15-AC4,
// AC13…AC16; ARCHITECTURE.md §12). Pure, no I/O.
//
// The payload is the ONLY thing an AI provider ever sees. It is built from deterministic analytics and holds numbers,
// canonical enums, calendar dates, Para (and Surah/Ayah) numbers, the period, and a per-request pseudonym. It never holds
// a name, an id, contact details, notes, remarks, or any free text. A category the Admin turned off is omitted
// entirely (its key is absent, not empty). Missing values stay absent or null; they are never written as 0.
//
// Every number sits under a stable dotted key (e.g. `mistakes.totals.byCategory.TAJWEED`, `quality.firstHalfAverage`)
// so the server can check each number the AI cites (ai-output.ts). Before sending, the API runs `payloadTextScan` as a
// last line of defence.
import type { PeriodKind } from '../reports/period.ts';
import { MISTAKE_CATEGORIES, PORTION_STATUSES, type MistakeCategory, type PortionStatus } from '../hifz/status.ts';
import type { QuantityUnit } from '../quantity/quantity.ts';
import type { Quantity } from '../quantity/quantity.ts';
import { SECTIONS, type Section } from '../quantity/sections.ts';
import type { QualityAverage } from '../quality/quality.ts';
import type { MistakeBucket, QualityDirection, StudentAnalytics } from './metrics.ts';

/** The Admin-toggled data categories (FR-AI-013, DEC-B46). Names, contacts, and notes are never a category. */
export const AI_DATA_CATEGORIES = ['ATTENDANCE', 'PROGRESS', 'MISTAKES', 'QUALITY', 'HOMEWORK'] as const;
export type AiDataCategory = (typeof AI_DATA_CATEGORIES)[number];

/** The languages an AI answer can be requested in (FR-AI-014, DEC-B47). */
export const AI_LOCALES = ['en', 'ur', 'ur-Latn'] as const;
export type AiLocale = (typeof AI_LOCALES)[number];

export const AI_PAYLOAD_VERSION = 1;

/** A pseudonym: a short opaque token chosen by the API per request (never a name or an id). */
const PSEUDONYM = /^[A-Za-z][A-Za-z0-9-]{0,31}$/;

// ---------- Shape ----------

export interface AiFraction {
  numerator: number;
  denominator: number;
}

export type AiUnitTotals = Partial<Record<QuantityUnit, AiFraction>>;

export interface AiAttendance {
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
}

export interface AiSectionProgress {
  portions: number;
  statusCounts: Record<PortionStatus | 'NOT_RECORDED', number>;
  assigned: AiUnitTotals;
  completed: AiUnitTotals;
  remaining: AiUnitTotals;
  extraCompleted: AiUnitTotals;
  pending: number;
  /** Para numbers worked in the period (null-Para portions are left out). */
  paras: number[];
}

export interface AiMistakeBucket {
  attempts: number;
  recordedAttempts: number;
  noMistakesAttempts: number;
  notRecorded: number;
  byCategory: Record<MistakeCategory, number>;
  bySeverity: { MINOR: number; MAJOR: number };
  repeated: number;
  uncategorized: number;
  total: number;
}

export interface AiDifficulty {
  /** Set when the portions have a Para. */
  para?: number;
  /** Set only when there is no Para. */
  range?: { surahStart: number; ayahStart: number; surahEnd: number; ayahEnd: number };
  sections: Section[];
  attempts: number;
  majorOrRepeatedAttempts: number;
  notRememberedAttempts: number;
  byCategory: Record<MistakeCategory, number>;
}

export interface AiMistakes {
  totals: AiMistakeBucket;
  weeks: (AiMistakeBucket & { from: string; to: string })[];
  difficulties: AiDifficulty[];
}

export interface AiQuality {
  /** The scale is lower-is-better: 1 Excellent … 5 Weak. */
  scaleBest: 1;
  scaleWorst: 5;
  lowerIsBetter: true;
  /** Averages to 2 decimals, half up; absent when there are no ratings (never 0). */
  average?: number;
  averageNearestScore?: number;
  ratedCount: number;
  firstHalfAverage?: number;
  secondHalfAverage?: number;
  direction: QualityDirection;
  ratedPortions: number;
  unratedPortions: number;
  notApplicablePortions: number;
  limited: boolean;
  /** One point per day with ratings; days without ratings are left out (gaps, never 0). */
  points: { date: string; average: number; count: number }[];
}

export interface AiHomework {
  confirmed: number;
  drafts: number;
  assigned: number;
  attempted: number;
  completed: number;
  carriedForward: number;
  carriedOver: number;
  outstanding: number;
}

export interface AiPayload {
  version: typeof AI_PAYLOAD_VERSION;
  subject: string;
  locale: AiLocale;
  period: { kind: PeriodKind; from: string; to: string };
  recordedDays: number;
  dataInsufficient: boolean;
  /** The categories included, in canonical order. */
  categories: AiDataCategory[];
  attendance?: AiAttendance;
  progress?: Partial<Record<Section, AiSectionProgress>>;
  mistakes?: AiMistakes;
  quality?: AiQuality;
  homework?: AiHomework;
}

export interface MinimizeOptions {
  categories: Readonly<Record<AiDataCategory, boolean>>;
  pseudonym: string;
  locale: AiLocale;
}

// ---------- Builders ----------

const unitTotals = (qs: readonly Quantity[]): AiUnitTotals => {
  const out: AiUnitTotals = {};
  for (const q of qs) out[q.unit] = { numerator: q.numerator, denominator: q.denominator };
  return out;
};

/** An average to 2 decimals, half up, from its exact sum and count (no float drift). */
const twoDecimals = (sum: number, count: number): number => Math.floor((200 * sum + count) / (2 * count)) / 100;

const avg = (q: QualityAverage | null): number | undefined => (q && q.count > 0 ? twoDecimals(q.sum, q.count) : undefined);

function bucket(b: MistakeBucket): AiMistakeBucket {
  return {
    attempts: b.attempts,
    recordedAttempts: b.recordedAttempts,
    noMistakesAttempts: b.noMistakesAttempts,
    notRecorded: b.notRecorded,
    byCategory: Object.fromEntries(MISTAKE_CATEGORIES.map((c) => [c, b.byCategory[c]])) as Record<MistakeCategory, number>,
    bySeverity: { MINOR: b.bySeverity.MINOR, MAJOR: b.bySeverity.MAJOR },
    repeated: b.repeated,
    uncategorized: b.uncategorized,
    total: b.total,
  };
}

/** Removes undefined keys so the payload has no `"x": undefined` (an absent value stays absent, never 0). */
function compact<T extends object>(o: T): T {
  return Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined)) as T;
}

/**
 * The minimized, pseudonymous payload for one AI request (FR-AI-002, FR-AI-013). Only categories switched on are
 * included. Throws on a pseudonym that is not a short opaque token.
 */
export function minimizeForAi(analytics: StudentAnalytics, options: MinimizeOptions): AiPayload {
  if (!PSEUDONYM.test(options.pseudonym)) throw new RangeError('minimizeForAi: the pseudonym must be a short opaque token');
  const on = (c: AiDataCategory) => options.categories[c] === true;
  const payload: AiPayload = {
    version: AI_PAYLOAD_VERSION,
    subject: options.pseudonym,
    locale: options.locale,
    period: { kind: analytics.period.kind, from: analytics.period.from, to: analytics.period.to },
    recordedDays: analytics.recordedDays,
    dataInsufficient: analytics.insufficientData,
    categories: AI_DATA_CATEGORIES.filter(on),
  };

  if (on('ATTENDANCE')) {
    const a = analytics.attendance;
    payload.attendance = {
      scheduled: a.scheduled,
      attended: a.attended,
      present: a.present,
      late: a.late,
      halfDay: a.halfDay,
      leave: a.leave,
      leaveAwaiting: a.leaveAwaiting,
      absent: a.absent,
      notMarked: a.notMarked,
      holidays: a.holidays,
      closures: a.closures,
      noClass: a.noClass,
    };
  }

  if (on('PROGRESS')) {
    const progress: Partial<Record<Section, AiSectionProgress>> = {};
    for (const section of SECTIONS) {
      const s = analytics.progress.find((p) => p.section === section);
      if (!s || s.portionCount === 0) continue;
      progress[section] = {
        portions: s.portionCount,
        statusCounts: Object.fromEntries([...PORTION_STATUSES, 'NOT_RECORDED' as const].map((k) => [k, s.statusCounts[k]])) as AiSectionProgress['statusCounts'],
        assigned: unitTotals(s.totals.assigned),
        completed: unitTotals(s.totals.completed),
        remaining: unitTotals(s.totals.remaining),
        extraCompleted: unitTotals(s.extraTotals.completed),
        pending: s.pendingCount,
        paras: s.paras.flatMap((p) => (p.paraNumber === null ? [] : [p.paraNumber])),
      };
    }
    payload.progress = progress;
  }

  if (on('MISTAKES')) {
    payload.mistakes = {
      totals: bucket(analytics.mistakeTrend.totals),
      weeks: analytics.mistakeTrend.weeks.map((w) => ({ from: w.from, to: w.to, ...bucket(w) })),
      difficulties: analytics.difficultPortions.map((d) =>
        compact<AiDifficulty>({
          para: d.paraNumber ?? undefined,
          range: d.paraNumber === null && d.range ? { surahStart: d.range.surahStart, ayahStart: d.range.ayahStart, surahEnd: d.range.surahEnd, ayahEnd: d.range.ayahEnd } : undefined,
          sections: [...d.sections],
          attempts: d.attempts,
          majorOrRepeatedAttempts: d.majorOrRepeatedAttempts,
          notRememberedAttempts: d.notRememberedAttempts,
          byCategory: Object.fromEntries(MISTAKE_CATEGORIES.map((c) => [c, d.byCategory[c]])) as Record<MistakeCategory, number>,
        }),
      ),
    };
  }

  if (on('QUALITY')) {
    const q = analytics.qualityTrend;
    const c = analytics.qualityCoverage;
    payload.quality = compact<AiQuality>({
      scaleBest: 1,
      scaleWorst: 5,
      lowerIsBetter: true,
      average: avg(q.average),
      averageNearestScore: q.average.nearestScore ?? undefined,
      ratedCount: q.average.count,
      firstHalfAverage: avg(q.firstHalf),
      secondHalfAverage: avg(q.secondHalf),
      direction: q.direction,
      ratedPortions: c.rated,
      unratedPortions: c.unrated,
      notApplicablePortions: c.notApplicable,
      limited: c.limited,
      points: q.points.flatMap((p) => (p.value === null || p.count === 0 ? [] : [{ date: p.date, average: twoDecimals(Math.round(p.value * p.count), p.count), count: p.count }])),
    });
  }

  if (on('HOMEWORK')) {
    const h = analytics.homework;
    payload.homework = {
      confirmed: h.confirmed,
      drafts: h.drafts,
      assigned: h.assigned,
      attempted: h.attempted,
      completed: h.completed,
      carriedForward: h.carriedForward,
      carriedOver: h.carriedOver,
      outstanding: h.outstanding,
    };
  }

  return payload;
}

// ---------- Flattening (for citation checks) ----------

/** Every finite number in the payload under its dotted key, e.g. `mistakes.weeks.0.byCategory.TAJWEED`. */
export function flattenPayloadNumbers(payload: AiPayload): Map<string, number> {
  const out = new Map<string, number>();
  const walk = (value: unknown, path: string): void => {
    if (typeof value === 'number') {
      if (Number.isFinite(value)) out.set(path, value);
      return;
    }
    if (Array.isArray(value)) {
      value.forEach((v, i) => walk(v, path ? `${path}.${String(i)}` : String(i)));
      return;
    }
    if (value !== null && typeof value === 'object') {
      for (const [k, v] of Object.entries(value)) walk(v, path ? `${path}.${k}` : k);
    }
  };
  walk(payload, '');
  return out;
}

/** Every calendar date (YYYY-MM-DD) that appears as a value in the payload. */
export function payloadDates(payload: AiPayload): string[] {
  const out = new Set<string>();
  const walk = (value: unknown): void => {
    if (typeof value === 'string') {
      if (/^\d{4}-\d{2}-\d{2}$/.test(value)) out.add(value);
    } else if (Array.isArray(value)) value.forEach(walk);
    else if (value !== null && typeof value === 'object') Object.values(value).forEach(walk);
  };
  walk(payload);
  return [...out].sort();
}

// ---------- PII scanner ----------

/** Urdu (Extended Arabic-Indic) and Arabic-Indic digits → Latin digits. */
export function toLatinDigits(text: string): string {
  return text.replace(/[٠-٩۰-۹]/g, (d) => String((d.codePointAt(0)! - (d >= '۰' ? 0x06f0 : 0x0660)) % 10));
}

const EMAIL = /[^\s@"'<>(),;:]+@[^\s@"'<>(),;:]+\.[^\s@"'<>(),;:]+/u;
/** A run of digits with phone-style separators; a phone has 10 or more digits. Dates (8 digits) never qualify. */
const PHONE_RUN = /\+?\d[\d ().-]*\d/g;
export const PHONE_MIN_DIGITS = 10;

const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * The forbidden strings found anywhere in the serialized payload (FR-AI-002 scanner, F15-AC16). Each `forbidden` term
 * (a name, an email, a phone, a note marker or body, …) is matched case-insensitively as a whole word, so "Ali" does
 * not match inside "QUALITY". Any email-shaped or phone-shaped text is flagged as `[EMAIL]` / `[PHONE]` whatever the
 * list says; the matched text itself is not returned, so the result is safe to log. Empty result = clean.
 */
export function payloadTextScan(payload: AiPayload, forbidden: readonly string[]): string[] {
  const text = toLatinDigits(JSON.stringify(payload));
  const found: string[] = [];
  for (const raw of forbidden) {
    const term = raw.trim();
    if (term.length === 0) continue;
    const re = new RegExp(`(?<![\\p{L}\\p{N}])${escapeRegExp(toLatinDigits(term))}(?![\\p{L}\\p{N}])`, 'iu');
    if (re.test(text) && !found.includes(raw)) found.push(raw);
  }
  if (EMAIL.test(text)) found.push('[EMAIL]');
  for (const m of text.matchAll(PHONE_RUN)) {
    if (m[0].replace(/\D/g, '').length >= PHONE_MIN_DIGITS) {
      found.push('[PHONE]');
      break;
    }
  }
  return found;
}
