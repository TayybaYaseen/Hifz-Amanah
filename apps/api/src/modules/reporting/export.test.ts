// F09-AC20 · Class summary files (export.ts): the same rows and values as the summary, no notes, safe cells, Urdu RTL.
import ExcelJS from 'exceljs';
import { describe, expect, it } from 'vitest';
import { buildReport, classSummary, reportPeriod, type ReportInput } from '@hifz/domain/reports';
import { chromiumRenderer, classSummaryHtml, classSummaryXlsx, exportTable, safeCell } from './export.ts';

const period = reportPeriod('WEEK', '2026-11-04');
const base = (o: Partial<ReportInput>): ReportInput => ({
  period,
  today: '2026-11-20',
  student: { id: 's1', name: 'Synthetic One' },
  enrollments: [{ id: 'e1', classId: 'c1', startDate: '2026-01-01', endDate: null }],
  scope: ['c1'],
  schedules: [{ classId: 'c1', effectiveFrom: '2026-01-01', weekdays: [1, 2, 3, 4, 5, 6] }],
  exceptions: [],
  attendance: [],
  records: [],
  homework: [],
  ...o,
});
const attempt = { id: 'a1', attemptNo: 1, attemptedAt: '2026-11-02T06:00:00.000Z', status: 'COMPLETED' as const, completed: { unit: 'LINES' as const, numerator: 10, denominator: 1 }, quality: 1, noMistakes: false, mistakes: [{ category: 'TAJWEED' as const, severity: 'MAJOR' as const, repeated: false, note: 'Synthetic private note', noteVisibility: 'INTERNAL' as const }], remarks: 'Synthetic private remark' };
const summary = classSummary('c1', period, '2026-11-20', [
  buildReport(
    base({
      attendance: [{ date: '2026-11-02', classId: 'c1', status: 'PRESENT', leaveStatus: 'NONE' }],
      records: [{ id: 'r1', date: '2026-11-02', classId: 'c1', sessionLabel: null, overallLabel: null, portions: [{ id: 'p1', section: 'SABAQ', position: 1, isExtra: false, paraNumber: 1, range: { surahStart: 2, ayahStart: 1, surahEnd: 2, ayahEnd: 20 }, assigned: { unit: 'LINES', numerator: 10, denominator: 1 }, totalLines: 10, removed: false, attempts: [attempt] }] }],
    }),
  ),
  buildReport(base({ student: { id: 's2', name: '=HYPERLINK("x")' }, attendance: [{ date: '2026-11-02', classId: 'c1', status: 'LATE', leaveStatus: 'NONE' }, { date: '2026-11-03', classId: 'c1', status: 'ABSENT', leaveStatus: 'NONE' }] })),
]);
const meta = { className: 'Hifz A1', generatedAt: '2026-11-21T10:00:00.000Z', locale: 'en' as const };

describe('F09-AC20 · class summary files', () => {
  it('F09-AC20 (US-073) the export table holds the summary rows and values; missing quality reads Not recorded', () => {
    const t = exportTable(summary, 'en');
    expect(t.header).toEqual(['Student', 'Scheduled', 'Attended', 'Present', 'Late', 'Half day', 'Leave', 'Absent', 'Sabaq completed', 'Sabqi completed', 'Manzil completed', 'Average quality', 'Ratings', 'Outstanding homework', 'Quality label']);
    expect(t.rows).toHaveLength(summary.rows.length);
    const [hyper, one] = t.rows; // rows are sorted by name: '=HYPERLINK…' before 'Synthetic One'
    expect(one).toEqual(['Synthetic One', 6, 1, 1, 0, 0, 0, 0, '10 lines', '', '', '1.0', 1, 0, 'Excellent']);
    expect(hyper!.slice(1, 8)).toEqual([6, 1, 0, 1, 0, 0, 1]);
    expect(hyper!.slice(11)).toEqual(['Not recorded', 0, 0, 'Not recorded']);
    expect(JSON.stringify(t)).not.toMatch(/Synthetic private (note|remark)/);
  });

  it('F09-AC20 (US-073) the .xlsx has the same rows, a hidden _meta sheet, and no formula cells (FR-XLS-009)', async () => {
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load((await classSummaryXlsx(summary, meta)) as unknown as ArrayBuffer);
    const sheet = wb.getWorksheet('ClassSummary')!;
    const values = (n: number) => (sheet.getRow(n).values as unknown[]).slice(1);
    const t = exportTable(summary, 'en');
    expect(values(1)).toEqual(t.header);
    expect(values(2)).toEqual(t.rows[0]!.map((v) => (typeof v === 'string' && /^[=+\-@]/.test(v) ? `'${v}` : v)));
    expect(values(3)).toEqual(t.rows[1]);
    // The name that looks like a formula is text, never a formula.
    expect(sheet.getCell('A2').formula).toBeUndefined();
    expect(sheet.getCell('A2').value).toBe(`'=HYPERLINK("x")`);
    const m = wb.getWorksheet('_meta')!;
    expect(m.state).toBe('hidden');
    const kv = Object.fromEntries(m.getSheetValues().slice(1).map((r) => [(r as unknown[])[1], (r as unknown[])[2]]));
    expect(kv).toMatchObject({ TemplateName: 'ClassSummary', TemplateVersion: '1', PeriodFrom: period.from, PeriodTo: period.to, TimeZone: 'Asia/Karachi', PendingOfflineChanges: 'false' });
    expect(JSON.stringify(wb.model)).not.toMatch(/Synthetic private (note|remark)/);
  });

  it('F09-AC20 (US-073) the PDF HTML holds the same rows, escaped, with no notes; Urdu is right to left', () => {
    const html = classSummaryHtml(summary, meta);
    for (const row of exportTable(summary, 'en').rows) for (const v of row) if (v !== '') expect(html).toContain(String(v).replace(/"/g, '&quot;'));
    expect(html).not.toContain('<script');
    expect(html).not.toMatch(/Synthetic private (note|remark)/);
    expect(html).toContain('dir="ltr"');
    const ur = classSummaryHtml(summary, { ...meta, locale: 'ur' });
    expect(ur).toContain('dir="rtl"');
    expect(ur).toContain('جماعت کا خلاصہ');
    expect(ur).toContain('ممتاز');
  });

  it('F09 unit: safeCell prefixes every formula-like text (= + - @ tab CR) and leaves numbers alone', () => {
    for (const s of ['=1+1', '+1', '-1', '@x', '\tx', '\rx']) expect(safeCell(s)).toBe(`'${s}`);
    expect(safeCell('Ali')).toBe('Ali');
    expect(safeCell(-3)).toBe(-3);
  });

  it('F09-AC20 (US-073) Chromium renders the summary to a PDF', async () => {
    const renderer = chromiumRenderer();
    try {
      const pdf = await renderer.render(classSummaryHtml(summary, meta));
      expect(pdf.subarray(0, 5).toString('latin1')).toBe('%PDF-');
      expect(pdf.length).toBeGreaterThan(1000);
    } finally {
      await renderer.close();
    }
  }, 60_000);
});
