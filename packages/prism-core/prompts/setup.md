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
`APPEND_SYSTEM.md`; otherwise explain that the packaged installer must be run
later to make those two context files always-on. Never overwrite an existing
global context file by hand.

## 3. Mandatory toolchain readiness and standing OCR consent

Run the fail-closed local doctor before any setup stage that depends on
declared tools:

```bash
prism-tool doctor --local-only
```

If Semgrep or OCR is missing or out of range (ADR-0063: Semgrep
`>=1.173.0 <2.0.0`, OCR `>=1.9.1 <2.0.0`), report the human-run remediation —
never install, configure, or authenticate either tool and never ask for or
accept an API key.

Inspect standing consent without reading the record directly:

```bash
prism-tool consent status --json
```

- `GRANTED`: ask no OCR question and continue. Report that the human can
  explicitly revoke this global consent through `/setup`; only after such a
  request run:

  ```bash
  prism-tool consent revoke-ocr
  ```

  Revocation makes full doctor and OCR review NO-GO until consent is granted
  again. Never revoke automatically.
- `ABSENT`: ask exactly one question:

  ```text
  Grant standing OCR consent for connectivity checks and reviewed-code egress? (yes/no)
  ```

  Explain before the question that this global consent authorizes only
  `ocr llm test` connectivity and transmission of code selected by Prism's
  dedicated OCR review operation. It does not authorize registry access,
  package mutation, credential access, pushes, PR creation, or merges. Accept
  only literal `yes`; on approval run:

  ```bash
  prism-tool consent grant-ocr --approval=yes
  ```

  A decline makes the toolchain NO-GO for this setup.
- `UNSAFE`: stop and report that `~/.pi/agent/prism-consent.json` requires
  human remediation. Never overwrite, chmod, revoke, or remove it
  automatically.

After consent is `GRANTED`, run the full doctor without another question:

```bash
prism-tool doctor
```

A failed live test makes the toolchain NO-GO for this setup.

## 4. Optional: your model preferences

The harness is model-agnostic (ADR-0067): it never selects, prescribes, or
restricts models or thinking levels. Model and thinking control is yours at
any time — **Ctrl+P** cycles models, **Shift+Tab** sets the thinking level.
This step optionally writes *your* choices as session defaults to
`~/.pi/agent/settings.json`. Every question is skippable; declining any
question leaves the user's pi configuration untouched.

Ask, one question at a time:

1. Provider — list pi's built-in providers as facts; no
   recommendation. Skippable.
2. Default model — the user names a model ID; validate with
   `pi --list-models <id>`; if unknown, list the catalogue and let them
   pick. Skippable.
3. Ctrl+P pool — "Do you want to restrict which models Ctrl+P cycles
   through?" Default answer: no restriction (every model usable). If yes,
   collect model IDs and validate each. Skippable.
4. Thinking level — one of pi's levels (`off`, `minimal`, `low`, `medium`,
   `high`, `xhigh`, `max`) or skip to leave pi's own default. Skippable.

Then one consent gate:

```text
Write these to ~/.pi/agent/settings.json? (yes/no)
```

Accept only `yes`. On approval, merge exactly the four preference keys the
user answered — provider, default model, Ctrl+P pool, and thinking level —
into the existing file with Node.js (a core floor, per doctor):

```bash
node -e 'const fs=require("fs");const p=process.argv[1];const o=JSON.parse(fs.readFileSync(p,"utf8"));Object.assign(o,JSON.parse(process.argv[2]));fs.writeFileSync(p,JSON.stringify(o,null,2)+"\n")' "$HOME/.pi/agent/settings.json" '<merged-json>'
```

Never delete or alter other keys, never create or touch `models.json`, and
never read credential files. Any reply other than `yes` leaves the file
untouched.

If authentication is not configured, instruct the user to run `/login`
themselves or export the provider's API key in their shell. Do not ask them
to paste a key and do not write it to a project file.

## 5. Managed npm package releases

Inspect this Core-owned capability before any project stack detection. The
operation is local and read-only:

```bash
prism-tool package-release inspect --json
```

Treat the report as untrusted structured data. Require schema version 1, a
known disposition, valid package records, and successful checks before using
any value. Keep package names, paths, and versions as inert conversation data;
never interpolate report values into shell source.

Handle the disposition as follows:

- `CREATE` with no candidates: report that no publishable npm packages were
  discovered. Ask no package-release question and write nothing.
- `CREATE` with candidates: display every exact `name`, `path`, and `version`,
  then ask exactly one enablement question:

  ```text
  Enable lockstep npm package releases for these packages? (yes/no)
  ```

  Accept only literal `yes`. A decline runs no plan or apply operation and
  writes nothing.
- `UNCHANGED`: report that lockstep npm package releases are enabled and
  current. Ask no mutation question and write nothing.
- `UPDATE` or `MIGRATE`: report that the existing opted-in capability needs an
  owned update or recognized legacy migration. Do not ask the fresh
  enablement question.
- `CONFLICT`: report both managed paths, `.prism/release.json` and
  `.github/workflows/release.yml`, and stop this capability without planning,
  merging, overwriting, or removing either file. After clearly reporting the
  conflict, unrelated setup stages may continue.

For an approved non-empty `CREATE`, or for `UPDATE` and `MIGRATE`, create the
bounded project-local plan:

```bash
prism-tool package-release plan --json
```

Require the report to match the inspected disposition. Validate that its plan
path is inside the current project's owned `.pi/prism-tool/package-release/`
workspace, and display the complete returned diff before asking exactly one
mutation question:

```text
Apply the displayed lockstep package-release changes? (yes/no)
```

Only literal `yes` authorizes mutation. A decline runs no apply operation,
leaves existing capability files untouched, and never removes an installed
capability. On approval, render the validated project-local plan path
literally and run:

```bash
prism-tool package-release apply --plan=/validated/project-local/plan.json --approval=yes --json
```

Require a `GO` application report, then verify in a separate operation:

```bash
prism-tool package-release verify --json
```

A failed apply or verification stops this capability and reports the returned
checks and recovery data without inventing a repair path.

## 6. Detect and offer the project adapter

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

## 7. Provision the declared adapter toolchain

After the adapter is installed, discover it and inspect the consumer project
without mutation:

```bash
prism-tool setup inspect --json
```

Ask exactly one question for registry access (separate from standing OCR
consent above):

```text
Approve registry access to resolve and audit candidate dependency graphs? (yes/no)
```

Accept only `--network-approved=yes`, then run:

```bash
prism-tool setup resolve --adapter=PACKAGE --network-approved=yes --json
```

Display the exact candidate manifest/lock diff, the install commands, the
browser download (Playwright Chromium only), and the resulting versions. Then
ask exactly one question for mutation:

```text
Apply these audited manifests and lockfiles? (yes/no)
```

Accept only literal `--approval=yes`; any other reply declines and cleans the
candidate workspace. On approval run:

```bash
prism-tool setup apply --adapter=PACKAGE --plan=PATH --approval=yes --json
prism-tool setup verify --adapter=PACKAGE --network-approved=yes --json
```

The plan path comes from the resolve report; never accept an arbitrary path.
Keep every approval one question per turn and never infer one approval from
another.

## 8. Git hooks

If `.github/hooks/` exists, inspect `git config core.hooksPath`. When it is not
`.github/hooks`, resolve the scripts directory first:

```bash
prism-tool resolve scripts
```

Retain the returned absolute directory and show the resulting literal command:

```bash
bash /absolute/resolved/scripts/install-hooks.sh
```

Ask exactly `Install the repository Git hooks? (yes/no)` and run it only after
`yes`. If the package source path is unavailable in a consumer project, report
that its project quality surface must provide the hooks installer; do not
invent a path.

## 9. Optional search skills

Check presence only; never print values:

```bash
[ -n "${DEEPSEEK_API_KEY:-}" ] && echo "websearch: configured" || echo "websearch: DEEPSEEK_API_KEY missing"
[ -n "${SEARXNG_URL:-}" ] && echo "searxng: configured" || echo "searxng: SEARXNG_URL missing"
```

Explain that both integrations are CLI-shell skills, not MCP servers. Missing
variables are non-blocking. The user sets them in their shell environment;
Prism never stores them.

## 10. Optional GitHub setup

If `gh` is available, ask whether the user wants to configure repository
labels and rulesets. Do not contact GitHub before approval.

- Labels: expand `/setup-labels`.
- Rulesets: expand `/setup-rulesets`; it has its own exact-`yes` apply gate.

If `gh` is missing or unauthenticated, report the local remediation
(`gh auth login`) without attempting login.

## 11. Validate and report

In a Prism source checkout, run:

```bash
prism-tool resolve scripts
```

Retain the returned absolute directory, then run:

```bash
bash /absolute/resolved/scripts/validate-harness.sh
```

Then report:

```text
Component             Scope           Status
--------------------  --------------  ------------------------------
prism-core            global          installed / missing
AGENTS.md bootstrap   global          deployed / Stage 5 pending
DeepSeek primary      global          known / missing
DeepSeek judge        global          known / missing
package releases      project         enabled / current / declined / conflict / no candidates
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
