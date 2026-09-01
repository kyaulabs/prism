# 0098. Attested publication commit-signing custody

Date: 2026-09-01

## Status

Accepted

Extends ADR-0094's protected signing custody, ADR-0095's cross-repository
publication transaction, and ADR-0097's bot-owned PAT separation. Their
catalogue-signing, sequence-safety, human-merge, and PAT authority decisions
remain accepted.

## Context

The adapter catalogue publisher creates a sequence-specific branch and pull
request after validating release evidence and signing the catalogue envelope.
The protected `main` ruleset requires every commit to carry a verified
signature and permits no bypass actor.

The publisher originally created raw Git commits without a signature. GitHub
correctly rejected the first production publication pull request. The publisher
now uses a separate OpenPGP identity to sign publication commits and verifies
GitHub's exact `valid` result before it creates a sequence ref. This adds two
protected-environment secrets and a third production authority alongside
catalogue-envelope signing and PAT-backed publication.

Prism Core owns the readiness gate used before production activation. Its
existing attestation schema and exact secret-name check know only the catalogue
signing key, catalogue signing passphrase, and publication PAT. The reviewed
publisher environment now contains five secrets, so the old readiness contract
fails closed. Treating the new OpenPGP authority as implicit in the old
attestation would hide a distinct custody and recovery boundary.

The OpenPGP private material, passphrase, fingerprints, canonical commit
construction, and GitHub verification mechanics belong to
`kyaulabs/prism-adapters`. Core must not copy private material, custody paths,
or key-rotation policy. It needs enough public metadata and human attestation
to decide whether activation is ready.

## Decision

We extend catalogue-publication readiness with an explicit, closed
publication commit-signing custody contract.

The ignored local readiness attestation advances to schema version 3. Schema 3
retains the two exact PAT profiles and existing operational review fields and
adds one closed `publicationCommitSigning` object. That object requires:

- type `OPENPGP`;
- public identity `kyaulabs-bot <actions@kyaulabs.com>`;
- reviewed private-material storage outside repository worktrees;
- reviewed offline recovery custody;
- reviewed separation from catalogue-envelope signing; and
- reviewed separation from publication PAT authority.

Every review assertion is the literal value `true`. Schema 2 and every other
schema version fail before GitHub access. Core performs no migration because
only a human can make the new custody assertions.

Readiness requires the publisher's protected `catalogue-signing` environment
to expose exactly these secret names:

- `CATALOGUE_SIGNING_PRIVATE_KEY`;
- `CATALOGUE_SIGNING_PASSPHRASE`;
- `CATALOGUE_PUBLICATION_TOKEN`;
- `CATALOGUE_COMMIT_SIGNING_PRIVATE_KEY`; and
- `CATALOGUE_COMMIT_SIGNING_PASSPHRASE`.

Missing, extra, duplicate, malformed, or value-bearing entries fail closed.
Readiness requests and reports names only. A valid attestation produces a
distinct `publication-commit-signing-custody` PASS check so the third authority
remains visible in pre-activation and active reports.

Core does not pin the publisher's OpenPGP fingerprints or implement commit
signing. The publisher repository remains authoritative for its public-key
policy, private-material custody, signing implementation, and GitHub
verification gate. Core records only the public identity and reviewed boundary
needed for activation.

Human maintainer identities, secret values, private keys, passphrases, token
prefixes, recovery data, and custody paths never enter source, tests, issues,
logs, or the readiness attestation.

## Consequences

- **Positive:** readiness represents catalogue signing, publication commit
  signing, and PAT authorization as separate reviewed authorities.
- **Positive:** exact five-name validation detects missing authority and silent
  protected-environment expansion.
- **Positive:** schema 3 prevents old evidence from being reinterpreted as a
  review of the new OpenPGP boundary.
- **Positive:** Core remains independent of publisher signing mechanics and key
  rotation.
- **Negative:** every existing schema-2 attestation becomes invalid and needs a
  fresh human review.
- **Negative:** publisher secret-name or public-identity changes require a
  reviewed Core contract update before readiness can return `GO`.
- **Neutral:** catalogue-envelope signing, package evidence, sequence
  allocation, immutable publication branches, and human-only merge remain
  unchanged.
- **Neutral:** the two non-expiring PATs and their lifecycle advisory remain
  governed by ADR-0097.

## Alternatives Considered

### Change schema 2 in place

Rejected because adding required custody assertions would change the meaning of
existing schema-2 evidence without identifying that semantic migration.

### Update only the secret-name allowlist

Rejected because Core would accept a new production signing authority without
an explicit custody, recovery, or separation review.

### Pin publisher OpenPGP fingerprints in Core

Rejected because Core does not verify publication commits directly. Copying
fingerprints would couple publisher key rotation to an unnecessary Core trust
root and duplicate the publisher's authority.

### Weaken the protected branch signature rule

Rejected because verified publication commits are required security evidence.
The publisher must satisfy the rule; readiness cannot bypass or dilute it.

<!-- vim: ft=markdown sts=4 sw=4 ts=4 et : -->
