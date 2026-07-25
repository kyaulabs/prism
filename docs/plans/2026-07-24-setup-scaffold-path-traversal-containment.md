# setup-scaffold.sh Path-Traversal Containment Implementation Plan

> **For agentic workers:** Implement this plan task-by-task using the @tdd
> agent. Steps use checkbox (`- [ ]`) syntax for tracking. Each task follows
> Red → Green → Refactor.

**Goal:** Close the path-traversal vulnerability in `setup-scaffold.sh` so that
targets and manifest entries can never resolve outside `REPO_ROOT` (or the
target root), and `gh repo clone` carries a `--` sentinel.

**Architecture:** Add two bash helper functions to the scaffold script —
`assert_path_contained` (generic realpath-containment check) and
`validate_target` (rejects empty/absolute/`..`/symlink-escape targets, returns
the canonical absolute path under `REPO_ROOT`). Wire `validate_target` into all
three write/preview subcommands (`check-only`, `clone`, `new`). Add manifest
source-containment to manifest reading and dest-containment to the copy loop.
Add `--` to `gh repo clone`. Migrate the existing shell tests (which currently
pass absolute `mktemp` paths — now rejected by design) onto a gitignored
`REPO_ROOT`-relative test-target helper, then add a full AC-1/AC-2/AC-3
security test matrix.

**Tech Stack:** Bash 4+, GNU coreutils `realpath -m` (Linux; standard on the
dev box and `ubuntu-latest` CI), the existing `tests/Shell/` shell-test harness
(`test_helpers.sh`: `pass`/`fail`/`register_temp_dir`/`can_symlink`).

## Global constraints

- **Security model:** the scaffold is a trust boundary (issue #193). Targets
  must be **relative** and must resolve **inside `REPO_ROOT`** via
  `realpath -m`. Absolute, empty, `..`-escape, and symlink-escape targets are
  **rejected** (AC-1). This matches the existing `should-prompt` design, which
  already resolves `project_folder` relative to `REPO_ROOT`.
- **Behavior change (intended):** `new`/`clone`/`check-only` no longer accept
  absolute paths. The script resolves every target to
  `$(realpath -m "$REPO_ROOT/$target")` and operates on that absolute path, so
  the current working directory no longer affects where files land.
- **`realpath -m`** resolves `..` and existing-prefix symlinks even for
  non-existent paths — this is what catches symlink-escape without the target
  needing to exist yet.
- **Conventional commit type:** `fix` (Security → `fix` per
  `docs/agents/labels.md`). Branch: `fix/<user>-<hash>-scaffold-path-traversal`.
- **No explanatory comments** unless requested (AGENTS.md). Every modified
  `.sh` keeps its RCS header + vim modeline.
- **Signed commits** (`git commit -S`). Footer model IDs: `Authored-by:
  glm-5.2`, `Tested-by: deepseek-v4-pro`, `Signed-off-by:` via
  `bash .github/scripts/resolve-identity.sh`.

---

## File structure

| File | Action | Responsibility |
| --- | --- | --- |
| `.github/scripts/setup-scaffold.sh` | Modify | Add `assert_path_contained` + `validate_target`; wire into `check-only`/`clone`/`new`; add manifest source-containment + dest-containment; add `--` to `gh repo clone`. |
| `tests/Shell/setup_scaffold_test.sh` | Modify | Add `make_test_target` helper; migrate existing absolute-target tests onto it; add AC-1/AC-2/AC-3 security test matrix. |
| `.gitignore` | Modify | Add `/.test-scaffold-tmp/` so test targets under `REPO_ROOT` don't pollute `git status` (Test 7 parity). |

---

## Task 1: Target containment validation (AC-1)

**Files:**
- Modify: `.github/scripts/setup-scaffold.sh` (add helpers after `guard_no_overwrite` ~line 55; rewire `check-only` ~107-130, `clone` ~132-163, `new` ~165-191)
- Modify: `tests/Shell/setup_scaffold_test.sh` (add helper + new tests + migrate existing tests)
- Modify: `.gitignore` (add one line)

**Interfaces:**
- Produces: `assert_path_contained <root> <path> [label]` (exits 1 on escape),
  `validate_target <target>` (echoes canonical absolute path on success, exits
  1 on rejection), `make_test_target` (test helper echoing a unique
  `REPO_ROOT`-relative path).

- [ ] **Step 1: Add the `.gitignore` entry**

Append to `.gitignore` (after the "Graphify" block, before "Editor files"):

```
# Scaffold test targets (setup-scaffold.sh containment tests — issue #193)
/.test-scaffold-tmp/
```

- [ ] **Step 2: Write the failing tests (Red)**

In `tests/Shell/setup_scaffold_test.sh`, add the `make_test_target` helper near
the top (after the `ROOT_CONFIGS` array, before Test 1) and the new AC-1
security tests before the `# ── Summary` block. Insert this block:

```bash
# ── Containment test helper ─────────────────────────────────────────────────
# make_test_target — echo a unique REPO_ROOT-relative target path that does
# NOT yet exist. The script resolves it to $REPO_ROOT/<path>. Register the
# parent "$REPO_ROOT/.test-scaffold-tmp" for EXIT cleanup. (issue #193)
make_test_target() {
	echo ".test-scaffold-tmp/target-${RANDOM}-$$"
}
```

Then add these AC-1 tests (insert before the `# ── Summary` line ~1063):

```bash
# ── Test 25: AC-1 — empty target rejected (all subcommands) ─────────────────

test_reject_empty_target() {
	local rc
	rc=0
	bash "$SCRIPT" new "" >/dev/null 2>&1 || rc=$?
	if [ "$rc" -eq 0 ]; then
		fail "AC-1 empty target — new accepted empty (expected non-zero)"
		return
	fi
	pass "AC-1 empty target — new rejects empty"
}

echo ""
echo "── Test 25: AC-1 — empty target rejected ──"
test_reject_empty_target

# ── Test 26: AC-1 — absolute target rejected ────────────────────────────────

test_reject_absolute_target() {
	local rc
	rc=0
	bash "$SCRIPT" new "/tmp/should-not-exist-$$" >/dev/null 2>&1 || rc=$?
	if [ "$rc" -eq 0 ]; then
		fail "AC-1 absolute target — new accepted absolute path"
		return
	fi
	# Must not have created anything
	if [ -d "/tmp/should-not-exist-$$" ]; then
		fail "AC-1 absolute target — created the absolute target"
		return
	fi
	pass "AC-1 absolute target — new rejects absolute path, creates nothing"
}

echo ""
echo "── Test 26: AC-1 — absolute target rejected ──"
test_reject_absolute_target

# ── Test 27: AC-1 — ../ traversal target rejected ───────────────────────────

test_reject_dotdot_target() {
	local rc
	rc=0
	bash "$SCRIPT" new "../../escape-attempt-$$" >/dev/null 2>&1 || rc=$?
	if [ "$rc" -eq 0 ]; then
		fail "AC-1 ../ target — new accepted ../ traversal"
		return
	fi
	pass "AC-1 ../ target — new rejects ../ traversal"
}

echo ""
echo "── Test 27: AC-1 — ../ traversal target rejected ──"
test_reject_dotdot_target

# ── Test 28: AC-1 — symlink-escape target rejected ──────────────────────────

test_reject_symlink_escape_target() {
	if ! can_symlink; then
		skip "AC-1 symlink-escape — symlinks unsupported on this platform"
		return
	fi
	local link_dir rc
	link_dir="$REPO_ROOT/.test-scaffold-tmp"
	mkdir -p "$link_dir"
	register_temp_dir "$link_dir"
	# Symlink that points OUTSIDE REPO_ROOT
	ln -sfn /tmp "$link_dir/escape-link-$$"
	rc=0
	bash "$SCRIPT" new ".test-scaffold-tmp/escape-link-$$/sub" >/dev/null 2>&1 || rc=$?
	if [ "$rc" -eq 0 ]; then
		fail "AC-1 symlink-escape — new followed symlink outside REPO_ROOT"
		return
	fi
	pass "AC-1 symlink-escape — new rejects symlink that escapes REPO_ROOT"
}

echo ""
echo "── Test 28: AC-1 — symlink-escape target rejected ──"
test_reject_symlink_escape_target

# ── Test 29: AC-1 — valid relative target still works ───────────────────────

test_valid_relative_target_works() {
	local target exit_code
	target=$(make_test_target)
	register_temp_dir "$REPO_ROOT/.test-scaffold-tmp"
	exit_code=0
	bash "$SCRIPT" new "$target" >/dev/null 2>&1 || exit_code=$?
	if [ "$exit_code" -ne 0 ]; then
		fail "AC-1 valid target — new rejected a legitimate relative target ($exit_code)"
		return
	fi
	if [ ! -d "$REPO_ROOT/$target/.git" ]; then
		fail "AC-1 valid target — .git not created at $REPO_ROOT/$target"
		return
	fi
	pass "AC-1 valid target — relative target scaffolds inside REPO_ROOT"
}

echo ""
echo "── Test 29: AC-1 — valid relative target still works ──"
test_valid_relative_target_works

# ── Test 30: AC-1 — check-only also validates containment ────────────────────

test_check_only_validates_containment() {
	local rc
	rc=0
	bash "$SCRIPT" --check-only "/tmp/absolute-$$" >/dev/null 2>&1 || rc=$?
	if [ "$rc" -eq 0 ]; then
		fail "AC-1 check-only — accepted absolute target"
		return
	fi
	pass "AC-1 check-only — rejects absolute target"
}

echo ""
echo "── Test 30: AC-1 — check-only validates containment ──"
test_check_only_validates_containment
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `bash tests/Shell/setup_scaffold_test.sh`
Expected: Tests 25–30 FAIL (no validation exists yet; `new` accepts bad targets).
Also expect Tests 3–7, 8–10, 12–17 to still pass at this point (validation not
yet wired in — they use absolute paths which are currently accepted).

- [ ] **Step 4: Implement the containment helpers (Green)**

In `.github/scripts/setup-scaffold.sh`, insert these two functions immediately
after `guard_no_overwrite()` (after line 55, before the `read_manifest_entries`
comment block):

```bash
# assert_path_contained <root> <path> [label]
# Canonicalizes <path> via realpath -m and exits 1 if it does not resolve
# inside <root>. <root> is resolved with realpath (must exist). Catches ..
# traversal, absolute escape, and symlink-escape in one check. (issue #193)
assert_path_contained() {
	local root="$1"
	local path="$2"
	local label="${3:-path}"
	local canon_root canon_path

	canon_root="$(realpath -- "$root")" || {
		echo "Error: cannot resolve containment root for $label: $root" >&2
		exit 1
	}
	canon_path="$(realpath -m -- "$path")" || {
		echo "Error: cannot resolve $label: $path" >&2
		exit 1
	}

	case "$canon_path" in
		"$canon_root"|"$canon_root"/*)
			return 0
			;;
		*)
			echo "Error: $label escapes containment root ($canon_root): $path" >&2
			exit 1
			;;
	esac
}

# validate_target <target>
# Security gate for user-supplied targets (issue #193, AC-1). Rejects empty,
# absolute, ..-traversal, and symlink-escape targets. On success, echoes the
# canonical absolute path under REPO_ROOT for all subsequent operations (so
# the working directory cannot relocate writes). Exits 1 on rejection.
validate_target() {
	local target="$1"
	local canon_root canon_path

	if [ -z "$target" ]; then
		echo "Error: target path is empty" >&2
		exit 1
	fi

	case "$target" in
		/*)
			echo "Error: target must be a relative path (absolute rejected): $target" >&2
			exit 1
			;;
	esac

	canon_root="$(realpath -- "$REPO_ROOT")"
	canon_path="$(realpath -m -- "$canon_root/$target")"

	case "$canon_path" in
		"$canon_root"|"$canon_root"/*)
			echo "$canon_path"
			;;
		*)
			echo "Error: target escapes repository root ($canon_root): $target" >&2
			exit 1
			;;
	esac
}
```

- [ ] **Step 5: Wire validate_target into the three subcommands**

**`check-only`** — replace the target-handling block (currently ~lines 113-122).
Change from:

```bash
		if [ -z "$target" ]; then
			echo "Error: target path required" >&2
			exit 1
		fi

		# ── AC-2: No-overwrite guard ───────────────────────────────────────

		guard_no_overwrite "$target"
```

to:

```bash
		# ── AC-1: containment + AC-2: no-overwrite guard ──────────────────

		canon_target="$(validate_target "$target")"
		guard_no_overwrite "$canon_target"
```

and update the echo line further down to reference `$canon_target`:

```bash
		echo "Would copy ${#manifest_entries[@]} files into $canon_target:"
```

**`clone`** — after the `owner_repo`/`target` empty-check usage block
(currently ~lines 133-146), replace `guard_no_overwrite "$target"` with
containment + guard, and use the canonical target for clone + copy. Change:

```bash
		# AC-2: No-overwrite guard
		guard_no_overwrite "$target"
```

to:

```bash
		# AC-1: containment + AC-2: no-overwrite guard
		canon_target="$(validate_target "$target")"
		guard_no_overwrite "$canon_target"
```

Then update the `gh repo clone` and `copy_quality_surface` lines (these are
also touched by Task 3 for the `--` sentinel; for now change `$target` →
`$canon_target`):

```bash
		gh repo clone "$owner_repo" "$canon_target" || {
```

and

```bash
		copy_quality_surface "$canon_target"
		echo "Cloned $owner_repo to $canon_target and copied ${#manifest_entries[@]} quality-surface files."
```

**`new`** — replace the target-handling block (currently ~lines 166-189).
Change from:

```bash
		if [ -z "$target" ]; then
			echo "Error: target path required" >&2
			exit 1
		fi

		# AC-2: No-overwrite guard
		guard_no_overwrite "$target"
```

to:

```bash
		# AC-1: containment + AC-2: no-overwrite guard
		canon_target="$(validate_target "$target")"
		guard_no_overwrite "$canon_target"
```

and change the `mkdir`/`git init`/`copy`/`echo` lines to use `$canon_target`:

```bash
		mkdir -p -- "$canon_target"
		trap 'rm -rf -- "$canon_target"; exit 1' ERR
		git init -- "$canon_target"
		trap - ERR  # git init succeeded — disable cleanup trap

		# Copy the quality surface into the fresh repo (ADR-0026)
		copy_quality_surface "$canon_target"
		echo "Scaffolded new project at $canon_target with ${#manifest_entries[@]} quality-surface files."
```

- [ ] **Step 6: Migrate existing tests onto make_test_target**

Every existing test that creates a temp target with `temp_target=$(mktemp -d)`
and passes it to the script must switch to `make_test_target` (relative under
`REPO_ROOT`). For each of these tests, apply this transformation:

**Before** (representative — Test 3):
```bash
	temp_target=$(mktemp -d)
	register_temp_dir "$temp_target"
	rmdir "$temp_target"  # target must NOT exist
```
**After:**
```bash
	temp_target=$(make_test_target)
	register_temp_dir "$REPO_ROOT/.test-scaffold-tmp"
```

Apply to Tests **3, 4, 5, 6, 7, 8, 9, 10, 12, 13, 14, 15, 16, 17** — every test
that builds a `temp_target`/`temp_parent` from `mktemp` and feeds it to the
script. Notes for specific tests:

- **Test 4** (`test_check_only_existing_dir`): it pre-creates the target so the
  no-overwrite guard fires. Change to pre-create under `REPO_ROOT`:
  ```bash
  	temp_target=$(make_test_target)
  	register_temp_dir "$REPO_ROOT/.test-scaffold-tmp"
  	mkdir -p "$REPO_ROOT/$temp_target"
  ```
  and update the sentinel path to `"$REPO_ROOT/$temp_target/do-not-touch.txt"`,
  and the script invocation stays `"$SCRIPT" --check-only "$temp_target"` (the
  script resolves it to `REPO_ROOT/$temp_target` internally).

- **Test 5** (`test_check_only_existing_file`): same pattern — use
  `make_test_target`, write the file at `$REPO_ROOT/$temp_target`.

- **Test 7** (`test_check_only_no_git_mutation`): use `make_test_target`. With
  `/.test-scaffold-tmp/` gitignored, `git status --porcelain` stays clean. The
  before/after comparison still holds.

- **Test 9** (`test_clone_missing_gh`): keep the `env PATH=...` isolation, just
  swap the temp target for `make_test_target`.

- **Tests 8, 10, 12, 17** (clone tests with `fake_gh_setup`): the fake `gh`
  records args to `$FAKE_GH_LOG` and creates `${4:-}` (the 4th arg = target).
  Since the script now passes the canonical absolute target as arg 4, the fake
  gh's `mkdir -p "${4:-}"` still works (it's now an absolute `$REPO_ROOT/...`
  path). Update the recorded-args assertion in Test 8 to match the canonical
  path: replace the literal `$temp_target` in the `grep` with
  `"$REPO_ROOT/$temp_target"` OR grep only for `repo clone` + the repo name
  (the `--` sentinel assertion is added in Task 3).

- **Test 16** (`test_trap_cleanup_on_git_failure`): fake `git` exits 1; swap
  the target to `make_test_target`; assert the partial dir
  `$REPO_ROOT/$temp_target` is removed by the trap.

- **Test 24** (`test_new_leading_dash_target`): this test `cd`s into a parent
  and runs `new "-dash-target"`. Under the new model the script resolves
  `$REPO_ROOT/-dash-target`. Update: create the target under
  `.test-scaffold-tmp`, and assert `$REPO_ROOT/.test-scaffold-tmp/-dash-target/.git`
  exists. Keep the `--` sentinel intent (it exercises mkdir/git hardening).

> ⚠️ **This is the largest step.** Take it test-by-test: migrate one, run the
> file, confirm it passes, move to the next. The `register_temp_dir
> "$REPO_ROOT/.test-scaffold-tmp"` call is idempotent (dedup not required —
> `rm -rf` on the same path twice is harmless).

- [ ] **Step 7: Run the full suite to verify green**

Run: `bash tests/Shell/setup_scaffold_test.sh`
Expected: all tests PASS (1–30), zero FAIL.

- [ ] **Step 8: Refactor**

Review the helpers for clarity. Confirm no debug artifacts. Ensure
`declare(strict_types=1)` N/A (bash). Confirm RCS headers + vim modelines intact.

- [ ] **Step 9: Commit**

```bash
git add .github/scripts/setup-scaffold.sh tests/Shell/setup_scaffold_test.sh .gitignore
git commit -S -m $'fix(scaffold): contain targets inside REPO_ROOT (AC-1)\n\nReject empty, absolute, ../-traversal, and symlink-escape targets via\nrealpath -m containment against REPO_ROOT. Targets now resolve to a\ncanonical absolute path under REPO_ROOT so the working directory cannot\nrelocate writes. Migrates existing tests onto a gitignored relative\ntest-target helper.\n\nRefs: #193\nAuthored-by: glm-5.2\nTested-by: deepseek-v4-pro\nSigned-off-by: <resolved via bash .github/scripts/resolve-identity.sh>'
```

---

## Task 2: Manifest entry bounding (AC-2)

**Files:**
- Modify: `.github/scripts/setup-scaffold.sh` (`read_manifest_entries` ~61-78, `copy_quality_surface` ~84-98)
- Modify: `tests/Shell/setup_scaffold_test.sh` (add AC-2 tests)

**Interfaces:**
- Consumes: `assert_path_contained` (from Task 1).
- Produces: source-containment validation inside `read_manifest_entries`;
  dest-containment validation inside `copy_quality_surface`.

- [ ] **Step 1: Write the failing tests (Red)**

Add before the `# ── Summary` block in `tests/Shell/setup_scaffold_test.sh`:

```bash
# ── Test 31: AC-2 — manifest entry with ../ is rejected (source) ────────────

test_reject_manifest_dotdot() {
	local bad_manifest target exit_code output
	bad_manifest=$(mktemp)
	register_temp_dir "$bad_manifest"
	printf '%s\n' "composer.json" "../../etc/passwd" > "$bad_manifest"
	target=$(make_test_target)
	register_temp_dir "$REPO_ROOT/.test-scaffold-tmp"

	exit_code=0
	output=$("$SCRIPT" --manifest "$bad_manifest" new "$target" 2>&1) || exit_code=$?
	if [ "$exit_code" -eq 0 ]; then
		fail "AC-2 manifest ../ — accepted an entry that escapes REPO_ROOT"
		return
	fi
	if ! echo "$output" | grep -qi "manifest"; then
		fail "AC-2 manifest ../ — error did not mention manifest"
		return
	fi
	pass "AC-2 manifest ../ — entry escaping REPO_ROOT is rejected"
}

echo ""
echo "── Test 31: AC-2 — manifest ../ entry rejected ──"
test_reject_manifest_dotdot

# ── Test 32: AC-2 — manifest entry with absolute path rejected (source) ─────

test_reject_manifest_absolute() {
	local bad_manifest target exit_code
	bad_manifest=$(mktemp)
	register_temp_dir "$bad_manifest"
	printf '%s\n' "/etc/passwd" > "$bad_manifest"
	target=$(make_test_target)
	register_temp_dir "$REPO_ROOT/.test-scaffold-tmp"

	exit_code=0
	"$SCRIPT" --manifest "$bad_manifest" new "$target" >/dev/null 2>&1 || exit_code=$?
	if [ "$exit_code" -eq 0 ]; then
		fail "AC-2 manifest absolute — accepted an absolute manifest entry"
		return
	fi
	pass "AC-2 manifest absolute — absolute entry rejected"
}

echo ""
echo "── Test 32: AC-2 — manifest absolute entry rejected ──"
test_reject_manifest_absolute

# ── Test 33: AC-2 — clean manifest still copies successfully ────────────────

test_clean_manifest_copies() {
	local target exit_code
	target=$(make_test_target)
	register_temp_dir "$REPO_ROOT/.test-scaffold-tmp"

	exit_code=0
	bash "$SCRIPT" new "$target" >/dev/null 2>&1 || exit_code=$?
	if [ "$exit_code" -ne 0 ]; then
		fail "AC-2 clean manifest — valid manifest rejected ($exit_code)"
		return
	fi
	if [ ! -f "$REPO_ROOT/$target/composer.json" ]; then
		fail "AC-2 clean manifest — composer.json not copied"
		return
	fi
	pass "AC-2 clean manifest — legitimate entries copy under target"
}

echo ""
echo "── Test 33: AC-2 — clean manifest copies successfully ──"
test_clean_manifest_copies
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `bash tests/Shell/setup_scaffold_test.sh`
Expected: Tests 31–32 FAIL (manifest entries not validated); Test 33 PASS.

- [ ] **Step 3: Add source-containment to read_manifest_entries (Green)**

In `.github/scripts/setup-scaffold.sh`, add a containment loop at the end of
`read_manifest_entries()` — after the empty-check block (after line 77), before
the closing `}`:

```bash
	# AC-2: every entry must resolve inside REPO_ROOT (source containment).
	# Rejects absolute entries and ../ traversal before any copy happens.
	local _entry _canon_root
	_canon_root="$(realpath -- "$REPO_ROOT")"
	for _entry in "${manifest_entries[@]}"; do
		case "$_entry" in
			/*)
				echo "Error: manifest entry must be relative (absolute rejected): $_entry" >&2
				exit 1
				;;
		esac
		assert_path_contained "$_canon_root" "$_canon_root/$_entry" "manifest entry"
	done
```

- [ ] **Step 4: Add dest-containment to copy_quality_surface**

In `copy_quality_surface()`, add a canonical-target resolution and a per-entry
dest containment check. Change the function body (currently ~lines 84-98) to:

```bash
copy_quality_surface() {
	local target="$1"
	local entry
	local canon_target

	canon_target="$(realpath -m -- "$target")"

	for entry in "${manifest_entries[@]}"; do
		if [ ! -f "$REPO_ROOT/$entry" ]; then
			echo "Error: source file not found (manifest forward parity broken): $entry" >&2
			exit 1
		fi
		# AC-2: dest containment — entry must resolve inside the target root.
		assert_path_contained "$canon_target" "$canon_target/$entry" "manifest destination"
		# '--' sentinels guard against a $target whose name starts with '-'
		# (SAST: mkdir/cp option-injection hardening).
		mkdir -p -- "$target/$(dirname "$entry")"
		cp -- "$REPO_ROOT/$entry" "$target/$entry"
	done
}
```

- [ ] **Step 5: Run the full suite to verify green**

Run: `bash tests/Shell/setup_scaffold_test.sh`
Expected: all tests PASS (1–33), zero FAIL.

- [ ] **Step 6: Commit**

```bash
git add .github/scripts/setup-scaffold.sh tests/Shell/setup_scaffold_test.sh
git commit -S -m $'fix(scaffold): bound manifest entries inside source/dest roots (AC-2)\n\nValidate every manifest entry resolves inside REPO_ROOT at read time\n(source containment) and inside the target root at copy time (dest\ncontainment). Rejects absolute entries and ../ traversal in the\nPR-controllable manifest.\n\nRefs: #193\nAuthored-by: glm-5.2\nTested-by: deepseek-v4-pro\nSigned-off-by: <resolved via bash .github/scripts/resolve-identity.sh>'
```

---

## Task 3: gh repo clone -- sentinel (AC-3)

**Files:**
- Modify: `.github/scripts/setup-scaffold.sh` (`clone` subcommand, `gh repo clone` line)
- Modify: `tests/Shell/setup_scaffold_test.sh` (Test 8 assertion + new AC-3 test)

**Interfaces:**
- Consumes: the `clone` subcommand and the `fake_gh_setup` test helper.

- [ ] **Step 1: Write the failing test (Red)**

Add before the `# ── Summary` block:

```bash
# ── Test 34: AC-3 — gh repo clone includes -- sentinel ──────────────────────

test_clone_has_double_dash_sentinel() {
	local fake_bin target fake_log exit_code recorded
	fake_bin=$(mktemp -d)
	register_temp_dir "$fake_bin"

	fake_log=$(mktemp)
	: > "$fake_log"
	export FAKE_GH_LOG="$fake_log"

	fake_gh_setup "$fake_bin" 0

	target=$(make_test_target)
	register_temp_dir "$REPO_ROOT/.test-scaffold-tmp"

	exit_code=0
	env PATH="$fake_bin:$PATH" "$SCRIPT" clone "owner/repo" "$target" >/dev/null 2>&1 || exit_code=$?
	if [ "$exit_code" -ne 0 ]; then
		fail "AC-3 -- sentinel — clone failed ($exit_code)"
		unset FAKE_GH_LOG
		return
	fi

	# The recorded args must contain " -- " between "repo clone" and the operands.
	recorded=$(cat "$fake_log")
	if ! echo "$recorded" | grep -q -- "-- owner/repo"; then
		fail "AC-3 -- sentinel — gh not invoked with -- before operands: '$recorded'"
		unset FAKE_GH_LOG
		return
	fi

	unset FAKE_GH_LOG
	pass "AC-3 -- sentinel — gh repo clone invoked with -- before operands"
}

echo ""
echo "── Test 34: AC-3 — gh repo clone -- sentinel ──"
test_clone_has_double_dash_sentinel
```

- [ ] **Step 2: Run tests to verify it fails**

Run: `bash tests/Shell/setup_scaffold_test.sh`
Expected: Test 34 FAIL (no `--` in the recorded args yet).

- [ ] **Step 3: Add the -- sentinel (Green)**

In `.github/scripts/setup-scaffold.sh`, in the `clone` subcommand, change:

```bash
		gh repo clone "$owner_repo" "$canon_target" || {
```

to:

```bash
		gh repo clone -- "$owner_repo" "$canon_target" || {
```

Also update the Test 8 (`test_clone_success`) recorded-args assertion to
tolerate the `--`. Change the grep:

```bash
	if ! echo "$recorded" | grep -q "repo clone $repo $temp_target"; then
```

to grep for the repo name and canonical target with the sentinel:

```bash
	if ! echo "$recorded" | grep -q -- "repo clone -- $repo "; then
```

(Test 8's `$temp_target` is now `$REPO_ROOT/$temp_target` after the Task 1
migration; grepping for `repo clone -- $repo ` is robust to the path change.)

- [ ] **Step 4: Run the full suite to verify green**

Run: `bash tests/Shell/setup_scaffold_test.sh`
Expected: all tests PASS (1–34), zero FAIL.

- [ ] **Step 5: Commit**

```bash
git add .github/scripts/setup-scaffold.sh tests/Shell/setup_scaffold_test.sh
git commit -S -m $'fix(scaffold): add -- sentinel to gh repo clone (AC-3)\n\nInsert a -- sentinel before the operands of gh repo clone to guard\nagainst option-injection from a target or owner/repo whose name begins\nwith a dash.\n\nRefs: #193\nAuthored-by: glm-5.2\nTested-by: deepseek-v4-pro\nSigned-off-by: <resolved via bash .github/scripts/resolve-identity.sh>'
```

---

## Verification (after all tasks)

- [ ] `bash tests/Shell/setup_scaffold_test.sh` — 34/34 PASS.
- [ ] `shellcheck .github/scripts/setup-scaffold.sh` — clean.
- [ ] `/check` — full pre-push gate green.
- [ ] `@code-review` — clean before push.
- [ ] Manual: `bash .github/scripts/setup-scaffold.sh new "../../evil"` exits
  non-zero with a containment error; `bash .github/scripts/setup-scaffold.sh
  new ".test-scaffold-tmp/ok"` succeeds under `REPO_ROOT`.

## Self-review

- **Spec/issue coverage:** AC-1 (reject absolute/`..`/symlink/empty targets) →
  Task 1, Tests 25–30. AC-2 (manifest entries cannot escape source/dest roots)
  → Task 2, Tests 31–33. AC-3 (`gh repo clone` includes `--`) → Task 3,
  Test 34. All three acceptance criteria covered.
- **Placeholder scan:** no TBD/TODO; every code step shows complete code;
  commit messages carry full footers.
- **Type consistency:** `validate_target` echoes a canonical absolute path
  consumed as `$canon_target` uniformly in all three subcommands and
  `copy_quality_surface`; `assert_path_contained` signature
  `<root> <path> [label]` is identical in all call sites.
- **Behavior change flagged:** absolute targets are now rejected by design
  (documented in Global constraints); existing tests migrated accordingly.
