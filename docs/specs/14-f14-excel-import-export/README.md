# F14 · Excel import and export

**Status:** draft
**Brief:** [00-product-brief.md](../../00-product-brief.md) · **Flow:** Excel import/export ([design.md §4.15](../../design.md))
**Requirements:** FR-XLS-001…017, NFR-XLS-001…004, SRS §15.1–15.2, FR-XLS-018
**Stories:** US-058 – US-061 · **Depends on:** F03, F05, F09
**Build order:** 14 of 17 (dependency level 6)

This folder has one spec per user story. This page keeps what applies to the whole feature: context, scope, edge cases, open questions, the feature test plan, and its definition of done. Story specs repeat the edge cases and open questions that apply to them.

## Story specs

| Spec | Story | Detailed criteria |
|---|---|---|
| [SPEC-US-058](us-058-import-student-workbook.md) | US-058 — Import student workbook | F14-AC1, F14-AC2, F14-AC3, F14-AC4, F14-AC5, F14-AC20, F14-AC21 |
| [SPEC-US-059](us-059-import-daily-records.md) | US-059 — Import daily records | F14-AC6, F14-AC7, F14-AC8, F14-AC9, F14-AC10 |
| [SPEC-US-060](us-060-preview-import-changes.md) | US-060 — Preview import changes | F14-AC11, F14-AC12, F14-AC13, F14-AC14, F14-AC15, F14-AC22 |
| [SPEC-US-061](us-061-export-authorized-data.md) | US-061 — Export authorized data | F14-AC16, F14-AC17, F14-AC18, F14-AC19 |

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

## Open questions (resolved 2026-10-30)

- [x] May Teachers import student lists (SRS §13 #13)? **Resolved:** Yes, into assigned classes only (DEC-B15, FR-XLS-001).
- [x] D7: the template version marker format and the commit batch size. **Resolved:** Hidden `_meta` sheet; 200-row batches (DEC-B43, FR-XLS-018).
- [x] How long are uploaded files kept on the server after an import? **Resolved:** 7 days (DEC-B44, NFR-PRV-005).

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

**Traceability:** Each test name starts with its criterion, e.g. `F14-AC18 (US-061) …`. Every AC 1–22 has at least one test.

**Coverage:** ≥80% on new code.
