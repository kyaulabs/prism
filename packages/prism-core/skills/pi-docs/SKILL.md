---
name: pi-docs
description: Use when answering questions about pi itself or changing pi settings, models, skills, prompt templates, extensions, packages, themes, TUI components, keybindings, SDK integrations, or providers. Points to the authoritative installed docs and examples on disk.
derived-from: obra/superpowers-developing-for-claude-code (MIT, © Jesse Vincent)
---

# Pi Docs — Installed Local Reference

Use pi's installed package documentation instead of guessing runtime semantics
or relying on stale web snippets. This skill is a thin pointer; it does not
vendor a second copy.

**Announce at start:** "I'm using the pi-docs skill to reference the installed
pi documentation."

## Locate the package

The authoritative package is installed under pnpm's link store. Resolve the
current hashed directory rather than hard-coding it:

Run the version query directly:

```bash
pi --version
```

Validate and retain the returned version as inert context, then render that
literal version in the package search:

```bash
find \
  "$HOME/.local/share/pnpm/store/v11/links" \
  -type d \
  -path "*/pi-coding-agent/PI_VERSION/*/node_modules/*/pi-coding-agent" \
  -print -quit
```

Validate and retain the returned package root. Then use its literal path for:

- Main overview: `PI_PACKAGE_ROOT/README.md`
- Detailed docs: `PI_PACKAGE_ROOT/docs/`
- Examples: `PI_PACKAGE_ROOT/examples/`

If that pnpm layout is absent, locate the package backing `command -v pi` and
find its `README.md`, `docs/`, and `examples/` directories. Do not search or
read credential files while resolving it.

## Quick-reference table

| Question | Read completely |
|---|---|
| Skills / Agent Skills frontmatter | `docs/skills.md` |
| Prompt templates / arguments | `docs/prompt-templates.md` |
| Extensions / events / tools / UI | `docs/extensions.md`; then the matching file under `examples/extensions/` |
| Settings | `docs/settings.md` |
| Models / providers | `docs/models.md`, `docs/providers.md` |
| Pi packages | `docs/packages.md` |
| Themes | `docs/themes.md` |
| TUI components | `docs/tui.md` |
| Keybindings | `docs/keybindings.md` |
| SDK embedding | `docs/sdk.md`; examples under `examples/sdk/` |
| Custom providers | `docs/custom-provider.md` |
| Environment variables | `docs/environment-variables.md` |
| Sessions / compaction | `docs/sessions.md`, `docs/compaction.md` |
| CLI behavior | `docs/usage.md` and `README.md` |
| Security / isolation | `docs/security.md`, `docs/containerization.md` |

Useful extension patterns include:

- `examples/extensions/protected-paths.ts`
- `examples/extensions/permission-gate.ts`
- `examples/extensions/git-checkpoint.ts`
- `examples/extensions/preset.ts`
- `examples/extensions/custom-compaction.ts`
- `examples/extensions/plan-mode/`
- `examples/extensions/subagent/`

The last two are references only: Prism deliberately does not adopt plan-mode
or sub-agent orchestration (ADR-0055).

## How to use this skill

1. Identify the exact pi concept in question.
2. Resolve `PI_PACKAGE_ROOT`.
3. Read the relevant Markdown file **completely**.
4. Follow its local Markdown cross-references to related docs before
   implementing.
5. Read the closest example completely when code shape or event semantics are
   involved.
6. Cite the doc/example path in the answer or implementation notes.

## Rules

- Do not guess pi APIs, event payloads, settings keys, or package behavior.
- Installed docs are authoritative for the installed runtime version.
- Never copy examples blindly; adapt them to the stated architecture and
  security invariants.
- Do not add orchestration extensions to Prism. ADR-0056 permits only the
  safety extension.
- When docs and observed runtime behavior disagree, halt and surface the
  mismatch with the installed version and a minimal reproduction.

## Cross-refs

- `writing-skills` skill — Prism's pi-native resource conventions.
- `packages/prism-core/extensions/safety/README.md` — the retained extension's
  local contract.
- ADR-0055 — single-agent pi architecture.
- ADR-0056 — safety extension is the sole extension.

## Gotchas

- *Reading only a matching excerpt* — API caveats and required sequencing may
  appear later. Read the relevant Markdown file completely.
- *Hard-coding the pnpm hash* — resolve the package root dynamically.
- *Treating an example as architecture approval* — pi demonstrates plan mode
  and sub-agents, but Prism intentionally omits both.
