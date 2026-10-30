# SPEC-US-061 · Export authorized data

| | |
|---|---|
| **Spec ID** | SPEC-US-061 |
| **User story** | US-061 |
| **Feature** | [F14 · Excel import and export](README.md) |
| **Epic** | EPIC 14 — Excel Import and Export ([user-stories.md](../../user-stories.md)) |
| **Status** | draft |
| **Priority** | Not specified in the source documents (SRS, user-stories.md, feature specs). None is assigned here. |
| **Split from** | `docs/specs/F14-excel-import-export.md` on 2026-10-30 |

## User story

**US-061 — Export authorized data**

As an authorized user, I want to export students, records, and reports to Excel.

Spec wording (from F14):

- **US-061:** As an authorized user, I want to export students, records, and reports to Excel, so that we keep our own copies.

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

- **Functional:** FR-XLS-006, FR-XLS-007, FR-XLS-009, FR-EXP-004
- **Non-functional:** NFR-XLS-004
- **SRS acceptance tests cited:** AC-XLS-05, AC-XLS-06

Feature requirement set (from F14; additions of 2026-10-30 at the end): FR-XLS-001…017, NFR-XLS-001…004, SRS §15.1–15.2, FR-XLS-018

## Acceptance criteria

### Story acceptance criteria

Verbatim from [user-stories.md](../../user-stories.md).

1. Exports apply the same organization, role, date-range, and note-visibility restrictions as the corresponding in-app view, with a maximum of 1,000 students/records per file.
2. Exported files keep identifiers, dates, quantity units, canonical status values, and Arabic text unchanged, and text cells are protected against spreadsheet formula injection.

### Detailed acceptance criteria

From the F14 feature spec. The original IDs are kept because tests cite them. Criteria marked *Revised* or *Added* come from the decision review of 2026-10-30 (SRS §17).

- **F14-AC16** — **(US-061) Given** a Teacher exporting records, **when** the file is generated, **then** it contains only their assigned students and the selected date range (AC-XLS-05).
- **F14-AC17** — **(US-061) Given** an export for a Student or Parent audience, **when** the file is generated, **then** no internal notes appear (AC-XLS-06).
- **F14-AC18** — **(US-061) Given** a student name that starts with `=`, `+`, `-`, or `@`, **when** it is exported, **then** the cell is escaped so the spreadsheet shows it as text and does not run it as a formula (AC-XLS-06).
- **F14-AC19** — **(US-061) Given** any export, **when** it is opened, **then** IDs, dates, units, canonical statuses, and Arabic text are unchanged. Report exports include the period, timezone, filters, generation time, and a pending-offline-changes flag.

## Business rules

From SRS §9 (verbatim):

- **BR-13:** Internal-only notes are excluded from unauthorized outputs.

## Validation rules

No validation rule beyond the criteria above.

## Edge cases and error handling

Rows from the F14 edge-case table that apply to this story (verbatim):

| Situation | What should happen |
|---|---|
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
- **Other stories in F14:** [US-058](us-058-import-student-workbook.md), [US-059](us-059-import-daily-records.md), [US-060](us-060-preview-import-changes.md)

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

Stated in these criteria: F14-AC19.

## Related E2E test scenarios

**Completion gate:** this spec is complete only when `npm run e2e:gate -- US-061` passes. That means every criterion has an E2E test, none is pending, and all of them pass ([e2e/README.md](../../../e2e/README.md)).

**API (Playwright):**

- [e2e/api/f14-excel.spec.ts](../../../e2e/api/f14-excel.spec.ts) — F14-AC16 (US-061) a Teacher export contains only assigned students and the date range (AC-XLS-05)
- [e2e/api/f14-excel.spec.ts](../../../e2e/api/f14-excel.spec.ts) — F14-AC17 (US-061) Student and Parent exports contain no internal notes (AC-XLS-06)
- [e2e/api/f14-excel.spec.ts](../../../e2e/api/f14-excel.spec.ts) — F14-AC18 (US-061) formula-like text is escaped (AC-XLS-06)
- [e2e/api/f14-excel.spec.ts](../../../e2e/api/f14-excel.spec.ts) — F14-AC19 (US-061) exports keep IDs, dates, units, statuses, Arabic, and report metadata

**Mobile (Maestro):**

- [e2e/mobile/f14-excel/records-import-and-export.yaml](../../../e2e/mobile/f14-excel/records-import-and-export.yaml) — F14 records import, update mode, and export

**Unit (Vitest):**

- [apps/api/src/modules/import-export/rows.test.ts](../../../apps/api/src/modules/import-export/rows.test.ts) — F14-AC18 (US-061) cells starting with = + - @ tab or CR are escaped as text (AC-XLS-06)
- [apps/api/src/modules/import-export/rows.test.ts](../../../apps/api/src/modules/import-export/rows.test.ts) — F14-AC19 (US-061) IDs, dates, units, canonical statuses, and Arabic text are exported unchanged

## Open decisions and blockers

None specific to this story. See the [feature open questions](README.md#open-questions).

## Traceability

- **Story:** US-061 → SPEC-US-061 (this file)
- **Detailed criteria:** F14-AC16, F14-AC17, F14-AC18, F14-AC19
- **Requirements:** FR-XLS-006, FR-XLS-007, FR-XLS-009, FR-EXP-004, NFR-XLS-004
- **SRS acceptance tests:** AC-XLS-05, AC-XLS-06
- **Business rules:** SRS §9 #13
- **Design:** design.md §13; **Architecture:** ARCHITECTURE.md §18 epic 14
- **Previous location:** `docs/specs/F14-excel-import-export.md`
