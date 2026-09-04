---
description: Pre-push gate. Runs PHP CS fixer (dry-run), stylelint, eslint, and Pest with coverage (80% gate). Reports all failures grouped by tool before push.
---

Run the project's full pre-push check suite and report failures grouped by
tool. Do not push or commit anything.

## 0. Mandatory local readiness

```bash
prism-tool doctor --local-only
```

A missing launcher or failed Semgrep/OCR readiness is blocking; report the
remediation and stop.

## 1. PHP code style

```bash
prism-tool run php-cs-fixer -- fix --dry-run --diff
```

If violations are found, list the affected files and a one-line summary of the
fix. Do not auto-fix. The launcher resolves the adapter-owned fixer from the
consumer project; a missing tool is a hard failure, never SKIPPED.

## 2. SCSS lint

```bash
prism-tool run stylelint -- "cdn/sass/**/*.scss" --allow-empty-input
```

Skip with a note if no SCSS source exists.

## 3. JS lint

```bash
prism-tool run eslint -- "cdn/js/**/*.js" ".github/scripts/**/*.js" --ignore-pattern "*.min.js" --no-error-on-unmatched-pattern
```

Skip with a note if no JS source exists.

## 4. Tests with coverage

Run this section as the separate, simple commands shown — never recombined
into one compound script. The safety extension fails closed on command
substitution, backticks, ANSI-C quoted strings, and deferred-execution
builtins, so the gate uses plain pipelines, literal values, and
project-local temp files under `.pi/tmp/`.

Identify the changed PHP files (staged first, as at pre-commit time; fall
back to the working tree when nothing is staged):

```bash
mkdir -p .pi/tmp
git diff --staged --name-only --diff-filter=AM | grep "\.php$" > .pi/tmp/check-changed-php.txt || true
```

```bash
if [ ! -s .pi/tmp/check-changed-php.txt ]; then git diff --name-only | grep "\.php$" > .pi/tmp/check-changed-php.txt || true; fi
echo "Changed PHP files:"; cat .pi/tmp/check-changed-php.txt
```

The browser-fixture profile selects the nearest available port and owns server
startup, readiness, client environment, and cleanup. Do not reproduce that
lifecycle with shell commands.

**Coverage-driver preflight** — without a driver the suite exits 1 silently
(Pest/PHPUnit abort before running any tests). pcov loaded-but-disabled is
fine: the launcher injects `php -d pcov.enabled=1` via the toolchain
`argvPrefix`. Only a totally missing driver is blocking:

```bash
php -m 2>/dev/null | grep -E "^(pcov|xdebug)$"
```

Empty output means FAIL: no PHP coverage driver loaded (pcov or xdebug).
Report the remediation (install pcov via pecl, or enable xdebug) and stop.
`pcov.enabled=0` is fine — the pest launcher injects `-d pcov.enabled=1`.

Then run the full suite with coverage (Clover XML feeds the changed-file gate)
through the launcher with the exact adapter-owned command used by CI and TDD:

```bash
prism-tool server run @kyaulabs/prism-php-web:browser-fixture --tool pest -- --coverage
```

Use this command even when the current suite has no browser tests. It keeps
local, CI, TDD, and plan execution on the same adapter-owned lifecycle.

**Changed-file coverage gate** — enforced mechanically by the same script
CI uses (`coverage-gate.php`):

```bash
cat .pi/tmp/check-changed-php.txt | php packages/prism-php-web/scripts/coverage-gate.php tests/coverage.xml
```

- Gate: **≥ 80% line coverage** on each changed file that is in the
  coverage source set (`<source>` in `phpunit.xml`).
- A changed file that exists but is **outside `<source>` and contains
  executable code emits a WARN** (non-blocking by default; FAILs under
  `--strict`). Deleted files and files with no executable lines are
  SKIPped. An empty/degenerate Clover report fails with exit 2.
- This command and CI both run the gate **without** `--strict` (ADR-0025
  parity); `--strict` is an available opt-in for stricter local checks.
- If the script exits non-zero, report the failing files and the specific
  uncovered lines (from the coverage HTML report at `tests/coverage/`).
- Flag (non-blocking) if overall coverage is below 80% but every changed
  file passes — this means technical debt in untouched files, not a
  blocker.
- If any test fails, list the failing tests with their messages.

Remove the changed-file list when the gate finishes:

```bash
rm -f .pi/tmp/check-changed-php.txt
```

## 5. JS/TS tests

```bash
if grep -q '"test:plugin"' package.json 2>/dev/null; then
    npm run test:plugin
else
    echo "SKIPPED: test:plugin script not defined in package.json"
fi
```

Run the Node.js test runner on TS plugin tests. Report PASS if all exit 0,
FAIL with the failing test output, or SKIPPED if the directory is empty or
missing.

## 6. PHP syntax (sanity)

```bash
git diff --staged --name-only --diff-filter=AM | grep "\.php$" | while read -r f; do php -l "$f"; done
```

Run on staged files; if nothing is staged, run on the working tree's modified
PHP files via `git diff --name-only`.

## 7. Shell regression tests

```bash
if compgen -G "tests/Shell/*_test.sh" > /dev/null; then
  for t in tests/Shell/*_test.sh; do
    echo "→ $t"
    bash "$t"
  done
else
  echo "SKIPPED: no tests/Shell/*_test.sh files found"
fi
```

Run each `tests/Shell/*_test.sh`. Report PASS if all exit 0, FAIL with the
failing script and its output, or SKIPPED if the directory is empty/missing.

## Output

Group results by tool. For each tool: PASS / FAIL / SKIPPED (with reason).
End with a single go/no-go:

- **GO** — all tools pass, coverage ≥ 80%, no syntax errors.
- **NO-GO** — list blocking failures. Do not suggest a push until resolved.

## Rules

- Never auto-fix, commit, or push. Report only.
- Run tools in the order above; if PHP syntax fails, you may stop early since
  the linters and tests would be unreliable.
- If a tool is not installed, report SKIPPED with the install command — do not
  attempt to install it.
- Coverage gate applies to changed files specifically; flag if overall
  coverage is below 80% but changed-file coverage is above.
- **Check vs verification:** This command is the aggregate pre-push gate.
  `verification-before-completion` is the per-task gate. Both run because
  task-level green can rot by push time.
