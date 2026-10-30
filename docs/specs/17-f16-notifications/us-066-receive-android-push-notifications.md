# SPEC-US-066 · Receive Android push notifications

| | |
|---|---|
| **Spec ID** | SPEC-US-066 |
| **User story** | US-066 |
| **Feature** | [F16 · Notifications](README.md) |
| **Epic** | EPIC 16 — Notifications ([user-stories.md](../../user-stories.md)) |
| **Status** | draft |
| **Priority** | Not specified in the source documents (SRS, user-stories.md, feature specs). None is assigned here. |
| **Split from** | `docs/specs/F16-notifications.md` on 2026-10-30 |

## User story

**US-066 — Receive Android push notifications**

As an app user, I want supported event notifications delivered through Android push notifications.

Spec wording (from F16):

- **US-066:** As an app user, I want supported events delivered as Android push notifications, so that I know when something needs my attention.

**Feature context** (shared by every story in F16, copied from the feature spec):

> Users want to know when something new is ready, such as a new report, without opening the app. MVP uses **Android push only**: no email, SMS, or WhatsApp. A push message carries no private data. It only says something is ready, and the app fetches the content after sign-in. Delivery is best-effort and never blocks anything else.
>
> There is no code yet. This feature builds the `notifications` module: the `device_tokens` and `notification_prefs` tables, plus the `push.send` worker job ([ARCHITECTURE.md §13](../../ARCHITECTURE.md)).

## Related functional requirements

Requirements this story covers. SRS.md has no story-to-requirement table, so this list is derived from the requirement text and the criteria below.

- **Functional:** FR-NOT-001, FR-NOT-002, FR-NOT-003, FR-SEC-006, FR-NOT-004
- **Non-functional:** Not applicable
- **SRS acceptance tests cited:** None

Feature requirement set (from F16; additions of 2026-10-30 at the end): FR-NOT-001…003, FR-SEC-006, FR-NOT-004

## Acceptance criteria

### Story acceptance criteria

Verbatim from [user-stories.md](../../user-stories.md).

1. Only Android push notifications are supported in MVP; email, SMS, and WhatsApp are excluded.
2. Notification payloads respect role/tenant permissions and never expose internal notes or unauthorized student data.

### Detailed acceptance criteria

From the F16 feature spec. The original IDs are kept because tests cite them. Criteria marked *Revised* or *Added* come from the decision review of 2026-10-30 (SRS §17).

- **F16-AC1** — **(US-066) Given** a signed-in user on Android who allowed notifications, **when** the app starts, **then** their device token is registered for that account and madrasa.
- **F16-AC2** — **(US-066) Given** a supported event for a user, **when** it happens, **then** one push is sent to that user's registered devices.
- **F16-AC3** — **(US-066) Given** a push about a student, **when** its payload is built, **then** it contains a generic message and a deep link only, with no student name, scores, or note text.
- **F16-AC4** — **(US-066) Given** a user who taps a push, **when** the app opens, **then** it goes to the linked screen after authentication, and the server applies normal permission checks.
- **F16-AC5** — **(US-066) Given** a Parent whose link to a child was revoked, **when** an event happens for that child, **then** no push is sent to that Parent.
- **F16-AC6** — **(US-066) Given** the push provider fails, **when** the event's action (saving a report, confirming homework) runs, **then** that action still succeeds, and the failure is logged and visible in monitoring.
- **F16-AC7** — **(US-066) Given** a user signs out, **when** sign-out completes, **then** that device's token is removed, and it receives no more pushes for that account.
- **F16-AC11** — **(US-066) Given** a published weekly report, **when** it is published, **then** one push is sent to the Student and to each linked Parent. No other event sends a push in MVP. *(Added 2026-10-30, DEC-B48.)*

## Business rules

From SRS §9 (verbatim):

- **BR-13:** Internal-only notes are excluded from unauthorized outputs.

## Validation rules

No validation rule beyond the criteria above.

## Edge cases and error handling

Rows from the F16 edge-case table that apply to this story (verbatim):

| Situation | What should happen |
|---|---|
| The device token changes or expires | The new token replaces the old one on next start; a token the provider rejects is marked revoked |
| A user is signed in on two devices | Both receive the push |
| The same event fires twice (a retry) | The user gets at most one push (deduplicated by event ID) |
| The push arrives after the user lost access | The tap opens the app, which shows the access-revoked state; no data is shown |
| The push text needs a language | It uses the user's saved language |

**Out of scope for the whole feature** (verbatim from F16):

- Email, SMS, or WhatsApp notifications.
- In-app chat or messaging.
- Notification content that includes student data or notes.
- Marketing or broadcast messages.

## Dependencies

- **Feature F16 depends on:** F01, F10 (from the spec index)
- **Features referenced by this story's criteria and edge cases:** None
- **Other stories referenced:** None
- **Other stories in F16:** [US-067](us-067-manage-notification-preferences.md)

## Related screens and UI

- **Feature flow** (from F16): Settings → Notifications ([design.md §4.16](../../design.md))

[design.md §13](../../design.md) story-to-screen map (verbatim):

| Story | Screen (this document) | Key interaction | Required states beyond standard | Validation shown | Accessibility / localization specifics |
|---|---|---|---|---|---|
| US-066, US-067 | §4.16 Settings → Notifications | Toggle the "Report published" push (on by default; the only MVP event, FR-NOT-004) | Push permission denied by Android | — | Notification text never contains private notes |

## Related API and data model

- **Modules** ([ARCHITECTURE.md §18](../../ARCHITECTURE.md)): `notifications`
- Tables and services are described in the feature context above and in [ARCHITECTURE.md](../../ARCHITECTURE.md). Concrete API routes are defined at scaffolding (SRS §17 DEC-B54).

## Offline and sync behavior

Stated in these criteria: F16-AC1, F16-AC2, F16-AC7.

And in these edge cases (see above):

- The device token changes or expires
- A user is signed in on two devices

## Related E2E test scenarios

**Completion gate:** this spec is complete only when `npm run e2e:gate -- US-066` passes. That means every criterion has an E2E test, none is pending, and all of them pass ([e2e/README.md](../../../e2e/README.md)).

**API (Playwright):**

- [e2e/api/f16-notifications.spec.ts](../../../e2e/api/f16-notifications.spec.ts) — F16-AC1 (US-066) a device token registers for the account and madrasa
- [e2e/api/f16-notifications.spec.ts](../../../e2e/api/f16-notifications.spec.ts) — F16-AC2 (US-066) a supported event sends one push per registered device
- [e2e/api/f16-notifications.spec.ts](../../../e2e/api/f16-notifications.spec.ts) — F16-AC3 (US-066) a push payload is generic with a deep link only
- [e2e/api/f16-notifications.spec.ts](../../../e2e/api/f16-notifications.spec.ts) — F16-AC5 (US-066) a revoked Parent gets no push for that child
- [e2e/api/f16-notifications.spec.ts](../../../e2e/api/f16-notifications.spec.ts) — F16-AC6 (US-066) a push provider failure does not fail the action
- [e2e/api/f16-notifications.spec.ts](../../../e2e/api/f16-notifications.spec.ts) — F16-AC7 (US-066) sign-out removes the device token
- [e2e/api/f16-notifications.spec.ts](../../../e2e/api/f16-notifications.spec.ts) — F16-AC11 (US-066) "Report published" is the only push event

**Mobile (Maestro):**

- [e2e/mobile/f16-notifications/push-preferences.yaml](../../../e2e/mobile/f16-notifications/push-preferences.yaml) — F16 push — register, preferences, deep link, sign-out removes token

**Unit (Vitest):**

- [apps/api/src/modules/notifications/payload.test.ts](../../../apps/api/src/modules/notifications/payload.test.ts) — F16-AC3 (US-066) a push about a student has generic text and a deep link only, with no name, scores, or note text
- [apps/api/src/modules/notifications/payload.test.ts](../../../apps/api/src/modules/notifications/payload.test.ts) — F16-AC2 (US-066) one push is sent per registered device of the user
- [apps/api/src/modules/notifications/payload.test.ts](../../../apps/api/src/modules/notifications/payload.test.ts) — F16-AC5 (US-066) a Parent with a revoked link receives no push for that child

## Open decisions and blockers

Open questions from F16 that apply to this story, with their resolutions (decision review of 2026-10-30, SRS §17):

- [x] Event catalogue: which events send a push (new published report? excuse decision? homework confirmed?) (SRS §13 #11)? **Resolved:** "Report published" only (DEC-B48, FR-NOT-004).
- [x] Push provider: FCM directly or Expo Push Service (SRS §13 #11)? **Resolved:** Expo Push Service (DEC-B49, FR-NOT-004).

## Traceability

- **Story:** US-066 → SPEC-US-066 (this file)
- **Detailed criteria:** F16-AC1, F16-AC2, F16-AC3, F16-AC4, F16-AC5, F16-AC6, F16-AC7, F16-AC11
- **Requirements:** FR-NOT-001, FR-NOT-002, FR-NOT-003, FR-SEC-006, FR-NOT-004
- **SRS acceptance tests:** None
- **Business rules:** SRS §9 #13
- **Design:** design.md §13; **Architecture:** ARCHITECTURE.md §18 epic 16
- **Previous location:** `docs/specs/F16-notifications.md`
