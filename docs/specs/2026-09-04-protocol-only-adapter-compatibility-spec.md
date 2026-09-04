# Spec: Protocol-only adapter compatibility and release recovery

**Date:** 2026-09-04
**Status:** Approved

## Problem Statement

Prism v0.5.0 published adapter release metadata whose `coreRange` excludes Core v0.5.0. The downstream catalogue publisher correctly rejected that immutable evidence, so the release cannot become the stable external trust root needed for the review-authority cutover.

The range itself is unwanted policy. Maintaining a separate Core compatibility range for every lockstep adapter release makes release preparation harder and allows reviewed package versions to disagree with hand-authored compatibility metadata. Adapter compatibility should instead depend on the bootstrap protocol that Core and the adapter already declare.

The repository also packages the separate back-merge workflow required by ADR-0100 but does not deploy it. The v0.5.0 `main` to `develop` divergence required a manual pull request even though Core already owns the intended automation.

## Solution

Remove `coreRange` from every active release-authority schema. A signed catalogue release contains its stable version, bootstrap protocol, status, npm integrity, and publication time. Core selects the newest active stable release whose bootstrap protocol matches the protocol Core supports. If none matches, selection fails closed.

Keep publication version validation simple. The publisher independently proves that the requested GitHub and npm release exists. If the adapter has no recorded release, it accepts the version. Otherwise, it accepts the release only when its stable semantic version is greater than the latest recorded version. Equal and lower versions are rejected.

Use a one-way catalogue migration. The prepared publisher can read the current range-based source and signed payload, and scheduled renewal preserves that schema until the corrected release arrives. Qualifying no-range release evidence migrates all retained entries to the protocol-only schema and drops historical ranges. Merging the resulting signed catalogue pull request replaces the old schema in place. This is an explicit compatibility cutoff: Core v0.5.0 fails closed afterward and users must upgrade manually.

Deploy the existing Core-owned back-merge workflow separately from release publication. Recover through v0.5.1 without rewriting the v0.5.0 tag, GitHub Release, or evidence.

## User Stories

1. As a release maintainer, I want adapter declarations without hand-authored Core ranges, so that a lockstep release cannot exclude itself through stale compatibility metadata.
2. As a release maintainer, I want publication to accept the first adapter release or a version greater than the previous release, so that the release rule is easy to understand and verify.
3. As a Prism user, I want Core to select adapters by bootstrap protocol, so that compatibility has one explicit runtime discriminator.
4. As a Prism user, I want selection to reject inactive, prerelease, or protocol-mismatched releases, so that absence of a suitable adapter never becomes an unsafe fallback.
5. As a catalogue maintainer, I want immutable GitHub and npm evidence verified before version comparison, so that version ordering does not replace provenance checks.
6. As a catalogue maintainer, I want equal and lower incoming versions rejected, so that publication cannot replay or downgrade an adapter release.
7. As a catalogue maintainer, I want ordinary renewal to preserve the old schema before cutover, so that deploying publisher support does not cut off clients early.
8. As a catalogue maintainer, I want qualifying v0.5.1 evidence to migrate the complete retained catalogue atomically, so that signed state cannot contain mixed range-based and protocol-only entries.
9. As a Core v0.5.0 user, I want the cutoff documented, so that a fail-closed catalogue response has a clear upgrade path.
10. As a Prism maintainer, I want the packaged back-merge workflow deployed canonically, so that every successful merge to `main` can open or reuse a human-merged pull request into `develop`.
11. As a Prism maintainer, I want release publication and back-merge automation to remain separate, so that hotfix and ordinary production merges receive the same back-merge behavior.
12. As a Prism maintainer, I want v0.5.1 to provide new immutable package and catalogue evidence, so that recovery does not alter the failed v0.5.0 release.
13. As a Prism maintainer, I want publication, push, pull-request creation, merge, package installation, and catalogue activation to remain human-controlled at their existing boundaries.

## Implementation Decisions

### Release declarations and evidence

The managed release configuration advances to a new closed schema. Adapter declarations contain only package identity, adapter identity, display name, bootstrap protocol, and status. `coreRange` is invalid rather than optional. Legacy managed configuration is migrated deliberately; unknown or mixed shapes fail closed.

Release CI repeats the closed-schema checks against the immutable merge candidate. It confirms lockstep package versions, exact adapter package metadata, and protocol agreement, then emits bounded local evidence without a compatibility range. The cross-repository notification remains an inert version and merge-commit hint. The downstream publisher continues to derive authority independently from the immutable GitHub Release, tags, commit, release configuration, package manifests, and npm metadata.

### Protocol-only catalogue

The catalogue source and signed payload advance to a closed protocol-only schema. Source releases contain stable version, bootstrap protocol, and status. Hydrated signed releases add exact npm integrity and publication time. Catalogue and envelope bounds, canonical serialization, expiry, sequence, signature, key custody, and publication-state checks remain unchanged.

Core accepts the protocol-only payload schema and removes range parsing and satisfaction checks. Selection filters releases by active status, stable semantic version, and exact bootstrap protocol, then chooses the highest version. No matching release is an error.

The bootstrap protocol is compatibility metadata, not a version-ordering namespace. The publisher does not reset version history when a protocol changes.

### Simple increasing-version rule

For each incoming adapter release, the publisher first completes the existing immutable GitHub and npm evidence checks. It then reads the latest semantic version already recorded for that adapter. With no prior release, the incoming version is accepted. With a prior release, the incoming version must be semantically greater. Equal or lower versions fail before payload preparation, signing, or Git mutation.

The release path continues to accept stable `major.minor.patch` versions only. It does not add prerelease publication, compatibility inference, range generation, status-specific ordering, or protocol-specific ordering.

### One-way schema migration

The downstream publisher must be ready before v0.5.1 is released. Its migration reader accepts the currently verified range-based source and payload solely as legacy input. Scheduled and manually requested renewal preserve that format while it remains current.

When the publisher verifies a qualifying no-range Prism release, it drops `coreRange` from every retained historical release, adds the new release, emits only the protocol-only source and payload schemas, and signs the complete result. It never emits a mixed catalogue. Once protocol-only state is current, range-based input and downgrade attempts fail closed.

The signed catalogue keeps its current public path. Merging the protocol-only catalogue pull request is the explicit Core v0.5.0 cutoff. There is no parallel legacy endpoint. Release notes and migration documentation tell v0.5.0 users to install v0.5.1 before using catalogue-backed setup again.

### Architecture authority

This change supersedes the range-based compatibility parts of ADR-0092, ADR-0095, and ADR-0099 while preserving their signature, provenance, immutable-evidence, and human-publication boundaries. ADR-0100 remains authoritative for separate back-merge automation. The downstream catalogue repository must adopt the new immutable Prism decision in a local superseding ADR before implementation because its current ADR pins the prior upstream contract.

### Back-merge deployment

The repository deploys the packaged Core back-merge workflow byte-for-byte at the managed root path. The release workflow retains no back-merge steps and no pull-request write permission. The separate workflow runs after a pull request is merged into `main`, serializes attempts, reuses an existing open `main` to `develop` pull request, and otherwise opens one for human review and merge.

The v0.5.0 divergence is already resolved by manual PR #505. The v0.5.1 merge is the first expected automatic run. If GitHub does not schedule a workflow introduced by that same merge event, a human opens one final manual back-merge pull request; later production merges use the deployed workflow.

### Recovery sequence

The recovery order is:

1. approve and merge the Prism specification, superseding ADR, and implementation into `develop`;
2. adopt that immutable authority and merge the prepared publisher migration into the downstream default branch;
3. confirm renewal still preserves the current range-based catalogue;
4. prepare, verify, review, and human-merge release v0.5.1 into `main`;
5. publish the exact Core and PHP/web v0.5.1 packages to npm;
6. let the downstream release-mode publisher verify the immutable evidence, retrying at the unchanged merge commit if npm visibility lagged;
7. review and human-merge the signed protocol-only catalogue pull request;
8. verify or manually recover the `main` to `develop` back-merge;
9. install exact v0.5.1 packages outside the reviewed repository and run the review doctor; and
10. resume the separate ADR-0103 authority-cutover work only after those checks pass.

Before the catalogue pull request merges, the existing signed catalogue remains authoritative and failed attempts are safe to retry. After the cutoff, failures are repaired forward with a newly reviewed and signed sequence; the range-based schema is not restored.

## Testing Decisions

Tests use the highest existing public boundaries.

- Package-release inspection, apply, and verification tests prove migration to the no-range managed schema, reject optional or extra range fields, and preserve closed records.
- Executable release-workflow tests prove immutable package and protocol agreement, bounded no-range evidence, stable-version grammar, and the absence of embedded back-merge behavior.
- Catalogue verification and supported-adapter selection tests prove protocol-only payload validation, highest matching release selection, and fail-closed behavior for old, mixed, malformed, inactive, prerelease, and protocol-mismatched records.
- Downstream trigger-preparation integration tests begin from a verified schema-one catalogue. Renewal must preserve schema one; qualifying v0.5.1 evidence must produce a complete schema-two candidate without ranges.
- Downstream evidence tests prove the first-release case and one `incoming > previous` comparison after GitHub and npm evidence succeeds. Equal and lower versions must stop before signing and publication.
- Protected publication tests continue to prove canonical source-to-payload equality, signature verification, immutable sequence branches, bounded retries, and human-only catalogue pull-request merge.
- Automation reconciliation tests prove the root back-merge workflow is byte-identical to the packaged canonical workflow. Repository contract tests fail when the root workflow is absent or drifted.
- The end-to-end release proof uses exact v0.5.1 GitHub, npm, signed-catalogue, external-installation, and doctor evidence. No test-only provider or runtime dependency is added.

Prior art is the existing package-release discovery suite, executable release-workflow shell suite, adapter-catalogue validation and selection suite, automation-provider suite, and the downstream evidence, payload, trigger, signing, and publication suites.

## Out of Scope

- Rewriting or republishing v0.5.0 evidence.
- Supporting Core v0.5.0 after the protocol-only catalogue cutover.
- Maintaining parallel legacy and protocol-only catalogue endpoints.
- Inferring compatibility from package major versions or generating compatibility ranges.
- Adding prerelease adapter publication.
- Weakening signature verification, public-evidence checks, expiry, sequence ordering, protected signing, or canonical publication.
- Moving back-merge behavior into the release workflow.
- Resolving setup issue #501 as part of this change.
- Implementing the ADR-0103 review-authority cutover.
- Giving the agent authority to push, create or merge pull requests, publish packages, install the stable trust root, or activate a catalogue publication.

## Further Notes

Wayfinder map #506 records the research and decisions behind this specification. Its child tickets identify the current range-based producer and consumer surface, the accepted old-client cutoff, the one-way migration, the separate back-merge deployment, and the release order.

The change adds no runtime dependency. Both repositories already use semantic-version comparison at their release or catalogue boundaries.

<!-- vim: ft=markdown sts=4 sw=4 ts=4 et : -->
