# Project Context

> Living document. Update when domain language, entities, or boundaries change.
> Read by agents before domain-coupled work (see `domain-context` skill).

## Purpose

Prism is a coding harness for [OpenCode](https://opencode.ai) that codifies a
disciplined, test-driven approach to building PHP-based websites. Its primary
deliverable is the harness itself — skills, agents, commands, git hooks, and
ADRs that enforce a defined engineering pipeline (brainstorm → plan →
implement → verify → review) with mandatory TDD (Red → Green → Refactor), an
80% line-coverage gate, and Conventional Commits with signed atomic history.
Prism also ships an eval framework (`.opencode/evals/`) for measuring AI agent
behavior against expected-behavior specifications.

## Domain Glossary

Ubiquitous language. Terms here are the canonical names used in code, tests,
UI copy, and conversation. When a term is introduced, add it here first.

| Term | Definition |
| --- | --- |
| scout | Built-in OpenCode experimental subagent (`@scout`) — clones upstream dependencies and inspects source code for research. Disabled by default; enabled via `OPENCODE_EXPERIMENTAL_SCOUT=true` in `.opencode/experimental.default.env` (ADR-0024). |
| background subagent | OpenCode experimental feature (`OPENCODE_EXPERIMENTAL_BACKGROUND_SUBAGENTS`) — enables dispatching subagent tasks asynchronously. Feasibility gated on a manual spike (ADR-0024). |
| identity resolution order | The three-tier fallback chain for `Signed-off-by` identity: user-level `~/.config/opencode/setup.json` → project-level `.opencode/setup.json` → `git config user.name`/`user.email`. Implemented by `.github/scripts/resolve-identity.sh`. See ADR-0029. |
| setup.json | Canonical project configuration manifest at `.opencode/setup.json`. Schema versioned (`setup_version` field). Stores identity, scaffolding, model, variant, and experimental flag configuration. Sourced by `.envrc` via `jq` for environment variable export. See ADR-0029. |
| design agent | Primary OpenCode agent (TUI tab) that owns the brainstorming workflow front door: grilling → exploration → design → spec → commit → feature-branch creation. Cycle ends at spec + branch; hands off to the `plan` tab. Runs on the DESIGN model tier. Defined inline in `opencode.jsonc`. See ADR-0030. |

### Verdict
Terminal outcome of a single eval case. One of six case-level values
represented by the `KYAULabs\Eval\Verdict` backed enum: `Pass`, `Fail`,
`Timeout`, `Invalid`, `Skipped`, `Undetermined`. Behavior-level strings
(`YES`, `NO`, `UNCLEAR`) are separate and live only in behavior arrays.

## Entities & Invariants

Core domain objects and the rules that always hold for them.

### EvalCase
Parsed eval case from a JSON file (`.opencode/evals/smoke/*.json`).
Schema-validated by `.opencode/evals/schema.json` and mirrored by
`EvalCase::validate()` (ADR-0016 — parity enforced by
`tests/Unit/Eval/EvalCaseSchemaParityTest.php`).

- **Shape:** `name` (kebab-case), `description`, `agent` (kebab-case,
  optional `@`-prefix), `input`, `expectedBehavior` (non-empty `string[]`),
  `passCriteria` (one of 5 enum-like values), optional `tags`, optional
  `expectedString` (required only when `passCriteria` is
  `'output contains expected string'`).
- **Invariants:**
  - `name` matches `^[a-z][a-z0-9-]*$`
  - `agent` matches `^@?[a-z][a-z0-9_-]*$`
  - `passCriteria` ∈ {`'all behaviors observed'`, `'no errors in output'`,
    `'exit code zero'`, `'output contains expected string'`,
    `'manual inspection required'`}
  - `expectedString` is set IFF `passCriteria` is `'output contains expected
    string'`
- **Lifecycle:** Authored as JSON → loaded via `EvalCase::fromFile()` →
  validated → executed by `Runner` → produces an `EvalResult`.

### EvalResult
Immutable result object produced by the eval runner for a single case.
**Invariant:** `verdict` is always a `Verdict` enum case (never a raw
string).

## System Boundaries

What Prism owns vs. what it delegates to external services.

- **Owns:**
  - **Harness configuration** — `opencode.jsonc`, `.opencode/{agents,commands,skills,docs,evals}/`
  - **Git hooks** — `.github/hooks/` (pre-commit, commit-msg, prepare-commit-msg, pre-push, post-checkout, post-merge), installed via `.github/scripts/install-hooks.sh`
  - **CI workflow** — `.github/workflows/ci.yml` (lint, test, SAST, commitlint)
  - **Quality gates** — `.github/scripts/coverage-gate.php` (ADR-0009) + the `/check` command
  - **Eval framework** — `.opencode/evals/bin/` (case parser, runner, judge integration, worktree isolation)
  - **Documentation** — `AGENTS.md`, `CONTEXT.md`, `CODING_HARNESS.md`, `adr/`, `docs/`, `CONTRIBUTING.md`, `SECURITY.md`, `CODE_OF_CONDUCT.md`
  - **Harness tests** — `tests/Unit/Harness/`, `tests/Unit/Eval/`, `tests/Integration/Eval/`, `tests/Shell/`, `tests/Semgrep/`

- **Delegates:**
  - **OpenCode runtime** — model inference, tool dispatch, plugin hooks (`experimental.chat.system.transform` per ADR-0008), slash-command runtime, permission enforcement. Prism configures it; OpenCode executes it.
  - **Aurora PHP Framework** — the no-MVC PHP stack shipped as a submodule at `aurora/`. Prism assumes its patterns; Aurora implements them.
  - **PHP/JS toolchain** — Composer, php-cs-fixer, Pest, npm, Dart Sass, uglify-js, ESLint, Stylelint. Prism wires them into hooks and `/check`; the tools themselves are upstream.
  - **External security/review tools** — Semgrep, gitleaks, OpenCodeReview (`ocr`), git-cliff, commitlint, Shellcheck. Prism invokes them; their rule packs and heuristics are upstream.
  - **GitHub** — issue tracking, label taxonomy enforcement (via native issue-type and Progress fields per `docs/agents/labels.md`), Actions runners, release distribution.
  - **LLM providers** — model inference happens at upstream providers (DeepSeek, OpenRouter, etc.) configured via `{env:OPENCODE_MODEL_*}`. Prism does not host or proxy inference.

- **Boundary interfaces:** Mockable surfaces include the OpenCode plugin hook layer (ADR-0008), the coverage-gate script's input (Clover XML via `phpunit.xml` `<source>` block), the eval runner's subprocess boundary (exec'd `opencode run`), and the Aurora SQL handler. Mocking of live model inference is not supported — agents and the eval judge run against real providers.

## Non-Goals

Explicit things this project will **not** do. Prevents scope creep and
spurious "features" during implementation.

- **Not a PHP application** — Prism ships no application code in an `<app>/` webroot or under `backend/` beyond `env.php`. The harness is the deliverable; an application built *using* Prism would be a separate project.
- **Not a framework** — no MVC, no router, no templating engine, no ORM (per `AGENTS.md`). Aurora provides the PHP stack; Prism does not duplicate it.
- **No push/merge automation** — every agent is denied `git push`. Humans push, humans merge, humans review releases.
- **No bundled LSP servers** — Prism configures LSP usage (Intelephense, TypeScript, Stylelint, ESLint, Bash, YAML; Deno explicitly disabled) but expects them system-installed.
- **No CI provider lock-in** — the lint/test/SAST surface uses GitHub Actions, but the underlying scripts (`coverage-gate.php`, `install-hooks.sh`, etc.) are CI-agnostic.
- **No model fine-tuning or hosting** — Prism configures upstream models per tier via `{env:VAR}` substitution (ADR-0012 through ADR-0014) but does not train, fine-tune, host, or proxy inference.
- **No dynamic per-task variant switching** — opencode's architecture resolves model and variant statically at startup (ADR-0011). The Plan Agent Complexity Assessment is prompt-driven, not variant-driven.
- **No bundled migration tooling** — `backend/migrations/` holds timestamp-prefixed forward-only SQL files; no migration framework is provided.
- **No eval execution inside the source tree** — every eval case runs in a disposable git worktree (`Runner::createWorktree()`) so an agent under test cannot mutate the source working tree.

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
- `adr/0010-issue-closing-keyword-convention.md` — Enforce `Fixes: #NN` as the sole issue-closing keyword via commitlint, placed above `Authored-by:`; reject all other GitHub closing keywords
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
- `adr/0022-sub-agent-model-config-opencode-jsonc.md` — Sub-agent model/variant config must live in opencode.jsonc (not .md frontmatter) per runtime limitation; temperature stays literal
- `adr/0023-safety-hook-for-bash-tool-interception.md` — Harness-wide safety guardrail for bash tool calls
- `adr/0024-experimental-subagent-dependencies.md` — Enable @scout (built-in experimental), consolidate all experimental opencode-process flags into auto-sourced .opencode/experimental.default.env, defer background subagents to Phase-0 spike
- `adr/0025-ci-local-parity-principle.md` — CI ↔ local check parity for pre-remote enforcement; fail-closed commitlint, harness + shellcheck pre-push, agent bypass blocked
- `adr/0026-project-scaffolding.md` — Dual-mode /setup subfolder scaffold with manifest-driven quality surface, split setup_version 2→3 migration, and additive --target-dir flag
- `adr/0027-plans-specs-lifecycle.md` — Plans/specs are development artifacts: commit on create, delete on branch completion, git history is canonical
- `adr/0028-git-flow-branch-naming-enforcement.md` — Mechanically enforce Git Flow branch naming via `new-branch.sh` + `prepare-commit-msg` hook; allowed commit types plus `hotfix`/`release`
- `adr/0029-unified-setup-json-config.md` — Consolidate model + experimental `.env` files into unified `setup.json` (schema v4) with `jq`-sourced direnv export and 3-tier identity fallback
- `adr/0030-design-primary-agent-and-tier.md` — Add `design` primary agent (TUI tab) on a new DESIGN model tier; delete `/feature`; move branch creation into the brainstorming skill

## When to update this file

- A new domain term enters the codebase or UI.
- An entity is added, removed, or its invariants change.
- A new external dependency or boundary is introduced.
- An ADR is accepted (add it to the list above).

Do **not** put implementation details, file paths, or stack choices here —
those belong in `AGENTS.md` or `.opencode/docs/`.
