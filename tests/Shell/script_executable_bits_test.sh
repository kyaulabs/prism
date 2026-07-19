#!/usr/bin/env bash
# $KYAULabs: script_executable_bits_test.sh kyau@nova 2026/07/19 -0700 Exp $




# ── Tests for check-script-executable-bits.sh ─────────────────────────────────
# Verifies the guard catches .sh scripts under .github/scripts/ that lack the
# executable bit in the git index — the Windows core.fileMode=false blind spot
# that masked the missing +x on setup-scaffold.sh (PR #165) until macOS CI
# failed with Permission denied.

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
source "$REPO_ROOT/tests/Shell/lib/test_helpers.sh"

setup_result_file

CHECKER="$REPO_ROOT/.github/scripts/check-script-executable-bits.sh"

if [ ! -f "$CHECKER" ]; then
	fail "Cannot find check-script-executable-bits.sh at $CHECKER"
	exit 1
fi

# make_fixture <mode> — create an isolated git repo whose .github/scripts/
# holds a single tracked foo.sh at the requested git index mode (100644 or
# 100755). Echoes the repo path on stdout.
make_fixture() {
	local mode="$1"
	local repo
	repo=$(mktemp -d)
	register_temp_dir "$repo"
	git_init_test_repo "$repo"
	(
		cd "$repo" || exit 1
		mkdir -p .github/scripts
		printf '#!/usr/bin/env bash\necho hi\n' > .github/scripts/foo.sh
		git add .github/scripts/foo.sh
		if [ "$mode" = "100755" ]; then
			git update-index --chmod=+x .github/scripts/foo.sh
		fi
		git commit -q -m "add foo"
	)
	echo "$repo"
}

test_non_executable_script_is_flagged() {
	local repo rc
	repo=$(make_fixture 100644)
	rc=0
	(cd "$repo" && bash "$CHECKER") > /dev/null 2>&1 || rc=$?
	if [ "$rc" -eq 0 ]; then
		fail "non-executable (100644) — expected non-zero exit, got 0"
		return
	fi
	pass "non-executable (100644) — flagged with non-zero exit"
}

test_executable_script_passes() {
	local repo rc
	repo=$(make_fixture 100755)
	rc=0
	(cd "$repo" && bash "$CHECKER") > /dev/null 2>&1 || rc=$?
	if [ "$rc" -ne 0 ]; then
		fail "executable (100755) — expected exit 0, got $rc"
		return
	fi
	pass "executable (100755) — passes"
}

test_missing_scripts_dir_passes() {
	local repo rc
	repo=$(mktemp -d)
	register_temp_dir "$repo"
	git_init_test_repo "$repo"
	rc=0
	(cd "$repo" && bash "$CHECKER") > /dev/null 2>&1 || rc=$?
	if [ "$rc" -ne 0 ]; then
		fail "no .github/scripts/ dir — expected exit 0, got $rc"
		return
	fi
	pass "no .github/scripts/ dir — passes (nothing to check)"
}

test_error_message_names_remediation() {
	local repo out
	repo=$(make_fixture 100644)
	out=$(cd "$repo" && bash "$CHECKER" 2>&1 || true)
	if ! echo "$out" | grep -q "git update-index --chmod=+x"; then
		fail "error message — missing 'git update-index --chmod=+x' remediation hint"
		echo "  output: $out" >&2
		return
	fi
	pass "error message — includes remediation hint"
}

test_non_executable_script_is_flagged
test_executable_script_passes
test_missing_scripts_dir_passes
test_error_message_names_remediation

print_summary "script_executable_bits_test.sh"


# vim: ft=sh sts=4 sw=4 ts=4 et :
