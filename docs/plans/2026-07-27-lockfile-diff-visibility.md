# Lockfile Diff Visibility Implementation Plan

> **For agentic workers:** Implement this plan task-by-task using the @tdd
> agent. Steps use checkbox (`- [ ]`) syntax for tracking. Each task follows
> Red → Green → Refactor.

**Goal:** Make changes to `composer.lock` and `package-lock.json` render as textual Git and GitHub diffs for issue #219.

**Architecture:** Remove only the two lockfile-specific `-diff` attributes and their obsolete comment from the repository-root `.gitattributes`. Preserve all line-ending, binary-file, and generated-file attributes; validate the result through Git's attribute resolution and a reversible lockfile perturbation.

**Tech Stack:** Git attributes, Git CLI, Bash

## Global constraints

- Do not change the final contents of `composer.lock` or `package-lock.json`.
- Do not add dependencies or alter application, build, audit, hook, or CI behavior.
- Preserve the existing `* text=auto eol=lf`, image `binary`, and asset `linguist-generated` rules.
- No permanent test file is warranted for this repository-presentation-only change; use the Red/Green Git checks below.
- Run `/check` and request `@code-review` as separate manual gates after implementation.

---

### Task 1: Restore textual lockfile diffs

**Files:**
- Modify: `.gitattributes:16-18`
- Test: no permanent test file; validate with `git check-attr` and reversible `git diff` checks

**Interfaces:**
- Consumes: Git's `diff` attribute resolution for `composer.lock` and `package-lock.json`
- Produces: an unspecified `diff` attribute for both lockfiles, allowing Git's normal text-diff detection

- [ ] **Step 1: Run the failing attribute check**

```bash
attrs=$(git check-attr diff -- composer.lock package-lock.json)
printf '%s\n' "$attrs"
if printf '%s\n' "$attrs" | grep -q 'diff: unset'; then
    exit 1
fi
```

Expected: FAIL with exit status 1; both lockfiles report `diff: unset` because `-diff` is active.

- [ ] **Step 2: Remove the lockfile diff suppression**

Delete this complete block from `.gitattributes`:

```gitattributes
# Reduce lockfile diff noise
composer.lock -diff
package-lock.json -diff
```

The file must then end with:

```gitattributes
# Mark generated files
cdn/css/**/*.min.css linguist-generated
cdn/javascript/**/*.min.js linguist-generated
```

- [ ] **Step 3: Run the passing attribute check**

```bash
attrs=$(git check-attr diff -- composer.lock package-lock.json)
printf '%s\n' "$attrs"
if printf '%s\n' "$attrs" | grep -q 'diff: unset'; then
    exit 1
fi
```

Expected: PASS with exit status 0; both lockfiles report `diff: unspecified`.

- [ ] **Step 4: Verify textual diffs without retaining lockfile changes**

```bash
for lockfile in composer.lock package-lock.json; do
    git diff --quiet -- "$lockfile" || {
        printf 'Refusing to overwrite an existing change in %s\n' "$lockfile" >&2
        exit 1
    }

    (
        backup=$(mktemp)
        cp "$lockfile" "$backup"
        trap 'cp "$backup" "$lockfile"; rm -f "$backup"' EXIT
        printf '\n' >> "$lockfile"
        diff_output=$(git diff -- "$lockfile")
        printf '%s\n' "$diff_output"
        printf '%s\n' "$diff_output" | grep -q '^@@ '
        ! printf '%s\n' "$diff_output" | grep -q '^Binary files '
    )

    git diff --quiet -- "$lockfile"
done
```

Expected: PASS; each temporary change displays a unified text hunk beginning with `@@`, no `Binary files ... differ` line appears, and both lockfiles are restored exactly.

- [ ] **Step 5: Review the final repository diff**

```bash
git diff -- .gitattributes composer.lock package-lock.json
```

Expected: only the three deleted `.gitattributes` lines appear; neither lockfile has a retained content change.

- [ ] **Step 6: Run the manual quality gates**

Run `/check`, then request `@code-review`.

Expected: all checks pass and review finds no unintended changes.
