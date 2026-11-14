# HifzAmanah — Claude Code Agent Pack

This pack contains implementation instructions for Claude Code. It is based on the current planning baseline:

- `SRS.md` v1.12 (2026-11-01), with the decision register in §17
- `ARCHITECTURE.md` v1.2 (2026-11-01), ADR-001…014
- `user-stories.md` v1.4 (73 stories, 17 epics)
- `design.md` v1.7
- `docs/specs/`: one spec per user story, named in implementation order

## Files
- `CLAUDE.md`: project-wide master instructions and hard guardrails.
- `agents/master-agent.md`: orchestration and implementation workflow.
- `agents/database-agent.md`: PostgreSQL and SQLite schema, migrations, constraints, indexes, row-level security, query plans.
- `agents/backend-agent.md`: Node.js API, services and queries, auth, domain services.
- `agents/frontend-agent.md`: React Native/Expo app integration, state and data flow.
- `agents/ui-ux-agent.md`: UX, screen specifications, accessibility, localization.
- `agents/code-review-agent.md`: independent code and security review.
- `agents/testing-agent.md`: test strategy, automation, acceptance criteria.
- `agents/documentation-agent.md`: docs, decisions, setup, API and release documentation.
- `agents/security-agent.md`: authentication, authorization, tenant isolation, privacy, secure sync, audit, secrets, and security tests.
- `IMPLEMENTATION_PLAN.md`: phases and gates, following the spec order `01`–`17`.
- `OPEN_DECISIONS.md`: what is still open (Deferred decisions and product-owner actions), and where each former open item was decided.

Each role is registered with Claude Code by a thin wrapper in `.claude/agents/<role>.md` that points back to the role file here (the role file stays the single source of truth). The `/dal <task>` command (`.claude/skills/dal/SKILL.md`) runs the Master Agent role in the main session, which delegates to the specialist subagents directly (Claude Code subagents cannot launch other subagents). The `master-agent` subagent type remains for planning-only use.

## Source of truth (highest wins)
1. `SRS.md` §17 (decision register) and §16 (consolidated finalized decisions)
2. `SRS.md` body
3. `user-stories.md`
4. `ARCHITECTURE.md`
5. `design.md`
6. `docs/specs/`
7. `docs/AGENTS.md` and this pack

If documents conflict, or a needed decision is missing or Deferred, stop and ask the user.

## How to use
1. The pack lives in `docs/HifzAmanah_Claude_Agents/`. The repository root `CLAUDE.md` loads `docs/AGENTS.md`; point Claude Code at this pack when you want the agent roles.
2. Start Claude Code in the repository root and ask it to read `docs/AGENTS.md`, `SRS.md`, `ARCHITECTURE.md`, `docs/specs/README.md`, and this pack's `IMPLEMENTATION_PLAN.md`.
3. Work one feature at a time, in spec order, on its own feature branch. Do not ask Claude to implement every phase in one prompt.
4. A story is complete only when `npm run e2e:gate -- US-<nnn>` passes; a feature is merged only when `npm run e2e:gate -- F<nn>` passes and you approve the Pull Request.
5. For each task, name the responsible agent role and require tests plus a summary of changed files.

These are role instructions for Claude Code workflows. They do not require that Claude's runtime supports autonomous subagents; if subagents are unavailable, Claude follows the same roles in sequence and labels each role's work.

## Important
The source documents are planning baselines. They authorize implementation only when you explicitly ask Claude to start. Never replace a Deferred or unrecorded decision with an invented default.
