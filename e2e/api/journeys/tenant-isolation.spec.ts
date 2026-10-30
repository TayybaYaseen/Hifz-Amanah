// App-wide: tenant isolation and role scope across every protected endpoint.
// SRS §10.5 AC-SEC-01…03, AC-SEC-05; AGENTS.md §6.
// Every new endpoint must be added to the route inventory this sweep iterates.
import { test } from '../support/fixtures';

test.describe('APP · Tenant isolation and scope sweep', { tag: '@APP' }, () => {
  test.fixme('APP-SEC-01 (AC-SEC-01) every by-ID endpoint returns identical not found for another madrasa ID', async () => {
    // For each route in the inventory: as teacher.a1 call with a Madrasa B ID and with a random ID;
    // status and body are identical.
  });

  test.fixme('APP-SEC-02 (AC-SEC-02) every student-scoped endpoint hides unassigned students from a Teacher', async () => {
    // For each student-scoped route: as teacher.a1 use S3 → not found; S1 → ok.
  });

  test.fixme('APP-SEC-03 (AC-SEC-03) every Parent-reachable endpoint allows only verified, non-revoked links', async () => {
    // As parent.p1: S1 ok; S3 not found. As parent.p2: S3 (revoked) refused.
  });

  test.fixme('APP-SEC-04 every write endpoint ignores client-sent organization_id and role', async () => {
    // For each write route: inject organization_id = B and role = OWNER; result is scoped to the membership.
  });

  test.fixme('APP-SEC-05 (AC-SEC-05) a removed member is refused on every endpoint', async () => {
    // Remove teacher.a2; every route → refused; earlier audit records remain.
  });

  test.fixme('APP-SEC-06 the route inventory matches the server route table', async () => {
    // Compare the sweep inventory with the routes the API exposes; fail if any route is missing from the sweep.
  });
});
