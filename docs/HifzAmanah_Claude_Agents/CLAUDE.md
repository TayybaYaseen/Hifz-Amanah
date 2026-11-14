# HifzAmanah — Master Project Instructions

## Source of truth
Read and follow, in priority order (highest wins; same order as `docs/AGENTS.md` §2):
1. `SRS.md` §17 (decision register) and §16 (consolidated finalized decisions).
2. `SRS.md` body — functional requirements, §9 business rules, §10 acceptance criteria.
3. `user-stories.md` — US-001…US-073.
4. `ARCHITECTURE.md` — architecture, data boundaries, security and operating policies (ADR-001…014).
5. `design.md` — UI/UX, tokens, components, screens.
6. `docs/specs/` — one spec per story, in implementation order; criteria `F<nn>-AC<k>`.
7. `docs/AGENTS.md`, this file, and `agents/*.md` — implementation workflow and role guardrails.

`OPEN_DECISIONS.md` summarizes what is still open (DEC-B45 and product-owner actions); it is a summary of SRS §17, not a separate authority. `IMPLEMENTATION_PLAN.md` gives the phase order, which follows the spec order.

If documents conflict, or a needed decision is missing or Deferred, stop and report it with exact sections. Do not silently rewrite requirements. Preserve the product's terminology: Sabaq, Sabqi, Manzil, Para/Juz, portion, attempt, assignment, suggestion, confirmed homework.

## Project baseline
- Android-first React Native/Expo app.
- Node.js API, PostgreSQL server database, SQLite local persistence for offline teacher workflows.
- English, Urdu script, Roman Urdu. English and Roman Urdu are LTR; Urdu is RTL. Quranic Arabic must remain intact.
- Offline teacher entry and durable sync; online read-only student/verified guardian access.
- Individual teacher and madrasa workspaces with strict tenant isolation.
- AI recommendations are online-only, advisory, teacher-reviewed, and cannot mutate authoritative data.
- Excel import/export is validated, previewed, permission-filtered, auditable, and safe against formula injection.

## Required workflow
1. Inspect repository and current implementation before editing.
2. Identify phase, requirements/IDs, dependencies, affected files, risks, and tests.
3. If a task depends on an unresolved decision, ask the user or implement only decision-independent scaffolding. Do not guess.
4. Agree on API/data contracts before parallel backend/frontend work.
5. Make small, reviewable changes. Do not rewrite unrelated files.
6. Run relevant tests, type checks, lint, and build when available. Never claim a command passed unless it was actually run.
7. Report changed files, behavior, tests run/results, known limitations, and next step.

## Hard guardrails — must never be bypassed
### Data and domain
- Never use floating-point arithmetic for exact Para fractions. Use rational numerator/denominator or another exact representation.
- Salasah is exactly 3/4 Para; Rubu is 1/4; Half is 1/2; Complete is 1.
- Never add or compare incompatible units (Para fractions, lines, Ayat, pages). There is no unit conversion (ADR-005, ADR-014).
- Remaining quantity for same portion and compatible unit is `max(0, assigned - completed)`.
- Do not allow completed quantity to exceed assigned quantity. Extra work is recorded as a separate Extra portion (FR-QTY-006, DEC-B23).
- Missing mistake/quality data is unknown, not zero.
- Absence is distinct from poor recitation. `ABSENT`, `NOT_ASSIGNED`, and `PENDING` are not failed recitations.
- Repeated attempts must preserve history and must not double-count assigned work in aggregates.
- Reports are derived from authoritative source records; do not create independently editable totals.
- Suggestions are drafts. Only explicit authorized teacher confirmation finalizes homework.
- Source corrections recalculate reports and unconfirmed suggestions; never silently alter confirmed homework.
- Preserve historical records on deactivation, membership removal, or correction; audit meaningful changes.

### Security and privacy
- Enforce authorization server-side on every protected operation and every organization-owned record.
- Tenant scope comes from authenticated membership, never from an untrusted request/workbook organization ID.
- Prevent IDOR/BOLA: never trust client-supplied IDs, roles, visibility, or totals without server validation.
- Teachers are limited to assigned classes/students unless explicit permission says otherwise.
- Guardians require verified links; contact details alone grant no access.
- Internal-only notes must never leak through APIs, app payloads, logs, exports, PDFs, or AI requests.
- Keep secrets out of source control, logs, mobile bundles, and client configuration.
- Use least privilege, input validation, safe error messages, rate limits where appropriate, and HTTPS in production.
- Use synthetic/anonymized student data in tests and demos.

### Offline and sync
- A successful offline save means durable transactional local persistence, not server sync.
- Use stable client-generated IDs, durable outbox operations, idempotency, dependency ordering, acknowledgements, retry/backoff, and protocol versioning.
- Never silently last-write-wins for meaningful recitation, attendance, or confirmed-homework data.
- Conflicts preserve both versions and require explicit authorized resolution unless a documented safe merge applies.
- Pending changes must survive restart and local database migrations.
- Show local/pending/syncing/synced/failed/conflict states accurately; offline reports are provisional and show last sync.

### AI and imports
- AI is not the authority for quantity math, report totals, grades, access/discipline decisions, or homework confirmation.
- AI receives only minimized, authorized structured metrics; no raw workbook, contact data, or teacher notes in the initial flow.
- Validate AI output, ground it in supplied metrics/date ranges, label insufficient data, and provide timeout/budget/rate-limit/fallback behavior.
- AI failure must not block entry, reports, or sync.
- Excel content is data only: never execute macros or formulas. Validate template/version/columns/types/enums/limits; preview before writes; default add-only; no name-only matching; safe retry and audit.
- Protect exported user text from spreadsheet formula injection.

## Engineering guardrails
- Centralize domain rules in reusable services; do not duplicate rules in UI/API handlers.
- Version database changes with migrations. Never make destructive schema changes without a migration and recovery plan.
- Use canonical language-neutral enum values; localize labels only.
- Avoid unnecessary dependencies and speculative abstractions.
- Keep API contracts documented and shared with frontend.
- Add regression tests for every bug fix and tests for each requirement implemented.
- Do not mark a phase complete until acceptance criteria and relevant security tests pass.
- Do not deploy, spend money, provision services, send messages, or use real student data without explicit user approval.

## Agent collaboration
- Master agent owns task decomposition and integration, not unilateral product decisions.
- Backend owns API/domain/data contracts; frontend consumes approved contracts.
- UI/UX provides flows/specs; frontend implements them.
- Code Review is independent and must report blockers, not silently fix them unless asked.
- Testing verifies requirements and reports actual test results.
- Documentation records decisions and how to reproduce the implementation.
- If parallel agents are unavailable, execute these roles sequentially.
