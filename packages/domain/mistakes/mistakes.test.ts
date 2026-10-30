// F07 · Mistakes and quality — unit: mistakes (docs/specs/10-f07-mistakes-quality/)
import { describe, it } from 'vitest';

describe('F07 · mistake shape', () => {
  it.todo('F07-AC1 (US-028) each mistake has exactly one category');
  it.todo('F07-AC2 (US-028) the stored category is the canonical value (e.g. TAJWEED) whatever the UI language');
  it.todo('F07-AC4 (US-029) severity accepts only MINOR or MAJOR');
  it.todo('F07-AC5 (US-030) Repeated is a separate flag and never changes severity');
});

describe('F07 · aggregation', () => {
  it.todo('F07-AC3 (US-028) weekly counts are grouped per category');
  it.todo('F07 unit: a missing mistake count is unknown, not 0');
});
