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
| scout | Built-in OpenCode experimental subagent (`@scout`) — clones upstream dependencies and inspects source code for research. Disabled by default; enabled via `OPENCODE_EXPERIMENTAL_SCOUT=true` in the `experimental` section of the Prism manifest (auto-sourced by `.envrc`; ADR-0024, consolidated by ADR-0029, superseded by ADR-0043). |
| background subagent | OpenCode experimental feature (`OPENCODE_EXPERIMENTAL_BACKGROUND_SUBAGENTS`) — enables dispatching subagent tasks asynchronously. Feasibility gated on a manual spike (ADR-0024). |
| Prism manifest | Canonical configuration manifest. Schema versioned (`setup_version` field, currently v6 per ADR-0049; ADR-0043 established schema v5, and its exact schema and five-tier clauses are partially superseded). Stores identity, scaffolding, model, variant, experimental flag, optional integration-key (`env`) configuration, and optional Boolean integration-preference fields (`mcp.*`, `plugins.*`) for MCP servers and npm plugins. Exists at two locations (see *project Prism manifest* and *user Prism manifest*). Parsed by a single dependency-free PHP JSONC reader (`PrismJsoncDocument` + `PrismManifest` CLI); no longer `jq`-sourced. Full JSONC (line/trailing `//` + block `/* */` + trailing commas). See ADR-0043 (supersedes ADR-0029, ADR-0032), ADR-0045, and ADR-0049. |
| project Prism manifest | The `prism.jsonc` file at the **repository root** — the single source of project-level truth. Required. Mode `0644`. Its `env.*` values are always empty (secret-slot invariant enforced by `check-setup-secrets.sh`). Supersedes the legacy `.opencode/setup.json` (removed entirely, no fallback). See ADR-0043. |
| user Prism manifest | The optional `prism.jsonc` file at `~/.config/opencode/prism.jsonc` — personal overrides that overlay project defaults **field-by-field** (recursive object merge; arrays/scalars replaced atomically). Mode `0600`. Holds real `env.*` secret values (never committed). Migrated from legacy `~/.config/opencode/setup.json` by `/setup`, which emits a deprecation warning if the old file reappears. See ADR-0043. |
| manifest resolution order | The two-tier resolved-view chain: **project `prism.jsonc`** (defaults) overlaid by **user `~/.config/opencode/prism.jsonc`** (per-field overrides). A missing user manifest is valid; a malformed manifest at either tier fails closed. Identity resolution reads the resolved view, then falls back to `git config user.name`/`user.email` only when the resolved identity pair is incomplete. Implemented by `.github/scripts/resolve-identity.sh` via the `values0` CLI. See ADR-0043. (Supersedes ADR-0029's three-tier `setup.json` fallback.) |
| setup.json (legacy) | The pre-ADR-0043 configuration manifest at `.opencode/setup.json` (project) and `~/.config/opencode/setup.json` (user). Schema v4, `jq`-parsed, three-tier identity fallback. **Superseded by ADR-0043** — both locations renamed to `prism.jsonc`, schema bumped to v5, project legacy removed entirely, user legacy migrated by `/setup` with a deprecation warning. Referenced by historical ADRs (0024, 0026, 0029–0033, 0040) which remain immutable records. |
| chat agent | Primary OpenCode agent (TUI tab) for conversational Q&A, code explanation, and brainstorming on the UTILITY model tier. Read-only posture: denies edit/bash/task; allows read/glob/grep/list/lsp/webfetch/websearch. Defined inline in `opencode.jsonc`. See ADR-0034. |
| design agent | Primary OpenCode agent (TUI tab) that owns the brainstorming workflow front door: grilling → exploration → design → spec → commit → feature-branch creation. Cycle ends at spec + branch; hands off to the `plan` tab. Runs on the DESIGN model tier. Defined inline in `opencode.jsonc`. See ADR-0030. |
| explore agent | Subagent for focused codebase exploration on the JUDGE model tier. Read-only posture: denies edit/webfetch/task, bash catch-all deny with a scoped read-only allowlist (ls/cat/tail/head/grep/find, read-only git); `lsp: allow` with an LSP-first prompt for structural queries (`findReferences`/`callHierarchy`), falling back to glob/grep/read for text and prose (ADR-0038 follow-up). Lives in `.opencode/agents/explore.md` (model/variant/temperature inline in `opencode.jsonc` per ADR-0022). See ADR-0006. |
| FRONTEND model tier | Sixth model/variant tier of the Prism manifest (schema v6; ADR-0049). Shipped defaults `openai/gpt-5.6-sol` and `xhigh`; sole consumer is the hidden `@frontend` subagent at literal temperature `0.3`. Exported as `OPENCODE_MODEL_FRONTEND` / `OPENCODE_VARIANT_FRONTEND` and independently overridable per-user through `/setup`. Sol consumption shares the OpenAI rolling weekly window; operators override the manifest values or select another model manually when capacity is low — no automatic fallback. See ADR-0049. |
| frontend agent | Hidden terminal OpenCode subagent (`@frontend`) on the FRONTEND model tier. Sole owner of the four gated frontend skills (`frontend-design`, `frontend-architecture`, `scss-mobile-first`, `accessibility`); edits only handoff-approved presentation PHP/HTML, `cdn/sass`, and `cdn/js` sources. Cannot author tests, stage, commit, install dependencies, access the web, or dispatch subagents. Receives the pre-Red standards consultation and the post-Red implementation handoff from `@tdd`. See ADR-0049. |
| frontend implementation slice | The unit of frontend work `@tdd` delegates to `@frontend`: one observable behavior selected with the pre-Red standards checklist, the failing-test output `@tdd` verified, and the permitted-file list returned by the consultation. `@frontend` implements and refactors within those paths; `@tdd` retains Green verification, coverage, staging, and commit ownership. See ADR-0049. |
| MCP server | Optional Model Context Protocol server registered under the `mcp` key in `opencode.jsonc`. Tracked definitions are permanent and statically `enabled: false`; actual enablement is composed from the resolved Prism manifest into `OPENCODE_CONFIG_CONTENT` at env0 time. Keys flow via `prism.jsonc` `env` section → `.envrc` → `{env:VAR}`. `DEEPSEEK_API_KEY` serves the `deepseek-websearch` MCP. See `.opencode/docs/mcp.md`, ADR-0032 (historical, superseded), and ADR-0045. |
| quota plugin | The `@slkiser/opencode-quota` npm package, pinned at 4.0.1 and installed but not loaded by default. Toggled via `plugins.opencode_quota` in the Prism manifest (user-facing; `/setup` prompt). The PHP manifest boundary adds or removes exactly this package name from the composed `OPENCODE_CONFIG_CONTENT` plugin array; it never touches unrelated plugin entries. Opt-in, controlled by the user Prism manifest only — the project manifest always tracks `false`. See ADR-0040 and ADR-0045. |
| denial event | A bash tool invocation that the harness prevents from executing (config-deny, safety-hook block, or ask rejection). Characterized by a `message.part.updated` `state.status: "error"` with no matching `tool.execute.after`. Does NOT include commands that execute and return nonzero — those produce `completed` + `after` and count as success for reset. The unit the circuit breaker counts. See ADR-0042. |
| consecutive-denial state | Per-agent-invocation (`sessionID`) counter of sequential denial events, reset to zero by any successful bash tool use (matching `tool.execute.after`). Non-bash success does not reset the streak. Held by the `DenialCircuitBreaker` in `.opencode/plugins/denial-circuit-breaker.ts`. Detection locked to before/after callID reconciliation (Option 3a, Probe-3). See ADR-0042. |
| circuit breaker | Harness plugin that escalates (`session.abort` + redacted diagnostic) once consecutive-denial state reaches threshold 3, halting an agent stuck retrying denied commands. Extends upstream `doom_loop` for the bash-denial variation-retry class (which identical-input keying misses). Detection uses before/after callID reconciliation. See ADR-0042. |
| agent-invocation identity | The `sessionID` used to isolate per-agent state such as the circuit breaker's counter. Subagent sessions are distinct from their caller's — each `@explore` dispatch is its own invocation. |
| tool-call identity | The `callID` assigned to each individual tool invocation. Used by the before/after reconciliation layer (ADR-0042 §3) to correlate `message.part.updated` tool-part events and `tool.execute.after` hooks per invocation. Distinct from `sessionID` (agent-invocation identity). |
| protected branch | A Git branch (`develop` or `main`) that accepts only merged pull requests. Writes are blocked locally (`prepare-commit-msg` + `pre-push` hooks), enforced server-side (a GitHub repository ruleset named `pr-only-integration`), and verified in CI (`verify-protected-push.sh` provenance tripwire). The initial single-root seed push is the sole direct-write exception. See ADR-0044. |
| sensitive path | A filesystem path every agent and sub-agent is forbidden to read, print, copy, encode, or transmit: the opencode auth store (`~/.local/share/opencode/`, incl. `auth.json`/`mcp-auth.json` basenames anywhere), `~/.opencodereview/`, `~/intelephense/licen?e.txt`, `~/.config/opencode/` (user Prism manifest), `~/.ssh/`, `~/.aws/`, `~/.netrc`, `~/.git-credentials`, `/etc/ssl/private/`, and any `**/.env`/`.env.*` anywhere on the filesystem. `.env.example` is the sole env-class exception. Enforced by an **immutable deny floor** in `.opencode/plugins/sensitive-paths.ts` — the Prism manifest can only ADD paths via `security.additional_sensitive_paths` (never reduce), with project-plus-user **union** semantics (ADR-0048) and a trusted `/setup` boundary for the prism-user-manifest class. See ADR-0047, ADR-0048. |
| oversized request | Work too large for one spec in a single session — spanning multiple independent subsystems or with unknowns that cannot be expressed as sharp questions. Pre-spec discovery and decomposition route to wayfinder; ticketing retains post-spec/plan slicing under ADR-0020. See ADR-0050. |
| strict greenfield | A repository satisfying the all-of predicate evaluated by `.github/scripts/classify-greenfield.sh` (no commits, no docs/plans/specs/ADRs, no application source). Missing or malformed evidence is indeterminate and fails closed to established routing. See ADR-0050. |
| walking-skeleton bootstrap | The sole strict-greenfield exception to immediate wayfinding: one brainstorming session scoped to scaffold plus one thin vertical slice, seeded by a human-pushed single-root commit on `develop` (ADR-0044); implementation still follows spec → plan → @tdd → verification → `/check` → @code-review. See ADR-0050. |
| wayfinder map | The shared map of investigation tickets a fresh wayfinder session creates on GitHub Issues for work remaining after a greenfield bootstrap, storing the immutable bootstrap-spec blob URL in its Notes before ADR-0027 cleanup. See ADR-0050. |

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

### Prism manifest
The unified configuration manifest (ADR-0043). Two on-disk instances share
one schema and one reader.

- **Locations:** project `prism.jsonc` (repo root, required, mode `0644`)
  and optional user `~/.config/opencode/prism.jsonc` (mode `0600`).
- **Schema:** `setup_version: 6`. Fields: `timestamp`, `configured`,
  `app`/`domain`/`repo`, `signed_off_by_name`/`signed_off_by_email`,
  `accent`, `scaffold_mode` (`skip`/`clone`/`new`), `project_folder`,
  `models.*` (6 tiers), `variants.*` (6 tiers), `experimental.*` (3 flags),
  `env.*` (integration keys). Unknown fields preserved and overlaid.
- **Format:** full JSONC — full-line `//`, trailing `//`, block `/* */`,
  and trailing commas. Parsed by `PrismJsoncDocument` (state-machine
  tokenizer; not a regex stripper) + `PrismManifest` (validation, recursive
  overlay). No `jq`, no Composer dependency.
- **Invariants:**
  - Project `env.*` values are always empty (secret-slot guard enforced at
    staged-blob and CI).
  - User `env.*` may be non-empty (real secrets, never committed).
  - Resolution is a recursive field-by-field overlay (user wins per-field;
    object keys merge, arrays/scalars replace atomically). A missing user
    manifest is valid. **Security-scoped exception (ADR-0048):**
    `security.additional_sensitive_paths` unions across tiers (project list
    then user list, order-preserving, deduplicated) — the user tier can add
    but never remove a project-tier sensitive-path addition.
  - Fail-closed: missing project manifest, malformed either-tier manifest,
    duplicate key, unsupported schema version, unsafe symlink, > 1 MiB, or
    > 64 nesting levels. No silent fall-through.
  - `/setup` patches owned fields in place, preserving every comment and
    unrelated field; byte-idempotent on repeat.
  - All writes atomic; never follow a symlink write target.
- **Lifecycle:** `/setup` migrates legacy `setup.json` → `prism.jsonc`
  (project removed after verify; user removed with deprecation-warning
  safety net). `migrate-setup.sh` is the idempotent engine; `/setup`
  invokes it on entry.

## System Boundaries

What Prism owns vs. what it delegates to external services.

- **Owns:**
  - **Harness configuration** — `opencode.jsonc`, `.opencode/{agents,commands,skills,docs,evals}/`
  - **Harness plugins** — `.opencode/plugins/` (`pre-tool-use.ts` safety hook ADR-0023/0036, `session-bootstrap.ts` ADR-0008, `denial-circuit-breaker.ts` ADR-0042)
  - **Git hooks** — `.github/hooks/` (pre-commit, commit-msg, prepare-commit-msg, pre-push, post-checkout, post-merge), installed via `.github/scripts/install-hooks.sh`
  - **CI workflows** — `.github/workflows/ci.yml` (lint, test, SAST, commitlint) and `.github/workflows/release.yml` (validated tag/Release publication and back-merge PR opening, ADR-0046)
  - **Quality gates** — `.github/scripts/coverage-gate.php` (ADR-0009) + the `/check` command
  - **Eval framework** — `.opencode/evals/bin/` (case parser, runner, judge integration, worktree isolation)
  - **Documentation** — `AGENTS.md`, `CONTEXT.md`, `CODING_HARNESS.md`, `adr/`, `docs/`, `CONTRIBUTING.md`, `SECURITY.md`, `CODE_OF_CONDUCT.md`
  - **Harness tests** — `tests/Unit/Harness/`, `tests/Unit/Eval/`, `tests/Integration/Eval/`, `tests/Shell/`, `tests/Semgrep/`

- **Delegates:**
  - **OpenCode runtime** — model inference, tool dispatch, plugin hooks (`experimental.chat.system.transform` per ADR-0008), slash-command runtime, permission enforcement. Prism configures it; OpenCode executes it.
  - **Aurora PHP Framework** — the no-MVC PHP stack shipped as a submodule at `aurora/`. Prism assumes its patterns; Aurora implements them.
  - **PHP/JS toolchain** — Composer, php-cs-fixer, Pest, npm, Dart Sass, uglify-js, ESLint, Stylelint. Prism wires them into hooks and `/check`; the tools themselves are upstream.
  - **External security/review tools** — Semgrep, gitleaks, OpenCodeReview (`ocr`), git-cliff, commitlint, Shellcheck. Prism invokes them; their rule packs and heuristics are upstream.
  - **GitHub** — issue tracking, label taxonomy enforcement (via native issue-type and Progress fields per `docs/agents/labels.md`), Actions runners, release distribution, and repository rulesets for protected-branch enforcement (ADR-0044).
  - **LLM providers** — model inference happens at upstream providers (DeepSeek, OpenAI, OpenRouter, etc.) configured via `{env:OPENCODE_MODEL_*}`. Prism does not host or proxy inference. Provider auth is API-key or, for OpenAI, subscription-OAuth (ChatGPT Plus/Pro) — the binding economic constraint varies by auth path (per-token vs rolling weekly window; ADR-0040).

- **Boundary interfaces:** Mockable surfaces include the OpenCode plugin hook layer (ADR-0008), the coverage-gate script's input (Clover XML via `phpunit.xml` `<source>` block), the eval runner's subprocess boundary (exec'd `opencode run`), and the Aurora SQL handler. Mocking of live model inference is not supported — agents and the eval judge run against real providers.

## Non-Goals

Explicit things this project will **not** do. Prevents scope creep and
spurious "features" during implementation.

- **Not a PHP application** — Prism ships no application code in an `<app>/` webroot or under `backend/` beyond `env.php`. The harness is the deliverable; an application built *using* Prism would be a separate project.
- **Not a framework** — no MVC, no router, no templating engine, no ORM (per `AGENTS.md`). Aurora provides the PHP stack; Prism does not duplicate it.
- **No push/merge automation** — every agent is denied `git push`. Humans push work branches and merge pull requests. Only `.github/workflows/release.yml` may create a validated release tag/Release and open a back-merge PR; it never pushes a branch or merges a PR. Protected branches (`develop`, `main`) accept only merged PRs (ADR-0044).
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
- `adr/0024-experimental-subagent-dependencies.md` — Enable @scout (built-in experimental), consolidate all experimental opencode-process flags into a single auto-sourced location, defer background subagents to Phase-0 spike (sourcing clause superseded by ADR-0029: flags moved into `.opencode/setup.json`'s `experimental` key; the original committed env-file location is retained in the ADR record)
- `adr/0025-ci-local-parity-principle.md` — CI ↔ local check parity for pre-remote enforcement; fail-closed commitlint, harness + shellcheck pre-push, agent bypass blocked
- `adr/0026-project-scaffolding.md` — Dual-mode /setup subfolder scaffold with manifest-driven quality surface, split setup_version 2→3 migration, and additive --target-dir flag
- `adr/0027-plans-specs-lifecycle.md` — Plans/specs are development artifacts: commit on create, delete on branch completion, git history is canonical
- `adr/0028-git-flow-branch-naming-enforcement.md` — Mechanically enforce Git Flow branch naming via `new-branch.sh` + `prepare-commit-msg` hook; allowed commit types plus `hotfix`/`release`
- `adr/0029-unified-setup-json-config.md` — Consolidate model + experimental `.env` files into unified `setup.json` (schema v4) with `jq`-sourced direnv export and 3-tier identity fallback
- `adr/0030-design-primary-agent-and-tier.md` — Add `design` primary agent (TUI tab) on a new DESIGN model tier; delete `/feature`; move branch creation into the brainstorming skill
- `adr/0031-model-rebalance-and-footer-rename.md` — z.ai Pro plan rebalance (GLM-5.2 max for plan/code/design, DeepSeek-Pro for cross-model review) + commit footer rename (Authored-by/Tested-by); supersedes ADR-0014, amends ADR-0010
- `adr/0032-mcp-server-onboarding.md` — Optional MCP servers (commented-out in `opencode.jsonc`) + unified `env` key-flow via `setup.json`/`.envrc` (no version bump; ADR-0030 jq-fallback pattern); amends ADR-0029
- `adr/0033-compaction-prune-enablement.md` — Enable `compaction.prune` to cut cache_read token burn (the dominant cost component, 10–17× input tokens; variant is second-order); amends ADR-0031/0014 cost model, names context-economization follow-ups
- `adr/0034-chat-primary-agent.md` — Add `chat` primary agent on the UTILITY tier (read-only conversational tab for Q&A, code explanation, brainstorming); self-sufficient read-only posture, forward-looking `graphify_*` permission
- `adr/0035-ci-runner-fork-isolation.md` — Migrate CI `check` job from self-hosted to GitHub-hosted ephemeral runner (`ubuntu-latest`) for fork-PR isolation; eliminate workflow-source `sudo`, set `persist-credentials: false`, add composer `--no-scripts`; clarifies that ADR-0025 parity is gate-equivalence, not runner-equivalence
- `adr/0036-safety-hook-fail-closed-block-rules.md` — Reverse ADR-0023 fail-open posture on block-level rule evaluation; classifier errors now BLOCK rather than silently pass; documented known minimal-tokenizer limitation
- `adr/0037-coverage-gate-empty-clover-and-strict-mode.md` — Empty/degenerate Clover now hard-fails (exit 2); out-of-source executable files WARN by default and FAIL under `--strict`; amends ADR-0009
- `adr/0038-abort-graphify-explore-integration.md` — Abort the Graphify→`@explore` integration: extraction lacks cross-file/reverse-call edges and the NL query layer is imprecise; LSP already serves `@explore`'s structural queries better. Phase 2 §2.4 abort signal. (Manual-only `/graph` retention subsequently reversed by ADR-0039.)
- `adr/0039-purge-graphify.md` — Purge Graphify entirely (skill, `/graph` command, binary, chat `graphify_*` grant, glossary, docs refs); supersedes ADR-0038's manual-only retention. LSP remains the structural-navigation tool.
- `adr/0040-gpt-5-6-sol-on-design-planner-tiers.md` — Route GPT-5.6 Sol (ChatGPT-Plus OAuth) to DESIGN+PLANNER at `xhigh`; add `Implemented-by:` commit footer (PRIMARY tier) to attribute all three pipeline models. References ADR-0031/0030.
- `adr/0041-rcs-header-normalizer-in-pre-commit.md` — Pre-commit hook is an idempotent RCS-header normalizer (strip-then-insert, commit-date refresh); header is a last-commit marker, not creation stamp; rcs-header skill aligned to match
- `adr/0042-consecutive-denial-circuit-breaker.md` — Consecutive-denial circuit breaker for bash variation-retry hang (config-deny, safety-block, ask-reject); structural outcome inference via before/after callID reconciliation; threshold 3 + session.abort escalation
- `adr/0043-prism-jsonc-manifest-migration.md` — Dual-rename both setup.json manifests to `prism.jsonc` (project root + user home), schema v5, single dependency-free PHP JSONC reader replacing `jq`, recursive field-by-field overlay, full JSONC + trailing commas, in-place comment-preserving `/setup` patching; supersedes ADR-0029 + ADR-0032's JSONC rejection
- `adr/0044-pr-only-protected-branches.md` — Three-layer PR-only protection (local hooks + GitHub ruleset + CI tripwire) for `develop` and `main`; single-root scaffold exception; idempotent ruleset provisioning via `setup-rulesets.sh`; PR-only release/back-merge flows
- `adr/0045-manifest-driven-mcp-plugin-toggles.md` — Manifest-driven Boolean toggle preferences for optional MCP servers and quota plugin; supersedes ADR-0032's commented-block enablement
- `adr/0046-automated-release-pipeline.md` — Split release finalization: local `/release` authors the reviewed release PR; `release.yml` publishes the unsigned tag/Release at the immutable merge SHA and opens the human-merged back-merge PR; partially supersedes ADR-0044's release-origin and manual-finalization clauses
- `adr/0047-sensitive-path-enforcement.md` — Four-layer sensitive-path enforcement (plugin matcher + permission rules + validator contract + prompt prohibition) with an immutable deny floor, additive-only manifest extension, trusted `/setup` boundary, and documented residual risk; extends ADR-0023/0036/0042
- `adr/0048-sensitive-path-enforcement-corrections.md` — Corrections to ADR-0047's implementation: project-plus-user union for `security.additional_sensitive_paths`, invocation-scoped `/setup` trust (depth-0 only), last-match-wins permission ordering invariant, deny set for every bash-object agent + `external_directory` check, `glob.pattern`/`grep.include` interception with fail-closed malformed args, symlink canonicalization, manifest-level validation of the security field, canary-only fixtures; partially supersedes ADR-0047
- `adr/0049-frontend-model-tier-and-tdd-owned-agent.md` — Add schema-v6 FRONTEND model routing and a skill-gated implementation subagent owned by `@tdd`.
- `adr/0050-oversized-brainstorming-wayfinder-greenfield-bootstrap.md` — Make wayfinder the sole pre-spec route for oversized work; strict-greenfield repositories get a walking-skeleton bootstrap before wayfinding

## When to update this file

- A new domain term enters the codebase or UI.
- An entity is added, removed, or its invariants change.
- A new external dependency or boundary is introduced.
- An ADR is accepted (add it to the list above).

Do **not** put implementation details, file paths, or stack choices here —
those belong in `AGENTS.md` or `.opencode/docs/`.
