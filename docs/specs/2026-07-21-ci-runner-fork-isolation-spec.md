# Spec: CI Runner Isolation for Fork Pull Requests

**Date:** 2026-07-21
**Status:** Draft
**Issue:** #179

## Problem Statement

The repository is public, so any external contributor can fork and open a pull
request. The `check` job in the CI workflow runs on a persistent self-hosted
Linux runner for every `pull_request` event — including those originating from
forks. The runner provides passwordless `sudo`, the checkout persists the
`GITHUB_TOKEN` to the local git config (the default `persist-credentials: true`),
and the composer install runs without `--no-scripts`. A malicious fork-PR
therefore gains arbitrary code execution on a long-lived machine with elevated
privileges and credential access. GitHub explicitly warns against self-hosted
runners on public repositories for exactly this reason. Issue #179 (severity:
Critical) catalogs the vector.

## Solution

Move the `check` job off the self-hosted runner onto GitHub-hosted ephemeral
runners (`ubuntu-latest`); remove every `sudo` invocation by installing the two
pinned tools (shellcheck, gitleaks) into a user-writable directory on `PATH`;
set `persist-credentials: false` on every checkout; and add `--no-scripts` to
every composer install as defense-in-depth. Because the repository is public,
GitHub-hosted runner minutes are unlimited and free, so the change carries no
cost while eliminating the entire persistent-machine attack class.

## User Stories

1. As a maintainer, I want fork pull requests to execute on ephemeral
   infrastructure, so that a malicious contributor cannot persist on or pivot
   from a long-lived machine.
2. As a maintainer, I want no CI step to require `sudo`, so that a compromised
   step cannot elevate privileges or overwrite system binaries.
3. As a maintainer, I want every checkout to leave no persisted credential, so
   that a malicious step cannot authenticate to the repository.
4. As a maintainer, I want pushes and same-repo pull requests to `main`/
   `develop` to continue running the full lint/test/security suite, so the
   development workflow is uninterrupted.
5. As a contributor, I want my fork pull request to receive the same CI
   feedback a same-repo pull request receives, so I can fix issues before
   review.
6. As a maintainer, I want dependency installs to skip lifecycle scripts, so a
   future composer hook cannot execute install-time code in CI without an
   explicit decision.

## Implementation Decisions

- **Runner.** The `check` job migrates from `[self-hosted, linux]` to
  `ubuntu-latest`. No fork-guard `if:` is needed because no self-hosted runner
  is used by this workflow. `check-macos` already runs on `macos-latest` and is
  unchanged at the runner level.
- **Sudo removal.** The two pinned tool installs (shellcheck 0.11.0 and
  gitleaks 8.30.1) install into a user-writable directory and prepend it to
  `PATH` via the `$GITHUB_PATH` environment file. The pinned versions are
  retained to preserve the local/CI parity contract — ADR-0025 requires the CI
  and local shellcheck to behave identically, and the runner image's bundled
  shellcheck lags upstream and has different exit-code semantics.
- **Credential hygiene.** Every `actions/checkout` step sets
  `persist-credentials: false`, so the `GITHUB_TOKEN` is never written to the
  local git config.
- **Dependency-install hardening.** Every `composer install` adds
  `--no-scripts`. `npm ci` already skips lifecycle scripts, so no npm change is
  needed.
- **Caching.** The existing `actions/cache` steps (composer, Playwright) and
  `setup-node`'s `cache: npm` are keyed by `runner.os` and carry over to
  `ubuntu-latest` unchanged. A pip download cache is added for the semgrep
  venv install — the only previously-uncached slow step.
- **Parity.** ADR-0025 defines parity as *gate-equivalence* (every CI gate has
  a local twin), not runner-equivalence. The gates are unchanged; only the
  runner and tool provisioning differ. The parity contract is preserved.

## Testing Decisions

- **Seam.** The CI workflow file itself, asserted by bash regression tests in
  `tests/Shell/` — mirroring the existing `ci_npm_test.sh`,
  `semgrep_ci_test.sh`, and `ci_local_parity_test.sh` pattern. Each new test
  grep-asserts one structural property of the workflow. This seam was chosen
  and confirmed during plan approval.
- **Layer.** Shell regression tests, CI-only per ADR-0025 (Windows-incompatible
  where pushes originate). No PHP coverage impact — the diff is YAML + bash.
- **Prior art.** `ci_npm_test.sh` (asserts `npm ci`, rejects `npm install`),
  `semgrep_ci_test.sh` (asserts semgrep invocation structure),
  `ci_local_parity_test.sh` (ADR-0025 contract cross-refs).
- **New tests** (one per acceptance criterion plus the hardening item):
  - `ci_runner_hosted_test.sh` — AC1: no `runs-on:` line contains `self-hosted`.
  - `ci_no_sudo_test.sh` — AC2: no `sudo` command invocation in any `run:`
    step.
  - `ci_persist_credentials_test.sh` — AC3: every `actions/checkout@*` step has
    `persist-credentials: false` in its `with:` block.
  - `ci_no_composer_scripts_test.sh` — hardening: every `composer install` uses
    `--no-scripts`.
  - AC4 (same-repo push still runs the full suite) is verified by inspection of
    the unchanged trigger block — only `runs-on:` changes, so push events on
    `main`/`develop` still fire the full `check` job.

## Out of Scope

- `actions/cache` for composer/npm/Playwright — already present and
  runner-agnostic; carried forward unchanged.
- Tightening the `SEMGREP_APP_TOKEN` flow — already uses the safe sentinel
  pattern (`SEMGREP_TOKEN_PRESENT` boolean gate); no change.
- Workflow-level `permissions:` changes — already `contents: read`.
- Dependabot / dependency-review-action adoption — separate effort.
- Decommissioning the self-hosted runner machine itself — it may serve other
  kyaulabs repos; this workflow simply stops using it. Out of this repo's
  scope.
- Migrating any other workflow file — `ci.yml` is the only workflow.
- Switching tool installs to third-party setup actions — rejected to preserve
  version pinning and avoid expanding the trusted-action surface.

## Further Notes

- Public-repo hosted-runner minutes are free and unlimited (with concurrency
  limits), which makes the runner migration zero-cost for this repository.
- The shellcheck/gitleaks pinning rationale (local/CI version parity per
  ADR-0025) is preserved; only the install destination changes from
  `/usr/local/bin` (root-owned, requiring `sudo`) to a user-writable directory.
- ADR-0025's parity is gate-equivalence, not runner-equivalence — this is the
  key insight that lets the runner change proceed without a parity breach.
