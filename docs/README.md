# HifzAmanah documentation

Planning documents for HifzAmanah, an Android-first, offline-capable Hifz management app. No application code exists yet.

| Document | What it holds |
|---|---|
| [00-product-brief.md](00-product-brief.md) | One-page product summary |
| [SRS.md](SRS.md) | Requirements (FR-*/NFR-*), business rules (§9), acceptance tests (§10), finalized decisions (§16), **decision register (§17)**; the §13 gates are closed |
| [decision-log.md](decision-log.md) | Inventory and Q&A history of the 2026-10-30 decision review (69 decisions) |
| [user-stories.md](user-stories.md) | 73 user stories (US-001…US-073) with 197 story acceptance criteria |
| [specs/](specs/README.md) | **One spec per user story** (73 specs in 17 feature folders), with 317 detailed criteria |
| [design.md](design.md) | UI/UX: tokens, components, screens, closed design decisions (§11), story-to-screen map (§13) |
| [ARCHITECTURE.md](ARCHITECTURE.md) | How to build it; stack and ADR-001…013 approved |
| [AGENTS.md](AGENTS.md) | Rules for AI coding agents working in this repository |

**Source of truth when documents disagree:** see [AGENTS.md §2](AGENTS.md).

## Tests written ahead of implementation

- **E2E:** [e2e/README.md](../e2e/README.md).
  - A spec is complete only when `npm run e2e:gate -- US-<nnn>` passes.
- **Unit:** `it.todo` placeholders under `apps/` and `packages/`, run with `npm test`.

## Checks

| Check | Command |
|---|---|
| Specs: one story per spec, no duplicates, verbatim story criteria, requirement IDs, links | `npm run docs:check` |
| Every detailed criterion has an E2E test | `npm run e2e:trace` |
