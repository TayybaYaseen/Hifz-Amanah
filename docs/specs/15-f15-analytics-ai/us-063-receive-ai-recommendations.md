# SPEC-US-063 · Receive AI recommendations

| | |
|---|---|
| **Spec ID** | SPEC-US-063 |
| **User story** | US-063 |
| **Feature** | [F15 · Analytics and AI recommendations](README.md) |
| **Epic** | EPIC 15 — Analytics and AI ([user-stories.md](../../user-stories.md)) |
| **Status** | draft |
| **Priority** | Not specified in the source documents (SRS, user-stories.md, feature specs). None is assigned here. |
| **Split from** | `docs/specs/F15-analytics-ai.md` on 2026-10-30 |

## User story

**US-063 — Receive AI recommendations**

As an authorized Teacher/Admin, I want online AI recommendations grounded in student performance metrics.

Spec wording (from F15):

- **US-063:** As an authorized Teacher/Admin, I want online AI recommendations grounded in a student's metrics, so that I get ideas for what to focus on.

**Feature context** (shared by every story in F15, copied from the feature spec):

> Teachers want to know where a student is struggling. **Calculated analytics** answer that from the records, work offline, and are the source of truth. **AI recommendations** are an optional online extra that explains those numbers in words. AI only advises. It never writes to records, never sets quality scores, and never confirms homework. The app must work fully without it.
>
> There is no code yet. This feature builds:
> - deterministic metrics in `packages/domain/analytics`, reusing the F09 report logic
> - the server-side `analytics` AI gateway: provider adapters, `org_ai_settings`, and `ai_requests` ([ARCHITECTURE.md §12](../../ARCHITECTURE.md))
>
> The AI flow is for Teachers and Admins only.

## Related functional requirements

Requirements this story covers. SRS.md has no story-to-requirement table, so this list is derived from the requirement text and the criteria below.

- **Functional:** FR-AI-002, FR-AI-003, FR-AI-004, FR-AI-005, FR-AI-007, FR-AI-009, FR-AI-010, FR-AI-011, FR-AI-014
- **Non-functional:** NFR-AI-001, NFR-AI-004
- **SRS acceptance tests cited:** AC-AI-01, AC-AI-04, AC-AI-03

Feature requirement set (from F15; additions of 2026-10-30 at the end): FR-AI-001…012, NFR-AI-001…004, NFR-OFF-008, FR-AI-013/014

## Acceptance criteria

### Story acceptance criteria

Verbatim from [user-stories.md](../../user-stories.md).

1. Deterministic analytics remain the source of truth and are available offline from cached data, labeled provisional when unsynced.
2. AI is online-only and advisory; it uses minimized structured metrics, cites the relevant period/data, and cannot mutate records or confirm homework.

### Detailed acceptance criteria

From the F15 feature spec. The original IDs are kept because tests cite them. Criteria marked *Revised* or *Added* come from the decision review of 2026-10-30 (SRS §17).

- **F15-AC4** — **(US-063) Given** AI enabled and a Teacher online, **when** they tap "Get AI recommendations", **then** the response is shown in a separate area labelled "AI suggestion — review required", stating the date range and the metrics it used.
- **F15-AC5** — **(US-063) Given** no internet connection, **when** the Teacher views Analytics, **then** the AI button shows "AI needs a connection", and no AI text is shown or invented (AC-AI-01).
- **F15-AC6** — **(US-063) Given** the provider times out or errors, **when** the request fails, **then** the Teacher sees "AI unavailable — try again later", and daily entry, reports, and sync keep working (AC-AI-04).
- **F15-AC7** — **(US-063) Given** an AI response, **when** it is received, **then** the server checks it against the response schema and confirms every number it cites exists in the metrics sent; a response that fails either check is discarded and shown as unavailable.
- **F15-AC8** — **(US-063) Given** any AI response, **when** it is handled, **then** no daily record, attempt, quality score, or homework is created or changed (AC-AI-03).
- **F15-AC9** — **(US-063) Given** a Student or Parent, **when** they use the app, **then** no AI feature is offered to them, and the API refuses AI requests from them.
- **F15-AC17** — **(US-063) Given** a Teacher using the Urdu or Roman Urdu interface, **when** they request an AI recommendation, **then** the request asks for that language, and the response is shown in it. *(Added 2026-10-30, DEC-B47.)*

## Business rules

From SRS §9 (verbatim):

- **BR-17:** Missing data is not the same as zero performance.

## Validation rules

Stated in these criteria: F15-AC4, F15-AC6.

## Edge cases and error handling

Rows from the F15 edge-case table that apply to this story (verbatim):

| Situation | What should happen |
|---|---|
| A student has too little data | Analytics shows "Not enough data for this period"; AI is not called, or it must say the data is insufficient |
| The provider returns text in the wrong language | It is discarded, or the request is retried once asking for the user's language |
| The AI cites "quality improved from 3 to 2" but no such metric was sent | Fails the number check (AC 7) and is not shown |
| The AI says "higher quality score is better" | Fails the eval (see below); the prompt states that lower is better |

**Out of scope for the whole feature** (verbatim from F15):

- AI that runs on the device or offline.
- AI writing to records, scoring recitation, or confirming homework.
- AI for Students or Parents.
- Sending raw workbooks, audio, or full student profiles to AI.
- Automatic high-impact decisions (grades, discipline, access).

## Dependencies

- **Feature F15 depends on:** F09 (from the spec index)
- **Features referenced by this story's criteria and edge cases:** None
- **Other stories referenced:** None
- **Other stories in F15:** [US-062](us-062-view-deterministic-analytics.md), [US-064](us-064-configure-ai-provider-and-limits.md), [US-065](us-065-control-ai-data-sharing.md)

## Related screens and UI

- **Feature flow** (from F15): Analytics (design gap; uses [design.md §5.8](../../design.md)); Settings → AI (design gap, Admin only)

[design.md §13](../../design.md) story-to-screen map (verbatim):

| Story | Screen (this document) | Key interaction | Required states beyond standard | Validation shown | Accessibility / localization specifics |
|---|---|---|---|---|---|
| US-062, US-063 | Analytics (design gap; uses §5.8 and surface cards) | Calculated metrics first; optional Get AI recommendations | Offline → provisional; "AI unavailable" with reason and retry | — | AI area labeled AI-generated and styled apart from metrics |

## Related API and data model

- **Modules** ([ARCHITECTURE.md §18](../../ARCHITECTURE.md)): `analytics`
- Tables and services are described in the feature context above and in [ARCHITECTURE.md](../../ARCHITECTURE.md). Concrete API routes are defined at scaffolding (SRS §17 DEC-B54).

## Offline and sync behavior

Stated in these criteria: F15-AC5, F15-AC6.

## Related E2E test scenarios

**Completion gate:** this spec is complete only when `npm run e2e:gate -- US-063` passes. That means every criterion has an E2E test, none is pending, and all of them pass ([e2e/README.md](../../../e2e/README.md)).

**API (Playwright):**

- [e2e/api/f15-analytics.spec.ts](../../../e2e/api/f15-analytics.spec.ts) — F15-AC4 (US-063) a recommendation states its date range and the metrics used
- [e2e/api/f15-analytics.spec.ts](../../../e2e/api/f15-analytics.spec.ts) — F15-AC6 (US-063) a provider timeout returns "AI unavailable" and nothing else breaks (AC-AI-04)
- [e2e/api/f15-analytics.spec.ts](../../../e2e/api/f15-analytics.spec.ts) — F15-AC7 (US-063) invalid schema or uncited numbers are discarded
- [e2e/api/f15-analytics.spec.ts](../../../e2e/api/f15-analytics.spec.ts) — F15-AC8 (US-063) an AI response changes no record (AC-AI-03)
- [e2e/api/f15-analytics.spec.ts](../../../e2e/api/f15-analytics.spec.ts) — F15-AC9 (US-063) Student and Parent AI requests are refused
- [e2e/api/f15-analytics.spec.ts](../../../e2e/api/f15-analytics.spec.ts) — F15-AC17 (US-063) AI output is in the requesting user’s language

**Mobile (Maestro):**

- [e2e/mobile/f15-analytics/ai-settings.yaml](../../../e2e/mobile/f15-analytics/ai-settings.yaml) — F15 AI settings — provider, on/off, limits, data categories; no AI for Student or Parent
- [e2e/mobile/f15-analytics/analytics-and-ai.yaml](../../../e2e/mobile/f15-analytics/analytics-and-ai.yaml) — F15 analytics — offline provisional, AI online, AI failure

**Unit (Vitest):**

- [apps/api/src/modules/analytics/ai-guard.test.ts](../../../apps/api/src/modules/analytics/ai-guard.test.ts) — F15-AC7 (US-063) a response that fails the schema is discarded
- [apps/api/src/modules/analytics/ai-guard.test.ts](../../../apps/api/src/modules/analytics/ai-guard.test.ts) — F15-AC7 (US-063) a response citing a number not in the sent metrics is discarded
- [apps/api/src/modules/analytics/ai-guard.test.ts](../../../apps/api/src/modules/analytics/ai-guard.test.ts) — F15-AC9 (US-063) Student and Parent are refused
- [apps/api/src/modules/analytics/ai-guard.test.ts](../../../apps/api/src/modules/analytics/ai-guard.test.ts) — F15-AC8 (US-063) handling a response never writes records, attempts, scores, or homework (AC-AI-03)

### For AI features only: what "done" means

Verbatim from F15.

**Always true (code can check it every run):**

- The response matches the JSON schema: `observations[]`, `suggestions[]`, `data_insufficient`, `period`, and `cited_metrics[]`.
- Every number in `observations` appears in the metrics payload that was sent.
- `period` equals the requested date range.
- The payload contains no student name, phone, email, or note text (checked by a scanner before sending).
- No database write happens anywhere except to `ai_requests`.
- The request finishes or times out within the configured limit.

**Judged against examples (an eval set):**

| Input | A good answer must… | A good answer must not… |
|---|---|---|
| Rising Tajweed mistakes in Manzil Paras 10–12 over 4 weeks | Name Tajweed and those Paras, cite the counts, suggest focused revision | Invent other mistake types or Paras |
| Quality average went from 3.2 to 2.1 (lower is better) | Describe it as improvement | Call it a decline |
| Only 2 records in the month | Say there is not enough data | Draw trends from 2 points |
| Absences on 5 days, recitation fine on attended days | Separate attendance from recitation quality | Treat absences as poor recitation |
| Missing quality on most portions | Say quality data is limited | Treat missing scores as 0 or as Weak |

**When it fails:**
- **AI turned off:** the button is hidden.
- **Offline:** "AI needs a connection".
- **No provider key configured:** Admins see "AI provider not set up"; Teachers see "AI unavailable".
- **Provider down or timed out:** "AI unavailable — try again later".
- **Limit reached:** "AI limit reached for this period".
- **Output fails the checks:** "AI unavailable" (the failure is logged).

In every case the calculated analytics stay on screen.

**Cost and speed:** The model and provider are chosen per madrasa from the supported list (one provider at launch, chosen after the FR-AI-012 comparison in Phase 7, SRS §17 DEC-B45; the money cap is USD 10 per madrasa per month by default). Starting defaults, to be confirmed when the provider is chosen:
- requests: a per-madrasa monthly cap (set by the Admin) and 20 per Teacher per day
- timeout: 20 s
- target wait: under 10 s
- input: at most ~2,000 tokens of metrics

## Open decisions and blockers

Open questions from F15 that apply to this story, with their resolutions (decision review of 2026-10-30, SRS §17):

- [x] Does the AI text appear in the Teacher's chosen language, and does the eval set need Urdu examples? **Resolved:** Yes to both (DEC-B47, FR-AI-014).

## Traceability

- **Story:** US-063 → SPEC-US-063 (this file)
- **Detailed criteria:** F15-AC4, F15-AC5, F15-AC6, F15-AC7, F15-AC8, F15-AC9, F15-AC17
- **Requirements:** FR-AI-002, FR-AI-003, FR-AI-004, FR-AI-005, FR-AI-007, FR-AI-009, FR-AI-010, FR-AI-011, NFR-AI-001, NFR-AI-004, FR-AI-014
- **SRS acceptance tests:** AC-AI-01, AC-AI-04, AC-AI-03
- **Business rules:** SRS §9 #17
- **Design:** design.md §13; **Architecture:** ARCHITECTURE.md §18 epic 15
- **Previous location:** `docs/specs/F15-analytics-ai.md`
