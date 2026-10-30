# SPEC-US-064 · Configure AI provider and limits

| | |
|---|---|
| **Spec ID** | SPEC-US-064 |
| **User story** | US-064 |
| **Feature** | [F15 · Analytics and AI recommendations](README.md) |
| **Epic** | EPIC 15 — Analytics and AI ([user-stories.md](../../user-stories.md)) |
| **Status** | draft |
| **Priority** | Not specified in the source documents (SRS, user-stories.md, feature specs). None is assigned here. |
| **Split from** | `docs/specs/F15-analytics-ai.md` on 2026-10-30 |

## User story

**US-064 — Configure AI provider and limits**

As a Madrasa Admin, I want to choose a supported AI provider, enable/disable AI, and set usage limits.

Spec wording (from F15):

- **US-064:** As a Madrasa Admin, I want to choose a supported AI provider, turn AI on or off, and set usage limits, so that we control AI use and cost.

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

- **Functional:** FR-AI-011, FR-AI-012
- **Non-functional:** Not applicable
- **SRS acceptance tests cited:** None

Feature requirement set (from F15; additions of 2026-10-30 at the end): FR-AI-001…012, NFR-AI-001…004, NFR-OFF-008, FR-AI-013/014

## Acceptance criteria

### Story acceptance criteria

Verbatim from [user-stories.md](../../user-stories.md).

1. Deterministic analytics remain the source of truth and are available offline from cached data, labeled provisional when unsynced.
2. AI is online-only and advisory; it uses minimized structured metrics, cites the relevant period/data, and cannot mutate records or confirm homework.

### Detailed acceptance criteria

From the F15 feature spec. The original IDs are kept because tests cite them. Criteria marked *Revised* or *Added* come from the decision review of 2026-10-30 (SRS §17).

- **F15-AC10** — **(US-064) Given** a Madrasa Admin, **when** they choose a provider from the supported list, set it on or off, and set a request limit, **then** the settings are saved and audited.
- **F15-AC11** — **(US-064) Given** AI turned off, **when** a Teacher opens Analytics, **then** the AI button is hidden, and the API refuses AI requests.
- **F15-AC12** — **(US-064) Given** the madrasa has reached its usage limit, **when** a Teacher asks for a recommendation, **then** it is refused with "AI limit reached for this period", and no provider call is made.
- **F15-AC18** — **(US-064) Given** a madrasa with the default monthly cap of USD 10, or a lower cap set by the Admin, **when** the cap is reached, **then** further AI requests that month are refused, and deterministic analytics stay available. *(Added 2026-10-30, DEC-B45.)*

## Business rules

No SRS §9 business rule is specific to this story. The rules it follows are stated in the criteria above.

## Validation rules

Stated in these criteria: F15-AC12, F15-AC18.

## Edge cases and error handling

Rows from the F15 edge-case table that apply to this story (verbatim):

| Situation | What should happen |
|---|---|
| The Admin switches provider mid-month | Usage counts continue for the madrasa; new requests use the new provider |

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
- **Other stories in F15:** [US-062](us-062-view-deterministic-analytics.md), [US-063](us-063-receive-ai-recommendations.md), [US-065](us-065-control-ai-data-sharing.md)

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

**Completion gate:** this spec is complete only when `npm run e2e:gate -- US-064` passes. That means every criterion has an E2E test, none is pending, and all of them pass ([e2e/README.md](../../../e2e/README.md)).

**API (Playwright):**

- [e2e/api/f15-analytics.spec.ts](../../../e2e/api/f15-analytics.spec.ts) — F15-AC10 (US-064) AI provider, on/off, and limits are saved and audited
- [e2e/api/f15-analytics.spec.ts](../../../e2e/api/f15-analytics.spec.ts) — F15-AC11 (US-064) AI turned off refuses requests
- [e2e/api/f15-analytics.spec.ts](../../../e2e/api/f15-analytics.spec.ts) — F15-AC12 (US-064) at the usage limit, requests are refused without a provider call
- [e2e/api/f15-analytics.spec.ts](../../../e2e/api/f15-analytics.spec.ts) — F15-AC18 (US-064) AI requests stop at the monthly money cap

**Mobile (Maestro):**

- [e2e/mobile/f15-analytics/ai-settings.yaml](../../../e2e/mobile/f15-analytics/ai-settings.yaml) — F15 AI settings — provider, on/off, limits, data categories; no AI for Student or Parent

**Unit (Vitest):**

- [apps/api/src/modules/analytics/ai-guard.test.ts](../../../apps/api/src/modules/analytics/ai-guard.test.ts) — F15-AC12 (US-064) at the usage limit, the request is refused and no provider call is made
- [apps/api/src/modules/analytics/ai-guard.test.ts](../../../apps/api/src/modules/analytics/ai-guard.test.ts) — F15-AC11 (US-064) AI turned off refuses requests

## Open decisions and blockers

Open questions from F15 that apply to this story, with their resolutions (decision review of 2026-10-30, SRS §17):

- [x] Which AI providers are supported at launch, and the monthly budget in money (SRS §13 #5, FR-AI-012)? **Resolved:** Budget approved (USD 10 per madrasa per month); the provider is **Deferred** to Phase 7 (DEC-B45).

## Traceability

- **Story:** US-064 → SPEC-US-064 (this file)
- **Detailed criteria:** F15-AC10, F15-AC11, F15-AC12, F15-AC18
- **Requirements:** FR-AI-011, FR-AI-012
- **SRS acceptance tests:** None
- **Business rules:** None
- **Design:** design.md §13; **Architecture:** ARCHITECTURE.md §18 epic 15
- **Previous location:** `docs/specs/F15-analytics-ai.md`
