# 0044. Enforce PR-only protected branches

> **opencode-era record.** Superseded where moot by the pi migration (ADR-0055). Retained as historical context.

Date: 2026-07-30

## Status

Accepted

## Context

Integration branches `develop` and `main` have no enforcement beyond the
existing `prepare-commit-msg` hook, which currently exempts both branches
(returns exit 0 for any branch starting with `main` or `develop`). The
`pre-push` hook blocks non-fast-forward pushes but does not inspect remote
ref targets, leaving the door open to direct pushes and deletions of
protected refs.

On the GitHub side, several rulesets already exist live (named `develop`,
`main`, `feature`, `release`) but carry unknown rule configurations and may
or may not enforce pull-request requirements. The repository currently allows
squash, rebase, and merge commit methods. This means a direct push or a
squash-merged PR can land commits on `develop` without review, bypassing
the pipeline that ADR-0028 (branch naming), ADR-0025 (CI/local parity), and
the engineering methodology depend on.

Forces:

- **Provenance:** The harness needs to know that every commit on a protected
  branch arrived through a reviewed, merged pull request — not a direct push
  or a force-push that rewrote history.
- **Early failure:** Local hooks should catch policy violations before they
  reach the remote, per ADR-0025's parity principle.
- **Authoritative enforcement:** GitHub rulesets are the canonical server-side
  enforcement layer. Local hooks are a convenience; CI is a verification
  layer. If the ruleset is absent, local hooks still fail early, but the
  remote is not protected.
- **Scaffold bootstrap:** A freshly scaffolded repository has no remote refs
  yet — the initial seed push must succeed without a PR so the repository can
  be initialised before `/setup-rulesets` applies the ruleset.
- **Extensibility:** The repository may have existing unrelated rulesets
  (e.g., `feature`, `release`) that must be preserved.

## Decision

We adopt a three-layer PR-only protection model with a single owned ruleset,
an exact initial-root exception, and PR-only integration flows for all
protected-branch work.

### Protected refs

`refs/heads/develop` (integration branch) and `refs/heads/main` (production
branch) are protected refs. All writes to these refs require a merged pull
request. Tags (`refs/tags/*`) and work branches (all other `refs/heads/*`)
are unrestricted.

### Control hierarchy

1. **Server layer (authoritative):** A GitHub repository ruleset named
   `pr-only-integration` enforces pull-request-required, signed commits,
   block deletion, block non-fast-forward, merge-commit-only, and zero
   approving reviews (the minimum to avoid locking out solo scaffold
   consumers). No bypass actors. Repository merge settings are restricted
   to merge commits only (`allow_merge_commit=true`,
   `allow_squash_merge=false`, `allow_rebase_merge=false`). Unrelated
   rulesets and repository settings outside the owned surface are preserved.
2. **Local layer (fast-fail):** The `prepare-commit-msg` hook blocks commits
   on protected branches (exit 3 from `validate-branch-name.sh`). The
   `pre-push` hook inspects `remote_ref` and blocks pushes targeting protected
   refs. Both gates pass only the single-root scaffold exception.
3. **CI layer (provenance):** A `verify-protected-push.sh` step runs on every
   protected-branch push in CI. It validates that the pushed SHA is the exact
   `merge_commit_sha` of a merged PR whose base branch matches the protected
   ref. Non-merged, wrong-base, and un-associated pushes fail the workflow.
   This catches any ruleset bypass (e.g., a repository admin manually pushing
   directly).

### Owned ruleset contract

The ruleset is exactly:

| Field | Value |
|---|---|
| Name | `pr-only-integration` |
| Target | `branch` |
| Enforcement | `active` |
| Bypass actors | none |
| Ref include | `refs/heads/develop`, `refs/heads/main` |
| Rules | `deletion`, `non_fast_forward`, `required_signatures`, `pull_request` |
| Pull request params | `required_approving_review_count=0`, `allowed_merge_methods=["merge"]` |
| Merge settings | `allow_merge_commit=true`, `allow_squash_merge=false`, `allow_rebase_merge=false` |

Zero approving reviews is the minimum policy — individual projects may add
stricter review requirements via a separate, unrelated ruleset. Required
status checks are out of scope (job names vary across scaffold consumers).
A later ADR may standardize required-check names.

### Provisioning modes

`.github/scripts/setup-rulesets.sh` exposes three modes:

- `--dry-run` (default): compares live state against canonical, reports
  would-create/would-update/unchanged, performs no mutations. Exit 0.
- `--check`: same comparison; exit 0 if canonical, exit 1 on drift, exit 2 on
  prerequisites/API/malformed-state errors. CI and hooks can gate on this.
- `--apply`: creates or updates only `pr-only-integration` and normalizes
  merge settings. Idempotent; a second run is a no-op. Fails closed on
  duplicate owned rulesets, API errors, or malformed responses.

`/setup-rulesets` (the opencode command) wraps these: it runs `--dry-run`,
presents the inert delta, asks for explicit `yes` before running `--apply`,
then verifies with `--check`. Agents may invoke the command but must
halt for human confirmation before `--apply`.

### Initial-root exception

A push to a protected ref is permitted exactly when:

1. The remote ref does not yet exist (remote OID is zero).
2. The local history contains exactly one commit.
3. That commit has no parent (`git rev-list --parents -n 1 "$SHA"` yields
   only the commit's own OID).

This allows the initial `main` push from a freshly scaffolded repository.
`/setup-rulesets` must be run after this seed push.

### PR-only integration flows

All integration to `develop` or `main` goes through a merged pull request:

- **Feature/fix/chore/etc. branches off `develop`:** merge into `develop`
  via PR; target branch is `develop`.
- **`hotfix/*` and `release/*` branches off `main`:** merge into `main`
  via PR; target branch is `main`.
- **Release finalization:** after the release PR is merged, the agent tags the
  verified merged `main` SHA (`git tag -s vX.Y.Z "$MERGE_SHA"`), pushes only
  the tag (`git push origin vX.Y.Z`), runs `gh release create`, and creates a
  back-merge PR (`--base develop --head main`).
- **Branch completion:** the finishing skill guides the human through PR
  creation; it no longer offers direct integration into protected branches.

### Required signatures

All commits to protected branches must be signed (enforced by both the
`required_signatures` ruleset rule and the existing `commit-msg` hook).

### Administrative recovery

If the `pr-only-integration` ruleset needs editing (e.g., when checks or
GitHub are unavailable), a repository administrator must temporarily edit
the ruleset through the GitHub web UI or API, resolve the issue, then run
`/setup-rulesets` to restore the canonical state. The `--check` mode reports
drift and the exact delta.

## Consequences

### Positive

- **Provenance:** Every commit on `develop` and `main` is traceable to a
  reviewed, merged PR. CI verifies this independently.
- **Early failure:** Local hooks catch protected-branch violations before
  they reach the remote, avoiding force-push recovery cycles.
- **Idempotent provisioning:** `setup-rulesets.sh` is a repeatable, testable
  boundary — no manual GitHub UI configuration drift.
- **Scaffold compatibility:** Freshly scaffolded repositories can be
  initialised before the ruleset is applied.
- **Unrelated rulesets preserved:** Existing repository rulesets (e.g.,
  `feature`, `release`) are untouched.

### Negative

- **Operational complexity:** Three layers of enforcement (local hooks,
  GitHub ruleset, CI tripwire) increase the number of surfaces to maintain.
  A ruleset change requires updating the static payload in
  `setup-rulesets.sh`.
- **No required status checks in the owned ruleset:** This leaves a gap
  where an un-reviewed PR could be merged if the repository has no separate
  ruleset requiring status checks. CI still runs on every push; a later ADR
  should add status-check requirements.
- **`main` may not exist yet:** The current repository default branch is
  `develop`, and `main` does not exist. The ruleset targets both refs
  unconditionally; GitHub accepts rules targeting non-existent refs without
  error.

### Neutral

- ADR-0028 (branch naming enforcement) is not edited — its accepted body is
  immutable per the `adr` skill. This ADR extends it by making `develop` and
  `main` protected, which ADR-0028's `prepare-commit-msg` hook must enforce
  via new exit code 3.
- The existing `new-branch.sh` path remains the canonical branch-creation
  mechanism.

## Alternatives Considered

### Ruleset-only enforcement (no local hooks)

Rejected. Violating ADR-0025 (CI/local parity), this would let developers
commit and push directly to `develop` only to have GitHub reject it — a
slower feedback loop with no local diagnostic.

### Local-hook-only enforcement (no GitHub ruleset)

Rejected. Local hooks are bypassable (`--no-verify`). Without server-side
enforcement, a misconfigured client or a direct `gh api` call could land
commits on protected branches.

### Required status checks in the owned ruleset

Deferred. Job names vary across scaffold consumers. A later ADR should
define a standardized required-check name and add it to the owned ruleset.

### Banning direct commits to `develop`/`main` via branch protection only

Rejected. GitHub's classic branch protection rules operate per-repository and
do not compose well with the multiple-ruleset model this project needs.
Repository rulesets (the newer API) provide a single surface with explicit
rule composition and discovery, which the `--dry-run`/`--check`/`--apply`
contract relies on.
