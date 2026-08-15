# Release Pipeline Hardening + Per-Package Versions — Spec

Date: 2026-08-15
Status: Approved (brainstormed 2026-08-14)

## Context

The first post-conversion release (`release/0.1.0`, merged via PR #314) failed
in `.github/workflows/release.yml`:

```
HTTP 422: Validation Failed (https://api.github.com/repos/kyaulabs/prism/releases)
body is too long (maximum is 125000 characters)
```

The `[0.1.0]` changelog section is 143,231 bytes — it aggregates the entire
pre-conversion history (964 lines) because this is the first release after the
OpenCode→Pi conversion. GitHub rejects release bodies over 125,000 characters;
`gh release create` failed, so the workflow died before the back-merge step.

Recovery remnants now block an idempotent rerun: the tags `v0.1.0`,
`prism-core@0.1.0`, and `prism-php-web@0.1.0` were created manually at the
merge SHA (`0ad9930`), but no GitHub Release exists. ADR-0046's four-state
machine treats tag-without-Release as a hard error requiring manual repair.

Two further conversion-era findings:

- **Version drift:** the branch (`release/0.1.0`), changelog heading
  (`[0.1.0]`), and workflow-derived version agree; but the release commit
  message (`chore(release): v1.0.0 changelog`) and PR title
  (`release: v1.0.0`) use the old convention. The `/release` prompt
  (Pi-era) already generates the correct form; the drift is historical and
  needs no workflow change.
- **npm is fully decoupled:** nothing in `/release` or `release.yml`
  touches npm. `NPM.md` documents a manual ceremony (bump both
  `package.json`, tag per package, `npm publish`, push). The registry
  shows `@kyaulabs/prism-core@0.1.0` and `@kyaulabs/prism-php-web@0.1.0`
  published; the per-package tags were created manually after the merge.

## Goals

1. Releases publish successfully regardless of changelog-section size
   (future releases stay full; oversized ones are capped with full
   fidelity preserved).
2. One release event publishes the repo's GitHub Release **and** bumps the
   npm package versions **and** tags each bumped package — with each
   package carrying its own version, computed automatically from its own
   commit history ("when necessary": unchanged packages are untouched).
3. The pipeline never runs `npm publish` (2FA/OTP stays with the human);
   it prints the exact commands instead.
4. A recovery path exists for releases whose PR-close event is consumed
   (`workflow_dispatch`), and partial tag state self-heals.
5. The failure is caught earlier: `/release` pre-flights the section size
   before the PR is opened.

## Non-Goals

- Automated `npm publish` (registry auth/2FA stays manual).
- Per-package GitHub Releases (one repo Release per event; package
  versions are listed in its body).
- Per-package changelogs published to npm.
- Changing the release-branch/PR shape (`release/X.Y.Z`, one PR).
- Rewriting the historical 0.1.0 drift (commit message / PR title).
- `hotfix/*` releases (deferred in ADR-0046, still deferred).

## Design

### D1 — Release body cap + full-changelog asset (`release.yml`)

After section extraction, measure `body.md` with `wc -c` (bytes ≥
characters for UTF-8, so a byte budget is a conservative proxy for the
125,000-character API limit). Budget: **120,000 bytes**. When over budget:

- Cut at the last line boundary that fits the budget.
- Append a footer: truncated-at-limit notice + pointer to the attached
  asset and `CHANGELOG.md`.
- `notes.md` keeps the **full** section; it is attached to the Release as
  `full-changelog-<version>.md` (`--attach notes.md#full-changelog-$VERSION.md`).
- Under-budget releases are byte-identical to today (no footer, no asset).

### D2 — Partial-state auto-recovery (`release.yml`)

The four-state machine gains a recovery branch: **tag exists and resolves
to the merge SHA, no Release** → create the Release bound to the existing
tag (omit `--target`; the tag already pins the commit). Remaining states:

- neither → publish (unchanged);
- both, tag at merge SHA → verify + skip (unchanged);
- tag at wrong SHA, or Release-only → hard error (unchanged).

### D3 — `workflow_dispatch` trigger (`release.yml`)

Add `workflow_dispatch` with inputs `version` (exact release grammar) and
`merge_sha` (40 lowercase hex). The existing validation step validates the
input form when dispatched, the `HEAD_REF`-derived form on PR close. The
checkout ref becomes `inputs.merge_sha || github.event.pull_request.merge_commit_sha`.
This is a recovery seam, not a parallel release path: the changelog
section for the version must still exist in `CHANGELOG.md` and the
tag-state machine still applies.

### D4 — Per-package version computation (`/release`)

Package discovery is **configurable, not baked in**: `/release` reads
`.prism/release.json` from the repo root — `{ "packages": ["path", …] }`
— listing relative directory paths of release-managed packages. Absent or
empty `packages` → the per-package logic is skipped entirely (today's
behavior; zero change for consumers who do not configure it).
Present-but-malformed (bad paths, `..`, missing `package.json`) → fail
closed with a clear error. This repo commits the file declaring
`packages/prism-core` and `packages/prism-php-web`.

For each declared package:

```
git-cliff --bumped-version --include-path '<pkg>/*' --tag-pattern '<prefix>@.*'
```

where `<prefix>` is the package's `package.json` `name` with the scope
stripped (`@kyaulabs/prism-core` → `prism-core`). Strip the `<prefix>@`
prefix from the result. Verified against this repo: `prism-core@0.2.0`,
`prism-php-web@0.2.0`. A package reporting "nothing to bump" is **skipped**
entirely — no bump, no tag, no npm command. The repo version is computed
as today (all commits, `v*` tags).

### D5 — Authoring-time bump (`/release`)

For each bumped package, run `npm version <ver> --no-git-tag-version` in
`packages/<pkg>/` (side-effect-free: no lockfiles, no lifecycle scripts in
either package). The bumped `package.json` files ride the existing
`chore(release): vX.Y.Z` commit on the release branch, so the versions
land in the merge commit (release.yml never pushes, ADR-0046).

### D6 — Package tags at merge (`release.yml`)

After the repo Release is handled, create a `pkg@ver` tag via the git refs
API for every package whose merged-tree `package.json` version has no
`pkg@ver` tag already resolving to the merge SHA (idempotent reruns skip).
The package list comes from the **same** `.prism/release.json` read from
the checked-out merge SHA — one source of truth between authoring and
publishing (a consumer copying the workflow gets identical behavior).
The tags are load-bearing: the next `/release` bumps from them; missing
tags would double-count released commits.

### D7 — npm command printout (`/release`)

`/release` prints, for each bumped package, the human-run publish command
(`cd packages/<pkg> && npm publish --access public`), marked *run after
merge*, with a note about the 2FA/OTP prompt. Printed, never executed.

### D8 — Release-body Packages block (`release.yml`)

When any package bumped, append `### 📦 Packages` (listing
`prism-core@0.2.0`-style entries) to the body **after** the truncation
step, so it always survives the cap. Omitted when no package bumped.

### D9 — `/release` pre-flight

After changelog generation, measure the version's section. When it exceeds
the budget, present the measured size and ask one question: proceed
(workflow caps + attaches the full asset) or abort and trim at the source.
Not a hard stop — the pipeline now handles oversized bodies gracefully.

### D10 — Tests and docs

- Extend `tests/Shell/release_workflow_test.sh` (ADR-0046 drift guard):
  dispatch trigger, auto-recovery branch, truncate + asset logic,
  package-tag creation, retained invariants (pinned checkout SHA, version
  grammar, no `git push`, no auto-merge), and the `/release` contract
  gains the per-package bump + npm-print assertions.
- Rewrite `NPM.md`'s manual flow: the pipeline owns bumps + tags; the
  human owns only `npm publish`.
- Write **ADR-0066** (pi-era): supersedes ADR-0046's publication-state
  clause and extends it with per-package versions/tags (configurable via
  `.prism/release.json`), dispatch recovery, body cap + asset,
  auto-recovery. ADR-0046 remains untouched (frozen record).
- Add a "package release" entry to the `CONTEXT.md` glossary.

## Implementation Surface

- `.github/workflows/release.yml`
- `packages/prism-core/prompts/release.md`
- `.prism/release.json` (new, committed for this repo)
- `tests/Shell/release_workflow_test.sh`
- `NPM.md`
- `CONTEXT.md` (glossary entry)
- `adr/0066-…` (new pi-era record; ADR-0046 untouched)

## Acceptance Criteria

1. A release whose changelog section exceeds 125,000 characters publishes
   successfully: capped body at a line boundary, footer notice, full
   section attached as `full-changelog-<version>.md`.
2. Tag-exists-no-Release state publishes on rerun without manual repair.
3. `workflow_dispatch` completes a release when no PR event exists,
   with the same validation and state machine.
4. `/release` computes per-package bumps only from packages declared in
   `.prism/release.json`; absent/empty config → today's behavior with no
   per-package logic; malformed config → fail closed; unchanged packages
   are skipped; bumped `package.json` files land on the release branch.
5. `release.yml` tags every bumped package at the merge SHA, reading the
   same config file from the checked-out merge SHA.
6. The pipeline contains no `npm publish`; `/release` prints the
   human-run commands.
7. Release body lists bumped packages when any exist.
8. `/release` flags an oversized section before the PR is opened.
9. Drift guard passes; `/check` green; `code-review` clean.

## Recovery (current 0.1.0)

After the fixed workflow lands on `main`, attempt completion via
`workflow_dispatch` (version `0.1.0`, merge SHA `0ad9930`). If it proves
problematic, forgo the GitHub Release: the existing tags (`v0.1.0`,
`prism-core@0.1.0`, `prism-php-web@0.1.0`) stay and remain harmless —
the next `/release` bumps correctly from them.
