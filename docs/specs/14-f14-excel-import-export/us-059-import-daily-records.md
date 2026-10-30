# SPEC-US-059 · Import daily records

| | |
|---|---|
| **Spec ID** | SPEC-US-059 |
| **User story** | US-059 |
| **Feature** | [F14 · Excel import and export](README.md) |
| **Epic** | EPIC 14 — Excel Import and Export ([user-stories.md](../../user-stories.md)) |
| **Status** | draft |
| **Priority** | Not specified in the source documents (SRS, user-stories.md, feature specs). None is assigned here. |
| **Split from** | `docs/specs/F14-excel-import-export.md` on 2026-10-30 |

## User story

**US-059 — Import daily records**

As an authorized user, I want to import daily Hifz portions from Excel.

Spec wording (from F14):

- **US-059:** As an authorized user, I want to import daily Hifz portions from Excel, so that past records come into the app.

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

- **Functional:** FR-XLS-002, FR-XLS-004, FR-XLS-015
- **Non-functional:** NFR-XLS-002
- **SRS acceptance tests cited:** None

Feature requirement set (from F14; additions of 2026-10-30 at the end): FR-XLS-001…017, NFR-XLS-001…004, SRS §15.1–15.2, FR-XLS-018

## Acceptance criteria

### Story acceptance criteria

Verbatim from [user-stories.md](../../user-stories.md).

1. The workbook is validated for template/version, required columns, field types, tenant mapping, and the 1,000-row/student-record limit.
2. Preview identifies new, duplicate, invalid, and proposed-update rows; default behavior is append-only and never silently overwrites.

### Detailed acceptance criteria

From the F14 feature spec. The original IDs are kept because tests cite them. Criteria marked *Revised* or *Added* come from the decision review of 2026-10-30 (SRS §17).

- **F14-AC6** — **(US-059) Given** a valid `DailyRecords` workbook, **when** it is imported, **then** each row becomes one portion, rows with the same student, date, and session form one daily record, and reports recalculate.
- **F14-AC7** — **(US-059) Given** a row with `ExternalStudentID` not found in the active madrasa, **when** it is previewed, **then** it is invalid with the message "Student not found in this madrasa".
- **F14-AC8** — **(US-059) Given** an `organization_id` or a different madrasa named in the workbook, **when** it is imported, **then** it is ignored, and every row goes into the signed-in user's madrasa only.
- **F14-AC9** — **(US-059) Given** a row with `MistakeCount = 3`, **when** it is imported, **then** the attempt stores 3 uncategorized mistakes, and no mistake categories are created.
- **F14-AC10** — **(US-059) Given** a row with an empty `QualityRating`, **when** it is imported, **then** the quality is stored as NULL, not 0.

## Business rules

No SRS §9 business rule is specific to this story. The rules it follows are stated in the criteria above.

## Validation rules

Stated in these criteria: F14-AC7.

## Edge cases and error handling

Rows from the F14 edge-case table that apply to this story (verbatim):

| Situation | What should happen |
|---|---|
| A cell contains a formula | Its cached value is read as data; the formula is never evaluated. If there is no cached value, the cell is invalid |
| A date written as 30/10/2026 instead of YYYY-MM-DD | The row is invalid, with the expected format shown |
| `SessionLabel` is missing while the madrasa is in multi-session mode | The row is invalid ("Session label required") |
| Arabic text with diacritics in a remark | Imported and exported byte-for-byte |

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
- **Other stories in F14:** [US-058](us-058-import-student-workbook.md), [US-060](us-060-preview-import-changes.md), [US-061](us-061-export-authorized-data.md)

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

**Completion gate:** this spec is complete only when `npm run e2e:gate -- US-059` passes. That means every criterion has an E2E test, none is pending, and all of them pass ([e2e/README.md](../../../e2e/README.md)).

**API (Playwright):**

- [e2e/api/f14-excel.spec.ts](../../../e2e/api/f14-excel.spec.ts) — F14-AC6 (US-059) DailyRecords rows group into daily records and reports recalculate
- [e2e/api/f14-excel.spec.ts](../../../e2e/api/f14-excel.spec.ts) — F14-AC7 (US-059) an unknown ExternalStudentID is invalid
- [e2e/api/f14-excel.spec.ts](../../../e2e/api/f14-excel.spec.ts) — F14-AC8 (US-059) an organization named in the workbook is ignored
- [e2e/api/f14-excel.spec.ts](../../../e2e/api/f14-excel.spec.ts) — F14-AC9 (US-059) MistakeCount becomes uncategorized mistakes
- [e2e/api/f14-excel.spec.ts](../../../e2e/api/f14-excel.spec.ts) — F14-AC10 (US-059) an empty QualityRating is NULL

**Mobile (Maestro):**

- [e2e/mobile/f14-excel/records-import-and-export.yaml](../../../e2e/mobile/f14-excel/records-import-and-export.yaml) — F14 records import, update mode, and export

**Unit (Vitest):**

- [apps/api/src/modules/import-export/rows.test.ts](../../../apps/api/src/modules/import-export/rows.test.ts) — F14-AC7 (US-059) an unknown ExternalStudentID is invalid: "Student not found in this madrasa"
- [apps/api/src/modules/import-export/rows.test.ts](../../../apps/api/src/modules/import-export/rows.test.ts) — F14-AC8 (US-059) an organization_id or madrasa named in the workbook is ignored
- [apps/api/src/modules/import-export/rows.test.ts](../../../apps/api/src/modules/import-export/rows.test.ts) — F14-AC9 (US-059) MistakeCount = 3 yields 3 uncategorized mistakes and no categories
- [apps/api/src/modules/import-export/rows.test.ts](../../../apps/api/src/modules/import-export/rows.test.ts) — F14-AC10 (US-059) an empty QualityRating is NULL, not 0
- [apps/api/src/modules/import-export/rows.test.ts](../../../apps/api/src/modules/import-export/rows.test.ts) — F14-AC6 (US-059) DailyRecords rows with the same student, date, and session form one daily record

## Open decisions and blockers

None specific to this story. See the [feature open questions](README.md#open-questions).

## Traceability

- **Story:** US-059 → SPEC-US-059 (this file)
- **Detailed criteria:** F14-AC6, F14-AC7, F14-AC8, F14-AC9, F14-AC10
- **Requirements:** FR-XLS-002, FR-XLS-004, FR-XLS-015, NFR-XLS-002
- **SRS acceptance tests:** None
- **Business rules:** None
- **Design:** design.md §13; **Architecture:** ARCHITECTURE.md §18 epic 14
- **Previous location:** `docs/specs/F14-excel-import-export.md`
