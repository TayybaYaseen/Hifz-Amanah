// Hifz HTTP routes (F05). Contract: packages/contracts/src/hifz.ts; documented in apps/api/README.md ("Daily Hifz
// routes"). Writes are not here: daily records, portions, and attempts are `daily_record`, `lesson_portion`, and
// `portion_attempt` sync operations (POST /sync/push), so Daily Entry online and offline is one path. There is no
// DELETE route: a portion is removed through sync (row and attempts kept), records and attempts are corrected.
import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { Actor } from '../identity/auth-service.ts';
import type { DailyRecordService } from './daily-record-service.ts';

export interface HifzServices {
  authenticate: (request: FastifyRequest) => Promise<Actor>;
  records: DailyRecordService;
}

export function registerHifzRoutes(app: FastifyInstance, { authenticate, records }: HifzServices): void {
  app.get('/hifz/daily-records', async (request) => records.list(await authenticate(request), request.query));
  app.get('/hifz/daily-records/:id', async (request) => records.detail(await authenticate(request), (request.params as { id: string }).id));

  // The madrasa's daily-report mode (US-019): Owner/Admin only.
  app.put('/organization/daily-report-mode', async (request) => records.setMode(await authenticate(request), request.body));
}
