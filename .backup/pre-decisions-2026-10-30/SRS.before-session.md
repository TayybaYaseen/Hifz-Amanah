# HifzAmanah --- Software Requirements Specification (SRS)

**Document type:** Software Requirements Specification\
**Status:** Consolidated planning baseline; not implemented\
**Version:** 1.10\
**Last updated:** 2026-10-30\
**Changes in 1.10:** Quality Rating Scale order confirmed as 1 = Excellent … 5 = Weak (lower is better); Roman Urdu labels approved; average-label rounding rule added. Updated FR-ATT-009 and §16.2 only. Bulk Entry remains attendance-only (FR-DAY-002A unchanged).\
**Changes in 1.9:** Approved named Quality Rating Scale. Updated FR-ATT-009, §15.1 (QualityRating), §15.5 checklist, and §16.2 decision register. No other requirement changed.\
**Changes in 1.8:** Consistency fixes only, no product decision changed. Bulk entry is described as attendance-only everywhere (§2.1, §8.1, §8.2). The "sign-up" screen is removed (§8.1). Desktop sizes are removed from NFR-UX-001. Sections 5.19–5.21 are renumbered so that Excel appears once, with FR-XLS-017 moved into it. The Excel `MistakeCount` mapping is added (§15.1). The 2FA scope question and Teacher Excel import are added as gates (§13 #1, #13).

## 1. Introduction

### 1.1 Purpose

This SRS defines functional and non-functional requirements for
HifzAmanah, an offline-capable Android application for Quran memorization teachers and madaris
to manage students, daily recitation, revision, homework, attendance,
and progress reporting.

It is intended for product planning, design, implementation, testing,
and future review with AI coding tools. Requirements use unique IDs so
they can be traced to tests.

### 1.2 Product vision

HifzAmanah should make a Hifz teacher's daily work reliable and
manageable: record what was assigned, what the student actually recited,
mistakes and quality, what remains, and what should be assigned next.
Weekly and monthly reports should follow from the source records rather
than requiring duplicate manual totals.

### 1.3 Brand identity

- **Product/brand name:** HifzAmanah
- **Tagline:** A Trusted Companion for Quran Memorization
- **Brand direction:** Islamic, trustworthy, and suitable for individual teachers, madaris, students, and parents. Proposed colors: emerald green, ivory white, and subtle gold.
- **Availability note:** App-store, domain, and trademark availability have not yet been verified.

### 1.4 Intended users

-   Individual Hifz teacher.
-   Madrasa owner or administrator.
-   Teacher assigned to one or more classes.
-   Student, for secure online read-only access to their own published reports.
-   Parent/guardian, for secure online read-only access after verified linking to the student.

### 1.5 Terminology

-   **Sabaq:** New memorization.
-   **Sabqi:** Recent revision of memorized work.
-   **Manzil:** Older revision.
-   **Para/Juz:** One of the Quran's 30 sections.
-   **Portion:** A specific unit/range of work in Sabaq, Sabqi, or
    Manzil.
-   **Attempt:** A recorded recitation event for a portion.
-   **Homework assignment:** A confirmed set of portions to prepare for
    a future class.
-   **Suggestion:** A proposed next assignment generated from
    pending/incomplete work; it is not final until teacher confirmation.
-   **Organization:** A madrasa workspace or an individual teacher
    workspace.
-   **Tenant isolation:** A user must not access another organization's
    data without authorization.
-   **Mushaf edition:** A particular printed/layout edition that may
    affect line counts.

### 1.6 Requirement language

"Must" means required for the defined scope. "Should" means strongly
recommended. "May" means optional or dependent on a later decision.

## 2. Product scope

### 2.1 MVP scope

-   User ID + password authentication and account settings.
-   Individual teacher and madrasa workspaces.
-   Organization roles and permissions.
-   Classes, teacher assignments, students, and enrollment.
-   Timetable, holidays, no-class days, and attendance.
-   Daily Hifz entry for an individual student and attendance-only bulk class entry (Present/Absent).
-   Sabaq, Sabqi, and Manzil with multiple portions.
-   Structured homework and portion attempts.
-   Automatic remaining-quantity calculation.
-   Suggested carry-forward with explicit teacher confirmation.
-   Weekly and monthly reports calculated from source records.
-   English, Urdu script, and Roman Urdu.
-   Role-based access and audit history.
-   Secure online student/guardian login, verified linking, published read-only reports, and field-level visibility controls.
-   Offline-first teacher workflows with durable local saves, sync queue, conflict handling, and sync status.
-   Print-friendly reports and PDF export, with permissions applied consistently.
-   Deterministic performance analytics and basic cached summaries available offline.
-   Internet-based AI recommendations for authorized teachers/admins, with teacher review and safe fallback.
-   Validated Excel import for students and daily Hifz records; Excel export for students, records, and weekly/monthly reports.

### 2.2 Later/optional features

-   Separate browser-based student/guardian portal (excluded from MVP).
-   Android push notifications only in MVP; email, SMS, and WhatsApp are excluded.
-   Additional languages.
-   Advanced AI features beyond trend analysis and teacher-reviewed recommendations.
-   External integrations.

### 2.3 Non-goals

-   Automatic audio recitation grading.
-   Replacing teacher judgment.
-   Public student profiles.
-   Automatically finalizing suggested homework.
-   Automatically overwriting confirmed homework after source edits.

## 3. Overall description

### 3.1 Product perspective

HifzAmanah is an Android-first application with an offline-capable teacher workflow. The Android app stores permitted working data and pending changes in a local SQLite database. A Node.js API authenticates online users, enforces authorization and domain rules, synchronizes records, and reads/writes PostgreSQL. The server is authoritative for permissions, conflict resolution, and published online reports. Secure student/guardian sign-in provides read-only access to published records for the student or verified linked students. PDF output must enforce the same permissions as on-screen reports.

### 3.2 Operating environment

-   Android phones and tablets; minimum supported Android version to be finalized before implementation.
-   React Native/Expo Android application, tested on representative physical devices and emulators.
-   Node.js API and PostgreSQL hosted in a production environment.
-   SQLite local persistence for offline teacher workflows.
-   HTTPS for all production API traffic.
-   Student/guardian report access requires online authentication in the initial release.

### 3.3 User skill assumptions

The application should be usable by teachers who are comfortable with
basic forms and tables but may not be technical. Daily entry should
minimize repetitive work, use clear labels, and provide understandable
validation.

### 3.4 Constraints

-   Student records must be private and organization-scoped.
-   The app must not count holidays or no-class dates as absences.
-   Reports must be reproducible from source records.
-   Quantity units must be explicit and incompatible units must not be
    added together.
-   Quranic Arabic content must remain intact.
-   English, Urdu script, and Roman Urdu must be supported.
-   No code changes are authorized by this document alone;
    implementation begins only when separately requested.

### 3.5 Assumptions and dependencies

-   Quran metadata is maintained by the Madrasa Admin in the MVP; no external metadata vendor/source is selected.
-   The MVP uses the standard 15-line Mushaf only.
-   The authentication provider and production hosting provider are not finalized; the user-facing authentication behavior is defined in Section 5.1 and the decision register.
-   Android push notifications are the only selected MVP notification channel; delivery provider and operational setup remain implementation choices.
-   Secure Student/Parent online access is through the Android app only in MVP; a separate browser portal is excluded.

## 4. User roles and permissions

### 4.1 Roles

-   **Owner:** highest administrative access to the organization and its
    membership/settings.
-   **Admin:** manages permitted classes, students, teachers, schedules,
    and reports.
-   **Teacher:** works with assigned classes/students and creates daily
    records/homework.
-   **Student:** can view own permitted/published records only.
-   **Guardian:** can view permitted records for verified linked
    students only.

### 4.2 Access rules

**FR-SEC-001:** The system must authenticate users before access to
private records.

**FR-SEC-002:** Every organization-owned record must be authorized
against the active organization and user membership on the server.

**FR-SEC-003:** Teachers must be restricted to the classes/students
assigned to them unless a specific permission grants broader access.

**FR-SEC-004:** Students may access only their own permitted read-only
records.

**FR-SEC-005:** Guardians may access only students linked by an authorized, verified process. Knowing a phone number, email, or student name is not sufficient.

**FR-SEC-006:** Internal-only teacher notes must not be returned to
student/guardian APIs, page payloads, exports, or PDFs.

**FR-SEC-007:** Changes to roles, student links, record visibility,
daily records, and homework confirmation must be auditable.

**FR-SEC-008:** The system must prevent users from accessing records by
guessing or changing IDs in URLs or requests.

**FR-SEC-009:** Client-supplied role, organization, visibility, and totals must never be trusted without server-side validation.

**FR-SEC-010:** Student and Parent accounts are distinct user accounts even when they share an email address. User ID, not email, is the unique login identifier. Guardian linking must be explicit and authorized.

## 5. Functional requirements

### 5.1 Authentication and account settings

**FR-AUTH-001:** Users must be able to sign in and sign out securely.

**FR-AUTH-002:** Login must use a unique system-generated or admin-assigned User ID plus password. Email is not the login identifier.

**FR-AUTH-007:** Password recovery must use an OTP sent to the registered email address; after OTP verification, the user can set a new password.

**FR-AUTH-008:** Email verification is not required for account activation in the MVP.

**FR-AUTH-009:** A Madrasa Admin creates Teacher, Student, and Parent accounts and manually sets their initial passwords. Teachers are created only by a Madrasa Admin. Student and Parent accounts may share the same email address but must have distinct User IDs and credentials.

**FR-AUTH-010:** Users are not forced to change an admin-provided password on first login.

**FR-AUTH-011:** A person belonging to multiple madaris has a separate account and User ID for each madrasa. Email may be reused across those accounts; tenant membership and login identity remain separate.

**FR-AUTH-003:** The system must provide secure session handling and
prevent unauthorized access after logout or session expiry.

**FR-AUTH-004:** Users must be able to choose a preferred interface
language: English, Urdu, or Roman Urdu.

**FR-AUTH-005:** The system must persist the user's language preference
across sessions.

**FR-AUTH-006:** Users must be able to manage basic profile information
and applicable security settings.

### 5.2 Organization and membership

**FR-ORG-001:** A user must be able to create or enter an individual
teacher workspace or a madrasa workspace, subject to onboarding rules.

**FR-ORG-002:** The system must distinguish organization roles and
permissions.

**FR-ORG-003:** Owners/admins must be able to manage authorized
memberships and teacher assignments.

**FR-ORG-004:** Records must be scoped to the correct organization.

**FR-ORG-005:** Removing a member must revoke future access without
deleting historical records they created.

**FR-ORG-006:** Multi-organization membership may be supported; if
enabled, users must clearly select the active workspace.

### 5.3 Classes and students

**FR-CLS-001:** Authorized users must be able to create, view, update,
and deactivate classes.

**FR-CLS-002:** Authorized users must be able to assign one or more
teachers to a class.

**FR-STU-001:** Authorized users must be able to create, view, update,
and deactivate student profiles.

**FR-STU-002:** The system must support enrollment of students into
classes and preserve historical records when class enrollment changes.

**FR-STU-003:** Student lists must support practical search, filtering,
and pagination as data grows.

**FR-STU-004:** Deactivating a student must not silently delete past
daily records, attempts, homework, or reports.

### 5.4 Timetable, holidays, and attendance

**FR-CAL-001:** Authorized users must be able to define recurring class
schedules.

**FR-CAL-002:** Authorized users must be able to record holidays,
closures, and no-class exceptions.

**FR-CAL-003:** Attendance must be recorded separately from lesson
performance.

**FR-CAL-004:** An unscheduled date, Sunday where no class is scheduled,
declared holiday, or no-class day must not automatically count as an
absence.

**FR-CAL-005:** Reports must distinguish scheduled classes, attended
classes, normal absences, Admin-approved excused absences, holidays, and no-class days.

**FR-CAL-006:** Date boundaries must use the organization's configured
timezone.

### 5.5 Daily Hifz records

**FR-DAY-001:** The system must support creating a daily record for a
student and class date.

**FR-DAY-002:** The system must support individual-student Daily Entry and a separate whole-class Bulk Entry workflow.

**FR-DAY-002A:** Bulk Entry is attendance-only in the MVP and records Present or Absent for each student. It must not capture Sabaq, Sabqi, Manzil, listening/recitation outcomes, mistakes, or quality ratings.

**FR-DAY-002B:** Sabaq, Sabqi, Manzil, listening/recitation outcomes, mistakes, and quality ratings are recorded through the individual student's Daily Entry.

**FR-DAY-003:** A daily record must support separate Sabaq, Sabqi, and
Manzil sections.

**FR-DAY-004:** A daily record may contain multiple portions within each
section.

**FR-DAY-005:** The UI must display assigned quantity, completed
quantity, remaining quantity where applicable, mistakes, quality,
status, and remarks.

**FR-DAY-006:** The system should provide safe defaults and reusable
selections to reduce typing, without overriding teacher-entered values
silently.

**FR-DAY-007:** Bulk entry must validate each student/row separately and
show row-level success and errors.

**FR-DAY-008:** The Madrasa Admin must configure the madrasa's daily-report mode: (a) one report per student per date, or (b) separate reports for multiple sessions per student/date. The selected mode controls uniqueness, session labels, report aggregation, and duplicate warnings. The default for a new madrasa is one report per student/date.

**FR-DAY-009:** Daily record edits must update derived reports and
unconfirmed homework suggestions.

### 5.6 Sabaq requirements

**FR-SAB-001:** A Sabaq portion must support Para/Juz number.

**FR-SAB-002:** A Sabaq portion must support optional Surah, start Ayat,
and end Ayat.

**FR-SAB-003:** A Sabaq portion must record assigned quantity and
completed quantity separately.

**FR-SAB-004:** A Sabaq portion must support mistakes, quality rating,
status, and optional teacher remarks.

**FR-SAB-005:** Quran metadata (Surah, Ayat, and Para information) is managed by the Madrasa Admin, who can add/edit the reference information used by teachers. The MVP must not assume an external metadata provider or license has been selected. Validation uses the active admin-maintained metadata.

**FR-SAB-006:** The MVP supports the standard 15-line Mushaf only. Line counting and line-based portions must use this defined layout; multiple Mushaf editions are out of MVP scope.

### 5.7 Sabqi requirements

**FR-SBQ-001:** Sabqi must support one or multiple Paras in a single
daily record.

**FR-SBQ-002:** Each Sabqi Para/portion must have its own quantity,
unit, mistakes, quality, status, and remarks.

**FR-SBQ-003:** The system may suggest the current Sabaq Para as a
default, but the teacher must be able to select the same Para, another
Para, or multiple Paras.

**FR-SBQ-004:** Performance for one Sabqi Para must not overwrite or
determine the status of another Para.

### 5.8 Manzil requirements

**FR-MNZ-001:** Manzil must support multiple Paras in a single daily
record.

**FR-MNZ-002:** Each Manzil Para/portion must have its own quantity,
unit, mistakes, quality, status, and remarks.

**FR-MNZ-003:** A report must show each Manzil portion independently;
for example, Para 1 completed, Para 5 half completed, and Para 10 not
remembered.

**FR-MNZ-004:** Manzil outcomes must not be collapsed into a single
status if portions have different outcomes.

### 5.9 Quantity options and calculations

**FR-QTY-001:** For Para-fraction units, the system must support
Rubu/Rubah = 1/4 Para, Half = 1/2 Para, Salasah = 3/4 Para, and Complete
= 1 full Para.

**FR-QTY-002:** The UI must make the quantity unit explicit, such as
Para fraction, lines, Ayat, or pages.

**FR-QTY-003:** The system must represent quantity precisely and
validate allowed ranges. It should use numerator/denominator or another
exact representation rather than imprecise floating-point math.

**FR-QTY-004:** The system must not add quantities expressed in
incompatible units without an approved conversion.

**FR-QTY-005:** For the same portion and compatible unit, remaining
quantity must be calculated as
`max(0, assigned quantity - completed quantity)`.

**FR-QTY-006:** Completed quantity must not exceed assigned quantity
unless the domain explicitly supports extra work as a separate portion.

**FR-QTY-007:** If a portion is `NOT_REMEMBERED`, the default completed
quantity is zero and remaining quantity is the applicable assigned
quantity; authorized teachers may correct the record.

**FR-QTY-008:** Missing performance data must not be interpreted as a
completed or failed attempt.

### 5.10 Performance statuses and attempts

**FR-ATT-001:** The system must support `COMPLETED`, `PARTIAL`,
`NOT_REMEMBERED`, `ABSENT`, `NOT_ASSIGNED`, and `PENDING` states where
applicable.

**FR-ATT-002:** Absence must be represented separately from a present
student's unsuccessful recitation.

**FR-ATT-003:** The system must record one or more attempts for a
portion when repeated recitation is tracked.

**FR-ATT-004:** An attempt must record the attempt time, recorder,
applicable portion/assignment, completed quantity, unit, status,
mistakes, quality, and optional remarks.

**FR-ATT-005:** The system must preserve attempt history when a later
attempt is added.

**FR-ATT-006:** If remaining quantity is stored on an attempt, it must
be clearly defined as an attempt-time snapshot; current remaining
quantity must be calculated from the authoritative current data.

**FR-ATT-007:** `ABSENT`, `NOT_ASSIGNED`, and `PENDING` must not be
converted to zero quality or failed recitation in reports.

**FR-ATT-008:** Each recitation/portion quality rating is optional and, when recorded, is an integer from 1 through 5. A missing rating is unknown/not recorded and must not be treated as zero.

**FR-ATT-009:** Quality ratings must use the approved five-level Quality Rating Scale (approved 2026-10-30; order and Roman Urdu labels confirmed 2026-10-30). Scores range from 1 to 5, and each score has exactly one approved label. **A lower score means better quality:** 1 is the best (Excellent) and 5 is the weakest (Weak).

| Score | English label | Urdu label | Roman Urdu label |
|---|---|---|---|
| 1 | Excellent | ممتاز | Mumtaz |
| 2 | Good | اچھا | Achha |
| 3 | Average | اوسط | Ausat |
| 4 | Needs Improvement | مزید محنت کی ضرورت | Mazeed mehnat ki zaroorat |
| 5 | Weak | کمزور | Kamzor |

- The same score-to-label mapping must be used consistently throughout the application wherever a quality rating is entered or displayed.
- The stored value is the numeric score (1–5). Labels are localized for display only. Historical records keep their original numeric score.
- The quality rating is recorded by the teacher. It is optional when the teacher does not wish to assign one.
- A missing quality rating must remain NULL/missing and must never be treated as zero (FR-ATT-008). Missing ratings are excluded from quality averages (FR-RPT-004).
- An average quality score is shown as the exact average with one decimal place, the number of ratings used, and the label of the nearest whole score. A value exactly halfway rounds up to the higher number (for example 1.4 → 1 Excellent, 1.5 → 2 Good, 3.6 → 4 Needs Improvement). The label is for display only; the exact average is what reports and analytics use.
- Because lower is better, a falling average means improvement. Trend charts, analytics, and AI summaries must describe direction accordingly.
- The system must not assign or change quality scores automatically, including by AI.
- The quality rating is distinct from mistake counts and from performance statuses.

The four-level overall Hifz performance label (Excellent, Good, Average, Needs Improvement) remains a separate, optional teacher selection. It is not derived from, or converted to, the quality score.

**FR-ATT-010:** Mistakes must support detailed categories: Harkaat, Tajweed, Lafzi, Ayat bhoolna, Tarteeb, and Waqf/Ibtida. Each mistake may be marked Minor or Major and independently flagged as repeated. Repeated is not itself a severity level.

### 5.11 Structured homework

**FR-HW-001:** The system must support a homework assignment containing
structured Sabaq, Sabqi, and Manzil portions.

**FR-HW-002:** Each homework portion must support section type, Para,
optional Surah/Ayat range, quantity, unit, status, and optional
instructions.

**FR-HW-003:** Sabqi and Manzil homework must support multiple Para
portions with independent quantities.

**FR-HW-004:** A homework assignment must store assigned date,
due/next-class date, status, creator, and optional general
instructions/notes.

**FR-HW-005:** The system must automatically calculate remaining
quantity for eligible incomplete portions.

**FR-HW-006:** The system must generate a suggested next assignment from
eligible remaining portions and link suggestions to their source
attempts/portions where possible.

**FR-HW-007:** A teacher must be able to review, edit, add, remove, or
reject suggested portions before confirming the assignment.

**FR-HW-008:** Suggested homework must not be treated as final/confirmed
until a teacher explicitly confirms it.

**FR-HW-009:** Confirmation must store the confirming teacher and
confirmation timestamp.

**FR-HW-010:** The system must preserve previous homework and its
history; a new assignment must not overwrite an old one.

**FR-HW-011:** Corrections to source daily records must recalculate
derived remaining quantities and unconfirmed suggestions.

**FR-HW-012:** Source edits must not silently modify already-confirmed
homework. Explicit revisions must be auditable.

**FR-HW-013:** Absence, not-assigned work, and pending/unattempted work
must not automatically be treated as failed work for carry-forward;
suggestion eligibility rules must be explicit.

**FR-HW-014:** Homework portions must be traceable to prior homework
portions and/or attempts when carried forward.

**FR-HW-015:** The next-class performance must be linkable to the
homework portion that the student attempted.

### 5.12 Weekly reports

**FR-WKR-001:** The system must generate a weekly report from source
daily records, attempts, attendance, schedules, and homework history.

**FR-WKR-002:** The report must show daily Sabaq, Sabqi, and Manzil
detail.

**FR-WKR-003:** The report must show assigned and completed quantities
grouped by compatible units.

**FR-WKR-004:** The report must show completion, partial,
not-remembered, pending, and absence information without conflating
their meanings.

**FR-WKR-005:** The report must include mistake counts and available
quality trends.

**FR-WKR-006:** The report must show scheduled classes, attended
classes, absences, holidays, and no-class days distinctly.

**FR-WKR-007:** The report must identify outstanding homework and
portions suggested/carried forward.

**FR-WKR-008:** The report must include teacher remarks according to the
viewer's permissions.

### 5.13 Monthly reports

**FR-MNR-001:** The system must generate a monthly report from daily
source records and related schedule/attendance/homework data.

**FR-MNR-002:** The report must show scheduled, attended, and absent
class counts.

**FR-MNR-003:** The report must aggregate Sabaq, Sabqi, and Manzil
separately.

**FR-MNR-004:** The report must show Para-wise progress and pending
portions.

**FR-MNR-005:** The report must show homework assigned, attempted,
completed, and carried forward as distinct measures.

**FR-MNR-006:** The report must show available mistake and quality
trends and identify recurring difficulty areas where the data supports
that conclusion.

**FR-MNR-007:** The report must provide teacher remarks/recommendations
where entered and permitted.

### 5.14 Report calculation and correction

**FR-RPT-001:** Weekly/monthly reports must be derived from source
records, not maintained as independently editable totals.

**FR-RPT-002:** Editing a daily record must update affected reports and
unconfirmed homework suggestions.

**FR-RPT-003:** The system must use an explicit timezone and
configurable week-start day for report boundaries.

**FR-RPT-004:** Missing quality ratings must be excluded from quality
averages, not treated as zero.

**FR-RPT-005:** Quantity aggregation must not mix incompatible units or
double-count the same portion.

**FR-RPT-006:** Repeated attempts must be handled consistently.
Recommended default: current-progress summaries use the latest attempt,
while full attempt history remains available.

**FR-RPT-007:** Draft/suggested homework must be counted separately from
confirmed homework.

**FR-RPT-008:** If reports are cached, cache invalidation/rebuild must
be reliable and results must match source calculations.

**FR-RPT-009:** Reports must identify their date range and distinguish
missing data from zero performance.

### 5.15 Parent/student access and visibility

**FR-PORT-001:** The planned core Android release must provide secure online sign-in and read-only access for students to their own published, permitted records.

**FR-PORT-002:** The planned core Android release must provide read-only access for guardians only to published records of verified linked students. Guardian contact details alone must never grant access.

**FR-PORT-003:** Teacher remarks must support explicit internal-only versus parent/student-visible visibility.

**FR-PORT-004:** Internal-only notes must be excluded server-side from APIs, app payloads, exports, and PDFs for unauthorized viewers.

**FR-PORT-005:** Guardian/student access changes and verification events must be auditable.

### 5.16 Localization

**FR-I18N-001:** The interface must provide English, Urdu script, and
Roman Urdu.

**FR-I18N-002:** English and Roman Urdu layouts must use LTR direction;
Urdu script must use RTL direction.

**FR-I18N-003:** Navigation, labels, buttons, forms, validation, empty
states, notifications, and report labels must be localized.

**FR-I18N-004:** User language preference must persist across sessions.

**FR-I18N-005:** Language switching must not alter stored domain values
or discard unsaved work.

**FR-I18N-006:** Quranic Arabic text and approved Surah/Ayat labels must
remain intact and must not be automatically translated or
transliterated.

**FR-I18N-007:** Mixed Arabic, Urdu, Roman Urdu, English, and numeric
content must remain readable in forms, tables, and reports.

**FR-I18N-008:** Roman Urdu wording should be consistent and
understandable; provide a localization glossary for common terms.

### 5.17 Printing, PDF, and data export

**FR-PDF-001:** PDF reports must use a professional default template.

**FR-PDF-002:** Madrasa Admin may customize the report logo, colors, headings, and layout within supported template controls.

**FR-PDF-003:** PDF exports must enforce the same organization, role, student/guardian visibility, and private-note restrictions as on-screen reports.

**FR-EXP-001:** Authorized users should be able to print weekly and
monthly reports in a readable layout.

**FR-EXP-002:** PDF export should preserve date ranges, section details,
quantities, statuses, and authorized remarks.

**FR-EXP-003:** Export output must enforce the same access and
visibility rules as the on-screen report.

**FR-EXP-004:** If CSV/Excel export is enabled, it must respect
organization scope and permissions.

**FR-EXP-005:** PDF fonts and direction must support Urdu and Roman Urdu
correctly if these languages are included in exports.

### 5.18 Performance analytics and AI recommendations

AI provider selection is configurable by the Madrasa Admin from the AI providers supported by the application. Admin can enable/disable AI and configure usage limits. Admin can configure the category/amount of student data eligible to be sent, subject to mandatory minimization and privacy safeguards. The MVP sends only the minimum structured metrics needed for the feature; raw student profiles, contact details, and internal notes are excluded by default.

**FR-AI-001:** The app must provide deterministic performance analytics based on source records, including Sabaq/Sabqi/Manzil progress, assigned-versus-completed quantities by compatible unit, mistakes and recorded quality trends, recurring difficult portions, and attendance context.

**FR-AI-002:** When the device has internet connectivity, the system may request AI-generated explanations and recommendations based on a minimized, permission-filtered summary of student performance data.

**FR-AI-003:** AI recommendations must be advisory. A teacher remains responsible for interpreting them and deciding whether to change teaching plans or homework.

**FR-AI-004:** AI must not invent performance facts, infer a missing quality score as zero, mix incompatible quantity units, automatically alter source records, or finalize homework.

**FR-AI-005:** AI features require internet connectivity. If offline or the AI provider is unavailable, the app must continue to offer basic local analytics and cached reports, clearly labeling them provisional when unsynchronized.

**FR-AI-006:** AI requests must follow organization authorization, data minimization, and note-visibility rules. Internal-only notes must not be sent to a student/guardian-facing AI flow; the initial recommendation flow is for authorized teachers/admins only.

**FR-AI-007:** The UI must distinguish calculated metrics from AI-generated commentary and provide a useful fallback when AI is unavailable. The system must not claim that an AI recommendation is a clinical, religious, or guaranteed educational judgment.

### 5.19 Notifications

**FR-NOT-001:** The MVP supports Android push notifications only. Email, SMS, and WhatsApp notification delivery are out of MVP scope.

**FR-NOT-002:** Notification preferences and event types must be permission-aware and must not expose private teacher notes or unauthorized student information.

**FR-NOT-003:** Notification delivery is best-effort; failures must be observable and must not block daily entry, homework, or reporting.

### 5.20 Excel import and export

**FR-XLS-001:** Authorized teachers/admins must be able to import student lists from a documented `.xlsx` template.

**FR-XLS-002:** Authorized teachers/admins must be able to import daily Hifz records from a documented `.xlsx` template, subject to field validation and supported record types.

**FR-XLS-003:** Before importing, the app must show a preview with counts of valid rows, invalid rows, and suspected duplicates; users must explicitly confirm the import.

**FR-XLS-004:** Import validation must report row and field errors without silently skipping invalid data. The import must be safely retryable and must not create duplicates on replay.

**FR-XLS-005:** Existing records must not be silently overwritten. Updates require a documented stable match key, preview of proposed changes, permission checks, and explicit confirmation.

**FR-XLS-006:** Authorized users must be able to export student lists, daily Hifz records, and weekly/monthly report data as `.xlsx` files.

**FR-XLS-007:** Export must apply the same organization, role, date-range, and note-visibility restrictions as the corresponding in-app view. Internal-only notes must not appear in student/guardian exports.

**FR-XLS-008:** Import/export events must be auditable, including actor, organization, time, operation type, and a safe summary of outcome; logs must not contain unnecessary student details.

**FR-XLS-009:** The system must treat workbook content as data only; it must not execute macros or formulas. Exported text must be handled safely to reduce spreadsheet formula-injection risks.

**FR-XLS-017:** The MVP must enforce a maximum of 1,000 students/records per import/export file as applicable. Larger datasets must be split into multiple files.

FR-XLS-010 to FR-XLS-016 (import acceptance rules) are in §15.2.

### 5.21 Audit history

**FR-AUD-001:** The system must record significant changes to daily
records, attempts, homework confirmation/revision, role assignments,
guardian links, and visibility settings.

**FR-AUD-002:** Audit events must identify actor, action, target record,
timestamp, and an appropriate change summary.

**FR-AUD-003:** Audit logs must not contain passwords, secrets, or
unnecessary sensitive data.

**FR-AUD-004:** Authorized users must be able to inspect applicable
audit history.

## 6. Data requirements

### 6.1 Core entities

-   `users`
-   `organizations`
-   `memberships`
-   `classes`
-   `class_teachers`
-   `students`
-   `student_enrollments` (if enrollment history is separated)
-   `daily_records`
-   `lesson_portions`
-   `portion_attempts`
-   `homework_assignments`
-   `homework_portions`
-   `class_schedules`
-   `holidays` or calendar exceptions
-   `student_guardians`
-   `guardian_invitations`/verified access grants
-   `report_visibility` or visibility fields on notes
-   `audit_logs`
-   optional Quran metadata and Mushaf edition/configuration tables.

### 6.2 Data model expectations

**Daily record:** organization, student, optional class, date,
attendance status, recorder, teacher notes, timestamps.

**Lesson portion:** daily record, section type, Para, optional
Surah/Ayat range, assigned/completed quantity, unit, mistakes, quality,
performance status, remarks.

**Portion attempt:** daily record and lesson portion, optional homework
portion, attempt time, recorder, assigned quantity snapshot, completed
quantity, unit, status, mistakes, quality, remarks, and optionally a
clearly defined remaining-quantity snapshot.

**Homework assignment:** organization, student, optional class, source
daily record if relevant, assigned date, due date, status, instructions,
creator, confirmer, confirmation time, timestamps.

**Homework portion:** assignment, section type, Para/range, assigned
quantity, unit, status, source homework portion and/or source attempt,
instructions, timestamps.

**Membership:** organization, user, role, status, timestamps.

**Audit log:** organization, actor, entity type/ID, action, timestamp,
safe change summary.

### 6.3 Integrity requirements

-   Use primary keys, foreign keys, appropriate unique constraints, and
    indexes.
-   One logical daily record per organization/student/date is the
    default unless multi-session support is approved.
-   Quantity and status combinations must be validated on the server.
-   Preserve historical data on deactivation or membership removal.
-   Avoid cascading deletes that erase audit/history unexpectedly.
-   Tenant-owned records must be organization-scoped and
    authorization-checked.
-   Confirmed assignments and attempts must remain traceable.

## 7. Non-functional requirements

### 7.1 Security

**NFR-SEC-001:** All protected actions require server-side
authorization.

**NFR-SEC-002:** Production traffic must use HTTPS.

**NFR-SEC-003:** Authentication must use secure session handling, rate
limiting where appropriate, and safe password-reset behavior.

**NFR-SEC-004:** Secrets must be kept out of source control and client
bundles.

**NFR-SEC-005:** Database access must use least-privilege credentials
and secure connection settings.

**NFR-SEC-006:** The application must defend against common web
vulnerabilities, including unauthorized object access, injection,
cross-site scripting, cross-site request forgery where applicable, and
brute-force attacks.

**NFR-SEC-007:** Student and guardian data must be protected from
cross-tenant exposure.

### 7.2 Privacy

**NFR-PRV-001:** Collect only information necessary for the product's
defined functions.

**NFR-PRV-002:** Establish retention, export, deletion, and backup
policies before production.

**NFR-PRV-003:** Use synthetic or anonymized student data in demos and
tests.

**NFR-PRV-004:** Internal teacher notes must remain private to
authorized roles.

### 7.3 Usability and accessibility

**NFR-UX-001:** Daily entry must be optimized for Android phone and tablet screens. Desktop
layouts are out of MVP scope.

**NFR-UX-002:** Forms must have labels, validation feedback, keyboard
accessibility, and visible focus.

**NFR-UX-003:** The interface must provide understandable loading,
empty, success, and error states.

**NFR-UX-004:** Bulk entry must show row-level errors and preserve valid
user input when an unrelated row fails.

**NFR-UX-005:** RTL/LTR and mixed-script behavior must be tested.

### 7.4 Performance

**NFR-PERF-001:** Student lists, daily records, homework lists, and
audit lists must use pagination when needed.

**NFR-PERF-002:** Report queries must avoid N+1 query patterns and use
appropriate indexes.

**NFR-PERF-003:** Bulk writes and homework confirmation must use
transactions where consistency requires them.

**NFR-PERF-004:** Any cached reports must be reproducible and
invalidated when source records change.

**NFR-PERF-005:** Establish measurable response-time targets after
expected user, student, and record volumes are estimated.

### 7.5 Reliability and recoverability

**NFR-REL-001:** Production must have automated database backups
appropriate to the chosen host.

**NFR-REL-002:** A documented restore procedure must be tested.

**NFR-REL-003:** Failed writes must not leave partially confirmed
assignments or orphaned records.

**NFR-REL-004:** Application and database errors must be logged without
leaking secrets or private student information.

### 7.6 Maintainability

**NFR-MNT-001:** Domain rules must be centralized in reusable
server-side services.

**NFR-MNT-002:** Database schema changes must use versioned migrations.

**NFR-MNT-003:** Canonical enum values and stored domain data must be
independent of UI language.

**NFR-MNT-004:** Tests must cover quantity math, status semantics,
authorization, homework lifecycle, reports, and localization.

### 7.7 Compatibility

**NFR-COMP-001:** The Android app must support the minimum Android version and device matrix selected before implementation; compatibility must be tested on physical devices and emulators.

**NFR-COMP-002:** Urdu script, Roman Urdu, Arabic Quranic text, and
Latin text must render correctly with suitable fonts and direction
handling.

## 7.8 Offline operation and synchronization requirements

**NFR-OFF-001:** Authorized teachers must be able to create and edit locally available daily records, Sabaq/Sabqi/Manzil portion attempts, attendance entries, and draft homework without an active internet connection.

**NFR-OFF-002:** Every successful offline save must be persisted transactionally on-device before the UI reports it as saved. Force-closing or restarting the app must not lose saved pending changes.

**NFR-OFF-003:** The app must display sync status for queued records and distinguish saved locally, syncing, synchronized, and action-required/conflict states.

**NFR-OFF-004:** Sync retries must be safe and idempotent. Replaying the same operation must not duplicate daily records, attempts, attendance, or homework portions.

**NFR-OFF-005:** The sync protocol must support dependency ordering, incremental pull using a cursor/version, server acknowledgements, retry with backoff, and schema/protocol versioning.

**NFR-OFF-006:** Concurrent edits must not silently overwrite meaningful teaching data. Conflicts must preserve the local draft and server version and require explicit resolution or a documented safe merge.

**NFR-OFF-007:** The app must provide a recoverable error state for failed sync, invalid/obsolete payloads, expired sessions, revoked access, and conflicts; pending changes must remain visible until safely resolved or explicitly discarded by an authorized user.

**NFR-OFF-008:** Offline report summaries must be marked provisional and show the last successful synchronization time and pending-change count. Online server-calculated reports are authoritative.

**NFR-OFF-009:** Local database upgrades must be tested with pending changes. An upgrade must not discard the outbox or corrupt queued records.

**NFR-OFF-010:** Cached personal/student data must be minimized, protected by the platform's application sandbox, and governed by a documented retention and revocation policy. The app must reconcile authorization when reconnecting and must not sync data for a workspace the account is no longer authorized to access.

## 7.9 AI and Excel availability requirements

**NFR-AI-001:** AI recommendations require an active internet connection; the app must not imply that AI is running locally when offline.

**NFR-AI-002:** Basic deterministic analytics and locally cached reports must remain available offline using data available on the device, with a provisional/stale-data label where appropriate.

**NFR-AI-003:** AI requests must use the minimum necessary student data, use authenticated server-side authorization, and avoid sending internal notes unless an explicitly approved teacher-only use case requires them.

**NFR-AI-004:** AI output must be treated as untrusted suggestions and validated for structure, relevance to supplied metrics, and safe display. It cannot write directly to authoritative records.

**NFR-XLS-001:** Excel workflows must validate file type, workbook structure, required columns, field types, enum values, date formats, and row counts before writing data.

**NFR-XLS-002:** Excel imports/exports must enforce permissions and tenant isolation server-side where API processing is involved and on-device for locally prepared files.

**NFR-XLS-003:** Import previews must be understandable in English, Urdu script, and Roman Urdu, including clear row/field error messages.

**NFR-XLS-004:** Export files must preserve identifiers, dates, quantity units, status values, and language content without converting Arabic Quranic text or canonical enum values.

## 7.10 Student and guardian online access requirements

**NFR-PORT-001:** The planned core release must provide secure online sign-in for students and verified guardians, with a role-restricted read-only experience.

**NFR-PORT-002:** A student may view only their own published, permitted reports and records.

**NFR-PORT-003:** A guardian may view only published, permitted records for explicitly verified linked students. Guardian contact information alone must never grant access.

**NFR-PORT-004:** Teacher/admin users must be able to control whether supported notes are internal-only or visible to the student/guardian. Internal-only notes must be excluded server-side from unauthorized API responses, app views, exports, and PDFs.

**NFR-PORT-005:** Sign-in, guardian linking/verification, password reset, permission changes, and fetching fresh reports require connectivity in the initial release. Student/guardian offline report caching is not required for MVP.

**NFR-PORT-006:** Access grants, invitation/verification events, revocations, and sensitive report access must be auditable. Revoked access must be rejected by the server on subsequent requests and synchronization.

## 8. Interface requirements

### 8.1 Planned Android app screen inventory

1.  App launch, sign-in (User ID + password), forgot-password/reset-password (email OTP), and session-expired screens. There is no self sign-up for Teacher, Student, or Parent accounts; the Madrasa Admin creates them (FR-AUTH-009).
2.  Onboarding and workspace setup (individual teacher or madrasa).
3.  Dashboard.
4.  Organization settings and membership/roles.
5.  Classes and teacher assignments.
6.  Student list and student detail/progress timeline.
7.  Timetable/calendar/holidays and attendance.
8.  Individual daily entry.
9.  Bulk class attendance entry (Present/Absent only).
10. Daily record detail/edit and attempt history.
11. Homework list/detail.
12. Suggested homework review/edit/confirm.
13. Weekly report.
14. Monthly report.
15. Print/PDF report view.
16. Student/guardian sign-in, verified linking, published report views, and permission-filtered notes.
17. User profile, language, timezone, and security settings.
18. Authorized audit history.


Additional mobile-specific screens required:
- Offline/sync status and pending-change queue.
- Conflict review and resolution.
- Local data/cache status and sign-out warning when unsynced changes exist.
- Role-specific student/guardian dashboard and published report detail.
- Network unavailable, session expired, permission revoked, and retry states.

### 8.2 Daily-entry usability

The teacher should be able to select a student/date/class, enter Sabaq,
add one or more Sabqi and Manzil portions, record actual performance and
mistakes, save notes with correct visibility, and view a suggested next
homework. The bulk workflow records attendance only: Present or Absent
for each student in a class grid, with no Hifz portion, mistake, quality,
or excused-absence fields (FR-DAY-002A). Excused absence is marked on the
individual record and approved by the Madrasa Admin.

### 8.3 Error handling

Validation must explain which field/portion needs correction. Network or
server failure must not falsely show a save as successful. If a bulk
operation partially succeeds, the outcome must be explicit and
retry-safe.

## 9. Business rules

1.  Sabaq, Sabqi, and Manzil are independent sections.
2.  Sabqi and Manzil can contain multiple independently tracked Para
    portions.
3.  Salasah means exactly three-quarters (3/4) of a Para.
4.  Quantity must always include its unit.
5.  Remaining quantity is calculated only for compatible units and the
    same portion.
6.  Absence is not failed recitation.
7.  Holidays and unscheduled dates are not absences.
8.  Weekly/monthly reports are derived from daily source records.
9.  A suggested homework assignment is not final until teacher
    confirmation.
10. Past homework and attempts remain in history.
11. Corrections recalculate unconfirmed suggestions and derived reports,
    but never silently rewrite confirmed homework.
12. Parent/student access requires authorization and verified linking.
13. Internal-only notes are excluded from unauthorized outputs.
14. English and Roman Urdu use LTR; Urdu script uses RTL.
15. Quranic Arabic must remain intact.
16. Repeated attempts must not be double-counted as separate assigned
    portions in aggregate progress.
17. Missing data is not the same as zero performance.

## 10. Acceptance criteria and test scenarios

### 10.1 Quantity and portion tests

-   **AC-QTY-01:** Selecting Salasah stores/displays 3/4 Para.
-   **AC-QTY-02:** 10 assigned lines and 6 completed lines yield 4
    remaining lines.
-   **AC-QTY-03:** 3/4 Para assigned and 1/2 Para completed for the same
    portion yields 1/4 Para remaining.
-   **AC-QTY-04:** The system refuses to add lines and Para fractions
    into one total without a defined conversion.
-   **AC-QTY-05:** Completed quantity cannot exceed assigned quantity
    without an explicitly supported separate extra-work portion.
-   **AC-QTY-06:** Multiple Manzil Paras can show different statuses
    without overwriting one another.

### 10.2 Status and attendance tests

-   **AC-ATT-01:** Not remembered records zero completed quantity by
    default and the applicable full remaining quantity.
-   **AC-ATT-02:** Absent is not counted as not remembered or zero
    quality.
-   **AC-ATT-03:** Not assigned and pending are not counted as failed
    work.
-   **AC-ATT-04:** A holiday/no-class day is not counted as absent.
-   **AC-ATT-05:** A repeated attempt preserves the earlier attempt
    record.

### 10.3 Homework tests

-   **AC-HW-01:** An incomplete portion produces a remaining-quantity
    suggestion.
-   **AC-HW-02:** A teacher can edit/remove/add portions before
    confirming.
-   **AC-HW-03:** No suggestion becomes confirmed without explicit
    teacher confirmation.
-   **AC-HW-04:** Confirmed homework stores confirmer and timestamp.
-   **AC-HW-05:** A new assignment does not overwrite earlier homework.
-   **AC-HW-06:** Editing source performance recalculates unconfirmed
    suggestions.
-   **AC-HW-07:** Editing source performance does not silently modify
    confirmed homework.
-   **AC-HW-08:** A carry-forward portion links to its source
    portion/attempt where possible.
-   **AC-HW-09:** Absent/not-assigned/pending work is not automatically
    treated as failed work.

### 10.4 Report tests

-   **AC-RPT-01:** Weekly and monthly reports match calculations from
    source records.
-   **AC-RPT-02:** Editing a daily record changes affected report
    totals.
-   **AC-RPT-03:** Missing quality is excluded from average quality.
-   **AC-RPT-04:** Different quantity units are not combined.
-   **AC-RPT-05:** Repeated attempts do not double-count assigned work.
-   **AC-RPT-06:** Draft/suggested homework is separate from confirmed
    homework.
-   **AC-RPT-07:** Report boundaries follow configured timezone and
    week-start day.
-   **AC-RPT-08:** Holidays, Sundays without scheduled classes, and
    no-class dates remain distinct from absence.

### 10.5 Security and privacy tests

-   **AC-SEC-01:** A teacher in Organization A cannot access
    Organization B records by changing a URL or API ID.
-   **AC-SEC-02:** A teacher cannot access unassigned students unless
    permission allows it.
-   **AC-SEC-03:** A guardian can only access verified linked students.
-   **AC-SEC-04:** Internal-only notes do not appear in guardian/student
    APIs, page payloads, print views, or PDFs.
-   **AC-SEC-05:** Removing membership revokes future access without
    erasing historical audit records.

### 10.6 Localization tests

-   **AC-I18N-01:** English interface is LTR.
-   **AC-I18N-02:** Urdu script interface is RTL.
-   **AC-I18N-03:** Roman Urdu interface is LTR and all key UI strings
    are localized.
-   **AC-I18N-04:** Language preference persists after sign-out/sign-in.
-   **AC-I18N-05:** Changing language does not erase unsaved form data
    or alter canonical stored statuses.
-   **AC-I18N-06:** Arabic Quran text and mixed numeric ranges render
    correctly.

### 10.7 AI analytics and Excel tests

-   **AC-AI-01:** With no internet connection, daily entry and basic local analytics continue to work; AI recommendations show as unavailable rather than fabricated.
-   **AC-AI-02:** Offline summaries display a provisional/stale indicator and last successful sync time when applicable.
-   **AC-AI-03:** Online AI recommendations reference only available, authorized metrics and do not change records or finalize homework.
-   **AC-AI-04:** AI-provider timeout does not block recording, standard reports, or synchronization.
-   **AC-XLS-01:** A valid student template imports after preview and confirmation.
-   **AC-XLS-02:** Invalid columns, malformed dates, invalid statuses, and duplicate keys produce row-level messages.
-   **AC-XLS-03:** Repeating the same import does not duplicate previously imported students or records.
-   **AC-XLS-04:** Existing records are not overwritten without an explicit update preview and confirmation.
-   **AC-XLS-05:** Student, daily-record, and report exports respect tenant scope and permissions.
-   **AC-XLS-06:** Internal-only notes are excluded from student/guardian exports, and exported text is safe against spreadsheet formula execution.

### 10.8 End-to-end scenario

1.  Teacher creates a class and student.
2.  Teacher records a daily Sabaq portion and multiple Sabqi/Manzil
    portions.
3.  Student recites part of the assigned work; teacher records completed
    quantity, mistakes, quality, and status.
4.  System calculates remaining quantity and drafts a next-class
    homework suggestion.
5.  Teacher reviews and confirms the homework.
6.  At the next class, teacher records an attempt linked to the homework
    portion.
7.  Weekly/monthly reports update from source data.
8.  A teacher corrects an earlier daily record; reports and unconfirmed
    suggestions recalculate, while confirmed homework remains unchanged
    unless explicitly revised.
9.  An authorized guardian sees only permitted, published records if
    portal access is enabled.

## 11. Traceability overview

  -----------------------------------------------------------------------
  Requirement area        Main entities/modules   Key test groups
  ----------------------- ----------------------- -----------------------
  Authentication/roles    users, memberships,     SEC
                          auth services           

  Classes/students        classes, students,      class/student CRUD and
                          enrollments             authorization

  Daily entry             daily_records,          DAY, SAB, SBQ, MNZ
                          lesson_portions         

  Attempts/quantity       portion_attempts,       QTY, ATT
                          quantity service        

  Homework                homework_assignments,   HW
                          homework_portions       

  Calendar/attendance     class_schedules,        ATT and CAL
                          holidays, daily_records 

  Weekly/monthly reports  report service and      RPT
                          source entities         

  Guardian visibility     student_guardians,      SEC and PORT
                          visibility rules        

  Localization            locale resources and    I18N
                          direction layer         

  Audit                   audit_logs              AUD and SEC
  -----------------------------------------------------------------------

## 12. Implementation phases (planning proposal)

### Phase 0 --- Requirements and design lock

Confirm the implementation-level gates in Section 13: authentication provider, detailed role matrix, PDF fonts/layout, AI provider budgets, retention, Android/device support, local cache/app lock, hosting/capacity, test gates, and push-provider operations. Product choices listed in Section 16 are already finalized.

### Phase 1 --- Foundation

Project setup, database migrations, authentication,
organization/workspace model, membership roles, localization framework,
and secure authorization.

### Phase 2 --- Class and student management

Classes, teachers, student profiles/enrollment, timetable, holidays, and
attendance.

### Phase 3 --- Daily Hifz recording

Sabaq/Sabqi/Manzil forms, multiple portions, quantity validation,
performance statuses, attempts, individual entry, and bulk entry.

### Phase 4 --- Structured homework

Homework assignment/portion model, remaining-quantity calculation,
carry-forward suggestions, review/edit/confirm workflow, and audit
history.

### Phase 5 --- Reports

Weekly/monthly derived reports, filters, correction-driven
recalculation, print view, and PDF support.

### Phase 6 --- Read-only access and exports

Verified guardian/student linking, field-level note visibility, Excel student/record import and student/record/report export, import preview/error recovery, and audit events.

### Phase 7 --- Analytics and AI recommendations

Deterministic analytics and offline summaries first; then online AI recommendations, provider-failure fallback, privacy review, and teacher acceptance tests. AI must not block core workflows.

### Phase 8 --- Hardening and launch

Authorization/security tests, localization/RTL tests, performance
checks, backups/restore, monitoring, staging acceptance, and production
deployment.

Phases are a proposal and should not be executed until the user
explicitly asks to begin implementation.

## 13. Remaining decisions and implementation gates

The product-level questionnaire decisions through Q139 are recorded in Section 16. The following items remain implementation/design gates; they are not reasons to repeat already answered product questions:

1. Select the concrete authentication provider/library and configure email OTP delivery, secure sessions, rate limits, and recovery controls. User-facing login/account rules are already fixed. Also decide whether 2FA and recovery codes (mentioned in §16.5) are part of MVP; no other MVP requirement defines them.
2. Approve the detailed role/permission matrix for Owner, Madrasa Admin, Teacher, Student, and Parent/Guardian, including account creation and report visibility.
3. Choose the Quran metadata data-entry governance and validation workflow (Admin-managed data is decided; external provider selection is not required for MVP).
4. Finalize PDF font stack and page-break/layout details for English, Urdu RTL, Roman Urdu, and Arabic Quran text; the default template plus Admin customization is decided.
5. Select the AI provider integration(s) supported at launch and set explicit monetary/token/request budgets. Admin-selectable provider, enable/disable, usage limits, and privacy controls are decided.
6. Set data retention, deletion, backup retention, account closure, and data-export policy before production.
7. Set minimum Android version/device matrix and distribution/release channel.
8. Set local cache retention, device PIN/biometric app-lock policy, and offline revocation handling.
9. Confirm hosting/region, expected concurrent users/data volumes, service-level targets, and measurable performance thresholds.
10. Finalize technical quality gates: CI commands, API/FILE/DEVICE test checks, Android UI automation (including Maestro if selected), and test-control mechanism.
11. Define push-notification event catalogue, consent/preferences, provider, delivery retries, and token lifecycle. Channel choice is Android push only.
12. Reconcile the approved attendance policy with any implementation surfaces that currently allow bulk excused-absence entry; bulk entry remains Present/Absent only, and excused absence is a teacher mark followed by Admin approval.
13. Decide whether Teachers may import student lists (FR-XLS-001), given that only the Madrasa Admin creates student accounts (FR-AUTH-009).

No assumption is made that these implementation details have already been selected. The app remains planning-only; no code or deployment work is authorized by this document.

## 14. Completion definition

The SRS is implementation-ready when every MVP requirement has an agreed
behavior, quantity/status rules are tested, the role/permission matrix
is approved, report formulas and attempt aggregation are explicit,
localization is designed, and open schema/security decisions are
resolved. This file is a planning specification only; no code or
database changes are implied.


## 15. Finalized planning milestone decisions (2026-10-15)

These decisions clarify the initial workbook contract, import safety, AI behavior, and offline sync. They are requirements for future implementation, not evidence of implemented functionality.

### 15.1 Excel template contract

**Student template/export (`Students` sheet):** `ExternalStudentID`, `StudentName` (required), `ClassName` (optional), `AdmissionDate` (optional `YYYY-MM-DD`), `Status` (optional supported enum), and `Notes` (optional; private teacher/admin data). Internal database IDs are generated by the app. Student names alone must never be used as update keys.

**Daily Hifz template/export (`DailyRecords` sheet):** `ExternalRecordID` (optional stable key), `ExternalStudentID` (required and mapped to a student in the active organization), `RecordDate` (`YYYY-MM-DD`), `SessionLabel` (required when the madrasa uses multiple-session mode; otherwise optional/not applicable), `SectionType` (`SABAQ`, `SABQI`, `MANZIL`), `PortionNumber`, `ParaNumber` where applicable, optional `SurahStart`, `AyahStart`, `SurahEnd`, `AyahEnd`, `AssignedQuantity`, `CompletedQuantity`, `QuantityUnit`, optional `MistakeCount`, `PerformanceStatus`, optional `QualityRating`, and optional `TeacherNotes`.

- One row represents one portion; multiple portion rows can belong to one logical daily record.
- Supported quantity units include `RUBU`, `HALF`, `SALASAH`, `COMPLETE`, `LINES`, `AYAT`, and `PAGES`. Incompatible units must not be added or compared without an approved conversion.
- `PerformanceStatus` is one of `COMPLETED`, `PARTIAL`, `NOT_REMEMBERED`, `ABSENT`, `NOT_ASSIGNED`, or `PENDING`. Attendance and performance remain distinct.
- Missing mistake count or quality means unknown/not recorded, not zero. QualityRating is an optional integer from 1 to 5; missing means unknown, not zero. The workbook stores the numeric score; labels follow FR-ATT-009.
- `MistakeCount` is a single uncategorized total. The app records mistakes by category, severity, and repeated flag (FR-ATT-010), so an imported `MistakeCount` is stored as an uncategorized count on the attempt and shown separately from categorized mistakes in reports. It is never split into categories automatically.
- Template documentation must include a version and examples. Import treats workbook contents as data only and never executes macros/formulas. Exported text must be protected against spreadsheet formula injection.

**Weekly/monthly report export:** Reports are generated from source records and include report type, date range, organization timezone, selected filters, generated timestamp, and a flag indicating pending offline changes. Report aggregates are outputs only; report sheets are not accepted as authoritative daily-record imports in the initial release.

### 15.2 Excel import acceptance rules

**FR-XLS-010:** Before writing data, the app must validate template version, required columns, types, supported enums, quantity/status rules, student/class mappings, and configured file/row limits.

**FR-XLS-011:** The preview must identify new rows, exact matches, suspected duplicates, invalid rows, and proposed updates, with row/field-level errors and a final explicit confirmation.

**FR-XLS-012:** Default import mode must be add-new-only. Existing data must not be silently overwritten. Updating existing data requires a stable external key, explicit user-selected update mode, and a field-level before/after preview. Matching by name alone is prohibited.

**FR-XLS-013:** Re-importing a confirmed workbook with stable external keys must not create duplicates. Without a stable key, composite fields may flag likely duplicates for human review but must not silently establish identity.

**FR-XLS-014:** Imports must commit in bounded batches, record an import job ID, report exactly which rows succeeded/failed, and support safe retry without duplicating committed rows.

**FR-XLS-015:** All imported records must be authorized against the signed-in user's active organization on the server. A workbook cannot grant or select tenant access by supplying an organization ID.

**FR-XLS-016:** Import/export actions must be auditable with actor, organization, timestamp, operation, and safe outcome summary, without logging unnecessary student details. Imported historical edits must recalculate derived reports; confirmed homework must not be silently rewritten.

### 15.3 AI recommendations acceptance rules

**FR-AI-008:** AI requests must use a minimized structured summary of authorized performance metrics and trends. The initial recommendation flow must not require raw workbooks, contact details, or teacher notes.

**FR-AI-009:** AI output must distinguish evidence-based observations from suggestions, state when data is insufficient, and reference the relevant date range/metrics. It must not fabricate scores, mistake counts, or progress facts.

**FR-AI-010:** AI recommendations are advisory and require teacher/admin review. AI must not modify source records, finalize homework, or make automatic high-impact student decisions.

**FR-AI-011:** The app must enforce configurable timeouts, rate limits, request budgets, and provider-failure fallback. If offline, the provider is unavailable, or a limit is reached, local deterministic analytics and cached reports must remain usable and clearly show freshness/sync status.

**FR-AI-012:** The AI provider must be selected only after comparing privacy/data-processing terms, retention/training controls, security, reliability, structured-output support, latency, and cost. The provider and explicit monetary caps remain pre-implementation decisions.

### 15.4 Offline synchronization acceptance rules

**FR-SYNC-006:** Offline-created/edited records must have stable client-generated IDs and durable queued operations. Retrying an operation must not create duplicate records or attempts.

**FR-SYNC-007:** Synchronization must process dependencies in order and expose pending, syncing, synced, failed, and action-required states. A local save must not be represented as server-synced until server acknowledgement.

**FR-SYNC-008:** Conflicting edits to meaningful fields must preserve both versions and require an authorized resolution flow unless a documented safe merge applies. Last-write-wins must not silently overwrite recitation attempts, attendance, or confirmed homework.

**FR-SYNC-009:** Corrections to recitation attempts must be auditable. Access revocation must stop future server access/sync and lock or remove newly unauthorized cached data when the device next learns of the revocation, under an approved cache-retention policy.

### 15.5 Milestone completion checklist

- [x] Android-first app with offline teacher entry and later synchronization.
- [x] Individual teacher and madrasa workspaces.
- [x] Secure online read-only Student/Parent access through Android only in MVP.
- [x] English, Urdu script, and Roman Urdu; Asia/Karachi timezone; Monday week start.
- [x] User ID + Password login; email OTP password recovery; Admin-created Teacher/Student/Parent accounts.
- [x] Admin-configurable one-report-per-day or multiple-session daily-report mode.
- [x] Attendance-only Bulk Entry (Present/Absent); individual Daily Entry for Hifz portions and quality.
- [x] Four overall performance labels; optional 1–5 quality rating with the approved named scale (FR-ATT-009); detailed mistake categories, severity, and repeated flag.
- [x] Teacher-marked, Admin-approved excused absence.
- [x] Admin-managed Quran metadata and standard 15-line Mushaf for MVP.
- [x] Professional default PDF with Admin customization.
- [x] Excel maximum 1,000 students/records per file as applicable; append-first validated import.
- [x] Admin-selectable AI provider, AI enable/disable, usage limits, and privacy controls.
- [x] Android push notifications only.
- [x] Offline sync conflict preservation and explicit resolution behavior.
- [ ] Resolve implementation gates listed in Section 13 before affected production implementation.

This checklist records planning decisions, not completed software functionality. No implementation has been performed or authorized by this document alone.

## 16. Consolidated finalized decisions (through Q139, 2026-10-30)

This register supersedes conflicting earlier draft statements in this document. It records user-confirmed product decisions; implementation provider choices explicitly listed in Section 13 remain open.

### 16.1 Identity and account lifecycle (Q117–Q126)

- Login identifier is unique **User ID + Password**; email is not the login identifier.
- Password recovery uses an OTP sent to the registered email; after OTP verification the user sets a new password.
- Email verification is not required to activate accounts.
- Madrasa Admin creates Teacher, Student, and Parent accounts and manually sets their initial passwords. Teachers can only be created by Madrasa Admin.
- Users are not forced to change admin-provided passwords at first login.
- Student and Parent accounts may share the same email but must have distinct User IDs and passwords.
- A person belonging to multiple madaris has a separate account/User ID for each madrasa.

### 16.2 Daily records, performance, and attendance (Q127–Q130)

- Madrasa Admin selects daily-report mode: one report per student/date or separate reports for multiple sessions. Default is one report per student/date.
- Overall Hifz performance label: Excellent, Good, Average, Needs Improvement.
- Per-portion quality rating: optional integer 1–5; missing is unknown, never zero.
- Quality Rating Scale (approved 2026-10-30, FR-ATT-009; lower is better): 1 Excellent (ممتاز, Mumtaz), 2 Good (اچھا, Achha), 3 Average (اوسط, Ausat), 4 Needs Improvement (مزید محنت کی ضرورت, Mazeed mehnat ki zaroorat), 5 Weak (کمزور, Kamzor). Averages take the label of the nearest whole score, with .5 rounding up. It is teacher-recorded, never assigned by AI, and the same mapping is used everywhere. The four-level overall label remains separate and is not derived from the quality score.
- Mistake categories: Harkaat, Tajweed, Lafzi, Ayat bhoolna, Tarteeb, Waqf/Ibtida. Each mistake supports Minor/Major severity and a separate repeated flag.
- Teacher may mark an absence as excused; Madrasa Admin approves it. Reports separate Excused Absence and Normal Absence.
- Bulk Entry is strictly attendance-only: Present/Absent. Hifz portions, listening/recitation, mistakes, and quality are entered per student through individual Daily Entry.

### 16.3 Quran reference, Mushaf, reports, and access (Q131–Q135)

- Quran metadata (Surah, Ayat, Para) is managed by Madrasa Admin, who can add/edit the reference information used by teachers.
- MVP supports standard 15-line Mushaf only.
- PDF reports use a professional default template; Admin can customize logo, colors, headings, and layout.
- Student and Parent use the Android app only; no separate web portal in MVP. Access remains read-only and permission-scoped.
- Excel import/export limit: maximum 1,000 students/records per file as applicable; larger data must be split into multiple files.

### 16.4 AI and notifications (Q136–Q139)

- AI provider is selectable by Admin from providers integrated/supported by the application.
- Admin can enable/disable AI and configure usage limits.
- Admin can configure what categories/amount of student data may be shared with the AI provider, subject to privacy safeguards, data minimization, and the rule that contact details and internal notes are excluded by default.
- Notifications: Android push notifications only. Email, SMS, and WhatsApp notifications are not included in MVP.

### 16.5 Previously finalized foundational decisions

- Product name: HifzAmanah.
- Android-first app; teacher workflows work offline and sync later. Basic deterministic reports/analytics use locally available data and are marked provisional when unsynced. AI recommendations require internet.
- Supported languages: English, Urdu script, and Roman Urdu. Urdu uses RTL; English and Roman Urdu use LTR.
- Default timezone: `Asia/Karachi`; week starts Monday.
- Teacher selects the report date. Report date is distinct from local save time and server sync time; late sync must not change the report date.
- Recovery-code regeneration, where applicable, requires recent authentication and 2FA, invalidates previous codes, and is audited; suspicious recovery requests require stronger identity/security review.
- Offline sync uses stable client UUIDs, idempotent operations, explicit conflict handling, and preserves both versions for meaningful conflicts rather than silent last-write-wins.
- Excel imports are previewed, validated, append-first, and never silently overwrite existing data; report exports are derived read-only outputs.
- AI is advisory only: it cannot alter source records, calculate authoritative quantities, assign final grades, confirm homework, or make access/discipline decisions. Teacher review is required.

### 16.6 Questionnaire status

- Product decision questionnaire: **Q1–Q139 recorded in the available planning history; Q139 is finalized as Android push notifications only.**
- The product-level questions previously listed as open in earlier drafts are now resolved by the decisions above, except where Section 13 explicitly identifies a technical implementation gate (for example provider/library, monetary caps, retention policy, role-permission detail, and device support).
- This status does not mean the app is implementation-ready: Section 13 gates and the completion definition in Section 14 must still be addressed before coding/production.
