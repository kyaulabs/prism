#!/usr/bin/env bash
# $KYAULabs: frontmatter_parser_stdin_test.sh kyau@aura.kyaulabs 2026/08/18 -0700 Exp $

# frontmatter_parser_stdin_test.sh — verifies the --stdin mode added to
# frontmatter-parser.js (used by the pre-commit skill-frontmatter check to
# parse staged blobs without temp files).

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
source "$REPO_ROOT/tests/Shell/lib/test_helpers.sh"

setup_result_file

if ! command -v node >/dev/null 2>&1 || ! node -e "require('js-yaml')" 2>/dev/null; then
	skip "node + js-yaml required (run: pnpm install)"
	exit 0
fi

P="$REPO_ROOT/packages/prism-core/scripts/frontmatter-parser.js"

# stdin mode returns the value
out=$(printf -- '---\nname: foo\ndescription: bar\n---\nbody' | node "$P" --stdin name)
if [ "$out" = "foo" ]; then
	pass "stdin mode returns name"
else
	fail "stdin mode: expected 'foo' got '$out'"
fi

# stdin mode with no frontmatter returns empty
out=$(printf -- 'no frontmatter here' | node "$P" --stdin name)
if [ -z "$out" ]; then
	pass "stdin mode empty when no frontmatter"
else
	fail "stdin mode: expected empty got '$out'"
fi

# file mode still works (backward compat)
tmp=$(mktemp); printf -- '---\nname: baz\n---\n' > "$tmp"
out=$(node "$P" "$tmp" name); rm -f "$tmp"
if [ "$out" = "baz" ]; then
	pass "file mode backward-compatible"
else
	fail "file mode: expected 'baz' got '$out'"
fi

# import mode returns the complete typed frontmatter object without
# executing the CLI body
out=$(node - "$P" <<'NODE'
const { parseFrontmatter } = require(process.argv[2]);
const doc = parseFrontmatter('---\nmode: subagent\ntemperature: 0.3\npermission:\n  lsp: allow\n---\nbody');
process.stdout.write(JSON.stringify(doc));
NODE
)
if [ "$out" = '{"mode":"subagent","temperature":0.3,"permission":{"lsp":"allow"}}' ]; then
	pass "module mode returns the complete typed frontmatter object without CLI side effects"
else
	fail "module mode did not return the complete typed frontmatter object"
fi

# malformed YAML exits 1 and prefixes the diagnostic with the stdin label
rc=0
err=$(printf -- '---\nmode: [unclosed\n---\n' | node "$P" --stdin mode 2>&1) || rc=$?
if [ "$rc" -eq 1 ] && printf '%s' "$err" | grep -q '^YAML parse error in <stdin>:'; then
	pass "malformed YAML exits 1 with a parse error diagnostic"
else
	fail "malformed YAML: expected exit 1 with 'YAML parse error in <stdin>:' prefix, got rc=$rc err='$err'"
fi

print_summary "frontmatter_parser_stdin"

# vim: ft=sh sts=4 sw=4 ts=4 et :
