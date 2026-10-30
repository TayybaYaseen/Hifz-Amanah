// Shared Playwright fixtures for black-box API E2E tests.
// Tests import { test, expect } from here, never from '@playwright/test' directly.
import { test as base, expect, type APIRequestContext } from '@playwright/test';
import type { PersonaKey } from '../../fixtures/personas';

export interface PushMessage {
  title: string;
  body: string;
  deepLink: string;
}

export type AiProviderMode = 'ok' | 'timeout' | 'error' | 'invalid-schema' | 'uncited-number';

// Test control (NFR-MNT-005): a test-only API, enabled only in local and staging with a secret. It provides seed reset,
// the Mailpit OTP mail sink, clock control, and AI and push stubs. This interface lists what the E2E suite needs from it.
// Owner/Admin personas need a TOTP code at sign-in (FR-AUTH-016); totpFor() returns one for their seeded secret.
export interface TestControl {
  reset(): Promise<void>;
  latestOtp(userId: string): Promise<string | null>;
  sentEmails(userId: string): Promise<number>;
  advanceClock(ms: number): Promise<void>;
  setAiProvider(mode: AiProviderMode): Promise<void>;
  aiProviderCalls(): Promise<number>;
  setPushProviderFailing(failing: boolean): Promise<void>;
  pushesFor(userId: string): Promise<PushMessage[]>;
  auditFor(targetId: string): Promise<Array<Record<string, unknown>>>;
  totpFor(userId: string): Promise<string>;
}

type Fixtures = {
  /** An API context signed in as a seeded persona. */
  as: (persona: PersonaKey) => Promise<APIRequestContext>;
  /** An API context with no session. */
  anon: APIRequestContext;
  control: TestControl;
};

function notDecided(what: string): never {
  // API routes, session transport, and the test-control endpoints are defined when the API is scaffolded (SRS §17 DEC-B54).
  throw new Error(`${what} is not implemented yet (defined at scaffolding, SRS §17 DEC-B54)`);
}

export const test = base.extend<Fixtures>({
  as: async ({}, use) => {
    await use(async () => notDecided('sign-in route and session transport'));
  },
  anon: async ({ playwright, baseURL }, use) => {
    const ctx = await playwright.request.newContext({ baseURL });
    await use(ctx);
    await ctx.dispose();
  },
  control: async ({}, use) => {
    await use(new Proxy({} as TestControl, { get: () => () => notDecided('test-control mechanism') }));
  },
});

export { expect };
