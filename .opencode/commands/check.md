---
description: Pre-push gate. Runs PHP CS fixer (dry-run), stylelint, eslint, and Pest with coverage (80% gate). Reports all failures grouped by tool before push.
subtask: true
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
	"$CS_FIXER" fix . --dry-run --diff
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
npx eslint "cdn/js/**/*.js" --ignore-pattern "*.min.js"
```

Skip with a note if eslint is not configured or no JS source exists.

## 4. Tests with coverage

First, identify the PHP files that have changed:

```bash
CHANGED=$(mktemp)
trap 'rm -f "$CHANGED"' EXIT
# Staged files (pre-commit); fall back to working-tree if nothing staged
git diff --staged --name-only --diff-filter=AM | grep '\.php$' > "$CHANGED"
if [ ! -s "$CHANGED" ]; then
  git diff --name-only | grep '\.php$' > "$CHANGED"
fi
echo "Changed PHP files:" && cat "$CHANGED"
```

Then run the full suite with coverage:

```bash
php -d pcov.enabled=1 vendor/bin/pest --coverage
```

**Changed-file coverage intersection** — assemble a table from the coverage
output and `git diff` results:

| Changed file | Coverage % | Gate |
|---|---|---|
| `backend/foo.php` | 92% | PASS |
| `backend/bar.php` | 74% | FAIL |

- Gate: **≥ 80% line coverage** on each changed file.
- If a changed file's coverage is below 80%, list the file and the specific
  lines that are driving the number down (from the coverage HTML/report).
- Flag (non-blocking) if overall coverage is below 80% but every changed file
  passes — this means technical debt in untouched files, not a blocker.
- If any test fails, list the failing tests with their messages.

## 5. JS/TS tests

```bash
npm run test:plugin 2>&1 || echo "SKIPPED: test:plugin script not found"
```

Run the Node.js test runner on TS plugin tests. Report PASS if all exit 0,
FAIL with the failing test output, or SKIPPED if the directory is empty or
missing.

## 6. PHP syntax (sanity)

```bash
git diff --staged --name-only --diff-filter=AM | grep '\.php$' | while read f; do php -l "$f"; done
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
