# Issue #40: Align `/check` Tool Resolution with Hooks/CI and Use `mktemp`

> **For agentic workers:** Implement this plan task-by-task using the @tdd
> agent. Steps use checkbox (`- [ ]`) syntax for tracking. Each task follows
> Red → Green → Refactor.

**Goal:** Fix two defects in `.opencode/commands/check.md` — (1) `/check` invokes
global `php-cs-fixer` only, diverging from the pre-commit hook's `vendor/bin` →
PATH resolution order, and (2) writes to the fixed path `/tmp/changed.txt`,
colliding across concurrent sessions.

**Architecture:** Two surgical edits — mirror the pre-commit's `CS_FIXER`
resolution block in `/check` §1, and replace the fixed temp file with
`CHANGED=$(mktemp)` + `trap … EXIT` cleanup in §4. A new shell regression test
validates both acceptance criteria.

**Tech Stack:** Markdown command instructions, bash snippets, shell regression
tests (`tests/Shell/`).

## Global constraints

- Bash snippets: `set -euo pipefail` where applicable (snippets inside the
  command markdown run in separate subshells per snippet).
- Shell tests: follow `tests/Shell/commit-msg_test.sh` pattern (mktemp dirs,
  pass/fail counters, trap cleanup).
- Signed commits (`git commit -S`) with `Plan-by:`/`Acked-by:`/`Signed-off-by:`
  footers on all implementation commits.
- Never edit generated `cdn/css`/`cdn/javascript` files (not applicable here).

## File structure

| File | Action | Responsibility |
|---|---|---|
| `tests/Shell/check_resolution_test.sh` | Create | Red: assert vendor/bin preferred over PATH; assert mktemp yields unique paths |
| `.opencode/commands/check.md` | Modify | Green: resolution block in §1; `CHANGED=$(mktemp)` + trap in §4 |

---

### Task 1 (Red): Write shell regression test for resolution order + mktemp uniqueness

**Files:**
- Create: `tests/Shell/check_resolution_test.sh`

**Interfaces:**
- Produces: `tests/Shell/check_resolution_test.sh` that:
  - Creates a temp project dir with a stub `vendor/bin/php-cs-fixer` (prints
    "vendor" + exits 0) and a PATH-level `php-cs-fixer` (prints "global" + exits
    0), asserts the resolution block selects "vendor" first.
  - Creates a dir with no vendor/bin but with a global `php-cs-fixer`, asserts
    the resolution block falls back to the global.
  - Runs two mktemp calls, asserts the paths are distinct (concurrent isolation).
  - Has `PASS` / `FAIL` counter and `trap` cleanup like `commit-msg_test.sh`.
  - Has a header comment with RCS header + vim modeline per `rcs-header` skill.

- **Resolution-block snippet under test** (exact text that will appear in
  check.md after Task 2):

  ```bash
  CS_FIXER=""
  if [ -x vendor/bin/php-cs-fixer ]; then
  	CS_FIXER=vendor/bin/php-cs-fixer
  elif command -v php-cs-fixer > /dev/null 2>&1; then
  	CS_FIXER=php-cs-fixer
  fi
  if [ -n "$CS_FIXER" ]; then
  	"$CS_FIXER" fix --dry-run --diff
  else
  	echo "SKIPPED: php-cs-fixer not found (install via composer install or globally)"
  fi
  ```

- [ ] **Step 1: Write Red test**
  - `test_resolution_prefers_vendor_bin()` — creates `vendor/bin/php-cs-fixer`,
    adds `vendor/bin` to PATH plus a global `php-cs-fixer`, runs the resolution
    block, asserts output contains vendor-binary output (not global).
  - `test_resolution_falls_back_to_path()` — no `vendor/bin`, global
    `php-cs-fixer` in PATH, asserts output comes from global.
  - `test_mktemp_uniqueness()` — runs `mktemp` twice, asserts `path1 != path2`.
  - `test_skipped_when_not_found()` — no vendor/bin, no global, asserts
    SKIPPED message.

- [ ] **Step 2: Run test → fail** (no check.md changes yet — the test exercises the
  snippet in isolation, so it should pass if the snippet is correct; the Red
  phase is "test does not exist yet" — running it confirms it's a new test).

---

### Task 2 (Green): Edit `check.md` — resolution block + `CHANGED=$(mktemp)` with trap

**Files:**
- Modify: `.opencode/commands/check.md`

**Interfaces:**
- Consumes: nothing new.
- Produces: check.md §1 replaces the bare `php-cs-fixer` call with the
  vendor-first resolution block; §4 replaces `/tmp/changed.txt` with
  `CHANGED=$(mktemp)` + `trap 'rm -f "$CHANGED"' EXIT`.

- [ ] **Step 1: Fix php-cs-fixer resolution (§1)**
  Replace line 12 (`php-cs-fixer fix . --dry-run --diff`) with:
  ```bash
  CS_FIXER=""
  if [ -x vendor/bin/php-cs-fixer ]; then
  	CS_FIXER=vendor/bin/php-cs-fixer
  elif command -v php-cs-fixer > /dev/null 2>&1; then
  	CS_FIXER=php-cs-fixer
  fi
  if [ -n "$CS_FIXER" ]; then
  	"$CS_FIXER" fix --dry-run --diff
  else
  	echo "SKIPPED: php-cs-fixer not found (install via composer install or globally)"
  fi
  ```

- [ ] **Step 2: Fix temp file (§4)**
  Replace lines 40-44 (the `git diff … > /tmp/changed.txt` block) with:
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

- [ ] **Step 3: Re-run shell regression test → green**

---

### Task 3 (Refactor/Verify): Final validation

- [ ] **Step 1: Run shell regression test** — `bash tests/Shell/check_resolution_test.sh` → all PASS.
- [ ] **Step 2: Grep for residuals** — confirm no `/tmp/changed.txt` reference
  remains in `.opencode/commands/check.md`.
- [ ] **Step 3: RCS header** — confirm `tests/Shell/check_resolution_test.sh`
  has RCS header + vim modeline (`ft=sh sts=4 sw=4 ts=4 et :`).
- [ ] **Step 4: Check** — run `/check` (shell regression tests are the
  substantive gate; PHP/SCSS/JS gates are no-ops on these files).

---

### Gate: `/check` → `@code-review` → commit

- `/check` passes (shell regression tests green).
- `@code-review` clean or findings resolved.
- Commit with conventional message + footers.

```text
fix(check): align php-cs-fixer resolution with hooks and use mktemp

Mirror the pre-commit hook's vendor/bin → PATH resolution order in §1
so /check finds php-cs-fixer on vendor-only installs. Replace the
fixed /tmp/changed.txt with mktemp + trap cleanup in §4 to prevent
state collisions across concurrent /check runs.

Closes #40.

Plan-by: glm-5.2
Acked-by: deepseek-v4-pro
Signed-off-by: kyau <git@kyaulabs.com>
```
