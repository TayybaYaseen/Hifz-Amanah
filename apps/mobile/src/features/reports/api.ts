// F09 · Online report requests (contract packages/contracts/src/reports.ts). The server's report is authoritative
// (NFR-OFF-008); offline these throw ApiFailure NETWORK and the screen builds a provisional report on the device.
import type { ClassSummaryResponse, StudentReportResponse } from '@hifz/contracts';
import type { PeriodKind } from '@hifz/domain/reports';

interface Authorized {
  authorized<T>(path: string, init?: { method?: 'GET' | 'POST'; body?: unknown }): Promise<T>;
}

export const fetchStudentReport = (session: Authorized, studentId: string, kind: PeriodKind, date: string) =>
  session.authorized<StudentReportResponse>(`/reports/student?studentId=${studentId}&kind=${kind}&date=${date}`);

export const fetchClassSummary = (session: Authorized, classId: string, kind: PeriodKind, date: string) =>
  session.authorized<ClassSummaryResponse>(`/reports/class-summary?classId=${classId}&kind=${kind}&date=${date}`);
