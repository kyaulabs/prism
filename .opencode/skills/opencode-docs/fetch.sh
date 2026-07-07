#!/usr/bin/env bash
# $KYAULabs: fetch.sh kyau@nova 2026/07/07 -0700 Exp $

# fetch.sh — Refresh vendored OpenCode docs from the anomalyco/opencode repo.
#
# Shallow-clones with sparse checkout, extracts the English top-level .mdx
# files from packages/web/src/content/docs/, and cleans up.
#
# Usage: bash .opencode/skills/opencode-docs/fetch.sh
#
# Derived from: obra/superpowers-developing-for-claude-code (MIT, © Jesse Vincent)
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DOCS_DIR="${SCRIPT_DIR}/docs"
TEMP_DIR="${SCRIPT_DIR}/.temp-clone"

echo "==> Fetching OpenCode docs from anomalyco/opencode (dev branch)..."

# Clean any previous temp clone
rm -rf "${TEMP_DIR}"

# Shallow sparse clone — only the docs directory
git clone \
    --depth 1 \
    --filter=blob:none \
    --sparse \
    https://github.com/anomalyco/opencode.git \
    "${TEMP_DIR}" 2>&1 | sed 's/^/  /'

cd "${TEMP_DIR}"
git sparse-checkout set packages/web/src/content/docs 2>&1 | sed 's/^/  /'

# Clear existing docs
rm -rf "${DOCS_DIR:?}"/*
mkdir -p "${DOCS_DIR}"

# Copy only the top-level .mdx files (not translation directories)
for file in packages/web/src/content/docs/*.mdx; do
    if [ -f "$file" ]; then
        cp "$file" "${DOCS_DIR}/"
        echo "  -> $(basename "$file")"
    fi
done

# Clean up
cd "${SCRIPT_DIR}"
rm -rf "${TEMP_DIR}"

file_count=$(find "${DOCS_DIR}" -maxdepth 1 -name '*.mdx' -type f 2>/dev/null | wc -l)
echo "==> Done. ${file_count} doc files in ${DOCS_DIR}/"

# vim: ft=sh sts=4 sw=4 ts=4 et :
