#!/usr/bin/env bash
# $KYAULabs: docs_writer_edit_scope_test.sh kyau@cosmos.kyaulabs 2026/07/22 -0700 Exp $









# Asserts the REAL @docs-writer agent frontmatter carries a scoped edit
# (catch-all deny + source-extension allows) and webfetch/task denials.
# Regression guard for issue #198 (unconstrained edit scope).

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
source "$REPO_ROOT/tests/Shell/lib/test_helpers.sh"
setup_result_file

AGENT="$REPO_ROOT/.opencode/agents/docs-writer.md"

if [ ! -f "$AGENT" ]; then
	fail "Cannot find docs-writer.md at $AGENT"
	exit 1
fi

echo ""
echo "── docs-writer edit scope (issue #198) ──"

failures=0

# Catch-all deny must be present (scoped edit marker).
if ! grep -qE '^[[:space:]]*"\*":[[:space:]]*deny[[:space:]]*$' "$AGENT"; then
	fail "docs-writer.md: missing scoped-edit catch-all ('\"*\": deny')"
	failures=$((failures + 1))
fi

# Each source extension the rcs-header skill governs must be allowed.
for ext in php js scss sh ts; do
	if ! grep -qE "^[[:space:]]*\"[*]\.${ext}\":[[:space:]]*allow[[:space:]]*\$" "$AGENT"; then
		fail "docs-writer.md: missing allow for '*.${ext}'"
		failures=$((failures + 1))
	fi
done

# docs/** must be allowed (docs-writer writes project documentation).
if ! grep -qE '^[[:space:]]*"docs/\*\*":[[:space:]]*allow[[:space:]]*$' "$AGENT"; then
	fail "docs-writer.md: missing allow for 'docs/**'"
	failures=$((failures + 1))
fi

# webfetch and task must be denied.
if ! grep -qE '^[[:space:]]*webfetch:[[:space:]]*deny[[:space:]]*$' "$AGENT"; then
	fail "docs-writer.md: missing 'webfetch: deny'"
	failures=$((failures + 1))
fi
if ! grep -qE '^[[:space:]]*task:[[:space:]]*deny[[:space:]]*$' "$AGENT"; then
	fail "docs-writer.md: missing 'task: deny'"
	failures=$((failures + 1))
fi

if [ "$failures" -eq 0 ]; then
	pass "docs-writer edit is scoped + webfetch/task denied"
fi

print_summary "docs-writer-edit-scope"
exit $?


# vim: ft=sh sts=4 sw=4 ts=4 et :
