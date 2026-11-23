// F14 · Excel import and export requests (contract packages/contracts/src/import-export.ts; apps/api/README.md
// "Import and export routes"). Online only: the server validates, previews, commits, and builds every file (offline is
// out of scope, F14). The language is sent with each call so preview messages come back localized (NFR-XLS-003).
import {
  XLSX_CONTENT_TYPE,
  type ExportAudience,
  type ImportJobView,
  type ImportMode,
  type ImportRowsResponse,
  type ImportTemplate,
  type Locale,
  type ReportPeriodKind,
} from '@hifz/contracts';
import type { RequestOptions } from '../../api/client.ts';

interface Authorized {
  authorized<T>(path: string, opts?: Omit<RequestOptions, 'token'>): Promise<T>;
}

/** Imports and file builds can take longer than a normal call (1,000 rows, 5 batches). */
const LONG = 120_000;

export const uploadWorkbook = (session: Authorized, template: ImportTemplate, file: Blob, locale: Locale) =>
  session.authorized<ImportJobView>(`/imports?template=${template}&locale=${encodeURIComponent(locale)}`, { upload: { data: file, contentType: XLSX_CONTENT_TYPE }, timeoutMs: LONG });

export const fetchImportRows = (session: Authorized, jobId: string, locale: Locale, opts: { offset?: number; limit?: number } = {}) =>
  session.authorized<ImportRowsResponse>(`/imports/${jobId}/rows?locale=${encodeURIComponent(locale)}&offset=${opts.offset ?? 0}&limit=${opts.limit ?? 1000}`);

export const setImportMode = (session: Authorized, jobId: string, mode: ImportMode, locale: Locale) =>
  session.authorized<ImportJobView>(`/imports/${jobId}/mode?locale=${encodeURIComponent(locale)}`, { method: 'PUT', body: { mode }, timeoutMs: LONG });

export const confirmImport = (session: Authorized, jobId: string, mode: ImportMode, locale: Locale) =>
  session.authorized<ImportJobView>(`/imports/${jobId}/confirm?locale=${encodeURIComponent(locale)}`, { body: { mode }, timeoutMs: LONG });

export const downloadTemplate = (session: Authorized, template: ImportTemplate, locale: Locale) =>
  session.authorized<ArrayBuffer>(`/imports/templates/${template}?locale=${encodeURIComponent(locale)}`, { binary: true, timeoutMs: LONG });

export type ExportRequest =
  | { kind: 'students'; includeNotes: boolean }
  | { kind: 'daily-records'; from: string; to: string; audience: ExportAudience; includeNotes: boolean }
  | { kind: 'report'; classId: string; period: ReportPeriodKind; date: string };

/** The export's path and query (pure; tested). */
export function exportPath(req: ExportRequest, locale: Locale): string {
  const l = `locale=${encodeURIComponent(locale)}`;
  switch (req.kind) {
    case 'students':
      return `/exports/students?includeNotes=${req.includeNotes}&${l}`;
    case 'daily-records':
      return `/exports/daily-records?from=${req.from}&to=${req.to}&audience=${req.audience}&includeNotes=${req.audience === 'STAFF' && req.includeNotes}&${l}`;
    case 'report':
      return `/exports/report?classId=${req.classId}&kind=${req.period}&date=${req.date}&${l}`;
  }
}

export const downloadExport = (session: Authorized, req: ExportRequest, locale: Locale) => session.authorized<ArrayBuffer>(exportPath(req, locale), { binary: true, timeoutMs: LONG });
