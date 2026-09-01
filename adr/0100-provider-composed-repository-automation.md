# 0100. Provider-composed repository automation

Date: 2026-09-01

## Status

Accepted

Partially supersedes ADR-0046's release-workflow ownership of
back-merge preparation. Extends ADR-0078, ADR-0079, ADR-0084, and ADR-0099.

## Context

Prism's setup routes do not install the same repository automation. The
strict-empty bootstrap composes canonical Core hooks, optional release
management, and adapter-generated CI into one project plan. Established setup
can maintain package-release files and adapter dependencies, but it neither
creates the adapter's complete quality/CI surface nor copies missing canonical
hook wrappers. Its compatibility hook installer only configures an existing
hook directory.

The release workflow also has two responsibilities with different
applicability. It publishes reviewed release merges, then opens a `main` to
`develop` back-merge pull request. Because the job runs only for merged release
branches, ordinary and hotfix merges into `main` do not receive a back-merge.
Repository release management is reusable without npm packages, but its setup
mechanics are coupled to package-release configuration that requires at least
one publishable package.

Prism-created commits run with Git hooks enabled, so a pre-commit rejection
prevents commit creation. The operator additionally requires an explicit
pre-commit proof before Prism attempts each commit. A hook may legitimately
normalize and restage files, so the commit launcher cannot assume the staged
tree is immutable before that proof.

The change crosses Core setup, adapter providers, managed workflows, hook
activation, commit creation, root-seed attestation, release publication, and
recovery. It must preserve the Core/adapter split, human-only pushes and pull
request merges, separate project and hook approvals, established-project
ownership, strict-empty rollback, catalogue notification, and local/CI parity.

## Decision

We adopt a Core-owned, provider-composed **automation desired state** for
repository workflows and hooks.

### Provider boundary

Core exposes one versioned automation coordinator with five operations:
inspect applicable providers, compose a bounded plan, apply approved outputs,
verify exact state, and report incomplete or blocked automation. The
coordinator accepts only trusted Core and active-adapter provider reports. It
does not contain stack commands or infer the intent of human-authored files.

The initial providers are:

- Core baseline back-merge automation;
- active-adapter testing and linting automation;
- Core repository release management;
- optional package-release metadata; and
- canonical hooks through the managed-hook engine.

Each report contains a closed identity, applicability evidence, owned output
paths, expected kinds, modes and digests, checks, and verification operations.
Core rejects unknown schemas, providers, fields, commands, paths, and exact or
prefix output overlap.

Package-release metadata has one explicit dependency on repository release
management. The release provider owns the canonical release workflow.
Package-release owns its configuration and verifies that the required
canonical workflow is present; it does not co-own another copy.

```text
/setup
  |
  v
Core automation coordinator
  |-- Core back-merge provider
  |-- active-adapter quality provider
  |-- Core release provider
  |-- package-release metadata provider
  `-- Core managed-hook engine
          |
          v
  route-specific transaction and verification
```

### Applicability

Back-merge automation applies to every Git-backed Prism project following the
protected `develop` and `main` model. Canonical hooks apply to every Git-backed
Prism project.

Testing and linting CI applies only when exactly one validated active adapter
declares a complete quality provider. Core-only projects receive no placeholder
stack CI. Adapter absence remains explicit and never creates a synthetic
adapter.

Repository release management remains an independent, disabled-by-default
project capability. It applies when selected during strict-empty setup,
approved for an established project, or already present as supported owned
state. Package-release applies only after its separate enablement and only for
validated publishable npm packages.

### Route-specific transactions

Strict-empty and established setup share provider schemas, applicability,
ownership classifications, and verification. They retain different outer
transactions.

Strict-empty setup includes applicable automation in the existing combined
project plan. Durable application still precedes Git creation. The repository
is then created, hooks are separately approved and activated, the exact seed
inventory is staged and attested, quality runs, and the signed repository seed
is created.

Established setup gains a project-local journaled automation reconciliation
transaction after adapter installation and toolchain verification. It renders
candidates from installed trusted packages without network access. One
project-mutation approval authorizes atomic application of every READY
project-file provider in the displayed plan. A BLOCKED provider remains
untouched and makes automation incomplete, but it does not authorize overwrite
or prevent unrelated READY providers from applying.

Hook mutation remains a separate approval boundary after project-file and
adapter quality verification. Established setup creates no commit.

### Ownership and recovery

Every output receives one disposition:

- `CREATE` when absent;
- `PRESERVE` for exact canonical bytes and mode;
- `UPDATE` for a supported Prism ownership marker and schema;
- `MIGRATE` for an exact recognized legacy digest; or
- `CONFLICT` for unowned, customized, malformed, unsupported, symlinked,
  non-regular, overlapping, or ambiguous state.

Setup never semantically merges workflow, shell, hook, or configuration
behavior and never infers ownership from similarity. Related files owned by one
provider are atomic. Before the durable commit point, rollback restores only
exact transaction-recorded states. At or after the durable point, ambiguous
failure retains the desired state and journal and reports one bounded recovery
action.

Verification re-renders trusted output, validates modes, digests, schemas and
workflow contracts, and runs the active adapter's shared quality implementation
where applicable. Setup never reports automation current while an applicable
provider is blocked or unverified.

### Testing and linting CI

The active adapter owns workflow bytes, tool provisioning, comparison logic,
and the shared quality entry point. Core composes the provider report without
learning stack commands.

Generated CI runs for pushes to `develop` and `main` and for pull requests
targeting either branch on `opened`, `synchronize`, `reopened`, and
`ready_for_review`. It uses a GitHub-hosted ephemeral runner, least-privilege
read permissions, SHA-pinned actions, no persisted checkout credentials, and a
validated comparison base. CI and local gates use one adapter-owned quality
implementation and the same declared tool versions.

### Back-merge and release separation

Core owns a baseline back-merge workflow separate from release publication.
It runs after any pull request targeting `main` closes successfully. It compares
the literal protected branches and opens a `main` to `develop` pull request
only when `main` is ahead and no equivalent pull request is open. Up-to-date,
existing, and concurrently created pull request states are idempotent success.
Unexpected compare, list, or create results fail.

The back-merge workflow uses read contents and write pull request permissions.
It never pushes or merges. A pull request created with `GITHUB_TOKEN` remains
human-reviewed and human-merged; Prism adds no credential or event-suppression
workaround.

The release workflow retains reviewed merge-SHA publication for merged
same-repository `release/<semver>` pull requests, changelog-derived notes,
fail-closed tag and Release reconciliation, optional package tags, and the
same-repository catalogue-notification handoff required by ADR-0099. It no
longer owns back-merge preparation and drops pull request write permission.
The Prism-specific catalogue notification workflow remains repository-only and
is never distributed to consumers.

Repository release management works without package metadata. When package
release is enabled, its configuration adds lockstep package validation and tag
reconciliation. npm authentication and publication remain human-owned.

### Canonical hooks and pre-commit proof

The consumer hook inventory remains exactly `pre-commit`, `commit-msg`,
`prepare-commit-msg`, and `pre-push`. Prism repository-specific `post-checkout`
and `post-merge` hooks remain excluded.

One managed-hook engine serves strict-empty setup, established setup, and the
compatibility installer. It inspects package resources, target modes and bytes,
unrelated hook names, active legacy hooks, and every effective hook-path
origin. Apply repeats inspection, creates missing wrappers atomically, verifies
the inventory, and writes repository-local `core.hooksPath=.github/hooks` only
as the final commit point. Unrelated names are preserved. Conflicting canonical
events, legacy active hooks, or hook managers fail closed. The compatibility
installer delegates to these operations and carries no independent policy.

Every `prism-tool commit create` asks Git to run the active pre-commit hook
before the authoritative staged-state snapshot. This respects Git's hook
resolution and supports both canonical wrappers and preserved repository hook
managers. Failure aborts before signing or commit creation and leaves `HEAD`
unchanged.

A successful preflight may normalize and restage files. The launcher therefore
captures the candidate tree after preflight, locks and revalidates that tree,
and invokes Git without bypass flags. Git runs pre-commit normally against the
locked index. The second run proves active wiring and prevents the explicit
proof from becoming a hook bypass. The repository seed uses the same launcher
path after exact staging and attestation.

## Consequences

- **Positive:** strict-empty and established projects share one applicability,
  ownership, and verification model without sharing unsafe rollback semantics.
- **Positive:** every production merge can produce a human-merged back-merge
  pull request, independent of release publication success.
- **Positive:** repository releases work without npm packages, while package
  releases retain lockstep metadata and tags.
- **Positive:** adapters remain the sole owners of stack CI and quality
  behavior; Core stays language-agnostic.
- **Positive:** canonical consumer hooks become installable from the published
  Core package in established projects without copying repository-specific
  hooks.
- **Positive:** every Prism-created commit has an explicit pre-commit proof and
  Git's normal hook enforcement.
- **Negative:** Core gains another provider protocol, established-project
  journal, ownership matrix, workflow, and recovery surface.
- **Negative:** explicit and normal pre-commit execution doubles hook cost for
  Prism-created commits.
- **Negative:** established projects with customized canonical workflow or hook
  names remain incomplete until a human reconciles the conflict.
- **Negative:** provider-scoped blocking can leave an approved setup with some
  automation current and another provider blocked, so final reporting and
  recovery must remain exact.
- **Neutral:** strict-empty project mutation and hook activation keep separate
  approvals.
- **Neutral:** GitHub Actions may create pull requests and release artifacts
  only within the accepted workflows; agents still never push, publish, or
  merge.
- **Neutral:** no dependency, credential, Pi extension, Aurora change, or stack
  command moves into Core.

## Alternatives Considered

### Copy the Prism repository's workflows and hooks wholesale

Rejected because the source repository contains project-specific CI, catalogue
notification, submodule hooks, and PHP/Aurora heritage that do not apply to
consumer projects.

### Make release management mandatory

Rejected because release automation carries write authority and supporting
changelog policy that not every project selects. Applicability remains an
explicit project capability.

### Keep back-merge inside the release workflow

Rejected because ordinary and hotfix merges into `main` would continue to
leave `develop` behind, and back-merge availability would remain coupled to an
optional release capability.

### Use one outer transaction for strict-empty and established setup

Rejected because strict-empty setup must prove byte-for-byte empty rollback
before durable application, while established setup must preserve arbitrary
human state and reconcile only bounded owned outputs.

### Merge customized workflow or hook behavior

Rejected because semantic similarity does not prove ownership, ordering,
arguments, permissions, or failure semantics. Conflict is safer than an
inferred merge or chain.

### Run pre-commit only as an explicit preflight

Rejected because skipping Git's normal hook would create a bypass and weaken
the hook boundary. The deliberate second run preserves enforcement against the
locked candidate tree.

### Snapshot the staged tree before pre-commit proof

Rejected because valid pre-commit normalization would appear as unauthorized
index drift or would be excluded from the candidate commit. The authoritative
snapshot follows successful preflight.

<!-- vim: ft=markdown sts=4 sw=4 ts=4 et : -->
