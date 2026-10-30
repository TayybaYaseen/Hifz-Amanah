// F03 · Classes and students — unit: enrollment date ranges (docs/specs/06-f03-classes-students/)
import { describe, it } from 'vitest';

describe('F03 · enrollment moves', () => {
  it.todo('F03-AC11 (US-012) moving from Class A to Class B on a date ends Class A the day before and starts Class B on that date');
  it.todo('F03-AC12 (US-012) for a date before the move, the applicable class is Class A');
  it.todo('F03-AC13 (US-012) enrollment history lists every enrollment with start and end dates in order');
});

describe('F03 · active status', () => {
  it.todo('F03-AC4 (US-010) a deactivated class is excluded from entry pickers but kept for past reports');
  it.todo('F03-AC9 (US-011) a deactivated student is excluded from entry pickers but kept in reports for earlier periods');
  it.todo('F03-AC10 (US-011) a reactivated student is eligible for entry pickers again');
});
