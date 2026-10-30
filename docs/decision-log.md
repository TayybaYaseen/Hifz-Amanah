# HifzAmanah — Decision log (working register)

**Status:** Complete. The Q&A ran on 2026-10-30, and the product owner confirmed the final summary.
- 69 decisions: 3 Category A, 8 Category C, 59 Category B (counted once each).
- 2 Deferred: DEC-B55 and the provider part of DEC-B45.
- The central register is now **SRS §17**. This file keeps the inventory, the original references and the answers.
**Purpose:** One inventory of every open decision in the repository. Each row has its sources, its classification and its live status. When the review ends, the outcomes go into `SRS.md` §16/§17, and this file keeps the history.

**Statuses:**
- **Open:** not yet answered.
- **Proposed:** a recommendation exists but has not been approved.
- **Approved:** the product owner approved it, or existing approved documents settle it.
- **Deferred:** the product owner postponed it, with a reason.
- **Blocked:** essential information is missing.
- **Closed:** a duplicate, or obsolete.

**Categories:**
- **A:** resolvable from existing approved documents.
- **B:** needs product-owner approval.
- **C:** duplicate or obsolete.

**Sources audited:**
- `docs/SRS.md` (all sections, including §13 gates and §16).
- `docs/ARCHITECTURE.md` (§3, §6–§19, the "Proposed" and OPEN items).
- `docs/design.md` §11 (D1–D8) and §4.
- `docs/AGENTS.md`, `docs/user-stories.md`, `docs/specs/*/README.md` (60 open questions).
- `e2e/**` and `apps/**` `OPEN:` markers.

`user-flow.md` and `docs/adr/` do not exist.

## Category A — resolved from existing documents (confirmed)

| ID | Question (original reference) | Answer | Evidence |
|---|---|---|---|
| DEC-A01 | Is an excuse reason required? (F04 open question 4) | Optional. **Superseded** by DEC-B22: Leave replaces excused absence, and the Leave reason is required. | design.md §4.7 Step 2: "a 'Mark as excused' option with an **optional reason**". design.md §4.14 lists the reason on the approval card. Nothing contradicts it. |
| DEC-A02 | Which attempt drives current progress? (SRS FR-RPT-006 says "Recommended default") | The latest attempt per portion; full history stays available; no double counting. | AGENTS.md §5 rule 9 (non-negotiable rules), ARCHITECTURE §9.3, AC-RPT-05, US-044/045 criterion 3, design.md §13 US-023 ("Current attempt"). No document says otherwise. |
| DEC-A03 | Can one Parent be linked to several students? (design.md §4.12 "if multiple links are supported") | Yes. A Parent may have several verified linked students. | FR-PORT-002 and NFR-PORT-003 ("verified linked students"), US-045 ("reports for verified linked students"), AC-SEC-03, F10 criteria and the `parent-linked-children` flow. |

## Category C — duplicate or obsolete

| ID | Item | Disposition | Evidence |
|---|---|---|---|
| DEC-C01 | FR-ORG-006 "Multi-organization membership may be supported; if enabled, users must select the active workspace" | Superseded. One account per madrasa; switching workspace means switching account. | FR-AUTH-011, SRS §16.1, design.md §4.3 |
| DEC-C02 | FR-EXP-004 "If CSV/Excel export is enabled" | Obsolete condition. `.xlsx` export is in MVP; CSV is not. | FR-XLS-006, §15.1, §16.3, AGENTS §10 |
| DEC-C03 | FR-EXP-005 "if these languages are included in exports" | Obsolete condition. Exports are localized in all three languages. The font choice stays under DEC-B40. | FR-I18N-003, FR-PDF-001, SRS §13 #4 |
| DEC-C04 | SRS §6.3 "One daily record per student/date is the default unless multi-session support is approved" | Superseded. Multi-session mode is approved as an Admin setting. | FR-DAY-008, §16.2 |
| DEC-C05 | SRS §10.8 step 9 "if portal access is enabled" | Obsolete condition. Student/Parent access is in the core release. | FR-PORT-001/002, NFR-PORT-001, §16.3 |
| DEC-C06 | SRS §13 gate #12: reconcile surfaces that allow bulk excused absence | Already done. No surface allows it. | FR-DAY-002A, SRS §8.2, design.md §4.8, US-015 criterion 2, F04 criteria, `bulk-entry.yaml` step 2 |
| DEC-C07 | SRS §16.5 recovery-code line | Duplicate of gate #1 (2FA). Handled under DEC-B07. | SRS §13 #1 |
| DEC-C08 | Duplicates merged into one decision. Each keeps its original references. | — | — |

These are the merged duplicates referred to by DEC-C08:
- D6 appears in F05 Q3, F06 Q3, ARCHITECTURE §6.2 and AGENTS §5 rule 4. It is handled under DEC-B23.
- D2 appears in F08 Q1, F12 Q3 and ARCHITECTURE §8.3. It is handled under DEC-B29.
- D3 appears in F09 Q1, F10 Q1 and the ARCHITECTURE `report_published` table. It is handled under DEC-B33.
- Gate #13 also appears as F14 Q1 and is handled under DEC-B15.
- Gate #4 also appears as F13 Q1 and F11 Q3 and is handled under DEC-B40.
- Gate #5 also appears as F15 Q1 and is handled under DEC-B45.
- Gate #11 also appears as F16 Q1/Q2 and is handled under DEC-B48/B49.
- Gate #8 also appears as F12 Q1 and is handled under DEC-B42.
- Gate #3 also appears as F06 Q1 and is handled under DEC-B31.
- Gate #6 also appears as F13 Q3, F14 Q3, F15 Q4 and F17 Q3, and is handled under DEC-B44.
- D1 also appears as F02 Q3 and is handled under DEC-B01.
- Gate #2 also appears as ARCHITECTURE §7.3, F02 Q1 and F17 Q1, and is handled under DEC-B12…B18.

## Category B — needs product-owner approval

The "Stories" column lists the user stories affected. Affected documents are always `SRS.md` plus the listed spec folders, `ARCHITECTURE.md` and `design.md` where they apply, and the E2E tests named in that folder.

| ID | Question | Original references | Feature / stories | Requirements | Status |
|---|---|---|---|---|---|
| DEC-B01 | Who creates a madrasa workspace and its first Admin, and how is an individual-teacher workspace onboarded? | design D1, F02 Q3, FR-ORG-001, `admin-setup.yaml` | F02 US-007 | FR-ORG-001, FR-AUTH-009 | Approved |
| DEC-B02 | Are Owner and Admin different in MVP? | F02 Q2, SRS §4.1 | F02 US-007…009 | FR-ORG-002/003 | Approved |
| DEC-B03 | FR-AUTH-006 (profile management) has no user story. Add one, or keep the requirement without a story? | docs:check warning | F01 | FR-AUTH-006 | Approved |
| DEC-B04 | SRS §10.8 step 1 says a Teacher creates the class and student; §16.1 says the Admin creates accounts | SRS §10.8, e2e README | F03 US-010/011 | FR-CLS-001, FR-STU-001 | Approved |
| DEC-B05 | Authentication provider/library | gate #1, F01 Q1 | F01 US-001…006 | FR-AUTH-*, NFR-SEC-003 | Approved |
| DEC-B06 | Email-OTP delivery service | gate #1, F01 Q1, ARCH §2 | F01 US-002, US-070 | FR-AUTH-007 | Approved |
| DEC-B07 | Are 2FA and recovery codes in MVP? | gate #1, §16.5, F01 Q6 | F01, F17 | — | Approved |
| DEC-B08 | Password policy | F01 Q2, `identity.test.ts`, `personas.ts` | F01 US-003…006 | FR-AUTH-009 | Approved |
| DEC-B09 | User ID format, uniqueness and case sensitivity | F01 Q3, ADR-011 | F01 US-001, US-003 | FR-AUTH-002/011 | Approved |
| DEC-B10 | Login lockout and OTP parameters; is the Admin alerted? | F01 Q4, F17 Q2, ARCH §7.1 | F01 US-001/002, F17 US-070 | FR-AUTH-007, NFR-SEC-003 | Approved |
| DEC-B11 | Can an Admin reset a user's password directly (for example a user with no email)? | F01 Q5 | F01 US-002 (criterion F01-AC26), F17 US-070 | FR-AUTH-007/009 | Approved |
| DEC-B12 | Approve the role/permission matrix | gate #2, ARCH §7.3, F02 Q1 | F02 US-008, all | FR-SEC-*, FR-ORG-002 | Approved |
| DEC-B13 | May an Admin grant a Teacher wider access than assigned classes? | F02 Q4, FR-SEC-003 | F02 US-008 | FR-SEC-003, AC-SEC-02 | Approved |
| DEC-B14 | May Teachers create or edit student profiles and classes? | F03 Q3, FR-STU-001 | F03 US-010/011 | FR-STU-001, FR-CLS-001 | Approved |
| DEC-B15 | May Teachers import student lists? | gate #13, F14 Q1 | F14 US-058 | FR-XLS-001, FR-AUTH-009 | Approved |
| DEC-B16 | May Teachers see the audit history of their own actions? | F17 Q1, ARCH §7.3 | F17 US-069, F02 US-009 | FR-AUD-004 | Approved |
| DEC-B17 | Who may revise confirmed homework? | F08 Q2 | F08 US-037 | FR-HW-012 | Approved |
| DEC-B18 | Who may resolve sync conflicts? | F12 Q2 | F12 US-054 | FR-SYNC-008 | Approved |
| DEC-B19 | Bulk Absent for a student who already has recited portions that day | design D4, F04 Q1 | F04 US-015 | FR-DAY-002A, FR-CAL-003 | Approved |
| DEC-B20 | Is an unmarked student in Bulk Entry "not marked" rather than absent? | design D8, F04 Q2 | F04 US-015 | FR-DAY-007, FR-CAL-004 | Approved |
| DEC-B21 | A holiday is declared on a date that already has attendance | F04 Q3 | F04 US-014/015 | FR-CAL-002/004/005 | Approved |
| DEC-B22 | Can portions be recorded for a student marked Absent (late arrival)? | F05 Q4 | F05 US-018, F04 | FR-ATT-002, FR-CAL-003 | Approved |
| DEC-B23 | Extra work beyond the assigned quantity | design D6, F05 Q3, F06 Q3, ARCH §6.2, AGENTS rule 4 | F06 US-026/027 | FR-QTY-006, AC-QTY-05 | Approved |
| DEC-B24 | May records be created for future dates? | F05 Q1 | F05 US-018 | FR-DAY-001 | Approved |
| DEC-B25 | Is there an edit window after which records lock? | F05 Q2 | F05 US-023 | FR-DAY-009, FR-SYNC-009 | Approved |
| DEC-B26 | Do `PAGES`/`AYAT` (and `LINES`) allow fractions? | F06 Q4, ARCH §6.2 | F06 US-026 | FR-QTY-002/003 | Approved |
| DEC-B27 | Explicit "No mistakes" choice, distinct from "not recorded" | F07 Q1 | F07 US-028…030 | FR-ATT-010, FR-QTY-008 | Approved |
| DEC-B28 | Can a mistake have a free-text note, and is it internal by default? | F07 Q2, ARCH `attempt_mistakes.note` | F07 US-028, F10 US-046 | FR-PORT-003 | Approved |
| DEC-B29 | Can homework be confirmed offline? | design D2, F08 Q1, F12 Q3, ARCH §8.3 | F08 US-037, F12 | FR-HW-008/009, NFR-OFF-001 | Approved |
| DEC-B30 | Should the due date default to the next scheduled class day? | F08 Q3 | F08 US-035/036 | FR-HW-004 | Approved |
| DEC-B31 | Initial Quran metadata source and entry governance | gate #3, F06 Q1 | F06 US-024 | FR-SAB-005/006 | Approved |
| DEC-B32 | What happens to existing records when the Admin changes metadata they use? | F06 Q2 | F06 US-024/025 | FR-SAB-005 | Approved |
| DEC-B33 | Report publishing: who publishes, how often, and is it automatic? | design D3, F09 Q1, F10 Q1, ARCH `report_published` | F09, F10 US-044/045 | FR-PORT-001/002, NFR-PORT-002/003 | Approved |
| DEC-B34 | Definition of "recurring difficulty" | F09 Q2 | F09 US-040 | FR-MNR-006, FR-AI-001 | Approved |
| DEC-B35 | Class-level reports in MVP, or student-level only? | F09 Q3 | F09 US-039…043 | FR-WKR/MNR-* | Approved |
| DEC-B36 | Which fields are hidden from Students and Parents besides internal notes? Is homework shown to them? | F10 Q3, design §3.3 | F10 US-044…046 | FR-PORT-*, NFR-PORT-002/003 | Approved |
| DEC-B37 | Guardian linking and verification steps | design D5, F10 Q2, SRS §6.1 `guardian_invitations` | F10 US-045, F03 | FR-SEC-005/010, FR-PORT-002/005 | Approved |
| DEC-B38 | Urdu UI digits: Western (123) or Urdu (۱۲۳)? | F11 Q1 | F11 US-047…050 | FR-I18N-007 | Approved |
| DEC-B39 | Who owns and reviews the Roman Urdu glossary? | F11 Q2 | F11 US-049 | FR-I18N-008 | Approved |
| DEC-B40 | UI and PDF font stack and page-break rules | gate #4, F13 Q1, F11 Q3, ARCH §10 | F11, F13 US-055 | FR-PDF-001, FR-EXP-005, NFR-COMP-002 | Approved |
| DEC-B41 | Which PDF layout options does the Admin get? | F13 Q2 | F13 US-056 | FR-PDF-002 | Approved |
| DEC-B42 | Local cache retention, app lock and revocation purge | gate #8, F12 Q1 | F12 US-051…054 | NFR-OFF-010, FR-SYNC-009 | Approved |
| DEC-B43 | Excel template version-marker format and commit batch size | design D7, F14 Q2, `workbooks.md` | F14 US-058…061 | FR-XLS-010/014 | Approved |
| DEC-B44 | Retention: generated PDFs, uploaded workbooks, AI request logs, audit logs, backups, account closure and data export | gate #6, F13 Q3, F14 Q3, F15 Q4, F17 Q3 | F13, F14, F15, F17 | NFR-PRV-002, NFR-REL-001 | Approved |
| DEC-B45 | AI providers at launch and monetary budget | gate #5, F15 Q1, FR-AI-012 | F15 US-063…065 | FR-AI-011/012 | Approved (budget) / Deferred (provider) |
| DEC-B46 | Which AI data categories the Admin can toggle | F15 Q2 | F15 US-065 | FR-AI-008, §16.4 | Approved |
| DEC-B47 | AI output language and evaluation set | F15 Q3 | F15 US-063 | FR-AI-009, FR-I18N-003 | Approved |
| DEC-B48 | Push event catalogue | gate #11, F16 Q1 | F16 US-066/067 | FR-NOT-002 | Approved |
| DEC-B49 | Push provider: FCM directly or Expo Push Service | gate #11, F16 Q2, ARCH §13 | F16 | FR-NOT-001/003 | Approved |
| DEC-B50 | Notification consent defaults per event | F16 Q3 | F16 US-067 | FR-NOT-002 | Approved |
| DEC-B51 | Approve the proposed technology stack and ADR-001…011 | ARCH §3, §19, AGENTS §3 | all | NFR-MNT-* | Approved |
| DEC-B52 | Minimum Android version, device matrix and release channel | gate #7, `layouts.yaml` | F11, all | NFR-COMP-001 | Approved |
| DEC-B53 | Hosting, region, expected volumes and performance targets | gate #9, ARCH §16 | all | NFR-PERF-005, NFR-REL-001 | Approved |
| DEC-B54 | CI gates, UI automation and the test-control mechanism | gate #10, `fixtures.ts`, e2e README | all | NFR-MNT-004 | Approved |
| DEC-B55 | Android application ID (`APP_ID`) | 47 mobile flows | all | — | Deferred |
| DEC-B56 | Required student fields beyond the name | F03 Q1, design §4.5 roll number | F03 US-011 | FR-STU-001, NFR-PRV-001 | Approved |
| DEC-B57 | Can a student be enrolled in two classes at once? | F03 Q2 | F03 US-012 | FR-STU-002 | Approved |
| DEC-B58 | Duplicate class names: block or warn? | F03 Q4 | F03 US-010 | FR-CLS-001 | Approved |
| DEC-B59 | List page size | F03 Q5 | F03 US-011, all lists | FR-STU-003, NFR-PERF-001 | Approved |

## Answers log

All answers below come from the product owner's Q&A on 2026-10-30, and the product owner confirmed them in the final summary. Their status is **Approved** unless marked otherwise. The final status of every row in the Category B table follows from this log.

| ID | Answer |
|---|---|
| DEC-B01 | The platform operator creates each workspace and its first Admin. An individual-teacher workspace is a one-person workspace whose user holds both the Admin and Teacher roles. |
| DEC-B02 | Owner and Admin have the same permissions, except that only the Owner adds or removes Admins and transfers ownership. |
| DEC-B03 | Add new story **US-071 "Manage my profile"**: view own profile, change own password (current password required), edit optional email and display name. Language stays under US-047. |
| DEC-B04 | SRS §10.8 step 1 is corrected to: the Admin creates the class and assigns the Teacher, and the Teacher adds the student (see B14). |
| DEC-B05 | Authentication is built into the Node API: Argon2id, TOTP, short-lived access token plus rotating refresh token. |
| DEC-B06 | Use the transactional email service of the host chosen in DEC-B53, behind a swappable adapter. |
| DEC-B07 | **2FA is required for Owner and Admin**. It uses an authenticator app (TOTP) plus 10 one-time recovery codes. The SRS §16.5 rules apply to code regeneration. If the device is lost, the Owner resets an Admin's 2FA, and the platform operator resets an Owner's 2FA after an identity check. Add new story **US-072**. |
| DEC-B08 | Passwords are 8–64 characters with no composition rules. Common passwords and the user's own User ID are rejected. The same policy applies to passwords set by an Admin. |
| DEC-B09 | User IDs are globally unique and case-insensitive: 3–32 characters, letters, digits and hyphens. The app suggests a madrasa-code prefix (for example `ALNOOR-T014`). |
| DEC-B10 | **Reset OTP:** 6 digits, valid 10 minutes, at most 5 attempts, at most 3 requests per hour per account. **Sign-in:** progressive delay after 5 failures; 10 failures within 15 minutes lock the account for 15 minutes. Locks are audited and visible to the Admin, with no active alert. Errors never reveal whether a User ID exists. |
| DEC-B11 | An Owner or Admin can set a new password for any account in the madrasa. This revokes the user's sessions and is audited. Only the Owner can reset an Admin's password. |
| DEC-B12 | The role matrix is approved as shown in the Q&A. "Assigned" means the Teacher's assigned classes, or all classes with the "all classes" flag. |
| DEC-B13 | Yes. An Owner or Admin can give a Teacher an **"all classes" flag** (audited). |
| DEC-B14 | The Admin creates classes. A Teacher may add and edit student profiles **in assigned classes only**. Deactivating or moving students, guardian links and login accounts stay Owner/Admin only. |
| DEC-B15 | Teachers and Admins can both import student lists. A Teacher imports into assigned classes only; preview rejects rows that name other classes. |
| DEC-B16 | Teachers see the audit history of **their own actions** only. Owner and Admin see everything. |
| DEC-B17 | **Only Owner or Admin** may revise confirmed homework. Revisions are audited and the old version is kept. |
| DEC-B18 | A sync conflict is resolved by the Teacher whose change caused it, or by any Owner/Admin. Resolutions are audited. |
| DEC-B19 | In Bulk Entry, marking Absent for a student who has recited portions that day makes the row suggest **"mark Late instead"**. If the teacher keeps Absent, a **required internal note** explains the reason. The recited portions are unchanged. |
| DEC-B20 | On Save, unmarked students are listed in an "N students not marked" dialog with two buttons, **[Mark them Absent]** and **[Go back]**. Nothing is saved silently. |
| DEC-B21 | A holiday or closure is not a working day and has no class work; it counts like a Sunday. If records already exist when a holiday is declared, the Admin is warned, and the records are excluded from reports but kept in history. Homework is handled as in DEC-B30. |
| DEC-B22 | New attendance statuses: **LATE** (arrived after attendance was marked; Absent can be changed to Late), **HALF_DAY** (left early) and **LEAVE** (the student or parent informed the Teacher or Admin). **LEAVE replaces "excused absence"**: the Teacher or Admin marks it with a reason, and it still needs Admin approval. **Bulk Entry offers Present, Absent, Late, Half day and Leave.** This changes FR-DAY-002A and §16.2. **Counting:** attended = Present + Late + Half day; Late and Half day are also shown as their own counts; Leave is its own count (neither attended nor normal absence); Absent is a normal absence. Hifz may be recorded for Present, Late and Half day. |
| DEC-B23 | Extra work is recorded as a separate **"Extra" portion**, so completed ≤ assigned holds for every portion. Reports show extra work separately. |
| DEC-B24 | No future dates. Records are for today or earlier, in the madrasa timezone. |
| DEC-B25 | Records never lock. Every edit is audited and recalculates reports and draft homework. Confirmed homework never changes. |
| DEC-B26 | Lines, Ayat and Pages are whole numbers only. |
| DEC-B27 | Add an explicit **"No mistakes"** toggle that stores 0. Blank means "Not recorded". |
| DEC-B28 | Each mistake may have an optional free-text note. It is internal by default, and the teacher can make it visible. |
| DEC-B29 | Homework can be confirmed **offline**. The confirmation is queued, and the server checks that the source has not changed. If it has, the confirmation becomes a conflict. The UI shows "Confirmed on device — waiting to sync". |
| DEC-B30 | The due date defaults to the next scheduled class day, skipping Sundays, holidays and no-class days. If the student is Absent or on Leave on the due day, or the day becomes a holiday, the confirmed homework stays outstanding and reappears on the next class day, labelled "carried over: absent/holiday". It is not treated as failed, and the confirmed record is not edited. |
| DEC-B31 | The app ships a seed built from a published dataset, after its licence is checked. A qualified reviewer nominated by the product owner reviews it. Each madrasa starts from the seed, and Admin edits are audited. *Action:* the product owner nominates the reviewer. |
| DEC-B32 | When metadata changes, existing records keep their stored ranges. Records that become invalid are flagged for Admin review and never changed automatically. The edit is audited. |
| DEC-B33 | A Teacher (for assigned classes) or an Admin **publishes** weekly and monthly reports, per class or per student. Publishing needs internet and a fully synced period. Later corrections update the published report, which shows "Updated on …". |
| DEC-B34 | A **recurring difficulty** is a Para or range with a Major or Repeated mistake in **3 or more attempts** in the period, or Not Remembered 3 or more times. The evidence is shown with it. |
| DEC-B35 | Add a staff-only **class summary report**, with one row per student and PDF/Excel export. New story **US-073**. Students and Parents never see it. |
| DEC-B36 | Students and Parents see attendance, portions, quantities, statuses, quality (number and label), mistake counts by category, the overall label, confirmed homework, visible remarks and the teacher's name. Hidden from them: internal notes, draft homework, AI output, audit and sync details. |
| DEC-B37 | The Admin links a Parent account to one or more students after verifying the parent offline, and records how the parent was verified. Revoking the link takes effect immediately. All of this is audited. |
| DEC-B38 | Western digits (0–9) in every language. |
| DEC-B39 | The development team drafts the glossary. The product owner, or a reviewer they nominate, approves it before release and approves any later change. |
| DEC-B40 | **Fonts:** Inter for English and Roman Urdu, Noto Nastaliq Urdu for the Urdu UI and PDF, Noto Naskh Arabic for Quranic Arabic and Surah names. **PDF:** A4, header repeated on every page, table rows never split across pages. |
| DEC-B41 | **PDF Admin controls:** portrait or landscape; show or hide each optional section; heading text per language; colours from presets that pass a contrast check. Section order is fixed. |
| DEC-B42 | **Cache:** only assigned data is cached; synced daily records older than 120 days are removed from the device. **App lock** (PIN or fingerprint): required for Owner/Admin, optional for Teachers; locks after 5 minutes in the background. **Revocation:** the workspace locks immediately and synced data is purged. Unsynced changes stay locked but visible, and are purged on sign-out or after 30 days. |
| DEC-B43 | Each template has a hidden `_meta` sheet holding TemplateName and TemplateVersion, also noted on the first sheet. Imports commit in batches of 200 rows. |
| DEC-B44 | **Retention:** generated files 24 h; uploaded workbooks 7 days; AI request logs 90 days, with usage totals kept 1 year; audit log 5 years; daily backups kept 30 days plus 7-day point-in-time restore. Teaching records are kept while the madrasa is active. On closure, an export is offered and all data is deleted 90 days later. |
| DEC-B45 | **Budget approved:** default cap of USD 10 per madrasa per month, which the Admin may lower; requests stop at the cap. **Provider choice: Deferred** until the FR-AI-012 comparison in Phase 7. One provider at launch. |
| DEC-B46 | Five Admin toggles, all on by default: attendance summary, Sabaq/Sabqi/Manzil progress, mistake categories, quality scores and homework completion. Names, contact details and notes are never sent in MVP. |
| DEC-B47 | AI output is in the requesting user's UI language. The evaluation set includes Urdu and Roman Urdu examples. |
| DEC-B48 | **Push events:** "Report published" only, sent to the Student and linked Parents. |
| DEC-B49 | Expo Push Service, which sends through FCM. |
| DEC-B50 | Every event is on by default and can be turned off per event. Android's own permission is requested when it is first useful. If it is refused, the app keeps working. |
| DEC-B51 | Every "Proposed" stack item and ADR-001…011 is **approved**. Any later change needs a new ADR and the product owner's approval. |
| DEC-B52 | Android 8.0 (API 26) or the Expo SDK's minimum, whichever is higher. **Test devices:** a 5" 2 GB phone, a 6.5" mid-range phone, a 10" tablet and one real low-end device. **Release:** Play internal track, then closed testing, then production. |
| DEC-B53 | **Hosting:** AWS Mumbai (managed PostgreSQL, S3, SES); this settles DEC-B06 as **Amazon SES**. **First-year sizing:** 20 madaris, 200 teachers, 5,000 students. **Targets:** p95 API under 500 ms, a report under 3 s, sync of 100 changes under 10 s, 99.5% uptime. |
| DEC-B54 | **CI:** GitHub Actions on every PR runs typecheck, lint, unit tests, docs:check, e2e:trace and API E2E (Docker Compose). Maestro runs nightly and before each release. **Test control:** a test-only API, local/staging only and protected by a secret, providing seed reset, Mailpit, clock control, and AI and push stubs. |
| DEC-B55 | **Deferred.** Reason: the domain is not registered yet. Device E2E runs and Play Console setup stay blocked until it is decided. |
| DEC-B56 | **Required:** name and class. **Optional:** roll number or External Student ID (unique per madrasa), admission date, private notes. No date of birth, address, phone or photo. |
| DEC-B57 | One active class at a time. Moving a student ends the old enrollment and keeps its history. |
| DEC-B58 | Active class names are unique within a madrasa (case-insensitive). |
| DEC-B59 | 25 items per page, loading more on scroll. Search and filters run on the server. |

## Applied changes (2026-10-30)

- **SRS v1.11.** New and changed requirements are listed in its header. §13 gates are closed, §16 is revised, and §17 is the register.
- **user-stories.md v1.4.**
  - New stories: US-071, US-072, US-073.
  - US-016, US-017 and US-042 are retitled for Leave.
  - Shared attendance criteria are updated.
  - 197 criteria in total.
- **Specs.**
  - 73 story specs; 3 are new, and 3 were renamed (us-016, us-017, us-042).
  - 13 detailed criteria were revised, keeping their IDs, and 65 were added, for 317 in total.
  - Every open question is marked resolved and points to its decision.
- **design.md v1.6**, **ARCHITECTURE.md v1.1** and **AGENTS.md** are updated.
- **Tests.**
  - 55 new API `test.fixme` tests.
  - 16 new Maestro flows; `excused-absence.yaml` is replaced by `leave.yaml`.
  - New unit `it.todo` placeholders; titles of revised criteria updated.
  - `OPEN` markers replaced by decisions, or by `DEFERRED` for the application ID.
- **Backups.**
  - `.backup/pre-spec-split-2026-10-30/docs/` holds SRS, design and architecture as they were before this review.
  - `.backup/pre-decisions-2026-10-30/snapshot-before-apply.tar` holds docs, e2e, apps and packages before the generated spec, story and test changes.
