---
name: dal
description: Run a HifzAmanah implementation command with the Master Agent role, which plans the task against the SRS and specs, delegates to the specialist agents, integrates their work, reviews, tests, and reports.
argument-hint: <implementation task, e.g. "implement US-010">
disable-model-invocation: true
---

# /dal — HifzAmanah Master Agent

The user's task: **$ARGUMENTS**

If the task above is empty, ask the user what they want the Master Agent to do and stop.

## Why the Master Agent runs here

Claude Code subagents cannot launch other subagents. If the Master Agent ran as a subagent it could only return a delegation plan, and every specialist result would have to be relayed back to it. So for `/dal`, **this session is the Master Agent**: it plans, calls the specialists directly with the Agent tool, integrates, reviews, tests, and reports. The `master-agent` subagent type stays registered for planning-only use, but `/dal` does not go through it.

## 1. Take the Master Agent role

1. Read `docs/HifzAmanah_Claude_Agents/agents/master-agent.md` in full and follow it. `docs/AGENTS.md` is already loaded through the root `CLAUDE.md`; do not re-read it.
2. Read the delegation table in `.claude/agents/master-agent.md` for the `subagent_type` of each role.
3. Collect the repository state with one Bash call: `git branch --show-current` and `git status --short`.

## 2. Analyze before delegating

Read only what the task needs (see "Context budget" in the role file): the story spec(s) and feature page in `docs/specs/`, and the SRS / ARCHITECTURE / design sections they cite, found with Grep on the requirement IDs. Do not read whole source documents.

Stop and ask the user before delegating if the task depends on a document conflict or a Deferred or missing decision (e.g. DEC-B45).

## 3. Delegate

- Call the specialists with the Agent tool, one handoff per call, using the handoff template in the role file. Each handoff must name the exact spec files, SRS sections, and allowed files the specialist should read and change, so the specialist does not have to rediscover them.
- Run specialists whose files do not overlap in parallel (several Agent calls in one message). Run dependent work in order: contracts in `packages/contracts` and schema from `database-agent` first, then backend and frontend, then testing. Call `database-agent` only when tables, constraints, indexes, RLS, or local SQLite migrations change.
- Do small, single-file fixes yourself instead of spawning an agent for them.
- After implementation, run `code-review-agent`, and `security-agent` too when the change touches auth, authorization, tenant scope, privacy, sync, exports, or AI. Run them in parallel on the same diff. Fix or re-delegate blockers and high findings, then re-run the relevant checks.

## 4. Report to the user

Give the completion report from the role file: what was done, files changed, requirements covered, the checks actually run and their results, review findings, and open decisions or blockers. Do not mark anything as passed that was not run and observed. Do not push, merge, or open a PR without the user's approval.
