// Calendar HTTP routes (F04). Contract: packages/contracts/src/calendar.ts; documented in apps/api/README.md
// ("Calendar routes"). Attendance writes are not here: they are `attendance_record` sync operations
// (POST /sync/push), so Bulk Entry online and offline is one path. There is no DELETE route: schedules are
// superseded, exceptions cancelled, attendance records changed (audited).
import type { FastifyInstance, FastifyRequest } from 'fastify';
import {
  AttendanceSheetQuery,
  AttendanceSummaryQuery,
  CreateExceptionRequest,
  ExceptionImpactQuery,
  LeaveDecisionRequest,
  ListExceptionsQuery,
  ListLeaveQuery,
  SetScheduleRequest,
} from '@hifz/contracts';
import { parse } from '../../platform/errors.ts';
import type { Actor } from '../identity/auth-service.ts';
import type { AttendanceService } from './attendance-service.ts';
import type { ExceptionService } from './exception-service.ts';
import type { ScheduleService } from './schedule-service.ts';

export interface CalendarServices {
  authenticate: (request: FastifyRequest) => Promise<Actor>;
  schedules: ScheduleService;
  exceptions: ExceptionService;
  attendance: AttendanceService;
}

const idParam = (request: FastifyRequest) => (request.params as { id: string }).id;

export function registerCalendarRoutes(app: FastifyInstance, { authenticate, schedules, exceptions, attendance }: CalendarServices): void {
  // ---------- Timetable (US-013) ----------
  app.get('/classes/:id/schedule', async (request) => schedules.get(await authenticate(request), idParam(request)));
  app.put('/classes/:id/schedule', async (request) => {
    const actor = await authenticate(request);
    return schedules.set(actor, idParam(request), parse(SetScheduleRequest, request.body));
  });

  // ---------- Holidays, closures, no-class days (US-014) ----------
  app.get('/calendar/exceptions', async (request) => exceptions.list(await authenticate(request), parse(ListExceptionsQuery, request.query)));
  app.get('/calendar/exceptions/impact', async (request) => exceptions.impact(await authenticate(request), parse(ExceptionImpactQuery, request.query)));
  app.post('/calendar/exceptions', async (request, reply) => {
    const actor = await authenticate(request);
    return reply.status(201).send(await exceptions.create(actor, parse(CreateExceptionRequest, request.body)));
  });
  app.post('/calendar/exceptions/:id/cancel', async (request) => exceptions.cancel(await authenticate(request), idParam(request)));

  // ---------- Attendance reads (US-015) ----------
  app.get('/attendance/sheet', async (request) => attendance.sheet(await authenticate(request), parse(AttendanceSheetQuery, request.query)));
  app.get('/attendance/summary', async (request) => attendance.summary(await authenticate(request), parse(AttendanceSummaryQuery, request.query)));

  // ---------- Leave approvals (US-017, Owner/Admin, online only) ----------
  app.get('/attendance/leave', async (request) => attendance.leaveList(await authenticate(request), parse(ListLeaveQuery, request.query)));
  app.post('/attendance/:id/leave-decision', async (request) => {
    const actor = await authenticate(request);
    return attendance.decide(actor, idParam(request), parse(LeaveDecisionRequest, request.body));
  });
}
