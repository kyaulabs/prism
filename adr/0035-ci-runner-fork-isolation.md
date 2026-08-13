# 0035. CI Runner Isolation for Fork Pull Requests

> **opencode-era record.** Superseded where moot by the pi migration (ADR-0055). Retained as historical context.

Date: 2026-07-21

## Status

Accepted

## Context

The repository is public, so any external contributor can fork it and open a
pull request. The `check` job in `.github/workflows/ci.yml` ran on a persistent
self-hosted Linux runner for every `pull_request` event — including those
originating from forks. Three properties of that configuration combined into a
critical supply-chain attack surface (issue #179):

1. **Persistent machine.** A self-hosted runner is long-lived. Code that
   persists on first run survives into subsequent runs, including runs for
   other PRs and for `main`.
2. **Passwordless `sudo`.** The runner granted passwordless `sudo`, which two
   install steps used (`shellcheck`, `gitleaks`). Any step that could inject
   into a `run:` block could therefore elevate.
3. **Persisted credentials.** `actions/checkout` defaulted to
   `persist-credentials: true`, writing the `GITHUB_TOKEN` into the local git
   config for subsequent steps to use.

GitHub explicitly warns against self-hosted runners on public repositories for
exactly this reason: a fork-PR is untrusted code, and a self-hosted runner
gives it a persistent, privileged execution environment.

The forces in play:

- **ADR-0025 (CI↔local parity).** The parity contract must be preserved. Its
  text is about *gates* (pre-commit, commit-msg, pre-push, shellcheck
  output-parity, heavy gates via `/check`); it is silent on runners. The
  pinned tool versions (shellcheck 0.11.0, gitleaks 8.30.1) must be retained
  because ADR-0025 §5 requires identical local and CI shellcheck behavior.
- **Cost.** Public repositories get unlimited free GitHub-hosted runner
  minutes (with concurrency limits). Moving off self-hosted is therefore
  zero-cost for this repo.
- **Caching.** The workflow already uses `actions/cache@v4` (composer,
  Playwright) and `setup-node`'s npm cache, all keyed by `runner.os`. These
  carry over to `ubuntu-latest` unchanged, so the speed penalty of ephemeral
  runners is bounded.
- **Boundary.** The CI workflow is owned; the runner is delegated (per
  `CONTEXT.md`). Reconfiguring which delegated runner the owned workflow
  targets is a decision within ownership, not a boundary change.

## Decision

Migrate the `check` job from `[self-hosted, linux]` to `ubuntu-latest`
(GitHub-hosted ephemeral runner), and harden the workflow so that no
workflow-source step can elevate or persist credentials:

1. **Runner.** `check` runs on `ubuntu-latest`. No fork-guard `if:` is needed
   because no self-hosted runner is used by this workflow. `check-macos`
   already runs on `macos-latest` and is unchanged at the runner level.
2. **Workflow-source `sudo` eliminated.** The two pinned tool installs
   (shellcheck 0.11.0, gitleaks 8.30.1) install into a user-writable directory
   (`$HOME/.local/bin`) and prepend it to `PATH` via the `$GITHUB_PATH`
   environment file. The pinned versions are retained.
3. **Credential hygiene.** Every `actions/checkout` step sets
   `persist-credentials: false`.
4. **Dependency-install hardening.** Every `composer install` adds
   `--no-scripts` (defense-in-depth; `composer.json` has no scripts today, but
   a future hook would otherwise execute at install time). `npm ci` already
   skips lifecycle scripts.

### Load-bearing interpretive claim

ADR-0025's parity contract concerns gates and their local twins; it is silent
on the execution substrate. The runner is therefore out of scope of the parity
contract, provided the gates themselves remain parity-equivalent and the
pinned tool versions are preserved. This interpretation is recorded here so a
future maintainer cannot re-litigate it by claiming a runner change breaches
ADR-0025.

## Consequences

- **Positive (security).** Fork-PR code no longer executes on a persistent
  machine. The entire self-hosted-runner attack class — persist, pivot, steal
  credentials, tamper with runs — is eliminated, not merely gated. A
  compromised fork-PR now runs on an ephemeral VM that is destroyed when the
  job ends.
- **Positive (cache isolation).** GitHub-hosted runners give fork PRs isolated
  caches by design; a fork PR cannot pollute the `main`-branch cache. This is
  a security improvement over a shared self-hosted-runner cache.
- **Positive (cost).** Zero — public-repo hosted minutes are free.
- **Positive (gates).** ADR-0025 parity is preserved: the gates are unchanged,
  only the runner and tool provisioning differ. ADR-0009's coverage gate
  invokes the same script from the same callers.
- **Negative (speed).** Ephemeral runners do not benefit from whatever
  implicit cross-run persistence the self-hosted machine provided. This is
  bounded by the existing `actions/cache` steps (composer, npm, Playwright)
  and mitigated further by a new pip download cache for the semgrep venv
  install. Per-run latency is expected to rise modestly (~1–2 min) on the
  uncached first run of a given lockfile hash.
- **Neutral (scope of the runner machine).** The self-hosted runner machine
  itself is **not** decommissioned — it may serve other kyaulabs repos. This
  workflow merely stops using it. A future agent must not attempt to
  "clean up" that infrastructure; it is outside Prism's boundary.

### Transitive-`sudo` caveat

The contract is that **workflow-source** `sudo` is eliminated: a fork-PR can
no longer inject elevated commands into a `run:` step, because there are no
`sudo` tokens in any `run:` block. This is what the `ci_no_sudo_test.sh`
regression test asserts. It is **not** a claim that `sudo` is never invoked
transitively by tools the workflow trusts — notably `npx playwright install
--with-deps chromium` invokes the platform package manager via `sudo`
internally on the ephemeral runner. That transitive invocation is acceptable
because the ephemeral `runner` user's passwordless `sudo` is destroyed with
the VM when the job ends, and the invocation is driven by a trusted action,
not by PR-controlled source.

## Reversal conditions

Returning the `check` job to a self-hosted runner would re-introduce this
vulnerability and must not be done casually. It is safe only if **all** of the
following hold:

- The repository is private (fork-PRs are not possible), **or**
- `pull_request` triggers from forks are explicitly disabled, **and**
- Only trusted contributors can trigger the workflow, **and**
- The persistent-machine and credential-persistence properties are consciously
  re-accepted.

Any change reverting `runs-on:` toward self-hosted must update or supersede
this ADR with documented justification.

## Alternatives Considered

- **Hybrid — self-hosted for same-repo, GitHub-hosted for fork PRs** (issue
  #179's literal recommendation). Rejected as the primary choice because
  public-repo hosted minutes are free, removing the economic incentive to keep
  a persistent machine in scope at all; the hybrid still requires fork-guard
  `if:` logic and dual tool-provisioning paths. Noted as the fallback if
  per-run latency ever becomes unacceptable on a hosted runner.
- **Skip CI for forks entirely** (`if: github.event.pull_request.head.repo.fork
  == false`). Rejected — forks would receive zero CI feedback, hurting
  contributor experience and letting issues land untested.
- **Third-party setup actions for shellcheck/gitleaks** (e.g.
  `ludeeus/shellcheck-action`, `gitleaks/gitleaks-action`). Rejected — they
  expand the trusted-action surface and reduce control over the pinned
  versions that ADR-0025 §5 depends on.
- **Custom Docker image with tools pre-baked.** Rejected — overkill for a
  harness repo; the user-local binary install is a few lines and preserves
  the version pins.
- **Formal amendment of ADR-0025** (the ADR-0031-amends-0010 pattern) to add a
  runner clause. Rejected as heavier than the situation demands — ADR-0025 is
  silent on runners, so this ADR clarifies rather than amends.

## Related

- ADR-0025 — CI↔local parity principle. This ADR clarifies (does not amend or
  supersede) that the parity contract is gate-equivalence, not
  runner-equivalence.
- ADR-0009 — mechanized changed-file coverage gate; invoked unchanged from the
  same callers on the new runner.
- Issue #179 — the vulnerability this ADR resolves.
