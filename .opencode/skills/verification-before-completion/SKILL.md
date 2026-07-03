---
name: verification-before-completion
description: Use before declaring a task done. Verifies the work is actually complete — re-runs the relevant test/loop, confirms green, confirms no debug instrumentation remains, confirms the original repro no longer reproduces. Prevents false "done" claims.
---

# Verification Before Completion

Before declaring a task done, verify it is **actually** done. Agents
frequently claim success without verifying — this skill is the gate that
prevents that.

## Checklist

Run through every item. If any fails, the task is NOT done — go back and
fix it before claiming completion.

### 1. Tests pass

Re-run the relevant test suite (not from memory — actually run it):

```bash
php vendor/bin/pest --filter <TestName>
```

Or the full suite if the change is cross-cutting:

```bash
php vendor/bin/pest --coverage
```

- [ ] All tests pass (green).
- [ ] Coverage for the changed files is ≥ 80%.
- [ ] No new tests are failing that were passing before.

### 2. Original repro no longer reproduces

If this was a bug fix, re-run the original reproduction from the `@debug`
agent's Phase 1 feedback loop:

- [ ] The command that went **red** on the bug now goes **green**.
- [ ] The user's original symptom is gone.

### 3. No debug instrumentation left behind

Search for temporary debug artifacts:

```bash
grep -rn '\[DEBUG-' . --include='*.php' --include='*.js' --include='*.scss'
```

- [ ] No `[DEBUG-...]` tagged logs remain.
- [ ] No throwaway prototypes or debug scripts remain in the working tree
      (or they're clearly marked and in a debug location).
- [ ] No `dd()`, `dump()`, `var_dump()`, `print_r()`, or `console.log()`
      left in the code.

### 4. Lint passes

```bash
php-cs-fixer fix . --dry-run --diff
npx stylelint "cdn/sass/**/*.scss"
npx eslint "cdn/js/**/*.js" --ignore-pattern "*.min.js"
```

- [ ] PHP CS Fixer reports no violations.
- [ ] Stylelint reports no violations (or SKIPPED with reason).
- [ ] ESLint reports no violations (or SKIPPED with reason).

### 5. Files are well-formed

- [ ] Every new or modified source file has an RCS header at the top (see
      `rcs-header` skill).
- [ ] Every new or modified source file has a vim modeline at the end.
- [ ] PHP classes/methods/functions have PHPDoc (PSR-5).
- [ ] No generated files (`cdn/css/*.min.css`, `cdn/javascript/*.min.js`)
      were edited directly — only their sources.

### 6. No secrets or sensitive data

- [ ] No `.env` files staged.
- [ ] No hardcoded credentials, API keys, or tokens in the diff.
- [ ] No secrets in log statements.

## Output

After running through the checklist, report:

```text
## Verification: <task name>

**Tests:** PASS / FAIL (<N> tests, <coverage>% coverage)
**Repro:** N/A / PASS (no longer reproduces) / FAIL (still reproduces)
**Debug artifacts:** CLEAN / FOUND (<list>)
**Lint:** PASS / FAIL (<which tool>)
**File hygiene:** PASS / FAIL (<what's missing>)
**Secrets:** CLEAN / FOUND (<list>)

**Verdict:** VERIFIED / NOT DONE
```

If the verdict is NOT DONE, list exactly what needs to be fixed. Do not claim
the task is complete until every item passes.

## Rules

- Actually run the commands — do not assume the result from memory.
- If a check is not applicable (e.g. no SCSS changed), mark it N/A rather
  than PASS.
- This skill is the last gate before `/check` and `@code-review`. Don't
  shortcut it.

## Gotchas

Known failure modes that compound over time. Add entries when this skill
causes a preventable mistake.

- *Claiming "done" from memory without re-running tests* — the whole point
  of this skill is to verify, not assume. Actually run the commands.
- *Forgetting to grep for `[DEBUG-]` tags* — debug instrumentation from
  `@debug` sessions survives if not explicitly cleaned up. Always grep.
