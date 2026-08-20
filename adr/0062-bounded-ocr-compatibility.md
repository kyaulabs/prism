# 0062. Bounded OCR Compatibility in the Toolchain Contract

Date: 2026-08-13

## Status

Superseded by ADR-0063

Supersedes ADR-0061. Depends on ADR-0025, ADR-0047, ADR-0048, ADR-0056,
ADR-0058, ADR-0060, and ADR-0061.

## Context

ADR-0061 established scope-owned deterministic toolchain contracts and required
exact direct versions for bundled, consumer-development, and external tools.
That policy remains appropriate for package-managed tools and Semgrep, but OCR
has a high release cadence and emits an update advertisement alongside its
installed version. Requiring one exact OCR patch release causes healthy 1.x
installations to fail readiness and may mistake an advertised release for the
installed executable.

OCR remains a mandatory, externally installed core prerequisite. Prism must
continue to fail closed on missing or incompatible installations, never manage
OCR installation or credentials, and preserve separate connectivity and code-
egress approvals. The compatibility exception therefore needs explicit bounds
and deterministic installed-version parsing rather than accepting arbitrary
versions.

## Decision

We retain ADR-0061's scope ownership, launcher, adapter handoff, consent,
transaction, lockfile, audit, global launcher, and credential boundaries. We
replace its universal exact-version rule with the following version-policy
rules.

### 1. Exact managed versions remain the default

Bundled core tools, consumer-development tools, and Semgrep continue to declare
and verify exact versions. Their package manifests and lockfiles retain the
parity and deterministic-resolution requirements from ADR-0061.

A contract component declares either an exact `version` string or a structured
`versionRequirement`; the forms are mutually exclusive. Bounded requirements
are valid only for an external prerequisite whose compatibility policy is
approved by an ADR. OCR is the sole initial exception.

### 2. OCR uses a bounded compatible range

OCR declares this requirement:

```json
{
  "mode": "range",
  "minimum": "1.9.1",
  "maximumExclusive": "2.0.0"
}
```

Stable three-segment releases from `1.9.1` inclusive to `2.0.0` exclusive are
compatible. Older releases, prereleases, malformed versions, and `2.x` or later
releases fail mandatory readiness. Changing the lower bound within 1.x is a
routine contract/specification update after compatibility verification.
Widening or removing the major-version ceiling changes this decision and
requires a superseding ADR.

### 3. Installed OCR version parsing is product-specific

Prism selects OCR's installed version only from an anchored
`open-code-review vX.Y.Z` product line in bounded `ocr --version` output. It
ignores update advertisements, provider text, and every other version token.
Raw output is never included in readiness status or logs. Missing, ambiguous,
or malformed installed-version evidence fails closed with a fixed sanitized
message.

Version comparison uses numeric major, minor, and patch tuples. Prism does not
add a package dependency or evaluate a package-manager range expression to
make this readiness decision.

### 4. Readiness and consent remain unchanged

Every toolchain entry point still performs local Semgrep/OCR preflight before
its main operation. Semgrep must equal `1.173.0`; OCR must satisfy
`>=1.9.1 <2.0.0`. OCR connectivity testing retains ADR-0061's cadence and
separate approval. Actual OCR review or scanning still requires independent
code-egress approval.

Prism runtime and setup never install, upgrade, downgrade, authenticate, or
configure OCR. CI may provision any stable OCR release satisfying the declared
range, with lifecycle scripts disabled, solely to construct its ephemeral test
environment.

## Consequences

- **Positive:** routine compatible OCR 1.x releases no longer make the entire
  Prism toolchain unavailable.
- **Positive:** exact managed dependency pins, exact Semgrep verification, and
  all consent and credential boundaries remain intact.
- **Positive:** update advertisements cannot be confused with the installed
  OCR release.
- **Negative:** OCR compatibility is bounded rather than reproducible to one
  patch release, so upstream 1.x behavior drift remains possible.
- **Negative:** the contract schema and readiness tests must support both exact
  and bounded version policies.
- **Neutral:** OCR connectivity and code-egress approvals remain independent
  of local version compatibility.

## Alternatives Considered

- **Retain one exact OCR release.** Rejected because OCR's release cadence
  creates unnecessary global readiness failures for compatible 1.x versions.
- **Accept any parseable OCR version.** Rejected because it would silently
  accept old releases and unreviewed major-version changes.
- **Store an npm range string.** Rejected because the readiness contract is
  ecosystem-neutral and should not evaluate package-manager syntax.
- **Select the first or last version token from output.** Rejected because OCR
  update advertisements make token position unsafe and nondeterministic.
