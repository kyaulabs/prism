#!/usr/bin/env bash
# $KYAULabs: resolve-ocr-model.sh kyau@aura.kyaulabs 2026/08/18 -0700 Exp $

# resolve-ocr-model.sh — Resolve the OCR review model for the Tested-by
# commit footer (ADR-0064). Reads ONLY the top-level `model` key from
# ~/.opencodereview/config.json via Node JSON.parse and prints the bare
# model id (segment after the last /). Never prints the API key, provider
# config, or any other field; fails closed (exit 3, empty stdout) on every
# error path. PRISM_OCR_CONFIG overrides the config path (test seam only).
#
# Output: bare model id on stdout (bare ID segment after the last "/")
# Exit: 0 success, 3 when no valid model resolves

set -euo pipefail

CONFIG_FILE="${PRISM_OCR_CONFIG:-$HOME/.opencodereview/config.json}"

if [ ! -f "$CONFIG_FILE" ]; then
	printf '✗ OCR model resolution failed: config not found at %s\n' "$CONFIG_FILE" >&2
	exit 3
fi

MODEL="$(node -e '
const fs = require("fs");
const path = process.argv[1];
let raw;
try {
  raw = fs.readFileSync(path, "utf8");
} catch (e) {
  process.exit(3);
}
let data;
try {
  data = JSON.parse(raw);
} catch (e) {
  process.exit(3);
}
if (typeof data.model !== "string" || data.model.trim() === "") {
  process.exit(3);
}
process.stdout.write(data.model.trim());
' "$CONFIG_FILE" 2>/dev/null)" || {
	printf '✗ OCR model resolution failed: config unreadable or missing model key\n' >&2
	exit 3
}

case "$MODEL" in
	''|*[!A-Za-z0-9._/-]*)
		printf '✗ OCR model resolution failed: model value is not a valid model id\n' >&2
		exit 3
		;;
esac

printf '%s\n' "${MODEL##*/}"

# vim: ft=sh sts=4 sw=4 ts=4 et :
