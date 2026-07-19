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
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

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

# read_manifest_entries
# Populates the global manifest_entries array from MANIFEST.
# Skips blank lines and #-comments. Exits non-zero if manifest is missing
# or empty (architect condition #4: manifest does not exist → hard failure).
read_manifest_entries() {
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
}

# copy_quality_surface <target>
# Copies every manifest entry from REPO_ROOT into <target>, creating parent
# directories as needed. Fails loudly if a source file is missing (should
# never happen — forward parity guarantees it — but defensive).
copy_quality_surface() {
	local target="$1"
	local entry

	for entry in "${manifest_entries[@]}"; do
		if [ ! -f "$REPO_ROOT/$entry" ]; then
			echo "Error: source file not found (manifest forward parity broken): $entry" >&2
			exit 1
		fi
		# '--' sentinels guard against a $target whose name starts with '-'
		# (SAST: mkdir/cp option-injection hardening).
		mkdir -p -- "$target/$(dirname "$entry")"
		cp -- "$REPO_ROOT/$entry" "$target/$entry"
	done
}

# ── Subcommand dispatch ─────────────────────────────────────────────────────

subcommand="${1:-}"
shift || true

case "$subcommand" in
	--check-only|check-only|check)
		target="${1:-}"

		# ── Shared manifest read (architect condition #4) ──────────────────

		read_manifest_entries

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

		# Copy the quality surface on top of the cloned template (ADR-0026)
		read_manifest_entries
		copy_quality_surface "$target"
		echo "Cloned $owner_repo to $target and copied ${#manifest_entries[@]} quality-surface files."
		;;

	new)
		target="${1:-}"

		if [ -z "$target" ]; then
			echo "Error: target path required" >&2
			exit 1
		fi

		# AC-2: No-overwrite guard
		guard_no_overwrite "$target"

		# Read manifest now so file count is available for summary
		read_manifest_entries

		# Create the target directory and init a fresh git repo.
		# Trap: on any error during mkdir + git init, remove the partial dir.
		# The '--' sentinels guard against $target names starting with '-'
		# (SAST: mkdir/git/rm option-injection hardening).
		mkdir -p -- "$target"
		trap 'rm -rf -- "$target"; exit 1' ERR
		git init -- "$target"
		trap - ERR  # git init succeeded — disable cleanup trap

		# Copy the quality surface into the fresh repo (ADR-0026)
		copy_quality_surface "$target"
		echo "Scaffolded new project at $target with ${#manifest_entries[@]} quality-surface files."
		;;

	should-prompt)
		json="${1:-$REPO_ROOT/.opencode/setup.json}"

		# No setup.json → first run → prompt
		if [ ! -f "$json" ]; then
			exit 0
		fi

		# Extract setup_version (number) — dependency-free sed parse (no jq)
		ver=$(sed -n 's/.*"setup_version"[[:space:]]*:[[:space:]]*\([0-9][0-9]*\).*/\1/p' "$json" | head -1)
		ver="${ver:-0}"
		if [ "$ver" -lt 3 ]; then
			exit 0   # case a — version < 3, prompt for scaffold
		fi

		# Extract scaffold_mode (string)
		mode=$(sed -n 's/.*"scaffold_mode"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' "$json" | head -1)
		if [ "$mode" != "new" ] && [ "$mode" != "clone" ]; then
			exit 0   # case b — mode absent, skip, or unrecognized → re-prompt
		fi

		# Extract project_folder (string)
		folder=$(sed -n 's/.*"project_folder"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' "$json" | head -1)
		if [ -z "$folder" ]; then
			exit 0   # no folder recorded → incomplete record, re-prompt
		fi

		# Resolve relative to REPO_ROOT unless absolute
		case "$folder" in
			/*) check_path="$folder" ;;
			*)  check_path="$REPO_ROOT/$folder" ;;
		esac
		if [ -e "$check_path" ] || [ -L "$check_path" ]; then
			exit 1   # case c — folder exists, short-circuit
		fi
		exit 0       # case d — drift, folder missing, re-prompt
		;;

	*)
		cat >&2 <<'USAGE'
Usage: setup-scaffold.sh [--manifest <path>] <command> [<target>]

Commands:
  check-only <target>  Preview what would be copied (read-only, no changes)
  clone <owner/repo> <target>
                        Clone quality-surface template via gh repo clone
  new <target>         Create directory, git init, copy quality surface
  should-prompt [<setup.json>]
                        Test whether scaffold prompt should fire
USAGE
		exit 1
		;;
esac







# vim: ft=sh sts=4 sw=4 ts=4 et :
