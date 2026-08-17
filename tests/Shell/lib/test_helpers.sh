#!/usr/bin/env bash
# $KYAULabs: test_helpers.sh kyau@aura.kyaulabs 2026/08/16 -0700 Exp $
















# ── Shared helpers for tests/Shell/*_test.sh ────────────────────────────────────
#
# Source this file at the top of shell test files:
#   source "$REPO_ROOT/tests/Shell/lib/test_helpers.sh"
#
# Provides:
#   - REPO_ROOT: absolute path to repository root
#   - pass <msg>: print green PASS, append to $RESULT_FILE
#   - fail <msg>: print red FAIL, append to $RESULT_FILE
#   - skip <msg>: print yellow SKIP, append to $RESULT_FILE (not counted as fail)
#   - setup_result_file: create RESULT_FILE, install EXIT trap
#   - register_temp_dir <dir>: track dir for EXIT-trap cleanup
#   - make_file_stale <file> <days>: set file mtime to N days ago (portable)
#   - can_symlink: return 0 if symlinks work, 1 if not (Windows guard)
#   - native_path <path>: convert MSYS path to Windows path (no-op on POSIX)
#   - path_without_prism_tool: print PATH minus the directory holding a
#     host-installed prism-tool launcher (no-op when absent) — hook tests
#     use it to simulate a machine without the launcher even on dogfooding
#     machines where the harness is installed

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
export REPO_ROOT

RED=$'\033[1;31m'
GREEN=$'\033[1;32m'
# shellcheck disable=SC2034  # consumed by sourcing test files (commit-msg_test.sh, lib_test.sh)
YELLOW=$'\033[1;33m'
RESET=$'\033[0m'

pass() { echo "  ${GREEN}PASS${RESET} $*"; echo "PASS" >> "$RESULT_FILE"; }
fail() { echo "  ${RED}FAIL${RESET} $*" >&2; echo "FAIL" >> "$RESULT_FILE"; }

# make_file_stale <file> <days>
# Sets the file's modification time to <days> days in the past.
# Portable: tries BSD date (-v) first, falls back to GNU date (-d).
make_file_stale() {
	local file="$1"
	local days="$2"
	local old_ts
	old_ts=$(date -v-"${days}"d +%Y%m%d%H%M 2>/dev/null || date -d "${days} days ago" +%Y%m%d%H%M)
	touch -t "$old_ts" "$file"
}

# ── RESULT_FILE lifecycle ──────────────────────────────────────────────────
# Call setup_result_file() EXACTLY ONCE near the top of a test file (after
# sourcing this lib). Creates RESULT_FILE and installs an EXIT trap that
# removes RESULT_FILE plus every directory registered via register_temp_dir().
RESULT_FILE=""
TEMP_DIRS=""

setup_result_file() {
	RESULT_FILE=$(mktemp)
	TEMP_DIRS=""
	trap 'shell_test_cleanup' EXIT
}

# register_temp_dir <dir> — track a temp directory for EXIT-trap cleanup.
register_temp_dir() {
	TEMP_DIRS="$TEMP_DIRS $1"
}

# shell_test_cleanup — internal; invoked by the EXIT trap installed by
# setup_result_file. Removes RESULT_FILE and all registered directories.
# shellcheck disable=SC2317  # called via trap, not reachable directly
shell_test_cleanup() {
	[ -n "$RESULT_FILE" ] && rm -f "$RESULT_FILE"
	if [ -n "$TEMP_DIRS" ]; then
		# shellcheck disable=SC2086  # intentional word-splitting of space-separated dir list
		rm -rf $TEMP_DIRS 2>/dev/null || true
	fi
}

# print_summary <label> — tally RESULT_FILE (PASS / FAIL), print a boxed
# summary, and return non-zero if any FAIL line is present. The guards are
# belt-and-suspenders default-value assignments that prevent unset-variable
# aborts under `set -u` (some consumers omit them; this function fixes that).
print_summary() {
	local label="${1:-tests}"
	: "${total_pass:=0}"
	: "${total_fail:=0}"
	total_pass=$(grep -c "PASS" "$RESULT_FILE" || true)
	total_fail=$(grep -c "FAIL" "$RESULT_FILE" || true)
	echo ""
	echo "════════════════════════════════════════"
	if [ "$total_fail" -eq 0 ]; then
		echo "✓ ${label}: ${total_pass} passed, ${total_fail} failed"
	else
		echo "✗ ${label}: ${total_pass} passed, ${total_fail} failed"
	fi
	echo "════════════════════════════════════════"
	[ "$total_fail" -eq 0 ]
}

# git_init_test_repo <dir> — init a disposable git repo with gpgsign disabled
# and a test identity. Fixes Issue #29 (global commit.gpgsign=true hangs).
git_init_test_repo() {
	local dir="$1"
	git init --quiet "$dir"
	(
		cd "$dir" || exit 1
		git config commit.gpgsign false
		git config user.email "test@example.com"
		git config user.name "Test User"
	)
}

# setup_linter_repo <dir> — git_init_test_repo + symlink vendor/node_modules +
# copy linter configs. Used by pre-commit lint tests that invoke the real hook.
setup_linter_repo() {
	local dir="$1"
	git_init_test_repo "$dir"
	(
		cd "$dir" || exit 1
		ln -s "$REPO_ROOT/vendor" vendor
		ln -s "$REPO_ROOT/node_modules" node_modules
		[ -f "$REPO_ROOT/.php-cs-fixer.dist.php" ] && cp "$REPO_ROOT/.php-cs-fixer.dist.php" .php-cs-fixer.dist.php
		[ -f "$REPO_ROOT/eslint.config.mjs" ] && cp "$REPO_ROOT/eslint.config.mjs" eslint.config.mjs
		[ -f "$REPO_ROOT/.stylelintrc.json" ] && cp "$REPO_ROOT/.stylelintrc.json" .stylelintrc.json
	)
}

# skip <msg> — print a yellow SKIP notice and record it in RESULT_FILE.
# SKIP lines are ignored by print_summary's PASS/FAIL tally. Use this for
# platform-incompatible or tool-absent test cases that should not count as
# failures.
skip() { echo "  ${YELLOW}SKIP${RESET} $*" >&2; echo "SKIP" >> "$RESULT_FILE"; }

# can_symlink — probe whether the current platform supports symbolic links.
# Returns 0 (true) if a symlink can be created and is reported as a link by
# [ -L ]; returns 1 (false) otherwise (e.g. Windows without Developer Mode).
# Cleans up its probe directory regardless of outcome.
can_symlink() {
	local probe_dir probe_link rc
	probe_dir=$(mktemp -d)
	probe_link="${probe_dir}/link"
	if ln -s "$probe_dir" "$probe_link" 2>/dev/null && [ -L "$probe_link" ]; then
		rc=0
	else
		rc=1
	fi
	rm -rf "$probe_dir"
	return "$rc"
}

# native_path <path> — convert an MSYS/Git-Bash path to a native Windows
# path (mixed slashes via cygpath -m) for consumption by native binaries
# (PHP, Node). No-op on Linux/macOS where cygpath is absent. Precedent:
# composer_validate_test.sh:47-49.
native_path() {
	cygpath -m "$1" 2>/dev/null || printf '%s' "$1"
}

# path_without_prism_tool — print PATH with the directory containing a
# host-installed prism-tool launcher removed. Hook tests use this to
# simulate a machine without the launcher even on dogfooding machines
# where the harness is installed (the hooks' fail-closed guard relies on
# `command -v prism-tool` finding nothing). No-op when no prism-tool is
# on PATH. Requires the real prism-tool (or a fixture named prism-tool)
# to be resolvable via the caller's PATH.
path_without_prism_tool() {
	local part sentinel="__PATH_END__" kept=0 out=""
	# Split on ':' preserving empty components (POSIX PATH: empty = current
	# dir). The sentinel keeps the trailing empty field that plain `read`
	# would discard; it is dropped before reconstruction.
	local -a parts
	IFS=: read -r -a parts <<< "$PATH:$sentinel"
	parts=("${parts[@]:0:${#parts[@]}-1}")
	local first=1
	for part in "${parts[@]}"; do
		# Drop every component that itself resolves a prism-tool (not just
		# the first `command -v` match — a dogfooding machine may hold
		# duplicate installs on PATH). External tools are avoided so this
		# also works when the remaining PATH lacks /usr/bin.
		if [ -n "$part" ] && [ -x "$part/prism-tool" ]; then
			continue
		fi
		if [ "$first" -eq 1 ]; then
			out="$part"
			first=0
		else
			out="$out:$part"
		fi
		kept=$((kept + 1))
	done
	# A lone empty component round-trips as ':' (cwd); empty join with
	# kept>0 means exactly that (plain "" would read as no PATH at all).
	if [ "$kept" -gt 0 ] && [ -z "$out" ]; then
		out=":"
	fi
	printf '%s' "$out"
}
















# vim: ft=sh sts=4 sw=4 ts=4 et :
