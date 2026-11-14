// HTTP client for the HifzAmanah API (apps/api/README.md). Plain TypeScript, no React Native imports,
// so it is unit-tested with Vitest. Errors come back as the API's stable codes; the UI localizes them.
import type { ApiError, ErrorCode } from '@hifz/contracts';

/** A failed call. `NETWORK` means no response arrived (offline, timeout, DNS). */
export class ApiFailure extends Error {
  readonly code: ErrorCode | 'NETWORK';
  readonly status: number;
  readonly fields: Record<string, string>;
  /** The whole `error` object of the response, for codes that carry more than fields (F05 MODE_CONFLICTS). */
  readonly details: Readonly<Record<string, unknown>> | null;

  constructor(code: ErrorCode | 'NETWORK', status: number, fields: Record<string, string> = {}, details: Readonly<Record<string, unknown>> | null = null) {
    super(code);
    this.code = code;
    this.status = status;
    this.fields = fields;
    this.details = details;
  }
}

export type Fetch = (input: string, init?: RequestInit) => Promise<Response>;

export interface RequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'PUT';
  body?: unknown;
  /** Bearer access token, when the call needs a session. */
  token?: string | null;
  timeoutMs?: number;
}

export async function request<T>(baseUrl: string, fetchFn: Fetch, path: string, opts: RequestOptions = {}): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), opts.timeoutMs ?? 20_000);
  let response: Response;
  try {
    response = await fetchFn(`${baseUrl}${path}`, {
      method: opts.method ?? (opts.body === undefined ? 'GET' : 'POST'),
      headers: {
        Accept: 'application/json',
        ...(opts.body === undefined ? {} : { 'Content-Type': 'application/json' }),
        ...(opts.token ? { Authorization: `Bearer ${opts.token}` } : {}),
      },
      body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
      signal: controller.signal,
    });
  } catch {
    throw new ApiFailure('NETWORK', 0);
  } finally {
    clearTimeout(timer);
  }
  if (response.status === 204) return undefined as T;
  let payload: unknown = null;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }
  if (!response.ok) {
    const error = (payload as ApiError | null)?.error;
    throw new ApiFailure(error?.code ?? 'INTERNAL', response.status, error?.fields ?? {}, (error as unknown as Record<string, unknown> | undefined) ?? null);
  }
  return payload as T;
}
