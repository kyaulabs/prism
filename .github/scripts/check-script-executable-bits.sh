#!/usr/bin/env bash
# $KYAULabs: check-script-executable-bits.sh kyau@aura.kyaulabs 2026/08/12 -0700 Exp $








# ── Executable-bit guard for harness shell helpers ────────────────────────────
# Asserts every tracked .sh script under .github/scripts/ and packages/* carries
# the executable bit (git index mode 100755). Guards the Windows core.fileMode=false blind spot
# that hides missing +x until CI runs on Linux/macOS — where Actions checkout
# honors the stored index mode and direct invocation fails with Permission
# denied (the PR #165 root cause).
#
# Wired into .github/hooks/pre-commit (CI parity) and the CI workflow itself.
# The blanket "all scripts executable" rule is deliberate: it is simpler and
# strictly more robust than classifying bash-vs-direct invocation, and a script
# being +x is harmless even when it is only ever invoked via `bash <path>`.
#
# Exit status: 0 if every tracked script is executable (or none exist), 1 if any
# tracked script has index mode != 100755.

set -euo pipefail

# No harness script directory in this checkout — nothing to guard.
if [ ! -d .github/scripts ] && [ ! -d packages ]; then
	exit 0
fi

fail=0
while IFS= read -r script; do
	[ -z "$script" ] && continue
	mode=$(git ls-files --stage -- "$script" | awk '{print $1}')
	if [ "$mode" != "100755" ]; then
		printf 'ERROR: %s has git index mode %s (expected 100755).\n' \
			"$script" "${mode:-<untracked>}" >&2
		printf '       Fix: git update-index --chmod=+x %s\n' "$script" >&2
		fail=1
	fi
done < <(git ls-files '.github/scripts/*.sh' 'packages/**/*.sh')

exit "$fail"






# vim: ft=sh sts=4 sw=4 ts=4 et :
