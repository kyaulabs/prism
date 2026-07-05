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

For non-trivial or cross-cutting changes, insert `@architect` before step 4.
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
`@resolve-merge-conflicts`) — it can only invoke read-only/audit
agents (`@test-audit`, `@code-review`, `@semgrep`, `@architect`, `@explore`,
`@scout`, `@docs-writer`). `@debug` is a build-mode investigation agent
with scoped write access (repro tests, throwaway harnesses, `[DEBUG-]`
instrumentation) and is not invocable from Plan mode.

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

| Category | Skills |
|---|---|
| Pipeline (plan → execute → verify) | `brainstorming`, `writing-plans`, `executing-plans`, `verification-before-completion` |
| Review triage | `receiving-code-review` |
| Branch lifecycle | `finishing-a-development-branch` |
| Architecture hygiene | `systems-design`, `finding-duplicate-functions` |
| Stack-specific | `aurora-page`, `rcs-header`, `security-coding`, `database` |
| Frontend | `scss-mobile-first`, `frontend-design`, `frontend-architecture`, `accessibility` |
| Testing | `pest-browser` |
| Docs / process | `domain-context`, `adr`, `conventional-commits`, `audit-deps`, `writing-skills`, `prototype` |

### Custom agents

All custom agents live under `.opencode/agents/` and are invoked via `@mention`.
See `AGENTS.md` for the complete list with purpose descriptions.

### Custom commands

All custom commands live under `.opencode/commands/` and are invoked via `/slash`.
See `AGENTS.md` for the complete list with purpose descriptions.

| Command | Purpose |
| --- | --- |
| `/prime` | Draft or regenerate `CONTEXT.md` from the codebase |
| `/check` | Pre-push gate: lint + test + coverage |
| `/release` | Changelog + signed tag + `gh release` |
| `/deploy` | Post-pull production deploy |
| `/build-assets` | Rebuild minified CSS/JS |
| `/setup` | Interactive project configurator (replaces placeholders) |
| `/plan-to-issues` | Parse a plan into GitHub issues |
| `/teach` | Explain completed work pedagogically |
