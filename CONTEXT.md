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

### Verdict
Terminal outcome of a single eval case. One of six case-level values
represented by the `KYAULabs\Eval\Verdict` backed enum: `Pass`, `Fail`,
`Timeout`, `Invalid`, `Skipped`, `Undetermined`. Behavior-level strings
(`YES`, `NO`, `UNCLEAR`) are separate and live only in behavior arrays.

## Entities & Invariants

Core domain objects and the rules that always hold for them.

### <Entity>
- **Shape:** <key fields / columns>
- **Invariants:**
  - <rule that must always be true>
  - <rule that must always be true>
- **Lifecycle:** <created when… / transitions… / archived when…>

### EvalResult
Immutable result object produced by the eval runner for a single case.
**Invariant:** `verdict` is always a `Verdict` enum case (never a raw
string).

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
- `adr/0011-plan-agent-complexity-assessment.md` — Plan agent uses `high` variant + prompt-based complexity heuristics; dynamic variant switching ruled infeasible (opencode architecture limitation)
- `adr/0012-configurable-model-variables.md` — Replace hard-coded model IDs with `{env:VAR}` substitution across three tiers; direnv-delivered defaults with /setup integration
- `adr/0013-configurable-variant-via-env-var.md` — Extend `{env:VAR}` substitution to `variant` field; add JUDGE tier (4 tiers total); temperature stays literal per prototype findings
- `adr/0014-model-default-rebalancing.md` — Model default rebalancing (primary/planner/judge/utility tier defaults) and temperature explicitness
- `adr/0015-index-based-linting-in-pre-commit-hook.md` — Index-based linting in pre-commit hook (lint staged blobs, not working-tree files)
- `adr/0016-eval-case-dual-validation.md` — schema.json canonical, validate() hand-rolled mirror guarded by parity test; runtime schema validation deferred due to worktree vendor/ constraint
- `adr/0017-command-only-template-features.md` — $ARGUMENTS and !`command` shell injection are command-only; agents use invocation-message references
- `adr/0018-shell-test-helper-library.md` — Consolidate duplicated shell-test boilerplate into tests/Shell/lib/test_helpers.sh as the single source of truth
- `adr/0019-issue-command-conventional-commit-mapping.md` — Auto-derive org-level issue types from conventional commit types; two-phase Plan + @explore architecture for gh CLI execution
- `adr/0020-unified-issue-command-architecture.md` — Unify /issue + /plan-to-issues into four aliases backed by a shared ticketing skill; vertical-slice decomposition with native blocking edges
- `adr/0021-code-review-coordinator-permission-model.md` — Scoped `task: allow` carve-out from ADR-0006 for the @code-review multi-axis coordinator

## When to update this file

- A new domain term enters the codebase or UI.
- An entity is added, removed, or its invariants change.
- A new external dependency or boundary is introduced.
- An ADR is accepted (add it to the list above).

Do **not** put implementation details, file paths, or stack choices here —
those belong in `AGENTS.md` or `.opencode/docs/`.
