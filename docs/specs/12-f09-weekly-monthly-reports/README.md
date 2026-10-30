# F09 · Weekly and monthly reports

**Status:** draft
**Brief:** [00-product-brief.md](../../00-product-brief.md) · **Flow:** Reports ([design.md §4.10, §5.8](../../design.md))
**Requirements:** FR-WKR-001…008, FR-MNR-001…007, FR-RPT-001…009, FR-CAL-005, NFR-PERF-002/004, NFR-OFF-008, FR-RPT-011
**Stories:** US-039 – US-043, US-073 · **Depends on:** F04, F05, F07, F08
**Build order:** 12 of 17 (dependency level 5)

This folder has one spec per user story. This page keeps what applies to the whole feature: context, scope, edge cases, open questions, the feature test plan, and its definition of done. Story specs repeat the edge cases and open questions that apply to them.

## Story specs

| Spec | Story | Detailed criteria |
|---|---|---|
| [SPEC-US-039](us-039-view-weekly-report.md) | US-039 — View weekly report | F09-AC1, F09-AC2, F09-AC3, F09-AC4, F09-AC5, F09-AC6, F09-AC7, F09-AC15, F09-AC16 |
| [SPEC-US-040](us-040-view-monthly-report.md) | US-040 — View monthly report | F09-AC8, F09-AC9, F09-AC10 |
| [SPEC-US-041](us-041-separate-attendance-and-performance.md) | US-041 — Separate attendance and performance | F09-AC11, F09-AC12, F09-AC17 |
| [SPEC-US-042](us-042-show-leave-and-normal-absence.md) | US-042 — Show leave and normal absence | F09-AC13 |
| [SPEC-US-043](us-043-show-portion-level-outcomes.md) | US-043 — Show portion-level outcomes | F09-AC14 |
| [SPEC-US-073](us-073-view-class-summary-report.md) | US-073 — View class summary report | F09-AC18, F09-AC19, F09-AC20 |

## Context

Teachers and Admins need weekly and monthly views without adding up registers by hand. Every report is **calculated from the daily source records**, never typed in. When a record is corrected, the report changes with it.

Attendance and recitation performance are reported separately. Missing data is never shown as zero.

There is no code yet. This feature builds:
- `buildReport()` in `packages/domain/reports`
- the API `reporting` module with its `report_cache` ([ARCHITECTURE.md §9.3](../../ARCHITECTURE.md))

It reads from F04, F05, F07, and F08. PDF output is F13, and Student/Parent viewing is F10.

## Out of scope

- Editable report totals.
- PDF generation and templates (F13).
- Excel export (F14).
- AI commentary (F15).
- Reports for unassigned classes (F02 scope rules apply).

## Edge cases

| Situation | What should happen |
|---|---|
| No records in the period | "No records for this period", never a page of zeros |
| A student joined in the middle of the month | Scheduled days count only from the enrollment date |
| A record's `report_date` is in this week but it synced next week | It belongs to this week (report date, not sync date) |
| A report is cached and a record changes | The cache is invalidated; the next view is rebuilt from source |
| A student moved class in the middle of the month | Days before the move appear under the old class, days after under the new one |

## Open questions (resolved 2026-10-30)

- [x] Report publishing for Students/Parents: who publishes, and per week or per month (design.md §11 D3)? **Resolved:** Teacher (assigned classes) or Admin publishes per class or student, per week and month (DEC-B33, FR-RPT-010).
- [x] What counts as a "recurring difficulty"? This spec proposes: a Para with a Major or repeated mistake in at least 2 attempts in the period. **Resolved:** 3 or more attempts with a Major or Repeated mistake, or Not Remembered 3+ times (DEC-B34, FR-MNR-006).
- [x] Should class-level reports (all students) exist in MVP, or student-level only? **Resolved:** Yes, a staff-only class summary (DEC-B35, FR-RPT-011, US-073).

## Done means

- [ ] Every acceptance criterion has a passing test.
- [ ] `npm run e2e:gate -- F09` passes: every criterion has an E2E test, none is pending, and all pass (e2e/README.md).
- [ ] Nothing from "Out of scope" was built.
- [ ] `npm test` and `npm run lint` pass.
- [ ] SRS acceptance tests AC-RPT-01…08 pass.
- [ ] Report queries have no N+1 pattern (checked by query count in an integration test).

## Test plan

| Level | What it covers | Where |
|---|---|---|
| **Unit** | `buildReport()`: period boundaries in `Asia/Karachi`, unit grouping, latest-attempt rule, quality average and label, attendance categories, homework measures, recurring-difficulty rule | `packages/domain/reports/*.test.ts` |
| **Integration** | Report API by role, note projection, cache invalidation after an edit, query count | `apps/api/test/reporting/*.test.ts` |
| **Component** | Weekly/monthly switch, filters, separate attendance and performance sections, "Not recorded" values, provisional banner, chart text alternatives | `apps/mobile/src/features/reports/__tests__/*.test.tsx` |
| **E2E** | Every acceptance criterion: server-side checks (API) and device journeys (Maestro), including: Record a week of data → open the weekly report → correct a record → the report updates | `e2e/api/f09-reports.spec.ts`, `e2e/mobile/f09-reports/` |

**Traceability:** Each test name starts with its criterion, e.g. `F09-AC12 (US-041) …`. Every AC 1–20 has at least one test.

**Coverage:** ≥80% on new code.
