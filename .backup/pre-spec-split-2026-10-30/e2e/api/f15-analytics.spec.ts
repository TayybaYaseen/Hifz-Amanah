// F15 · Analytics and AI recommendations — API E2E (docs/specs/F15-analytics-ai.md)
// The AI provider is a controllable stub; no real provider is called (OPEN: SRS §13 #5).
// Screen journeys: e2e/mobile/f15-analytics/.
import { test } from './support/fixtures';

test.describe('F15 · Analytics and AI recommendations', { tag: '@F15' }, () => {
  test.fixme('F15-AC1 (US-062) analytics metrics match source records', async () => {
    // Seed a month for S1; analytics progress, per-unit quantities, mistake and quality trends,
    // difficult portions, and attendance equal values computed by the test.
  });

  test.fixme('F15-AC4 (US-063) a recommendation states its date range and the metrics used', async () => {
    // control.setAiProvider('ok'); request as teacher.a1; response has range, metric list, and AI label.
  });

  test.fixme('F15-AC6 (US-063) a provider timeout returns "AI unavailable" and nothing else breaks (AC-AI-04)', async () => {
    // control.setAiProvider('timeout'); request → unavailable; then save a record, read a report, and sync → all succeed.
  });

  test.fixme('F15-AC7 (US-063) invalid schema or uncited numbers are discarded', async () => {
    // 'invalid-schema' and 'uncited-number' modes → unavailable; nothing from the response is returned.
  });

  test.fixme('F15-AC8 (US-063) an AI response changes no record (AC-AI-03)', async () => {
    // Snapshot records, attempts, quality, homework; request a recommendation; snapshot is unchanged.
  });

  test.fixme('F15-AC9 (US-063) Student and Parent AI requests are refused', async () => {
    // As student.s1 and parent.p1 request AI → forbidden.
  });

  test.fixme('F15-AC10 (US-064) AI provider, on/off, and limits are saved and audited', async () => {
    // As admin.a update AI settings; read back; audit present. As teacher.a1 update → forbidden.
  });

  test.fixme('F15-AC11 (US-064) AI turned off refuses requests', async () => {
    // admin.a disables AI; teacher.a1 request → refused; control.aiProviderCalls() unchanged.
  });

  test.fixme('F15-AC12 (US-064) at the usage limit, requests are refused without a provider call', async () => {
    // Set limit 1; first request ok; second → "AI limit reached for this period"; provider calls = 1.
  });

  test.fixme('F15-AC13 (US-065) the default AI payload has no names, contacts, or notes', async () => {
    // Inspect the payload the stub received: no student name, email, phone, or note marker; a pseudonym only.
  });

  test.fixme('F15-AC14 (US-065) a disabled data category is left out of the payload', async () => {
    // admin.a disables attendance sharing; next payload has no attendance fields.
  });

  test.fixme('F15-AC15 (US-065) usage records hold the minimized payload and an input hash', async () => {
    // Read the usage record; it equals the minimized payload plus a hash; no raw records.
  });
});
