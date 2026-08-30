# 0095. Cross-repository catalogue publication transaction

Date: 2026-08-28

## Status

Accepted

Partially superseded by ADR-0097, which retains ADR-0096's Actions-only workflow-dispatch transport and replaces App authentication with separate bot-owned PATs. Independent evidence validation, sequence safety, publication authority, protected-branch behavior, and human-only merge remain accepted.

Extends ADR-0046 and ADR-0079 after successful repository Release and package-tag reconciliation. Establishes a bounded exception to the current no-push-automation policy: trusted publisher CI may create one non-protected publication branch and open its human-merged pull request, but may not write a protected branch or merge.

## Context

Prism releases establish reviewed repository and package evidence, while `kyaulabs/prism-adapters` owns the signed supported-adapter catalogue. The two repositories currently have no transaction connecting a successful stable Prism release to catalogue publication.

A GitHub Release alone is insufficient. npm publication remains a human post-release action, compatibility is a reviewed claim rather than a SemVer inference, and cross-repository dispatch fields are untrusted. The publisher must reconcile immutable Prism release evidence, package tags, reviewed adapter compatibility, exact npm metadata, current catalogue state, sequence allocation, signing, and protected-branch publication.

ADR-0044 requires pull-request-only protected branches. ADR-0046 lets release CI publish tags and Releases and open a human-merged back-merge pull request without pushing a branch. Catalogue publication needs a different bounded effect: create a work branch in another repository and open a pull request while preserving human review and merge.

Dispatch, schedules, and retries can overlap. A stale base or repeated event could otherwise create different envelopes at one sequence, overwrite a visible branch, or race a human merge.

## Decision

We adopt a split cross-repository transaction. Prism emits a minimal release notification; `kyaulabs/prism-adapters` independently validates authority, signs, creates a sequence-specific publication branch, and opens a human-merged pull request.

### Prism release notification

After a stable Prism repository Release and every configured package tag reconcile successfully at the immutable merge commit, the release workflow sends a repository dispatch to the publisher. Prereleases do not dispatch.

The closed dispatch payload contains only its schema version, source repository identity, stable release version, and immutable merge commit. It contains no compatibility declaration, package integrity, registry location, commands, credentials, sequence, branch name, or payload bytes. Dispatch is a wake-up signal, not catalogue authority.

### Independent publisher validation

The publisher accepts release dispatch, a three-day schedule, and explicit manual recovery. Every trigger converges on one transaction and treats event fields as untrusted data.

For a release update, the publisher independently verifies the same-repository GitHub Release, immutable commit, matching package tag, release-managed manifest version, closed reviewed adapter release declaration, and exact npm registry integrity and publication time. It merges that exact release into the release set from the signature-verified current catalogue without silently removing other active releases.

For renewal, the publisher preserves the verified release set and revalidates every exact npm release. Neither path trusts npm `latest`, accepts prereleases, infers compatibility, changes status without reviewed evidence, or partially publishes. npm propagation receives bounded retries; exhaustion fails before signing or Git mutation, and a later trigger recomputes from current authority.

### Authentication and least privilege

GitHub App installation tokens provide the cross-repository and publisher mutation authority. Runtime tokens are narrowed to the exact operation:

- the Prism release job receives only the authority needed to dispatch to `kyaulabs/prism-adapters`;
- the publisher receives only contents and pull-request write authority in `kyaulabs/prism-adapters`;
- neither receives merge, administration, release, npm, or unrelated repository authority.

The long-lived GitHub App authentication material used to mint installation tokens is credential state. It is isolated from pull requests and untrusted workflow code, stored in protected GitHub secret scope, masked, omitted from outputs and artifacts, and included in incident-response and rotation procedures. Administrators able to replace that material are part of the automation trust base. Implementation must validate current GitHub token-narrowing and event semantics before provisioning; if one App identity cannot enforce the required authority separation, use separate App identities rather than broadening either workflow.

### Sequence and publication

All release, schedule, and recovery runs share one publisher concurrency group with cancellation disabled. Each run verifies `catalogue.json` from an attested current `main`, permits expiry only for sequence recovery, derives exactly `sequence + 1`, and binds source, payload, envelope, and publication intent to that base commit.

The run rechecks remote `main` immediately before branch creation. Base movement aborts for a clean rerun. Publication uses one sequence-specific branch, atomic creation, and no force push. Remotely visible bytes for an existing sequence are never replaced.

Only one open publication pull request is allowed. An existing branch or pull request is idempotent success only when it has the expected base and contains the exact valid desired source and envelope. A missing pull request may be recovered from an exact existing branch. Different bytes, an invalid signature, a conflicting base, another open publication pull request, or ambiguous state fails closed for human resolution.

The publisher opens a pull request to `main` containing the deterministic source and signed envelope. It never pushes `main`, bypasses branch protection, enables auto-merge, merges, force-pushes, or closes a conflicting human pull request. Humans alone review and merge publication pull requests.

An unchanged release set still receives a new sequence and six-day validity window after the previous publication merges. The three-day schedule provides one renewal opportunity before the old catalogue's final three days.

## Consequences

- **Positive:** stable Prism releases and routine renewal feed one reproducible catalogue transaction.
- **Positive:** dispatch text cannot authorize compatibility, package identity, signing input, or publication state.
- **Positive:** protected `main` remains PR-only and every catalogue change remains human-merged.
- **Positive:** sequence-specific branches and base attestation prevent stale runs and same-sequence overwrite.
- **Negative:** two repositories, GitHub App authentication, npm availability, protected signing, branch publication, and human merge form one operational chain.
- **Negative:** GitHub App authentication material adds credential custody and rotation duties to both workflow installations.
- **Negative:** an unmerged publication pull request blocks later renewal and may require prompt human attention before catalogue expiry.
- **Neutral:** npm publication remains human-owned, so release-triggered catalogue publication may wait for a later schedule or manual recovery.
- **Neutral:** agents remain unable to push; this exception belongs only to the reviewed GitHub Actions transaction.

## Alternatives Considered

### Let Prism write the catalogue repository directly

Rejected because Prism would gain signing and publisher mutation authority, collapse repository ownership, and make release CI authoritative for data it should only identify.

### Trust compatibility and integrity from dispatch fields

Rejected because dispatch data is untrusted transport, npm integrity is registry evidence, and compatibility is reviewed release-commit authority.

### Push `main` directly

Rejected because it bypasses ADR-0044's protected-branch review and makes CI both author and integrator.

### Reuse `GITHUB_TOKEN`

Rejected because it cannot express the required cross-repository authority and token-created pull requests may suppress required workflow events. No event-suppression workaround is accepted.

### Force-update one permanent publication branch

Rejected because it can replace remotely visible bytes, hide same-sequence equivocation, and race human review. Sequence-specific immutable branches make retries inspectable.

### Merge publication pull requests automatically

Rejected because signature validity does not replace human review of release evidence, compatibility, workflow state, and protected-branch integration.

<!-- vim: ft=markdown sts=4 sw=4 ts=4 et : -->
