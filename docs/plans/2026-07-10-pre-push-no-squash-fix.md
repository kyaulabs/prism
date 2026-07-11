# Pre-Push No-Squash Heuristic Fix — Implementation Plan

> **For agentic workers:** Implement this plan task-by-task using the @tdd
> agent. Steps use checkbox (`- [ ]`) syntax for tracking. Each task follows
> Red → Green → Refactor.

**Goal:** Fix the pre-push hook's no-squash heuristic so it correctly warns on squashed new branches and stops false-positiving on incremental pushes to existing branches.

**Architecture:** The non-fast-forward hard gate (lines 21-47) already blocks force-pushes. By the time execution reaches the no-squash check, an existing branch is guaranteed to be a fast-forward (incremental) push. So the no-squash warning should only apply to NEW branches, counting commits unique to the branch via `git rev-list --count "$local_oid" --not --remotes`.

**Tech Stack:** Bash (git hooks), shell test suite (`tests/Shell/*_test.sh` pattern)

**Issue:** Fixes #74

## Global constraints

- Bash hooks use tabs (tab-stop 4), vim modeline `ft=sh sts=4 sw=4 ts=4 et`
- Shell tests use `set -euo pipefail`, `RESULT_FILE`/`pass()`/`fail()` pattern, subshell-per-test, `mktemp -d` sandboxes
- RCS header on all new source files: `# $KYAULabs: <filename> <creator>@<host> YYYY/MM/DD -0700 Exp $`
- Signed commits (`git commit -S`), Conventional Commits format with `Plan-by`/`Acked-by`/`Signed-off-by` footers
- Issue-closing reference: `Fixes: #74` (top of footer, above `Plan-by`)

---

## File structure

| File | Action | Responsibility |
|---|---|---|
| `.github/hooks/pre-push` | Modify (lines 49-58) | Fix the no-squash range calculation |
| `tests/Shell/pre-push_test.sh` | Create | 4 tests covering acceptance criteria + non-ff regression |
| `.opencode/skills/opencode-docs/docs/*.mdx` | Regenerate | Refresh vendored opencode docs (separate commit) |

---

### Task 1: Create the test file (Red)

**Files:**
- Create: `tests/Shell/pre-push_test.sh`

**Interfaces:**
- Consumes: `.github/hooks/pre-push` (the real hook, invoked via pipe in temp repos)
- Produces: `tests/Shell/pre-push_test.sh` (standalone bash test, invoked by `/check`)

- [ ] **Step 1: Write the test file**

Create `tests/Shell/pre-push_test.sh` with this complete content:

```bash
#!/usr/bin/env bash
# $KYAULabs: pre-push_test.sh kyau@nova 2026/07/10 -0700 Exp $

# Tests for the pre-push hook's no-squash heuristic and non-fast-forward gate.
# Covers the three acceptance criteria from issue #74:
#   1. Squashed new branch warns
#   2. N-commit new branch doesn't warn
#   3. Incremental push to existing branch doesn't warn
# Plus a regression test for the non-fast-forward hard gate.

set -euo pipefail

RESULT_FILE=$(mktemp)
TEMP_DIRS=""
trap 'rm -f "$RESULT_FILE"; [ -n "$TEMP_DIRS" ] && rm -rf $TEMP_DIRS' EXIT

RED=$'\033[1;31m'
GREEN=$'\033[1;32m'
RESET=$'\033[0m'

pass() { echo "  ${GREEN}PASS${RESET} $*"; echo "PASS" >> "$RESULT_FILE"; }
fail() { echo "  ${RED}FAIL${RESET} $*" >&2; echo "FAIL" >> "$RESULT_FILE"; }

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
REAL_HOOK="$REPO_ROOT/.github/hooks/pre-push"

if [ ! -f "$REAL_HOOK" ]; then
    fail "Cannot find pre-push at $REAL_HOOK"
    exit 1
fi

ZERO_OID="0000000000000000000000000000000000000000"

# Helper: simulate a branch being pushed by creating a remote-tracking ref
simulate_pushed() {
    local remote="$1" branch="$2" oid="$3"
    git update-ref "refs/remotes/$remote/$branch" "$oid"
}

# ── Test 1: New branch with 1 commit (squash scenario) warns ─────────────

echo ""
echo "── Test 1: New branch, 1 commit — squash warning fires ──"
T1=$(mktemp -d)
TEMP_DIRS="$TEMP_DIRS $T1"
(
    cd "$T1"
    git init --quiet
    git config user.email "test@example.com"
    git config user.name "Test User"

    # Base commit on main, simulate pushed to origin
    echo "base" > base.txt
    git add base.txt
    git commit --quiet -m "base commit"
    BASE_OID=$(git rev-parse HEAD)
    simulate_pushed origin main "$BASE_OID"

    # New branch with 1 commit (squash scenario)
    git checkout --quiet -b feat/test-user-abc1-feature
    echo "change" > change.txt
    git add change.txt
    git commit --quiet -m "feat: add change"
    LOCAL_OID=$(git rev-parse HEAD)

    set +e
    output=$(echo "refs/heads/feat/test-user-abc1-feature $LOCAL_OID refs/heads/feat/test-user-abc1-feature $ZERO_OID" | bash "$REAL_HOOK" 2>&1)
    ret=$?
    set -e

    if [ "$ret" -eq 0 ] && echo "$output" | grep -qi 'Single-commit'; then
        pass "Squashed new branch warns (exit $ret)"
    else
        fail "Squashed new branch did not warn (exit=$ret): $output"
    fi
)
rm -rf "$T1"

# ── Test 2: New branch with 3 commits does not warn ───────────────────────

echo ""
echo "── Test 2: New branch, 3 commits — no warning ──"
T2=$(mktemp -d)
TEMP_DIRS="$TEMP_DIRS $T2"
(
    cd "$T2"
    git init --quiet
    git config user.email "test@example.com"
    git config user.name "Test User"

    # Base commit on main, simulate pushed
    echo "base" > base.txt
    git add base.txt
    git commit --quiet -m "base commit"
    BASE_OID=$(git rev-parse HEAD)
    simulate_pushed origin main "$BASE_OID"

    # New branch with 3 commits
    git checkout --quiet -b feat/test-user-abc2-feature
    for i in 1 2 3; do
        echo "change$i" > "change$i.txt"
        git add "change$i.txt"
        git commit --quiet -m "feat: change $i"
    done
    LOCAL_OID=$(git rev-parse HEAD)

    set +e
    output=$(echo "refs/heads/feat/test-user-abc2-feature $LOCAL_OID refs/heads/feat/test-user-abc2-feature $ZERO_OID" | bash "$REAL_HOOK" 2>&1)
    ret=$?
    set -e

    if [ "$ret" -eq 0 ] && ! echo "$output" | grep -qi 'Single-commit'; then
        pass "3-commit new branch does not warn (exit $ret)"
    else
        fail "3-commit new branch warned unexpectedly (exit=$ret): $output"
    fi
)
rm -rf "$T2"

# ── Test 3: Existing branch, incremental push (1 new commit) — no warning ─

echo ""
echo "── Test 3: Existing branch, incremental push — no warning ──"
T3=$(mktemp -d)
TEMP_DIRS="$TEMP_DIRS $T3"
(
    cd "$T3"
    git init --quiet
    git config user.email "test@example.com"
    git config user.name "Test User"

    # Base commit on main, simulate pushed
    echo "base" > base.txt
    git add base.txt
    git commit --quiet -m "base commit"
    BASE_OID=$(git rev-parse HEAD)
    simulate_pushed origin main "$BASE_OID"

    # Branch with 3 commits, simulate pushed
    git checkout --quiet -b feat/test-user-abc3-feature
    for i in 1 2 3; do
        echo "change$i" > "change$i.txt"
        git add "change$i.txt"
        git commit --quiet -m "feat: change $i"
    done
    OLD_OID=$(git rev-parse HEAD)
    simulate_pushed origin feat/test-user-abc3-feature "$OLD_OID"

    # Add 1 more commit (incremental push)
    echo "change4" > change4.txt
    git add change4.txt
    git commit --quiet -m "feat: change 4"
    NEW_OID=$(git rev-parse HEAD)

    set +e
    output=$(echo "refs/heads/feat/test-user-abc3-feature $NEW_OID refs/heads/feat/test-user-abc3-feature $OLD_OID" | bash "$REAL_HOOK" 2>&1)
    ret=$?
    set -e

    if [ "$ret" -eq 0 ] && ! echo "$output" | grep -qi 'Single-commit'; then
        pass "Incremental push to existing branch does not warn (exit $ret)"
    else
        fail "Incremental push warned unexpectedly (exit=$ret): $output"
    fi
)
rm -rf "$T3"

# ── Test 4: Non-fast-forward push is blocked (regression) ─────────────────

echo ""
echo "── Test 4: Non-fast-forward push — blocked (regression) ──"
T4=$(mktemp -d)
TEMP_DIRS="$TEMP_DIRS $T4"
(
    cd "$T4"
    git init --quiet
    git config user.email "test@example.com"
    git config user.name "Test User"

    # Base commit on main, simulate pushed
    echo "base" > base.txt
    git add base.txt
    git commit --quiet -m "base commit"
    OLD_OID=$(git rev-parse HEAD)
    simulate_pushed origin main "$OLD_OID"

    # Amend to create divergent history (non-fast-forward)
    echo "amended" > base.txt
    git add base.txt
    git commit --amend --quiet --no-edit
    NEW_OID=$(git rev-parse HEAD)

    set +e
    output=$(echo "refs/heads/main $NEW_OID refs/heads/main $OLD_OID" | bash "$REAL_HOOK" 2>&1)
    ret=$?
    set -e

    if [ "$ret" -ne 0 ] && echo "$output" | grep -qi 'BLOCKED'; then
        pass "Non-fast-forward push blocked (exit $ret)"
    else
        fail "Non-fast-forward push not blocked (exit=$ret): $output"
    fi
)
rm -rf "$T4"

# ── Summary ────────────────────────────────────────────────────────────────

total_pass=$(grep -c "PASS" "$RESULT_FILE" 2>/dev/null || true)
total_fail=$(grep -c "FAIL" "$RESULT_FILE" 2>/dev/null || true)
: "${total_pass:=0}"
: "${total_fail:=0}"

echo ""
echo "═══════════════════════════════════════════════════════"
if [ "$total_fail" -eq 0 ]; then
    echo "✓ pre-push tests PASSED — $total_pass assertion(s), 0 failures"
    echo "═══════════════════════════════════════════════════════"
    exit 0
else
    echo "✗ pre-push tests FAILED — $total_pass passed, $total_fail failure(s)"
    echo "═══════════════════════════════════════════════════════"
    exit 1
fi

# vim: ft=sh sts=4 sw=4 ts=4 et :
```

- [ ] **Step 2: Run the test to verify Red state**

Run: `bash tests/Shell/pre-push_test.sh`

Expected: **Tests 1 and 3 FAIL** (the bugs), **Tests 2 and 4 PASS** (already correct).

---

### Task 2: Fix the no-squash heuristic (Green)

**Files:**
- Modify: `.github/hooks/pre-push` (lines 49-58)

**Interfaces:**
- Consumes: `$remote_oid`, `$local_oid` (parsed from stdin at line 14)
- Produces: `$count` variable consumed by the warning block at line 60

- [ ] **Step 1: Replace the range calculation logic**

In `.github/hooks/pre-push`, replace the comment block and the `if`/`else`/`fi` + `count=` lines (currently lines 49-58):

```bash
	# ── No-squash check (soft gate) ───────────────────────────────────────
	# Warn if pushing a single-commit branch that looks like a squash.
	# The push proceeds, but the warning is prominent.
	if [ -n "$remote_oid" ] && [ "$remote_oid" != "0000000000000000000000000000000000000000" ]; then
		range="${remote_oid}..${local_oid}"
	else
		range="$local_oid"
	fi

	count=$(git rev-list --count "$range" 2>/dev/null || echo 0)
```

With:

```bash
	# ── No-squash check (soft gate) ───────────────────────────────────────
	# Warn if pushing a single-commit branch that looks like a squash.
	# The push proceeds, but the warning is prominent.
	# Only applies to new branches — the non-fast-forward gate above
	# already blocks force-pushes, so existing branches are always
	# fast-forward (incremental) pushes here.
	if [ -z "$remote_oid" ] || [ "$remote_oid" = "0000000000000000000000000000000000000000" ]; then
		count=$(git rev-list --count "$local_oid" --not --remotes 2>/dev/null || echo 0)
	else
		count=0
	fi
```

The warning block (the `if [ "$count" -eq 1 ]; then ... fi` section) stays **unchanged**.

- [ ] **Step 2: Run the test to verify Green state**

Run: `bash tests/Shell/pre-push_test.sh`

Expected: **All 4 tests PASS** — 4 assertions, 0 failures.

- [ ] **Step 3: Commit the fix + test together**

```bash
git add .github/hooks/pre-push tests/Shell/pre-push_test.sh
git commit -S -m $'fix(hooks): correct no-squash heuristic for new and existing branches\n\nThe pre-push no-squash check had two bugs:\n1. New branches: range="$local_oid" counted all reachable history,\n   so a squashed single-commit branch never triggered the warning.\n2. Existing branches: a single incremental commit triggered the\n   warning on every routine push.\n\nFix: for new branches, count commits unique to the branch with\n`git rev-list --count "$local_oid" --not --remotes`. For existing\nbranches, skip the check entirely — the non-fast-forward gate above\nalready blocks force-pushes, so an existing branch reaching this\npoint is always a fast-forward (incremental) push.\n\nAdds tests/Shell/pre-push_test.sh with 4 tests covering the\nacceptance criteria from issue #74.\n\nFixes: #74\nPlan-by: glm-5.2\nAcked-by: deepseek-v4-pro\nSigned-off-by: kyau <git@kyaulabs.com>'
```

---

### Task 3: Refresh vendored opencode docs

**Files:**
- Regenerate: `.opencode/skills/opencode-docs/docs/*.mdx`

- [ ] **Step 1: Run the fetch script**

Run: `bash .opencode/skills/opencode-docs/fetch.sh`

Expected output: `==> Done. N doc files in .../docs/`

- [ ] **Step 2: Commit the docs refresh**

```bash
git add .opencode/skills/opencode-docs/docs/
git commit -S -m $'chore(docs): refresh vendored opencode docs\n\nRun fetch.sh to pull latest .mdx files from anomalyco/opencode\ndev branch.\n\nPlan-by: glm-5.2\nAcked-by: deepseek-v4-pro\nSigned-off-by: kyau <git@kyaulabs.com>'
```

---

### Task 4: Verification + /check + @code-review

- [ ] **Step 1: Run verification**

Run: `bash tests/Shell/pre-push_test.sh` — confirm all 4 tests still pass.

- [ ] **Step 2: Run /check**

Run: `/check` (php-cs-fixer + stylelint + eslint + pest --coverage + shell tests)

- [ ] **Step 3: Dispatch @code-review**

Dispatch `@code-review` on the staged changes before push.

---

## Self-review

1. **Spec coverage:** ✅ All three acceptance criteria covered (Task 1, tests 1-3), plus non-ff regression (test 4).
2. **Placeholder scan:** No placeholders — all steps have exact commands and expected output.
3. **Type consistency:** The `$count` variable interface between the fix and the warning block is unchanged.

---

*Plan generated 2026-07-10. Execute via executing-plans skill.*
