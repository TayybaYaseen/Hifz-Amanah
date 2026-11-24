// Analytics and AI HTTP routes (F15). Contract: packages/contracts/src/analytics.ts. Staff only; Students and Parents
// get 403 on every route (F15-AC9). The organization always comes from the authenticated membership.
import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { Actor } from '../identity/auth-service.ts';
import type { AnalyticsService } from './analytics-service.ts';

export interface AnalyticsRouteDeps {
  authenticate: (request: FastifyRequest) => Promise<Actor>;
  analytics: AnalyticsService;
}

const studentIdOf = (request: FastifyRequest): string => String((request.params as { studentId?: unknown }).studentId ?? '');

export function registerAnalyticsRoutes(app: FastifyInstance, { authenticate, analytics }: AnalyticsRouteDeps): void {
  // Owner/Admin: AI on/off, provider, limits, data categories (F15-AC10, AC16). Registered before /:studentId.
  app.get('/analytics/ai-settings', async (request) => analytics.getSettings(await authenticate(request)));
  app.put('/analytics/ai-settings', async (request) => analytics.updateSettings(await authenticate(request), request.body));
  // Deterministic analytics from source records (F15-AC1), with the AI button state.
  app.get('/analytics/:studentId', async (request) => analytics.analytics(await authenticate(request), studentIdOf(request), request.query));
  // AI recommendation (F15-AC4…AC8, AC12…AC17): advisory, online only, never writes records.
  app.post('/analytics/:studentId/ai-recommendation', async (request) => analytics.recommend(await authenticate(request), studentIdOf(request), request.body));
}
