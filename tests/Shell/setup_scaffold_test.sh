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
	"package.json"
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

# ── Summary ─────────────────────────────────────────────────────────────────

print_summary "setup scaffold"
exit $?





# vim: ft=sh sts=4 sw=4 ts=4 et :
