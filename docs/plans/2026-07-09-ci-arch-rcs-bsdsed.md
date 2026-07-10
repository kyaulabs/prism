# CI Failure Fix — Arch/RCS Tests + macOS BSD sed Implementation Plan

> **For agentic workers:** Implement this plan task-by-task using the @tdd
> agent. Steps use checkbox (`- [ ]`) syntax for tracking. Each task follows
> Red → Green → Refactor.

**Goal:** Restore green CI on `origin/develop` (commit `a816ff8`) by fixing 3 arch/RCS test failures and 1 macOS BSD `sed` failure, and harden the pre-commit hook so the duplication cannot recur.

**Architecture:** Three independent fixes. (1) Rewrite the pre-commit hook's header/modeline insertion from "skip-if-present" into an idempotent *normalizer* that strips duplicates then inserts exactly one canonical header + one modeline — this is the root cause of the arch/RCS failures. (2) Manually correct the two broken PHP files at `a816ff8` to canonical form. (3) Replace GNU-only `sed -i` in `setup-substitute.sh` with a portable `sed … > tmp && mv` helper so it runs on macOS BSD sed.

**Tech Stack:** Bash (pre-commit hook + shell tests), PHP 8.5 / Pest v4 (arch tests), GitHub Actions (ubuntu + macos runners).

## Global constraints

- Branch from `origin/develop` (`a816ff8`) — that is where CI failed. The local `develop` (`feae64d`, read-only-permission work) is a divergent line and is **not** touched by this plan; reconciling it is out of scope.
- Signed commits (`git commit -S`). Conventional Commits format.
- Commit footers: `Plan-by: glm-5.2`, `Acked-by: deepseek-v4-pro`, `Signed-off-by: kyau <git@kyaulabs.com>`.
- Never edit `cdn/css/*.min.css` or `cdn/javascript/*.min.js`.
- TDD: Red → Green → Refactor. Minimum 80% line coverage on changed files.
- Canonical PHP header ordering (enforced by `tests/Unit/Harness/RcsHeaderConventionTest.php`): `<?php` → `declare(strict_types=1);` → blank → `# $KYAULabs: …` → blank → code. Exactly one vim modeline at EOF.

## Preamble: branch setup

- [ ] **Step 0: Create fix branch from origin/develop**

```bash
git fetch origin develop
git checkout -b fix/ci-arch-rcs-and-bsdsed origin/develop
```

---

## Task 1: Harden pre-commit hook into an idempotent normalizer

**Root cause:** `.github/hooks/pre-commit` lines 112–114 skip any file whose staged blob already contains `$KYAULabs:`. Once a duplicate header/modeline exists, the hook leaves it broken forever. Additionally, the modeline is appended unconditionally (lines 205–208) with no dedup check.

**Files:**
- Modify: `.github/hooks/pre-commit` (lines 97–217, the RCS auto-add block)
- Test: `tests/Shell/rcs_header_autoadd_test.sh` (add 2 new tests)

**Interfaces:**
- Consumes: canonical header/modeline templates from `.opencode/skills/rcs-header/SKILL.md`
- Produces: a hook that, for any staged source file, guarantees ≤1 header and ≤1 modeline in canonical positions

**Idempotency contract (what the normalizer must guarantee):**
1. File with no header/modeline → adds exactly one of each.
2. File with one canonical header + one modeline → unchanged.
3. File with **duplicate** headers and/or modelines → collapsed to exactly one each, canonical ordering.
4. PHP file ending outside `<?php` context (after `?>`) → no modeline appended (preserve existing Test 3 behavior).
5. `declare(strict_types=1)` preserved exactly once, before the header.

- [ ] **Step 1: Write failing test — duplicate-header repair**

Append to `tests/Shell/rcs_header_autoadd_test.sh` a new test (Test 5). It creates a PHP file in the **broken** state (3 RCS headers, `declare` after them, 5 modelines — mirroring the real `EvalRunner.php` breakage), stages it fully, runs the hook, and asserts the result has exactly one header, one modeline, and canonical ordering.

```bash
# ── Test 5: Duplicate headers/modelines are normalized to one each ──
test_duplicate_headers_are_normalized() {
    local repo
    repo=$(mktemp -d)
    git -C "$repo" init -q
    git -C "$repo" config user.email t@t.t
    git -C "$repo" config user.name t
    cp .github/hooks/pre-commit "$repo/.github/hooks/pre-commit" 2>/dev/null || {
        mkdir -p "$repo/.github/hooks"
        cp .github/hooks/pre-commit "$repo/.github/hooks/pre-commit"
    }
    git -C "$repo" config core.hooksPath .github/hooks

    # Broken state: 3 headers, declare after them, 5 modelines
    {
        echo '<?php'
        echo '# $KYAULabs: broken.php t@t.t 2026/07/09 Exp $'
        echo '# $KYAULabs: broken.php t@t.t 2026/07/09 Exp $'
        echo '# $KYAULabs: broken.php t@t.t 2026/07/09 Exp $'
        echo 'declare(strict_types=1);'
        echo 'echo 1;'
        echo '// vim: ft=php sts=4 sw=4 ts=4 et :'
        echo '// vim: ft=php sts=4 sw=4 ts=4 et :'
        echo '// vim: ft=php sts=4 sw=4 ts=4 et :'
        echo '// vim: ft=php sts=4 sw=4 ts=4 et :'
        echo '// vim: ft=php sts=4 sw=4 ts=4 et :'
    } > "$repo/broken.php"

    git -C "$repo" add broken.php
    git -C "$repo" commit -q -m "test: broken file" 2>/dev/null

    local header_count modeline_count declare_line header_line
    header_count=$(grep -cF '$KYAULabs:' "$repo/broken.php")
    modeline_count=$(grep -c 'vim: ft=php' "$repo/broken.php")
    declare_line=$(grep -n 'declare(strict_types=1);' "$repo/broken.php" | head -1 | cut -d: -f1)
    header_line=$(grep -nF '$KYAULabs:' "$repo/broken.php" | head -1 | cut -d: -f1)

    [ "$header_count" -eq 1 ] || { echo "FAIL: expected 1 header, got $header_count"; return 1; }
    [ "$modeline_count" -eq 1 ] || { echo "FAIL: expected 1 modeline, got $modeline_count"; return 1; }
    [ "$declare_line" -lt "$header_line" ] || { echo "FAIL: declare must precede header"; return 1; }
    echo "PASS: duplicates normalized"
}
```

- [ ] **Step 2: Write failing test — modeline dedup on headerless file**

Append Test 6: a file with a modeline but **no** header. Currently the hook inserts a header AND appends a second modeline (Bug A). After the fix, exactly one modeline.

```bash
# ── Test 6: Headerless file with existing modeline keeps exactly one modeline ──
test_headerless_modeline_not_duplicated() {
    local repo
    repo=$(mktemp -d)
    git -C "$repo" init -q
    git -C "$repo" config user.email t@t.t
    git -C "$repo" config user.name t
    mkdir -p "$repo/.github/hooks"
    cp .github/hooks/pre-commit "$repo/.github/hooks/pre-commit"
    git -C "$repo" config core.hooksPath .github/hooks

    {
        echo '<?php'
        echo 'declare(strict_types=1);'
        echo 'echo 1;'
        echo '// vim: ft=php sts=4 sw=4 ts=4 et :'
    } > "$repo/hasml.php"

    git -C "$repo" add hasml.php
    git -C "$repo" commit -q -m "test: headerless w/ modeline" 2>/dev/null

    local modeline_count
    modeline_count=$(grep -c 'vim: ft=php' "$repo/hasml.php")
    [ "$modeline_count" -eq 1 ] || { echo "FAIL: expected 1 modeline, got $modeline_count"; return 1; }
    echo "PASS: modeline not duplicated"
}
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `bash tests/Shell/rcs_header_autoadd_test.sh`
Expected: Test 5 FAILS (guard sees existing header → skips → 3 headers remain); Test 6 FAILS (2 modelines).

- [ ] **Step 4: Implement the normalizer**

Rewrite the RCS auto-add block (`.github/hooks/pre-commit` ~lines 97–217). Replace the "skip if `$KYAULabs:` present" guard + unconditional-append with a **strip-then-insert** normalizer.

Core changes:
1. Remove the early-skip guard (the `grep -qF '$KYAULabs:'` check that does `continue`).
2. After reading the staged blob into `$TMP`, create a cleaned copy with ALL existing `$KYAULabs:` header lines and ALL existing vim modeline lines stripped via `grep -vE`.
3. Insert exactly one canonical header (in the correct position for the file type) and at most one modeline.
4. Only re-stage if the normalized content differs from the original staged blob.

PHP-specific requirements:
- `<?php` always on line 1.
- `declare(strict_types=1);` must appear once, on line 2 (before the header). If the original file has `declare` anywhere, emit it once and strip it from the body.
- Blank line after declare, then `# $KYAULabs:` header, then blank line, then body.
- If the file exits PHP context via `?>`, no modeline is appended (preserve existing Test 3 behavior).
- Modeline: `// vim: ft=php sts=4 sw=4 ts=4 et :`

The existing Tests 1–4 in `rcs_header_autoadd_test.sh` must continue to pass:
- Test 1 (partial-stage blocks commit): preserved by the unstaged-changes guard.
- Test 2 (full-stage adds header + modeline): preserved — the normalizer adds them.
- Test 3 (`?>`-terminated → no modeline): preserved by the PHP-context awk check.
- Test 4 (declare preserved exactly once): preserved by single-emit logic.

- [ ] **Step 5: Run tests to verify they pass**

Run: `bash tests/Shell/rcs_header_autoadd_test.sh`
Expected: all tests PASS (including new Tests 5, 6, and existing Tests 1–4).

- [ ] **Step 6: Commit**

```bash
git add .github/hooks/pre-commit tests/Shell/rcs_header_autoadd_test.sh
git commit -S -m "fix(hooks): make pre-commit RCS header insertion idempotent

Replace the skip-if-present guard with a strip-then-insert normalizer so
duplicate \$KYAULabs headers and vim modelines are collapsed to exactly
one each in canonical position. Previously, once a duplicate existed the
guard skipped the file and duplicates persisted forever (root cause of
the arch/RCS test failures on a816ff8).

Plan-by: glm-5.2
Acked-by: deepseek-v4-pro
Signed-off-by: kyau <git@kyaulabs.com>"
```

---

## Task 2: Correct the two broken PHP files to canonical form

**Files:**
- Modify: `.opencode/evals/bin/includes/EvalRunner.php` (lines 1–11 header region; lines 967–975 modelines)
- Modify: `tests/Unit/Eval/RunnerTest.php` (lines 1–8 header region; lines 769–773 modelines)
- Test: `tests/Unit/Harness/ArchTest.php` + `tests/Unit/Harness/RcsHeaderConventionTest.php` (existing — these ARE the Red tests)

**Interfaces:**
- Consumes: canonical ordering from `rcs-header` skill
- Produces: two files passing all 3 arch/RCS tests

> Note: After Task 1, simply staging these files and committing would let the hook normalize them automatically. We correct them explicitly anyway so the repo state is canonical regardless of hook installation.

- [ ] **Step 1: Verify the Red state**

Run: `php vendor/bin/pest tests/Unit/Harness/ --coverage`
Expected: 3 failures — strict_types missing in `EvalRunner.php`; RCS-before-declare in `RunnerTest.php`; multiple modelines in both.

- [ ] **Step 2: Fix EvalRunner.php header region**

Replace lines 1–11 (the three duplicated headers + late `declare`) with canonical ordering:

```php
<?php
declare(strict_types=1);

# $KYAULabs: EvalRunner.php kyau@<host> <date> Exp $

```

Preserve the original creator/host/date values from the first header line — do not invent placeholder values. If the original carried `kyau@<hostname> 2026/07/09`, keep those exact values.

- [ ] **Step 3: Fix EvalRunner.php modelines**

Remove the 4 duplicate modelines at lines 969, 971, 973, 975. Keep exactly one at EOF:

```php
// vim: ft=php sts=4 sw=4 ts=4 et :
```

- [ ] **Step 4: Fix RunnerTest.php header region**

Replace lines 1–8 (two duplicated headers + late `declare`) with:

```php
<?php
declare(strict_types=1);

# $KYAULabs: RunnerTest.php kyau@<host> <date> Exp $

```

Preserve the original creator/host/date values.

- [ ] **Step 5: Fix RunnerTest.php modelines**

Remove the 2 duplicate modelines at lines 771, 773. Keep exactly one at EOF:

```php
// vim: ft=php sts=4 sw=4 ts=4 et :
```

- [ ] **Step 6: Run arch tests to verify Green**

Run: `php vendor/bin/pest tests/Unit/Harness/ --coverage`
Expected: PASS — all arch/RCS tests green.

- [ ] **Step 7: Run full eval test suite (no regressions)**

Run: `php vendor/bin/pest tests/Unit/Eval/`
Expected: PASS — the 6 eval tests added in `a816ff8` still pass; the timeout/pipe logic is untouched (only headers/modelines changed).

- [ ] **Step 8: Commit**

```bash
git add .opencode/evals/bin/includes/EvalRunner.php tests/Unit/Eval/RunnerTest.php
git commit -S -m "fix(eval): restore canonical RCS headers and single modeline

EvalRunner.php and RunnerTest.php had duplicated \$KYAULabs headers,
declare(strict_types=1) placed after the headers, and multiple vim
modelines — introduced by the pre-commit hook's non-idempotent insertion.
Restore canonical ordering so ArchTest and RcsHeaderConventionTest pass.

Plan-by: glm-5.2
Acked-by: deepseek-v4-pro
Signed-off-by: kyau <git@kyaulabs.com>"
```

---

## Task 3: Make setup-substitute.sh portable across GNU/BSD sed

**Root cause:** `.github/scripts/setup-substitute.sh` uses 7 GNU-style `sed -i "s|…|…|g" "$file"` calls (lines 31, 34, 37, 40, 43, 46, 49). BSD `sed` (macOS) requires a backup-extension argument to `-i`; without it the substitution string is misread as the extension and the filename as a command → `sed: 1: "file.md\n": invalid command code f`.

**Files:**
- Modify: `.github/scripts/setup-substitute.sh` (lines 31–49)
- Test: `tests/Shell/setup_substitution_test.sh` (add a BSD-emulation test)

**Interfaces:**
- Consumes: nothing new
- Produces: a script that runs identically on GNU sed and BSD sed

- [ ] **Step 1: Write failing test — BSD sed emulation**

Append a test to `tests/Shell/setup_substitution_test.sh` that puts a BSD-emulating `sed` shim first on `PATH`, then runs `setup-substitute.sh`, and asserts success. The shim rejects `sed -i` calls that lack a backup-extension argument (mimicking BSD behavior):

```bash
# ── Test: runs under BSD-style sed (no GNU -i) ──
test_runs_under_bsd_sed() {
    local tmp_bin script_dir
    tmp_bin=$(mktemp -d)
    script_dir="$(cd "$(dirname "$0")" && pwd)"
    local SUB_SCRIPT="$script_dir/../../.github/scripts/setup-substitute.sh"

    # BSD-emulating sed: error if -i given without a backup-extension arg.
    cat > "$tmp_bin/sed" <<'SHIM'
#!/usr/bin/env bash
prev=""
for a in "$@"; do
    if [ "$prev" = "-i" ]; then
        case "$a" in
            s*|y*) echo "sed: -i requires a backup extension (BSD)" >&2; exit 1 ;;
        esac
    fi
    prev="$a"
done
exec /usr/bin/sed "$@"
SHIM
    chmod +x "$tmp_bin/sed"

    local f
    f=$(mktemp -d)/file.md
    printf 'kyau <git@kyaulabs.com>\n' > "$f"

    PATH="$tmp_bin:$PATH" bash "$SUB_SCRIPT" "$f" "Jane" "jane@example.com" "org" "repo" "myapp" "example.com" "Jane" >/dev/null 2>&1
    local rc=$?
    [ "$rc" -eq 0 ] || { echo "FAIL: script failed under BSD sed (rc=$rc)"; return 1; }
    echo "PASS: runs under BSD sed"
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bash tests/Shell/setup_substitution_test.sh`
Expected: the new test FAILS (current GNU-style `sed -i` triggers the BSD shim's error).

- [ ] **Step 3: Implement portable in-place edit helper**

At the top of `.github/scripts/setup-substitute.sh` (after the header, before the substitution calls), add a portable helper:

```bash
# Portable in-place sed edit: works on GNU sed and BSD sed (no -i flag).
sed_edit() {
    local expr="$1" file="$2"
    sed "$expr" "$file" > "$file.tmp.$$" && mv "$file.tmp.$$" "$file"
}
```

Replace each of the 7 `sed -i "s|…|…|g" "$file"` calls with `sed_edit "s|…|…|g" "$file"`. Preserve each original substitution expression verbatim — only swap `sed -i` → `sed_edit`.

- [ ] **Step 4: Run test to verify it passes**

Run: `bash tests/Shell/setup_substitution_test.sh`
Expected: PASS — including the new BSD-emulation test and all existing substitution tests.

- [ ] **Step 5: Commit**

```bash
git add .github/scripts/setup-substitute.sh tests/Shell/setup_substitution_test.sh
git commit -S -m "fix(setup): make setup-substitute.sh portable across GNU/BSD sed

Replace 7 GNU-style 'sed -i' calls with a sed_edit helper that writes
to a temp file and moves it into place, avoiding the BSD sed -i
backup-extension requirement. Fixes the macOS CI 'invalid command
code f' failure in setup_substitution_test.sh.

Plan-by: glm-5.2
Acked-by: deepseek-v4-pro
Signed-off-by: kyau <git@kyaulabs.com>"
```

---

## Verification epilogue

- [ ] **Step V1: Full local gate**

```bash
php -d pcov.enabled=1 vendor/bin/pest --coverage --min=80
```

- [ ] **Step V2: Run /check**

`/check` (php-cs-fixer + stylelint + eslint + pest --coverage)

- [ ] **Step V3: Confirm the original CI failures are resolved**

The 3 arch/RCS failures and the macOS BSD sed failure must all be gone. Push is human-only; after push confirm GitHub Actions green for both `check` and `check-macos` jobs.
