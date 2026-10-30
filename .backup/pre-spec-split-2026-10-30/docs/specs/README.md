# HifzAmanah feature specs

Each spec follows [`_TEMPLATE.md`](../../_TEMPLATE.md) and covers one epic from [`user-stories.md`](../../user-stories.md).

- **Acceptance criteria** are written as Given/When/Then, tagged with their story (e.g. `(US-015)`). Each criterion becomes a test named `F<n>-AC<k> (US-xxx)`.
- **Status:** all specs are **draft**. A spec moves to *ready for tickets* when its open questions are answered.
- **Completion:** a spec is complete only when `npm run e2e:gate -- F<nn>` passes. That means every criterion has an E2E test in [`e2e/`](../../e2e/README.md), none is pending, and all of them pass.
- **Test file paths** follow the proposed layout in [ARCHITECTURE.md §4](../../ARCHITECTURE.md) and may change at scaffolding time.

| Spec | Feature | Stories | Depends on |
|---|---|---|---|
| [F01](F01-identity-authentication.md) | Identity and authentication | US-001 – US-006 | — |
| [F02](F02-organization-roles.md) | Organization and roles | US-007 – US-009 | F01 |
| [F03](F03-classes-students.md) | Classes and students | US-010 – US-012 | F02 |
| [F04](F04-calendar-attendance.md) | Calendar and attendance | US-013 – US-017 | F03, F12 |
| [F05](F05-daily-hifz-entry.md) | Daily Hifz entry | US-018 – US-023 | F03, F06, F07, F12 |
| [F06](F06-quran-portions-metadata.md) | Quran portions and metadata | US-024 – US-027 | F02 |
| [F07](F07-mistakes-quality.md) | Mistakes and quality | US-028 – US-032 | F05 |
| [F08](F08-homework-carry-forward.md) | Homework and carry forward | US-033 – US-038 | F05, F06 |
| [F09](F09-weekly-monthly-reports.md) | Weekly and monthly reports | US-039 – US-043 | F04, F05, F07, F08 |
| [F10](F10-student-parent-access.md) | Student and Parent access | US-044 – US-046 | F09 |
| [F11](F11-localization-accessibility.md) | Localization and accessibility | US-047 – US-050 | — (cross-cutting) |
| [F12](F12-offline-sync.md) | Offline and synchronization | US-051 – US-054 | F01, F02 |
| [F13](F13-pdf-print.md) | PDF and print | US-055 – US-057 | F09, F10 |
| [F14](F14-excel-import-export.md) | Excel import and export | US-058 – US-061 | F03, F05, F09 |
| [F15](F15-analytics-ai.md) | Analytics and AI recommendations | US-062 – US-065 | F09 |
| [F16](F16-notifications.md) | Notifications | US-066 – US-067 | F01, F10 |
| [F17](F17-security-audit-admin.md) | Security, audit, and administration | US-068 – US-070 | F01, F02 |

**Suggested build order** (follows SRS §12): F01 → F02 → F11 → F03 → F12 → F04 → F06 → F05 → F07 → F08 → F09 → F17 → F10 → F13 → F14 → F15 → F16.
