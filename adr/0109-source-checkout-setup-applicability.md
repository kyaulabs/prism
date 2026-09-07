# 0109. Source-checkout setup applicability

Date: 2026-09-07

## Status

Accepted

Approved with the focused #501 implementation plan. Extends ADR-0105 and
partially supersedes ADR-0100's consumer-reconciliation applicability for the
Prism development repository. Its repository-owned automation remains in force.

## Context

The established setup classifier treats every root-owned Git repository as a
consumer. Prism's development checkout consequently enters consumer automation
reconciliation, which conflicts with its repository-specific workflows, hooks,
and coverage infrastructure. ADR-0105 fixed established consumer identity and
Core-only composition but deliberately deferred source-checkout applicability.

A prose exemption cannot correct a machine-selected consumer route. Recognizing
a source checkout must also not become permission to bypass consumer identity,
execute arbitrary package code, repair developer files, or widen setup consent.

## Decision

Core recognizes an independent Prism source checkout structurally, before setup
selects consumer effects. The closed setup-route schema two gains disposition
and applicability `SOURCE_CHECKOUT` and route `SOURCE_CHECKOUT_SETUP`. Unknown
values remain failures for older readers; no provider or bootstrap protocol or
project-manifest schema changes.

Source evidence consists of a private root package named `prism`, the fixed
Core package and matching validated toolchain declaration, and the required
Core script, skill, and prompt surfaces. Reads are bounded, owner-validated,
no-follow, and identity-checked through stable contained ancestry. Recognition
executes no source code, reads no Git configuration or credentials, contacts no
remote, and creates no state.

Ordinary clones and forks qualify regardless of clone name, remote configuration,
branch, or uncommitted source edits. Source-shaped linked worktrees, incomplete
claims, unsafe paths, and incoherent evidence fail closed. Unrelated consumers
retain their existing classification; a dependency named Prism or a directory
basename alone is insufficient. Source identity denotes workflow applicability,
not provenance, release compatibility, or a security endorsement of source code.

The source setup branch preserves repository-owned workflows, hooks, coverage
infrastructure, manifests, lockfiles, and disk-backed adapter activation. It does
not gather consumer metadata, reconcile consumer automation or package-release
files, apply adapter scaffolds/dependencies, or activate canonical consumer
hooks. Retained bootstrap state is not discarded or adopted as source setup.

Existing preflight, explicitly approved global Core installation, independent
standing consent, and optional global preferences keep their original gates.
Source recognition grants none of those effects. Applicable source validation
uses the existing check workflow and resolved harness validator, not a new
quality engine or consumer scaffold verification. Missing activation or tools,
failed validation, or changed source identity stops without repair or fallback.

Reports distinguish preserved source-owned automation, inapplicable consumer
reconciliation, and actual validation results. Route GO is not setup success.
Canonical consumer hooks still require coherent manifests and providers; source
classification changes no commit, signing, coverage, review, or publication gate.

## Consequences

- Source checkouts can complete applicable setup validation without replacing
  their repository-specific automation.
- Consumers retain ADR-0105's manifest-before-hook ordering and ADR-0100's
  ownership, approval, transaction, and recovery contracts.
- Recognition adds a narrow filesystem inspection boundary and closed route
  values requiring dedicated positive, negative, race, and preservation tests.
- Linked-worktree support, source repair, source package installation policy,
  new dependencies, and review-authority changes remain outside this fix.

## Alternatives considered

### Keep only a prose source-checkout exemption

Rejected because the executable classifier still selects consumer setup.

### Recognize the checkout from its directory or GitHub remote

Rejected because those values neither prove structure nor support offline forks
reliably; remote inspection is unnecessary for this local decision.

### Reconcile the source repository into a canonical consumer

Rejected because the development repository deliberately owns different
workflow, hook, and coverage behavior. Similarity is not mutation authority.

### Treat source recognition as a successful quality check

Rejected because classification cannot establish dependency readiness, adapter
activation, test results, or coherent review evidence.

<!-- vim: ft=markdown sts=4 sw=4 ts=4 et : -->
