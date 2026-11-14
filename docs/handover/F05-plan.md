# F05 · Daily Hifz entry — implementation plan

Branch `feature/f05-daily-hifz-entry` (from `feature/f06-quran-portions-metadata`). Specs: [09-f05](../specs/09-f05-daily-hifz-entry.md), US-018…023. Requirements: FR-DAY-001…011, FR-SAB-001…004, FR-SAB-008…010, FR-QTY-006…010, FR-SBQ-001…004, FR-MNZ-001…004, FR-ATT-001…008, FR-ATT-011. Data model: ARCHITECTURE §6.2–§6.4, §9.1. UI: design.md §4.7.

This page is the contract between the specialist roles. Anything not decided here or in the SRS is raised with the user, not guessed.

## 1. Scope and dependencies

| Depends on | What F05 uses |
|---|---|
| F03 roster | `daily.write` policy (Teacher → assigned classes, or all classes flag), enrollments (`eligibleForEntry`, `classOn`) |
| F04 calendar | attendance records (`attendance_record` sync entity). F05 replaces the stand-ins `noRecitedPortionsYet` and `noDailyRecordsYet` (`apps/api/src/modules/calendar/shared.ts`) and activates F04-AC19 |
| F06 quran-ref | `evaluateRange` / `validateAyahRange` / `paraFor` / `countLines`, `validateQuantities` (`packages/domain/quantity/sections.ts`), the offline reference cache and range fields on the device. F05 replaces `noRangeRecordsYet` (`quran-ref/metadata-service.ts`) with the Sabaq ranges of lesson portions (FR-SAB-007 review list) |
| F12 sync | every write is a sync operation (`POST /sync/push`), outbox on the device, conflicts, no last-write-wins |

**Not built in F05:** homework (F08), weekly/monthly reports (F09), mistake notes and the overall performance label (F07, US-028…032), note visibility toggle (F10, US-046), Bulk Entry Hifz fields (never).

### Criteria that cannot pass in F05 (precedent: F02-plan, F12-plan Q2/Q3)

| Criterion | Missing part | Treatment |
|---|---|---|
| F05-AC4 | draft homework (F08), weekly report total (F09) | Audit, change log, and the "Confirmed homework was not changed" notice are built. The E2E test stays `test.fixme` until F08/F09. |
| F05-AC19 | same as AC4 | Correction of a 90-day-old record is accepted and audited. E2E stays `test.fixme` until F08/F09. |
| F05-AC16 mobile step 3 ("Weekly report") | F09 | The API test uses the record detail's derived progress (the daily report). The mobile flow stays pending if its weekly-report step cannot run. |

So the expected F05 gate is **PENDING** (US-018, US-023), with US-019…022 able to pass.

## 2. Data model (migration `0012_hifz.sql`)

Follow `0007_roster.sql` / `0008_calendar.sql`: `organization_id` on every table, composite `(organization_id, id)` foreign keys, RLS enabled and forced with the tenant policy, no DELETE for any role, no `ON DELETE CASCADE`, `row_version bigint`.

- `daily_records(id uuid PK (client UUIDv7), organization_id, student_id, class_id, report_date date, session_label text NULL, recorded_by, client_saved_at timestamptz NULL, server_received_at timestamptz, created_at, updated_at, updated_by, row_version)`
  - `report_date` is the Teacher's calendar date; never changed by sync time (F05-AC1/AC2).
  - Partial unique index `(organization_id, student_id, report_date) WHERE session_label IS NULL`; unique `(organization_id, student_id, report_date, lower(session_label)) WHERE session_label IS NOT NULL` (ARCHITECTURE §6.4). SINGLE mode is also enforced by the service (any record on the date blocks a second one).
- `lesson_portions(id, organization_id, daily_record_id, section SABAQ|SABQI|MANZIL, position int, para_number smallint NULL, surah_start, ayah_start, surah_end, ayah_end (NULL for Sabqi/Manzil without range), is_extra bool, assigned_unit, assigned_num, assigned_den, total_lines int NULL, total_lines_source LAYOUT|MANUAL NULL, line_count_edition text NULL, removed_at NULL, removed_by NULL, created_at, updated_at, updated_by, row_version)`
  - CHECKs from ARCHITECTURE §6.3 (Sabaq: range NOT NULL, `surah_end = surah_start`, `ayah_start ≤ ayah_end`, unit `LINES`, `total_lines > 0`, `assigned_num ≤ total_lines`, edition NOT NULL, source NOT NULL; non-Sabaq: total_lines/source/edition NULL). `para_number` 1–30.
  - `total_lines_source` records whether Total Lines came from the layout or was entered/corrected by hand (FR-SAB-008).
  - A removed portion keeps its row and attempts (edge case "Teacher removes a portion that already has attempts").
- `portion_attempts(id, organization_id, lesson_portion_id, attempt_no int, attempted_at timestamptz (client time), recorded_by, completed_unit/num/den NULL, status, quality smallint NULL CHECK 1–5, no_mistakes bool DEFAULT false, remarks text NULL, remarks_visibility text DEFAULT 'INTERNAL' CHECK = 'INTERNAL' (F10 widens), created_at, updated_at, updated_by, row_version)`
  - UNIQUE `(organization_id, lesson_portion_id, attempt_no)`.
  - CHECK `quality IS NULL OR status IN ('COMPLETED','PARTIAL','NOT_REMEMBERED')` (FR-ATT-007; NOT_ASSIGNED/PENDING/ABSENT carry no quality).
  - CHECK `NOT (no_mistakes AND <has mistakes>)` is enforced in the handler; mistakes live in `attempt_mistakes`.
  - `remarks` is internal staff text: never logged, never in audit values, never sent to Student/Parent (`projectFor` already fails closed for them).
- `attempt_mistakes(id, organization_id, attempt_id, position, category HARKAAT|TAJWEED|LAFZI|AYAT_BHOOLNA|TARTEEB|WAQF_IBTIDA, severity MINOR|MAJOR, repeated bool)`; written only by the `portion_attempt` handler in the attempt's transaction. Mistake notes are F07.

## 3. Domain (`packages/domain/hifz`, pure, no I/O)

Exports (names indicative; keep them pure and exhaustively unit-tested; replace the 12 `it.todo` in `hifz.test.ts` with real tests, keeping their titles):

- `PORTION_STATUSES`, `NO_QUALITY_STATUSES = ABSENT|NOT_ASSIGNED|PENDING`, `isFailure(status)` (only `NOT_REMEMBERED`… is an unsuccessful recitation; `ABSENT`, `NOT_ASSIGNED`, `PENDING` never are).
- `normalizeAttempt({status, assigned, completed, quality})` → completed default: `NOT_REMEMBERED` with no completed → 0 in the assigned unit (FR-QTY-007, F05-AC14/AC22); `COMPLETED` with no completed → the assigned quantity; everything else keeps null (missing ≠ zero, FR-QTY-008). Quality on a no-quality status → issue `QUALITY_NOT_ALLOWED`.
- `validatePortion(portion, index, refIndex?)` → `PortionFieldError[]` of `{section, portionNumber, field, code}`, composing `validateQuantities` (section units, F05-AC20/AC22) and the Sabaq range rules (`validateAyahRange`, single Surah, start ≤ end, F05-AC21). Required fields: Sabaq → surah, ayahStart, ayahEnd, totalLines, assigned; Sabqi/Manzil → paraNumber, assigned (unit + amount), status always.
- `formatFieldError` data for the UI message "Sabqi · Portion 2: unit is required" (F05-AC3): the domain returns codes; the app maps them to i18n keys.
- `latestAttempt(attempts)` (highest `attempt_no`), `portionProgress(portion, attempts)` → `{currentStatus, assigned, completed, remaining, attemptCount}` with the assigned quantity counted once (F05-AC16, BR-16), remaining via `remaining()` same unit only.
- `sectionSummary(portions with attempts)` → per section, per portion (never collapsed, F05-AC13), totals grouped by unit only (no cross-unit sums), removed portions excluded.
- `sabqiDefaultPara(sabaqPortions)` → the derived Para of the current Sabaq, or null (F05-AC12, FR-SBQ-003). A default only; never forced.
- `portionsAllowed(attendanceStatus | null)` → `ALLOWED` for PRESENT/LATE/HALF_DAY; `CHANGE_TO_LATE` for ABSENT/LEAVE; `ATTENDANCE_REQUIRED` when unmarked (FR-DAY-011, F05-AC18).
- Report mode: `checkNewRecord(mode, existingOnDate[], sessionLabel)` → ok | `DUPLICATE_RECORD{existingId}` | `SESSION_LABEL_REQUIRED` | `SESSION_LABEL_NOT_ALLOWED` | `DUPLICATE_SESSION{existingId}`; `normalizeSessionLabel` (trim, case-insensitive compare, 1–`SESSION_LABEL_MAX` chars); `modeSwitchConflicts(records)` → student/date pairs with more than one record (F05-AC6…AC8).
- `isFutureDate(reportDate, todayInOrgTz)` (F05-AC17) — reuse the roster/calendar date helpers if they already exist.

## 4. Contracts (`packages/contracts/src/hifz.ts`, exported from the index)

- Enums: `PORTION_STATUSES`, `MISTAKE_CATEGORIES`, `MISTAKE_SEVERITIES`, `TOTAL_LINES_SOURCES = LAYOUT|MANUAL`, `HIFZ_FIELD_ISSUES` (codes), `SESSION_LABEL_MAX`, `REMARKS_MAX`, `MISTAKES_MAX`.
- Strict sync field schemas (handlers use them; unknown keys refused):
  - `DailyRecordCreateFields {studentId, classId, reportDate, sessionLabel|null, clientSavedAt?}`; `DailyRecordUpdateFields {sessionLabel}` (moving a record to another student/date is not supported).
  - `LessonPortionCreateFields {dailyRecordId, section, position, isExtra, paraNumber|null, range {surahStart, ayahStart, surahEnd, ayahEnd}|null, assigned Quantity, totalLines|null, totalLinesSource|null}` (the server derives Sabaq `paraNumber` and sets `line_count_edition`; a client-sent Sabaq Para is refused or ignored — never trusted). `LessonPortionUpdateFields` partial, plus `removed: true`.
  - `PortionAttemptCreateFields {lessonPortionId, attemptNo, attemptedAt, status, completed Quantity|null, quality 1–5|null, noMistakes, mistakes[{category, severity, repeated}], remarks|null}`; `PortionAttemptUpdateFields` partial (corrections; FR-DAY-009).
- REST:
  - `GET /hifz/daily-records?studentId&date` (and `from`/`to`, paginated) → list with id, date, session label, recorder, portion count.
  - `GET /hifz/daily-records/:id` → `DailyRecordDetail` (record, portions in section/position order, each with attempts history newest last, `progress` from the domain, `sectionSummary`).
  - `PUT /organization/daily-report-mode {mode}` → Owner/Admin only (SRS §17.1, F05-AC9 → 403 for Teacher); `409 MODE_CONFLICTS {conflicts:[{studentId, studentName, reportDate, sessionLabels[]}]}` (F05-AC8); audited `DAILY_REPORT_MODE_CHANGED`.

## 5. API (`apps/api/src/modules/hifz`)

- Sync handlers `daily_record`, `lesson_portion`, `portion_attempt` (registered like `attendanceSyncHandler`), each with `prepareCreate`/`prepareUpdate` doing: org from the actor only; `daily.write` scope on the record's class (404 out of scope); enrollment check (create: `eligibleForEntry`; correction: `classOn`); `report_date ≤ today` in the org timezone (F05-AC17); report-mode rules (F05-AC6/AC7) — a duplicate is REJECTED VALIDATION naming the existing record id; attendance for (student, date) must be PRESENT/LATE/HALF_DAY before a portion or attempt is created (F05-AC18: `ATTENDANCE_CHANGE_TO_LATE` for ABSENT/LEAVE, `ATTENDANCE_REQUIRED` when unmarked); Sabaq range validated against the org's active metadata and Para derived on the server (never guessed; with no metadata loaded the range is refused); domain `validatePortion`/`normalizeAttempt`.
- Attempts: CREATE never changes earlier attempts (F05-AC15); `attempt_no` unique per portion. UPDATE is an audited correction with F12 conflict detection (no last-write-wins on status, quantities, quality, mistakes).
- Audit in the same transaction for every create/edit/remove (`DAILY_RECORD_CREATED/UPDATED`, `LESSON_PORTION_CREATED/UPDATED/REMOVED`, `PORTION_ATTEMPT_CREATED/CORRECTED`), values only for non-sensitive fields; remarks by field name only.
- Edits of an existing record return / allow the client to show the notice "Confirmed homework was not changed" (F05-AC4); F08 hooks draft recalculation onto the change log.
- Replace F04/F06 stand-ins: `RecitedLookup` (a non-removed portion with an attempt on that student/date), `DailyRecordCounter`, `RangeRecordSource` (Sabaq ranges). Then turn F04-AC19 into a real test.
- Integration tests in `apps/api/test/hifz/*.test.ts` (Vitest + embedded Postgres): role × endpoint matrix, cross-tenant probes, replay idempotency, conflicts, RLS, audit, remarks never in logs/audit values.
- API E2E: replace the `test.fixme` in `e2e/api/f05-daily-entry.spec.ts` with real tests (all but AC4, AC19), using synthetic Quran data from test control only (never real metadata; the titles' Surah names refer to synthetic Surah numbers 1/2).

## 6. Mobile (`apps/mobile/src/features/daily-entry`)

- Local tables + outbox entities for the three entities; one SQLite transaction for entity rows + outbox ops before "Saved on this device"; "Synced" only after the server acknowledges.
- Daily Entry (design.md §4.7): context (date ≤ today in org timezone, class, student, session label only in MULTI_SESSION), attendance step (reuse F04's local attendance write), three section cards, add/remove portion (confirmation if it has attempts), Sabaq card with the F06 range fields (derived Para read-only, Total Lines pre-filled "From Mushaf layout" until changed, Assigned defaults to Total, Remaining read-only, no unit picker), Sabqi/Manzil cards (Para picker defaulting to the Sabaq Para, Rubu/Half/Salasah/Complete presets + Lines/Ayat/Pages), status chips with icon + text, quality 1–5 with the approved labels, mistakes list or "No mistakes", remarks (private to staff). Per-portion errors "Sabqi · Portion 2: unit is required", values kept; language switch keeps values.
- Record detail with attempt history (current attempt labelled), Add attempt, correct a portion (notice "Confirmed homework was not changed").
- Duplicate warning in SINGLE mode opens the existing record (F05-AC6). Absent/Leave → section cards replaced by "Change to Late" (F05-AC18).
- Owner/Admin: daily-report mode control in workspace settings with the conflict list (F05-AC8); none for Teachers (F05-AC9).
- All strings in `en`, `ur` (RTL), `ur-Latn`.

## 7. Assumptions to confirm (technical, reversible)

1. `SESSION_LABEL_MAX` = 40 characters, trimmed, compared case-insensitively.
2. `COMPLETED` with no completed quantity stores the assigned quantity (the UI pre-fills it visibly).
3. Remarks are a column on the attempt with visibility fixed to INTERNAL until F10 (US-046) adds the toggle, instead of the generic `notes` table.
4. Mistakes are sent inside the attempt operation (one op per attempt) and stored in `attempt_mistakes`; the separate `attempt_mistake` sync entity stays reserved for F07 if needed.
5. A portion needs the student's attendance for the date to be Present, Late, or Half day (AGENTS §5.10); unmarked attendance refuses the portion with `ATTENDANCE_REQUIRED`.
