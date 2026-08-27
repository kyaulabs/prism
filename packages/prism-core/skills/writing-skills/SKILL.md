---
name: writing-skills
description: Use when creating or modifying skills, prompt templates, extensions, or reference docs in the prism pi packages. Provides pi-native frontmatter schemas, package locations, cross-ref rules, and quality checks to keep the harness consistent as it grows.
derived-from: anthropics/skills (MIT, © Anthropic); glebis/claude-skills (MIT, © Gleb)
---

# Writing Skills, Prompts, Extensions, and Docs

Reference for authoring new pieces of the pi harness consistently. Follow these
conventions so new skills, prompts, extensions, and docs slot in without drift.

## File locations

| Type | Core location | Adapter location | Filename |
|---|---|---|---|
| Skill | `packages/prism-core/skills/<name>/` | `packages/<adapter>/skills/<name>/` | `SKILL.md` |
| Prompt template | `packages/prism-core/prompts/` | `packages/<adapter>/prompts/` | `<name>.md` |
| Extension | `packages/prism-core/extensions/<name>/` | only when an ADR permits one | `index.ts` |
| Reference doc | `packages/prism-core/docs/` | `packages/<adapter>/docs/` | `<name>.md` |

Core resources must remain language-agnostic. Anything tied to a language,
framework, package manager, build output, server, or database belongs in an
adapter.

## Skill frontmatter

```yaml
---
name: <skill-name>
description: Use when <trigger>. <What it provides — one sentence>.
---
```

- `name` is 1–64 lowercase letters, numbers, and hyphens; no leading,
  trailing, or consecutive hyphens. Match the directory name for portability.
- `description` is required, at most 1024 characters, and says both what the
  skill does and when to use it. A missing description means pi will not load
  the skill.
- Preserve `derived-from:` attribution on every ported skill.
- Optional Agent Skills fields used by this harness are `compatibility`,
  `metadata`, and `disable-model-invocation`.
- Skills are on-demand. The agent loads `SKILL.md` with the read tool when its
  description matches, or the user forces it with `/skill:<name>`.

## Prompt-template frontmatter

```yaml
---
description: <What the prompt does — one sentence.>
argument-hint: "<optional arguments>"
---
```

- Prompt templates live under a package's `prompts/` directory and register as
  slash commands by filename.
- Use `$ARGUMENTS` for all arguments, `$1`, `$2`, ... for positional arguments,
  `$@` for shell-quoted arguments, and `${1:-default}` for a default.
- Omit `argument-hint` only when the prompt accepts no arguments.
- Prompt templates run in the single agent's context; there is no agent,
  subtask, mode, or permission frontmatter.

## Extension shape

Extensions default-export a factory receiving pi's `ExtensionAPI`. Read the
`pi-docs` skill and the installed `docs/extensions.md` plus relevant examples
before changing extension code. Keep orchestration out of extensions. Core's
accepted extensions are the safety gate and bounded web-access tools
(ADR-0091); any additional extension requires a fresh ADR rather than an
opportunistic implementation.

## Body structure

### Skills

1. **One-line summary** of what the skill does.
2. **When to use** (trigger conditions).
3. **The process/checklist** — numbered steps or a checklist.
4. **Rules** — hard constraints.
5. **Cross-refs** — related skills/prompts/docs by name or package path.
6. **Gotchas** — known failure modes, even if initially only a seed line.

### Prompt templates

1. **One-line summary** of what the prompt does.
2. **Arguments** — place the supported pi argument syntax explicitly.
3. **Steps** — numbered, with exact tool commands where needed.
4. **Output** — what to report.
5. **Rules** — hard constraints.

### Reference docs

Keep long-lived reference material out of skill bodies when it is needed only
at a specific step. Core docs stay language-agnostic; adapter docs own concrete
stack commands and conventions.

## Quality checks

Before merging a new or changed harness resource:

- [ ] Skill frontmatter has `name` + `description`, and name matches directory.
- [ ] Prompt frontmatter has `description` and an accurate `argument-hint` when
      it accepts arguments.
- [ ] Every inherited `derived-from:` line remains verbatim.
- [ ] No content is duplicated from `AGENTS.md`, `CONTEXT.md`, or another
      skill — reference the authoritative source instead.
- [ ] Cross-refs use bare skill names or current `packages/...` doc paths.
- [ ] No placeholders (`TBD`, `TODO`) remain in final instructions.
- [ ] No obsolete tab, sub-agent, mode, or per-skill permission language
      remains.
- [ ] Core files contain no stack-specific guidance that belongs in an adapter.
- [ ] The body is as short as possible while remaining unambiguous — every
      line costs tokens when loaded.

## Token discipline

- Skills are progressively disclosed: only names and descriptions are in the
  initial prompt; full bodies cost tokens when loaded.
- Prompt templates are expanded when invoked.
- Reference docs should be loaded at the step that needs them, not eagerly.
- Global `~/.pi/agent/AGENTS.md` and `APPEND_SYSTEM.md` are always loaded.
  Keep them minimal; everything else should be on-demand.

## Cross-ref conventions

- Reference skills by name: "load the `systems-design` skill".
- Reference docs by package path: "read
  `packages/prism-core/docs/context-management.md`".
- Reference prompt templates by slash name: "run `/check`".
- Use relative paths inside a skill when referring to scripts or assets that
  ship in that same skill directory.

## Rules

- Every new skill or prompt must be added to the tables in
  `packages/prism-core/AGENTS.md` and, once rewritten in Stage 5,
  `CODING_HARNESS.md`.
- If a new skill introduces a project-wide convention, update `AGENTS.md`
  (the authoritative source).
- If a new skill introduces a domain term, update `CONTEXT.md`.
- Test new skills with `/skill:<name>` and prompt templates through their slash
  command before merging.
- Run the pi-layout harness validator once it lands in Stage 3.

## Gotchas

Known failure modes that compound over time. Add entries when this skill
causes a preventable mistake.

- *Skill description written as a summary, not a trigger* — the description
  determines whether the model loads the skill. State what it does and when it
  applies.
- *Skill restates rules from AGENTS.md* — reference the authoritative source
  instead of duplicating. Duplicated rules drift out of sync.
- *New skill not added to AGENTS.md tables* — the skill exists but the agent
  does not know when to load it.
- *Core skill contains stack commands* — move concrete framework, test,
  package-manager, and lint guidance to the active adapter.
- *Assuming directory/name mismatch is portable* — pi permits it, but the
  Agent Skills standard does not. Match them anyway.

## Mandatory: Gotchas section

Every new skill MUST include a `## Gotchas` section at the end. It captures
known failure modes specific to that skill — the highest-signal content for
preventing repeated mistakes. Start with a seed line if no failure modes are
known yet; add entries as they are discovered in real use.
