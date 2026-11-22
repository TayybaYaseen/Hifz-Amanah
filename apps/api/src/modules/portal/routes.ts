// Portal HTTP routes (F10). Contract: packages/contracts/src/portal.ts; documented in apps/api/README.md ("Portal
// routes"). Students and Parents only, online and read-only: GET routes and nothing else (F10-AC1). Responses are never
// cached (NFR-PORT-005: no offline report caching for Students and Parents; F10 edge case "shared device").
import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { Actor } from '../identity/auth-service.ts';
import type { PortalService } from './portal-service.ts';

export interface PortalRouteDeps {
  authenticate: (request: FastifyRequest) => Promise<Actor>;
  portal: PortalService;
}

export function registerPortalRoutes(app: FastifyInstance, { authenticate, portal }: PortalRouteDeps): void {
  app.register(async (scope) => {
    scope.addHook('onSend', async (_request, reply) => {
      reply.header('cache-control', 'no-store');
    });
    scope.get('/portal/students', async (request) => portal.students(await authenticate(request)));
    scope.get('/portal/reports', async (request) => portal.reports(await authenticate(request), request.query));
    scope.get('/portal/reports/:id', async (request) => portal.report(await authenticate(request), (request.params as { id: string }).id));
  });
}
