# F09 · Weekly and monthly reports: implementation plan

**Spec:** [12-f09-weekly-monthly-reports.md](../specs/12-f09-weekly-monthly-reports.md) · **Stories:** US-039…US-043, US-073 · **Criteria:** F09-AC1…AC20
**Requirements:** FR-WKR-001…008, FR-MNR-001…007, FR-RPT-001…009, FR-RPT-011, FR-CAL-005, NFR-PERF-002/004, NFR-OFF-008 · **Decisions:** DEC-A02, DEC-B22, DEC-B33, DEC-B34, DEC-B35
**Branch:** `feature/f09-weekly-monthly-reports` (from `feature/f08-homework-carry-forward` after the outstanding F08 work was committed; the PR targets `main` after F08 merges)

## 1. Shape

| Piece | Where |
|---|---|
| `reportPeriod()` (week from the madrasa's week start or calendar month, in its timezone, with `startsAt`/`endsAt` instants), `shiftPeriod()` | `packages/domain/reports/period.ts` |
| `buildReport()`: attendance days and counts, sections with per-unit totals, Para-wise progress and pending portions, daily detail, quality, mistakes, recurring difficulty, homework measures, provisional flag | `packages/domain/reports/build-report.ts` |
| `classSummary()`, `classSummaryExportRows()` (the notes-free rows F13/F14 will render) | `packages/domain/reports/class-summary.ts` |
| Queries and views | `packages/contracts/src/reports.ts` |
| `report_stamps`, triggers, `report_cache`, index `daily_records (org, student, report_date)` | migration `0015_reporting.sql` ([ADR-020](../adr/ADR-020-report-cache-source-stamps.md)) |
| `GET /reports/student`, `GET /reports/class-summary`; batched source loading; stamp-checked cache; `verifyCache` | `apps/api/src/modules/reporting` |
| `HomeworkService.forReport()` (homework views for many students, fixed query count) | `apps/api/src/modules/homework/homework-service.ts` |
| `projectFor(STUDENT/PARENT, 'report')`: remarks and INTERNAL mistake notes removed; `class_summary` not allowlisted | `apps/api/src/modules/access/projection.ts` |
| Reports screen (Student report / Class summary, Weekly / Monthly, previous/next, class and student pickers), provisional device build | `apps/mobile/src/features/reports` |

## 2. Decisions taken with the user (2026-11-21)

1. **F09-AC15 (Student/Parent payload):** the F09 report routes are staff only. A Student or Parent gets `403` before
   anything is loaded, so no report body (and no note) reaches them. Notes leave only through `projectFor`, whose
   `report` projection removes remarks and INTERNAL notes; this is tested now. F10 adds the published portal and
   re-runs AC15 on that path.
2. **F09-AC20 (PDF/Excel of the class summary):** first deferred to F13/F14; then, on 2026-11-21, the user asked for AC20
   to pass in F09. F09 now builds a **minimal** class-summary export: `GET /reports/class-summary/export?format=xlsx|pdf`
   (exceljs; Playwright/Chromium per ADR-008), staff only with the summary's scope, audited `CLASS_SUMMARY_EXPORTED`. Both
   files come from `classSummaryExportRows()` over the projected summary, so they hold the screen's rows and no notes.
   F13 still owns the madrasa's PDF template (logo, colors, headings), stored files with signed URLs, and the other PDFs;
   F14 the other Excel exports and imports.
3. **Branching:** the outstanding F08 working-tree changes were committed on the F08 branch first (`a4bdb96`, not
   pushed); F09 branches from there.

## 3. Interpretations (flagged for confirmation)

1. **Cache invalidation by source stamps, not `change_log` seq** ([ADR-020](../adr/ADR-020-report-cache-source-stamps.md),
   *Proposed*). `change_log` does not see timetable, exception, or enrollment changes, so the original §9.3 plan would
   serve stale reports after a holiday is declared or an enrollment changes.
2. **Quality and mistakes count every attempt in the period**, as the F07 summary does (F07 plan §3). Current progress
   (status, completed, remaining, totals) uses the latest attempt per portion; the assigned quantity counts once.
3. **Homework measures (FR-MNR-005)** are counted per **portion** of confirmed homework given in the period:
   assigned, attempted (a linked next-class attempt), completed (latest linked attempt COMPLETED), carried forward
   (portions that came from an earlier attempt, i.e. not Teacher-added). Separately: confirmed and draft
   **assignments** given in the period (AC-RPT-06), assignments carried over (due day missed, FR-HW-016), and
   outstanding confirmed assignments (given by the period's end, not fully attempted, as of today).
4. **Pending portions (FR-MNR-004):** a non-Extra portion whose latest attempt is Partial or Not Remembered with work
   left (or an unknown remaining), Pending, or not recorded. Absent and Not Assigned are not pending work. Each pending
   portion shows whether live homework carries it forward.
5. **Recurring difficulty** groups attempts by Para across sections (a portion without a Para by its range). The counts
   by category cover every attempt of that Para in the period; the dates are those of the qualifying attempts.
6. **Teacher scope:** a Teacher may open the report of a student enrolled at any time in one of their classes; the
   report holds only the days in their classes (a moved student shows only those days). The class summary scopes each
   student's report to that class, so the edge case "moved mid-month" puts days before the move under the old class and
   days after under the new one.
7. **"No records for this period"** (`hasData: false`) when the period has no marked attendance, no recorded work, and
   no homework given. A holiday-only week is therefore "No records".
8. **Provisional (NFR-OFF-008):** online, the server's report is shown; with unsynced changes a notice says it does not
   include them yet. Offline, the device builds the report with the same domain function and labels it Provisional
   with the last successful sync time and the pending count. The device has no enrollment history (the student counts
   as in the chosen class for the period) and needs the cached class timetable to count class days; without it the
   screen says so and shows no attendance counts.
9. **Week/month boundaries are calendar dates** in the madrasa's timezone; a record belongs to its `report_date`
   whatever its save or sync time. The stated end is 23:59 on the last day (AC-RPT-07).

10. **Minimal export, synchronous (AC20):** the file is generated in the request and streamed back, not run as a worker job
    and stored behind a signed URL (ARCHITECTURE §10, §11). No worker entrypoint exists yet; a class summary is small.
    Fonts use the approved stack (FR-PDF-004) when installed on the server; bundling them is F13. The app has no export
    button yet (the API serves the files; saving a file on Android needs a file/share module, F13/F14).

## 4. Not built in F09

- Publishing and the Student/Parent report view (F10, FR-RPT-010, DEC-B33).
- The madrasa's PDF template, stored files, and the other PDF/Excel exports (F13, F14). The class summary export (F09-AC20) is built in its minimal form.
- AI commentary (F15).
- Scheduling the nightly cache verification: `ReportService.verifyCache` exists; the pg-boss worker entrypoint does not.
- Charts: every figure is shown as text (design.md §4.10 requires a text equivalent; no chart without one).
