#!/usr/bin/env bash
# $KYAULabs: validate-branch-name.sh kyau@cosmos.kyaulabs 2026/07/30 -0700 Exp $



# validate-branch-name.sh — Validate current (or passed) branch against Git Flow convention.
# See ADR-0028 for the regex specification and rationale.
#
# Usage: validate-branch-name.sh [<branch-name>]
# Default: derives current branch from git rev-parse --abbrev-ref HEAD
#
# Exit codes:
#   0 — valid OR exempt (detached HEAD)
#   1 — invalid format (does not match any prefix family)
#   2 — reserved vocabulary error
#   3 — protected branch (commit on a work branch instead)

set -euo pipefail

BRANCH="${1:-$(git symbolic-ref --short HEAD 2>/dev/null || echo HEAD)}"

FEATURE_RE='^(feat|fix|patch|docs|style|refactor|perf|test|build|ci|chore|revert)/[a-z0-9._-]+-[a-f0-9]{4}-[a-z0-9._-]+$'
HOTFIX_RE='^hotfix/[a-z0-9._-]+-[a-f0-9]{4}-[a-z0-9._-]+$'
RELEASE_RE='^release/[0-9]+\.[0-9]+\.[0-9]+(-[0-9A-Za-z.-]+)?$'
PROTECTED_RE='^(main|develop)$'
EXEMPT_RE='^HEAD$'

if [[ "$BRANCH" =~ $PROTECTED_RE ]]; then
    printf "✗ Branch '%s' is protected; commit on a work branch instead.\n" "$BRANCH" >&2
    echo "  Run: bash .github/scripts/new-branch.sh <type> <description>" >&2
    exit 3
fi

if [[ "$BRANCH" =~ $EXEMPT_RE ]]; then
    exit 0
fi

if [[ "$BRANCH" =~ $FEATURE_RE ]]; then exit 0; fi
if [[ "$BRANCH" =~ $HOTFIX_RE ]];   then exit 0; fi
if [[ "$BRANCH" =~ $RELEASE_RE ]];  then exit 0; fi

cat >&2 <<EOF
✗ Branch '$BRANCH' does not match the Git Flow convention (ADR-0028).
  Expected one of:
    <type>/<username>-<hash>-<description>   (type ∈ feat, fix, patch, docs, style,
                                              refactor, perf, test, build, ci,
                                              chore, revert; hash = 4 hex chars)
    hotfix/<username>-<hash>-<description>
    release/<major>.<minor>.<patch>[-<prerelease>]
  Exempt: detached HEAD.
  Run: bash .github/scripts/new-branch.sh <type> <description>
EOF
exit 1




# vim: ft=sh sts=4 sw=4 ts=4 et :
