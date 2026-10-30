// F07 · Mistakes and quality — unit: quality scale (docs/specs/10-f07-mistakes-quality/)
// Scale is lower-is-better: 1 Excellent … 5 Weak (SRS FR-ATT-009).
import { describe, it } from 'vitest';

describe('F07 · scale', () => {
  it.todo('F07-AC6 (US-031) lists 1 · Excellent … 5 · Weak in order, with "Not assessed" as the default');
  it.todo('F07 unit: every score has a label in en, ur, and ur-Latn matching the approved table');
});

describe('F07 · missing ratings', () => {
  it.todo('F07-AC7 (US-031) a NULL score reads "Not recorded", never 0');
  it.todo('F07-AC10 (US-031) Absent, Not Assigned, and Pending attempts accept and count no score');
});

describe('F07 · average', () => {
  it.todo('F07-AC8 (US-031) scores 1, 2, 2 and one NULL → 1.7 · Good (3 ratings)');
  it.todo('F07-AC9 (US-031) an average of exactly 1.5 is labelled Good (.5 rounds up)');
  it.todo('F07 unit: a falling average is reported as improvement');
});

describe('F07 · overall performance label', () => {
  it.todo('F07-AC12 (US-032) the overall label is stored once per record, separate from portion scores');
  it.todo('F07-AC13 (US-032) the label is never derived from scores, and scores are never derived from the label');
});
