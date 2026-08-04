#!/usr/bin/env bash
# $KYAULabs: setup-scaffold.sh kyau@cosmos.kyaulabs 2026/08/03 -0700 Exp $















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

# Detect realpath -m support (GNU) vs BSD (macOS). On macOS, install coreutils
# (brew install coreutils) for grealpath which supports -m. Check absolute
# Homebrew paths as fallback — PATH may be stripped (e.g., tests that exclude
# gh also strip /opt/homebrew/bin). (issue #193)
find_grealpath() {
	for candidate in grealpath /opt/homebrew/bin/grealpath /usr/local/bin/grealpath; do
		if command -v "$candidate" >/dev/null 2>&1; then
			echo "$candidate"
			return 0
		fi
	done
	return 1
}
if realpath -m / >/dev/null 2>&1; then
	REALPATH_M="realpath"
elif REALPATH_M="$(find_grealpath)"; then
	:  # REALPATH_M set by command substitution
else
	echo "Error: realpath -m not available — install GNU coreutils (brew install coreutils / apt install coreutils)" >&2
	exit 1
fi

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

# assert_path_contained <root> <path> [label]
# Canonicalizes <path> via realpath -m and exits 1 if it does not resolve
# inside <root>. <root> is resolved with realpath (must exist). Catches ..
# traversal, absolute escape, and symlink-escape in one check. (issue #193)
assert_path_contained() {
	local root="$1"
	local path="$2"
	local label="${3:-path}"
	local canon_root canon_path

	canon_root="$(realpath -- "$root")" || {
		echo "Error: cannot resolve containment root for $label: $root" >&2
		exit 1
	}
	canon_path="$($REALPATH_M -m -- "$path")" || {
		echo "Error: cannot resolve $label: $path" >&2
		exit 1
	}

	case "$canon_path" in
		"$canon_root"|"$canon_root"/*)
			return 0
			;;
		*)
			echo "Error: $label escapes containment root ($canon_root): $path" >&2
			exit 1
			;;
	esac
}

# validate_target <target>
# Security gate for user-supplied targets (issue #193, AC-1). Rejects empty,
# absolute, ..-traversal, and symlink-escape targets. On success, echoes the
# canonical absolute path under REPO_ROOT for all subsequent operations (so
# the working directory cannot relocate writes). Exits 1 on rejection.
validate_target() {
	local target="$1"
	local canon_root canon_path

	if [ -z "$target" ]; then
		echo "Error: target path is empty" >&2
		exit 1
	fi

	case "$target" in
		/*)
			echo "Error: target must be a relative path (absolute rejected): $target" >&2
			exit 1
			;;
	esac

	canon_root="$(realpath -- "$REPO_ROOT")"
	canon_path="$($REALPATH_M -m -- "$canon_root/$target")"

	case "$canon_path" in
		"$canon_root"|"$canon_root"/*)
			echo "$canon_path"
			;;
		*)
			echo "Error: target escapes repository root ($canon_root): $target" >&2
			exit 1
			;;
	esac
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

	# AC-2: every entry must resolve inside REPO_ROOT (source containment).
	# Rejects absolute entries and ../ traversal before any copy happens.
	local _entry _canon_root
	_canon_root="$(realpath -- "$REPO_ROOT")"
	for _entry in "${manifest_entries[@]}"; do
		case "$_entry" in
			/*)
				echo "Error: manifest entry must be relative (absolute rejected): $_entry" >&2
				exit 1
				;;
		esac
		assert_path_contained "$_canon_root" "$_canon_root/$_entry" "manifest entry"
	done
}

# copy_quality_surface <target>
# Copies every manifest entry from REPO_ROOT into <target>, creating parent
# directories as needed. Fails loudly if a source file is missing (should
# never happen — forward parity guarantees it — but defensive).
copy_quality_surface() {
	local target="$1"
	local entry
	local canon_target

	canon_target="$($REALPATH_M -m -- "$target")"

	for entry in "${manifest_entries[@]}"; do
		if [ ! -f "$REPO_ROOT/$entry" ]; then
			echo "Error: source file not found (manifest forward parity broken): $entry" >&2
			exit 1
		fi
		# AC-2: dest containment — entry must resolve inside the target root.
		assert_path_contained "$canon_target" "$canon_target/$entry" "manifest destination"
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

		# ── AC-1: containment + AC-2: no-overwrite guard ──────────────────

		canon_target="$(validate_target "$target")"
		guard_no_overwrite "$canon_target"

		# ── check-only: print plan, touch nothing (AC-1) ───────────────────

		echo "Would copy ${#manifest_entries[@]} files into $canon_target:"
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

		# AC-1: containment + AC-2: no-overwrite guard
		canon_target="$(validate_target "$target")"
		guard_no_overwrite "$canon_target"

		# Require gh (GitHub CLI) — ADR-0026 forbids falling back to raw git
		if ! command -v gh >/dev/null 2>&1; then
			echo "Error: gh (GitHub CLI) not found on PATH — install and run 'gh auth login'" >&2
			exit 2
		fi

		gh repo clone -- "$owner_repo" "$canon_target" || {
			echo "Error: gh repo clone failed (auth or network) — see gh output above" >&2
			exit 2
		}

		# Copy the quality surface on top of the cloned template (ADR-0026)
		read_manifest_entries
		copy_quality_surface "$canon_target"
		echo "Cloned $owner_repo to $canon_target and copied ${#manifest_entries[@]} quality-surface files."
		;;

	new)
		target="${1:-}"

		# AC-1: containment + AC-2: no-overwrite guard
		canon_target="$(validate_target "$target")"
		guard_no_overwrite "$canon_target"

		# Read manifest now so file count is available for summary
		read_manifest_entries

		# Create the target directory and init a fresh git repo.
		# Trap: on any error during mkdir + git init, remove the partial dir.
		# The '--' sentinels guard against $canon_target names starting with '-'
		# (SAST: mkdir/git/rm option-injection hardening).
		mkdir -p -- "$canon_target"
		trap 'rm -rf -- "$canon_target"; exit 1' ERR
		git init -- "$canon_target"
		trap - ERR  # git init succeeded — disable cleanup trap

		# Copy the quality surface into the fresh repo (ADR-0026)
		copy_quality_surface "$canon_target"
		echo "Scaffolded new project at $canon_target with ${#manifest_entries[@]} quality-surface files."
		;;

	should-prompt)
		project="${1:-$REPO_ROOT/prism.jsonc}"

		# Missing manifest is a configuration error (exit 2), not a prompt
		# decision — so /setup can't mistake "not configured yet" for "user
		# declined scaffolding."
		if [ ! -f "$project" ]; then
			echo "Error: project manifest not found: $project" >&2
			exit 2
		fi

		if ! command -v php >/dev/null 2>&1; then
			echo "Error: php is required to parse the project manifest" >&2
			exit 2
		fi

		# Single atomic snapshot — PROJECT-ONLY. The user manifest is never
		# consulted for scaffold bookkeeping: the '-' argument prevents user
		# overlays from changing scaffold decisions (plan lines 252-255).
		# The NUL-delimited stream is written to a temp file (bash variables
		# cannot hold NUL bytes) and parsed with paired read -d '' calls.
		# The CLI exit status is checked BEFORE any byte is consumed, so a
		# malformed manifest emits no partial scaffold state.
		_scaffold_tmp=""
		trap 'rm -f "$_scaffold_tmp" 2>/dev/null || :' EXIT
		umask 077
		_scaffold_tmp=$(mktemp)
		if ! php "$SCRIPT_DIR/prism_manifest.php" values0 "$project" - \
				setup_version scaffold_mode project_folder > "$_scaffold_tmp" 2>/dev/null; then
			echo "Error: cannot read scaffold state from manifest: $project" >&2
			exit 2
		fi

		_ver="" _mode="" _folder=""
		while IFS= read -r -d '' _label && IFS= read -r -d '' _value; do
			case "$_label" in
				setup_version)  _ver="$_value" ;;
				scaffold_mode)  _mode="$_value" ;;
				project_folder) _folder="$_value" ;;
			esac
		done < "$_scaffold_tmp"
		rm -f "$_scaffold_tmp"

		# The CLI validates setup_version === 6 and scaffold_mode ∈
		# {skip, clone, new}; a valid manifest is current. scaffold_mode skip
		# means the user already declined → short-circuit. clone/new check
		# project_folder drift (folder deleted since last setup → re-prompt).
		case "$_mode" in
			skip)
				exit 1   # user already declined scaffolding
				;;
			new|clone)
				if [ -z "$_folder" ]; then
					exit 0   # no folder recorded → incomplete, prompt
				fi
				case "$_folder" in
					/*) _check="$_folder" ;;
					*)  _check="$REPO_ROOT/$_folder" ;;
				esac
				if [ -e "$_check" ] || [ -L "$_check" ]; then
					exit 1   # folder exists → short-circuit
				fi
				exit 0       # drift — folder missing, re-prompt
				;;
		esac
		exit 0   # unrecognized mode → re-prompt (unreachable post-validation)
		;;

	*)
		cat >&2 <<'USAGE'
Usage: setup-scaffold.sh [--manifest <path>] <command> [<target>]

Commands:
  check-only <target>  Preview what would be copied (read-only, no changes)
  clone <owner/repo> <target>
                        Clone quality-surface template via gh repo clone
  new <target>         Create directory, git init, copy quality surface
  should-prompt [<prism.jsonc>]
                        Test whether scaffold prompt should fire
USAGE
		exit 1
		;;
esac















# vim: ft=sh sts=4 sw=4 ts=4 et :
