#!/usr/bin/env bash
# $KYAULabs: setup-scaffold.sh kyau@nova 2026/07/18 -0700 Exp $



# ── Quality-surface scaffold tool ────────────────────────────────────────────
# Copies the quality-surface manifest entries into a new project directory.
# Supports: check-only (preview), clone (copy from template), new (init fresh).
#
# Usage: setup-scaffold.sh [--manifest <path>] <command> [<target>]
#   check-only <target>  Preview what would be copied (read-only, no changes)

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# ── Parse optional --manifest override (before subcommand dispatch) ──────────

MANIFEST_OVERRIDE=""
while [ $# -gt 0 ]; do
	case "$1" in
		--manifest)
			MANIFEST_OVERRIDE="${2:?Error: --manifest requires a path}"
			shift 2
			;;
		*)
			break
			;;
	esac
done

MANIFEST="${MANIFEST_OVERRIDE:-$SCRIPT_DIR/quality-surface.manifest}"

# ── Subcommand dispatch ─────────────────────────────────────────────────────

subcommand="${1:-}"
[ $# -gt 0 ] && shift
target="${1:-}"

case "$subcommand" in
	--check-only|check-only|check)
		;;
	*)
		cat >&2 <<'USAGE'
Usage: setup-scaffold.sh [--manifest <path>] <command> [<target>]

Commands:
  check-only <target>  Preview what would be copied (read-only, no changes)
USAGE
		exit 1
		;;
esac

# ── Manifest validation (architect condition #4) ─────────────────────────────

if [ ! -f "$MANIFEST" ]; then
	echo "Error: manifest not found: $MANIFEST" >&2
	exit 1
fi

manifest_entries=()
while IFS= read -r line; do
	line="${line%$'\r'}"
	[[ -z "$line" || "$line" == \#* ]] && continue
	manifest_entries+=("$line")
done < "$MANIFEST"

if [ ${#manifest_entries[@]} -eq 0 ]; then
	echo "Error: manifest is empty (no non-comment entries): $MANIFEST" >&2
	exit 1
fi

# ── Target required ──────────────────────────────────────────────────────────

if [ -z "$target" ]; then
	echo "Error: target path required" >&2
	exit 1
fi

# ── AC-2: No-overwrite guard ─────────────────────────────────────────────────

if [ -e "$target" ] || [ -L "$target" ]; then
	if [ -d "$target" ]; then
		echo "Error: target exists (directory): $target — refusing to overwrite" >&2
	else
		echo "Error: target exists (file): $target — refusing to overwrite" >&2
	fi
	exit 1
fi

# ── check-only: print plan, touch nothing (AC-1) ─────────────────────────────

echo "Would copy ${#manifest_entries[@]} files into $target:"
for entry in "${manifest_entries[@]}"; do
	echo "  $entry"
done



# vim: ft=sh sts=4 sw=4 ts=4 et :
