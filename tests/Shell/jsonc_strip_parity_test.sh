#!/usr/bin/env bash
# $KYAULabs: jsonc_strip_parity_test.sh kyau@aura.kyaulabs 2026/08/12 -0700 Exp $






set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
source "$REPO_ROOT/tests/Shell/lib/test_helpers.sh"

setup_result_file
CORPUS=$(mktemp -d)
register_temp_dir "$CORPUS"

printf '%s' '{"plain":"value"}' > "$CORPUS/01-plain.jsonc"
printf '%s' $'{\n  // line\n  "url": "https://opencode.ai/config.json"\n}\n' > "$CORPUS/02-line.jsonc"
printf '%s' '{"a":/* block */1,"quoted":"/* keep */ // keep","escaped":"a\\\"b"}' > "$CORPUS/03-block-and-strings.jsonc"
printf '%s' '{"a":1}// trailing without newline' > "$CORPUS/04-trailing-line.jsonc"
printf '%s' '{"a":1}/* unterminated' > "$CORPUS/05-unterminated-block.jsonc"
printf '\357\273\277{\r\n  // crlf\r\n  "a": 1\r\n}\r\n' > "$CORPUS/06-bom-crlf.jsonc"

for case_file in "$CORPUS"/*.jsonc; do
	js_output="$case_file.js.out"
	php_output="$case_file.php.out"

	node - "$REPO_ROOT/packages/prism-core/scripts/jsonc-strip.js" "$case_file" > "$js_output" <<'NODE'
const fs = require('fs');
const { stripJsoncComments } = require(process.argv[2]);
process.stdout.write(stripJsoncComments(fs.readFileSync(process.argv[3], 'utf8')));
NODE

	php -r 'require $argv[1]; echo strip_jsonc_comments((string) file_get_contents($argv[2]));' \
		"$REPO_ROOT/tests/Pest.php" "$case_file" > "$php_output"

	if cmp -s "$js_output" "$php_output"; then
		pass "$(basename "$case_file") matches in JavaScript and PHP"
	else
		fail "$(basename "$case_file") diverges between JavaScript and PHP"
	fi
done

print_summary "jsonc_strip_parity"






# vim: ft=sh sts=4 sw=4 ts=4 et :
