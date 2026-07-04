---
description: Pre-push gate. Runs PHP CS fixer (dry-run), stylelint, eslint, and Pest with coverage (80% gate). Reports all failures grouped by tool before push.
subtask: true
---

Run the project's full pre-push check suite and report failures grouped by
tool. Do not push or commit anything.

## 1. PHP code style

```bash
php-cs-fixer fix . --dry-run --diff
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

```bash
php -d pcov.enabled=1 vendor/bin/pest --coverage
```

- Gate: **≥ 80% line coverage** on changed files.
- If coverage is below 80%, list the uncovered files and the specific lines
  that are dragging the number down.
- If any test fails, list the failing tests with their messages.

## 5. PHP syntax (sanity)

```bash
git diff --staged --name-only --diff-filter=AM | grep '\.php$' | while read f; do php -l "$f"; done
```

Run on staged files; if nothing is staged, run on the working tree's modified
PHP files via `git diff --name-only`.

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
