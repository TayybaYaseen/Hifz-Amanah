// Shared Playwright fixtures for black-box API E2E tests.
// Tests import { test, expect } from here, never from '@playwright/test' directly.
import { test as base, expect, type APIRequestContext } from '@playwright/test';
import { TEST_PASSWORD, classes, loginIdOf, personas, type PersonaKey, type StudentKey } from '../../fixtures/personas';

export type ClassKey = keyof typeof classes;

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
// text search, TOTP codes for the seeded Owner/Admin personas (FR-AUTH-016), operator workspace creation, an
// audit-failure switch (F02), and the seeded roster ids (F03). AI and push stubs arrive with F15 and F16.
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
  /** Audit records about one target ID (an organization or a user), oldest first. */
  auditForTarget(id: string): Promise<Array<Record<string, unknown>>>;
  /** The platform operator creates a workspace and its first Owner (FR-ORG-001); the Owner gets an authenticator. */
  createWorkspace(input: { name: string; code: string; ownerLoginId: string; kind?: 'MADRASA' | 'INDIVIDUAL' }): Promise<{ organizationId: string; ownerUserId: string }>;
  /** The next audit write fails (F02-AC13). Cleared by reset. */
  failNextAuditWrite(): Promise<void>;
  totpFor(who: Who): Promise<string>;
  userIdOf(who: Who): Promise<string>;
  /** Counts a string in every database table and in the captured API logs. */
  search(text: string): Promise<{ database: number; logs: number | null }>;
  /** Ids of the seeded fixture classes and students, keyed as in fixtures/personas.ts (A1, S1, …) (F03). */
  rosterIds(): Promise<{ classes: Record<ClassKey, string>; students: Record<StudentKey, string> }>;
  /**
   * Applies the SYNTHETIC Quran fixture (never real metadata: 20 Ayat per Surah, 16-line test layout for Surahs 1–3)
   * to a madrasa by code (F06). No real Quran seed exists until a dataset is approved (DEC-B31).
   */
  seedSyntheticQuran(organizationCode?: string): Promise<Record<string, unknown>>;
  /**
   * Applies a given seed file to a madrasa (F06). Returns the status and body: refusals are results, not errors.
   * Tests only ever pass synthetic values.
   */
  /** `report`: the signed validation report that goes with a signed seed; production seeds need it (DEC-B78). */
  applyQuranSeed(seed: unknown, organizationCode?: string, report?: unknown): Promise<{ status: number; body: Record<string, unknown> }>;
  /** Runs the converter on the SYNTHETIC sources (optionally production-flagged, or with a named defect) (F06). */
  convertSyntheticQuran(options?: { production?: boolean; datasetVersion?: string; defect?: QuranSourceDefect }): Promise<QuranConversion>;
  /** The reviewer sign step; a refusal returns status 400 with its reasons. */
  signQuranDataset(seed: unknown, report: unknown, review: QuranReview): Promise<{ status: number; body: Record<string, unknown> }>;
  /** Registers a source file in the catalogue (synthetic file; `synthetic: false` only for production-path tests). */
  registerQuranSource(source: { provider: string; resourceId: string | null; category: string; fileName: string; fileSha256: string; synthetic: boolean }): Promise<{ id: string }>;
  /** Appends a licence record to a registered source. */
  recordQuranLicence(sourceId: string, licence: { status: string; licenceName?: string | null; permissionRef: string | null; publisherClearanceRef: string | null; attributionText?: string | null }): Promise<{ revokedVersions: number }>;
}

export type QuranSourceDefect = 'UNMAPPED_WORD_ID' | 'LINE_SPANS_SURAHS' | 'COVERAGE_GAP' | 'HEADING_WITH_WORDS';

export interface QuranReview {
  reviewer: string;
  qualification: string | null;
  mushafPrinting: string;
  /** Where the paper sign-off (or its documented digital equivalent) is held (DEC-B78). */
  signOffRef: string | null;
  decision: 'APPROVED' | 'APPROVED_WITH_FINDINGS' | 'REJECTED';
  signedOn: string;
  findings: { part: string; description: string; blocking: boolean }[];
}

export interface QuranConversion {
  seed: Record<string, unknown> | null;
  report: {
    seedSha256: string | null;
    checks: { id: string; result: string; details: string[] }[];
    sources: { file: string; provider: string; resourceId: string | null; role: string; fileName: string; fileSha256: string }[];
    gate: { importReady: boolean; blockers: string[] };
  } & Record<string, unknown>;
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
      auditForTarget: async (target) => (await json(await ctx.get(`audit-target/${encodeURIComponent(target)}`))).items,
      createWorkspace: async ({ ownerLoginId, ...rest }) => json(await ctx.post('organizations', { data: { ...rest, owner: { loginId: ownerLoginId } } })),
      failNextAuditWrite: async () => void (await json(await ctx.post('audit/fail-next'))),
      totpFor: async (who) => (await json(await ctx.get(`totp/${id(who)}`))).code,
      userIdOf: async (who) => (await json(await ctx.get(`users/${id(who)}`))).id,
      search: async (text) => json(await ctx.post('search', { data: { text } })),
      rosterIds: async () => json(await ctx.get('roster/ids')),
      seedSyntheticQuran: async (organizationCode = 'ALIF') => json(await ctx.post('quran/seed', { data: { organizationCode } })),
      applyQuranSeed: async (seed, organizationCode = 'ALIF', report) => {
        const res = await ctx.post('quran/seed', { data: { organizationCode, seed, ...(report === undefined ? {} : { report }) } });
        return { status: res.status(), body: (await res.json()) as Record<string, unknown> };
      },
      convertSyntheticQuran: async (options = {}) => (await json(await ctx.post('quran/convert', { data: options }))) as unknown as QuranConversion,
      signQuranDataset: async (seed, report, review) => {
        const res = await ctx.post('quran/sign', { data: { seed, report, review } });
        return { status: res.status(), body: (await res.json()) as Record<string, unknown> };
      },
      registerQuranSource: async (source) => (await json(await ctx.post('quran/sources', { data: source }))) as unknown as { id: string },
      recordQuranLicence: async (sourceId, licence) =>
        (await json(await ctx.post(`quran/sources/${sourceId}/licence`, { data: { licenceName: null, attributionText: null, ...licence } }))) as unknown as { revokedVersions: number },
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
