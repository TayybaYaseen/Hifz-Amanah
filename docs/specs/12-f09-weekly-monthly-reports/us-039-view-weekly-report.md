# SPEC-US-039 · View weekly report

| | |
|---|---|
| **Spec ID** | SPEC-US-039 |
| **User story** | US-039 |
| **Feature** | [F09 · Weekly and monthly reports](README.md) |
| **Epic** | EPIC 9 — Weekly and Monthly Reports ([user-stories.md](../../user-stories.md)) |
| **Status** | draft |
| **Priority** | Not specified in the source documents (SRS, user-stories.md, feature specs). None is assigned here. |
| **Split from** | `docs/specs/F09-weekly-monthly-reports.md` on 2026-10-30 |

## User story

**US-039 — View weekly report**

As a Teacher/Admin, I want a weekly report derived from daily source records.

Spec wording (from F09):

- **US-039:** As a Teacher/Admin, I want a weekly report derived from daily records, so that I can review the week without manual totals.

**Feature context** (shared by every story in F09, copied from the feature spec):

> Teachers and Admins need weekly and monthly views without adding up registers by hand. Every report is **calculated from the daily source records**, never typed in. When a record is corrected, the report changes with it.
>
> Attendance and recitation performance are reported separately. Missing data is never shown as zero.
>
> There is no code yet. This feature builds:
> - `buildReport()` in `packages/domain/reports`
> - the API `reporting` module with its `report_cache` ([ARCHITECTURE.md §9.3](../../ARCHITECTURE.md))
>
> It reads from F04, F05, F07, and F08. PDF output is F13, and Student/Parent viewing is F10.

## Related functional requirements

Requirements this story covers. SRS.md has no story-to-requirement table, so this list is derived from the requirement text and the criteria below.

- **Functional:** FR-WKR-001, FR-WKR-002, FR-WKR-003, FR-WKR-004, FR-WKR-005, FR-WKR-006, FR-WKR-007, FR-WKR-008, FR-RPT-001, FR-RPT-002, FR-RPT-003, FR-RPT-004, FR-RPT-005, FR-RPT-006, FR-RPT-007, FR-RPT-008, FR-RPT-009
- **Non-functional:** NFR-PERF-002, NFR-PERF-004, NFR-OFF-008
- **SRS acceptance tests cited:** AC-RPT-07, AC-RPT-01, AC-RPT-02, AC-RPT-04, AC-RPT-05, AC-RPT-06, AC-RPT-03

Feature requirement set (from F09; additions of 2026-10-30 at the end): FR-WKR-001…008, FR-MNR-001…007, FR-RPT-001…009, FR-CAL-005, NFR-PERF-002/004, NFR-OFF-008, FR-RPT-011

## Acceptance criteria

### Story acceptance criteria

Verbatim from [user-stories.md](../../user-stories.md).

1. The report is derived from source daily records, attempts, schedules, attendance, and homework history for the selected period.
2. Attendance and performance are separate; Leave and normal absences are distinct.
3. Missing quality is excluded from averages, repeated attempts are not double-counted, and viewer permissions filter notes/fields.

### Detailed acceptance criteria

From the F09 feature spec. The original IDs are kept because tests cite them. Criteria marked *Revised* or *Added* come from the decision review of 2026-10-30 (SRS §17).

- **F09-AC1** — **(US-039) Given** the organization timezone `Asia/Karachi` and a Monday week start, **when** a weekly report is opened for a date, **then** it covers Monday 00:00 to Sunday 23:59 of that week in `Asia/Karachi`, and states the date range (AC-RPT-07).
- **F09-AC2** — **(US-039) Given** a week of source records, **when** the weekly report is built, **then** every total equals a calculation made directly from the source records (AC-RPT-01).
- **F09-AC3** — **(US-039) Given** a weekly report already viewed, **when** a daily record in that week is corrected, **then** the next view of the report shows the corrected totals (AC-RPT-02).
- **F09-AC4** — **(US-039) Given** quantities in lines and Para fractions in the same week, **when** totals are shown, **then** they are grouped by unit and never combined (AC-RPT-04).
- **F09-AC5** — **(US-039) Given** a portion with two attempts, **when** the report counts assigned work, **then** the portion's assigned quantity is counted once, and its current status comes from the latest attempt (AC-RPT-05).
- **F09-AC6** — **(US-039) Given** confirmed and draft homework in the week, **when** the report lists homework, **then** confirmed homework and draft suggestions appear as separate counts (AC-RPT-06).
- **F09-AC7** — **(US-039) Given** quality scores 1, 3 and two missing, **when** average quality is shown, **then** it reads "2.0 · Good (2 ratings)". The missing ratings are not counted as zero (AC-RPT-03).
- **F09-AC15** — **(US-039) Given** a viewer without permission for internal notes, **when** the report is shown, **then** internal notes are absent from the response payload, not just hidden in the UI.
- **F09-AC16** — **(US-039) Given** a Teacher offline with unsynced changes, **when** they open a report, **then** it is labelled "Provisional", with the last successful sync time and the number of pending changes.

## Business rules

From SRS §9 (verbatim):

- **BR-8:** Weekly/monthly reports are derived from daily source records.
- **BR-16:** Repeated attempts must not be double-counted as separate assigned portions in aggregate progress.
- **BR-17:** Missing data is not the same as zero performance.

## Validation rules

No validation rule beyond the criteria above.

## Edge cases and error handling

Rows from the F09 edge-case table that apply to this story (verbatim):

| Situation | What should happen |
|---|---|
| No records in the period | "No records for this period", never a page of zeros |
| A record's `report_date` is in this week but it synced next week | It belongs to this week (report date, not sync date) |
| A report is cached and a record changes | The cache is invalidated; the next view is rebuilt from source |

**Out of scope for the whole feature** (verbatim from F09):

- Editable report totals.
- PDF generation and templates (F13).
- Excel export (F14).
- AI commentary (F15).
- Reports for unassigned classes (F02 scope rules apply).

## Dependencies

- **Feature F09 depends on:** F04, F05, F07, F08 (from the spec index)
- **Features referenced by this story's criteria and edge cases:** None
- **Other stories referenced:** None
- **Other stories in F09:** [US-040](us-040-view-monthly-report.md), [US-041](us-041-separate-attendance-and-performance.md), [US-042](us-042-show-leave-and-normal-absence.md), [US-043](us-043-show-portion-level-outcomes.md), [US-073](us-073-view-class-summary-report.md)

## Related screens and UI

- **Feature flow** (from F09): Reports ([design.md §4.10, §5.8](../../design.md))

[design.md §13](../../design.md) story-to-screen map (verbatim):

| Story | Screen (this document) | Key interaction | Required states beyond standard | Validation shown | Accessibility / localization specifics |
|---|---|---|---|---|---|
| US-039 to US-043 | §4.10 Reports; §5.8 | Weekly/Monthly switch; filters; drill-down to each portion; Publish for class / per student | No records ("No records for this period"); Offline → Provisional with last sync time and pending count; publishing blocked while changes are unsynced | — | Every chart has a text/table equivalent; missing values shown as "Not recorded"; Late, Half day, Leave, and normal absence shown separately |

## Related API and data model

- **Modules** ([ARCHITECTURE.md §18](../../ARCHITECTURE.md)): `reporting`, `packages/domain/reports`
- Tables and services are described in the feature context above and in [ARCHITECTURE.md](../../ARCHITECTURE.md). Concrete API routes are defined at scaffolding (SRS §17 DEC-B54).

## Offline and sync behavior

Stated in these criteria: F09-AC16.

And in these edge cases (see above):

- A record's `report_date` is in this week but it synced next week

## Related E2E test scenarios

**Completion gate:** this spec is complete only when `npm run e2e:gate -- US-039` passes. That means every criterion has an E2E test, none is pending, and all of them pass ([e2e/README.md](../../../e2e/README.md)).

**API (Playwright):**

- [e2e/api/f09-reports.spec.ts](../../../e2e/api/f09-reports.spec.ts) — F09-AC1 (US-039) the week is Monday 00:00 to Sunday 23:59 Asia/Karachi (AC-RPT-07)
- [e2e/api/f09-reports.spec.ts](../../../e2e/api/f09-reports.spec.ts) — F09-AC2 (US-039) every total equals a direct calculation from source records (AC-RPT-01)
- [e2e/api/f09-reports.spec.ts](../../../e2e/api/f09-reports.spec.ts) — F09-AC3 (US-039) a corrected record changes the next report view (AC-RPT-02)
- [e2e/api/f09-reports.spec.ts](../../../e2e/api/f09-reports.spec.ts) — F09-AC4 (US-039) quantities are grouped by unit (AC-RPT-04)
- [e2e/api/f09-reports.spec.ts](../../../e2e/api/f09-reports.spec.ts) — F09-AC5 (US-039) a portion with two attempts counts once with the latest status (AC-RPT-05)
- [e2e/api/f09-reports.spec.ts](../../../e2e/api/f09-reports.spec.ts) — F09-AC6 (US-039) confirmed homework and drafts are separate counts (AC-RPT-06)
- [e2e/api/f09-reports.spec.ts](../../../e2e/api/f09-reports.spec.ts) — F09-AC7 (US-039) scores 1, 3 and two missing → 2.0 · Good (2 ratings) (AC-RPT-03)
- [e2e/api/f09-reports.spec.ts](../../../e2e/api/f09-reports.spec.ts) — F09-AC15 (US-039) internal notes are absent from the payload for viewers without permission

**Mobile (Maestro):**

- [e2e/mobile/f09-reports/monthly-and-attendance.yaml](../../../e2e/mobile/f09-reports/monthly-and-attendance.yaml) — F09 monthly report — sections, homework measures, difficulty, attendance categories
- [e2e/mobile/f09-reports/provisional-offline.yaml](../../../e2e/mobile/f09-reports/provisional-offline.yaml) — F09 reports — provisional offline label; private notes only for staff
- [e2e/mobile/f09-reports/weekly.yaml](../../../e2e/mobile/f09-reports/weekly.yaml) — F09 weekly report — range, units, latest attempt, homework, quality, correction

**Unit (Vitest):**

- [packages/domain/reports/build-report.test.ts](../../../packages/domain/reports/build-report.test.ts) — F09-AC1 (US-039) a weekly report covers Monday 00:00 to Sunday 23:59 Asia/Karachi and states the range (AC-RPT-07)
- [packages/domain/reports/build-report.test.ts](../../../packages/domain/reports/build-report.test.ts) — F09-AC2 (US-039) every total equals a direct calculation from source records (AC-RPT-01)
- [packages/domain/reports/build-report.test.ts](../../../packages/domain/reports/build-report.test.ts) — F09-AC4 (US-039) quantities are grouped by unit and never combined (AC-RPT-04)
- [packages/domain/reports/build-report.test.ts](../../../packages/domain/reports/build-report.test.ts) — F09-AC5 (US-039) assigned quantity is counted once; status comes from the latest attempt (AC-RPT-05)
- [packages/domain/reports/build-report.test.ts](../../../packages/domain/reports/build-report.test.ts) — F09-AC7 (US-039) scores 1, 3 and two missing → 2.0 · Good (2 ratings) (AC-RPT-03)
- [packages/domain/reports/build-report.test.ts](../../../packages/domain/reports/build-report.test.ts) — F09-AC6 (US-039) confirmed homework and draft suggestions are separate counts (AC-RPT-06)
- [packages/domain/reports/build-report.test.ts](../../../packages/domain/reports/build-report.test.ts) — F09-AC16 (US-039) a report with unsynced local changes is marked provisional with last sync time and pending count

## Open decisions and blockers

Open questions from F09 that apply to this story, with their resolutions (decision review of 2026-10-30, SRS §17):

- [x] Report publishing for Students/Parents: who publishes, and per week or per month (design.md §11 D3)? **Resolved:** Teacher (assigned classes) or Admin publishes per class or student, per week and month (DEC-B33, FR-RPT-010).
- [x] Should class-level reports (all students) exist in MVP, or student-level only? **Resolved:** Yes, a staff-only class summary (DEC-B35, FR-RPT-011, US-073).

## Traceability

- **Story:** US-039 → SPEC-US-039 (this file)
- **Detailed criteria:** F09-AC1, F09-AC2, F09-AC3, F09-AC4, F09-AC5, F09-AC6, F09-AC7, F09-AC15, F09-AC16
- **Requirements:** FR-WKR-001, FR-WKR-002, FR-WKR-003, FR-WKR-004, FR-WKR-005, FR-WKR-006, FR-WKR-007, FR-WKR-008, FR-RPT-001, FR-RPT-002, FR-RPT-003, FR-RPT-004, FR-RPT-005, FR-RPT-006, FR-RPT-007, FR-RPT-008, FR-RPT-009, NFR-PERF-002, NFR-PERF-004, NFR-OFF-008
- **SRS acceptance tests:** AC-RPT-07, AC-RPT-01, AC-RPT-02, AC-RPT-04, AC-RPT-05, AC-RPT-06, AC-RPT-03
- **Business rules:** SRS §9 #8, SRS §9 #16, SRS §9 #17
- **Design:** design.md §13; **Architecture:** ARCHITECTURE.md §18 epic 9
- **Previous location:** `docs/specs/F09-weekly-monthly-reports.md`
