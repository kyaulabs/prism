#!/usr/bin/env bash
# $KYAULabs: review_agent_policy_test.sh kyau@cosmos.kyaulabs 2026/08/01 -0700 Exp $



# ── Review Agent Anti-Freeze Policy Test ────────────────────────────────────
# The four-axis @code-review must never freeze or halt progress: a transiently
# failing axis is retried once, a persistently failing axis is marked FAILED
# while the remaining axes continue, and the coordinator always returns a
# report with per-axis status. The old "report the error and stop" rule froze
# the whole review (and with it the /pr gate) on any ocr hiccup.
# ─────────────────────────────────────────────────────────────────────────────

set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$HERE/../.." && pwd)"
source "$REPO_ROOT/tests/Shell/lib/test_helpers.sh"
setup_result_file

AGENT_FILE="$REPO_ROOT/.opencode/agents/code-review.md"

assert_contains() {
	local file="$1" needle="$2" label="$3"
	if grep -Fq -- "$needle" "$file"; then
		pass "$label"
	else
		fail "$label — missing: $needle"
	fi
}

assert_not_contains() {
	local file="$1" needle="$2" label="$3"
	if grep -Fq -- "$needle" "$file"; then
		fail "$label — forbidden: $needle"
	else
		pass "$label"
	fi
}

# ── 1. agent file exists with read-only frontmatter ──────────────────────────

if [ -f "$AGENT_FILE" ]; then
	pass 'code-review agent file exists'
else
	fail 'code-review agent file missing'
fi

# ── 2. retry-once guidance for transient axis failure ────────────────────────

assert_contains "$AGENT_FILE" 'retry' \
	'coordinator retries a transiently failing axis'
assert_contains "$AGENT_FILE" 'transient' \
	'coordinator distinguishes transient from persistent failure'

# ── 3. axis continuation on persistent failure ───────────────────────────────

assert_contains "$AGENT_FILE" 'continue with the remaining axes' \
	'coordinator continues with remaining axes after a persistent axis failure'

# ── 4. always returns a report with per-axis status ──────────────────────────

assert_contains "$AGENT_FILE" 'per-axis status' \
	'report carries per-axis completion status'

# ── 5. old freeze rule is gone ───────────────────────────────────────────────

assert_not_contains "$AGENT_FILE" 'report the error and stop' \
	'no stale stop-on-ocr-failure freeze rule remains'

# ── Summary ─────────────────────────────────────────────────────────────────

print_summary "review agent policy"
exit $?


# vim: ft=sh sts=4 sw=4 ts=4 et :
