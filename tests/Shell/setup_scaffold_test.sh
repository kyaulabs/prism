#!/usr/bin/env bash
# $KYAULabs: setup_scaffold_test.sh kyau@nova 2026/07/18 -0700 Exp $




# ── Tests for setup-scaffold.sh and quality-surface manifest ─────────────────
# Verifies manifest parity (ADR-0026): every entry in the manifest exists on
# disk, and every quality-surface file is listed in the manifest.

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
source "$REPO_ROOT/tests/Shell/lib/test_helpers.sh"

setup_result_file

MANIFEST="$REPO_ROOT/.github/scripts/quality-surface.manifest"

# ── Exclusion list for reverse-parity check ─────────────────────────────────
# Files in scope directories that are intentionally NOT in the manifest.
# Each entry needs a one-line rationale comment.
declare -A REVERSE_EXCLUSIONS=(
	# Harness-only: validates opencode skill frontmatter; not copied to scaffolded projects
	[".github/scripts/check-skill-frontmatter.sh"]=1
)

# ── Scope directories for reverse-parity check ──────────────────────────────
# Every file under these directories (non-recursive) must appear in the
# manifest unless listed in REVERSE_EXCLUSIONS.
SCOPE_DIRS=(
	".github/hooks"
	".github/scripts"
	".github/workflows"
	".github/ISSUE_TEMPLATE"
	".semgrep"
	".opencodereview"
	"tests/Shell/lib"
)

# ── Root config files checked individually ──────────────────────────────────
ROOT_CONFIGS=(
	"composer.json"
	"package.json"
	"phpunit.xml"
	".php-cs-fixer.dist.php"
	".stylelintrc.json"
	"eslint.config.mjs"
	"commitlint.config.js"
	"tsconfig.json"
	"cliff.toml"
)

# ── Test 1: Manifest forward parity (no stale entries) ──────────────────────

test_manifest_forward_parity() {
	local missing=()
	local line entry

	if [ ! -f "$MANIFEST" ]; then
		fail "manifest file not found: $MANIFEST"
		return
	fi

	while IFS= read -r line; do
		# Strip trailing carriage return (Windows line endings)
		line="${line%$'\r'}"
		# Skip blank lines and comments
		[[ -z "$line" || "$line" == \#* ]] && continue

		entry="$line"
		if [ ! -f "$REPO_ROOT/$entry" ]; then
			missing+=("$entry")
		fi
	done < "$MANIFEST"

	if [ ${#missing[@]} -eq 0 ]; then
		pass "forward parity — all manifest entries exist on disk"
	else
		fail "forward parity — ${#missing[@]} manifest entr${missing[*]:+ies} not found on disk:"
		for m in "${missing[@]}"; do
			echo "         $m" >&2
		done
	fi
}

echo ""
echo "── Test 1: Manifest forward parity (no stale entries) ──"
test_manifest_forward_parity

# ── Test 2: Manifest reverse parity (no missing entries) ────────────────────

test_manifest_reverse_parity() {
	local unlisted=()
	local dir entry full_path

	if [ ! -f "$MANIFEST" ]; then
		fail "manifest file not found: $MANIFEST"
		return
	fi

	# Build a lookup set from the manifest (non-comment, non-blank lines)
	declare -A manifest_set
	while IFS= read -r line; do
		line="${line%$'\r'}"
		[[ -z "$line" || "$line" == \#* ]] && continue
		manifest_set["$line"]=1
	done < "$MANIFEST"

	# Check scope directories (non-recursive)
	for dir in "${SCOPE_DIRS[@]}"; do
		if [ ! -d "$REPO_ROOT/$dir" ]; then
			continue
		fi
		for entry in "$REPO_ROOT/$dir"/*; do
			[ -e "$entry" ] || continue
			full_path="${entry#$REPO_ROOT/}"
			# Skip if excluded
			[ -n "${REVERSE_EXCLUSIONS[$full_path]:-}" ] && continue
			# Skip if in manifest
			[ -n "${manifest_set[$full_path]:-}" ] && continue
			unlisted+=("$full_path")
		done
	done

	# Check root config files
	for entry in "${ROOT_CONFIGS[@]}"; do
		full_path="$entry"
		[ -n "${manifest_set[$full_path]:-}" ] && continue
		unlisted+=("$full_path")
	done

	if [ ${#unlisted[@]} -eq 0 ]; then
		pass "reverse parity — all quality-surface files are listed in manifest"
	else
		fail "reverse parity — ${#unlisted[@]} file${unlisted[*]:+s} in scope but not in manifest:"
		for u in "${unlisted[@]}"; do
			echo "         $u" >&2
		done
	fi
}

echo ""
echo "── Test 2: Manifest reverse parity (no missing entries) ──"
test_manifest_reverse_parity

# ── Summary ─────────────────────────────────────────────────────────────────

print_summary "setup scaffold"
exit $?




# vim: ft=sh sts=4 sw=4 ts=4 et :
