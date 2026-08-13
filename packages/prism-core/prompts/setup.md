---
description: Interactive, adapter-aware pi harness setup. Verifies the global prism-core install, offers the matching project-local adapter, installs Git hooks, and reports optional GitHub/search setup without storing secrets.
---

Configure Prism for the current pi project. Ask one question at a time and
require explicit confirmation before any install or remote GitHub operation.
Do not store, print, or request an API-key value in chat.

Legacy manifest, environment-composition, plugin-toggle, substitution, and
scaffold layers are intentionally gone (ADR-0057, ADR-0059). This setup
configures pi packages and project tooling only.

## 1. Pre-flight

Run local, read-only checks:

```bash
set -euo pipefail
pi --version
git rev-parse --show-toplevel
pi list
```

If `pi` is missing, stop and point the user to <https://pi.dev>. If this is
not a Git worktree, ask whether setup should continue without Git hooks and
GitHub integration.

Never read `~/.pi/agent/auth.json` or any credential file. Authentication is
managed only through pi's `/login` UI or the process environment.

## 2. Verify the global core

Inspect `pi list` for `@kyaulabs/prism-core` (or a local path ending in
`packages/prism-core`). Also confirm that the current session exposes the
core skills, prompts, and safety extension.

If the global core is missing, present exactly one install option appropriate
to the checkout:

- Prism source checkout: `pi install ./packages/prism-core`
- Published package: `pi install npm:@kyaulabs/prism-core`

Ask:

```text
Install prism-core globally with the displayed command? (yes/no)
```

Accept only `yes`. On approval, run the displayed command. If
`packages/prism-core/scripts/install-global.sh` exists, use that installer
instead because it also deploys the global `AGENTS.md` and
`APPEND_SYSTEM.md`; otherwise explain that Stage 5's installer must be run
later to make those two context files always-on. Never overwrite an existing
global context file by hand.

## 3. DeepSeek model access

Verify that pi knows both scoped model IDs without exposing credentials:

```bash
pi --list-models deepseek-v4-flash
pi --list-models deepseek-v4-pro
```

The expected strategy is:

- primary: `deepseek/deepseek-v4-flash`
- review/audit judge: `deepseek/deepseek-v4-pro` via Ctrl+P
- thinking level: Shift+Tab

If authentication is not configured, instruct the user to run
`/login deepseek` themselves or export `DEEPSEEK_API_KEY` in their shell.
Do not ask them to paste the key and do not write it to a project file.

## 4. Detect and offer the project adapter

Inspect project-local evidence only:

```bash
if [ -f composer.json ] || [ -d aurora ]; then
    echo php-web
else
    echo none
fi
```

When the result is `php-web`, explain that the matching adapter contributes
`php-web-stack`, `tdd-php`, `/check-php`, and adapter safe directories. Show
one project-local install command:

- Prism source checkout: `pi install -l ./packages/prism-php-web`
- Published package: `pi install -l npm:@kyaulabs/prism-php-web`

Ask:

```text
Install the prism-php-web adapter for this project? (yes/no)
```

Accept only `yes`; then run the displayed command. Never install the adapter
globally. If no known adapter evidence is present, report that the core can
run alone and ask which language adapter applies before any stack-specific
work. Do not guess or install an unrelated adapter.

## 5. Git hooks

If `.github/hooks/` exists, inspect `git config core.hooksPath`. When it is not
`.github/hooks`, show:

```bash
bash packages/prism-core/scripts/install-hooks.sh
```

Ask exactly `Install the repository Git hooks? (yes/no)` and run it only after
`yes`. If the package source path is unavailable in a consumer project, report
that its project quality surface must provide the hooks installer; do not
invent a path.

## 6. Optional search skills

Check presence only; never print values:

```bash
[ -n "${DEEPSEEK_API_KEY:-}" ] && echo "websearch: configured" || echo "websearch: DEEPSEEK_API_KEY missing"
[ -n "${SEARXNG_URL:-}" ] && echo "searxng: configured" || echo "searxng: SEARXNG_URL missing"
```

Explain that both integrations are CLI-shell skills, not MCP servers. Missing
variables are non-blocking. The user sets them in their shell environment;
Prism never stores them.

## 7. Optional GitHub setup

If `gh` is available, ask whether the user wants to configure repository
labels and rulesets. Do not contact GitHub before approval.

- Labels: expand `/setup-labels`.
- Rulesets: expand `/setup-rulesets`; it has its own exact-`yes` apply gate.

If `gh` is missing or unauthenticated, report the local remediation
(`gh auth login`) without attempting login.

## 8. Validate and report

In a Prism source checkout, run:

```bash
bash packages/prism-core/scripts/validate-harness.sh
```

Then report:

```text
Component             Scope           Status
--------------------  --------------  ------------------------------
prism-core            global          installed / missing
AGENTS.md bootstrap   global          deployed / Stage 5 pending
DeepSeek primary      global          known / missing
DeepSeek judge        global          known / missing
stack adapter         project-local   installed / declined / not detected
Git hooks             project         installed / declined / unavailable
websearch             environment     configured / optional missing
searxng               environment     configured / optional missing
harness validation    source checkout PASS / FAIL / SKIPPED
```

End with the single next action that remains, if any.

## Rules

- Ask one question at a time.
- Require literal `yes` before package installation or remote mutation.
- Core is global; adapters are project-local.
- Never create or revive legacy manifests, environment-composition helpers,
  integration servers, or model-tier environment variables.
- Never read, print, or persist API keys or auth stores.
- Never install an unrecognized adapter or dependency.
