# Handoff: Setup-Managed Lockstep Package Releases

**Date:** 2026-08-21
**From:** gpt-5.6-sol
**Goal:** Repair Prism's broken release workflow, then redesign npm package versioning, tagging, setup, and recovery so configured packages use the repository release version in lockstep and other projects can opt into the complete capability through `/setup`.

## What was done

- Investigated all three historical releases locally and through read-only GitHub CLI/API access.
- Confirmed the first `0.1.0` workflow ran but failed with GitHub HTTP 422 because its 143 KB release body exceeded the 125,000-character limit.
- Confirmed the `0.2.0` and both `0.2.1` attempts never started jobs because `.github/workflows/release.yml` had invalid YAML at the multiline truncation footer introduced by commit `935d28a`.
- Confirmed GitHub had accumulated 61 zero-job invalid-workflow failures, no GitHub Releases, and no `v0.2.1`, `prism-core@0.2.1`, or `prism-php-web@0.2.1` tags.
- Confirmed back-merge PR #364 synchronized `main` into `develop`; both package manifests are now `0.2.1` remotely.
- Fixed the invalid YAML in `.github/workflows/release.yml` by constructing the footer with `printf` instead of an unindented multiline YAML string.
- Added fail-closed YAML parsing coverage to `tests/Shell/release_workflow_test.sh`.
- Committed the YAML repair as `f2296cbe3ab8aea93510f94b8f6a55b577c95998` (`fix(release): restore valid workflow yaml`).
- Verified the YAML repair:
  - `release_workflow_test.sh`: 48 passed.
  - full shell suite: passed.
  - Pest: 85 passed, 100% overall coverage.
  - PHP CS Fixer, Stylelint, ESLint, Semgrep, harness validation, and `/check`: passed.
  - Four-axis code review: no blocking findings. OCR suggested skipping YAML validation when `js-yaml` is unavailable; this was deliberately rejected because CI runs `npm ci` and workflow syntax validation must fail closed.
- Brainstormed and received explicit approval for a Core-owned, setup-managed package-release capability.
- Wrote the approved specification at `docs/specs/2026-08-21-setup-managed-lockstep-package-releases-spec.md`.
- Committed the specification as `ce8e1c92966cd43ff0dc324edc1fea50d3772d83` (`docs(release): specify setup-managed lockstep package releases`).

## Decisions made

- Configured npm package versions will be lockstep with repository release `vX.Y.Z`, including prereleases.
- Package-release behavior remains opt-in and language-adapter independent.
- `/setup` will discover publishable root/workspace npm packages from declared workspaces, exclude private packages, display the exact list, and ask one enablement question.
- Enabling the capability installs both `.prism/release.json` and `.github/workflows/release.yml`; configuration alone is insufficient.
- Prism Core owns the canonical workflow template and deterministic setup transaction. Adapters do not own npm release setup.
- Managed release files use explicit ownership and schema markers. Owned files may be updated after an approved displayed diff; unowned/customized files are never overwritten.
- The current packages-only config and known current Prism workflow are supported as one-time legacy migrations.
- `/release` sets every configured package to the confirmed repository version and prints npm publish commands only for configured packages.
- Projects without managed release configuration receive no package bump, package tags, or npm publish instructions.
- CI validates package versions equal the repository version, publishes the repository Release first, then reconciles package tags.
- Back-merge preparation must remain reachable after validated release merges even when publication/tagging fails.
- `/release` must block when `develop` does not contain the latest `main`.
- A new ADR must supersede ADR-0066's independent-version decision while preserving ADR-0046 boundaries.

## Current state

The current branch is `fix/kyau-659c-release-workflow-yaml`, based on synchronized `develop` at `bada7cd`. It contains two signed commits:

1. `f2296cb` — valid release workflow YAML plus regression test.
2. `ce8e1c9` — approved package-release specification.

The working tree was clean before this handoff document was created. The specification has been explicitly approved with no requested changes. No implementation of the package-release redesign has begun. The branch has not been pushed; agents never push.

## Open tasks

1. Run the `architect` skill against the approved spec, `CONTEXT.md`, and accepted ADRs. Because the repository activates the PHP/web adapter, also load `architect-php`, while preserving Core ownership of the language-agnostic release capability. Capture the required parseable `ADR-required:` result.
2. Write a new ADR superseding ADR-0066's independent package versions and package-tag sequencing. Preserve ADR-0046's reviewed-merge publication, least privilege, no-agent-push, and human npm publication boundaries.
3. Update `CONTEXT.md` to define the approved setup-managed package-release capability and lockstep package release semantics.
4. If architecture review is GO, load `writing-plans` and create a detailed TDD plan under `docs/plans/`. The plan must cover Core setup discovery/transaction operations, canonical workflow ownership/parity, `/setup`, `/release`, workflow ordering/recovery, legacy migration, and tests.
5. Implement through `executing-plans` and strict TDD. Expected implementation areas are listed in the spec's “Implementation Surface” section.
6. Add executable tests for package discovery, containment/symlink rejection, private-package exclusion, ownership states, atomic create/update/migration, no-config behavior, lockstep authoring, version mismatch, fresh/idempotent/wrong-target tags, repository-before-package publication, and back-merge reachability after failure.
7. Run verification, `/check`, and four-axis `code-review`; triage all findings with `receiving-code-review`.
8. Prepare the human-run PR handoff. After the corrected capability reaches `main`, recover historical Releases using `workflow_dispatch`, especially `0.2.1` with merge SHA `ee6e6867b1471a3e59efea65167c989fae086faa`.

## Context to read first

- `docs/specs/2026-08-21-setup-managed-lockstep-package-releases-spec.md` — approved design, acceptance criteria, recovery compatibility, implementation surface, and test seams.
- `.github/workflows/release.yml` — repaired current workflow and the publishing logic to redesign.
- `packages/prism-core/prompts/release.md` — current independent per-package authoring behavior to replace with lockstep behavior.
- `packages/prism-core/prompts/setup.md` — current adapter/toolchain setup flow; package-release capability must remain separate from adapter selection.
- `.prism/release.json` — current legacy packages-only configuration to migrate.
- `adr/0046-automated-release-pipeline.md` — immutable publication and human-control boundaries.
- `adr/0066-per-package-release-versions.md` — accepted decision that the new ADR must supersede.
- `CONTEXT.md` — current package-release definition still says independently computed versions.
- `tests/Shell/release_workflow_test.sh` — current release drift guards and executable changelog simulations.
- `packages/prism-core/scripts/prism-tool/` — launcher boundary where deterministic discovery, planning, mutation, and verification belong.

## Gotchas

- The invalid YAML is fixed only on the current work branch; it is not on `develop` or `main` until the human pushes and merges the branch.
- Do not dispatch release recovery until the fixed and redesigned workflow reaches `main`.
- For historical dispatch recovery, workflow checkout data may contain no config (`0.1.0`) or the legacy packages-only shape (`0.2.0` and `0.2.1`); the approved design explicitly requires compatibility.
- Use the second `0.2.1` merge SHA (`ee6e686...`) because it contains package versions `0.2.1`.
- The existing workflow tags every declared package before repository publication. The redesign must split package-note preparation from tag creation and publish the repository Release first.
- Do not hardcode the `kyaulabs/prism` repository identity. `.prism/release.json` is the opt-in boundary.
- Do not put npm release discovery in a stack adapter. It is a Core, language-agnostic capability.
- Do not silently skip YAML validation when `js-yaml` is unavailable; release validation is intentionally fail closed and CI installs locked Node dependencies.
- The first commit attempt for the YAML fix failed after the pre-commit hook normalized the shell test's RCS date. After `/reload`, staging the normalized header allowed the signed commit to succeed.
- No new dependencies have been approved or introduced.
