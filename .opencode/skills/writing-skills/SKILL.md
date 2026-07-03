---
name: writing-skills
description: Use when creating or modifying skills, agents, commands, or docs in .opencode/. Provides the frontmatter schema, mode/permission conventions, cross-ref rules, and quality checks to keep the harness consistent as it grows.
---

# Writing Skills, Agents, and Commands

Reference for authoring new pieces of the harness consistently. Follow these
conventions so new skills/agents/commands slot in without drift.

## File locations

| Type | Location | Filename |
|---|---|---|
| Skill | `.opencode/skills/<name>/` | `SKILL.md` |
| Agent | `.opencode/agents/` | `<name>.md` |
| Command | `.opencode/commands/` | `<name>.md` |
| Reference doc | `.opencode/docs/` | `<name>.md` |

## Skill frontmatter

```yaml
---
name: <skill-name>
description: Use when <trigger>. <What it provides — one sentence>.
---
```

- `name` must match the directory name (snake_case).
- `description` starts with "Use when" so the agent knows when to load it.
- Skills are on-demand (loaded via the Skill tool) — they cost zero tokens
  per session unless invoked.

## Agent frontmatter

```yaml
---
description: <What the agent does — one sentence.>
mode: subagent
temperature: 0.1
permission:
  edit: deny          # for read-only agents
  bash:
    "*": deny
    "<pattern>": allow
  webfetch: deny
  task: deny
---
```

- `mode: subagent` — agents are invoked via `@mention`.
- `temperature`: 0.1 for analysis/review agents, 0.2 for TDD/implementation.
- `permission` — scope tightly. Read-only agents deny `edit` and restrict
  `bash` to safe read patterns (`ls`, `cat`, `grep`, `git log`, etc.).
- Agents that should not invoke other agents: `task: deny`.

## Command frontmatter

```yaml
---
description: <What the command does — one sentence.>
agent: build          # or "subtask: true" for subtask commands
---
```

- `agent: build` — the command runs in the build agent context (full tool
  access).
- `subtask: true` — the command is a subtask (no agent context switch).

## Body structure

### Skills

1. **One-line summary** of what the skill does.
2. **When to use** (trigger conditions).
3. **The process/checklist** — numbered steps or a checklist.
4. **Rules** — hard constraints.
5. **Cross-refs** — links to related skills/agents/docs by name (not markdown
   links — use `skill-name` or `path/to/file.md`).

### Agents

1. **Role statement** — "You are a ...".
2. **The task** — `$ARGUMENTS` placeholder (agents receive their invocation
   args here).
3. **Workflow** — numbered steps.
4. **Output format** — a template for the agent's report.
5. **Rules** — hard constraints.

### Commands

1. **One-line summary** of what the command does.
2. **Steps** — numbered, with bash commands in code blocks.
3. **Output** — what to report.
4. **Rules** — hard constraints.

## Quality checks

Before merging a new skill/agent/command:

- [ ] Frontmatter is complete and correct.
- [ ] `description` starts with "Use when" (skills) or a clear one-liner
      (agents/commands).
- [ ] No content duplicated from `AGENTS.md`, `CONTEXT.md`, or other
      skills — reference by name instead.
- [ ] Cross-refs use skill/doc names, not markdown links.
- [ ] No placeholders ("TBD", "TODO") in the body.
- [ ] The body is as short as possible while remaining unambiguous — every
      line costs tokens when loaded.
- [ ] If the skill/agent/command references a project convention (indentation,
      hard boundaries, RCS headers), it points to `AGENTS.md` or the relevant
      skill rather than restating the rule.

## Token discipline

- Skills are on-demand — they cost tokens only when loaded. Keep them
  focused and self-contained.
- Agents are loaded when invoked — keep them tight.
- Commands run in the build agent context — their content is read at
  invocation time.
- The only always-loaded files are `AGENTS.md` and `.opencode/docs/conventions.md`
  (via `opencode.json` instructions). Keep these minimal — everything else
  should be on-demand.

## Cross-ref conventions

- Reference skills by name: "see the `systems-design` skill".
- Reference docs by path: "see `.opencode/docs/tests.md`".
- Reference agents by mention: "invoke the `@tdd` agent".
- Reference commands by slash: "run `/check`".
- Do NOT use markdown links (`[text](path)`) — the agent reads files via the
  Read tool, not by following links.

## Rules

- Every new skill/agent/command must be added to the tables in `AGENTS.md`
  and `CODING_HARNESS.md`.
- If a new skill introduces a project-wide convention, update `AGENTS.md`
  (the authoritative source).
- If a new skill introduces a domain term, update `CONTEXT.md`.
- Test new agents/commands by invoking them on a real task before merging.
