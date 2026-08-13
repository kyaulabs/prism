---
name: verification-before-completion
description: Use before declaring a task done. Verifies the work is actually complete — re-runs the relevant test or feedback loop, confirms green, confirms no debug instrumentation remains, and confirms the original repro no longer reproduces. Prevents false "done" claims.
derived-from: obra/superpowers (MIT, © Jesse Vincent)
---

# Verification Before Completion

Before declaring a task done, verify it is **actually** done. Agents
frequently claim success without verifying — this skill is the gate that
prevents that.

## Checklist

Run through every item. If any fails, the task is NOT done — go back and
fix it before claiming completion.

### 1. Tests pass

Re-run the focused test command from the active adapter (not from memory —
actually run it). Run the adapter's full suite if the change is cross-cutting.

- [ ] The focused test goes green.
- [ ] The full applicable suite passes.
- [ ] The active adapter's changed-file coverage gate passes, when one exists.
- [ ] No tests that were previously green are now failing.

If no adapter is active, ask which stack applies before inventing test,
coverage, or lint commands.

### 2. Original repro no longer reproduces

If this was a bug fix, re-run the original reproduction from the `debug`
skill's Phase 1 feedback loop:

- [ ] The command that went **red** on the bug now goes **green**.
- [ ] The user's original symptom is gone.

### 3. No debug instrumentation left behind

Search changed source files for temporary debug artifacts and the harness's
`[DEBUG-...]` tags. Use the active adapter's known debug-call list as well as
a repository-wide text search.

- [ ] No `[DEBUG-...]` tagged logs remain.
- [ ] No throwaway prototypes or debug scripts remain in the working tree
      (or they are clearly marked and intentionally retained).
- [ ] No stack-specific debug calls or temporary console logging remain.

### 4. Lint passes

Run every formatter, linter, static check, and generated-asset check required
by the active adapter.

- [ ] Every applicable lint command reports no violations.
- [ ] Inapplicable tools are marked SKIPPED with a reason, not silently omitted.

### 5. Files are well-formed

- [ ] Every new or modified source file follows the active adapter's header,
      modeline, naming, documentation, and indentation rules.
- [ ] No generated files were edited directly; only their sources changed.
- [ ] New dependencies, if any, are explicitly noted and their lockfiles are
      synchronized according to the active adapter.

### 6. No secrets or sensitive data

- [ ] No `.env` files are staged.
- [ ] No hardcoded credentials, API keys, or tokens appear in the diff.
- [ ] No secrets appear in log statements.

## Output

After running through the checklist, report:

```text
## Verification: <task name>

**Tests:** PASS / FAIL / N/A (<commands and result>)
**Coverage:** PASS / FAIL / N/A (<adapter gate and result>)
**Repro:** N/A / PASS (no longer reproduces) / FAIL (still reproduces)
**Debug artifacts:** CLEAN / FOUND (<list>)
**Lint:** PASS / FAIL / N/A (<which tool>)
**File hygiene:** PASS / FAIL (<what is missing>)
**Secrets:** CLEAN / FOUND (<list>)

**Verdict:** VERIFIED / NOT DONE
```

If the verdict is NOT DONE, list exactly what needs to be fixed. Do not claim
the task is complete until every applicable item passes.

## Rules

- Actually run the commands — do not assume the result from memory.
- If a check is not applicable, mark it N/A rather than PASS.
- This skill is the last gate before `/check` and `code-review`. Do not
  shortcut it.
- **Verification vs /check:** This skill is the per-task gate. `/check` is
  the aggregate pre-push gate. Both run because task-level green can rot by
  push time.
- Stack-specific commands live in the active adapter's TDD/check guidance,
  not in this core skill.

## Gotchas

Known failure modes that compound over time. Add entries when this skill
causes a preventable mistake.

- *Claiming "done" from memory without re-running tests* — the whole point
  of this skill is to verify, not assume. Actually run the commands.
- *Forgetting to search for `[DEBUG-]` tags* — debug instrumentation from
  `debug` sessions survives if not explicitly cleaned up. Always search.
- *Guessing a stack command* — if no adapter is active, ask which adapter
  applies rather than declaring an invented command green.
