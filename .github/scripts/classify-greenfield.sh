#!/usr/bin/env bash
# $KYAULabs: classify-greenfield.sh kyau@cosmos.kyaulabs 2026/08/04 -0700 Exp $



set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
ROOT="${1:-$(cd -- "$SCRIPT_DIR/../.." && pwd)}"

indeterminate() {
	printf 'indeterminate\n'
	printf 'classify-greenfield: %s\n' "$1" >&2
	exit 2
}

established() {
	printf 'established\n'
	exit 1
}

[[ -f "$ROOT/.github/scripts/quality-surface.manifest" ]] \
	|| indeterminate 'quality-surface manifest is unavailable'
git -C "$ROOT" rev-parse --is-inside-work-tree >/dev/null 2>&1 \
	|| indeterminate 'project root is not a Git worktree'

commit_count="$(git -C "$ROOT" rev-list --all --count 2>/dev/null)" \
	|| indeterminate 'Git history cannot be inspected'
[[ "$commit_count" == '0' ]] || established

for path in CONTEXT.md docs/plans docs/specs adr backend cdn aurora; do
	[[ ! -e "$ROOT/$path" ]] || established
done

command -v php >/dev/null 2>&1 || indeterminate 'PHP is unavailable'
app="$(php "$SCRIPT_DIR/prism_manifest.php" get "$ROOT/prism.jsonc" - app 2>/dev/null)" \
	|| indeterminate 'project manifest or app value is invalid'
[[ "$app" =~ ^[A-Za-z0-9][A-Za-z0-9._-]*$ ]] \
	|| indeterminate 'app value is not a project-local webroot name'
[[ ! -e "$ROOT/$app" ]] || established

printf 'greenfield\n'



# vim: ft=sh sts=4 sw=4 ts=4 et :
