// Homework HTTP routes (F08). Contract: packages/contracts/src/homework.ts; documented in apps/api/README.md
// ("Homework routes"). Drafts, edits, rejection, and confirmation are `homework_assignment` sync operations
// (POST /sync/push), so the app uses one path online and offline. Revision is online only (Owner/Admin, DEC-B17).
// There is no DELETE route: homework is never deleted.
import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { Actor } from '../identity/auth-service.ts';
import type { HomeworkService } from './homework-service.ts';

export interface HomeworkRouteDeps {
  authenticate: (request: FastifyRequest) => Promise<Actor>;
  homework: HomeworkService;
}

export function registerHomeworkRoutes(app: FastifyInstance, { authenticate, homework }: HomeworkRouteDeps): void {
  app.get('/homework/assignments', async (request) => homework.list(await authenticate(request), request.query));
  app.get('/homework/assignments/:id', async (request) => homework.detail(await authenticate(request), (request.params as { id: string }).id));
  app.get('/homework/suggestion', async (request) => homework.suggestion(await authenticate(request), request.query));
  app.post('/homework/assignments/:id/revise', async (request) => homework.revise(await authenticate(request), (request.params as { id: string }).id, request.body));
}
