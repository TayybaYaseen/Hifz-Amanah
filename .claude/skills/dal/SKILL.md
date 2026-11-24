---
name: dal
description: Run a HifzAmanah implementation command with the Master Agent role, which plans the task against the SRS and specs, delegates to the registered specialist agents, integrates their work, reviews, tests, and reports.
argument-hint: <implementation task, e.g. "implement US-010">
disable-model-invocation: true
---

# /dal — HifzAmanah Master Agent

The user's task: **$ARGUMENTS**

If the task is empty, ask the user what the Master Agent should do and stop.

**This session is the Master Agent.** Subagents cannot launch subagents, so do not spawn `master-agent` (it is planning-only); you plan, call the specialists with the Agent tool, integrate, verify, and report.

1. Read `.claude/agents/master-agent.md` once (skip the frontmatter) and follow it for the whole task. It holds the specialist registry, routing, handoff template, review policy, and completion report. `docs/AGENTS.md` is already loaded; do not re-read it.
2. Delegate **only** to the registered `subagent_type`s in that registry. Never use `general-purpose`, `Explore`, `Plan`, `claude`, or `fork`, and never create or edit agent definitions. Use only the specialists the task actually needs; do small work yourself.
3. Follow up with an agent you already started through `SendMessage`, not a new spawn.
4. Give one completion report. Do not push, merge, or open a PR without the user's approval.
