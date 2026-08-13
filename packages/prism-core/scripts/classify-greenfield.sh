#!/usr/bin/env bash
# $KYAULabs: classify-greenfield.sh kyau@aura.kyaulabs 2026/08/12 -0700 Exp $





set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
DEFAULT_ROOT="$(git -C "$SCRIPT_DIR" rev-parse --show-toplevel 2>/dev/null || pwd)"
ROOT="${1:-$DEFAULT_ROOT}"

indeterminate() {
	printf 'indeterminate\n'
	printf 'classify-greenfield: %s\n' "$1" >&2
	exit 2
}

established() {
	printf 'established\n'
	exit 1
}

git -C "$ROOT" rev-parse --is-inside-work-tree >/dev/null 2>&1 \
	|| indeterminate 'project root is not a Git worktree'

commit_count="$(git -C "$ROOT" rev-list --all --count 2>/dev/null)" \
	|| indeterminate 'Git history cannot be inspected'
[ "$commit_count" = '0' ] || established

# Strict greenfield has no committed history or project/domain evidence. Stack
# adapters may add more evidence later; these language-agnostic paths are the
# common floor and intentionally require no deleted manifest/webroot lookup.
for path in \
	CONTEXT.md \
	docs/plans \
	docs/specs \
	adr \
	src \
	lib \
	app \
	backend \
	cdn \
	aurora \
	composer.json \
	package.json \
	Cargo.toml \
	go.mod \
	pyproject.toml
do
	[ ! -e "$ROOT/$path" ] || established
done

printf 'greenfield\n'





# vim: ft=sh sts=4 sw=4 ts=4 et :
