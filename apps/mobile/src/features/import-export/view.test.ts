// F14 · Import/export screen helpers — unit (docs/specs/14-f14-excel-import-export.md). Synthetic data only.
import { describe, expect, it } from 'vitest';
import type { ImportJobView, ImportRowView } from '@hifz/contracts';
import { exportPath } from './api.ts';
import { canConfirm, countRows, rowsToReview, rowsToWrite, stepOf, weekOf } from './view.ts';

const job = (over: Partial<ImportJobView> = {}): ImportJobView => ({
  id: '0190f5c0-0000-7000-8000-000000000001',
  template: 'Students',
  templateVersion: '1',
  mode: 'ADD_ONLY',
  status: 'PREVIEWED',
  rowCount: 6,
  counts: { NEW: 2, EXACT_MATCH: 1, SUSPECTED_DUPLICATE: 1, INVALID: 1, PROPOSED_UPDATE: 1 },
  resultCounts: null,
  batchCount: 0,
  createdAt: '2026-11-22T00:00:00.000Z',
  finishedAt: null,
  ignoredColumns: [],
  valuesPurged: false,
  ...over,
});

const row = (rowNo: number, classification: ImportRowView['classification'], issues = 0, changes = 0): ImportRowView => ({
  rowNo,
  classification,
  issues: Array.from({ length: issues }, () => ({ column: 'StudentName', code: 'REQUIRED' as const, severity: 'ERROR' as const, message: 'StudentName is required' })),
  changes: Array.from({ length: changes }, () => ({ column: 'StudentName', before: 'A', after: 'B' })),
  batchNo: null,
  result: null,
  resultIssues: [],
});

describe('F14 · import wizard helpers', () => {
  it('F14-AC11 (US-060) the preview lists every row class in a fixed order with its count', () => {
    expect(countRows(job()).map((c) => `${c.classification}:${c.count}`)).toEqual(['NEW:2', 'EXACT_MATCH:1', 'SUSPECTED_DUPLICATE:1', 'INVALID:1', 'PROPOSED_UPDATE:1']);
    expect(stepOf(null)).toBe('choose');
    expect(stepOf(job())).toBe('preview');
    expect(stepOf(job({ status: 'COMMITTED' }))).toBe('results');
  });

  it('F14-AC13 (US-060) add-new-only writes only new rows; update mode adds the proposed updates', () => {
    expect(rowsToWrite(job())).toBe(2);
    expect(rowsToWrite(job({ mode: 'UPDATE' }))).toBe(3);
    expect(canConfirm(job({ counts: { NEW: 0, EXACT_MATCH: 6, SUSPECTED_DUPLICATE: 0, INVALID: 0, PROPOSED_UPDATE: 0 } }))).toBe(false);
    expect(canConfirm(job({ status: 'PARTIALLY_FAILED' }))).toBe(true);
    expect(canConfirm(job({ valuesPurged: true }))).toBe(false);
  });

  it('F14-AC12 (US-060) rows with problems are listed first, invalid before suspected', () => {
    const list = rowsToReview([row(2, 'NEW'), row(3, 'SUSPECTED_DUPLICATE', 1), row(4, 'INVALID', 1), row(5, 'PROPOSED_UPDATE', 0, 1)]);
    expect(list.map((r) => r.rowNo)).toEqual([4, 3, 5]);
  });

  it('F14-AC17 (US-061) a family export never asks for private notes', () => {
    expect(exportPath({ kind: 'daily-records', from: '2026-11-16', to: '2026-11-22', audience: 'FAMILY', includeNotes: true }, 'ur')).toBe(
      '/exports/daily-records?from=2026-11-16&to=2026-11-22&audience=FAMILY&includeNotes=false&locale=ur',
    );
    expect(exportPath({ kind: 'students', includeNotes: true }, 'en')).toBe('/exports/students?includeNotes=true&locale=en');
    expect(weekOf('2026-11-22')).toEqual({ from: '2026-11-16', to: '2026-11-22' });
  });
});
