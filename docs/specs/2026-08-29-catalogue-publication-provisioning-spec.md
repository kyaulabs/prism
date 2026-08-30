# Spec: Catalogue Publication Provisioning

**Date:** 2026-08-29
**Status:** Draft

## Problem Statement

Prism and the adapter publisher need account-owned authentication for catalogue notification and publication. The previously approved GitHub App design does not match the required operating model. Authentication must be owned by `kyaulabs-bot` without exposing credential values to agents, repositories, tests, logs, issues, or readiness evidence.

One credential with Actions, Contents, and Pull Requests write authority would let the Prism release job mutate publisher branches and pull requests. That would collapse the authority separation between release notification and catalogue publication. The design must preserve two independently scoped runtime authorities while using fine-grained personal access tokens.

The two existing fine-grained PATs are non-expiring and have no planned rotation. This increases long-lived credential risk. The system must keep that accepted debt visible without pretending it is a healthy rotating-credential posture.

## Solution

Use two fine-grained PATs owned by `kyaulabs-bot`, with resource owner `kyaulabs` and repository selection limited to `kyaulabs/prism-adapters`.

The dispatch PAT grants only Actions write. Prism stores it as protected-environment secret `CATALOGUE_DISPATCH_TOKEN` and uses it only to call the fixed publisher workflow on `main` through `workflow_dispatch`.

The publication PAT grants only Contents write and Pull Requests write. The publisher stores it as protected-environment secret `CATALOGUE_PUBLICATION_TOKEN` and uses it only after evidence validation, synthetic-key tests, production signing, and reverification. Publisher code treats the token as opaque and does not mint another token, assume a token prefix, write it to a file, or expose it in diagnostics.

Readiness never receives either credential value. Human-supplied non-secret evidence records credential type, credential owner, resource owner, selected repository, exact permission map, null expiration, and the explicitly accepted absence of rotation. Wrong scope or combined authority fails readiness. Non-expiry and no rotation remain visible as `ADVISORY` checks that do not block the explicitly approved design.

`CATALOGUE_SIGNING_ENABLED` remains absent throughout migration and provisioning. Publisher PAT support reaches protected `main` before Prism dispatch PAT support is activated. Issue #469 owns the first credential-bearing production publication.

## User Stories

1. As a maintainer, I want catalogue automation credentials owned by `kyaulabs-bot`, so that machine authentication has a clear human-administered account owner.
2. As a security maintainer, I want dispatch and publication to use separate fine-grained PATs, so that the Prism release runtime cannot mutate publisher contents or pull requests.
3. As a release maintainer, I want the dispatch PAT restricted to `prism-adapters` and Actions write, so that it can wake the fixed publisher workflow without repository mutation authority.
4. As a publisher maintainer, I want the publication PAT restricted to `prism-adapters` and Contents/Pull Requests write, so that it can create only the publication branch and pull request operations implemented by trusted publisher code.
5. As an operator, I want PAT values entered only through protected GitHub environments, so that agents and repository files never receive them.
6. As a reviewer, I want readiness to validate human-supplied non-secret scope metadata, so that token separation is reviewable without token access.
7. As a reviewer, I want non-expiring and unrotated credential risk reported explicitly, so that accepted debt remains visible for later refactoring.
8. As an incident responder, I want independent revocation and replacement procedures, so that exposure of one PAT does not require exposing or replacing the other.
9. As a repository maintainer, I want protected `main` branches with no workflow bypass actor, so that PAT ownership does not bypass human merge control.
10. As a successor maintainer, I want an out-of-band account and credential custody handoff, so that repository documentation contains no credential values or storage locations.

## Implementation Decisions

### Credential profiles

The dispatch credential metadata is exactly:

- type `FINE_GRAINED_PAT`;
- credential owner `kyaulabs-bot`;
- resource owner `kyaulabs`;
- selected repositories: only `kyaulabs/prism-adapters`;
- repository permissions: Actions write only;
- no expiration;
- rotation policy `NONE_ACCEPTED`.

The publication credential metadata is exactly:

- type `FINE_GRAINED_PAT`;
- credential owner `kyaulabs-bot`;
- resource owner `kyaulabs`;
- selected repositories: only `kyaulabs/prism-adapters`;
- repository permissions: Contents write and Pull Requests write only;
- no expiration;
- rotation policy `NONE_ACCEPTED`.

A single credential carrying all three write permissions is invalid. Adding repositories, permissions, or another resource owner is invalid. Changing to one combined credential requires a new explicit security-boundary decision.

### Prism dispatch

Prism keeps the fixed Actions-only workflow-dispatch transport. The release notification job runs in protected environment `catalogue-dispatch` and exposes `CATALOGUE_DISPATCH_TOKEN` only to the dispatch step as `GH_TOKEN`. The job targets the fixed publisher repository, workflow, and `main` ref with the closed release inputs already accepted by the publisher.

The workflow removes GitHub App ID, private-key, and token-minting behavior. Pull requests, preceding release jobs, and unrelated workflows receive no dispatch PAT.

### Publisher publication

The existing `catalogue-signing` environment continues to protect the encrypted Ed25519 signing key and its separate passphrase. It additionally stores `CATALOGUE_PUBLICATION_TOKEN`.

The protected publication command consumes the PAT as an opaque environment value only after signing and reverification. GitHub App JWT construction, installation discovery, App permission responses, App ID configuration, and installation-token minting are removed. Existing publication state validation, immutable sequence branches, no-force behavior, and human-only pull-request merge remain unchanged.

The publisher change is implemented and reviewed in the `prism-adapters` project before the Prism-side credential migration is activated.

### Readiness and evidence

Readiness checks API-visible workflow, ruleset, environment, secret-name, activation, and SHA-pinning metadata. It consumes one fixed ignored local attestation containing only the two closed credential metadata records, retention status, administrator review, and recovery-custody review.

Readiness statuses are:

- `PASS` for proved or exactly attested required controls;
- `FAIL` for missing, malformed, ambiguous, over-broad, combined, or mismatched authority;
- `MANUAL` when required human evidence is absent;
- `ADVISORY` for the explicitly accepted non-expiring and no-rotation posture.

`GO` permits `PASS` and `ADVISORY` only. `FAIL` or `MANUAL` produces `NO-GO`. Output never includes token values, API response bodies, credential-shaped strings, or unrelated metadata.

### Migration and activation

1. Keep `CATALOGUE_SIGNING_ENABLED` absent.
2. Implement, review, and merge publisher direct-PAT support.
3. Implement, review, and merge Prism direct-PAT dispatch support.
4. Verify both PAT metadata profiles in the GitHub UI without sharing values.
5. Enter each PAT directly into its owning protected environment.
6. Run pre-activation readiness and one disabled-state release dispatch.
7. Enable production only after all blocking checks pass.
8. Leave first production publication and raw-endpoint verification to issue #469.

### Exposure and future migration

Suspected exposure immediately disables catalogue signing and revokes only the affected PAT. Human maintainers review `kyaulabs-bot`, organization access, selected repositories, permission grants, audit events, workflow revisions, and unexpected publication state before replacing the credential and rerunning readiness.

The absence of expiration and rotation is accepted for the current implementation, not established as a preferred credential policy. A future change may adopt expiration, scheduled rotation, or a different machine identity through a new reviewed design.

## Testing Decisions

Prism workflow tests verify direct use of `CATALOGUE_DISPATCH_TOKEN`, the fixed Actions workflow dispatch, exact closed inputs, environment isolation, and complete absence of App-token minting and App configuration.

Publisher tests verify direct use of `CATALOGUE_PUBLICATION_TOKEN` at the protected publication boundary, unchanged bounded GitHub mutations, no token persistence or logging, and removal of JWT, App ID, installation discovery, and installation-token minting behavior.

Readiness tests cover both exact credential profiles, secret-name presence, combined-authority rejection, extra repository or permission rejection, owner/resource-owner mismatch, malformed evidence, missing evidence, advisory non-expiry/no-rotation reporting, redacted diagnostics, and active/pre-activation states.

Documentation tests require exact human setup, disabled migration order, independent revocation, exposure response, accepted credential debt, and future migration guidance. Tests reject credential values and shell instructions that place PATs in command arguments or repository files.

## Out of Scope

- Requesting, reading, printing, copying, validating, or storing PAT values in agent context or repository files.
- One PAT with combined Actions, Contents, and Pull Requests write authority.
- Adding expiration or rotation to the currently approved PATs.
- Agent-driven token creation, environment mutation, secret entry, activation, revocation, or account administration.
- Changing catalogue evidence validation, signing algorithms, sequence allocation, or human-only pull-request merges.
- First production publication, which remains issue #469.

## Further Notes

- Originating issue: #468.
- ADR-0097 supersedes ADR-0096's GitHub App authentication decision while retaining Actions-only workflow dispatch.
- ADR-0094 continues to govern signing-key and passphrase custody.
- ADR-0095 continues to govern independent publisher validation, sequence safety, bounded publication, and human merge.

<!-- vim: ft=markdown sts=4 sw=4 ts=4 et : -->
