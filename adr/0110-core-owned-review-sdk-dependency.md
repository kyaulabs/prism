# 0110. Core-owned review SDK dependency

Date: 2026-09-07

## Status

Accepted

Runtime numeric SDK gating is superseded by
[ADR-0114](0114-non-prism-versions-are-observations.md). Dependency ownership,
lockfiles, provenance, and API capability checks remain.

Partially supersedes ADR-0102's consequence that the standalone reviewer uses
Pi's public SDK through the existing host peer relationship. Its review trust
root, isolation, model ownership, and staged introduction remain unchanged.

## Context

Pi's managed npm installation disables peer dependency installation because
extensions obtain host APIs through Pi's loader. Prism Core 0.6.0 also imports
the SDK from a standalone Node executable, where those aliases do not exist.
An installed Pi CLI therefore does not establish that Core can import the SDK.

Clean installation probes reproduced missing SDK imports with peer resolution
disabled. Explicit SDK installation allowed Core's isolated-runtime setup to
complete with Pi 0.84.1 and 0.85.1, using in-memory credentials and no inference.
Version-only executable checks did not detect the installation defect.

## Decision

Core declares `@earendil-works/pi-coding-agent` as a runtime dependency with
compatibility range `>=0.84.1 <=5.0.0`. Its extension-facing peer declaration
uses the same range. The runtime dependency is not a separately administered
external tool and is not a new model or provider SDK. Extension peer validation
remains in force; the standalone reviewer additionally requires a runtime
dependency declaration.

The reviewer resolves and imports the SDK through package-relative ESM, not
through a consumer, a reviewed checkout, inherited `NODE_PATH`, the Pi CLI
installation, or extension-loader aliases. Runtime readiness checks the exact
resolved SDK version and required public capabilities separately. An in-range
version with incompatible capabilities fails closed.

The inclusive upper boundary does not promise compatibility with future APIs.
Committed lockfiles and exact baseline CI versions provide reproducible
verification. A distinct newer-version compatibility lane records the exact
in-range version it tests and detects drift without replacing baseline evidence.

Installation verifies SDK import, version, and static API readiness without
requiring a model, authentication, or a consumer profile. Doctor additionally
validates the selected model, isolated resources, profiles, and provider
provenance. It performs no inference or live authentication probe and reports
only bounded failure categories and static remediation. Missing SDK,
unsupported version, incompatible API, model, isolation, profile, and provider
failures remain distinguishable without raw exceptions or configuration.

This is a narrow SDK-library dependency policy, not an expansion of ADR-0063's
bounded external-tool exceptions. Exact managed tool declarations, mandatory
Semgrep/OCR readiness, consent, release publication, and human-only installation
of the authoritative released successor remain unchanged.

## Consequences

- Pi-managed Core installation supplies the SDK even when peers are omitted.
- A host Pi installation and Core's SDK may have different versions; neither
  silently reconfigures or replaces the other.
- Core's installed dependency footprint grows. Dependency audits and lockfile
  maintenance must include the SDK graph.
- Broad compatibility requires capability and packaged-runtime tests, not
  merely a version comparison.
- Installation readiness does not prove model authentication, complete review
  compatibility, or the independent released-consumer checkpoint.
- Existing consumers must install a release containing this repair. Checkout
  success cannot establish external review authority.

## Alternatives Considered

### Keep the SDK only as a peer

Rejected. Pi deliberately omits peers, and extension aliases cannot satisfy the
standalone executable's import.

### Provision the SDK through an extra installer step

Rejected. A bare supported package installation would remain incomplete and
SDK ownership would be split between metadata and installer behavior.

### Discover the Pi CLI or use inherited module paths

Rejected. This introduces ambient executable or module discovery rather than a
package-owned dependency and risks violating the external trust root.

### Retain the former minor-version ceiling

Rejected. It rejects newer versions without evidence of API incompatibility.
The declared range and independent runtime capability checks express different
requirements.
