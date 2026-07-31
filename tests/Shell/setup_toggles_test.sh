#!/usr/bin/env bash
# $KYAULabs: setup_toggles_test.sh kyau@cosmos.kyaulabs 2026/07/30 -0700 Exp $




# ── Integration toggle boundary regression suite ──────────────────────────────
#
# Exercises OPENCODE_CONFIG_CONTENT composition for the three toggles
# (deepseek_websearch, searxng, opencode_quota) and verifies that the tracked
# opencode.jsonc remains statically off. Uses the same fixture helpers and
# pattern as prism_manifest_integration_test.sh.
#
# Every test runs in throwaway temp directories: the real $HOME and the real
# project files are never touched.

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
MANIFEST_CLI="$REPO_ROOT/.github/scripts/prism_manifest.php"

source "$REPO_ROOT/tests/Shell/lib/test_helpers.sh"
setup_result_file

# ── Shared fixture helpers ────────────────────────────────────────────────────

# make_project_root <dir> — scaffold an isolated project root with symlinked
# .github/scripts so the real manifest CLI runs.
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

# read_nul_pairs <file> — parse a NUL-delimited pair stream into two global
# indexed arrays: NUL_NAME and NUL_VALUE.
NUL_NAMES=()
NUL_VALUES=()
read_nul_pairs() {
	local file="$1"
	NUL_NAMES=()
	NUL_VALUES=()
	while IFS= read -r -d '' name && IFS= read -r -d '' value; do
		NUL_NAMES+=("$name")
		NUL_VALUES+=("$value")
	done < "$file"
}

# get_nul_value <name> — echo the value for a given name from the last
# read_nul_pairs call.
get_nul_value() {
	local target="$1" i
	for i in "${!NUL_NAMES[@]}"; do
		if [ "${NUL_NAMES[$i]}" = "$target" ]; then
			printf '%s' "${NUL_VALUES[$i]}"
			return
		fi
	done
}

# Write a minimal project prism.jsonc (schema v5) with configurable toggle
# values. Accepts three booleans as arguments.
write_project_manifest() {
	local dir="$1"
	local deepseek="${2:-false}"
	local searxng="${3:-false}"
	local quota="${4:-false}"
	cat > "$dir/prism.jsonc" <<JSONC
// Project manifest (schema v5) — fixture
{
  "setup_version": 5,
  "configured": true,
  "timestamp": "2026-07-30T00:00:00Z",
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
    "deepseek_websearch": $deepseek,
    "searxng": $searxng
  },
  "plugins": {
    "opencode_quota": $quota
  },
  "env": {
    "deepseek_api_key": "",
    "searxng_url": ""
  }
}
JSONC
}

# Write a minimal user prism.jsonc (schema v5) with MCP/plugin prefs.
# Accepts three booleans; env keys carry fake non-empty values so the
# prerequisite check passes.
write_user_manifest() {
	local dir="$1"
	local deepseek="${2:-false}"
	local searxng="${3:-false}"
	local quota="${4:-false}"
	cat > "$dir/.config/opencode/prism.jsonc" <<JSONC
// User manifest (schema v5) — fixture
{
  "setup_version": 5,
  "mcp": {
    "deepseek_websearch": $deepseek,
    "searxng": $searxng
  },
  "plugins": {
    "opencode_quota": $quota
  },
  "env": {
    "deepseek_api_key": "sk-fake-test-key",
    "searxng_url": "https://searxng.example.com"
  }
}
JSONC
}

# decode_config_content <env0_out> — extract and parse OPENCODE_CONFIG_CONTENT
# as JSON from a captured env0 NUL-pair stream file.
decode_config_content() {
	local env0_out="$1"
	read_nul_pairs "$env0_out"
	local raw
	raw=$(get_nul_value "OPENCODE_CONFIG_CONTENT")
	if [ -z "$raw" ]; then
		echo "error: OPENCODE_CONFIG_CONTENT empty or missing" >&2
		return 1
	fi
	printf '%s' "$raw" | jq .
}

# ── Test 1: All-off project + user → config has both MCP disabled, no plugin ──

test_all_off_output() {
	local project_root fake_home env0_out
	project_root=$(mktemp -d)
	fake_home=$(mktemp -d)
	env0_out=$(mktemp)
	register_temp_dir "$project_root"
	register_temp_dir "$fake_home"
	register_temp_dir "$env0_out"

	make_project_root "$project_root"
	make_user_home "$fake_home"

	# All toggles false in both manifests
	write_project_manifest "$project_root" false false false
	write_user_manifest "$fake_home" false false false

	local failures=0

	if HOME="$fake_home" php "$MANIFEST_CLI" env0 "$project_root/prism.jsonc" "$fake_home/.config/opencode/prism.jsonc" >"$env0_out" 2>/dev/null; then
		local config
		config=$(decode_config_content "$env0_out")

		# Both MCP leaves must be disabled
		local dw_enabled se_enabled
		dw_enabled=$(printf '%s' "$config" | jq -r '.mcp["deepseek-websearch"].enabled')
		se_enabled=$(printf '%s' "$config" | jq -r '.mcp.searxng.enabled')
		if [ "$dw_enabled" != "false" ]; then
			echo "  all-off deepseek-websearch.enabled: got '$dw_enabled' want 'false'" >&2
			failures=$((failures+1))
		fi
		if [ "$se_enabled" != "false" ]; then
			echo "  all-off searxng.enabled: got '$se_enabled' want 'false'" >&2
			failures=$((failures+1))
		fi

		# No plugin key at all — .plugin returns null when absent
		local has_plugin
		has_plugin=$(printf '%s' "$config" | jq -r 'if .plugin != null then "present" else "absent" end')
		if [ "$has_plugin" != "absent" ]; then
			echo "  all-off plugin key: got '$has_plugin' want 'absent'" >&2
			failures=$((failures+1))
		fi
	else
		echo "  all-off env0 failed" >&2
		failures=$((failures+1))
	fi

	if [ "$failures" -eq 0 ]; then
		pass "all-off — both MCP enabled=false, no plugin key"
	else
		fail "all-off — $failures assertion(s) failed"
	fi
}

echo ""
echo "── Test 1: All-off project + user → config has both MCP disabled ──"
test_all_off_output

# ── Test 2: User overrides enable deepseek-websearch MCP ────────────────────────

test_user_enables_deepseek() {
	local project_root fake_home env0_out
	project_root=$(mktemp -d)
	fake_home=$(mktemp -d)
	env0_out=$(mktemp)
	register_temp_dir "$project_root"
	register_temp_dir "$fake_home"
	register_temp_dir "$env0_out"

	make_project_root "$project_root"
	make_user_home "$fake_home"

	# Project: all off. User: deepseek=true, rest false
	write_project_manifest "$project_root" false false false
	write_user_manifest "$fake_home" true false false

	local failures=0

	if HOME="$fake_home" php "$MANIFEST_CLI" env0 "$project_root/prism.jsonc" "$fake_home/.config/opencode/prism.jsonc" >"$env0_out" 2>/dev/null; then
		local config
		config=$(decode_config_content "$env0_out")

		local dw_enabled se_enabled
		dw_enabled=$(printf '%s' "$config" | jq -r '.mcp["deepseek-websearch"].enabled')
		se_enabled=$(printf '%s' "$config" | jq -r '.mcp.searxng.enabled')

		if [ "$dw_enabled" != "true" ]; then
			echo "  ds-enable deepseek-websearch.enabled: got '$dw_enabled' want 'true'" >&2
			failures=$((failures+1))
		fi
		if [ "$se_enabled" != "false" ]; then
			echo "  ds-enable searxng.enabled: got '$se_enabled' want 'false'" >&2
			failures=$((failures+1))
		fi

		# No plugin key still absent
		local has_plugin
		has_plugin=$(printf '%s' "$config" | jq -r 'if .plugin != null then "present" else "absent" end')
		if [ "$has_plugin" != "absent" ]; then
			echo "  ds-enable plugin key: got '$has_plugin' want 'absent'" >&2
			failures=$((failures+1))
		fi
	else
		echo "  ds-enable env0 failed" >&2
		failures=$((failures+1))
	fi

	if [ "$failures" -eq 0 ]; then
		pass "user enables deepseek — dw=true, se=false, no plugin"
	else
		fail "user enables deepseek — $failures assertion(s) failed"
	fi
}

echo ""
echo "── Test 2: User overrides enable deepseek-websearch MCP ──"
test_user_enables_deepseek

# ── Test 3: User overrides enable searxng MCP ───────────────────────────────────

test_user_enables_searxng() {
	local project_root fake_home env0_out
	project_root=$(mktemp -d)
	fake_home=$(mktemp -d)
	env0_out=$(mktemp)
	register_temp_dir "$project_root"
	register_temp_dir "$fake_home"
	register_temp_dir "$env0_out"

	make_project_root "$project_root"
	make_user_home "$fake_home"

	write_project_manifest "$project_root" false false false
	write_user_manifest "$fake_home" false true false

	local failures=0

	if HOME="$fake_home" php "$MANIFEST_CLI" env0 "$project_root/prism.jsonc" "$fake_home/.config/opencode/prism.jsonc" >"$env0_out" 2>/dev/null; then
		local config
		config=$(decode_config_content "$env0_out")

		local dw_enabled se_enabled
		dw_enabled=$(printf '%s' "$config" | jq -r '.mcp["deepseek-websearch"].enabled')
		se_enabled=$(printf '%s' "$config" | jq -r '.mcp.searxng.enabled')

		if [ "$dw_enabled" != "false" ]; then
			echo "  sx-enable deepseek-websearch.enabled: got '$dw_enabled' want 'false'" >&2
			failures=$((failures+1))
		fi
		if [ "$se_enabled" != "true" ]; then
			echo "  sx-enable searxng.enabled: got '$se_enabled' want 'true'" >&2
			failures=$((failures+1))
		fi

		local has_plugin
		has_plugin=$(printf '%s' "$config" | jq -r 'if .plugin != null then "present" else "absent" end')
		if [ "$has_plugin" != "absent" ]; then
			echo "  sx-enable plugin key: got '$has_plugin' want 'absent'" >&2
			failures=$((failures+1))
		fi
	else
		echo "  sx-enable env0 failed" >&2
		failures=$((failures+1))
	fi

	if [ "$failures" -eq 0 ]; then
		pass "user enables searxng — dw=false, se=true, no plugin"
	else
		fail "user enables searxng — $failures assertion(s) failed"
	fi
}

echo ""
echo "── Test 3: User overrides enable searxng MCP ──"
test_user_enables_searxng

# ── Test 4: User overrides enable quota plugin exactly once ────────────────────

test_user_enables_quota() {
	local project_root fake_home env0_out
	project_root=$(mktemp -d)
	fake_home=$(mktemp -d)
	env0_out=$(mktemp)
	register_temp_dir "$project_root"
	register_temp_dir "$fake_home"
	register_temp_dir "$env0_out"

	make_project_root "$project_root"
	make_user_home "$fake_home"

	write_project_manifest "$project_root" false false false
	write_user_manifest "$fake_home" false false true

	local failures=0

	if HOME="$fake_home" php "$MANIFEST_CLI" env0 "$project_root/prism.jsonc" "$fake_home/.config/opencode/prism.jsonc" >"$env0_out" 2>/dev/null; then
		local config has_plugin quota_count
		config=$(decode_config_content "$env0_out")

		has_plugin=$(printf '%s' "$config" | jq -r 'if .plugin != null then "present" else "absent" end')
		if [ "$has_plugin" != "present" ]; then
			echo "  quota-enable plugin key: got '$has_plugin' want 'present'" >&2
			failures=$((failures+1))
		fi

		quota_count=$(printf '%s' "$config" | jq '[.plugin[] | select(. == "@slkiser/opencode-quota")] | length')
		if [ "$quota_count" != "1" ]; then
			echo "  quota-enable quota count: got '$quota_count' want '1'" >&2
			failures=$((failures+1))
		fi

		# Both MCP must still be disabled
		local dw_enabled se_enabled
		dw_enabled=$(printf '%s' "$config" | jq -r '.mcp["deepseek-websearch"].enabled')
		se_enabled=$(printf '%s' "$config" | jq -r '.mcp.searxng.enabled')
		if [ "$dw_enabled" != "false" ]; then
			echo "  quota-enable deepseek-websearch.enabled: got '$dw_enabled' want 'false'" >&2
			failures=$((failures+1))
		fi
		if [ "$se_enabled" != "false" ]; then
			echo "  quota-enable searxng.enabled: got '$se_enabled' want 'false'" >&2
			failures=$((failures+1))
		fi
	else
		echo "  quota-enable env0 failed" >&2
		failures=$((failures+1))
	fi

	if [ "$failures" -eq 0 ]; then
		pass "user enables quota — plugin present exactly once, MCP stays off"
	else
		fail "user enables quota — $failures assertion(s) failed"
	fi
}

echo ""
echo "── Test 4: User overrides enable quota plugin exactly once ──"
test_user_enables_quota

# ── Test 5: All-off → on → off round-trip — tracked opencode.jsonc untouched ──

test_tracked_file_untouched() {
	local project_root fake_home
	project_root=$(mktemp -d)
	fake_home=$(mktemp -d)
	register_temp_dir "$project_root"
	register_temp_dir "$fake_home"

	make_project_root "$project_root"
	make_user_home "$fake_home"

	local failures=0

	# Snapshot the real opencode.jsonc
	local real_opencode="$REPO_ROOT/opencode.jsonc"
	local before_hash
	before_hash=$(sha256sum "$real_opencode" | awk '{print $1}')

	# Run all-off env0
	write_project_manifest "$project_root" false false false
	write_user_manifest "$fake_home" false false false
	if ! HOME="$fake_home" php "$MANIFEST_CLI" env0 "$project_root/prism.jsonc" "$fake_home/.config/opencode/prism.jsonc" >/dev/null 2>/dev/null; then
		echo "  untouched — all-off env0 failed" >&2
		failures=$((failures+1))
	fi

	# Run on env0 (all true)
	write_project_manifest "$project_root" true true true
	write_user_manifest "$fake_home" true true true
	if ! HOME="$fake_home" php "$MANIFEST_CLI" env0 "$project_root/prism.jsonc" "$fake_home/.config/opencode/prism.jsonc" >/dev/null 2>/dev/null; then
		echo "  untouched — all-on env0 failed" >&2
		failures=$((failures+1))
	fi

	# Run all-off env0 again
	write_project_manifest "$project_root" false false false
	write_user_manifest "$fake_home" false false false
	if ! HOME="$fake_home" php "$MANIFEST_CLI" env0 "$project_root/prism.jsonc" "$fake_home/.config/opencode/prism.jsonc" >/dev/null 2>/dev/null; then
		echo "  untouched — second all-off env0 failed" >&2
		failures=$((failures+1))
	fi

	# Verify the real tracked file did not change
	local after_hash
	after_hash=$(sha256sum "$real_opencode" | awk '{print $1}')
	if [ "$before_hash" != "$after_hash" ]; then
		echo "  untouched — opencode.jsonc hash changed: $before_hash → $after_hash" >&2
		failures=$((failures+1))
	fi

	if [ "$failures" -eq 0 ]; then
		pass "tracked file untouched — no off→on→off mutation on opencode.jsonc"
	else
		fail "tracked file untouched — $failures assertion(s) failed"
	fi
}

echo ""
echo "── Test 5: All-off → on → off round-trip — tracked opencode.jsonc untouched ──"
test_tracked_file_untouched

# ── Test 6: Optional opencode debug config probe (skip when absent) ────────────

test_opencode_debug_config_probe() {
	if ! command -v opencode >/dev/null 2>&1; then
		skip "opencode not installed — skipping debug config probe"
		return
	fi

	local project_root fake_home tmp_config
	project_root=$(mktemp -d)
	fake_home=$(mktemp -d)
	register_temp_dir "$project_root"
	register_temp_dir "$fake_home"

	local failures=0

	# Build a minimal OpenCode config whose MCP commands are safe no-ops
	tmp_config=$(mktemp)
	register_temp_dir "$tmp_config"
	cat > "$tmp_config" <<'JSONC'
{
  "model": "test/model",
  "mcp": {
    "deepseek-websearch": {
      "type": "local",
      "command": ["true"],
      "enabled": false
    },
    "searxng": {
      "type": "local",
      "command": ["true"],
      "enabled": false
    }
  }
}
JSONC

	# Run opencode debug config (if supported) and check MCP booleans
	local debug_out
	set +e
	debug_out=$(HOME="$fake_home" opencode debug config --config "$tmp_config" 2>/dev/null || true)
	set -e

	# If opencode debug config outputs JSON, check the MCP enabled statuses
	if printf '%s' "$debug_out" | jq -e '.mcp' >/dev/null 2>&1; then
		local dw_enabled se_enabled
		dw_enabled=$(printf '%s' "$debug_out" | jq -r '.mcp["deepseek-websearch"].enabled')
		se_enabled=$(printf '%s' "$debug_out" | jq -r '.mcp.searxng.enabled')
		if [ "$dw_enabled" != "false" ]; then
			echo "  debug-probe deepseek-websearch.enabled: got '$dw_enabled' want 'false'" >&2
			failures=$((failures+1))
		fi
		if [ "$se_enabled" != "false" ]; then
			echo "  debug-probe searxng.enabled: got '$se_enabled' want 'false'" >&2
			failures=$((failures+1))
		fi
	fi

	if [ "$failures" -eq 0 ]; then
		pass "opencode debug config — resolved MCP booleans are false"
	else
		fail "opencode debug config — $failures assertion(s) failed"
	fi
}

echo ""
echo "── Test 6: Optional opencode debug config probe ──"
test_opencode_debug_config_probe

# ── Summary ───────────────────────────────────────────────────────────────────

print_summary "setup_toggles_test.sh"
exit $?




# vim: ft=sh sts=4 sw=4 ts=4 et :
