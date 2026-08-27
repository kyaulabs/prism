# Spec: Signed Compatible Adapter Discovery

**Date:** 2026-08-27
**Status:** Draft

## Problem Statement

Strict-empty setup currently offers one PHP/web stack adapter whose version is
forced to equal the running Prism Core version. This lockstep catalogue does not
scale to multiple independently released language and stack adapters. It also
assumes package-manager state that differs from Pi's real installation output,
causing a successfully installed adapter to fail post-install validation.

Setup must discover newly approved adapter releases without requiring a Core
release for each adapter update. It must not install npm's mutable `latest`
release, accept arbitrary package names, weaken the setup attempt's network and
mutation boundaries, or make an established project change adapter versions
without an explicit upgrade.

## Solution

Prism Core will retrieve one bounded KYAULabs-signed supported-adapter
catalogue from a fixed public location or use a still-valid verified cache. It
will select the highest stable adapter release compatible with the running Core
version and bootstrap protocol, display the exact selection, install the exact
npm coordinate, verify its identity and integrity, and pin it in project-local
Pi settings.

The selected release and signed catalogue evidence will enter the
empty-project bootstrap transaction before adapter code loads. That immutable
evidence will remain bound to provisional acquisition, project planning,
durable application, recovery, and repository-seed attestation. Later phases
will not depend on whichever catalogue happens to be newest at resume time.

## User Stories

1. As a user creating a project, I want setup to show every currently approved
   adapter that has a release compatible with my installed Core, so that I can
   choose a supported stack without updating Core for each adapter release.
2. As a user, I want setup to choose the highest compatible stable release, so
   that I receive current adapter behavior without risking an incompatible
   major or prerelease.
3. As a user, I want the exact package and version displayed before selection,
   so that adapter installation remains an informed setup-attempt effect.
4. As a user, I want the selected adapter pinned exactly, so that another
   installation of the same project resolves the same adapter release.
5. As a user, I want setup to continue from a valid verified cache during a
   temporary network outage, so that catalogue availability is not a needless
   single point of failure.
6. As a user, I want invalid, expired, rolled-back, or untrusted catalogue data
   rejected, so that cache fallback cannot hide tampering or stale policy.
7. As a maintainer, I want adapter releases published independently of Core, so
   that a growing adapter ecosystem does not force lockstep package releases.
8. As a maintainer, I want package identity, compatibility, and integrity to
   come from signed evidence rather than caller input or registry tags, so that
   the trust boundary remains reviewable.
9. As a maintainer, I want Core checkouts and installed Core packages to use the
   same signed npm acquisition path, so that development context does not
   change production setup semantics.
10. As a maintainer, I want active bootstrap attempts to retain their selected
    catalogue evidence, so that resume and recovery are deterministic even
    after the global cache changes or expires.
11. As a maintainer, I want legacy attempts recognized without being silently
    upgraded to signed evidence, so that old state is either cleaned safely or
    preserved for manual recovery.
12. As a security reviewer, I want no catalogue private key, arbitrary URL,
    executable command, lifecycle script, credential, or project byte to cross
    the catalogue boundary.

## Implementation Decisions

### Catalogue origin and transport

Core retrieves one envelope from the fixed public path
`https://raw.githubusercontent.com/kyaulabs/prism-adapters/main/catalogue.json`.
The origin, organization, repository, branch, and filename are compiled into
Core. Callers cannot replace any of them.

Retrieval uses an unauthenticated bounded HTTPS GET with omitted credentials,
manual redirect rejection, no referrer, a fixed user agent, a short timeout,
and a strict response-size limit. Transport failure or temporary service
unavailability may fall back to a valid cache. Redirects, malformed responses,
oversized bodies, invalid signatures, invalid schemas, sequence rollback, or
sequence equivocation fail closed without fallback.

The setup attempt disclosure covers this fixed catalogue retrieval, verified
cache update, exact registry acquisition, and provisional installation. It does
not grant standing web access or general registry authority.

### Signed envelope and trust root

The fetched document is a strict envelope containing a schema version, key ID,
algorithm, base64 payload, and base64 signature. The only supported algorithm is
Ed25519. Core verifies the signature over the decoded payload bytes before
parsing those bytes as JSON. Signing exact payload bytes avoids a JSON
canonicalization dependency.

Core ships a closed trust-root configuration containing approved key IDs and
Ed25519 public keys. Unknown keys or algorithms fail closed. Routine key
rotation uses an overlapping Core trust-root release before catalogue
publication switches keys. Emergency key revocation also requires a Core
trust-root update. Private signing keys never enter this repository, Core
packages, setup state, fixtures, logs, or CI secrets.

The signed payload contains a catalogue identity, monotonic sequence, issue and
expiry timestamps, and bounded adapter records. Adapter identities contain a
stable ID, display name, and exact KYAULabs npm package name. Release records
contain an exact adapter version, Core compatibility range, bootstrap protocol,
npm integrity, publication timestamp, and active or revoked status.

Catalogue validation requires exact schemas, unique identities and releases,
strict UTF-8, canonical base64, bounded fields and counts, valid semantic
versions and ranges, UTC timestamps, no more than five minutes of future clock
skew, and no more than seven days between issue and expiry. Revoked releases
are never selectable.

### Verified global cache

Core stores up to four exact verified envelopes in one bounded managed record
under Pi's global agent directory. The cache uses the existing managed-record
ownership, no-follow, mode, bounded-read, atomic-publication, and unsafe-state
rules. Cache entries are addressed by envelope digest and retain the exact
signed bytes, sequence, and non-authoritative local cache time.

A higher valid sequence advances the cache. A lower sequence is rollback. The
same sequence with different bytes is equivocation. Both fail closed. Local
metadata cannot extend signed expiry. An unsafe or unpublishable cache is
NO-GO, even when a network response verifies.

A successful cache update survives setup cancellation and project rollback. It
is Core-owned operational evidence, not project state or standing consent.

### Compatible release selection

Core adds `semver` as an exact runtime dependency and uses standard npm SemVer
rules. It validates all release records before filtering, then retains only
stable active releases whose Core range matches the running Core version and
whose bootstrap protocol exactly matches Core's supported protocol. Standard
prerelease rules apply: prerelease Core versions match only ranges that
explicitly admit them.

Core sorts eligible releases by semantic version descending and selects the
highest one. Duplicate versions are invalid, so ties cannot occur. No
compatible release produces a deterministic NO-GO without registry or project
mutation.

The catalogue command returns approved adapter choices and the immutable
verified-envelope digest. The selection command accepts only the adapter ID and
retained digest. It reloads that exact still-valid cache entry and derives the
package name, version, protocol, and integrity itself. Callers cannot provide a
package, version, range, URL, integrity, or registry source.

Core-only remains a static no-package choice. Catalogue discovery may use the
disclosed network attempt or verified cache before the choices are displayed,
but selecting Core-only performs no registry acquisition or project-local
adapter installation.

### Exact package acquisition

Strict-empty setup always installs the exact signed npm release, including when
Core runs from a source checkout. Checkout-local sibling adapter acquisition is
removed from this production route.

Pi receives one exact npm coordinate with lifecycle scripts disabled. Both
lowercase and uppercase npm environment controls require exact saving and
script suppression. Post-install validation requires the exact Pi settings
source, exact npm manifest and root lock dependency, exact installed package
version, expected package registration, matching handler protocol, and lockfile
package integrity equal to the signed release integrity.

The package registry supplies bytes for an already selected exact coordinate;
it does not choose the release.

### Bootstrap evidence and recovery

The provisional adapter receipt advances to schema version 2. It embeds the
exact signed envelope and normalized selected release evidence. Selection time
must fall within the envelope's signed validity period. Catalogue expiry after
successful selection does not invalidate the attempt: resume reverifies the
embedded signature and evidence instead of consulting the newest global cache.

The existing four-field adapter identity remains the interface supplied to
adapter providers. A separate nullable adapter-evidence object carries the
catalogue identity, sequence, key ID, signed timestamps, envelope and payload
digests, and selected npm integrity through the combined plan, journal, status,
durable validation, and repository-seed attestation. Core-only uses null
adapter evidence.

Failures before adapter selection leave the strict-empty project root untouched.
Failures after attempt creation use the existing ownership-proven cleanup of
package, settings, and attempt state. Project rollback never removes or rewrites
the global catalogue cache. Changed or ambiguous receipt evidence is preserved
for manual recovery.

Established projects need no migration and keep their exact active adapter from
project-local Pi evidence. Automatic adapter upgrades remain outside setup.
Legacy schema-1 bootstrap attempts are never treated as signed evidence:
pre-durable attempts may use ownership-proven cleanup and restart, while durable
or ambiguous legacy state is preserved for manual recovery.

### Setup interaction

The strict-empty flow retains source selection before adapter discovery. For
Template or Blank, setup discloses catalogue retrieval and cache effects, runs
the catalogue command, displays Core-only plus every compatible adapter and
its exact selected release, and asks one adapter question. The selected adapter
ID and catalogue digest are retained as inert values for the selection command.

Cancel performs no package installation or project mutation. If discovery
updated the verified global cache before cancellation, that cache remains.
Unknown report fields, reasons, dispositions, identities, digests, or selected
releases fail closed.

### Catalogue publication boundary

The separate `kyaulabs/prism-adapters` repository owns deterministic payload
serialization, release review, signing, and publication at the fixed path.
Creating that repository, protecting its signing key, and publishing its first
production catalogue are human-owned rollout prerequisites. Prism Core owns
only the public trust root and consumer-side validation. Test fixtures use a
separate test-only key pair and never reuse production key material.

ADR-0079 continues to govern packages managed in this repository: Prism Core
and the PHP/web adapter remain on the repository's lockstep release version.
This change enables independently released adapters from separate repositories
but does not alter the current package-release capability. Moving an existing
adapter to independent releases requires a separate repository migration or a
future release-policy ADR.

## Testing Decisions

The primary integration seam is the public adapter catalogue and selection
launcher commands. Tests inject network responses, time, cache paths, and Pi
subprocess behavior, then assert complete structured reports and filesystem
state. No CI test depends on GitHub raw, npm, a user cache, or a private key.

Focused cryptographic tests use deterministic test-only Ed25519 fixtures to
cover signature success, unknown keys and algorithms, changed payloads,
malformed base64, strict UTF-8, size bounds, schema rejection, duplicate
identities, invalid versions and ranges, revoked releases, clock skew, expiry,
rollback, and equivocation.

Cache tests cover fixed-origin request behavior, transport-only fallback,
atomic mode-safe publication, unsafe paths, digest retention and eviction,
expiry, and concurrent or stale managed-record state.

Selection tests cover highest compatible stable releases, standard prerelease
rules, protocol mismatch, input-order independence, no compatible release,
digest binding, disappearance or expiry before selection, caller authority
rejection, and Core-only behavior.

Pi boundary tests model Pi's actual package output. They cover exact-save and
script-suppression controls, exact settings and lock state, integrity mismatch,
registration and handler mismatch, schema-2 receipts, tampering, cleanup, and
resume after global-cache expiry. A Core checkout must still choose npm.

Transaction tests cover nullable adapter evidence across planning, journaling,
status, durable application, recovery, and seed attestation. They also cover
legacy pre-durable cleanup, durable or ambiguous legacy preservation, and the
rule that project rollback does not mutate the global cache.

Prompt and packaging tests cover the fixed origin, disclosed cache write,
retained catalogue digest, one adapter question, exact selection command,
absence of caller package authority, trust-root packaging, and inclusion of all
new Core modules. A sandboxed real-Pi reproduction remains optional manual
diagnostic evidence rather than a CI network dependency.

Every implementation task follows Red, Green, Refactor at its public boundary.
The complete Node and harness suites run after the focused slices compose.

## Acceptance Criteria

- Strict-empty setup obtains adapter choices only from a valid fresh signed
  catalogue or a still-valid verified cache.
- The catalogue origin and package identities are not caller-configurable.
- The highest compatible stable active release is selected deterministically.
- The displayed release is bound to selection by an immutable catalogue
  digest.
- Pi installs the exact selected npm version with lifecycle scripts disabled
  and exact saving enabled.
- Installed version, registration, protocol, and npm integrity match signed
  evidence.
- Project settings pin the exact selected adapter release.
- Checkout Core and installed Core use identical npm acquisition semantics.
- Receipt schema 2 and durable transaction evidence preserve the signed
  selection without depending on future catalogue availability.
- Network, signature, cache, compatibility, package, and recovery failures are
  deterministic and fail closed at the documented boundary.
- Existing established projects remain unchanged.
- Core-only performs no adapter registry acquisition or package installation.
- All focused tests, the full Node suite, Markdown validation, harness
  validation, and the aggregate project check pass.

## Out of Scope

- Arbitrary third-party adapter package names or catalogue origins.
- Installing npm's unconstrained `latest` tag.
- Automatic established-project adapter upgrades during setup.
- The explicit future adapter-upgrade workflow.
- Implementing Python, Rust, JavaScript, or other new stack adapters.
- General-purpose package discovery or web access.
- Private signing-key generation, custody, or use inside Prism Core.
- Human creation and administration of the external catalogue repository.
- Changing ADR-0079's lockstep release policy for packages managed in this
  repository.

## Further Notes

This specification implements ADR-0092 and retains the provider-composition and
transaction boundaries from ADR-0082 plus the remaining invocation-scoped
setup-network boundaries from ADR-0083. ADR-0079 remains authoritative for
packages managed in this repository.

Wayfinder decisions are recorded in [Signed compatible adapter discovery map](https://github.com/kyaulabs/prism/issues/443).
The production rollout is not complete until the human-owned catalogue
repository publishes a valid initial envelope matching Core's bundled trust
root.

<!-- vim: ft=markdown sts=4 sw=4 ts=4 et : -->
