# Coding Harness

Orientation guide for the KYAULabs coding-agent harness. This is a human
reference — agents load `AGENTS.md` (authoritative) every session, so this
file carries no per-session token cost.

## How the pieces fit together

The full engineering pipeline, end to end:

```text
brainstorming → writing-plans → @tdd (per task) → verification-before-completion → /check → @code-review
```

1. **Brainstorm** the change (grilling skill) → spec in `docs/specs/`.
2. **Plan** the implementation (writing-plans skill) → plan in `docs/plans/`.
3. **Implement** each task via `@tdd` (Red → Green → Refactor, vertical slices).
4. **Verify** completion (verification-before-completion skill).
5. **Gate** with `/check` (lint + coverage 80%).
6. **Review** with `@code-review` before push.

For non-trivial or cross-cutting changes, insert `@architect` before step 3.
For bugs, use `@debug` (disciplined 6-phase loop) before `@tdd` on the fix.

## Where things live

| File | Purpose |
|---|---|
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
|---|---|
| **Build** | Default mode — full tool access for development; enforces mandatory `@tdd` + hard boundaries |
| **Plan** | Restricted mode — analysis and planning, no file changes |

Plan mode is restricted from invoking code-modifying subagents (`@tdd`,
`@resolve-merge-conflicts`, `@debug`) — it can only invoke read-only/audit
agents (`@test-audit`, `@code-review`, `@semgrep`, `@architect`, `@explore`,
`@scout`, `@docs-writer`).

### Built-in subagents

| Agent | Purpose |
|---|---|
| **Explore** | Read-only codebase exploration — file patterns, keyword search |
| **Scout** | External docs + dependency research (clones upstream repos) |
| **General** | Multi-step research, full tool access |

Invoke via `@mention`: `@explore find the auth implementation`.

### Built-in slash commands

| Command | Purpose |
|---|---|
| `/init` | Analyze project and generate AGENTS.md |
| `/undo` | Revert the last change made by the agent |
| `/redo` | Redo a previously undone change |
| `/share` | Create a shareable link to the current conversation |
| `/help` | Show available commands and help |
