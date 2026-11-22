// F10 · Portal display rules — unit (docs/specs/13-f10-student-parent-access.md; design.md §4.11, §4.12).
// The portal screens hold no rules of their own; these are the ones they render.
import { describe, expect, it } from 'vitest';
import { ApiFailure } from '../../api/client.ts';
import { appendPage, categoryCounts, pickStudent, portalFailure, showSwitcher } from './view.ts';

describe('F10 · portal states', () => {
  it('F10-AC4 (US-044) no connection is "network unavailable", never a cached report', () => {
    expect(portalFailure(new ApiFailure('NETWORK', 0))).toBe('OFFLINE');
  });

  it('F10-AC2 (US-044) another student, an unpublished report, and a revoked link all read "not available"', () => {
    expect(portalFailure(new ApiFailure('NOT_FOUND', 404))).toBe('NOT_AVAILABLE');
    expect(portalFailure(new ApiFailure('FORBIDDEN', 403))).toBe('NOT_AVAILABLE');
    expect(portalFailure(new ApiFailure('INTERNAL', 500))).toBe('ERROR');
    expect(portalFailure(new Error('boom'))).toBe('ERROR');
  });
});

describe('F10 · linked-student switcher', () => {
  const two = [{ id: 's1' }, { id: 's2' }];

  it('F10-AC5 (US-045) a Parent with two verified links switches between those two only', () => {
    expect(showSwitcher(two)).toBe(true);
    expect(showSwitcher([{ id: 's1' }])).toBe(false);
    expect(pickStudent(two, null)).toBe('s1');
    expect(pickStudent(two, 's2')).toBe('s2');
    // A student the server did not list can never be chosen (no search, F10-AC6).
    expect(pickStudent(two, 's3')).toBe('s1');
  });

  it('F10-AC7 (US-045) a revoked child disappears from the switcher on the next load', () => {
    expect(pickStudent([{ id: 's1' }], 's2')).toBe('s1');
    expect(pickStudent([], 's1')).toBeNull();
  });
});

describe('F10 · report list and figures', () => {
  it('F10 unit: a further page adds only reports not yet listed, in order', () => {
    expect(appendPage([{ id: 'a' }, { id: 'b' }], [{ id: 'b' }, { id: 'c' }])).toEqual([{ id: 'a' }, { id: 'b' }, { id: 'c' }]);
  });

  it('F10-AC17 (US-044) mistake counts by category list only the categories that occurred', () => {
    expect(categoryCounts({ HARKAAT: 0, TAJWEED: 2, LAFZI: 1 })).toEqual([
      ['TAJWEED', 2],
      ['LAFZI', 1],
    ]);
  });
});
