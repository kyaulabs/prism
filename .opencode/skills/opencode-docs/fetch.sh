#!/usr/bin/env bash
# $KYAULabs: fetch.sh kyau@cosmos.kyaulabs 2026/07/26 -0700 Exp $



# fetch.sh — Refresh vendored OpenCode docs from the anomalyco/opencode repo.
#
# Fetches a pinned immutable commit, extracts the English top-level .mdx
# files from packages/web/src/content/docs/, and atomically swaps them
# into the docs/ directory. A zero-match guard fires before any
# destructive operation — existing docs are never left empty.
#
# Usage: bash .opencode/skills/opencode-docs/fetch.sh
#
# Derived from: obra/superpowers-developing-for-claude-code (MIT, © Jesse Vincent)
set -euo pipefail

# Pinned to an immutable upstream commit for supply-chain integrity (#209).
# Bump by setting PINNED_REF to a new commit SHA on the branch below.
PINNED_REF="7534d23551f665e65080809975b4ca5c7d63807b"
# branch: dev
UPSTREAM_REPO="https://github.com/anomalyco/opencode.git"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DOCS_DIR="${SCRIPT_DIR}/docs"
TEMP_DIR="${SCRIPT_DIR}/.temp-clone"
STAGE_DIR=$(mktemp -d "${SCRIPT_DIR}/.stage-docs.XXXXXX")
trap 'rm -rf "$STAGE_DIR" "${SCRIPT_DIR}/.docs.old.$$"' EXIT

echo "==> Fetching OpenCode docs pinned at ${PINNED_REF:0:12} (branch: dev)..."

# Clean any previous temp clone
rm -rf "${TEMP_DIR}"

# Shallow clone pinned to the immutable SHA, sparse checkout only docs
git init --quiet "${TEMP_DIR}"
cd "${TEMP_DIR}"
git remote add origin "${UPSTREAM_REPO}"
git fetch --depth 1 origin "${PINNED_REF}" 2>&1 | sed 's/^/  /'
git checkout FETCH_HEAD 2>&1 | sed 's/^/  /'
git sparse-checkout init --cone 2>&1 | sed 's/^/  /'
git sparse-checkout set packages/web/src/content/docs 2>&1 | sed 's/^/  /'

# Copy matched .mdx files into the staging directory; count matches.
# Fail non-zero BEFORE touching DOCS_DIR (zero-match guard — #209).
matched=0
for file in packages/web/src/content/docs/*.mdx; do
    if [ -f "$file" ]; then
        cp "$file" "${STAGE_DIR}/"
        matched=$((matched+1))
        echo "  -> $(basename "$file")"
    fi
done

if [ "$matched" -eq 0 ]; then
    echo "ERROR: zero .mdx matched at ${PINNED_REF}; existing docs left intact" >&2
    exit 1
fi

# Atomically swap staged docs into DOCS_DIR (same filesystem).
# Existing docs are renamed aside for the trap to clean up.
OLD="${SCRIPT_DIR}/.docs.old.$$"
rm -rf "$OLD"
[ -d "$DOCS_DIR" ] && mv "$DOCS_DIR" "$OLD"
mv "$STAGE_DIR" "$DOCS_DIR"
rm -rf "$OLD"

# Clean up temp clone
cd "${SCRIPT_DIR}"
rm -rf "${TEMP_DIR}"

file_count=$(find "${DOCS_DIR}" -maxdepth 1 -name '*.mdx' -type f 2>/dev/null | wc -l)
echo "==> Done. ${file_count} doc files in ${DOCS_DIR}/"



# vim: ft=sh sts=4 sw=4 ts=4 et :
