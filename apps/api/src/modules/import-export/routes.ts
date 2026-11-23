// Excel import/export HTTP routes (F14; US-058…061). Contract: packages/contracts/src/import-export.ts; documented in
// apps/api/README.md ("Import and export routes"). Online only (out of scope offline, F14). Staff only: the services
// check the role and scope of every call against the signed-in membership; nothing is taken from the workbook.
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { IMPORT_FILE_MAX_BYTES, IMPORT_TEMPLATES, TEMPLATE_VERSIONS, XLSX_CONTENT_TYPE, type ImportTemplate } from '@hifz/contracts';
import { AppError } from '../../platform/errors.ts';
import type { Actor } from '../identity/auth-service.ts';
import type { ExportFile, ExportService } from './export-service.ts';
import type { ImportService } from './import-service.ts';
import { localeOf } from './messages.ts';
import { blankTemplate } from './templates.ts';

export interface ImportExportRouteDeps {
  authenticate: (request: FastifyRequest) => Promise<Actor>;
  imports: ImportService;
  exports: ExportService;
}

const language = (request: FastifyRequest): string | undefined => request.headers['accept-language'];
const idOf = (request: FastifyRequest): string => (request.params as { id: string }).id;

const sendFile = (reply: FastifyReply, file: ExportFile) =>
  reply
    .header('content-type', XLSX_CONTENT_TYPE)
    .header('content-disposition', `attachment; filename="${file.fileName}"`)
    // Generated files are not cached anywhere (NFR-PRV-005 keeps them at most 24 hours; these are streamed only).
    .header('cache-control', 'no-store')
    .send(file.body);

export function registerImportExportRoutes(app: FastifyInstance, { authenticate, imports, exports }: ImportExportRouteDeps): void {
  // The workbook bytes are the request body (no multipart): .xlsx only, at most 5 MB.
  for (const type of [XLSX_CONTENT_TYPE, 'application/octet-stream']) {
    app.addContentTypeParser(type, { parseAs: 'buffer', bodyLimit: IMPORT_FILE_MAX_BYTES }, (_request, body, done) => done(null, body));
  }

  app.post('/imports', { bodyLimit: IMPORT_FILE_MAX_BYTES }, async (request, reply) => {
    const actor = await authenticate(request);
    if (!Buffer.isBuffer(request.body)) throw new AppError('VALIDATION', { file: 'REQUIRED' });
    const job = await imports.upload(actor, request.query, request.body, language(request));
    return reply.status(201).send(job);
  });
  app.get('/imports/templates/:template', async (request, reply) => {
    const actor = await authenticate(request);
    const template = (request.params as { template: string }).template;
    if (!(IMPORT_TEMPLATES as readonly string[]).includes(template)) throw new AppError('NOT_FOUND');
    imports.templateFor(actor, template as ImportTemplate);
    const locale = localeOf((request.query as { locale?: 'en' | 'ur' | 'ur-Latn' }).locale, language(request));
    const body = await blankTemplate(template as ImportTemplate, locale);
    return sendFile(reply, { body, fileName: `${template}-v${TEMPLATE_VERSIONS[template as ImportTemplate]}.xlsx` });
  });
  app.get('/imports/:id', async (request) => imports.get(await authenticate(request), idOf(request), request.query, language(request)));
  app.get('/imports/:id/rows', async (request) => imports.rows(await authenticate(request), idOf(request), request.query, language(request)));
  app.put('/imports/:id/mode', async (request) => imports.setMode(await authenticate(request), idOf(request), request.body, request.query, language(request)));
  app.post('/imports/:id/confirm', async (request) => imports.confirm(await authenticate(request), idOf(request), request.body, request.query, language(request)));

  app.get('/exports/students', async (request, reply) => sendFile(reply, await exports.students(await authenticate(request), request.query, language(request))));
  app.get('/exports/daily-records', async (request, reply) => sendFile(reply, await exports.dailyRecords(await authenticate(request), request.query, language(request))));
  app.get('/exports/report', async (request, reply) => sendFile(reply, await exports.report(await authenticate(request), request.query, language(request))));
}
