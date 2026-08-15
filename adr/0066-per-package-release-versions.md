# 0066. Per-Package Release Versions

Date: 2026-08-15

## Status

Accepted

Supersedes the publication-state clause of ADR-0046 for package tagging and
extends the automated release pipeline (ADR-0046) with per-package npm
versions, a workflow_dispatch recovery trigger, a release-body cap with full
changelog asset, and auto-recovery of the tag-without-Release state.
ADR-0046 remains a frozen opencode-era record; this record carries the
superseding language.

## Context

The first post-conversion release failed because the `[0.1.0]` changelog
section (143 KB) exceeded GitHub's 125,000-character release-body limit;
`gh release create` returned HTTP 422 and the workflow died. Recovery left a
tag-without-Release state that ADR-0046's four-state machine treats as a hard
error, so an idempotent rerun cannot complete the release.

Separately, npm publishing is a fully manual ceremony (NPM.md) decoupled from
the repo release: the pipeline neither bumps `packages/*/package.json` nor
creates the `prism-core@X.Y.Z`-style tags that git-cliff needs for the next
bump. Prism core and the stack adapter version in lockstep today, but the
packages are independent and should version independently.

Forces:

- GitHub rejects release bodies over 125,000 characters; oversized changelog
  sections are a first-release-after-conversion artifact and can recur.
- Partial publication state (tag exists, no Release) must self-heal on rerun;
  wrong-target tags must still fail loudly (ADR-0046).
- PR-close events are consumed once; a recovery path is needed when the event
  is gone.
- The pipeline must never push a branch, run `npm publish`, or hold registry
  credentials (2FA stays with the human) (ADR-0046, CONTEXT.md non-goals).
- Package discovery must be configurable: prism's `packages/` layout is
  prism-specific; consumers declare their own paths.
- Per-package versions must derive from each package's own history so
  unchanged packages are untouched.

## Decision

- **Configurable package declaration.** Release-managed packages are declared
  in `.prism/release.json` at the repo root: `{ "packages": ["path", …] }`.
  Absent or empty → no per-package behavior. Malformed → fail closed.
  Discovery is never a hardcoded glob. Tag prefixes derive from each
  package's `package.json` `name` with the scope stripped.
- **Per-package versions at authoring time.** `/release` computes each
  declared package's bump with
  `git-cliff --bumped-version --include-path '<pkg>/*' --tag-pattern '<prefix>@.*'`;
  a package whose computed version equals its current `package.json` version
  is skipped. Bumps land on the release branch via
  `npm version <ver> --no-git-tag-version` (the workflow never pushes).
- **Human-run npm publish.** `/release` prints `npm publish` commands for
  bumped packages (run after merge); the pipeline never executes them.
- **Package tags at merge.** `release.yml` creates `prefix@ver` tags at the
  merge SHA via the git refs API for every declared package whose version is
  untagged there, then appends a `### 📦 Packages` block to the release body.
- **Body cap + asset.** The release body is capped at 120,000 bytes (cut at a
  line boundary, footer notice) and the full changelog section is attached as
  `full-changelog-<version>.md` when truncated.
- **Auto-recovery.** Tag-exists-at-merge-SHA with no Release now creates the
  Release bound to the existing tag instead of failing.
- **Dispatch recovery.** `workflow_dispatch` inputs `version` and `merge_sha`
  (same grammar validation) let the same pipeline complete a release whose
  PR event is consumed.

## Consequences

- Releases publish regardless of changelog size; full fidelity is preserved
  as an asset.
- Package versions can diverge from each other and from the repo `vX.Y.Z`;
  consumers pin package tags, not the repo release tag.
- `npm publish` stays manual and OTP/2FA-bound; the registry flow is
  unchanged.
- The next `/release` bump never double-counts released commits because the
  pipeline creates the tags it bumps from.
- ADR-0046's no-push/no-auto-merge/no-npm invariants remain in force.

## Alternatives Considered

- **Hardcoded `packages/*` discovery** — rejected: prism's layout is
  prism-specific; consumers need a declaration.
- **CI-time bump** — rejected: the workflow never pushes; bumped versions
  must live in the reviewed merge commit.
- **Automated `npm publish` in CI** — rejected: requires registry auth/2FA
  handling, violating the human-boundary non-goal.
- **Per-package GitHub Releases** — rejected: one repo Release per event,
  listing package versions, is sufficient.
