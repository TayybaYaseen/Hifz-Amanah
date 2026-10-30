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

// OPEN: SRS §13 #10 — the test-control mechanism (seed reset, mail sink, clock, provider stubs)
// is not decided. This interface lists what the E2E suite needs from it.
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
}

type Fixtures = {
  /** An API context signed in as a seeded persona. */
  as: (persona: PersonaKey) => Promise<APIRequestContext>;
  /** An API context with no session. */
  anon: APIRequestContext;
  control: TestControl;
};

function notDecided(what: string): never {
  // OPEN: SRS §13 #1 and #10 — routes, auth transport, and test control are not defined yet.
  throw new Error(`OPEN: ${what} is not defined yet (SRS §13)`);
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
