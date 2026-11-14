// The sync API as the engine sees it (contracts: packages/contracts/src/sync.ts; plan §5). The HTTP transport goes
// through SessionManager.authorized, so a 401 refreshes the session once and resumes (and ends in the
// session-expired state if that fails). Responses are validated with the shared Zod schemas; an invalid response is
// a temporary failure, never a success.
import {
  ConflictDetail,
  ConflictListResponse,
  PushResponse,
  PullResponse,
  ResolveConflictResponse,
  type PushRequest,
  type ResolveConflictRequest,
} from '@hifz/contracts';
import { ApiFailure } from '../api/client.ts';
import type { SessionManager } from '../auth/session.ts';

export interface SyncTransport {
  push(request: PushRequest): Promise<PushResponse>;
  pull(query: { cursor: string | null; limit: number; protocolVersion: number }): Promise<PullResponse>;
}

export interface ConflictApi {
  listConflicts(page?: number): Promise<ConflictListResponse>;
  getConflict(id: string): Promise<ConflictDetail>;
  resolveConflict(id: string, request: ResolveConflictRequest): Promise<ResolveConflictResponse>;
}

function parse<T>(schema: { safeParse(v: unknown): { success: true; data: T } | { success: false } }, value: unknown): T {
  const result = schema.safeParse(value);
  // 502: the server answered with something this build cannot read; treated as temporary.
  if (!result.success) throw new ApiFailure('INTERNAL', 502);
  return result.data;
}

export function httpSyncApi(session: Pick<SessionManager, 'authorized'>): SyncTransport & ConflictApi {
  return {
    push: async (request) => parse(PushResponse, await session.authorized<unknown>('/sync/push', { body: request, timeoutMs: 60_000 })),
    pull: async ({ cursor, limit, protocolVersion }) => {
      const query = new URLSearchParams({ limit: String(limit), protocolVersion: String(protocolVersion) });
      if (cursor) query.set('cursor', cursor);
      return parse(PullResponse, await session.authorized<unknown>(`/sync/pull?${query.toString()}`, { timeoutMs: 60_000 }));
    },
    listConflicts: async (page = 1) =>
      parse(ConflictListResponse, await session.authorized<unknown>(`/sync/conflicts?status=OPEN&page=${page}`)),
    getConflict: async (id) => parse(ConflictDetail, await session.authorized<unknown>(`/sync/conflicts/${encodeURIComponent(id)}`)),
    resolveConflict: async (id, request) =>
      parse(ResolveConflictResponse, await session.authorized<unknown>(`/sync/conflicts/${encodeURIComponent(id)}/resolve`, { body: request })),
  };
}
