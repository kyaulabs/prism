# Coding Harness

Orientation guide for the KYAULabs coding-agent harness. This is a human
reference — agents load `AGENTS.md` (authoritative) every session, so this
file carries no per-session token cost.

## How the pieces fit together

The full engineering pipeline, end to end:

```text
brainstorming → prototype (if needed) → writing-plans → executing-plans → @tdd (per task) → verification-before-completion → /check → @code-review
```

1. **Brainstorm** the change (grilling skill) → spec in `docs/specs/`.
2. **Prototype** (if technical viability is uncertain) → throwaway code to answer the question, then delete (prototype skill).
3. **Plan** the implementation (writing-plans skill) → plan in `docs/plans/`.
4. **Execute** the plan (executing-plans skill) → dispatch tasks to `@tdd`, review between tasks.
5. **Implement** each task via `@tdd` (Red → Green → Refactor, vertical slices).
6. **Verify** completion (verification-before-completion skill).
7. **Gate** with `/check` (lint + coverage 80%).
8. **Review** with `@code-review` before push.

For non-trivial or cross-cutting changes, insert `@architect` before `writing-plans`.
For bugs, use `@debug` (disciplined 6-phase loop) before `@tdd` on the fix.

## Where things live

| File | Purpose |
| --- | --- |
| `AGENTS.md` | Stack, boundaries, directory structure, skills/agents/commands index (authoritative) |
| `CONTEXT.md` | Domain glossary, entities, invariants, non-goals |
| `opencode.json` | Wires instructions + agent definitions + permissions |
| `adr/` | Architecture Decision Records (Nygard format) |
| `.opencode/agents/` | Custom subagent definitions |
| `.opencode/commands/` | Custom slash commands |
| `.opencode/skills/` | On-demand skills (loaded via the Skill tool) |
| `.opencode/docs/` | Supporting reference docs for agents/commands |

## Built-in OpenCode features

### Primary agents (Tab to switch)

| Agent | Purpose |
| --- | --- |
| **Build** | Default mode — full tool access for development; enforces mandatory `@tdd` + hard boundaries |
| **Plan** | Restricted mode — analysis and planning, no file changes |

Plan mode is restricted from invoking code-modifying subagents (`@tdd`,
`@resolve-merge-conflicts`, `@docs-writer`) — it can only invoke
read-only/audit agents (`@test-audit`, `@code-review`, `@semgrep`,
`@architect`, `@explore`, `@scout`). `@debug` is a build-mode investigation
agent with scoped write access (repro tests, throwaway harnesses, `[DEBUG-]`
instrumentation) and is not invocable from Plan mode.

### Plan Agent Complexity Assessment

The plan agent uses the `high` variant by default (configurable via
`OPENCODE_VARIANT_PLANNER`) as a cost/quality balance —
more capable than `medium` for reasoning, but without the full token cost of
`max`. A **Complexity Assessment Protocol** in the agent's system prompt
instructs it to classify task complexity and adjust reasoning depth:

- **Complex tasks** (architecture, security, DB schema, cross-cutting refactors,
  complex bugs): deeper reasoning, alternatives exploration, `@architect`
  dispatch for validation.
- **Simple tasks** (docs, style fixes, minor bugs, routine tests): concise,
  skip alternative exploration.

Dynamic per-turn variant switching (e.g., automatically escalating to `max`
for complex tasks) is **not feasible** with opencode's current architecture —
the model and variant are resolved statically at startup, before any plugin
hook fires. See ADR-0011 for the full investigation. The closest plugin
mechanism, `experimental.chat.system.transform` (ADR-0008), can only modify
the system prompt, not the model variant.

### Model Configuration

Models and variants are assigned via environment variable substitution
(`{env:VAR}`) rather than hard-coded values. Four tiers with committed defaults
in `.opencode/models.default.env`:

| Tier | Env Var | Variant Env Var | Default Model | Default Variant | Agents |
| --- | --- | --- | --- | --- | --- |
| Primary | `OPENCODE_MODEL_PRIMARY` | `OPENCODE_VARIANT_PRIMARY` | `deepseek/deepseek-v4-pro` | `max` | build, tdd, architect, code-review, debug, resolve-merge-conflicts, test-audit, general, explore |
| Planner | `OPENCODE_MODEL_PLANNER` | `OPENCODE_VARIANT_PLANNER` | `openrouter/z-ai/glm-5.2` | `high` | plan |
| Judge | `OPENCODE_MODEL_JUDGE` | `OPENCODE_VARIANT_JUDGE` | `openrouter/z-ai/glm-5.2` | `medium` | judge |
| Utility | `OPENCODE_MODEL_UTILITY` | `OPENCODE_VARIANT_UTILITY` | `deepseek/deepseek-v4-flash` | `medium` | compaction, title, summary, docs-writer, semgrep |

**Setup:** Install the direnv shell hook (one-time; see README for fish/bash/zsh
commands), then `cd` into the project and run `direnv allow` to trust the
`.envrc`. Without direnv, add `source /path/to/repo/.opencode/models.default.env`
to your shell profile.

**Customize:** Run `/setup` and follow the Model and Variant Configuration prompts.
Choices are written to `~/.config/opencode/models.env` — user overrides take
precedence over the committed defaults.

`variant` uses `{env:VAR}` substitution, consistent with the `model` field.
`temperature` remains a hard-coded literal — opencode does not coerce string
env var values to numeric (confirmed by prototype, see ADR-0013). See ADR-0011,
ADR-0012, and ADR-0013 for the full design rationale.

For guidance on picking `variant` / `temperature` for a non-default model —
including per-provider lookup references and a task-type → variant decision
frame — see [`.opencode/docs/model-configuration.md`](.opencode/docs/model-configuration.md).

### Built-in subagents

| Agent | Purpose |
| --- | --- |
| **Explore** | Read-only codebase exploration — file patterns, keyword search |
| **Scout** | External docs + dependency research (clones upstream repos) |
| **General** | Multi-step research, full tool access |

Invoke via `@mention`: `@explore find the auth implementation`.

### Built-in slash commands

| Command | Purpose |
| --- | --- |
| `/init` | Analyze project and generate AGENTS.md |
| `/undo` | Revert the last change made by the agent |
| `/redo` | Redo a previously undone change |
| `/share` | Create a shareable link to the current conversation |
| `/help` | Show available commands and help |

## Custom additions

Custom skills, agents, and commands are defined under `.opencode/`. The
authoritative table of what's available is in `AGENTS.md` § Skills / Agents /
Commands. This section exists so `writing-skills`'s cross-table-update rule
has a landing point; the canonical list is in `AGENTS.md`.

### Skills (process + domain)

All custom skills live under `.opencode/skills/` and are loaded on demand
via the `skill` tool. See `AGENTS.md` § Skills Available for the complete
list with usage descriptions.

### Custom agents

All custom agents live under `.opencode/agents/` and are invoked via `@mention`.
See `AGENTS.md` for the complete list with purpose descriptions.

### Custom commands

All custom commands live under `.opencode/commands/` and are invoked via `/slash`.
See `AGENTS.md` for the complete list with purpose descriptions.
