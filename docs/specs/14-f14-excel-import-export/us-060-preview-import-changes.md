# SPEC-US-060 · Preview import changes

| | |
|---|---|
| **Spec ID** | SPEC-US-060 |
| **User story** | US-060 |
| **Feature** | [F14 · Excel import and export](README.md) |
| **Epic** | EPIC 14 — Excel Import and Export ([user-stories.md](../../user-stories.md)) |
| **Status** | draft |
| **Priority** | Not specified in the source documents (SRS, user-stories.md, feature specs). None is assigned here. |
| **Split from** | `docs/specs/F14-excel-import-export.md` on 2026-10-30 |

## User story

**US-060 — Preview import changes**

As an Admin, I want to review duplicates, invalid rows, and proposed updates before writing.

Spec wording (from F14):

- **US-060:** As an Admin, I want to review duplicates, invalid rows, and proposed updates before anything is written, so that bad data never gets in.

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

- **Functional:** FR-XLS-003, FR-XLS-004, FR-XLS-005, FR-XLS-011, FR-XLS-012, FR-XLS-014, FR-XLS-018
- **Non-functional:** NFR-XLS-003
- **SRS acceptance tests cited:** AC-XLS-02, AC-XLS-04

Feature requirement set (from F14; additions of 2026-10-30 at the end): FR-XLS-001…017, NFR-XLS-001…004, SRS §15.1–15.2, FR-XLS-018

## Acceptance criteria

### Story acceptance criteria

Verbatim from [user-stories.md](../../user-stories.md).

1. The workbook is validated for template/version, required columns, field types, tenant mapping, and the 1,000-row/student-record limit.
2. Preview identifies new, duplicate, invalid, and proposed-update rows; default behavior is append-only and never silently overwrites.

### Detailed acceptance criteria

From the F14 feature spec. The original IDs are kept because tests cite them. Criteria marked *Revised* or *Added* come from the decision review of 2026-10-30 (SRS §17).

- **F14-AC11** — **(US-060) Given** an uploaded workbook, **when** the preview opens, **then** it shows counts of new, exact-match, suspected-duplicate, invalid, and proposed-update rows, with row- and field-level errors in the user's language.
- **F14-AC12** — **(US-060) Given** invalid columns, malformed dates, invalid statuses, or duplicate keys, **when** the preview opens, **then** each problem appears as a message on its row and field (AC-XLS-02).
- **F14-AC13** — **(US-060) Given** existing records that the workbook would change, **when** the import runs in the default add-new-only mode, **then** those records are not changed (AC-XLS-04).
- **F14-AC14** — **(US-060) Given** the user selects update mode, **when** the preview opens, **then** each proposed update shows field-level before and after values, and nothing is written until the user confirms.
- **F14-AC15** — **(US-060) Given** an import whose second batch fails, **when** it is retried, **then** the rows already committed are not duplicated, and the result lists exactly which rows succeeded and which failed.
- **F14-AC22** — **(US-060) Given** a workbook without the hidden `_meta` sheet or with an unknown `TemplateVersion`, **when** it is uploaded, **then** it is rejected with the expected template name and version. A valid 1,000-row import commits in 5 batches of 200 rows. *(Added 2026-10-30, DEC-B43.)*

## Business rules

No SRS §9 business rule is specific to this story. The rules it follows are stated in the criteria above.

## Validation rules

Stated in these criteria: F14-AC11, F14-AC12, F14-AC22.

## Edge cases and error handling

No F14 edge case is specific to this story. See the [feature edge cases](README.md#edge-cases).

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
- **Other stories in F14:** [US-058](us-058-import-student-workbook.md), [US-059](us-059-import-daily-records.md), [US-061](us-061-export-authorized-data.md)

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

**Completion gate:** this spec is complete only when `npm run e2e:gate -- US-060` passes. That means every criterion has an E2E test, none is pending, and all of them pass ([e2e/README.md](../../../e2e/README.md)).

**API (Playwright):**

- [e2e/api/f14-excel.spec.ts](../../../e2e/api/f14-excel.spec.ts) — F14-AC11 (US-060) the preview counts every row class with localized errors
- [e2e/api/f14-excel.spec.ts](../../../e2e/api/f14-excel.spec.ts) — F14-AC12 (US-060) each problem is reported on its row and field (AC-XLS-02)
- [e2e/api/f14-excel.spec.ts](../../../e2e/api/f14-excel.spec.ts) — F14-AC13 (US-060) add-new-only mode changes no existing record (AC-XLS-04)
- [e2e/api/f14-excel.spec.ts](../../../e2e/api/f14-excel.spec.ts) — F14-AC14 (US-060) update mode previews before and after and writes nothing until confirmed
- [e2e/api/f14-excel.spec.ts](../../../e2e/api/f14-excel.spec.ts) — F14-AC15 (US-060) a retried import after a failed batch does not duplicate committed rows
- [e2e/api/f14-excel.spec.ts](../../../e2e/api/f14-excel.spec.ts) — F14-AC22 (US-060) templates carry a _meta version and imports commit 200 rows per batch

**Mobile (Maestro):**

- [e2e/mobile/f14-excel/records-import-and-export.yaml](../../../e2e/mobile/f14-excel/records-import-and-export.yaml) — F14 records import, update mode, and export
- [e2e/mobile/f14-excel/student-import.yaml](../../../e2e/mobile/f14-excel/student-import.yaml) — F14 student import — preview, confirm, re-import, rejections

**Unit (Vitest):**

- [apps/api/src/modules/import-export/rows.test.ts](../../../apps/api/src/modules/import-export/rows.test.ts) — F14-AC12 (US-060) invalid columns, malformed dates, invalid statuses, and duplicate keys report on their row and field (AC-XLS-02)
- [apps/api/src/modules/import-export/rows.test.ts](../../../apps/api/src/modules/import-export/rows.test.ts) — F14-AC13 (US-060) add-new-only mode never proposes changes to existing records (AC-XLS-04)
- [apps/api/src/modules/import-export/rows.test.ts](../../../apps/api/src/modules/import-export/rows.test.ts) — F14-AC14 (US-060) update mode shows field-level before and after values

## Open decisions and blockers

Open questions from F14 that apply to this story, with their resolutions (decision review of 2026-10-30, SRS §17):

- [x] D7: the template version marker format and the commit batch size. **Resolved:** Hidden `_meta` sheet; 200-row batches (DEC-B43, FR-XLS-018).

## Traceability

- **Story:** US-060 → SPEC-US-060 (this file)
- **Detailed criteria:** F14-AC11, F14-AC12, F14-AC13, F14-AC14, F14-AC15, F14-AC22
- **Requirements:** FR-XLS-003, FR-XLS-004, FR-XLS-005, FR-XLS-011, FR-XLS-012, FR-XLS-014, NFR-XLS-003, FR-XLS-018
- **SRS acceptance tests:** AC-XLS-02, AC-XLS-04
- **Business rules:** None
- **Design:** design.md §13; **Architecture:** ARCHITECTURE.md §18 epic 14
- **Previous location:** `docs/specs/F14-excel-import-export.md`
