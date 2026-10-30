// F05 · Daily Hifz entry — unit (docs/specs/09-f05-daily-hifz-entry/)
import { describe, it } from 'vitest';

describe('F05 · status semantics', () => {
  it.todo('F05-AC5 (US-018) an Absent student has no failed portion and no quality for the day');
  it.todo('F05-AC14 (US-022) Not Remembered without a completed quantity defaults completed to 0 and remaining to assigned');
  it.todo('F05 unit: Not Assigned and Pending portions accept and count no quality');
});

describe('F05 · validation', () => {
  it.todo('F05-AC3 (US-018) a missing required field error names the section, portion number, and field');
});

describe('F05 · daily-report mode', () => {
  it.todo('F05-AC6 (US-019) SINGLE mode allows one record per student and date');
  it.todo('F05-AC7 (US-019) MULTI_SESSION mode requires a session label and allows distinct labels on the same date');
  it.todo('F05-AC8 (US-019) switching to SINGLE is blocked while any student/date has two sessions, listing the conflicts');
});

describe('F05 · portions', () => {
  it.todo('F05-AC11 (US-021) changing one Sabqi portion never changes another');
  it.todo('F05-AC12 (US-021) a new Sabqi portion defaults to the current Sabaq Para and may be changed');
  it.todo('F05-AC13 (US-022) three Manzil outcomes stay separate, never collapsed into one status (AC-QTY-06)');
});

describe('F05 · attempts', () => {
  it.todo('F05-AC15 (US-023) adding a second attempt keeps the first unchanged (AC-ATT-05)');
  it.todo('F05-AC16 (US-023) the latest attempt gives the current status and the assigned quantity is counted once');
});
