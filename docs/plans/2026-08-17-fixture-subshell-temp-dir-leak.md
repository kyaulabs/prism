# Fixture Subshell Temp-Dir Leak Implementation Plan

> **For the executing agent:** Implement this plan task-by-task by loading the
> `executing-plans` and `tdd` skills. Steps use checkbox (`- [ ]`) syntax for
> tracking. Each task follows Red → Green → Refactor inline.

**Goal:** Stop `tests/Shell` fixture temp dirs from leaking by registering them
in the caller's shell so the EXIT-trap cleanup actually removes them.

**Architecture:** Change `fixture()` from a stdout-printing command-substitution
helper (`dir=$(fixture)`) to a variable-name helper (`fixture dir`) that uses
`printf -v` to set the caller's variable in the caller's shell, so its
`TMP_DIRS+=()` registration is visible to the `cleanup` EXIT trap. A dedicated
contract test file proves the new interface, the failure guard, and the
cleanup behavior; the two existing test files' 8 call sites switch to the new
interface with no other changes.

**Tech Stack:** Bash (POSIX-ish, `set -euo pipefail`), counter-style test
helpers (`tests/Shell/lib/counter_helpers.sh`), no new dependencies.

## Origin

- Issue #322 — `fix(shell-test): fixture temp dirs leak via subshell tracking`;
  Type `Bug`, Progress `Under Construction`, Priority `Medium`, Effort `Low`.
- Root cause verified empirically before planning: `dir=$(fixture)` runs
  `fixture` in a subshell, so its `TMP_DIRS+=("$d")` never reaches the parent
  shell and the EXIT trap removes nothing. A throwaway simulation of the
  recommended interface (`fixture dir` + `printf -v`) confirmed the fix works.
- Baseline (verified 2026-08-17): `resolve_identity_test.sh` → 5 passed, 0
  failed; `classify_greenfield_test.sh` → 15 passed, 0 failed. ~4200 leaked
  `/tmp/tmp.*` dirs currently exist from prior runs (the accumulation this
  issue describes); they are historical garbage and out of scope — the fix
  stops new leaks.
- One implementation note found during verification: the recommended interface
  has a latent footgun — a caller variable literally named `d` collides with
  the function's own `local d` (printf -v targets the local). All 8 real call
  sites use `dir`, so there is no practical impact, but the helper's doc
  contract must warn against it.

## Global constraints

- After this plan is approved, create the branch with
  `bash packages/prism-core/scripts/new-branch.sh fix fixture-subshell-temp-dir-leak`
  (type `fix` for the Bug issue; base `develop`). Do not create the branch or
  start implementation before plan approval.
- Never push. Present each full signed Conventional Commit message before the
  gated `git commit` call.
- Commit footers in pipeline order (ADR-0040):
  `Authored-by: deepseek-v4-flash` → `Implemented-by: deepseek-v4-flash` →
  `Tested-by: deepseek-v4-flash` (primary; becomes `deepseek-v4-pro` only if
  the human cycles to the judge) → `Signed-off-by: kyau <kyau@kyau.net>`
  (resolved via `packages/prism-core/scripts/resolve-identity.sh`).
- Task 1's commit is a deliberately failing red test — acceptable on the local
  feature branch (CI only runs on push, which is human-only).
- Only `tests/Shell/` files change. No new dependencies, no lockfile changes,
  no `aurora/`, `backend/`, `cdn/`, or `packages/` edits.
- `fixture_helpers.sh` owns the EXIT trap — the new test file must NOT source
  `test_helpers.sh` (its `register_temp_dir` is a separate RESULT_FILE-style
  contract, and it installs its own trap).
- Do not touch the deliberate workaround in `classify_greenfield_test.sh`:
  `dir=$(mktemp -d); TMP_DIRS+=("$dir")` — the invalid-root test needs a
  non-git dir and already registers it in the parent shell.
- RCS headers: the new test file gets a fresh RCS header + vim modeline (load
  the `rcs-header` skill); the two modified test files and `fixture_helpers.sh`
  keep their existing one-time headers unchanged.
- Modified files end with the vim modeline `# vim: ft=sh sts=4 sw=4 ts=4 et :`
  (already present — preserve it).
- Pre-existing `/tmp/tmp.*` garbage is not removed by this work; a human may
  purge it manually (`rm -rf /tmp/tmp.*` after confirming nothing else uses it).

## File structure

| File | Responsibility | Task |
| :--- | :--- | :---: |
| `tests/Shell/fixture_helpers_test.sh` (new) | Contract test: caller-shell registration, TMP_DIRS tracking, git-init behavior, mktemp-failure guard, cleanup removal | 1 |
| `tests/Shell/lib/fixture_helpers.sh` | New `fixture <varname>` interface (`printf -v`), failure guard, doc-contract update incl. the `d` collision warning | 2 |
| `tests/Shell/resolve_identity_test.sh` | 5 call sites: `dir=$(fixture)` → `fixture dir` | 2 |
| `tests/Shell/classify_greenfield_test.sh` | 3 call sites: `dir=$(fixture)` → `fixture dir` | 2 |

---

### Task 1: Contract test for the fixture helper (RED)

**Files:**
- Create: `tests/Shell/fixture_helpers_test.sh`

**Interfaces:**
- Consumes: `counter_helpers.sh` (`pass`/`fail` + `PASS`/`FAIL` counters),
  `fixture_helpers.sh` (`fixture`, `cleanup`, `TMP_DIRS`)
- Produces: the acceptance criteria for `fixture <varname>` that Task 2 must
  satisfy: sets the caller's variable to an existing dir; registers it in
  `TMP_DIRS`; git-inits with `commit.gpgsign false`; returns non-zero and
  registers nothing when `mktemp` fails; `cleanup` removes every tracked dir.

- [x] **Step 1: Write the failing test**

```bash
#!/usr/bin/env bash
# $KYAULabs: fixture_helpers_test.sh kyau@aura.kyaulabs 2026/08/17 -0700 Exp $


# ── Tests for tests/Shell/lib/fixture_helpers.sh ──────────────────────────────
#
# Exercises the subshell-safe fixture contract (issue #322): fixture <varname>
# must set the caller's variable and register the dir in TMP_DIRS so the
# EXIT-trap cleanup actually removes it; a failed mktemp must return non-zero
# and register nothing.
#
# fixture_helpers.sh owns the EXIT trap — do not source another
# trap-installing helper (e.g. test_helpers.sh) alongside it.

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
source "$REPO_ROOT/tests/Shell/lib/counter_helpers.sh"
source "$REPO_ROOT/tests/Shell/lib/fixture_helpers.sh"

# Test 1: fixture sets the caller's variable to an existing directory
dir=
fixture dir
if [ -n "$dir" ] && [ -d "$dir" ]; then
	pass 'fixture sets caller variable to an existing directory'
else
	fail "fixture did not set caller variable (dir='${dir:-unset}')"
fi

# Test 2: fixture registers the created dir in TMP_DIRS
case " ${TMP_DIRS[*]} " in
	*" $dir "*) pass 'fixture registers created dir in TMP_DIRS' ;;
	*) fail 'fixture did not register created dir in TMP_DIRS' ;;
esac

# Test 3: fixture initializes a git repo with gpgsign disabled
if [ -d "$dir/.git" ] && [ "$(git -C "$dir" config commit.gpgsign)" = 'false' ]; then
	pass 'fixture git-inits the dir and disables gpgsign'
else
	fail 'fixture did not git-init with gpgsign disabled'
fi

# Test 4: mktemp failure returns non-zero and registers nothing
shim=$(mktemp -d)
TMP_DIRS+=("$shim")
cat > "$shim/mktemp" <<'EOF'
#!/usr/bin/env bash
exit 1
EOF
chmod +x "$shim/mktemp"
before=${#TMP_DIRS[@]}
set +e
PATH="$shim:$PATH" fixture d2 >/dev/null 2>&1
rc=$?
set -e
if [ "$rc" -ne 0 ] && [ "${#TMP_DIRS[@]}" -eq "$before" ]; then
	pass 'mktemp failure returns non-zero and registers nothing'
else
	fail "mktemp failure: rc=$rc tracked_delta=$(( ${#TMP_DIRS[@]} - before ))"
fi

# Test 5: cleanup removes every tracked dir (runs last — the EXIT trap then
# re-runs cleanup on already-removed paths, which is a silent no-op)
last=
fixture last
[ -d "$last" ] && cleanup
if [ ! -d "$dir" ] && [ ! -d "$last" ] && [ ! -d "$shim" ]; then
	pass 'cleanup removes all tracked dirs'
else
	fail 'cleanup left tracked dirs behind'
fi

printf '\nfixture_helpers_test.sh: %d passed, %d failed\n' "$PASS" "$FAIL"
[ "$FAIL" -eq 0 ]

# vim: ft=sh sts=4 sw=4 ts=4 et :
```

- [x] **Step 2: Run test to verify it fails**

Run:
```bash
bash tests/Shell/fixture_helpers_test.sh
```
Expected: FAIL — with the current `fixture()` the arg is ignored, so Test 1
dies with `dir: unbound variable` (or, if run without `set -u` interference,
reports FAILs); Test 4's tracked_delta is non-zero. Any non-zero exit and any
FAIL count > 0 proves Red.

- [x] **Step 3: No implementation yet (red test only)**

Task 2 supplies the implementation.

- [x] **Step 4: Commit**

```bash
git add tests/Shell/fixture_helpers_test.sh
git commit -S -m $'test(shell): add fixture_helpers contract test for caller-shell tracking\n\nThe contract behind #322: fixture <varname> must set the caller\'s variable\nand register the dir in TMP_DIRS so the EXIT trap removes it, a failed\nmktemp must return non-zero and register nothing, and cleanup must remove\nevery tracked dir. Red test — the current fixture() fails it.\n\nRefs: #322\nAuthored-by: deepseek-v4-flash\nImplemented-by: deepseek-v4-flash\nTested-by: deepseek-v4-flash\nSigned-off-by: kyau <kyau@kyau.net>'
```

---

### Task 2: Caller-shell fixture interface + call sites (GREEN)

**Files:**
- Modify: `tests/Shell/lib/fixture_helpers.sh` (doc block + `fixture()`)
- Modify: `tests/Shell/resolve_identity_test.sh` (5 call sites: lines 18, 25,
  34, 50, 60)
- Modify: `tests/Shell/classify_greenfield_test.sh` (3 call sites: lines 32,
  36, 42)

**Interfaces:**
- Consumes: Task 1's contract test (must turn green).
- Produces: `fixture <varname>` — sets `<varname>` in the caller's shell via
  `printf -v`, registers the dir in `TMP_DIRS`, git-inits with `commit.gpgsign
  false`, returns non-zero (registering nothing) if `mktemp -d` fails. Caller
  variable must not be named `d`.

- [x] **Step 1: Update the doc contract in fixture_helpers.sh**

Replace the `Provides:` block:

```sh
# Provides:
#   - TMP_DIRS: array of directories to remove on exit
#   - cleanup: rm -rf every tracked dir (installed via `trap cleanup EXIT INT TERM`)
#   - fixture <varname>: mktemp -d, git init -q inside it, track it, then set
#     <varname> in the CALLER's shell to the new path (printf -v)
#
# fixture must be called directly (fixture dir), never via command
# substitution (dir=$(fixture)): a subshell's TMP_DIRS+=() is invisible to the
# parent, so the EXIT-trap cleanup would silently skip the dir (issue #322).
# On mktemp failure fixture returns non-zero and registers nothing. The caller
# variable must not be named 'd' (the function's own local).
```

- [x] **Step 2: Rewrite `fixture()`**

Replace:

```sh
fixture() { local d; d=$(mktemp -d); TMP_DIRS+=("$d"); git -C "$d" init -q; git -C "$d" config commit.gpgsign false; printf '%s' "$d"; }
```

with:

```sh
fixture() {
	local d
	d=$(mktemp -d) || return 1
	TMP_DIRS+=("$d")
	git -C "$d" init -q
	git -C "$d" config commit.gpgsign false
	printf -v "$1" '%s' "$d"
}
```

- [x] **Step 3: Update the 8 call sites**

In `tests/Shell/resolve_identity_test.sh`, replace all 5 occurrences of
`dir=$(fixture)` with `fixture dir`. In `tests/Shell/classify_greenfield_test.sh`,
replace all 3 occurrences of `dir=$(fixture)` with `fixture dir` (lines 32, 36,
42). Do NOT touch its `dir=$(mktemp -d); TMP_DIRS+=("$dir")` workaround in the
invalid-root test.

- [x] **Step 4: Run the tests to verify they pass**

```bash
bash tests/Shell/fixture_helpers_test.sh
bash tests/Shell/resolve_identity_test.sh
bash tests/Shell/classify_greenfield_test.sh
```
Expected: `fixture_helpers_test.sh: 5 passed, 0 failed` (Tests 1–5),
`resolve_identity_test.sh: 5 passed, 0 failed`,
`classify_greenfield_test.sh: 15 passed, 0 failed`. Exit status 0 each.

- [x] **Step 5: Verify no new leaks**

```bash
before=$(ls -d /tmp/tmp.* 2>/dev/null | wc -l)
bash tests/Shell/fixture_helpers_test.sh >/dev/null 2>&1
bash tests/Shell/resolve_identity_test.sh >/dev/null 2>&1
bash tests/Shell/classify_greenfield_test.sh >/dev/null 2>&1
after=$(ls -d /tmp/tmp.* 2>/dev/null | wc -l)
echo "leak delta: $((after - before))"
```
Expected: `leak delta: 0` (all fixture dirs cleaned by the EXIT trap).

- [x] **Step 6: Verify no stale call sites remain**

```bash
git grep -n 'dir=\$(fixture)' tests/Shell
```
Expected: no matches (exit 1). The only remaining `dir=$(mktemp -d)` is the
deliberate invalid-root workaround, which registers in the parent shell.

- [x] **Step 7: Commit**

```bash
git add tests/Shell/lib/fixture_helpers.sh tests/Shell/resolve_identity_test.sh tests/Shell/classify_greenfield_test.sh
git commit -S -m $'fix(shell-test): track fixture temp dirs in the caller shell\n\nfixture() was called via command substitution, so its TMP_DIRS+=() ran in\na subshell and the EXIT-trap cleanup never removed the created dirs — every\nfixture test run leaked a temp dir in /tmp. Change the interface to\nfixture <varname> with printf -v so registration happens in the caller\'s\nshell, add a failure guard for mktemp, and update the 8 call sites.\n\nFixes: #322\nAuthored-by: deepseek-v4-flash\nImplemented-by: deepseek-v4-flash\nTested-by: deepseek-v4-flash\nSigned-off-by: kyau <kyau@kyau.net>'
```

---

## Final verification

- [x] All three test files pass (Task 2 Step 4 outputs).
- [x] Leak delta 0 (Task 2 Step 5).
- [x] No stale `dir=$(fixture)` call sites (Task 2 Step 6).
- [ ] `/check` passes before push (delegates to `/check-php`; the shell-test
      changes are linted by shellcheck in CI — verify no new shellcheck
      findings on the changed files).
- [ ] Pre-existing `/tmp/tmp.*` garbage remains untouched (out of scope).

---

## Addendum: follow-up leak sweep (user-directed, same branch)

After #322's fix, the full `tests/Shell` suite still leaked ~50 `/tmp/tmp.*`
entries per run. Six pre-existing leak sources were identified and fixed on
this branch (all test-only changes; no production script changes):

| File | Leak | Root cause | Fix |
| :--- | :--- | :--- | :--- |
| `pr_command_test.sh` | 11 dirs | `x=$(new_standard_fixture)` — registration in subshell | caller-shell `<varname>` interface + 11 call sites + regression assertion |
| `script_executable_bits_test.sh` | 3 dirs | `repo=$(make_fixture ...)` — registration in subshell | `<varname>` interface + 3 call sites |
| `release_workflow_test.sh` | 3 dirs | `sim_dir=$(run_extraction_fixture ...)` — registration in subshell | `<varname>` interface + 6 call sites |
| `coverage_gate_test.sh` | 14 files | `CLOVER=$(mktemp)` bare files in /tmp, never registered | build clover inside the registered temp dir |
| `protected_push_tripwire_test.sh` | 13 files | `fake_log#=$(mktemp)` ×12 + `seq_file` never registered | register each |
| `setup_rulesets_test.sh` | 6 files | `register_temp_dir "$a" "$b"` — lib dropped all but `$1` | `register_temp_dir` now appends every arg |

Verification (all green): the six files pass with **leak delta 0** each
(coverage_gate 22/0, tripwire 12/0, pr_command 53/0, setup_rulesets 36/0,
script_executable_bits 5/0, release_workflow 47/0); full suite: 0 failures,
**suite leak delta 0**.

Two commits:
1. `fix(shell-test): register helper temp dirs in the caller shell` — the
   three `<varname>` helper conversions (subshell class).
2. `fix(shell-test): register remaining temp artifacts and honor multi-dir
   tracking` — register_temp_dir multi-arg, Clover-in-dir, fake_log/seq_file
   registration.
