# F16 · Notifications

**Status:** draft
**Brief:** [00-product-brief.md](../../00-product-brief.md) · **Flow:** Settings → Notifications ([design.md §4.16](../../design.md))
**Requirements:** FR-NOT-001…003, FR-SEC-006, FR-NOT-004
**Stories:** US-066 – US-067 · **Depends on:** F01, F10
**Build order:** 17 of 17 (dependency level 7)

This folder has one spec per user story. This page keeps what applies to the whole feature: context, scope, edge cases, open questions, the feature test plan, and its definition of done. Story specs repeat the edge cases and open questions that apply to them.

## Story specs

| Spec | Story | Detailed criteria |
|---|---|---|
| [SPEC-US-066](us-066-receive-android-push-notifications.md) | US-066 — Receive Android push notifications | F16-AC1, F16-AC2, F16-AC3, F16-AC4, F16-AC5, F16-AC6, F16-AC7, F16-AC11 |
| [SPEC-US-067](us-067-manage-notification-preferences.md) | US-067 — Manage notification preferences | F16-AC8, F16-AC9, F16-AC10, F16-AC12 |

## Context

Users want to know when something new is ready, such as a new report, without opening the app. MVP uses **Android push only**: no email, SMS, or WhatsApp. A push message carries no private data. It only says something is ready, and the app fetches the content after sign-in. Delivery is best-effort and never blocks anything else.

There is no code yet. This feature builds the `notifications` module: the `device_tokens` and `notification_prefs` tables, plus the `push.send` worker job ([ARCHITECTURE.md §13](../../ARCHITECTURE.md)).

## Out of scope

- Email, SMS, or WhatsApp notifications.
- In-app chat or messaging.
- Notification content that includes student data or notes.
- Marketing or broadcast messages.

## Edge cases

| Situation | What should happen |
|---|---|
| The device token changes or expires | The new token replaces the old one on next start; a token the provider rejects is marked revoked |
| A user is signed in on two devices | Both receive the push |
| The same event fires twice (a retry) | The user gets at most one push (deduplicated by event ID) |
| The push arrives after the user lost access | The tap opens the app, which shows the access-revoked state; no data is shown |
| The push text needs a language | It uses the user's saved language |

## Open questions (resolved 2026-10-30)

- [x] Event catalogue: which events send a push (new published report? excuse decision? homework confirmed?) (SRS §13 #11)? **Resolved:** "Report published" only (DEC-B48, FR-NOT-004).
- [x] Push provider: FCM directly or Expo Push Service (SRS §13 #11)? **Resolved:** Expo Push Service (DEC-B49, FR-NOT-004).
- [x] Consent: are notifications on or off by default per event type? **Resolved:** On by default, can be turned off (DEC-B50, FR-NOT-004).

## Done means

- [ ] Every acceptance criterion has a passing test.
- [ ] `npm run e2e:gate -- F16` passes: every criterion has an E2E test, none is pending, and all pass (e2e/README.md).
- [ ] Nothing from "Out of scope" was built.
- [ ] `npm test` and `npm run lint` pass.
- [ ] The F10 leak-marker test covers push payloads.

## Test plan

| Level | What it covers | Where |
|---|---|---|
| **Unit** | Payload builder (generic text, deep link, no PII), preference filtering, deduplication by event ID | `apps/api/src/modules/notifications/**/*.test.ts` |
| **Integration** | Token register/remove, `push.send` job with a mock provider, provider failure not blocking the source action, revoked-link suppression | `apps/api/test/notifications/*.test.ts` |
| **Component** | Notifications settings toggles, denied-permission state, deep-link routing | `apps/mobile/src/features/settings/__tests__/notifications*.test.tsx` |
| **E2E** | Every acceptance criterion: server-side checks (API) and device journeys (Maestro), including: Turn an event off → trigger it → no push; turn it on → push arrives → tap opens the right screen | `e2e/api/f16-notifications.spec.ts`, `e2e/mobile/f16-notifications/` |

**Traceability:** Each test name starts with its criterion, e.g. `F16-AC03 (US-066) …`. Every AC 1–12 has at least one test.

**Coverage:** ≥80% on new code.
