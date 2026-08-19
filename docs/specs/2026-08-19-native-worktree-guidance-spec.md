# Spec: Native Worktree Guidance

**Date:** 2026-08-19
**Status:** Draft

## Problem Statement

Prism users need safe guidance for listing, creating, entering, removing, and cleaning up Git worktrees without bypassing branch policy, protected-branch rules, project-root safety, private learning state, hooks, or the single-agent architecture.

The existing branch helper creates a branch by checking out its base in the current worktree. That behavior cannot safely serve worktree creation when the base is already checked out elsewhere. Duplicating branch naming and base-selection rules in a new worktree workflow would create policy drift.

## Solution

Provide one explicitly invoked `/worktree` prompt and one `worktree` skill backed by narrow launcher-owned planning, parsing, and validation operations.

The capability remains a thin, consent-gated interface over native Git worktree behavior. It exposes list, add, use, remove, prune, and repair flows; preserves one canonical branch-policy implementation; treats each linked worktree as an independent Pi project root; and never starts or supervises another Pi process.

Listing and diagnostics are agent-run and read-only. Mutations that write outside the active project root — add, remove, repair, and prune when its administrative directory is outside the root — are emitted as exact human-run commands. An approval gate never overrides the hard boundary against agent modification outside the active project directory.

### Invocation contract

```text
/worktree [list|add|use|remove|prune|repair] [target]
```

A bare `/worktree` is equivalent to the read-only `list` action. `add` accepts or interactively gathers one destination plus the policy-owned branch type and description; `use`, `remove`, and `repair` accept one listed worktree target; and `prune` accepts no target. Missing mutation details are gathered one decision at a time before the exact-plan approval gate. Unknown actions, ambiguous targets, extra targets, or mutation flags such as force return usage guidance without changing repository state.

## User Stories

1. As a contributor, I want to list worktrees with branch, HEAD, lock, missing, prunable, dirty, ignored, and removal-readiness information, so that I can understand repository state safely.
2. As a contributor, I want hostile-looking paths and branch names treated as inert data, so that Git output can never become shell source.
3. As a contributor, I want to add a worktree only after reviewing the exact destination, branch, base, command, hook effects, and network implications, and then running the attested command myself when it writes outside the active project root.
4. As a maintainer, I want worktree branch creation to reuse Prism's canonical naming, identity, hash, and base-selection policy without checking out the base in another worktree.
5. As a contributor, I want destinations canonicalized and checked for symlinks, nesting, non-empty content, and filesystem-policy violations before creation.
6. As a contributor, I want checkout-hook and submodule effects disclosed before add, so that a seemingly local operation cannot silently trigger network or setup work.
7. As a user, I want an exact command for entering a selected worktree and starting Pi at its root, so that project trust, resources, safety data, and private state resolve consistently.
8. As a user, I want Prism never to spawn Pi, tmux, a background process, or a subagent for another worktree.
9. As a contributor, I want removal to block on dirty, untracked, locked, current, main, missing, or ambiguous worktrees.
10. As a learner, I want removal to stop for an explicit preserve, export, or discard decision when private worktree-local learning state exists.
11. As a contributor, I want worktree removal to retain the branch, so that branch disposal remains a separate finishing decision.
12. As a maintainer, I want stale worktree metadata previewed with native dry-run behavior before approved pruning.
13. As a contributor recovering from a moved or damaged worktree, I want repair guidance without automatic unlock, force removal, or filesystem deletion.
14. As a maintainer, I want every mutation represented as exact argv — agent-run only when contained inside the active project root, otherwise emitted as an exact human-run command — while listing and diagnostics remain read-only.

## Implementation Decisions

### Public capability and topology

- Add one `/worktree` prompt and one `worktree` skill. Do not split list, add, remove, cleanup, or handoff into separate skills or commands.
- Put exact Git porcelain parsing, repository-state inspection, command planning, branch-policy calculation, containment checks, and command attestation behind narrow launcher operations under ADR-0070.
- Return structured plans and diagnostics with inert repository-derived values. The agent presents them for review; contained mutations run through the unchanged approved operation, and outside-root mutations are emitted as exact human-run commands. The launcher plans, validates, and attests but never bypasses the project-directory boundary.
- Keep the capability language-agnostic in Prism core. Adapters may explain per-worktree dependency or bootstrap needs but cannot redefine Git or branch policy.

### Root and repository model

- Resolve the active target from the current Git worktree's top-level root. Treat every linked worktree root as a separate Pi project root.
- Use Git's common directory only to understand shared administration. Never use it for project settings, safety declarations, dependencies, generated learning material, or private learning state.
- Treat worktrees as sharing refs, objects, remotes, and repository configuration while keeping independent `HEAD`, index, tracked checkout, ignored content, Pi resources, dependencies, and private learning state.

### List

- Parse NUL-delimited porcelain output, never human-formatted worktree output.
- Report canonical path, main or linked status, branch or detached state, HEAD, current status, lock reason, missing or prunable state, tracked/untracked/ignored status, private-learning-state presence, and removal readiness.
- Inspect state without reading unrelated ignored-file contents.
- Preserve arbitrary path and branch bytes as data and never evaluate them through a shell.

### Add and branch policy

- Require explicit review of destination, branch, base, exact argv, checkout-hook effects, submodule risk, and any network access before the command is attested.
- Enter add only after the owning engineering workflow reaches its existing branch-creation gate. Worktrees cannot bypass specifications, plans, issue approval, or protected-branch policy.
- Expose one canonical branch-policy seam that can calculate and reserve a compliant work-branch name and base without checking out the base in the current worktree.
- Preserve ADR-0028 naming and base semantics and ADR-0044 protected-branch constraints. Do not duplicate regexes, allowed types, identity normalization, hash generation, or base mapping in worktree prose.
- Reject implicit basename-derived branches, forced reset, force flags, detached normal-development worktrees, and checking out one branch in multiple worktrees.
- Never choose a destination path autonomously. Canonicalize a user-confirmed parent and reject symlinked, nested, registered, ambiguous, or non-empty destinations.
- Emit the add command as an exact human-run command whenever the destination lies outside the active project root, which is the normal sibling-worktree case. Never bypass the boundary through the launcher.
- Inspect and disclose checkout-hook behavior before add. Do not fetch, pull, initialize submodules, install dependencies, or access registries without their separate approvals.
- Detect submodule repositories and warn that native worktree support for superprojects is incomplete. Do not promise automatic parity or copy untracked dependencies.

### Use

- Verify the selected worktree root and expected branch, then provide the exact human-run command to enter that root and start Pi there.
- Start Pi at the worktree root, not a nested directory, so cwd-scoped trust, resources, safety configuration, and private state resolve predictably.
- Do not move the current Pi session through a transient shell directory change and do not implicitly resume a session from another root.

### Remove

- Run removal planning from a different registered worktree. Reject removal of the main worktree or current worktree. Removal targets another worktree's directory, so the attested removal command is human-run.
- Re-list immediately before approval and reject missing, locked, dirty, untracked, ambiguous, or otherwise unsafe targets.
- Inventory ignored files before removal because native non-force removal deletes them.
- If private learning state exists, require an explicit preserve/export-or-discard decision before removal.
- Use native non-force worktree removal only. Never substitute recursive deletion or Git clean.
- Retain the branch. Branch disposal remains owned by the finishing workflow.
- Re-list after removal and verify that the worktree entry is gone.

### Cleanup and recovery

- Preview prune through native dry-run and verbose behavior; require separate review before metadata pruning. When the administrative directory lies outside the active root, emit the prune command for human execution.
- Prune administrative metadata only. Never delete directories, branches, dependencies, generated artifacts, or private state as cleanup.
- Leave locked worktrees unchanged.
- Offer native repair commands for moved or broken worktrees as exact human-run commands. Never auto-unlock, force-remove, or guess around corruption.
- Require a distinct exact command for add, remove, prune, and repair; each is agent-run only when fully contained inside the active project root.

### Architecture constraints

- Preserve ADR-0055's single-agent architecture and ADR-0056's sole safety extension.
- Preserve ADR-0028's canonical branch naming and ADR-0044's PR-only protected branches.
- Use ADR-0070's launcher-owned operation boundary for planning and attestation rather than expanding the safety parser or embedding complex shell grammar in prompts. The launcher never executes outside-root mutation on the agent's behalf.
- Do not depend on the project learning engine. Recognizing the accepted private-state location during removal is a safety check, not ownership.

## Testing Decisions

- Treat `/worktree` structured plans and launcher operations as the highest deterministic public seam.
- Use pure Node tests for NUL-delimited porcelain parsing, inert hostile-looking values, command planning, branch-policy outputs, containment classification (agent-run versus human-run), attestation records, and rejection reasons.
- Assert exact argv arrays rather than shell strings.
- Use disposable Git repositories with multiple linked worktrees to verify shared refs and objects alongside independent `HEAD`, index, ignored files, Pi resources, and private state.
- Test spaces, newlines, detached heads, locks, missing/prunable entries, duplicate branch checkout, non-empty and symlinked destinations, dirty/untracked/ignored states, main/current protection, and private-state removal decisions.
- Verify native removal retains branches and prune removes metadata only.
- Simulate checkout hooks and submodule presence to verify effect disclosure without performing unapproved network actions.
- Validate that the branch-policy seam remains behaviorally equivalent to existing branch creation and validation contracts.
- Pass exact agent-visible commands through the safety extension boundary and separately test launcher behavior.
- Run filesystem-sensitive integration cases on the repository's supported Linux and macOS environments.
- Do not test spawning or supervising Pi because that behavior is prohibited.

## Out of Scope

- Multi-agent orchestration, background work, tmux management, task boards, or remote development.
- Automatic dependency installation, submodule initialization, fetching, pulling, or registry access.
- Force removal, force branch reset, Git clean, recursive deletion, or automatic unlocking.
- Branch deletion or finishing decisions after worktree removal.
- Learning curriculum, assessment, dashboard, or state mutation.
- Adapter-specific bootstrap implementation beyond optional guidance.
- Windows support without a separate platform contract.

## Further Notes

This specification is an independent boundary from the resolved [non-blocking learning roadmap](https://github.com/kyaulabs/prism/issues/337) and incorporates the accepted [native worktree guidance decision](https://github.com/kyaulabs/prism/issues/344).

It may be planned and implemented independently of project learning and explicit `/teach` modes. Its canonical branch-policy seam and human-run mutation boundary are recorded in ADR-0072.
