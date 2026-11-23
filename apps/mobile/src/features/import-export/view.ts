// F14 · Import/export screen helpers: pure TypeScript, no React Native imports, so they are unit-tested with Vitest.
// The screen owns no import rules: the server classifies every row (FR-XLS-011) and builds every file.
import { IMPORT_CLASSIFICATIONS, type ImportClassification, type ImportJobView, type ImportRowView } from '@hifz/contracts';

/** Row classes in preview order, each with a glyph so status is never shown by colour alone (design §5). */
export const CLASSIFICATION_GLYPHS: Readonly<Record<ImportClassification, string>> = {
  NEW: '+',
  EXACT_MATCH: '=',
  SUSPECTED_DUPLICATE: '?',
  INVALID: '✗',
  PROPOSED_UPDATE: '✎',
};

export type ImportStep = 'choose' | 'preview' | 'results';

/** Where the wizard is for a job: no job → choose; committed or failed → results; otherwise the preview. */
export function stepOf(job: ImportJobView | null): ImportStep {
  if (!job) return 'choose';
  return job.status === 'COMMITTED' || job.status === 'PARTIALLY_FAILED' ? 'results' : 'preview';
}

/** Counts in the fixed preview order (F14-AC11), zeros included. */
export const countRows = (job: ImportJobView): { classification: ImportClassification; count: number }[] =>
  IMPORT_CLASSIFICATIONS.map((classification) => ({ classification, count: job.counts[classification] ?? 0 }));

/** What confirming would write: NEW rows, plus PROPOSED_UPDATE rows in update mode. Never invalid or suspected rows. */
export function rowsToWrite(job: ImportJobView): number {
  return job.counts.NEW + (job.mode === 'UPDATE' ? job.counts.PROPOSED_UPDATE : 0);
}

/** Confirm is offered only for a previewed job with something to write, or a partly failed job (retry). */
export function canConfirm(job: ImportJobView): boolean {
  if (job.valuesPurged) return false;
  if (job.status === 'PARTIALLY_FAILED') return true;
  return job.status === 'PREVIEWED' && rowsToWrite(job) > 0;
}

/** Rows worth listing in the preview: those with an issue or a proposed change, invalid first. */
export function rowsToReview(rows: readonly ImportRowView[]): ImportRowView[] {
  const rank: Record<ImportClassification, number> = { INVALID: 0, SUSPECTED_DUPLICATE: 1, PROPOSED_UPDATE: 2, NEW: 3, EXACT_MATCH: 4 };
  return rows
    .filter((r) => r.issues.length > 0 || r.changes.length > 0 || r.resultIssues.length > 0)
    .sort((a, b) => rank[a.classification] - rank[b.classification] || a.rowNo - b.rowNo);
}

/** Monday–Sunday week of `today` (YYYY-MM-DD), the default export range. */
export function weekOf(today: string): { from: string; to: string } {
  const d = new Date(`${today}T00:00:00Z`);
  const offset = (d.getUTCDay() + 6) % 7;
  const from = new Date(d.getTime() - offset * 86_400_000);
  const to = new Date(from.getTime() + 6 * 86_400_000);
  return { from: from.toISOString().slice(0, 10), to: to.toISOString().slice(0, 10) };
}
