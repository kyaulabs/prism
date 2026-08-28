# Spec: Automated Signed Adapter Catalogue Publication

**Date:** 2026-08-28
**Status:** Draft

## Problem Statement

Strict-empty Prism setup depends on a fresh, valid supported-adapter catalogue at a fixed public GitHub URL. The publisher can currently prepare, sign, and verify that catalogue only through a local human-operated process. A missed renewal leaves new projects unable to discover the PHP/web stack adapter after the six-day validity window.

Prism releases and catalogue publication also have separate evidence paths. A GitHub Release and package tags do not prove that npm publication has completed, and npm metadata does not establish the reviewed Core compatibility range or bootstrap protocol. Automating publication must combine those authorities without trusting dispatch text, npm tags such as `latest`, pull-request code, or mutable branch state.

The automation must keep `main` PR-only in both repositories. It must never let a release workflow write directly to a protected branch or merge its own publication pull request. Moving signing into GitHub Actions also expands the production signing trust base and requires explicit controls for secret custody, event provenance, permissions, concurrency, recovery, and key rotation.

## Solution

Prism will carry a closed, reviewed adapter compatibility declaration in each release commit. After a stable repository Release and package-tag reconciliation succeed, Prism will send a minimal cross-repository dispatch identifying the release version and immutable merge commit. The dispatch is a wake-up signal, not catalogue authority.

The adapter publisher will own release-triggered publication, a three-day renewal schedule, and manual recovery. Every run will independently verify the trusted Prism release commit, package tag, reviewed compatibility declaration, and exact public npm package metadata. Release-triggered publication will merge the validated exact adapter release into the release set from the attested current catalogue. Scheduled renewal will preserve that verified release set while refreshing npm evidence and the six-day validity window. Neither path will infer compatibility from SemVer or silently remove another active release.

Signing will occur only in a protected default-branch GitHub Actions job. The encrypted PKCS#8 Ed25519 key and its passphrase will be separate protected-environment secrets. Pull-request jobs, reusable workflows, untrusted checkouts, and dispatch-controlled code will receive neither secret. The signing job will use trusted publisher code, synthetic keys for all preceding tests, explicit least-privilege permissions, masked output, disabled debug tracing, bounded log retention, and serialized execution.

The publisher will create a sequence-specific work branch and open one human-merged pull request to `main` containing the deterministically rendered source policy and signed catalogue. It will never push `main`, force-push a publication branch, enable auto-merge, or merge the pull request. A dedicated GitHub App will grant Prism only cross-repository dispatch authority and grant the publisher only the branch-content and pull-request authority needed in the adapter repository.

## User Stories

1. As a new Prism user, I want `/setup` to find a fresh supported-adapter catalogue, so that I can select the PHP/web stack adapter without waiting for manual catalogue maintenance.
2. As a Prism release maintainer, I want each release commit to carry reviewed adapter compatibility metadata, so that catalogue automation does not infer compatibility from version numbers.
3. As a release maintainer, I want successful stable releases to request catalogue publication automatically, so that newly published adapter releases become discoverable promptly.
4. As a release maintainer, I want npm propagation failures to retry for a bounded period and then fail closed, so that a partial release never becomes signed catalogue authority.
5. As an operator, I want later schedules and manual recovery to recompute from authoritative state, so that transient npm or GitHub failures do not require editing signed data by hand.
6. As an operator, I want renewal every three days against a six-day validity window, so that one missed run leaves time for recovery before expiry.
7. As a security maintainer, I want production signing secrets isolated in a protected environment, so that pull requests and untrusted workflow code cannot exercise signing authority.
8. As a security maintainer, I want the encrypted signing key and passphrase stored separately, so that disclosure of one secret does not immediately disclose usable key material.
9. As a security maintainer, I want every production signature verified against Core's committed public trust root before publication, so that a wrong or rotated key fails before branch mutation.
10. As a repository maintainer, I want catalogue automation to open a normal pull request, so that protected-branch rules and human merge control remain intact.
11. As a reviewer, I want the publication pull request to contain both rendered source policy and the signed envelope, so that I can compare reviewed release evidence with the exact public result.
12. As an operator, I want duplicate dispatches and scheduled runs to be idempotent, so that retries do not create conflicting signatures or duplicate pull requests.
13. As an operator, I want sequence allocation bound to an attested `main` commit, so that concurrent or stale jobs cannot publish different envelopes at the same sequence.
14. As a maintainer of older supported Core releases, I want previously active adapter releases preserved unless reviewed evidence explicitly changes their status, so that publishing a newer adapter does not silently remove compatibility.
15. As an incident responder, I want documented signing-key exposure and rotation procedures, so that suspected compromise leads to an immediate Core trust-root release rather than unsafe continued signing.

## Implementation Decisions

### Prism release authority

Prism Core owns a schema-versioned adapter release declaration as part of the package-release capability. The declaration is a closed mapping from each catalogued release-managed adapter package to:

- adapter ID;
- display name;
- exact package identity;
- reviewed Core compatibility range;
- bootstrap protocol;
- publication status.

The package version is not duplicated as discretionary metadata. It comes from the validated release-managed package manifest and must equal the repository release version. The declaration may identify only release-managed public packages and may not supply URLs, commands, credentials, registry origins, integrity, publication timestamps, or arbitrary fields.

Local release authoring and the canonical release workflow validate the declaration before the release branch is merged. Setup-managed package-release installation treats the declaration schema and its workflow handling as Core-owned state. Existing consumers without a catalogue declaration require an explicit supported migration rather than silent inference.

Only stable repository releases are eligible. Prereleases do not dispatch or enter the public catalogue. The repository Release, package tag, package manifest version, declaration, and immutable merge commit must agree.

### Cross-repository transaction

The Prism release workflow sends a cross-repository dispatch only after repository Release publication and package-tag reconciliation succeed. The dispatch contains the minimum inert identifiers needed to locate the release: schema version, repository identity, stable version, and immutable merge commit. It contains no compatibility values, package integrity, commands, or signing input.

The publisher treats every dispatch field as untrusted. It validates the closed dispatch schema, then independently retrieves the named Prism Release, immutable commit, package tag, package manifest, and compatibility declaration. Any mismatch, mutable-ref substitution, prerelease, unknown field, wrong repository, malformed value, unavailable evidence, or partial release state fails closed.

A dedicated GitHub App supplies installation tokens with separate least-privilege repository grants:

- the Prism side may dispatch only to the adapter publisher;
- the publisher side may create its publication branch and pull request only in the adapter repository;
- neither side may merge pull requests, modify repository administration, access npm credentials, or widen permissions from event data.

The long-lived App authentication material used to mint installation tokens is protected credential state. It is unavailable to pull requests and untrusted jobs, stored in protected GitHub secret scope, masked, excluded from caches, artifacts, outputs, and summaries, and covered by rotation and exposure response. Administrators able to replace it are part of the automation trust base. If current GitHub token narrowing cannot enforce the two runtime authority profiles under one App identity, provisioning must use separate App identities rather than broadening either workflow.

Current GitHub App, environment-secret, token-expiry, and event-trigger semantics must be verified against current GitHub documentation before implementation. The accepted design must not rely on `GITHUB_TOKEN` behavior that suppresses required downstream checks.

### Publisher evidence and source rendering

The publisher has three triggers: validated Prism dispatch, a three-day schedule, and an explicit manual recovery dispatch. All triggers converge on one evidence-validation and publication transaction.

For a release-triggered run, the publisher:

1. attests the current remote `main` commit and verifies its signed catalogue, allowing expiry only for sequence recovery;
2. validates the immutable Prism release and compatibility declaration;
3. requires the matching package tag at the release merge commit;
4. retrieves the exact npm package version and canonical SHA-512 integrity plus publication time from the fixed public npm registry;
5. adds or replaces that exact adapter release in the existing verified release set while preserving unrelated releases and statuses;
6. renders the complete catalogue source deterministically.

For scheduled renewal, the publisher starts from the release set in the verified current catalogue, revalidates every exact npm release, and renders equivalent source policy with a fresh sequence and validity window. It does not select `latest`, discover arbitrary packages, infer compatibility, change status, or remove releases.

Registry availability receives a short bounded retry window with fixed backoff and an overall timeout. Exhaustion fails before signing or Git mutation. A later dispatch, schedule, or manual recovery recomputes from the current authoritative state.

### Protected signing environment

Production signing runs only from the trusted publisher default-branch workflow after all unprivileged validation and tests pass. The production job checks out or otherwise binds to the exact trusted default-branch workflow revision; dispatch data and pull-request branches cannot select executable signing code.

The protected environment holds two separate secrets: the encrypted PKCS#8 Ed25519 private key and its passphrase. The job reconstructs key material only in a runner-private temporary location, sets restrictive permissions, prevents shell tracing, masks sensitive values, emits no key-derived bytes, and removes temporary material on every exit path. Production secrets are unavailable to pull-request workflows, reusable workflows, synthetic-key tests, and evidence-validation jobs.

The signing implementation must:

- require encrypted PKCS#8 Ed25519 material;
- derive the public key and match Core's trusted SPKI fingerprint and key ID;
- sign the exact prepared payload bytes;
- verify the completed envelope before any remote branch mutation;
- avoid placing secrets in command arguments, environment dumps, artifacts, caches, step outputs, summaries, or logs;
- use short retention and upload no signing work product other than the public source and envelope intended for the pull request.

Unattended signing intentionally adds merged workflow code and administrators with protected-environment secret authority to the production signing trust base. Environment reviewers are not required because they would defeat unattended renewal. This trust expansion must be recorded in a superseding ADR.

### Sequence, concurrency, and idempotency

Every dispatch, schedule, and manual recovery run shares one publisher-repository concurrency group with cancellation disabled.

A run derives exactly `current sequence + 1` from a signature-verified catalogue at an attested current `main` commit. It binds the prepared source, payload, envelope, and publication intent to that base commit. Immediately before publication-branch creation, it rechecks remote `main`; movement aborts without signing another remotely visible envelope and leaves the next run to recompute.

Only one open publication pull request is allowed. Publication uses a sequence-specific branch, atomic branch creation, and no force push.

- If no publication branch or pull request exists, the run creates the branch and opens the pull request.
- If the sequence branch already contains the exact valid desired source and envelope, the run may recover by opening the missing pull request or report idempotent success.
- If an open pull request already contains the exact valid desired source and envelope, the run reports idempotent success.
- If a branch or open pull request contains different bytes, a different base, an invalid envelope, or conflicting sequence state, the run fails closed for human resolution.
- A run never overwrites remotely visible bytes for an existing sequence.

An unchanged adapter release still produces a new sequence and six-day validity window after the previous publication pull request merges. If the previous publication pull request remains open, later runs do not supersede it.

### Pull-request publication

The publication pull request targets `main` and includes:

- deterministic catalogue source policy;
- the public signed envelope;
- sequence, issue and expiry times;
- base commit and evidence commit identities;
- adapter package/version, compatibility, bootstrap protocol, status, npm integrity, and publication time;
- trigger class and recovery/idempotency result.

The workflow never writes `main`, enables auto-merge, merges the pull request, bypasses branch protection, or force-pushes. Human review and merge remain required. Existing protected-branch provenance checks continue to apply after merge.

### Recovery and key rotation

Manual recovery accepts only the same closed stable-version and immutable-commit identifiers as release dispatch, or an explicit renewal mode that recomputes from current `main`. It cannot supply compatibility, sequence, package identity, registry origin, branch name, or payload bytes.

Suspected key exposure stops production signing. Recovery requires a Prism Core release that adds or replaces the trusted public key, propagation of that Core release, protected-environment secret replacement, and only then publication under the replacement key. The catalogue cannot revoke its own signing key.

## Testing Decisions

The highest test seam is the public workflow transaction: trusted release evidence enters, and the publisher either produces one verified publication pull-request candidate or fails without remote mutation. Production secrets are never used in tests.

### Prism Core

- Unit tests validate the closed compatibility declaration schema, release-managed package mapping, stable-version rules, and migration behavior.
- Existing package-release transaction tests verify that setup installs and updates the complete owned release capability atomically.
- Release workflow drift guards verify trigger ordering, dispatch placement after successful repository/package publication, minimal permissions, stable-release exclusion, fixed destination, and absence of npm publication or signing secrets.
- Extracted workflow-step tests exercise malformed declarations, wrong package versions, prereleases, tag mismatches, and dispatch payload construction as inert data.

### Adapter publisher

- Unit tests extend the existing payload and envelope seams for release-set preservation, deterministic source rendering, exact npm evidence, stable-release rejection, bounded retries, expired-catalogue sequence recovery, and signature verification.
- Evidence-client tests use bounded fake GitHub and npm responses to cover wrong repositories, mutable refs, Release/tag/manifest disagreement, malformed declarations, redirects, oversized responses, timeouts, and unknown fields.
- Publication-state tests model base movement, duplicate dispatches, one-open-PR enforcement, exact branch recovery, conflicting same-sequence bytes, and no-force behavior.
- Workflow drift guards verify the three triggers, shared non-cancelling concurrency group, trusted-default-branch production job, protected environment, explicit job permissions, secret isolation, disabled debug output, GitHub App scope separation, no direct `main` write, and no merge or auto-merge operation.
- Integration tests run the complete prepare/sign/verify transaction with ephemeral encrypted PKCS#8 keys and fake GitHub/npm boundaries. They assert that only public source and envelope bytes reach the proposed publication branch.
- A post-merge smoke check verifies HTTP 200 at the fixed raw catalogue URL and verifies the returned envelope against the Core trust root. It reports failure but does not bypass the human merge or rewrite `main`.

Prior art includes the existing release workflow drift guard and package-release transaction tests in Prism, plus the publisher's current CLI, payload, envelope, safe-file, secret-prompt, and synthetic-key tests.

## Out of Scope

- Automating private-key generation, importing existing key material, or exposing credential values to agents.
- Automating npm authentication or publication; npm publication remains human-owned.
- Publishing prerelease adapters in the production catalogue.
- Bypassing protected branches, enabling auto-merge, or allowing Actions to merge publication pull requests.
- Letting workflows force-push, replace conflicting sequence branches, or silently close human-created pull requests.
- Inferring compatibility from SemVer, npm tags, package contents, or dispatch text.
- Changing adapter bootstrap protocol behavior unrelated to catalogue publication.
- Generalizing the publisher to arbitrary repositories, package scopes, registries, signing algorithms, or caller-selected destinations.

## Further Notes

- Wayfinder map: [feat(release): automate signed adapter catalogue publication](https://github.com/kyaulabs/prism/issues/455)
- Resolved transaction decision: [ci(release): define cross-repository catalogue publication transaction](https://github.com/kyaulabs/prism/issues/456)
- Resolved custody decision: [fix(security): define GitHub Actions catalogue signing custody](https://github.com/kyaulabs/prism/issues/457)
- Resolved release-evidence decision: [ci(release): derive catalogue releases from Prism publication evidence](https://github.com/kyaulabs/prism/issues/458)
- Resolved sequence decision: [fix(security): define catalogue renewal sequence safety](https://github.com/kyaulabs/prism/issues/460)
- Resolved compatibility decision: [feat(release): choose adapter compatibility authority](https://github.com/kyaulabs/prism/issues/461)
- Relevant accepted records: ADR-0044, ADR-0046, ADR-0079, ADR-0092, ADR-0094, and ADR-0095.
- ADR-0094 records the production signing trust expansion; ADR-0095 records the cross-repository publication transaction and bounded work-branch push exception.

<!-- vim: ft=markdown sts=4 sw=4 ts=4 et : -->
