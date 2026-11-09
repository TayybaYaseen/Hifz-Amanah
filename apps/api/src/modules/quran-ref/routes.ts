// Quran reference HTTP routes (F06). Contract: packages/contracts/src/quran.ts; documented in apps/api/README.md
// ("Quran reference routes"). Reads: Owner/Admin/Teacher. Edits, review, imports: Owner/Admin. There is no DELETE
// route and no layout editor: page/line data comes only from an approved import (seed.ts).
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { LineCountQuery, ParaParam, SaveParaRequest, SaveSurahRequest, SurahParam } from '@hifz/contracts';
import { parse } from '../../platform/errors.ts';
import type { Actor } from '../identity/auth-service.ts';
import type { QuranMetadataService } from './metadata-service.ts';

export interface QuranServices {
  authenticate: (request: FastifyRequest) => Promise<Actor>;
  quran: QuranMetadataService;
}

export function registerQuranRoutes(app: FastifyInstance, { authenticate, quran }: QuranServices): void {
  app.get('/quran/editions', async (request) => quran.editions(await authenticate(request)));
  app.get('/quran/surahs', async (request) => quran.surahs(await authenticate(request)));
  app.get('/quran/paras', async (request) => quran.paras(await authenticate(request)));
  app.get('/quran/line-count', async (request) => quran.lineCount(await authenticate(request), parse(LineCountQuery, request.query)));

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
