#!/usr/bin/env bash
# $KYAULabs: prism_envrc_test.sh kyau@cosmos.kyaulabs 2026/07/30 -0700 Exp $




# ── Isolated integration tests for .envrc manifest sourcing (ADR-0043) ────────
#
# Verifies that .envrc exports the nineteen OPENCODE_*/secret environment
# variables from the layered prism.jsonc manifest via the dependency-free
# prism_manifest.php env0 CLI (NUL-separated transport, no eval).
#
# Every test runs in throwaway temp directories: the real $HOME and the real
# project files are never touched. Each fixture project root gets a copied
# .envrc plus a symlinked .github/scripts so prism_manifest.php runs for real.

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
source "$REPO_ROOT/tests/Shell/lib/test_helpers.sh"

setup_result_file

# ── Fixture helpers ──────────────────────────────────────────────────────────

# make_project_root <dir> — scaffold an isolated project root: a copied .envrc
# and a symlinked .github/scripts so the real prism_manifest.php CLI runs.
# Writes no manifest; the caller writes whichever prism.jsonc / legacy files
# the scenario needs.
make_project_root() {
	local dir="$1"
	mkdir -p "$dir/.github"
	ln -s "$REPO_ROOT/.github/scripts" "$dir/.github/scripts"
	cp "$REPO_ROOT/.envrc" "$dir/.envrc"
}

# make_user_home <dir> — create an empty fake HOME with the opencode config dir.
make_user_home() {
	mkdir -p "$1/.config/opencode"
}

# setup_default_fixture — the common Arrange for scenarios that start from the
# shipped project defaults with no user tier. Creates an isolated project root
# carrying the default prism.jsonc and an empty user home, all registered for
# EXIT-trap cleanup. Exposes the paths via the FX_* globals so each test reads
# as just its unique arrangement plus Act/Assert.
FX_PROJECT=""
FX_HOME=""
FX_STDERR=""
setup_default_fixture() {
	FX_PROJECT=$(mktemp -d)
	FX_HOME=$(mktemp -d)
	FX_STDERR=$(mktemp)
	register_temp_dir "$FX_PROJECT"
	register_temp_dir "$FX_HOME"
	register_temp_dir "$FX_STDERR"
	make_project_root "$FX_PROJECT"
	write_default_project_manifest "$FX_PROJECT"
	make_user_home "$FX_HOME"
}

# write_default_project_manifest <dir> — write the standard commented v5
# project prism.jsonc carrying the shipped defaults.
write_default_project_manifest() {
	local dir="$1"
	cat > "$dir/prism.jsonc" <<'JSONC'
// Project manifest (schema v5) — fixture for prism_envrc_test.sh
{
  "setup_version": 5,
  "configured": true,
  "timestamp": "2026-07-29T00:00:00Z",
  "app": "prism",
  "domain": "kyaulabs",
  "repo": "kyaulabs/prism",
  "signed_off_by_name": "kyau",
  "signed_off_by_email": "git@kyaulabs.com",
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
  "mcp": {
    "deepseek_websearch": false,
    "searxng": false
  },
  "plugins": {
    "opencode_quota": false
  },
  "env": {
    "deepseek_api_key": "",
    "searxng_url": ""
  }
}
JSONC
}

# run_envrc <project_root> <fake_home> <stderr_file>
#
# Source the fixture .envrc in a fresh subshell with HOME=<fake_home>. On
# success, dump each of the fifteen target variables as a "NAME<TAB>VALUE"
# line into the global RUN_ENVRC_OUT. Record the subshell exit status in
# RUN_ENVRC_RC and capture its stderr into <stderr_file>. On fail-closed
# paths the dump is empty and RUN_ENVRC_RC is non-zero.
#
# env -i scrubs the parent environment first so the test proves .envrc is the
# thing exporting the variables — without it the suite would pass tautologically
# by inheriting the direnv-loaded values from the host shell.
run_envrc() {
	local project_root="$1" fake_home="$2" stderr_file="$3"
	RUN_ENVRC_OUT=$(
		env -i HOME="$fake_home" PATH="$PATH" ${TMPDIR:+TMPDIR="$TMPDIR"} bash -c '
			source "'"$project_root"'/.envrc"
			rc=$?
			[ "$rc" -eq 0 ] || exit "$rc"
			printf "OPENCODE_MODEL_PRIMARY\t%s\n" "$OPENCODE_MODEL_PRIMARY"
			printf "OPENCODE_MODEL_PLANNER\t%s\n" "$OPENCODE_MODEL_PLANNER"
			printf "OPENCODE_MODEL_DESIGN\t%s\n" "$OPENCODE_MODEL_DESIGN"
			printf "OPENCODE_MODEL_JUDGE\t%s\n" "$OPENCODE_MODEL_JUDGE"
			printf "OPENCODE_MODEL_UTILITY\t%s\n" "$OPENCODE_MODEL_UTILITY"
			printf "OPENCODE_VARIANT_PRIMARY\t%s\n" "$OPENCODE_VARIANT_PRIMARY"
			printf "OPENCODE_VARIANT_PLANNER\t%s\n" "$OPENCODE_VARIANT_PLANNER"
			printf "OPENCODE_VARIANT_DESIGN\t%s\n" "$OPENCODE_VARIANT_DESIGN"
			printf "OPENCODE_VARIANT_JUDGE\t%s\n" "$OPENCODE_VARIANT_JUDGE"
			printf "OPENCODE_VARIANT_UTILITY\t%s\n" "$OPENCODE_VARIANT_UTILITY"
			printf "OPENCODE_EXPERIMENTAL_LSP_TOOL\t%s\n" "$OPENCODE_EXPERIMENTAL_LSP_TOOL"
			printf "OPENCODE_EXPERIMENTAL_SCOUT\t%s\n" "$OPENCODE_EXPERIMENTAL_SCOUT"
			printf "OPENCODE_EXPERIMENTAL_BACKGROUND_SUBAGENTS\t%s\n" "$OPENCODE_EXPERIMENTAL_BACKGROUND_SUBAGENTS"
			printf "OPENCODE_MCP_DEEPSEEK_WEBSEARCH\t%s\n" "$OPENCODE_MCP_DEEPSEEK_WEBSEARCH"
			printf "OPENCODE_MCP_SEARXNG\t%s\n" "$OPENCODE_MCP_SEARXNG"
			printf "OPENCODE_PLUGIN_OPENCODE_QUOTA\t%s\n" "$OPENCODE_PLUGIN_OPENCODE_QUOTA"
			printf "OPENCODE_CONFIG_CONTENT\t%s\n" "$OPENCODE_CONFIG_CONTENT"
			printf "DEEPSEEK_API_KEY\t%s\n" "$DEEPSEEK_API_KEY"
			printf "SEARXNG_URL\t%s\n" "$SEARXNG_URL"
		' 2>"$stderr_file"
	) && RUN_ENVRC_RC=0 || RUN_ENVRC_RC=$?
}

# get_var <name> — echo the dumped value of <name> from the last run_envrc.
# Splits only on the first tab so values may contain anything except a tab.
get_var() {
	printf '%s' "$RUN_ENVRC_OUT" | awk -v n="$1" 'BEGIN{FS="\t"} $1==n{sub(/^[^\t]*\t/,""); print; exit}'
}

# ── Test 1: Project defaults only — nineteen vars exported byte-identical ──────

test_project_defaults_only() {
	setup_default_fixture

	run_envrc "$FX_PROJECT" "$FX_HOME" "$FX_STDERR"

	if [ "$RUN_ENVRC_RC" -ne 0 ]; then
		fail "project defaults — .envrc exited $RUN_ENVRC_RC (expected 0)"
		echo "  stderr: $(cat "$FX_STDERR")" >&2
		return
	fi

	local failures=0
	# Independent expected literals (the shipped defaults), one assertion per var.
	local expected_model_primary="zai-coding-plan/glm-5.2"
	local expected_model_planner="openai/gpt-5.6-sol"
	local expected_model_design="openai/gpt-5.6-sol"
	local expected_model_judge="deepseek/deepseek-v4-pro"
	local expected_model_utility="deepseek/deepseek-v4-flash"
	local expected_variant_primary="max"
	local expected_variant_planner="xhigh"
	local expected_variant_design="xhigh"
	local expected_variant_judge="medium"
	local expected_variant_utility="medium"
	local expected_lsp="true"
	local expected_scout="true"
	local expected_bg="false"
	local expected_mcp_ds="false"
	local expected_mcp_sx="false"
	local expected_plugin_quota="false"

	[ "$(get_var OPENCODE_MODEL_PRIMARY)" = "$expected_model_primary" ] || { echo "  OPENCODE_MODEL_PRIMARY got '$(get_var OPENCODE_MODEL_PRIMARY)' want '$expected_model_primary'" >&2; failures=$((failures+1)); }
	[ "$(get_var OPENCODE_MODEL_PLANNER)" = "$expected_model_planner" ] || { echo "  OPENCODE_MODEL_PLANNER got '$(get_var OPENCODE_MODEL_PLANNER)' want '$expected_model_planner'" >&2; failures=$((failures+1)); }
	[ "$(get_var OPENCODE_MODEL_DESIGN)" = "$expected_model_design" ] || { echo "  OPENCODE_MODEL_DESIGN got '$(get_var OPENCODE_MODEL_DESIGN)' want '$expected_model_design'" >&2; failures=$((failures+1)); }
	[ "$(get_var OPENCODE_MODEL_JUDGE)" = "$expected_model_judge" ] || { echo "  OPENCODE_MODEL_JUDGE got '$(get_var OPENCODE_MODEL_JUDGE)' want '$expected_model_judge'" >&2; failures=$((failures+1)); }
	[ "$(get_var OPENCODE_MODEL_UTILITY)" = "$expected_model_utility" ] || { echo "  OPENCODE_MODEL_UTILITY got '$(get_var OPENCODE_MODEL_UTILITY)' want '$expected_model_utility'" >&2; failures=$((failures+1)); }
	[ "$(get_var OPENCODE_VARIANT_PRIMARY)" = "$expected_variant_primary" ] || { echo "  OPENCODE_VARIANT_PRIMARY got '$(get_var OPENCODE_VARIANT_PRIMARY)' want '$expected_variant_primary'" >&2; failures=$((failures+1)); }
	[ "$(get_var OPENCODE_VARIANT_PLANNER)" = "$expected_variant_planner" ] || { echo "  OPENCODE_VARIANT_PLANNER got '$(get_var OPENCODE_VARIANT_PLANNER)' want '$expected_variant_planner'" >&2; failures=$((failures+1)); }
	[ "$(get_var OPENCODE_VARIANT_DESIGN)" = "$expected_variant_design" ] || { echo "  OPENCODE_VARIANT_DESIGN got '$(get_var OPENCODE_VARIANT_DESIGN)' want '$expected_variant_design'" >&2; failures=$((failures+1)); }
	[ "$(get_var OPENCODE_VARIANT_JUDGE)" = "$expected_variant_judge" ] || { echo "  OPENCODE_VARIANT_JUDGE got '$(get_var OPENCODE_VARIANT_JUDGE)' want '$expected_variant_judge'" >&2; failures=$((failures+1)); }
	[ "$(get_var OPENCODE_VARIANT_UTILITY)" = "$expected_variant_utility" ] || { echo "  OPENCODE_VARIANT_UTILITY got '$(get_var OPENCODE_VARIANT_UTILITY)' want '$expected_variant_utility'" >&2; failures=$((failures+1)); }
	[ "$(get_var OPENCODE_EXPERIMENTAL_LSP_TOOL)" = "$expected_lsp" ] || { echo "  OPENCODE_EXPERIMENTAL_LSP_TOOL got '$(get_var OPENCODE_EXPERIMENTAL_LSP_TOOL)' want '$expected_lsp'" >&2; failures=$((failures+1)); }
	[ "$(get_var OPENCODE_EXPERIMENTAL_SCOUT)" = "$expected_scout" ] || { echo "  OPENCODE_EXPERIMENTAL_SCOUT got '$(get_var OPENCODE_EXPERIMENTAL_SCOUT)' want '$expected_scout'" >&2; failures=$((failures+1)); }
	[ "$(get_var OPENCODE_EXPERIMENTAL_BACKGROUND_SUBAGENTS)" = "$expected_bg" ] || { echo "  OPENCODE_EXPERIMENTAL_BACKGROUND_SUBAGENTS got '$(get_var OPENCODE_EXPERIMENTAL_BACKGROUND_SUBAGENTS)' want '$expected_bg'" >&2; failures=$((failures+1)); }
	[ "$(get_var OPENCODE_MCP_DEEPSEEK_WEBSEARCH)" = "$expected_mcp_ds" ] || { echo "  OPENCODE_MCP_DEEPSEEK_WEBSEARCH got '$(get_var OPENCODE_MCP_DEEPSEEK_WEBSEARCH)' want '$expected_mcp_ds'" >&2; failures=$((failures+1)); }
	[ "$(get_var OPENCODE_MCP_SEARXNG)" = "$expected_mcp_sx" ] || { echo "  OPENCODE_MCP_SEARXNG got '$(get_var OPENCODE_MCP_SEARXNG)' want '$expected_mcp_sx'" >&2; failures=$((failures+1)); }
	[ "$(get_var OPENCODE_PLUGIN_OPENCODE_QUOTA)" = "$expected_plugin_quota" ] || { echo "  OPENCODE_PLUGIN_OPENCODE_QUOTA got '$(get_var OPENCODE_PLUGIN_OPENCODE_QUOTA)' want '$expected_plugin_quota'" >&2; failures=$((failures+1)); }
	[ "$(get_var DEEPSEEK_API_KEY)" = "" ] || { echo "  DEEPSEEK_API_KEY got '$(get_var DEEPSEEK_API_KEY)' want ''" >&2; failures=$((failures+1)); }
	[ "$(get_var SEARXNG_URL)" = "" ] || { echo "  SEARXNG_URL got '$(get_var SEARXNG_URL)' want ''" >&2; failures=$((failures+1)); }

	if [ "$failures" -eq 0 ]; then
		pass "project defaults — all nineteen vars exported byte-identical"
	else
		fail "project defaults — $failures value(s) mismatched"
	fi
}

echo ""
echo "── Test 1: Project defaults only — nineteen vars byte-identical ──"
test_project_defaults_only

# ── Test 2: Per-field user overlay — overridden field wins, rest inherited ────

test_per_field_user_overlay() {
	setup_default_fixture

	# User tier overrides ONLY models.primary; every other field is inherited.
	cat > "$FX_HOME/.config/opencode/prism.jsonc" <<'JSONC'
// User override — partial
{
  "setup_version": 5,
  "models": {
    "primary": "user/override-primary"
  }
}
JSONC

	run_envrc "$FX_PROJECT" "$FX_HOME" "$FX_STDERR"

	if [ "$RUN_ENVRC_RC" -ne 0 ]; then
		fail "user overlay — .envrc exited $RUN_ENVRC_RC (expected 0)"
		echo "  stderr: $(cat "$FX_STDERR")" >&2
		return
	fi

	local failures=0
	# Overridden field: user value wins.
	[ "$(get_var OPENCODE_MODEL_PRIMARY)" = "user/override-primary" ] || { echo "  OPENCODE_MODEL_PRIMARY got '$(get_var OPENCODE_MODEL_PRIMARY)' want 'user/override-primary'" >&2; failures=$((failures+1)); }
	# Untouched fields: project defaults inherited.
	[ "$(get_var OPENCODE_MODEL_JUDGE)" = "deepseek/deepseek-v4-pro" ] || { echo "  OPENCODE_MODEL_JUDGE got '$(get_var OPENCODE_MODEL_JUDGE)' want 'deepseek/deepseek-v4-pro'" >&2; failures=$((failures+1)); }
	[ "$(get_var OPENCODE_VARIANT_PRIMARY)" = "max" ] || { echo "  OPENCODE_VARIANT_PRIMARY got '$(get_var OPENCODE_VARIANT_PRIMARY)' want 'max'" >&2; failures=$((failures+1)); }
	[ "$(get_var OPENCODE_EXPERIMENTAL_SCOUT)" = "true" ] || { echo "  OPENCODE_EXPERIMENTAL_SCOUT got '$(get_var OPENCODE_EXPERIMENTAL_SCOUT)' want 'true'" >&2; failures=$((failures+1)); }

	if [ "$failures" -eq 0 ]; then
		pass "user overlay — overridden field wins, all others inherited"
	else
		fail "user overlay — $failures value(s) mismatched"
	fi
}

echo ""
echo "── Test 2: Per-field user overlay ──"
test_per_field_user_overlay

# ── Test 3: Shell metacharacter safety — values exported literally, no eval ───
#
# A model value studded with $VAR, backticks, $(cmd), quotes, and semicolons
# must be exported BYTE-FOR-BYTE. The whole point of replacing jq+eval with
# the NUL-separated transport: no manifest value is ever interpreted by the
# shell, so this is an injection-proof path.

test_metacharacter_safety() {
	local project_root fake_home stderr_file
	project_root=$(mktemp -d)
	fake_home=$(mktemp -d)
	stderr_file=$(mktemp)
	register_temp_dir "$project_root"
	register_temp_dir "$fake_home"
	register_temp_dir "$stderr_file"

	make_project_root "$project_root"
	make_user_home "$fake_home"

	# The primary model carries hostile shell metacharacters. In valid JSONC
	# only the double-quotes are escaped (\""); $, backticks, parens, and
	# semicolons are literal JSON characters.
	cat > "$project_root/prism.jsonc" <<'JSONC'
{
  "setup_version": 5,
  "configured": true,
  "timestamp": "2026-07-29T00:00:00Z",
  "app": "prism",
  "domain": "kyaulabs",
  "repo": "kyaulabs/prism",
  "signed_off_by_name": "kyau",
  "signed_off_by_email": "git@kyaulabs.com",
  "accent": "sky-blue",
  "scaffold_mode": "skip",
  "project_folder": null,
  "models": {
    "primary": "$HOME`whoami`$(id -u);\"q\"",
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
  "mcp": {
    "deepseek_websearch": false,
    "searxng": false
  },
  "plugins": {
    "opencode_quota": false
  },
  "env": {
    "deepseek_api_key": "",
    "searxng_url": ""
  }
}
JSONC

	run_envrc "$project_root" "$fake_home" "$stderr_file"

	if [ "$RUN_ENVRC_RC" -ne 0 ]; then
		fail "metachar safety — .envrc exited $RUN_ENVRC_RC (expected 0)"
		echo "  stderr: $(cat "$stderr_file")" >&2
		return
	fi

	# The expected literal: $HOME stays the four characters $ H O M E, the
	# backtick whoami backtick stays literal, $(id -u) is not run, and the
	# semicolon + double-quotes survive verbatim.
	local expected='$HOME`whoami`$(id -u);"q"'
	local actual
	actual=$(get_var OPENCODE_MODEL_PRIMARY)

	if [ "$actual" = "$expected" ]; then
		pass "metachar safety — hostile value exported literally, no expansion/injection"
	else
		fail "metachar safety — value was mangled"
		echo "  got:  [$actual]" >&2
		echo "  want: [$expected]" >&2
	fi
}

echo ""
echo "── Test 3: Shell metacharacter safety ──"
test_metacharacter_safety

# ── Test 4: Malformed user manifest fails closed — no partial exports ────────

test_malformed_user_manifest_fails_closed() {
	setup_default_fixture

	# Broken JSONC in the user tier (trailing garbage after the object).
	printf '%s\n' '{ "setup_version": 5, this is : not : valid }' \
		> "$FX_HOME/.config/opencode/prism.jsonc"

	run_envrc "$FX_PROJECT" "$FX_HOME" "$FX_STDERR"

	# Must fail closed.
	if [ "$RUN_ENVRC_RC" -eq 0 ]; then
		fail "malformed user manifest — .envrc exited 0 (expected non-zero)"
		return
	fi

	# Must NOT export any partial values (dump stays empty on fail-closed).
	if [ -n "$(get_var OPENCODE_MODEL_PRIMARY)" ]; then
		fail "malformed user manifest — partial value leaked: '$(get_var OPENCODE_MODEL_PRIMARY)'"
		return
	fi

	pass "malformed user manifest — fails closed, no partial exports"
}

echo ""
echo "── Test 4: Malformed user manifest fails closed ──"
test_malformed_user_manifest_fails_closed

# ── Test 5: Absent project manifest fails closed with a clear error ──────────

test_absent_project_manifest_fails_closed() {
	local project_root fake_home stderr_file
	project_root=$(mktemp -d)
	fake_home=$(mktemp -d)
	stderr_file=$(mktemp)
	register_temp_dir "$project_root"
	register_temp_dir "$fake_home"
	register_temp_dir "$stderr_file"

	# Project root with .envrc + scripts but NO prism.jsonc.
	make_project_root "$project_root"
	make_user_home "$fake_home"

	run_envrc "$project_root" "$fake_home" "$stderr_file"

	if [ "$RUN_ENVRC_RC" -eq 0 ]; then
		fail "absent project manifest — .envrc exited 0 (expected non-zero)"
		return
	fi

	# Error must point the user at /setup (clear remediation, not a raw trace).
	if ! grep -q "/setup" "$stderr_file"; then
		fail "absent project manifest — error does not mention /setup"
		echo "  stderr: $(cat "$stderr_file")" >&2
		return
	fi

	pass "absent project manifest — fails closed with /setup remediation"
}

echo ""
echo "── Test 5: Absent project manifest fails closed ──"
test_absent_project_manifest_fails_closed

# ── Test 6: Legacy user setup.json — warned on stderr, ignored (not read) ────

test_legacy_user_setup_warned_and_ignored() {
	setup_default_fixture

	# Legacy user setup.json (v4) carrying a DISTINCTIVE primary model. If
	# .envrc read it, OPENCODE_MODEL_PRIMARY would become this value.
	cat > "$FX_HOME/.config/opencode/setup.json" <<'JSON'
{
  "setup_version": 4,
  "models": { "primary": "LEGACY_SHOULD_BE_IGNORED" },
  "variants": { "primary": "legacy" },
  "experimental": { "lsp_tool": false }
}
JSON

	run_envrc "$FX_PROJECT" "$FX_HOME" "$FX_STDERR"

	if [ "$RUN_ENVRC_RC" -ne 0 ]; then
		fail "legacy detection — .envrc exited $RUN_ENVRC_RC (expected 0)"
		echo "  stderr: $(cat "$FX_STDERR")" >&2
		return
	fi

	local failures=0

	# Deprecation warning must name the legacy file and /setup migration.
	if ! grep -qi "deprecated" "$FX_STDERR"; then
		echo "  stderr missing deprecation warning" >&2
		failures=$((failures+1))
	fi
	if ! grep -q "/setup" "$FX_STDERR"; then
		echo "  stderr missing /setup migration pointer" >&2
		failures=$((failures+1))
	fi

	# The legacy file must be IGNORED: project default wins, not the legacy value.
	if [ "$(get_var OPENCODE_MODEL_PRIMARY)" != "zai-coding-plan/glm-5.2" ]; then
		echo "  legacy value leaked into OPENCODE_MODEL_PRIMARY: '$(get_var OPENCODE_MODEL_PRIMARY)'" >&2
		failures=$((failures+1))
	fi

	if [ "$failures" -eq 0 ]; then
		pass "legacy detection — warned on stderr, legacy file ignored"
	else
		fail "legacy detection — $failures assertion(s) failed"
	fi
}

echo ""
echo "── Test 6: Legacy user setup.json warned + ignored ──"
test_legacy_user_setup_warned_and_ignored

# ── Test 7: Legacy project-only state rejected (no prism.jsonc) ──────────────
#
# A project that still only has the v4 .opencode/setup.json (un-migrated) must
# be rejected, not silently read. .envrc requires prism.jsonc and points the
# user at /setup to migrate.

test_legacy_project_only_rejected() {
	local project_root fake_home stderr_file
	project_root=$(mktemp -d)
	fake_home=$(mktemp -d)
	stderr_file=$(mktemp)
	register_temp_dir "$project_root"
	register_temp_dir "$fake_home"
	register_temp_dir "$stderr_file"

	make_project_root "$project_root"
	make_user_home "$fake_home"

	# Legacy v4 project setup.json but NO prism.jsonc.
	mkdir -p "$project_root/.opencode"
	cat > "$project_root/.opencode/setup.json" <<'JSON'
{
  "setup_version": 4,
  "app": "prism",
  "domain": "kyaulabs",
  "models": { "primary": "legacy-project-model" }
}
JSON

	run_envrc "$project_root" "$fake_home" "$stderr_file"

	if [ "$RUN_ENVRC_RC" -eq 0 ]; then
		fail "legacy project-only — .envrc exited 0 (expected non-zero)"
		return
	fi

	if ! grep -q "/setup" "$stderr_file"; then
		fail "legacy project-only — error does not mention /setup"
		echo "  stderr: $(cat "$stderr_file")" >&2
		return
	fi

	# And it must not have exported the legacy value either.
	if [ -n "$(get_var OPENCODE_MODEL_PRIMARY)" ]; then
		fail "legacy project-only — exported a value from the legacy file: '$(get_var OPENCODE_MODEL_PRIMARY)'"
		return
	fi

	pass "legacy project-only state rejected with /setup remediation"
}

echo ""
echo "── Test 7: Legacy project-only state rejected ──"
test_legacy_project_only_rejected

# ── Test 8: No secret leakage — stderr diagnostics never carry env values ────
#
# A user manifest carrying a real-looking secret in env.* plus a structural
# flaw that forces the CLI onto its stderr diagnostic path. The secret value
# must NEVER appear on stderr (defense-in-depth over the CLI's own redaction).

test_no_secret_leakage() {
	setup_default_fixture

	canary="DEEPSEEK_KEY_CANARY_DO_NOT_LEAK_98765"

	# User tier: a secret in env plus an EMPTY models.primary, which trips
	# validateUser() onto a stderr diagnostic without ever reaching success.
	cat > "$FX_HOME/.config/opencode/prism.jsonc" <<JSONC
{
  "setup_version": 5,
  "models": { "primary": "" },
  "env": { "deepseek_api_key": "$canary" }
}
JSONC

	run_envrc "$FX_PROJECT" "$FX_HOME" "$FX_STDERR"

	local failures=0

	# Validation failure must fail closed.
	if [ "$RUN_ENVRC_RC" -eq 0 ]; then
		echo "  no-leak — .envrc exited 0 (expected non-zero)" >&2
		failures=$((failures+1))
	fi

	# The canary must never reach stderr.
	if grep -q "$canary" "$FX_STDERR"; then
		echo "  no-leak — secret canary found on stderr" >&2
		failures=$((failures+1))
	fi

	# And it must not have been exported either (fail-closed).
	if [ "$(get_var DEEPSEEK_API_KEY)" = "$canary" ]; then
		echo "  no-leak — secret canary was exported despite failure" >&2
		failures=$((failures+1))
	fi

	if [ "$failures" -eq 0 ]; then
		pass "no secret leakage — stderr and exports carry no env values"
	else
		fail "no secret leakage — $failures assertion(s) failed"
	fi
}

echo ""
echo "── Test 8: No secret leakage ──"
test_no_secret_leakage

# ── Test 9: Sourcing .envrc preserves the caller's umask ─────────────────────
#
# .envrc runs on every cd into the project via direnv. It must not leak the
# umask 077 it uses to protect its temp file into the caller's shell — that
# would silently break every later file creation in the session.

test_preserves_caller_umask() {
	setup_default_fixture

	local before after
	before=0027
	after=$(env -i HOME="$FX_HOME" PATH="$PATH" bash -c '
		umask '"$before"'
		source "'"$FX_PROJECT"'/.envrc"
		umask
	' 2>/dev/null)

	if [ "$after" = "$before" ]; then
		pass "umask preserved — caller umask $before unchanged after sourcing"
	else
		fail "umask preserved — umask changed from $before to '$after'"
	fi
}

echo ""
echo "── Test 9: Caller umask preserved ──"
test_preserves_caller_umask

# ── Summary ─────────────────────────────────────────────────────────────────

print_summary "prism envrc"
exit $?





# vim: ft=sh sts=4 sw=4 ts=4 et :
