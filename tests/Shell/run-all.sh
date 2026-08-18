#!/usr/bin/env bash
# $KYAULabs: run-all.sh kyau@aura.kyaulabs 2026/08/18 -0700 Exp $







# Single entry point for the shell regression suite (composer test:shell,
# ci.yml "Shell regression tests"). Iterates tests/Shell/*_test.sh, runs
# every file even if some fail, and aggregates the exit code — mirrors CI
# semantics. Not matched by the *_test.sh glob itself.

set -uo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$REPO_ROOT" || exit 1

shopt -s nullglob
tests=( tests/Shell/*_test.sh )
if [ ${#tests[@]} -eq 0 ]; then
	echo "No shell tests found in tests/Shell/" >&2
	exit 1
fi

rc=0
for t in "${tests[@]}"; do
	bash "$t" || rc=1
done
exit "$rc"


# vim: ft=sh sts=4 sw=4 ts=4 et :
