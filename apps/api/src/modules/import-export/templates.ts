// Blank import templates (SRS §15.1, FR-XLS-018; design.md §4.15 step 2 "Explain the expected template and version").
// The first sheet notes the template name and version, explains each column, and shows examples; the examples are
// on the About sheet only, so they are never imported. The data sheet has the header row; `_meta` is hidden.
// Example values are synthetic.
import { DAILY_RECORD_COLUMNS, REQUIRED_COLUMNS, STUDENT_COLUMNS, TEMPLATE_VERSIONS, type ImportTemplate, type Locale } from '@hifz/contracts';
import { writeWorkbook } from './workbook.ts';

const HELP: Record<ImportTemplate, Record<string, string>> = {
  Students: {
    ExternalStudentID: 'Your stable ID for the student (recommended). Re-importing with the same ID never creates a duplicate.',
    StudentName: 'Required.',
    ClassName: 'Required to add a new student: the class name exactly as in the app.',
    AdmissionDate: 'Optional, YYYY-MM-DD (for example 2026-10-30).',
    Status: 'Optional: ACTIVE or INACTIVE.',
    Notes: 'Optional. Private staff notes: never shown to students or parents.',
  },
  DailyRecords: {
    ExternalRecordID: 'Your stable ID for this portion (recommended). Needed to update it later.',
    ExternalStudentID: 'Required: the student\'s ExternalStudentID in this madrasa.',
    RecordDate: 'Required, YYYY-MM-DD. Attendance (Present, Late, or Half day) must already be marked for that date.',
    SessionLabel: 'Required only when the madrasa keeps several reports a day; otherwise leave empty.',
    SectionType: 'Required: SABAQ, SABQI, or MANZIL.',
    PortionNumber: 'Required: 1, 2, 3… within the section.',
    ParaNumber: 'Sabqi and Manzil: required (1–30). Sabaq: optional, it is derived from the range.',
    SurahStart: 'Sabaq: required.',
    AyahStart: 'Sabaq: required.',
    SurahEnd: 'Sabaq: empty or equal to SurahStart.',
    AyahEnd: 'Sabaq: required.',
    TotalLines: 'Sabaq: required. Sabqi and Manzil: leave empty.',
    AssignedQuantity: 'Required. Counted in QuantityUnit.',
    CompletedQuantity: 'Optional. Counted in QuantityUnit.',
    QuantityUnit: 'Required. Sabaq: LINES only. Sabqi/Manzil: RUBU, HALF, SALASAH, COMPLETE, LINES, AYAT, or PAGES.',
    MistakeCount: 'Optional whole number: stored as uncategorized mistakes. Empty means not recorded.',
    PerformanceStatus: 'Required: COMPLETED, PARTIAL, NOT_REMEMBERED, ABSENT, NOT_ASSIGNED, or PENDING.',
    QualityRating: 'Optional 1–5, lower is better (1 Excellent … 5 Weak). Empty means not recorded.',
    TeacherNotes: 'Optional. Private staff notes.',
  },
};

const EXAMPLES: Record<ImportTemplate, (string | number | null)[][]> = {
  Students: [['EXT-0001', 'Example Student', 'Hifz A1', '2026-09-01', 'ACTIVE', null]],
  DailyRecords: [
    ['R-0001', 'EXT-0001', '2026-10-30', null, 'SABAQ', 1, null, 2, 1, 2, 10, 10, 10, 10, 'LINES', 0, 'COMPLETED', 2, null],
    ['R-0002', 'EXT-0001', '2026-10-30', null, 'SABQI', 1, 1, null, null, null, null, null, 1, 1, 'HALF', null, 'PARTIAL', 3, null],
  ],
};

export async function blankTemplate(template: ImportTemplate, _locale: Locale): Promise<Buffer> {
  const columns = template === 'Students' ? STUDENT_COLUMNS : DAILY_RECORD_COLUMNS;
  const version = TEMPLATE_VERSIONS[template];
  const required = new Set(REQUIRED_COLUMNS[template]);
  const examples = EXAMPLES[template].map((r) => columns.map((c, i) => `${c}: ${r[i] ?? ''}`).join(' | '));
  return writeWorkbook({
    templateName: template,
    templateVersion: version,
    createdAt: new Date(0),
    about: [
      ['Template', template],
      ['TemplateVersion', version],
      ['Rows', 'At most 1,000 rows per file. Split larger lists into several files.'],
      ['Formulas', 'Cells are read as values only. Formulas and macros are never run.'],
      ...columns.map((c) => [`${c}${required.has(c) ? ' *' : ''}`, HELP[template][c] ?? ''] as const),
      ...examples.map((e, i) => [`Example ${i + 1}`, e] as const),
    ],
    sheets: [{ name: template, header: columns, rows: [] }],
  });
}
