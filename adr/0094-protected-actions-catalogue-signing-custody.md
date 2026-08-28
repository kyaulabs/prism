# 0094. Protected Actions catalogue signing custody

Date: 2026-08-28

## Status

Accepted

Partially supersedes ADR-0092's human-operated publisher requirement and its prohibition on storing the production private signing key in CI secrets. The signed catalogue schema, Core trust root, verification rules, publisher responsibilities, and key-rotation ordering remain in force.

## Context

ADR-0092 makes the supported-adapter catalogue freshness-bounded and assigns signing to a human-operated publisher. The current publisher follows that model: preparation and verification are automated, while a human supplies an encrypted PKCS#8 key and passphrase to an interactive signing command.

A six-day catalogue can become unavailable when its human renewal is missed. The requested operating model renews every three days and reacts to successful Prism releases without requiring a maintainer session. Unattended renewal requires production signing authority in an automated environment.

Moving the Ed25519 private key into GitHub Actions changes the trust boundary. Pull-request code is untrusted, default-branch workflow code is executable signing policy, environment administrators can replace secrets, and ordinary workflow diagnostics can accidentally disclose secret-derived material. Environment reviewers would restore a human gate but defeat unattended renewal.

The catalogue remains a public integrity artifact. Confidentiality applies to the signing key, passphrase, and authentication credentials; authenticity and sequence safety apply to the generated payload and envelope.

## Decision

We permit the `kyaulabs/prism-adapters` default-branch GitHub Actions workflow to hold and use production catalogue signing authority inside one dedicated protected environment.

The environment stores the encrypted PKCS#8 Ed25519 private key and its passphrase as separate secrets. The workflow may reconstruct the key only in an ephemeral runner-private location for the final signing job. It derives the public key, requires the trusted Core SPKI fingerprint and key ID, signs the exact prepared payload bytes, verifies the completed envelope, and removes temporary key material on every exit path.

Production secrets are available only to a job running trusted default-branch publisher code after unprivileged evidence validation and synthetic-key tests pass. Pull-request workflows, fork code, reusable workflows, dispatch-selected code, artifacts, caches, and preceding jobs receive no production signing secret. All tests use ephemeral synthetic keys.

The signing job uses a GitHub-hosted ephemeral runner, one protected environment, explicit least-privilege permissions, a bounded timeout, disabled shell and Actions debug tracing, masked secret values, short log retention, and no secret-bearing outputs or summaries. It uploads no signing artifact other than the public source and envelope intended for the publication pull request.

The signing and publication workflows share non-cancelling serialization. A production signature is created only after the current catalogue, base commit, release evidence, npm evidence, and next sequence are validated. The signed result is reverified before remote branch mutation.

Unattended operation has no required environment reviewer. We explicitly accept that merged default-branch publisher workflow code, repository administrators, environment administrators, and principals able to replace or read environment secrets are part of the production signing trust base.

Suspected exposure immediately stops production signing. Recovery requires a Prism Core release trusting the replacement public key, propagation of that Core release, replacement of the protected-environment secrets, and only then publication under the replacement key. The catalogue cannot revoke its own signing key.

Agents remain forbidden from reading, receiving, displaying, copying, encoding, or operating on production credential values. This decision authorizes trusted GitHub Actions runtime code, not coding agents, pull requests, local tests, or general Prism workflows.

## Consequences

- **Positive:** the catalogue can renew before expiry and publish newly eligible releases without a maintainer signing session.
- **Positive:** pull-request code and ordinary test jobs remain unable to use production signing authority.
- **Positive:** every production signature is checked against Core's existing public trust root before publication.
- **Negative:** GitHub Actions, merged publisher workflow code, environment administration, and GitHub's secret infrastructure join the production trust base.
- **Negative:** compromise of both the encrypted key and passphrase permits catalogue signing until Core rotates the trust root.
- **Negative:** secret reconstruction and cleanup become security-critical workflow behavior that requires dedicated tests and review.
- **Neutral:** Core's catalogue consumer, envelope schema, freshness rules, and public key remain unchanged.
- **Neutral:** npm authentication and package publication remain human-owned and outside this environment.

## Alternatives Considered

### Keep human-operated local signing

Rejected because a missed six-day renewal makes strict-empty adapter discovery unavailable and prevents unattended release publication.

### Require protected-environment reviewers

Rejected because every three-day renewal and release-triggered update would still wait for a human approval, defeating the requested unattended operation. The wider trust base is accepted explicitly instead.

### Store an unencrypted private key as one repository secret

Rejected because it removes separation between key material and its decryption secret and makes one disclosure immediately usable.

### Give production secrets to a reusable workflow

Rejected because callers could change the execution context or pass untrusted inputs into secret-bearing code. The final signing job remains repository-local and default-branch-owned.

### Use an external signing service

Rejected for now because it introduces another hosted system, authentication protocol, availability dependency, and operational owner. A future external signer would require a superseding ADR.

<!-- vim: ft=markdown sts=4 sw=4 ts=4 et : -->
