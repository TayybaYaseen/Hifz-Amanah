# F14 · Excel import and export — implementation plan and decisions

**Feature:** [F14](../specs/14-f14-excel-import-export.md) · **Stories:** US-058 – US-061 · **Branch:** `feature/f14-excel-import-export`
**Requirements:** FR-XLS-001…018, NFR-XLS-001…004, FR-EXP-004, NFR-PRV-005, SRS §15.1–15.2 · **Decisions:** DEC-B15, DEC-B43, DEC-B44

## 1. What was built

| Area | Where |
|---|---|
| Migration `0017_import_export.sql` | `import_jobs`, `import_rows` (one row per job and row number), `import_record_keys` (DailyRecords `ExternalRecordID` → portion), `portion_attempts.mistake_count_summary`. RLS forced, no DELETE, least-privilege grants |
| Contracts | `packages/contracts/src/import-export.ts`: template columns and versions (`Students` 1, `DailyRecords` 2), row classes, issue codes, views, queries; error codes `WORKBOOK_REJECTED`, `EXPORT_TOO_LARGE`, `IMPORT_STATE` |
| Workbook I/O | `apps/api/src/modules/import-export/workbook.ts` (exceljs; data only; `_meta`; 1,000-row limit; `'` escaping) |
| Row rules (pure) | `rows.ts`: parsing, classification, the Para-preset mapping; DailyRecords reuse `@hifz/domain/hifz validatePortion` |
| Import service | `import-service.ts`: upload → preview → mode → confirm → 200-row batches → results; retry; purge |
| Export service | `export-service.ts`: Students, DailyRecords (staff / family audience), class report with period metadata |
| Writes through owners | Students: `roster/import-writes.ts`. Records: the F05 sync handlers via `sync/server-apply.ts` (validation, audit, `change_log`, F08 hooks). Uncategorized count: `hifz/import-support.ts` |
| Projection | `projectFor('PARENT', 'export_daily_record_row')` — new outbound channel for family files (no internal notes) |
| Mobile | `apps/mobile/src/features/import-export/` (screen, api, view helpers), More → "Import and export"; strings in en/ur/ur-Latn; new deps `expo-document-picker`, `expo-sharing` (needs a new dev build) |

## 2. Decisions made with the user (2026-11-22)

1. **Attendance on imported DailyRecords** (FR-DAY-011 vs. the template, which has no attendance column): a row whose
   student has no Present/Late/Half-day attendance on `RecordDate` is **INVALID** ("Mark attendance … for this date
   first"). The import never creates attendance.
2. **DailyRecords update mode** changes **only the result** of the portion's latest attempt (status, completed, quality,
   MistakeCount, TeacherNotes), as an audited correction through the attempt handler. A row that would change the portion
   itself (student, date, session, section, number, Para, range, Total Lines, assigned) is INVALID
   (`PORTION_CHANGE_NOT_ALLOWED`). Confirmed homework is never touched (F08 hooks rebuild drafts only).

## 3. Interpretations to confirm (not product decisions; easy to change)

- **Para-preset quantities.** `AssignedQuantity`/`CompletedQuantity` count the unit: `2` in `RUBU` = 2/4 Para, `1` in
  `SALASAH` = 3/4. Decimals and `a/b` are read exactly (no floats); the Para amount must be a quarter, half, three quarters, or one Para (the app's FR-QTY-002 rule; two Paras are two portions). Exports pick
  the largest preset both amounts are whole multiples of, so files import back unchanged.
- **New students need `ClassName`** (the template marks it optional; the roster has no class-less student). Existing
  students are matched by `ExternalStudentID` only; their class is never changed by an import (warning `CLASS_NOT_CHANGED`).
- **Suspected duplicates are not imported.** A row with a name match (no key) or a composite portion match is shown for
  review and skipped; giving it a stable key imports it as new.
- **ADD_ONLY with a keyed row that differs** is `SUSPECTED_DUPLICATE` (`EXISTS_DIFFERENT`) with no proposed changes, so
  the default mode never proposes a change (F14-AC13); UPDATE shows the before/after.
- **`MistakeCount` on export** is the attempt's total (categorized + imported); an update stores `total − categorized` as
  the uncategorized part (never below 0).
- **SINGLE mode with a `SessionLabel`** is invalid (`SESSION_LABEL_NOT_ALLOWED`), as in Daily Entry.
- **Imported rows add to an existing daily record of that day** when one exists (a new portion on it); only the same
  section and portion number is a composite duplicate.

## 4. Deviations from ARCHITECTURE.md, and why

- **No pg-boss worker yet.** As in F09 (F09-plan §2.10), import and export run in the request: 1,000 rows in 5 batches is
  well within a request, and no worker entrypoint exists. The service is the job body (`ImportService.confirm` is
  idempotent per row and resumable), so moving it to `excel.import.commit` later is a wiring change.
- **Uploaded bytes are not stored.** Only the parsed values are (in `import_rows.values`), purged after 7 days; files are
  streamed, never stored, so the 24-hour generated-file rule has nothing to delete.
- **`mistake_count_summary` is not a synced field.** Devices see the imported records and attempts, but the
  uncategorized count only in server reports and the record detail. Adding it to the attempt's sync field spec is a
  follow-up if the offline views need it.

## 5. Out of scope (not built)

Report sheets as import sources, `.xls`/`.csv`/Google Sheets, formula evaluation or macros, offline import/export, name-
only matching.
