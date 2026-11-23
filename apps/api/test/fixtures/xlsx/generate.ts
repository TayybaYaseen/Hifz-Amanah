// Writes the committed F14 Students fixture workbooks (e2e/fixtures/workbooks.md) into this folder. Synthetic data only.
// DailyRecords workbooks depend on today's date (class days, no future dates), so tests build them at run time.
// Run: node apps/api/test/fixtures/xlsx/generate.ts
import { writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { studentsWorkbook, syntheticStudents, STUDENT_COLUMNS } from '../../../../../e2e/fixtures/workbooks.ts';

const dir = fileURLToPath(new URL('./', import.meta.url));

const FIXTURES: Record<string, () => Promise<Buffer>> = {
  'students-50.xlsx': () => studentsWorkbook(syntheticStudents(50)),
  'students-1000.xlsx': () => studentsWorkbook(syntheticStudents(1000, 'Hifz A1', 'EXT-K-')),
  'students-1001.xlsx': () => studentsWorkbook(syntheticStudents(1001, 'Hifz A1', 'EXT-L-')),
  'students-old-version.xlsx': () => studentsWorkbook(syntheticStudents(3), { version: '0' }),
  'students-missing-name.xlsx': () => studentsWorkbook(syntheticStudents(3), { columns: STUDENT_COLUMNS.filter((c) => c !== 'StudentName') }),
  'students-no-meta.xlsx': () => studentsWorkbook(syntheticStudents(3), { noMeta: true }),
  'students-mixed.xlsx': () =>
    studentsWorkbook([
      { ExternalStudentID: 'EXT-M-001', StudentName: 'Mixed New Student', ClassName: 'Hifz A1' },
      { ExternalStudentID: 'EXT-A-001', StudentName: 'Test Student One', ClassName: 'Hifz A1' },
      { ExternalStudentID: null, StudentName: 'Test Student One', ClassName: 'Hifz A1' },
      { ExternalStudentID: 'EXT-M-004', StudentName: 'Mixed Bad Date', ClassName: 'Hifz A1', AdmissionDate: '30/10/2026' },
      { ExternalStudentID: 'EXT-M-005', StudentName: 'Mixed Bad Status', ClassName: 'Hifz A1', Status: 'GRADUATED' },
      { ExternalStudentID: 'EXT-M-DUP', StudentName: 'Mixed Duplicate One', ClassName: 'Hifz A1' },
      { ExternalStudentID: 'EXT-M-DUP', StudentName: 'Mixed Duplicate Two', ClassName: 'Hifz A1' },
    ]),
  'students-renamed.xlsx': () => studentsWorkbook([{ ExternalStudentID: 'EXT-A-001', StudentName: 'Test Student One Renamed', ClassName: 'Hifz A1' }]),
  'students-formula.xlsx': () =>
    studentsWorkbook(['=1+1', '+cmd', '-2', '@SUM(A1)', '\tTab start', '\rCR start'].map((name, i) => ({ ExternalStudentID: `EXT-X-00${i + 1}`, StudentName: name, ClassName: 'Hifz A1' }))),
  'students-org-column.xlsx': () =>
    studentsWorkbook(
      [
        { ExternalStudentID: 'EXT-O-001', StudentName: 'Org Column One', ClassName: 'Hifz A1', organization_id: 'BAA', Madrasa: 'Madrasa Baa (test)' },
        { ExternalStudentID: 'EXT-O-002', StudentName: 'Org Column Two', ClassName: 'Hifz B1', organization_id: 'BAA', Madrasa: 'Madrasa Baa (test)' },
      ],
      { columns: [...STUDENT_COLUMNS, 'organization_id', 'Madrasa'] },
    ),
  'students-two-classes.xlsx': () =>
    studentsWorkbook([
      ...syntheticStudents(4, 'Hifz A1', 'EXT-TA-'),
      ...syntheticStudents(2, 'Hifz B1', 'EXT-TB-').map((r, i) => ({ ...r, StudentName: `Other Class Student ${i + 1}` })),
    ]),
};

for (const [name, make] of Object.entries(FIXTURES)) {
  await writeFile(`${dir}${name}`, await make());
  console.log(`wrote ${name}`);
}
