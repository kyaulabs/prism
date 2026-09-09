# 0114. Non-Prism versions are observations

Date: 2026-09-08

## Status

Accepted by explicit user approval, including Pi without a version exception.

Partially supersedes ADR-0063's external version compatibility gates and
ADR-0110's SDK numeric readiness interval. Package ownership, dependency pins,
capability validation, audit requirements, and isolation remain unchanged.

## Context

Readiness rejected executable tools because reported versions differed from
Prism's reference versions. Pest's metadata identifies 5.1.1 while its executable
reports 5.0.5. Such a mismatch prevents testing the actual implementation and is
not itself evidence that a required operation is unavailable.

The user requested removal of runtime version blockers for everything except
Prism, explicitly including Pi. This is not approval to loosen dependency pins,
skip security audits, forge successful checks, or change providers and models.

## Decision

Non-Prism tool and runtime versions are best-effort observations, not readiness
predicates. External tools must exist; actual requested operations must succeed.
Version probes remain bounded and their raw output is not relayed. Failed,
ambiguous, or unavailable observations are represented as `null`, never as an
invented version. Quality receipts accept this explicit null only for external
tool metadata; their structure, gate outcomes, and identities remain validated.

Bundled tool resolution preserves package ownership and bin containment but no
longer rejects a different installed dependency version. Adapter verification
retains declared manifest/lock graph consistency, executable resolution, and
mandatory audits without matching native version output to package pins. PHP
readiness and generated smoke tests verify required capabilities rather than a
numeric minimum.

The Pi SDK is loaded regardless of its reported version. Its version is bounded
informational metadata only. Import failures, missing APIs, unsafe provenance,
resource-isolation failures, and unavailable active models remain failures.
No alternative SDK, provider, or model is selected as a fallback.

Prism Core and adapter package identity, package/protocol compatibility,
catalogue authenticity, receipt schema versions, and exact review/check
attestations remain enforced. Dependency declarations, native package-manager
constraints, lockfiles, and fixed CI test versions remain reproducibility
inputs. This decision changes runtime gating, not dependency acquisition.

## Consequences

- Older, newer, development, or unexpectedly reported non-Prism versions can run
  if the required operations actually work.
- A readiness PASS for an external executable establishes availability, not a
  claim that every operation or arbitrary release is compatible.
- Unknown version metadata cannot create or reuse a successful gate result;
  actual execution remains mandatory.
- Existing dependency advisories and configuration/test failures are not waived.
- No packages, credentials, provider configuration, or system installation are
  modified by adopting this policy.
