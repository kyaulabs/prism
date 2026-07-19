#!/usr/bin/env bash
# $KYAULabs: setup_scaffold_test.sh kyau@nova 2026/07/18 -0700 Exp $








# ── Tests for setup-scaffold.sh and quality-surface manifest ─────────────────
# Verifies manifest parity (ADR-0026): every entry in the manifest exists on
# disk, and every quality-surface file is listed in the manifest.

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
source "$REPO_ROOT/tests/Shell/lib/test_helpers.sh"

setup_result_file

MANIFEST="$REPO_ROOT/.github/scripts/quality-surface.manifest"
SCRIPT="$REPO_ROOT/.github/scripts/setup-scaffold.sh"

# ── Exclusion list for reverse-parity check ─────────────────────────────────
# Files in scope directories that are intentionally NOT in the manifest.
# Each entry needs a one-line rationale comment.
declare -A REVERSE_EXCLUSIONS=(
	# Harness-only: validates opencode skill frontmatter; not copied to scaffolded projects
	[".github/scripts/check-skill-frontmatter.sh"]=1
)

# ── Scope directories for reverse-parity check ──────────────────────────────
# Every file under these directories (non-recursive) must appear in the
# manifest unless listed in REVERSE_EXCLUSIONS.
SCOPE_DIRS=(
	".github/hooks"
	".github/scripts"
	".github/workflows"
	".github/ISSUE_TEMPLATE"
	".semgrep"
	".opencodereview"
	"tests/Shell/lib"
)

# ── Root config files checked individually ──────────────────────────────────
ROOT_CONFIGS=(
	"composer.json"
	"composer.lock"
	"package.json"
	"package-lock.json"
	"phpunit.xml"
	".php-cs-fixer.dist.php"
	".stylelintrc.json"
	"eslint.config.mjs"
	"commitlint.config.js"
	"tsconfig.json"
	"cliff.toml"
)

# ── Test 1: Manifest forward parity (no stale entries) ──────────────────────

test_manifest_forward_parity() {
	local missing=()
	local line entry

	if [ ! -f "$MANIFEST" ]; then
		fail "manifest file not found: $MANIFEST"
		return
	fi

	while IFS= read -r line; do
		# Strip trailing carriage return (Windows line endings)
		line="${line%$'\r'}"
		# Skip blank lines and comments
		[[ -z "$line" || "$line" == \#* ]] && continue

		entry="$line"
		if [ ! -f "$REPO_ROOT/$entry" ]; then
			missing+=("$entry")
		fi
	done < "$MANIFEST"

	if [ ${#missing[@]} -eq 0 ]; then
		pass "forward parity — all manifest entries exist on disk"
	else
		fail "forward parity — ${#missing[@]} manifest entr${missing[*]:+ies} not found on disk:"
		for m in "${missing[@]}"; do
			echo "         $m" >&2
		done
	fi
}

echo ""
echo "── Test 1: Manifest forward parity (no stale entries) ──"
test_manifest_forward_parity

# ── Test 2: Manifest reverse parity (no missing entries) ────────────────────

test_manifest_reverse_parity() {
	local unlisted=()
	local dir entry full_path

	if [ ! -f "$MANIFEST" ]; then
		fail "manifest file not found: $MANIFEST"
		return
	fi

	# Build a lookup set from the manifest (non-comment, non-blank lines)
	declare -A manifest_set
	while IFS= read -r line; do
		line="${line%$'\r'}"
		[[ -z "$line" || "$line" == \#* ]] && continue
		manifest_set["$line"]=1
	done < "$MANIFEST"

	# Check scope directories (non-recursive)
	for dir in "${SCOPE_DIRS[@]}"; do
		if [ ! -d "$REPO_ROOT/$dir" ]; then
			continue
		fi
		for entry in "$REPO_ROOT/$dir"/*; do
			[ -e "$entry" ] || continue
			full_path="${entry#$REPO_ROOT/}"
			# Skip if excluded
			[ -n "${REVERSE_EXCLUSIONS[$full_path]:-}" ] && continue
			# Skip if in manifest
			[ -n "${manifest_set[$full_path]:-}" ] && continue
			unlisted+=("$full_path")
		done
	done

	# Check root config files
	for entry in "${ROOT_CONFIGS[@]}"; do
		full_path="$entry"
		[ -n "${manifest_set[$full_path]:-}" ] && continue
		unlisted+=("$full_path")
	done

	if [ ${#unlisted[@]} -eq 0 ]; then
		pass "reverse parity — all quality-surface files are listed in manifest"
	else
		fail "reverse parity — ${#unlisted[@]} file${unlisted[*]:+s} in scope but not in manifest:"
		for u in "${unlisted[@]}"; do
			echo "         $u" >&2
		done
	fi
}

echo ""
echo "── Test 2: Manifest reverse parity (no missing entries) ──"
test_manifest_reverse_parity

# ── Test 3: --check-only on absent target prints plan, touches nothing (AC-1) ──

test_check_only_absent_target() {
	local temp_target exit_code output
	temp_target=$(mktemp -d)
	register_temp_dir "$temp_target"
	rmdir "$temp_target"  # target must NOT exist

	exit_code=0
	output=$("$SCRIPT" --check-only "$temp_target" 2>&1) || exit_code=$?

	if [ "$exit_code" -ne 0 ]; then
		fail "check-only absent target — exit code $exit_code (expected 0)"
		return
	fi

	# Output must include the plan summary
	if ! echo "$output" | grep -q "Would copy"; then
		fail "check-only absent target — no 'Would copy' summary in output"
		return
	fi

	# Output must mention manifest entries (spot-check one known entry)
	if ! echo "$output" | grep -q "test_helpers.sh"; then
		fail "check-only absent target — no manifest entries in output"
		return
	fi

	# Target path must NOT have been created
	if [ -e "$temp_target" ]; then
		fail "check-only absent target — $temp_target was created (should not be)"
		return
	fi

	pass "check-only absent target — prints plan, touches nothing"
}

echo ""
echo "── Test 3: --check-only on absent target prints plan, touches nothing (AC-1) ──"
test_check_only_absent_target

# ── Test 4: target folder pre-exists → halt, non-zero exit, no mutation (AC-2) ──

test_check_only_existing_dir() {
	local temp_target sentinel exit_code output checksum_before checksum_after
	temp_target=$(mktemp -d)
	register_temp_dir "$temp_target"

	# Place a sentinel file with known content
	sentinel="$temp_target/do-not-touch.txt"
	echo "pre-existing content" > "$sentinel"
	checksum_before=$(sha256sum "$sentinel" | awk '{print $1}')

	exit_code=0
	output=$("$SCRIPT" --check-only "$temp_target" 2>&1) || exit_code=$?

	if [ "$exit_code" -eq 0 ]; then
		fail "check-only existing dir — exit code 0 (expected non-zero)"
		return
	fi

	# Error message must name the target
	if ! echo "$output" | grep -q "$temp_target"; then
		fail "check-only existing dir — error message doesn't name the target"
		return
	fi

	# Sentinel must be unchanged
	if [ ! -f "$sentinel" ]; then
		fail "check-only existing dir — sentinel file was removed"
		return
	fi
	checksum_after=$(sha256sum "$sentinel" | awk '{print $1}')
	if [ "$checksum_before" != "$checksum_after" ]; then
		fail "check-only existing dir — sentinel file was mutated"
		return
	fi

	pass "check-only existing dir — halts with non-zero exit, no mutation"
}

echo ""
echo "── Test 4: target folder pre-exists → halt, non-zero exit, no mutation (AC-2) ──"
test_check_only_existing_dir

# ── Test 5: target is an existing FILE → halt, non-zero exit (AC-2 file case) ──

test_check_only_existing_file() {
	local temp_parent temp_target exit_code output checksum_before checksum_after
	temp_parent=$(mktemp -d)
	register_temp_dir "$temp_parent"

	# Create the target as a regular file (not a directory)
	temp_target="$temp_parent/my-scaffold"
	echo "i am a file, not a directory" > "$temp_target"
	checksum_before=$(sha256sum "$temp_target" | awk '{print $1}')

	exit_code=0
	output=$("$SCRIPT" --check-only "$temp_target" 2>&1) || exit_code=$?

	if [ "$exit_code" -eq 0 ]; then
		fail "check-only existing file — exit code 0 (expected non-zero)"
		return
	fi

	# Error message must name the target
	if ! echo "$output" | grep -q "$temp_target"; then
		fail "check-only existing file — error message doesn't name the target"
		return
	fi

	# File must be unchanged
	checksum_after=$(sha256sum "$temp_target" | awk '{print $1}')
	if [ "$checksum_before" != "$checksum_after" ]; then
		fail "check-only existing file — file was mutated"
		return
	fi

	pass "check-only existing file — halts with non-zero exit, file unchanged"
}

echo ""
echo "── Test 5: target is an existing FILE → halt, non-zero exit (AC-2 file case) ──"
test_check_only_existing_file

# ── Test 6: manifest validation — missing manifest → clear error, non-zero exit ──

test_manifest_missing_error() {
	local temp_target exit_code output
	temp_target=$(mktemp -d)
	register_temp_dir "$temp_target"
	rmdir "$temp_target"

	exit_code=0
	output=$("$SCRIPT" --manifest /nonexistent/path/quality-surface.manifest --check-only "$temp_target" 2>&1) || exit_code=$?

	if [ "$exit_code" -eq 0 ]; then
		fail "missing manifest — exit code 0 (expected non-zero)"
		return
	fi

	# Error message must mention "manifest" (case-insensitive)
	if ! echo "$output" | grep -qi "manifest"; then
		fail "missing manifest — error message doesn't mention manifest"
		return
	fi

	pass "missing manifest — clear error, non-zero exit"
}

echo ""
echo "── Test 6: manifest validation — missing manifest (architect condition #4) ──"
test_manifest_missing_error

# ── Test 7: template .git untouched after check-only (AC-12) ──

test_check_only_no_git_mutation() {
	local temp_target before after exit_code
	temp_target=$(mktemp -d)
	register_temp_dir "$temp_target"
	rmdir "$temp_target"

	before=$(git -C "$REPO_ROOT" status --porcelain 2>&1)

	exit_code=0
	"$SCRIPT" --check-only "$temp_target" > /dev/null 2>&1 || exit_code=$?
	# check-only on absent target should succeed (exit 0); even if it fails,
	# we care about git mutation, not exit code

	after=$(git -C "$REPO_ROOT" status --porcelain 2>&1)

	if [ "$before" != "$after" ]; then
		fail "check-only mutated git working tree — status diff:"
		echo "  BEFORE: $before" >&2
		echo "  AFTER:  $after" >&2
		return
	fi

	pass "check-only does not mutate template .git or working tree"
}

echo ""
echo "── Test 7: template .git untouched after check-only (AC-12) ──"
test_check_only_no_git_mutation

# ── Helpers for clone tests ────────────────────────────────────────────────────
# fake_gh_setup <fake_bin_dir> [exit_code]
# Creates a fake `gh` script in <fake_bin_dir> that records its args to a log
# file ($FAKE_GH_LOG) and exits with <exit_code> (default 0). On success
# (exit_code=0), also creates the target directory to simulate `gh repo clone`.
fake_gh_setup() {
	local bin_dir="$1"
	local exit_code="${2:-0}"
	local fake_gh="$bin_dir/gh"

	# Record invocation args regardless of exit code
	cat > "$fake_gh" <<GH_SCRIPT
#!/usr/bin/env bash
echo "\$@" >> "\${FAKE_GH_LOG:?FAKE_GH_LOG not set}"
GH_SCRIPT

	# Only simulate directory creation on success (non-zero exit means failure)
	if [ "$exit_code" -eq 0 ]; then
		cat >> "$fake_gh" <<'GH_SCRIPT'
mkdir -p "${4:-}" 2>/dev/null || true
GH_SCRIPT
	fi

	cat >> "$fake_gh" <<GH_SCRIPT
exit $exit_code
GH_SCRIPT

	chmod +x "$fake_gh"
}

# ── Test 8: clone success path ──────────────────────────────────────────────

test_clone_success() {
	local fake_bin temp_target fake_log exit_code output recorded repo
	fake_bin=$(mktemp -d)
	register_temp_dir "$fake_bin"

	fake_log=$(mktemp)
	: > "$fake_log"
	export FAKE_GH_LOG="$fake_log"

	fake_gh_setup "$fake_bin" 0

	temp_target=$(mktemp -d)
	register_temp_dir "$temp_target"
	rmdir "$temp_target"  # target must NOT exist

	repo="testowner/testrepo"

	exit_code=0
	output=$(env PATH="$fake_bin:$PATH" "$SCRIPT" clone "$repo" "$temp_target" 2>&1) || exit_code=$?

	if [ "$exit_code" -ne 0 ]; then
		fail "clone success — exit code $exit_code (expected 0)"
		echo "  output: $output" >&2
		return
	fi

	# Fake gh must have been invoked with correct subcommand + args
	recorded=$(cat "$fake_log")
	if ! echo "$recorded" | grep -q "repo clone $repo $temp_target"; then
		fail "clone success — fake gh not invoked with expected args: got '$recorded'"
		return
	fi

	# Target must have been created
	if [ ! -d "$temp_target" ]; then
		fail "clone success — target directory was not created"
		return
	fi

	unset FAKE_GH_LOG
	pass "clone success — gh repo clone invoked with correct args, target created"
}

echo ""
echo "── Test 8: clone success path ──"
test_clone_success

# ── Test 9: missing gh on PATH → exit 2 ─────────────────────────────────────

test_clone_missing_gh() {
	local temp_target exit_code output
	temp_target=$(mktemp -d)
	register_temp_dir "$temp_target"
	rmdir "$temp_target"  # target must NOT exist

	exit_code=0
	# PATH=/usr/bin provides dirname (needed by SCRIPT_DIR resolution) but
	# excludes /ucrt64/bin/gh. No fake gh is created.
	output=$(env PATH="/usr/bin" bash "$SCRIPT" clone "owner/repo" "$temp_target" 2>&1) || exit_code=$?

	if [ "$exit_code" -ne 2 ]; then
		fail "clone missing gh — exit code $exit_code (expected 2)"
		echo "  output: $output" >&2
		return
	fi

	# Clear error message mentioning gh / GitHub CLI
	if ! echo "$output" | grep -qi "gh"; then
		fail "clone missing gh — error message doesn't mention gh/GitHub CLI"
		echo "  output: $output" >&2
		return
	fi

	# No partial state — target must NOT have been created
	if [ -d "$temp_target" ]; then
		fail "clone missing gh — partial state left at $temp_target"
		return
	fi

	pass "clone missing gh — exit 2, clear error, no partial state"
}

echo ""
echo "── Test 9: missing gh on PATH → exit 2 ──"
test_clone_missing_gh

# ── Test 10: gh auth failure → exit 2, no partial state ─────────────────────

test_clone_auth_failure() {
	local fake_bin temp_target fake_log exit_code output
	fake_bin=$(mktemp -d)
	register_temp_dir "$fake_bin"

	fake_log=$(mktemp)
	: > "$fake_log"
	export FAKE_GH_LOG="$fake_log"

	fake_gh_setup "$fake_bin" 1  # exit 1 = auth failure

	temp_target=$(mktemp -d)
	register_temp_dir "$temp_target"
	rmdir "$temp_target"

	exit_code=0
	output=$(env PATH="$fake_bin:$PATH" "$SCRIPT" clone "owner/repo" "$temp_target" 2>&1) || exit_code=$?

	if [ "$exit_code" -ne 2 ]; then
		fail "clone auth failure — exit code $exit_code (expected 2)"
		echo "  output: $output" >&2
		return
	fi

	# No partial state left at target
	if [ -d "$temp_target" ]; then
		fail "clone auth failure — partial state left at $temp_target"
		return
	fi

	# Fake gh was invoked (it ran and then exited non-zero)
	if [ ! -s "$fake_log" ]; then
		fail "clone auth failure — fake gh was not invoked (empty log)"
		return
	fi

	unset FAKE_GH_LOG
	pass "clone auth failure — exit 2, no partial state"
}

echo ""
echo "── Test 10: gh auth failure → exit 2, no partial state ──"
test_clone_auth_failure

# ── Test 11: no git clone fallback (ADR-0026 hard rule) ─────────────────────

test_no_git_clone_fallback() {
	local matches
	# grep -c returns count; grep without -c returns matching lines.
	# Use grep -c for a clean numeric test.
	matches=$(grep -c 'git[[:space:]]clone' "$SCRIPT" 2>/dev/null || true)
	if [ "$matches" -ne 0 ]; then
		fail "no git clone fallback — found $matches 'git clone' invocation(s) in setup-scaffold.sh"
		grep -n 'git[[:space:]]clone' "$SCRIPT" >&2 || true
		return
	fi

	pass "no git clone fallback — zero 'git clone' invocations (ADR-0026)"
}

echo ""
echo "── Test 11: no git clone fallback (ADR-0026 hard rule) ──"
test_no_git_clone_fallback

# ── Test 12: clone honors no-overwrite guard (AC-2) ──────────────────────────

test_clone_no_overwrite() {
	local fake_bin temp_target sentinel fake_log exit_code output checksum_before
	fake_bin=$(mktemp -d)
	register_temp_dir "$fake_bin"

	fake_log=$(mktemp)
	: > "$fake_log"
	export FAKE_GH_LOG="$fake_log"

	fake_gh_setup "$fake_bin" 0

	temp_target=$(mktemp -d)
	register_temp_dir "$temp_target"
	# temp_target EXISTS (pre-created by mktemp) — this exercises the guard

	sentinel="$temp_target/sentinel.txt"
	echo "do not overwrite me" > "$sentinel"
	checksum_before=$(sha256sum "$sentinel" | awk '{print $1}')

	exit_code=0
	output=$(env PATH="$fake_bin:$PATH" "$SCRIPT" clone "owner/repo" "$temp_target" 2>&1) || exit_code=$?

	if [ "$exit_code" -eq 0 ]; then
		fail "clone no-overwrite — exit code 0 (expected non-zero)"
		return
	fi

	# Must NOT be exit 2 — the guard fires before the gh check
	if [ "$exit_code" -eq 2 ]; then
		fail "clone no-overwrite — exit code 2 (guard should fire before gh check)"
		return
	fi

	# Error message must name the target
	if ! echo "$output" | grep -q "$temp_target"; then
		fail "clone no-overwrite — error doesn't name the target"
		return
	fi

	# Sentinel must be unchanged
	if [ ! -f "$sentinel" ]; then
		fail "clone no-overwrite — sentinel file was removed"
		return
	fi
	local checksum_after
	checksum_after=$(sha256sum "$sentinel" | awk '{print $1}')
	if [ "$checksum_before" != "$checksum_after" ]; then
		fail "clone no-overwrite — sentinel file was mutated"
		return
	fi

	# Fake gh must NOT have been invoked (guard short-circuits)
	if [ -s "$fake_log" ]; then
		fail "clone no-overwrite — fake gh was invoked (guard should short-circuit)"
		return
	fi

	unset FAKE_GH_LOG
	pass "clone no-overwrite — halts before gh, no mutation"
}

echo ""
echo "── Test 12: clone honors no-overwrite guard (AC-2) ──"
test_clone_no_overwrite

# ── Test 13: new <target> creates a git repo (AC-4) ──────────────────────────

test_new_creates_git_repo() {
	local temp_target exit_code output
	temp_target=$(mktemp -d)
	register_temp_dir "$temp_target"
	rmdir "$temp_target"  # target must NOT exist

	exit_code=0
	output=$("$SCRIPT" new "$temp_target" 2>&1) || exit_code=$?

	if [ "$exit_code" -ne 0 ]; then
		fail "new git repo — exit code $exit_code (expected 0)"
		echo "  output: $output" >&2
		return
	fi

	# Target must exist and be a directory
	if [ ! -d "$temp_target" ]; then
		fail "new git repo — target directory was not created"
		return
	fi

	# Must be a git repo
	if ! git -C "$temp_target" rev-parse --is-inside-work-tree >/dev/null 2>&1; then
		fail "new git repo — target is not a git repository"
		return
	fi

	# .git must exist
	if [ ! -d "$temp_target/.git" ]; then
		fail "new git repo — .git directory missing"
		return
	fi

	pass "new git repo — directory created, git init ran, .git present"
}

echo ""
echo "── Test 13: new <target> creates a git repo (AC-4) ──"
test_new_creates_git_repo

# ── Test 14: every manifest entry is copied (AC-5) ──────────────────────────

test_new_copies_all_manifest_entries() {
	local temp_target exit_code output entry missing=()
	temp_target=$(mktemp -d)
	register_temp_dir "$temp_target"
	rmdir "$temp_target"  # target must NOT exist

	exit_code=0
	output=$("$SCRIPT" new "$temp_target" 2>&1) || exit_code=$?

	if [ "$exit_code" -ne 0 ]; then
		fail "manifest copy — exit code $exit_code (expected 0)"
		echo "  output: $output" >&2
		return
	fi

	# Iterate manifest entries and assert each exists in the copy
	while IFS= read -r line; do
		line="${line%$'\r'}"
		[[ -z "$line" || "$line" == \#* ]] && continue
		entry="$line"
		if [ ! -f "$temp_target/$entry" ]; then
			missing+=("$entry")
		elif [ ! -s "$temp_target/$entry" ]; then
			missing+=("$entry (empty)")
		fi
	done < "$MANIFEST"

	if [ ${#missing[@]} -ne 0 ]; then
		fail "manifest copy — ${#missing[@]} entries missing or empty:"
		for m in "${missing[@]}"; do
			echo "         $m" >&2
		done
		return
	fi

	pass "manifest copy — all $(wc -l < "$MANIFEST" | tr -d ' ') entries present and non-empty"
}

echo ""
echo "── Test 14: every manifest entry is copied (AC-5) ──"
test_new_copies_all_manifest_entries

# ── Test 15: standalone checks in the temp copy (AC-6) ──────────────────────

test_standalone_checks() {
	local temp_target exit_code output smoke_test
	temp_target=$(mktemp -d)
	register_temp_dir "$temp_target"
	rmdir "$temp_target"

	exit_code=0
	output=$("$SCRIPT" new "$temp_target" 2>&1) || exit_code=$?

	if [ "$exit_code" -ne 0 ]; then
		fail "standalone — scaffolding failed with exit $exit_code"
		echo "  output: $output" >&2
		return
	fi

	# ── 1. Assert test_helpers.sh is present in the copy ───────────────────
	if [ ! -f "$temp_target/tests/Shell/lib/test_helpers.sh" ]; then
		fail "standalone — test_helpers.sh missing from copy"
		return
	fi

	# ── 2. Minimal smoke test that sources the COPIED lib ───────────────────
	smoke_test="$temp_target/tests/Shell/smoke_test.sh"
	mkdir -p "$(dirname "$smoke_test")"
	cat > "$smoke_test" <<'SMOKE'
#!/usr/bin/env bash
set -euo pipefail

# Source the COPIED test_helpers.sh using a path relative to this script
SMOKE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SMOKE_DIR/lib/test_helpers.sh"
setup_result_file

pass "smoke test harness works standalone"

print_summary "smoke"
SMOKE
	chmod +x "$smoke_test"

	exit_code=0
	output=$(bash "$smoke_test" 2>&1) || exit_code=$?
	if [ "$exit_code" -ne 0 ]; then
		fail "standalone — smoke test exited $exit_code"
		echo "  output: $output" >&2
		return
	fi
	if ! echo "$output" | grep -q "PASS.*smoke test harness works standalone"; then
		fail "standalone — smoke test did not pass"
		echo "  output: $output" >&2
		return
	fi

	# ── 3. Lockfiles present (avoid network calls; just check presence) ───
	if [ -f "$REPO_ROOT/composer.lock" ] && [ ! -f "$temp_target/composer.lock" ]; then
		fail "standalone — composer.lock missing from copy"
		return
	fi
	if [ -f "$REPO_ROOT/package-lock.json" ] && [ ! -f "$temp_target/package-lock.json" ]; then
		fail "standalone — package-lock.json missing from copy"
		return
	fi

	# ── 4. install-hooks.sh runs standalone in the copy ────────────────────
	if [ -f "$temp_target/.github/scripts/install-hooks.sh" ]; then
		exit_code=0
		output=$(bash "$temp_target/.github/scripts/install-hooks.sh" 2>&1) || exit_code=$?
		if [ "$exit_code" -ne 0 ]; then
			fail "standalone — install-hooks.sh failed in copy (exit $exit_code)"
			echo "  output: $output" >&2
			return
		fi
	fi

	pass "standalone — harness works outside template tree"
}

echo ""
echo "── Test 15: standalone checks in the temp copy (AC-6) ──"
test_standalone_checks

# ── Test 16: trap cleanup on git init failure (architect safety rail) ────────

test_trap_cleanup_on_git_failure() {
	local fake_bin temp_target exit_code output
	# Create a fake git that exits non-zero (simulating git init failure)
	fake_bin=$(mktemp -d)
	register_temp_dir "$fake_bin"

	cat > "$fake_bin/git" <<'GIT_FAIL'
#!/usr/bin/env bash
exit 1
GIT_FAIL
	chmod +x "$fake_bin/git"

	temp_target=$(mktemp -d)
	register_temp_dir "$temp_target"
	rmdir "$temp_target"  # target must NOT exist

	exit_code=0
	output=$(env PATH="$fake_bin:$PATH" "$SCRIPT" new "$temp_target" 2>&1) || exit_code=$?

	if [ "$exit_code" -eq 0 ]; then
		fail "trap cleanup — exit code 0 (expected non-zero for git init failure)"
		return
	fi

	# The trap must have removed the partial target directory
	if [ -d "$temp_target" ]; then
		fail "trap cleanup — partial target directory was NOT removed by trap"
		ls -la "$temp_target" >&2 || true
		return
	fi

	pass "trap cleanup — partial directory removed on git init failure"
}

echo ""
echo "── Test 16: trap cleanup on git init failure (architect safety rail) ──"
test_trap_cleanup_on_git_failure

# ── Test 17: clone path ALSO copies the quality surface (ADR-0026 wiring) ────

test_clone_copies_quality_surface() {
	local fake_bin temp_target fake_log exit_code output recorded
	fake_bin=$(mktemp -d)
	register_temp_dir "$fake_bin"

	fake_log=$(mktemp)
	: > "$fake_log"
	export FAKE_GH_LOG="$fake_log"

	fake_gh_setup "$fake_bin" 0

	temp_target=$(mktemp -d)
	register_temp_dir "$temp_target"
	rmdir "$temp_target"

	exit_code=0
	output=$(env PATH="$fake_bin:$PATH" "$SCRIPT" clone "owner/repo" "$temp_target" 2>&1) || exit_code=$?

	if [ "$exit_code" -ne 0 ]; then
		fail "clone copies surface — exit code $exit_code (expected 0)"
		echo "  output: $output" >&2
		unset FAKE_GH_LOG
		return
	fi

	# Fake gh was invoked
	recorded=$(cat "$fake_log")
	if ! echo "$recorded" | grep -q "repo clone"; then
		fail "clone copies surface — fake gh not invoked"
		unset FAKE_GH_LOG
		return
	fi

	# Key manifest entries must be present in the target (spot-check)
	local missing=()
	for entry in ".github/scripts/setup-scaffold.sh" "tests/Shell/lib/test_helpers.sh" "composer.json"; do
		if [ ! -f "$temp_target/$entry" ]; then
			missing+=("$entry")
		fi
	done
	if [ ${#missing[@]} -ne 0 ]; then
		fail "clone copies surface — ${#missing[@]} entries missing: ${missing[*]}"
		unset FAKE_GH_LOG
		return
	fi

	unset FAKE_GH_LOG
	pass "clone copies surface — quality surface wired into clone path"
}

echo ""
echo "── Test 17: clone path ALSO copies the quality surface (ADR-0026 wiring) ──"
test_clone_copies_quality_surface

# ── Test 18: should-prompt — no setup.json → exit 0 ─────────────────────────

test_should_prompt_no_file() {
	local json rc
	json=$(mktemp -d)
	register_temp_dir "$json"
	json="$json/nonexistent.json"

	rc=0
	bash "$SCRIPT" should-prompt "$json" >/dev/null 2>&1 || rc=$?

	if [ "$rc" -ne 0 ]; then
		fail "should-prompt no file — exit code $rc (expected 0)"
		return
	fi
	pass "should-prompt no file → exit 0 (first run, prompt)"
}

echo ""
echo "── Test 18: should-prompt — no setup.json → exit 0 ──"
test_should_prompt_no_file

# ── Test 19: should-prompt — setup_version 2 → exit 0 (case a) ──────────────

test_should_prompt_v2() {
	local json dir rc
	dir=$(mktemp -d)
	register_temp_dir "$dir"
	json="$dir/setup.json"

	cat > "$json" <<'JSON'
{
  "setup_version": 2,
  "app": "testapp",
  "domain": "example.com"
}
JSON

	rc=0
	bash "$SCRIPT" should-prompt "$json" >/dev/null 2>&1 || rc=$?

	if [ "$rc" -ne 0 ]; then
		fail "should-prompt v2 — exit code $rc (expected 0)"
		return
	fi
	pass "should-prompt v2 → exit 0 (case a, prompt for scaffold)"
}

echo ""
echo "── Test 19: should-prompt — setup_version 2 → exit 0 (case a) ──"
test_should_prompt_v2

# ── Test 20: should-prompt — v3 + scaffold_mode skip → exit 0 (case b) ───────

test_should_prompt_v3_skip() {
	local json dir rc
	dir=$(mktemp -d)
	register_temp_dir "$dir"
	json="$dir/setup.json"

	cat > "$json" <<'JSON'
{
  "setup_version": 3,
  "app": "testapp",
  "scaffold_mode": "skip"
}
JSON

	rc=0
	bash "$SCRIPT" should-prompt "$json" >/dev/null 2>&1 || rc=$?

	if [ "$rc" -ne 0 ]; then
		fail "should-prompt v3 skip — exit code $rc (expected 0)"
		return
	fi
	pass "should-prompt v3 skip → exit 0 (case b, re-prompt)"
}

echo ""
echo "── Test 20: should-prompt — v3 + scaffold_mode skip → exit 0 (case b) ──"
test_should_prompt_v3_skip

# ── Test 21: should-prompt — v3 + mode new + folder exists → exit 1 (case c) ─

test_should_prompt_v3_new_exists() {
	local json dir folder rc
	dir=$(mktemp -d)
	register_temp_dir "$dir"
	json="$dir/setup.json"
	folder="$dir/my-project"
	mkdir -p "$folder"

	cat > "$json" <<JSON
{
  "setup_version": 3,
  "app": "testapp",
  "scaffold_mode": "new",
  "project_folder": "$folder"
}
JSON

	rc=0
	bash "$SCRIPT" should-prompt "$json" >/dev/null 2>&1 || rc=$?

	if [ "$rc" -ne 1 ]; then
		fail "should-prompt mode new + folder exists — exit code $rc (expected 1)"
		return
	fi
	pass "should-prompt mode new + folder exists → exit 1 (case c, short-circuit)"
}

echo ""
echo "── Test 21: should-prompt — v3 + mode new + folder exists → exit 1 (case c) ──"
test_should_prompt_v3_new_exists

# ── Test 22: should-prompt — v3 + mode new + folder missing → exit 0 (case d) ─

test_should_prompt_v3_new_missing() {
	local json dir rc
	dir=$(mktemp -d)
	register_temp_dir "$dir"
	json="$dir/setup.json"

	cat > "$json" <<'JSON'
{
  "setup_version": 3,
  "app": "testapp",
  "scaffold_mode": "new",
  "project_folder": "/nonexistent/project/path"
}
JSON

	rc=0
	bash "$SCRIPT" should-prompt "$json" >/dev/null 2>&1 || rc=$?

	if [ "$rc" -ne 0 ]; then
		fail "should-prompt mode new + folder missing — exit code $rc (expected 0)"
		return
	fi
	pass "should-prompt mode new + folder missing → exit 0 (case d, drift)"
}

echo ""
echo "── Test 22: should-prompt — v3 + mode new + folder missing → exit 0 (case d) ──"
test_should_prompt_v3_new_missing

# ── Test 23: should-prompt — v3 + mode clone + folder exists → exit 1 ─────────

test_should_prompt_v3_clone_exists() {
	local json dir folder rc
	dir=$(mktemp -d)
	register_temp_dir "$dir"
	json="$dir/setup.json"
	folder="$dir/cloned-project"
	mkdir -p "$folder"

	cat > "$json" <<JSON
{
  "setup_version": 3,
  "app": "testapp",
  "scaffold_mode": "clone",
  "project_folder": "$folder"
}
JSON

	rc=0
	bash "$SCRIPT" should-prompt "$json" >/dev/null 2>&1 || rc=$?

	if [ "$rc" -ne 1 ]; then
		fail "should-prompt mode clone + folder exists — exit code $rc (expected 1)"
		return
	fi
	pass "should-prompt mode clone + folder exists → exit 1 (short-circuit)"
}

echo ""
echo "── Test 23: should-prompt — v3 + mode clone + folder exists → exit 1 ──"
test_should_prompt_v3_clone_exists

# ── Summary ─────────────────────────────────────────────────────────────────

print_summary "setup scaffold"
exit $?








# vim: ft=sh sts=4 sw=4 ts=4 et :
