---
description: Pre-push gate. Runs PHP CS fixer (dry-run), stylelint, eslint, and Pest with coverage (80% gate). Reports all failures grouped by tool before push.
---

Run the project's full pre-push check suite and report failures grouped by
tool. Do not push or commit anything.

## 1. PHP code style

```bash
CS_FIXER=""
if [ -x vendor/bin/php-cs-fixer ]; then
	CS_FIXER=vendor/bin/php-cs-fixer
elif command -v php-cs-fixer > /dev/null 2>&1; then
	CS_FIXER=php-cs-fixer
fi
if [ -n "$CS_FIXER" ]; then
	"$CS_FIXER" fix --dry-run --diff
else
	echo "SKIPPED: php-cs-fixer not found (install via composer install or globally)"
fi
```

If violations are found, list the affected files and a one-line summary of the
fix. Do not auto-fix.

## 2. SCSS lint

```bash
npx stylelint "cdn/sass/**/*.scss"
```

Skip with a note if stylelint is not configured or no SCSS exists.

## 3. JS lint

```bash
npx eslint "cdn/js/**/*.js" ".github/scripts/**/*.js" --ignore-pattern "*.min.js" --no-error-on-unmatched-pattern
```

Skip with a note if eslint is not configured or no JS source exists.

## 4. Tests with coverage

First, identify the PHP files that have changed and stand up a dev server
for browser tests (mirrors CI's start/wait/run/stop dance in `ci.yml`):

```bash
CHANGED=$(mktemp)
PHP_SERVER_PID=""
cleanup() {
    rm -f "$CHANGED"
    [ -n "$PHP_SERVER_PID" ] && kill "$PHP_SERVER_PID" 2>/dev/null || true
}
trap cleanup EXIT

# Staged files (pre-commit); fall back to working-tree if nothing staged
git diff --staged --name-only --diff-filter=AM | grep '\.php$' > "$CHANGED"
if [ ! -s "$CHANGED" ]; then
  git diff --name-only | grep '\.php$' > "$CHANGED"
fi
echo "Changed PHP files:" && cat "$CHANGED"

# Start a PHP dev server for browser tests. Reuse an existing server on
# :8080 if one is already serving smoke.html (avoids a port-bind failure
# when the developer already has a server running). The readiness poll is
# a bounded while-loop rather than `timeout` so this works on macOS too.
BROWSER_URL=""
if [ -n "$(find tests/Browser -name '*.php' -print -quit 2>/dev/null)" ] \
   && command -v curl > /dev/null 2>&1; then
    if curl -sf http://localhost:8080/smoke.html > /dev/null 2>&1; then
        BROWSER_URL="http://localhost:8080"
        echo "→ reusing existing dev server at $BROWSER_URL"
    else
        php -S localhost:8080 -t tests/Browser/fixtures/ > /dev/null 2>&1 &
        PHP_SERVER_PID=$!
        attempts=0
        ready=0
        while [ "$attempts" -lt 20 ]; do
            if curl -sf http://localhost:8080/smoke.html > /dev/null 2>&1; then
                ready=1
                break
            fi
            sleep 0.5
            attempts=$((attempts + 1))
        done
        if [ "$ready" -eq 1 ]; then
            BROWSER_URL="http://localhost:8080"
            echo "→ started dev server $BROWSER_URL (pid $PHP_SERVER_PID)"
        else
            echo "⚠ dev server did not become ready within ~10s — browser tests may fail"
            kill "$PHP_SERVER_PID" 2>/dev/null || true
            PHP_SERVER_PID=""
        fi
    fi
fi
```

Then run the full suite with coverage (Clover XML feeds the changed-file
gate). The dev server URL is passed via `PEST_BROWSER_BASE_URL` exactly as
CI sets it:

```bash
if [ -n "$BROWSER_URL" ]; then
    PEST_BROWSER_BASE_URL="$BROWSER_URL" php -d pcov.enabled=1 vendor/bin/pest --coverage
else
    php -d pcov.enabled=1 vendor/bin/pest --coverage
fi
```

**Changed-file coverage gate** — enforced mechanically by the same script
CI uses (`coverage-gate.php`):

```bash
cat "$CHANGED" | php packages/prism-php-web/scripts/coverage-gate.php tests/coverage.xml
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
git diff --staged --name-only --diff-filter=AM | grep '\.php$' | while read -r f; do php -l "$f"; done
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
