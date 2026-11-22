// F10 · Portal requests for Students and Parents (contract packages/contracts/src/portal.ts). Online only: nothing is
// stored on the device for these roles (NFR-PORT-005, F10-AC4). Offline these throw ApiFailure NETWORK.
import type { PortalReportListResponse, PortalReportResponse, PortalStudentsResponse } from '@hifz/contracts';
import type { PeriodKind } from '@hifz/domain/reports';

interface Authorized {
  authorized<T>(path: string, init?: { method?: 'GET' | 'POST'; body?: unknown }): Promise<T>;
}

export const fetchPortalStudents = (session: Authorized) => session.authorized<PortalStudentsResponse>('/portal/students');

export function fetchPortalReports(session: Authorized, studentId: string, kind: PeriodKind | null, cursor: string | null) {
  const params = [`studentId=${encodeURIComponent(studentId)}`, ...(kind ? [`kind=${kind}`] : []), ...(cursor ? [`cursor=${encodeURIComponent(cursor)}`] : [])];
  return session.authorized<PortalReportListResponse>(`/portal/reports?${params.join('&')}`);
}

export const fetchPortalReport = (session: Authorized, id: string) => session.authorized<PortalReportResponse>(`/portal/reports/${encodeURIComponent(id)}`);
