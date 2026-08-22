# Setup-Managed Lockstep Package Releases

Date: 2026-08-21
Status: Approved design

## Summary

Prism Core will provide an opt-in, setup-managed package-release capability for repositories that publish npm packages. `/setup` will discover publishable root and workspace packages, confirm the exact list with the human, and atomically install an owned release configuration plus an owned GitHub Actions workflow. `/release` will then version every configured package in lockstep with the repository release, and CI will publish the repository Release before creating matching package tags.

Repositories without publishable npm packages or without the managed configuration retain repository-only release behavior and receive no npm publish instructions.

## Context

The current release pipeline has three conflicting behaviors:

1. ADR-0066 assigns independently computed versions to release-managed packages.
2. `/release` skips unchanged packages, but `release.yml` attempts to tag every declared package, so an unchanged package can collide with its existing tag at an earlier merge SHA.
3. The set of packages bumped during authoring exists only in conversational `BUMPED_PKGS` state and is not represented in the merge commit for CI.

The pipeline also relies on a manually committed `.prism/release.json` and repository-local workflow. Installing Prism in another npm-package repository does not configure either file, so that repository cannot receive the same release behavior without copying implementation details manually.

The approved product rule is simpler: when package-release support is enabled, the repository release version is the version of every configured npm package. Prism's packages therefore always match `vX.Y.Z`, including prereleases.

## Goals

- Version configured npm packages in lockstep with the repository release.
- Keep npm package behavior opt-in and language-adapter independent.
- Let `/setup` install and maintain the complete capability rather than an isolated config file.
- Discover packages only from the root manifest and declared npm workspaces.
- Never overwrite an unowned or customized release workflow.
- Preserve fail-closed tag collision and merge-SHA validation.
- Make partial publication states deterministic and safely retryable.
- Prevent releases from stale `develop` state that does not contain `main`.
- Add executable validation for workflow syntax and package release behavior.

## Non-Goals

- Publishing packages to npm from CI; the human retains registry authentication and OTP handling.
- Automatically enabling package releases merely because a project uses Node.js tooling.
- Discovering package directories through unconstrained filesystem globs.
- Supporting independently versioned packages under this capability.
- Installing or modifying an unowned release workflow.
- Selecting a stack adapter based on npm package-release configuration.

## Domain Language

**Package-release capability** is the Core-owned, setup-managed combination of release configuration, canonical workflow, lockstep authoring behavior, package tags, and human-run npm publish handoff.

A **release-managed package** is a publishable npm package whose validated relative directory appears in the owned release configuration.

An **owned release file** carries the supported Prism Core ownership and schema marker and may be updated by `/setup` only after an approved displayed diff.

## Architecture

```text
Human
  |
  | runs /setup and approves exact discovered package list
  v
Prism Core setup orchestration
  |
  | invokes deterministic launcher operations
  v
Package-release setup module
  |-- discovers root/workspace package manifests
  |-- validates containment, identity, version, privacy, and uniqueness
  |-- plans atomic owned-file create/update/migration
  `-- applies and verifies both files
          |
          | writes
          v
  .prism/release.json  <---- consumed by ---->  /release
  .github/workflows/release.yml                  release CI
          ^                                           |
          | canonical byte source                     | publishes
packages/prism-core/config/release.yml                 v
                                            GitHub Release + package tags
```

The package-release setup module is a deep Core module: `/setup` consumes a small inspect/plan/apply/verify interface while discovery, ownership classification, migration, atomic replacement, and validation remain hidden inside the launcher.

This capability is independent of stack adapters. Adapter selection continues to answer which development stack Prism should activate; package-release setup separately answers whether the repository publishes npm packages.

## Managed Configuration

The canonical configuration is:

```json
{
  "schemaVersion": 1,
  "managedBy": "@kyaulabs/prism-core",
  "versionPolicy": "lockstep",
  "packages": [
    "packages/prism-core",
    "packages/prism-php-web"
  ]
}
```

Rules:

- `schemaVersion` must be exactly `1`.
- `managedBy` must be exactly `@kyaulabs/prism-core`.
- `versionPolicy` must be exactly `lockstep`.
- `packages` must be a non-empty array of unique, normalized, relative directories.
- Absolute paths, `..`, whitespace-bearing paths, NUL/control characters, symlink escapes, duplicate canonical targets, missing manifests, and paths outside the repository fail closed.
- Each manifest must contain a valid npm package name, a valid release version, and must not set `private` to `true`.
- Package order is deterministic: root first when publishable, then workspace paths sorted lexically.

The managed workflow carries a machine-recognizable Prism Core ownership marker and template schema version in comments near the top of the file.

## Package Discovery

Discovery is read-only and examines project-local files only.

1. Read the root `package.json`.
2. Treat the root as a candidate when it is publishable.
3. Read workspace patterns only from the root `workspaces` array or `workspaces.packages` array.
4. Expand only those declared patterns inside the repository root.
5. Resolve every candidate canonically and reject symlink or traversal escapes.
6. Exclude manifests with `private: true`.
7. Require valid `name` and `version` values.
8. Deduplicate candidates by canonical directory.
9. Return package name, relative path, and current version as validated structured data.

When no publishable candidates exist and no owned capability is already installed, `/setup` asks no package-release question and writes nothing.

When candidates exist, `/setup` displays the exact list and asks one question:

```text
Enable lockstep npm package releases for these packages? (yes/no)
```

Only literal `yes` proceeds. A decline writes nothing.

## Setup Ownership and Transaction

The canonical workflow template ships in Prism Core. The project workflow is an installed owned copy; parity tests compare the installed bytes with the canonical template after accounting for no project-specific substitutions.

The launcher classifies `.prism/release.json` and `.github/workflows/release.yml` together:

- both absent: `CREATE`;
- both owned and canonical: `UNCHANGED`;
- both owned but outdated: `UPDATE`;
- recognized legacy Prism release files: `MIGRATE`;
- only one file present, unowned content, unsupported schema, or mixed ownership: `CONFLICT`.

For `CREATE`, `UPDATE`, or `MIGRATE`, the launcher produces a bounded project-local plan containing exact before/after digests and the displayed diff. `/setup` asks for one mutation approval. Apply then uses locking and atomic replacement so both files reach the planned state or neither changes. Verification rereads the files, checks ownership/schema, validates JSON and YAML, and confirms template parity.

The current packages-only configuration and current Prism workflow are recognized as legacy only when they match an explicitly supported legacy shape or shipped digest. Arbitrary similar files are not claimed.

Prism never automatically removes the capability. Disabling/removal is outside this change and remains a deliberate future operation.

## Release Authoring

When `.prism/release.json` is absent, `/release` performs repository-only authoring and prints no npm commands.

When the managed configuration is present:

1. Validate the complete schema and every package path before mutation.
2. Compute and confirm repository version `X.Y.Z` through the existing git-cliff flow.
3. Set every configured package to exactly `X.Y.Z` with `npm version X.Y.Z --no-git-tag-version` at its validated directory.
4. Require every resulting manifest version to equal the repository version.
5. Stage `CHANGELOG.md` and every configured `package.json` as literal paths.
6. Commit them in the existing signed `chore(release): vX.Y.Z` commit.
7. Print one inert human-run `npm publish --access public` command per configured package.

Per-package git-cliff bumping, tag-pattern parsing, package-prefix stripping, and conversational `BUMPED_PKGS` state are removed.

Before authoring, `/release` fetches `origin/develop`, `origin/main`, and tags, confirms local `develop` equals `origin/develop`, and requires `origin/main` to be an ancestor of local `develop`. A missing back-merge therefore blocks the next release with explicit remediation.

## Publishing Workflow

The workflow retains the existing same-repository merged-release-PR gate, dispatch recovery seam, merge-SHA validation, changelog extraction, body cap, least privileges, and human-only branch merge boundary.

Publication order becomes:

1. Validate event inputs, merge SHA, version, and checkout.
2. Extract and cap the reviewed changelog section.
3. Read package configuration from the checked-out merge.
4. Validate each configured package and require its version to equal `VERSION`.
5. Prepare the `Packages` release-note block without mutating refs.
6. Publish or recover the repository tag and GitHub Release.
7. Create or verify every configured package tag at `MERGE_SHA`.
8. Prepare the `main` to `develop` back-merge independently of publication success once event/merge validation succeeds.

Package tag state is explicit:

- tag absent: create it at `MERGE_SHA`;
- tag present at `MERGE_SHA`: skip;
- tag present elsewhere: fail.

Repository publication before package tags ensures a package-tag failure cannot suppress `vX.Y.Z` and its GitHub Release. A rerun sees the repository publication as complete and continues package-tag reconciliation.

Back-merge preparation is separated from publication execution so a merged release cannot leave `develop` stale merely because GitHub publication or package tagging failed. It still never pushes a branch or merges a PR.

## Historical Recovery Compatibility

`workflow_dispatch` must recover existing releases whose checked-out merge predates schema version 1:

- absent `.prism/release.json` means repository-only historical release;
- the legacy exact packages-only object shape, such as `{ "packages": ["packages/example"] }`, is accepted as lockstep recovery input after the same path and manifest validation;
- all other malformed or unsupported configurations fail closed.

This compatibility allows recovery of:

- `0.1.0` at merge `0ad9930922de977092ab9e39a0d8b4895fa5a17c`;
- `0.2.0` at merge `759a83012a4ed832e59db45b9517086af93ed13a`;
- `0.2.1` at merge `ee6e6867b1471a3e59efea65167c989fae086faa`.

The `0.2.1` recovery merge is the second merge because it contains package versions `0.2.1`.

## Error Handling

- Invalid root or workspace JSON: stop discovery without mutation.
- Unsupported workspace declaration: stop and identify the key.
- Candidate path escape, symlink escape, duplicate target, invalid name/version, or private configured package: stop and identify the package path.
- Existing unowned or mixed-ownership files: `CONFLICT`; display paths and make no changes.
- Plan digest drift before apply: abort; require a fresh inspect/plan cycle.
- Partial write or verification failure: roll back exact transaction-owned states before the durable commit point; otherwise retain the complete owned desired state and report recovery according to the setup transaction contract.
- Package version mismatch in CI: fail before publication and name the package, observed version, and expected repository version.
- Wrong-target tag: fail without deleting or moving it.
- GitHub API errors other than recognized absence/race states: fail without masking.

All package paths, names, versions, branch data, GitHub responses, and manifest content are untrusted data. They are validated before reaching shell source, refs, file destinations, or API command arguments.

## Security and Boundaries

- Core owns package-release mechanics because npm publication capability is language-agnostic.
- Adapters neither discover packages nor install release workflows.
- Setup package discovery requires no registry or network access.
- File mutation requires the existing explicit setup mutation approval and launcher-owned transaction.
- CI receives only `contents: write` and `pull-requests: write`.
- CI never runs `npm publish` and holds no npm credentials.
- The agent never pushes branches or tags.
- Unowned workflows and configurations remain human-owned and untouched.

## Implementation Surface

Expected files include:

- `.prism/release.json`
- `.github/workflows/release.yml`
- `packages/prism-core/config/release.yml` or an equivalently owned canonical template path
- `packages/prism-core/prompts/setup.md`
- `packages/prism-core/prompts/release.md`
- `packages/prism-core/scripts/prism-tool/` package-release setup operations
- `tests/Node/` launcher discovery/transaction tests
- `tests/Shell/release_workflow_test.sh`
- `CONTEXT.md`
- a new ADR superseding ADR-0066's independent-version decision
- package documentation describing opt-in release setup and human npm publication

Exact module and file names may be refined in the implementation plan, but Core ownership, the launcher boundary, and the two managed project paths are fixed.

## Test Seams

### Setup launcher boundary

Fixtures exercise root packages, workspace arrays, workspace package arrays, private manifests, invalid JSON, invalid paths, symlink escapes, duplicates, missing manifests, owned states, legacy migration, plan drift, atomic rollback, and verification.

### Release authoring contract

Prompt contract tests prove no-config repository-only behavior, lockstep use of the confirmed repository version, literal staging, removal of per-package bump computation, `origin/main` ancestry protection, and inert publish commands for only configured packages.

### Workflow execution boundary

Executable simulations extract the real workflow run blocks and use fixture repositories plus a fake `gh` boundary to cover:

- valid YAML and canonical-template parity;
- no-config publication;
- schema-v1 and legacy package configuration;
- package/repository version mismatch;
- fresh package tags;
- idempotent package tags;
- wrong-target tag collision;
- tag-without-Release recovery;
- Release-before-package-tag ordering;
- back-merge reachability after publication failure.

### Aggregate gates

The existing shell suite, Node suite, harness validator, `/check`, and four-axis `code-review` remain mandatory.

## Acceptance Criteria

1. `/setup` discovers publishable root/workspace npm packages without using stack-adapter logic.
2. Private packages and paths outside declared workspaces are excluded; malformed or escaping candidates fail closed.
3. No publishable packages means no package-release prompt or files in a previously unconfigured project.
4. Human approval atomically creates the owned schema-v1 configuration and canonical workflow.
5. Owned canonical files are unchanged; owned outdated files are updateable after approval; supported legacy files migrate; unowned or mixed states are never overwritten.
6. Projects without `.prism/release.json` retain repository-only `/release` behavior and receive no npm publish commands.
7. Every configured package is set to the confirmed repository version, including prereleases, and committed with the changelog.
8. `/release` no longer computes independent package bumps or carries conversational bumped-package state.
9. `/release` blocks when local `develop` does not contain `origin/main`.
10. CI rejects any configured package whose merged version differs from the repository version.
11. CI publishes or recovers the repository Release before creating package tags.
12. Every configured package tag is created at the merge SHA, idempotently skipped there, and rejected when it exists elsewhere.
13. A publication or package-tag failure does not prevent preparation of the required back-merge PR after merge validation succeeds.
14. `workflow_dispatch` can recover the historical `0.1.0`, `0.2.0`, and second-merge `0.2.1` states.
15. The workflow template and installed copy parse as YAML and remain mechanically synchronized.
16. CI contains no npm publication or registry credentials; `/release` prints human-run commands only for configured packages.
17. All focused and aggregate tests pass, `/check` is GO, and four-axis code review has no blocking findings.

## Architectural Decision

This design reverses ADR-0066's independent package-version decision and adds a Core-owned setup-managed release capability. A new ADR is required rather than editing the accepted historical record. The ADR must preserve ADR-0046's reviewed-merge publication, least-privilege CI, no-agent-push, and human npm publication boundaries while superseding ADR-0066's version policy and package-tag sequencing.
