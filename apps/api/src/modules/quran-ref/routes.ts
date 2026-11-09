// Quran reference HTTP routes (F06). Contract: packages/contracts/src/quran.ts and quran-reference.ts; documented in
// apps/api/README.md ("Quran reference routes"). Reads: Owner/Admin/Teacher. Edits, review, imports: Owner/Admin.
// There is no DELETE route and no layout editor: page/line data comes only from an approved import (seed.ts).
//
// The reference snapshot (ADR-018): `GET /quran/reference/version` (cheap check, with revocation status) and
// `GET /quran/reference/snapshot` (the canonical body, ETag = referenceVersion, 304 on If-None-Match).
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { LineCountQuery, ParaParam, REFERENCE_VERSION_HEADER, ReferenceSnapshotQuery, ReferenceVersionQuery, SaveParaRequest, SaveSurahRequest, SurahParam } from '@hifz/contracts';
import { parse } from '../../platform/errors.ts';
import type { Actor } from '../identity/auth-service.ts';
import type { QuranMetadataService } from './metadata-service.ts';
import type { QuranReferenceService } from './reference-service.ts';

export interface QuranServices {
  authenticate: (request: FastifyRequest) => Promise<Actor>;
  quran: QuranMetadataService;
  reference: QuranReferenceService;
}

export function registerQuranRoutes(app: FastifyInstance, { authenticate, quran, reference }: QuranServices): void {
  app.get('/quran/editions', async (request) => quran.editions(await authenticate(request)));
  app.get('/quran/surahs', async (request) => quran.surahs(await authenticate(request)));
  app.get('/quran/paras', async (request) => quran.paras(await authenticate(request)));
  app.get('/quran/line-count', async (request) => quran.lineCount(await authenticate(request), parse(LineCountQuery, request.query)));

  app.get('/quran/reference/version', async (request, reply) => {
    const actor = await authenticate(request);
    const body = await reference.version(actor, parse(ReferenceVersionQuery, request.query));
    void reply.header('cache-control', 'private, no-store');
    return body;
  });
  app.get('/quran/reference/snapshot', async (request, reply) => {
    const actor = await authenticate(request);
    const query = parse(ReferenceSnapshotQuery, request.query);
    const ifNoneMatch = typeof request.headers['if-none-match'] === 'string' ? request.headers['if-none-match'] : undefined;
    const result = await reference.snapshot(actor, query, ifNoneMatch);
    const version = result.status === 304 ? result.referenceVersion : result.snapshot.referenceVersion;
    void reply.header('etag', `"${version}"`).header(REFERENCE_VERSION_HEADER, version).header('cache-control', 'private, no-store');
    if (result.status === 304) return reply.code(304).send();
    // The exact canonical bytes: the device hashes them before activating the snapshot.
    return reply.type('application/json; charset=utf-8').send(result.snapshot.body);
  });

  app.put('/quran/surahs/:number', async (request) => {
    const actor = await authenticate(request);
    return quran.saveSurah(actor, parse(SurahParam, request.params).number, parse(SaveSurahRequest, request.body));
  });
  app.put('/quran/paras/:number', async (request) => {
    const actor = await authenticate(request);
    return quran.savePara(actor, parse(ParaParam, request.params).number, parse(SaveParaRequest, request.body));
  });
  app.get('/quran/review', async (request) => quran.review(await authenticate(request)));
  app.get('/quran/imports', async (request) => quran.imports(await authenticate(request)));
}
