// F09 · Weekly and monthly reports — unit: buildReport() (docs/specs/12-f09-weekly-monthly-reports/)
import { describe, it } from 'vitest';

describe('F09 · period boundaries', () => {
  it.todo('F09-AC1 (US-039) a weekly report covers Monday 00:00 to Sunday 23:59 Asia/Karachi and states the range (AC-RPT-07)');
  it.todo('F09 unit: the week start follows the organization setting');
  it.todo('F09 unit: monthly boundaries are calendar months in the organization timezone');
});

describe('F09 · totals', () => {
  it.todo('F09-AC2 (US-039) every total equals a direct calculation from source records (AC-RPT-01)');
  it.todo('F09-AC4 (US-039) quantities are grouped by unit and never combined (AC-RPT-04)');
  it.todo('F09-AC5 (US-039) assigned quantity is counted once; status comes from the latest attempt (AC-RPT-05)');
  it.todo('F09-AC7 (US-039) scores 1, 3 and two missing → 2.0 · Good (2 ratings) (AC-RPT-03)');
  it.todo('F09-AC8 (US-040) Sabaq, Sabqi, and Manzil are aggregated separately with Para-wise progress and pending portions');
  it.todo('F09-AC14 (US-043) three Manzil portions on one day appear as three lines with their own status and quantity');
});

describe('F09 · homework measures', () => {
  it.todo('F09-AC6 (US-039) confirmed homework and draft suggestions are separate counts (AC-RPT-06)');
  it.todo('F09-AC9 (US-040) assigned, attempted, completed, and carried-forward homework are four separate measures');
});

describe('F09 · recurring difficulty', () => {
  it.todo('F09-AC10 (US-040) a Para with Major or repeated mistakes in 3+ attempts is listed; 2 attempts is not');
});

describe('F09 · attendance', () => {
  it.todo('F09-AC11 (US-041) 2 absences and 4 recited days → absent days never appear as failed or zero performance');
  it.todo('F09-AC12 (US-041) holidays and unscheduled days are listed as such, not as absences (AC-RPT-08)');
  it.todo('F09-AC13 (US-042) one approved Leave, one rejected, one plain absence → 1 Leave and 2 normal absences');
});

describe('F09 · provisional', () => {
  it.todo('F09-AC16 (US-039) a report with unsynced local changes is marked provisional with last sync time and pending count');
});

describe('Decision review 2026-10-30 (SRS §17)', () => {
  it.todo('F07-AC14 (US-028) "No mistakes" stores 0; an empty list stays Not recorded');
  it.todo('F09-AC17 (US-041) attended counts Present, Late, and Half day; Leave and Absent are separate');
});
