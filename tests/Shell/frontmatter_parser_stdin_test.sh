#!/usr/bin/env bash
# $KYAULabs: frontmatter_parser_stdin_test.sh kyau@nova 2026/07/16 -0700 Exp $


# frontmatter_parser_stdin_test.sh — verifies the --stdin mode added to
# frontmatter-parser.js (used by the pre-commit skill-frontmatter check to
# parse staged blobs without temp files).

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
source "$REPO_ROOT/tests/Shell/lib/test_helpers.sh"

setup_result_file
P="$REPO_ROOT/.github/scripts/frontmatter-parser.js"

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

print_summary "frontmatter_parser_stdin"

# vim: ft=sh sts=4 sw=4 ts=4 et :
