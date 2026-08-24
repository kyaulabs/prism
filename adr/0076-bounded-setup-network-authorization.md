# 0076. Bounded setup-network authorization

Date: 2026-08-20

## Status

Superseded by ADR-0083

## Context

The PHP/web project bootstrap resolves and audits Composer and npm dependency graphs, installs committed lockfiles, acquires Prism packages, and downloads Playwright Chromium. ADR-0063 requires explicit network approval before registry resolution, while ADR-0074 establishes that repeated prompts should be removed when selecting a bounded workflow already expresses the authorization.

The approved testing-ready project bootstrap specification treats `/setup` as one explicitly selected operation. Requiring another registry question and another browser-download question does not represent a new decision, but allowing `/setup` to imply arbitrary external access would violate Prism's consent boundary and hard prohibition on unapproved APIs.

The authorization therefore needs an exact lifetime and effect set. It must remain distinct from consumer mutation, standing OCR consent, GitHub mutation, Git remote access, credentials, web search, and unrelated network operations.

## Decision

Invoking `/setup` authorizes one bounded **setup-network attempt**.

Before the first network effect, `/setup` discloses that the active attempt may:

- acquire the explicitly selected Prism Core or project-local adapter package;
- contact Composer and npm registries to resolve and audit the active adapter's declared candidate graph;
- populate dependencies from the approved committed lockfiles with lifecycle scripts disabled; and
- download only the browser targets declared by the active adapter contract, initially Playwright Chromium.

No separate registry, audit, locked-install, or Chromium-download question is asked during that attempt. A stopped attempt ends the authorization. A later `/setup` invocation creates a new bounded authorization; Prism stores no standing setup-network consent.

The authorization is valid only for packages, versions, registries, commands, and browser targets already constrained by validated Core and active-adapter toolchain contracts. It does not authorize an unrecognized adapter, undeclared package, lifecycle script, arbitrary URL, or general package-manager passthrough.

Setup-network authorization never covers:

- OCR connectivity or reviewed-code egress, which remain governed exclusively by standing OCR consent;
- GitHub issue, label, pull-request, ruleset, release, or repository-administration operations;
- Git remote creation, fetch, pull, push, or clone;
- web search or other external APIs;
- provider authentication or credential access; or
- any filesystem or package mutation that has its own approval gate.

Global Core installation, project-local adapter installation, adapter desired-state application, canonical hook activation, global preference writes, and optional GitHub mutations retain their existing mutation or consent gates. Setup invocation authorizes their bounded network transport, not their state changes.

This decision supersedes ADR-0063 only where it requires a separate explicit network-approval prompt for adapter registry resolution, locked population, and browser acquisition. ADR-0063's tool ownership, exact/bounded versions, lifecycle-script prohibition, audits, candidate transaction, external prerequisite, and credential boundaries remain in force. It extends ADR-0074's approval-free workflow principle without broadening standing OCR consent.

## Consequences

- **Positive:** `/setup` no longer pauses for network questions whose answer is already expressed by selecting the disclosed setup workflow.
- **Positive:** authorization remains operation-scoped, non-persistent, contract-bound, and testable.
- **Positive:** mutation, OCR, GitHub, Git remote, credential, and web-search boundaries remain independent.
- **Negative:** users must understand that invoking `/setup` can contact package registries and browser-distribution infrastructure before they approve project-file mutation.
- **Negative:** any future setup network effect must fit the allowlisted contract or require this ADR to be superseded; it cannot be added silently.
- **Neutral:** a new `/setup` invocation after failure authorizes another bounded attempt without reauthorizing an unchanged committed scaffold mutation.

## Alternatives Considered

### Keep separate network prompts

Rejected because the prompts repeat a decision already made by invoking the disclosed setup workflow and create an avoidable pause between deterministic stages.

### Combine network and mutation authorization

Rejected because inspecting and resolving a candidate must remain possible without authorizing consumer-file changes. Network transport and project mutation are separate effects.

### Persist standing setup-network consent

Rejected because setup networking is occasional and project-specific. A standing global grant would be broader than necessary and harder to revoke or reason about.

### Treat `/setup` as general network permission

Rejected because it would transfer authorization to GitHub, Git remotes, web search, arbitrary URLs, and undeclared packages, violating least privilege and the external-effect boundary.

<!-- vim: ft=markdown sts=4 sw=4 ts=4 et : -->
