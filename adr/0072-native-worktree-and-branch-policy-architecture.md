# 0072. Native worktree and branch-policy architecture

Date: 2026-08-19

## Status

Accepted

## Context

Prism users need guidance for Git worktrees: listing, creating, entering,
removing, and cleaning up linked working trees. Two forces collide:

1. The existing branch helper (`new-branch.sh`) creates a work branch by
   checking out its base in the current worktree. Invoking it unchanged for
   worktree creation would mutate the caller's checkout, and duplicating its
   naming, identity, hash, and base-selection rules in worktree prose would
   create policy drift (ADR-0028, ADR-0044).
2. Prism's hard boundary forbids the agent from modifying files outside the
   active project directory. Normal sibling worktree creation and removal
   necessarily affect another directory, and linked-worktree administration
   may live outside the current worktree root. An approval gate cannot
   override that boundary.

No accepted ADR owns worktree-aware branch creation or the separation of
branch-policy calculation from checkout side effects. ADR-0070 establishes
launcher-owned deterministic mechanics but does not decide what the launcher
may do across project roots.

## Decision

We adopt a native worktree architecture that separates planning from
mutation:

- One `/worktree` prompt and one `worktree` skill own the capability with a
  finite action grammar: list, add, use, remove, prune, repair.
- Branch-policy planning is separated from checkout side effects. One
  canonical implementation owns naming, identity resolution, hash generation,
  and base selection; it can calculate and reserve a compliant work-branch
  name and base without checking out anything. ADR-0028 semantics and
  ADR-0044 protected-branch constraints are referenced, never duplicated.
- Worktree inspection and command planning run through narrow launcher
  operations under ADR-0070: NUL-delimited porcelain parsing, structured
  plans, exact argv arrays, inert repository-derived values.
- Listing and diagnostics are agent-run and read-only. Mutations that write
  outside the active project root — add, remove, repair, and prune when its
  administrative directory is outside the root — are emitted as exact
  human-run commands. The launcher may plan, validate, and attest these
  commands but never executes them as a boundary bypass.
- Sessions are human-started only: `use` emits the exact command to enter a
  worktree root and start Pi there. Prism never spawns Pi, tmux, background
  processes, or subagents for another worktree.
- Every linked worktree root is an independent Pi project root with its own
  settings, resources, dependencies, and private learning state. Git's common
  directory is consulted only for shared repository administration.
- Native non-force semantics only: no force flags, recursive deletion, Git
  clean, or automatic unlocking. Removal retains branches; disposal stays
  with the finishing workflow.

## Consequences

- The canonical branch-policy seam changes a cross-cutting interface used by
  existing workflows; equivalence must be proven against current branch
  creation and validation contracts.
- Mutations require human execution, which is slower than agent-run
  automation but preserves the filesystem hard boundary and keeps consent
  exact.
- The launcher gains planning and validation operations but not a general
  Git or filesystem command surface; each operation stays narrow.
- Worktree-local private state (ADR-0071) composes cleanly: removal checks
  for private learning state without owning it.
- No multi-agent orchestration becomes possible; worktrees remain a
  single-agent convenience.

## Alternatives Considered

- **Reuse `new-branch.sh` as-is for worktree add** — rejected: it checks out
  the base in the active worktree, mutating the caller's checkout and
  failing when the base is already checked out elsewhere.
- **Duplicate branch rules in worktree prose** — rejected: policy drift
  against ADR-0028; one canonical implementation is required.
- **Agent-executed mutations with approval gates** — rejected: approval
  cannot override the hard boundary against writing outside the active
  project directory.
- **A general launcher Git passthrough** — rejected: ADR-0070 requires
  narrow, audited operations; a passthrough would recreate arbitrary shell
  with extra steps.
- **Spawned or supervised sessions per worktree** — rejected: violates
  ADR-0055's single-agent architecture and the no-orchestration non-goal.
