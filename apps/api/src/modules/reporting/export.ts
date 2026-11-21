// Class summary files: Excel (.xlsx) and PDF (F09-AC20; FR-RPT-011, FR-EXP-002…005, FR-XLS-009, FR-PDF-003/004).
// Plan docs/handover/F09-plan.md §2 (the user asked on 2026-11-21 for AC20 to pass in F09).
//
// Both files are built from the same rows: classSummaryExportRows() over the summary AFTER projectFor('STAFF',
// 'class_summary'), so they hold exactly the rows and values of the screen and no note or remark of any kind (the row
// shape has no column that could carry one). Labels come from the catalogue below in the export's language; stored
// values stay canonical (numbers, dates). Western digits in every language (DEC-B38).
// - Excel: one sheet with a header row, and a hidden `_meta` sheet (template name and version, period, timezone,
//   generated time, pending-offline flag; SRS §15.1). Every text cell starting with = + - @ tab or CR is prefixed with '
//   so it is never read as a formula (FR-XLS-009).
// - PDF: an HTML template rendered by headless Chromium (Playwright, ADR-008): A4, the table header repeated on each
//   page, rows never split, right to left for Urdu, the approved font stack (FR-PDF-004) where the fonts are installed.
//   This is the minimal default layout; F13 adds the madrasa's template (logo, colors, headings) and stored files.
import ExcelJS from 'exceljs';
import type { Locale } from '@hifz/contracts';
import { classSummaryExportRows, CLASS_SUMMARY_COLUMNS, type ClassSummary, type ClassSummaryColumn } from '@hifz/domain/reports';
import { fractionText, type Quantity } from '@hifz/domain/quantity';
import { qualityLabel } from '@hifz/domain/quality';

export const EXPORT_FORMATS = ['xlsx', 'pdf'] as const;
export type ExportFormat = (typeof EXPORT_FORMATS)[number];

export interface ExportMeta {
  className: string;
  generatedAt: string;
  locale: Locale;
}

interface Labels {
  title: string;
  staffOnly: string;
  period: string;
  timeZone: string;
  generated: string;
  notRecorded: string;
  columns: Record<ClassSummaryColumn, string>;
  qualityLabel: string;
  units: Record<Quantity['unit'], string>;
}

// TODO(F11): move into packages/i18n-keys with the other server strings; wording awaits the glossary (DEC-B39).
const LABELS: Record<Locale, Labels> = {
  en: {
    title: 'Class summary',
    staffOnly: 'Staff only. Not for students or parents.',
    period: 'Period',
    timeZone: 'Timezone',
    generated: 'Generated',
    notRecorded: 'Not recorded',
    qualityLabel: 'Quality label',
    columns: {
      studentName: 'Student',
      scheduled: 'Scheduled',
      attended: 'Attended',
      present: 'Present',
      late: 'Late',
      halfDay: 'Half day',
      leave: 'Leave',
      absent: 'Absent',
      sabaqCompleted: 'Sabaq completed',
      sabqiCompleted: 'Sabqi completed',
      manzilCompleted: 'Manzil completed',
      qualityAverage: 'Average quality',
      qualityRatings: 'Ratings',
      outstandingHomework: 'Outstanding homework',
    },
    units: { LINES: 'lines', PARA: 'Para', AYAT: 'Ayat', PAGES: 'pages' },
  },
  'ur-Latn': {
    title: 'Jamaat ka khulasa',
    staffOnly: 'Sirf amle ke liye. Talaba ya walidain ke liye nahin.',
    period: 'Muddat',
    timeZone: 'Time zone',
    generated: 'Tayyar kiya gaya',
    notRecorded: 'Darj nahin',
    qualityLabel: 'Mayaar ka label',
    columns: {
      studentName: 'Talib-e-ilm',
      scheduled: 'Muqarrara din',
      attended: 'Haazir rahe',
      present: 'Haazir',
      late: 'Takheer',
      halfDay: 'Aadha din',
      leave: 'Rukhsat',
      absent: 'Ghair haazir',
      sabaqCompleted: 'Sabaq mukammal',
      sabqiCompleted: 'Sabqi mukammal',
      manzilCompleted: 'Manzil mukammal',
      qualityAverage: 'Ausat mayaar',
      qualityRatings: 'Ratings',
      outstandingHomework: 'Baqi homework',
    },
    units: { LINES: 'lines', PARA: 'Para', AYAT: 'Ayat', PAGES: 'safhaat' },
  },
  ur: {
    title: 'جماعت کا خلاصہ',
    staffOnly: 'صرف عملے کے لیے۔ طلبہ یا والدین کے لیے نہیں۔',
    period: 'مدت',
    timeZone: 'ٹائم زون',
    generated: 'تیار کیا گیا',
    notRecorded: 'درج نہیں',
    qualityLabel: 'معیار کا لیبل',
    columns: {
      studentName: 'طالب علم',
      scheduled: 'مقررہ دن',
      attended: 'حاضر رہے',
      present: 'حاضر',
      late: 'تاخیر',
      halfDay: 'آدھا دن',
      leave: 'رخصت',
      absent: 'غیر حاضر',
      sabaqCompleted: 'سبق مکمل',
      sabqiCompleted: 'سبقی مکمل',
      manzilCompleted: 'منزل مکمل',
      qualityAverage: 'اوسط معیار',
      qualityRatings: 'ریٹنگز',
      outstandingHomework: 'باقی ہوم ورک',
    },
    units: { LINES: 'لائنیں', PARA: 'پارہ', AYAT: 'آیات', PAGES: 'صفحات' },
  },
};

export const exportLabels = (locale: Locale): Labels => LABELS[locale];

/** "10 lines; 3/4 Para" in the export's language; one entry per unit, never added across units. */
const totalsText = (locale: Locale) => (totals: readonly Quantity[]): string => totals.map((q) => `${fractionText(q)} ${LABELS[locale].units[q.unit]}`).join('; ');

export interface ExportTable {
  header: string[];
  rows: (string | number)[][];
}

/**
 * The table both files show: the export columns plus the quality label of the average's nearest score (the approved
 * scale). Missing values read "Not recorded", never 0.
 */
export function exportTable(summary: ClassSummary, locale: Locale): ExportTable {
  const l = LABELS[locale];
  const rows = classSummaryExportRows(summary, totalsText(locale));
  const header = [...CLASS_SUMMARY_COLUMNS.map((c) => l.columns[c]), l.qualityLabel];
  return {
    header,
    rows: rows.map((r, i) => {
      const nearest = summary.rows[i]!.quality.nearestScore;
      return [
        ...CLASS_SUMMARY_COLUMNS.map((c) => {
          const v = r[c];
          return v === null || v === '' ? (c.endsWith('Completed') ? '' : l.notRecorded) : v;
        }),
        nearest === null ? l.notRecorded : qualityLabel(nearest, locale),
      ];
    }),
  };
}

/** FR-XLS-009: a text cell that a spreadsheet could read as a formula is prefixed with '. */
export function safeCell(value: string | number): string | number {
  if (typeof value !== 'string') return value;
  return /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
}

export async function classSummaryXlsx(summary: ClassSummary, meta: ExportMeta): Promise<Buffer> {
  const l = LABELS[meta.locale];
  const table = exportTable(summary, meta.locale);
  const wb = new ExcelJS.Workbook();
  wb.created = new Date(meta.generatedAt);
  const sheet = wb.addWorksheet('ClassSummary', { views: [{ rightToLeft: meta.locale === 'ur', state: 'frozen', ySplit: 1 }] });
  sheet.addRow(table.header.map(safeCell)).font = { bold: true };
  for (const row of table.rows) sheet.addRow(row.map(safeCell));
  sheet.columns.forEach((c) => (c.width = 18));
  const m = wb.addWorksheet('_meta', { state: 'hidden' });
  for (const [k, v] of [
    ['TemplateName', 'ClassSummary'],
    ['TemplateVersion', '1'],
    ['Class', meta.className],
    ['PeriodKind', summary.period.kind],
    ['PeriodFrom', summary.period.from],
    ['PeriodTo', summary.period.to],
    ['TimeZone', summary.period.timeZone],
    ['GeneratedAt', meta.generatedAt],
    ['Locale', meta.locale],
    // Server-built from synced data: never provisional (NFR-OFF-008).
    ['PendingOfflineChanges', 'false'],
    ['Note', l.staffOnly],
  ] as const)
    m.addRow([k, safeCell(v)]);
  return Buffer.from(await wb.xlsx.writeBuffer());
}

const escapeHtml = (s: string): string => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

/** The PDF's HTML (rendered by Chromium). Every value is escaped text. */
export function classSummaryHtml(summary: ClassSummary, meta: ExportMeta): string {
  const l = LABELS[meta.locale];
  const table = exportTable(summary, meta.locale);
  const rtl = meta.locale === 'ur';
  const font = rtl ? "'Noto Nastaliq Urdu', 'Noto Naskh Arabic', 'Inter', sans-serif" : "'Inter', 'Noto Naskh Arabic', sans-serif";
  const cell = (v: string | number) => `<td>${escapeHtml(String(v))}</td>`;
  return `<!doctype html>
<html lang="${meta.locale}" dir="${rtl ? 'rtl' : 'ltr'}"><head><meta charset="utf-8">
<style>
  @page { size: A4 landscape; margin: 14mm; }
  body { font-family: ${font}; font-size: 10pt; color: #1F2924; }
  h1 { font-size: 16pt; color: #116747; margin: 0 0 4mm; }
  p { margin: 0 0 2mm; }
  table { width: 100%; border-collapse: collapse; margin-top: 4mm; }
  thead { display: table-header-group; }
  tr { page-break-inside: avoid; break-inside: avoid; }
  th, td { border: 1px solid #E5E9E2; padding: 2mm; text-align: start; vertical-align: top; }
  th { background: #E5F1E9; }
</style></head><body>
<h1>${escapeHtml(l.title)} · ${escapeHtml(meta.className)}</h1>
<p>${escapeHtml(l.period)}: <bdi>${summary.period.from}</bdi> – <bdi>${summary.period.to}</bdi> · ${escapeHtml(l.timeZone)}: <bdi>${escapeHtml(summary.period.timeZone)}</bdi></p>
<p>${escapeHtml(l.generated)}: <bdi>${escapeHtml(meta.generatedAt)}</bdi></p>
<p>${escapeHtml(l.staffOnly)}</p>
<table><thead><tr>${table.header.map((h) => `<th>${escapeHtml(h)}</th>`).join('')}</tr></thead>
<tbody>${table.rows.map((r) => `<tr>${r.map(cell).join('')}</tr>`).join('\n')}</tbody></table>
</body></html>`;
}

/** Renders HTML to PDF. The default is headless Chromium; tests may pass another. */
export interface PdfRenderer {
  render(html: string): Promise<Buffer>;
  close(): Promise<void>;
}

export function chromiumRenderer(): PdfRenderer {
  type Browser = Awaited<ReturnType<(typeof import('playwright'))['chromium']['launch']>>;
  let browser: Promise<Browser> | null = null;
  return {
    async render(html) {
      browser ??= import('playwright').then(({ chromium }) => chromium.launch());
      const page = await (await browser).newPage();
      try {
        await page.setContent(html, { waitUntil: 'load' });
        return Buffer.from(await page.pdf({ format: 'A4', landscape: true, printBackground: true, preferCSSPageSize: true }));
      } finally {
        await page.close();
      }
    },
    async close() {
      if (browser) await (await browser).close();
      browser = null;
    },
  };
}
