# 0084. Post-application repository bootstrap and root seed

Date: 2026-08-23

## Status

Accepted

Supersedes ADR-0077. Extends ADR-0044, ADR-0050, ADR-0070, ADR-0074,
ADR-0078, and ADR-0082.

## Context

ADR-0077 makes Prism Core responsible for deterministic local Git creation,
active-attempt root-seed eligibility, one-use attestation, bounded staging,
quality verification, exclusive signed commit creation, fatal commit-failure
handling, and a human-owned publication boundary. Its ordering assumes Git can
be initialized before an adapter candidate is prepared and that every setup
seed has a non-null active adapter.

The strict-empty bootstrap transaction established by ADR-0082 must provision
source evidence, provisional package state, trusted provider reports, approved
metadata, and one complete combined project plan before project content exists.
Before its durable marker, decline or failure must restore a genuinely empty
root. Creating `.git` first would either violate that guarantee or make
repository state part of rollback ownership before there is an approved
project.

Strict-empty setup also permits an explicit Core-only result and introduces
source, capability, provider, metadata, combined-plan, and durable-journal
evidence that ADR-0077's attestation does not bind. Those changes affect the
security meaning of the initial commit and therefore require a successor rather
than an implementation-only reorder.

The accepted create-only repository shape, exact staging, canonical hooks,
shared quality gates, exclusive commit launcher, fatal failure latch, and
human-only publication must remain intact.

## Decision

Prism Core owns one deterministic **post-application repository-bootstrap and
root-seed lifecycle** for the strict-empty setup route.

The required order is:

```text
strict-empty attestation
-> provisional source, package, and provider preparation
-> approved combined project plan
-> durable project application
-> Core Git CREATE
-> dependency, hook, and quality verification
-> attested signed root seed
```

Git state does not exist before ADR-0082's durable project-application marker.
A pre-durable decline or caught failure therefore restores the root to strict
emptiness without rolling back a repository. At and after the durable marker,
failures retain the complete project tree and journal and report a deterministic
resume phase.

### Repository classification and creation

After durable project application, a Core launcher operation revalidates the
canonical root and classifies repository disposition as `CREATE`, `PRESERVE`,
or `CONFLICT`.

- `CREATE` is allowed only when the current real directory belongs to no
  containing worktree and has no `.git` entry or concurrent repository state.
- The created repository has a real `.git` directory, unborn `develop`, SHA-1
  objects, files refs, zero commits and refs, no remotes, no active hooks, and
  no identity, signing, credential, or publication configuration introduced by
  initialization.
- `PRESERVE` never reruns `git init`, normalizes repository state, or creates an
  automatic seed.
- Unsafe, malformed, concurrent, unsupported, containing, or orchestration-
  incompatible state is retained and reported `CONFLICT` or NO-GO rather than
  repaired.

Only `CREATE` produced by the active strict-empty bootstrap attempt yields
root-seed eligibility. A manually or previously initialized repository,
including an unborn `develop` repository, never becomes eligible through a
later setup invocation.

### One-use seed attestation

A successful `CREATE` extends the active bootstrap attempt with one-use Core-
owned attestation bound to:

- the canonical project root, repository creation disposition, and Git
  postconditions;
- a fresh non-secret bootstrap attempt identifier and the durable journal;
- source mode;
- for Template mode, the fixed repository identity, validated default branch,
  immutable commit, tree, manifest identities and digests, and complete
  classification digest;
- selected capabilities and trusted provider identities, package identities,
  versions, and report digests;
- the approved normalized project metadata digest;
- nullable adapter identity, package/version, protocol, and adapter report
  digest;
- the combined candidate-plan digest and exact applied-inventory digest;
- the canonical Core hook inventory and digests; and
- the final staged-index digest used for commit verification.

Core-only uses a null adapter identity and explicit `CORE_ONLY` disposition; it
does not invent adapter evidence. Attestation records use bounded regular files
with restrictive modes in a Core-owned operational area, contain no credentials
or secrets, and are never accepted from an arbitrary caller path. Stale,
substituted, mismatched, consumed, concurrent, or unsupported evidence fails
closed.

Successful commit creation or explicit abandonment consumes the attestation.
A later setup invocation may resume only after revalidating the durable journal,
project inventory, repository state, and every retained attestation binding.

### Hooks, quality, and bounded seed

The selected adapter's dependency, audit, generated-CI parity, and public
quality contract runs where applicable. Core-only skips adapter behavior and
runs only applicable Core verification. No no-op adapter, bootstrap-only test,
coverage exception, lint exception, signing bypass, or hook bypass is created.

Canonical Core hook wrappers retain ADR-0078's package inventory,
create/preserve/conflict behavior, separate activation approval, and final
`core.hooksPath` commit point. Hook dispatch treats nullable adapter identity as
an explicit Core-only state and invokes no adapter command. Hooks are active
before the root seed commit.

Core stages only attested durable project inventory:

- canonical project metadata and the Core baseline;
- selected optional-profile outputs;
- project-local Pi activation state;
- the selected adapter scaffold, manifests, locks, and generated CI when an
  adapter is present; and
- canonical Core hook wrappers.

Template responses and blobs, classification manifests, source/provider/
package workspaces, journals, backups, attestation files, inherited Git state,
remote state, credentials, environment files, application-specific content,
unrelated paths, and unexpected index entries are excluded. Unsafe path kinds,
content drift, ownership overlap, digest mismatch, or inability to prove exact
staged-inventory equality blocks the seed.

The applicable shared public quality implementation runs against the staged
inventory before commit creation. This is the same local/CI quality boundary
used after bootstrap, including stack checks only when an adapter owns them.

### Signed root commit and publication boundary

On verified GO, setup invokes the exclusive standalone
`prism-tool commit create` operation with the deterministic initial message:

```text
ignore: bootstrap prism project
```

The launcher resolves attribution, validates the protected-branch single-root
exception, runs active hooks, signs the commit, verifies `HEAD` advancement,
and cleans private attempt state. Selecting setup authorizes this one exact
root-commit attempt without another commit question.

Every commit-operation failure retains ADR-0074's fatal latch. Setup aborts,
performs no automatic retry, blocks later tool use until human `/reload`, and
requires repository inspection because a late failure may follow successful
commit creation. The durable project tree and recovery evidence remain
available.

Setup ends after verifying the signed root seed. It creates no remote, performs
no clone, fetch, pull, push, merge, amend, tag, or publication, opens no pull
request, and changes no GitHub ruleset. The human configures hosting and pushes
the initial `develop` history. Every later protected-branch change follows the
normal work-branch and pull-request workflow.

## Consequences

- **Positive:** every pre-durable decline or failure can restore a genuinely
  empty root because Git is created only after the project becomes durable.
- **Positive:** the initial commit proves the selected source, capabilities,
  providers, metadata, nullable adapter, combined plan, applied inventory,
  hooks, and staged state belong to one continuous attempt.
- **Positive:** Core-only and adapter-selected projects share one repository and
  seed policy without synthetic adapter behavior.
- **Positive:** deterministic Git state, canonical hooks, quality gates, signing,
  fatal failure handling, and human-only publication remain intact.
- **Negative:** Core gains a larger versioned attestation and recovery surface
  whose bindings must remain race-safe, bounded, and mechanically verified.
- **Negative:** failures after durable project application intentionally leave a
  populated non-Git or partially bootstrapped project that must resume from its
  recorded phase rather than roll back to emptiness.
- **Negative:** nullable-adapter semantics must be supported consistently by
  hook dispatch, quality reports, attestation validation, and seed staging.
- **Neutral:** the initial seed still uses the reserved `ignore` commit type and
  the single-root protected-branch exception.
- **Neutral:** initial push and every hosted-repository operation remain
  human-owned.

## Alternatives Considered

### Initialize Git before preparing the project plan

Rejected because `.git` would violate strict-empty rollback and become
transaction-owned before the user approves any durable project content.

### Roll back the repository and project after every later failure

Rejected because dependency, hook, quality, signing, or late commit failure can
leave external or ambiguous state. After the durable marker, retaining a
complete journaled project is safer and deterministic.

### Auto-seed any unborn `develop` repository

Rejected because setup cannot prove that a preserved or manually initialized
repository belongs to the active bootstrap attempt.

### Omit source, provider, metadata, or journal evidence from attestation

Rejected because substituted project content could otherwise pass repository
and index checks without proving continuity from the approved combined plan.

### Require a non-null adapter for the root seed

Rejected because ADR-0082 explicitly supports Core-only projects and adapter
absence has meaningful hook, quality, and inventory semantics.

### Stage the entire durable project root

Rejected because operational artifacts, concurrent human content, credentials,
or unexpected files could enter the initial commit. Staging remains exact and
attestation-bound.

### Create or push the hosted repository automatically

Rejected because agents never push and ADR-0044 and ADR-0050 reserve initial
publication for the human.

<!-- vim: ft=markdown sts=4 sw=4 ts=4 et : -->
