// F07 · Mistakes and quality — unit: quality scale (docs/specs/10-f07-mistakes-quality.md)
// Scale is lower-is-better: 1 Excellent … 5 Weak (SRS FR-ATT-009).
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  OVERALL_LABELS,
  QUALITY_SCALE,
  attemptsQualityAverage,
  averageLabel,
  countedScore,
  isOverallLabel,
  qualityAverage,
  qualityDisplay,
  qualityLabel,
  qualityLabelCatalogue,
  qualitySelector,
  qualityText,
  qualityTrend,
  recordPerformance,
} from './index.ts';

describe('F07 · scale', () => {
  it('F07-AC6 (US-031) lists 1 · Excellent … 5 · Weak in order, with "Not assessed" as the default', () => {
    const s = qualitySelector('en');
    expect(s.selected).toBeNull();
    expect(s.options[0]).toEqual({ score: null, text: null });
    expect(s.options.slice(1).map((o) => o.text)).toEqual(['1 · Excellent', '2 · Good', '3 · Average', '4 · Needs Improvement', '5 · Weak']);
    expect(qualitySelector('ur').options.slice(1).map((o) => o.text)).toEqual(['1 · ممتاز', '2 · اچھا', '3 · اوسط', '4 · مزید محنت کی ضرورت', '5 · کمزور']);
    expect(qualitySelector('ur-Latn').options.slice(1).map((o) => o.text)).toEqual(['1 · Mumtaz', '2 · Achha', '3 · Ausat', '4 · Mazeed mehnat ki zaroorat', '5 · Kamzor']);
  });

  it('F07 unit: every score has a label in en, ur, and ur-Latn matching the approved table', () => {
    const approved: Record<number, [string, string, string]> = {
      1: ['Excellent', 'ممتاز', 'Mumtaz'],
      2: ['Good', 'اچھا', 'Achha'],
      3: ['Average', 'اوسط', 'Ausat'],
      4: ['Needs Improvement', 'مزید محنت کی ضرورت', 'Mazeed mehnat ki zaroorat'],
      5: ['Weak', 'کمزور', 'Kamzor'],
    };
    expect(QUALITY_SCALE.map((e) => e.score)).toEqual([1, 2, 3, 4, 5]);
    for (const [score, [en, ur, latn]] of Object.entries(approved)) {
      expect(qualityLabel(Number(score), 'en')).toBe(en);
      expect(qualityLabel(Number(score), 'ur')).toBe(ur);
      expect(qualityLabel(Number(score), 'ur-Latn')).toBe(latn);
    }
    expect(qualityLabelCatalogue('en')).toEqual({ '1': 'Excellent', '2': 'Good', '3': 'Average', '4': 'Needs Improvement', '5': 'Weak' });
    // Western digits in every language (DEC-B38, FR-I18N-009).
    expect(qualityText(1, 'ur')).toBe('1 · ممتاز');
    expect(() => qualityLabel(0, 'en')).toThrow(RangeError);
    expect(() => qualityLabel(6, 'en')).toThrow(RangeError);
    expect(() => qualityLabel(2.5, 'en')).toThrow(RangeError);
  });
});

describe('F07 · missing ratings', () => {
  it('F07-AC7 (US-031) a NULL score reads "Not recorded", never 0', () => {
    expect(qualityDisplay(null)).toEqual({ kind: 'NOT_RECORDED' });
    expect(qualityDisplay(undefined)).toEqual({ kind: 'NOT_RECORDED' });
    expect(qualityDisplay(3)).toEqual({ kind: 'SCORE', score: 3 });
    expect(() => qualityDisplay(0)).toThrow(RangeError);
    // An average of nothing is "Not recorded" with 0 ratings, not 0.
    expect(qualityAverage([null, null])).toEqual({ count: 0, sum: 0, value: null, display: null, nearestScore: null });
    expect(averageLabel(qualityAverage([]), 'en')).toBeNull();
  });

  it('F07-AC10 (US-031) Absent, Not Assigned, and Pending attempts accept and count no score', () => {
    for (const status of ['ABSENT', 'NOT_ASSIGNED', 'PENDING'] as const) {
      expect(countedScore({ status, quality: 3 })).toBeNull();
      expect(countedScore({ status, quality: null })).toBeNull();
    }
    for (const status of ['COMPLETED', 'PARTIAL', 'NOT_REMEMBERED'] as const) expect(countedScore({ status, quality: 4 })).toBe(4);
    const avg = attemptsQualityAverage([
      { status: 'COMPLETED', quality: 2 },
      { status: 'ABSENT', quality: 5 },
      { status: 'PENDING', quality: null },
      { status: 'NOT_ASSIGNED', quality: 1 },
    ]);
    expect(avg).toMatchObject({ count: 1, value: 2, nearestScore: 2 });
  });
});

describe('F07 · average', () => {
  it('F07-AC8 (US-031) scores 1, 2, 2 and one NULL → 1.7 · Good (3 ratings)', () => {
    const avg = qualityAverage([1, 2, 2, null]);
    expect(avg.count).toBe(3);
    expect(avg.value).toBeCloseTo(5 / 3, 10);
    expect(avg.display).toBe('1.7');
    expect(avg.nearestScore).toBe(2);
    expect(averageLabel(avg, 'en')).toBe('Good');
  });

  it('F07-AC9 (US-031) an average of exactly 1.5 is labelled Good (.5 rounds up)', () => {
    expect(qualityAverage([1, 2])).toMatchObject({ value: 1.5, display: '1.5', nearestScore: 2 });
    // SRS FR-ATT-009 examples: 1.4 → 1 Excellent, 3.6 → 4 Needs Improvement.
    expect(qualityAverage([1, 1, 1, 2, 2]).nearestScore).toBe(1); // 1.4
    expect(qualityAverage([3, 3, 4, 4, 4]).nearestScore).toBe(4); // 3.6
    expect(qualityAverage([1, 2, 2, 2, 2, 2, 2, 2, 2, 2]).display).toBe('1.9'); // 1.9
    // 29/20 = 1.45: nearest 1, shown as 1.5 (half up at one decimal, exact integer arithmetic).
    expect(qualityAverage([...Array(11).fill(1), ...Array(9).fill(2)])).toMatchObject({ nearestScore: 1, display: '1.5' });
  });

  it('F07 unit: the average is exact, NULL-excluded, and its label is the nearest score with .5 up (property)', () => {
    fc.assert(
      fc.property(fc.array(fc.option(fc.integer({ min: 1, max: 5 }), { nil: null }), { maxLength: 60 }), (scores) => {
        const rated = scores.filter((s): s is number => s !== null);
        const avg = qualityAverage(scores);
        expect(avg.count).toBe(rated.length);
        if (rated.length === 0) {
          expect(avg.value).toBeNull();
          return;
        }
        const exact = rated.reduce((a, b) => a + b, 0) / rated.length;
        expect(avg.value).toBeCloseTo(exact, 10);
        expect(avg.nearestScore! - exact).toBeLessThanOrEqual(0.5 + 1e-9);
        expect(exact - avg.nearestScore!).toBeLessThan(0.5);
      }),
    );
  });

  it('F07 unit: a falling average is reported as improvement', () => {
    expect(qualityTrend(3.2, 2.1)).toBe('IMPROVED');
    expect(qualityTrend(2.1, 3.2)).toBe('DECLINED');
    expect(qualityTrend(2, 2)).toBe('UNCHANGED');
    expect(qualityTrend(null, 2)).toBe('UNKNOWN');
    expect(qualityTrend(2, null)).toBe('UNKNOWN');
  });
});

describe('F07 · overall performance label', () => {
  it('F07-AC12 (US-032) the overall label is stored once per record, separate from portion scores', () => {
    expect(OVERALL_LABELS).toEqual(['EXCELLENT', 'GOOD', 'AVERAGE', 'NEEDS_IMPROVEMENT']);
    expect(isOverallLabel('GOOD')).toBe(true);
    expect(isOverallLabel('WEAK')).toBe(false); // a quality label, not an overall label
    expect(isOverallLabel(2)).toBe(false);
    const p = recordPerformance({ overallLabel: 'GOOD' }, [
      { status: 'COMPLETED', quality: 4 },
      { status: 'PARTIAL', quality: 5 },
    ]);
    expect(p.overallLabel).toBe('GOOD');
    expect(p.portionScores).toEqual([4, 5]);
    expect(p.quality).toMatchObject({ count: 2, nearestScore: 5 });
  });

  it('F07-AC13 (US-032) the label is never derived from scores, and scores are never derived from the label', () => {
    const noLabel = recordPerformance({ overallLabel: null }, [
      { status: 'COMPLETED', quality: 1 },
      { status: 'COMPLETED', quality: 1 },
    ]);
    expect(noLabel.overallLabel).toBeNull();
    const noScores = recordPerformance({ overallLabel: 'NEEDS_IMPROVEMENT' }, [
      { status: 'COMPLETED', quality: null },
      { status: 'PARTIAL', quality: null },
    ]);
    expect(noScores.portionScores).toEqual([null, null]);
    expect(noScores.quality.value).toBeNull();
    expect(noScores.overallLabel).toBe('NEEDS_IMPROVEMENT');
  });
});
