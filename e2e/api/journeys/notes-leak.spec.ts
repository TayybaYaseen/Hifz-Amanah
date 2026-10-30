// App-wide: internal teacher notes never reach Student or Parent audiences on any channel.
// SRS §10.5 AC-SEC-04; AGENTS.md §6 ("Add a test for every new outbound channel").
import { test } from '../support/fixtures';

// A unique marker written into a private note before each check, then searched for in raw output.
const PRIVATE_MARKER = 'E2E-PRIVATE-NOTE-7f3a';

test.describe('APP · Internal-note leak sweep', { tag: '@APP' }, () => {
  test.fixme('APP-NOTE-01 (AC-SEC-04) report API responses for Student and Parent omit the private note', async () => {
    // As student.s1 and parent.p1 fetch weekly, monthly, and daily-detail reports; raw body excludes PRIVATE_MARKER.
  });

  test.fixme('APP-NOTE-02 (AC-SEC-04) Student and Parent PDFs omit the private note', async () => {
    // Generate PDFs as student.s1 and parent.p1; extracted text excludes PRIVATE_MARKER.
  });

  test.fixme('APP-NOTE-03 (AC-XLS-06) Student and Parent audience exports omit the private note', async () => {
    // Export for those audiences; no cell contains PRIVATE_MARKER.
  });

  test.fixme('APP-NOTE-04 push payloads omit the private note', async () => {
    // Trigger every push event type for S1; control.pushesFor(parent.p1) payloads exclude PRIVATE_MARKER.
  });

  test.fixme('APP-NOTE-05 AI request payloads omit notes by default', async () => {
    // Request an AI recommendation for S1; the stub-received payload excludes PRIVATE_MARKER.
  });

  test.fixme('APP-NOTE-06 the channel inventory matches every outbound channel', async () => {
    // Fail if a channel exists (API audience, PDF, Excel, push, AI) without a check in this file.
  });
});
