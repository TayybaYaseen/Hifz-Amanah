// F07 · Mistakes and quality — unit: mistakes (docs/specs/10-f07-mistakes-quality.md)
import { describe, expect, it } from 'vitest';
import { MISTAKE_NOTE_MAX, attemptMistakeCount, checkMistake, cleanNote, mistakeCounts, noteForFamily, withRepeated, type Mistake } from './index.ts';

const tajweed: Mistake = { category: 'TAJWEED', severity: 'MINOR', repeated: false, note: null, noteVisibility: 'INTERNAL' };

describe('F07 · mistake shape', () => {
  it('F07-AC1 (US-028) each mistake has exactly one category', () => {
    expect(checkMistake({ category: 'TAJWEED', severity: 'MINOR' })).toEqual({ ok: true, mistake: tajweed });
    expect(checkMistake({ category: ['TAJWEED', 'LAFZI'], severity: 'MINOR' })).toEqual({ ok: false, issues: [{ field: 'category', code: 'INVALID' }] });
    expect(checkMistake({ severity: 'MINOR' })).toEqual({ ok: false, issues: [{ field: 'category', code: 'REQUIRED' }] });
    for (const c of ['HARKAAT', 'TAJWEED', 'LAFZI', 'AYAT_BHOOLNA', 'TARTEEB', 'WAQF_IBTIDA']) expect(checkMistake({ category: c, severity: 'MAJOR' }).ok).toBe(true);
  });

  it('F07-AC2 (US-028) the stored category is the canonical value (e.g. TAJWEED) whatever the UI language', () => {
    // A localized label is not a category: only the canonical value is accepted and stored.
    expect(checkMistake({ category: 'Tajweed', severity: 'MINOR' }).ok).toBe(false);
    expect(checkMistake({ category: 'تجوید', severity: 'MINOR' }).ok).toBe(false);
    const r = checkMistake({ category: 'TAJWEED', severity: 'MINOR' });
    expect(r.ok && r.mistake.category).toBe('TAJWEED');
  });

  it('F07-AC4 (US-029) severity accepts only MINOR or MAJOR', () => {
    expect(checkMistake({ category: 'LAFZI', severity: 'MAJOR' })).toMatchObject({ ok: true, mistake: { severity: 'MAJOR' } });
    expect(checkMistake({ category: 'LAFZI', severity: 'CRITICAL' })).toEqual({ ok: false, issues: [{ field: 'severity', code: 'INVALID' }] });
    expect(checkMistake({ category: 'LAFZI', severity: 'REPEATED' })).toEqual({ ok: false, issues: [{ field: 'severity', code: 'INVALID' }] });
    expect(checkMistake({ category: 'LAFZI' })).toEqual({ ok: false, issues: [{ field: 'severity', code: 'REQUIRED' }] });
  });

  it('F07-AC5 (US-030) Repeated is a separate flag and never changes severity', () => {
    const minor = withRepeated(tajweed, true);
    expect(minor).toEqual({ ...tajweed, repeated: true });
    expect(minor.severity).toBe('MINOR');
    const major = withRepeated({ ...tajweed, severity: 'MAJOR' as const }, true);
    expect(withRepeated(major, false).severity).toBe('MAJOR');
    expect(checkMistake({ category: 'LAFZI', severity: 'MINOR', repeated: true })).toMatchObject({ ok: true, mistake: { severity: 'MINOR', repeated: true } });
    expect(checkMistake({ category: 'LAFZI', severity: 'MINOR', repeated: 'yes' }).ok).toBe(false);
  });

  it('F07-AC15 (US-028) a note is short, trimmed, internal by default, and shown to families only when SHARED', () => {
    const r = checkMistake({ category: 'LAFZI', severity: 'MINOR', note: '  synthetic note  ' });
    expect(r).toMatchObject({ ok: true, mistake: { note: 'synthetic note', noteVisibility: 'INTERNAL' } });
    expect(noteForFamily(r.ok ? r.mistake : tajweed)).toBeNull();
    expect(noteForFamily({ note: 'synthetic note', noteVisibility: 'SHARED' })).toBe('synthetic note');
    expect(checkMistake({ category: 'LAFZI', severity: 'MINOR', note: 'x'.repeat(MISTAKE_NOTE_MAX) }).ok).toBe(true);
    expect(checkMistake({ category: 'LAFZI', severity: 'MINOR', note: 'x'.repeat(MISTAKE_NOTE_MAX + 1) })).toEqual({ ok: false, issues: [{ field: 'note', code: 'TOO_LONG', max: 200 }] });
    expect(checkMistake({ category: 'LAFZI', severity: 'MINOR', noteVisibility: 'PUBLIC' }).ok).toBe(false);
    expect(cleanNote('   ')).toBeNull();
  });
});

describe('F07 · aggregation', () => {
  it('F07-AC3 (US-028) weekly counts are grouped per category', () => {
    const counts = mistakeCounts([
      { noMistakes: false, mistakes: [{ category: 'TAJWEED', severity: 'MAJOR', repeated: false }, { category: 'LAFZI', severity: 'MINOR', repeated: true }] },
      { noMistakes: false, mistakes: [{ category: 'TAJWEED', severity: 'MINOR', repeated: false }] },
      { noMistakes: true, mistakes: [] },
      { noMistakes: false, mistakes: [] },
    ]);
    expect(counts.byCategory).toEqual({ HARKAAT: 0, TAJWEED: 2, LAFZI: 1, AYAT_BHOOLNA: 0, TARTEEB: 0, WAQF_IBTIDA: 0 });
    expect(counts).toMatchObject({ total: 3, major: 1, minor: 2, repeated: 1, recordedAttempts: 3, noMistakesAttempts: 1, notRecordedAttempts: 1, uncategorized: 0 });
  });

  it('F07 unit: a missing mistake count is unknown, not 0', () => {
    expect(attemptMistakeCount({ noMistakes: false, mistakes: [] })).toEqual({ kind: 'NOT_RECORDED' });
    expect(attemptMistakeCount({ noMistakes: true, mistakes: [] })).toEqual({ kind: 'COUNT', count: 0 });
    expect(attemptMistakeCount({ noMistakes: false, mistakes: [tajweed] })).toEqual({ kind: 'COUNT', count: 1 });
    const none = mistakeCounts([{ noMistakes: false, mistakes: [] }]);
    expect(none).toMatchObject({ total: 0, recordedAttempts: 0, notRecordedAttempts: 1 });
  });

  it('F07 unit: an imported MistakeCount stays uncategorized, apart from the category counts', () => {
    const counts = mistakeCounts([{ noMistakes: false, mistakes: [], uncategorizedCount: 3 }, { noMistakes: false, mistakes: [tajweed] }]);
    expect(counts.uncategorized).toBe(3);
    expect(counts.byCategory.TAJWEED).toBe(1);
    expect(counts.total).toBe(4);
    expect(attemptMistakeCount({ noMistakes: false, mistakes: [], uncategorizedCount: 3 })).toEqual({ kind: 'COUNT', count: 3 });
  });
});
