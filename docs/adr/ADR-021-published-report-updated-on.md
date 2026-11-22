# ADR-021 · "Updated on" for published reports: a fingerprint of what the family sees

**Status:** Proposed 2026-11-22 (F10), awaiting the user's review
**Feature:** F10 · Student and Parent access ([spec](../specs/13-f10-student-parent-access.md), [plan](../handover/F10-plan.md))
**Requirements:** FR-RPT-010 ("Later corrections update the published report, which then shows 'Updated on …'"), FR-RPT-001, FR-PORT-006; F10-AC15

## Context

ARCHITECTURE.md §6.3 planned `report_published(…, published_at, updated_after_publish_at NULL)` without saying how a
later correction is detected. A report is never stored as editable totals (FR-RPT-001); it is rebuilt from source on
every read (ADR-020), so the corrected values already show. What is missing is knowing **that** the published report
changed, and when.

Options considered:

1. **Triggers on every source table** set `updated_after_publish_at` when a changed row's date falls inside a published
   period. Every source table would need date logic (portions and attempts reach the date through their record, homework
   through its assigned date, timetables and holidays through any day of any student), and an internal-note edit would
   mark the report "updated" although the family sees nothing new.
2. **Compare stamps.** ADR-020's per-student stamp changes with any change to the student in any period, so a correction
   in March would mark February "updated".
3. **Fingerprint the family payload** (chosen).

## Decision

1. At publish time the server builds each student's report, projects it for the family (`projectFor(PARENT, 'report')`),
   and stores the SHA-256 of its **fingerprint** in `report_published.content_hash`.
2. The fingerprint (`@hifz/domain/reports publishedFingerprint`) is the projected report with sorted keys, without
   `today`, the provisional state, and the homework figures computed against today (each assignment's state, carried
   over, outstanding). It is built **as of** `fingerprintDay(period, today)`, the period's last day or today once the
   period is over, so days of a running period never read "future" in one fingerprint and "not marked" in the next.
3. Whenever a published report is read (a Student's or Parent's `GET /portal/reports/:id`, or the staff
   `GET /reports/publication`), the fingerprint is recomputed. If it differs, the row stores the new hash and sets
   `updated_at` to when the student's or the madrasa's sources last changed: `report_stamps.stamped_at` (added in
   0016 and set by `report_touch`), never earlier than publishing and never later than now.
4. Publishing again resets `updated_at` to null with a fresh hash.

## Consequences

- Only a change the family can see counts: an internal remark or a Leave reason edited after publishing never shows
  "Updated on".
- No source table needs new triggers; ADR-020's stamps give the time.
- Detection happens on read. A list (`GET /portal/reports`) shows `updatedAt` as last detected; opening the report or the
  staff publication view refreshes it.
- `updated_at` is the time of the student's latest source change at detection. If the student changed again in another
  period between the correction and the read, the date is that later change: never earlier than the real correction.
- The cost is one extra report build per read of a running period (as of its last day); a finished period reuses the
  cache entry built for today.
