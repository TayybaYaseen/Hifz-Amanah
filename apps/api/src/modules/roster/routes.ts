// Roster HTTP routes (F03). Contract: packages/contracts/src/roster.ts; documented in apps/api/README.md.
// There is deliberately no DELETE route for classes, students, or enrollments: they are deactivated or ended
// (F03 "Done means", FR-STU-004).
import type { FastifyInstance, FastifyRequest } from 'fastify';
import {
  CreateClassRequest,
  CreateStudentRequest,
  EnrollStudentRequest,
  EntryStudentsQuery,
  ListClassesQuery,
  ListStudentsQuery,
  UpdateClassRequest,
  UpdateStudentRequest,
} from '@hifz/contracts';
import { parse } from '../../platform/errors.ts';
import type { Actor } from '../identity/auth-service.ts';
import type { ClassService } from './class-service.ts';
import type { StudentService } from './student-service.ts';

export interface RosterServices {
  authenticate: (request: FastifyRequest) => Promise<Actor>;
  classes: ClassService;
  students: StudentService;
}

const idParam = (request: FastifyRequest) => (request.params as { id: string }).id;

export function registerRosterRoutes(app: FastifyInstance, { authenticate, classes, students }: RosterServices): void {
  // ---------- Classes (US-010) ----------

  app.get('/classes', async (request) => classes.list(await authenticate(request), parse(ListClassesQuery, request.query)));

  app.post('/classes', async (request, reply) => {
    const actor = await authenticate(request);
    return reply.status(201).send(await classes.create(actor, parse(CreateClassRequest, request.body)));
  });

  app.get('/classes/:id', async (request) => classes.get(await authenticate(request), idParam(request)));

  app.patch('/classes/:id', async (request) => {
    const actor = await authenticate(request);
    return classes.update(actor, idParam(request), parse(UpdateClassRequest, request.body));
  });

  app.post('/classes/:id/deactivate', async (request) => classes.deactivate(await authenticate(request), idParam(request)));

  app.post('/classes/:id/reactivate', async (request) => classes.reactivate(await authenticate(request), idParam(request)));

  app.get('/roster/teachers', async (request) => classes.teacherOptions(await authenticate(request)));

  // ---------- Students (US-011) and enrollments (US-012) ----------

  app.get('/students', async (request) => students.list(await authenticate(request), parse(ListStudentsQuery, request.query)));

  app.post('/students', async (request, reply) => {
    const actor = await authenticate(request);
    return reply.status(201).send(await students.create(actor, parse(CreateStudentRequest, request.body)));
  });

  app.get('/students/:id', async (request) => students.get(await authenticate(request), idParam(request)));

  app.patch('/students/:id', async (request) => {
    const actor = await authenticate(request);
    return students.update(actor, idParam(request), parse(UpdateStudentRequest, request.body));
  });

  app.post('/students/:id/deactivate', async (request) => students.deactivate(await authenticate(request), idParam(request)));

  app.post('/students/:id/reactivate', async (request) => students.reactivate(await authenticate(request), idParam(request)));

  app.post('/students/:id/enrollments', async (request) => {
    const actor = await authenticate(request);
    return students.enroll(actor, idParam(request), parse(EnrollStudentRequest, request.body));
  });

  // ---------- Entry pickers (F03-AC4, AC9, AC10; consumed by F04 Bulk Entry and F05 Daily Entry) ----------

  app.get('/entry/classes', async (request) => classes.entryClasses(await authenticate(request)));

  app.get('/entry/classes/:id/students', async (request) => {
    const actor = await authenticate(request);
    return students.entryStudents(actor, idParam(request), parse(EntryStudentsQuery, request.query).date);
  });
}
