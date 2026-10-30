# AGENTS.md — HifzAmanah

Instructions for AI coding agents (Claude Code, Codex, Cursor, Copilot, etc.) working in this repository.

## 1. Project status — read first

- HifzAmanah is an **Android-first, offline-capable Hifz (Quran memorization) management app** for teachers, madaris, students, and parents.
- The repository is currently **planning only. No code exists yet.**
- **Do not scaffold, write, or change application code unless the user explicitly asks you to start implementation** (SRS §3.4, §12, §14). Editing planning documents is allowed when asked.
- When implementation starts, follow the phase order in `SRS.md` §12 unless the user says otherwise.

## 2. Source of truth (highest wins)

1. `SRS.md` **§17 — Decision register** (review of 2026-10-30) and **§16 — Consolidated finalized decisions**. Both supersede anything older. The Q&A history is in `decision-log.md`.
2. `SRS.md` body (FR-*/NFR-* requirements, §9 business rules, §10 acceptance tests)
3. `user-stories.md` (US-001…US-073, 197 acceptance criteria)
4. `ARCHITECTURE.md` (how to build it; every former "Proposed" item and ADR-001…013 is approved)
5. `design.md` (UI/UX, tokens, components, screens; §11 records the closed decisions, §13 maps stories to screens)

**If the documents conflict, or a needed decision is missing or marked Deferred (SRS §17.3), stop and ask the user.** Never quietly pick a value and treat it as approved. If you must leave a placeholder, make it configurable and mark it `// DEFERRED: <DEC-ID>` in code.

Two decisions are Deferred:
- **The Android application ID** (DEC-B55).
- **The AI provider vendor** (DEC-B45, Phase 7).

Always cite requirement IDs (e.g. `FR-HW-012`, `US-037`) in PR descriptions, ADRs, and test names.

## 3. Tech stack

| Layer | Decided | Approved 2026-10-30 (SRS §17 DEC-B51; changes need a new ADR) |
|---|---|---|
| Mobile | React Native + Expo, Android , SQLite on device | TypeScript strict, expo-sqlite + Drizzle, React Navigation, TanStack Query, i18next |
| API | Node.js, PostgreSQL, HTTPS | TypeScript, Fastify, Zod, Drizzle/Kysely, pg-boss, Argon2id |
| Files | — | exceljs (Excel), Playwright/Chromium (PDF), AWS S3 |
| Platform | — | AWS Mumbai, Amazon SES (OTP email), Expo Push Service, auth built into the API with TOTP 2FA for Owner/Admin |
| Tests | — | Vitest, fast-check, Testcontainers, Maestro |

**Approved layout** (`ARCHITECTURE.md` §4): `apps/mobile`, `apps/api`, `packages/domain` (pure rules, no I/O), `packages/contracts` (Zod schemas), `packages/i18n-keys`, `docs/adr`.

## 4. Commands

Only test commands exist so far. **Update this section when the project is scaffolded** with dev, lint, typecheck, integration test, migration, and build commands. Do not guess commands that don't exist.

| Task | Command |
|---|---|
| Install | `npm install` |
| Unit tests (Vitest) | `npm test` |
| Unit tests, watch mode | `npm run test:watch` |
| E2E traceability (every criterion has an E2E test) | `npm run e2e:trace` |
| **Spec completion gate** (one story spec) | `npm run e2e:gate -- US-022` |
| Feature gate (every story in a feature) | `npm run e2e:gate -- F05` |
| Release gate (app-wide E2E) | `npm run e2e:gate -- APP` |
| API E2E (Playwright Test) | `E2E_API_URL=<url> npm run e2e:api` |
| Mobile E2E (Maestro; needs the Maestro CLI and an emulator) | `npm run e2e:mobile -- -e APP_ID=<android application id>` |
| Docs traceability (one story per spec, verbatim criteria, requirement IDs, links) | `npm run docs:check` |

**Specs are one per user story:** `docs/specs/<order>-<feature>/us-<nnn>-<title>.md`, indexed in `docs/specs/README.md`. Folders are numbered in dependency order (parents first), for example `09-f05-daily-hifz-entry`. Each feature folder's README holds feature-wide context, edge cases, and open questions.

Unit tests and E2E tests were written ahead of implementation and cite their spec acceptance criterion (`F<nn>-AC<k> (US-xxx)`). Unit tests are `it.todo`. API E2E tests are `test.fixme`, and mobile flows are tagged `pending`.

**A spec is not complete until `npm run e2e:gate -- US-<nnn>` passes.** That means no pending E2E tests, and every API test and mobile flow for that story passing. See `e2e/README.md`.

## 5. Non-negotiable domain rules

Breaking any of these is a bug, even if a test or UI mock seems to want it.

**Sections and portions**
1. Sabaq, Sabqi, and Manzil are **independent sections**. Sabqi and Manzil can hold **multiple Para portions**, each with its own quantity, status, mistakes, quality, and remarks. One portion's outcome never changes another's.

**Quantities**
2. A quantity always has a unit. Store it as `(unit, numerator, denominator)`, **never as a float**.
   - Units: `PARA`, `LINES`, `AYAT`, `PAGES`.
   - Rubu = 1/4, Half = 1/2, **Salasah = 3/4**, Complete = 1 Para.
3. `remaining = max(0, assigned − completed)`, computed **only for the same portion and the same unit**. Never add or compare incompatible units. There is no unit conversion.
4. `completed ≤ assigned` on every portion. Record extra work as a separate **Extra** portion (FR-QTY-006). `LINES`, `AYAT`, and `PAGES` are whole numbers.

**Statuses and attempts**
5. Statuses: `COMPLETED`, `PARTIAL`, `NOT_REMEMBERED`, `ABSENT`, `NOT_ASSIGNED`, `PENDING`.
   - `NOT_REMEMBERED` defaults completed to 0.
   - `ABSENT`, `NOT_ASSIGNED`, and `PENDING` are **never** failure and **never** zero quality.
6. **Missing data is not zero.** Quality is an optional integer **1–5**; null means "not recorded" and is excluded from averages. A missing mistake count is unknown, not 0. Only an explicit "No mistakes" choice stores 0 (FR-ATT-011).
7. **Quality Rating Scale** (approved, SRS FR-ATT-009). **Lower is better:**

   | Score | English | Urdu | Roman Urdu |
   |---|---|---|---|
   | 1 | Excellent | ممتاز | Mumtaz |
   | 2 | Good | اچھا | Achha |
   | 3 | Average | اوسط | Ausat |
   | 4 | Needs Improvement | مزید محنت کی ضرورت | Mazeed mehnat ki zaroorat |
   | 5 | Weak | کمزور | Kamzor |

   - Store only the integer score and show it as number + localized label, using this one mapping everywhere.
   - An average keeps its exact value and shows the label of the nearest whole score; .5 rounds up (1.5 → 2 Good). A falling average means improvement. Do not write "higher is better" logic anywhere.
   - Only the teacher sets it; never assign it automatically or by AI.
   - The overall performance label (Excellent / Good / Average / Needs Improvement) is a **separate** field. Never derive one from the other.
8. Mistake categories: Harkaat, Tajweed, Lafzi, Ayat bhoolna, Tarteeb, Waqf/Ibtida. Severity is Minor/Major. `repeated` is a separate boolean, **not a severity**.
9. Attempts are append-only history. Reports use the **latest attempt per portion** for current progress and never double-count repeated attempts.

**Attendance**
10. Attendance is stored **separately** from performance.
    - **Statuses:** `PRESENT`, `LATE`, `HALF_DAY`, `LEAVE`, `ABSENT` (FR-CAL-007).
    - **Counting:** attended = Present + Late + Half day. Approved Leave is its own count. Absent and rejected Leave are normal absences.
    - **Bulk Entry is attendance-only.** It offers the five statuses and has no Hifz, quality, or mistake fields.
    - **Unmarked students** are never saved silently. A "Mark them Absent / Go back" dialog decides (FR-CAL-010).
    - **Absent after reciting:** marking Absent for a student who already recited that day suggests Late. Keeping Absent needs an internal note (FR-DAY-010).
    - **Leave** replaces excused absence. A reason is required, and it is internal. Leave marked by a Teacher awaits Admin approval; Leave marked by an Owner/Admin is approved at once.
    - Hifz portions only for Present, Late, or Half day.
    - Holidays, closures, no-class days, and unscheduled dates are **never** absences. Records already saved on a date that later becomes a holiday are excluded from reports, never deleted.
    - Daily records are never for future dates.

**Homework**
11. Suggestions are `DRAFT` until a teacher **explicitly confirms** them. Confirmation stores who confirmed and when, runs in one transaction, and is audited.
    - Carry-forward eligibility is `PARTIAL` or `NOT_REMEMBERED` with remaining > 0. `ABSENT`, `NOT_ASSIGNED`, and `PENDING` are excluded.
    - Due date defaults to the next scheduled class day. Confirmed homework missed through Absent, Leave, or a holiday stays outstanding and is labelled "carried over". It is never failed, and the confirmed record is never edited (FR-HW-016).
    - Confirmation may happen offline. The server re-checks the source on sync, and a changed source becomes a conflict (FR-HW-017).
12. Source edits recalculate **drafts** and **derived reports** only. **Confirmed homework is never silently changed**; it changes only through an explicit, audited revision **by an Owner or Admin** (FR-HW-012). Old homework is never overwritten.

**Reports**
13. Reports are **derived from source records**, never stored as editable totals.
    - Timezone defaults to `Asia/Karachi` and weeks start on Monday (org-configurable).
    - `report_date` is a calendar date chosen by the teacher. It is separate from save time and sync time.
14. Daily-report mode is set by the Admin: `SINGLE` (default; one per student/date) or `MULTI_SESSION` (needs `session_label`).
15. Students and Parents see only **published** reports. A Teacher (assigned classes) or Admin publishes after the period is fully synced (FR-RPT-010). The visible field set is FR-PORT-006.

**Quran metadata**
16. Quran metadata (Surah/Ayat/Para) is Admin-managed per organization, starting from a reviewed seed (FR-SAB-007). MVP supports the **standard 15-line Mushaf only**. Metadata edits never change existing records; invalid ranges are flagged for review.

## 6. Security and privacy rules

- **Every** protected operation is authorized **server-side** against the active organization, role, and scope:
  - Teacher → assigned classes/students only, or every class with the "all classes" flag (FR-SEC-003). Teachers add/edit/import students only in assigned classes; they never deactivate or move students, revise confirmed homework, or see others’ audit entries.
  - The approved role/permission matrix is SRS §17.1. Only the Owner adds or removes Admins.
  - Student → self only
  - Parent → verified, non-revoked linked students only
- Take `organization_id` from the authenticated membership, **never** from the request body, URL, or an Excel file. Load every record with an org filter and return 404 on mismatch.
- **Never trust client-sent totals, roles, visibility, or org IDs.** Recompute on the server.
- **Internal teacher notes** must never reach Student or Parent audiences: API, app, PDF, Excel, push, or AI. All outbound data goes through the single `projectFor(audience, …)` projection. Add a test for every new outbound channel.
- **Login** is by `login_id` + password; email is never a login identifier.
  - Password recovery: the user gives their `login_id`; an OTP goes to that account's email. The OTP is hashed, time-limited, rate-limited, and the reset is audited.
  - Student and Parent can share an email but have separate accounts.
  - There is no forced password change on first login.
  - Passwords are 8–64 characters with no composition rules; common passwords and the User ID are rejected (FR-AUTH-012). User IDs are global and case-insensitive (FR-AUTH-013).
  - Owner and Admin must use TOTP two-factor sign-in with 10 hashed one-time recovery codes (FR-AUTH-016). The device app lock is required for Owner/Admin (NFR-OFF-011).
- **Never log** passwords, OTPs, tokens, secrets, or note bodies. Never commit secrets. AI keys live **only on the server**.
- Use synthetic data only in tests, seeds, fixtures, and screenshots. Never use real student data.
- **Audit** sensitive changes in the same transaction as the change (see `ARCHITECTURE.md` §15 for the list).

## 7. Offline and sync rules (Teacher/Admin)

- Write the entity **and** its outbox operation in **one SQLite transaction** before showing "Saved on device".
- Show "Synced" **only** after the server acknowledges the operation. Keep these states distinct: pending, syncing, synced, failed, action-required.
- Offline-creatable entities use **client-generated UUIDv7** IDs. Every operation has an `op_id`; replaying it must not create duplicates.
- **Never use last-write-wins** for attempts, attendance, quantities, quality, mistakes, or homework. Preserve both versions as a conflict for explicit resolution.
- Local schema migrations must keep the outbox intact. Test them with pending operations.
- On access revocation, stop syncing that workspace and lock its cached data.
- Student and Parent experiences are **online-only and read-only**.

## 8. Localization rules

- Locales: `en` (LTR), `ur` (Urdu script, **RTL**), `ur-Latn` (Roman Urdu, LTR).
- Every user-facing string goes through i18n keys and must exist in all three locales. This includes validation, empty states, PDF, Excel, and push text.
- **Stored values are canonical and language-neutral** (e.g. `NOT_REMEMBERED`). Localize labels only.
- Switching language must **not** discard unsaved form data or change stored values. Prefer in-place direction switching over `I18nManager.forceRTL` reloads.
- **Never translate, transliterate, normalize, or "fix" Quranic Arabic text** or approved Surah/Ayat labels. Use bidi isolation for mixed Arabic/Latin/number ranges.

## 9. AI feature rules

- AI is **online-only, advisory, and Admin-configurable**: provider, on/off, usage limits, and data categories.
- Requests are built from **deterministic metrics**, minimized and pseudonymized. No names, contact details, or notes are sent by default.
- AI code has **no write access** to records. It cannot create or confirm homework, change scores, or make access decisions.
- Validate AI output against a schema and check that cited numbers exist in the input. Label it in the UI as AI suggestion, separate from calculated metrics.
- Offline, timeout, budget exhaustion, or a disabled setting must degrade gracefully and never block entry, sync, or reports.

## 10. Excel rules

- `.xlsx` only, versioned templates (`Students`, `DailyRecords`, SRS §15.1), **max 1,000 rows per file**.
- Process each import in this order:
  1. Validate.
  2. Show a preview that classifies each row as new, exact match, suspected duplicate, invalid, or proposed update.
  3. Get explicit confirmation.
  4. Commit in bounded batches.
- Imports are **add-new-only by default**. Updates require a stable external key, an explicit update mode, and a before/after preview. **Never match by name alone.**
- Read workbook content as data only; never evaluate formulas or macros. On export, escape cells starting with `= + - @ \t \r`.

## 11. UI rules (from `design.md`)

- Use the design tokens from `design.md` §2. Do not hard-code colors, spacing, or radii.
- Status must be shown with **text and icon**, never color alone. Touch targets are ≥ 44 dp (48 dp preferred). Support font scaling.
- Every screen needs loading, empty, success, error, offline, and permission-revoked states (`design.md` §8).
- UI components must not own business calculations. Call `packages/domain`.

## 12. Code conventions (apply once code exists)

- TypeScript strict. No `any` in domain or contracts code.
- Domain rules live in `packages/domain` as **pure functions** with exhaustive unit tests. API services and the app call them. Do not re-implement them inline.
- Validate input with shared Zod schemas from `packages/contracts`.
- Make schema changes only through **versioned migrations**. No cascading deletes into history or audit tables; deactivate instead of deleting.
- Use transactions for bulk writes, homework confirmation, and imports.
- Paginate lists. Avoid N+1 queries in reports.
- Keep module boundaries (`ARCHITECTURE.md` §5). Modules talk through service interfaces, not each other's tables.

## 13. Testing expectations

Every change to domain logic, authorization, sync, homework, reports, Excel, or i18n needs tests.

- **Domain:** cover every relevant `AC-*` case from SRS §10 (quantity, status, homework, report, timezone/week boundaries).
- **Authorization:** role × endpoint matrix tests, plus cross-tenant ID-probing tests (AC-SEC-01…05).
- **Privacy:** an internal-note leak test for each outbound channel.
- **Sync:** replay/idempotency, ordering, conflict, and revocation tests.
- **i18n:** a missing-key check and RTL rendering checks.

Report test results honestly. If something was not run, say so.

## 14. Definition of done

- The requirement IDs and user stories covered are listed.
- The rules in §5–§10 still hold. No decision was made silently, and Deferred items (SRS §17.3) remain deferred until the user decides.
- Tests are added or updated and passing. Lint and typecheck are clean.
- All three locales are updated for any new strings.
- Audit events are added for any new sensitive action.
- Docs are updated: `ARCHITECTURE.md` and an ADR for architectural changes, and this file when commands or conventions change.

## 15. Don'ts

- Don't add email, SMS, or WhatsApp notifications (Android push only in MVP).
- Don't build a web portal, audio grading, public profiles, or multi-Mushaf support (out of MVP scope).
- Don't add Hifz fields to Bulk Entry.
- Don't auto-confirm homework or let AI touch records.
- Don't treat missing data, absence, or pending work as zero or failure.
- Don't store quantities as floats or add different units.
- Don't put secrets, real student data, or note contents in code, logs, fixtures, or commits.

## Git Branching Rules
- Create a separate feature branch for every new feature or task (e.g., `feature/student-management`).
- Never develop features directly on the `main` branch.
- After completing and testing a feature, merge its branch into `main` through a Pull Request.
- Keep `main` stable and free from incomplete or untested changes.
- Do not merge or push changes without the user's approval.