// F05 · Daily Hifz entry — unit: contracts (docs/handover/F05-plan.md §4)
import { describe, expect, it } from 'vitest';
import * as domain from '@hifz/domain/hifz';
import { QUANTITY_UNITS as DOMAIN_UNITS } from '@hifz/domain/quantity';
import {
  ATTENDANCE_TEXT_MAX,
  DAILY_REPORT_MODES,
  DailyRecordCreateFields,
  DailyRecordListQuery,
  DailyRecordUpdateFields,
  HIFZ_FIELD_ISSUES,
  LessonPortionCreateFields,
  LessonPortionUpdateFields,
  MISTAKES_MAX,
  MISTAKE_CATEGORIES,
  MISTAKE_SEVERITIES,
  NO_QUALITY_STATUSES,
  PORTION_STATUSES,
  PORTIONS_ALLOWED,
  PortionAttemptCreateFields,
  PortionAttemptUpdateFields,
  QUANTITY_UNITS,
  QuantitySchema,
  REMARKS_MAX,
  RESERVED_FIELD_KEYS,
  SECTIONS,
  SESSION_LABEL_MAX,
  SetDailyReportModeRequest,
  TOTAL_LINES_SOURCES,
} from './index.ts';

const ID = (n: number) => `01901234-5678-7abc-8def-${n.toString(16).padStart(12, '0')}`;
const NOW = '2026-11-10T10:00:00.000+05:00';
const lines = (n: number) => ({ unit: 'LINES', numerator: n, denominator: 1 });
const half = { unit: 'PARA', numerator: 1, denominator: 2 };

const sabaq = (extra: Record<string, unknown> = {}) => ({
  dailyRecordId: ID(1),
  section: 'SABAQ',
  position: 1,
  isExtra: false,
  paraNumber: null,
  range: { surahStart: 2, ayahStart: 1, surahEnd: 2, ayahEnd: 10 },
  assigned: lines(10),
  totalLines: 12,
  totalLinesSource: 'LAYOUT',
  ...extra,
});
const sabqi = (extra: Record<string, unknown> = {}) => ({
  dailyRecordId: ID(1),
  section: 'SABQI',
  position: 2,
  isExtra: false,
  paraNumber: 4,
  range: null,
  assigned: half,
  totalLines: null,
  totalLinesSource: null,
  ...extra,
});
const attempt = (extra: Record<string, unknown> = {}) => ({
  lessonPortionId: ID(2),
  attemptNo: 1,
  attemptedAt: NOW,
  status: 'PARTIAL',
  completed: lines(7),
  quality: 2,
  noMistakes: false,
  mistakes: [{ category: 'TAJWEED', severity: 'MINOR', repeated: true }],
  remarks: null,
  ...extra,
});
const messages = (r: { success: boolean; error?: { issues: { path: PropertyKey[]; message: string }[] } }) =>
  (r.error?.issues ?? []).map((i) => `${i.path.join('.')}:${i.message}`);

describe('F05 · contracts: enums match the domain', () => {
  it('statuses, mistakes, units, sections, limits, and modes are the domain values', () => {
    expect(PORTION_STATUSES).toEqual(domain.PORTION_STATUSES);
    expect(NO_QUALITY_STATUSES).toEqual(domain.NO_QUALITY_STATUSES);
    expect(MISTAKE_CATEGORIES).toEqual(domain.MISTAKE_CATEGORIES);
    expect(MISTAKE_SEVERITIES).toEqual(domain.MISTAKE_SEVERITIES);
    expect(TOTAL_LINES_SOURCES).toEqual(domain.TOTAL_LINES_SOURCES);
    expect(PORTIONS_ALLOWED).toEqual(domain.PORTIONS_ALLOWED);
    expect(QUANTITY_UNITS).toEqual(DOMAIN_UNITS);
    expect(SECTIONS).toEqual(['SABAQ', 'SABQI', 'MANZIL']);
    expect(DAILY_REPORT_MODES).toEqual(domain.DAILY_REPORT_MODES);
    expect(SESSION_LABEL_MAX).toBe(domain.SESSION_LABEL_MAX);
    expect(SESSION_LABEL_MAX).toBe(40);
    expect(REMARKS_MAX).toBe(domain.REMARKS_MAX);
    expect(REMARKS_MAX).toBe(ATTENDANCE_TEXT_MAX);
    expect(MISTAKES_MAX).toBe(domain.MISTAKES_MAX);
  });

  it('every issue code the domain can emit is a declared field issue', () => {
    const declared = Object.values(HIFZ_FIELD_ISSUES) as string[];
    for (const code of domain.PORTION_ISSUE_CODES) expect(declared).toContain(code);
    for (const code of ['DUPLICATE_RECORD', 'DUPLICATE_SESSION', 'SESSION_LABEL_REQUIRED', 'SESSION_LABEL_NOT_ALLOWED', 'SESSION_LABEL_TOO_LONG', 'ATTENDANCE_REQUIRED']) {
      expect(declared).toContain(code);
    }
    for (const [key, value] of Object.entries(HIFZ_FIELD_ISSUES)) expect(value).toBe(key);
  });
});

describe('F05 · contracts: quantities', () => {
  it('accepts exact integer quantities and refuses floats and fractional lines', () => {
    expect(QuantitySchema.safeParse(lines(10)).success).toBe(true);
    expect(QuantitySchema.safeParse({ unit: 'PARA', numerator: 3, denominator: 4 }).success).toBe(true);
    expect(QuantitySchema.safeParse({ unit: 'LINES', numerator: 2.5, denominator: 1 }).success).toBe(false);
    expect(QuantitySchema.safeParse({ unit: 'PARA', numerator: 0.75, denominator: 1 }).success).toBe(false);
    expect(messages(QuantitySchema.safeParse({ unit: 'LINES', numerator: 5, denominator: 2 }))).toEqual(['denominator:NOT_WHOLE']);
    expect(messages(QuantitySchema.safeParse({ unit: 'AYAT', numerator: 4, denominator: 2 }))).toEqual(['denominator:NOT_WHOLE']);
    expect(QuantitySchema.safeParse({ unit: 'LINES', numerator: -1, denominator: 1 }).success).toBe(false);
    expect(QuantitySchema.safeParse({ unit: 'PARA', numerator: 1, denominator: 0 }).success).toBe(false);
    expect(QuantitySchema.safeParse({ unit: 'RUBU', numerator: 1, denominator: 1 }).success).toBe(false);
    expect(QuantitySchema.safeParse(0.5).success).toBe(false);
    expect(QuantitySchema.safeParse({ ...lines(1), total: 5 }).success).toBe(false);
  });
});

describe('F05 · contracts: strict sync fields', () => {
  it('refuse tenant, role, visibility, and version keys on every entity (AGENTS §6)', () => {
    const creates = [
      [DailyRecordCreateFields, { studentId: ID(3), classId: ID(4), reportDate: '2026-11-10', sessionLabel: null }],
      [LessonPortionCreateFields, sabaq()],
      [PortionAttemptCreateFields, attempt()],
    ] as const;
    for (const [schema, valid] of creates) {
      expect(schema.safeParse(valid).success).toBe(true);
      for (const key of RESERVED_FIELD_KEYS) expect(schema.safeParse({ ...valid, [key]: 'x' }).success).toBe(false);
      for (const key of ['recordedBy', 'remaining', 'lineCountEdition', 'remarksVisibility']) expect(schema.safeParse({ ...valid, [key]: 'x' }).success).toBe(false);
    }
    const updates = [
      [DailyRecordUpdateFields, { sessionLabel: 'Fajr' }],
      [LessonPortionUpdateFields, { removed: true }],
      [PortionAttemptUpdateFields, { remarks: 'x' }],
    ] as const;
    for (const [schema, valid] of updates) {
      expect(schema.safeParse(valid).success).toBe(true);
      for (const key of RESERVED_FIELD_KEYS) expect(schema.safeParse({ ...valid, [key]: 1 }).success).toBe(false);
    }
  });

  it('a daily record keeps the chosen date; student and date cannot be moved by an update', () => {
    const r = DailyRecordCreateFields.parse({ studentId: ID(3), classId: ID(4), reportDate: '2026-11-09', sessionLabel: null, clientSavedAt: NOW });
    expect(r.reportDate).toBe('2026-11-09');
    expect(DailyRecordCreateFields.safeParse({ studentId: ID(3), classId: ID(4), reportDate: '09/11/2026', sessionLabel: null }).success).toBe(false);
    expect(DailyRecordUpdateFields.safeParse({ sessionLabel: 'Asr', reportDate: '2026-11-08' }).success).toBe(false);
    expect(DailyRecordUpdateFields.safeParse({ studentId: ID(5) }).success).toBe(false);
  });

  it('a Sabaq Para from the client is never accepted (FR-SAB-001)', () => {
    expect(messages(LessonPortionCreateFields.safeParse(sabaq({ paraNumber: 1 })))).toEqual(['paraNumber:SABAQ_PARA_NOT_ACCEPTED']);
    expect(messages(LessonPortionCreateFields.safeParse(sabaq({ range: null, totalLines: null, totalLinesSource: null })))).toEqual([
      'range:REQUIRED',
      'totalLines:REQUIRED',
      'totalLinesSource:REQUIRED',
    ]);
  });

  it('Sabqi and Manzil need a Para and carry no Total Lines', () => {
    expect(LessonPortionCreateFields.safeParse(sabqi()).success).toBe(true);
    expect(LessonPortionCreateFields.safeParse(sabqi({ section: 'MANZIL', range: { surahStart: 2, ayahStart: 15, surahEnd: 3, ayahEnd: 4 } })).success).toBe(true);
    expect(messages(LessonPortionCreateFields.safeParse(sabqi({ paraNumber: null })))).toEqual(['paraNumber:REQUIRED']);
    expect(messages(LessonPortionCreateFields.safeParse(sabqi({ totalLines: 4, totalLinesSource: 'MANUAL' })))).toEqual(['totalLines:NOT_ALLOWED', 'totalLinesSource:NOT_ALLOWED']);
    expect(LessonPortionCreateFields.safeParse(sabqi({ paraNumber: 31 })).success).toBe(false);
    expect(LessonPortionCreateFields.safeParse(sabqi({ assigned: { unit: 'LINES', numerator: 2.5, denominator: 1 } })).success).toBe(false);
    expect(LessonPortionCreateFields.safeParse(sabqi({ position: 0 })).success).toBe(false);
  });

  it('a portion update carries the quantity group whole, or only removal and order', () => {
    expect(LessonPortionUpdateFields.safeParse({ removed: true }).success).toBe(true);
    expect(LessonPortionUpdateFields.safeParse({ removed: false }).success).toBe(false);
    expect(LessonPortionUpdateFields.safeParse({ position: 3 }).success).toBe(true);
    expect(LessonPortionUpdateFields.safeParse({ paraNumber: 5, range: null, totalLines: null, totalLinesSource: null, assigned: half }).success).toBe(true);
    expect(messages(LessonPortionUpdateFields.safeParse({ assigned: half }))).toEqual([
      'paraNumber:GROUP_INCOMPLETE',
      'range:GROUP_INCOMPLETE',
      'totalLines:GROUP_INCOMPLETE',
      'totalLinesSource:GROUP_INCOMPLETE',
    ]);
    expect(messages(LessonPortionUpdateFields.safeParse({}))).toEqual([':NO_FIELDS']);
    expect(LessonPortionUpdateFields.safeParse({ section: 'SABAQ' }).success).toBe(false);
  });

  it('attempt quality is an integer 1–5 or null; 0, 6, and 2.5 are refused', () => {
    for (const q of [1, 3, 5, null]) expect(PortionAttemptCreateFields.safeParse(attempt({ quality: q })).success).toBe(true);
    for (const q of [0, 6, 2.5, '3']) expect(PortionAttemptCreateFields.safeParse(attempt({ quality: q })).success).toBe(false);
    expect(PortionAttemptCreateFields.safeParse(attempt({ quality: undefined })).success).toBe(false); // the key is required
  });

  it('attempts refuse quality on Absent, Not Assigned, Pending, and "No mistakes" with a list (FR-ATT-007, FR-ATT-011)', () => {
    for (const status of ['ABSENT', 'NOT_ASSIGNED', 'PENDING']) {
      expect(messages(PortionAttemptCreateFields.safeParse(attempt({ status, completed: null, quality: 3 })))).toEqual(['quality:QUALITY_NOT_ALLOWED']);
      expect(PortionAttemptCreateFields.safeParse(attempt({ status, completed: null, quality: null })).success).toBe(true);
    }
    expect(messages(PortionAttemptCreateFields.safeParse(attempt({ noMistakes: true })))).toEqual(['mistakes:NO_MISTAKES_CONFLICT']);
    expect(PortionAttemptCreateFields.safeParse(attempt({ noMistakes: true, mistakes: [] })).success).toBe(true);
    expect(PortionAttemptCreateFields.safeParse(attempt({ mistakes: [{ category: 'TAJWEED', severity: 'REPEATED', repeated: false }] })).success).toBe(false);
    expect(PortionAttemptCreateFields.safeParse(attempt({ mistakes: [{ category: 'TAJWEED', severity: 'MINOR' }] })).success).toBe(false);
    const many = Array.from({ length: MISTAKES_MAX + 1 }, () => ({ category: 'LAFZI', severity: 'MAJOR', repeated: false }));
    expect(PortionAttemptCreateFields.safeParse(attempt({ mistakes: many })).success).toBe(false);
    expect(PortionAttemptCreateFields.safeParse(attempt({ attemptNo: 0 })).success).toBe(false);
    expect(PortionAttemptCreateFields.safeParse(attempt({ status: 'FAILED' })).success).toBe(false);
    expect(PortionAttemptCreateFields.safeParse(attempt({ remarks: 'x'.repeat(REMARKS_MAX * 4 + 1) })).success).toBe(false);
  });

  it('an attempt correction carries the outcome group whole', () => {
    const group = { status: 'COMPLETED', completed: lines(10), quality: 1, noMistakes: true, mistakes: [] };
    expect(PortionAttemptUpdateFields.safeParse(group).success).toBe(true);
    expect(PortionAttemptUpdateFields.safeParse({ ...group, remarks: 'note' }).success).toBe(true);
    expect(messages(PortionAttemptUpdateFields.safeParse({ quality: 2 }))).toEqual([
      'status:GROUP_INCOMPLETE',
      'completed:GROUP_INCOMPLETE',
      'noMistakes:GROUP_INCOMPLETE',
      'mistakes:GROUP_INCOMPLETE',
    ]);
    expect(messages(PortionAttemptUpdateFields.safeParse({ ...group, status: 'PENDING', completed: null }))).toEqual(['quality:QUALITY_NOT_ALLOWED']);
    expect(PortionAttemptUpdateFields.safeParse({ ...group, attemptNo: 2 }).success).toBe(false);
    expect(PortionAttemptUpdateFields.safeParse({ ...group, lessonPortionId: ID(9) }).success).toBe(false);
  });
});

describe('F05 · contracts: REST', () => {
  it('the daily-report mode request accepts only the two modes and nothing else', () => {
    expect(SetDailyReportModeRequest.safeParse({ mode: 'MULTI_SESSION' }).success).toBe(true);
    expect(SetDailyReportModeRequest.safeParse({ mode: 'single' }).success).toBe(false);
    expect(SetDailyReportModeRequest.safeParse({ mode: 'SINGLE', organizationId: ID(1) }).success).toBe(false);
  });

  it('the list query is either a date or a full period', () => {
    expect(DailyRecordListQuery.parse({ studentId: ID(3), date: '2026-11-10' })).toMatchObject({ limit: 25 });
    expect(DailyRecordListQuery.safeParse({ classId: ID(4), from: '2026-11-01', to: '2026-11-10', limit: '50' }).success).toBe(true);
    expect(messages(DailyRecordListQuery.safeParse({ studentId: ID(3) }))).toEqual(['date:REQUIRED']);
    expect(messages(DailyRecordListQuery.safeParse({ from: '2026-11-01' }))).toEqual(['to:REQUIRED']);
    expect(messages(DailyRecordListQuery.safeParse({ from: '2026-11-10', to: '2026-11-01' }))).toEqual(['to:END_BEFORE_START']);
    expect(messages(DailyRecordListQuery.safeParse({ date: '2026-11-10', from: '2026-11-01', to: '2026-11-10' }))).toEqual(['date:INVALID']);
    expect(DailyRecordListQuery.safeParse({ date: '2026-11-10', organizationId: ID(1) }).success).toBe(false);
    expect(DailyRecordListQuery.safeParse({ date: '2026-11-10', limit: 101 }).success).toBe(false);
  });
});
