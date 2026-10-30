# F15 · Analytics and AI recommendations

**Status:** draft
**Brief:** [00-product-brief.md](../00-product-brief.md) · **Flow:** Analytics (design gap; uses [design.md §5.8](../../design.md)); Settings → AI (design gap, Admin only)
**Stories:** US-062 – US-065 · **Requirements:** FR-AI-001…012, NFR-AI-001…004, NFR-OFF-008

## Context

Teachers want to know where a student is struggling. **Calculated analytics** answer that from the records, work offline, and are the source of truth. **AI recommendations** are an optional online extra that explains those numbers in words. AI only advises. It never writes to records, never sets quality scores, and never confirms homework. The app must work fully without it.

There is no code yet. This feature builds:
- deterministic metrics in `packages/domain/analytics`, reusing the F09 report logic
- the server-side `analytics` AI gateway: provider adapters, `org_ai_settings`, and `ai_requests` ([ARCHITECTURE.md §12](../../ARCHITECTURE.md))

The AI flow is for Teachers and Admins only.

## User story

- **US-062:** As a Teacher, I want performance analytics calculated from source records, so that I can see trends I can trust, even offline.
- **US-063:** As an authorized Teacher/Admin, I want online AI recommendations grounded in a student's metrics, so that I get ideas for what to focus on.
- **US-064:** As a Madrasa Admin, I want to choose a supported AI provider, turn AI on or off, and set usage limits, so that we control AI use and cost.
- **US-065:** As a Madrasa Admin, I want privacy controls over which student data is sent to AI, so that we share only what we are comfortable with.

## Acceptance criteria

1. **(US-062) Given** a student's records, **when** Analytics opens, **then** it shows Sabaq/Sabqi/Manzil progress, assigned vs completed quantities per unit, mistake trends by category and severity, quality trend, recurring difficult portions, and attendance context, all calculated from source records.
2. **(US-062) Given** no internet connection, **when** Analytics opens, **then** the metrics are calculated from local data and labelled "Provisional", with the last sync time and the pending-change count (AC-AI-02).
3. **(US-062) Given** quality scores in the trend, **when** the chart is drawn, **then** the axis runs from 1 · Excellent at the top to 5 · Weak at the bottom, missing ratings are gaps, and a falling average is described as improvement.
4. **(US-063) Given** AI enabled and a Teacher online, **when** they tap "Get AI recommendations", **then** the response is shown in a separate area labelled "AI suggestion — review required", stating the date range and the metrics it used.
5. **(US-063) Given** no internet connection, **when** the Teacher views Analytics, **then** the AI button shows "AI needs a connection", and no AI text is shown or invented (AC-AI-01).
6. **(US-063) Given** the provider times out or errors, **when** the request fails, **then** the Teacher sees "AI unavailable — try again later", and daily entry, reports, and sync keep working (AC-AI-04).
7. **(US-063) Given** an AI response, **when** it is received, **then** the server checks it against the response schema and confirms every number it cites exists in the metrics sent; a response that fails either check is discarded and shown as unavailable.
8. **(US-063) Given** any AI response, **when** it is handled, **then** no daily record, attempt, quality score, or homework is created or changed (AC-AI-03).
9. **(US-063) Given** a Student or Parent, **when** they use the app, **then** no AI feature is offered to them, and the API refuses AI requests from them.
10. **(US-064) Given** a Madrasa Admin, **when** they choose a provider from the supported list, set it on or off, and set a request limit, **then** the settings are saved and audited.
11. **(US-064) Given** AI turned off, **when** a Teacher opens Analytics, **then** the AI button is hidden, and the API refuses AI requests.
12. **(US-064) Given** the madrasa has reached its usage limit, **when** a Teacher asks for a recommendation, **then** it is refused with "AI limit reached for this period", and no provider call is made.
13. **(US-065) Given** the default privacy settings, **when** an AI request is built, **then** it contains no student name, contact details, or teacher notes. The student is referred to only by a pseudonym.
14. **(US-065) Given** an Admin who turns off a data category (e.g. attendance), **when** the next request is built, **then** that category is not in the payload.
15. **(US-065) Given** any AI request, **when** it is stored for usage tracking, **then** the stored record holds the minimized payload and an input hash, not raw student records.

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

**Cost and speed:** The model and provider are chosen per madrasa from the supported list (launch list OPEN, SRS §13 #5). Proposed defaults:
- requests: a per-madrasa monthly cap (set by the Admin) and 20 per Teacher per day
- timeout: 20 s
- target wait: under 10 s
- input: at most ~2,000 tokens of metrics

## Open questions

- [ ] Which AI providers are supported at launch, and the monthly budget in money (SRS §13 #5, FR-AI-012)?
- [ ] Which data categories can the Admin toggle (attendance, mistakes, quality, homework)?
- [ ] Does the AI text appear in the Teacher's chosen language, and does the eval set need Urdu examples?
- [ ] How long are `ai_requests` kept?

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
