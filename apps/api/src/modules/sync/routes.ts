// Sync routes (F12 plan §5). Teacher, Admin, Owner only; the organization comes from the membership.
// Request bodies are never logged (app.ts), so operation fields and note bodies never reach the logs.
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { SYNC_LIMITS } from '@hifz/contracts';
import { AppError, body } from '../../platform/errors.ts';
import type { Actor } from '../identity/auth-service.ts';
import type { ConflictService } from './conflict-service.ts';
import type { SyncControl } from './control-state.ts';
import { requireSyncRole, type SyncService } from './sync-service.ts';

export interface SyncRouteDeps {
  authenticate: (request: FastifyRequest) => Promise<Actor>;
  sync: SyncService;
  conflicts: ConflictService;
  control: SyncControl;
}

/** Room for a full batch of operations; other routes keep the 64 KB default. */
const PUSH_BODY_LIMIT = SYNC_LIMITS.maxPushOps * 16 * 1024;

export function registerSyncRoutes(app: FastifyInstance, { authenticate, sync, conflicts, control }: SyncRouteDeps): void {
  /** Test control can make the next push/pull fail temporarily (F12-AC6); never armed in production. */
  const injectedFailure = (actor: Actor, reply: FastifyReply): FastifyReply | null => {
    requireSyncRole(actor);
    const status = control.takeFailure();
    return status === null ? null : reply.status(status).send(body(new AppError('INTERNAL')));
  };
  const idParam = (request: FastifyRequest) => (request.params as { id: string }).id;

  app.post('/sync/push', { bodyLimit: PUSH_BODY_LIMIT }, async (request, reply) => {
    const actor = await authenticate(request);
    return injectedFailure(actor, reply) ?? sync.push(actor, request.body);
  });

  app.get('/sync/pull', async (request, reply) => {
    const actor = await authenticate(request);
    return injectedFailure(actor, reply) ?? sync.pull(actor, request.query);
  });

  app.get('/sync/conflicts', async (request) => conflicts.list(await authenticate(request), request.query));
  app.get('/sync/conflicts/:id', async (request) => conflicts.detail(await authenticate(request), idParam(request)));
  app.post('/sync/conflicts/:id/resolve', async (request) => conflicts.resolve(await authenticate(request), idParam(request), request.body));
}
