# ADR-019 — Database access layer: Kysely on the server, a small SQL driver on the device

- **Status:** Accepted 2026-11-12 (SRS §17 DEC-B85). It records what was built and replaces "Drizzle" in the approved stack. It is the ADR that
  [ARCHITECTURE.md](../ARCHITECTURE.md) §3 says records the DB access choice.
- **Requirements:** NFR-MNT-002 (versioned migrations), NFR-OFF-002 (one-transaction save path), FR-SEC-008 (tenant
  isolation), SRS §17 DEC-B51 (approved stack).
- **Code:** `apps/api/src/platform/db.ts`, `apps/api/src/platform/migrate.ts`, `apps/api/src/platform/migrate-cli.ts`,
  `apps/api/migrations/0001_identity.sql` … `0012_hifz.sql`, `apps/api/src/platform/embedded-postgres.ts`,
  `apps/api/src/platform/tenant.ts`, `apps/mobile/src/local-db/driver.ts`,
  `apps/mobile/src/local-db/migrations.ts`, `apps/mobile/src/testing/nodeDriver.ts`.

## Context

- ARCHITECTURE.md §3 (container table, "DB access") says: "Drizzle ORM or Kysely over `pg`, with SQL migrations in
  version control. Approved (the one chosen at scaffolding is recorded in an ADR; versioned migrations Decided,
  NFR-MNT-002)." No such ADR existed until now.
- ARCHITECTURE.md §3 (container table, "Local DB") says: "`expo-sqlite` + a typed query layer (e.g. Drizzle ORM for
  SQLite) with versioned local migrations. Approved."
- `docs/AGENTS.md` §3 lists Mobile as "expo-sqlite + Drizzle" and API as "Drizzle/Kysely", approved under SRS DEC-B51,
  and says changes need a new ADR.
- The code was built differently on the mobile side: Drizzle is not a dependency anywhere in the repository.

## Decision

### Server (within the approved option)

1. **Kysely over `pg` (node-postgres).** `apps/api/src/platform/db.ts` is headed "Kysely over node-postgres;
   parameterized SQL only (ARCHITECTURE.md §7.5)". Kysely ^0.29 was introduced with F01 (commit 81f0279). This is one
   of the two options ARCHITECTURE.md §3 and AGENTS.md §3 already approve; it is not a change to the approved stack.
2. **Migrations are plain, numbered SQL files** in `apps/api/migrations/` (`0001_identity.sql` … `0012_hifz.sql`),
   applied in order by `apps/api/src/platform/migrate.ts`, run with `npm run db:migrate` (`migrate-cli.ts`).
3. **Development and tests use embedded Postgres** (`apps/api/src/platform/embedded-postgres.ts`), so integration
   tests run against a real Postgres engine without external setup.
4. **Row-level security** stays as set by ADR-016 (`apps/api/src/platform/tenant.ts`); the access layer does not
   replace it.

### Mobile (replaces "Drizzle" in the approved stack)

1. **No ORM.** The app uses `expo-sqlite` (~16.0) behind a small typed SQL driver interface,
   `apps/mobile/src/local-db/driver.ts`. This replaces the earlier "expo-sqlite + Drizzle" entry in AGENTS.md §3 and
   the "typed query layer (e.g. Drizzle ORM for SQLite)" wording of the ARCHITECTURE.md "Local DB" row; both were
   updated when this ADR was accepted (DEC-B85).
2. **One serialized queue.** Every driver call goes through one queue, and a transaction holds the queue for its
   whole callback. The driver header gives the reason: expo-sqlite's `withTransactionAsync` does not guarantee that
   no other query slips into a transaction. Inside the callback the code uses the `tx` argument.
3. **Unit tests use Node's built-in `node:sqlite`** (`testing/nodeDriver.ts`) behind the same interface, so outbox,
   engine, migration, and retention logic is tested without a device.
4. **Versioned, append-only local migrations** are in `apps/mobile/src/local-db/migrations.ts`. The outbox is never
   rewritten (AGENTS.md §7: local migrations keep the outbox intact).

## Why

Only reasons visible in the files cited above:

- **Server:** parameterized SQL only (db.ts header), plain SQL migrations kept in version control (NFR-MNT-002), and
  RLS and per-transaction settings (ADR-016) are written in SQL, which Kysely and plain `.sql` migrations leave
  directly visible.
- **Mobile:** the save path needs the entity write and the outbox insert in one SQLite transaction (NFR-OFF-002), and
  the driver's own serialized queue is what guarantees that. A thin interface over `expo-sqlite` also lets the same
  code run on `node:sqlite` in unit tests.

No benchmark or comparison was run, and none is claimed.

## Consequences

- The server follows the approved option, so the server choice needs no stack change.
- The mobile choice is a **deviation from AGENTS.md §3**. AGENTS.md and the "Local DB" row of ARCHITECTURE.md §3 are
  **not** edited by this ADR; they change only after the user approves it.
- Mobile queries are hand-written SQL strings with typed results from the driver interface. There is no schema-derived
  type generation on the device; the local schema lives in `migrations.ts`.
- New mobile tables need an append-only migration and must keep pending outbox operations intact; the migration tests
  cover this.
- Any further change to either access layer needs a new ADR.

## Alternatives

- **Drizzle ORM (server and mobile).** Approved in AGENTS.md §3 and ARCHITECTURE.md as an option. Not adopted: it is
  not a dependency anywhere in the repository. On the server, Kysely is the other approved option. On mobile, the
  repository instead uses the driver above. If the user prefers Drizzle for mobile, the driver would stay as the
  transaction and queue layer or be replaced; that rework has not been estimated.
- **expo-sqlite's own `withTransactionAsync` directly.** Not used because of the serialization gap noted in the driver
  header.
