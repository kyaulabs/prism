#!/usr/bin/env bash
# $KYAULabs: install-global.sh kyau@aura.kyaulabs 2026/08/12 -0700 Exp $







# install-global.sh — Install @kyaulabs/prism-core globally and deploy its
# always-on AGENTS.md + APPEND_SYSTEM.md into the pi config directory.
#
# pi packages install extensions/skills/prompts/themes — but NOT AGENTS.md.
# The global core must be "always running" (ADR-0058, ADR-0060), so this
# script does the two things `pi install` cannot:
#
#   1. `pi install` the core package (local source for dev, or npm).
#   2. Deploy AGENTS.md and APPEND_SYSTEM.md to the pi config dir, marked
#      idempotently: a re-run replaces the managed block; a pre-existing
#      user-owned file is backed up to *.bak once, then the prism block is
#      appended (pi concatenates all AGENTS.md into every session).
#
# Usage:
#   bash packages/prism-core/scripts/install-global.sh
#
# Env:
#   PI_CODING_AGENT_DIR  pi config dir (default ~/.pi/agent)
#   PRISM_CORE_SOURCE    override the install source, e.g.
#                        npm:@kyaulabs/prism-core (forces npm) or an
#                        absolute path (forces a local-path install)

set -euo pipefail

SCRIPT_DIR=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
PKG_ROOT=$(cd -- "$SCRIPT_DIR/.." && pwd)
PI_DIR=${PI_CODING_AGENT_DIR:-$HOME/.pi/agent}

mark_begin() {
	printf '<!-- prism-core:begin %s do not edit; managed by install-global.sh -->\n' "$1"
}
mark_end() {
	printf '<!-- prism-core:end %s -->\n' "$1"
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

# --- 1. install the core package -------------------------------------------

if [ -n "${PRISM_CORE_SOURCE:-}" ]; then
	echo "• installing core (PRISM_CORE_SOURCE): $PRISM_CORE_SOURCE"
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

cat <<EOF

✓ prism-core installed globally.
  Its skills, prompts, and the safety extension load in every trusted
  project, and $PI_DIR/AGENTS.md concatenates into every session — the
  core is "always running" (ADR-0060).

Next:
  • Run 'pi config' to enable/disable individual resources.
  • Inside a PHP project:  pi install -l npm:@kyaulabs/prism-php-web
    (or  pi install -l ./packages/prism-php-web  for local dev).
  • Authenticate the model: /login deepseek  (or export DEEPSEEK_API_KEY).
EOF








# vim: ft=sh sts=4 sw=4 ts=4 et :
