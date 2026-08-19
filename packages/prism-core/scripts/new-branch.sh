#!/usr/bin/env bash
# $KYAULabs: new-branch.sh kyau@aura.kyaulabs 2026/08/18 -0700 Exp $

# new-branch.sh — Generate a Git Flow branch name and create the branch.
# See ADR-0028 for naming convention.
#
# Usage:
#   new-branch.sh <type> <description>     # commit-types: base=develop
#   new-branch.sh hotfix <description>     # base=main
#   new-branch.sh release <semver>         # base=develop
#
# <type> ∈ {feat, fix, patch, docs, style, refactor, perf, test, build, ci,
#           chore, revert, hotfix, release}

set -euo pipefail

TYPE="${1:-}"
DESC="${2:-}"

if [ -z "$TYPE" ] || [ -z "$DESC" ]; then
    echo "Usage: new-branch.sh <type> <description>" >&2
    echo "  type ∈ {feat, fix, patch, docs, style, refactor, perf, test, build," >&2
    echo "          ci, chore, revert, hotfix, release}" >&2
    exit 1
fi

# Locate resolve-identity.sh relative to this script (both live in prism-core/scripts/).
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# ── Validate type and pick base branch ────────────────────────────────────

case "$TYPE" in
    feat|fix|patch|docs|style|refactor|perf|test|build|ci|chore|revert)
        BASE="develop"
        ;;
    hotfix)
        BASE="main"
        ;;
    release)
        BASE="develop"
        if ! [[ "$DESC" =~ ^v?[0-9]+\.[0-9]+\.[0-9]+(-[0-9A-Za-z.-]+)?$ ]]; then
            echo "✗ Invalid semver: '$DESC'" >&2
            echo "  Expected: <major>.<minor>.<patch>[-<prerelease>] (no build metadata)" >&2
            exit 1
        fi
        BRANCH="release/${DESC#v}"
        ;;
    *)
        echo "✗ Invalid type: '$TYPE'" >&2
        echo "  Allowed: feat, fix, patch, docs, style, refactor, perf, test, build," >&2
        echo "           ci, chore, revert, hotfix, release" >&2
        exit 1
        ;;
esac

# ── Pre-flight: working tree must be clean ────────────────────────────────

if ! git diff --quiet || ! git diff --cached --quiet; then
    echo "✗ Working tree has uncommitted changes. Commit or stash first." >&2
    exit 1
fi

# ── Ensure base branch exists ─────────────────────────────────────────────

if ! git rev-parse --verify "$BASE" >/dev/null 2>&1; then
    if ! git rev-parse --verify "origin/$BASE" >/dev/null 2>&1; then
        echo "✗ Base branch '$BASE' not found locally or remotely." >&2
        exit 1
    fi
    git fetch origin "$BASE"
fi

git checkout "$BASE" || { echo "✗ Failed to checkout $BASE" >&2; exit 1; }
git pull --ff-only 2>/dev/null || true

# ── For non-release types: resolve identity, sanitize, generate hash ──────

if [ "$TYPE" != "release" ]; then
    IDENTITY=$(bash "$SCRIPT_DIR/resolve-identity.sh") || {
        echo "✗ Could not resolve identity (needed for username)." >&2
        exit 1
    }
    # Extract name from "Name <email>"
    NAME="${IDENTITY%% <*}"

    # Sanitize: lowercase, whitespace→-, strip non-[a-z0-9._-], collapse, trim
    USERNAME=$(printf '%s' "$NAME" \
        | tr '[:upper:]' '[:lower:]' \
        | sed -E 's/[[:space:]]+/-/g; s/[^a-z0-9._-]//g; s/-+/-/g; s/^-//; s/-$//')
    if [ -z "$USERNAME" ]; then
        USERNAME="unknown"
    fi

    HASH=$(openssl rand -hex 2 2>/dev/null) || {
        echo "✗ openssl rand -hex 2 failed" >&2
        exit 1
    }

    # Sanitize description: lowercase, non-alphanumeric→-, collapse, trim
    DESC_CLEAN=$(printf '%s' "$DESC" \
        | tr '[:upper:]' '[:lower:]' \
        | sed -E 's/[^a-z0-9-]+/-/g; s/-+/-/g; s/^-//; s/-$//')
    if [ -z "$DESC_CLEAN" ]; then
        echo "✗ Description sanitizes to empty." >&2
        exit 1
    fi

    BRANCH="${TYPE}/${USERNAME}-${HASH}-${DESC_CLEAN}"
fi

# ── Create the branch ─────────────────────────────────────────────────────

if git rev-parse --verify "$BRANCH" >/dev/null 2>&1; then
    echo "✗ Branch '$BRANCH' already exists." >&2
    exit 1
fi

git checkout -b "$BRANCH" || { echo "✗ Failed to create branch '$BRANCH'" >&2; exit 1; }
echo "$BRANCH"

# vim: ft=sh sts=4 sw=4 ts=4 et :
