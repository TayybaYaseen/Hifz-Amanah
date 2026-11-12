// F05 · The daily-report mode switch answer (US-019; F05-AC8). Plain TypeScript, tested with Vitest.
import type { ReportModeConflict } from '@hifz/contracts';
import { ApiFailure } from '../../api/client.ts';

/** The conflict list of a 409 MODE_CONFLICTS answer (contracts ModeConflictsResponse), or null for any other error. */
export function conflictsOf(err: unknown): ReportModeConflict[] | null {
  if (!(err instanceof ApiFailure) || err.code !== 'MODE_CONFLICTS') return null;
  const list = err.details?.conflicts;
  return Array.isArray(list) ? (list as ReportModeConflict[]) : [];
}
