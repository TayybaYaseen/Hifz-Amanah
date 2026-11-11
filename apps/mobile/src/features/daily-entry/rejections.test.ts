// F05 · Server rejections mapped back to the right portion (F05-AC3, AC6; UI spec §3.7) and the MODE_CONFLICTS
// answer of the report-mode switch (F05-AC8). SYNTHETIC DATA ONLY.
import { describe, expect, it } from 'vitest';
import { ApiFailure } from '../../api/client.ts';
import type { OutboxItem } from '../../sync/outbox.ts';
import { conflictsOf } from '../settings/reportMode.ts';
import type { LocalRecord } from './local.ts';
import { recordRejections } from './rejections.ts';

const id = (n: number) => `0190f5c0-0000-7000-8000-${String(n).padStart(12, '0')}`;

const record: LocalRecord = {
  id: id(1),
  rowVersion: null,
  studentId: id(2),
  classId: id(3),
  reportDate: '2026-11-09',
  sessionLabel: null,
  recordedBy: null,
  recordedByName: null,
  clientSavedAt: null,
  studentName: 'Test Student One',
  className: 'Hifz A1',
  portions: [
    { id: id(10), rowVersion: null, dailyRecordId: id(1), section: 'SABAQ', position: 1, isExtra: false, paraNumber: 1, range: { surahStart: 1, ayahStart: 1, surahEnd: 1, ayahEnd: 4 }, assigned: { unit: 'LINES', numerator: 6, denominator: 1 }, totalLines: 6, totalLinesSource: 'LAYOUT', lineCountEdition: null, removed: false, attempts: [] },
    { id: id(11), rowVersion: null, dailyRecordId: id(1), section: 'SABQI', position: 1, isExtra: false, paraNumber: 3, range: null, assigned: { unit: 'PARA', numerator: 1, denominator: 2 }, totalLines: null, totalLinesSource: null, lineCountEdition: null, removed: false, attempts: [] },
    {
      id: id(12),
      rowVersion: null,
      dailyRecordId: id(1),
      section: 'SABQI',
      position: 2,
      isExtra: false,
      paraNumber: 4,
      range: null,
      assigned: { unit: 'PAGES', numerator: 3, denominator: 1 },
      totalLines: null,
      totalLinesSource: null,
      lineCountEdition: null,
      removed: false,
      attempts: [{ id: id(20), rowVersion: null, lessonPortionId: id(12), attemptNo: 1, attemptedAt: '2026-11-09T05:00:00.000Z', recordedBy: null, recordedByName: null, status: 'PARTIAL', completed: null, quality: null, noMistakes: false, mistakes: [], remarks: null }],
    },
  ],
};

const rejected = (entity: OutboxItem['entity'], entityId: string, code: string, fields?: Record<string, string>): OutboxItem => ({
  opId: id(900 + Math.floor(Math.random() * 99)),
  seq: 1,
  entity,
  entityId,
  opType: 'CREATE',
  command: null,
  fields: {},
  baseVersion: null,
  dependsOn: [],
  label: null,
  createdAt: '2026-11-09T05:00:00.000Z',
  syncedAt: null,
  lastError: null,
  sentCount: 1,
  status: { state: 'FAILED', attempts: 1, nextAttemptAt: null, failure: fields ? { code, fields } : { code }, rowVersion: null, conflictId: null },
});

describe('F05 · server rejections on the right portion', () => {
  it('F05-AC3 (US-018) a portion field issue lands on that portion with its section and number', () => {
    const r = recordRejections([rejected('lesson_portion', id(12), 'VALIDATION', { assigned: 'NOT_POSITIVE' }), rejected('lesson_portion', id(10), 'VALIDATION', { range: 'CROSSES_SURAH' })], record);
    expect(r.portions).toEqual(
      expect.arrayContaining([
        { portionId: id(12), section: 'SABQI', portionNumber: 2, field: 'assignedAmount', messageKey: 'amount.NOT_POSITIVE' },
        { portionId: id(10), section: 'SABAQ', portionNumber: 1, field: 'surahEnd', messageKey: 'range.CROSSES_SURAH' },
      ]),
    );
    expect(r.record).toEqual([]);
  });

  it('F05-AC21 (US-021) an Ayat limit from the server keeps its maximum', () => {
    const r = recordRejections([rejected('lesson_portion', id(10), 'VALIDATION', { ayahEnd: 'OUT_OF_RANGE', 'ayahEnd.max': '20' })], record);
    expect(r.portions[0]).toMatchObject({ field: 'ayahEnd', messageKey: 'ayah.OUT_OF_RANGE', params: { max: 20 } });
  });

  it('F05-AC5 (US-022) an attempt issue lands on the attempt’s portion', () => {
    const r = recordRejections([rejected('portion_attempt', id(20), 'VALIDATION', { quality: 'QUALITY_NOT_ALLOWED' })], record);
    expect(r.portions[0]).toMatchObject({ portionId: id(12), portionNumber: 2, field: 'quality', messageKey: 'quality.QUALITY_NOT_ALLOWED' });
  });

  it('F05-AC6, AC18 (US-019) record-level codes are shown once for the record; the existing record is named', () => {
    const r = recordRejections(
      [
        rejected('daily_record', id(1), 'VALIDATION', { reportDate: 'DUPLICATE_RECORD', existingId: id(77) }),
        rejected('lesson_portion', id(11), 'VALIDATION', { dailyRecordId: 'ATTENDANCE_CHANGE_TO_LATE' }),
        rejected('lesson_portion', id(12), 'VALIDATION', { dailyRecordId: 'ATTENDANCE_CHANGE_TO_LATE' }),
        rejected('daily_record', id(1), 'FORBIDDEN'),
      ],
      record,
    );
    expect(r.existingRecordId).toBe(id(77));
    expect(r.record).toEqual(['errors.DUPLICATE_RECORD', 'errors.ATTENDANCE_CHANGE_TO_LATE', 'errors.FORBIDDEN']);
    expect(r.portions).toEqual([]);
  });

  it('F12 unit: operations of other records and synced operations are ignored', () => {
    const other = rejected('lesson_portion', id(55), 'VALIDATION', { assigned: 'REQUIRED' });
    const done = { ...rejected('lesson_portion', id(12), 'VALIDATION', { assigned: 'REQUIRED' }), status: { state: 'SYNCED' as const, attempts: 1, nextAttemptAt: null, failure: null, rowVersion: 1, conflictId: null } };
    expect(recordRejections([other, done], record)).toEqual({ portions: [], record: [], existingRecordId: null });
  });
});

describe('F05 · report-mode conflicts (US-019)', () => {
  it('F05-AC8 (US-019) a 409 MODE_CONFLICTS answer gives the student/date list; other errors give null', () => {
    const conflicts = [{ studentId: id(2), studentName: 'Test Student One', reportDate: '2026-11-09', sessionLabels: ['Fajr', 'Asr'] }];
    expect(conflictsOf(new ApiFailure('MODE_CONFLICTS', 409, {}, { code: 'MODE_CONFLICTS', message: 'x', conflicts }))).toEqual(conflicts);
    expect(conflictsOf(new ApiFailure('FORBIDDEN', 403))).toBeNull();
    expect(conflictsOf(new ApiFailure('NETWORK', 0))).toBeNull();
  });
});
