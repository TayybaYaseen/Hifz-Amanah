# SPEC-US-058 · Import student workbook

| | |
|---|---|
| **Spec ID** | SPEC-US-058 |
| **User story** | US-058 |
| **Feature** | [F14 · Excel import and export](README.md) |
| **Epic** | EPIC 14 — Excel Import and Export ([user-stories.md](../../user-stories.md)) |
| **Status** | draft |
| **Priority** | Not specified in the source documents (SRS, user-stories.md, feature specs). None is assigned here. |
| **Split from** | `docs/specs/F14-excel-import-export.md` on 2026-10-30 |

## User story

**US-058 — Import student workbook**

As an Admin, or a Teacher for my assigned classes, I want to import students from a validated Excel template.

Spec wording (from F14):

- **US-058:** As an Admin, I want to import students from a validated Excel template, so that I can set up the madrasa quickly.

**Feature context** (shared by every story in F14, copied from the feature spec):

> Madaris already keep student lists and records in spreadsheets. Import lets them start without retyping, and export lets them keep their own copies. Import must be safe:
> - it is previewed before anything is written
> - it only adds new data by default
> - replaying the same file creates no duplicates
> - it never overwrites anything silently
>
> Exports follow the same permissions as the app.
>
> There is no code yet. This feature builds the `import-export` module:
> - the `import_jobs` and `import_rows` tables
> - worker jobs that use `exceljs`
> - the `Students` and `DailyRecords` templates defined in SRS §15.1 ([ARCHITECTURE.md §11](../../ARCHITECTURE.md))

## Related functional requirements

Requirements this story covers. SRS.md has no story-to-requirement table, so this list is derived from the requirement text and the criteria below.

- **Functional:** FR-XLS-001, FR-XLS-003, FR-XLS-008, FR-XLS-009, FR-XLS-010, FR-XLS-013, FR-XLS-015, FR-XLS-016, FR-XLS-017
- **Non-functional:** NFR-XLS-001
- **SRS acceptance tests cited:** AC-XLS-01, AC-XLS-03

Feature requirement set (from F14; additions of 2026-10-30 at the end): FR-XLS-001…017, NFR-XLS-001…004, SRS §15.1–15.2, FR-XLS-018

## Acceptance criteria

### Story acceptance criteria

Verbatim from [user-stories.md](../../user-stories.md).

1. The workbook is validated for template/version, required columns, field types, tenant mapping, the importer's class scope, and the 1,000-row/student-record limit before any data is written.
2. Preview identifies new, duplicate, invalid, and proposed-update rows; default behavior is append-only, never silently overwrites, and never matches students by name alone.
3. Re-importing the same workbook with stable `ExternalStudentID` values does not create duplicate students.

### Detailed acceptance criteria

From the F14 feature spec. The original IDs are kept because tests cite them. Criteria marked *Revised* or *Added* come from the decision review of 2026-10-30 (SRS §17).

- **F14-AC1** — **(US-058) Given** a valid `Students` workbook of 50 rows, **when** the Admin uploads it, previews it, and confirms, **then** 50 students are created in the active madrasa (AC-XLS-01).
- **F14-AC2** — **(US-058) Given** a workbook with more than 1,000 rows, **when** it is uploaded, **then** it is rejected before any processing, with the message "Maximum 1,000 rows per file — split into several files".
- **F14-AC3** — **(US-058) Given** a workbook with the wrong template version or a missing required column, **when** it is uploaded, **then** it is rejected with the expected version and the missing column named.
- **F14-AC4** — **(US-058) Given** a workbook already imported with stable `ExternalStudentID`s, **when** it is imported again, **then** every row is an exact match, and no new student is created (AC-XLS-03).
- **F14-AC5** — **(US-058) Given** a row whose name matches an existing student but has no `ExternalStudentID`, **when** it is previewed, **then** it is flagged as a suspected duplicate for review. It is never treated as the same student automatically.
- **F14-AC20** — **(US-058) Given** any import or export, **when** it finishes, **then** an audit event records the actor, madrasa, time, operation, and outcome counts, with no student details.
- **F14-AC21** — **(US-058) Given** a Teacher assigned to Class A, **when** they import a `Students` workbook with rows for Class A and Class B, **then** the preview marks the Class B rows invalid ("Not your class"), and confirming creates only the Class A students, with no login accounts. *(Added 2026-10-30, DEC-B15.)*

## Business rules

No SRS §9 business rule is specific to this story. The rules it follows are stated in the criteria above.

## Validation rules

Stated in these criteria: F14-AC2, F14-AC3, F14-AC21.

## Edge cases and error handling

Rows from the F14 edge-case table that apply to this story (verbatim):

| Situation | What should happen |
|---|---|
| A cell contains a formula | Its cached value is read as data; the formula is never evaluated. If there is no cached value, the cell is invalid |
| A date written as 30/10/2026 instead of YYYY-MM-DD | The row is invalid, with the expected format shown |
| A file with 0 data rows | "No rows found in the Students sheet" |

**Out of scope for the whole feature** (verbatim from F14):

- Importing weekly or monthly report sheets as source data.
- `.xls`, `.csv`, or Google Sheets.
- Running macros or evaluating formulas in uploaded files.
- Importing or exporting while offline.
- Matching students by name alone.

## Dependencies

- **Feature F14 depends on:** F03, F05, F09 (from the spec index)
- **Features referenced by this story's criteria and edge cases:** None
- **Other stories referenced:** None
- **Other stories in F14:** [US-059](us-059-import-daily-records.md), [US-060](us-060-preview-import-changes.md), [US-061](us-061-export-authorized-data.md)

## Related screens and UI

- **Feature flow** (from F14): Excel import/export ([design.md §4.15](../../design.md))

[design.md §13](../../design.md) story-to-screen map (verbatim):

| Story | Screen (this document) | Key interaction | Required states beyond standard | Validation shown | Accessibility / localization specifics |
|---|---|---|---|---|---|
| US-058 to US-061 | §4.15 Excel import/export | Choose type → template version → file → preview → mode → confirm → results | Invalid import (row-level list); Offline (server processing needed) | Row and field errors; add-only by default; 1,000-row limit | Preview messages localized (NFR-XLS-003) |

## Related API and data model

- **Modules** ([ARCHITECTURE.md §18](../../ARCHITECTURE.md)): `import-export`
- Tables and services are described in the feature context above and in [ARCHITECTURE.md](../../ARCHITECTURE.md). Concrete API routes are defined at scaffolding (SRS §17 DEC-B54).

## Offline and sync behavior

Nothing specific to this story in the source documents.

## Related E2E test scenarios

**Completion gate:** this spec is complete only when `npm run e2e:gate -- US-058` passes. That means every criterion has an E2E test, none is pending, and all of them pass ([e2e/README.md](../../../e2e/README.md)).

**API (Playwright):**

- [e2e/api/f14-excel.spec.ts](../../../e2e/api/f14-excel.spec.ts) — F14-AC1 (US-058) a valid 50-row Students workbook imports after preview and confirm (AC-XLS-01)
- [e2e/api/f14-excel.spec.ts](../../../e2e/api/f14-excel.spec.ts) — F14-AC2 (US-058) more than 1,000 rows is rejected before processing
- [e2e/api/f14-excel.spec.ts](../../../e2e/api/f14-excel.spec.ts) — F14-AC3 (US-058) a wrong version or missing column is rejected with details
- [e2e/api/f14-excel.spec.ts](../../../e2e/api/f14-excel.spec.ts) — F14-AC4 (US-058) re-importing with stable ExternalStudentIDs creates nothing (AC-XLS-03)
- [e2e/api/f14-excel.spec.ts](../../../e2e/api/f14-excel.spec.ts) — F14-AC5 (US-058) a name match without an external ID is a suspected duplicate
- [e2e/api/f14-excel.spec.ts](../../../e2e/api/f14-excel.spec.ts) — F14-AC20 (US-058) every import and export is audited without student details
- [e2e/api/f14-excel.spec.ts](../../../e2e/api/f14-excel.spec.ts) — F14-AC21 (US-058) a Teacher imports students into assigned classes only

**Mobile (Maestro):**

- [e2e/mobile/f14-excel/student-import.yaml](../../../e2e/mobile/f14-excel/student-import.yaml) — F14 student import — preview, confirm, re-import, rejections
- [e2e/mobile/f14-excel/teacher-student-import.yaml](../../../e2e/mobile/f14-excel/teacher-student-import.yaml) — F14 Teacher imports students into assigned classes

**Unit (Vitest):**

- [apps/api/src/modules/import-export/rows.test.ts](../../../apps/api/src/modules/import-export/rows.test.ts) — F14-AC2 (US-058) more than 1,000 rows is rejected before processing
- [apps/api/src/modules/import-export/rows.test.ts](../../../apps/api/src/modules/import-export/rows.test.ts) — F14-AC3 (US-058) a wrong template version or missing column is rejected, naming the expected version and column
- [apps/api/src/modules/import-export/rows.test.ts](../../../apps/api/src/modules/import-export/rows.test.ts) — F14-AC4 (US-058) a re-imported row with a stable ExternalStudentID is an exact match (AC-XLS-03)
- [apps/api/src/modules/import-export/rows.test.ts](../../../apps/api/src/modules/import-export/rows.test.ts) — F14-AC5 (US-058) a name match without ExternalStudentID is a suspected duplicate, never the same student

## Open decisions and blockers

Open questions from F14 that apply to this story, with their resolutions (decision review of 2026-10-30, SRS §17):

- [x] May Teachers import student lists (SRS §13 #13)? **Resolved:** Yes, into assigned classes only (DEC-B15, FR-XLS-001).
- [x] D7: the template version marker format and the commit batch size. **Resolved:** Hidden `_meta` sheet; 200-row batches (DEC-B43, FR-XLS-018).
- [x] How long are uploaded files kept on the server after an import? **Resolved:** 7 days (DEC-B44, NFR-PRV-005).

## Traceability

- **Story:** US-058 → SPEC-US-058 (this file)
- **Detailed criteria:** F14-AC1, F14-AC2, F14-AC3, F14-AC4, F14-AC5, F14-AC20, F14-AC21
- **Requirements:** FR-XLS-001, FR-XLS-003, FR-XLS-008, FR-XLS-009, FR-XLS-010, FR-XLS-013, FR-XLS-015, FR-XLS-016, FR-XLS-017, NFR-XLS-001
- **SRS acceptance tests:** AC-XLS-01, AC-XLS-03
- **Business rules:** None
- **Design:** design.md §13; **Architecture:** ARCHITECTURE.md §18 epic 14
- **Previous location:** `docs/specs/F14-excel-import-export.md`
