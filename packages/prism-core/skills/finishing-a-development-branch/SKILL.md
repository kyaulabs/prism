---
name: finishing-a-development-branch
description: Finalize an approved work branch with cleanup, synchronization, deterministic checks, and required review. Share the task's two automatic review attempts; ask before the third and every later attempt. PR preparation never publishes.
derived-from: obra/superpowers (MIT, © Jesse Vincent)
---

# Finishing a Development Branch

Complete a work branch automatically after its approved plan finishes. Plan
approval authorizes artifact cleanup, synchronization, attestation, unlimited
local `/check` execution, required four-axis review, revalidation, and
preparation-only `/pr`. Do not introduce a routine pause before initial
finalization. Follow `packages/prism-core/docs/review-attempt-policy.md`:
share the active task's two automatic attempts, then ask before the third and
every later attempt. Entering finalization does not reset the count.

**Announce at start:** "I'm using the finishing-a-development-branch skill to
verify and finalize this work branch."

## Preconditions and bootstrap checkpoint

1. Confirm every implementation task is complete (`- [x]` in the matching
   `docs/plans/` file) and every per-task verification passed.
2. For a strict-greenfield bootstrap branch only, require a successful
   `/check` and all four `code-review` axes before cleanup. Resolve the
   repository with `gh repo view --json nameWithOwner -q .nameWithOwner`,
   validate it as inert data, derive `SPEC_SHA` from the commit that added the
   spec, and render the immutable spec URL.
3. For that bootstrap branch, require the fresh wayfinder map's Notes to
   contain the immutable URL. Halt without deleting artifacts when this map
   evidence is absent.

## Preserve immutable criteria

Before implementation and before artifact cleanup, approved criteria must be
preserved. `executing-plans` records the immutable spec and plan before its first
task. Run installed `prism-review criteria inspect --json` and retain the existing
valid receipt digest. Missing, conflicting, or unsafe criteria stops finalization;
never reconstruct requirements after cleanup or use `criteria none --json` as a
fallback for missing approved sources. A genuinely undeclared workflow must
have recorded that explicit disposition before implementation.

<!-- finalization-artifact-cleanup -->
## Artifact cleanup

Delete only the tracked plan/spec files under `docs/plans/` and `docs/specs/`
that match this branch's completed work (ADR-0027). Stage the exact deleted
paths, load `conventional-commits`, and create the artifact cleanup commit with
a standalone atomic command:

```bash
prism-tool commit create --type chore --scope docs --subject "remove completed development artifacts"
```

The commit command must be the only tool call in its assistant batch. If no
matching tracked artifacts exist, record that fact and do not create an empty
commit. A failed cleanup commit activates the fatal commit latch; stop until
the human uses `/reload` and repository state has been inspected.

<!-- finalization-clean-tree -->
## Require a clean tree

After cleanup, require a completely clean working tree and confirm that no
implementation task or required logical commit remains. Do not proceed while
staged, unstaged, or untracked task artifacts remain.

<!-- finalization-authorization -->
## Consume plan-approved finalization authorization

When entered automatically from `executing-plans`, continue without another
question. The approved plan authorizes matching artifact cleanup and its atomic
commit, `git fetch origin`, a required target merge, exact attestation,
unlimited local `/check` runs and plan-scoped repairs, two automatic review attempts
shared with the active task, SHA revalidation, and automatic preparation-only `/pr`.

If this skill is invoked without an approved-plan handoff, disclose those exact
effects and ask once for equivalent initial authorization before proceeding.
The shared review-attempt budget includes provider cost and reviewed-code
egress without separate permission for the first two attempts. It does not permit pushing, GitHub mutation,
protected-branch merge, or browser opening.

<!-- finalization-target-sync -->
## Determine target and synchronize

After initial authorization is established, read and validate the current
work-branch name. Set the target to `main` for `hotfix/*` and `release/*`;
otherwise use `develop`.
Protected branches remain PR-only.

Run `git fetch origin`. If `origin/<validated-work-branch>` exists, merge the
validated target remote-tracking ref into the work branch. Render validated
names as literal arguments rather than shell-derived code:

```bash
git merge origin/<validated-target-branch>
```

Never rebase an already-published branch and never force-push. If the work
branch is unpublished, fetching the target is sufficient; do not create a
synchronization commit solely to make an unpublished branch appear published.
A conflict halts and routes to `resolve-merge-conflicts`.

<!-- finalization-attestation -->
## Record exact attestation

After synchronization succeeds and the tree is clean, print this exact shape
with resolved validated values:

```text
BRANCH=<resolved valid work branch>
HEAD_SHA=<git rev-parse HEAD>
BASE_REF=origin/<resolved target branch>
BASE_SHA=<git rev-parse origin/resolved-target>
```

The attestation binds every remaining gate to the current branch, head, remote
base reference, and remote base SHA. Retain these four values as inert session
evidence.

<!-- finalization-check -->
## Run `/check` until green

Invoke `/check` and require a complete successful result. Plan approval
authorizes unlimited local `/check` executions. When a failure is within the
approved spec and plan, repair it inline through TDD, verification, and an
atomic commit, refresh the exact attestation for the new HEAD, and rerun `/check` without asking.

A partial run, skipped required adapter gate, failed coverage gate, or other
non-green result is not review-ready. Requirement changes, invalid plan
assumptions, architectural blockers, unavailable capabilities, fatal commit
failures, and other existing hard halts stop instead of being improvised
through.

<!-- finalization-code-review -->
## Run the authorized four-axis review

After `/check` passes, check the shared attempt count and run the `code-review` skill
for the attested state. The first two attempts need no review permission prompt;
the third and every later attempt require fresh explicit approval. Require all four axes:
tooling/style, Fowler structural smells, requirement coverage, and static security analysis.

Require a version-two review chain from the installed authority. An absent chain
selects one complete initial review; safely recognized legacy or stale state
requires a complete initial review within the same attempt budget. Unsafe state stops. When a valid chain ends at an ancestor of current HEAD, preserve its
completed initial evidence and review only the continuous repair delta from
validated `record.headSha` through current HEAD, closure evidence for prior
Blocking findings, and directly affected tests. Every repair runs all four axes.

Continue only when every axis is complete across the chain and no unresolved
Blocking finding remains. Blocking requires ADR-0080 diff causality, relevance,
concrete failure evidence, and changed-workflow impact. Advisory findings remain
visible for `/pr` disclosure but require no waiver and do not stop finalization.

Every launched review consumes an attempt, including failure, interruption,
an incomplete axis, or unresolved Blocking findings. Repair in-scope findings
through TDD and atomic commits and rerun `/check` as needed. If fewer than two
attempts have been used, run the next review without asking. Otherwise obtain
fresh explicit approval for one attempt before continuing; decline stops review.
Each fresh approval authorizes one chain-selected review attempt only:
a continuous repair-delta review or, when required, a complete initial review.
Never reset the count after repair or ask approval merely to rerun `/check`.

<!-- finalization-sha-revalidation -->
## Revalidate clean tree and SHAs

Immediately after review, require a clean tree and re-read `BRANCH`, `HEAD_SHA`,
`BASE_REF`, and `BASE_SHA`. Each value must exactly match the attestation. Any
commit, merge, fetched base movement, checkout, or working-tree change makes
the evidence stale. It does not reset the shared attempt count.

<!-- finalization-managed-health -->
## Verify managed project health

After review and SHA revalidation, run the read-only readiness check:

```bash
prism-tool automation health --json
```

Require `GO` with `CURRENT` or `NOT_CONFIGURED`. On failure, stop before `/pr`
and report the diagnostic without repairing permissions, hooks, or automation.
Preserve completed review evidence. Do not rerun any review axis merely
because health failed; health is readiness evidence, not review authorization.
Any repair that changes reviewed identity remains subject to the existing
attestation and review-chain rules. Both PR preflight routes repeat this check.

<!-- finalization-pr -->
## Invoke PR preparation automatically

When and only when synchronization, attestation, `/check`, all four review
axes, revalidation, and managed health pass, invoke `/pr` automatically without another menu
or approval pause. `/pr` validates the attested finalization evidence, prepares
the conventional title and complete body, and displays retained artifact paths plus
a human-run GitHub CLI block. `/pr` remains preparation-only; the human alone
publishes the branch, creates the pull request, and merges it.

Stop after `/pr` displays its artifacts. Never push, create a pull request,
merge, or open a browser.

## Stop and retry conditions

- A synchronization conflict stops before attestation and routes to
  `resolve-merge-conflicts`. After resolution, resume synchronization and
  checking under the unchanged shared review-attempt budget.
- A `/check` failure stays inside the unlimited local check loop when its repair
  is plan-scoped. Hard halt conditions still stop the workflow.
- An incomplete review axis or unresolved diff-causal Blocking finding consumes
  an attempt. Repair, rerun `/check`, then use the remaining automatic attempt
  or obtain fresh approval when two or more attempts have already been used.
- An invalid, stale, discontinuous, or wrong-base review chain requires the
  next attempt to be a complete initial review, without resetting the count.
- A changed attestation or dirty tree after a successful review stops before
  `/pr`. Restore a clean, exact state, rerun `/check`, and apply the same attempt
  budget to the required review. Obtain fresh approval only after two attempts.

Never continue directly from a review repair to `/pr`. `/check` may rerun
without approval; the third and every later review need their own explicit
approval. Failed or interrupted attempts count. Uncertain history stops for
human approval instead of silently granting two more attempts.

## Post-merge local cleanup

Only after the human confirms that the pull request was merged may local branch
cleanup be discussed. Never delete unmerged work and never perform protected
branch integration on the human's behalf.

## No-squash reminder

Each logical change is its own atomic commit. Do not squash or suggest
squashing; branch history is the development and evaluation log.

## Rules

- Preserve this order: immutable criteria → artifact cleanup → clean tree → plan-approved
  authorization → target/synchronization → attestation → `/check` loop → required
  four-axis review within the shared budget → SHA revalidation → managed health → `/pr`.
- The first two attempts include reviewed-code egress without separate review
  permission. Standing web consent is unrelated.
- Local checks are unlimited, but reviews are not: two automatic attempts per
  task, then fresh approval for one attempt at a time. Valid receipt reuse is free.
- Never auto-waive a finding or incomplete review axis.
- Never rebase an already-published work branch.
- Never push, create a pull request, mutate GitHub, or merge a protected branch.
- Respect ADR-0028 branch names and ADR-0044 protected-branch policy.
- Enforce the no-squash policy from `AGENTS.md`.

## Cross-refs

- `executing-plans` — produces the completed plan.
- `verification-before-completion` — validates task completion before cleanup.
- `conventional-commits` — creates the cleanup commit atomically.
- `/check` — full pre-push gate.
- `code-review` — four-axis review.
- `receiving-code-review` — triages findings before a fresh attempt.
- `resolve-merge-conflicts` — repairs synchronization conflicts before a fresh
  attempt.
- `/pr` — preparation-only pull-request artifacts and human-run command.
- `wayfinder` — preserves strict-greenfield continuation evidence.

## Gotchas

- *Asking after local check failures* — plan approval authorizes unlimited
  `/check` runs and plan-scoped repairs.
- *Resetting the budget during repair* — preserve the attempt count and valid
  chain across fixes, compaction, `/reload`, and `/pr`. The third and every later
  attempt need fresh approval, even when the next review is a replacement initial.
- *Invoking `/pr` with stale SHAs* — revalidation must match all four attested
  values exactly.
- *Treating `/pr` as publication* — it prepares artifacts only; humans publish
  and mutate GitHub.

<!-- vim: ft=markdown sts=4 sw=4 ts=4 et : -->
