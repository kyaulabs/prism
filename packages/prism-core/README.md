# @kyaulabs/prism-core

The **language-agnostic core** of the [prism](https://github.com/kyaulabs/prism)
coding harness for [pi](https://pi.dev).

prism re-expresses a disciplined engineering pipeline — **brainstorm → spec →
plan → TDD → verify → review** — as pi-native **skills**, **prompt templates**,
and **one safety extension**, run by a single pi agent. This package is the
language-neutral half; install it **globally** so it runs in every project.

## What it provides

- **Pipeline & discipline skills** — `brainstorming`, `grilling`, `to-spec`,
  `writing-plans`, `executing-plans`, `tdd`, `verification-before-completion`,
  `code-review`, `architect`, `wayfinder`, `finishing-a-development-branch`, …
- **Collapsed-agent skills** — `consult`, `from-issue`, `debug`, `explore`,
  `resolve-merge-conflicts`, `tracker-operator`, `docs-writer`, and the review
  trio (`code-review` / `spec-review` / `standards-review` / `test-audit`).
- **Prompt templates** (slash commands) — `/check`, `/issue`, `/pr`,
  `/release`, `/router`, `/security`, `/doctor`, `/prime`, `/teach`, …
- **The safety extension** — a `tool_call` gate that enforces a credential-path
  deny floor and an `rm -rf` safe-zone policy, with a consecutive-denial
  circuit breaker.
- **Research skills** — `websearch`, `searxng` (CLI-shell; no MCP).
- The always-on `AGENTS.md` + `APPEND_SYSTEM.md`, deployed to `~/.pi/agent/`
  by `install-global.sh` so the core is "always running".

## Install

```bash
pi install npm:@kyaulabs/prism-core
```

Then run `pi` in any project — the skills, prompts, and safety extension load
in every trusted session. Authenticate the model with `/login` → DeepSeek, or
`export DEEPSEEK_API_KEY=sk-...`. Default model `deepseek-v4-flash`; cycle to
`deepseek-v4-pro` with **Ctrl+P** for review.

## Adapter

For PHP/Aurora web projects, add the stack adapter per-project:

```bash
pi install -l npm:@kyaulabs/prism-php-web
```

## License

AGPL-3.0-only. See [NOTICE](./NOTICE) for the full attribution chain
(obra/superpowers, mattpocock/skills, anthropics/skills, glebis/claude-skills,
@earendil-works/pi-coding-agent).
