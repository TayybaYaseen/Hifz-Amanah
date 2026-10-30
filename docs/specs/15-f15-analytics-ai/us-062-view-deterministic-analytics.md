# SPEC-US-062 · View deterministic analytics

| | |
|---|---|
| **Spec ID** | SPEC-US-062 |
| **User story** | US-062 |
| **Feature** | [F15 · Analytics and AI recommendations](README.md) |
| **Epic** | EPIC 15 — Analytics and AI ([user-stories.md](../../user-stories.md)) |
| **Status** | draft |
| **Priority** | Not specified in the source documents (SRS, user-stories.md, feature specs). None is assigned here. |
| **Split from** | `docs/specs/F15-analytics-ai.md` on 2026-10-30 |

## User story

**US-062 — View deterministic analytics**

As a Teacher, I want performance analytics calculated from source records.

Spec wording (from F15):

- **US-062:** As a Teacher, I want performance analytics calculated from source records, so that I can see trends I can trust, even offline.

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

- **Functional:** FR-AI-001
- **Non-functional:** NFR-AI-002, NFR-OFF-008
- **SRS acceptance tests cited:** AC-AI-02

Feature requirement set (from F15; additions of 2026-10-30 at the end): FR-AI-001…012, NFR-AI-001…004, NFR-OFF-008, FR-AI-013/014

## Acceptance criteria

### Story acceptance criteria

Verbatim from [user-stories.md](../../user-stories.md).

1. Deterministic analytics remain the source of truth and are available offline from cached data, labeled provisional when unsynced.
2. AI is online-only and advisory; it uses minimized structured metrics, cites the relevant period/data, and cannot mutate records or confirm homework.

### Detailed acceptance criteria

From the F15 feature spec. The original IDs are kept because tests cite them. Criteria marked *Revised* or *Added* come from the decision review of 2026-10-30 (SRS §17).

- **F15-AC1** — **(US-062) Given** a student's records, **when** Analytics opens, **then** it shows Sabaq/Sabqi/Manzil progress, assigned vs completed quantities per unit, mistake trends by category and severity, quality trend, recurring difficult portions, and attendance context, all calculated from source records.
- **F15-AC2** — **(US-062) Given** no internet connection, **when** Analytics opens, **then** the metrics are calculated from local data and labelled "Provisional", with the last sync time and the pending-change count (AC-AI-02).
- **F15-AC3** — **(US-062) Given** quality scores in the trend, **when** the chart is drawn, **then** the axis runs from 1 · Excellent at the top to 5 · Weak at the bottom, missing ratings are gaps, and a falling average is described as improvement.

## Business rules

From SRS §9 (verbatim):

- **BR-8:** Weekly/monthly reports are derived from daily source records.
- **BR-17:** Missing data is not the same as zero performance.

## Validation rules

No validation rule beyond the criteria above.

## Edge cases and error handling

Rows from the F15 edge-case table that apply to this story (verbatim):

| Situation | What should happen |
|---|---|
| A student has too little data | Analytics shows "Not enough data for this period"; AI is not called, or it must say the data is insufficient |

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
- **Other stories in F15:** [US-063](us-063-receive-ai-recommendations.md), [US-064](us-064-configure-ai-provider-and-limits.md), [US-065](us-065-control-ai-data-sharing.md)

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

Stated in these criteria: F15-AC2.

## Related E2E test scenarios

**Completion gate:** this spec is complete only when `npm run e2e:gate -- US-062` passes. That means every criterion has an E2E test, none is pending, and all of them pass ([e2e/README.md](../../../e2e/README.md)).

**API (Playwright):**

- [e2e/api/f15-analytics.spec.ts](../../../e2e/api/f15-analytics.spec.ts) — F15-AC1 (US-062) analytics metrics match source records

**Mobile (Maestro):**

- [e2e/mobile/f15-analytics/analytics-and-ai.yaml](../../../e2e/mobile/f15-analytics/analytics-and-ai.yaml) — F15 analytics — offline provisional, AI online, AI failure

**Unit (Vitest):**

- [packages/domain/analytics/metrics.test.ts](../../../packages/domain/analytics/metrics.test.ts) — F15-AC1 (US-062) progress, assigned vs completed per unit, mistake trends, quality trend, difficult portions, and attendance come from source records
- [packages/domain/analytics/metrics.test.ts](../../../packages/domain/analytics/metrics.test.ts) — F15-AC2 (US-062) metrics from unsynced local data are marked provisional with last sync time and pending count (AC-AI-02)
- [packages/domain/analytics/metrics.test.ts](../../../packages/domain/analytics/metrics.test.ts) — F15-AC3 (US-062) the axis runs 1 · Excellent (top) to 5 · Weak (bottom), missing ratings are gaps, and a falling average is improvement

## Open decisions and blockers

None specific to this story. See the [feature open questions](README.md#open-questions).

## Traceability

- **Story:** US-062 → SPEC-US-062 (this file)
- **Detailed criteria:** F15-AC1, F15-AC2, F15-AC3
- **Requirements:** FR-AI-001, NFR-AI-002, NFR-OFF-008
- **SRS acceptance tests:** AC-AI-02
- **Business rules:** SRS §9 #8, SRS §9 #17
- **Design:** design.md §13; **Architecture:** ARCHITECTURE.md §18 epic 15
- **Previous location:** `docs/specs/F15-analytics-ai.md`
