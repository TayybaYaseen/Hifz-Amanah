---
name: dal
description: Run a HifzAmanah implementation command through the Master Agent, which plans the task against the SRS and specs, delegates to the specialist agents, integrates their work, reviews, tests, and reports.
argument-hint: <implementation task, e.g. "implement US-010">
disable-model-invocation: true
---

# /dal — send a task to the HifzAmanah Master Agent

The user's task: **$ARGUMENTS**

If the task above is empty, ask the user what they want the Master Agent to do and stop.

## 1. Invoke the Master Agent

Call the **Agent** tool with:

- `subagent_type`: `master-agent`
- `description`: a 3–5 word summary of the task
- `prompt`: the text below, with the placeholders filled in

```
/dal command from the user (verbatim):
<the task above, unchanged>

Repository state:
- Current branch: <output of `git branch --show-current`>
- Working tree: <output of `git status --short`, or "clean">

Follow your role file docs/HifzAmanah_Claude_Agents/agents/master-agent.md.
Delegate to the specialist agents with the Agent tool. If that tool is not
available to you, return a "## Delegation plan" section as your instructions say.
Do not push, merge, or open a PR without the user's approval.
```

Collect the branch and status with Bash first so the Master Agent starts with the real repository state. Do not do the task yourself and do not change the user's wording.

## 2. Run any delegation plan

If the Master Agent's report contains a `## Delegation plan`, it could not launch subagents itself. Run each handoff in that plan with the Agent tool, using the given `subagent_type` and the handoff text verbatim. Run the handoffs marked parallel in one message and the rest in order. Then send all the results back to the Master Agent with SendMessage so it can integrate, review, and test. Repeat until its report has no delegation plan left.

## 3. Report to the user

Relay the Master Agent's completion report: what was done, files changed, requirements covered, the checks it actually ran and their results, review findings, and open decisions or blockers. If it asks the user a question, ask that question exactly. Do not mark anything as passed that the report does not show as passed.
