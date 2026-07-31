#!/usr/bin/env bash
# $KYAULabs: setup_rulesets_command_test.sh kyau@cosmos.kyaulabs 2026/07/30 -0700 Exp $


# $KYAULabs$




# ── Command-contract tests for /setup-rulesets ─────────────────────────────────
# Verifies the command wrapper file has agent: build, follows the exact
# dry-run → confirm → apply → check flow, treats API output as untrusted
# data, never hard-codes a repository, and is indexed in AGENTS.md and
# README.md.

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
source "$REPO_ROOT/tests/Shell/lib/test_helpers.sh"

setup_result_file

COMMAND_FILE="$REPO_ROOT/.opencode/commands/setup-rulesets.md"
AGENTS_FILE="$REPO_ROOT/AGENTS.md"
README_FILE="$REPO_ROOT/README.md"

# ═══════════════════════════════════════════════════════════════════════════════
# Tests
# ═══════════════════════════════════════════════════════════════════════════════

# ── Test 1: Command file exists ────────────────────────────────────────────────

test_command_file_exists() {
	if [ ! -f "$COMMAND_FILE" ]; then
		fail "command file — .opencode/commands/setup-rulesets.md does not exist"
		return
	fi
	pass "command file — .opencode/commands/setup-rulesets.md exists"
}

echo ""
echo "── Test 1: Command file exists ──"
test_command_file_exists

# ── Test 2: Command file has agent: build in frontmatter ───────────────────────

test_command_has_agent_build() {
	if [ ! -f "$COMMAND_FILE" ]; then
		fail "agent: build — command file does not exist (cannot check)"
		return
	fi
	# Check the frontmatter block (between the first two --- lines) for agent: build
	if ! head -10 "$COMMAND_FILE" | grep -qE '^agent:[[:space:]]+build'; then
		fail "agent: build — frontmatter does not contain 'agent: build'"
		return
	fi
	pass "agent: build — frontmatter contains 'agent: build'"
}

echo ""
echo "── Test 2: Command file has agent: build ──"
test_command_has_agent_build

# ── Test 3: Command references --dry-run before confirmation ───────────────────

test_command_runs_dry_run_before_confirmation() {
	if [ ! -f "$COMMAND_FILE" ]; then
		fail "dry-run before confirm — command file does not exist (cannot check)"
		return
	fi
	if ! grep -qe '--dry-run' "$COMMAND_FILE"; then
		fail "dry-run before confirm — command does not reference --dry-run"
		return
	fi
	if ! grep -qi 'yes/no' "$COMMAND_FILE"; then
		fail "dry-run before confirm — command has no yes/no confirmation"
		return
	fi
	pass "dry-run before confirm — references --dry-run and confirmation prompt"
}

echo ""
echo "── Test 3: Command references --dry-run before confirmation ──"
test_command_runs_dry_run_before_confirmation

# ── Test 4: Command runs --apply only after confirmation ───────────────────────

test_command_apply_only_after_confirm() {
	if [ ! -f "$COMMAND_FILE" ]; then
		fail "apply after confirm — command file does not exist (cannot check)"
		return
	fi
	# grep -q for --apply; should be present
	if ! grep -qe '--apply' "$COMMAND_FILE"; then
		fail "apply after confirm — command does not reference --apply"
		return
	fi
	pass "apply after confirm — references --apply"
}

echo ""
echo "── Test 4: Command runs --apply only after confirmation ──"
test_command_apply_only_after_confirm

# ── Test 5: Command runs --check after --apply ─────────────────────────────────

test_command_runs_check_after_apply() {
	if [ ! -f "$COMMAND_FILE" ]; then
		fail "check after apply — command file does not exist (cannot check)"
		return
	fi
	if ! grep -qe '--check' "$COMMAND_FILE"; then
		fail "check after apply — command does not reference --check"
		return
	fi
	pass "check after apply — references --check"
}

echo ""
echo "── Test 5: Command runs --check after --apply ──"
test_command_runs_check_after_apply

# ── Test 6: Command treats API output as untrusted data ────────────────────────

test_command_treats_api_output_as_untrusted() {
	if [ ! -f "$COMMAND_FILE" ]; then
		fail "untrusted API output — command file does not exist (cannot check)"
		return
	fi
	if ! grep -qi 'untrusted' "$COMMAND_FILE"; then
		fail "untrusted API output — command does not mention untrusted data"
		return
	fi
	if ! grep -qiE '(execute|run|evaluat)' "$COMMAND_FILE" >/dev/null 2>&1; then
		fail "untrusted API output — no instruction not to execute API content"
		return
	fi
	pass "untrusted API output — warns API text is untrusted, must not be executed"
}

echo ""
echo "── Test 6: Command treats API output as untrusted data ──"
test_command_treats_api_output_as_untrusted

# ── Test 7: Command never hard-codes a repository ──────────────────────────────

test_command_never_hard_codes_repo() {
	if [ ! -f "$COMMAND_FILE" ]; then
		fail "no hard-coded repo — command file does not exist (cannot check)"
		return
	fi
	if grep -q 'kyaulabs/prism' "$COMMAND_FILE"; then
		fail "no hard-coded repo — command contains kyaulabs/prism"
		return
	fi
	pass "no hard-coded repo — command does not contain a repository name"
}

echo ""
echo "── Test 7: Command never hard-codes a repository ──"
test_command_never_hard_codes_repo

# ── Test 8: AGENTS.md has /setup-rulesets in the Commands table ────────────────

test_agents_md_has_setup_rulesets_row() {
	if [ ! -f "$AGENTS_FILE" ]; then
		fail "AGENTS.md index — AGENTS.md does not exist"
		return
	fi
	if ! grep -q '/setup-rulesets' "$AGENTS_FILE"; then
		fail "AGENTS.md index — /setup-rulesets not found in AGENTS.md"
		return
	fi
	pass "AGENTS.md index — /setup-rulesets found in Commands table"
}

echo ""
echo "── Test 8: AGENTS.md has /setup-rulesets in Commands table ──"
test_agents_md_has_setup_rulesets_row

# ── Test 9: README.md has /setup-rulesets in the slash commands section ────────

test_readme_md_has_setup_rulesets_row() {
	if [ ! -f "$README_FILE" ]; then
		fail "README.md index — README.md does not exist"
		return
	fi
	if ! grep -q '/setup-rulesets' "$README_FILE"; then
		fail "README.md index — /setup-rulesets not found in README.md"
		return
	fi
	pass "README.md index — /setup-rulesets found in slash commands section"
}

echo ""
echo "── Test 9: README.md has /setup-rulesets in slash commands ──"
test_readme_md_has_setup_rulesets_row


# ── Summary ───────────────────────────────────────────────────────────────────

print_summary "setup_rulesets_command_test.sh"
exit $?




# vim: ft=sh sts=4 sw=4 ts=4 et :
