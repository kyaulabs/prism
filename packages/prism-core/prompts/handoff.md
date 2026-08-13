---
description: Compact the current conversation into a handoff document so another pi session can continue the work. Produces a structured handoff file with goal, progress, decisions, open tasks, and context pointers.
---

Compact the current conversation into a handoff document so another pi
session can pick up where this one left off.

## 1. Survey the session

Review the conversation and extract:

- **Goal** — what the user originally asked for (one to two sentences).
- **What was done** — completed tasks, files created/modified, tests written,
  commits made. Be specific with file paths and commit hashes.
- **Decisions made** — design choices, trade-offs accepted, ADRs written or
  proposed. Reference `CONTEXT.md` or `adr/` entries where applicable.
- **Current state** — what's the state of the working tree? Are tests green?
  Is there a spec or plan in progress? What's the last thing that happened?
- **Open tasks** — what remains to be done? List each with enough detail that
  a fresh session could pick it up without re-reading the whole conversation.
- **Context pointers** — files, docs, ADRs, specs, or plans the next agent
  should read first. Include paths.
- **Gotchas** — non-obvious things the next agent needs to know (a test that
  fails intermittently, a file that shouldn't be touched, a dependency that
  needs installing, etc.).

## 2. Write the handoff document

Save to `docs/handoffs/YYYY-MM-DD-<topic>-handoff.md`. If `docs/handoffs/`
doesn't exist, create it.

Use this structure:

```markdown
# Handoff: <topic>

**Date:** <YYYY-MM-DD>
**From:** <session/model identifier>
**Goal:** <one to two sentences>

## What was done

- <completed task — file path, commit hash, test name>
- <completed task>
- ...

## Decisions made

- <decision — with rationale and trade-off>
- <decision>
- ...

## Current state

<working tree state, test status, last action taken>

## Open tasks

1. <task — with enough detail to pick up without re-reading the conversation>
2. <task>
3. ...

## Context to read first

- `<file path>` — <why>
- `<file path>` — <why>
- ...

## Gotchas

- <non-obvious thing the next agent needs to know>
- ...
```

## 3. Report

Print a summary:

- Handoff file path.
- Number of open tasks listed.
- Whether the working tree is clean or has uncommitted changes.
- A one-line "next step" — the single most important thing the next agent
  should do first.

## Rules

- Be specific — file paths, commit hashes, test names. A vague handoff is
  useless.
- Don't summarize the whole conversation — extract only what the next agent
  needs to continue.
- If there are uncommitted changes, note them explicitly and suggest whether
  to commit or stash before handing off.
- If the session involved a spec (`docs/specs/`) or plan (`docs/plans/`),
  reference it — the next agent should read it.
- If `CONTEXT.md` was updated during this session, note it so the next agent
  knows the domain model is current.

## Resuming

To resume work in a new session, tell the agent:

> Read `docs/handoffs/<filename>` and continue.

The next pi session reads the handoff doc, loads the context pointers, and
picks up the open tasks. No special command is needed — the handoff doc is
structured for direct consumption.
