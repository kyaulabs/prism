#!/usr/bin/env bash
# $KYAULabs: install-hooks.sh kyau@aura.kyaulabs 2026/09/01 -0700 Exp $

set -euo pipefail

if ! command -v prism-tool >/dev/null 2>&1; then
    echo "prism hook: prism-tool is unavailable; run /setup" >&2
    exit 1
fi

exec prism-tool hook reconcile --approval=yes

# vim: ft=sh sts=4 sw=4 ts=4 et :
