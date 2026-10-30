# HifzAmanah — Detailed Product UI/UX Design Specification

**Document:** `design.md`  
**Product:** HifzAmanah  
**Tagline:** A Trusted Companion for Quran Memorization  
**Version:** 1.6  
**Design direction:** Premium Islamic + Modern SaaS  
**Requirements baseline:** `SRS.md` v1.11, `user-stories.md` v1.4, and `ARCHITECTURE.md` v1.1  
**Changes in 1.6:** Applied the decision review of 2026-10-30 (SRS §17). §11 now records how each open decision was closed.
- **Attendance:** Present, Late, Half day, Leave, or Absent. Leave replaces excused absence (§4.7, §4.8, §4.14).
- **Bulk Entry:** an unmarked-students dialog (§4.8).
- **Homework:** offline confirmation and carry-over (§4.9).
- **Reports:** publishing and the class summary (§4.10–§4.12).
- **Sign-in:** two-factor sign-in for Owner/Admin and the profile screen (§4.2, §4.16).
- **Fonts and digits:** §2.3, §6.
- **Story map:** new §13 rows for US-071…073.  
**Changes in 1.5:** The quality scale is now 1 = Excellent … 5 = Weak (lower is better), Roman Urdu labels are approved, averages show the label of the nearest score, and trend charts put 1 at the top. Updated §4.7, §4.10, §5.8, §10, §11.  
**Changes in 1.4:** Restores named quality labels using the approved Quality Rating Scale (SRS FR-ATT-009). Every quality score is shown as number + label. Updated §4.6, §4.7, §4.10, §5.4, §5.8, §10, §11, §13.  
**Changes in 1.3:** Aligned with SRS §16 decisions and `user-stories.md`. The following changed:
- Sign-in uses User ID + password, with an email OTP for reset and no sign-up (§4.2).
- Mistakes are recorded by category, severity, and repeated flag (§4.7, §5.4).
- The quality rating is shown as a number only, with no word labels, plus a separate overall performance label (FR-ATT-009).
- Excused absence is requested by the Teacher and approved by the Admin (§4.7, §4.14).
- Notification preferences are in scope (§4.16).
- §11 now lists only decisions that are still open.
- §13 is remapped to the US-001…US-070 IDs.  
**Changes in 1.2:** Adds §13, which maps each UI-related user story (SRS §16) to its screen, interaction, states, validation, and accessibility/localization behavior. No screen is redesigned.  
**Changes in 1.1:** Bulk Entry is attendance-only (§4.8). Quality selector uses the approved 1–5 scale (§4.7, §5.4).  
**Status:** Design specification for review and implementation planning; this document does not claim the app is implemented.

---

## 1. Purpose and scope

This document translates HifzAmanah's requirements into an actionable UI/UX system for an Android-first, offline-capable Hifz management application for individual teachers and madaris.

The design must help teachers record daily recitation reliably, manage Sabaq/Sabqi/Manzil separately, track multiple portions and attempts, prepare teacher-reviewed homework, and view reports calculated from source records. It must also support role-based access, offline work and synchronization, English, Urdu script, and Roman Urdu.

### 1.1 In scope

- Authentication, account settings, and workspace selection
- Individual teacher and madrasa workspaces
- Owner/admin/teacher/student/guardian role-aware navigation
- Classes, student records, teacher assignments, schedules, holidays, and attendance
- Individual daily Hifz entry and whole-class bulk attendance entry
- Separate Sabaq, Sabqi, and Manzil sections with multiple portions
- Portion attempts, assigned/completed/remaining quantity, mistakes, quality, status, and remarks
- Draft homework suggestions, review/edit, and explicit teacher confirmation
- Weekly/monthly reports, filters, print/PDF/export controls where authorized
- Student and verified guardian read-only views of published data
- Offline status, durable local saves, sync queue, errors, and conflict review
- Excel import/export workflows and row-level validation
- Localization, RTL/LTR handling, accessibility, empty/loading/error states

### 1.2 Design principles

1. **Teacher workflow first:** make daily entry and bulk entry easy to reach.
2. **Clear Hifz domain language:** never merge Sabaq, Sabqi, and Manzil into one undifferentiated field.
3. **Portion independence:** each portion has its own quantity, status, attempt history, and remarks.
4. **No misleading totals:** quantity always includes a unit; incompatible units are not added together.
5. **Teacher authority:** homework recommendations remain drafts until explicitly confirmed by a teacher.
6. **Offline honesty:** a local save is not the same as a successful server sync.
7. **Privacy by default:** student/guardian views only show authorized, published information; internal notes remain private.
8. **Respectful Islamic aesthetic:** calm and premium, not ornamental or visually noisy.
9. **Localization by design:** Urdu is RTL; English and Roman Urdu are LTR; Quranic Arabic stays intact.
10. **Accessible states:** do not use color alone to convey status or errors.

---

## 2. Brand and visual identity

### 2.1 Brand identity

- **Name:** HifzAmanah
- **Tagline:** A Trusted Companion for Quran Memorization
- **Personality:** trustworthy, calm, disciplined, supportive, clear, respectful
- **Visual direction:** premium Islamic warmth combined with modern SaaS clarity

### 2.2 Color tokens

| Token | Hex | Intended use |
|---|---|---|
| `brand.primary` | `#116747` | Primary buttons, selected navigation, key actions |
| `brand.deep` | `#20342C` | Strong headings, deep surfaces, high-emphasis text |
| `brand.gold` | `#C6A45A` | Rare highlights, milestones, premium accent |
| `canvas` | `#FAF8F0` | Main app background |
| `surface` | `#FFFFFF` | Cards, form surfaces, sheets |
| `surface.selected` | `#E5F1E9` | Selected rows, quiet positive backgrounds |
| `border.default` | `#E5E9E2` | Dividers, outlines, card borders |
| `text.primary` | `#1F2924` | Main text |
| `text.secondary` | `#66736B` | Supporting text and metadata |
| `status.success` | `#287A4B` | Completed/success state |
| `status.warning` | `#9A6700` | Partial/attention state |
| `status.danger` | `#B42318` | Validation errors and failed recitation state where appropriate |
| `status.info` | `#245CB5` | Informational states |
| `status.neutral` | `#66736B` | Pending, absent, unknown, offline-neutral states |

#### Color usage rules

- Emerald is the primary interaction color, not a background for every card.
- Ivory is the calm canvas; white cards should remain distinct from it.
- Gold should be a small accent and should not be used for small text on ivory.
- Use text labels and icons alongside status colors.
- Use danger red for errors or destructive actions, not as a general Islamic brand color.
- Do not rely on gradients to make the interface look premium; use hierarchy, spacing, and typography.

### 2.3 Typography

| Role | Suggested style | Size / line height |
|---|---|---|
| Screen title | Inter Semibold | 24 / 28 |
| Section title | Inter Semibold | 18 / 24 |
| Card title | Inter Semibold | 16 / 22 |
| Body | Inter Regular | 14 / 20 |
| Secondary/helper | Inter Regular | 12 / 16 |
| Button | Inter Semibold | 14 / 20 |
| Large metric | Inter Semibold, tabular numerals | 26 / 32 |

- English and Roman Urdu: **Inter**, with platform sans-serif fallback.
- Urdu UI and Urdu PDF text: **Noto Nastaliq Urdu** (approved 2026-10-30, SRS FR-PDF-004). Allow taller line heights for Nastaliq.
- Quranic text and Surah names: **Noto Naskh Arabic** (approved, FR-PDF-004).
- Do not transliterate, auto-correct, or translate Quranic Arabic text.
- Use tabular numerals for counts, quantities, and reports. Every language uses Western digits (0–9), including Urdu (FR-I18N-009).
- Test diacritics, Arabic shaping, line wrapping, and mixed-direction content on actual Android devices.

### 2.4 Spacing, sizing, and shape

| Token | Value | Use |
|---|---:|---|
| `space.1` | 4 dp | Icon/text micro-gap |
| `space.2` | 8 dp | Compact related items |
| `space.3` | 12 dp | Related fields |
| `space.4` | 16 dp | Standard padding |
| `space.6` | 24 dp | Section separation |
| `space.8` | 32 dp | Major separation |
| `radius.input` | 12 dp | Inputs and selectors |
| `radius.card` | 16 dp | Standard cards |
| `radius.sheet` | 20 dp | Bottom sheets and dialogs |
| `radius.pill` | 999 dp | Chips and segmented controls |
| `touch.minimum` | 44 dp | Minimum interactive target |
| `touch.preferred` | 48 dp | Frequent/primary controls |

- Phone horizontal inset: 16 dp.
- Tablet horizontal inset: 24 dp or responsive grid.
- Use a subtle 1 dp border for most cards; reserve shadows for overlays and floating surfaces.
- Icons should be consistent outlined icons, normally 20–24 dp.
- Avoid excessive pill shapes on every element; use them primarily for chips and segmented controls.

---

## 3. App navigation and information architecture

### 3.1 Teacher bottom navigation

Primary phone navigation:

1. **Home**
2. **Students**
3. **Daily Entry**
4. **Homework**
5. **Reports**

`Daily Entry` should be visually prominent because it is a frequent task, but it must not obscure other navigation items.

### 3.2 Secondary navigation

Accessible from profile/menu or a “More” section:

- Classes and teacher assignments
- Timetable and schedule
- Holidays and no-class days
- Attendance history
- Excel import/export
- Sync queue and conflict review
- Organization/workspace settings
- Language and account/security settings
- Audit history for authorized roles
- Help and app information

### 3.3 Role-based navigation

#### Owner / Admin

- Organization overview
- Members, roles, and teacher assignments
- Classes and students
- Schedule, holidays, and attendance oversight
- Import/export
- Reports and audit history
- Organization settings

#### Teacher

- Assigned classes and students
- Individual daily Hifz entry and bulk class attendance
- Homework suggestions and confirmation
- Student history and reports
- Sync queue and personal settings

#### Student

- Read-only home
- Own published progress
- Own published reports
- Permitted attendance summary
- Confirmed homework (FR-PORT-006)

#### Guardian

- Read-only dashboard for verified linked students (a Parent may have several)
- Published progress and reports
- Permitted attendance summary
- Confirmed homework (FR-PORT-006)

**Security rule:** hiding a button is not authorization. The app and server must enforce permissions. If a guardian has not been verified and linked to a student, show a secure linking state instead of a public student search.

---

## 4. Screen specifications

Each screen below defines purpose, structure, components, actions, and required states. Actual copy must be localized.

### 4.1 Splash / app launch

**Purpose:** establish identity and load the session safely.

**Layout**
- HifzAmanah mark and wordmark
- Tagline in a smaller line
- Calm ivory or deep emerald background
- Small loading indicator only when initialization takes noticeable time

**Behavior**
- Check local app state and pending sync metadata without falsely implying server connectivity.
- Route to sign-in, workspace selection, or the authorized home screen.
- Do not show fabricated progress metrics on the splash screen.

### 4.2 Sign-in and account access

**Required screens**
- Sign-in
- Forgot password → enter User ID → enter email OTP → set new password
- Session-expired state
- Access-revoked state

**Layout**
- Brand header
- User ID field (email is not accepted as a login identifier)
- Password field with show/hide control
- Primary sign-in button
- Forgot password action
- Language selection
- No sign-up action. The Madrasa Admin creates Teacher, Student, and Parent accounts and sets their initial passwords (FR-AUTH-009). The platform operator creates each workspace and its first Owner (FR-ORG-001). There is no forced password change on first sign-in.

**Two-factor step (Owner and Admin only, FR-AUTH-016)**
- **First sign-in:** set up an authenticator app (QR code plus a manual key). The user then sees 10 one-time recovery codes and must confirm they saved them before continuing.
- **Later sign-ins:** enter a 6-digit authenticator code, or use a recovery code.
- **Lost device:** the screen says to contact the Owner (for an Admin) or HifzAmanah support (for the Owner).

**Forgot password**
- The user enters their User ID, not their email, because a Student and Parent may share one email.
- After the request, show a neutral confirmation that does not reveal whether the User ID exists.
- The OTP entry screen shows its expiry and a resend action that respects the rate limit.

**States**
- Idle, submitting, invalid field, invalid credentials, network unavailable, session expired, account/access unavailable, OTP expired/invalid, too many attempts.
- Error messages must preserve entered non-secret information and explain the next action.
- Lockout: 10 failed attempts within 15 minutes lock the account for 15 minutes. The message never reveals whether the User ID exists (FR-AUTH-014).

### 4.3 Workspace selection

Each account belongs to one madrasa or individual-teacher workspace; a person in several madaris has a separate account and User ID for each (FR-AUTH-011). This screen is therefore needed only on a device where more than one account has been used. It lets the user switch accounts, and each switch requires sign-in to that account.

**Workspace card**
- Workspace name
- Workspace type
- Role in that workspace
- Last-used label where available
- Select/open action

Do not expose another organization's student or report data before workspace authorization is established.

### 4.4 Teacher Home

**Purpose:** give a teacher an operational overview and shortcuts, not a vanity dashboard.

**Top region**
- Greeting and active workspace/class context
- Profile/menu control
- Persistent sync status indicator

**Primary actions**
- Record Daily Hifz
- Bulk Class Entry
- Students

**Operational cards**
- Today's scheduled classes
- Entries not yet completed
- Homework drafts awaiting review
- Pending sync changes

**Rules**
- Show metrics only when calculated from real records.
- Every metric should open the filtered list behind it.
- If no data exists, show an empty state and an actionable next step.
- If offline, label local/provisional information accurately.
- Avoid charts on the home screen unless they materially help a teacher decide what to do next.

### 4.5 Student list

**Header**
- Title: Students
- Search field
- Class filter
- Active/inactive filter
- Add student action for Owner/Admin, and for Teachers in their assigned classes (FR-STU-001)

**Student row/card**
- Student name
- Class and roll number (External Student ID) when recorded
- Active/inactive state
- Last record date if available
- Optional small progress indicator with a clear definition

**Behavior**
- Search and filtering must work as the roster grows.
- Use pagination or incremental loading for large lists.
- A UI may display a name, but updates must use stable internal IDs; names alone are never update keys.
- Deactivation must preserve historical records.

**States**
- Loading, no students yet, no matching results, offline cached list, error, access denied.

### 4.6 Student profile

**Header**
- Student name and class
- Current active/inactive status
- Available actions based on role

**Sections/tabs**
- Overview
- Daily History
- Homework
- Reports
- Attendance
- Details

**Overview**
- Recent records
- Sabaq, Sabqi, and Manzil summaries shown separately
- Recent confirmed homework
- Attendance summary, if schedule data is available
- Quality scores in Daily History and progress details use the approved scale (§4.7): number + label, "Not recorded" when missing

**Privacy**
- Private teacher/admin notes must be visibly labelled “Private to staff”.
- Student and guardian views must not render private notes, including in exports or PDF.
- Historical records remain available when class enrollment changes or a student is deactivated.

### 4.7 Daily Entry — individual student

**Purpose:** record what was assigned and what the student actually recited.

#### Step 1: Context

- Date picker (today or earlier; future dates are not selectable, FR-DAY-001)
- Class selector
- Student selector
- Session label, shown and required only when the Madrasa Admin has set the daily-report mode to multiple sessions (default is one report per student/date)
- Schedule context where available

#### Step 2: Attendance

Attendance is a separate control from recitation performance.

- Present
- Late (arrived after attendance was marked; an Absent record can be changed to Late)
- Half day (left early)
- Leave (the family told the madrasa in advance). A reason is required. When a Teacher marks it, it shows "Leave — awaiting approval" until an Admin decides, then "Leave" or "Leave rejected". Leave marked by an Admin is approved at once. The reason is private to staff (FR-CAL-008).
- Absent

Hifz portions can be added only for Present, Late, or Half day. For Absent or Leave, the section cards are replaced by a "Change to Late" action (FR-DAY-011).

Do not automatically mark an unscheduled day, holiday, or no-class day as absent.

#### Step 3: Sabaq / Sabqi / Manzil

Render three clearly separated section cards. Do not merge them into one list without section labels.

Each section supports an **Add portion** action. Sabqi and Manzil must support multiple independently tracked Para portions.

**Portion card fields**
- Section type and portion number
- Para/Juz number where applicable
- Optional Surah/Ayat range
- Assigned quantity
- Completed quantity
- Quantity unit
- Calculated remaining quantity when units/range are compatible
- Mistakes (optional list), or an explicit **"No mistakes"** choice, which stores 0. An empty list without that choice is "Not recorded" (FR-ATT-011). Each mistake has:
  - a category: Harkaat, Tajweed, Lafzi, Ayat bhoolna, Tarteeb, or Waqf/Ibtida
  - a severity: Minor or Major
  - a separate "Repeated" toggle (repeated is not a severity)
  - an optional short note, private to staff by default (FR-ATT-012)
- Quality rating (optional), using the approved named 1–5 scale below
- Performance status
- Remarks/notes with correct visibility

**Overall performance label** (once per daily record, below the section cards; optional): Excellent, Good, Average, or Needs Improvement. This label is separate from the per-portion quality rating, and the UI must not derive one from the other. Because some words are shared with the quality scale, always caption this control "Overall performance" so it is not mistaken for a quality score.

**Quantity units**
- Rubu = 1/4 Para
- Half = 1/2 Para
- Salasah = 3/4 Para
- Complete = 1 full Para
- Lines (whole numbers)
- Ayat (whole numbers)
- Pages (whole numbers)

Always display the unit. Never add lines, pages, Ayat, and Para fractions into a combined total without an approved conversion. Changing the unit must not silently reinterpret an existing number.

**Quality rating scale** (approved, SRS FR-ATT-009; stored as integer 1–5)

| Score | English | Urdu | Roman Urdu |
|---|---|---|---|
| 1 | Excellent | ممتاز | Mumtaz |
| 2 | Good | اچھا | Achha |
| 3 | Average | اوسط | Ausat |
| 4 | Needs Improvement | مزید محنت کی ضرورت | Mazeed mehnat ki zaroorat |
| 5 | Weak | کمزور | Kamzor |

- **Lower is better:** 1 is the best score and 5 the weakest. List the options in the order 1 → 5, so Excellent comes first.
- Always show the number **and** its label in the active language, e.g. "1 · Excellent", "۱ · ممتاز", or "1 · Mumtaz". Never show the label without the number, or a different label for the same number.
- Use this one mapping everywhere a quality score appears: Daily Entry, the Sabaq, Sabqi, and Manzil portion cards, record detail and attempt history, the student profile, weekly and monthly reports, PDFs, and quality trend charts and summaries.
- The score is chosen by the teacher. The UI never suggests or pre-fills a score, and AI output never sets one.
- Quality is not a mistake count and not a performance status. Keep the three visually separate.

Use a single-select control with a clear "Not assessed" (blank) state, which is the default. Never preselect a rating. A blank rating is shown as "Not recorded", never as 0.

**Performance status values**
- Completed
- Partial
- Not Remembered
- Absent
- Not Assigned
- Pending

**Business behavior**
- Remaining quantity = `max(0, assigned - completed)` only for the same portion and compatible unit.
- Completed quantity cannot exceed assigned quantity. When a student recites more than assigned, the teacher records the assigned amount as completed and uses **Add extra portion** for the rest. The new portion card is labelled "Extra" (FR-QTY-006).
- For Not Remembered, completed quantity is normally zero and remaining is the applicable assigned quantity, subject to teacher correction.
- Absent, Not Assigned, and Pending are not automatically treated as failed recitation or zero quality.
- Missing mistakes or quality means “not recorded”, not zero.
- Repeated attempts remain in history and must not inflate assigned-portion totals.

**Save area**
- Save entry action
- Clear unsaved/validation state
- Offline label if saved only on the device
- Optional “Review homework suggestion” action after source entry

**Success copy**
- Online: only show “Synced” after server acknowledgement.
- Offline: “Saved on this device — waiting to sync.”
- Validation error: identify the specific portion and field.

### 4.8 Bulk Entry — class attendance

**Purpose:** mark attendance for a whole class quickly while keeping each student's result correct. Bulk Entry records **attendance only**: Present, Late, Half day, Leave, or Absent (FR-DAY-002A). It has no Sabaq, Sabqi, or Manzil fields, no quantities, mistakes, or quality rating, and no recitation remarks.

Bulk Entry asks for text in only two cases: the required Leave reason, and the required note when a student who already recited is kept Absent. Hifz performance is recorded per student in Daily Entry (§4.7).

**Tablet grid**
- Class/date header
- Search students
- One row per student
- Student identity pinned or clearly visible
- One attendance control per row: Present / Late / Half day / Leave / Absent, using the attendance component, never the performance status chip
- Choosing Leave reveals a required reason field on that row
- Per-row saved status and validation

**Small phone layout**
- Use student cards with previous/next navigation.
- Do not force a tiny spreadsheet with unreadable cells on narrow screens.

**Requirements**
- Each row validates independently.
- Valid rows should not be lost because another row has an error.
- **Unmarked students (FR-CAL-010):** pressing Save with students unmarked opens a dialog, "N students not marked", that lists them and offers **Mark them Absent** and **Go back**. Nothing is saved for unmarked students until the teacher chooses.
- **Absent after reciting (FR-DAY-010):** if a student marked Absent already has recited portions that day, the row suggests "Mark Late instead". Keeping Absent requires a reason note, private to staff.
- After save, show exact counts for saved and failed/needs-correction rows.
- Preserve entered values after validation or partial-save failures.
- Retrying must be safe and must not create duplicate records.
- Reusable defaults (for example "Mark all Present") can reduce typing but must never silently overwrite attendance already entered for an individual student.
- Marking a student Absent must not create a failed-recitation record or a zero quality rating.
- State on screen that Bulk Entry records attendance only, and offer a way to open a student's individual Daily Entry to record Hifz performance.

### 4.9 Homework — suggestions and confirmed assignments

Use distinct tabs or segmented control:

- **Suggested** — draft, not yet final
- **Confirmed** — finalized assignments

**Suggested homework card**
- Student and class
- Due date. The default is the next scheduled class day, skipping Sundays and holidays (FR-HW-004)
- Source record/attempt date
- Section and portion
- Assigned, completed, and remaining quantities with units
- Draft label
- Actions: Review, Edit, Dismiss

**Review screen**
- Source portion and attempt context
- Proposed carry-forward quantity and unit
- Add/remove portions
- Edit due date
- Clear explanation of why a portion was suggested where the system can support it

**Confirmation**
- Summary of the assignment
- Explicit Confirm homework button
- Record confirming user and confirmation timestamp
- Transition to a clearly distinct confirmed state
- **Offline (FR-HW-017):** Confirm is available offline and shows "Confirmed on device — waiting to sync". If the source changed on the server, the item moves to Conflict review instead of Confirmed.

**Rules**
- A suggestion is never final until teacher confirmation.
- Corrections recalculate unconfirmed suggestions.
- Confirmed homework remains unchanged unless an Owner or Admin explicitly revises it (FR-HW-012). Revisions are audited. Teachers see no Revise action.
- If the student was Absent or on Leave on the due day, or the day became a holiday, the homework appears again on the next class day, labelled "Carried over — absent/holiday" (FR-HW-016). It is never shown as failed.
- Do not automatically carry forward absent, not-assigned, or unattempted pending work as failed recitation.
- Preserve prior assignments and attempts in history.

### 4.10 Reports

**Primary report modes**
- Weekly
- Monthly

**Filters**
- Date/week/month
- Class
- Student
- Section/status filters where appropriate

**Report sections**
1. Overview and date range
2. Attendance: scheduled; attended (Present + Late + Half day), with Late and Half day also shown as their own counts; Leave; normal absence; holidays and no-class days (FR-CAL-005)
3. Sabaq summary
4. Sabqi summary
5. Manzil summary
6. Daily record history
7. Notes/remarks only when the viewer is authorized

**Charts and metrics**
- Prefer simple bar/line/progress visuals with a text/table equivalent.
- Display the unit and period for each quantity.
- Do not aggregate incompatible units.
- Distinguish missing data from zero.
- Do not count repeated attempts as additional assigned portions.
- Corrections to source records must update derived reports.
- Individual quality scores in weekly and monthly reports appear as number + label from the approved scale (§4.7).
- Quality trend charts use a 1–5 axis whose ticks carry the approved labels. Put **1 · Excellent at the top** and 5 · Weak at the bottom, so an improving student's line rises. Missing ratings are gaps, not zeros.
- Average quality is shown as the exact average, the label of the nearest whole score, and the count of ratings used, e.g. "3.6 · Needs Improvement (12 ratings)". A value exactly halfway rounds up to the higher number: 1.5 → 2 Good (SRS FR-ATT-009).
- Trend wording follows the scale direction: a falling average is described as improvement.

**Recurring difficulty (FR-MNR-006):** list a Para or range with a Major or Repeated mistake in 3 or more attempts in the period, or Not Remembered 3 or more times. Show the dates and counts.

**Class summary (staff only, FR-RPT-011):** a table with one row per student: attendance counts, portions completed per section and unit, average quality with the rating count, and outstanding homework. It has PDF and Excel export. It is reached from Reports with a class filter, and never shown to Students or Parents.

**Publishing (FR-RPT-010):** after a week or month ends, the Teacher (for assigned classes) or Admin uses **Publish for class**, or publishes per student. This needs a network connection and no unsynced changes for that period. A published report that is corrected later shows "Updated on …".

**Report states**
- Loading
- Ready
- No data
- Offline/provisional
- Error/retry

**Actions**
- Print
- PDF export
- Excel export where permitted

Exports and PDFs must obey the same permissions and private-note rules as on-screen reports.

### 4.11 Student read-only experience

**Home**
- Own published progress
- Confirmed homework only if published
- Recent published activity

**Reports**
- Own weekly/monthly published reports. The visible fields are listed in FR-PORT-006; Leave reasons, draft homework, and AI output are never shown
- Attendance summary if allowed

**UI rules**
- No edit controls.
- No staff-only remarks or private notes.
- No access to other students.
- If there is no published data, explain that no report is available yet rather than showing an empty chart that suggests zero performance.

### 4.12 Guardian read-only experience

**Home**
- Verified linked student switcher if multiple links are supported
- Published progress and permitted attendance
- Published homework/report shortcuts

**Linking state**
- Clear “No student linked yet” message
- Linking is done by the Admin after verifying the parent in person (FR-PORT-007). The message tells the parent to contact the madrasa. There is no self-service link or code
- Never allow a public search to expose student records

**Privacy**
- Show only permitted published records.
- Internal teacher notes must be excluded from UI, notifications, and exports.
- A revoked link must stop future access.

### 4.13 Offline and synchronization

**Persistent sync banner**
- Available from Home and key work screens
- Tap opens Sync Queue

**States**
- Offline
- Saved locally
- Waiting to sync
- Syncing
- Synced
- Sync failed
- Conflict needs review
- Session expired
- Access revoked

**Sync queue item**
- Record type and safe display label
- Last local change time
- State
- Retry or review action if supported
- Clear explanation of what will happen next

**Conflict review**
- Explain that local and server versions differ.
- Compare fields in human-readable language.
- Offer only supported resolution actions.
- Never silently discard unsynced records.
- Preserve a clear audit/history trail where required.

**App lock (NFR-OFF-011)**
- A PIN or fingerprint lock is required for Owner and Admin, and optional for Teachers. The app locks after 5 minutes in the background.
- After access is revoked, synced data is removed from the device. Unsynced changes stay visible but locked, and are removed at sign-out or after 30 days.

**Sign-out warning**
- If unsynced changes exist, warn before sign-out and explain the risk.
- Do not imply that local data has synced until the server acknowledges it.
- If access is revoked, block future server access and show a clear status; do not pretend the local copy is authoritative.

### 4.14 Timetable, holidays, and attendance

**Schedule**
- Class and assigned teacher
- Recurring schedule
- Date exceptions
- Holidays/closures/no-class days

**Attendance**
- Separate attendance status from Hifz performance status
- Show scheduled sessions and no-class days distinctly
- Do not infer absence on unscheduled days or declared holidays
- Reports must distinguish scheduled, attended (with Late and Half day), Leave, normal absence, holidays, and no-class days
- **Declaring a holiday on a date that already has records (FR-CAL-009):** warn with the number of records and ask for confirmation. Those records are then left out of reports and kept in history. New entries for that date are refused.

**Leave approvals (Madrasa Admin only)**
- A list of teacher-marked Leave awaiting a decision, showing student, class, date, requesting teacher, and reason
- Approve / Reject actions on each item, with confirmation; each decision is audited
- Empty state: "No leave waiting for approval"
- Approving or rejecting requires a network connection

### 4.15 Excel import/export

**Import flow**
1. Select workbook
2. Explain the expected template and version. Each template has a hidden `_meta` sheet with TemplateName and TemplateVersion (FR-XLS-018)
3. Preview sheets and rows
4. Validate fields and stable external IDs
5. Show row-level errors/warnings
6. Confirm import
7. Show results and downloadable/reviewable error summary where supported

**Safety**
- Workbook data is data only; do not execute macros or formulas.
- Student names alone must never be used as update keys.
- Student template and daily-record template must follow the SRS field contract.
- One daily-record row represents one portion; multiple rows can belong to one logical daily record.
- Missing mistake count or quality is unknown/not recorded, not zero.
- An imported `MistakeCount` is an uncategorized total; show it as "Uncategorized mistakes", separate from categorized mistakes.
- Maximum 1,000 students/records per file; the preview explains how to split a larger file. Imports commit in batches of 200 rows.
- A Teacher can import students only into their assigned classes. Rows for other classes show "Not your class" in the preview (FR-XLS-001).
- Invalid rows must be clearly identified; preserve valid work where the import process supports partial acceptance safely.

**Export**
- Student list, daily records, weekly/monthly reports
- Only available to authorized roles
- Warn before including staff-private notes
- Keep quantities and units explicit

### 4.16 Settings and account

**Sections**
- My profile and security: display name, optional email, change password (current password required); two-factor sign-in and recovery codes for Owner/Admin; app lock (FR-AUTH-006, FR-AUTH-016, NFR-OFF-011)
- Language
- Workspace
- Roles and permissions (authorized admins only), including each Teacher's "all classes" flag. Only the Owner adds or removes Admins
- Guardian linking/access (authorized roles)
- Offline data and sync
- Import/export
- Notifications: Android push preferences. MVP has one event, "Report published" (Students and Parents), which is on by default (FR-NOT-004). There are no email, SMS, or WhatsApp options
- Madrasa settings (Madrasa Admin only): daily-report mode, report template (logo, colors, headings, layout), Quran metadata, AI (provider, on/off, usage limits, data sharing)
- Help and About
- Sign out

Do not expose controls for features that are not implemented or enabled. For unresolved product decisions, show no invented defaults.

---

## 5. Reusable component specifications

### 5.1 Buttons

- **Primary:** emerald background, white label; one dominant primary action per view.
- **Secondary:** surface background, emerald outline or text.
- **Tertiary:** text action for low-emphasis options.
- **Destructive:** danger color, confirmation where appropriate.
- **Loading:** disable repeat submission and show an explicit progress label.
- Buttons must have clear focus/pressed/disabled states and a minimum 44 dp target.

### 5.2 Form field

- Persistent label
- Input/control
- Optional helper text
- Inline validation message
- Required/optional indication
- Clear focus and disabled states
- Preserve input after errors where safe

### 5.3 Quantity field

A compound field must show both quantity and unit.

**For Para fractions:** Rubu (1/4), Half (1/2), Salasah (3/4), Complete (1 Para).  
**For numeric units:** numeric value + Lines/Ayat/Pages.

Do not convert units unless the approved product rules explicitly define the conversion. If a unit changes, require a clear decision or reset/confirm the value rather than silently reinterpreting it.

### 5.4 Portion card

**Header**
- Section label and portion index, e.g. “Sabqi · Portion 2”

**Details**
- Para/Juz or range
- Assigned quantity
- Completed quantity
- Remaining quantity if valid
- Unit always visible

**Performance**
- Status selector
- Mistakes list (§4.7): category chip, Minor/Major, Repeated marker, optional note; "Add mistake" and "No mistakes" actions. An empty list without "No mistakes" is shown as "Not recorded", not 0
- Quality selector, approved named 1–5 scale (§4.7), each option shown as number + label, with "Not assessed" as the default

**Footer**
- Remarks with visibility label
- Add attempt/edit/remove actions subject to role permissions

Each portion has independent state. Editing one Manzil portion must not overwrite another.

### 5.5 Performance status chip

Use icon + text label + restrained background.

| Status | Suggested treatment | Important meaning |
|---|---|---|
| Completed | Success | Portion completed |
| Partial | Warning | Some work completed |
| Not Remembered | Danger/attention | Recitation not remembered; normally zero completed |
| Absent | Neutral | Attendance/performance must not be confused |
| Not Assigned | Muted neutral | No assigned work |
| Pending | Muted neutral | Not yet attempted/confirmed as complete |

Attendance must use its own component and labels: Present, Late, Half day, Leave (awaiting approval / approved / rejected), and Absent.

### 5.6 Student card

- Name and class first
- Active/inactive label
- Last record date if available
- Optional data-backed progress indicator
- Action menu with permission-aware options
- No private notes on student/guardian versions

### 5.7 Homework draft panel

- Visible “Suggestion — not confirmed” label
- Source portion/attempt
- Remaining quantity + unit
- Due date
- Review/Confirm action
- Edit/Dismiss secondary actions

Never style a draft to look like a finalized assignment.

### 5.8 Report metric and chart

- Label
- Value
- Unit or definition
- Date range
- Optional supporting comparison
- Accessible text/table alternative
- Unknown/missing values shown as “Not recorded”, not zero
- Quality values follow the approved scale (§4.7): single scores as number + label; averages as the exact number + nearest-score label + count of ratings used

### 5.9 Sync banner and queue item

- Icon
- Plain-language status
- Pending item count if available
- Last successful sync time only if known
- Retry action only where safe
- Conflict review action when needed

Do not show a success check until server acknowledgement is known.

### 5.10 Empty state

Each empty state should answer:
1. What is empty?
2. Why might it be empty?
3. What can the user do next?

Examples: no students yet, no records for this date, no homework drafts, no published report, no student linked.

### 5.11 Error and confirmation dialog

- Identify the failed field, row, or operation.
- Preserve valid user input.
- Summarize consequential actions before confirmation.
- Use destructive styling only for destructive operations.
- Avoid vague “Something went wrong” messages when the app can identify the issue.

---

## 6. Localization and direction system

### 6.1 Language direction

| Language | Direction | Alignment |
|---|---|---|
| English | LTR | Left by default |
| Roman Urdu | LTR | Left by default |
| Urdu script | RTL | Right by default |
| Quranic Arabic | Preserve Arabic shaping/direction | Follow the text container's Arabic direction |

### 6.2 Direction rules

- Mirror navigation patterns only when direction requires it; do not mirror every icon indiscriminately.
- Keep back navigation, chevrons, dates, phone numbers, quantities, and mixed Arabic/Latin text readable.
- Apply direction consistently to fields, menus, tabs, bottom sheets, error messages, reports, and navigation.
- Switching language must update navigation, buttons, labels, validation, empty states, date/number formatting where appropriate, and text direction.
- Canonical stored enum values remain language-neutral.
- Digits are Western (0–9) in every language (FR-I18N-009).
- Never auto-translate or transliterate Quranic Arabic, Surah names, or Ayat text.

### 6.3 Accessibility

- Minimum 44 dp touch targets; 48 dp preferred for common actions.
- Statuses need text and icon, not color alone.
- Support Android font scaling without clipping.
- Labels remain visible when a field is filled.
- Error feedback must be associated with the correct field/row.
- Test long student names, small screens, tablets, large text, Urdu RTL, Roman Urdu, English, and Arabic snippets.

---

## 7. Data-integrity rules that shape UI

These rules are part of the interaction design and must not be weakened by visual simplification.

1. Sabaq, Sabqi, and Manzil are independent sections.
2. Sabqi and Manzil can contain multiple independently tracked Para portions.
3. Salasah is exactly 3/4 of a Para.
4. Quantity must always include its unit.
5. Remaining quantity is calculated only for the same portion and compatible unit.
6. Absence is not failed recitation.
7. Holidays and unscheduled dates are not absences.
8. Weekly/monthly reports derive from daily source records.
9. Suggested homework is not final until teacher confirmation.
10. Past homework and attempts remain in history.
11. Corrections recalculate unconfirmed suggestions and reports, but never silently rewrite confirmed homework.
12. Student/guardian access requires authorization and verified linking.
13. Private notes are excluded from unauthorized outputs.
14. Urdu is RTL; English/Roman Urdu are LTR.
15. Quranic Arabic remains intact.
16. Repeated attempts do not double-count assigned portions in aggregate progress.
17. Missing data is not the same as zero performance.

---

## 8. Loading, offline, and error-state matrix

| Situation | Visual treatment | Required user information |
|---|---|---|
| Initial loading | Skeleton or small progress indicator | What is loading where helpful |
| No records | Quiet empty state | Why empty and next action |
| Offline | Neutral offline banner | New changes may remain on device |
| Saved locally | Confirmation with device/local wording | Not yet synced |
| Waiting to sync | Pending icon and count | Sync will retry when possible |
| Syncing | Progress state | Do not imply completion early |
| Synced | Success icon/label | Server acknowledged |
| Sync failed | Warning/error with retry if safe | What failed and recovery action |
| Conflict | Attention state | Review local/server differences |
| Session expired | Sign-in prompt | Unsynced data warning if relevant |
| Permission revoked | Access-revoked state | Future server access blocked |
| Partial bulk save | Result summary | Saved rows, failed rows, next actions |
| Invalid import | Row-level error list | Which row/field needs correction |

---

## 9. Recommended implementation structure

The exact folder structure may be adjusted to the actual codebase, but design tokens and domain components should remain reusable.

```text
src/
  theme/
    colors.ts
    typography.ts
    spacing.ts
    radius.ts
    elevation.ts
  i18n/
    locales/
      en/
      ur/
      roman-ur/
    direction.ts
  components/
    AppScreen.tsx
    AppHeader.tsx
    Button.tsx
    FormField.tsx
    StatusChip.tsx
    QuantityField.tsx
    PortionCard.tsx
    StudentCard.tsx
    HomeworkDraftPanel.tsx
    SyncStatusBanner.tsx
    EmptyState.tsx
    InlineError.tsx
  navigation/
    TeacherNavigator.tsx
    AdminNavigator.tsx
    StudentNavigator.tsx
    GuardianNavigator.tsx
  features/
    auth/
    workspaces/
    classes/
    students/
    attendance/
    daily-entry/
    homework/
    reports/
    sync/
    import-export/
    settings/
```

### Implementation notes

- UI components must not own authoritative business calculations that should be centralized in domain services.
- Keep stored enum values language-neutral; localize only labels.
- Keep authorization checks at both UI and API levels.
- Offline save and server sync must be represented as separate states.
- Use stable IDs for data operations.
- Use only the approved 1–5 quality scale. Do not implement unsupported Mushaf assumptions or unconfirmed authentication details as if they were settled.
- The current SRS defines the design baseline; changes to scope should be recorded as requirements updates.

---

## 10. Screen acceptance checklist

### Core Hifz entry
- [ ] User can choose date, class, and student.
- [ ] Attendance is separate from recitation performance.
- [ ] Sabaq, Sabqi, and Manzil are distinct.
- [ ] Multiple portions can be added where required.
- [ ] Each portion independently records quantity, unit, status, categorized mistakes (category, Minor/Major, repeated), quality rating (1–5 or not assessed), and notes.
- [ ] Every quality score is shown as number + approved label (1 Excellent, 2 Good, 3 Average, 4 Needs Improvement, 5 Weak) in the active language.
- [ ] Average quality shows the nearest-score label, and charts place 1 · Excellent at the top.
- [ ] The overall performance label is separate from the 1–5 quality rating.
- [ ] Attendance offers Present, Late, Half day, Leave, and Absent. Leave needs a reason and awaits Admin approval when a Teacher marks it.
- [ ] Remaining quantity only appears for compatible units and the same portion.
- [ ] Not Remembered, Absent, Not Assigned, and Pending are not conflated.
- [ ] Save feedback distinguishes local save from server sync.

### Bulk entry
- [ ] Only attendance (Present, Late, Half day, Leave, Absent) is captured; no Hifz performance fields appear.
- [ ] Unmarked students are confirmed in a dialog; nothing is saved silently.
- [ ] Absent does not create failed recitation or zero quality.
- [ ] Each row validates independently.
- [ ] Row-level save results are shown.
- [ ] Valid input survives unrelated row failures.
- [ ] Retry does not create duplicate records.
- [ ] Small phone UI remains readable.

### Homework
- [ ] Suggested homework is clearly a draft.
- [ ] Teacher can review/edit/add/remove portions and change due date.
- [ ] Confirmation is explicit and auditable.
- [ ] Confirmed homework is not silently changed by later corrections.

### Reports
- [ ] Weekly and monthly views use source records.
- [ ] Attendance and Hifz performance are distinct.
- [ ] Incompatible units are not aggregated.
- [ ] Missing data is not shown as zero.
- [ ] Average quality uses recorded ratings only.
- [ ] Exports/PDF respect permissions and note visibility.

### Roles and privacy
- [ ] Owner/admin/teacher/student/guardian screens are role-appropriate.
- [ ] Student and guardian access is read-only.
- [ ] Guardian link must be verified.
- [ ] Private notes never leak into student/guardian screens or exports.

### Offline and localization
- [ ] Pending changes are visible.
- [ ] Failed sync and conflict resolution have clear flows.
- [ ] Sign-out warns about unsynced changes.
- [ ] Urdu is RTL; English/Roman Urdu are LTR.
- [ ] Quranic Arabic remains intact.
- [ ] Accessibility, large text, and small-screen layouts are tested.

---

## 11. Decisions (closed 2026-10-30)

The product-owner decision review of 2026-10-30 closed every item that was open here. Each ID is kept so that references still resolve. The register, with the full answers, is in **SRS §17**.

**SRS §13 implementation gates**

| Gate | Outcome |
|---|---|
| #1 | Authentication is built into the API. OTP email goes through Amazon SES. 2FA is required for Owner/Admin (FR-AUTH-012…016) |
| #2 | Role/permission matrix approved (SRS §17.1) |
| #3 | Reviewed Quran metadata seed plus audited Admin edits (FR-SAB-007) |
| #4 | Fonts and PDF layout (FR-PDF-002, FR-PDF-004; §2.3) |
| #5 | AI budget approved; AI provider **Deferred** to Phase 7 |
| #6 | Retention policy (NFR-PRV-005) |
| #7 | Android 8.0+ and the device matrix (NFR-COMP-001); Android application ID **Deferred** |
| #8 | Cache, app lock, and revocation (NFR-OFF-011; §4.13) |
| #9 | Hosting and performance targets (NFR-PERF-006) |
| #11 | One push event, "Report published", on by default, delivered by Expo Push (FR-NOT-004) |
| #13 | Teachers may import students into their assigned classes (FR-XLS-001) |

**Design-level decisions** (the D-numbers are referenced by `ARCHITECTURE.md`)

| ID | Decision | Where |
|---|---|---|
| D1 | The platform operator creates each workspace and its first Owner. There is no in-app creation or sign-up. An individual teacher's workspace has one user holding the Owner/Admin and Teacher roles | FR-ORG-001; §4.2, §13 US-007 |
| D2 | Homework can be confirmed offline. The server re-checks the source on sync, and a changed source becomes a conflict | FR-HW-017; §4.9 |
| D3 | The Teacher (for assigned classes) or the Admin publishes weekly and monthly reports | FR-RPT-010; §4.10 |
| D4 | In Bulk Entry, marking Absent for a student who has already recited prompts "Mark Late instead". Keeping Absent requires a note | FR-DAY-010; §4.8 |
| D5 | The Admin links a Parent after verifying them offline, and records the verification method | FR-PORT-007; §4.12 |
| D6 | Extra work is recorded as a separate "Extra" portion | FR-QTY-006; §4.7 |
| D7 | A hidden `_meta` sheet holds the template version. Imports commit in batches of 200 rows | FR-XLS-018; §4.15 |
| D8 | Unmarked students are confirmed in a "Mark them Absent / Go back" dialog. Nothing is saved silently | FR-CAL-010; §4.8 |

**Earlier decisions (SRS §16), still in force**
- One account and User ID per madrasa; login is User ID + password; email OTP resets the password; no forced password change at first login.
- The Madrasa Admin sets the daily-report mode: one report per student/date (the default) or multiple sessions.
- Quran metadata is Admin-managed, and only the standard 15-line Mushaf is supported.
- Timezone `Asia/Karachi`; the week starts on Monday.
- Students and Parents use the Android app only; there is no browser portal.
- An Excel file holds at most 1,000 students/records.
- Absent, Not Assigned, and Pending are excluded from automatic carry-forward.
- The overall performance label (Excellent / Good / Average / Needs Improvement) is separate from the 1–5 quality rating.
- The Quality Rating Scale is 1 Excellent … 5 Weak; lower is better.
- *Changed on 2026-10-30:* attendance is Present, Late, Half day, Leave, or Absent. Leave replaces excused absence. A Teacher marks Leave with a required reason, and the Admin approves it.

Two items remain **Deferred**: the Android application ID and the AI provider vendor. Where a screen depends on one of them, make the component configurable. Do not choose a value.

---

## 12. Delivery and design review checklist

Before implementation is accepted:

1. Review every screen against the current SRS and Architecture, and against the user stories mapped to it in §13.
2. Review teacher daily-entry and bulk attendance flows with realistic test scenarios.
3. Validate all quantity and status cases, including multiple Manzil portions.
4. Validate draft-to-confirmed homework lifecycle.
5. Test offline save, retry, conflict, sign-out warning, and permission revocation.
6. Verify role-specific screens and private-note visibility.
7. Verify weekly/monthly calculations and export permissions.
8. Test English, Roman Urdu, Urdu RTL, and Arabic text on Android devices.
9. Test small phones, tablets, large text, long names, and keyboard interaction.
10. Record any change to the SRS before implementing behavior outside its current scope.



---

## 13. User story to screen map

The canonical user stories and acceptance criteria are in **`user-stories.md`** (US-001…US-073). This table shows where each UI-related story lives in this design and which states it must handle.

- State names refer to the §8 matrix.
- "Standard states" means initial loading, error with retry, and permission denied. Every screen needs them (§8, NFR-UX-003).
- Every row also inherits §6: Urdu RTL, English and Roman Urdu LTR, Quranic Arabic intact, 44–48 dp targets, and status never shown by color alone. The last column lists only story-specific points.
- US-068 (tenant isolation) has no screen of its own beyond the permission-denied state, so it is omitted.
- "Design gap" means the screen is not yet specified in §4 and must be designed from the listed components.

| Story | Screen (this document) | Key interaction | Required states beyond standard | Validation shown | Accessibility / localization specifics |
|---|---|---|---|---|---|
| US-001 | §4.2 Sign-in; §4.13, §8 session expired | User ID and password; Sign in (disabled while sending); session-expired prompt, then sign in again | Offline (network unavailable, input kept); Session expired; Waiting to sync | Generic credential error; User ID kept | Language selector on Sign-in; password show/hide labeled; pending count available to screen readers |
| US-002, US-070 | §4.2 Forgot password | User ID → OTP → new password | Offline; OTP expired; too many attempts | Neutral confirmation that never reveals whether the User ID exists | OTP field announces expiry time |
| US-003, US-004, US-005, US-006 | Account management (design gap; FormField and §5.11 dialogs) | Admin creates Teacher/Student/Parent account, assigns User ID, sets initial password, optional email | Offline (creation needs network) | User ID unique, case-insensitive, 3–32 characters, madrasa prefix suggested (FR-AUTH-013); password 8–64 characters, common passwords and the User ID rejected (FR-AUTH-012); shared Student/Parent email allowed | Password field show/hide; no email-as-login hint |
| US-071 | §4.16 Settings → My profile | View profile; edit display name and optional email; Change password (current + new) | Offline (changes need network) | Wrong current password; password policy | User ID, role, and madrasa shown read-only as text |
| US-072 | §4.2 Two-factor step; §4.16 Security | First sign-in: set up authenticator, save 10 recovery codes; later sign-ins: enter code or recovery code; regenerate codes | Offline (sign-in needs network); Too many attempts | Invalid or used code | Codes readable at large font size; copy action labelled |
| US-007 | Workspace settings (design gap; built from FormField). The platform operator creates the workspace and its first Owner; there is no in-app creation (FR-ORG-001) | Owner completes name and settings | Offline (changes need network) | Name required; timezone defaults to Asia/Karachi and week start to Monday, both editable | — |
| US-008 | All lists (§4.5, §4.7) | Only assigned classes and students listed | Permission denied for direct links | — | Denied message never reveals whether the record exists |
| US-009, US-069 | §3.2 More → Audit history; "View history" on a record | Paginated list with filters | No records | — | Shown to authorized roles only |
| US-010 | §3.2 More → Classes (design gap; cards and FormField) | Add, edit, deactivate class; assign teachers | No records ("No classes yet") | Name required; deactivation confirmation | Active/inactive as a text label |
| US-011, US-012 | §4.5 Student list; §4.6 Student profile; add/edit form | Search, filter by class and status, paginate, add, deactivate, change enrollment | No records; page loading | Required fields only (NFR-PRV-001) | Long names wrap without clipping; roll number distinguishes students with the same name |
| US-013, US-014 | §4.14 Timetable and holidays | Define schedule; add holiday or closure | No records | Holiday notice in Daily and Bulk Entry: no automatic absence | Day types as text labels; no danger color for holidays |
| US-015 | §4.8 Bulk Entry — class attendance | Present / Late / Half day / Leave / Absent per student; Mark all Present (never overwrites); Save attendance → "N students not marked" dialog (Mark them Absent / Go back); "Mark Late instead" prompt for a student who already recited; Retry; Record Hifz per row | Offline; Saved locally; Partial bulk save (saved / needs correction) | Row-level error on each rejected student; Leave reason and Absent-after-reciting note required; selections kept | "Attendance only" note visible; phone shows one card with previous/next; no performance fields rendered |
| US-016 | §4.7 Step 2 Attendance; §4.8 Bulk Entry row | Choose Leave and enter the reason | Saved locally; "Leave — awaiting approval" | Reason required | Leave status as a text label |
| US-017 | §4.14 Leave approvals | Approve / Reject with confirmation | No records; Offline (approval needs network) | Confirmation names student and date | Decision shown as text, not color only |
| US-018, US-019 | §4.7 Daily Entry — individual | Context (no future dates) → Attendance → Sabaq/Sabqi/Manzil cards (only for Present, Late, Half day; otherwise "Change to Late") → Save entry → next actions; session label only in multi-session mode | Offline; Saved locally; Synced only after acknowledgement | Error names the portion and field; duplicate-report warning per daily-report mode; input kept | Section cards mirror in RTL; Ayat ranges and Para numbers stay readable |
| US-020, US-021, US-022 | §4.7 Step 3; §5.4 Portion card; §5.5 Status chip | Add portion per section; headers such as "Sabqi · Portion 2"; choose status per portion | — | Per-portion field errors | Section and portion number in the header text; status chip with icon and text |
| US-023 | Record detail (§4.7 view/edit mode) | Add attempt; edit; View history | Saved locally; Conflict | Notice "Confirmed homework was not changed" with Revise homework | Current attempt marked by a text label |
| US-024 | Settings → Quran metadata (design gap; Admin only) | Add/edit Surah, Ayat count, Para boundaries | No records; Offline (edits need network) | Ranges must be consistent (e.g. end Ayat ≤ Ayat count) | Arabic names in the Quranic font; never auto-transliterated |
| US-025, US-026, US-027 | §5.3 Quantity field; §4.7 range fields | Para and optional Surah/Ayat range; unit picker and value; remaining shown only for compatible units | — | Range validated against Admin metadata; unit change asks or resets; completed > assigned error on the field | Unit always visible; tabular numerals |
| US-028, US-029, US-030 | §4.7 portion fields; §5.4 Performance | Add mistake: category, Minor/Major, Repeated toggle | — | Category required per mistake | Category and severity as text labels; not shown in Bulk Entry |
| US-031 | §4.7; §5.4 | Quality 1–5 single-select, default "Not assessed" | — | Out-of-range values impossible in the UI; blank saved as "Not recorded" | Each option shown as number + approved label in the active language (§4.7) |
| US-032 | §4.7 Overall performance label | Choose Excellent / Good / Average / Needs Improvement (optional) | — | — | Captioned "Overall performance"; never derived from or shown as the 1–5 quality rating |
| US-033 to US-037 | §4.9 Homework; §5.7 draft panel | Suggested / Confirmed tabs; Review, edit, add, remove, Dismiss; Confirm homework (also offline); Revise (Owner/Admin only) | Offline; Saved locally; "Confirmed on device — waiting to sync"; Conflict | Draft label "Suggestion — not confirmed"; confirmation summary before saving | Draft never styled as confirmed; confirmed state uses the success chip with text |
| US-038 | §4.6 Student profile → Homework tab; §4.7 (due homework shown) | View past assignments; record an attempt against a due portion | No records; "Carried over — absent/holiday" | — | Superseded and carried-over assignments labeled in text |
| US-039 to US-043 | §4.10 Reports; §5.8 | Weekly/Monthly switch; filters; drill-down to each portion; Publish for class / per student | No records ("No records for this period"); Offline → Provisional with last sync time and pending count; publishing blocked while changes are unsynced | — | Every chart has a text/table equivalent; missing values shown as "Not recorded"; Late, Half day, Leave, and normal absence shown separately |
| US-073 | §4.10 Reports → Class summary (staff only) | Choose class and week/month; table with one row per student; PDF / Excel export | No records; Offline → Provisional | — | Table has row and column headers for screen readers; numbers in tabular digits |
| US-044 | §4.11 Student read-only | View own published progress and reports | Offline (network unavailable, no cache); No records ("No report is available yet") | — | No edit controls anywhere |
| US-045 | §4.12 Guardian read-only | Linking state ("contact the madrasa"); switcher across verified linked students; reports | Offline (network unavailable); Permission revoked | — | Never a student search |
| US-046 | §5.4 remarks footer; §4.15 export warning | Visibility segmented control: Private to staff / Visible to student/guardian | — | Warning before exporting private notes | Visibility shown as a text label |
| US-047 to US-050 | §4.16 Language; §6 | Switch language at any time | — | — | Switching keeps unsaved input; Arabic shaping intact |
| US-051 to US-054 | §4.13 Offline and sync; §5.9 sync banner | Banner → Sync queue; Retry; Review conflict; sign-out warning when unsynced changes exist | All sync states in §8 | — | No success check before acknowledgement; count in text, not icon only |
| US-055, US-057 | §4.10 Print/PDF | Print; PDF | Offline (PDF needs network) | — | Fonts: Inter, Noto Nastaliq Urdu, Noto Naskh Arabic; A4 with repeated header, rows never split (FR-PDF-004) |
| US-056 | Settings → Report template (design gap; Admin only) | Upload logo; preset colours; headings per language; portrait/landscape; show/hide sections (fixed order, FR-PDF-002) | Offline (needs network) | Logo file type/size | Preview in all three languages |
| US-058 to US-061 | §4.15 Excel import/export | Choose type → template version → file → preview → mode → confirm → results | Invalid import (row-level list); Offline (server processing needed) | Row and field errors; add-only by default; 1,000-row limit | Preview messages localized (NFR-XLS-003) |
| US-062, US-063 | Analytics (design gap; uses §5.8 and surface cards) | Calculated metrics first; optional Get AI recommendations | Offline → provisional; "AI unavailable" with reason and retry | — | AI area labeled AI-generated and styled apart from metrics |
| US-064, US-065 | Settings → AI (design gap; Admin only) | Provider, on/off, usage limits, data-sharing categories | Offline (needs network) | Limits must be positive numbers | Contact details and notes shown as excluded by default |
| US-066, US-067 | §4.16 Settings → Notifications | Toggle the "Report published" push (on by default; the only MVP event, FR-NOT-004) | Push permission denied by Android | — | Notification text never contains private notes |

Teacher Home (§4.4) has no dedicated story. It must still meet the standard and offline states, show empty states rather than zeros, and keep card counts equal to the lists they open.

**End of document.**
