# ADR-020 · Report cache invalidated by trigger-maintained source stamps

**Status:** Proposed 2026-11-21 (F09), awaiting the user's review
**Feature:** F09 · Weekly and monthly reports ([spec](../specs/12-f09-weekly-monthly-reports.md), [plan](../handover/F09-plan.md))
**Requirements:** FR-RPT-001, FR-RPT-002, FR-RPT-008, NFR-PERF-002, NFR-PERF-004; F09-AC3; edge case "A report is cached and a record changes"

## Context

ARCHITECTURE.md §9.3 planned `report_cache(…, source_seq, payload)`, invalidated when "a change-log entry for an
affected student or period" appears. Building F09 showed that `change_log` does not see every source of a report:

- `change_log` is written for sync entities only (attendance, daily records, portions, attempts, homework).
- Timetables (`class_schedules`), holidays, closures and no-class days (`calendar_exceptions`), and enrollments
  (`student_enrollments`) are changed through REST services that do not write `change_log`.
- A holiday declared later must remove that day's records from reports (FR-CAL-009), and a mid-month enrollment changes
  which days count. A cache keyed on `change_log` alone would serve those reports stale.

Relying on every current and future service to "remember to invalidate" is the failure mode FR-RPT-008 warns about.

## Decision

1. **`report_stamps(organization_id, scope_key, stamp)`** holds one counter per student (`scope_key` = the student id)
   and one per madrasa (`'ORG'`), set from one sequence.
2. **Triggers** (`AFTER INSERT OR UPDATE … FOR EACH ROW`) bump the stamp in the same transaction as the change:
   - per student: `daily_records`, `lesson_portions`, `portion_attempts`, `attempt_mistakes`, `attendance_records`,
     `homework_assignments`, `homework_portions`, `student_enrollments`, `students`;
   - per madrasa: `class_schedules`, `calendar_exceptions`.
   None of these tables can be deleted from (no DELETE grant, no-delete triggers), so INSERT and UPDATE cover every change.
3. **`report_cache`** stores the staff payload with the organization and student stamps read **before** the sources,
   the date it was built for (`as_of`: "today" decides future days and homework state), the madrasa's timezone and week
   start (`settings_key`), and the viewer's class scope (`scope_key`: `ALL` or the sorted class ids). A read serves the
   cached payload only when all of these match; otherwise it rebuilds from source and overwrites the row.
4. Reading the stamps before the sources means a change committed during a build leaves a newer stamp than the one
   stored, so the next read rebuilds: the cache can be needlessly rebuilt, never served stale.
5. `ReportService.verifyCache` recomputes a sample of current rows and reports mismatches (FR-RPT-008's nightly check);
   scheduling it waits for the pg-boss worker entrypoint.

## Consequences

- Invalidation does not depend on application code paths; a new write path to a source table is covered automatically.
- Each source write does one extra upsert on a small table. Sync writes are already serialized per madrasa (ADR-015);
  REST calendar writes are rare.
- A timetable or exception change invalidates every report of the madrasa (coarse, but such changes are infrequent).
- The cache holds staff text (remarks, internal notes) under RLS; it is never sent without `projectFor()`.
- ARCHITECTURE.md §6.3 and §9.3 are updated to this design.

## Alternatives considered

- **`change_log` seq only** (the original plan): misses calendar and roster changes (see Context).
- **Write `change_log` from the calendar and roster services:** would put non-sync entities into the device pull stream
  and still depend on each service remembering to do it.
- **No cache:** reports are cheap enough today; but F09 is specified to build the cache, and F10 (published reports),
  F13 (PDF), and F15 (analytics) will read the same reports repeatedly.
