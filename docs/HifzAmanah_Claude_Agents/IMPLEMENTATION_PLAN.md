# HifzAmanah Implementation Plan

Build order follows the specs in [`docs/specs/`](../specs/README.md). Their `<NN>` prefixes (`01-…` to `17-…`) are the authoritative feature order. Phases group those features under the SRS §12 phase names. Do not rename, renumber, or reorder specs to fit this plan; if the plan and the specs disagree, the specs win and this plan is corrected.

Each phase is a gate. Do not start a phase until the previous phase's feature gates pass, unless the user explicitly approves a dependency-independent task. Features on the same dependency level (specs README, "Level" column) do not depend on each other and may be built in parallel.

## Source of truth (highest wins)

1. `SRS.md` §17 (decision register, 2026-10-30) and §16 (consolidated finalized decisions)
2. `SRS.md` body: FR-*/NFR-* requirements, §9 business rules, §10 acceptance tests
3. `user-stories.md` (US-001…US-073)
4. `ARCHITECTURE.md` (ADR-001…014 approved)
5. `design.md`
6. `docs/specs/` (one spec per story; acceptance criteria `F<nn>-AC<k>`)
7. `docs/AGENTS.md`, `CLAUDE.md`, and `agents/*.md` (workflow and guardrails)

If documents conflict, or a needed decision is missing or Deferred, stop and ask the user.

## Gates and commands

| Gate | Command | When |
|---|---|---|
| Story | `npm run e2e:gate -- US-<nnn>` | A story spec is complete only when this reports `PASS` |
| Feature | `npm run e2e:gate -- F<nn>` | Before a feature's branch is merged |
| Release | `npm run e2e:gate -- APP` | Phase 9 |
| Traceability | `npm run e2e:trace`, `npm run docs:check` | Every change touching specs or tests |
| Unit | `npm test` | Every change |

The tests already exist ahead of implementation and cite their criterion: unit tests are `it.todo`, API E2E tests are `test.fixme`, and Maestro flows are tagged `pending`. Implementing a story means turning its tests into real, passing tests. Do not delete or weaken a test to make a gate pass.

## Branching

- One feature branch per feature or task, e.g. `feature/f05-daily-hifz-entry`. Never develop on `main`.
- Merge into `main` through a Pull Request only after the feature gate passes and the user approves.
- PR descriptions cite requirement IDs, story IDs, and spec IDs.

---

## Phase 0: Requirements and design lock (closed)

All SRS §13 gates and design.md §11 items were closed on 2026-10-30 (SRS §17). `SRS.md` §17 supersedes `OPEN_DECISIONS.md` in this pack.

Still open (SRS §17.3):

| Item | Type | Effect on the plan |
|---|---|---|
| DEC-B55: Android application ID | Approved (decided 2026-11-08) | `com.hifzamanah.app`, set in `apps/mobile/app.config.ts` and every flow's `appId`. |
| DEC-B45: AI provider vendor | Deferred | Blocks the AI parts of F15 (US-063…065) only. Decide it through the FR-AI-012 comparison at the start of Phase 7. |
| DEC-B31: Quran metadata reviewer | Product-owner action | Needed before the F06 seed is approved for production. |
| DEC-B39: glossary approval | Product-owner action | Needed before Urdu and Roman Urdu strings are final (F11). |
| DEC-B44: legal confirmation of retention | Product-owner action | Needed before launch (Phase 9). |

---

## Phase 1: Foundation

Specs `01`–`05`.

| Order | Level | Feature | Stories | Depends on |
|---|---|---|---|---|
| 01 | 0 | [F01 Identity and authentication](../specs/01-f01-identity-authentication.md) | US-001…006, US-071, US-072 | — |
| 02 | 0 | [F11 Localization and accessibility](../specs/02-f11-localization-accessibility.md) | US-047…050 | — (cross-cutting) |
| 03 | 1 | [F02 Organization and roles](../specs/03-f02-organization-roles.md) | US-007…009 | F01 |
| 04 | 2 | [F12 Offline and synchronization](../specs/04-f12-offline-sync.md) | US-051…054 | F01, F02 |
| 05 | 2 | [F17 Security, audit, and administration](../specs/05-f17-security-audit-admin.md) | US-068…070 | F01, F02 |

Scope:
- Scaffold the approved monorepo (`ARCHITECTURE.md` §4): `apps/mobile`, `apps/api`, `packages/domain`, `packages/contracts`, `packages/i18n-keys`, `docs/adr`. Add lint, typecheck, build, migration, and integration-test scripts, then update `docs/AGENTS.md` §4 with the real commands.
- PostgreSQL migrations; organization, membership, and role model; RLS as defense-in-depth (ADR-006).
- Authentication built into the API (ADR-012): `login_id` + password, email OTP recovery through SES, TOTP 2FA and recovery codes for Owner/Admin, password rules FR-AUTH-012…016.
- Server-side authorization pipeline and the §17.1 role/permission matrix; tenant scope from membership only.
- Audit foundation (same-transaction audit events) and the `projectFor(audience, …)` projection (ADR-007).
- i18n framework for `en`, `ur` (RTL), `ur-Latn`; in-place direction switching (ADR-010); Quranic Arabic preserved.
- Device SQLite, durable outbox, UUIDv7 IDs, idempotent op-id sync, conflict store, sync status states (ADR-003, ADR-004).

Tests: tenant isolation and ID probing (AC-SEC-01…05), role × endpoint matrix, migration safety with pending outbox operations, sync replay/ordering/conflict/revocation, i18n missing-key and RTL checks.

## Phase 2: Classes, students, Quran metadata, and attendance

Specs `06`–`08`.

| Order | Level | Feature | Stories | Depends on |
|---|---|---|---|---|
| 06 | 2 | [F03 Classes and students](../specs/06-f03-classes-students.md) | US-010…012 | F02 |
| 07 | 2 | [F06 Quran portions and metadata](../specs/07-f06-quran-portions-metadata.md) | US-024…027 | F02 |
| 08 | 3 | [F04 Calendar and attendance](../specs/08-f04-calendar-attendance.md) | US-013…017 | F03, F12 |

Scope:
- Classes, teacher assignments, student profiles, enrollment history; deactivate instead of delete.
- Quran metadata: reviewed seed plus audited Admin edits per organization; 16-line Indo-Pak Mushaf only (DEC-B70); exact quantity service `(unit, numerator, denominator)` in `packages/domain/quantity`; Sabaq line rules (ADR-014). F06 sits in this phase because F05 depends on it.
- Timetable, holidays and closures, attendance-only Bulk Entry with the five statuses, the unmarked-students dialog, Leave request and approval.

Tests: assigned-class authorization, preservation on deactivation, quantity and range validation, timezone/week-start and holiday semantics, attendance counting.

## Phase 3: Daily Hifz recording

Specs `09`–`10`.

| Order | Level | Feature | Stories | Depends on |
|---|---|---|---|---|
| 09 | 3 | [F05 Daily Hifz entry](../specs/09-f05-daily-hifz-entry.md) | US-018…023 | F03, F06, F12 |
| 10 | 4 | [F07 Mistakes and quality](../specs/10-f07-mistakes-quality.md) | US-028…032 | F05 |

Scope:
- Individual daily report, `SINGLE` / `MULTI_SESSION` mode, Sabaq, multiple Sabqi and Manzil portions, statuses, append-only attempts, Extra portions, internal notes, absent-after-reciting rule.
- Mistake categories, severity, the separate `repeated` flag, quality 1–5 (lower is better), and the separate overall performance label.
- F05 and F07 reference each other. F05 comes first; F07 then adds the rules and validation for the fields inside Daily Entry.

Tests: every relevant SRS §10.1 and §10.2 case; missing data is unknown, not zero; `ABSENT`/`NOT_ASSIGNED`/`PENDING` are never failure.

## Phase 4: Structured homework

Spec `11`.

| Order | Level | Feature | Stories | Depends on |
|---|---|---|---|---|
| 11 | 4 | [F08 Homework and carry forward](../specs/11-f08-homework-carry-forward.md) | US-033…038 | F05, F06 |

Scope: homework assignment and portions, remaining-work calculation, carry-forward suggestions as `DRAFT`, review/edit/confirm in one audited transaction, offline confirmation with server re-check (FR-HW-017), carried-over homework (FR-HW-016), Owner/Admin-only audited revisions (FR-HW-012).

Tests: SRS §10.3; eligibility; source correction recalculates drafts only; confirmed homework is never silently changed.

## Phase 5: Reports

Spec `12`.

| Order | Level | Feature | Stories | Depends on |
|---|---|---|---|---|
| 12 | 5 | [F09 Weekly and monthly reports](../specs/12-f09-weekly-monthly-reports.md) | US-039…043, US-073 | F04, F05, F07, F08 |

Scope: weekly, monthly, and class summary reports derived from source records; latest attempt per portion; attendance separate from performance; Leave separate from normal absence; correction-driven recalculation; offline provisional reports with last-sync time; publishing (FR-RPT-010).

Tests: SRS §10.4; repeated attempts not double-counted; missing quality excluded from averages; compatible units only; holiday exclusion.

PDF and print are not in this phase. The specs place F13 at order 16 because it depends on F10.

## Phase 6: Student/Parent access and Excel

Specs `13`–`14`.

| Order | Level | Feature | Stories | Depends on |
|---|---|---|---|---|
| 13 | 6 | [F10 Student and Parent access](../specs/13-f10-student-parent-access.md) | US-044…046 | F09 |
| 14 | 6 | [F14 Excel import and export](../specs/14-f14-excel-import-export.md) | US-058…061 | F03, F05, F09 |

Scope:
- Online-only, read-only Student and Parent views of published reports; verified, non-revoked Parent links; visible field set FR-PORT-006; internal notes never leave through any channel.
- `.xlsx` templates (`Students`, `DailyRecords`) with `_meta` versioning, max 1,000 rows, validate → preview → confirm → commit in 200-row batches; add-new-only by default; no name-only matching; permission-filtered exports with formula-injection escaping.

Tests: internal-note leak test per channel, Parent link revocation, import idempotency and row errors, export permission filtering.

## Phase 7: Analytics and AI recommendations

Spec `15`.

| Order | Level | Feature | Stories | Depends on |
|---|---|---|---|---|
| 15 | 6 | [F15 Analytics and AI recommendations](../specs/15-f15-analytics-ai.md) | US-062…065 | F09 |

Scope:
- US-062 first: deterministic analytics and offline summaries. Not blocked.
- Then decide DEC-B45 with the user through the FR-AI-012 comparison. Until then, build US-063…065 only behind the provider adapter interface (`ARCHITECTURE.md` §12) with the vendor marked `// DEFERRED: DEC-B45`.
- Minimized, pseudonymized metrics; schema-validated, grounded output; no write access; Admin settings for on/off, limits, and data categories; timeout, budget, and offline fallback.

Tests: AI unavailable/offline/disabled never blocks entry, sync, or reports; no mutation; cited numbers exist in the input; privacy of sent fields.

## Phase 8: PDF, print, and notifications

Specs `16`–`17`.

| Order | Level | Feature | Stories | Depends on |
|---|---|---|---|---|
| 16 | 7 | [F13 PDF and print](../specs/16-f13-pdf-print.md) | US-055…057 | F09, F10 |
| 17 | 7 | [F16 Notifications](../specs/17-f16-notifications.md) | US-066…067 | F01, F10 |

Scope:
- Server-side PDF via headless Chromium (ADR-008) with the approved font stack and layout; template customization; audience projection applied to PDF.
- Android push only, through Expo Push Service (ADR-013); the approved event catalogue and consent; notification preferences. No email, SMS, or WhatsApp.

Neither feature depends on F15, so this phase may run in parallel with Phase 7 if the user approves.

Tests: PDF in all three locales including RTL and Quranic Arabic; note-leak tests for PDF and push; preference and consent handling.

## Phase 9: Hardening and launch

- Release gate `npm run e2e:gate -- APP` passes, including the journeys (`e2e/api/journeys`, `e2e/mobile/journeys`).
- Security and tenant-isolation review, localization/RTL, accessibility, performance targets (NFR-PERF-006), backups and restore, monitoring, staging acceptance, release and rollback plan.
- Blocked until DEC-B44 legal confirmation is received.
- No deployment, spending, provisioning, or production launch without explicit user approval.

---

## Definition of done for every story and feature

- Requirement IDs, story IDs, and spec IDs mapped in the PR.
- `npm run e2e:gate -- US-<nnn>` reports `PASS` for each story; `npm run e2e:gate -- F<nn>` passes before merge.
- Unit tests pass; lint and typecheck are clean; results of commands actually run are reported.
- Domain and security rules in `docs/AGENTS.md` §5–§10 still hold; no Deferred decision was resolved silently.
- All three locales updated for new strings; audit events added for new sensitive actions.
- Code review has no unresolved Blocker/High findings.
- Docs updated (`ARCHITECTURE.md` and an ADR for architectural changes; `docs/AGENTS.md` when commands change).
- No secrets, real student data, or unauthorized external side effects.
