# 0063. Bounded External Tool Compatibility

Date: 2026-08-14

## Status

Accepted

Supersedes ADR-0062. Depends on ADR-0025, ADR-0047, ADR-0048, ADR-0056,
ADR-0058, ADR-0060, ADR-0061, and ADR-0062.

## Context

ADR-0061 established scope-owned deterministic toolchain contracts. ADR-0062
made OCR a bounded compatibility exception while retaining exact Semgrep
verification. Semgrep is also externally installed, follows a 1.x release
line, and may emit update notices beside its installed version. Requiring one
Semgrep patch release creates the same unnecessary readiness failures that
ADR-0062 removed for OCR.

Semgrep and OCR must remain mandatory external core prerequisites. Prism must
fail closed on old, malformed, ambiguous, or unreviewed major releases without
installing either tool, requiring Semgrep cloud login, reading credentials, or
weakening OCR's connectivity and code-egress approvals.

## Decision

We retain ADR-0061's scope ownership, launcher, adapter handoff, consent,
transaction, lockfile, audit, global launcher, and credential boundaries. We
retain ADR-0062's structured bounded-version mechanism and extend it to both
mandatory external core prerequisites.

### 1. Managed versions remain exact

Bundled core tools and consumer-development tools continue to declare exact
versions. Package manifests and lockfiles retain ADR-0061's deterministic
resolution, parity, and audit requirements.

A component declares either exact `version` or structured
`versionRequirement`; the forms are mutually exclusive. Bounded requirements
are valid only for external prerequisites whose identity and compatibility
policy are approved by an ADR. Semgrep and OCR are the only initial bounded
components.

### 2. External tools use bounded stable 1.x ranges

Semgrep declares:

```json
{
  "mode": "range",
  "minimum": "1.173.0",
  "maximumExclusive": "2.0.0"
}
```

OCR declares:

```json
{
  "mode": "range",
  "minimum": "1.9.1",
  "maximumExclusive": "2.0.0"
}
```

Each lower bound is inclusive and the upper bound is exclusive. Stable
three-segment releases inside the interval are compatible. Older releases,
prereleases, malformed versions, and `2.x` or later releases fail mandatory
readiness.

Changing a lower bound within 1.x is a routine contract/specification update
after compatibility verification. Widening or removing either major-version
ceiling changes this decision and requires a superseding ADR.

### 3. Installed-version evidence is product-specific

Prism selects Semgrep's installed version only from exactly one anchored bare
`X.Y.Z` line in bounded `semgrep --version` output. It selects OCR's installed
version only from exactly one anchored `open-code-review vX.Y.Z` product line
in bounded `ocr --version` output. Update advertisements and all other text are
ignored.

Raw readiness output is never logged or returned. Missing, duplicate,
ambiguous, prerelease, or malformed installed-version evidence fails closed
with a fixed sanitized message. Numeric major, minor, and patch tuples are
compared without adding a package dependency or evaluating ecosystem-specific
range syntax.

### 4. Readiness and consent remain unchanged

Every toolchain entry point performs local Semgrep/OCR preflight before its
main operation. Semgrep login remains optional for local scans. OCR
connectivity testing retains its approved cadence and separate network
approval. Actual OCR review or scanning retains independent code-egress
approval.

Prism runtime and setup never install, upgrade, downgrade, authenticate, or
configure Semgrep or OCR. CI may provision stable releases satisfying the
declared ranges solely to construct its ephemeral verification environment.

## Consequences

- **Positive:** compatible Semgrep and OCR 1.x releases no longer make the
  entire Prism toolchain unavailable solely because of patch-version drift.
- **Positive:** managed dependency reproducibility and all consent, credential,
  and fail-closed boundaries remain intact.
- **Positive:** update advertisements cannot be mistaken for installed
  releases.
- **Negative:** upstream behavior can drift within either accepted 1.x range.
- **Negative:** CI external-tool resolution may select newer compatible 1.x
  releases over time.
- **Neutral:** Semgrep cloud authentication remains optional and OCR consent
  cadence is unchanged.

## Alternatives Considered

- **Retain exact Semgrep verification.** Rejected because patch-release drift
  would continue to block otherwise compatible local installations.
- **Accept any parseable version.** Rejected because old and unreviewed major
  releases would silently pass readiness.
- **Use pip/npm range strings as contract values.** Rejected because the
  contract is ecosystem-neutral and should validate structured data.
- **Select the first or last version token.** Rejected because update notices
  make token position unsafe and nondeterministic.
