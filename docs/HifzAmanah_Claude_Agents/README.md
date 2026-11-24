# HifzAmanah — Claude Code Agent Pack

This pack contains implementation instructions for Claude Code. It is based on the current planning baseline:

- `SRS.md` v1.12 (2026-11-01), with the decision register in §17
- `ARCHITECTURE.md` v1.2 (2026-11-01), ADR-001…014
- `user-stories.md` v1.4 (73 stories, 17 epics)
- `design.md` v1.7
- `docs/specs/`: one spec per user story, named in implementation order

## Files
- `PROJECT_GUIDELINES.md`: the original project-wide guardrails for this pack. `docs/AGENTS.md` supersedes it. (It was renamed from `CLAUDE.md` so Claude Code no longer injects it automatically whenever a file in this folder is read.)
- `IMPLEMENTATION_PLAN.md`: phases and gates, following the spec order `01`–`17`.
- `OPEN_DECISIONS.md`: what is still open (Deferred decisions and product-owner actions), and where each former open item was decided.

The agent roles live in `.claude/agents/<role>.md`. Each file is self-contained: Claude Code loads it as that subagent's system prompt, so an agent does not have to read a second role file. The roles are `master-agent`, `database-agent`, `backend-agent`, `frontend-agent`, `ui-ux-agent`, `testing-agent`, `code-review-agent`, `security-agent`, and `documentation-agent`. The `/dal <task>` command (`.claude/skills/dal/SKILL.md`) runs the Master Agent role in the main session, which delegates to the specialist subagents directly (Claude Code subagents cannot launch other subagents). The `master-agent` subagent type is planning-only.

## Source of truth (highest wins)
1. `SRS.md` §17 (decision register) and §16 (consolidated finalized decisions)
2. `SRS.md` body
3. `user-stories.md`
4. `ARCHITECTURE.md`
5. `design.md`
6. `docs/specs/`
7. `docs/AGENTS.md`, `.claude/agents/`, and this pack

If documents conflict, or a needed decision is missing or Deferred, stop and ask the user.

## How to use
1. The pack lives in `docs/HifzAmanah_Claude_Agents/`. The repository root `CLAUDE.md` loads `docs/AGENTS.md`; the agent roles are registered in `.claude/agents/`.
2. Start Claude Code in the repository root and give the task with `/dal <task>`. The Master Agent reads only the specs and sections the task needs.
3. Work one feature at a time, in spec order, on its own feature branch. Do not ask Claude to implement every phase in one prompt.
4. A story is complete only when `npm run e2e:gate -- US-<nnn>` passes; a feature is merged only when `npm run e2e:gate -- F<nn>` passes and you approve the Pull Request.
5. For each task, name the responsible agent role and require tests plus a summary of changed files.

These are role instructions for Claude Code workflows. They do not require that Claude's runtime supports autonomous subagents; if subagents are unavailable, Claude follows the same roles in sequence and labels each role's work.

## Important
The source documents are planning baselines. They authorize implementation only when you explicitly ask Claude to start. Never replace a Deferred or unrecorded decision with an invented default.
