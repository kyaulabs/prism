---
description: Explain the most recently completed work at the user's level — what changed, why this approach, what trade-offs were considered. References file paths and commit hashes.
agent: build
---

Survey the most recently completed task or feature and deliver a pedagogical
summary at the user's level. Reference specifics — file paths, commit hashes,
design decisions — not vague generalities.

## Topic argument

The user may specify a topic, file, commit, or time range to focus on: $ARGUMENTS

If empty, survey the most recently completed work by default.

## 1. Survey recent work

Review the conversation and recent git log for the most recently completed
task. If a specific topic was provided in the argument above, focus on that:

```bash
git log --oneline -5
```

Identify:

- **What was built/changed** — file paths, commit hashes, test files.
- **Approach** — the chosen design and why.
- **Trade-offs** — alternatives considered and why rejected.
- **Non-obvious decisions** — ADRs written, conventions followed, sharp edges
  discovered.

## 2. Assess the user's level

If the user has been giving high-level direction without reading code, keep the
explanation conceptual (architecture, data flow, design patterns). If they have
been in the implementation details, go deeper (specific functions, edge cases,
test design).

## 3. Explain

Structure the explanation:

- **What changed** — 1-3 sentences with file paths and commit hash.
- **Why this approach** — the reasoning that drove the design, not just a restatement
  of the diff.
- **Trade-offs** — what was considered and why it was rejected. Be honest about
  downsides.
- **What to know** — gotchas, conventions touched, ADRs written, follow-up work
  suggested.

End by asking if the user wants to go deeper on any part.

## Output

No special format — this is a direct communication from the agent to the
user. Be specific with file paths, commit hashes, and function names. Use code
blocks only for commands or short snippets the user might copy-paste.

## Rules

- Reference file paths and commit hashes — be specific, not vague.
- Skip trivial changes (typos, formatting, RCS headers, dependency bumps)
  unless the user asks for an explanation of those.
- Do not restate the diff — the user can read `git diff`. Explain the
  reasoning behind the diff.
- Keep it concise — this is a summary, not a lecture.
- If there is no recently completed work to explain, say so with a brief status
  of what's in progress.
