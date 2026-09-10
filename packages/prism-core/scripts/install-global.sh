#!/usr/bin/env bash
# $KYAULabs: install-global.sh kyau@aura.kyaulabs 2026/09/09 -0700 Exp $

set -euo pipefail

if [ "$#" -ne 0 ]; then
    echo 'Usage: install-global.sh (optional PRISM_CORE_SOURCE and PI_CODING_AGENT_DIR)' >&2
    exit 2
fi

SCRIPT_DIR=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
PKG_ROOT=$(cd -- "$SCRIPT_DIR/.." && pwd)
PI_DIR=${PI_CODING_AGENT_DIR:-$HOME/.pi/agent}
SOURCE=${PRISM_CORE_SOURCE:-$PKG_ROOT}

case "$SOURCE" in
    npm:@kyaulabs/prism-core|npm:@kyaulabs/prism-core@*)
        INSTALLED_ROOT="$PI_DIR/npm/node_modules/@kyaulabs/prism-core"
        ;;
    npm:*)
        echo 'Expected the prism-core package or a local Core path.' >&2
        exit 2
        ;;
    *)
        SOURCE=$(cd -- "$SOURCE" && pwd)
        INSTALLED_ROOT="$SOURCE"
        ;;
esac

if [ -z "${PRISM_CORE_SOURCE:-}" ] && [[ "$PKG_ROOT" == "$PI_DIR"/* ]]; then
    printf '%s\n' 'Refreshing context from the installed Core package.'
else
    pi install "$SOURCE"
    node "$SCRIPT_DIR/reconcile-core-source.js" "$PI_DIR/settings.json" "$SOURCE"
fi
node "$SCRIPT_DIR/deploy-context.js" "$INSTALLED_ROOT" "$PI_DIR"
printf '%s\n' 'Prism Core installed. Reload/restart Pi to load updated resources.'

# vim: ft=sh sts=4 sw=4 ts=4 et :
