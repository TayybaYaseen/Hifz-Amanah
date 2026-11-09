# HifzAmanah — Open Decisions

Baseline: `SRS.md` v1.12 (2026-11-01), decision register §17. `ARCHITECTURE.md` v1.2.

`SRS.md` §17 is the single register of decisions. This file only summarizes it for agents. If they disagree, §17 wins and this file is corrected. The Q&A history is in `decision-log.md`.

Do not silently choose a value for anything listed as open. Ask the user, or keep it configurable and mark it `// DEFERRED: <DEC-ID>` in code.

## 1. Still open

### Deferred decisions (SRS §17.3)

| ID | Decision | Deferred until | What it blocks |
|---|---|---|---|
| DEC-B45 | AI provider vendor (the budget is approved) | The FR-AI-012 provider comparison at the start of Phase 7 | The AI parts of F15 (US-063…065). Deterministic analytics (US-062) are not blocked. |

### Product-owner action items (not open decisions)

| Ref | Action | Needed before |
|---|---|---|
| DEC-B31 | Nominate the Quran metadata reviewer | The F06 seed is approved for production |
| DEC-B39 | Approve the glossary, or nominate a reviewer | Urdu and Roman Urdu strings are final (F11) |
| DEC-B44 | Obtain legal confirmation of the retention policy | Launch (Phase 9) |

### Not recorded in the SRS: ask before Phase 7

These came from the original pack. §17 does not decide them explicitly. Do not invent an answer.

- A **platform-wide** AI budget cap. Only the per-madrasa budget (USD 10/month, Admin may lower) is decided in DEC-B45.
- A **platform-wide** AI kill switch and its operational owner. Only the per-organization Admin on/off is decided (§16.4, US-064).

## 2. Resolved: where each former open item was decided

| Former open item | Decision | Reference |
|---|---|---|
| Authentication provider, verification, password reset | Built into the API; `login_id` + password; email OTP recovery through Amazon SES; no email verification to activate; no forced password change; TOTP 2FA + 10 recovery codes for Owner/Admin; password, User ID and lockout rules | DEC-B05…B11, FR-AUTH-012…016, ADR-012 |
| Multi-organization membership in MVP | One account per madrasa; a person in two madaris has two accounts | DEC-C01, FR-AUTH-011, ADR-011 |
| One daily session per student/date, or several | Admin chooses `SINGLE` (default) or `MULTI_SESSION` (needs `session_label`) | DEC-C04, FR-DAY-008, §16.2 |
| Quality scale; are mistake categories required? | Optional integer 1–5, lower is better (1 Excellent … 5 Weak); missing is unknown. Six mistake categories, Minor/Major, separate `repeated` flag; explicit "No mistakes" stores 0; mistake notes optional and private | FR-ATT-009, §16.2, DEC-B27, DEC-B28 |
| Is `EXCUSED` absence supported? | No. Replaced by Leave: reason required and internal; Teacher-marked Leave awaits Admin approval. Statuses: Present, Late, Half day, Leave, Absent | DEC-B22, DEC-A01, FR-CAL-007/008 |
| Quran metadata source and license; validation scope | Reviewed seed from a published dataset with a checked licence, plus audited Admin edits per organization; edits never change existing records, invalid ranges are flagged | DEC-B31, DEC-B32, FR-SAB-005/007 |
| Mushaf editions and line counts | Standard 15-line Mushaf only. Sabaq is measured in lines over one Surah's Ayat range; Total Lines pre-filled from the layout, confirmed by the Teacher, stored with its edition | §16.3, DEC-B60…B64, ADR-014 |
| Timezone default and week start | `Asia/Karachi`; weeks start Monday; org-configurable | §16.5 |
| PDF fonts, layout, languages | Inter, Noto Nastaliq Urdu, Noto Naskh Arabic; A4, repeated header, rows never split; all three languages; limited Admin customization | DEC-B40, DEC-B41, DEC-C03, ADR-008 |
| Student/Parent access: app only or web portal too | Android app only, online and read-only; no web portal in MVP; portal is in the core release | §16.3, DEC-C05 |
| Minimum Android version and devices | Android 8.0+ (or the Expo minimum); device matrix; Play tracks | DEC-B52 |
| Offline access, cache retention, app lock, revocation | 120-day cache; app lock required for Owner/Admin; purge on revocation | DEC-B42, NFR-OFF-011 |
| Retention, deletion, export, backup | NFR-PRV-005 table (legal confirmation pending, see §1) | DEC-B44 |
| Expected volumes and performance targets | AWS Mumbai; 20 madaris / 200 teachers / 5,000 students; p95 < 500 ms, report < 3 s, sync < 10 s, 99.5% uptime | DEC-B53, NFR-PERF-006, ADR-013 |
| Excel file/row limits and batch sizes | Max 1,000 rows per file; 200-row commit batches | §16.3, DEC-B43 |
| Workbook versioning | Hidden `_meta` sheet with template and version | DEC-B43, FR-XLS-018 |
| AI provider selection | **Deferred** (see §1) | DEC-B45 |
| AI budgets | USD 10 per madrasa per month; Admin may lower | DEC-B45 |
| AI data sent | Five category toggles, on by default; names, contacts and notes never sent | DEC-B46, FR-AI-013 |
| AI output language | The user's UI language | DEC-B47 |
| Notifications in MVP; channel, provider, consent, content | Android push only, through Expo Push Service (FCM); one event, "Report published"; on by default, can be turned off; no email, SMS or WhatsApp | DEC-B48…B50, §16.4, ADR-013 |
| Role/permission matrix | SRS §17.1 | DEC-B12…B18 |

## 3. Approval protocol for new decisions

A new or reopened decision is recorded in `SRS.md` §17.2 with its ID, question, final answer, status, source, rationale, requirements, stories and tests, plus the date. The Q&A goes in `decision-log.md`. Then update this file. Until the user approves, do not hard-code a choice or call it final.
