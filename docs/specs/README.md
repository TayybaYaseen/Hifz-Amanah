# HifzAmanah specs

**One spec = one user story.** Each of the 73 stories in [user-stories.md](../user-stories.md) has exactly one spec file. Specs are grouped into 17 feature folders, one per epic. Each folder README holds what applies to the whole feature: context, out of scope, edge cases, open questions, the feature test plan, and its definition of done.

- **Spec ID:** `SPEC-US-<nnn>`, in `docs/specs/<order>-<feature>/us-<nnn>-<title>.md`. `<order>` is the feature's position in dependency order; the feature ID (`F<nn>`) and criterion IDs never change.
- **Sections in every spec:** header (spec ID, story, feature, epic, status, priority, origin) · User story · Related functional requirements · Acceptance criteria · Business rules · Validation rules · Edge cases and error handling · Dependencies · Related screens and UI · Related API and data model · Offline and sync behavior · Related E2E test scenarios · Open decisions and blockers · Traceability.
- **Acceptance criteria** come in two parts:
  - **Story criteria:** verbatim from user-stories.md.
  - **Detailed criteria:** Given/When/Then, tagged with the story, e.g. `(US-015)`. They keep their original IDs (`F<nn>-AC<k>`), and every test cites one in its name.
- **Requirement mapping:** SRS.md has no story-to-requirement table. Each spec lists the requirement IDs derived for its story, plus the feature's full requirement set.
- **Priority:** none of the source documents assigns one, so no spec states a priority.
- **Status:** all specs are **draft**. Their open questions were answered in the decision review of 2026-10-30 (SRS §17), so each spec can move to *ready for tickets* after review.
- **Completion:** a spec is complete only when `npm run e2e:gate -- US-<nnn>` passes. That means every criterion has an E2E test in [`e2e/`](../../e2e/README.md), none is pending, and all of them pass. `npm run e2e:gate -- F<nn>` gates a whole feature.
- **Checks:** `npm run docs:check` (`scripts/check-traceability.mjs`) verifies:
  - one story per spec and no duplicates
  - verbatim story criteria
  - requirement IDs
  - internal links
- **Test file paths** follow the proposed layout in [ARCHITECTURE.md §4](../ARCHITECTURE.md) and may change at scaffolding time.

## Features

| Order | Level | Feature | Stories | Depends on |
|---|---|---|---|---|
| 1 | 0 | [F01 · Identity and authentication](01-f01-identity-authentication/README.md) | US-001 – US-006, US-071, US-072 | — |
| 2 | 0 | [F11 · Localization and accessibility](02-f11-localization-accessibility/README.md) | US-047 – US-050 | — (cross-cutting) |
| 3 | 1 | [F02 · Organization and roles](03-f02-organization-roles/README.md) | US-007 – US-009 | F01 |
| 4 | 2 | [F12 · Offline and synchronization](04-f12-offline-sync/README.md) | US-051 – US-054 | F01, F02 |
| 5 | 2 | [F17 · Security, audit, and administration](05-f17-security-audit-admin/README.md) | US-068 – US-070 | F01, F02 |
| 6 | 2 | [F03 · Classes and students](06-f03-classes-students/README.md) | US-010 – US-012 | F02 |
| 7 | 2 | [F06 · Quran portions and metadata](07-f06-quran-portions-metadata/README.md) | US-024 – US-027 | F02 |
| 8 | 3 | [F04 · Calendar and attendance](08-f04-calendar-attendance/README.md) | US-013 – US-017 | F03, F12 |
| 9 | 3 | [F05 · Daily Hifz entry](09-f05-daily-hifz-entry/README.md) | US-018 – US-023 | F03, F06, F12 (F07: see note) |
| 10 | 4 | [F07 · Mistakes and quality](10-f07-mistakes-quality/README.md) | US-028 – US-032 | F05 |
| 11 | 4 | [F08 · Homework and carry forward](11-f08-homework-carry-forward/README.md) | US-033 – US-038 | F05, F06 |
| 12 | 5 | [F09 · Weekly and monthly reports](12-f09-weekly-monthly-reports/README.md) | US-039 – US-043, US-073 | F04, F05, F07, F08 |
| 13 | 6 | [F10 · Student and Parent access](13-f10-student-parent-access/README.md) | US-044 – US-046 | F09 |
| 14 | 6 | [F14 · Excel import and export](14-f14-excel-import-export/README.md) | US-058 – US-061 | F03, F05, F09 |
| 15 | 6 | [F15 · Analytics and AI recommendations](15-f15-analytics-ai/README.md) | US-062 – US-065 | F09 |
| 16 | 7 | [F13 · PDF and print](16-f13-pdf-print/README.md) | US-055 – US-057 | F09, F10 |
| 17 | 7 | [F16 · Notifications](17-f16-notifications/README.md) | US-066 – US-067 | F01, F10 |

**Order:** folders are numbered in dependency order, so parents come before the features that depend on them (`01-f01-…` to `17-f16-…`). Build in the same order; it follows SRS §12. Features on the same level do not depend on each other and can be built in parallel. **Cycle note:** F05 (Daily Hifz entry) and F07 (Mistakes and quality) list each other. F05 comes first because mistakes and quality are fields inside Daily Entry; F07 then adds their rules and validation.

## All specs

| Spec | Story | Feature | Detailed criteria |
|---|---|---|---|
| [SPEC-US-001](01-f01-identity-authentication/us-001-sign-in-with-user-id.md) | US-001 — Sign in with User ID | F01 | 7 |
| [SPEC-US-002](01-f01-identity-authentication/us-002-recover-password-by-email-otp.md) | US-002 — Recover password by email OTP | F01 | 6 |
| [SPEC-US-003](01-f01-identity-authentication/us-003-admin-creates-accounts.md) | US-003 — Admin creates accounts | F01 | 4 |
| [SPEC-US-004](01-f01-identity-authentication/us-004-admin-sets-initial-passwords.md) | US-004 — Admin sets initial passwords | F01 | 4 |
| [SPEC-US-005](01-f01-identity-authentication/us-005-use-shared-email-safely.md) | US-005 — Use shared email safely | F01 | 2 |
| [SPEC-US-006](01-f01-identity-authentication/us-006-separate-accounts-per-madrasa.md) | US-006 — Separate accounts per madrasa | F01 | 3 |
| [SPEC-US-071](01-f01-identity-authentication/us-071-manage-my-profile.md) | US-071 — Manage my profile | F01 | 3 |
| [SPEC-US-072](01-f01-identity-authentication/us-072-use-two-factor-sign-in-as-owner-or-admin.md) | US-072 — Use two-factor sign-in as Owner or Admin | F01 | 5 |
| [SPEC-US-047](02-f11-localization-accessibility/us-047-use-english-interface.md) | US-047 — Use English interface | F11 | 5 |
| [SPEC-US-048](02-f11-localization-accessibility/us-048-use-urdu-interface.md) | US-048 — Use Urdu interface | F11 | 4 |
| [SPEC-US-049](02-f11-localization-accessibility/us-049-use-roman-urdu-interface.md) | US-049 — Use Roman Urdu interface | F11 | 2 |
| [SPEC-US-050](02-f11-localization-accessibility/us-050-preserve-quran-arabic-text.md) | US-050 — Preserve Quran Arabic text | F11 | 3 |
| [SPEC-US-007](03-f02-organization-roles/us-007-create-madrasa-workspace.md) | US-007 — Create madrasa workspace | F02 | 7 |
| [SPEC-US-008](03-f02-organization-roles/us-008-restrict-teacher-scope.md) | US-008 — Restrict teacher scope | F02 | 5 |
| [SPEC-US-009](03-f02-organization-roles/us-009-audit-sensitive-changes.md) | US-009 — Audit sensitive changes | F02 | 4 |
| [SPEC-US-051](04-f12-offline-sync/us-051-save-daily-work-offline.md) | US-051 — Save daily work offline | F12 | 6 |
| [SPEC-US-052](04-f12-offline-sync/us-052-sync-queued-changes.md) | US-052 — Sync queued changes | F12 | 7 |
| [SPEC-US-053](04-f12-offline-sync/us-053-see-sync-status.md) | US-053 — See sync status | F12 | 3 |
| [SPEC-US-054](04-f12-offline-sync/us-054-resolve-conflicting-edits.md) | US-054 — Resolve conflicting edits | F12 | 4 |
| [SPEC-US-068](05-f17-security-audit-admin/us-068-enforce-tenant-isolation.md) | US-068 — Enforce tenant isolation | F17 | 5 |
| [SPEC-US-069](05-f17-security-audit-admin/us-069-review-audit-history.md) | US-069 — Review audit history | F17 | 5 |
| [SPEC-US-070](05-f17-security-audit-admin/us-070-protect-account-recovery.md) | US-070 — Protect account recovery | F17 | 4 |
| [SPEC-US-010](06-f03-classes-students/us-010-create-and-maintain-classes.md) | US-010 — Create and maintain classes | F03 | 6 |
| [SPEC-US-011](06-f03-classes-students/us-011-create-student-profiles.md) | US-011 — Create student profiles | F03 | 9 |
| [SPEC-US-012](06-f03-classes-students/us-012-enroll-students.md) | US-012 — Enroll students | F03 | 4 |
| [SPEC-US-024](07-f06-quran-portions-metadata/us-024-maintain-quran-metadata.md) | US-024 — Maintain Quran metadata | F06 | 6 |
| [SPEC-US-025](07-f06-quran-portions-metadata/us-025-select-para-and-ayat-range.md) | US-025 — Select Para and Ayat range | F06 | 3 |
| [SPEC-US-026](07-f06-quran-portions-metadata/us-026-use-15-line-mushaf.md) | US-026 — Use 15-line Mushaf | F06 | 3 |
| [SPEC-US-027](07-f06-quran-portions-metadata/us-027-select-portion-quantities.md) | US-027 — Select portion quantities | F06 | 7 |
| [SPEC-US-013](08-f04-calendar-attendance/us-013-configure-class-timetable.md) | US-013 — Configure class timetable | F04 | 2 |
| [SPEC-US-014](08-f04-calendar-attendance/us-014-manage-holidays-and-closures.md) | US-014 — Manage holidays and closures | F04 | 4 |
| [SPEC-US-015](08-f04-calendar-attendance/us-015-record-attendance-in-bulk.md) | US-015 — Record attendance in bulk | F04 | 9 |
| [SPEC-US-016](08-f04-calendar-attendance/us-016-request-leave.md) | US-016 — Request leave | F04 | 4 |
| [SPEC-US-017](08-f04-calendar-attendance/us-017-approve-leave.md) | US-017 — Approve leave | F04 | 4 |
| [SPEC-US-018](09-f05-daily-hifz-entry/us-018-create-individual-daily-report.md) | US-018 — Create individual daily report | F05 | 7 |
| [SPEC-US-019](09-f05-daily-hifz-entry/us-019-choose-daily-report-mode.md) | US-019 — Choose daily report mode | F05 | 4 |
| [SPEC-US-020](09-f05-daily-hifz-entry/us-020-record-sabaq.md) | US-020 — Record Sabaq | F05 | 1 |
| [SPEC-US-021](09-f05-daily-hifz-entry/us-021-record-sabqi-portions.md) | US-021 — Record Sabqi portions | F05 | 2 |
| [SPEC-US-022](09-f05-daily-hifz-entry/us-022-record-manzil-portions.md) | US-022 — Record Manzil portions | F05 | 2 |
| [SPEC-US-023](09-f05-daily-hifz-entry/us-023-record-repeated-attempts.md) | US-023 — Record repeated attempts | F05 | 3 |
| [SPEC-US-028](10-f07-mistakes-quality/us-028-record-mistake-categories.md) | US-028 — Record mistake categories | F07 | 5 |
| [SPEC-US-029](10-f07-mistakes-quality/us-029-set-mistake-severity.md) | US-029 — Set mistake severity | F07 | 1 |
| [SPEC-US-030](10-f07-mistakes-quality/us-030-flag-repeated-mistakes.md) | US-030 — Flag repeated mistakes | F07 | 1 |
| [SPEC-US-031](10-f07-mistakes-quality/us-031-rate-quality-1-5.md) | US-031 — Rate quality 1–5 | F07 | 6 |
| [SPEC-US-032](10-f07-mistakes-quality/us-032-set-overall-performance-label.md) | US-032 — Set overall performance label | F07 | 2 |
| [SPEC-US-033](11-f08-homework-carry-forward/us-033-create-structured-homework.md) | US-033 — Create structured homework | F08 | 2 |
| [SPEC-US-034](11-f08-homework-carry-forward/us-034-calculate-remaining-work.md) | US-034 — Calculate remaining work | F08 | 2 |
| [SPEC-US-035](11-f08-homework-carry-forward/us-035-suggest-carry-forward.md) | US-035 — Suggest carry-forward | F08 | 3 |
| [SPEC-US-036](11-f08-homework-carry-forward/us-036-review-homework-suggestion.md) | US-036 — Review homework suggestion | F08 | 3 |
| [SPEC-US-037](11-f08-homework-carry-forward/us-037-confirm-next-assignment.md) | US-037 — Confirm next assignment | F08 | 5 |
| [SPEC-US-038](11-f08-homework-carry-forward/us-038-preserve-homework-history.md) | US-038 — Preserve homework history | F08 | 6 |
| [SPEC-US-039](12-f09-weekly-monthly-reports/us-039-view-weekly-report.md) | US-039 — View weekly report | F09 | 9 |
| [SPEC-US-040](12-f09-weekly-monthly-reports/us-040-view-monthly-report.md) | US-040 — View monthly report | F09 | 3 |
| [SPEC-US-041](12-f09-weekly-monthly-reports/us-041-separate-attendance-and-performance.md) | US-041 — Separate attendance and performance | F09 | 3 |
| [SPEC-US-042](12-f09-weekly-monthly-reports/us-042-show-leave-and-normal-absence.md) | US-042 — Show leave and normal absence | F09 | 1 |
| [SPEC-US-043](12-f09-weekly-monthly-reports/us-043-show-portion-level-outcomes.md) | US-043 — Show portion-level outcomes | F09 | 1 |
| [SPEC-US-073](12-f09-weekly-monthly-reports/us-073-view-class-summary-report.md) | US-073 — View class summary report | F09 | 3 |
| [SPEC-US-044](13-f10-student-parent-access/us-044-student-views-own-reports.md) | US-044 — Student views own reports | F10 | 8 |
| [SPEC-US-045](13-f10-student-parent-access/us-045-parent-views-linked-student-reports.md) | US-045 — Parent views linked student reports | F10 | 5 |
| [SPEC-US-046](13-f10-student-parent-access/us-046-protect-private-teacher-notes.md) | US-046 — Protect private teacher notes | F10 | 4 |
| [SPEC-US-058](14-f14-excel-import-export/us-058-import-student-workbook.md) | US-058 — Import student workbook | F14 | 7 |
| [SPEC-US-059](14-f14-excel-import-export/us-059-import-daily-records.md) | US-059 — Import daily records | F14 | 5 |
| [SPEC-US-060](14-f14-excel-import-export/us-060-preview-import-changes.md) | US-060 — Preview import changes | F14 | 6 |
| [SPEC-US-061](14-f14-excel-import-export/us-061-export-authorized-data.md) | US-061 — Export authorized data | F14 | 4 |
| [SPEC-US-062](15-f15-analytics-ai/us-062-view-deterministic-analytics.md) | US-062 — View deterministic analytics | F15 | 3 |
| [SPEC-US-063](15-f15-analytics-ai/us-063-receive-ai-recommendations.md) | US-063 — Receive AI recommendations | F15 | 7 |
| [SPEC-US-064](15-f15-analytics-ai/us-064-configure-ai-provider-and-limits.md) | US-064 — Configure AI provider and limits | F15 | 4 |
| [SPEC-US-065](15-f15-analytics-ai/us-065-control-ai-data-sharing.md) | US-065 — Control AI data sharing | F15 | 4 |
| [SPEC-US-055](16-f13-pdf-print/us-055-generate-professional-pdf.md) | US-055 — Generate professional PDF | F13 | 6 |
| [SPEC-US-056](16-f13-pdf-print/us-056-customize-report-template.md) | US-056 — Customize report template | F13 | 5 |
| [SPEC-US-057](16-f13-pdf-print/us-057-apply-report-permissions-to-pdf.md) | US-057 — Apply report permissions to PDF | F13 | 3 |
| [SPEC-US-066](17-f16-notifications/us-066-receive-android-push-notifications.md) | US-066 — Receive Android push notifications | F16 | 8 |
| [SPEC-US-067](17-f16-notifications/us-067-manage-notification-preferences.md) | US-067 — Manage notification preferences | F16 | 4 |
