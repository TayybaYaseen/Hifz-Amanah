# F15 · Analytics and AI recommendations

**Status:** draft
**Brief:** [00-product-brief.md](../../00-product-brief.md) · **Flow:** Analytics (design gap; uses [design.md §5.8](../../design.md)); Settings → AI (design gap, Admin only)
**Requirements:** FR-AI-001…012, NFR-AI-001…004, NFR-OFF-008, FR-AI-013/014
**Stories:** US-062 – US-065 · **Depends on:** F09
**Build order:** 15 of 17 (dependency level 6)

This folder has one spec per user story. This page keeps what applies to the whole feature: context, scope, edge cases, open questions, the feature test plan, and its definition of done. Story specs repeat the edge cases and open questions that apply to them.

## Story specs

| Spec | Story | Detailed criteria |
|---|---|---|
| [SPEC-US-062](us-062-view-deterministic-analytics.md) | US-062 — View deterministic analytics | F15-AC1, F15-AC2, F15-AC3 |
| [SPEC-US-063](us-063-receive-ai-recommendations.md) | US-063 — Receive AI recommendations | F15-AC4, F15-AC5, F15-AC6, F15-AC7, F15-AC8, F15-AC9, F15-AC17 |
| [SPEC-US-064](us-064-configure-ai-provider-and-limits.md) | US-064 — Configure AI provider and limits | F15-AC10, F15-AC11, F15-AC12, F15-AC18 |
| [SPEC-US-065](us-065-control-ai-data-sharing.md) | US-065 — Control AI data sharing | F15-AC13, F15-AC14, F15-AC15, F15-AC16 |

## Context

Teachers want to know where a student is struggling. **Calculated analytics** answer that from the records, work offline, and are the source of truth. **AI recommendations** are an optional online extra that explains those numbers in words. AI only advises. It never writes to records, never sets quality scores, and never confirms homework. The app must work fully without it.

There is no code yet. This feature builds:
- deterministic metrics in `packages/domain/analytics`, reusing the F09 report logic
- the server-side `analytics` AI gateway: provider adapters, `org_ai_settings`, and `ai_requests` ([ARCHITECTURE.md §12](../../ARCHITECTURE.md))

The AI flow is for Teachers and Admins only.

## Out of scope

- AI that runs on the device or offline.
- AI writing to records, scoring recitation, or confirming homework.
- AI for Students or Parents.
- Sending raw workbooks, audio, or full student profiles to AI.
- Automatic high-impact decisions (grades, discipline, access).

## Edge cases

| Situation | What should happen |
|---|---|
| A student has too little data | Analytics shows "Not enough data for this period"; AI is not called, or it must say the data is insufficient |
| The provider returns text in the wrong language | It is discarded, or the request is retried once asking for the user's language |
| The Admin switches provider mid-month | Usage counts continue for the madrasa; new requests use the new provider |
| The AI cites "quality improved from 3 to 2" but no such metric was sent | Fails the number check (AC 7) and is not shown |
| The AI says "higher quality score is better" | Fails the eval (see below); the prompt states that lower is better |

## For AI features only: what "done" means

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

## Open questions (resolved 2026-10-30)

- [x] Which AI providers are supported at launch, and the monthly budget in money (SRS §13 #5, FR-AI-012)? **Resolved:** Budget approved (USD 10 per madrasa per month); the provider is **Deferred** to Phase 7 (DEC-B45).
- [x] Which data categories can the Admin toggle (attendance, mistakes, quality, homework)? **Resolved:** Five categories, on by default; names, contacts, notes never sent (DEC-B46, FR-AI-013).
- [x] Does the AI text appear in the Teacher's chosen language, and does the eval set need Urdu examples? **Resolved:** Yes to both (DEC-B47, FR-AI-014).
- [x] How long are `ai_requests` kept? **Resolved:** 90 days; usage totals 1 year (DEC-B44, NFR-PRV-005).

## Done means

- [ ] Every acceptance criterion has a passing test.
- [ ] `npm run e2e:gate -- F15` passes: every criterion has an E2E test, none is pending, and all pass (e2e/README.md).
- [ ] Nothing from "Out of scope" was built.
- [ ] `npm test` and `npm run lint` pass.
- [ ] The eval set runs in CI against a recorded or mock provider and passes every "must / must not" row.
- [ ] A test with the network disabled shows daily entry, reports, and sync unaffected.

## Test plan

| Level | What it covers | Where |
|---|---|---|
| **Unit** | Metric calculations, payload minimizer and PII scanner, schema and number-citation validator, limit accounting | `packages/domain/analytics/*.test.ts`, `apps/api/src/modules/analytics/**/*.test.ts` |
| **Integration** | AI endpoint with a mock provider: on/off, role refusal, limits, timeout fallback, discarded invalid output, no record writes, audit of settings | `apps/api/test/analytics/*.test.ts` |
| **Component** | Analytics screen with provisional label, AI area separate from metrics, every failure message, Admin AI settings form | `apps/mobile/src/features/analytics/__tests__/*.test.tsx` |
| **E2E** | Every acceptance criterion: server-side checks (API) and device journeys (Maestro), including: Teacher opens Analytics offline (provisional) → goes online → gets a mock AI recommendation | `e2e/api/f15-analytics.spec.ts`, `e2e/mobile/f15-analytics/` |
| **Eval** | The eval-set table above, run against a recorded/mock provider | `apps/api/test/analytics/evals/*.test.ts` |

**Traceability:** Each test name starts with its criterion, e.g. `F15-AC07 (US-063) …`. Every AC 1–15 has at least one test, and every eval row has a case.

**Coverage:** ≥80% on new code.
