// F15 · AI provider adapters (ARCHITECTURE.md §12; FR-AI-011, FR-AI-012; DEC-B45).
//
// An adapter turns the minimized payload and the prompt into the provider's JSON answer. It never sees a name, an id,
// a contact, a note, or a key from the database: keys live only in the server environment, read by the adapter itself.
//
// DEFERRED: DEC-B45 — the launch provider is chosen in Phase 7 (FR-AI-012 comparison). Until then the production
// registry is EMPTY: no vendor SDK and no vendor adapter exist, so every madrasa sees "AI provider not set up". The
// StubProvider below is registered only by test builds (NODE_ENV=test with the test-control API).
import type { AiLocale, AiPayload } from '@hifz/domain/analytics';
import type { AiPrompt } from './prompt.ts';

export interface AiUsage {
  inputTokens: number;
  outputTokens: number;
  /** Integer micro-USD. */
  costMicroUsd: number;
}

export interface RecommendOptions {
  locale: AiLocale;
  timeoutMs: number;
  /** Aborted when the gateway's timeout fires; an adapter must stop and reject. */
  signal: AbortSignal;
  prompt: AiPrompt;
}

export interface AiProvider {
  readonly id: string;
  readonly label: string;
  /** Whether the adapter has what it needs (its server-side key). Never exposes the key. */
  configured(): boolean;
  /** One provider call. `output` is untrusted: the gateway validates it. */
  recommend(payload: AiPayload, schema: Record<string, unknown>, options: RecommendOptions): Promise<{ output: unknown; usage: AiUsage }>;
}

/** The integrated adapters. Empty in production until DEC-B45 is decided. */
export class ProviderRegistry {
  private readonly providers = new Map<string, AiProvider>();

  constructor(providers: readonly AiProvider[] = []) {
    for (const p of providers) this.register(p);
  }

  register(provider: AiProvider): void {
    this.providers.set(provider.id, provider);
  }

  get(id: string | null): AiProvider | null {
    return id === null ? null : (this.providers.get(id) ?? null);
  }

  list(): { id: string; label: string }[] {
    return [...this.providers.values()].map((p) => ({ id: p.id, label: p.label }));
  }
}

// ---------- Test stub (registered only in test builds) ----------

export const STUB_MODES = ['ok', 'timeout', 'error', 'invalid-schema', 'uncited-number', 'wrong-language', 'wrong-language-once', 'insufficient'] as const;
export type StubMode = (typeof STUB_MODES)[number];

export const STUB_PROVIDER_ID = 'test-stub';

const TEXT: Record<AiLocale, { days: (n: number) => string; mistakes: (n: number) => string; attended: (n: number) => string; quality: (v: number) => string; suggestion: string; insufficient: string }> = {
  en: {
    days: (n) => `Work was recorded on ${String(n)} days in this period.`,
    mistakes: (n) => `There were ${String(n)} recorded mistakes in this period.`,
    attended: (n) => `The student attended ${String(n)} class days.`,
    quality: (v) => `The average quality score was ${String(v)}, where a lower score is better.`,
    suggestion: 'Review the portions with the most mistakes before new work.',
    insufficient: 'There is not enough data in this period to describe a trend.',
  },
  ur: {
    days: (n) => `اس مدت میں ${String(n)} دن کام ریکارڈ ہوا۔`,
    mistakes: (n) => `اس مدت میں ${String(n)} غلطیاں ریکارڈ ہوئیں۔`,
    attended: (n) => `طالب علم ${String(n)} دن حاضر رہا۔`,
    quality: (v) => `معیار کا اوسط ${String(v)} رہا، کم نمبر بہتر ہے۔`,
    suggestion: 'نیا سبق دینے سے پہلے زیادہ غلطیوں والے حصے دہرائیں۔',
    insufficient: 'اس مدت میں رجحان بتانے کے لیے کافی معلومات نہیں ہیں۔',
  },
  'ur-Latn': {
    days: (n) => `Is muddat mein ${String(n)} din kaam record hua.`,
    mistakes: (n) => `Is muddat mein ${String(n)} ghaltiyan record huin.`,
    attended: (n) => `Talib e ilm ${String(n)} din haazir raha.`,
    quality: (v) => `Mayaar ka ausat ${String(v)} raha, kam number behtar hai.`,
    suggestion: 'Naya sabaq dene se pehle zyada ghaltiyon wale hisse dohrayein.',
    insufficient: 'Is muddat mein rujhan batane ke liye kaafi maloomat nahin hain.',
  },
};

/** A valid answer built only from the payload it received: every stated number is a cited payload metric. */
export function stubAnswer(payload: AiPayload, locale: AiLocale, insufficient = payload.dataInsufficient): Record<string, unknown> {
  const t = TEXT[locale];
  const period = { from: payload.period.from, to: payload.period.to };
  if (insufficient) return { observations: [t.insufficient], suggestions: [], data_insufficient: true, period, cited_metrics: [] };
  const observations = [t.days(payload.recordedDays)];
  const cited: { key: string; value: number }[] = [{ key: 'recordedDays', value: payload.recordedDays }];
  if (payload.mistakes) {
    observations.push(t.mistakes(payload.mistakes.totals.total));
    cited.push({ key: 'mistakes.totals.total', value: payload.mistakes.totals.total });
  }
  if (payload.attendance) {
    observations.push(t.attended(payload.attendance.attended));
    cited.push({ key: 'attendance.attended', value: payload.attendance.attended });
  }
  if (payload.quality?.average !== undefined) {
    observations.push(t.quality(payload.quality.average));
    cited.push({ key: 'quality.average', value: payload.quality.average });
  }
  return { observations, suggestions: [t.suggestion], data_insufficient: false, period, cited_metrics: cited };
}

const otherLocale = (locale: AiLocale): AiLocale => (locale === 'ur' ? 'en' : 'ur');

/**
 * Test-only provider. Its mode, cost, and readiness are set through the test-control API (apps/api/src/testing/control.ts);
 * it records how often it was called and the last payload it received.
 */
export class StubProvider implements AiProvider {
  readonly id = STUB_PROVIDER_ID;
  readonly label = 'Test stub (not a real provider)';
  mode: StubMode = 'ok';
  costMicroUsd = 1000;
  ready = true;
  calls = 0;
  lastPayload: AiPayload | null = null;
  lastPrompt: AiPrompt | null = null;
  /** Overrides the gateway timeout in tests so a timeout does not take 20 s; null = the configured timeout. */
  timeoutMs: number | null = null;

  configured(): boolean {
    return this.ready;
  }

  reset(): void {
    this.mode = 'ok';
    this.costMicroUsd = 1000;
    this.ready = true;
    this.calls = 0;
    this.lastPayload = null;
    this.lastPrompt = null;
    this.timeoutMs = null;
  }

  async recommend(payload: AiPayload, _schema: Record<string, unknown>, options: RecommendOptions): Promise<{ output: unknown; usage: AiUsage }> {
    this.calls += 1;
    this.lastPayload = structuredClone(payload);
    this.lastPrompt = options.prompt;
    const usage: AiUsage = { inputTokens: Math.ceil(JSON.stringify(payload).length / 4), outputTokens: 80, costMicroUsd: this.costMicroUsd };
    switch (this.mode) {
      case 'timeout':
        await new Promise<never>((_resolve, reject) => {
          const abort = () => reject(new Error('aborted'));
          if (options.signal.aborted) abort();
          else options.signal.addEventListener('abort', abort, { once: true });
        });
        throw new Error('unreachable');
      case 'error':
        throw new Error('stub provider error');
      case 'invalid-schema':
        return { output: { observations: 'not a list', extra: true }, usage };
      case 'uncited-number': {
        const answer = stubAnswer(payload, options.locale, false);
        return { output: { ...answer, observations: [...(answer.observations as string[]), `${TEXT.en.mistakes(987654)}`] }, usage };
      }
      case 'wrong-language':
        return { output: stubAnswer(payload, otherLocale(options.locale)), usage };
      case 'wrong-language-once':
        // Wrong on the first call, right once the language is restated (the gateway's single retry).
        return { output: stubAnswer(payload, options.prompt.languageRestated ? options.locale : otherLocale(options.locale)), usage };
      case 'insufficient':
        return { output: stubAnswer(payload, options.locale, true), usage };
      case 'ok':
        return { output: stubAnswer(payload, options.locale), usage };
    }
  }
}
