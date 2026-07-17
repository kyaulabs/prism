# Plan: research background-agent skill + scout fix

> Issue: [#141](https://github.com/kyaulabs/prism/issues/141)
> Parent: [#127](https://github.com/kyaulabs/prism/issues/127)
> Date: 2026-07-16

## Goal

1. Verify + document background-subagent feasibility for `/research --background`
2. Enable `@scout` (built-in experimental subagent) across the harness
3. Wire `/research --background` dispatch
4. Consolidate all experimental opencode-process flags into `.opencode/experimental.default.env` (auto-sourced via `.envrc`)
5. Record decisions in ADR-0024 + CONTEXT.md

## Decisions

| # | Decision |
|---|---|
| Q1 | **ENABLE `@scout` + document** (built-in experimental, not a phantom; ADR-0005 load-bearing delegate) |
| Q2 | **Auto-source experimental flags via `.envrc`** → new `.opencode/experimental.default.env` |
| Q3 | **Phase-0 spike first**, branch `--background` on result |
| Env design | **Sourced file** `.opencode/experimental.default.env` (mirrors `models.default.env` pattern) |
| LSP | **Consolidate** `OPENCODE_EXPERIMENTAL_LSP_TOOL` into the same file; update AGENTS.md |

## Architectural assessment

**GO, phased.** Enable-scout consistent with ADR-0005/0006. ADR-0024 required.

## Reframe: `@scout` is NOT a phantom

The vendored opencode docs (`opencode-docs/docs/agents.mdx`) document `@scout` as a built-in experimental subagent. It appears nowhere in `.opencode/agents/` or `opencode.jsonc` agent{} because it is **built-in**, not missing. The enable flag is `OPENCODE_EXPERIMENTAL_SCOUT`. The 12 active harness references (opencode.jsonc delegation table, AGENTS.md, README.md, CODING_HARNESS.md, ADR-0005/0006, research docs/command, writing-plans skill) are already correct for the enable path — no stripping needed.

## Phase 0 — Feasibility spike [manual runbook]

1. Set `export OPENCODE_EXPERIMENTAL_BACKGROUND_SUBAGENTS=true` in the shell.
2. Restart opencode.
3. Inspect the `task` tool schema and dispatch behavior.
4. Classify outcome ∈ {per-invocation (param added) | global-toggle (all dispatches async) | infeasible (no change)}.
5. Record finding in ADR-0024 Context. Gates Phase 3.

## Phase 1 — ADR-0024 + CONTEXT + env + .envrc + AGENTS [TDD]

**Red:** `tests/Shell/research_background_scout_test.sh`
**Green:**
- `adr/0024-experimental-subagent-dependencies.md` (Status: Accepted)
- `CONTEXT.md` — glossary: `scout`, `background subagent`
- `.opencode/experimental.default.env` — LSP + scout; background commented
- `.envrc` — source experimental.default.env
- `AGENTS.md` — generalize LSP section → experimental opencode features

## Phase 2 — Scout documentation sweep [TDD]

Green:
- `.opencode/docs/research.md` — scout prerequisite note
- `.opencode/commands/research.md` — scout prerequisite note
- `README.md` — note scout prerequisite in agents/commands tables
- `CODING_HARNESS.md` — note scout experimental status
- `.opencode/skills/writing-plans/SKILL.md` — note @scout prerequisite

## Phase 3 — /research --background wiring [branches on Phase-0]

**Red:** assertions on command + skill
**Green:**
- `.opencode/commands/research.md` — detect `--background`; branch on env var
- `.opencode/skills/research-background/SKILL.md` — verified contract

## Phase 4 — Verify + gate

```bash
bash tests/Shell/research_background_scout_test.sh
php -d pcov.enabled=1 vendor/bin/pest
# /check (lint — docs+shell only → expect clean)
```
Manual smoke: `/research <topic>` and `/research --background <topic>`. `@code-review`.

## Test seam

`tests/Shell/research_background_scout_test.sh` (uses `tests/Shell/lib/test_helpers.sh` per ADR-0018):
- ADR-0024 exists & Status=Accepted
- CONTEXT.md defines `scout`, `background subagent`
- `.opencode/experimental.default.env` exports `OPENCODE_EXPERIMENTAL_LSP_TOOL` + `OPENCODE_EXPERIMENTAL_SCOUT`
- `.envrc` sources `.opencode/experimental.default.env`
- AGENTS.md documents all three experimental flags
- `.opencode/commands/research.md` handles `--background`
- `.opencode/skills/research-background/SKILL.md` exists
