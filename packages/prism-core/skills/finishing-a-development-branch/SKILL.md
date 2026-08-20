---
name: finishing-a-development-branch
description: Use when a feature branch's implementation is complete and you need one accepted automatic finalization attempt through synchronization, attestation, /check, code-review, and preparation-only /pr.
derived-from: obra/superpowers (MIT, © Jesse Vincent)
---

# Finishing a Development Branch

Complete a work branch with one explicit finalization decision followed by one
automatic, fail-closed attempt. Artifact cleanup happens before the decision.
After acceptance, do not introduce another routine pause before `/pr`.

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
implementation task or required logical commit remains. Do not ask for
finalization acceptance while staged, unstaged, or untracked task artifacts
remain.

<!-- finalization-acceptance -->
## Pause once for finalization acceptance

Report that implementation and artifact cleanup are complete, then ask exactly
one decision question. Disclose all authorized effects before asking:

> Accept one finalization attempt? Acceptance may run `git fetch origin` and,
> for an already-published work branch, create a merge commit from the target
> branch when synchronization is required. It authorizes exact attestation,
> full `/check`, all four `code-review` axes, SHA revalidation, and will
> automatically invoke `/pr` when every gate passes. `/pr` remains
> preparation-only: it never pushes or mutates GitHub. Standing OCR consent,
> not this acceptance, authorizes OCR connectivity and reviewed-code egress.

Wait here. A decline ends the workflow without changing branch publication or
GitHub state. One acceptance authorizes one attempt only; it is consumed by
success or by any stop condition below.

<!-- finalization-target-sync -->
## Determine target and synchronize

After acceptance, read and validate the current work-branch name. Set the
target to `main` for `hotfix/*` and `release/*`; otherwise use `develop`.
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
A conflict consumes the attempt and routes to `resolve-merge-conflicts`.

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
## Run full check

Invoke `/check` and require a complete successful result for the attested
state. A partial run, skipped adapter gate, failed coverage gate, or any other
non-green result consumes the attempt.

<!-- finalization-code-review -->
## Run all four review axes

Run the `code-review` skill after `/check` and require all four axes for the
attested state: tooling/style, Fowler structural smells, requirement coverage,
and static security analysis.

Continue only when there is no Blocking finding, every axis is complete or is
covered by an eligible waiver that existed before this accepted attempt, and
no Suggested finding remains unresolved. Fixing a finding, granting a new
waiver, or recovering an incomplete axis changes the evidence and consumes the
attempt; after re-verification, return to the acceptance pause.

<!-- finalization-sha-revalidation -->
## Revalidate clean tree and SHAs

Immediately after review, require a clean tree and re-read `BRANCH`, `HEAD_SHA`,
`BASE_REF`, and `BASE_SHA`. Each value must exactly match the attestation. Any
commit, merge, fetched base movement, checkout, or working-tree change makes
the evidence stale and consumes the attempt.

<!-- finalization-pr -->
## Invoke PR preparation automatically

When and only when synchronization, attestation, `/check`, all four review
axes, and revalidation pass, invoke `/pr` automatically without another menu
or approval pause. `/pr` validates the accepted-attempt evidence, prepares the
conventional title and complete body, and displays retained artifact paths plus
a human-run GitHub CLI block. `/pr` remains preparation-only; the human alone
publishes the branch, creates the pull request, and merges it.

Stop after `/pr` displays its artifacts. Never push, create a pull request,
merge, or open a browser.

## Stop conditions

Each condition consumes the current attempt:

- A synchronization conflict must stop before `/pr` and requires fresh finalization acceptance after repair.
- A `/check` failure must stop before `/pr` and requires fresh finalization acceptance after repair.
- An incomplete review axis must stop before `/pr` and requires fresh finalization acceptance after repair or an eligible waiver.
- A Blocking finding must stop before `/pr` and requires fresh finalization acceptance after repair.
- An unresolved Suggested finding must stop before `/pr` and requires fresh finalization acceptance after repair or an eligible waiver.
- A changed attestation or dirty tree must stop before `/pr` and requires fresh finalization acceptance after repair.

Never continue directly from repair or waiver to `/pr`. Re-enter at the single
acceptance pause and rerun synchronization, attestation, `/check`, all four
review axes, and revalidation.

## Post-merge local cleanup

Only after the human confirms that the pull request was merged may local branch
cleanup be discussed. Never delete unmerged work and never perform protected
branch integration on the human's behalf.

## No-squash reminder

Each logical change is its own atomic commit. Do not squash or suggest
squashing; branch history is the development and evaluation log.

## Rules

- Preserve this order: artifact cleanup → clean tree → finalization acceptance
  → target/synchronization → attestation → `/check` → four-axis review → SHA
  revalidation → `/pr`.
- Finalization acceptance is not OCR consent and does not authorize network
  egress of reviewed code.
- Acceptance authorizes one attempt, not retries or automatic repair.
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

- *Asking after every gate* — acceptance authorizes one automatic attempt.
- *Continuing after a repair or waiver* — the attempt is consumed; return to
  fresh finalization acceptance.
- *Invoking `/pr` with stale SHAs* — revalidation must match all four attested
  values exactly.
- *Treating `/pr` as publication* — it prepares artifacts only; humans publish
  and mutate GitHub.

<!-- vim: ft=markdown sts=4 sw=4 ts=4 et : -->
