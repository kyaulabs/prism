#!/usr/bin/env bash
# $KYAULabs: install-global.sh kyau@aura.kyaulabs 2026/08/19 -0700 Exp $

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
#   3. Deploy the owned prism-tool launcher and verify mandatory readiness.
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
LAUNCHER="$BIN_DIR/prism-tool"
NETWORK_APPROVED=false
UNINSTALL_LAUNCHER=false

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
    local launcher="$1"
    [ -f "$launcher" ] &&
        [ ! -L "$launcher" ] &&
        grep -qFx '# prism-core:managed-launcher begin' "$launcher" &&
        grep -qFx '# prism-core:managed-launcher end' "$launcher"
}

remove_managed_launcher() {
    if [ ! -e "$LAUNCHER" ] && [ ! -L "$LAUNCHER" ]; then
        echo "• no managed launcher at $LAUNCHER"
        return
    fi
    if ! launcher_is_managed "$LAUNCHER"; then
        echo "✗ refusing to remove an unmanaged launcher at $LAUNCHER" >&2
        exit 1
    fi
    rm -f -- "$LAUNCHER"
    echo "✓ removed managed launcher $LAUNCHER"
}

canonical_cli() {
    local candidate="$1"
    node -e 'const fs = require("node:fs"); process.stdout.write(fs.realpathSync(process.argv[1]));' "$candidate" 2>/dev/null
}

deploy_launcher() {
    local core_cli="$1" temp
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
    if { [ -e "$LAUNCHER" ] || [ -L "$LAUNCHER" ]; } && ! launcher_is_managed "$LAUNCHER"; then
        echo "✗ refusing to replace an unmanaged launcher at $LAUNCHER" >&2
        exit 1
    fi
    mkdir -p -- "$BIN_DIR"
    temp=$(mktemp "$BIN_DIR/.prism-tool.XXXXXX")
    {
        printf '#!/usr/bin/env bash\n'
        printf '# prism-core:managed-launcher begin\n'
        printf "exec node '%s' \"\$@\"\n" "$core_cli"
        printf '# prism-core:managed-launcher end\n'
    } > "$temp"
    chmod 0755 "$temp"
    mv -f -- "$temp" "$LAUNCHER"
    echo "✓ deployed managed launcher $LAUNCHER"
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
    remove_managed_launcher
    exit 0
fi

# --- 1. install the core package -------------------------------------------

if [[ "${PRISM_CORE_SOURCE:-}" == npm:* ]]; then
    if [ "$NETWORK_APPROVED" != true ]; then
        echo "✗ npm package installation requires --network-approved=yes" >&2
        exit 2
    fi
    echo "• installing core from approved npm source"
    npm_config_ignore_scripts=true pi install "$PRISM_CORE_SOURCE"
elif [ -n "${PRISM_CORE_SOURCE:-}" ]; then
	echo "• installing core from configured local source"
	pi install "$PRISM_CORE_SOURCE"
elif [[ "$PKG_ROOT" == "$PI_DIR"/* ]]; then
	echo "• core already under pi dir ($PKG_ROOT); skipping pi install"
else
	echo "• installing core from local source: $PKG_ROOT"
	pi install "$PKG_ROOT"
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
elif [ -n "${PRISM_CORE_SOURCE:-}" ]; then
    CORE_CLI_CANDIDATE="${PRISM_CORE_SOURCE%/}/scripts/prism-tool.js"
else
    CORE_CLI_CANDIDATE="$PKG_ROOT/scripts/prism-tool.js"
fi

if ! CORE_CLI=$(canonical_cli "$CORE_CLI_CANDIDATE"); then
    echo "✗ installed prism-core CLI is unavailable" >&2
    exit 1
fi
deploy_launcher "$CORE_CLI"

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
