// F15 · Analytics display rules (US-062, US-063; F15-AC1…AC6, AC9, AC11, AC12, AC17; docs/handover/F15-ui-spec.md).
// Pure, tested with Vitest; the screen only renders their results. Every figure comes from @hifz/domain/analytics
// (the server's or, offline, the device's buildAnalytics); nothing here calculates a metric.
// - Quality is LOWER-IS-BETTER: the chart puts 1 · Excellent at the top and 5 · Weak at the bottom; a day without a
//   rating is a gap, never 0; the trend wording follows the domain's direction (a falling average is improvement).
// - Quantities are listed per unit, assigned beside completed of the SAME unit only; a unit with no known completed
//   amount reads "Not recorded", never 0.
// - The AI area is a separate, optional extra: hidden when AI is off or for Students/Parents, "AI needs a connection"
//   offline (no request, no cached text), and its failures never touch the calculated metrics.
import type { AiRecommendationResponse, AiState, Role } from '@hifz/contracts';
import type { QuantityUnit } from '@hifz/domain/quantity';
import { ApiFailure } from '../../api/client.ts';

// ---------- Source and provisional banner (F15-AC2, NFR-OFF-008) ----------

export type AnalyticsSource = 'SERVER' | 'DEVICE';

/**
 * Which figures to show: the server's (authoritative) when online and every change of this device is synced; the
 * device's, built with the same domain function and marked provisional, when offline or while changes wait to sync.
 */
export const analyticsSource = (input: { online: boolean; networkFailed: boolean; pendingChanges: number }): AnalyticsSource =>
  input.online && !input.networkFailed && input.pendingChanges <= 0 ? 'SERVER' : 'DEVICE';

export interface ProvisionalLike {
  pendingChanges: number;
  lastSyncedAt: string | null;
  offline: boolean;
}

/** The provisional banner's parts, or null for authoritative (server) figures. */
export function provisionalBanner(p: ProvisionalLike | null): { lastSyncedAt: string | null; pending: number } | null {
  if (!p) return null;
  return { lastSyncedAt: p.lastSyncedAt, pending: Math.max(0, p.pendingChanges) };
}

// ---------- Progress (F15-AC1) ----------

export interface QuantityLike {
  unit: QuantityUnit;
  numerator: number;
  denominator: number;
}

export interface ProgressPair {
  unit: QuantityUnit;
  assigned: QuantityLike | null;
  /** null = no completed amount is known for this unit ("Not recorded", never 0). */
  completed: QuantityLike | null;
}

/** Assigned and completed, paired by unit only (never summed or compared across units). */
export function progressPairs(totals: { assigned: readonly QuantityLike[]; completed: readonly QuantityLike[] }): ProgressPair[] {
  const units: QuantityUnit[] = [];
  for (const q of [...totals.assigned, ...totals.completed]) if (!units.includes(q.unit)) units.push(q.unit);
  return units.map((unit) => ({
    unit,
    assigned: totals.assigned.find((q) => q.unit === unit) ?? null,
    completed: totals.completed.find((q) => q.unit === unit) ?? null,
  }));
}

// ---------- Quality chart (F15-AC3) ----------

export interface QualityPointLike {
  date: string;
  value: number | null;
}

export type ChartColumn =
  | { index: number; date: string; gap: false; value: number; /** 0 = top (1 · Excellent), 1 = bottom (5 · Weak). */ offset: number; nearestScore: number }
  | { index: number; date: string; gap: true };

/** Nearest whole score of an exact value, .5 rounding up (1.5 → 2), for a label only. */
export const nearestScore = (value: number): number => Math.min(5, Math.max(1, Math.floor(value + 0.5)));

/**
 * The plotted columns, oldest first (the screen's layout direction mirrors them in Urdu). The Y offset puts 1 at the
 * top and 5 at the bottom in every locale; a day without ratings is a gap with no point.
 */
export function chartColumns(points: readonly QualityPointLike[]): ChartColumn[] {
  return [...points]
    .map((p, i) => ({ p, i }))
    .sort((a, b) => (a.p.date === b.p.date ? a.i - b.i : a.p.date < b.p.date ? -1 : 1))
    .map(({ p }, i) =>
      p.value === null
        ? { index: i + 1, date: p.date, gap: true as const }
        : { index: i + 1, date: p.date, gap: false as const, value: p.value, offset: (Math.min(5, Math.max(1, p.value)) - 1) / 4, nearestScore: nearestScore(p.value) },
    );
}

/** The chart's text summary values (best = lowest, weakest = highest; gaps = days without ratings). */
export function chartSummary(points: readonly QualityPointLike[]): { best: number | null; weakest: number | null; gaps: number; rated: number } {
  const rated = points.flatMap((p) => (p.value === null ? [] : [p.value]));
  return {
    best: rated.length ? Math.min(...rated) : null,
    weakest: rated.length ? Math.max(...rated) : null,
    gaps: points.length - rated.length,
    rated: rated.length,
  };
}

/** One decimal, half up, Western digits ("2.3"), for a per-day value that the domain gives as an exact number. */
export const oneDecimal = (value: number): string => (Math.round(value * 10) / 10).toFixed(1);

export interface HalfLike {
  display: string | null;
}

/**
 * The trend sentence from the domain's direction: IMPROVING (the average FELL; lower is better), DECLINING (it rose),
 * STEADY, or not enough ratings. Never "higher is better".
 */
export function trendMessage(direction: string, first: HalfLike | null, second: HalfLike | null): { key: string; params: Record<string, string> } {
  const from = first?.display ?? '';
  const to = second?.display ?? '';
  switch (direction) {
    case 'IMPROVING':
      return { key: 'analytics.quality.improving', params: { from, to } };
    case 'DECLINING':
      return { key: 'analytics.quality.worsening', params: { from, to } };
    case 'STEADY':
      return { key: 'analytics.quality.steady', params: {} };
    default:
      return { key: 'analytics.quality.notEnough', params: {} };
  }
}

// ---------- AI area (F15-AC4…AC6, AC9, AC11, AC12) ----------

export type AiFailure = 'HIDDEN' | 'NOT_CONFIGURED' | 'LIMIT' | 'UNAVAILABLE';

export type AiRequest =
  | { kind: 'NONE' }
  | { kind: 'LOADING'; slow: boolean }
  | { kind: 'READY'; response: AiRecommendationResponse }
  | { kind: 'FAILED'; failure: AiFailure };

export type AiView =
  | { state: 'hidden' }
  | { state: 'offline' }
  | { state: 'idle' }
  | { state: 'insufficient' }
  | { state: 'loading'; slow: boolean }
  | { state: 'ready'; response: AiRecommendationResponse }
  /** canConfigure: Owner/Admin see "AI provider not set up" and the settings link; Teachers see "AI unavailable". */
  | { state: 'notSetup'; canConfigure: boolean }
  | { state: 'error' }
  | { state: 'limit' };

const STAFF_ROLES: readonly Role[] = ['OWNER', 'ADMIN'];
const AI_ROLES: readonly Role[] = ['OWNER', 'ADMIN', 'TEACHER'];

/**
 * What the AI area shows. `serverState` is the last state the server reported for this screen (null offline before
 * any answer). Order: never for Student/Parent or when AI is off; then no connection; then the request's own outcome;
 * then the server's state; then too little data.
 */
export function aiView(input: { role: Role; online: boolean; serverState: AiState | null; insufficientData: boolean; request: AiRequest }): AiView {
  const { role, online, serverState, insufficientData, request } = input;
  if (!AI_ROLES.includes(role)) return { state: 'hidden' };
  if (serverState === 'DISABLED' || (request.kind === 'FAILED' && request.failure === 'HIDDEN')) return { state: 'hidden' };
  if (!online) return { state: 'offline' };
  const canConfigure = STAFF_ROLES.includes(role);
  if (request.kind === 'LOADING') return { state: 'loading', slow: request.slow };
  if (request.kind === 'READY') return { state: 'ready', response: request.response };
  if (request.kind === 'FAILED') {
    if (request.failure === 'NOT_CONFIGURED') return { state: 'notSetup', canConfigure };
    if (request.failure === 'LIMIT') return { state: 'limit' };
    return { state: 'error' };
  }
  if (serverState === 'NOT_CONFIGURED') return { state: 'notSetup', canConfigure };
  if (serverState === 'LIMIT_REACHED') return { state: 'limit' };
  // Online but the server has not said yet (loading, or its answer failed): offer nothing rather than guess.
  if (serverState === null) return { state: 'hidden' };
  if (insufficientData) return { state: 'insufficient' };
  return { state: 'idle' };
}

/** A failed AI request as an AI-area state. A timeout (no response within the limit) is "AI unavailable" (F15-AC6). */
export function aiFailureOf(err: unknown): AiFailure {
  if (!(err instanceof ApiFailure)) return 'UNAVAILABLE';
  const code: string = err.code;
  if (code === 'AI_DISABLED') return 'HIDDEN';
  if (code === 'AI_NOT_CONFIGURED') return 'NOT_CONFIGURED';
  if (code === 'AI_LIMIT_REACHED') return 'LIMIT';
  return 'UNAVAILABLE';
}

/** The AI client gives up after this long; "This is taking longer than usual…" shows after AI_SLOW_MS. */
export const AI_TIMEOUT_MS = 20_000;
export const AI_SLOW_MS = 10_000;

export const AI_CATEGORY_KEYS = ['ATTENDANCE', 'PROGRESS', 'MISTAKES', 'QUALITY', 'HOMEWORK'] as const;
export type AiCategoryKey = (typeof AI_CATEGORY_KEYS)[number];

const PREFIX_TO_CATEGORY: Record<string, AiCategoryKey> = {
  attendance: 'ATTENDANCE',
  progress: 'PROGRESS',
  mistakes: 'MISTAKES',
  quality: 'QUALITY',
  homework: 'HOMEWORK',
};

/** The data categories an answer's cited metric keys belong to (`mistakes.totals.byCategory.TAJWEED` → MISTAKES). */
export function metricCategories(metricsUsed: readonly string[]): AiCategoryKey[] {
  const found = new Set<AiCategoryKey>();
  for (const key of metricsUsed) {
    const category = PREFIX_TO_CATEGORY[key.split('.')[0] ?? ''];
    if (category) found.add(category);
  }
  return AI_CATEGORY_KEYS.filter((c) => found.has(c));
}

/** The UI locale sent with every AI request (F15-AC17), and the body the API expects. */
export const aiRequestBody = (kind: 'WEEK' | 'MONTH', date: string, locale: 'en' | 'ur' | 'ur-Latn') => ({ kind, date, locale });

/** Splits text into plain and cited-number runs, so numbers the answer cites can be bolded. */
export function citedRuns(text: string): { text: string; number: boolean }[] {
  const out: { text: string; number: boolean }[] = [];
  const re = /\d+(?:[.,/]\d+)?/g;
  let last = 0;
  for (const m of text.matchAll(re)) {
    const at = m.index ?? 0;
    if (at > last) out.push({ text: text.slice(last, at), number: false });
    out.push({ text: m[0], number: true });
    last = at + m[0].length;
  }
  if (last < text.length) out.push({ text: text.slice(last), number: false });
  return out;
}

// ---------- Access ----------

/** Analytics is for Teachers (assigned classes), Admins and Owners only; never Students or Parents (F15-AC9). */
export const canSeeAnalytics = (role: Role): boolean => AI_ROLES.includes(role);

/** Refusals that mean the class or student is no longer reachable: the screen clears its data and pickers. */
export const isRevoked = (err: unknown): boolean => err instanceof ApiFailure && (err.code === 'FORBIDDEN' || err.code === 'NOT_FOUND');
