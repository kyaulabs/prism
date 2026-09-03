#!/usr/bin/env bash
# $KYAULabs: install-global.sh kyau@aura.kyaulabs 2026/09/02 -0700 Exp $

# install-global.sh — Install @kyaulabs/prism-core globally and deploy its
# always-on AGENTS.md + APPEND_SYSTEM.md into the pi config directory.
#
# pi packages install extensions/skills/prompts/themes — but NOT AGENTS.md.
# The global core must be "always running" (ADR-0058, ADR-0060), so this
# script completes the global installation boundary:
#
#   1. `pi install` the core package (local source for dev, or npm).
#   2. Deploy AGENTS.md and APPEND_SYSTEM.md to the pi config dir, marked
#      idempotently: a re-run replaces the managed block; a pre-existing
#      user-owned file is backed up to *.bak once, then the prism block is
#      appended (pi concatenates all AGENTS.md into every session).
#   3. Deploy the owned prism-tool and prism-review launchers and verify mandatory readiness.
#
# Usage:
#   bash packages/prism-core/scripts/install-global.sh [OPTIONS]
#
# Options:
#   --network-approved=yes  approve npm registry access
#   --uninstall-launcher    remove only a Prism-owned launcher
#
# Env:
#   PI_CODING_AGENT_DIR  pi config dir (default ~/.pi/agent)
#   PRISM_BIN_DIR        launcher directory (default ~/.local/bin)
#   PRISM_CORE_SOURCE    override the install source, e.g.
#                        npm:@kyaulabs/prism-core (forces npm) or an
#                        absolute path (forces a local-path install)

set -euo pipefail

SCRIPT_DIR=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
PKG_ROOT=$(cd -- "$SCRIPT_DIR/.." && pwd)
PI_DIR=${PI_CODING_AGENT_DIR:-$HOME/.pi/agent}
BIN_DIR=${PRISM_BIN_DIR:-$HOME/.local/bin}
TOOL_LAUNCHER="$BIN_DIR/prism-tool"
REVIEW_LAUNCHER="$BIN_DIR/prism-review"
LAUNCHER_LOCK="$BIN_DIR/.prism-launchers.lock"
LAUNCHER_LOCK_HELD=false
NETWORK_APPROVED=false
UNINSTALL_LAUNCHER=false
SELECTED_CORE_SOURCE=""

for argument in "$@"; do
    case "$argument" in
        --network-approved=yes)
            [ "$NETWORK_APPROVED" = false ] || { echo "✗ duplicate --network-approved=yes" >&2; exit 2; }
            NETWORK_APPROVED=true
            ;;
        --uninstall-launcher)
            [ "$UNINSTALL_LAUNCHER" = false ] || { echo "✗ duplicate --uninstall-launcher" >&2; exit 2; }
            UNINSTALL_LAUNCHER=true
            ;;
        *)
            echo "✗ unknown option" >&2
            exit 2
            ;;
    esac
done

if [ "$UNINSTALL_LAUNCHER" = true ] && [ "$NETWORK_APPROVED" = true ]; then
    echo "✗ --uninstall-launcher cannot be combined with registry approval" >&2
    exit 2
fi

mark_begin() {
	printf '<!-- prism-core:begin %s do not edit; managed by install-global.sh -->\n' "$1"
}
mark_end() {
	printf '<!-- prism-core:end %s -->\n' "$1"
}

launcher_is_managed() {
    local launcher="$1" name="$2" first begin command end target
    local prefix="exec node '" suffix="' \"\$@\""
    if [ "$name" = prism-review ]; then
        prefix="exec env -u NODE_OPTIONS -u NODE_PATH node '"
    fi
    [ -f "$launcher" ] && [ ! -L "$launcher" ] || return 1
    {
        IFS= read -r first &&
        IFS= read -r begin &&
        IFS= read -r command &&
        IFS= read -r end &&
        ! IFS= read -r
    } < "$launcher" || return 1
    [ "$first" = '#!/usr/bin/env bash' ] || return 1
    if [ "$begin" != "# prism-core:managed-launcher $name begin" ] ||
        [ "$end" != "# prism-core:managed-launcher $name end" ]; then
        [ "$name" = prism-tool ] &&
            [ "$begin" = '# prism-core:managed-launcher begin' ] &&
            [ "$end" = '# prism-core:managed-launcher end' ] || return 1
    fi
    case "$command" in
        "$prefix"*"$suffix") ;;
        "exec node '"*"$suffix")
            [ "$name" = prism-review ] || return 1
            prefix="exec node '"
            ;;
        *) return 1 ;;
    esac
    target=${command#"$prefix"}
    target=${target%"$suffix"}
    [ -n "$target" ] && [[ "$target" != *"'"* ]]
}

launcher_absent_or_managed() {
    local launcher="$1" name="$2"
    { [ ! -e "$launcher" ] && [ ! -L "$launcher" ]; } || launcher_is_managed "$launcher" "$name"
}

cleanup_launcher_lock() {
    if [ "$LAUNCHER_LOCK_HELD" = true ]; then
        rmdir -- "$LAUNCHER_LOCK" 2>/dev/null || true
        LAUNCHER_LOCK_HELD=false
    fi
}

rollback_launcher_transaction() {
    case "${launcher_transaction_kind:-}" in
        deploy)
            restore_launcher "$TOOL_LAUNCHER" prism-tool "${tool_checksum:-}" "${tool_backup:-}" || true
            restore_launcher "$REVIEW_LAUNCHER" prism-review "${review_checksum:-}" "${review_backup:-}" || true
            [ -z "${tool_temp:-}" ] || rm -f -- "$tool_temp"
            [ -z "${review_temp:-}" ] || rm -f -- "$review_temp"
            ;;
        uninstall)
            restore_launcher "$TOOL_LAUNCHER" prism-tool "" "${tool_backup:-}" || true
            restore_launcher "$REVIEW_LAUNCHER" prism-review "" "${review_backup:-}" || true
            ;;
    esac
    launcher_transaction_kind=""
}

terminate_launcher_transaction() {
    local status="$1"
    trap - HUP INT TERM
    rollback_launcher_transaction
    cleanup_launcher_lock
    exit "$status"
}

acquire_launcher_lock() {
    mkdir -p -- "$BIN_DIR"
    if ! mkdir -- "$LAUNCHER_LOCK" 2>/dev/null; then
        echo "✗ another launcher transaction is in progress" >&2
        exit 1
    fi
    LAUNCHER_LOCK_HELD=true
    trap cleanup_launcher_lock EXIT
    trap 'terminate_launcher_transaction 129' HUP
    trap 'terminate_launcher_transaction 130' INT
    trap 'terminate_launcher_transaction 143' TERM
}

release_launcher_lock() {
    cleanup_launcher_lock
    trap - EXIT HUP INT TERM
}

remove_managed_launchers() {
    local tool_backup="" review_backup="" tool_present=false review_present=false
    local launcher_transaction_kind=uninstall
    acquire_launcher_lock
    if ! launcher_absent_or_managed "$TOOL_LAUNCHER" prism-tool; then
        echo "✗ refusing to remove an unmanaged launcher at $TOOL_LAUNCHER" >&2
        exit 1
    fi
    if ! launcher_absent_or_managed "$REVIEW_LAUNCHER" prism-review; then
        echo "✗ refusing to remove an unmanaged launcher at $REVIEW_LAUNCHER" >&2
        exit 1
    fi
    [ ! -e "$TOOL_LAUNCHER" ] || tool_present=true
    [ ! -e "$REVIEW_LAUNCHER" ] || review_present=true
    if ! tool_backup=$(prepare_launcher_backup "$TOOL_LAUNCHER" prism-tool); then
        return 1
    fi
    if ! review_backup=$(prepare_launcher_backup "$REVIEW_LAUNCHER" prism-review); then
        return 1
    fi
    if ! evacuate_launcher "$TOOL_LAUNCHER" prism-tool "$tool_backup"; then
        return 1
    fi
    if ! evacuate_launcher "$REVIEW_LAUNCHER" prism-review "$review_backup"; then
        restore_launcher "$TOOL_LAUNCHER" prism-tool "" "$tool_backup" || true
        return 1
    fi
    launcher_transaction_kind=""
    if ! rm -f -- "$tool_backup" "$review_backup"; then
        return 1
    fi
    if [ "$tool_present" = true ]; then
        echo "✓ removed managed launcher $TOOL_LAUNCHER"
    else
        echo "• no managed launcher at $TOOL_LAUNCHER"
    fi
    if [ "$review_present" = true ]; then
        echo "✓ removed managed launcher $REVIEW_LAUNCHER"
    else
        echo "• no managed launcher at $REVIEW_LAUNCHER"
    fi
    release_launcher_lock
}

canonical_cli() {
    local candidate="$1"
    node -e 'const fs = require("node:fs"); process.stdout.write(fs.realpathSync(process.argv[1]));' "$candidate" 2>/dev/null
}

validate_cli_path() {
    local core_cli="$1"
    case "$core_cli" in
        /*) ;;
        *) echo "✗ managed core CLI path is not absolute" >&2; exit 1 ;;
    esac
    case "$core_cli" in
        *"'"*|*$'\n'*|*$'\r'*)
            echo "✗ managed core CLI path contains unsupported characters" >&2
            exit 1
            ;;
    esac
}

prepare_launcher() {
    local name="$1" core_cli="$2" temp command_prefix="exec node"
    temp=$(mktemp "$BIN_DIR/.${name}.XXXXXX")
    if [ "$name" = prism-review ]; then
        command_prefix="exec env -u NODE_OPTIONS -u NODE_PATH node"
    fi
    if ! {
        printf '#!/usr/bin/env bash\n'
        printf '# prism-core:managed-launcher %s begin\n' "$name"
        printf "%s '%s' \"\$@\"\n" "$command_prefix" "$core_cli"
        printf '# prism-core:managed-launcher %s end\n' "$name"
    } > "$temp"; then
        rm -f -- "$temp"
        return 1
    fi
    if ! chmod 0755 "$temp"; then
        rm -f -- "$temp"
        return 1
    fi
    printf '%s\n' "$temp"
}

move_no_clobber() {
    local source="$1" destination="$2"
    mv -n -- "$source" "$destination" || return 1
    [ ! -e "$source" ] && [ ! -L "$source" ]
}

launcher_checksum() {
    cksum "$1" | awk '{print $1 ":" $2}'
}

prepare_launcher_backup() {
    local launcher="$1" name="$2" backup
    if [ ! -e "$launcher" ]; then
        printf '\n'
        return 0
    fi
    backup=$(mktemp "$BIN_DIR/.${name}.backup.XXXXXX")
    if ! rm -f -- "$backup"; then
        return 1
    fi
    printf '%s\n' "$backup"
}

evacuate_launcher() {
    local launcher="$1" name="$2" backup="$3"
    if [ ! -e "$launcher" ]; then
        return 0
    fi
    if [ -z "$backup" ] || ! move_no_clobber "$launcher" "$backup"; then
        [ -z "$backup" ] || rm -f -- "$backup"
        return 1
    fi
    if ! launcher_is_managed "$backup" "$name"; then
        if ! move_no_clobber "$backup" "$launcher"; then
            echo "✗ concurrent launcher preserved at $backup" >&2
        fi
        return 1
    fi
}

restore_launcher() {
    local launcher="$1" name="$2" checksum="$3" backup="$4"
    if [ -e "$launcher" ] && launcher_is_managed "$launcher" "$name" \
        && [ "$(launcher_checksum "$launcher")" = "$checksum" ]; then
        rm -f -- "$launcher"
    fi
    if [ -n "$backup" ] && ! move_no_clobber "$backup" "$launcher"; then
        echo "✗ concurrent launcher prevented restoration; backup retained at $backup" >&2
        return 1
    fi
}

deploy_launchers() {
    local tool_cli="$1" review_cli="$2" tool_temp="" review_temp="" tool_checksum="" review_checksum=""
    local tool_backup="" review_backup="" launcher_transaction_kind=deploy
    validate_cli_path "$tool_cli"
    acquire_launcher_lock
    validate_cli_path "$review_cli"
    if ! launcher_absent_or_managed "$TOOL_LAUNCHER" prism-tool; then
        echo "✗ refusing to replace an unmanaged launcher at $TOOL_LAUNCHER" >&2
        exit 1
    fi
    if ! launcher_absent_or_managed "$REVIEW_LAUNCHER" prism-review; then
        echo "✗ refusing to replace an unmanaged launcher at $REVIEW_LAUNCHER" >&2
        exit 1
    fi
    mkdir -p -- "$BIN_DIR"
    if ! tool_temp=$(prepare_launcher prism-tool "$tool_cli"); then
        return 1
    fi
    if ! review_temp=$(prepare_launcher prism-review "$review_cli"); then
        rm -f -- "$tool_temp"
        return 1
    fi
    tool_checksum=$(launcher_checksum "$tool_temp")
    review_checksum=$(launcher_checksum "$review_temp")
    if ! tool_backup=$(prepare_launcher_backup "$TOOL_LAUNCHER" prism-tool); then
        rm -f -- "$tool_temp" "$review_temp"
        return 1
    fi
    if ! review_backup=$(prepare_launcher_backup "$REVIEW_LAUNCHER" prism-review); then
        rm -f -- "$tool_temp" "$review_temp"
        return 1
    fi
    if ! evacuate_launcher "$TOOL_LAUNCHER" prism-tool "$tool_backup"; then
        rm -f -- "$tool_temp" "$review_temp"
        return 1
    fi
    if ! evacuate_launcher "$REVIEW_LAUNCHER" prism-review "$review_backup"; then
        restore_launcher "$TOOL_LAUNCHER" prism-tool "$tool_checksum" "$tool_backup" || true
        rm -f -- "$tool_temp" "$review_temp"
        return 1
    fi
    if ! move_no_clobber "$tool_temp" "$TOOL_LAUNCHER"; then
        restore_launcher "$TOOL_LAUNCHER" prism-tool "$tool_checksum" "$tool_backup" || true
        restore_launcher "$REVIEW_LAUNCHER" prism-review "$review_checksum" "$review_backup" || true
        rm -f -- "$tool_temp" "$review_temp"
        return 1
    fi
    if ! move_no_clobber "$review_temp" "$REVIEW_LAUNCHER"; then
        restore_launcher "$TOOL_LAUNCHER" prism-tool "$tool_checksum" "$tool_backup" || true
        restore_launcher "$REVIEW_LAUNCHER" prism-review "$review_checksum" "$review_backup" || true
        rm -f -- "$review_temp"
        return 1
    fi
    launcher_transaction_kind=""
    rm -f -- "$tool_backup" "$review_backup"
    echo "✓ deployed managed launcher $TOOL_LAUNCHER"
    echo "✓ deployed managed launcher $REVIEW_LAUNCHER"
    release_launcher_lock
}

# deploy_marked <dest> <src> <marker_id>
#   - dest absent        -> write the marked block (markers + src).
#   - dest present, no   -> back up to dest.bak (first time only), append the
#     marker                 marked block.
#   - dest present,      -> replace the block between the markers with src.
#     marker present
deploy_marked() {
	local dest="$1" src="$2" id="$3"
	local dest_dir block
	dest_dir=$(dirname -- "$dest")
	mkdir -p -- "$dest_dir"
	block=$(mktemp)
	{
		mark_begin "$id"
		cat -- "$src"
		mark_end "$id"
	} > "$block"

	if [ ! -f "$dest" ]; then
		cat -- "$block" > "$dest"
		echo "✓ created $dest"
	elif ! grep -qF "$(mark_begin "$id")" "$dest"; then
		if [ ! -f "$dest.bak" ]; then
			cp -p -- "$dest" "$dest.bak"
			echo "• backed up existing $dest → $dest.bak"
		fi
		printf '\n' >> "$dest"
		cat -- "$block" >> "$dest"
		echo "✓ appended prism block to $dest"
	else
		local begin end
		begin=$(mark_begin "$id")
		end=$(mark_end "$id")
		awk -v begin="$begin" -v end="$end" -v repl="$block" '
			state == 0 && $0 == begin {
				state = 1
				while ((getline line < repl) > 0) print line
				next
			}
			state == 1 && $0 == end { state = 0; next }
			state == 1 { next }
			{ print }
		' "$dest" > "$dest.tmp" && mv -- "$dest.tmp" "$dest"
		echo "✓ refreshed prism block in $dest"
	fi
	rm -f -- "$block"
}

if [ "$UNINSTALL_LAUNCHER" = true ]; then
    remove_managed_launchers
    exit 0
fi

# --- 1. install the core package -------------------------------------------

if [[ "${PRISM_CORE_SOURCE:-}" == npm:* ]]; then
    if [[ ! "$PRISM_CORE_SOURCE" =~ ^npm:@kyaulabs/prism-core(@[^[:space:]@]+)?$ ]]; then
        echo "✗ configured npm core source is invalid" >&2
        exit 2
    fi
    SELECTED_CORE_SOURCE="$PRISM_CORE_SOURCE"
    if [ "$NETWORK_APPROVED" != true ]; then
        echo "✗ npm package installation requires --network-approved=yes" >&2
        exit 2
    fi
    echo "• installing core from approved npm source"
    npm_config_ignore_scripts=true pi install "$PRISM_CORE_SOURCE"
elif [ -n "${PRISM_CORE_SOURCE:-}" ]; then
    if ! SELECTED_CORE_SOURCE=$(canonical_cli "${PRISM_CORE_SOURCE%/}"); then
        echo "✗ configured local core source is unavailable" >&2
        exit 1
    fi
    echo "• installing core from configured local source"
    pi install "$SELECTED_CORE_SOURCE"
elif [[ "$PKG_ROOT" == "$PI_DIR"/* ]]; then
    SELECTED_CORE_SOURCE="$PKG_ROOT"
    echo "• core already under pi dir ($PKG_ROOT); skipping pi install"
else
    SELECTED_CORE_SOURCE="$PKG_ROOT"
    echo "• installing core from local source: $PKG_ROOT"
    pi install "$PKG_ROOT"
fi

if ! node "$PKG_ROOT/scripts/reconcile-core-source.js" \
    "$PI_DIR/settings.json" "$SELECTED_CORE_SOURCE"; then
    echo "✗ Prism Core settings reconciliation failed." >&2
    exit 1
fi

# --- 2. deploy the always-on context files ---------------------------------

for f in AGENTS.md APPEND_SYSTEM.md; do
	if [ ! -f "$PKG_ROOT/$f" ]; then
		echo "✗ missing template $PKG_ROOT/$f" >&2
		exit 1
	fi
	deploy_marked "$PI_DIR/$f" "$PKG_ROOT/$f" "$f"
done

# --- 3. deploy the stable launcher and verify readiness --------------------

if [[ "${PRISM_CORE_SOURCE:-}" == npm:* ]]; then
    CORE_CLI_CANDIDATE="$PI_DIR/npm/node_modules/@kyaulabs/prism-core/scripts/prism-tool.js"
    REVIEW_CLI_CANDIDATE="$PI_DIR/npm/node_modules/@kyaulabs/prism-core/scripts/prism-review.js"
elif [ -n "${PRISM_CORE_SOURCE:-}" ]; then
    CORE_CLI_CANDIDATE="${PRISM_CORE_SOURCE%/}/scripts/prism-tool.js"
    REVIEW_CLI_CANDIDATE="${PRISM_CORE_SOURCE%/}/scripts/prism-review.js"
else
    CORE_CLI_CANDIDATE="$PKG_ROOT/scripts/prism-tool.js"
    REVIEW_CLI_CANDIDATE="$PKG_ROOT/scripts/prism-review.js"
fi

if ! CORE_CLI=$(canonical_cli "$CORE_CLI_CANDIDATE"); then
    echo "✗ installed prism-core CLI is unavailable" >&2
    exit 1
fi
if ! REVIEW_CLI=$(canonical_cli "$REVIEW_CLI_CANDIDATE"); then
    echo "✗ installed prism-review CLI is unavailable" >&2
    exit 1
fi
deploy_launchers "$CORE_CLI" "$REVIEW_CLI"

case ":$PATH:" in
    *":$BIN_DIR:"*) ;;
    *) echo "⚠ $BIN_DIR is not on PATH; add it manually before invoking prism-tool" ;;
esac

LOCAL_REPORT=""
if ! LOCAL_REPORT=$(node "$CORE_CLI" doctor --local-only --json 2>&1); then
    printf '%s\n' "$LOCAL_REPORT" >&2
    echo "✗ prism toolchain local readiness failed" >&2
    exit 1
fi
echo "✓ prism toolchain local readiness PASS"

cat <<EOF

✓ prism-core installed globally.
  Its skills, prompts, and the safety extension load in every trusted
  project, and $PI_DIR/AGENTS.md concatenates into every session — the
  core is "always running" (ADR-0060).

Next:
  • Run /setup to grant standing OCR consent and verify live readiness.
  • Run 'pi config' to enable/disable individual resources.
  • Inside a PHP project:  pi install -l npm:@kyaulabs/prism-php-web
    (or  pi install -l ./packages/prism-php-web  for local dev).
  • Authenticate your provider: /login <provider>  (or export its API key).
EOF

# vim: ft=sh sts=4 sw=4 ts=4 et :
