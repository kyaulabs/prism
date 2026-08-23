# 0079. Setup-managed lockstep package releases

Date: 2026-08-21

## Status

Accepted

Supersedes ADR-0066's independent package-version policy, package-tag
sequencing, and manually installed package-release configuration. ADR-0066's
release-body cap, full-changelog asset, dispatch recovery seam, and
human-performed npm publication remain in force where they do not conflict
with this record. ADR-0046's reviewed-merge publication and human-control
boundaries remain in force.

## Context

ADR-0066 introduced independently computed versions for release-managed npm
packages. That policy conflicts with the repository's actual release model:
`/release` can skip an unchanged package while the publishing workflow still
attempts to tag every declared package at the new merge SHA. The resulting tag
collision can prevent repository publication, and the set of packages changed
during authoring is not represented as durable workflow input.

Package-release behavior is also incomplete outside this repository. A project
must manually copy both `.prism/release.json` and the release workflow, with no
ownership marker, parity check, migration path, or setup transaction. Installing
Prism therefore does not install the complete capability and cannot safely
maintain it later.

The capability crosses Core setup orchestration, launcher mechanics, local
release authoring, GitHub Actions publication, package tags, recovery, and
domain documentation. It must preserve ADR-0046's same-repository reviewed
merge, immutable merge-SHA target, least-privilege workflow permissions,
no-agent-push rule, human-only pull-request merges, and human-controlled npm
authentication and publication. It must also preserve ADR-0058's Core/adapter
boundary, ADR-0070's launcher-owned mechanics, and the explicit mutation
boundary used by `/setup`.

## Decision

We adopt a Core-owned, opt-in **package-release capability** whose configured
npm packages use the repository release version in lockstep.

### Setup-managed capability

`/setup` discovers publishable npm packages only from the root manifest and
its declared workspace patterns. Discovery is project-local and offline. It
validates package identity, version, privacy, uniqueness, canonical
containment, and path safety; private packages are excluded and malformed or
escaping candidates fail closed.

When candidates exist, `/setup` displays the exact release-managed package
list and asks one enablement question. Literal approval proceeds to one
separately approved mutation transaction that installs and verifies both owned
release files: the schema-versioned configuration and the canonical GitHub
Actions workflow. Configuration without the workflow is not a valid installed
capability.

Prism Core owns the canonical workflow template and deterministic
inspect/plan/apply/verify mechanics. Owned files carry explicit Core ownership
and schema markers. Setup may create absent files, update supported owned
files, or migrate the exact legacy Prism configuration and workflow after
displaying the bounded diff. It never overwrites unowned, customized,
mixed-ownership, unsupported, or ambiguous files. Both managed files reach the
planned state atomically or neither changes before the durable commit point.
Adapters do not discover npm packages or own release setup.

### Lockstep authoring

The managed configuration declares `versionPolicy: "lockstep"` and a validated
non-empty list of release-managed package directories. When it is absent,
`/release` remains repository-only and prints no npm publication commands.

When it is present, `/release` sets every configured package version to the
confirmed repository version, including prereleases. The changelog and every
configured package manifest are staged as literal validated paths and committed
in the signed release commit. Independent per-package bump calculation,
path-specific git-cliff versioning, skipped unchanged packages, and
conversation-only bumped-package state are removed.

Before authoring, `/release` requires local `develop` to equal the fetched
`origin/develop` and requires fetched `origin/main` to be an ancestor of local
`develop`. A missing back-merge therefore blocks the next release. After
commit creation, `/release` prints one inert human-run npm publish command for
each configured package. Prism never authenticates to npm or publishes from
CI.

### Repository-first publication and reconciliation

Release CI validates the event, version, immutable merge SHA, changelog, and
checked-out configuration before publication. Every configured package must
have the repository release version in the reviewed merge. The workflow
prepares package notes without mutating refs, then publishes or recovers the
repository tag and GitHub Release before reconciling package tags.

Each package tag is deterministic: an absent tag is created at the merge SHA,
a tag already at that SHA is accepted, and a tag at any other commit fails
without deletion or movement. A rerun treats already-completed repository
publication as success and continues package-tag reconciliation.

After event and merge validation succeed, back-merge preparation remains
reachable independently of publication or package-tag success. The workflow
may open the `main` to `develop` pull request but never pushes a branch or
merges it. Workflow permissions remain exactly `contents: write` and
`pull-requests: write`.

### Historical recovery

Dispatch recovery accepts repository-only historical merges with no release
configuration and the exact legacy packages-only configuration shape after the
same package validation. Unsupported historical shapes fail closed. This
compatibility exists only to recover releases created before the managed
schema; new setup and authoring use the owned lockstep schema.

## Consequences

### Positive

- Repository and configured npm package versions have one unambiguous release
  identity.
- Package-tag collisions cannot suppress the repository tag and GitHub Release.
- Setup installs, updates, verifies, and migrates the complete capability
  without claiming human-owned workflow content.
- Release behavior is reusable by non-PHP repositories without adapter logic.
- Partial publication and reruns have deterministic reconciliation semantics.
- A stale `develop` branch is detected before release authoring rather than
  after the next release merge.

### Negative

- Configured packages can no longer version independently under this
  capability; repositories requiring independent versions need a different
  future capability.
- Prism Core owns a canonical workflow template, a managed-file schema, legacy
  recognition, locking, rollback, and parity tests.
- Every configured package receives a version-only manifest change on every
  repository release, even when its own source did not change.
- Back-merge preparation and publication become separate workflow outcomes
  that require explicit job/step dependency design and executable recovery
  tests.

### Neutral

- npm authentication, OTP handling, and publication remain human-owned.
- GitHub Actions remains the only automated tag and Release publisher; agents
  still never push branches or tags and never merge pull requests.
- The release-body cap, attached full changelog, and dispatch seam continue.
- No new dependency, credential, registry permission, or Pi extension is
  introduced.

## Alternatives Considered

### Keep independently versioned packages

Rejected. The authoring and publishing halves cannot durably agree on which
packages changed, unchanged package tags collide at earlier merge SHAs, and the
additional version streams provide no product benefit for Prism's configured
packages.

### Infer changed packages in CI

Rejected. Recomputing authoring intent after merge makes CI depend on history
interpretation and still leaves repository and package versions divergent.
The reviewed manifests are the durable release input.

### Publish package tags before the repository Release

Rejected. A package collision or API failure would continue to suppress the
repository's primary release artifact.

### Install only `.prism/release.json`

Rejected. Configuration alone does not provide the publication workflow and
would leave consumers in a partially configured, falsely enabled state.

### Let adapters own package-release setup

Rejected. npm package publication is not a PHP/web stack concern. Adapter
ownership would violate ADR-0058 and duplicate the capability across stacks.

### Overwrite similar or customized release files

Rejected. Similarity does not prove ownership. Only explicit supported markers
or exact legacy shapes/digests permit mutation; ambiguous files remain
human-owned.

<!-- vim: ft=markdown sts=4 sw=4 ts=4 et : -->
