// Report HTTP routes (F09). Contract: packages/contracts/src/reports.ts; documented in apps/api/README.md ("Report
// routes"). Read-only: reports are derived from source records and have no write route (FR-RPT-001). Staff only in F09;
// the published Student/Parent view is F10's portal (FR-RPT-010). The class summary has a minimal PDF/Excel export (F09-AC20); report templates and other exports are F13 and F14.
import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { Actor } from '../identity/auth-service.ts';
import type { ReportService } from './report-service.ts';

export interface ReportRouteDeps {
  authenticate: (request: FastifyRequest) => Promise<Actor>;
  reports: ReportService;
}

export function registerReportRoutes(app: FastifyInstance, { authenticate, reports }: ReportRouteDeps): void {
  app.get('/reports/student', async (request) => reports.studentReport(await authenticate(request), request.query));
  app.get('/reports/class-summary', async (request) => reports.classSummary(await authenticate(request), request.query));
  // F09-AC20: the class summary as .xlsx or PDF (staff only, audited).
  app.get('/reports/class-summary/export', async (request, reply) => {
    const file = await reports.exportClassSummary(await authenticate(request), request.query);
    return reply.header('content-type', file.contentType).header('content-disposition', `attachment; filename="${file.fileName}"`).header('cache-control', 'no-store').send(file.body);
  });
  app.addHook('onClose', async () => reports.close());
}
