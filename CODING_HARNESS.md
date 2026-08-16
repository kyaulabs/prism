# Coding Harness

Orientation guide for the KYAULabs coding-agent harness. This is a human
reference — the agent loads `AGENTS.md` (authoritative) every session, so this
file carries no per-session token cost.

## How the pieces fit together

Prism runs on [pi](https://pi.dev). Under pi there are **no tabs, no
sub-agents, no plan mode, and no MCP** — a single agent runs the whole
engineering pipeline by loading **skills** on demand (ADR-0055). Slash
commands are **prompt templates**; the opencode permission matrix and three
TypeScript plugins collapsed into **one safety extension** (ADR-0056); the
six-tier model system collapsed to **no prescribed model at all** — model and
thinking selection is yours at any time (ADR-0067).

New ideas enter through the **brainstorming** skill front door. Pre-spec work
that is oversized — multiple independent subsystems, or unknowns that cannot
be expressed as sharp questions — branches to `wayfinder` before detailed
grilling; the sole exception is the strict-greenfield walking-skeleton
bootstrap, which precedes wayfinding (ADR-0050).

The full engineering pipeline, end to end — a single agent loading skills:

```text
brainstorming / to-spec → prototype (if needed) → architect (if cross-cutting) → /issue (tickets) or writing-plans → executing-plans → tdd (per task) → verification-before-completion → /check → code-review
```

1. **Brainstorm** the change (load the `brainstorming` skill) → spec in `docs/specs/`, or synthesize a settled design with `to-spec`.
2. **Prototype** (if technical viability is uncertain) → throwaway code to answer the question, then delete (`prototype` skill).
3. **Plan** the implementation (`writing-plans` skill) → plan in `docs/plans/`.
4. **Execute** the plan (`executing-plans` skill) → implement each task inline using the `tdd` skill, review between tasks.
5. **Implement** each task via the `tdd` skill (Red → Green → Refactor, vertical slices).
6. **Verify** completion (`verification-before-completion` skill).
7. **Gate** with `/check` (delegates to the adapter stack gate, e.g. `/check-php`: lint + coverage 80%).
8. **Review** with the `code-review` skill before push.

For non-trivial or cross-cutting changes, run the `architect` skill after the
spec and before ticketing/planning — it returns a go/no-go plus a parseable
`ADR-required:` line. The ticketing skill (`/issue`) checks this line before
slicing a spec into tasks.
For bugs, use the `debug` skill (disciplined 6-phase loop) before `tdd` on the
fix.

## Where things live

| Path | Purpose |
| --- | --- |
| `packages/prism-core/AGENTS.md` | Global core instructions — hard boundaries, conventions, pipeline, skills/commands index (deploys to `~/.pi/agent/AGENTS.md`) |
| `packages/prism-core/APPEND_SYSTEM.md` | Anti-drift bootstrap — appended to the system prompt every turn (deploys to `~/.pi/agent/APPEND_SYSTEM.md`) |
| `packages/prism-core/skills/` | Language-agnostic skills (loaded on demand via `/skill:name` or auto-invoked) |
| `packages/prism-core/prompts/` | Core slash commands (pi prompt templates) |
| `packages/prism-core/extensions/safety/` | The **one** safety extension — sensitive-path + `rm -rf` + `--no-verify` classifier + denial circuit-breaker (ADR-0056) |
| `packages/prism-core/scripts/` | Language-agnostic helper scripts (`new-branch.sh`, `resolve-identity.sh`, `install-global.sh`, …) |
| `packages/prism-php-web/` | The PHP/web adapter — `php-web-stack`, `tdd-php`, `rcs-header`, `aurora-page`, `/check-php`, `safe-dirs.json` |
| `CONTEXT.md` | Domain glossary, entities, invariants, non-goals |
| `adr/` | Architecture Decision Records (Nygard format) |
| `AGENTS.md` (repo root) | Repo-level project instructions (concatenates with the global core `AGENTS.md`) |
| `.pi/settings.json` | This repo's own project settings — dogfoods both packages from disk |

## Toolchain

Declared tools resolve through the `prism-tool` launcher, never from a
consumer's `node_modules`/`vendor`/PATH. Scope is owned by the versioned
package toolchain contracts (`packages/prism-core/toolchain.json`,
`packages/prism-php-web/toolchain.json`) and ADR-0063:

- **Bundled core tools** — commitlint and git-cliff ship as exact core
dependencies and run via `prism-tool run <id>` from any project.
- **Mandatory external prerequisites** — Semgrep `>=1.173.0 <2.0.0` and OCR
`>=1.9.1 <2.0.0` are verified by every entry point but never installed,
configured, or authenticated by Prism.
- **Consumer-development adapter tools** — Pest 5 on PHPUnit 13,
php-cs-fixer, Playwright (Chromium only), sass, uglify-js, eslint, and
stylelint are provisioned into the consumer project's native manifests and
lockfiles through `prism-tool setup`.

Registry access, consumer mutation, OCR connectivity, and OCR code egress are
four **separate** approval gates; `ocr llm test` runs only after its own
connectivity approval at the defined cadence. CI provisions compatible
Semgrep/OCR releases only to construct its ephemeral verification
environment — that is environment provisioning, not runtime verification
(which remains verification-only). A candidate workspace under
`.pi/prism-tool/work/` is ownership-marked and recovered/cleaned safely after
interruption; the managed launcher refuses to overwrite or remove unrelated
executables.

## pi mapping

| opencode concept | prism-on-pi destination |
| --- | --- |
| `AGENTS.md` (always loaded) | `packages/prism-core/AGENTS.md` → `~/.pi/agent/AGENTS.md` (global, concatenates into every session) |
| `opencode.jsonc` config | `~/.pi/agent/settings.json` + built-in DeepSeek provider |
| `.envrc` / direnv / `prism.jsonc` / six-tier models | **deleted** — model-agnostic; selection is the human's (ADR-0067) |
| Primary tabs (build/plan/design/chat) | **collapsed** → pipeline skills |
| Fifteen `@subagents` | **collapsed** → skills |
| `.opencode/skills/*/SKILL.md` | `packages/*/skills/*/SKILL.md` |
| `.opencode/commands/*.md` | `packages/*/prompts/*.md` (pi prompt templates) |
| per-tool permission matrix | AGENTS.md hard-boundary prose + the one safety extension |
| `sensitive-paths` + `pre-tool-use` + `denial-circuit-breaker` plugins | `packages/prism-core/extensions/safety/` (ADR-0056) |
| `session-bootstrap` plugin | `~/.pi/agent/APPEND_SYSTEM.md` (pi-native) |
| MCP servers (deepseek-websearch, searxng) | `websearch` + `searxng` CLI-shell skills |

## The pipeline (skills you load)

Under pi there are **no primary tabs and no sub-agents** (ADR-0055). One agent
runs everything; you load a skill when the task calls for it. The
opencode-era "Build / Plan / Design" tabs and fifteen `@subagents` collapsed
into skills whose bodies are the former agent prompts. The authoritative
skills index is in `packages/prism-core/AGENTS.md`.

**Accepted trade-offs** (consequences of the single-agent decision — ADR-0055,
do not re-fix):

- **Plan-read-only and skill-gating are now instruction-only.** There is no
  tool-level gate preventing edits during planning and no per-skill deny
  matrix. Mitigations: the `brainstorming` skill keeps its own hard gate (no
  implementation before an approved spec); pi session branching (`/tree`,
  `/fork`) gives cheap rollback; `verification-before-completion` and
  `code-review` catch slips.
- **Model and thinking selection is the human's.** The harness prescribes
  nothing (ADR-0067): no primary/judge roles, no suggestions, no
  restrictions. Ctrl+P cycles models and Shift+Tab sets thinking at any time.
- **Sub-agent context isolation is gone.** Long plans that once dispatched
  `@tdd` per task now run inline. `executing-plans` keeps inline-only mode and
  relies on proactive compaction (`/compact`) and `/handoff` for context
  management.

## Model strategy

There is **no manifest/env tier layer** (ADR-0067). The harness prescribes,
names, restricts, and suggests no model:

- **Model:** cycle with **Ctrl+P** at any time.
- **Thinking:** raise/lower with **Shift+Tab**.
- **Auth:** `/login` for your provider or export the provider's API key.
- **Session defaults:** run `/setup` to write your preferred provider,
  default model, Ctrl+P pool, and thinking level to your pi config — every
  question is skippable and the write is consent-gated.

## Search (replaces MCP)

The two former MCP servers are CLI-shell skills (pi: "No MCP — build CLI
tools with READMEs"):

| Skill | Backed by | Env |
| --- | --- | --- |
| `websearch` | DeepSeek web-search API | `DEEPSEEK_API_KEY` |
| `searxng` | a SearXNG instance | `SEARXNG_URL` |

Both fail clearly (never silently) when their env var is unset and never log
the key.

## pi built-in commands

pi's own commands are always available (`/hotkeys` for the full list):

| Command | Purpose |
| --- | --- |
| `/login`, `/logout` | Manage provider credentials |
| `/model`, `/scoped-models` | Switch model; manage Ctrl+P cycling set |
| `/settings` | Thinking level, theme, delivery, transport |
| `/tree`, `/fork`, `/clone` | Session branching (cheap rollback — replaces plan-mode safety) |
| `/compact [prompt]` | Manually compact context (lossy; full history kept in the JSONL) |
| `/skill:name` | Load and execute a skill |
| `/trust` | Save project trust for future sessions |
| `/config` | Enable/disable package resources |
| `/help`, `/hotkeys` | Help and keyboard shortcuts |

## Harness commands and skills

Custom prompt templates live under `packages/*/prompts/` (the slash commands
in `AGENTS.md` § Commands); custom skills under `packages/*/skills/` (the
index in `AGENTS.md` § Skills Available). The `writing-skills` skill governs
authoring new ones.

The ordinary branch-completion path delegates pull request preparation to
`/pr` after synchronization, plan/spec cleanup, `/check`, and the
`code-review` skill. `/pr` displays a conventional title, a body containing
every pull request template section, and a human-run GitHub CLI command; it
does not push or create the pull request. `/release` retains its separate
release and back-merge PR procedure.
