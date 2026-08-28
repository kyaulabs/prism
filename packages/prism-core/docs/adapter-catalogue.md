# Signed adapter catalogue

The signed adapter catalogue is the public release contract between Prism Core
and the human-operated `kyaulabs/prism-adapters` publisher. Core uses it only
for strict-empty setup. Established projects keep the exact adapter already
recorded in project-local Pi state.

## Fixed consumer boundary

Core retrieves one unauthenticated document from this exact URL:

```text
https://raw.githubusercontent.com/kyaulabs/prism-adapters/main/catalogue.json
```

The caller cannot replace the origin, repository, branch, filename, package
name, version, integrity, or registry source. Core rejects redirects, responses
other than HTTP 200, oversized responses, malformed envelopes, invalid
signatures, and unsupported schemas.

Core ships this production trust identity:

```text
Key ID:       kyaulabs-prism-adapters-2026-01
Algorithm:    Ed25519
SPKI base64:  MCowBQYDK2VwAyEA+DVF3+MsLiezlKiBQeWFO1N7Q23ZhdevEfZoWJrtww4=
SPKI SHA-256: 74679d283825c4e6048efdfd1c96cdcd688ce5e12915fcc13a8547c3443c1e34
```

The public trust root is packaged at
`config/adapter-catalogue-trust.json`. A Core release must add a replacement
public key before the publisher starts signing with that key.

## Envelope schema

The published document has exactly these fields:

```json
{
  "schemaVersion": 1,
  "keyId": "kyaulabs-prism-adapters-2026-01",
  "algorithm": "Ed25519",
  "payload": "<canonical base64 payload bytes>",
  "signature": "<canonical base64 Ed25519 signature>"
}
```

The publisher signs the decoded `payload` bytes, not parsed or reserialized
JSON. Core verifies the signature before decoding the payload as strict UTF-8
JSON. The payload is limited to 1 MiB, and the complete envelope is limited to
1,398,104 bytes.

The envelope SHA-256 identifies the exact published response bytes. Changing
whitespace or field ordering changes that digest. Publishing different envelope
bytes for the same sequence is catalogue equivocation and fails closed once
one version has entered the verified cache.

## Payload schema

The decoded payload has exactly this shape:

```json
{
  "schemaVersion": 1,
  "catalogueId": "kyaulabs/prism-adapters",
  "sequence": 42,
  "issuedAt": "2026-08-27T00:00:00Z",
  "expiresAt": "2026-09-03T00:00:00Z",
  "adapters": [
    {
      "id": "php-web",
      "displayName": "PHP/web",
      "packageName": "@kyaulabs/prism-php-web",
      "releases": [
        {
          "version": "1.8.2",
          "coreRange": ">=1.3.0 <2.0.0",
          "bootstrapProtocol": 1,
          "integrity": "sha512-<canonical npm integrity>",
          "publishedAt": "2026-08-26T00:00:00Z",
          "status": "ACTIVE"
        }
      ]
    }
  ]
}
```

Payload rules:

- `sequence` is a positive safe integer and increases monotonically.
- `issuedAt`, `expiresAt`, and every `publishedAt` are UTC RFC 3339
  timestamps.
- `issuedAt` may be at most five minutes ahead of Core's current clock.
- `expiresAt` is later than `issuedAt` and no more than seven days after it.
- The catalogue contains 1 to 64 adapters.
- Adapter IDs and package names are unique. Package names use the
  `@kyaulabs/` scope.
- Each adapter contains 1 to 256 releases with unique exact SemVer versions.
- Every release has a valid Core SemVer range, a positive bootstrap protocol,
  canonical `sha512-` npm integrity, and status `ACTIVE` or `REVOKED`.
- Unknown fields, duplicate records, malformed values, and unsupported schema
  versions invalidate the complete catalogue.

## Compatible release selection

Core validates the complete payload before selecting a release. For each
adapter it keeps releases that are:

- `ACTIVE`;
- stable, not prerelease versions;
- compatible with the running Core version through `coreRange`; and
- on Core's exact bootstrap protocol.

Core selects the highest remaining SemVer release for each adapter. It displays
the exact package, version, protocol, and integrity. The later selection command
accepts only the adapter ID and the retained envelope digest, reloads that exact
verified cache entry, reruns compatibility selection, and derives all package
authority from signed data.

Strict-empty acquisition always uses an exact npm coordinate:

```text
npm:<packageName>@<version>
```

Post-install validation requires Pi settings, npm manifest and lock state,
installed package identity, adapter registration, bootstrap protocol, and npm
integrity to match the signed selection.

## Verified global cache

Core stores at most four verified envelopes in the managed global cache named
`prism-adapter-catalogue-cache.json` under Pi's agent directory. Entries retain
the exact envelope bytes, envelope digest, sequence, and local cache time. Core
reverifies every cached signature and payload before use.

A higher sequence advances the cache. A lower sequence is rollback. The same
sequence with a different digest is equivocation. Neither condition may fall
back to older data. Signed expiry remains authoritative; cache time cannot
extend it.

Core may use the newest still-valid cache entry only when transport is
unavailable because of a network error, timeout, or HTTP 5xx response. Invalid
HTTP responses, redirects, signatures, schemas, rollback, equivocation, and
unsafe managed-record state fail closed without fallback.

The verified cache is Core-owned operational state. It may remain after setup
cancellation or project rollback. It contains public signed catalogue bytes,
not credentials, standing consent, or project files.

## Bootstrap evidence

Catalogue discovery returns `catalogueEvidence`, which identifies the verified
envelope source, catalogue ID, sequence, envelope digest, payload digest, key
ID, issue time, and expiry time.

A selected adapter receipt embeds the exact envelope and its receipt-local
`catalogueEvidence`. Durable plans, journals, status reports, and root-seed
attestations carry the normalized nullable `adapterEvidence` subset. Core-only
uses `null`. Adapter providers and hooks continue to receive only adapter ID,
package name, exact package version, and bootstrap protocol.

Once Core has selected and validated an adapter within the signed validity
window, recovery reverifies the embedded receipt evidence. It does not depend
on a newer global catalogue or extend the original selection's authority.

## Publisher responsibilities

The `kyaulabs/prism-adapters` publisher owns:

1. reviewing adapter identity, Core compatibility, bootstrap protocol, npm
   integrity, release status, and revocations;
2. serializing the payload deterministically;
3. assigning a new monotonic sequence for every changed publication;
4. signing the exact payload bytes with the authorized Ed25519 key;
5. publishing the complete envelope atomically at the fixed path; and
6. retaining signing audit and key-custody records outside Prism Core.

Key rotation requires an overlap period: release Core with the new public key,
allow that Core version to propagate, then publish envelopes under the new key.
Emergency revocation requires a Core trust-root release because the catalogue
cannot revoke the key that authenticates the catalogue itself.

The production private signing key must never enter this repository, a Prism
package, CI secret, test fixture, setup state, log, issue, or documentation.
Tests generate ephemeral Ed25519 key pairs in memory and supply matching
injected test trust roots. Publishing and private-key custody remain human-owned
operations outside Prism Core.

<!-- vim: ft=markdown sts=4 sw=4 ts=4 et : -->
