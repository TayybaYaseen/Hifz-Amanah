// F09 · Report display rules and strings (design.md §4.10, §5.8; AGENTS.md §8). The text is rendered through the real
// ICU catalogues, so "2.0 · Good (2 ratings)" is checked against what the screen shows.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { IntlMessageFormat } from 'intl-messageformat';
import { describe, expect, it } from 'vitest';
import { DAY_KINDS } from '@hifz/domain/calendar';
import { buildReport, reportPeriod } from '@hifz/domain/reports';
import { en } from '../../i18n/locales/en.ts';
import { ur } from '../../i18n/locales/ur.ts';
import { urLatn } from '../../i18n/locales/ur-Latn.ts';
import { ATTENDANCE_ROWS, attendanceRows, averageText, provisionalNotice, reportSource, totalsLines, type Translate } from './view.ts';

const get = (obj: unknown, path: string): unknown => path.split('.').reduce<unknown>((o, k) => (o && typeof o === 'object' ? (o as Record<string, unknown>)[k] : undefined), obj);

const translator =
  (catalogue: unknown, locale: string): Translate =>
  (key, options) => {
    const text = get(catalogue, key);
    if (typeof text !== 'string') throw new Error(`missing ${key}`);
    return String(new IntlMessageFormat(text, locale).format(options as Record<string, string | number>));
  };

describe('F09 · report text', () => {
  const t = translator(en, 'en');

  it('F09-AC7 (US-039) an average reads "2.0 · Good (2 ratings)"; no ratings reads "Not recorded", never 0', () => {
    expect(averageText({ count: 2, display: '2.0', nearestScore: 2 }, t)).toBe('2.0 · Good (2 ratings)');
    expect(averageText({ count: 1, display: '1.0', nearestScore: 1 }, t)).toBe('1.0 · Excellent (1 rating)');
    expect(averageText({ count: 0, display: null, nearestScore: null }, t)).toBe('Not recorded');
    // The same average in Urdu and Roman Urdu uses the approved scale's labels and Western digits.
    expect(averageText({ count: 2, display: '2.0', nearestScore: 2 }, translator(ur, 'ur'))).toBe('2.0 · اچھا (2 ریٹنگز)');
    expect(averageText({ count: 2, display: '2.0', nearestScore: 2 }, translator(urLatn, 'ur-Latn'))).toBe('2.0 · Achha (2 ratings)');
  });

  it('F09-AC4 (US-039) totals are one line per unit; an empty list reads "None", not 0', () => {
    const amount = (q: { unit: string; numerator: number; denominator: number }) => `${q.numerator}/${q.denominator} ${q.unit}`;
    expect(totalsLines([{ unit: 'PARA', numerator: 3, denominator: 4 }, { unit: 'LINES', numerator: 12, denominator: 1 }], amount, t)).toEqual(['3/4 PARA', '12/1 LINES']);
    expect(totalsLines([], amount, t)).toEqual(['None']);
  });

  it('F09-AC17 (US-041) attendance lists attended with Late and Half day on their own, Leave, and normal absence', () => {
    const counts = { scheduled: 5, attended: 3, present: 1, late: 1, halfDay: 1, leave: 1, leaveAwaiting: 0, absent: 1, notMarked: 0, holidays: 1, closures: 0, noClass: 0, unscheduled: 1 };
    const rows = attendanceRows(counts);
    expect(rows.map((r) => [r.key, r.count])).toEqual([
      ['scheduled', 5],
      ['attended', 3],
      ['present', 1],
      ['late', 1],
      ['halfDay', 1],
      ['leave', 1],
      ['absent', 1],
      ['holidays', 1],
      ['unscheduled', 1],
    ]);
    expect(t('reports.att.attended', { count: '3' })).toBe('Attended (Present + Late + Half day): 3');
  });

  it('F09-AC16 (US-039) offline shows the device report as Provisional; online with pending changes says they are not included', () => {
    expect(reportSource(false, false)).toBe('DEVICE');
    expect(reportSource(true, true)).toBe('DEVICE');
    expect(reportSource(true, false)).toBe('SERVER');
    expect(provisionalNotice({ source: 'DEVICE', pendingChanges: 2 })).toBe('PROVISIONAL');
    expect(provisionalNotice({ source: 'SERVER', pendingChanges: 2 })).toBe('PENDING_CHANGES');
    expect(provisionalNotice({ source: 'SERVER', pendingChanges: 0 })).toBeNull();
    expect(t('reports.pending', { count: 2 })).toBe('Changes waiting to sync: 2');
  });

  it('F09 unit: "No records for this period" is the empty state', () => {
    const empty = buildReport({
      period: reportPeriod('WEEK', '2026-11-04'),
      today: '2026-11-20',
      student: { id: 's1', name: 'S' },
      enrollments: [],
      scope: null,
      schedules: [],
      exceptions: [],
      attendance: [],
      records: [],
      homework: [],
    });
    expect(empty.hasData).toBe(false);
    expect(t('reports.noRecords')).toBe('No records for this period');
  });
});

describe('F09 · report strings exist in all three locales', () => {
  const used = new Set<string>();
  const files = ['ReportsScreen.tsx', 'view.ts'].map((f) => join(__dirname, f));
  for (const file of files) for (const m of readFileSync(file, 'utf8').matchAll(/t\('((?:reports|home|quality|mistakes|overall|sections|portionStatus|daily|attendance|common)\.[A-Za-z.]+)'/g)) used.add(m[1]!);
  // Dynamic keys: every attendance line, day category, and homework measure.
  for (const k of ATTENDANCE_ROWS) used.add(`reports.att.${k}`);
  for (const k of [...DAY_KINDS.filter((d) => d !== 'SCHEDULED'), 'NOT_ENROLLED', 'FUTURE', 'NOT_MARKED', 'PRESENT', 'LATE', 'HALF_DAY', 'LEAVE', 'LEAVE_AWAITING', 'ABSENT', 'LEAVE_REJECTED']) used.add(`reports.dayCategory.${k}`);
  for (const k of ['confirmed', 'drafts', 'assigned', 'attempted', 'completed', 'carriedForward', 'carriedOver', 'outstanding']) used.add(`reports.hw.${k}`);
  used.add('home.reports');

  it.each([
    ['en', en],
    ['ur', ur],
    ['ur-Latn', urLatn],
  ])('F09 unit: every report key is in %s', (_locale, catalogue) => {
    const missing = [...used].filter((k) => typeof get(catalogue, k) !== 'string');
    expect(missing).toEqual([]);
  });
});
