# 0092. Signed compatible adapter discovery

Date: 2026-08-27

## Status

Accepted

Supersedes ADR-0082's Core-shipped adapter catalogue and lockstep adapter-version
selection. Supersedes ADR-0083's strict-empty adapter-discovery authorization.
Retains ADR-0082's provider-composition and transaction boundaries and
ADR-0083's remaining invocation-scoped setup-network boundaries.

## Context

Core currently ships a closed adapter catalogue and assigns every adapter the
same version as Core. This works for one lockstep adapter but does not scale to
independently released language and stack adapters.

Selecting npm's unconstrained `latest` release would make setup
nondeterministic and could install an adapter incompatible with the running Core
or bootstrap protocol. Allowing arbitrary package names would also move package
identity outside Prism's trust boundary. Keeping every adapter identity and
version in Core would require a Core release whenever any adapter changes.

Empty-project setup therefore needs scalable adapter discovery while retaining
approved identities, compatibility validation, exact acquisition, rollback,
and reproducibility. The discovery network effect must remain inside one
disclosed setup attempt rather than broadening standing web access or granting
general registry authority.

## Decision

We use a schema-versioned, KYAULabs-signed catalogue as the authority for
supported adapter identities and releases. Core bundles the catalogue
verification trust root but does not bundle every adapter release.

Each catalogue release record contains at least:

- a stable adapter ID and display name;
- an exact npm package name and version;
- a compatible Core semantic-version range;
- a supported bootstrap protocol;
- package integrity and publication status; and
- catalogue issue, expiry, signing-key, and revocation evidence.

Unknown signing keys, invalid signatures, expired catalogues, unsupported
schemas, malformed semantic-version ranges, duplicate identities, revoked
releases, or incomplete records fail closed. Catalogue content remains
untrusted data until signature, schema, bounds, freshness, and identity checks
pass. It never supplies commands, executable code, credentials, lifecycle
scripts, arbitrary URLs, or project bytes.

For a selected adapter, strict-empty setup:

1. loads a freshly fetched signed catalogue or a still-valid verified cache;
2. filters approved stable releases by the running Core version and supported
   bootstrap protocol;
3. selects the highest compatible release by semantic version;
4. displays the exact package, version, compatibility, integrity, catalogue
   digest, and network effects before acquisition;
5. installs the exact npm coordinate with lifecycle scripts disabled and exact
   package saving enabled;
6. verifies the installed package identity, version, protocol, registration,
   handler, and integrity against the signed release record;
7. records the catalogue digest and selected release evidence in the bootstrap
   receipt and combined project plan; and
8. pins the exact adapter version in project settings.

A cached catalogue is eligible only while its signature and expiry remain
valid. If no valid catalogue, verified cache, or compatible release exists,
setup stops without project mutation. It never falls back to npm's `latest`
tag, an expired cache, an incompatible release, an arbitrary package, or an
older bundled adapter.

Invoking `/setup` authorizes the disclosed fixed catalogue retrieval, bounded
registry metadata needed to acquire the selected exact release, and that
release's provisional project-local installation for the active attempt. The
authorization does not transfer to another catalogue origin, package, version,
provider, command, registry, or later setup attempt. Standing web-access
consent does not authorize adapter discovery, and adapter discovery does not
grant standing web access.

Projects retain the selected exact adapter version until an explicit,
separately reviewed upgrade transaction changes it. Re-running `/setup` does
not silently replace an established project's pinned adapter.

## Consequences

- **Positive:** adapters can release independently and scale beyond one
  PHP/web package.
- **Positive:** new compatible adapter releases become available without a new
  Core release.
- **Positive:** selection remains approved, deterministic, integrity-bound,
  and reproducible.
- **Positive:** incompatible registry releases cannot be selected merely
  because they carry the `latest` tag.
- **Negative:** KYAULabs must operate catalogue signing, publication, expiry,
  revocation, cache, and key-rotation processes.
- **Negative:** setup gains signature verification, semantic-version
  selection, cache validation, and installed-integrity checks.
- **Negative:** first-time adapter bootstrap depends on a fresh signed
  catalogue or a still-valid verified cache.
- **Neutral:** project-local adapter versions remain exact pins and require an
  explicit upgrade workflow.

## Alternatives Considered

### Keep Core and every adapter in version lockstep

Rejected because every adapter release would require a Core release and the
coordination cost would grow with the adapter ecosystem.

### Install the registry's `latest` release

Rejected because a mutable dist-tag does not prove Core compatibility,
bootstrap-protocol compatibility, approval, or reproducibility.

### Accept arbitrary npm adapter packages

Rejected because caller-selected package identities would move discovery and
execution outside Prism's approved trust boundary.

### Persist compatible semantic-version ranges

Rejected because later installation could resolve different project state
without an explicit upgrade decision.

### Resolve and upgrade on every setup run

Rejected because rerunning setup must not silently change an established
project's active adapter.

### Fall back to a catalogue bundled with Core

Rejected because the fallback would preserve the lockstep release pressure this
decision removes and could silently select stale adapter policy.

<!-- vim: ft=markdown sts=4 sw=4 ts=4 et : -->
