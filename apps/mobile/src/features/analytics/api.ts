// F15 · Online analytics and AI requests (contract packages/contracts/src/analytics.ts). Staff only; the server checks
// role and scope on every call and refuses Students and Parents (F15-AC9). Offline these throw ApiFailure NETWORK and
// the Analytics screen builds provisional figures on the device; the AI request is never sent offline (F15-AC5).
import type { AiLocale, AiRecommendationResponse, AiSettingsResponse, StudentAnalyticsResponse, UpdateAiSettingsRequest } from '@hifz/contracts';
import type { PeriodKind } from '@hifz/domain/reports';
import { AI_TIMEOUT_MS, aiRequestBody } from './view.ts';

interface Authorized {
  authorized<T>(path: string, init?: { method?: 'GET' | 'POST' | 'PUT'; body?: unknown; timeoutMs?: number }): Promise<T>;
}

export const fetchAnalytics = (session: Authorized, studentId: string, kind: PeriodKind, date: string) =>
  session.authorized<StudentAnalyticsResponse>(`/analytics/${studentId}?kind=${kind}&date=${date}`);

/** Carries the UI locale (F15-AC17); gives up after AI_TIMEOUT_MS ("AI unavailable — try again later", F15-AC6). */
export const requestAiRecommendation = (session: Authorized, studentId: string, kind: PeriodKind, date: string, locale: AiLocale) =>
  session.authorized<AiRecommendationResponse>(`/analytics/${studentId}/ai-recommendation`, { method: 'POST', body: aiRequestBody(kind, date, locale), timeoutMs: AI_TIMEOUT_MS });

export const fetchAiSettings = (session: Authorized) => session.authorized<AiSettingsResponse>('/analytics/ai-settings');

export const saveAiSettings = (session: Authorized, body: UpdateAiSettingsRequest) =>
  session.authorized<AiSettingsResponse>('/analytics/ai-settings', { method: 'PUT', body });
