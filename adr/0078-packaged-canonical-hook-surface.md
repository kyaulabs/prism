# 0078. Packaged canonical hook surface and launcher dispatch

Date: 2026-08-20

## Status

Accepted

## Context

Prism Core owns language-agnostic commit, branch, history, and protected-ref policy, while active adapters own stack-specific staged and pre-push quality behavior. The current hook installer assumes a Prism source checkout, points `core.hooksPath` at the repository's existing hook directory, and does not inspect conflicting hooks or another configured hook manager.

A testing-ready consumer project needs a package-distributed canonical hook surface that works without the Prism checkout. Copying the repository's hooks wholesale would leak Prism-specific validation and submodule behavior into consumers. Silently replacing same-event hooks or another `core.hooksPath` would disable human-owned behavior.

The published hook inventory, wrapper interface, conflict semantics, and Core/adapter dispatch boundary are stable cross-package interfaces and therefore require an architecture record.

## Decision

Prism Core publishes one canonical, manifest-backed hook surface containing exactly four executable wrappers:

- `pre-commit`;
- `commit-msg`;
- `prepare-commit-msg`; and
- `pre-push`.

Repository-specific `post-checkout` and `post-merge` hooks are excluded. The Core package manifest includes the hook resource, and package validation proves manifest-to-directory parity and executable modes.

Each wrapper is thin. It validates that `prism-tool` is available and delegates the event, arguments, and bounded standard input to a narrow launcher interface:

```text
prism-tool hook <event> ...
```

Core owns generic readiness, commit-message, branch, protected-ref, history, and initial-root policy. `pre-commit` and `pre-push` may delegate stack-specific checks through the validated active-adapter handler. Wrappers contain no PHP, Pest, Composer, npm, SCSS, JavaScript, Aurora, consumer-tool path, source-checkout path, or general shell policy implementation.

Core exposes read-only inspection and approval-gated application operations. Inspection validates package sources, manifest shape, source modes, target path kinds, canonical target bytes and modes, unrelated custom hooks, active legacy hooks, and every effective `core.hooksPath` origin. Application repeats inspection immediately before mutation.

The create-only compatibility contract is:

- absent canonical target: create atomically as mode `0755`;
- exact canonical bytes and mode: preserve without rewrite, touch, or chmod;
- differing bytes, differing mode, symlink, or non-regular target: preserve and fail closed;
- unrelated hook name: preserve and report;
- executable non-sample hook under the default Git hook directory while no hooks path is configured: report displacement and fail closed; and
- any effective hooks path other than exact repository-local `.github/hooks`: preserve it and fail closed.

The launcher preflights the complete plan before the first write. It creates missing wrappers through same-directory atomic publication, verifies every canonical target, then writes repository-local `core.hooksPath=.github/hooks` as the final commit point. On caught failure it removes only safely attributable creations and restores only its own configuration write. Existing hooks and configuration are never rollback-owned.

The compatibility installer remains as a self-locating delegate to the same launcher operations and carries no independent copy or configuration logic.

Hook activation occurs only after the active adapter's scaffold and quality surface verify GO. Hooks are active before an automatic root seed commit. If adapter post-apply verification fails, hook activation does not proceed.

This decision extends ADR-0058's Core/adapter boundary, ADR-0060's installed-package model, ADR-0070's launcher-owned mechanics, and ADR-0073's safety-compatible instruction contract. It adds no extension or dependency.

## Consequences

- **Positive:** consumer hooks work from the installed Core package without a source checkout.
- **Positive:** generic policy remains Core-owned while stack-specific checks remain adapter-owned.
- **Positive:** existing same-event hooks, custom hooks, hook managers, modes, and configuration are never silently overwritten or disabled.
- **Positive:** exact create/preserve states make reruns idempotent and testable.
- **Negative:** customized canonical hook names or any existing hook manager block automatic setup until the human reconciles them.
- **Negative:** Core gains a public hook-dispatch interface whose argument, standard-input, and failure semantics must remain stable.
- **Negative:** strict mode equality rejects otherwise executable but non-canonical files.
- **Neutral:** Prism's own repository may retain additional repository-specific hooks outside the published consumer inventory.

## Alternatives Considered

### Copy repository hooks wholesale

Rejected because they include Prism-repository validation, checkout paths, PHP/web assumptions, and implicit submodule/network behavior inappropriate for consumers.

### Let each adapter package hooks

Rejected because commit messages, protected branches, history, and hook activation are language-agnostic Core policy. Adapter ownership would duplicate those rules.

### Overwrite, rename, back up, or auto-chain conflicting hooks

Rejected because preserving bytes does not preserve execution order, arguments, standard input, or failure semantics. Prism cannot infer safe hook composition.

### Use per-hook symlinks in the Git directory

Rejected because they are untracked, package-location-coupled, worktree-sensitive, and prone to stale-target and mode failures.

### Configure `.github/hooks` despite another hook manager

Rejected because a local override would silently disable existing human-owned behavior.

<!-- vim: ft=markdown sts=4 sw=4 ts=4 et : -->
