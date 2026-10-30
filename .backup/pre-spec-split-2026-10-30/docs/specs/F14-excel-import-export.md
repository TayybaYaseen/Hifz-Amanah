# F14 · Excel import and export

**Status:** draft
**Brief:** [00-product-brief.md](../00-product-brief.md) · **Flow:** Excel import/export ([design.md §4.15](../../design.md))
**Stories:** US-058 – US-061 · **Requirements:** FR-XLS-001…017, NFR-XLS-001…004, SRS §15.1–15.2

## Context

Madaris already keep student lists and records in spreadsheets. Import lets them start without retyping, and export lets them keep their own copies. Import must be safe:
- it is previewed before anything is written
- it only adds new data by default
- replaying the same file creates no duplicates
- it never overwrites anything silently

Exports follow the same permissions as the app.

There is no code yet. This feature builds the `import-export` module:
- the `import_jobs` and `import_rows` tables
- worker jobs that use `exceljs`
- the `Students` and `DailyRecords` templates defined in SRS §15.1 ([ARCHITECTURE.md §11](../../ARCHITECTURE.md))

## User story

- **US-058:** As an Admin, I want to import students from a validated Excel template, so that I can set up the madrasa quickly.
- **US-059:** As an authorized user, I want to import daily Hifz portions from Excel, so that past records come into the app.
- **US-060:** As an Admin, I want to review duplicates, invalid rows, and proposed updates before anything is written, so that bad data never gets in.
- **US-061:** As an authorized user, I want to export students, records, and reports to Excel, so that we keep our own copies.

## Acceptance criteria

1. **(US-058) Given** a valid `Students` workbook of 50 rows, **when** the Admin uploads it, previews it, and confirms, **then** 50 students are created in the active madrasa (AC-XLS-01).
2. **(US-058) Given** a workbook with more than 1,000 rows, **when** it is uploaded, **then** it is rejected before any processing, with the message "Maximum 1,000 rows per file — split into several files".
3. **(US-058) Given** a workbook with the wrong template version or a missing required column, **when** it is uploaded, **then** it is rejected with the expected version and the missing column named.
4. **(US-058) Given** a workbook already imported with stable `ExternalStudentID`s, **when** it is imported again, **then** every row is an exact match, and no new student is created (AC-XLS-03).
5. **(US-058) Given** a row whose name matches an existing student but has no `ExternalStudentID`, **when** it is previewed, **then** it is flagged as a suspected duplicate for review. It is never treated as the same student automatically.
6. **(US-059) Given** a valid `DailyRecords` workbook, **when** it is imported, **then** each row becomes one portion, rows with the same student, date, and session form one daily record, and reports recalculate.
7. **(US-059) Given** a row with `ExternalStudentID` not found in the active madrasa, **when** it is previewed, **then** it is invalid with the message "Student not found in this madrasa".
8. **(US-059) Given** an `organization_id` or a different madrasa named in the workbook, **when** it is imported, **then** it is ignored, and every row goes into the signed-in user's madrasa only.
9. **(US-059) Given** a row with `MistakeCount = 3`, **when** it is imported, **then** the attempt stores 3 uncategorized mistakes, and no mistake categories are created.
10. **(US-059) Given** a row with an empty `QualityRating`, **when** it is imported, **then** the quality is stored as NULL, not 0.
11. **(US-060) Given** an uploaded workbook, **when** the preview opens, **then** it shows counts of new, exact-match, suspected-duplicate, invalid, and proposed-update rows, with row- and field-level errors in the user's language.
12. **(US-060) Given** invalid columns, malformed dates, invalid statuses, or duplicate keys, **when** the preview opens, **then** each problem appears as a message on its row and field (AC-XLS-02).
13. **(US-060) Given** existing records that the workbook would change, **when** the import runs in the default add-new-only mode, **then** those records are not changed (AC-XLS-04).
14. **(US-060) Given** the user selects update mode, **when** the preview opens, **then** each proposed update shows field-level before and after values, and nothing is written until the user confirms.
15. **(US-060) Given** an import whose second batch fails, **when** it is retried, **then** the rows already committed are not duplicated, and the result lists exactly which rows succeeded and which failed.
16. **(US-061) Given** a Teacher exporting records, **when** the file is generated, **then** it contains only their assigned students and the selected date range (AC-XLS-05).
17. **(US-061) Given** an export for a Student or Parent audience, **when** the file is generated, **then** no internal notes appear (AC-XLS-06).
18. **(US-061) Given** a student name that starts with `=`, `+`, `-`, or `@`, **when** it is exported, **then** the cell is escaped so the spreadsheet shows it as text and does not run it as a formula (AC-XLS-06).
19. **(US-061) Given** any export, **when** it is opened, **then** IDs, dates, units, canonical statuses, and Arabic text are unchanged. Report exports include the period, timezone, filters, generation time, and a pending-offline-changes flag.
20. **(US-058) Given** any import or export, **when** it finishes, **then** an audit event records the actor, madrasa, time, operation, and outcome counts, with no student details.

## Out of scope

- Importing weekly or monthly report sheets as source data.
- `.xls`, `.csv`, or Google Sheets.
- Running macros or evaluating formulas in uploaded files.
- Importing or exporting while offline.
- Matching students by name alone.

## Edge cases

| Situation | What should happen |
|---|---|
| A cell contains a formula | Its cached value is read as data; the formula is never evaluated. If there is no cached value, the cell is invalid |
| A date written as 30/10/2026 instead of YYYY-MM-DD | The row is invalid, with the expected format shown |
| `SessionLabel` is missing while the madrasa is in multi-session mode | The row is invalid ("Session label required") |
| A file with 0 data rows | "No rows found in the Students sheet" |
| Arabic text with diacritics in a remark | Imported and exported byte-for-byte |

## Open questions

- [ ] May Teachers import student lists (SRS §13 #13)?
- [ ] D7: the template version marker format and the commit batch size.
- [ ] How long are uploaded files kept on the server after an import?

## Done means

- [ ] Every acceptance criterion has a passing test.
- [ ] `npm run e2e:gate -- F14` passes: every criterion has an E2E test, none is pending, and all pass (e2e/README.md).
- [ ] Nothing from "Out of scope" was built.
- [ ] `npm test` and `npm run lint` pass.
- [ ] SRS acceptance tests AC-XLS-01…06 pass using fixture workbooks committed to the repo (synthetic data only).

## Test plan

| Level | What it covers | Where |
|---|---|---|
| **Unit** | Row validators (types, enums, dates, quantity/status rules), row classification, formula-injection escaping, template-version parsing | `apps/api/src/modules/import-export/**/*.test.ts` |
| **Integration** | Upload → preview → confirm with real Postgres; 1,000-row limit; replay; batch failure and retry; tenant override ignored; export scope and note exclusion; audit | `apps/api/test/import-export/*.test.ts` with fixture workbooks in `apps/api/test/fixtures/xlsx/` |
| **Component** | Import wizard steps, localized preview counts and row errors, update-mode before/after view, export options | `apps/mobile/src/features/import-export/__tests__/*.test.tsx` |
| **E2E** | Every acceptance criterion: server-side checks (API) and device journeys (Maestro), including: Admin imports a students file → previews → confirms → re-imports the same file and sees all exact matches | `e2e/api/f14-excel.spec.ts`, `e2e/mobile/f14-excel/` |

**Traceability:** Each test name starts with its criterion, e.g. `F14-AC18 (US-061) …`. Every AC 1–20 has at least one test.

**Coverage:** ≥80% on new code.
