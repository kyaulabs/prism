#!/usr/bin/env bash
# $KYAULabs: install-hooks.sh kyau@aura.kyaulabs 2026/08/18 -0700 Exp $

# Run once after cloning: bash packages/prism-core/scripts/install-hooks.sh
#
# Uses git's native core.hooksPath mechanism instead of per-file symlinks.
# This avoids worktree crashes, core.hooksPath bypass, exec-bit dirtiness,
# and nullglob edge cases — all handled by git itself.

set -euo pipefail

REPO_ROOT=$(git rev-parse --show-toplevel)
HOOKS_SRC="$REPO_ROOT/.github/hooks"

if [ ! -d "$HOOKS_SRC" ]; then
	echo "✗ .github/hooks directory not found at $HOOKS_SRC" >&2
	exit 1
fi

git config core.hooksPath .github/hooks

echo "✓ Hooks installed via core.hooksPath = .github/hooks"
echo "  All commits will now run lint + gitleaks + commitlint."
echo "  Prerequisite: 'prism-tool doctor --local-only' (deploy the launcher via install-global.sh or /setup)."

# vim: ft=sh sts=4 sw=4 ts=4 et :
