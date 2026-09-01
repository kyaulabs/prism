# Publication Commit-Signing Readiness Specification

**Status:** Approved design
**Originating issue:** #476
**Parent issue:** #469
**ADR-required:** 0098

## Goal

Extend catalogue-publication readiness so Prism Core recognizes and attests the
separate OpenPGP authority used to sign catalogue publication commits. The
command must accept the reviewed five-secret publisher environment, reject
incomplete or ambiguous custody state, and preserve fail-closed activation.

## Context

`kyaulabs/prism-adapters` now signs publication commits with a separate
OpenPGP identity before creating a sequence branch. The protected
`catalogue-signing` environment therefore contains five secrets rather than
the three understood by the current Core readiness command.

The current command compares environment secret names against an exact
three-name allowlist. The live pre-activation check consequently returns
`NO-GO` at `signing-secret-presence`, even though the publisher configuration
matches its reviewed architecture.

The new authority is distinct from:

- Ed25519 catalogue-envelope signing;
- the publication PAT used for repository mutation; and
- the dispatch PAT used by Prism release automation.

Core owns readiness and the local human attestation. The publisher repository
continues to own OpenPGP key fingerprints, canonical commit construction,
signing mechanics, GitHub verification, and private-material handling.

## Non-Goals

- Core does not read, retrieve, generate, copy, rotate, or verify private keys
  or passphrases.
- Core does not duplicate the publisher's public-key fingerprints or commit
  signing implementation.
- Core does not identify human custodians or record custody paths.
- Core does not migrate an existing attestation automatically.
- Core does not weaken branch signature requirements or add bypass actors.
- This change does not activate publication or run the publisher workflow.

## Domain Language

**Publication commit-signing authority** is the separate OpenPGP authority that
signs catalogue publication commits. It remains independent from catalogue
signing and PAT authorization. Add this term to `CONTEXT.md`.

## Attestation Schema 3

The ignored local file remains
`.pi/prism-tool/catalogue-publication-readiness.json`. The file remains a
regular, non-symlink, metadata-only file bounded to 65,536 bytes.

Schema 3 retains every schema-2 field and adds one closed object:

```json
{
  "schemaVersion": 3,
  "checkedAt": "2026-09-01T00:00:00Z",
  "dispatchCredential": {
    "type": "FINE_GRAINED_PAT",
    "label": "prism-catalogue-dispatch",
    "credentialOwner": "kyaulabs-bot",
    "resourceOwner": "kyaulabs",
    "repositories": ["kyaulabs/prism-adapters"],
    "permissions": {"actions": "write"},
    "expiresAt": null,
    "rotationPolicy": "NONE_ACCEPTED"
  },
  "publicationCredential": {
    "type": "FINE_GRAINED_PAT",
    "label": "prism-adapters-catalogue-publication",
    "credentialOwner": "kyaulabs-bot",
    "resourceOwner": "kyaulabs",
    "repositories": ["kyaulabs/prism-adapters"],
    "permissions": {"contents": "write", "pullRequests": "write"},
    "expiresAt": null,
    "rotationPolicy": "NONE_ACCEPTED"
  },
  "publicationCommitSigning": {
    "type": "OPENPGP",
    "identity": "kyaulabs-bot <actions@kyaulabs.com>",
    "privateMaterialOutsideRepositoriesReviewed": true,
    "offlineRecoveryCustodyReviewed": true,
    "separatedFromCatalogueSigningReviewed": true,
    "separatedFromPublicationCredentialReviewed": true
  },
  "credentialSeparationReviewed": true,
  "retentionDays": {"prism": 7, "prismAdapters": 7},
  "administratorAccessReviewed": true,
  "offlineRecoveryCustodyReviewed": true
}
```

`publicationCommitSigning` accepts exactly the displayed keys and values. The
identity is public signing metadata, not a human custodian identity. Every
review boolean must be the literal JSON value `true`.

Schema 2 and every other schema version are invalid after this change. An old
or malformed attestation returns the existing `manual-attestation` failure
before any GitHub request. A human must review the new authority and rewrite
the file as schema 3.

## Protected Environment Contract

The publisher `catalogue-signing` environment must contain exactly these names:

1. `CATALOGUE_SIGNING_PRIVATE_KEY`
2. `CATALOGUE_SIGNING_PASSPHRASE`
3. `CATALOGUE_PUBLICATION_TOKEN`
4. `CATALOGUE_COMMIT_SIGNING_PRIVATE_KEY`
5. `CATALOGUE_COMMIT_SIGNING_PASSPHRASE`

Readiness compares sorted names against this closed set. Missing, extra,
duplicate, malformed, or value-bearing entries fail
`signing-secret-presence`. Readiness never requests a secret value.

## Readiness Report

A valid schema-3 attestation adds this visible check after
`credential-separation`:

```json
{
  "id": "publication-commit-signing-custody",
  "status": "PASS",
  "message": "publication commit-signing custody is attested"
}
```

The existing `credential-lifecycle` advisory and every other check retain their
meaning and ordering. Pre-activation and active phases use the same custody
contract. Only the expected value of `CATALOGUE_SIGNING_ENABLED` differs.

Failure behavior remains:

- absent attestation: `MANUAL`, overall `NO-GO`, exit 3;
- old, malformed, or ambiguous attestation: `FAIL`, overall `NO-GO`, exit 3;
- GitHub or configuration drift: the relevant check fails, overall `NO-GO`,
  exit 3;
- valid metadata with only the accepted lifecycle advisory: `GO`, exit 0.

The command performs no migration or mutation.

## Security Boundaries

The attestation records a human review, not proof of secret contents. It may
contain only public policy metadata and booleans. Secret values, private key
material, passphrases, recovery locations, human custodian identities, token
prefixes, and account-recovery data remain forbidden.

The exact five-name check prevents silent authority growth. The new attestation
object prevents Core from treating the OpenPGP authority as covered by older
PAT and catalogue-signing assertions. Schema version 3 prevents semantic
reinterpretation of existing schema-2 evidence.

## Documentation

Update the Core provisioning runbook to describe:

- all five protected-environment secret names;
- the public OpenPGP signing identity;
- external private-material and offline recovery review;
- separation from catalogue signing and PAT authorization;
- the schema-3 attestation template;
- activation and pre-activation checks;
- exposure response, rotation, succession, and re-attestation; and
- the prohibition on secret values, private material, custody paths, and human
  custodian identities in agent-visible state.

Add ADR-0098 to record the cross-repository authority and Core readiness
boundary. ADR-0098 extends ADR-0094, ADR-0095, and ADR-0097 without changing
their catalogue-signing, transaction, or PAT decisions.

## Test Seams

Unit and command tests exercise the public readiness command with injected
GitHub metadata:

- canonical schema 3 and five-secret metadata return `GO`;
- active phase returns `GO` only with exact activation;
- schema 2 fails before GitHub access;
- every missing or unknown root and nested field fails;
- wrong OpenPGP type or identity fails;
- every false custody or separation assertion fails;
- each missing secret name fails;
- an extra or duplicate secret name fails;
- attempted secret-value exposure fails without echoing the canary;
- existing PAT, ruleset, environment, retention, and activation drift cases
  remain green; and
- packaged documentation tests require the updated runbook and terminology.

The live feedback loop is:

```text
prism-tool catalogue-publication readiness --phase=pre-activation --json
```

It may return `GO` only after the publisher configuration is correct and a
human rewrites the local attestation as schema 3.

## Acceptance Criteria

- Pre-activation and active readiness recognize exactly the five reviewed
  publisher secret names.
- Missing, extra, duplicate, malformed, or value-bearing secret entries fail
  closed.
- Schema 3 explicitly records the public OpenPGP identity, external custody,
  offline recovery, and authority separation review.
- Schema 2 and ambiguous attestations fail before GitHub access.
- The report includes a distinct publication commit-signing custody check.
- Provisioning and recovery documentation covers the separate authority.
- CONTEXT.md and ADR-0098 record ownership and boundaries.
- Automated tests cover valid, drift, migration, and redaction cases.
- The live pre-activation command returns `GO` only after fresh human
  attestation.
- No credential value or private custody detail enters source, tests, logs,
  issues, or agent-visible files.

<!-- vim: ft=markdown sts=4 sw=4 ts=4 et : -->
