// F14 · Excel import and export — unit (docs/specs/14-f14-excel-import-export/)
import { describe, it } from 'vitest';

describe('F14 · workbook checks', () => {
  it.todo('F14-AC2 (US-058) more than 1,000 rows is rejected before processing');
  it.todo('F14-AC3 (US-058) a wrong template version or missing column is rejected, naming the expected version and column');
  it.todo('F14 unit: formulas and macros are read as data, never evaluated');
});

describe('F14 · row validation', () => {
  it.todo('F14-AC12 (US-060) invalid columns, malformed dates, invalid statuses, and duplicate keys report on their row and field (AC-XLS-02)');
  it.todo('F14-AC7 (US-059) an unknown ExternalStudentID is invalid: "Student not found in this madrasa"');
  it.todo('F14-AC8 (US-059) an organization_id or madrasa named in the workbook is ignored');
  it.todo('F14-AC9 (US-059) MistakeCount = 3 yields 3 uncategorized mistakes and no categories');
  it.todo('F14-AC10 (US-059) an empty QualityRating is NULL, not 0');
});

describe('F14 · row classification', () => {
  it.todo('F14-AC4 (US-058) a re-imported row with a stable ExternalStudentID is an exact match (AC-XLS-03)');
  it.todo('F14-AC5 (US-058) a name match without ExternalStudentID is a suspected duplicate, never the same student');
  it.todo('F14-AC13 (US-060) add-new-only mode never proposes changes to existing records (AC-XLS-04)');
  it.todo('F14-AC14 (US-060) update mode shows field-level before and after values');
  it.todo('F14-AC6 (US-059) DailyRecords rows with the same student, date, and session form one daily record');
});

describe('F14 · export escaping', () => {
  it.todo('F14-AC18 (US-061) cells starting with = + - @ tab or CR are escaped as text (AC-XLS-06)');
  it.todo('F14-AC19 (US-061) IDs, dates, units, canonical statuses, and Arabic text are exported unchanged');
});
