// F04 · Calendar and attendance — unit (docs/specs/08-f04-calendar-attendance/)
import { describe, it } from 'vitest';

describe('F04 · scheduled days', () => {
  it.todo('F04-AC1 (US-013) a Monday–Saturday schedule makes Sunday a no-class day');
  it.todo('F04-AC2 (US-013) days before a schedule change use the old schedule; days from its effective date use the new one');
  it.todo('F04-AC3 (US-014) a madrasa-wide holiday is a holiday, never an absence');
  it.todo('F04-AC4 (US-014) a no-class exception applies only to that class');
  it.todo('F04 unit: dates outside a student enrollment are not scheduled for that student');
  it.todo('F04 unit: scheduled days are computed in the organization timezone (default Asia/Karachi)');
});

describe('F04 · attendance categories', () => {
  it.todo('F04-AC8 (US-015) unmarked students produce no record until the Teacher confirms Mark them Absent');
  it.todo('F04-AC11 (US-015) an Absent mark never yields a portion attempt, failure, or quality value');
});

describe('F04 · Leave approval state machine', () => {
  it.todo('F04-AC13 (US-016) a Teacher-marked LEAVE with a reason is awaiting approval');
  it.todo('F04-AC14 (US-016) Leave without a reason is rejected');
  it.todo('F04-AC15 (US-017) Admin approval makes it an approved LEAVE');
  it.todo('F04-AC16 (US-017) Admin rejection makes it a normal absence with status rejected');
  it.todo('F04-AC17 (US-017) a Teacher cannot approve or reject a Leave');
});

describe('Decision review 2026-10-30 (SRS §17)', () => {
  it.todo('F04-AC18 (US-015) Absent can become Late and Present can become Half day, audited');
  it.todo('F04-AC20 (US-014) a holiday declared on a recorded date excludes its records and refuses new ones');
});
