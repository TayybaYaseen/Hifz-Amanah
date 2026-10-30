# SPEC-US-065 · Control AI data sharing

| | |
|---|---|
| **Spec ID** | SPEC-US-065 |
| **User story** | US-065 |
| **Feature** | [F15 · Analytics and AI recommendations](README.md) |
| **Epic** | EPIC 15 — Analytics and AI ([user-stories.md](../../user-stories.md)) |
| **Status** | draft |
| **Priority** | Not specified in the source documents (SRS, user-stories.md, feature specs). None is assigned here. |
| **Split from** | `docs/specs/F15-analytics-ai.md` on 2026-10-30 |

## User story

**US-065 — Control AI data sharing**

As a Madrasa Admin, I want privacy controls over the categories and amount of student data sent to AI.

Spec wording (from F15):

- **US-065:** As a Madrasa Admin, I want privacy controls over which student data is sent to AI, so that we share only what we are comfortable with.

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

- **Functional:** FR-AI-006, FR-AI-008, FR-AI-013
- **Non-functional:** NFR-AI-003
- **SRS acceptance tests cited:** None

Feature requirement set (from F15; additions of 2026-10-30 at the end): FR-AI-001…012, NFR-AI-001…004, NFR-OFF-008, FR-AI-013/014

## Acceptance criteria

### Story acceptance criteria

Verbatim from [user-stories.md](../../user-stories.md).

1. Deterministic analytics remain the source of truth and are available offline from cached data, labeled provisional when unsynced.
2. AI is online-only and advisory; it uses minimized structured metrics, cites the relevant period/data, and cannot mutate records or confirm homework.

### Detailed acceptance criteria

From the F15 feature spec. The original IDs are kept because tests cite them. Criteria marked *Revised* or *Added* come from the decision review of 2026-10-30 (SRS §17).

- **F15-AC13** — **(US-065) Given** the default privacy settings, **when** an AI request is built, **then** it contains no student name, contact details, or teacher notes. The student is referred to only by a pseudonym.
- **F15-AC14** — **(US-065) Given** an Admin who turns off a data category (e.g. attendance), **when** the next request is built, **then** that category is not in the payload.
- **F15-AC15** — **(US-065) Given** any AI request, **when** it is stored for usage tracking, **then** the stored record holds the minimized payload and an input hash, not raw student records.
- **F15-AC16** — **(US-065) Given** a new madrasa, **when** AI data settings are opened, **then** the five categories (attendance summary, Sabaq/Sabqi/Manzil progress, mistake categories, quality scores, homework completion) are on, and no setting exists to send names, contact details, or notes. A category switched off is absent from the next AI request payload. *(Added 2026-10-30, DEC-B46.)*

## Business rules

No SRS §9 business rule is specific to this story. The rules it follows are stated in the criteria above.

## Validation rules

No validation rule beyond the criteria above.

## Edge cases and error handling

No F15 edge case is specific to this story. See the [feature edge cases](README.md#edge-cases).

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
- **Other stories in F15:** [US-062](us-062-view-deterministic-analytics.md), [US-063](us-063-receive-ai-recommendations.md), [US-064](us-064-configure-ai-provider-and-limits.md)

## Related screens and UI

- **Feature flow** (from F15): Analytics (design gap; uses [design.md §5.8](../../design.md)); Settings → AI (design gap, Admin only)

[design.md §13](../../design.md) story-to-screen map (verbatim):

| Story | Screen (this document) | Key interaction | Required states beyond standard | Validation shown | Accessibility / localization specifics |
|---|---|---|---|---|---|
| US-064, US-065 | Settings → AI (design gap; Admin only) | Provider, on/off, usage limits, data-sharing categories | Offline (needs network) | Limits must be positive numbers | Contact details and notes shown as excluded by default |

## Related API and data model

- **Modules** ([ARCHITECTURE.md §18](../../ARCHITECTURE.md)): `analytics`
- Tables and services are described in the feature context above and in [ARCHITECTURE.md](../../ARCHITECTURE.md). Concrete API routes are defined at scaffolding (SRS §17 DEC-B54).

## Offline and sync behavior

Nothing specific to this story in the source documents.

## Related E2E test scenarios

**Completion gate:** this spec is complete only when `npm run e2e:gate -- US-065` passes. That means every criterion has an E2E test, none is pending, and all of them pass ([e2e/README.md](../../../e2e/README.md)).

**API (Playwright):**

- [e2e/api/f15-analytics.spec.ts](../../../e2e/api/f15-analytics.spec.ts) — F15-AC13 (US-065) the default AI payload has no names, contacts, or notes
- [e2e/api/f15-analytics.spec.ts](../../../e2e/api/f15-analytics.spec.ts) — F15-AC14 (US-065) a disabled data category is left out of the payload
- [e2e/api/f15-analytics.spec.ts](../../../e2e/api/f15-analytics.spec.ts) — F15-AC15 (US-065) usage records hold the minimized payload and an input hash
- [e2e/api/f15-analytics.spec.ts](../../../e2e/api/f15-analytics.spec.ts) — F15-AC16 (US-065) five AI data categories default on; names, contacts, and notes never sent

**Mobile (Maestro):**

- [e2e/mobile/f15-analytics/ai-settings.yaml](../../../e2e/mobile/f15-analytics/ai-settings.yaml) — F15 AI settings — provider, on/off, limits, data categories; no AI for Student or Parent

**Unit (Vitest):**

- [apps/api/src/modules/analytics/ai-guard.test.ts](../../../apps/api/src/modules/analytics/ai-guard.test.ts) — F15-AC13 (US-065) the default payload has no student name, contact details, or notes; the student is a pseudonym
- [apps/api/src/modules/analytics/ai-guard.test.ts](../../../apps/api/src/modules/analytics/ai-guard.test.ts) — F15-AC14 (US-065) a data category turned off by the Admin is absent from the payload
- [apps/api/src/modules/analytics/ai-guard.test.ts](../../../apps/api/src/modules/analytics/ai-guard.test.ts) — F15-AC15 (US-065) the stored usage record holds the minimized payload and an input hash only

## Open decisions and blockers

Open questions from F15 that apply to this story, with their resolutions (decision review of 2026-10-30, SRS §17):

- [x] Which data categories can the Admin toggle (attendance, mistakes, quality, homework)? **Resolved:** Five categories, on by default; names, contacts, notes never sent (DEC-B46, FR-AI-013).
- [x] How long are `ai_requests` kept? **Resolved:** 90 days; usage totals 1 year (DEC-B44, NFR-PRV-005).

## Traceability

- **Story:** US-065 → SPEC-US-065 (this file)
- **Detailed criteria:** F15-AC13, F15-AC14, F15-AC15, F15-AC16
- **Requirements:** FR-AI-006, FR-AI-008, NFR-AI-003, FR-AI-013
- **SRS acceptance tests:** None
- **Business rules:** None
- **Design:** design.md §13; **Architecture:** ARCHITECTURE.md §18 epic 15
- **Previous location:** `docs/specs/F15-analytics-ai.md`
