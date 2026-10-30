# HifzAmanah — User Stories and Acceptance Criteria

**Document type:** Product backlog / acceptance baseline  
**Status:** Planning only — not implemented  
**Version:** 1.3  
**Last updated:** 2026-10-30  
**Changes in 1.3:** Quality scale order set to 1 = Excellent … 5 = Weak, Roman Urdu labels approved, and average-label rounding added. Updated the global quality rule and US-031 criteria 1–2. Criteria count unchanged.  
**Changes in 1.2:** Approved named Quality Rating Scale. Updated the global quality rule, US-031 criteria, and criterion 3 of US-029, US-030, and US-032 (wording only: overall label stays separate from the quality score). Criteria count unchanged.  
**Changes in 1.1:** Replaced acceptance criteria that had been copied from other stories so each story is testable on its own: US-004, US-005, US-006, US-009, US-010, US-011, US-028, US-033, US-050, US-055, US-056, US-057, US-058, US-061. No story, scope, or product decision changed.

## Purpose and scope

This backlog consolidates the user stories supported by the current HifzAmanah planning record, the uploaded SRS/architecture documents, and confirmed decisions through Q139. It is a reconstructed consolidated backlog, not a claim that every sentence reproduces an earlier draft verbatim. Implementation has not been authorized.

## Global product rules

- Android-first; Teacher daily work is offline-capable with later synchronization. Student and Parent report access is through Android only in MVP.
- Languages: English, Urdu script (RTL), and Roman Urdu (LTR). Default timezone `Asia/Karachi`; week starts Monday.
- Login uses User ID + Password. Email is for password recovery OTP, not login. Admin creates Teacher/Student/Parent accounts and sets initial passwords.
- Bulk Entry is attendance-only (Present/Absent). Hifz portions, mistakes, listening/recitation outcomes, and quality are entered through individual Daily Entry.
- Admin selects one-report-per-student/date or separate session reports. Default is one report per student/date.
- Quality rating is optional integer 1–5; missing is unknown, not zero. Each score has an approved label (SRS FR-ATT-009; lower is better): 1 Excellent, 2 Good, 3 Average, 4 Needs Improvement, 5 Weak. Overall performance label is Excellent/Good/Average/Needs Improvement and is a separate selection.
- Mistakes: Harkaat, Tajweed, Lafzi, Ayat bhoolna, Tarteeb, Waqf/Ibtida; severity Minor/Major and repeated flag are separate attributes.
- Excused absence is marked by Teacher and approved by Admin; reports distinguish excused from normal absence.
- Quran metadata is Admin-managed; MVP uses standard 15-line Mushaf.
- Homework carry-forward is suggested, reviewed, and explicitly confirmed by Teacher.
- Notifications: Android push only. No email/SMS/WhatsApp notifications in MVP.
- AI is online, advisory, Admin-configurable, privacy-minimized, and cannot mutate source records or confirm homework.
- Excel file limit: maximum 1,000 students/records per file as applicable; imports are previewed and append-first.

## Backlog

### EPIC 1 — Identity and Authentication

#### US-001 — Sign in with User ID

As a user, I want to sign in with my unique User ID and password so that my account is not dependent on email uniqueness.

**Acceptance criteria**

1. The user enters a valid User ID and password to access only the account associated with that identity.
2. Email is not accepted as a login identifier; invalid credentials produce a non-revealing error.
3. Sessions expire/revoke securely and sign-out prevents subsequent access using the ended session.

#### US-002 — Recover password by email OTP

As a user, I want to recover my password using an OTP sent to my registered email.

**Acceptance criteria**

1. A recovery OTP is sent only to the registered email address and is time-limited and rate-limited.
2. A password reset is allowed only after valid OTP verification; expired/invalid OTPs are rejected.
3. The reset event is audited and existing session/security behavior follows the approved recovery policy.

#### US-003 — Admin creates accounts

As a Madrasa Admin, I want to create Teacher, Student, and Parent accounts so that access is controlled by the madrasa.

**Acceptance criteria**

1. Only an authorized Madrasa Admin can create the relevant account and assign its unique User ID.
2. Student and Parent may share an email address but must have separate User IDs and passwords.
3. Admin-provided passwords do not trigger a mandatory first-login password change.

#### US-004 — Admin sets initial passwords

As a Madrasa Admin, I want to set initial passwords for newly created accounts.

**Acceptance criteria**

1. Only an authorized Madrasa Admin can set the initial password when creating a Teacher, Student, or Parent account.
2. The password must meet the approved password policy; it is stored only as a secure hash and never appears in logs or audit records.
3. The user can sign in with the Admin-set password and is not forced to change it on first login.

#### US-005 — Use shared email safely

As an Admin, I want Student and Parent accounts to be allowed to share an email while retaining separate User IDs.

**Acceptance criteria**

1. A Student account and a Parent account can be saved with the same email address; the shared email is not rejected as a duplicate.
2. Each account has its own unique User ID and password, and sign-in uses the User ID only.
3. Password recovery is requested by User ID and sends the OTP to that account's registered email, so recovering one account never resets the other.

#### US-006 — Separate accounts per madrasa

As a user associated with multiple madaris, I want a separate account and User ID for each madrasa.

**Acceptance criteria**

1. A person who belongs to more than one madrasa has a separate account with a unique User ID in each madrasa.
2. The same email address may be used on those accounts; signing in to one account gives access only to that madrasa's data.
3. Deactivating or changing the account in one madrasa does not affect the person's account in another madrasa.

### EPIC 2 — Organization and Roles

#### US-007 — Create madrasa workspace

As an authorized owner/admin, I want to configure a madrasa workspace.

**Acceptance criteria**

1. The action is available only to an authorized role in the active madrasa/workspace.
2. The system validates inputs and displays clear success, empty, and error states.
3. Changes are persisted and reflected in dependent views without losing historical records.

#### US-008 — Restrict teacher scope

As a madrasa, I want teachers limited to assigned classes and students.

**Acceptance criteria**

1. The action is available only to an authorized role in the active madrasa/workspace.
2. The system validates inputs and displays clear success, empty, and error states.
3. Changes are persisted and reflected in dependent views without losing historical records.

#### US-009 — Audit sensitive changes

As an Admin, I want sensitive account, role, and access changes recorded in an audit trail.

**Acceptance criteria**

1. Account creation and deactivation, role/membership changes, password resets, guardian link changes, and note-visibility changes each create an audit record.
2. Each audit record stores actor, action, target, timestamp, and a safe change summary, and never stores passwords, OTPs, or tokens.
3. Audit records cannot be edited or deleted through the application.

### EPIC 3 — Classes and Students

#### US-010 — Create and maintain classes

As an Admin, I want to create, edit, and deactivate classes.

**Acceptance criteria**

1. Only an authorized Admin can create, edit, and deactivate a class and assign one or more teachers to it.
2. The system validates required fields (such as class name) and displays clear success, empty, and error states.
3. A deactivated class is hidden from new entry, but its past attendance, daily records, homework, and reports are kept.

#### US-011 — Create student profiles

As an Admin, I want to create and maintain student profiles.

**Acceptance criteria**

1. Only an authorized Admin can create, edit, and deactivate a student profile in the active madrasa.
2. Student lists support search, filtering, and pagination.
3. Deactivating a student does not delete past daily records, attempts, homework, or reports.

#### US-012 — Enroll students

As an Admin, I want to enroll students into classes and preserve history when enrollment changes.

**Acceptance criteria**

1. The action is available only to an authorized role in the active madrasa/workspace.
2. The system validates inputs and displays clear success, empty, and error states.
3. Changes are persisted and reflected in dependent views without losing historical records.

### EPIC 4 — Calendar and Attendance

#### US-013 — Configure class timetable

As an Admin, I want to define recurring class schedules.

**Acceptance criteria**

1. Attendance is stored separately from recitation/performance status.
2. Bulk attendance offers only Present and Absent; no Hifz portion or quality fields are included.
3. Holidays, unscheduled dates, and no-class days are not counted as absences; excused absence requires Admin approval.

#### US-014 — Manage holidays and closures

As an Admin, I want to mark holidays and no-class dates.

**Acceptance criteria**

1. Attendance is stored separately from recitation/performance status.
2. Bulk attendance offers only Present and Absent; no Hifz portion or quality fields are included.
3. Holidays, unscheduled dates, and no-class days are not counted as absences; excused absence requires Admin approval.

#### US-015 — Record attendance in bulk

As a Teacher, I want to mark Present or Absent for a whole class efficiently.

**Acceptance criteria**

1. Attendance is stored separately from recitation/performance status.
2. Bulk attendance offers only Present and Absent; no Hifz portion or quality fields are included.
3. Holidays, unscheduled dates, and no-class days are not counted as absences; excused absence requires Admin approval.

#### US-016 — Request excused absence

As a Teacher, I want to mark an absence as excused for Admin review.

**Acceptance criteria**

1. Attendance is stored separately from recitation/performance status.
2. Bulk attendance offers only Present and Absent; no Hifz portion or quality fields are included.
3. Holidays, unscheduled dates, and no-class days are not counted as absences; excused absence requires Admin approval.

#### US-017 — Approve excused absence

As a Madrasa Admin, I want to approve or reject a teacher-marked excused absence.

**Acceptance criteria**

1. Attendance is stored separately from recitation/performance status.
2. Bulk attendance offers only Present and Absent; no Hifz portion or quality fields are included.
3. Holidays, unscheduled dates, and no-class days are not counted as absences; excused absence requires Admin approval.

### EPIC 5 — Daily Hifz Entry

#### US-018 — Create individual daily report

As a Teacher, I want to record one student’s daily Hifz performance.

**Acceptance criteria**

1. The Teacher can select the student and report date and enter the applicable portion details.
2. Each portion retains its own quantity, status, mistake/quality information, and optional remarks.
3. Edits are auditable and update derived reports and unconfirmed homework suggestions without silently changing confirmed homework.

#### US-019 — Choose daily report mode

As a Madrasa Admin, I want to choose one report per student/date or separate session reports.

**Acceptance criteria**

1. The Teacher can select the student and report date and enter the applicable portion details.
2. Each portion retains its own quantity, status, mistake/quality information, and optional remarks.
3. Edits are auditable and update derived reports and unconfirmed homework suggestions without silently changing confirmed homework.

#### US-020 — Record Sabaq

As a Teacher, I want to record Sabaq portions and their performance.

**Acceptance criteria**

1. The Teacher can select the student and report date and enter the applicable portion details.
2. Each portion retains its own quantity, status, mistake/quality information, and optional remarks.
3. Edits are auditable and update derived reports and unconfirmed homework suggestions without silently changing confirmed homework.

#### US-021 — Record Sabqi portions

As a Teacher, I want to record one or more Sabqi portions independently.

**Acceptance criteria**

1. The Teacher can select the student and report date and enter the applicable portion details.
2. Each portion retains its own quantity, status, mistake/quality information, and optional remarks.
3. Edits are auditable and update derived reports and unconfirmed homework suggestions without silently changing confirmed homework.

#### US-022 — Record Manzil portions

As a Teacher, I want to record multiple Manzil Paras independently.

**Acceptance criteria**

1. The Teacher can select the student and report date and enter the applicable portion details.
2. Each portion retains its own quantity, status, mistake/quality information, and optional remarks.
3. Edits are auditable and update derived reports and unconfirmed homework suggestions without silently changing confirmed homework.

#### US-023 — Record repeated attempts

As a Teacher, I want to preserve multiple attempts for a portion.

**Acceptance criteria**

1. The Teacher can select the student and report date and enter the applicable portion details.
2. Each portion retains its own quantity, status, mistake/quality information, and optional remarks.
3. Edits are auditable and update derived reports and unconfirmed homework suggestions without silently changing confirmed homework.

### EPIC 6 — Quran Portion and Metadata

#### US-024 — Maintain Quran metadata

As a Madrasa Admin, I want to add and edit Surah, Ayat, and Para reference data.

**Acceptance criteria**

1. The selected reference data and quantity are stored using canonical values independent of interface language.
2. Rubu = 1/4, Half = 1/2, Salasah = 3/4, and Complete = 1 Para; incompatible units are not summed.
3. MVP line-based portions follow the standard 15-line Mushaf and Admin-maintained Quran metadata.

#### US-025 — Select Para and Ayat range

As a Teacher, I want to specify Para and optional Surah/Ayat start-end ranges.

**Acceptance criteria**

1. The selected reference data and quantity are stored using canonical values independent of interface language.
2. Rubu = 1/4, Half = 1/2, Salasah = 3/4, and Complete = 1 Para; incompatible units are not summed.
3. MVP line-based portions follow the standard 15-line Mushaf and Admin-maintained Quran metadata.

#### US-026 — Use 15-line Mushaf

As a Teacher, I want line quantities to follow the standard 15-line Mushaf supported by the MVP.

**Acceptance criteria**

1. The selected reference data and quantity are stored using canonical values independent of interface language.
2. Rubu = 1/4, Half = 1/2, Salasah = 3/4, and Complete = 1 Para; incompatible units are not summed.
3. MVP line-based portions follow the standard 15-line Mushaf and Admin-maintained Quran metadata.

#### US-027 — Select portion quantities

As a Teacher, I want to select Rubu, Half, Salasah, or Complete quantities.

**Acceptance criteria**

1. The action is available only to an authorized role in the active madrasa/workspace.
2. The system validates inputs and displays clear success, empty, and error states.
3. Changes are persisted and reflected in dependent views without losing historical records.

### EPIC 7 — Mistakes and Quality

#### US-028 — Record mistake categories

As a Teacher, I want to record Harkaat, Tajweed, Lafzi, Ayat bhoolna, Tarteeb, and Waqf/Ibtida mistakes.

**Acceptance criteria**

1. The Teacher can record one or more mistakes on a portion attempt, each with exactly one category: Harkaat, Tajweed, Lafzi, Ayat bhoolna, Tarteeb, or Waqf/Ibtida.
2. Categories are stored as language-neutral canonical values and shown in the selected interface language.
3. Mistakes stay attached to their portion attempt and appear in weekly/monthly mistake counts by category.

#### US-029 — Set mistake severity

As a Teacher, I want to mark a mistake Minor or Major.

**Acceptance criteria**

1. The supported mistake categories and Minor/Major severity are selectable; repeated is a separate flag.
2. Quality is optional and accepts only integer values 1–5; missing values remain null/unknown.
3. The four overall labels are available as a separate selection and are not derived from, or converted to, the numeric quality score.

#### US-030 — Flag repeated mistakes

As a Teacher, I want to flag a mistake as repeated independently of severity.

**Acceptance criteria**

1. The supported mistake categories and Minor/Major severity are selectable; repeated is a separate flag.
2. Quality is optional and accepts only integer values 1–5; missing values remain null/unknown.
3. The four overall labels are available as a separate selection and are not derived from, or converted to, the numeric quality score.

#### US-031 — Rate quality 1–5

As a Teacher, I want to optionally rate a portion from 1 to 5.

**Acceptance criteria**

1. Each score is shown with its approved label in the selected language (SRS FR-ATT-009; lower is better): 1 Excellent (ممتاز, Mumtaz), 2 Good (اچھا, Achha), 3 Average (اوسط, Ausat), 4 Needs Improvement (مزید محنت کی ضرورت, Mazeed mehnat ki zaroorat), 5 Weak (کمزور, Kamzor). The same mapping is used on every screen, report, PDF, and chart.
2. Quality is optional and accepts only integer values 1–5; missing values remain null/unknown and are excluded from averages. An average shows the label of the nearest whole score, with .5 rounding up (e.g. 1.5 → 2 Good).
3. The numeric score is what is stored. It is set only by the Teacher, never assigned automatically or by AI, and is separate from the overall performance label.

#### US-032 — Set overall performance label

As a Teacher, I want to select Excellent, Good, Average, or Needs Improvement.

**Acceptance criteria**

1. The supported mistake categories and Minor/Major severity are selectable; repeated is a separate flag.
2. Quality is optional and accepts only integer values 1–5; missing values remain null/unknown.
3. The four overall labels are available as a separate selection and are not derived from, or converted to, the numeric quality score.

### EPIC 8 — Homework and Carry Forward

#### US-033 — Create structured homework

As a Teacher, I want to assign Sabaq, Sabqi, and Manzil homework.

**Acceptance criteria**

1. A homework assignment can contain Sabaq, Sabqi, and Manzil portions, with multiple independent Para portions for Sabqi and Manzil.
2. Each homework portion stores section, Para, optional Surah/Ayat range, quantity with unit, status, and optional instructions.
3. The assignment stores assigned date, due/next-class date, status, creator, and optional general instructions.

#### US-034 — Calculate remaining work

As a Teacher, I want incomplete assigned quantities to have remaining amounts calculated automatically.

**Acceptance criteria**

1. Remaining quantity is calculated only for matching portions and compatible units.
2. Suggestions exclude absence, not-assigned, and pending work from automatic failed-work carry-forward.
3. A Teacher can edit/reject and must explicitly confirm; confirmation records actor/time and preserves history.

#### US-035 — Suggest carry-forward

As a Teacher, I want the app to suggest eligible unfinished portions for the next assignment.

**Acceptance criteria**

1. Remaining quantity is calculated only for matching portions and compatible units.
2. Suggestions exclude absence, not-assigned, and pending work from automatic failed-work carry-forward.
3. A Teacher can edit/reject and must explicitly confirm; confirmation records actor/time and preserves history.

#### US-036 — Review homework suggestion

As a Teacher, I want to edit, remove, add, or reject suggested portions before confirmation.

**Acceptance criteria**

1. Remaining quantity is calculated only for matching portions and compatible units.
2. Suggestions exclude absence, not-assigned, and pending work from automatic failed-work carry-forward.
3. A Teacher can edit/reject and must explicitly confirm; confirmation records actor/time and preserves history.

#### US-037 — Confirm next assignment

As a Teacher, I want to confirm the next homework assignment explicitly.

**Acceptance criteria**

1. Remaining quantity is calculated only for matching portions and compatible units.
2. Suggestions exclude absence, not-assigned, and pending work from automatic failed-work carry-forward.
3. A Teacher can edit/reject and must explicitly confirm; confirmation records actor/time and preserves history.

#### US-038 — Preserve homework history

As a Teacher/Admin, I want prior assignments and their source attempts retained.

**Acceptance criteria**

1. The Teacher can select the student and report date and enter the applicable portion details.
2. Each portion retains its own quantity, status, mistake/quality information, and optional remarks.
3. Edits are auditable and update derived reports and unconfirmed homework suggestions without silently changing confirmed homework.

### EPIC 9 — Weekly and Monthly Reports

#### US-039 — View weekly report

As a Teacher/Admin, I want a weekly report derived from daily source records.

**Acceptance criteria**

1. The report is derived from source daily records, attempts, schedules, attendance, and homework history for the selected period.
2. Attendance and performance are separate; excused and normal absences are distinct.
3. Missing quality is excluded from averages, repeated attempts are not double-counted, and viewer permissions filter notes/fields.

#### US-040 — View monthly report

As a Teacher/Admin, I want a monthly report derived from daily source records.

**Acceptance criteria**

1. The report is derived from source daily records, attempts, schedules, attendance, and homework history for the selected period.
2. Attendance and performance are separate; excused and normal absences are distinct.
3. Missing quality is excluded from averages, repeated attempts are not double-counted, and viewer permissions filter notes/fields.

#### US-041 — Separate attendance and performance

As a report viewer, I want absence counts separate from recitation outcomes.

**Acceptance criteria**

1. Attendance is stored separately from recitation/performance status.
2. Bulk attendance offers only Present and Absent; no Hifz portion or quality fields are included.
3. Holidays, unscheduled dates, and no-class days are not counted as absences; excused absence requires Admin approval.

#### US-042 — Show excused and normal absence

As a report viewer, I want excused and normal absences shown separately.

**Acceptance criteria**

1. Attendance is stored separately from recitation/performance status.
2. Bulk attendance offers only Present and Absent; no Hifz portion or quality fields are included.
3. Holidays, unscheduled dates, and no-class days are not counted as absences; excused absence requires Admin approval.

#### US-043 — Show portion-level outcomes

As a report viewer, I want each Sabaq, Sabqi, and Manzil portion displayed independently.

**Acceptance criteria**

1. The Teacher can select the student and report date and enter the applicable portion details.
2. Each portion retains its own quantity, status, mistake/quality information, and optional remarks.
3. Edits are auditable and update derived reports and unconfirmed homework suggestions without silently changing confirmed homework.

### EPIC 10 — Student and Parent Access

#### US-044 — Student views own reports

As a Student, I want read-only access to my published reports in the Android app.

**Acceptance criteria**

1. The report is derived from source daily records, attempts, schedules, attendance, and homework history for the selected period.
2. Attendance and performance are separate; excused and normal absences are distinct.
3. Missing quality is excluded from averages, repeated attempts are not double-counted, and viewer permissions filter notes/fields.

#### US-045 — Parent views linked student reports

As a Parent, I want read-only access to reports for verified linked students.

**Acceptance criteria**

1. The report is derived from source daily records, attempts, schedules, attendance, and homework history for the selected period.
2. Attendance and performance are separate; excused and normal absences are distinct.
3. Missing quality is excluded from averages, repeated attempts are not double-counted, and viewer permissions filter notes/fields.

#### US-046 — Protect private teacher notes

As a Teacher, I want internal notes hidden from Student and Parent views.

**Acceptance criteria**

1. Student sees only their own published, read-only records; Parent sees only verified linked students.
2. Internal-only teacher notes are excluded from APIs, screens, exports, and PDFs for Student/Parent.
3. Authorization is enforced server-side for every requested record and export.

### EPIC 11 — Localization and Accessibility

#### US-047 — Use English interface

As a user, I want to use the app in English.

**Acceptance criteria**

1. The selected language persists across sessions and localizes interface labels and validation.
2. Urdu uses RTL; English and Roman Urdu use LTR, including mixed Arabic/Latin content.
3. Changing language does not alter stored domain values or erase unsaved form data.

#### US-048 — Use Urdu interface

As a user, I want to use the app in Urdu script with RTL layout.

**Acceptance criteria**

1. The selected language persists across sessions and localizes interface labels and validation.
2. Urdu uses RTL; English and Roman Urdu use LTR, including mixed Arabic/Latin content.

#### US-049 — Use Roman Urdu interface

As a user, I want to use the app in Roman Urdu with LTR layout.

**Acceptance criteria**

1. The selected language persists across sessions and localizes interface labels and validation.
2. Urdu uses RTL; English and Roman Urdu use LTR, including mixed Arabic/Latin content.

#### US-050 — Preserve Quran Arabic text

As a user, I want Quranic Arabic text and ranges preserved accurately across languages.

**Acceptance criteria**

1. Quranic Arabic text and approved Surah/Ayat labels are never automatically translated, transliterated, or altered in any interface language.
2. Arabic text and numeric Surah/Ayat ranges stay readable in English, Urdu, and Roman Urdu layouts, including in reports, PDFs, and Excel exports.

### EPIC 12 — Offline and Synchronization

#### US-051 — Save daily work offline

As a Teacher, I want daily entries saved locally when internet is unavailable.

**Acceptance criteria**

1. Local changes are durably saved before the UI reports them as saved and are queued for sync.
2. Operations use stable IDs/idempotency; retry does not create duplicates and sync status is visible.

#### US-052 — Sync queued changes

As a Teacher, I want offline changes synchronized when connectivity returns.

**Acceptance criteria**

1. Local changes are durably saved before the UI reports them as saved and are queued for sync.
2. Operations use stable IDs/idempotency; retry does not create duplicates and sync status is visible.

#### US-053 — See sync status

As a Teacher, I want to see pending, syncing, synced, failed, and action-required states.

**Acceptance criteria**

1. Local changes are durably saved before the UI reports them as saved and are queued for sync.
2. Operations use stable IDs/idempotency; retry does not create duplicates and sync status is visible.

#### US-054 — Resolve conflicting edits

As an authorized user, I want meaningful sync conflicts preserved and reviewed instead of silently overwritten.

**Acceptance criteria**

1. Local changes are durably saved before the UI reports them as saved and are queued for sync.
2. Operations use stable IDs/idempotency; retry does not create duplicates and sync status is visible.

### EPIC 13 — PDF and Print

#### US-055 — Generate professional PDF

As a Teacher/Admin, I want a professional PDF report.

**Acceptance criteria**

1. A professional default PDF layout is available for weekly and monthly reports and shows the date range, section details, quantities with units, statuses, and authorized remarks.
2. English, Urdu (RTL), Roman Urdu, and Quranic Arabic text render correctly in the PDF.

#### US-056 — Customize report template

As a Madrasa Admin, I want to customize logo, colors, headings, and layout.

**Acceptance criteria**

1. Only a Madrasa Admin can customize the report logo, colors, headings, and layout, within the supported template controls.
2. The customization applies to all PDF reports generated for that madrasa and never changes report data or calculations.

#### US-057 — Apply report permissions to PDF

As a report viewer, I want PDF content restricted exactly like on-screen reports.

**Acceptance criteria**

1. PDF generation enforces the same organization, role, student/guardian, and published-report restrictions as the on-screen report, checked server-side.
2. Internal-only teacher notes never appear in PDFs generated for Students or Parents.

### EPIC 14 — Excel Import and Export

#### US-058 — Import student workbook

As an Admin, I want to import students from a validated Excel template.

**Acceptance criteria**

1. The workbook is validated for template/version, required columns, field types, tenant mapping, and the 1,000-row/student-record limit before any data is written.
2. Preview identifies new, duplicate, invalid, and proposed-update rows; default behavior is append-only, never silently overwrites, and never matches students by name alone.
3. Re-importing the same workbook with stable `ExternalStudentID` values does not create duplicate students.

#### US-059 — Import daily records

As an authorized user, I want to import daily Hifz portions from Excel.

**Acceptance criteria**

1. The workbook is validated for template/version, required columns, field types, tenant mapping, and the 1,000-row/student-record limit.
2. Preview identifies new, duplicate, invalid, and proposed-update rows; default behavior is append-only and never silently overwrites.

#### US-060 — Preview import changes

As an Admin, I want to review duplicates, invalid rows, and proposed updates before writing.

**Acceptance criteria**

1. The workbook is validated for template/version, required columns, field types, tenant mapping, and the 1,000-row/student-record limit.
2. Preview identifies new, duplicate, invalid, and proposed-update rows; default behavior is append-only and never silently overwrites.

#### US-061 — Export authorized data

As an authorized user, I want to export students, records, and reports to Excel.

**Acceptance criteria**

1. Exports apply the same organization, role, date-range, and note-visibility restrictions as the corresponding in-app view, with a maximum of 1,000 students/records per file.
2. Exported files keep identifiers, dates, quantity units, canonical status values, and Arabic text unchanged, and text cells are protected against spreadsheet formula injection.

### EPIC 15 — Analytics and AI

#### US-062 — View deterministic analytics

As a Teacher, I want performance analytics calculated from source records.

**Acceptance criteria**

1. Deterministic analytics remain the source of truth and are available offline from cached data, labeled provisional when unsynced.
2. AI is online-only and advisory; it uses minimized structured metrics, cites the relevant period/data, and cannot mutate records or confirm homework.

#### US-063 — Receive AI recommendations

As an authorized Teacher/Admin, I want online AI recommendations grounded in student performance metrics.

**Acceptance criteria**

1. Deterministic analytics remain the source of truth and are available offline from cached data, labeled provisional when unsynced.
2. AI is online-only and advisory; it uses minimized structured metrics, cites the relevant period/data, and cannot mutate records or confirm homework.

#### US-064 — Configure AI provider and limits

As a Madrasa Admin, I want to choose a supported AI provider, enable/disable AI, and set usage limits.

**Acceptance criteria**

1. Deterministic analytics remain the source of truth and are available offline from cached data, labeled provisional when unsynced.
2. AI is online-only and advisory; it uses minimized structured metrics, cites the relevant period/data, and cannot mutate records or confirm homework.

#### US-065 — Control AI data sharing

As a Madrasa Admin, I want privacy controls over the categories and amount of student data sent to AI.

**Acceptance criteria**

1. Deterministic analytics remain the source of truth and are available offline from cached data, labeled provisional when unsynced.
2. AI is online-only and advisory; it uses minimized structured metrics, cites the relevant period/data, and cannot mutate records or confirm homework.

### EPIC 16 — Notifications

#### US-066 — Receive Android push notifications

As an app user, I want supported event notifications delivered through Android push notifications.

**Acceptance criteria**

1. Only Android push notifications are supported in MVP; email, SMS, and WhatsApp are excluded.
2. Notification payloads respect role/tenant permissions and never expose internal notes or unauthorized student data.

#### US-067 — Manage notification preferences

As a user, I want to control supported notification preferences without exposing private information.

**Acceptance criteria**

1. Only Android push notifications are supported in MVP; email, SMS, and WhatsApp are excluded.
2. Notification payloads respect role/tenant permissions and never expose internal notes or unauthorized student data.

### EPIC 17 — Security, Audit, and Administration

#### US-068 — Enforce tenant isolation

As a madrasa, I want all records scoped to the active organization.

**Acceptance criteria**

1. Protected operations are authorized server-side against the active organization and role.
2. Sensitive actions retain actor, timestamp, target, and change context without logging unnecessary secrets.

#### US-069 — Review audit history

As an authorized Admin, I want to review sensitive changes and record history.

**Acceptance criteria**

1. Protected operations are authorized server-side against the active organization and role.
2. Sensitive actions retain actor, timestamp, target, and change context without logging unnecessary secrets.

#### US-070 — Protect account recovery

As an account owner, I want sensitive recovery actions protected by stronger verification and audit controls.

**Acceptance criteria**

1. A recovery OTP is sent only to the registered email address and is time-limited and rate-limited.
2. A password reset is allowed only after valid OTP verification; expired/invalid OTPs are rejected.

## Non-functional acceptance baseline

- Server-side tenant isolation and role authorization for every protected operation.
- Durable offline saves, idempotent sync, explicit conflict resolution, and visible sync states.
- English LTR, Urdu RTL, Roman Urdu LTR, and correct mixed Arabic/Latin rendering.
- Reports reproducible from source records; no holiday/no-class false absences; no double-counting repeated attempts.
- Private teacher notes excluded from Student/Parent surfaces and exports.
- Excel import/export security, row-level validation, bounded batches, safe retries, and formula-injection protection.
- AI provider failure, offline mode, and usage limits must not block daily Hifz entry or reporting.

## Decisions still requiring implementation planning

The following are technical gates, not unanswered product questionnaire items: concrete authentication/email-OTP provider; detailed role-permission matrix; PDF font/layout engineering; integrated AI provider list and explicit monetary budgets; data retention/deletion/backup policy; Android minimum version/device matrix; local cache retention and app-lock policy; hosting/region/capacity targets; CI/API/FILE/DEVICE test commands and UI automation setup; push provider/event catalogue and consent lifecycle.

## Backlog count

**70 user stories across 17 epics.** Acceptance criteria are counted below; each story has 2 or 3 criteria.
**188 acceptance criteria total.**
