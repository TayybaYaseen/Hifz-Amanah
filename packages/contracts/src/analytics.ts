// Analytics and AI recommendation contracts (F15; FR-AI-001…014, NFR-AI-001…004, NFR-OFF-008, AC-AI-01…04; US-062…065;
// ARCHITECTURE.md §9.4, §12).
//
// Analytics are deterministic, derived from source records by @hifz/domain/analytics (buildAnalytics), and are the
// source of truth; the shapes below mirror `StudentAnalytics`. AI is an optional online extra for Teachers and Admins
// only: it receives a minimized, pseudonymous payload, its answer is validated strictly (`AiOutput`) and checked against
// the numbers sent, and it never writes to records.
//
// Quality is LOWER-IS-BETTER (1 Excellent … 5 Weak). A missing value is null ("Not recorded"), never 0. Quantities are
// exact `{unit, numerator, denominator}` and listed per unit (never summed across units).
//
// Routes (staff only: Owner, Admin, assigned Teacher; Students and Parents are refused, F15-AC9):
//   GET   /analytics/:studentId?kind&date            → StudentAnalyticsResponse
//   POST  /analytics/:studentId/ai-recommendation    → AiRecommendationResponse   (body AiRecommendationRequest)
//   GET   /analytics/ai-settings                     → AiSettingsResponse          (Owner/Admin)
//   PUT   /analytics/ai-settings                     → AiSettingsResponse          (Owner/Admin; body UpdateAiSettingsRequest)
import { z } from 'zod';
import { MISTAKE_CATEGORIES, MISTAKE_SEVERITIES, PORTION_STATUSES, QUANTITY_UNITS, SECTIONS } from './hifz.ts';
import { REPORT_PERIOD_KINDS } from './reports.ts';

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const uuid = z.uuid();
const count = z.number().int().min(0);
const paraNumber = z.number().int().min(1).max(30);

// ---------- Queries ----------

export const AnalyticsParams = z.strictObject({ studentId: uuid });
export type AnalyticsParams = z.infer<typeof AnalyticsParams>;

/** GET /analytics/:studentId?kind&date: the period holding `date` (default: today in the madrasa's timezone). */
export const AnalyticsQuery = z.strictObject({ kind: z.enum(REPORT_PERIOD_KINDS), date: isoDate.optional() });
export type AnalyticsQuery = z.infer<typeof AnalyticsQuery>;

// ---------- Analytics view (mirrors @hifz/domain/analytics StudentAnalytics) ----------

const Quantity = z.object({ unit: z.enum(QUANTITY_UNITS), numerator: count, denominator: z.number().int().min(1) });

const UnitTotals = z.object({
  assigned: z.array(Quantity),
  completed: z.array(Quantity),
  remaining: z.array(Quantity),
  notRecorded: count,
});

const statusCountShape = Object.fromEntries([...PORTION_STATUSES, 'NOT_RECORDED' as const].map((s) => [s, count])) as Record<
  (typeof PORTION_STATUSES)[number] | 'NOT_RECORDED',
  typeof count
>;
const StatusCounts = z.object(statusCountShape);

const categoryShape = Object.fromEntries(MISTAKE_CATEGORIES.map((c) => [c, count])) as Record<(typeof MISTAKE_CATEGORIES)[number], typeof count>;
const ByCategory = z.object(categoryShape);
const severityShape = Object.fromEntries(MISTAKE_SEVERITIES.map((s) => [s, count])) as Record<(typeof MISTAKE_SEVERITIES)[number], typeof count>;

const QualityAverage = z.object({
  count,
  sum: count,
  /** Exact average (lower is better); null = "Not recorded". */
  value: z.number().min(1).max(5).nullable(),
  display: z.string().nullable(),
  /** Nearest whole score, .5 rounding up; display only. */
  nearestScore: z.number().int().min(1).max(5).nullable(),
});

export const AnalyticsPeriodSchema = z.object({
  kind: z.enum(REPORT_PERIOD_KINDS),
  from: isoDate,
  to: isoDate,
  timeZone: z.string(),
  weekStart: z.string(),
  startsAt: z.string(),
  endsAt: z.string(),
});

export const SectionProgressSchema = z.object({
  section: z.enum(SECTIONS),
  portionCount: count,
  statusCounts: StatusCounts,
  totals: UnitTotals,
  /** Extra work, kept apart from assigned work (FR-QTY-006). */
  extraTotals: UnitTotals,
  paras: z.array(z.object({ paraNumber: paraNumber.nullable(), portionCount: count, totals: UnitTotals, statusCounts: StatusCounts })),
  pendingCount: count,
});

const mistakeBucketShape = {
  attempts: count,
  recordedAttempts: count,
  noMistakesAttempts: count,
  /** Attempts whose mistakes were not recorded: unknown, never 0. */
  notRecorded: count,
  byCategory: ByCategory,
  /** Severity only; `repeated` is counted apart (it is a flag, not a severity). */
  bySeverity: z.object(severityShape),
  repeated: count,
  uncategorized: count,
  total: count,
  /** false → no known count in the bucket: show "no data", not zeros. */
  hasData: z.boolean(),
};
export const MistakeBucketSchema = z.object(mistakeBucketShape);
export const MistakeWeekSchema = z.object({ from: isoDate, to: isoDate, ...mistakeBucketShape });

export const QUALITY_DIRECTIONS = ['IMPROVING', 'DECLINING', 'STEADY', 'NOT_ENOUGH_DATA'] as const;
export type QualityDirection = (typeof QUALITY_DIRECTIONS)[number];

export const QualityTrendSchema = z.object({
  /** value null = no ratings that day: a gap in the chart, never 0. */
  points: z.array(z.object({ date: isoDate, recordId: z.string(), value: z.number().min(1).max(5).nullable(), count })),
  average: QualityAverage,
  /** 1 · Excellent at the top, 5 · Weak at the bottom (F15-AC3). */
  axis: z.object({ top: z.literal(1), bottom: z.literal(5) }),
  firstHalf: QualityAverage.nullable(),
  secondHalf: QualityAverage.nullable(),
  /** A falling (lower) average is IMPROVING. */
  direction: z.enum(QUALITY_DIRECTIONS),
});

const Range = z.object({ surahStart: z.number().int(), ayahStart: z.number().int(), surahEnd: z.number().int(), ayahEnd: z.number().int() });

export const DifficultPortionSchema = z.object({
  paraNumber: paraNumber.nullable(),
  range: Range.nullable(),
  sections: z.array(z.enum(SECTIONS)),
  attempts: count,
  majorOrRepeatedAttempts: count,
  notRememberedAttempts: count,
  byCategory: ByCategory,
  dates: z.array(isoDate),
});

export const AnalyticsAttendanceSchema = z.object({
  scheduled: count,
  /** Present + Late + Half day (FR-CAL-005). */
  attended: count,
  present: count,
  late: count,
  halfDay: count,
  /** Approved Leave, apart from absences. */
  leave: count,
  leaveAwaiting: count,
  /** Absent plus rejected Leave. Holidays and unscheduled days are never absences. */
  absent: count,
  notMarked: count,
  holidays: count,
  closures: count,
  noClass: count,
  unscheduled: count,
});

export const AnalyticsHomeworkSchema = z.object({
  confirmed: count,
  drafts: count,
  assigned: count,
  attempted: count,
  completed: count,
  carriedForward: count,
  carriedOver: count,
  outstanding: count,
});

export const StudentAnalyticsSchema = z.object({
  period: AnalyticsPeriodSchema,
  today: isoDate,
  /** false → "No records for this period". */
  hasData: z.boolean(),
  recordedDays: count,
  /** true → "Not enough data for this period"; AI is not called or must say so. */
  insufficientData: z.boolean(),
  progress: z.array(SectionProgressSchema),
  mistakeTrend: z.object({ weekStart: z.string(), weeks: z.array(MistakeWeekSchema), totals: MistakeBucketSchema }),
  qualityTrend: QualityTrendSchema,
  qualityCoverage: z.object({ rated: count, unrated: count, notApplicable: count, limited: z.boolean() }),
  difficultPortions: z.array(DifficultPortionSchema),
  attendance: AnalyticsAttendanceSchema,
  homework: AnalyticsHomeworkSchema,
  /** Server analytics are authoritative (null); device analytics are provisional (NFR-OFF-008, AC-AI-02). */
  provisional: z.object({ pendingChanges: count, lastSyncedAt: z.string().nullable(), offline: z.boolean() }).nullable(),
});
export type StudentAnalyticsView = z.infer<typeof StudentAnalyticsSchema>;

/**
 * What the AI button shows (F15 "When it fails"):
 * - READY: the button is offered (online only; offline the app shows "AI needs a connection").
 * - DISABLED: AI is off for the madrasa; the button is hidden.
 * - NOT_CONFIGURED: no provider/key; Admins see "AI provider not set up", Teachers "AI unavailable".
 * - LIMIT_REACHED: "AI limit reached for this period".
 */
export const AI_STATES = ['READY', 'DISABLED', 'NOT_CONFIGURED', 'LIMIT_REACHED'] as const;
export type AiState = (typeof AI_STATES)[number];

/** GET /analytics/:studentId. */
export const StudentAnalyticsResponse = z.object({
  analytics: StudentAnalyticsSchema,
  ai: z.object({ state: z.enum(AI_STATES) }),
});
export type StudentAnalyticsResponse = z.infer<typeof StudentAnalyticsResponse>;

// ---------- AI recommendation ----------

export const AI_LOCALES = ['en', 'ur', 'ur-Latn'] as const;
export type AiLocale = (typeof AI_LOCALES)[number];

/** POST /analytics/:studentId/ai-recommendation (Teacher for assigned students, Owner, Admin; F15-AC4, AC17). */
export const AiRecommendationRequest = z.strictObject({ kind: z.enum(REPORT_PERIOD_KINDS), date: isoDate.optional(), locale: z.enum(AI_LOCALES) });
export type AiRecommendationRequest = z.infer<typeof AiRecommendationRequest>;

export const AI_OUTPUT_MAX_ITEMS = 8;
export const AI_OUTPUT_MAX_TEXT = 500;
const aiText = z.string().min(1).max(AI_OUTPUT_MAX_TEXT);

/**
 * The provider's required JSON (F15-AC7), validated strictly: unknown keys are refused. The number, period, language,
 * and insufficient-data checks of @hifz/domain/analytics (checkAiOutput) run after this schema.
 */
export const AiOutput = z.strictObject({
  observations: z.array(aiText).max(AI_OUTPUT_MAX_ITEMS),
  suggestions: z.array(aiText).max(AI_OUTPUT_MAX_ITEMS),
  data_insufficient: z.boolean(),
  period: z.strictObject({ from: isoDate, to: isoDate }),
  cited_metrics: z.array(z.strictObject({ key: z.string().min(1).max(200), value: z.number().finite() })).max(64),
});
export type AiOutput = z.infer<typeof AiOutput>;

/** Shown in its own area, labelled "AI suggestion — review required", with the range and metrics used (F15-AC4). */
export const AiRecommendationResponse = z.object({
  requestId: uuid,
  label: z.literal('AI_SUGGESTION_REVIEW_REQUIRED'),
  period: z.object({ kind: z.enum(REPORT_PERIOD_KINDS), from: isoDate, to: isoDate }),
  locale: z.enum(AI_LOCALES),
  /** Payload keys the answer cites (dotted, e.g. `mistakes.totals.byCategory.TAJWEED`). */
  metricsUsed: z.array(z.string()),
  output: AiOutput,
});
export type AiRecommendationResponse = z.infer<typeof AiRecommendationResponse>;

// ---------- AI settings (US-064, US-065) ----------

/** Admin-toggled data categories (FR-AI-013, DEC-B46); on by default. */
export const AI_DATA_CATEGORIES = ['ATTENDANCE', 'PROGRESS', 'MISTAKES', 'QUALITY', 'HOMEWORK'] as const;
export type AiDataCategory = (typeof AI_DATA_CATEGORIES)[number];

/** Never sent to AI, whatever the settings (FR-AI-013). */
export const AI_NEVER_SHARED = ['NAMES', 'CONTACTS', 'NOTES'] as const;

// DEFERRED: DEC-B45 — the launch provider is not chosen; the provider id is a free string checked by the API against
// its registered adapters (`supportedProviders`), never a fixed enum here.
const providerId = z.string().min(1).max(64);

/** USD 10 per madrasa per month by default; the Admin may lower it (FR-AI-012). Micro-USD to stay in integers. */
export const AI_BUDGET_MAX_MICRO_USD = 10_000_000;

export const AiCategorySettings = z.strictObject({
  ATTENDANCE: z.boolean(),
  PROGRESS: z.boolean(),
  MISTAKES: z.boolean(),
  QUALITY: z.boolean(),
  HOMEWORK: z.boolean(),
});

export const AiSettings = z.strictObject({
  enabled: z.boolean(),
  provider: providerId.nullable(),
  /** Per-madrasa monthly request cap set by the Admin; null = no request cap (the money budget still applies). */
  monthlyRequestCap: z.number().int().positive().nullable(),
  teacherDailyCap: z.number().int().positive(),
  monthlyBudgetMicroUsd: z.number().int().min(1).max(AI_BUDGET_MAX_MICRO_USD),
  categories: AiCategorySettings,
});
export type AiSettings = z.infer<typeof AiSettings>;

/**
 * PUT /analytics/ai-settings: every field, strictly; unknown keys (e.g. `shareNames`) are refused (F15-AC16). AI cannot
 * be enabled without a provider (mirrors the org_ai_settings CHECK of migration 0018): issue `PROVIDER_REQUIRED` on
 * `provider`.
 */
export const UpdateAiSettingsRequest = AiSettings.refine((s) => !s.enabled || s.provider !== null, { message: 'PROVIDER_REQUIRED', path: ['provider'] });
export type UpdateAiSettingsRequest = z.infer<typeof UpdateAiSettingsRequest>;

export const DEFAULT_AI_SETTINGS: AiSettings = Object.freeze({
  enabled: false,
  provider: null,
  monthlyRequestCap: null,
  teacherDailyCap: 20, // DEFERRED: DEC-B45 starting default, to be confirmed when the provider is chosen.
  monthlyBudgetMicroUsd: AI_BUDGET_MAX_MICRO_USD,
  categories: Object.freeze({ ATTENDANCE: true, PROGRESS: true, MISTAKES: true, QUALITY: true, HOMEWORK: true }),
});

/** GET/PUT /analytics/ai-settings (Owner/Admin). */
export const AiSettingsResponse = z.object({
  enabled: z.boolean(),
  provider: providerId.nullable(),
  monthlyRequestCap: z.number().int().positive().nullable(),
  teacherDailyCap: z.number().int().positive(),
  monthlyBudgetMicroUsd: z.number().int().min(1).max(AI_BUDGET_MAX_MICRO_USD),
  categories: AiCategorySettings,
  supportedProviders: z.array(z.object({ id: providerId, label: z.string() })),
  /** Whether the chosen provider has a server-side key; the key itself never leaves the server. */
  providerConfigured: z.boolean(),
  usage: z.object({ month: z.string().regex(/^\d{4}-\d{2}$/), requests: count, costMicroUsd: count }),
  neverShared: z.tuple([z.literal('NAMES'), z.literal('CONTACTS'), z.literal('NOTES')]),
});
export type AiSettingsResponse = z.infer<typeof AiSettingsResponse>;

// ---------- Error codes ----------

/**
 * Errors the AI routes return. The API registers them in ERROR_CODES (identity.ts) together with their HTTP statuses in
 * apps/api/src/platform/errors.ts.
 * - AI_DISABLED: AI is off for the madrasa.
 * - AI_NOT_CONFIGURED: no provider or key.
 * - AI_UNAVAILABLE: provider error, timeout, or an answer that failed the checks ("AI unavailable — try again later").
 * - AI_LIMIT_REACHED: a request cap or the money budget is used up.
 */
export const AI_ERROR_CODES = ['AI_DISABLED', 'AI_NOT_CONFIGURED', 'AI_UNAVAILABLE', 'AI_LIMIT_REACHED'] as const;
export type AiErrorCode = (typeof AI_ERROR_CODES)[number];
