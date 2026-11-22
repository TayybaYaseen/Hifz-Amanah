# F10 · Student and Parent access: implementation plan

**Spec:** [13-f10-student-parent-access.md](../specs/13-f10-student-parent-access.md) · **Stories:** US-044…US-046 · **Criteria:** F10-AC1…AC17
**Requirements:** FR-PORT-001…007, FR-SEC-004…006, FR-RPT-010, NFR-PORT-001…006, NFR-PRV-004 · **Decisions:** DEC-B33, DEC-B36, DEC-B37
**Branch:** `feature/f10-student-parent-access` (from `feature/f09-weekly-monthly-reports` at `cbdb993`; the PR targets `main` after F09 merges)

## 1. Shape

| Piece | Where |
|---|---|
| `publishRefusal()`, `publishedFingerprint()`, `fingerprintDay()` | `packages/domain/reports/publish.ts` |
| `textForFamily()`, `visibilityOrDefault()`; `remarksVisibility` on report attempts and lines | `packages/domain/mistakes`, `packages/domain/reports/build-report.ts` |
| Portal, publishing, and family-access contracts; `PUBLISH_REFUSED` | `packages/contracts/src/portal.ts`, `identity.ts`; `remarksVisibility` in `hifz.ts` |
| `student_accounts`, `student_guardians`, `report_published`, `report_stamps.stamped_at`, remark visibility opened to SHARED | migration `0016_portal.sql` |
| `projectFor`: `published_report`, `published_period`, `portal_student`; FR-PORT-006 field set | `apps/api/src/modules/access/projection.ts` |
| Portal reads (Student, Parent) | `apps/api/src/modules/portal` |
| Publish, unpublish, publication status, "Updated on" detection | `apps/api/src/modules/reporting/published.ts` ([ADR-021](../adr/ADR-021-published-report-updated-on.md)) |
| Student logins and Parent links (Owner/Admin) | `apps/api/src/modules/roster/family-access-service.ts` |
| Remark visibility through sync, audited `NOTE_VISIBILITY_CHANGED` | `apps/api/src/modules/hifz/portion-attempt-sync.ts` |
| App: Reports for Students and Parents (switcher, list, read-only report, offline state) | `apps/mobile/src/features/portal` |
| App: Publish panel (staff Reports), remark visibility control (Daily Entry), Family access (student profile) | `features/reports`, `features/daily-entry`, `features/students/FamilyAccessScreen.tsx` |
| Device: `portion_attempts.remarks_visibility` (workspace migration 10, outbox untouched) | `apps/mobile/src/features/daily-entry/local.ts` |

## 2. Interpretations (flagged for confirmation)

1. **"notes.visibility" is the remark visibility.** The only free-text teacher notes a family could see are attempt
   remarks and mistake notes. Mistake notes already had `note_visibility` (F07); F10 opens
   `portion_attempts.remarks_visibility` to `SHARED`. No generic `notes` table was added (ARCHITECTURE §6.3 updated).
   Leave reasons, absence notes, and the student's private notes stay internal and are never projected.
2. **"Unsynced changes" (F10-AC14).** The server cannot see another device's outbox. Publishing is refused when the
   publishing device reports pending changes (`pendingChanges`, checked again on the app before any request), or when a
   sync conflict is open for those students on a date in the period (a change the server holds but has not applied).
   Offline, the app refuses before calling. A Teacher's other phone with unsynced work cannot be detected.
3. **A period can be published once it has started** (`PERIOD_NOT_STARTED` before that). design.md §4.10 says "after a
   week or month ends", but FR-RPT-010 sets no such rule, and a Teacher may want to publish on the last class day.
   Later records then show "Updated on".
4. **"The teacher's name" (FR-PORT-006)** is every Teacher assigned to the report's classes at some time in the period.
   The E2E seed now assigns the fixture Teachers from the enrollment date, so past periods have one.
5. **Publish for a class covers the whole report** of each student enrolled in it during the period (all their
   classes), as a Parent sees one report per student.
6. **Unpublish** is built (staff, audited): the edge case "a report is unpublished after a Parent saw it" needs it.
7. **Verification methods** are `IN_PERSON` and `MADRASA_RECORDS`, the two FR-PORT-007 names, with no free text (no
   contact details can end up in a link row or its audit). "Verify" records a new verification on an active link.
8. **Student logins.** A Student account must be linked to its student record before it sees anything; nothing in F01
   or F03 did this. The Owner/Admin links it on the same Family access screen.
9. **"Sensitive report access" (NFR-PORT-006)** is not audited per view: family report reads are not logged as audit
   events. Exports (F13, F14) will be.
10. **Recurring difficulty and the quality trend** stay in the family report (derived from mistakes and ratings, both in
    the FR-PORT-006 list); the draft-homework count and a pending portion's link to a draft are removed.

## 3. Not built in F10

- Family PDF and Excel exports (F13, F14) and the "Report published" push (F16). The AC10 leak tests cover every
  channel that exists today; each later channel must add its own (AGENTS.md §6). `APP-NOTE-02…06` stay `fixme`.
- Component tests: the mobile workspace has no React Native test renderer. Screen rules live in `view.ts` files with
  Vitest tests, as in F09; the screens are covered by the Maestro flows.
- Deep links into a report: the app has none, so F10-AC2 on screen means "no way to ask"; the API answers 404.
