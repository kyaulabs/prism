#!/usr/bin/env bash
# $KYAULabs: resolve_identity_test.sh kyau@cosmos.kyaulabs 2026/07/29 -0700 Exp $






# ── Isolated integration tests for resolve-identity.sh (ADR-0043) ────────────
#
# Verifies that resolve-identity.sh resolves the Signed-off-by identity from
# the layered prism.jsonc manifest via a single atomic prism_manifest.php
# values0 snapshot (project tier overlaid field-by-field by the optional user
# tier), with a git-config fallback only when the resolved pair is incomplete
# or the project manifest is absent.
#
# Every test runs in throwaway temp directories: the real $HOME and the real
# project files are never touched. Each fixture project root gets a symlinked
# .github/scripts so the real prism_manifest.php CLI runs for real, plus a
# disposable git repo so git rev-parse / git config resolve locally.

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
SCRIPT="$REPO_ROOT/.github/scripts/resolve-identity.sh"

source "$REPO_ROOT/tests/Shell/lib/test_helpers.sh"
setup_result_file

# ── Fixture helpers ──────────────────────────────────────────────────────────

# make_project_root <dir> — scaffold an isolated project root: a real git repo
# (so git rev-parse / git config resolve locally) and a symlinked .github/scripts
# so the real prism_manifest.php CLI runs. Writes no manifest; the caller writes
# whichever prism.jsonc the scenario needs.
make_project_root() {
	local dir="$1"
	git_init_test_repo "$dir"
	mkdir -p "$dir/.github"
	ln -s "$REPO_ROOT/.github/scripts" "$dir/.github/scripts"
}

# make_user_home <dir> — create an empty fake HOME with the opencode config dir.
make_user_home() {
	mkdir -p "$1/.config/opencode"
}

# write_project_manifest <dir> <name> <email> — write a valid schema-v5 project
# prism.jsonc carrying the given Signed-off-by identity. All other required
# fields carry valid shipped-style defaults so validateProject() accepts it.
write_project_manifest() {
	local dir="$1" name="$2" email="$3"
	cat > "$dir/prism.jsonc" <<JSONC
{
  "setup_version": 5,
  "configured": true,
  "timestamp": "2026-07-29T00:00:00Z",
  "app": "prism",
  "domain": "kyaulabs",
  "repo": "kyaulabs/prism",
  "signed_off_by_name": "$name",
  "signed_off_by_email": "$email",
  "accent": "sky-blue",
  "scaffold_mode": "skip",
  "project_folder": null,
  "models": {
    "primary": "zai-coding-plan/glm-5.2",
    "planner": "openai/gpt-5.6-sol",
    "design": "openai/gpt-5.6-sol",
    "judge": "deepseek/deepseek-v4-pro",
    "utility": "deepseek/deepseek-v4-flash"
  },
  "variants": {
    "primary": "max",
    "planner": "xhigh",
    "design": "xhigh",
    "judge": "medium",
    "utility": "medium"
  },
  "experimental": {
    "lsp_tool": true,
    "scout": true,
    "background_subagents": false
  },
  "env": {
    "deepseek_api_key": "",
    "searxng_url": ""
  }
}
JSONC
}

# Per-test fixture globals. fresh_fixture() populates them; run_resolver()
# consumes them.
FX_PROJECT=""
FX_HOME=""
FX_OUT=""
FX_ERR=""
RUN_RC=0

# fresh_fixture — create an isolated project root (git + scripts symlink) and an
# empty user home, all registered for EXIT-trap cleanup.
fresh_fixture() {
	FX_PROJECT=$(mktemp -d)
	FX_HOME=$(mktemp -d)
	FX_OUT=$(mktemp)
	FX_ERR=$(mktemp)
	register_temp_dir "$FX_PROJECT"
	register_temp_dir "$FX_HOME"
	register_temp_dir "$FX_OUT"
	register_temp_dir "$FX_ERR"
	make_project_root "$FX_PROJECT"
	make_user_home "$FX_HOME"
}

# run_resolver — invoke resolve-identity.sh from inside FX_PROJECT with an
# isolated HOME (no host global git config) and system gitconfig disabled, so
# only the fixture repo's local config is visible. Captures stdout/stderr into
# FX_OUT/FX_ERR and the exit status into RUN_RC.
run_resolver() {
	set +e
	( cd "$FX_PROJECT" && HOME="$FX_HOME" GIT_CONFIG_NOSYSTEM=1 bash "$SCRIPT" ) \
		>"$FX_OUT" 2>"$FX_ERR"
	RUN_RC=$?
	set -e
}

# ── Test 1: Project pair resolved, no user manifest ──────────────────────────

test_project_pair_no_user() {
	fresh_fixture
	write_project_manifest "$FX_PROJECT" "Annika Project" "annika@project.identity"

	run_resolver

	local expected="Annika Project <annika@project.identity>"
	if [ "$RUN_RC" -eq 0 ] && [ "$(cat "$FX_OUT")" = "$expected" ]; then
		pass "project pair resolved — '$expected'"
	else
		fail "project pair — rc=$RUN_RC out='$(cat "$FX_OUT")' want='$expected'"
		echo "  stderr: $(cat "$FX_ERR")" >&2
	fi
}

echo ""
echo "── Test 1: Project pair resolved, no user manifest ──"
test_project_pair_no_user

# ── Test 2: Partial user overlay — name from user, email inherited ───────────
#
# This is the KEY new behavior the old 3-tier fallback could not express: a user
# manifest carrying ONLY signed_off_by_name inherits signed_off_by_email from
# the project. The old jq whole-file fallback read both fields from one file, so
# an email-less user file produced an empty email and fell through to git.

test_partial_user_overlay() {
	fresh_fixture
	write_project_manifest "$FX_PROJECT" "Annika Project" "annika@project.identity"

	# User overrides ONLY the name.
	cat > "$FX_HOME/.config/opencode/prism.jsonc" <<'JSONC'
{ "setup_version": 5, "signed_off_by_name": "Bjorn Override" }
JSONC

	run_resolver

	# Name from user, email inherited from project.
	local expected="Bjorn Override <annika@project.identity>"
	if [ "$RUN_RC" -eq 0 ] && [ "$(cat "$FX_OUT")" = "$expected" ]; then
		pass "partial user overlay — name from user, email inherited from project"
	else
		fail "partial overlay — rc=$RUN_RC out='$(cat "$FX_OUT")' want='$expected'"
		echo "  stderr: $(cat "$FX_ERR")" >&2
	fi
}

echo ""
echo "── Test 2: Partial user overlay — name from user, email inherited ──"
test_partial_user_overlay

# ── Test 3: Complete user override — both fields from user ───────────────────

test_complete_user_override() {
	fresh_fixture
	write_project_manifest "$FX_PROJECT" "Annika Project" "annika@project.identity"

	cat > "$FX_HOME/.config/opencode/prism.jsonc" <<'JSONC'
{ "setup_version": 5, "signed_off_by_name": "Cora User", "signed_off_by_email": "cora@user.identity" }
JSONC

	run_resolver

	local expected="Cora User <cora@user.identity>"
	if [ "$RUN_RC" -eq 0 ] && [ "$(cat "$FX_OUT")" = "$expected" ]; then
		pass "complete user override — both fields from user"
	else
		fail "complete override — rc=$RUN_RC out='$(cat "$FX_OUT")' want='$expected'"
		echo "  stderr: $(cat "$FX_ERR")" >&2
	fi
}

echo ""
echo "── Test 3: Complete user override — both fields from user ──"
test_complete_user_override

# ── Test 4: Absent user + legacy setup.json ignored ──────────────────────────
#
# No user prism.jsonc, but a residual legacy ~/.config/opencode/setup.json
# carrying a DISTINCTIVE identity. The legacy file must NOT be read; the project
# identity must win.

test_absent_user_legacy_ignored() {
	fresh_fixture
	write_project_manifest "$FX_PROJECT" "Annika Project" "annika@project.identity"

	cat > "$FX_HOME/.config/opencode/setup.json" <<'JSON'
{ "setup_version": 4, "signed_off_by_name": "Legacy Ghost", "signed_off_by_email": "ghost@legacy.test" }
JSON

	run_resolver

	local expected="Annika Project <annika@project.identity>"
	if [ "$RUN_RC" -eq 0 ] && [ "$(cat "$FX_OUT")" = "$expected" ]; then
		pass "absent user — legacy setup.json ignored, project identity wins"
	else
		fail "absent user/legacy — rc=$RUN_RC out='$(cat "$FX_OUT")' want='$expected'"
		echo "  stderr: $(cat "$FX_ERR")" >&2
	fi
}

echo ""
echo "── Test 4: Absent user + legacy setup.json ignored ──"
test_absent_user_legacy_ignored

# ── Test 5: Malformed user manifest fails closed ─────────────────────────────
#
# A broken user prism.jsonc must fail closed (nonzero exit) and emit no partial
# identity to stdout. A present-but-malformed manifest is a configuration error,
# not something to silently work around via git.

test_malformed_user_fails_closed() {
	fresh_fixture
	write_project_manifest "$FX_PROJECT" "Annika Project" "annika@project.identity"

	printf '%s\n' '{ "setup_version": 5, this is : not : valid }' \
		> "$FX_HOME/.config/opencode/prism.jsonc"

	run_resolver

	local failures=0
	if [ "$RUN_RC" -eq 0 ]; then
		echo "  malformed user — exited 0 (expected nonzero)" >&2
		failures=$((failures+1))
	fi
	if [ -s "$FX_OUT" ]; then
		echo "  malformed user — partial output leaked: '$(cat "$FX_OUT")'" >&2
		failures=$((failures+1))
	fi
	if [ "$failures" -eq 0 ]; then
		pass "malformed user — fails closed (exit $RUN_RC), no partial output"
	else
		fail "malformed user — $failures assertion(s) failed"
	fi
}

echo ""
echo "── Test 5: Malformed user manifest fails closed ──"
test_malformed_user_fails_closed

# ── Test 6: Git fallback when the project manifest is absent ─────────────────
#
# validateProject() requires both identity fields non-empty, so a VALID project
# manifest always yields a complete pair — the git fallback cannot be reached
# through an incomplete valid pair. The realistic, constructable trigger is an
# ABSENT project manifest, which resolve-identity.sh treats as a soft failure:
# warn on stderr, then fall through to git config.

test_git_fallback_no_manifest() {
	fresh_fixture
	# No project prism.jsonc written. git_init_test_repo set the local identity.

	run_resolver

	local expected="Test User <test@example.com>"
	local failures=0
	if [ "$RUN_RC" -ne 0 ] || [ "$(cat "$FX_OUT")" != "$expected" ]; then
		echo "  git fallback — rc=$RUN_RC out='$(cat "$FX_OUT")' want='$expected'" >&2
		failures=$((failures+1))
	fi
	# The missing-manifest warning must point the user at the manifest.
	if ! grep -qi "prism.jsonc" "$FX_ERR"; then
		echo "  git fallback — stderr missing prism.jsonc warning" >&2
		failures=$((failures+1))
	fi
	if [ "$failures" -eq 0 ]; then
		pass "git fallback — absent project manifest → git config identity, warned"
	else
		fail "git fallback — $failures assertion(s) failed"
	fi
}

echo ""
echo "── Test 6: Git fallback when the project manifest is absent ──"
test_git_fallback_no_manifest

# ── Test 7: All sources fail exits 3 ─────────────────────────────────────────
#
# No project manifest and no git identity configured. Must exit 3, emit no
# identity to stdout, and print a clear remediation hint on stderr.

test_all_sources_fail() {
	fresh_fixture
	# No project prism.jsonc written.
	git -C "$FX_PROJECT" config --unset user.name 2>/dev/null || true
	git -C "$FX_PROJECT" config --unset user.email 2>/dev/null || true

	run_resolver

	local failures=0
	if [ "$RUN_RC" -ne 3 ]; then
		echo "  all-fail — exited $RUN_RC (expected 3)" >&2
		failures=$((failures+1))
	fi
	if [ -s "$FX_OUT" ]; then
		echo "  all-fail — stdout not empty: '$(cat "$FX_OUT")'" >&2
		failures=$((failures+1))
	fi
	if ! grep -qiE "(git config|/setup)" "$FX_ERR"; then
		echo "  all-fail — stderr lacks remediation hint" >&2
		failures=$((failures+1))
	fi
	if [ "$failures" -eq 0 ]; then
		pass "all sources fail — exit 3, no output, remediation on stderr"
	else
		fail "all sources fail — $failures assertion(s) failed"
	fi
}

echo ""
echo "── Test 7: All sources fail exits 3 ──"
test_all_sources_fail

# ── Summary ──────────────────────────────────────────────────────────────────

print_summary "resolve_identity_test.sh"
exit $?






# vim: ft=sh sts=4 sw=4 ts=4 et :
