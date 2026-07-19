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

# ── Shared helpers ────────────────────────────────────────────────────────────

# guard_no_overwrite <target>
# Exits with non-zero if <target> already exists (directory, file, or symlink).
# This is AC-2: the scaffold must never overwrite an existing path.
guard_no_overwrite() {
	local t="$1"
	if [ -e "$t" ] || [ -L "$t" ]; then
		if [ -d "$t" ]; then
			echo "Error: target exists (directory): $t — refusing to overwrite" >&2
		else
			echo "Error: target exists (file): $t — refusing to overwrite" >&2
		fi
		exit 1
	fi
}

# ── Subcommand dispatch ─────────────────────────────────────────────────────

subcommand="${1:-}"
shift || true

case "$subcommand" in
	--check-only|check-only|check)
		target="${1:-}"

		# ── Manifest validation (architect condition #4) ───────────────────

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

		# ── Target required ────────────────────────────────────────────────

		if [ -z "$target" ]; then
			echo "Error: target path required" >&2
			exit 1
		fi

		# ── AC-2: No-overwrite guard ───────────────────────────────────────

		guard_no_overwrite "$target"

		# ── check-only: print plan, touch nothing (AC-1) ───────────────────

		echo "Would copy ${#manifest_entries[@]} files into $target:"
		for entry in "${manifest_entries[@]}"; do
			echo "  $entry"
		done
		;;

	clone|clone-repo)
		owner_repo="${1:-}"
		target="${2:-}"

		if [ -z "$owner_repo" ] || [ -z "$target" ]; then
			cat >&2 <<'CLONE_USAGE'
Usage: setup-scaffold.sh clone <owner/repo> <target>

  Clone a quality-surface template via gh repo clone.
CLONE_USAGE
			exit 1
		fi

		# AC-2: No-overwrite guard
		guard_no_overwrite "$target"

		# Require gh (GitHub CLI) — ADR-0026 forbids falling back to raw git
		if ! command -v gh >/dev/null 2>&1; then
			echo "Error: gh (GitHub CLI) not found on PATH — install and run 'gh auth login'" >&2
			exit 2
		fi

		gh repo clone "$owner_repo" "$target" || {
			echo "Error: gh repo clone failed (auth or network) — see gh output above" >&2
			exit 2
		}
		;;

	*)
		cat >&2 <<'USAGE'
Usage: setup-scaffold.sh [--manifest <path>] <command> [<target>]

Commands:
  check-only <target>  Preview what would be copied (read-only, no changes)
  clone <owner/repo> <target>
                       Clone quality-surface template via gh repo clone
USAGE
		exit 1
		;;
esac




# vim: ft=sh sts=4 sw=4 ts=4 et :
