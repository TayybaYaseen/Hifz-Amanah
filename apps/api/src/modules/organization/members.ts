// Membership queries the organization invariants need (FR-ORG-007). Other modules call these instead of
// reading the memberships table themselves (ARCHITECTURE.md §5).
import type { Executor } from '../../platform/db.ts';
import type { MemberRole } from '../access/policy.ts';

/**
 * The madrasa's active Owners and Admins (members whose account is active too), locked for the rest of the
 * transaction so two concurrent changes cannot both remove "the other" last Admin.
 */
export async function activeMemberRoles(db: Executor, organizationId: string): Promise<MemberRole[]> {
  const rows = await db
    .selectFrom('memberships')
    .innerJoin('users', 'users.id', 'memberships.user_id')
    .select(['memberships.user_id', 'memberships.role'])
    .where('memberships.organization_id', '=', organizationId)
    .where('memberships.status', '=', 'ACTIVE')
    .where('memberships.role', 'in', ['OWNER', 'ADMIN'])
    .where('users.status', '=', 'ACTIVE')
    .forUpdate()
    .execute();
  return rows.map((r) => ({ userId: r.user_id, role: r.role }));
}
