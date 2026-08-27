---
description: Toolchain health check. Verifies all required core harness tools are installed and reports adapter-owned checks separately. Reports a PASS/FAIL/SKIPPED table and ends with a go/no-go summary.
---

Check every language-agnostic tool the Prism pi harness depends on. Report a
consolidated status table. Do not install, upgrade, authenticate, or modify
anything.

Stack runtimes, test frameworks, linters, coverage tools, and asset builders
belong to the active adapter and are reported separately; this core prompt
does not guess their commands.

## 1. pi runtime

```bash
set -o pipefail
pi --version 2>/dev/null || echo "NOT_FOUND"
```

PASS requires pi to run. The harness prescribes no models (ADR-0067); model
availability and authentication are user-managed. Never inspect the auth
store; if a live request later reports an auth error, direct the user to
`/login` for their provider.

## 2. Core command-line tools

```bash
set -o pipefail
git --version 2>/dev/null || echo "NOT_FOUND"
bash --version 2>/dev/null | head -1 || echo "NOT_FOUND"
node --version 2>/dev/null || echo "NOT_FOUND"
npm --version 2>/dev/null || echo "NOT_FOUND"
curl --version 2>/dev/null | head -1 || echo "NOT_FOUND"
command -v openssl >/dev/null 2>&1 && openssl version || echo "NOT_FOUND"
command -v jq >/dev/null 2>&1 && jq --version || echo "OPTIONAL_NOT_FOUND"
```

Floors: Bash >= 4 for the harness validator; Node.js >= 20; npm >= 9. `git`,
`curl`, and `openssl` require maintained versions but have no project-pinned
floor. `jq` is optional because Core launcher reports are already structured
JSON and do not require a shell parsing dependency.

## 3. Prism resources

Run the contract-owned readiness check without asking an OCR question (never
install or configure Semgrep/OCR):

```bash
prism-tool doctor
```

This performs mandatory Semgrep/OCR version verification (ADR-0063: Semgrep
`>=1.173.0 <2.0.0`, OCR `>=1.9.1 <2.0.0`) and runs `ocr llm test` only when
the global standing-consent record is valid. Missing or unsafe consent returns
NO-GO with `/setup` as the remediation. Never grant, revoke, repair, or remove
consent from `/doctor`.

```bash
pi list

for path in \
    packages/prism-core/AGENTS.md \
    packages/prism-core/APPEND_SYSTEM.md \
    packages/prism-core/extensions/safety/index.ts \
    packages/prism-core/extensions/web-access/index.ts \
    packages/prism-core/skills/brainstorming/SKILL.md \
    packages/prism-core/prompts/router.md \
    packages/prism-core/scripts/validate-harness.sh
do
    [ -e "$path" ] && echo "PASS $path" || echo "SKIPPED $path (package source not in this checkout)"
done
```

In a normal consumer project, source paths are expected to be absent; use
`pi list` and the current session's discovered resources instead. In the Prism
source checkout, a missing listed path is FAIL.

Run the package validator when present:

```bash
CORE_VALIDATOR="packages/prism-core/scripts/validate-harness.sh"
if [ -x "$CORE_VALIDATOR" ]; then
    bash "$CORE_VALIDATOR"
else
    echo "SKIPPED: source validator not present in this checkout"
fi
```

## 4. Commit pipeline

Run the hooks-path check directly:

```bash
git config core.hooksPath
```

An exact `.github/hooks` output means INSTALLED. Empty output or any other
value means NOT_INSTALLED. For the remediation, resolve the script directory
in a separate call:

```bash
prism-tool resolve scripts
```

Retain the returned absolute directory and report the literal remediation
`bash /absolute/resolved/scripts/install-hooks.sh`.

Run the remaining checks independently:

```bash
if command -v prism-tool > /dev/null 2>&1; then
    prism-tool run commitlint -- --version
else
    echo "prism-tool launcher NOT_INSTALLED — deploy via install-global.sh or /setup"
fi

git config user.name >/dev/null 2>&1 \
    && git config user.email >/dev/null 2>&1 \
    && echo "git identity CONFIGURED" \
    || echo "git identity NOT_CONFIGURED"
```

A repository that ships the Prism hooks needs `.github/hooks` configured and
the prism-tool launcher available; the commit-msg hook fails closed without
it. A consumer that does not ship these hooks reports the section SKIPPED.
Missing identity is blocking for signed commits because
`resolve-identity.sh` fails closed.

## 5. Web-access readiness

Inspect independent consent and the closed managed configuration:

```bash
prism-tool consent status --json
prism-tool web-access status --json
```

Do not run `web_search`, `fetch_content`, or any live public request from
`/doctor`.

Report these results separately from mandatory Core readiness:

- OCR consent must be granted for full doctor and OCR review readiness.
- Missing standing web-access consent is `OPTIONAL_DISABLED`, not a mandatory
  Core failure. Direct the human to `/setup` if they want `web_search` or
  `fetch_content`.
- An unsafe consent record is mandatory `NO-GO` because OCR consent is not
  readable, and it also makes web access `WEB_ACCESS_NO-GO`. An unsafe
  web-access configuration alone is `WEB_ACCESS_NO-GO`. Both require human
  remediation; never overwrite, chmod, revoke, or remove either record.
- An absent web-access configuration is valid: browser auto-detection remains
  enabled, loopback SearXNG is absent, and guarded direct fallback is available
  only after consent.
- Browser `UNAVAILABLE` or `disabled` is optional. Report an available family
  without exposing the executable path.
- A configured SearXNG URL is reported only as loopback configured; never print
  the URL or make a request.

Prism does not inspect or migrate legacy provider environment variables.

## 6. GitHub CLI

```bash
if command -v gh >/dev/null 2>&1; then
    gh --version | head -1
    gh auth status >/dev/null 2>&1 \
        && echo "AUTHENTICATED" \
        || echo "NOT_AUTHENTICATED — run 'gh auth login'"
else
    echo "OPTIONAL_NOT_FOUND"
fi
```

`gh` is required for ticketing, labels, rulesets, PR preparation, and release
workflows, but not for local coding. Treat it as a feature-level soft fail.
Do not run a GitHub API request.

## 7. Active adapter

Detect adapter evidence and resource availability. For example,
`composer.json` or `aurora/` indicates the project-local `prism-php-web`
adapter. Confirm the matching stack skill and check prompt are discoverable.
Report exact stack-tool health as **DELEGATED** to that adapter; do not embed
framework-specific version floors in this core prompt.

If project evidence identifies an adapter but its resources are unavailable,
report FAIL with the project-local install command. If no adapter applies,
report SKIPPED.

## Output

For every tool or resource report:

- **PASS** — present and usable at the required floor.
- **WARN** — present but below the floor.
- **FAIL** — a required core tool/resource is missing.
- **SKIPPED** — optional, adapter-owned, or absent by design in a consumer
  checkout.
- **DELEGATED** — exact health is owned by the active adapter.

End with one summary:

- **GO** — all required core checks pass; list optional/delegated checks.
- **NO-GO** — list every required core failure and the non-destructive
  remediation command. Do not run it.

## Rules

- Never install, upgrade, authenticate, or modify anything. Report only.
- Never read credential files or print environment-variable values.
- A missing optional search integration or `gh` does not block local coding.
- A missing core runtime, safety extension, global instruction bootstrap, or
  required commit-pipeline component is blocking for the operation it guards.
- Stack-specific checks belong to the active adapter.
