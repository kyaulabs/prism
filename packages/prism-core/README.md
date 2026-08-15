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
- The managed `prism-tool` launcher, backed by the installed core package and
  verified against mandatory Semgrep and OCR readiness.

## Install

Semgrep `>=1.173.0 <2.0.0` and OCR `>=1.9.1 <2.0.0` must already be installed.
Configure OCR directly with its own provider/model commands; Prism never reads
or writes its credentials.

From a Prism checkout, install the local core without registry access and
separately approve the required OCR connectivity test:

```bash
bash packages/prism-core/scripts/install-global.sh --ocr-test-approved=yes
```

To install the published npm package, approve registry access independently:

```bash
PRISM_CORE_SOURCE=npm:@kyaulabs/prism-core \
  bash packages/prism-core/scripts/install-global.sh \
  --network-approved=yes \
  --ocr-test-approved=yes
```

The installer deploys `prism-tool` to `${PRISM_BIN_DIR:-$HOME/.local/bin}` and
does not edit shell startup files or `PATH`. It refuses to overwrite or remove
an unrelated executable. Remove only a Prism-owned launcher with:

```bash
bash packages/prism-core/scripts/install-global.sh --uninstall-launcher
```

A readiness failure leaves the installed package, launcher, and context
resources available for remediation but does not report toolchain GO. After a
successful install, run `pi` in any trusted project. Authenticate with `/login`
for your provider. Model and thinking selection is yours at any time —
**Ctrl+P** cycles models, **Shift+Tab** sets thinking; the harness prescribes
nothing (ADR-0067). Run `/setup` to write your own session defaults.

## Adapter

For PHP/Aurora web projects, add the stack adapter per-project:

```bash
pi install -l npm:@kyaulabs/prism-php-web
```

## Toolchain readiness

The package declares its owned tools in `toolchain.json`: bundled core tools
(commitlint, git-cliff) resolve through `prism-tool`; Semgrep
`>=1.173.0 <2.0.0` and OCR `>=1.9.1 <2.0.0` are mandatory external
prerequisites that Prism verifies but never installs, configures, or
authenticates (ADR-0063). Registry access, consumer mutation, OCR
connectivity, and OCR code egress are four separate approvals; `ocr llm test`
runs only after its own connectivity approval at the defined cadence. CI
provisions compatible Semgrep/OCR releases only to construct its ephemeral
verification environment — runtime setup remains verification-only.

## License

AGPL-3.0-only. See [NOTICE](./NOTICE) for the full attribution chain
(obra/superpowers, mattpocock/skills, anthropics/skills, glebis/claude-skills,
@earendil-works/pi-coding-agent).
