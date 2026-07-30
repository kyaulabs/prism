---
description: Toolchain health check. Verifies all required dev-toolchain tools are installed at the expected version floors. Reports a PASS/FAIL/SKIPPED table per tool and ends with a go/no-go summary. Compares against known-good versions from README.md.
subtask: true
---

Check every tool the coding harness depends on — runtimes, build pipeline, lint/test, and security/review tooling. Report a consolidated status table. Do not install or upgrade anything.

## 1. Runtimes

```bash
set -o pipefail
php --version 2>/dev/null | head -1 | sed 's/PHP //' || echo "NOT_FOUND"
composer --version 2>/dev/null | head -1 | sed 's/Composer version //' || echo "NOT_FOUND"
npm --version 2>/dev/null || echo "NOT_FOUND"
```

Floor: `php` >= 8.5, `composer` >= 2 (any), `npm` >= 9 (any).

## 2. Build pipeline

```bash
set -o pipefail
sass --version 2>/dev/null || echo "NOT_FOUND"
npx uglifyjs --version 2>/dev/null | head -1 || echo "NOT_FOUND"
npx git-cliff --version 2>/dev/null | head -1 || echo "NOT_FOUND"
```

Floor: `sass` >= 1.69 (dart-sass), `uglifyjs` >= 3.17, `git-cliff` >= 2.0.

## 3. Lint and test

```bash
set -o pipefail
php-cs-fixer --version 2>/dev/null | head -1 | sed 's/PHP CS Fixer //' || echo "NOT_FOUND"
php vendor/bin/pest --version 2>/dev/null | head -1 || echo "NOT_FOUND"
npx eslint --version 2>/dev/null || echo "NOT_FOUND"
npx stylelint --version 2>/dev/null || echo "NOT_FOUND"
npx commitlint --version 2>/dev/null | head -1 || echo "NOT_FOUND"
[ -d node_modules/commitlint ] && echo "commitlint (local) INSTALLED" || echo "commitlint (local) NOT_INSTALLED — run 'npm install' (commit-msg fails closed — ADR-0025)"
```

Floor: `php-cs-fixer` checks any installed version (same as `php-cs-fixer fix --dry-run` gate); `pest` >= 4; `eslint` >= 10; `stylelint` >= 17; `commitlint` >= 21.

## 4. Security and review

```bash
set -o pipefail
semgrep --version 2>/dev/null | head -1 || echo "NOT_FOUND"
ocr --version 2>/dev/null | head -1 || echo "NOT_FOUND"
gitleaks version 2>/dev/null | head -1 || echo "NOT_FOUND"
```

Floor: `semgrep` >= 1.168, `ocr` >= 1.7, `gitleaks` >= 8.30. These are run by agents that delegate to sub-tools — if missing, the affected `@semgrep`, `@code-review`, and pre-commit secret scans will skip without error, but no SAST/review/secret-scanning coverage is delivered.

## 5. git hooks

```bash
hooks_path=$(git config core.hooksPath 2>/dev/null || echo "")
if [ "$hooks_path" = ".github/hooks" ]; then echo "INSTALLED ($hooks_path)"; else echo "NOT_INSTALLED — run 'bash .github/scripts/install-hooks.sh'"; fi
```

## 6. LSP servers

```bash
# PHP Intelephense (auto-installs for PHP projects)
php -r "echo PHP_VERSION;" 2>/dev/null && echo " — intelephense auto-installs on first .php file" || echo "NOT_FOUND"

# TypeScript (requires typescript dependency)
npx tsc --version 2>/dev/null || echo "NOT_FOUND"

# ESLint (requires eslint dependency)
npx eslint --version 2>/dev/null || echo "NOT_FOUND"

# Bash (auto-installs bash-language-server)
command -v bash 2>/dev/null && echo "bash present — bash-language-server auto-installs" || echo "NOT_FOUND"

# YAML (auto-installs yaml-language-server)
echo "yaml-language-server auto-installs on first .yaml/.yml file"

# Stylelint (custom — requires @stylelint/language-server)
npx @stylelint/language-server --version 2>/dev/null || echo "NOT_FOUND"

# Deno (should be disabled in opencode.jsonc)
grep -A1 '"deno"' opencode.jsonc | grep -q '"disabled":[[:space:]]*true' && echo "DISABLED (correct)" || echo "ENABLED (should be disabled)"
```

Floor: `typescript` any (LSP only, no compilation); `eslint` >= 10;
`@stylelint/language-server` any; `deno` must be disabled in config.

## 7. Commit pipeline

The commit pipeline has three links that must all be intact:

- **commitlint (local)** — `[ -d node_modules/commitlint ]` (checked in Section 3). This is the local dependency the `commit-msg` hook loads. When absent, the hook cannot find `@commitlint/config-conventional` and will **fail-closed**, blocking every commit.
- **hooksPath** — `git config core.hooksPath` must be `.github/hooks` (checked in Section 5). Without this, the `commit-msg` and `pre-commit` hooks never fire, and the commit pipeline has no enforcement.
- **commit-msg fail-closed** (ADR-0025) — The `.github/hooks/commit-msg` script checks for `node_modules/commitlint` before running commitlint. If the directory is missing, the hook exits non-zero, blocking **all** commits. There is no fallback or bypass: fix the install (`npm install`), then retry the commit.

Diagnostic: if commits are blocked and the summary table shows `commitlint (local) NOT_INSTALLED`, run `npm install`. If `hooksPath` is also wrong, run `bash .github/scripts/install-hooks.sh`.

## 8. Scaffold prerequisite (GitHub CLI)

```bash
# gh — required only for /setup scaffold clone mode (ADR-0026)
if command -v gh >/dev/null 2>&1; then
    if gh auth status >/dev/null 2>&1; then
        echo "INSTALLED + AUTHENTICATED"
    else
        echo "INSTALLED but NOT AUTHENTICATED — run 'gh auth login'"
    fi
else
    echo "NOT_FOUND — only needed for /setup scaffold clone mode"
fi
```

Floor: `gh` any recent (`gh auth status` is stable across versions). This is a
**soft-fail** prerequisite — missing or unauthenticated `gh` only blocks the
`clone` option of `/setup`'s scaffold mode (§2.5). The `new` and `skip`
options, and all other harness features, work without it.

## 9. Prism manifest CLI (config sourcing)

```bash
php .github/scripts/prism_manifest.php version 2>/dev/null || echo "NOT_FOUND"
```

The `prism_manifest.php` CLI replaces jq for reading the `prism.jsonc` project manifest (ADR-0043). It exports the fifteen `OPENCODE_*` environment variables as a NUL-separated stream (via `env0` subcommand) and provides a `version` check. Missing means `direnv` cannot source model, variant, or experimental flags — opencode.jsonc `{env:VAR}` substitution will resolve to empty values.

## Output

Group results by section. For each tool, report:

- **PASS** — installed and meets the version floor.
- **WARN** — installed but below the version floor (list actual vs. expected).
- **FAIL** — `command -v` returned nothing (tool not found).
- **SKIPPED** — tool is optional and not expected on this platform (e.g. `gitleaks` on a
  shared CI runner where secrets scanning is a dedicated job).

End with a single go/no-go summary table:

```text
Tool         Status   Version         Floor        Install
-----------  -------  --------------  -----------  -------------------------------
php          PASS     8.5.2           8.5          —
composer     PASS     2.8.1           2.0          —
npm          PASS     10.8.0          9.0          —
sass         PASS     1.85.1          1.69         —
uglifyjs     PASS     3.17.0          3.17         —
git-cliff    FAIL     NOT_FOUND       2.0          cargo install git-cliff
php-cs-fixer PASS     3.68.0          any          —
pest         WARN     3.9.2           4.0          composer update pestphp/pest
eslint       PASS     9.1.0           9.0          —
stylelint    SKIPPED  —               —            no SCSS in this project yet
commitlint   PASS     19.0.0          19.0         —
commitlint (local)  PASS  INSTALLED  —  npm install
semgrep      PASS     1.168.0         1.168        —
ocr          PASS     1.7.1           1.7          —
gitleaks     FAIL     NOT_FOUND       8.30         go install github.com/gitleaks/gitleaks/v8@latest
pre-commit   PASS     INSTALLED       —            —
commit-msg   PASS     INSTALLED       —            —
intelephense  PASS     auto-install    —            —
typescript    PASS     7.x.x           any          —
eslint        PASS     10.x.x          9.0          —
bash-ls       PASS     auto-install    —            —
yaml-ls       PASS     auto-install    —            —
stylelint-ls  PASS     1.1.1           any          npm i -D @stylelint/language-server
deno-lsp      PASS     DISABLED        —            —
gh            PASS     INSTALLED+AUTH  any recent   gh auth login
prism_manifest PASS     v5              —            —

GO: 13 pass, 1 warn, 2 fail, 1 skipped, 1 soft-fail pass. Unblocked for writing code.
NO-GO for CI: fail items must be fixed before CI runs (git-cliff needed for
changelog generation).
```

## Rules

- Never install, upgrade, or modify any tool. Report only.
- Warning (version below floor) does not block — report it and move on. The
  tool may still work for basic use; the floor is the known-good version tested
  in this project.
- Fail (tool not found) blocks NO-GO only for runtime and build tools
  (`php`, `composer`, `npm`, `sass`, `uglifyjs`, `git-cliff`). Security/review
  tools (`semgrep`, `ocr`, `gitleaks`) are "soft-fail" — they gate the
  `@semgrep` / `@code-review` / pre-commit agents but do not block writing
  or pushing code without them.
- Missing `node_modules/commitlint` is a **HARD NO-GO for committing** — not a
  soft-fail or WARN. ADR-0025 makes the `commit-msg` hook fail-closed: if
  `node_modules/commitlint` is absent, the hook blocks EVERY commit. The
  toolchain otherwise works (lint, test, build), but no commit can succeed
  until `npm install` restores the local dependency. Treat this as blocking
  as `php` or `npm` being missing.
- `pest` floor is 4.0 (Pest v4 on PHPUnit 12 per AGENTS.md). If every changed
  test file still passes the old version, warn but don't block.
- Version parsing: extract the semantic version from whatever `--version`
  / `version` / `-v` prints. Dart Sass prints a bare version string.
  `gitleaks` uses `version` (not `--version`). `semgrep` may print a header
  line — take the first line only. Handle each tool's quirks.
- LSP server checks are "soft" — a FAIL does not block writing code, but the
  agent will not receive diagnostics from that language server. Report and
  continue.
- `gh` (GitHub CLI) is a **soft-fail** prerequisite — it is only required for
  the `clone` option of `/setup`'s scaffold mode (§2.5, ADR-0026). The `new`
  and `skip` scaffold options, and every other harness feature, work without
  it. A missing or unauthenticated `gh` is reported as FAIL/SKIPPED but never
  blocks writing, committing, or pushing code.
- `prism_manifest.php` is required by `.envrc` for parsing `prism.jsonc` (ADR-0043).
  Missing means model, variant, and experimental env vars export as empty —
  opencode will not receive correct model configuration. Treat as blocking
  as `php` or `npm` being missing.
