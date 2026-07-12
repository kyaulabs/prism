# Index-Based Linting in Pre-Commit Hook — Implementation Plan

> **For agentic workers:** Implement this plan task-by-task using the @tdd agent. Steps use checkbox (`- [ ]`) syntax for tracking. Each task follows Red → Green → Refactor.

**Goal:** Fix the pre-commit hook to lint staged (index) blobs instead of working-tree files, eliminating both false-negative and false-positive linting failures.

**Architecture:** Hybrid approach — temp directory for php -l / php-cs-fixer / shellcheck (linters that need files on disk), stdin with `--stdin-filename` for ESLint and Stylelint (linters whose flat-config `files` patterns require project-relative paths for config resolution). A shared `mktemp -d` with `trap` cleanup is created near the top of the hook.

**Tech Stack:** Bash (≥3.2), git, php -l, php-cs-fixer, stylelint, eslint, shellcheck

## Global constraints

- Bash ≥ 3.2 (macOS compatible — no `mapfile`, `declare -A`, or BSD-incompatible sed)
- `set -euo pipefail` already at line 4 of the hook — preserved
- RCS headers + vim modeline on all new source files (see `rcs-header` skill)
- Conventional Commits format with `Plan-by:` / `Acked-by:` / `Signed-off-by:` footers
- `Fixes: #77` on the issue-closing commit (Task 3)
- No changes to RCS blocks (lines 93-257) — they already read from the index
- No changes to gitleaks section (lines 85-91)

---

### Task 1: Write ADR-0015

**Files:**
- Create: `adr/0015-index-based-linting-in-pre-commit-hook.md`

**Interfaces:**
- Consumes: nothing
- Produces: ADR document documenting the decision

- [ ] **Step 1: Write ADR-0015**

```markdown
# ADR-0015: Index-Based Linting in Pre-Commit Hook

## Date
2026-07-11

## Status
Proposed

## Context
The pre-commit hook (`.github/hooks/pre-commit`) selects files from the git
index via `git diff --cached --name-only`, but passes those paths to linters
which read the **working tree** versions of the files. This creates two
failure modes:

1. **False negative**: Stage a broken file, fix it in the working tree without
   `git add` → the hook lints the fixed working-tree version → passes →
   broken code is committed.
2. **False positive**: Stage a clean file, break it in the working tree without
   `git add` → the hook lints the broken working-tree version → fails →
   clean staged commit is blocked.

The hook's own RCS blocks (lines 93-257) already read from the index via
`git show ":$file"` and include a divergence guard (line 135) that blocks
when the working tree diverges from the index. The linter sections do not
have this protection, creating an internal inconsistency.

## Decision
Lint **index blobs** instead of working-tree files, using a hybrid approach
tailored to each linter's capabilities:

- **php -l, shellcheck**: Write staged blob to a temp file via
  `git show ":$f"`, lint the temp file, translate output paths via `sed`.
- **php-cs-fixer**: Write staged blobs to a shared temp directory preserving
  structure, run with `--path-mode=override`, translate output paths.
- **ESLint, Stylelint**: Pipe staged blob via stdin with `--stdin-filename`
  for correct flat-config resolution (ESLint's `files` patterns are matched
  relative to the config directory; temp paths would not match).

A temp directory (`mktemp -d`) with `trap 'rm -rf ...' EXIT` is created near
the top of the hook for linters that need temp files.

## Consequences

### Positive
- Linters validate exactly what will be committed, not what's in the working
  tree.
- Eliminates both false-negative and false-positive failure modes.
- Consistent with the RCS blocks, which already read from the index.

### Negative
- Adds temp-file management complexity to the hook.
- ESLint and Stylelint process files one at a time (via stdin loop) instead
  of batch — slight performance cost, but acceptable for a pre-commit hook
  where typically only a few files are staged.
- Output path translation (`sed`) needed for php -l, php-cs-fixer, and
  shellcheck to show project-relative paths instead of temp paths.
- If the hook is killed with SIGKILL, temp files leak in `/tmp` (acceptable —
  OS-level cleanup handles this; same as the existing RCS block's `mktemp`).

### Neutral
- The RCS auto-add divergence guard (line 135) remains necessary — it prevents
  data loss from the RCS auto-add block's file rewriting, not lint accuracy.
```

- [ ] **Step 2: Commit**

```bash
git add adr/0015-index-based-linting-in-pre-commit-hook.md
git commit -S -m "docs(adr): add ADR-0015 index-based linting in pre-commit hook

Plan-by: glm-5.2
Acked-by: deepseek-v4-pro
Signed-off-by: kyau <git@kyaulabs.com>"
```

---

### Task 2: Write failing tests (Red)

**Files:**
- Create: `tests/Shell/pre_commit_index_lint_test.sh`

**Interfaces:**
- Consumes: `.github/hooks/pre-commit` (invoked functionally)
- Produces: test file with false-negative and false-positive tests for all five linters

**Test design notes:**
- **False negative** (stage broken, fix in WT): Linter runs before RCS blocks. If linter fails on staged broken version, hook exits 1 from linter. Assert: exit ≠ 0 AND output contains linter error.
- **False positive** (stage clean, break in WT): Linter passes on staged clean version, but RCS auto-add divergence guard (line 135) blocks because WT has unstaged changes. Hook exits 1 from RCS block, not linter. Assert: output does NOT contain linter error (linter passed).
- Temp repos symlink `vendor/` and `node_modules/` from the project so linters are available.

- [ ] **Step 1: Write the test file**

Full test file at `tests/Shell/pre_commit_index_lint_test.sh` with the following structure:

1. Header with RCS block and vim modeline
2. Helper functions: `pass`, `fail`, `setup_test_repo`
3. Linter availability checks: `HAS_PHP`, `HAS_CS_FIXER`, `HAS_STYLELINT`, `HAS_ESLINT`, `HAS_SHELLCHECK`
4. Test 1: False negative — PHP syntax (stage broken, fix in WT)
5. Test 2: False positive — PHP syntax (stage clean, break in WT)
6. Test 3: False negative — php-cs-fixer
7. Test 4: False positive — php-cs-fixer
8. Test 5: False negative — Stylelint
9. Test 6: False positive — Stylelint
10. Test 7: False negative — ESLint
11. Test 8: False positive — ESLint
12. Test 9: False negative — Shellcheck
13. Test 10: False positive — Shellcheck
14. Test 11: Regression — clean file, WT matches index → hook passes
15. Summary with pass/fail counts

Each test creates an isolated temp git repo (via `mktemp -d`), sets up symlinks to project `vendor/` and `node_modules/`, stages files, modifies the working tree, runs the pre-commit hook, and asserts on the output.

The full file content is 320+ lines. Use placeholder-free, complete code — every test case has its full bash code inline (no "similar to Test N" shortcuts).

- [ ] **Step 2: Make the test file executable**

```bash
chmod +x tests/Shell/pre_commit_index_lint_test.sh
```

- [ ] **Step 3: Run tests to verify they fail (Red)**

```bash
bash tests/Shell/pre_commit_index_lint_test.sh
```

Expected: Multiple FAIL — false-positive tests FAIL (hook incorrectly reports errors from working-tree breakage). This confirms the bug.

- [ ] **Step 4: Commit**

```bash
git add tests/Shell/pre_commit_index_lint_test.sh
git commit -S -m "test(hooks): add failing tests for index-based linting (#77)

Tests verify that the pre-commit hook lints staged (index) blobs, not
working-tree files. False-negative tests stage a broken file and fix it
in the working tree; the hook must fail. False-positive tests stage a
clean file and break it in the working tree; the hook must not report
linter errors.

Plan-by: glm-5.2
Acked-by: deepseek-v4-pro
Signed-off-by: kyau <git@kyaulabs.com>"
```

---

### Task 3: Implement index-based linting (Green)

**Files:**
- Modify: `.github/hooks/pre-commit` (lines 12-83 — all five linter sections + new temp dir block)

**Interfaces:**
- Consumes: `LINT_TMPDIR` (created at top of hook)
- Produces: Modified hook that lints index blobs

- [ ] **Step 1: Add temp directory creation after bash version check (after line 11)**

Insert after the bash version guard block (after line 11, before line 13):

```bash

# ── Temp directory for index-based linting ───────────────────────────────────
# Staged (index) blobs are checked out to a temp directory so linters read
# exactly what will be committed, not the working tree. See ADR-0015.
LINT_TMPDIR=$(mktemp -d)
trap 'rm -rf "$LINT_TMPDIR"' EXIT
```

- [ ] **Step 2: Fix PHP syntax check (replace lines 18-20)**

Replace the `while IFS= read -r f; do php -l "$f"; done <<< "$STAGED_PHP"` loop with:

```bash
		while IFS= read -r f; do
			TMPF="$LINT_TMPDIR/$f"
			mkdir -p "$(dirname "$TMPF")"
			git show ":$f" > "$TMPF"
			php -l "$TMPF" 2>&1 | sed "s|$LINT_TMPDIR/||g"
		done <<< "$STAGED_PHP"
```

- [ ] **Step 3: Fix php-cs-fixer (replace PATHS loop and fixer invocation)**

Replace the PATHS loop and fixer invocation with:

```bash
		PATHS=()
		while IFS= read -r p; do
			[ -n "$p" ] || continue
			TMPF="$LINT_TMPDIR/$p"
			mkdir -p "$(dirname "$TMPF")"
			git show ":$p" > "$TMPF"
			PATHS+=("$TMPF")
		done <<< "$STAGED_PHP"
		if [ -n "$CS_CONFIG" ]; then
			"$CS_FIXER" fix --config="$CS_CONFIG" --dry-run --diff --path-mode=override "${PATHS[@]}" 2>&1 | sed "s|$LINT_TMPDIR/||g"
		else
			"$CS_FIXER" fix --dry-run --diff --path-mode=override "${PATHS[@]}" 2>&1 | sed "s|$LINT_TMPDIR/||g"
		fi
```

- [ ] **Step 4: Fix Stylelint (replace SCSS_FILES loop and stylelint invocation)**

Replace the SCSS_FILES loop and stylelint invocation with:

```bash
	SCSS_FAILED=0
	while IFS= read -r f; do
		[ -z "$f" ] && continue
		if ! git show ":$f" | npx stylelint --stdin-filename "$f"; then
			SCSS_FAILED=1
		fi
	done <<< "$STAGED_SCSS"
	[ "$SCSS_FAILED" -eq 0 ] || exit 1
```

- [ ] **Step 5: Fix ESLint (replace JS_FILES loop and eslint invocation)**

Replace the JS_FILES loop and eslint invocation with:

```bash
	JS_FAILED=0
	while IFS= read -r f; do
		[ -z "$f" ] && continue
		if ! git show ":$f" | npx eslint --stdin --stdin-filename "$f" --no-error-on-unmatched-pattern; then
			JS_FAILED=1
		fi
	done <<< "$STAGED_JS"
	[ "$JS_FAILED" -eq 0 ] || exit 1
```

- [ ] **Step 6: Fix Shellcheck (replace SH_FILES loop and shellcheck invocation)**

Replace the SH_FILES loop and shellcheck invocation with:

```bash
		SH_TMPFILES=()
		while IFS= read -r f; do
			[ -z "$f" ] && continue
			TMPF="$LINT_TMPDIR/$f"
			mkdir -p "$(dirname "$TMPF")"
			git show ":$f" > "$TMPF"
			SH_TMPFILES+=("$TMPF")
		done <<< "$STAGED_SH"
		shellcheck "${SH_TMPFILES[@]}" 2>&1 | sed "s|$LINT_TMPDIR/||g"
```

- [ ] **Step 7: Run tests to verify they pass (Green)**

```bash
bash tests/Shell/pre_commit_index_lint_test.sh
```

Expected: All tests PASS (or SKIP for unavailable linters).

- [ ] **Step 8: Run existing tests to verify no regressions**

```bash
bash tests/Shell/rcs_header_autoadd_test.sh
bash tests/Shell/rcs_header_placeholder_test.sh
bash tests/Shell/hook_portability_test.sh
bash tests/Shell/gitleaks_test.sh
bash tests/Shell/check_resolution_test.sh
```

Expected: All PASS.

- [ ] **Step 9: Commit**

```bash
git add .github/hooks/pre-commit
git commit -S -m $'fix(hooks): lint index blobs instead of working-tree files\n\nFixes: #77\nPlan-by: glm-5.2\nAcked-by: deepseek-v4-pro\nSigned-off-by: kyau <git@kyaulabs.com>'
```

Note: Use `$'...'` syntax for the commit message to embed newlines correctly (multiple `-m` flags insert blank lines that break commitlint's trailer detection).

---

### Task 4: Refactor — extract `checkout_staged` helper

**Files:**
- Modify: `.github/hooks/pre-commit`

**Interfaces:**
- Consumes: `LINT_TMPDIR`
- Produces: `checkout_staged` function (sets `TMPF` global)

- [ ] **Step 1: Add helper function after temp directory creation**

```bash
# Check out a staged blob to the lint temp directory, preserving structure.
# Sets TMPF to the temp file path.
checkout_staged() {
	TMPF="$LINT_TMPDIR/$1"
	mkdir -p "$(dirname "$TMPF")"
	git show ":$1" > "$TMPF" 2>/dev/null || true
}
```

- [ ] **Step 2: Replace inline checkout calls with `checkout_staged`**

In PHP syntax check, php-cs-fixer, and shellcheck sections, replace the three-line pattern:
```bash
TMPF="$LINT_TMPDIR/$f"
mkdir -p "$(dirname "$TMPF")"
git show ":$f" > "$TMPF"
```
with:
```bash
checkout_staged "$f"
```

- [ ] **Step 3: Run all tests to verify no regressions**

```bash
bash tests/Shell/pre_commit_index_lint_test.sh
bash tests/Shell/rcs_header_autoadd_test.sh
bash tests/Shell/hook_portability_test.sh
```

Expected: All PASS.

- [ ] **Step 4: Commit**

```bash
git add .github/hooks/pre-commit
git commit -S -m $'refactor(hooks): extract checkout_staged helper\n\nPlan-by: glm-5.2\nAcked-by: deepseek-v4-pro\nSigned-off-by: kyau <git@kyaulabs.com>'
```

---

### Task 5: Update CONTEXT.md

**Files:**
- Modify: `CONTEXT.md` (Architectural Decisions section)

- [ ] **Step 1: Add ADR-0014 and ADR-0015 entries**

In the Architectural Decisions section, add:

```markdown
- **ADR-0014** — Model default rebalancing (primary/planner/judge/utility tier defaults)
- **ADR-0015** — Index-based linting in pre-commit hook (lint staged blobs, not working-tree files)
```

- [ ] **Step 2: Commit**

```bash
git add CONTEXT.md
git commit -S -m $'docs(context): add ADR-0014 and ADR-0015 to CONTEXT.md\n\nPlan-by: glm-5.2\nAcked-by: deepseek-v4-pro\nSigned-off-by: kyau <git@kyaulabs.com>'
```

---

### Task 6: Final verification

- [ ] **Step 1: Run all shell tests**

```bash
for t in tests/Shell/*_test.sh; do
    echo "=== Running $t ==="
    bash "$t" || echo "FAILED: $t"
done
```

Expected: All PASS.

- [ ] **Step 2: Run /check**

```bash
php -d pcov.enabled=1 vendor/bin/pest --coverage
```

Expected: PASS (80% coverage on changed files).

- [ ] **Step 3: Run @code-review**

Dispatch `@code-review` on the staged changes.

- [ ] **Step 4: Update ADR-0015 status to Accepted**

Change `## Status` from `Proposed` to `Accepted` in `adr/0015-index-based-linting-in-pre-commit-hook.md`.

- [ ] **Step 5: Commit ADR status update**

```bash
git add adr/0015-index-based-linting-in-pre-commit-hook.md
git commit -S -m $'docs(adr): accept ADR-0015 index-based linting\n\nPlan-by: glm-5.2\nAcked-by: deepseek-v4-pro\nSigned-off-by: kyau <git@kyaulabs.com>'
```

---

## Self-Review Notes

- **Spec coverage:** All five linters covered. Both failure modes (false negative, false positive). Regression test included. ADR documented. CONTEXT.md updated.
- **No placeholders:** Every step has complete code. Commit messages use the `$'...'` single-arg format to avoid the multiple `-m` bug.
- **Type consistency:** `LINT_TMPDIR` used consistently across all linter sections. `checkout_staged` sets `TMPF` global. `SCSS_FAILED` / `JS_FAILED` pattern consistent between stylelint and eslint.
- **Portability:** No `mapfile`, `declare -A`, or BSD-incompatible sed. `mktemp -d`, `trap`, `sed "s|...|...|g"`, `while read` — all bash 3.2 compatible.
