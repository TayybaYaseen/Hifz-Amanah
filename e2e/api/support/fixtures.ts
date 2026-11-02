// Shared Playwright fixtures for black-box API E2E tests.
// Tests import { test, expect } from here, never from '@playwright/test' directly.
import { test as base, expect, type APIRequestContext } from '@playwright/test';
import { TEST_PASSWORD, loginIdOf, personas, type PersonaKey } from '../../fixtures/personas';

export interface PushMessage {
  title: string;
  body: string;
  deepLink: string;
}

export type AiProviderMode = 'ok' | 'timeout' | 'error' | 'invalid-schema' | 'uncited-number';

/** A persona key ('teacher.a1') or a raw User ID ('no-such-user'). */
export type Who = PersonaKey | string;

// Test control (NFR-MNT-005): a test-only API, enabled only in local and staging with a secret
// (apps/api/src/testing/control.ts). It provides seed reset, the OTP mail sink, clock control, audit and
// text search, and TOTP codes for the seeded Owner/Admin personas (FR-AUTH-016). AI and push stubs arrive
// with F15 and F16.
export interface TestControl {
  reset(): Promise<void>;
  latestOtp(who: Who): Promise<string | null>;
  sentEmails(who: Who): Promise<number>;
  emailRecipients(who: Who): Promise<string[]>;
  advanceClock(ms: number): Promise<void>;
  setAiProvider(mode: AiProviderMode): Promise<void>;
  aiProviderCalls(): Promise<number>;
  setPushProviderFailing(failing: boolean): Promise<void>;
  pushesFor(userId: string): Promise<PushMessage[]>;
  auditFor(who: Who): Promise<Array<Record<string, unknown>>>;
  totpFor(who: Who): Promise<string>;
  userIdOf(who: Who): Promise<string>;
  /** Counts a string in every database table and in the captured API logs. */
  search(text: string): Promise<{ database: number; logs: number | null }>;
}

export interface Session {
  accessToken: string;
  refreshToken: string;
  /** An API context that sends this session's access token. */
  api: APIRequestContext;
}

type Fixtures = {
  /** An API context signed in as a seeded persona (completing two-factor sign-in for Owner/Admin). */
  as: (persona: PersonaKey) => Promise<APIRequestContext>;
  /** Signs in and returns the tokens too. */
  signIn: (persona: Who, password?: string) => Promise<Session>;
  /** An API context with no session. */
  anon: APIRequestContext;
  control: TestControl;
  /** Every test starts from a freshly seeded environment. */
  freshSeed: void;
};

export const toLoginId = (who: Who): string => (who in personas ? loginIdOf(who as PersonaKey) : who);

const CONTROL_SECRET = process.env.E2E_CONTROL_SECRET ?? 'local-e2e-control-secret';

function notYet(what: string): never {
  throw new Error(`${what} is not implemented yet; it arrives with its feature`);
}

export const test = base.extend<Fixtures>({
  anon: async ({ playwright, baseURL }, use) => {
    const ctx = await playwright.request.newContext({ baseURL });
    await use(ctx);
    await ctx.dispose();
  },

  control: async ({ playwright, baseURL }, use) => {
    const ctx = await playwright.request.newContext({
      baseURL: `${baseURL}/__test/`,
      extraHTTPHeaders: { 'x-test-control-secret': CONTROL_SECRET },
    });
    const json = async (response: Awaited<ReturnType<APIRequestContext['get']>>) => {
      if (!response.ok()) throw new Error(`test control ${response.url()} → ${response.status()}`);
      return response.json();
    };
    const id = (who: Who) => encodeURIComponent(toLoginId(who));
    const control: TestControl = {
      reset: async () => void (await json(await ctx.post('reset'))),
      latestOtp: async (who) => (await json(await ctx.get(`otp/${id(who)}`))).otp,
      sentEmails: async (who) => (await json(await ctx.get(`emails/${id(who)}`))).count,
      emailRecipients: async (who) => (await json(await ctx.get(`emails/${id(who)}`))).to,
      advanceClock: async (ms) => void (await json(await ctx.post('clock', { data: { advanceMs: ms } }))),
      auditFor: async (who) => (await json(await ctx.get(`audit/${id(who)}`))).items,
      totpFor: async (who) => (await json(await ctx.get(`totp/${id(who)}`))).code,
      userIdOf: async (who) => (await json(await ctx.get(`users/${id(who)}`))).id,
      search: async (text) => json(await ctx.post('search', { data: { text } })),
      setAiProvider: async () => notYet('AI provider stub (F15)'),
      aiProviderCalls: async () => notYet('AI provider stub (F15)'),
      setPushProviderFailing: async () => notYet('push stub (F16)'),
      pushesFor: async () => notYet('push stub (F16)'),
    };
    await use(control);
    await ctx.dispose();
  },

  freshSeed: [
    async ({ control }, use) => {
      await control.reset();
      await use();
    },
    { auto: true },
  ],

  signIn: async ({ playwright, baseURL, anon, control }, use) => {
    const contexts: APIRequestContext[] = [];
    await use(async (who, password = TEST_PASSWORD) => {
      const res = await anon.post('/auth/sign-in', { data: { loginId: toLoginId(who), password } });
      if (!res.ok()) throw new Error(`sign-in as ${who} failed: ${res.status()}`);
      let body = await res.json();
      if (body.step === 'TWO_FACTOR_REQUIRED') {
        const verify = await anon.post('/auth/two-factor/verify', {
          data: { challengeToken: body.challengeToken, code: await control.totpFor(who) },
        });
        if (!verify.ok()) throw new Error(`two-factor sign-in as ${who} failed: ${verify.status()}`);
        body = await verify.json();
      }
      if (body.step !== 'SIGNED_IN') throw new Error(`sign-in as ${who} stopped at ${body.step}`);
      const api = await playwright.request.newContext({
        baseURL,
        extraHTTPHeaders: { Authorization: `Bearer ${body.accessToken}` },
      });
      contexts.push(api);
      return { accessToken: body.accessToken, refreshToken: body.refreshToken, api };
    });
    for (const ctx of contexts) await ctx.dispose();
  },

  as: async ({ signIn }, use) => {
    await use(async (persona) => (await signIn(persona)).api);
  },
});

export { expect };
