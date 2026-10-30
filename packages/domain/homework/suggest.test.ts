// F08 · Homework and carry forward — unit (docs/specs/11-f08-homework-carry-forward/)
import { describe, it } from 'vitest';

describe('F08 · suggest() eligibility', () => {
  it.todo('F08-AC5 (US-035) PARTIAL with remaining > 0 is suggested with its remaining quantity and source attempt (AC-HW-01, AC-HW-08)');
  it.todo('F08-AC5 (US-035) NOT_REMEMBERED with remaining > 0 is suggested with its remaining quantity and source attempt');
  it.todo('F08-AC6 (US-035) ABSENT, NOT_ASSIGNED, PENDING, and COMPLETED are not suggested (AC-HW-09)');
  it.todo('F08 unit: eligibility uses only the latest attempt per portion');
});

describe('F08 · remaining', () => {
  it.todo('F08-AC3 (US-034) 3/4 Para assigned, 1/2 completed → 1/4 Para');
  it.todo('F08-AC4 (US-034) different units → no remaining, portion flagged for review');
});

describe('F08 · draft lifecycle', () => {
  it.todo('F08-AC8 (US-036) each draft portion records whether it was suggested, edited, or added (AC-HW-02)');
  it.todo('F08-AC9 (US-036) a rejected draft has status REJECTED and is not counted as homework');
  it.todo('F08-AC10 (US-037) confirming records the confirming Teacher and time (AC-HW-04)');
  it.todo('F08-AC11 (US-037) a draft is never confirmed automatically (AC-HW-03)');
});

describe('F08 · recalculation and revision', () => {
  it.todo('F08-AC14 (US-038) correcting a source attempt rebuilds drafts and leaves confirmed homework unchanged (AC-HW-06, AC-HW-07)');
  it.todo('F08-AC15 (US-038) an Admin revision creates a linked new assignment and marks the old one SUPERSEDED');
  it.todo('F08-AC13 (US-038) a new assignment never modifies an earlier confirmed one (AC-HW-05)');
});

describe('Decision review 2026-10-30 (SRS §17)', () => {
  it.todo('F08-AC18 (US-036) the due date defaults to the next scheduled class day');
  it.todo('F08-AC19 (US-038) homework missed through absence or a holiday carries over unchanged');
});
