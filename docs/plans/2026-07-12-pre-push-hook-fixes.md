# $KYAULabs: 2026-07-12-pre-push-hook-fixes.md kyau 2026/07/12 -0700 Exp $

# Pre-Push Hook Bug Fixes Implementation Plan

> **For agentic workers:** Implement this plan task-by-task using the @tdd
> agent. Steps use checkbox (`- [ ]`) syntax for tracking. Each task follows
> Red → Green → Refactor.

**Goal:** Fix three bugs in `.github/hooks/pre-push` (tag pushes not skipped, SHA-256 zero OID mismatch, unsanitized commit subjects) and add regression tests for each.

**Architecture:** The pre-push hook is a bash script that reads stdin lines (`local_ref local_oid _ remote_oid`) and applies two gates: a hard non-fast-forward block and a soft no-squash warning. All three fixes are localized to this single file plus its test file. No new files, no new dependencies, no architectural changes.

**Tech Stack:** Bash, git plumbing, shell test harness (`tests/Shell/pre-push_test.sh`)

## Global constraints

- Shell: bash (`#!/usr/bin/env bash`), `set -euo pipefail`
- Indentation: tabs, tab-stop 4 (per `conventions.md`)
- RCS header + vim modeline on all modified files
- Signed commits (`git commit -S`)
- Commit footers: `Plan-by: glm-5.2`, `Acked-by: deepseek-v4-pro`, `Signed-off-by: kyau <git@kyaulabs.com>`
- Existing 4 tests must remain green after each task (regression safety net)
- Run full test suite after each task: `bash tests/Shell/pre-push_test.sh`

---

## File Structure

| File | Action | Responsibility |
|------|--------|----------------|
| `.github/hooks/pre-push` | Modify | Add `is_zero_oid()` helper, tag skip, zero-OID pattern match, control char stripping |
| `tests/Shell/pre-push_test.sh` | Modify | Add Tests 5–7 (tag skip, SHA-256 zero OID, control char sanitization) |

No new files. No new dependencies.

---

### Task 1: Tag Push Skip

**Files:**
- Modify: `.github/hooks/pre-push:15-17` (the `while read` loop entry + skip check)
- Modify: `tests/Shell/pre-push_test.sh` (add Test 5 after Test 4)

**Interfaces:**
- Consumes: stdin line format `local_ref local_oid _ remote_oid` (git pre-push protocol)
- Produces: tag pushes (`refs/tags/*`) are skipped via `continue` before any gate logic

- [ ] **Step 1: Write the failing test**

Add this test block to `tests/Shell/pre-push_test.sh`, after the Test 4 block (before the `# ── Summary` section):

```bash
# ── Test 5: Tag push is skipped (no warning, no block) ────────────────────

echo ""
echo "── Test 5: Tag push — skipped (no warning, no block) ──"
T5=$(mktemp -d)
TEMP_DIRS="$TEMP_DIRS $T5"
(
    cd "$T5"
    git init --quiet
    git config commit.gpgsign false
    git config user.email "test@example.com"
    git config user.name "Test User"

    # Single commit, tag it
    echo "base" > base.txt
    git add base.txt
    git commit --quiet -m "base commit"
    TAG_OID=$(git rev-parse HEAD)

    # Push the tag — should be skipped entirely (no BLOCKED, no Single-commit)
    set +e
    output=$(echo "refs/tags/v1.0 $TAG_OID refs/tags/v1.0 $ZERO_OID" | bash "$REAL_HOOK" 2>&1)
    ret=$?
    set -e

    if [ "$ret" -eq 0 ] && ! echo "$output" | grep -qi 'Single-commit\|BLOCKED'; then
        pass "Tag push skipped (exit $ret)"
    else
        fail "Tag push not skipped (exit=$ret): $output"
    fi
)
rm -rf "$T5"
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bash tests/Shell/pre-push_test.sh`
Expected: Test 5 FAILS — tag push triggers the no-squash warning (single commit) because tags are not skipped. Output contains `Single-commit`. Exit code of the test script is 1.

- [ ] **Step 3: Write minimal implementation**

In `.github/hooks/pre-push`, replace the comment and `if` block at lines 15–17:

**Current code (lines 15–17):**
```bash
	# Skip tag pushes and branch deletions
	if [ -z "$local_oid" ] || [ "$local_oid" = "0000000000000000000000000000000000000000" ]; then
		continue
	fi
```

**Replace with:**
```bash
	# Skip tag pushes — tags are not branches and should not trigger
	# history-protection or no-squash checks.
	case "$local_ref" in
		refs/tags/*) continue ;;
	esac

	# Skip branch deletions (zero or empty local OID).
	if [ -z "$local_oid" ] || [ "$local_oid" = "0000000000000000000000000000000000000000" ]; then
		continue
	fi
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bash tests/Shell/pre-push_test.sh`
Expected: All 5 tests PASS (0 failures). Test 5 passes because `refs/tags/v1.0` matches `refs/tags/*` and hits `continue` before any gate logic.

- [ ] **Step 5: Commit**

```bash
git add .github/hooks/pre-push tests/Shell/pre-push_test.sh
git commit -S -m "fix(pre-push): skip tag pushes before history-protection gates

Tags are not branches and should not trigger the non-fast-forward block
or no-squash warning. The 'Skip tag pushes' comment was false — tags
flowed through with a real OID and could hit the non-FF wall with a
mangled branch name (refs/tags/* not stripped by refs/heads/ prefix
removal).

Add Test 5: tag push is skipped (no BLOCKED, no Single-commit).

Refs: #80

Plan-by: glm-5.2
Acked-by: deepseek-v4-pro
Signed-off-by: kyau <git@kyaulabs.com>"
```

---

### Task 2: SHA-256 Zero OID Pattern Match

**Files:**
- Modify: `.github/hooks/pre-push` — add `is_zero_oid()` helper after color vars; replace 3 literal comparisons
- Modify: `tests/Shell/pre-push_test.sh` (add Test 6 after Test 5)

**Interfaces:**
- Consumes: `is_zero_oid()` — returns 0 (true) if arg is empty or all-zeros (any length)
- Produces: SHA-1 (40 zeros) and SHA-256 (64 zeros) OIDs both recognized as zero/deletion

- [ ] **Step 1: Write the failing test**

Add this test block to `tests/Shell/pre-push_test.sh`, after the Test 5 block:

```bash
# ── Test 6: SHA-256 zero OID (64 zeros) recognized as zero ───────────────

echo ""
echo "── Test 6: SHA-256 zero OID — recognized as zero ──"
T6=$(mktemp -d)
TEMP_DIRS="$TEMP_DIRS $T6"
(
    cd "$T6"
    git init --quiet
    git config commit.gpgsign false
    git config user.email "test@example.com"
    git config user.name "Test User"

    # Single commit
    echo "base" > base.txt
    git add base.txt
    git commit --quiet -m "base commit"
    LOCAL_OID=$(git rev-parse HEAD)

    ZERO_OID_256="0000000000000000000000000000000000000000000000000000000000000000"

    # Push with 64-zero remote_oid — should be treated as new branch
    # (skip non-FF check), not crash on merge-base with invalid OID.
    set +e
    output=$(echo "refs/heads/main $LOCAL_OID refs/heads/main $ZERO_OID_256" | bash "$REAL_HOOK" 2>&1)
    ret=$?
    set -e

    if [ "$ret" -eq 0 ] && ! echo "$output" | grep -qi 'BLOCKED'; then
        pass "SHA-256 zero remote_oid handled gracefully (exit $ret)"
    else
        fail "SHA-256 zero remote_oid not handled (exit=$ret): $output"
    fi
)
rm -rf "$T6"
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bash tests/Shell/pre-push_test.sh`
Expected: Test 6 FAILS — the 64-zero `remote_oid` does not match the 40-zero literal, so the non-FF check runs `git merge-base --is-ancestor` with an invalid OID, which fails, triggering the BLOCKED message and exit 1.

- [ ] **Step 3: Write minimal implementation**

In `.github/hooks/pre-push`, make two changes:

**Change A:** Add the `is_zero_oid()` helper function after the color variable definitions (after `RESET=$'\033[0m'`, before the `while read` loop):

```bash
# Returns 0 (true) if $1 is empty or all zeros (deletion or new ref).
# Works with both SHA-1 (40 zeros) and SHA-256 (64 zeros) OIDs.
is_zero_oid() {
	case "$1" in
		*[!0]*) return 1 ;;
		*) return 0 ;;
	esac
}
```

**Change B:** Replace all three literal zero-OID comparisons. The hook currently has three occurrences of `0000000000000000000000000000000000000000`:

1. **Deletion skip:**
   Replace:
   ```bash
   	if [ -z "$local_oid" ] || [ "$local_oid" = "0000000000000000000000000000000000000000" ]; then
   ```
   With:
   ```bash
   	if is_zero_oid "$local_oid"; then
   ```

2. **Non-FF check condition:**
   Replace:
   ```bash
   	if [ -n "$remote_oid" ] && [ "$remote_oid" != "0000000000000000000000000000000000000000" ]; then
   ```
   With:
   ```bash
   	if [ -n "$remote_oid" ] && ! is_zero_oid "$remote_oid"; then
   ```

3. **No-squash check condition:**
   Replace:
   ```bash
   	if [ -z "$remote_oid" ] || [ "$remote_oid" = "0000000000000000000000000000000000000000" ]; then
   ```
   With:
   ```bash
   	if [ -z "$remote_oid" ] || is_zero_oid "$remote_oid"; then
   ```

- [ ] **Step 4: Run test to verify it passes**

Run: `bash tests/Shell/pre-push_test.sh`
Expected: All 6 tests PASS (0 failures). Test 6 passes because `is_zero_oid` recognizes 64 zeros as zero, skipping the non-FF check.

- [ ] **Step 5: Commit**

```bash
git add .github/hooks/pre-push tests/Shell/pre-push_test.sh
git commit -S -m "fix(pre-push): use pattern match for zero OID to support SHA-256 repos

The literal 40-zero constant (SHA-1 length) fails comparison against
64-zero OIDs in SHA-256 repos, causing new-branch and deletion pushes
to flow through to the non-FF gate and crash on merge-base with an
invalid OID.

Add is_zero_oid() helper using a case pattern (*[!0]*) that matches
all-zeros of any length. Replace all three literal comparisons.

Add Test 6: 64-zero remote_oid is recognized as zero (no BLOCKED).

Refs: #80

Plan-by: glm-5.2
Acked-by: deepseek-v4-pro
Signed-off-by: kyau <git@kyaulabs.com>"
```

---

### Task 3: Control Character Sanitization

**Files:**
- Modify: `.github/hooks/pre-push` — the `commit_msg=` line in the no-squash check
- Modify: `tests/Shell/pre-push_test.sh` (add Test 7 after Test 6)

**Interfaces:**
- Consumes: `git log -1 --format=%s` output (raw commit subject)
- Produces: sanitized commit subject with all C0 control characters (0x00–0x1F) stripped

- [ ] **Step 1: Write the failing test**

Add this test block to `tests/Shell/pre-push_test.sh`, after the Test 6 block:

```bash
# ── Test 7: Control chars stripped from echoed commit subject ─────────────

echo ""
echo "── Test 7: Control chars stripped from commit subject ──"
T7=$(mktemp -d)
TEMP_DIRS="$TEMP_DIRS $T7"
(
    cd "$T7"
    git init --quiet
    git config commit.gpgsign false
    git config user.email "test@example.com"
    git config user.name "Test User"

    # Base commit on main, simulate pushed
    echo "base" > base.txt
    git add base.txt
    git commit --quiet -m "base commit"
    BASE_OID=$(git rev-parse HEAD)
    simulate_pushed origin main "$BASE_OID"

    # New branch with 1 commit whose subject contains ANSI escape sequences
    git checkout --quiet -b feat/test-user-abc7-feature
    echo "change" > change.txt
    git add change.txt
    git commit --quiet -m "$(printf 'feat: \033[1;31mred\033[0m text')"
    LOCAL_OID=$(git rev-parse HEAD)

    set +e
    output=$(echo "refs/heads/feat/test-user-abc7-feature $LOCAL_OID refs/heads/feat/test-user-abc7-feature $ZERO_OID" | bash "$REAL_HOOK" 2>&1)
    ret=$?
    set -e

    # Warning should fire (single commit) but no raw ESC (0x1B) in output
    if [ "$ret" -eq 0 ] \
       && echo "$output" | grep -qi 'Single-commit' \
       && ! printf '%s' "$output" | grep -q $'\033'; then
        pass "Control chars stripped from commit subject (exit $ret)"
    else
        fail "Control chars not stripped or warning missing (exit=$ret): $output"
    fi
)
rm -rf "$T7"
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bash tests/Shell/pre-push_test.sh`
Expected: Test 7 FAILS — the commit subject contains ESC characters (`\033[1;31m`, `\033[0m`) which are echoed verbatim to stderr. `grep -q $'\033'` finds the ESC byte, so `! grep` fails the assertion.

- [ ] **Step 3: Write minimal implementation**

In `.github/hooks/pre-push`, find the `commit_msg=` line in the no-squash check:

**Current code:**
```bash
		commit_msg=$(git log -1 --format=%s "$local_oid")
```

**Replace with:**
```bash
		commit_msg=$(git log -1 --format=%s "$local_oid" | tr -d '\000-\037')
```

`tr -d '\000-\037'` strips all bytes in the C0 control character range (NUL through US, 0x00–0x1F), which includes ESC (0x1B), BEL (0x07), BS (0x08), and all other non-printable characters that could be used for terminal injection.

- [ ] **Step 4: Run test to verify it passes**

Run: `bash tests/Shell/pre-push_test.sh`
Expected: All 7 tests PASS (0 failures). Test 7 passes because `tr -d '\000-\037'` strips the ESC bytes from the commit subject before it is echoed in the heredoc.

- [ ] **Step 5: Commit**

```bash
git add .github/hooks/pre-push tests/Shell/pre-push_test.sh
git commit -S -m "fix(pre-push): strip control characters from echoed commit subjects

Commit subjects captured via 'git log -1 --format=%s' were echoed
verbatim to stderr in the no-squash warning heredoc. A malicious or
accidental subject containing ANSI escape sequences (ESC, BEL, etc.)
could inject terminal control codes.

Pipe through 'tr -d \"\\000-\\037\"' to strip all C0 control
characters (0x00-0x1F) before output.

Add Test 7: commit subject with ANSI escapes is stripped (no ESC in
output, warning still fires).

Fixes: #80

Plan-by: glm-5.2
Acked-by: deepseek-v4-pro
Signed-off-by: kyau <git@kyaulabs.com>"
```

---

## Post-Implementation Verification

After all 3 tasks are complete:

1. **Run full shell test suite:** `bash tests/Shell/pre-push_test.sh` — expect 7/7 PASS
2. **Run shellcheck on the hook:** `shellcheck .github/hooks/pre-push` — expect clean
3. **Run shellcheck on the test file:** `shellcheck tests/Shell/pre-push_test.sh` — expect clean
4. **Run `/check` gate** (php-cs-fixer + stylelint + eslint + pest --coverage)
5. **Run `@code-review`** on the staged changes before push

## Self-Review

- **Spec coverage:** Issue #80 lists 4 problems. Problem 1 (no tests) → addressed by Tests 5–7 + existing Tests 1–4. Problem 2 (tag skip) → Task 1. Problem 3 (SHA-256) → Task 2. Problem 4 (control chars) → Task 3. All covered. ✓
- **Placeholder scan:** No TBD, TODO, or "add error handling" anywhere. All code blocks contain actual implementation. ✓
- **Type consistency:** `is_zero_oid()` is defined in Task 2 and used in 3 locations within the same task. No cross-task type dependencies. ✓

# vim: ft=markdown sts=4 sw=4 ts=4 et :
