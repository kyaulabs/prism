---
name: finishing-a-development-branch
description: Use to finish a work branch with relevant verification, same-session review and user-directed publication, without artifact cleanup or receipt machinery.
derived-from: obra/superpowers (MIT, © Jesse Vincent)
---

# Finishing a Development Branch

Bring the requested work to a verified handoff without inventing more work.

1. Inspect the branch, task diff and remaining working state. Confirm requested
   outcomes, not just checklist completion. Preserve unrelated changes and useful
   specs/plans; remove only task-owned temporary artifacts no longer needed.
2. Use `verification-before-completion` for relevant tests and lint. Reuse fresh
   evidence where unchanged code permits it; run broader checks for cross-cutting work.
3. Use `code-review` for non-trivial completion unless waived. Repair concrete
   task-related defects through TDD and verify affected behavior. Leave advisory
   observations visible without turning them into mandatory cleanup.
4. Commit remaining verified logical changes with `conventional-commits`.
5. Follow user/project instructions for synchronization, push, PR creation, merge
   or release. Inspect divergence before integrating; do not force-push or rewrite
   shared history without authorization. Rerun affected checks after integration.
6. Summarize changes, actual checks, remaining risks and publication state. Use
   `/pr` if PR preparation or creation is requested.

## Rules

No installed reviewer authority, immutable-criteria capture, receipt chain,
mandatory document deletion or attempt counter. A command failure is recoverable.
Standing permission applies without a repeated approval prompt. Missing or
unclear publication instructions are not permission to publish.

## Gotchas

- Keep useful design documents rather than deleting them to satisfy a lifecycle.
- Do not claim a PR exists when only its title/body was prepared.
- Stop unproductive repair loops and explain the blocker instead of adding gates.
