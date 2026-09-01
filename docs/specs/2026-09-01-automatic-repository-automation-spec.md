# Spec: Automatic Repository Automation

**Date:** 2026-09-01
**Status:** Draft

## Problem Statement

Prism does not install the same repository automation on every applicable setup route. Strict-empty PHP/web projects receive generated testing and linting CI, canonical Core hooks, and optional release management as part of the approved project plan. Established projects receive dependency and visual-review maintenance, but setup does not create their generated CI surface or missing canonical hook wrappers. The compatibility hook installer only activates an existing hook directory.

Release automation has a second gap. The managed release workflow creates tags, a GitHub Release, and a back-merge pull request only after a release branch merges into `main`. An ordinary feature or hotfix pull request merged into `main` leaves `develop` behind. Repository-only release management is also coupled too closely to the package-release capability, which requires publishable npm packages.

Finally, a Prism-created commit relies on Git to invoke pre-commit during the commit operation. That blocks a bad commit, but it does not provide the requested explicit pre-commit proof before Prism attempts the commit.

## Solution

`/setup` will reconcile a managed automation desired state for strict-empty and established Prism projects. Core and the active adapter will expose trusted provider reports for the automation they own. Setup will determine applicability, render bounded candidate files, classify ownership, display the complete plan, apply approved non-conflicting outputs through route-appropriate transactions, and verify the result.

Core baseline automation will include a dedicated back-merge workflow for every Git-backed Prism project using protected `develop` and `main` branches. Testing and linting CI will remain adapter-owned and will apply only when the validated active adapter declares a complete quality provider. Release management will remain capability-based. Package-release metadata will extend repository release management rather than determine whether repository releases are possible.

Core will use one managed-hook engine for strict-empty and established repositories. It will install the four canonical wrappers, preserve unrelated hooks, fail closed on ownership or configuration conflicts, and activate the repository-local hook path only after the project quality surface verifies. The exclusive commit launcher will ask Git to run the active pre-commit hook as an explicit preflight, accept valid staged-index normalization, and then take the authoritative staged-state snapshot. Git will run pre-commit again normally against the locked index during commit creation.

## User Stories

1. As a Prism user creating a project, I want setup to include every applicable workflow in the approved project plan, so that the first pushed branch has working repository automation.
2. As a Prism user adopting an established project, I want setup to add missing owned automation without overwriting customized workflows or hooks.
3. As a maintainer, I want testing and linting to run on pushes to `develop` and `main`, so that protected-branch changes are checked after integration.
4. As a contributor, I want testing and linting to run when a pull request targeting `develop` or `main` is opened, updated, reopened, or marked ready for review, so that feedback tracks the current proposed change.
5. As an adapter author, I want the adapter to own its quality commands, tool provisioning, and generated CI bytes, so that Core remains language-agnostic.
6. As a Core-only project owner, I do not want a placeholder test workflow that implies stack tests exist when no adapter declares them.
7. As a maintainer, I want every successful pull request merge into `main` to create a `main` to `develop` back-merge pull request when one is needed, so that integration does not silently fall behind production.
8. As a release manager, I want a merged same-repository `release/<semver>` pull request to publish the reviewed merge as the repository tag and GitHub Release.
9. As a repository-only release manager, I want release publication without being forced to configure publishable npm packages.
10. As a package maintainer, I want enabled package-release metadata to extend the repository release workflow with lockstep package tags while npm publication remains human-run.
11. As a maintainer with custom automation, I want setup to report an ownership conflict instead of merging, replacing, renaming, or chaining my files.
12. As a Prism user, I want setup reruns to preserve exact current files and update only supported Prism-owned schemas or exact recognized legacy output.
13. As a Prism user, I want canonical hooks installed from the Core package rather than copied from the Prism source repository, so that repository-specific hooks do not leak into consumers.
14. As a maintainer, I want unrelated hook names preserved when canonical wrappers are installed.
15. As a Prism user, I want pre-commit to pass explicitly before Prism attempts any commit, so that the test result precedes signing and commit creation.
16. As a maintainer, I want Git to run pre-commit normally even after the explicit proof, so that the proof cannot become a hook bypass.
17. As a user recovering setup, I want deterministic retained state and one recovery action after a durable or ambiguous failure.
18. As a security reviewer, I want hosted workflows to use least privilege, pinned actions, ephemeral runners, and no persisted checkout credentials.

## Implementation Decisions

### Automation ownership and provider boundary

Core will introduce an automation desired-state coordinator. Its public responsibilities are limited to provider discovery, plan composition, approved application, verification, and status reporting. It will not contain stack commands or parse arbitrary workflow intent.

Trusted providers will declare a closed, versioned report containing identity, applicability evidence, owned outputs, expected modes and digests, checks, and verification operations. The initial providers are:

- Core baseline back-merge automation;
- active-adapter quality and CI automation;
- Core release management;
- optional package-release metadata; and
- canonical hooks through the managed-hook interface.

Provider output overlap is invalid. The one explicit dependency is that package-release metadata requires Core release management and validates the same canonical release workflow rather than owning a competing copy.

Back-merge applies to every Git-backed Prism project that follows the protected `develop` and `main` model. Adapter CI applies only when exactly one validated active adapter declares a complete quality provider. Release management applies when selected for a strict-empty project, approved for an established project, or already present as supported owned state. Canonical hooks apply to every Git-backed Prism project.

### Route-specific transactions

Strict-empty and established setup will share provider schemas, applicability rules, ownership classifications, and verification. They will not share one outer transaction because their rollback guarantees differ.

Strict-empty setup will continue to compose all project files before durable project application. Applicable automation outputs will be part of the combined project plan and root-seed inventory. Repository creation, hook activation, staged-index attestation, and the signed repository seed will retain their existing order.

Established setup will gain a journaled automation reconciliation transaction after adapter installation and toolchain verification. Candidate rendering will use installed trusted Core and adapter packages and require no network access. The transaction will display all provider dispositions before mutation. One project-file approval will authorize atomic application of every READY project-file provider. BLOCKED providers will remain untouched and will make the final automation status incomplete, but they will not prevent unrelated READY providers from being planned and applied.

Hook activation remains a separate approval boundary because it changes repository-local Git configuration. Setup will create no commit for an established project.

### Ownership, migration, and recovery

Every managed output will have one disposition:

- `CREATE` for an absent target;
- `PRESERVE` for exact canonical bytes and mode;
- `UPDATE` for a supported Prism ownership marker and schema;
- `MIGRATE` for an exact recognized legacy digest; or
- `CONFLICT` for unowned, customized, malformed, unsupported, ambiguous, symlinked, or non-regular state.

Setup will not semantically merge YAML, shell, JSON, or hook behavior. It will not overwrite a conflict, infer ownership from similarity, or disable another hook manager. Related outputs from one provider are atomic. Before the durable commit point, rollback is limited to exact recorded transaction-owned states. At or after the durable point, failure retains the desired state, journal, and one bounded recovery action.

Verification will re-render canonical output, compare modes and digests, validate ownership markers and workflow contracts, and run the active adapter's shared quality implementation where applicable.

### Testing and linting workflow

The active adapter will own the complete generated testing and linting workflow, including tool provisioning and the shared quality script. Core will compose and reconcile the provider report without learning stack commands.

The workflow trigger contract is:

- pushes to `develop` and `main`; and
- pull requests targeting `develop` or `main` for `opened`, `synchronize`, `reopened`, and `ready_for_review` activity.

The workflow will run on a GitHub-hosted ephemeral runner with least-privilege read permissions. Actions will be SHA-pinned, checkout credentials will not persist, and the comparison base will be derived and validated before use. CI will invoke the same adapter-owned quality implementation used locally. Execution substrate may differ, but gate behavior and declared versions must remain equivalent under ADR-0025 and ADR-0035.

A Core-only project will not receive adapter testing and linting CI. A future Core hosted quality capability must declare a real provider before setup may install one.

### Back-merge workflow

Core will own a dedicated baseline back-merge workflow, separate from release publication. It will trigger on closed pull requests targeting `main` and proceed only when the pull request merged.

The workflow will compare the literal protected branches. If `main` is ahead of `develop` and no open equivalent pull request exists, it will open a `main` to `develop` pull request. Existing or concurrently created pull requests are success. An up-to-date `develop` branch is success. Unexpected comparison, listing, or creation failures are fatal.

The workflow will never push a branch or merge a pull request. It will use only read contents and write pull-request permissions. Pull requests created with `GITHUB_TOKEN` remain subject to human review and merge; Prism will not add a PAT or GitHub App workaround to trigger downstream pull-request events.

### Release workflow

Release management remains an independent, disabled-by-default project capability. Enabling it will install the changelog, git-cliff configuration, and managed repository release workflow. An established project may enable the same capability even when no publishable npm package exists.

Repository-only release management will use no package-release configuration. When the package-release capability is separately enabled, its managed metadata will extend the repository workflow with lockstep package validation and package-tag reconciliation.

The release workflow will retain these invariants:

- only a merged same-repository `release/<semver>` pull request targeting `main` publishes automatically;
- the validated version comes from the branch name and has no leading `v`;
- publication targets the immutable merge SHA;
- release notes come from exactly one non-empty reviewed changelog section;
- reruns accept only complete publication at the same merge SHA;
- partial or wrong-target publication fails closed;
- package tags reconcile only when supported managed package metadata exists; and
- npm publication remains human-owned.

Back-merge behavior will be removed from this workflow. Its permissions will be reduced accordingly.

### Canonical hooks

The consumer hook inventory remains exactly `pre-commit`, `commit-msg`, `prepare-commit-msg`, and `pre-push`. Repository-specific `post-checkout` and `post-merge` hooks are excluded.

One Core managed-hook engine will serve strict-empty setup, established setup, and the compatibility installer. Inspection will validate package resources, target bytes and modes, unrelated hooks, active legacy hooks, and every effective hook-path origin. Application will repeat inspection, create missing wrappers atomically, verify the complete inventory, and set the repository-local hook path only as the final commit point.

Unrelated hook names will be preserved and reported. A differing canonical event, conflicting hook manager, displaced active legacy hook, or unsafe path kind will fail closed. The compatibility installer will delegate to the managed-hook operations and will carry no independent configuration behavior.

Strict-empty setup will continue to bind hook evidence to the active bootstrap attempt. Established hook dispatch will use validated project-local adapter discovery. Adapter absence will be an explicit Core-only state rather than a synthetic adapter.

### Pre-commit proof

Every `prism-tool commit create` operation will use Git's hook-resolution interface to run the active pre-commit hook before the authoritative staged-state snapshot and before `git commit`. This works with canonical wrappers and preserved repository-specific hook managers. A failure will leave `HEAD` unchanged and abort before signing or commit creation.

A successful preflight may legitimately normalize and restage files. The launcher will therefore re-read the repository and staged index after the preflight, require staged changes, and treat that post-hook tree as the commit candidate. It will then lock and revalidate that tree and invoke Git without bypass flags. Git will run pre-commit normally against the locked index. This deliberate second run proves that hook activation still works and closes the substitution gap between the explicit proof and commit creation.

The repository-seed path will use the same launcher behavior after exact staging and attestation. No special seed bypass, no-op adapter, or `--no-verify` path will be added.

### Error handling and reporting

Every public operation will return a closed schema with status, disposition, checks, provider identity, project root, and bounded recovery data. Unknown fields, providers, schemas, dispositions, or output paths will fail closed.

Setup's final report will distinguish current, applied, declined, blocked, conflict, and recovery-required automation. It will never report automation as current while an applicable provider is blocked or unverified.

### Architecture record

This design is cross-cutting and hard to reverse. A new ADR is required. It must record provider composition, route-specific transactions, baseline back-merge ownership, release/back-merge separation, repository-only release management, established hook reconciliation, and launcher-owned pre-commit proof. It must identify the affected clauses in ADR-0046, ADR-0078, ADR-0079, and ADR-0084 and preserve ADR-0044, ADR-0058, ADR-0070, ADR-0073, and ADR-0074.

## Testing Decisions

Tests will target public launcher and setup report boundaries with real temporary Git repositories. Private rendering and transaction helpers will be exercised through those seams rather than tested as separate APIs.

The main integration matrix will cover:

- strict-empty Core-only and adapter-selected plans;
- established Core-only and adapter-selected projects;
- release management disabled, repository-only, and package-release-enabled states;
- create, preserve, update, exact legacy migration, and every conflict class;
- provider overlap and dependency rejection;
- pre-durable rollback, post-durable recovery, stale plans, and concurrent state changes;
- rerun idempotency and exact mode preservation;
- unrelated hook preservation and hook-manager conflicts; and
- complete versus incomplete setup reporting.

Commit launcher tests will assert observable order: repository validation, Git-resolved pre-commit preflight, authoritative staged-state snapshot, index lock and revalidation, Git commit, normal Git hook execution, signing verification, and final `HEAD` verification. They will prove that pre-commit failure leaves `HEAD` unchanged, valid preflight normalization becomes the candidate tree, later index drift invalidates the operation, and the repository seed follows the same path.

Workflow contract tests will validate triggers, permissions, concurrency, pinned actions, credential persistence, event validation, branch comparisons, idempotent pull-request creation, release branch grammar, immutable merge-SHA publication, changelog extraction, package metadata handling, and the absence of push, merge, npm publication, and bypass behavior.

The existing bootstrap orchestration, provider composition, package-release, release workflow, hook dispatch, hook installation, seed, and commit launcher suites provide prior art. Adapter tests will continue to prove that one shared quality implementation backs local checks, pre-commit, pre-push, seed verification, and generated CI.

All behavior-changing implementation will follow Red → Green → Refactor. Changed-file coverage and the full `/check` gate remain mandatory.

## Out of Scope

- Pushing work branches or protected branches.
- Automatically merging any pull request.
- Creating or configuring hosted repositories or GitHub rulesets.
- npm authentication, OTP handling, or `npm publish`.
- Adding stack-specific commands to Prism Core.
- Inferring that a customized workflow is Prism-owned from semantic similarity.
- Chaining or rewriting human-owned hook managers.
- Installing placeholder testing CI for Core-only projects.
- Adding repository-specific `post-checkout` or `post-merge` hooks to the consumer inventory.
- Hotfix-specific release version derivation beyond the existing `release/<semver>` publication contract.

## Further Notes

- Wayfinder map: [ci(setup): map automatic repository automation](https://github.com/kyaulabs/prism/issues/483)
- The map's closed child issues are the decision record for current-state gaps, CI ownership, release/back-merge behavior, hook installation, and transaction semantics.
- No new dependency is proposed.
