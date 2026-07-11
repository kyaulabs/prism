# Issue #73 + Opencode Docs Refresh — Implementation Plan

<!-- $KYAULabs: 2026-07-10-issue-73-npm-ci-fix.md kyau@nova 2026/07/10 -0700 Exp $ -->

> **For agentic workers:** Implement this plan task-by-task using the @tdd
> agent. Steps use checkbox (`- [ ]`) syntax for tracking. Each task follows
> Red → Green → Refactor.

**Goal:** Fix CI to use `npm ci` instead of `npm install` for lockfile determinism (Issue #73), and refresh vendored opencode docs.

**Architecture:** Replace 3 `npm install` occurrences in `.github/workflows/ci.yml` with `npm ci`. Add a shell regression test to prevent backsliding. Separately, run the docs fetch script to update vendored opencode.ai docs.

**Tech Stack:** Bash shell tests (custom framework), GitHub Actions YAML, npm

## Global constraints

- Shell test framework: custom bash (no bats/shunit2) — follow `tests/Shell/` conventions
- Shellcheck must pass on all shell files
- RCS header + vim modeline on every new source file
- Conventional Commits format with `Fixes: #73`, `Plan-by: glm-5.2`, `Acked-by: deepseek-v4-pro`, `Signed-off-by: kyau <git@kyaulabs.com>`
- Signed commits (`git commit -S`)
- Do NOT modify `aurora/` submodule
- Do NOT change documentation references to `npm install` in AGENTS.md/README.md — those are in the context of regenerating lockfiles, where `npm install` is correct

---

## Part A: Issue #73 — CI Lockfile Determinism

### Task 1: Pre-check — Verify lockfile sync

**Files:**
- Verify: `package.json` / `package-lock.json` (root)
- Verify: `.opencode/package.json` / `.opencode/package-lock.json`

**Rationale:** If lockfiles are already drifted, `npm ci` will fail in CI after the fix. We need to catch and fix drift BEFORE switching from `npm install` to `npm ci`.

- [ ] **Step 1: Verify root lockfile sync**

```bash
npm ci
```

Expected: SUCCESS (installs dependencies from lockfile). If FAIL with "npm ci can only be used with an existing package-lock.json" or lockfile mismatch errors, the lockfile is drifted — run `npm install` to regenerate, then `git add package-lock.json` and commit separately before proceeding.

- [ ] **Step 2: Verify .opencode lockfile sync**

```bash
cd .opencode && npm ci && cd ..
```

Expected: SUCCESS. If FAIL, run `cd .opencode && npm install` to regenerate, then `git add .opencode/package-lock.json` and commit separately.

---

### Task 2: Red — Write failing regression test

**Files:**
- Create: `tests/Shell/ci_npm_test.sh`

**Interfaces:**
- Consumes: `.github/workflows/ci.yml` (read-only)
- Produces: exit code 0 (pass) or 1 (fail)

- [ ] **Step 1: Create the test file**

Create `tests/Shell/ci_npm_test.sh` with this exact content:

```bash
#!/usr/bin/env bash
# $KYAULabs: ci_npm_test.sh kyau@nova 2026/07/10 -0700 Exp $

# ci_npm_test.sh — Verify CI workflow uses `npm ci` (not `npm install`).
#
# `npm install` silently reconciles package.json/lock drift, undermining
# lockfile determinism. `npm ci` fails on drift — the correct CI behavior.
# See: Issue #73.

set -euo pipefail

RESULT_FILE=$(mktemp)
trap 'rm -f "$RESULT_FILE"' EXIT

RED=$'\033[1;31m'
GREEN=$'\033[1;32m'
RESET=$'\033[0m'

pass() { echo "  ${GREEN}PASS${RESET} $*"; echo "PASS" >> "$RESULT_FILE"; }
fail() { echo "  ${RED}FAIL${RESET} $*" >&2; echo "FAIL" >> "$RESULT_FILE"; }

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
CI_FILE="${REPO_ROOT}/.github/workflows/ci.yml"

# ── Test 1: ci.yml must not contain `npm install` ─────────────────────
echo ""
echo "── Test 1: ci.yml does not contain npm install ──"

if [ ! -f "$CI_FILE" ]; then
    fail "ci.yml not found at ${CI_FILE}"
else
    # `npm ci` does not contain the substring `npm install`, so this
    # grep has no false positives. Any match means someone used
    # `npm install` instead of `npm ci`.
    matches=$(grep -n 'npm install' "$CI_FILE" 2>/dev/null || true)
    if [ -n "$matches" ]; then
        fail "ci.yml contains 'npm install' (should use 'npm ci'):"
        echo "$matches" >&2
    else
        pass "ci.yml does not contain 'npm install'"
    fi
fi

# ── Test 2: ci.yml must contain `npm ci` ──────────────────────────────
echo ""
echo "── Test 2: ci.yml contains npm ci ──"

if [ ! -f "$CI_FILE" ]; then
    fail "ci.yml not found at ${CI_FILE}"
else
    if grep -q 'npm ci' "$CI_FILE" 2>/dev/null; then
        pass "ci.yml contains 'npm ci'"
    else
        fail "ci.yml does not contain 'npm ci'"
    fi
fi

# ── Summary ────────────────────────────────────────────────────────────
total_pass=$(grep -c "PASS" "$RESULT_FILE" 2>/dev/null || true)
total_fail=$(grep -c "FAIL" "$RESULT_FILE" 2>/dev/null || true)

echo ""
echo "═══════════════════════════════════════════════════════════"
if [ "$total_fail" -eq 0 ]; then
    echo "✓ CI npm tests PASSED — $total_pass assertion(s), 0 failures"
    echo "═══════════════════════════════════════════════════════════"
    exit 0
else
    echo "✗ CI npm tests FAILED — $total_pass passed, $total_fail failure(s)"
    echo "═══════════════════════════════════════════════════════════"
    exit 1
fi

# vim: ft=sh sts=4 sw=4 ts=4 et :
```

- [ ] **Step 2: Run shellcheck on the new test**

```bash
shellcheck tests/Shell/ci_npm_test.sh
```

Expected: No output (clean). If warnings, fix them before proceeding.

- [ ] **Step 3: Run the test to verify it FAILS (Red)**

```bash
bash tests/Shell/ci_npm_test.sh
```

Expected: FAIL — Test 1 fails because ci.yml currently contains `npm install` at lines 47, 50, and 199. Test 2 may also fail if no `npm ci` exists yet (it doesn't in ci.yml).

---

### Task 3: Green — Fix ci.yml

**Files:**
- Modify: `.github/workflows/ci.yml` (lines 47, 50, 199)

- [ ] **Step 1: Replace `npm install` with `npm ci` at line 47**

Change `run: npm install` to `run: npm ci`.

- [ ] **Step 2: Replace `npm install` with `npm ci` at line 50**

Change `run: cd .opencode && npm install` to `run: cd .opencode && npm ci`.

- [ ] **Step 3: Replace `npm install` with `npm ci` at line 199**

Change `run: npm install` to `run: npm ci`.

- [ ] **Step 4: Run the regression test to verify it PASSES (Green)**

```bash
bash tests/Shell/ci_npm_test.sh
```

Expected: PASS — both Test 1 and Test 2 pass.

- [ ] **Step 5: Verify no other `npm install` remains in ci.yml**

```bash
grep -n 'npm install' .github/workflows/ci.yml
```

Expected: No output (no matches).

---

### Task 4: Verify + Commit

- [ ] **Step 1: Run shellcheck on all shell files (CI gate)**

```bash
find . -type f \( -name '*.sh' -o -path './.github/hooks/*' \) \
  -not -path './vendor/*' \
  -not -path '*/node_modules/*' \
  -not -path './aurora/*' \
  -print0 | xargs -0 shellcheck
```

Expected: Clean (no warnings).

- [ ] **Step 2: Run the full shell test suite**

```bash
shopt -s nullglob
tests=( tests/Shell/*_test.sh )
for t in "${tests[@]}"; do
    echo "::group::Running $t"
    bash "$t"
    echo "::endgroup::"
done
```

Expected: All tests pass, including the new `ci_npm_test.sh`.

- [ ] **Step 3: Commit**

```bash
git add tests/Shell/ci_npm_test.sh .github/workflows/ci.yml
git commit -S -m "fix(ci): use npm ci instead of npm install for lockfile determinism

npm install silently reconciles package.json/lock drift, undermining
the AGENTS.md lockfile-determinism policy. npm ci fails on drift,
ensuring deliberate manifest/lock mismatch is caught in CI.

Changes all 3 npm install occurrences in ci.yml (Ubuntu root deps,
.opencode plugin deps, macOS root deps) to npm ci. Adds a shell
regression test to prevent backsliding.

Fixes: #73
Plan-by: glm-5.2
Acked-by: deepseek-v4-pro
Signed-off-by: kyau <git@kyaulabs.com>"
```

---

## Part B: Opencode Docs Refresh

### Task 5: Run fetch.sh

**Files:**
- Modify: `.opencode/skills/opencode-docs/docs/*.mdx` (generated)

- [ ] **Step 1: Run the fetch script**

```bash
bash .opencode/skills/opencode-docs/fetch.sh
```

Expected: Output showing docs being fetched and copied. Final line: `==> Done. N doc files in .../docs/`

- [ ] **Step 2: Review the diff**

```bash
git diff --stat .opencode/skills/opencode-docs/docs/
```

Review what changed — new files added, existing files updated, files removed.

- [ ] **Step 3: Spot-check a changed file**

```bash
git diff .opencode/skills/opencode-docs/docs/config.mdx
```

Verify the changes look like legitimate doc updates (new config keys, updated descriptions, etc.), not corruption.

---

### Task 6: Commit docs refresh

- [ ] **Step 1: Stage and commit**

```bash
git add .opencode/skills/opencode-docs/docs/
git commit -S -m "chore(docs): refresh vendored opencode docs

Run fetch.sh to pull latest .mdx files from anomalyco/opencode dev
branch. Updates the local reference snapshot used by the opencode-docs
skill.

Plan-by: glm-5.2
Acked-by: deepseek-v4-pro
Signed-off-by: kyau <git@kyaulabs.com>"
```

---

## Post-implementation

After both parts are complete:

1. **Run `/check`** — the pre-push gate (php-cs-fixer + stylelint + eslint + pest --coverage). Note: the ci.yml change and shell test won't be caught by most of these, but it's good practice to run the full gate.

2. **Run `@code-review`** — review the staged changes before push.

3. **Push** — the human pushes. Two commits on the feature branch:
   - `fix(ci): use npm ci instead of npm install for lockfile determinism` (closes #73)
   - `chore(docs): refresh vendored opencode docs`
