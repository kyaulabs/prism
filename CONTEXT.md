# Project Context

> Living document. Update when domain language, entities, or boundaries change.
> Read by agents before domain-coupled work (see `domain-context` skill).

## Purpose

<one-to-three sentences: what this application does and for whom>

## Domain Glossary

Ubiquitous language. Terms here are the canonical names used in code, tests,
UI copy, and conversation. When a term is introduced, add it here first.

| Term | Definition |
| --- | --- |
| <Term> | <definition> |

## Entities & Invariants

Core domain objects and the rules that always hold for them.

### <Entity>
- **Shape:** <key fields / columns>
- **Invariants:**
  - <rule that must always be true>
  - <rule that must always be true>
- **Lifecycle:** <created when… / transitions… / archived when…>

## System Boundaries

What this system owns vs. what it delegates to external services.

- **Owns:** <list>
- **Delegates:** <external APIs, services, the Aurora framework, etc.>
- **Boundary interfaces:** <where mocking is permitted — see `.opencode/docs/mocking.md`>

## Non-Goals

Explicit things this project will **not** do. Prevents scope creep and
spurious "features" during implementation.

- <non-goal>

## Architectural Decisions

Significant decisions live as ADRs in `adr/`. List accepted ADRs here with a
one-line summary; the full record is in `adr/NNNN-*.md`.

- `adr/0001-csp-policy-for-aurora-stack.md` — Content-Security-Policy design for the Aurora no-framework stack
- `adr/0002-first-party-semgrep-rules-pack.md` — First-party Semgrep rules pack with TDD rule authoring
- `adr/0003-env-delivery-mechanism.md` — First-party .env loader with explicit call pattern, no dependencies, server env precedence
- `adr/0004-filesystem-walker-arch-tests.md` — Replace pest-plugin-arch DSL with filesystem-walker convention tests for procedural codebase
- `adr/0005-plan-agent-delegation-only.md` — Deny all I/O permissions on Plan agent, add delegation-only prompt; all filesystem/web ops delegated to subagents
- `adr/0006-readonly-agent-permission-contract.md` — Enforce read-only contract (edit: deny, restricted bash) for read-only agents
- `adr/0007-setup-token-strategy.md` — Find literal template defaults instead of non-existent [EMAIL] placeholders; extract substitution logic into testable shell script
- `adr/0008-experimental-hook-dependency.md` — Continue using experimental.chat.system.transform for session-bootstrap enforcement with type-level guard tests
- `adr/0009-mechanized-changed-file-coverage-gate.md` — Mechanize per-changed-file coverage gate via Clover XML + git diff; single script invoked by both CI and /check
- `adr/0010-issue-closing-keyword-convention.md` — Enforce `Fixes: #NN` as the sole issue-closing keyword via commitlint, placed above `Plan-by:`; reject all other GitHub closing keywords

## When to update this file

- A new domain term enters the codebase or UI.
- An entity is added, removed, or its invariants change.
- A new external dependency or boundary is introduced.
- An ADR is accepted (add it to the list above).

Do **not** put implementation details, file paths, or stack choices here —
those belong in `AGENTS.md` or `.opencode/docs/`.
