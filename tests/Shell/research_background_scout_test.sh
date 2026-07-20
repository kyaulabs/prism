#!/usr/bin/env bash
# $KYAULabs: research_background_scout_test.sh kyau@nova 2026/07/19 -0700 Exp $



# research_background_scout_test.sh — Harness contract test for Issue #141
#
# Asserts:
#   1. adr/0024-experimental-subagent-dependencies.md exists, Status: Accepted
#   2. CONTEXT.md defines `scout` and `background subagent`
#   3. .opencode/setup.json experimental.lsp_tool and experimental.scout are true
#   4. .envrc reads from .opencode/setup.json (via jq)
#   5. AGENTS.md documents all three experimental opencode flags
#   6. .opencode/commands/research.md handles --background
#   7. .opencode/skills/research-background/SKILL.md exists

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
source "$REPO_ROOT/tests/Shell/lib/test_helpers.sh"

setup_result_file

# ── 1. ADR-0024 ────────────────────────────────────────────────────────────

if [ -f "$REPO_ROOT/adr/0024-experimental-subagent-dependencies.md" ]; then
	# Check Status is Accepted (may have whitespace after colon)
	if grep -q "^## Status" "$REPO_ROOT/adr/0024-experimental-subagent-dependencies.md" && \
	   grep -q "^[Aa]ccepted" "$REPO_ROOT/adr/0024-experimental-subagent-dependencies.md"; then
		pass "adr/0024-experimental-subagent-dependencies.md exists and Status is Accepted"
	else
		fail "adr/0024-experimental-subagent-dependencies.md exists but Status is not Accepted"
	fi
else
	fail "adr/0024-experimental-subagent-dependencies.md does not exist"
fi

# ── 2. CONTEXT.md glossary ─────────────────────────────────────────────────
# Search specifically within the glossary table rows (pipe-delimited terms in
# Domain Glossary section) rather than across the entire file.

if grep -qiE '^\|.*scout.*\|' "$REPO_ROOT/CONTEXT.md" && grep -qiE '^\|.*background subagent.*\|' "$REPO_ROOT/CONTEXT.md"; then
	pass "CONTEXT.md defines scout and background subagent"
else
	fail "CONTEXT.md missing scout or background subagent glossary entry"
fi

# ── 3. .opencode/setup.json experimental section ────────────────────────────

LSP=$(jq -r '.experimental.lsp_tool' "$REPO_ROOT/.opencode/setup.json")
SCOUT=$(jq -r '.experimental.scout' "$REPO_ROOT/.opencode/setup.json")
if [ "$LSP" = "true" ] && [ "$SCOUT" = "true" ]; then
	pass "setup.json experimental.lsp_tool and experimental.scout are true"
else
	fail "setup.json missing LSP or scout experimental flag (LSP=$LSP SCOUT=$SCOUT)"
fi

# ── 4. .envrc sources .opencode/setup.json ─────────────────────────────────

if grep -q 'setup\.json' "$REPO_ROOT/.envrc"; then
	pass ".envrc sources .opencode/setup.json"
else
	fail ".envrc does not source .opencode/setup.json"
fi

# ── 5. AGENTS.md documents experimental flags ──────────────────────────────

has_lsp_doc=false
has_scout_doc=false
has_bg_doc=false
if grep -q 'OPENCODE_EXPERIMENTAL_LSP_TOOL' "$REPO_ROOT/AGENTS.md"; then
	has_lsp_doc=true
fi
if grep -q 'OPENCODE_EXPERIMENTAL_SCOUT' "$REPO_ROOT/AGENTS.md"; then
	has_scout_doc=true
fi
if grep -q 'OPENCODE_EXPERIMENTAL_BACKGROUND_SUBAGENTS' "$REPO_ROOT/AGENTS.md"; then
	has_bg_doc=true
fi
if $has_lsp_doc && $has_scout_doc && $has_bg_doc; then
	pass "AGENTS.md documents all three experimental opencode flags"
else
	fail "AGENTS.md missing one or more experimental flag references (LSP=$has_lsp_doc SCOUT=$has_scout_doc BACKGROUND=$has_bg_doc)"
fi

# ── 6. commands/research.md handles --background ───────────────────────────

if grep -q -- '--background' "$REPO_ROOT/.opencode/commands/research.md"; then
	pass ".opencode/commands/research.md handles --background"
else
	fail ".opencode/commands/research.md does not reference --background"
fi

# ── 7. research-background skill exists ────────────────────────────────────

if [ -f "$REPO_ROOT/.opencode/skills/research-background/SKILL.md" ]; then
	pass ".opencode/skills/research-background/SKILL.md exists"
else
	fail ".opencode/skills/research-background/SKILL.md does not exist"
fi

print_summary "research_background_scout"


# vim: ft=sh sts=4 sw=4 ts=4 et :
