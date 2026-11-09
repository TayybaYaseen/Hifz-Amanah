# HifzAmanah --- Software Requirements Specification (SRS)

**Document type:** Software Requirements Specification\
**Status:** Consolidated planning baseline; not implemented\
**Version:** 1.18\
**Last updated:** 2026-11-09\
**Changes in 1.18:** The product owner decided OD-QR-7 (offline reference data comes as a versioned snapshot from the HifzAmanah API after the first online sign-in, DEC-B75), OD-QR-10 (Para quantities only; Rubu, Half, Salasah, and Complete are never converted into Ayat or line positions, DEC-B76), and OD-QR-11 (Total Lines counts Ayat lines only, DEC-B77; teacher consultation recommended before production rollout). DEC-B78 fixes the verification boundary: automated validation covers the digital structure, and comparison with the physical Taj Mushaf is a human review that the system records. DEC-B79 sets the licence-withdrawal rule for snapshots. Changed: FR-SAB-012, FR-SAB-013, FR-SAB-014, FR-QTY-002 (annotations), and §17.3. No dataset, licence, or physical verification is approved.\
**Changes in 1.17:** The product owner approved ADR-017 and FR-SAB-011…014 (§17 DEC-B72), decided that a Sabqi/Manzil range need not lie within its Para (DEC-B73, closes OD-QR-12), and moved page/line selection (FR-SAB-015) out of the MVP (DEC-B74, closes OD-QR-8). The delivery mechanism of FR-SAB-014 (OD-QR-7), OD-QR-10 and OD-QR-11 stay open. No dataset, licence, or physical verification is approved.\
**Changes in 1.16:** The product owner decided that the **Taj Company** edition is the primary target publisher (§17 DEC-B71). The Indo-Pak 16-line profile is the candidate target. The exact printing, the page count (548 is a candidate from QUL resource 11), and the page/line mapping stay unverified until checked against a physical Taj Mushaf from the target madaris. The F06 MVP priorities are recorded: Surah, Ayat, and Para metadata, the Taj edition profile, the verified layout, and the offline snapshot. Ruku, Hizb, quarter-Hizb, and seven-Manzil divisions are later-phase candidates (OD-QR-5 closed). Licensing is unchanged: everything is still `LICENSE_REVIEW_REQUIRED`, and Taj Company permission is now an explicit prerequisite. Changed: FR-SAB-006, FR-SAB-011 and FR-SAB-013 (the last two proposed), §1.5, and §17.3. No approved quantity, Sabaq, Sabqi, Manzil, or homework rule changed.\
**Changes in 1.15:** Quran reference data research and design (2026-11-09). Added **proposed** requirements FR-SAB-011…015 (provenance and licence gate, layout line structure, import validation and sign-off, offline reference snapshot, page/line selection). They are **not approved**; the design is ADR-017 (Proposed). §1.5 now separates a one-time reviewed seed import from a runtime provider. §17.3 lists open decisions OD-QR-1…11. No approved requirement changed.\
**Changes in 1.14:** The target Mushaf is the **16-line Indo-Pak (South Asian) Mushaf** (§17 DEC-B70), replacing the standard 15-line Mushaf. The exact publisher/edition, the Quran metadata dataset, its licence approval, the verified page/line layout source, and the reviewer stay open (§17.3). Editions are data, so more can be added later; each madrasa counts lines on one edition. Changed: FR-SAB-006…008, the §1.5 Mushaf line, the §15/§16 Mushaf lines, and the DEC-B31 and DEC-B64 rows. No other requirement changed.\
**Changes in 1.13:** Register rows DEC-B65…B69, decided while implementing F01: session lifetime, recent sign-in, progressive sign-in delay, embedded Postgres for local runs, and the current password for an email change. No requirement text changed.\
**Changes in 1.12:** Sabaq is now measured in lines over one Surah's Ayat range (§17 DEC-B60…B64). Para-fraction options (Rubu, Half, Salasah, Complete) are not offered for Sabaq. Sabqi and Manzil are unchanged.
- New requirements: FR-SAB-008…010, FR-QTY-010, FR-HW-018; business rule §9 #18; acceptance tests AC-QTY-07/08, AC-HW-10, AC-XLS-07.
- Changed requirements: FR-SAB-001…004, FR-QTY-001/002, FR-HW-002/005, FR-SBQ-003 (note only), and §1.5, §6.2, §8.2, §10.8, §15.1.\
**Changes in 1.11:** Every open decision was closed in the product-owner review of 2026-10-30. The new §17 is the decision register.
- Two items are Deferred: the Android application ID and the AI provider vendor.
- New requirements: FR-AUTH-012…016, FR-ORG-007, FR-CLS-003, FR-STU-005/006, FR-CAL-007…010, FR-DAY-010/011, FR-QTY-009, FR-ATT-011/012, FR-SAB-007, FR-HW-016/017, FR-RPT-010/011, FR-PORT-006/007, FR-I18N-009, FR-PDF-004, FR-AI-013/014, FR-NOT-004, FR-XLS-018, NFR-PRV-005, NFR-PERF-006, NFR-OFF-011, NFR-MNT-005.
- Changed requirements: FR-SEC-003, FR-ORG-001/006, FR-CLS-001, FR-STU-001, FR-CAL-005, FR-DAY-001/002A/009, FR-QTY-006, FR-HW-004/012, FR-MNR-006, FR-RPT-006, FR-PDF-002, FR-EXP-004/005, FR-AI-012, FR-XLS-001, FR-SYNC-008, FR-AUD-004, NFR-PERF-001, NFR-COMP-001, and §2.1, §3.2, §3.5, §4.1, §6.3, §8.1, §8.2, §10.8, §13, §15.5, §16.2, §16.5, §16.6.
- **Attendance changes:** Late, Half day and Leave are added. Leave replaces "excused absence". Bulk Entry now offers all five attendance statuses and still has no Hifz fields.\
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

-   **Sabaq:** New memorization. A Sabaq portion is one Surah's Ayat range, measured in lines (§5.6).
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
-   Daily Hifz entry for an individual student and attendance-only bulk class entry (Present, Late, Half day, Leave, Absent).
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

-   Android phones and tablets. The minimum is Android 8.0 (API 26), or the Expo SDK's own minimum if that is higher (NFR-COMP-001, §17 DEC-B52).
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

-   Quran metadata is maintained by the Madrasa Admin in the MVP.
    - Each madrasa starts from a reviewed seed shipped with the app (FR-SAB-007).
    - No external metadata vendor is integrated at run time.
    - A one-time, reviewed, versioned **seed import** from a published dataset (e.g. QUL, Tanzil) is not a runtime integration: the app never contacts the provider while it runs, and Teachers use HifzAmanah's own copy offline (FR-SAB-007, FR-SAB-014).
-   The MVP counts lines on one Mushaf edition: the 16-line Indo-Pak Mushaf (DEC-B70, 2026-11-09). The target publisher is **Taj Company** (DEC-B71, 2026-11-09). The exact Taj printing, its page count, and its page/line layout are still to be verified against a physical Taj Mushaf (§17.3).
-   Authentication is built into the HifzAmanah API; no third-party identity provider is used (§17 DEC-B05).
-   Production hosting is AWS in the Mumbai region, and OTP email goes through Amazon SES (§17 DEC-B53, DEC-B06).
-   Android push notifications are the only selected MVP notification channel; delivery provider and operational setup remain implementation choices.
-   Secure Student/Parent online access is through the Android app only in MVP; a separate browser portal is excluded.

## 4. User roles and permissions

### 4.1 Roles

-   **Owner:** highest administrative access to the organization and its
    membership/settings. The Owner has every Admin permission and is
    the only role that can add or remove Admins and transfer ownership
    (FR-ORG-007).
-   **Admin:** manages permitted classes, students, teachers, schedules,
    and reports.
-   **Teacher:** works with assigned classes/students and creates daily
    records/homework. A Teacher whose Owner/Admin has set the "all
    classes" flag works with every class in the madrasa (FR-SEC-003).
-   The approved role/permission matrix is in §17.1.
-   **Student:** can view own permitted/published records only.
-   **Guardian:** can view permitted records for verified linked
    students only.

### 4.2 Access rules

**FR-SEC-001:** The system must authenticate users before access to
private records.

**FR-SEC-002:** Every organization-owned record must be authorized
against the active organization and user membership on the server.

**FR-SEC-003:** Teachers must be restricted to the classes/students assigned to them, unless a specific permission grants broader access. The only such permission is the **"all classes" flag**. An Owner or Admin can set or clear it on a Teacher's membership, and the change is audited. With the flag set, the Teacher has their normal Teacher permissions for every class in the madrasa.

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
and applicable security settings. In MVP, a user can view their own profile, edit their display name and optional email, and change their own password (US-071). The current password is required to change it, the password policy applies, the user's other sessions are revoked, and the change is audited. User ID, role, and madrasa are read-only.

**FR-AUTH-012 (password policy):** A password must be 8–64 characters. There are no character-composition rules. Very common passwords and the account's own User ID are rejected. The same policy applies to passwords set by an Admin.

**FR-AUTH-013 (User ID format):** A User ID is unique across the whole system and case-insensitive, with 3–32 letters, digits, and hyphens. When an Admin creates an account, the app suggests a madrasa-code prefix (for example `ALNOOR-T014`), and the Admin can edit the rest of the ID.

**FR-AUTH-014 (lockout and OTP limits):**
- A password-reset OTP is 6 digits, is valid for 10 minutes, and allows at most 5 wrong tries.
- At most 3 OTPs may be requested per hour per account.
- Sign-in applies a progressive delay after 5 failures. 10 failures within 15 minutes lock the account for 15 minutes.
- Locks are audited and visible to the Admin. No active alert is sent.
- Errors never reveal whether a User ID exists.

**FR-AUTH-015 (Admin password reset):** An Owner or Admin can set a new password for any account in their madrasa, including an account with no email. This revokes that user's sessions and is audited. Only the Owner can reset an Admin's password.

**FR-AUTH-016 (two-factor sign-in for Owner/Admin):** Owner and Admin accounts must use two-factor sign-in (US-072).
- They set up an authenticator app (TOTP) and receive 10 one-time recovery codes before reaching any madrasa data.
- Every later sign-in requires a TOTP code or an unused recovery code.
- Regenerating recovery codes requires a recent sign-in and a TOTP code. It invalidates all previous codes and is audited (§16.5).
- **Lost device:** the Owner can reset an Admin's two-factor setup, and the platform operator can reset an Owner's after an identity check. Each reset is audited and revokes the user's sessions.
- Teacher, Student, and Parent accounts do not use two-factor sign-in in MVP.

### 5.2 Organization and membership

**FR-ORG-001:** A user must be able to create or enter an individual teacher workspace or a madrasa workspace, subject to onboarding rules. **Onboarding rule:** the platform operator creates each workspace and its first Owner account. There is no self sign-up.
- An individual-teacher workspace is a one-person workspace whose user holds both the Owner/Admin and Teacher roles.
- Inside a madrasa workspace, accounts are created as in FR-AUTH-009.

**FR-ORG-002:** The system must distinguish organization roles and
permissions.

**FR-ORG-003:** Owners/admins must be able to manage authorized
memberships and teacher assignments.

**FR-ORG-004:** Records must be scoped to the correct organization.

**FR-ORG-005:** Removing a member must revoke future access without
deleting historical records they created.

**FR-ORG-006:** Multi-organization membership may be supported; if enabled, users must clearly select the active workspace. *Superseded by FR-AUTH-011 (§17 DEC-C01):* each account belongs to one workspace. A device with several accounts lets the user switch accounts, and each switch requires signing in to that account.

**FR-ORG-007:** Owner and Admin have the same permissions, except that only the Owner can add or remove Admins and transfer ownership. A madrasa must always have at least one Owner.

### 5.3 Classes and students

**FR-CLS-001:** Authorized users must be able to create, view, update, and deactivate classes. Only an Owner or Admin creates, updates, and deactivates classes. Teachers view their assigned classes.

**FR-CLS-003:** Active class names must be unique within a madrasa (case-insensitive). Deactivated classes do not count.

**FR-CLS-002:** Authorized users must be able to assign one or more
teachers to a class.

**FR-STU-001:** Authorized users must be able to create, view, update, and deactivate student profiles.
- An Owner or Admin can do all of these.
- A Teacher can create and edit student profiles only in their assigned classes, including by Excel import (FR-XLS-001).
- Deactivating or moving a student, guardian links, and Student/Parent login accounts are Owner/Admin only.

**FR-STU-005:** A student profile holds:
- **Required:** name and class.
- **Optional:** roll number / External Student ID (unique within the madrasa), admission date, and private staff notes.
- Date of birth, address, phone, and photo are not collected in MVP (NFR-PRV-001).

**FR-STU-006:** A student has exactly one active class enrollment at a time. Moving a student ends the old enrollment and keeps its history (FR-STU-002).

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

**FR-CAL-005:** Reports must distinguish scheduled classes, attended classes, normal absences, Admin-approved Leave (which replaces "excused absence"), holidays, and no-class days.
- Attended = Present + Late + Half day. Late and Half day are also shown as their own counts.
- Approved Leave is its own count: neither attended nor a normal absence.
- Absent, and rejected Leave, count as normal absence.

**FR-CAL-007 (attendance statuses):** An attendance record is one of `PRESENT`, `LATE`, `HALF_DAY`, `LEAVE`, or `ABSENT`.
- `LATE`: the student arrived after attendance was marked. A record already saved as Absent can be changed to Late.
- `HALF_DAY`: the student left before the end of the class day.
- `LEAVE`: the student or parent told the Teacher or Admin in advance why the student would not attend.
- Every change to an attendance record is audited.
- Hifz portions may be recorded only for Present, Late, or Half day (FR-DAY-011).

**FR-CAL-008 (Leave approval):**
- A Teacher (for assigned classes) or an Admin can mark Leave. A reason is required.
- Leave marked by a Teacher shows "Leave — awaiting approval" until an Owner or Admin approves or rejects it.
- Leave marked by an Owner or Admin is approved at once.
- Decisions are audited.
- The reason is internal and never shown to Students or Parents.
- This replaces the earlier "excused absence" flow.

**FR-CAL-009 (holiday declared on a recorded date):**
- A holiday, closure, or no-class day is not a working day and has no class work, like a Sunday.
- If attendance or daily records already exist for that date when the holiday is declared, the Owner/Admin is warned with the number of records and must confirm.
- After confirmation, those records are excluded from reports and homework suggestions. They are kept in history and never deleted.
- New entries for that date are refused.

**FR-CAL-010 (unmarked students):** When Bulk Entry is saved with students left unmarked:
- The app lists them in an "N students not marked" dialog with two actions, "Mark them Absent" and "Go back".
- Nothing is saved for those students until the Teacher chooses. "Mark them Absent" records explicit Absent entries by that Teacher.
- No attendance is ever created silently.

**FR-CAL-006:** Date boundaries must use the organization's configured
timezone.

### 5.5 Daily Hifz records

**FR-DAY-001:** The system must support creating a daily record for a student and class date. The date must be today or earlier in the organization's timezone; future dates are refused. Back-dated entry is allowed.

**FR-DAY-002:** The system must support individual-student Daily Entry and a separate whole-class Bulk Entry workflow.

**FR-DAY-002A:** Bulk Entry is attendance-only in the MVP.
- It records Present, Late, Half day, Leave, or Absent for each student (FR-CAL-007).
- Leave requires its reason (FR-CAL-008). The only other text Bulk Entry ever asks for is the required note in FR-DAY-010.
- It must not capture Sabaq, Sabqi, Manzil, listening/recitation outcomes, mistakes, or quality ratings.

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

**FR-DAY-009:** Daily record edits must update derived reports and unconfirmed homework suggestions. Records never lock: an assigned Teacher or an Owner/Admin may correct any past record. Every edit is audited, and confirmed homework is never changed by it (FR-HW-012).

**FR-DAY-010 (Absent with recited portions):** In Bulk Entry, a student may already have recited portions saved for the date. If the Teacher marks that student Absent:
- The row suggests "Mark Late instead".
- If the Teacher keeps Absent, the row cannot be saved until the Teacher enters a note with the reason. The note is internal.
- The recited portions are not changed.

**FR-DAY-011:** Hifz portions cannot be added for a student whose attendance for that date is Absent or Leave. Daily Entry offers "Change to Late" instead.

### 5.6 Sabaq requirements

*Revised 2026-11-01 (§17 DEC-B60…B64):* Sabaq is the new lesson a student recites to the Teacher. It is measured in lines over a Surah/Ayat range, never in Para fractions. Sabqi (§5.7) and Manzil (§5.8) keep their Para-based quantities.

**FR-SAB-001:** A Sabaq portion must store the Para/Juz it falls in. *Revised 2026-11-01 (DEC-B63):* the Teacher does not enter the Para. The system derives it from the portion's Surah and start Ayat, using the active Quran metadata (FR-SAB-005), and stores it for display, reports, and the Sabqi default (FR-SBQ-003).

**FR-SAB-002:** *Revised 2026-11-01 (DEC-B60, DEC-B62):* A Sabaq portion must record a Surah, a starting Ayat, and an ending Ayat. All three are required. The range lies within one Surah, and the starting Ayat is less than or equal to the ending Ayat. A lesson that crosses into the next Surah is recorded as two Sabaq portions.

**FR-SAB-003:** *Revised 2026-11-01 (DEC-B60, DEC-B61):* A Sabaq portion must record its quantities in lines (`LINES`) only:
- **Total Lines:** the number of lines the Surah/Ayat range covers in the Mushaf edition in use (FR-SAB-006). A positive integer.
- **Assigned Lines:** the lines the student was given from that range. A positive integer, at most Total Lines. It defaults to Total Lines.
- **Completed Lines:** the lines the student recited. A whole number from 0 to Assigned Lines.
- **Remaining Lines:** calculated, never entered: `max(0, Assigned Lines − Completed Lines)` (FR-QTY-005). For example, 10 assigned and 7 completed leave 3 remaining.

**FR-SAB-004:** A Sabaq portion must support mistakes, quality rating,
status, and optional teacher remarks. Statuses keep their meanings (FR-ATT-001): `NOT_REMEMBERED` defaults Completed Lines to 0 (FR-QTY-007), and `ABSENT`, `NOT_ASSIGNED`, and `PENDING` are never failure (FR-ATT-007).

**FR-SAB-005:** Quran metadata (Surah, Ayat, and Para information) is managed by the Madrasa Admin, who can add/edit the reference information used by teachers. The MVP must not assume an external metadata provider or license has been selected. Validation uses the active admin-maintained metadata.

**FR-SAB-006:** *Revised 2026-11-09 (DEC-B70):* The target Mushaf is the 16-line Indo-Pak (South Asian) Mushaf. Line counting and line-based portions use this edition's verified page/line layout.
- The edition is identified in the data, and each madrasa counts lines on one configured edition.
- The data model allows further editions to be added without redesign. Offering several editions to users is still out of MVP scope.
- Indo-Pak printings differ in page and line breaks, so no layout is assumed. The exact publisher/edition and its page/line layout must be identified and verified first (§17.3).
- *2026-11-09 (DEC-B71):* the primary target publisher is **Taj Company**, the edition the target madaris mainly use. The candidate profile is Taj Indo-Pak 16-line. A candidate 548-page layout exists (QUL resource 11). It is **not verified**: the exact printing, the page count, the page numbering, and every line break must be confirmed against a physical Taj Mushaf from the target madaris before the edition is marked verified (FR-SAB-013). That Taj Company publishes the printed Mushaf grants no rights to any digital file. Digital use needs its own licence or written permission (FR-SAB-011).

**FR-SAB-007:** The app ships a reviewed Quran metadata seed covering Surahs, Ayat counts, Para boundaries, and the page/line layout of the target edition (FR-SAB-006).
- *2026-11-09:* no dataset is approved yet. Until one is, no Quran metadata or layout is loaded into production, and none may be generated, guessed, or entered from memory.
- Every import records its source, licence, dataset version, reviewer, and approval date. Imports are versioned and repeatable.
- The seed is built from a published dataset whose licence has been checked.
- A qualified reviewer nominated by the product owner reviews it before release.
- Each madrasa starts from the seed. Admin edits to it are audited.
- When an edit affects ranges already used by records, those records keep their stored ranges and are never changed automatically. Any that are no longer valid are listed for Admin review.

**FR-SAB-008 (line count, added 2026-11-01, DEC-B64):** When the Teacher chooses a Sabaq Surah and Ayat range, the app pre-fills Total Lines from the edition's verified page/line layout (FR-SAB-006, FR-SAB-007). The Teacher confirms or corrects it. The confirmed number is stored with the edition it was counted on, and with whether it came from the layout or was entered by hand. *2026-11-09:* while no verified layout is loaded, Total Lines is not pre-filled and the Teacher enters it. A stored line count is never recalculated automatically, including after a metadata or layout edit (FR-SAB-007).

**FR-SAB-009 (Sabaq validation, added 2026-11-01):** The server and the app reject a Sabaq portion when:
- the Surah, starting Ayat, or ending Ayat is missing, or an Ayat is outside the Surah's Ayat count;
- the starting Ayat is after the ending Ayat, or the range crosses a Surah boundary;
- Total, Assigned, or Completed Lines is not a whole number, or Total or Assigned Lines is not positive;
- Assigned Lines exceeds Total Lines, or Completed Lines exceeds Assigned Lines (extra work is a separate Extra portion, FR-QTY-006);
- any quantity unit other than `LINES` is used, including the Para presets Rubu, Half, Salasah, and Complete (FR-QTY-010).

Missing performance data is never read as completed lines (FR-QTY-008).

**FR-SAB-010 (compatibility, added 2026-11-01):** No Sabaq record has been created yet, because the system is not implemented. If a Sabaq portion with a Para-fraction quantity ever reaches the system (for example, from a `DailyRecords` workbook built on an earlier template version), it is rejected for correction and never converted. There is no approved conversion between Para fractions and lines (FR-QTY-004).

#### 5.6.1 Quran reference data requirements (2026-11-09)

> From the Quran data research ([handover/F06-quran-dataset-candidates.md](handover/F06-quran-dataset-candidates.md)); design in [ADR-017](adr/ADR-017-quran-reference-data-model.md). **FR-SAB-011…014 were approved on 2026-11-09 (DEC-B72).** FR-SAB-014's delivery mechanism (API snapshot vs. APK bundle, OD-QR-7) is still open. **FR-SAB-015 is not in the MVP** (DEC-B74). Approval of these requirements approves **no dataset, licence, or physical verification**; those stay open (§17.3).

**FR-SAB-011 (approved 2026-11-09, DEC-B72): Provenance and licence gate.** Every downloaded source file is recorded with its provider, resource name and ID, source and download URLs, download date, file name, SHA-256, source version, licence name, licence status (`LICENSE_REVIEW_REQUIRED`, `OPEN_LICENCE_VERIFIED`, `PERMISSION_GRANTED`, `REFUSED`), permission reference, and required attribution. A production import is refused unless every source it uses is `OPEN_LICENCE_VERIFIED` or `PERMISSION_GRANTED`. Required attribution is shown in the app in all three locales.
- A file being publicly downloadable does not make it redistributable, and a website's software licence (e.g. QUL's MIT licence) does not cover the datasets it serves.
- For a layout of the Taj Company edition, `PERMISSION_GRANTED` needs the written permission of the dataset's provider **and** confirmation from Taj Company (or legal advice) that digital use of its page/line layout is permitted. Owning a printed Taj Mushaf grants no digital redistribution right.

**FR-SAB-012 (approved 2026-11-09, DEC-B72): Layout line structure.** The page/line layout stores every printed line of the edition with its type (`AYAH`, `SURAH_NAME`, `BASMALLAH`) and alignment. An `AYAH` line stores its Surah and its first and last Ayat with the word position inside each. Word-level source IDs are converted once, offline. If any source word ID cannot be mapped, or the lines do not cover every Ayat exactly once in order, the import stops and reports it. No Quran text is stored. Only `AYAH` lines count toward Total Lines (FR-SAB-008); Surah-heading and Bismillah lines stay separate line types and never count (*decided 2026-11-09, DEC-B77*; teacher consultation is recommended before the final production rollout).

**FR-SAB-013 (approved 2026-11-09, DEC-B72): Import validation and human sign-off.** Before a dataset version can be applied in production, an automated validation report must pass (114 Surahs, 30 contiguous Paras, every page and line present and unique, every Ayat covered, cross-source differences listed). A qualified reviewer must then compare it with the printed Mushaf of the configured edition and sign the report. Mismatches are reported, never corrected silently. The edition becomes verified only after sign-off.
- For the Taj Company edition (DEC-B71), the comparison uses a **physical Taj Mushaf used by the target madaris**. It covers the Taj verification checklist ([handover/F06-quran-dataset-candidates.md §6](handover/F06-quran-dataset-candidates.md)): the exact printing, the total page count, the 16-line page structure, page numbering and the opening and ending pages, Surah heading and Bismillah positions, Ayat-to-page and Ayat-to-line mapping, and alignment and line breaks.
- *Verification boundary (2026-11-09, DEC-B78):* automated validation covers the digital structure, metadata, mappings, checksums, source registration, and licence gates. Comparison with the physical Taj Mushaf is a **human review responsibility**; the system records the reviewer's identity, the exact printing details, the review date, the decision, and the signed approval evidence. A madrasa's layout shows as verified (`layoutVerified`) only after an approved, signed **production** import for that madrasa; signed test data never counts. The system never claims to prove automatically that a digital layout matches the physical Mushaf.
- Validation is reproducible: the same source files (same SHA-256) and the same converter version always give the same seed checksum and the same report.

**FR-SAB-014 (approved 2026-11-09, DEC-B72; delivery mechanism decided 2026-11-09, DEC-B75): Offline reference data.** Teacher and Admin devices hold the madrasa's active reference data (Surahs, Paras, the active layout's lines, and any approved divisions) in local storage after the first online sign-in. It is downloaded as one versioned, checksummed snapshot from the HifzAmanah API and refreshed only when the madrasa's reference version changes. Range validation, Para derivation, and the Total Lines pre-fill work offline. Reference updates never change stored records (FR-SAB-007, FR-SAB-008).
- *2026-11-09 (DEC-B75, DEC-B79):* the snapshot is not bundled in the APK. Withdrawn or no-longer-authorized data is excluded from every future snapshot, the server marks the affected snapshot versions revoked, and a device removes revoked cached data on its next successful online connection. An offline device cannot be wiped remotely. Design: [ADR-018](adr/ADR-018-quran-reference-snapshot-offline-cache.md).

**FR-SAB-015 (not in MVP, DEC-B74; kept for a later phase): Page and line selection.** When a verified layout is loaded, the Teacher may choose a Sabaq range by page, start line, and end line. The app resolves the choice to a Surah and start/end Ayat, which stay the stored canonical values. A choice that spans two Surahs or covers no Ayat line is refused with a field error. Sabqi and Manzil portions may carry an optional page/line reference for the madrasa's edition. Quantities and their units are unchanged (FR-QTY-001…010).

### 5.7 Sabqi requirements

**FR-SBQ-001:** Sabqi must support one or multiple Paras in a single
daily record.

**FR-SBQ-002:** Each Sabqi Para/portion must have its own quantity,
unit, mistakes, quality, status, and remarks.

**FR-SBQ-003:** The system may suggest the current Sabaq Para as a
default, but the teacher must be able to select the same Para, another
Para, or multiple Paras. *(2026-11-01: the "current Sabaq Para" is the Para derived from the Sabaq range, FR-SAB-001.)*

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
= 1 full Para. *(2026-11-01: these presets are offered in Sabqi and Manzil, not in Sabaq; FR-QTY-010.)*

**FR-QTY-002:** The UI must make the quantity unit explicit, such as
Para fraction, lines, Ayat, or pages. Sabaq always shows lines (FR-QTY-010).
*2026-11-09 (DEC-B76):* Rubu, Half, Salasah, and Complete are Para quantities only. They are never converted into specific Ayat or line positions in the MVP.

**FR-QTY-003:** The system must represent quantity precisely and
validate allowed ranges. It should use numerator/denominator or another
exact representation rather than imprecise floating-point math.

**FR-QTY-004:** The system must not add quantities expressed in
incompatible units without an approved conversion.

**FR-QTY-005:** For the same portion and compatible unit, remaining
quantity must be calculated as
`max(0, assigned quantity - completed quantity)`.

**FR-QTY-006:** Completed quantity must not exceed assigned quantity unless the domain explicitly supports extra work as a separate portion. **Extra work is supported as a separate portion.**
- The Teacher records the assigned amount as completed, then adds an "Extra" portion for the additional work, with its own range, quantity, status, and quality.
- Every portion keeps completed ≤ assigned.
- Reports show extra work separately.

**FR-QTY-009:** `LINES`, `AYAT`, and `PAGES` quantities are whole numbers (0, 1, 2 …). Para quantities use the quarter presets (FR-QTY-001).

**FR-QTY-010 (units by section, added 2026-11-01, DEC-B60):** Quantity validation depends on the section:

| Section | Allowed units | Para presets (Rubu, Half, Salasah, Complete) |
|---|---|---|
| Sabaq | `LINES` only, with a Surah/Ayat range (FR-SAB-002, FR-SAB-003) | Not offered and rejected |
| Sabqi, Manzil | Unchanged: `PARA` presets, `LINES`, `AYAT`, `PAGES` | Offered |

This also applies to Extra portions, homework portions, and imported rows. Line quantities and Para fractions are never added, compared, or converted (FR-QTY-004).

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

**FR-ATT-011:** The Teacher can record "No mistakes" for a portion attempt. This stores a mistake count of 0. An empty mistake list without that choice means "Not recorded" and is never counted as 0 (FR-QTY-008).

**FR-ATT-012:** Each mistake may carry an optional short free-text note. The note is internal (private to staff) by default. The Teacher can make it visible to the Student and Parent, under the same rules as other remarks (FR-PORT-003).

### 5.11 Structured homework

**FR-HW-001:** The system must support a homework assignment containing
structured Sabaq, Sabqi, and Manzil portions.

**FR-HW-002:** Each homework portion must support section type, Para,
optional Surah/Ayat range, quantity, unit, status, and optional
instructions. *Revised 2026-11-01 (FR-QTY-010):* a Sabaq homework portion has the Sabaq fields instead: a required single-Surah Ayat range, Total Lines, and Assigned Lines (FR-SAB-002, FR-SAB-003), with its Para derived (FR-SAB-001).

**FR-HW-003:** Sabqi and Manzil homework must support multiple Para
portions with independent quantities.

**FR-HW-004:** A homework assignment must store assigned date, due/next-class date, status, creator, and optional general instructions/notes. The due date defaults to the student's next scheduled class day, skipping Sundays, holidays, closures, and no-class days. For example, Saturday's homework is due on Monday.

**FR-HW-005:** The system must automatically calculate remaining
quantity for eligible incomplete portions. Sabaq remaining is in lines; Sabqi and Manzil remaining keep the portion's own unit (FR-QTY-010).

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

**FR-HW-012:** Source edits must not silently modify already-confirmed homework. Explicit revisions must be auditable. Only an Owner or Admin may revise confirmed homework. A revision creates a new assignment linked to the old one, and the old one becomes Superseded.

**FR-HW-013:** Absence, not-assigned work, and pending/unattempted work
must not automatically be treated as failed work for carry-forward;
suggestion eligibility rules must be explicit.

**FR-HW-014:** Homework portions must be traceable to prior homework
portions and/or attempts when carried forward.

**FR-HW-015:** The next-class performance must be linkable to the
homework portion that the student attempted.

**FR-HW-016 (carried-over homework):** Confirmed homework stays outstanding, and is shown again on the student's next class day, if either of these happens:
- the student is Absent or on Leave on the due day;
- the due day becomes a holiday, closure, or no-class day.

The homework is labelled "carried over — absent/holiday". It is not treated as failed work, and the confirmed assignment is not edited.

**FR-HW-017 (offline confirmation):**
- A Teacher may confirm homework while offline. The confirmation is saved on the device, queued, and shown as "Confirmed on device — waiting to sync".
- On sync, the server checks that the draft's source records have not changed since the draft was built.
- If they have changed, the confirmation becomes a sync conflict for review (FR-SYNC-008) instead of being applied.

**FR-HW-018 (Sabaq carry-forward, added 2026-11-01):** When the latest attempt on a Sabaq portion is `PARTIAL` or `NOT_REMEMBERED` with Remaining Lines > 0, the suggested Sabaq homework portion:
- keeps the original Surah, starting Ayat, ending Ayat, and Total Lines;
- sets Assigned Lines to the Remaining Lines;
- links to its source attempt (FR-HW-014).

For example, Al-Baqarah Ayat 1–10 with 10 assigned lines and 6 completed is suggested as Al-Baqarah Ayat 1–10, Total Lines 10, Assigned Lines 4. The suggestion is a draft until the Teacher confirms it (FR-HW-008), and confirmed homework is never changed automatically (FR-HW-012). Sabqi and Manzil carry-forward is unchanged.

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

**FR-MNR-006:** The report must show available mistake and quality trends and identify recurring difficulty areas where the data supports that conclusion.
- **Recurring difficulty:** a Para or range that, within the period, had a Major or Repeated mistake in 3 or more attempts, or was Not Remembered 3 or more times.
- The supporting dates and counts are shown with it.

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

**FR-RPT-006:** Repeated attempts must be handled consistently. Current-progress summaries use the latest attempt per portion, and the full attempt history remains available (§17 DEC-A02).

**FR-RPT-007:** Draft/suggested homework must be counted separately from
confirmed homework.

**FR-RPT-008:** If reports are cached, cache invalidation/rebuild must
be reliable and results must match source calculations.

**FR-RPT-009:** Reports must identify their date range and distinguish
missing data from zero performance.

**FR-RPT-010 (publishing):**
- Students and Parents see a weekly or monthly report only after it is published.
- A Teacher (for assigned classes) or an Owner/Admin publishes, for a whole class or for one student.
- Publishing needs a network connection, and every offline change for that period must already be synced.
- Later corrections update the published report, which then shows "Updated on …".
- Publishing is audited.

**FR-RPT-011 (class summary report):** Teachers (for assigned classes) and Owners/Admins can view a weekly or monthly class summary (US-073).
- It has one row per student enrolled during the period, derived from source records.
- Each row shows attendance counts (Present, Late, Half day, Leave, Absent), portions completed per section by unit, average quality with the number of ratings, and outstanding confirmed homework.
- It can be exported as PDF and Excel.
- Students and Parents never see it.

### 5.15 Parent/student access and visibility

**FR-PORT-001:** The planned core Android release must provide secure online sign-in and read-only access for students to their own published, permitted records.

**FR-PORT-002:** The planned core Android release must provide read-only access for guardians only to published records of verified linked students. Guardian contact details alone must never grant access.

**FR-PORT-003:** Teacher remarks must support explicit internal-only versus parent/student-visible visibility.

**FR-PORT-004:** Internal-only notes must be excluded server-side from APIs, app payloads, exports, and PDFs for unauthorized viewers.

**FR-PORT-005:** Guardian/student access changes and verification events must be auditable.

**FR-PORT-006 (what Students and Parents see):** A published report shows Students and Parents:
- attendance;
- Sabaq, Sabqi, and Manzil portions with quantities and statuses;
- quality as number + label;
- mistake counts by category;
- the overall performance label;
- confirmed homework;
- remarks and mistake notes marked visible;
- the teacher's name.

It never shows internal notes, Leave reasons, draft homework, AI output, audit details, or sync details.

**FR-PORT-007 (Parent linking):**
- An Owner or Admin links a Parent account to one or more students after verifying the parent offline (in person or against the madrasa's own records), and records how the parent was verified.
- There is no self-service linking and no invitation code in MVP.
- Revoking a link stops access on the next request.
- Linking, verification, and revocation are audited.

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

**FR-I18N-008:** Roman Urdu wording should be consistent and understandable; provide a localization glossary for common terms. The development team drafts the glossary, and Urdu domain wording, in the repository. The product owner, or a reviewer the product owner nominates, approves it before release and approves every later change.

**FR-I18N-009:** All three languages show Western digits (0–9), including the Urdu RTL interface. Stored numbers are never changed.

### 5.17 Printing, PDF, and data export

**FR-PDF-001:** PDF reports must use a professional default template.

**FR-PDF-002:** Madrasa Admin may customize the report logo, colors, headings, and layout within supported template controls. The supported layout controls are:
- portrait or landscape;
- show or hide each optional section (attendance, Sabaq, Sabqi, Manzil, homework, quality chart, visible remarks);
- heading text per language;
- colours chosen from presets that pass a contrast check.

The section order is fixed.

**FR-PDF-004 (fonts and pages):**
- **Fonts:** Inter for English and Roman Urdu; Noto Nastaliq Urdu for Urdu; Noto Naskh Arabic for Quranic Arabic and Surah names. The same fonts are used in the app UI.
- **Pages:** A4, with the report header repeated on every page. A table row is never split across pages.

**FR-PDF-003:** PDF exports must enforce the same organization, role, student/guardian visibility, and private-note restrictions as on-screen reports.

**FR-EXP-001:** Authorized users should be able to print weekly and
monthly reports in a readable layout.

**FR-EXP-002:** PDF export should preserve date ranges, section details,
quantities, statuses, and authorized remarks.

**FR-EXP-003:** Export output must enforce the same access and
visibility rules as the on-screen report.

**FR-EXP-004:** If CSV/Excel export is enabled, it must respect organization scope and permissions. *Clarified (§17 DEC-C02):* `.xlsx` export is in MVP (FR-XLS-006). CSV is not.

**FR-EXP-005:** PDF fonts and direction must support Urdu and Roman Urdu correctly if these languages are included in exports. *Clarified (§17 DEC-C03):* all three languages are included. Fonts are set by FR-PDF-004.

### 5.18 Performance analytics and AI recommendations

AI provider selection is configurable by the Madrasa Admin from the AI providers supported by the application. Admin can enable/disable AI and configure usage limits. Admin can configure the category/amount of student data eligible to be sent, subject to mandatory minimization and privacy safeguards. The MVP sends only the minimum structured metrics needed for the feature; raw student profiles, contact details, and internal notes are excluded by default.

**FR-AI-001:** The app must provide deterministic performance analytics based on source records, including Sabaq/Sabqi/Manzil progress, assigned-versus-completed quantities by compatible unit, mistakes and recorded quality trends, recurring difficult portions, and attendance context.

**FR-AI-002:** When the device has internet connectivity, the system may request AI-generated explanations and recommendations based on a minimized, permission-filtered summary of student performance data.

**FR-AI-003:** AI recommendations must be advisory. A teacher remains responsible for interpreting them and deciding whether to change teaching plans or homework.

**FR-AI-004:** AI must not invent performance facts, infer a missing quality score as zero, mix incompatible quantity units, automatically alter source records, or finalize homework.

**FR-AI-005:** AI features require internet connectivity. If offline or the AI provider is unavailable, the app must continue to offer basic local analytics and cached reports, clearly labeling them provisional when unsynchronized.

**FR-AI-006:** AI requests must follow organization authorization, data minimization, and note-visibility rules. Internal-only notes must not be sent to a student/guardian-facing AI flow; the initial recommendation flow is for authorized teachers/admins only.

**FR-AI-007:** The UI must distinguish calculated metrics from AI-generated commentary and provide a useful fallback when AI is unavailable. The system must not claim that an AI recommendation is a clinical, religious, or guaranteed educational judgment.

**FR-AI-013 (data categories):** The Admin can switch each of five data categories on or off: attendance summary, Sabaq/Sabqi/Manzil progress, mistake categories, quality scores, and homework completion. All five are on by default. Student names, contact details, and any notes are never sent to an AI provider in MVP, and there is no setting that sends them.

**FR-AI-014 (output language):** AI output is written in the requesting user's interface language: English, Urdu, or Roman Urdu. The evaluation set includes Urdu and Roman Urdu examples. AI never generates or alters Quranic text.

### 5.19 Notifications

**FR-NOT-001:** The MVP supports Android push notifications only. Email, SMS, and WhatsApp notification delivery are out of MVP scope.

**FR-NOT-002:** Notification preferences and event types must be permission-aware and must not expose private teacher notes or unauthorized student information.

**FR-NOT-003:** Notification delivery is best-effort; failures must be observable and must not block daily entry, homework, or reporting.

**FR-NOT-004 (MVP event catalogue):**
- **The only push event is "Report published".** It goes to the Student and to linked Parents when their weekly or monthly report is published (FR-RPT-010).
- The event is on by default and can be turned off in Settings.
- Android's notification permission is requested when it is first useful. If it is refused, the app works normally.
- Delivery uses Expo Push Service, which sends through Google FCM.

### 5.20 Excel import and export

**FR-XLS-001:** Authorized teachers/admins must be able to import student lists from a documented `.xlsx` template. An Owner or Admin may import into any class. A Teacher may import only into their assigned classes, and the preview marks rows that name any other class as invalid. Importing creates student profiles, not login accounts.

**FR-XLS-002:** Authorized teachers/admins must be able to import daily Hifz records from a documented `.xlsx` template, subject to field validation and supported record types.

**FR-XLS-003:** Before importing, the app must show a preview with counts of valid rows, invalid rows, and suspected duplicates; users must explicitly confirm the import.

**FR-XLS-004:** Import validation must report row and field errors without silently skipping invalid data. The import must be safely retryable and must not create duplicates on replay.

**FR-XLS-005:** Existing records must not be silently overwritten. Updates require a documented stable match key, preview of proposed changes, permission checks, and explicit confirmation.

**FR-XLS-006:** Authorized users must be able to export student lists, daily Hifz records, and weekly/monthly report data as `.xlsx` files.

**FR-XLS-007:** Export must apply the same organization, role, date-range, and note-visibility restrictions as the corresponding in-app view. Internal-only notes must not appear in student/guardian exports.

**FR-XLS-008:** Import/export events must be auditable, including actor, organization, time, operation type, and a safe summary of outcome; logs must not contain unnecessary student details.

**FR-XLS-009:** The system must treat workbook content as data only; it must not execute macros or formulas. Exported text must be handled safely to reduce spreadsheet formula-injection risks.

**FR-XLS-017:** The MVP must enforce a maximum of 1,000 students/records per import/export file as applicable. Larger datasets must be split into multiple files.

**FR-XLS-018:** Every template carries a hidden `_meta` sheet holding `TemplateName` and `TemplateVersion`, which is also noted on the first sheet. Imports commit in batches of 200 rows.

FR-XLS-010 to FR-XLS-016 (import acceptance rules) are in §15.2.

### 5.21 Audit history

**FR-AUD-001:** The system must record significant changes to daily
records, attempts, homework confirmation/revision, role assignments,
guardian links, and visibility settings.

**FR-AUD-002:** Audit events must identify actor, action, target record,
timestamp, and an appropriate change summary.

**FR-AUD-003:** Audit logs must not contain passwords, secrets, or
unnecessary sensitive data.

**FR-AUD-004:** Authorized users must be able to inspect applicable audit history. Owners and Admins see the madrasa's full audit history. A Teacher sees only the audit entries for their own actions. Students and Parents see none.

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
performance status, remarks. *Revised 2026-11-01:* a Sabaq portion stores a required Surah, starting Ayat, and ending Ayat (one Surah), Total Lines, the Mushaf edition the lines were counted on, and assigned/completed quantities in `LINES`; its Para is derived (FR-SAB-001…003, FR-SAB-008). Sabqi and Manzil portions are unchanged.

**Portion attempt:** daily record and lesson portion, optional homework
portion, attempt time, recorder, assigned quantity snapshot, completed
quantity, unit, status, mistakes, quality, remarks, and optionally a
clearly defined remaining-quantity snapshot.

**Homework assignment:** organization, student, optional class, source
daily record if relevant, assigned date, due date, status, instructions,
creator, confirmer, confirmation time, timestamps.

**Homework portion:** assignment, section type, Para/range, assigned
quantity, unit, status, source homework portion and/or source attempt,
instructions, timestamps. A Sabaq homework portion also stores Total Lines, and its assigned quantity is in `LINES` (FR-HW-002, FR-HW-018).

**Membership:** organization, user, role, status, timestamps.

**Audit log:** organization, actor, entity type/ID, action, timestamp,
safe change summary.

### 6.3 Integrity requirements

-   Use primary keys, foreign keys, appropriate unique constraints, and
    indexes.
-   One logical daily record per organization/student/date is the
    default unless multi-session support is approved. *Multi-session
    mode is approved as an Admin setting (FR-DAY-008, §17 DEC-C04).*
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

**NFR-PRV-005 (retention policy):** This is a product policy; legal requirements are to be confirmed separately with an advisor.

| Data | Kept for |
|---|---|
| Generated PDF/Excel files | 24 hours |
| Uploaded import workbooks | 7 days (import job results are kept) |
| AI request logs | 90 days (usage totals: 1 year) |
| Audit log | 5 years |
| Database backups | Daily, kept 30 days, plus 7-day point-in-time restore |
| Teaching records | While the madrasa is active, including deactivated students |

When a madrasa closes, a full Excel export is offered, and all of its data is deleted 90 days after closure.

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

**NFR-PERF-001:** Student lists, daily records, homework lists, and audit lists must use pagination when needed. Lists load 25 items per page and load more as the user scrolls. Search and filters run on the server.

**NFR-PERF-002:** Report queries must avoid N+1 query patterns and use
appropriate indexes.

**NFR-PERF-003:** Bulk writes and homework confirmation must use
transactions where consistency requires them.

**NFR-PERF-004:** Any cached reports must be reproducible and
invalidated when source records change.

**NFR-PERF-005:** Establish measurable response-time targets after
expected user, student, and record volumes are estimated.

**NFR-PERF-006 (first-year sizing and targets):**
- **Sizing:** up to 20 madaris, 200 teachers, and 5,000 students.
- **Targets:**
  - 95% of API calls complete in under 500 ms.
  - A weekly or monthly report is generated in under 3 s.
  - Syncing 100 queued changes takes under 10 s.
  - Monthly uptime is 99.5%.

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

**NFR-MNT-005 (quality gates):**
- **Every pull request:** GitHub Actions runs typecheck, lint, unit tests, `docs:check`, `e2e:trace`, and the API E2E suite against a Docker Compose environment.
- **Maestro device E2E:** runs nightly and before each release, on emulators.
- **Test control:** E2E tests use a test-only API, enabled only in local and staging environments and protected by a secret. It provides seed reset, OTP mail capture (Mailpit), clock control, and AI and push stubs. It never exists in production builds.

### 7.7 Compatibility

**NFR-COMP-001:** The Android app must support the minimum Android version and device matrix selected before implementation; compatibility must be tested on physical devices and emulators.
- **Minimum:** Android 8.0 (API 26), or the Expo SDK minimum if that is higher.
- **Device matrix:** a 5" phone with 2 GB RAM, a common 6.5" mid-range phone, a 10" tablet, and one real low-end device.
- **Release:** Google Play internal track → closed testing → production.

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

**NFR-OFF-011 (cache, app lock, revocation):**
- **Cache:** the device caches only the data the user may access. Synced daily records older than 120 days are removed from the device; they remain on the server.
- **App lock:** a PIN or fingerprint app lock is required for Owner and Admin and optional for Teachers. The app locks after 5 minutes in the background.
- **Revocation:** when the device learns that access was revoked, the workspace locks at once and synced data is purged. Unsynced changes stay locked and visible, and are purged on sign-out or after 30 days.

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
2.  Workspace setup (individual teacher or madrasa). The workspace and its first Owner are created by the platform operator, not in the app (FR-ORG-001). The Owner completes the settings in the app.
3.  Dashboard.
4.  Organization settings and membership/roles.
5.  Classes and teacher assignments.
6.  Student list and student detail/progress timeline.
7.  Timetable/calendar/holidays and attendance.
8.  Individual daily entry.
9.  Bulk class attendance entry (Present, Late, Half day, Leave, Absent; attendance only).
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

The teacher should be able to select a student/date/class, enter Sabaq
as a Surah/Ayat range with its line count,
add one or more Sabqi and Manzil portions, record actual performance and
mistakes, save notes with correct visibility, and view a suggested next
homework. The bulk workflow records attendance only: Present, Late, Half day, Leave, or Absent for each student in a class grid, with no Hifz portion, mistake, or quality fields (FR-DAY-002A). Leave needs a reason and Admin approval (FR-CAL-008). Unmarked students are confirmed in a dialog before saving (FR-CAL-010).

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
18. Sabaq is measured in whole lines over one Surah's Ayat range. Para
    fractions apply to Sabqi and Manzil only (added 2026-11-01,
    FR-QTY-010).

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
-   **AC-QTY-07:** A Sabaq portion offers and accepts only lines; Rubu,
    Half, Salasah, and Complete are not offered for Sabaq and are
    rejected by the server, while Sabqi and Manzil still offer all four
    (added 2026-11-01, FR-QTY-010).
-   **AC-QTY-08:** A Sabaq portion for Al-Baqarah Ayat 1–10 with 10
    assigned and 7 completed lines shows 3 remaining lines; 11 completed
    lines, a start Ayat after the end Ayat, or a range crossing two
    Surahs is rejected (added 2026-11-01, FR-SAB-003, FR-SAB-009).

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
-   **AC-HW-10:** A partial Sabaq of Al-Baqarah Ayat 1–10 (10 assigned,
    6 completed lines) produces a draft suggestion for the same range
    with 4 assigned lines, linked to its source attempt (added
    2026-11-01, FR-HW-018).

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
-   **AC-XLS-07:** A `DailyRecords` row with `SectionType = SABAQ` is invalid unless it has `SurahStart`, `AyahStart`, `AyahEnd`, `TotalLines`, and `QuantityUnit = LINES`; a Sabaq row with `RUBU`, `HALF`, `SALASAH`, or `COMPLETE` is invalid. Sabqi and Manzil rows are validated as before (added 2026-11-01).

### 10.8 End-to-end scenario

1.  Admin creates a class and assigns the Teacher; the Teacher adds a student to that class (FR-CLS-001, FR-STU-001; corrected 2026-10-30, §17 DEC-B04).
2.  Teacher records a daily Sabaq portion (a Surah/Ayat range with its
    line count) and multiple Sabqi/Manzil Para portions.
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
9.  An authorized guardian sees only permitted, published records. The
    "if portal access is enabled" condition was removed because
    Student/Parent access is in the core release (§17 DEC-C05).

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

The Section 13 gates were closed on 2026-10-30 (§17). Two items remain Deferred: the Android application ID and the AI provider vendor. Product choices in Sections 16 and 17 are finalized.

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

All thirteen gates were closed in the product-owner decision review of 2026-10-30. The register is in §17. Each gate keeps its number so that existing references still resolve.

| # | Gate | Status | Resolution |
|---|---|---|---|
| 1 | Authentication provider, email OTP, sessions, rate limits, recovery controls, 2FA/recovery codes | Approved | Built into the API. OTP email goes through Amazon SES. Rules: FR-AUTH-012…016, 2FA required for Owner/Admin. DEC-B05…B11 |
| 2 | Role/permission matrix | Approved | §17.1. DEC-B12…B18 |
| 3 | Quran metadata governance and initial data | Approved | Reviewed seed plus audited Admin edits (FR-SAB-007). DEC-B31, B32 |
| 4 | PDF font stack and page layout | Approved | FR-PDF-002, FR-PDF-004. DEC-B40, B41 |
| 5 | AI providers and budgets | Budget Approved; provider **Deferred** to Phase 7 | FR-AI-012. DEC-B45 |
| 6 | Retention, deletion, backup, closure, export | Approved | NFR-PRV-005. DEC-B44 |
| 7 | Android minimum version, device matrix, release channel | Approved; the application ID is **Deferred** | NFR-COMP-001. DEC-B52, B55 |
| 8 | Cache retention, app lock, revocation | Approved | NFR-OFF-011. DEC-B42 |
| 9 | Hosting, region, volumes, performance targets | Approved | AWS Mumbai; NFR-PERF-006. DEC-B53 |
| 10 | CI gates, UI automation, test control | Approved | NFR-MNT-005. DEC-B54 |
| 11 | Push event catalogue, consent, provider | Approved | FR-NOT-004. DEC-B48…B50 |
| 12 | Remove bulk excused-absence surfaces | Closed (already done) | No surface allowed it (DEC-C06). The excused-absence flow is now Leave (FR-CAL-008) |
| 13 | Teachers importing student lists | Approved | Yes, into assigned classes only (FR-XLS-001). DEC-B15 |

**Still deferred:**
- The AI provider vendor (DEC-B45), until the FR-AI-012 comparison in Phase 7.

**Action items owned by the product owner:**
- Nominate the Quran metadata reviewer (FR-SAB-007).
- Nominate the glossary reviewer, or review the glossary yourself (FR-I18N-008).

The app remains planning-only. No code or deployment work is authorized by this document.

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
- *Revised 2026-11-01 (FR-QTY-010, FR-SAB-009):* a new optional column `TotalLines` follows `AyahEnd`, so the template's `TemplateVersion` is incremented, and workbooks on the earlier version are rejected (FR-XLS-018).
  - **Sabaq rows** (`SectionType = SABAQ`) require `SurahStart`, `AyahStart`, `AyahEnd`, and `TotalLines`. `SurahEnd` is empty or equal to `SurahStart`. `ParaNumber` may be left empty because it is derived; a value that disagrees with the range makes the row invalid. `QuantityUnit` must be `LINES`, and `AssignedQuantity` ≤ `TotalLines`. Rows with any other unit are invalid and are never converted (FR-SAB-010).
  - **Sabqi and Manzil rows** are unchanged. `TotalLines` is left empty.
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

**FR-AI-012:** The AI provider must be selected only after comparing privacy/data-processing terms, retention/training controls, security, reliability, structured-output support, latency, and cost.
- **Budget (approved):** the default cap is USD 10 per madrasa per month, and the Admin may set a lower cap. When the cap is reached, AI requests stop and the app shows deterministic analytics only.
- **Provider (Deferred):** one provider at launch, chosen after this comparison in Phase 7 (§17 DEC-B45).

### 15.4 Offline synchronization acceptance rules

**FR-SYNC-006:** Offline-created/edited records must have stable client-generated IDs and durable queued operations. Retrying an operation must not create duplicate records or attempts.

**FR-SYNC-007:** Synchronization must process dependencies in order and expose pending, syncing, synced, failed, and action-required states. A local save must not be represented as server-synced until server acknowledgement.

**FR-SYNC-008:** Conflicting edits to meaningful fields must preserve both versions and require an authorized resolution flow unless a documented safe merge applies. Last-write-wins must not silently overwrite recitation attempts, attendance, or confirmed homework. A conflict may be resolved by the Teacher whose change caused it or by any Owner/Admin. The resolution is audited.

**FR-SYNC-009:** Corrections to recitation attempts must be auditable. Access revocation must stop future server access/sync and lock or remove newly unauthorized cached data when the device next learns of the revocation, under an approved cache-retention policy.

### 15.5 Milestone completion checklist

- [x] Android-first app with offline teacher entry and later synchronization.
- [x] Individual teacher and madrasa workspaces.
- [x] Secure online read-only Student/Parent access through Android only in MVP.
- [x] English, Urdu script, and Roman Urdu; Asia/Karachi timezone; Monday week start.
- [x] User ID + Password login; email OTP password recovery; Admin-created Teacher/Student/Parent accounts.
- [x] Admin-configurable one-report-per-day or multiple-session daily-report mode.
- [x] Attendance-only Bulk Entry (Present, Late, Half day, Leave, Absent; revised 2026-10-30); individual Daily Entry for Hifz portions and quality.
- [x] Four overall performance labels; optional 1–5 quality rating with the approved named scale (FR-ATT-009); detailed mistake categories, severity, and repeated flag.
- [x] Teacher-marked, Admin-approved Leave (replaced excused absence on 2026-10-30).
- [x] Admin-managed Quran metadata; the 16-line Indo-Pak Mushaf for MVP (DEC-B70; publisher/edition, dataset, and layout source still open).
- [x] Professional default PDF with Admin customization.
- [x] Excel maximum 1,000 students/records per file as applicable; append-first validated import.
- [x] Admin-selectable AI provider, AI enable/disable, usage limits, and privacy controls.
- [x] Android push notifications only.
- [x] Offline sync conflict preservation and explicit resolution behavior.
- [x] Resolve implementation gates listed in Section 13 (closed 2026-10-30, §17). Deferred: the Android application ID before Play Console setup, and the AI provider before Phase 7.

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
- *Revised 2026-10-30 (§17 DEC-B22):* attendance is Present, Late, Half day, Leave, or Absent. Leave replaces excused absence: the Teacher or Admin marks it with a required reason, and the Madrasa Admin approves it. Reports show Leave and Normal Absence separately.
- Bulk Entry is strictly attendance-only. *Revised 2026-10-30:* it offers Present, Late, Half day, Leave, and Absent. Hifz portions, listening/recitation, mistakes, and quality are entered per student through individual Daily Entry.

### 16.3 Quran reference, Mushaf, reports, and access (Q131–Q135)

- Quran metadata (Surah, Ayat, Para) is managed by Madrasa Admin, who can add/edit the reference information used by teachers.
- MVP counts lines on the 16-line Indo-Pak Mushaf only (*revised 2026-11-09*, DEC-B70).
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
- Recovery-code regeneration applies to Owner/Admin two-factor sign-in (FR-AUTH-016). It requires recent authentication and 2FA, invalidates previous codes, and is audited; suspicious recovery requests require stronger identity/security review.
- Offline sync uses stable client UUIDs, idempotent operations, explicit conflict handling, and preserves both versions for meaningful conflicts rather than silent last-write-wins.
- Excel imports are previewed, validated, append-first, and never silently overwrite existing data; report exports are derived read-only outputs.
- AI is advisory only: it cannot alter source records, calculate authoritative quantities, assign final grades, confirm homework, or make access/discipline decisions. Teacher review is required.

### 16.6 Questionnaire status

- Product decision questionnaire: **Q1–Q139 recorded in the available planning history; Q139 is finalized as Android push notifications only.**
- The product-level questions previously listed as open in earlier drafts are now resolved by the decisions above, except where Section 13 explicitly identifies a technical implementation gate (for example provider/library, monetary caps, retention policy, role-permission detail, and device support).
- The Section 13 gates and the remaining design decisions were closed on 2026-10-30. Section 17 is the decision register.

## 17. Decision register (review of 2026-10-30)

This is the central register of every decision that was open anywhere in the repository on 2026-10-30. It supersedes conflicting wording elsewhere, as §16 does. Later decisions are added with their date (DEC-B60…B64, Sabaq lines, 2026-11-01; DEC-B65…B68, F01 implementation values, 2026-11-02).

- **History:** the original questions, their source references and the Q&A history are in [decision-log.md](decision-log.md).
- **Source:**
  - **Docs:** resolved from approved documents, with the evidence cited.
  - **PO Q&A:** answered by the product owner in the 2026-10-30 Q&A and confirmed in the final summary.
- **Status:**
  - **Approved:** the decision is final.
  - **Closed:** the item was a duplicate or obsolete.
  - **Deferred:** the product owner postponed it, and the reason is recorded.
  - **Superseded:** a later decision replaced it.
- **Tests:** the detailed acceptance criteria (in `docs/specs/`) that verify the decision. Each criterion has an E2E test in `e2e/`.

### 17.1 Approved role/permission matrix (DEC-B12)

"Assigned" means the Teacher's assigned classes, or every class when the Teacher has the "all classes" flag (FR-SEC-003).

| Capability | Owner | Admin | Teacher | Student | Parent |
|---|:-:|:-:|:-:|:-:|:-:|
| Org settings, daily-report mode, AI config, report template | ✔ | ✔ | — | — | — |
| Add/remove Admins, transfer ownership | ✔ | — | — | — | — |
| Create Teacher/Student/Parent accounts, set or reset passwords | ✔ | ✔ (not Admin/Owner passwords) | — | — | — |
| Set a Teacher's "all classes" flag | ✔ | ✔ | — | — | — |
| Classes, schedules, holidays | ✔ | ✔ | view assigned | — | — |
| Add/edit students (including Excel import) | ✔ | ✔ | assigned | — | — |
| Deactivate/move students, guardian links | ✔ | ✔ | — | — | — |
| Quran metadata | ✔ | ✔ | view | — | — |
| Attendance, daily entry, attempts, daily-record import | ✔ | ✔ | assigned | — | — |
| Mark Leave | ✔ (approved at once) | ✔ (approved at once) | assigned (awaits approval) | — | — |
| Approve/reject Leave | ✔ | ✔ | — | — | — |
| Homework draft/confirm | ✔ | ✔ | assigned | — | — |
| Revise confirmed homework | ✔ | ✔ | — | — | — |
| Resolve sync conflict | ✔ | ✔ | own conflicts | — | — |
| Publish reports; class summary | ✔ | ✔ | assigned | — | — |
| Reports, PDF, Excel export | ✔ | ✔ | assigned | own, published | linked, published |
| Internal notes | ✔ | ✔ | assigned | ✘ | ✘ |
| AI recommendations | ✔ | ✔ | assigned (if enabled) | ✘ | ✘ |
| Audit history | ✔ | ✔ | own actions only | — | — |

### 17.2 Register

| ID | Question | Final answer | Status | Source | Rationale | Requirements | Stories | Tests |
|---|---|---|---|---|---|---|---|---|
| DEC-A01 | Is an excuse reason required? | Optional, per design.md §4.7. Superseded by DEC-B22: the Leave reason is required | Superseded | Docs, then PO Q&A | Excused absence became Leave | FR-CAL-008 | US-016 | F04-AC14 |
| DEC-A02 | Which attempt drives current progress? | The latest attempt per portion; full history kept; no double counting | Approved | Docs: AGENTS §5 r9, ARCHITECTURE §9.3, AC-RPT-05 | Consistent in every document | FR-RPT-006 | US-039, US-040 | F09 criteria |
| DEC-A03 | Can a Parent be linked to several students? | Yes | Approved | Docs: FR-PORT-002, NFR-PORT-003, US-045, AC-SEC-03 | Plural in every source | FR-PORT-002 | US-045 | F10-AC5 |
| DEC-C01 | FR-ORG-006 multi-org membership | Superseded: one account per madrasa | Closed | Docs: FR-AUTH-011, §16.1 | Already decided | FR-ORG-006 | US-006 | F01-AC20/21 |
| DEC-C02 | FR-EXP-004 "if Excel export is enabled" | `.xlsx` export is in MVP; CSV is not | Closed | Docs: FR-XLS-006, §16.3 | Condition obsolete | FR-EXP-004 | US-061 | F14-AC16…19 |
| DEC-C03 | FR-EXP-005 "if Urdu is included in exports" | All three languages are included | Closed | Docs: FR-I18N-003 | Condition obsolete | FR-EXP-005 | US-055 | F13-AC2 |
| DEC-C04 | §6.3 "unless multi-session is approved" | It is approved | Closed | Docs: FR-DAY-008 | Already decided | FR-DAY-008 | US-019 | F05-AC6…9 |
| DEC-C05 | §10.8 step 9 "if portal access is enabled" | The portal is in the core release | Closed | Docs: FR-PORT-001/002 | Condition obsolete | FR-PORT-001 | US-044, US-045 | F10 criteria |
| DEC-C06 | Gate #12: remove bulk excused surfaces | Already done everywhere | Closed | Docs: FR-DAY-002A, design §4.8, US-015 | No surface remained | FR-DAY-002A | US-015 | F04-AC6 |
| DEC-C07 | §16.5 recovery-code line | Duplicate of gate #1; now applies to FR-AUTH-016 | Closed | Docs | Merged into DEC-B07 | FR-AUTH-016 | US-072 | F01-AC32 |
| DEC-C08 | Duplicate questions across specs, ARCHITECTURE and AGENTS | Merged into one DEC-B entry each | Closed | Docs | One answer per question | — | — | — |
| DEC-B01 | Who creates workspaces? (design D1) | The platform operator creates each workspace and its first Owner. An individual teacher holds Owner/Admin and Teacher roles | Approved | PO Q&A | Keeps "no self sign-up" | FR-ORG-001 | US-007 | F02-AC16 |
| DEC-B02 | Are Owner and Admin different? | Same, except only the Owner adds or removes Admins and transfers ownership | Approved | PO Q&A | Prevents Owner lock-out | FR-ORG-007 | US-007 | F02-AC15 |
| DEC-B03 | FR-AUTH-006 has no story | Add US-071 "Manage my profile" | Approved | PO Q&A | Closes a traceability gap | FR-AUTH-006 | US-071 | F01-AC27…29 |
| DEC-B04 | §10.8 step 1 contradiction | Admin creates the class; Teacher adds the student | Approved | PO Q&A | Follows DEC-B14 | FR-CLS-001, FR-STU-001 | US-010, US-011 | srs-10-8 journey |
| DEC-B05 | Authentication provider | Built into the API | Approved | PO Q&A | Fits the User ID model; no per-user fees | FR-AUTH-* | US-001…006 | F01 criteria |
| DEC-B06 | OTP email service | The host's email service: Amazon SES (from DEC-B53) | Approved | PO Q&A | One vendor | FR-AUTH-007 | US-002 | F01-AC7 |
| DEC-B07 | 2FA in MVP? | Required for Owner/Admin: authenticator app + 10 recovery codes; Owner/operator reset after a lost device | Approved | PO Q&A | Protects the widest-access accounts | FR-AUTH-016 | US-072 | F01-AC30…34 |
| DEC-B08 | Password policy | 8–64 characters, no composition rules, common passwords and the User ID blocked | Approved | PO Q&A | Usable for children; NIST-aligned | FR-AUTH-012 | US-004 | F01-AC16, F01-AC23 |
| DEC-B09 | User ID format | Global, case-insensitive, 3–32 characters, madrasa prefix suggested | Approved | PO Q&A | One login field, no clashes | FR-AUTH-013 | US-003 | F01-AC24 |
| DEC-B10 | Lockout and OTP limits | 6-digit OTP, 10 min, 5 tries, 3/hour; 10 failures in 15 min lock for 15 min; no active alert | Approved | PO Q&A | Balanced security and support load | FR-AUTH-014 | US-001, US-002 | F01-AC4, F01-AC25 |
| DEC-B11 | Admin direct password reset | Yes, audited; only the Owner resets an Admin | Approved | PO Q&A | Users without email | FR-AUTH-015 | US-002 | F01-AC26 |
| DEC-B12 | Role/permission matrix | §17.1 | Approved | PO Q&A | — | FR-SEC-*, FR-ORG-002 | all | F02 criteria |
| DEC-B13 | Wider Teacher access | The "all classes" flag | Approved | PO Q&A | Head teachers and supervisors | FR-SEC-003 | US-008 | F02-AC14 |
| DEC-B14 | Teachers create/edit students? | Yes, in assigned classes only; no deactivation or moves | Approved | PO Q&A | Faster roster for new arrivals | FR-STU-001 | US-011 | F03-AC15, F03-AC16 |
| DEC-B15 | Teachers import students? (gate #13) | Yes, into assigned classes only | Approved | PO Q&A | Consistent with DEC-B14 | FR-XLS-001 | US-058 | F14-AC21 |
| DEC-B16 | Teacher audit view | Own actions only | Approved | PO Q&A | Personal accountability | FR-AUD-004 | US-069 | F17-AC8, F17-AC14 |
| DEC-B17 | Who revises confirmed homework? | Owner/Admin only | Approved | PO Q&A | Tight control of finalized homework | FR-HW-012 | US-038 | F08-AC15, F08-AC17 |
| DEC-B18 | Who resolves sync conflicts? | The author or any Owner/Admin | Approved | PO Q&A | The person with context, plus a backup | FR-SYNC-008 | US-054 | F12-AC12, F12-AC17 |
| DEC-B19 | Bulk Absent for a student who recited (D4) | Suggest Late; keeping Absent needs an internal note; portions unchanged | Approved | PO Q&A | No contradiction goes unexplained | FR-DAY-010 | US-015 | F04-AC19 |
| DEC-B20 | Unmarked students (D8) | "N not marked" dialog: Mark them Absent / Go back | Approved | PO Q&A | No silent attendance | FR-CAL-010 | US-015 | F04-AC8, F04-AC9 |
| DEC-B21 | Holiday declared on a recorded date | Not a working day; records excluded from reports, kept in history; new entries refused | Approved | PO Q&A | A holiday has no class work | FR-CAL-009 | US-014 | F04-AC20 |
| DEC-B22 | Late arrival and new statuses | Present, Late, Half day, Leave, Absent. Leave replaces excused absence: reason required, Admin approves. All five in Bulk Entry. Attended = Present + Late + Half day | Approved | PO Q&A | Matches madrasa practice | FR-CAL-005, FR-CAL-007, FR-CAL-008, FR-DAY-002A, FR-DAY-011 | US-015…017, US-041, US-042 | F04-AC6, F04-AC13…18, F04-AC21…23, F05-AC18, F09-AC13, F09-AC17 |
| DEC-B23 | Extra work (D6) | A separate "Extra" portion | Approved | PO Q&A | Keeps the quantity rules intact | FR-QTY-006 | US-027 | F06-AC16 |
| DEC-B24 | Future dates | Refused | Approved | PO Q&A | Prevents mistaken entries | FR-DAY-001 | US-018 | F05-AC17 |
| DEC-B25 | Edit window | No lock; every edit audited | Approved | PO Q&A | Late corrections allowed | FR-DAY-009 | US-023 | F05-AC19 |
| DEC-B26 | Fractions for Lines/Ayat/Pages | Whole numbers only | Approved | PO Q&A | Simple, exact | FR-QTY-009 | US-026 | F06-AC17 |
| DEC-B27 | Explicit "No mistakes" | Yes, stores 0 | Approved | PO Q&A | Clean recitation ≠ missing data | FR-ATT-011 | US-028 | F07-AC14 |
| DEC-B28 | Mistake notes | Optional, private by default | Approved | PO Q&A | Useful detail, privacy-safe | FR-ATT-012 | US-028 | F07-AC15 |
| DEC-B29 | Offline homework confirmation (D2) | Allowed; the server re-checks the source on sync, and a changed source becomes a conflict | Approved | PO Q&A | Teachers work offline in class | FR-HW-017 | US-037 | F08-AC20, F08-AC21 |
| DEC-B30 | Due date and homework missed through absence or holiday | Next scheduled class day; missed homework carries over unchanged and is never failed | Approved | PO Q&A | "Saturday's homework is for Monday" | FR-HW-004, FR-HW-016 | US-036, US-038 | F08-AC18, F08-AC19 |
| DEC-B31 | Quran metadata source (gate #3) | Reviewed seed plus audited Admin edits; the reviewer is to be nominated by the product owner. *2026-11-09:* the seed loader is built (versioned, repeatable, provenance recorded). The dataset, its licence approval, and the reviewer are still open (§17.3), so no production seed exists | Approved (dataset still open) | PO Q&A | No manual entry of 6,236 Ayat | FR-SAB-007 | US-024 | F06-AC18 |
| DEC-B32 | Metadata change on used ranges | Records kept; invalid ones flagged for review | Approved | PO Q&A | No silent history change | FR-SAB-007 | US-024 | F06-AC19 |
| DEC-B33 | Report publishing (D3) | Teacher (assigned classes) or Admin publishes; all changes must be synced | Approved | PO Q&A | Teacher checks before parents see it | FR-RPT-010 | US-044, US-045 | F10-AC13…15 |
| DEC-B34 | Recurring difficulty | 3 or more attempts with Major/Repeated, or Not Remembered 3+ times | Approved | PO Q&A | Fewer false alarms | FR-MNR-006 | US-040 | F09-AC10 |
| DEC-B35 | Class-level reports | Staff-only class summary | Approved | PO Q&A | Whole-class view | FR-RPT-011 | US-073 | F09-AC18…20 |
| DEC-B36 | Student/Parent visible fields | FR-PORT-006 list | Approved | PO Q&A | Useful to families, no private data | FR-PORT-006 | US-044…046 | F10-AC17 |
| DEC-B37 | Parent linking (D5) | Admin links after offline verification and records the method | Approved | PO Q&A | No codes to leak | FR-PORT-007 | US-045 | F10-AC16 |
| DEC-B38 | Urdu digits | Western 0–9 | Approved | PO Q&A | Everyday use, simpler bidi | FR-I18N-009 | US-048 | F11-AC14 |
| DEC-B39 | Glossary owner | Dev team drafts; the product owner or their nominee approves | Approved | PO Q&A | Domain-correct wording | FR-I18N-008 | US-049 | — (review step) |
| DEC-B40 | Fonts and page layout (gate #4) | Inter, Noto Nastaliq Urdu, Noto Naskh Arabic; A4, repeated header, rows never split | Approved | PO Q&A | Familiar Urdu style; free licences | FR-PDF-004 | US-055 | F13-AC14 |
| DEC-B41 | PDF Admin controls | Orientation, show/hide sections, headings, preset colours; fixed order | Approved | PO Q&A | Flexible but testable | FR-PDF-002 | US-056 | F13-AC13 |
| DEC-B42 | Cache, app lock, revocation (gate #8) | 120-day cache; app lock required for Owner/Admin; purge rules | Approved | PO Q&A | Shared phones are common | NFR-OFF-011 | US-051, US-052 | F12-AC18…20 |
| DEC-B43 | Excel version marker and batch (D7) | Hidden `_meta` sheet; 200-row batches | Approved | PO Q&A | Survives user edits | FR-XLS-018 | US-060 | F14-AC22 |
| DEC-B44 | Retention (gate #6) | NFR-PRV-005 table | Approved | PO Q&A | Minimal retention; legal review to follow | NFR-PRV-005 | US-055, US-058, US-063, US-069 | — (operational policy) |
| DEC-B45 | AI provider and budget (gate #5) | Budget USD 10 per madrasa per month (Admin may lower). Provider **Deferred** to Phase 7 | Approved (budget) / **Deferred** (provider) | PO Q&A | FR-AI-012 requires a provider comparison first | FR-AI-012 | US-064 | F15-AC18 |
| DEC-B46 | AI data categories | Five toggles, on by default; names, contacts and notes never sent | Approved | PO Q&A | Useful defaults, strong privacy | FR-AI-013 | US-065 | F15-AC16 |
| DEC-B47 | AI output language | The user's UI language | Approved | PO Q&A | Matches the app | FR-AI-014 | US-063 | F15-AC17 |
| DEC-B48 | Push event catalogue (gate #11) | "Report published" only | Approved | PO Q&A | Smallest useful set | FR-NOT-004 | US-066 | F16-AC11 |
| DEC-B49 | Push provider | Expo Push Service (via FCM) | Approved | PO Q&A | Fits the Expo stack | FR-NOT-004 | US-066 | F16-AC1…7 |
| DEC-B50 | Consent defaults | On by default, can be turned off | Approved | PO Q&A | Parents actually receive reports | FR-NOT-004 | US-067 | F16-AC12 |
| DEC-B51 | Proposed stack and ADR-001…011 | All approved; ADR-012/013 added | Approved | PO Q&A | — | NFR-MNT-* | all | — (architecture) |
| DEC-B52 | Android version and devices (gate #7) | Android 8.0+ (or the Expo minimum); device matrix; Play tracks | Approved | PO Q&A | Reach older phones | NFR-COMP-001 | all | layouts journey |
| DEC-B53 | Hosting and targets (gate #9) | AWS Mumbai; 20 madaris / 200 teachers / 5,000 students; p95 < 500 ms, report < 3 s, sync < 10 s, 99.5% uptime | Approved | PO Q&A | Nearest region | NFR-PERF-006 | all | — (performance tests at Phase 8) |
| DEC-B54 | CI and test control (gate #10) | GitHub Actions gates; nightly Maestro; test-only control API in local/staging | Approved | PO Q&A | — | NFR-MNT-005 | all | e2e support fixtures |
| DEC-B55 | Android application ID | `com.hifzamanah.app` | Approved | PO decision 2026-11-08 (was Deferred on 2026-10-30) | Needed for device E2E runs and Play Console setup; it cannot change after the first release | — | all | every mobile flow (`appId`) |
| DEC-B56 | Student fields | Name and class required; roll number/External ID, admission date, private notes optional | Approved | PO Q&A | Collect only what is needed | FR-STU-005 | US-011 | F03-AC17 |
| DEC-B57 | Dual enrollment | One active class | Approved | PO Q&A | Clear scope and reports | FR-STU-006 | US-012 | F03-AC18 |
| DEC-B58 | Duplicate class names | Blocked (case-insensitive, active classes) | Approved | PO Q&A | Unambiguous Excel mapping | FR-CLS-003 | US-010 | F03-AC14 |
| DEC-B59 | Page size | 25, more on scroll | Approved | PO Q&A | Low-end phones | NFR-PERF-001 | US-011 | F03-AC19 |
| DEC-B60 | How is Sabaq measured? *(2026-11-01)* | Lines over a Surah/Ayat range. Rubu, Half, Salasah, and Complete are not offered for Sabaq. Sabqi and Manzil are unchanged | Approved | PO request 2026-11-01 | Sabaq is a new lesson, recited and counted by lines | FR-SAB-002/003/009/010, FR-QTY-010, FR-HW-002 | US-020, US-033, US-059 | F05-AC10, F05-AC20, F05-AC22, F08-AC1, F14-AC23 |
| DEC-B61 | Total Lines vs. Assigned Lines *(2026-11-01)* | Total Lines = lines the range covers; Assigned Lines ≤ Total and defaults to it. A carry-forward keeps the range and Total and assigns the remaining lines | Approved | PO Q&A 2026-11-01 | Keeps the original reference on carried-forward work | FR-SAB-003, FR-HW-018 | US-020, US-035 | F05-AC21, F08-AC22 |
| DEC-B62 | Can one Sabaq portion cross Surahs? *(2026-11-01)* | No. One Surah per portion; a lesson crossing Surahs is two portions | Approved | PO Q&A 2026-11-01 | Matches the Surah + start/end Ayat fields | FR-SAB-002 | US-020 | F05-AC21 |
| DEC-B63 | Para on a Sabaq portion *(2026-11-01)* | Derived from the range, not entered | Approved | PO Q&A 2026-11-01 | Keeps Para-wise reports and the Sabqi default | FR-SAB-001, FR-SBQ-003 | US-020, US-021 | F05-AC10, F05-AC21 |
| DEC-B64 | Where does Total Lines come from? *(2026-11-01)* | Pre-filled from the Mushaf layout (the 16-line Indo-Pak edition since DEC-B70); the Teacher confirms or corrects; stored with its edition and never recalculated | Approved | PO Q&A 2026-11-01 | Explicit count that respects the edition | FR-SAB-008 | US-020 | F05-AC21 |
| DEC-B65 | Session lifetime *(2026-11-02)* | Access token about 15 minutes, refreshed silently. A session ends 30 days after sign-in; refreshing does not extend it. Sign-out, password reset, deactivation, and a two-factor reset still end it at once | Approved | PO Q&A 2026-11-02 | A month of daily use without signing in again | FR-AUTH-003 | US-001 | F01-AC5, F01-AC6 |
| DEC-B66 | "Recent sign-in" for recovery-code regeneration *(2026-11-02)* | Signed in within the last 15 minutes; refreshing a session does not count as signing in | Approved | PO Q&A 2026-11-02 | Short enough to stop a borrowed session | FR-AUTH-016 | US-072 | F01-AC32 |
| DEC-B67 | Progressive sign-in delay *(2026-11-02)* | After 5 failures within 15 minutes: 1 s, 2 s, 4 s, 8 s, then 8 s per attempt; applied the same way to unknown User IDs | Approved | PO Q&A 2026-11-02 | Slows guessing without revealing which IDs exist | FR-AUTH-014 | US-001 | F01-AC4, F01-AC25 |
| DEC-B68 | Database for local development and tests without Docker *(2026-11-02)* | Embedded Postgres (PGlite) over the normal wire protocol, with the same driver and SQL. Docker Compose stays the CI setup; production stays managed Postgres | Approved | PO Q&A 2026-11-02 | Docker is not available on the development machine | NFR-MNT-005 | all | API integration and E2E runs |
| DEC-B69 | Does changing the email on My profile need the current password? *(2026-11-02)* | Yes. The server checks it under the sign-in throttle; a wrong or missing password changes nothing. Display name and language need no password | Approved | PO request 2026-11-02 (F01 code review M5) | The email receives reset codes, so a borrowed session must not redirect recovery | FR-AUTH-006 | US-071 | F01-AC27, F01-AC29 |
| DEC-B70 | Which Mushaf is the target? *(2026-11-09)* | The 16-line Indo-Pak (South Asian) Mushaf, replacing the standard 15-line Mushaf. Editions are data, so more can be added later. The exact publisher/edition and its page/line layout are not yet identified (§17.3) | Approved (edition details open) | PO instruction 2026-11-09 (F06) | The Mushaf the target madaris use; Indo-Pak printings differ, so no layout is assumed | FR-SAB-006…008 | US-020, US-026 | F05-AC21, F06-AC8 |
| DEC-B71 | Which publisher is the target? *(2026-11-09)* | **Taj Company** is the primary target publisher/edition; the candidate profile is Taj Indo-Pak 16-line. The exact printing and edition identifier, the page count (548 is only a candidate, from QUL resource 11), and the page/line mapping are **not verified**; they must be checked against a physical Taj Mushaf from the target madaris. No licence follows from this decision. F06 MVP scope is Surah, Ayat, and Para metadata, the Taj edition profile, the verified layout, and the offline snapshot; Ruku, Hizb, quarter-Hizb, and seven-Manzil divisions are later-phase candidates | Approved (printing, page count, layout, licence open) | PO planning decision 2026-11-09 (F06) | The target madaris mainly use the Taj Company edition | FR-SAB-006, FR-SAB-011…015 (proposed) | US-024, US-026 | F06-AC8; planned F06-AC20…27 |
| DEC-B72 | Approve the Quran reference data design? *(2026-11-09, OD-QR-6)* | Yes: ADR-017 is accepted, and FR-SAB-011…014 are approved. Changes go in a new migration 0010, never in an edited 0009. FR-SAB-014's delivery mechanism (OD-QR-7) stays open. **No dataset, licence, or physical verification is approved by this** | Approved | PO 2026-11-09 ("start implementation", backend first) | Lets the F06 backend be built and tested with synthetic data while licences are pending | FR-SAB-011…014 | US-024, US-026 | planned F06-AC20, AC21, AC23, AC25…27 |
| DEC-B73 | Must a Sabqi/Manzil Surah/Ayat range lie within its Para? *(2026-11-09, OD-QR-12)* | No. It is checked against the Surah's Ayat count only (unchanged) | Approved | PO 2026-11-09 | No new rule beyond US-025 | FR-SBQ-*, FR-MNZ-* | US-025 | planned F06-AC22 |
| DEC-B74 | Is page → start line → end line selection in the MVP? *(2026-11-09, OD-QR-8)* | No. Kept for a later phase, after a verified layout exists | Approved | PO 2026-11-09 | It needs a verified Taj layout, which is blocked on licences | FR-SAB-015 | US-020 | — |
| DEC-B75 | How do staff devices get Quran reference data offline? *(2026-11-09, OD-QR-7)* | Option A: a versioned snapshot from the HifzAmanah API after the first online sign-in (ADR-018); not bundled in the APK | Approved | PO review of the F06 report, 2026-11-09 | Per-madrasa data, updates without an app release, withdrawable distribution | FR-SAB-014 | US-025 | F06-AC24 |
| DEC-B76 | Can a Para quarter be picked as a position? *(2026-11-09, OD-QR-10)* | No. Para quantities only in the MVP; Rubu, Half, Salasah, and Complete are never converted into Ayat or line positions | Approved | PO 2026-11-09 | No approved quarter-marks source; ranges already give positions | FR-QTY-002, FR-QTY-003 | US-027 | — |
| DEC-B77 | Do Surah-heading and Bismillah lines count in Total Lines? *(2026-11-09, OD-QR-11)* | No. Ayat lines only; headings and Bismillah stay separate line types. Teacher consultation is still recommended before the final production rollout | Approved | PO 2026-11-09 | Lines measure memorised text; the count does not depend on where a lesson starts | FR-SAB-008, FR-SAB-012 | US-026 | F06-AC23 |
| DEC-B78 | What does the system verify about the physical Mushaf? *(2026-11-09)* | Automated validation covers the digital structure, metadata, mappings, checksums, source registration, and licence gates. Physical Taj Mushaf comparison is a human review; the system keeps the reviewer's identity, the exact printing details, the review date, the decision, and the signed approval evidence. `layoutVerified = true` only after an approved, signed production import for that madrasa; signed test data never counts. Nothing claims an automated match with the physical Mushaf | Approved | PO 2026-11-09 | Criteria describe only what the system can enforce | FR-SAB-013 | US-024, US-026 | F06-AC20, AC21, AC27 |
| DEC-B79 | What happens when a source licence is withdrawn? *(2026-11-09, ADR-018)* | Withdrawn data is excluded from all future snapshots; the server marks the affected snapshot versions revoked; a device removes revoked cached data on its next successful online connection. No remote wipe of offline devices is claimed. Legal and retention implications are documented (ADR-018 §6) | Approved | PO 2026-11-09 | Licensed data stays controllable without overstating what an app can do | FR-SAB-011, FR-SAB-014 | US-024, US-025 | F06-AC26 |

### 17.3 Open items after this review

- **Deferred:**
  - DEC-B45, the AI provider vendor: until the FR-AI-012 comparison in Phase 7.
- **Product-owner action items** (these are not open decisions):
  - Nominate the Quran metadata reviewer (DEC-B31).
- **Open: Quran data (2026-11-09).** These block the production seed, F06-AC18, and the F06 gate. None may be marked resolved without the product owner's decision:
  - the exact Taj Company printing and its edition identifier (publisher decided: Taj Company, DEC-B71; printing open);
  - the approved Quran metadata dataset (DEC-B31);
  - the dataset's licence approval, covering commercial use and redistribution (DEC-B31);
  - the verified 16-line page/line layout source (DEC-B70);
  - the reviewer responsible for approving Quran metadata (DEC-B31).
- **Open: Quran reference data design (2026-11-09, ADR-017 Proposed).** Research: [handover/F06-quran-dataset-candidates.md](handover/F06-quran-dataset-candidates.md). Every QUL resource checked states no licence ("We don't have copyright information for this resource"), so each is `LICENSE_REVIEW_REQUIRED`. Tanzil's licence could not be verified. None is approved.
  - OD-QR-1: *narrowed 2026-11-09 by DEC-B71.* Taj Company is the publisher. Still open: the exact Taj printing and edition identifier, and confirmation of the 16-line, 548-page profile against a physical Taj Mushaf from the target madaris.
  - OD-QR-2: the approved source per category (recommended: Tanzil for Surahs and Para if its licence is verified, else QUL 70/68 with permission; QUL 11 for the Taj layout, only after permission).
  - OD-QR-3: written permission and legal review. Requests go to Tarteel (QUL), **and Taj Company is a prerequisite for any Taj layout data**. Printed-Mushaf ownership grants no digital rights, and a public download is not a redistribution licence.
  - OD-QR-4: nominate the qualified Quran reviewer (as DEC-B31 above).
  - OD-QR-5: *closed 2026-11-09 by DEC-B71:* Ruku, Hizb, quarter-Hizb (Rub al-Hizb), and seven-Manzil divisions are later-phase candidates, unless an approved source and a clear MVP need are established.
  - OD-QR-6: *closed 2026-11-09 by DEC-B72* (ADR-017 accepted; FR-SAB-011…014 approved).
  - OD-QR-7: *closed 2026-11-09 by DEC-B75* (API snapshot after the first online sign-in; design [ADR-018](adr/ADR-018-quran-reference-snapshot-offline-cache.md); implementation plan [handover/F06-snapshot-implementation-plan.md](handover/F06-snapshot-implementation-plan.md), awaiting review). Plan questions P1–P4 (withdrawn Admin-edited rows, server deletion and derived counts after a withdrawal, a maximum offline cache age, the host screen for the offline flow) are open there.
  - OD-QR-8: *closed 2026-11-09 by DEC-B74* (page/line selection not in the MVP).
  - OD-QR-9: the attribution requirements (wording, and where it is shown; recommended: About screen, all three locales).
  - OD-QR-10: *closed 2026-11-09 by DEC-B76* (Para quantities only in the MVP).
  - OD-QR-11: *closed 2026-11-09 by DEC-B77* (Ayat lines only; teacher consultation recommended before production rollout).
  - OD-QR-12: *closed 2026-11-09 by DEC-B73* (not enforced; checked against the Surah's Ayat count only).
  - Readiness review, checklists, and permission drafts (not sent): [handover/F06-implementation-readiness.md](handover/F06-implementation-readiness.md).
- **Product-owner action items, continued:**
  - Approve the glossary, or nominate a reviewer (DEC-B39).
  - Obtain legal confirmation of the retention policy (DEC-B44).
