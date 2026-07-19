---
name: opencode-docs
description: Use when writing or editing opencode.jsonc, agent/skill/command frontmatter, plugin hooks, or permission rules — before guessing or calling /research. Vendors opencode.ai/docs locally for fast, cited reference.
derived-from: obra/superpowers-developing-for-claude-code (MIT, © Jesse Vincent)
---

# OpenCode Docs — Local Reference

This skill vendors opencode.ai/docs content locally so agents can cite
authoritative config schemas, hook signatures, and permission rules without
web-fetching every question. The vendored docs live in `docs/` alongside
this SKILL.md.

**Announce at start:** "I'm using the opencode-docs skill to reference the
OpenCode documentation."

## Quick-reference table

Common questions → which doc file to read:

| Question | Doc file |
|---|---|
| What keys are valid in opencode.jsonc? | `config.mdx` |
| How do I define a custom agent? | `agents.mdx` |
| How do I define a custom command? | `commands.mdx` |
| How do I write a skill? | `skills.mdx` |
| How do I write a plugin? | `plugins.mdx` |
| What permission rules are available? | `permissions.mdx` |
| How do rules files work (.opencode/rules/)? | `rules.mdx` |
| What tool configurations can I set? | `tools.mdx` |
| How does the reference system work? | `references.mdx` |
| How do I use the SDK (@opencode-ai/plugin)? | `sdk.mdx` |
| How does the server mode work? | `server.mdx` |
| How does `opencode run` work (non-interactive CLI)? | `cli.mdx` |
| How do I configure LLM providers? | `providers.mdx` |
| How do I configure a model? | `models.mdx` |
| How do I configure themes/colors? | `themes.mdx` |
| How do I configure code formatters? | `formatters.mdx` |
| How do network settings work? | `network.mdx` |
| How do LSP servers work? | `lsp.mdx` |
| How do MCP servers work? | `mcp-servers.mdx` |
| How do policies (approvals) work? | `policies.mdx` |
| How do custom tools work? | `custom-tools.mdx` |
| What platform-specific docs exist? | `windows-wsl.mdx`, `tui.mdx`, `web.mdx` |

For anything not in this table, read `docs/` directory listing — each `.mdx`
file corresponds to a page on opencode.ai/docs.

## How to use this skill

1. **Identify the question** — which config area, hook, or schema?
2. **Find the doc file** — use the quick-reference table above, or list
   `docs/` to see all available files.
3. **Read the doc file** — use the Read tool. The files are MDX (Markdown +
   JSX components); focus on the prose and code blocks, ignore JSX tags.
4. **Cite the source** — when answering, reference the doc file name
   (e.g. "per `config.mdx`") so the answer is traceable.

Do not guess OpenCode semantics. If the question is not covered by the
vendored docs, fall back to `/research` and note that the docs may be stale
(suggest running `fetch.sh` to refresh).

## Updating the docs

Run `fetch.sh` from within this skill's directory to refresh the vendored
docs from the latest `anomalyco/opencode` dev branch:

```bash
bash .opencode/skills/opencode-docs/fetch.sh
```

The script shallow-clones the repo with sparse checkout, extracts only the
English top-level `.mdx` files from `packages/web/src/content/docs/`, and
cleans up the temp clone. It excludes translation directories (`ar/`, `de/`,
etc.). Manual refresh — no watchers (per AGENTS.md build policy).

## Rules

- Always load this skill when writing or editing `opencode.jsonc`, agent
  frontmatter, command frontmatter, skill frontmatter, plugin code, or
  permission rules.
- When the answer comes from a vendored doc, cite it by filename.
- If the answer is NOT covered, say so — do not fill the gap by guessing.
- If the vendored docs are stale or the question references a feature newer
  than the docs, suggest running `fetch.sh` to refresh.

## Cross-refs

- `writing-skills` skill — how to write skills, agents, and commands per
  OpenCode conventions.
- `/research` command — fall back when the vendored docs don't cover the
  question.

## Gotchas

- *Guessing config semantics instead of reading the vendored doc* — the docs
  are right there in `docs/`. Read them before answering.
- *Treating vendored docs as frozen* — they are a snapshot. If a feature
  doesn't work as documented, the docs may be stale. Run `fetch.sh`.
- *Confusing MDX components for prose* — the vendored files contain JSX
  (`<Tab>`, `<Code>`, etc.). Focus on the markdown prose; the JSX is
  presentational scaffolding from the opencode.ai website build.
