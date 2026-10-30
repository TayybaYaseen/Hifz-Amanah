# F16 · Notifications

**Status:** draft
**Brief:** [00-product-brief.md](../00-product-brief.md) · **Flow:** Settings → Notifications ([design.md §4.16](../../design.md))
**Stories:** US-066 – US-067 · **Requirements:** FR-NOT-001…003, FR-SEC-006

## Context

Users want to know when something new is ready, such as a new report, without opening the app. MVP uses **Android push only**: no email, SMS, or WhatsApp. A push message carries no private data. It only says something is ready, and the app fetches the content after sign-in. Delivery is best-effort and never blocks anything else.

There is no code yet. This feature builds the `notifications` module: the `device_tokens` and `notification_prefs` tables, plus the `push.send` worker job ([ARCHITECTURE.md §13](../../ARCHITECTURE.md)).

## User story

- **US-066:** As an app user, I want supported events delivered as Android push notifications, so that I know when something needs my attention.
- **US-067:** As a user, I want to control which notifications I get, so that I'm not disturbed by ones I don't need.

## Acceptance criteria

1. **(US-066) Given** a signed-in user on Android who allowed notifications, **when** the app starts, **then** their device token is registered for that account and madrasa.
2. **(US-066) Given** a supported event for a user, **when** it happens, **then** one push is sent to that user's registered devices.
3. **(US-066) Given** a push about a student, **when** its payload is built, **then** it contains a generic message and a deep link only, with no student name, scores, or note text.
4. **(US-066) Given** a user who taps a push, **when** the app opens, **then** it goes to the linked screen after authentication, and the server applies normal permission checks.
5. **(US-066) Given** a Parent whose link to a child was revoked, **when** an event happens for that child, **then** no push is sent to that Parent.
6. **(US-066) Given** the push provider fails, **when** the event's action (saving a report, confirming homework) runs, **then** that action still succeeds, and the failure is logged and visible in monitoring.
7. **(US-066) Given** a user signs out, **when** sign-out completes, **then** that device's token is removed, and it receives no more pushes for that account.
8. **(US-067) Given** the Notifications settings, **when** a user turns an event type off, **then** they receive no push for that event type afterwards.
9. **(US-067) Given** the Notifications settings, **when** they open, **then** only Android push options are shown, with no email, SMS, or WhatsApp.
10. **(US-067) Given** Android notification permission is denied, **when** the user opens Notifications settings, **then** they see "Notifications are off in Android settings", with a button that opens Android settings.

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

## Open questions

- [ ] Event catalogue: which events send a push (new published report? excuse decision? homework confirmed?) (SRS §13 #11)?
- [ ] Push provider: FCM directly or Expo Push Service (SRS §13 #11)?
- [ ] Consent: are notifications on or off by default per event type?

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

**Traceability:** Each test name starts with its criterion, e.g. `F16-AC03 (US-066) …`. Every AC 1–10 has at least one test.

**Coverage:** ≥80% on new code.
