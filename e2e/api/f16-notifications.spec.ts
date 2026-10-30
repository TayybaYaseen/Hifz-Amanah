// F16 · Notifications — API E2E (docs/specs/17-f16-notifications/)
// Pushes go to a test push provider read through control.pushesFor(). The only MVP event is "Report published" (FR-NOT-004).
// Screen journeys: e2e/mobile/f16-notifications/.
import { test } from './support/fixtures';

test.describe('F16 · Notifications', { tag: '@F16' }, () => {
  test.fixme('F16-AC1 (US-066) a device token registers for the account and madrasa', async () => {
    // As parent.p1 register a token; it is listed for parent.p1 in Madrasa A only.
  });

  test.fixme('F16-AC2 (US-066) a supported event sends one push per registered device', async () => {
    // Register two tokens for parent.p1; publish S1's report; control.pushesFor(parent.p1) has one per device.
  });

  test.fixme('F16-AC3 (US-066) a push payload is generic with a deep link only', async () => {
    // Payload contains no student name, score, or note marker; deep link points to the report.
  });

  test.fixme('F16-AC5 (US-066) a revoked Parent gets no push for that child', async () => {
    // Publish S3's report; parent.p2 (revoked link) receives nothing.
  });

  test.fixme('F16-AC6 (US-066) a push provider failure does not fail the action', async () => {
    // control.setPushProviderFailing(true); publish a report and confirm homework → both succeed; failure is logged.
  });

  test.fixme('F16-AC7 (US-066) sign-out removes the device token', async () => {
    // parent.p1 signs out on device 1; the next event pushes only to device 2.
  });

  test.fixme('F16-AC8 (US-067) a disabled event type sends no push', async () => {
    // parent.p1 disables "report published"; publish → no push.
  });

  // Added by the decision review of 2026-10-30 (SRS §17).
  test.fixme('F16-AC11 (US-066) "Report published" is the only push event', async () => {
    // Given a published weekly report, when it is published, then one push is sent to the Student and to each linked Parent. No other event sends a push in MVP.
  });
});
