# SPEC-US-067 · Manage notification preferences

| | |
|---|---|
| **Spec ID** | SPEC-US-067 |
| **User story** | US-067 |
| **Feature** | [F16 · Notifications](README.md) |
| **Epic** | EPIC 16 — Notifications ([user-stories.md](../../user-stories.md)) |
| **Status** | draft |
| **Priority** | Not specified in the source documents (SRS, user-stories.md, feature specs). None is assigned here. |
| **Split from** | `docs/specs/F16-notifications.md` on 2026-10-30 |

## User story

**US-067 — Manage notification preferences**

As a user, I want to control supported notification preferences without exposing private information.

Spec wording (from F16):

- **US-067:** As a user, I want to control which notifications I get, so that I'm not disturbed by ones I don't need.

**Feature context** (shared by every story in F16, copied from the feature spec):

> Users want to know when something new is ready, such as a new report, without opening the app. MVP uses **Android push only**: no email, SMS, or WhatsApp. A push message carries no private data. It only says something is ready, and the app fetches the content after sign-in. Delivery is best-effort and never blocks anything else.
>
> There is no code yet. This feature builds the `notifications` module: the `device_tokens` and `notification_prefs` tables, plus the `push.send` worker job ([ARCHITECTURE.md §13](../../ARCHITECTURE.md)).

## Related functional requirements

Requirements this story covers. SRS.md has no story-to-requirement table, so this list is derived from the requirement text and the criteria below.

- **Functional:** FR-NOT-001, FR-NOT-002, FR-NOT-004
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

- **F16-AC8** — **(US-067) Given** the Notifications settings, **when** a user turns an event type off, **then** they receive no push for that event type afterwards.
- **F16-AC9** — **(US-067) Given** the Notifications settings, **when** they open, **then** only Android push options are shown, with no email, SMS, or WhatsApp.
- **F16-AC10** — **(US-067) Given** Android notification permission is denied, **when** the user opens Notifications settings, **then** they see "Notifications are off in Android settings", with a button that opens Android settings.
- **F16-AC12** — **(US-067) Given** a new user, **when** they open Notifications settings, **then** "Report published" is on by default and can be turned off. *(Added 2026-10-30, DEC-B50.)*

## Business rules

No SRS §9 business rule is specific to this story. The rules it follows are stated in the criteria above.

## Validation rules

No validation rule beyond the criteria above.

## Edge cases and error handling

No F16 edge case is specific to this story. See the [feature edge cases](README.md#edge-cases).

**Out of scope for the whole feature** (verbatim from F16):

- Email, SMS, or WhatsApp notifications.
- In-app chat or messaging.
- Notification content that includes student data or notes.
- Marketing or broadcast messages.

## Dependencies

- **Feature F16 depends on:** F01, F10 (from the spec index)
- **Features referenced by this story's criteria and edge cases:** None
- **Other stories referenced:** None
- **Other stories in F16:** [US-066](us-066-receive-android-push-notifications.md)

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

Nothing specific to this story in the source documents.

## Related E2E test scenarios

**Completion gate:** this spec is complete only when `npm run e2e:gate -- US-067` passes. That means every criterion has an E2E test, none is pending, and all of them pass ([e2e/README.md](../../../e2e/README.md)).

**API (Playwright):**

- [e2e/api/f16-notifications.spec.ts](../../../e2e/api/f16-notifications.spec.ts) — F16-AC8 (US-067) a disabled event type sends no push

**Mobile (Maestro):**

- [e2e/mobile/f16-notifications/default-on.yaml](../../../e2e/mobile/f16-notifications/default-on.yaml) — F16 Report published notification is on by default
- [e2e/mobile/f16-notifications/permission-denied.yaml](../../../e2e/mobile/f16-notifications/permission-denied.yaml) — F16 push — Android permission denied
- [e2e/mobile/f16-notifications/push-preferences.yaml](../../../e2e/mobile/f16-notifications/push-preferences.yaml) — F16 push — register, preferences, deep link, sign-out removes token

**Unit (Vitest):**

- [apps/api/src/modules/notifications/payload.test.ts](../../../apps/api/src/modules/notifications/payload.test.ts) — F16-AC8 (US-067) an event type turned off is filtered out
- [apps/api/src/modules/notifications/payload.test.ts](../../../apps/api/src/modules/notifications/payload.test.ts) — F16-AC9 (US-067) only Android push is available; no email, SMS, or WhatsApp

## Open decisions and blockers

Open questions from F16 that apply to this story, with their resolutions (decision review of 2026-10-30, SRS §17):

- [x] Event catalogue: which events send a push (new published report? excuse decision? homework confirmed?) (SRS §13 #11)? **Resolved:** "Report published" only (DEC-B48, FR-NOT-004).
- [x] Consent: are notifications on or off by default per event type? **Resolved:** On by default, can be turned off (DEC-B50, FR-NOT-004).

## Traceability

- **Story:** US-067 → SPEC-US-067 (this file)
- **Detailed criteria:** F16-AC8, F16-AC9, F16-AC10, F16-AC12
- **Requirements:** FR-NOT-001, FR-NOT-002, FR-NOT-004
- **SRS acceptance tests:** None
- **Business rules:** None
- **Design:** design.md §13; **Architecture:** ARCHITECTURE.md §18 epic 16
- **Previous location:** `docs/specs/F16-notifications.md`
