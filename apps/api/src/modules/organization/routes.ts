// Organization HTTP routes (F02). Contract: packages/contracts/src/organization.ts; documented in apps/api/README.md.
// There is deliberately no route that creates a workspace, signs up, or edits or deletes an audit record
// (F02-AC12, AC16): the platform operator creates workspaces (FR-ORG-001), and audit_logs is append-only.
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { ChangeRoleRequest, SetAllClassesRequest, UpdateOrganizationRequest } from '@hifz/contracts';
import { parse } from '../../platform/errors.ts';
import type { Actor } from '../identity/auth-service.ts';
import type { MembershipService } from './membership-service.ts';
import type { OrganizationService } from './organization-service.ts';

export interface OrganizationServices {
  authenticate: (request: FastifyRequest) => Promise<Actor>;
  organization: OrganizationService;
  memberships: MembershipService;
}

const idParam = (request: FastifyRequest) => (request.params as { id: string }).id;

export function registerOrganizationRoutes(app: FastifyInstance, { authenticate, organization, memberships }: OrganizationServices): void {
  // ---------- Workspace settings (US-007) ----------

  app.get('/organization', async (request) => organization.get(await authenticate(request)));

  app.patch('/organization', async (request) => {
    const actor = await authenticate(request);
    return organization.update(actor, parse(UpdateOrganizationRequest, request.body));
  });

  // ---------- Roles and permissions (US-007, US-008) ----------

  app.post('/accounts/:id/role', async (request) => {
    const actor = await authenticate(request);
    return memberships.changeRole(actor, idParam(request), parse(ChangeRoleRequest, request.body).role);
  });

  app.post('/accounts/:id/owner', async (request) => memberships.grantOwner(await authenticate(request), idParam(request)));

  app.post('/accounts/:id/all-classes', async (request) => {
    const actor = await authenticate(request);
    return memberships.setAllClasses(actor, idParam(request), parse(SetAllClassesRequest, request.body).allClasses);
  });
}
