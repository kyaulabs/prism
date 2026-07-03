#!/usr/bin/env bash

# $KYAULabs: install-hooks.sh,v 1.0.0 2026/07/02 22:16:56 -0700 kyau Exp $
# Run once after cloning: bash .github/scripts/install-hooks.sh

set -euo pipefail

REPO_ROOT=$(git rev-parse --show-toplevel)
HOOKS_SRC="$REPO_ROOT/.github/hooks"
GIT_HOOKS="$REPO_ROOT/.git/hooks"

if [ ! -d "$HOOKS_SRC" ]; then
	echo "✗ .github/hooks directory not found at $HOOKS_SRC" >&2
	exit 1
fi

echo "Installing git hooks from .github/hooks → .git/hooks"

for hook in "$HOOKS_SRC"/*; do
	name=$(basename "$hook")
	dest="$GIT_HOOKS/$name"

	if [ -f "$dest" ] && [ ! -L "$dest" ]; then
		echo "  ⚠ Backing up existing $name → $name.bak"
		mv "$dest" "$dest.bak"
	fi

	ln -sf "$REPO_ROOT/.github/hooks/$name" "$dest"
	chmod +x "$hook"
	echo "  ✓ $name"
done

echo ""
echo "✓ Hooks installed. All commits will now run lint + gitleaks + commitlint."

# vim 