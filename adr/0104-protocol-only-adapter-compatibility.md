# 0104. Protocol-only adapter compatibility

Date: 2026-09-04

## Status

Accepted

Partially supersedes ADR-0092's Core semantic-version range requirement and
Core-version filtering. Partially supersedes ADR-0095's reviewed compatibility
range and same-version replacement rules. Extends ADR-0099's immutable
catalogue-notification handoff. Their signature, provenance, expiry, sequence,
protected publication, exact package acquisition, and human-control decisions
remain accepted.

## Context

Prism publishes Core and its PHP/web adapter in lockstep, but the supported
adapter catalogue also requires each release to carry a hand-authored
`coreRange`. Release v0.5.0 retained `>=0.4.1 <0.5.0`, which excludes the Core
version released beside the adapter. The downstream publisher correctly
rejected the immutable evidence, leaving v0.5.0 unsuitable as the installed
trust root required for the review-authority cutover.

The range duplicates a compatibility decision already represented by the
bootstrap protocol. Keeping both controls increases release work and permits
reviewed package versions, protocol metadata, and compatibility metadata to
disagree. The desired publication rule is simpler: prove that the release
exists, then require its stable semantic version to be greater than the
previous release when one exists.

The current boundary is closed and signed. Prism release configuration schema
two, downstream catalogue source and payload schema one, and Core v0.5.0 all
require `coreRange`. Removing the field in place therefore creates a deliberate
compatibility cutoff. The operator accepts that Core v0.5.0 will fail closed
against the new catalogue and must be upgraded manually rather than requiring
parallel legacy publication.

## Decision

We make `bootstrapProtocol` the sole adapter compatibility discriminator and
remove `coreRange` from the active release-authority contract.

A release-managed adapter declaration contains its package path, stable adapter
identity, display name, bootstrap protocol, and publication status. Prism
release CI independently verifies that the reviewed package manifest has the
release version, adapter marker, and exact declared protocol. No release
configuration, local release evidence, downstream source record, signed
catalogue record, setup display, or selection result contains or derives a Core
compatibility range.

Core accepts the protocol-only signed catalogue schema. It filters releases by
ACTIVE status, stable semantic version, and exact supported bootstrap protocol,
then selects the highest version. Absence of a matching release fails closed.
Installed projects remain pinned to the exact selected adapter until a separate
explicit upgrade changes them.

Because the protocol is now the only mechanical compatibility boundary, every
backward-incompatible change to the Core-to-adapter bootstrap contract requires
a new positive integer bootstrap protocol. Core and the adapter must implement
and declare the same protocol before the release is eligible. Publication does
not infer compatibility from package major versions and does not partition
version history by protocol.

The downstream publisher retains all existing immutable GitHub Release,
commit, tag, package-manifest, npm integrity, signing, sequence, expiry, and
publication-state checks. After those checks establish that an incoming stable
release exists, version admission has one rule:

1. if the adapter has no recorded release, accept the incoming version;
2. otherwise identify the latest recorded semantic version and require the
   incoming version to be greater; and
3. reject equal or lower versions before payload preparation, signing, or Git
   mutation.

There is no status-specific, protocol-specific, or range-based version policy.
Prereleases remain outside the catalogue release path.

We use a one-way in-place schema migration. The downstream publisher is updated
before Prism v0.5.1 is released. While the current range-based catalogue remains
authoritative, renewal preserves its schema and does not trigger migration.
When the publisher verifies qualifying no-range Prism release evidence, it
drops `coreRange` from every retained historical release, adds the new release,
and atomically prepares only the protocol-only source and signed payload. Mixed
schemas fail closed.

The human merge of that signed catalogue pull request is the compatibility
cutoff. Core v0.5.0 rejects the new schema and users must upgrade manually. Core
v0.5.1 rejects the old schema during the bounded release-to-catalogue interval
and becomes operational for catalogue-backed setup after the new catalogue is
merged. After cutover, recovery moves forward through a newly reviewed and
signed sequence; the range-based schema is not restored.

The downstream repository must adopt this immutable decision in its own
superseding ADR before implementation. Prism remains notification authority
only: it supplies an inert version and merge-commit hint, while the publisher
reconstructs all release authority independently. Humans continue to push,
publish npm packages, review and merge pull requests, install packages, and
activate catalogue publication.

## Consequences

- **Positive:** release preparation has one compatibility field and one simple
  version comparison instead of a duplicated Core range policy.
- **Positive:** stale range text cannot exclude a lockstep release.
- **Positive:** adapter selection remains deterministic, signed,
  protocol-bound, integrity-bound, and exactly pinned.
- **Positive:** the publisher retains independent public-evidence validation
  and rejects replay or downgrade before signing.
- **Negative:** every incompatible Core-to-adapter bootstrap change now depends
  on maintainers incrementing and implementing the bootstrap protocol
  correctly.
- **Negative:** the in-place schema transition deliberately ends catalogue
  discovery for Core v0.5.0 and has no compatibility overlap window.
- **Negative:** the publisher needs a one-way legacy reader until the existing
  source and payload are migrated.
- **Negative:** after cutover, restoring the old catalogue schema is not a safe
  rollback; failures require forward repair.
- **Neutral:** catalogue keys, signatures, expiry, sequence allocation,
  protected signing and publication custody, package integrity, exact pins,
  and human-only merge remain unchanged.
- **Neutral:** this decision adds no dependency, credential, endpoint, package,
  or automated merge authority.

## Alternatives Considered

### Keep a broad Core range

Rejected because even `>=0.4.1 <10.0.0` remains separately maintained policy
that can drift from the package and protocol declarations.

### Generate a Core range automatically

Rejected because generated ranges still duplicate protocol compatibility and
would make version shape stand in for an explicit runtime contract.

### Accept every newer release without a protocol check

Rejected because semantic version ordering does not prove that Core can invoke
the adapter bootstrap interface.

### Maintain parallel legacy and protocol-only catalogues

Rejected by explicit operator choice. It would avoid the Core v0.5.0 cutoff but
would add endpoints, dual publication, migration duration, and rollback states
to a release process intended to become simpler.

### Replace the catalogue schema before the publisher is prepared

Rejected because the current publisher would reject the evidence, renewal
could cut clients off early, and partial state could cross the signing
boundary.

<!-- vim: ft=markdown sts=4 sw=4 ts=4 et : -->
