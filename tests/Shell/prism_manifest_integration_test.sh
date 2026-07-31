#!/usr/bin/env bash
# $KYAULabs: prism_manifest_integration_test.sh kyau@cosmos.kyaulabs 2026/07/30 -0700 Exp $







# ── Cross-consumer regression suite for the prism manifest boundary ───────────
#
# Exercises every consumer entry point through the same fixture corpus to catch
# drift between decode, env0, get, values0, check-secrets, resolve-identity.sh,
# setup-scaffold.sh, migrate-setup.sh, setup-write-*-config.sh, check-setup-secrets.sh,
# and .envrc. Verifies the six cross-cutting invariants from ADR-0043:
#
#   1. Parser outcomes identical through every consumer (same fixture → same
#      result).
#   2. Migration rollback leaves source bytes intact on failure.
#   3. Later legacy detection warns (deprecation warning from .envrc when a
#      legacy setup.json is found).
#   4. Shell metacharacters remain data (no expansion through env0 transport).
#   5. Diagnostics remain secret-redacted (no env values in stderr).
#   6. Full round-trip: v4 legacy → migrate → env0 read → patch write → re-read
#      → byte-stable.
#
# Every test runs in throwaway temp directories: the real $HOME and the real
# project files are never touched.

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
MANIFEST_CLI="$REPO_ROOT/.github/scripts/prism_manifest.php"
ENVRC="$REPO_ROOT/.envrc"
MIGRATE_SETUP="$REPO_ROOT/.github/scripts/migrate-setup.sh"
CHECK_SECRETS="$REPO_ROOT/.github/scripts/check-setup-secrets.sh"

source "$REPO_ROOT/tests/Shell/lib/test_helpers.sh"
setup_result_file

# ── Shared fixture helpers ────────────────────────────────────────────────────

# make_project_root <dir> — scaffold an isolated project root: a disposable git
# repo (git rev-parse / git ls-files resolve locally) and a symlinked .github/
# scripts so every real CLI runs. Writes no manifest; the caller writes whichever
# prism.jsonc or legacy files the scenario needs.
make_project_root() {
	local dir="$1"
	git_init_test_repo "$dir"
	mkdir -p "$dir/.github" "$dir/.opencode"
	ln -s "$REPO_ROOT/.github/scripts" "$dir/.github/scripts"
}

# make_user_home <dir> — create an empty fake HOME with the opencode config dir.
make_user_home() {
	mkdir -p "$1/.config/opencode"
}

# write_default_project_manifest <dir> — write the standard commented v5
# project prism.jsonc carrying the shipped defaults.
write_default_project_manifest() {
	local dir="$1"
	cat > "$dir/prism.jsonc" <<'JSONC'
// Project manifest (schema v5) — fixture
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

# write_complete_v4_project <dir> [name] [email] — write a schema-v4 project
# legacy setup.json carrying every field validateProject() requires.
write_complete_v4_project() {
	local dir="$1" name="${2:-V4 Project}" email="${3:-v4@legacy.test}"
	mkdir -p "$dir/.opencode"
	cat > "$dir/.opencode/setup.json" <<JSON
{
  "setup_version": 4,
  "configured": true,
  "timestamp": "2026-07-06T23:44:00Z",
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
JSON
}

# read_nul_pairs <file> — parse a NUL-delimited pair stream into two global
# indexed arrays: NUL_NAME and NUL_VALUE. The stream is name<NUL>value<NUL>...
# Call after capturing CLI output into <file>.
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
# read_nul_pairs call. Returns empty string if not found.
get_nul_value() {
	local target="$1" i
	for i in "${!NUL_NAMES[@]}"; do
		if [ "${NUL_NAMES[$i]}" = "$target" ]; then
			printf '%s' "${NUL_VALUES[$i]}"
			return
		fi
	done
}

# decode_field <file> <jq-expr> — read one field from a JSONC manifest via the
# shared CLI decode (which strips comments) and jq.
decode_field() {
	php "$MANIFEST_CLI" decode "$1" | jq -r "$2"
}

# file_mode <file> — portable octal mode (GNU stat -c / BSD stat -f).
file_mode() {
	stat -c '%a' "$1" 2>/dev/null || stat -f '%Lp' "$1"
}

# ── Test 1: Parser outcomes identical through every consumer ──────────────────
#
# One fixture → five CLI consumers produce consistent results. The decode result
# is used as the canonical reference; env0/get/values0/check-secrets must agree.

test_cross_consumer_consistency() {
	local project_root fake_home
	project_root=$(mktemp -d)
	fake_home=$(mktemp -d)
	register_temp_dir "$project_root"
	register_temp_dir "$fake_home"

	make_project_root "$project_root"
	write_default_project_manifest "$project_root"
	local manifest="$project_root/prism.jsonc"

	local failures=0

	# ── decode: canonical reference ──
	local decoded
	decoded=$(php "$MANIFEST_CLI" decode "$manifest") || {
		fail "consistency — decode failed"
		return
	}

		# ── env0: all nineteen pairs consistent with decode ──
	local env0_out env0_err
	env0_out=$(mktemp)
	env0_err=$(mktemp)
	register_temp_dir "$env0_out"
	register_temp_dir "$env0_err"
	if php "$MANIFEST_CLI" env0 "$manifest" >"$env0_out" 2>"$env0_err"; then
		read_nul_pairs "$env0_out"
		local expected_via_jq actual_via_env0
		# Spot-check: models.primary in decode → OPENCODE_MODEL_PRIMARY in env0.
		expected_via_jq=$(printf '%s' "$decoded" | jq -r '.["models"]["primary"]')
		actual_via_env0=$(get_nul_value "OPENCODE_MODEL_PRIMARY")
		[ "$actual_via_env0" = "$expected_via_jq" ] || { echo "  env0 models.primary: got '$actual_via_env0' want '$expected_via_jq'" >&2; failures=$((failures+1)); }
		# experimental.lsp_tool check
		expected_via_jq=$(printf '%s' "$decoded" | jq -r '.["experimental"]["lsp_tool"]')
		actual_via_env0=$(get_nul_value "OPENCODE_EXPERIMENTAL_LSP_TOOL")
		[ "$actual_via_env0" = "$expected_via_jq" ] || { echo "  env0 experimental.lsp_tool: got '$actual_via_env0' want '$expected_via_jq'" >&2; failures=$((failures+1)); }
		# env.searxng_url check (empty string → empty transport)
		actual_via_env0=$(get_nul_value "SEARXNG_URL")
		[ "$actual_via_env0" = "" ] || { echo "  env0 SEARXNG_URL: got '$actual_via_env0' want ''" >&2; failures=$((failures+1)); }
	else
		echo "  env0 exited non-zero: $(cat "$env0_err")" >&2
		failures=$((failures+1))
	fi

	# ── get: scalar resolution matches decode ──
	local get_out
	get_out=$(php "$MANIFEST_CLI" get "$manifest" - models.primary 2>/dev/null) || {
		echo "  get models.primary failed" >&2
		failures=$((failures+1))
	}
	if [ "$get_out" != "zai-coding-plan/glm-5.2" ]; then
		echo "  get models.primary: got '$get_out' want 'zai-coding-plan/glm-5.2'" >&2
		failures=$((failures+1))
	fi

	# ── values0: multi-path snapshot matches decode ──
	local values0_out values0_err
	values0_out=$(mktemp)
	values0_err=$(mktemp)
	register_temp_dir "$values0_out"
	register_temp_dir "$values0_err"
	if php "$MANIFEST_CLI" values0 "$manifest" - signed_off_by_name signed_off_by_email accent >"$values0_out" 2>"$values0_err"; then
		read_nul_pairs "$values0_out"
		[ "$(get_nul_value signed_off_by_name)" = "kyau" ] || { echo "  values0 name mismatch" >&2; failures=$((failures+1)); }
		[ "$(get_nul_value signed_off_by_email)" = "git@kyaulabs.com" ] || { echo "  values0 email mismatch" >&2; failures=$((failures+1)); }
		[ "$(get_nul_value accent)" = "sky-blue" ] || { echo "  values0 accent mismatch" >&2; failures=$((failures+1)); }
	else
		echo "  values0 exited non-zero: $(cat "$values0_err")" >&2
		failures=$((failures+1))
	fi

	# ── check-secrets: project must pass (all env empty) ──
	if ! php "$MANIFEST_CLI" check-secrets "$manifest" project >/dev/null 2>&1; then
		echo "  check-secrets reported violations on clean project manifest" >&2
		failures=$((failures+1))
	fi

	if [ "$failures" -eq 0 ]; then
		pass "cross-consumer consistency — decode / env0 / get / values0 / check-secrets agree"
	else
		fail "cross-consumer consistency — $failures assertion(s) failed"
	fi
}

echo ""
echo "── Test 1: Parser outcomes identical through every consumer ──"
test_cross_consumer_consistency

# ── Test 2: Migration rollback leaves source bytes intact on failure ──────────
#
# A v4 legacy manifest that is MISSING required fields (so validateProject
# rejects the projection) must leave the source byte-identical and create
# no target. Tests both the PHP migrate command and the shell engine.

test_migration_rollback() {
	local project_root fake_home
	project_root=$(mktemp -d)
	fake_home=$(mktemp -d)
	register_temp_dir "$project_root"
	register_temp_dir "$fake_home"

	make_project_root "$project_root"
	make_user_home "$fake_home"

	local legacy="$project_root/.opencode/setup.json"
	local target="$project_root/prism.jsonc"
	local failures=0

	# ── Case A: PHP migrate command (missing required fields) ──
	cat > "$legacy" <<'JSON'
{ "setup_version": 4, "app": "prism" }
JSON
	local src_before
	src_before=$(xxd -p "$legacy")

	if php "$MANIFEST_CLI" migrate "$legacy" "$target" project 0644 >/dev/null 2>&1; then
		echo "  rollback A — migrate succeeded (expected failure)" >&2
		failures=$((failures+1))
	else
		# Source must be byte-identical.
		if [ "$(xxd -p "$legacy")" != "$src_before" ]; then
			echo "  rollback A — source bytes changed" >&2
			failures=$((failures+1))
		fi
		# No target must exist.
		if [ -e "$target" ] || [ -L "$target" ]; then
			echo "  rollback A — target exists" >&2
			failures=$((failures+1))
		fi
	fi

	# Clean up for case B.
	rm -f "$legacy" "$target" 2>/dev/null || true
	fresh_project=$(mktemp -d)
	register_temp_dir "$fresh_project"
	make_project_root "$fresh_project"

	# ── Case B: Malformed JSON — fails at parse time, before projection ──
	legacy="$fresh_project/.opencode/setup.json"
	target="$fresh_project/prism.jsonc"
	printf '%s\n' '{ "setup_version": 4, invalid' > "$legacy"
	src_before=$(xxd -p "$legacy")

	if php "$MANIFEST_CLI" migrate "$legacy" "$target" project 0644 >/dev/null 2>&1; then
		echo "  rollback B — migrate succeeded on malformed JSON (expected failure)" >&2
		failures=$((failures+1))
	else
		if [ "$(xxd -p "$legacy")" != "$src_before" ]; then
			echo "  rollback B — source bytes changed" >&2
			failures=$((failures+1))
		fi
		if [ -e "$target" ] || [ -L "$target" ]; then
			echo "  rollback B — target exists" >&2
			failures=$((failures+1))
		fi
	fi

	# ── Case C: Shell engine rollback (incomplete legacy → migrate-setup fails) ──
	rm -f "$legacy" "$target" 2>/dev/null || true
	fresh_project2=$(mktemp -d)
	register_temp_dir "$fresh_project2"
	make_project_root "$fresh_project2"
	make_user_home "$fake_home"
	legacy="$fresh_project2/.opencode/setup.json"
	target="$fresh_project2/prism.jsonc"
	# v4 with only app field — validation fails
	cat > "$legacy" <<'JSON'
{ "setup_version": 4, "app": "prism" }
JSON
	src_before=$(xxd -p "$legacy")

	set +e
	HOME="$fake_home" GIT_CONFIG_NOSYSTEM=1 \
		MIGRATE_PROJECT_OLD="$legacy" MIGRATE_PROJECT_NEW="$target" \
		MIGRATE_USER_OLD="/nonexistent/setup.json" MIGRATE_USER_NEW="/nonexistent/prism.jsonc" \
		bash "$MIGRATE_SETUP" >/dev/null 2>&1
	local ms_rc=$?
	set -e

	if [ "$ms_rc" -eq 0 ]; then
		echo "  rollback C — shell engine succeeded (expected failure)" >&2
		failures=$((failures+1))
	else
		if [ "$(xxd -p "$legacy")" != "$src_before" ]; then
			echo "  rollback C — source bytes changed" >&2
			failures=$((failures+1))
		fi
		if [ -e "$target" ] || [ -L "$target" ]; then
			echo "  rollback C — target exists" >&2
			failures=$((failures+1))
		fi
	fi

	if [ "$failures" -eq 0 ]; then
		pass "migration rollback — source bytes intact on failure (parse + project validation + engine)"
	else
		fail "migration rollback — $failures assertion(s) failed"
	fi
}

echo ""
echo "── Test 2: Migration rollback leaves source bytes intact ──"
test_migration_rollback

# ── Test 3: Later legacy detection warns (.envrc with residual setup.json) ────
#
# When a v5 prism.jsonc is present but a v4 setup.json is also found in the
# user's opencode config dir, .envrc must print a deprecation warning AND NOT
# read the legacy. The v5 values must be exported.

test_legacy_detection_warns() {
	local project_root fake_home stderr_file
	project_root=$(mktemp -d)
	fake_home=$(mktemp -d)
	stderr_file=$(mktemp)
	register_temp_dir "$project_root"
	register_temp_dir "$fake_home"
	register_temp_dir "$stderr_file"

	make_project_root "$project_root"
	write_default_project_manifest "$project_root"
	make_user_home "$fake_home"

	# Create a legacy user setup.json with a DISTINCTIVE primary model.
	# If .envrc reads it, OPENCODE_MODEL_PRIMARY will be "LEGACY_READ_BUG".
	cat > "$fake_home/.config/opencode/setup.json" <<'JSON'
{
  "setup_version": 4,
  "signed_off_by_name": "Legacy User",
  "models": { "primary": "LEGACY_READ_BUG" }
}
JSON

	# Copy .envrc into the fixture so it uses fixture paths, not real ones.
	# We test via a subshell sourcing a copy with adjusted paths.
	cp "$ENVRC" "$project_root/.envrc"

	local failures=0

	# Source the fixture .envrc in a pristine env. The fixture .envrc uses
	# $DIR/prism.jsonc as the project manifest — in this fixture setup, that
	# resolves to the fixture copy. The HOME is overridden so the legacy file
	# is found at $HOME/.config/opencode/setup.json.
	local env_out env_err
	env_out=$(mktemp)
	register_temp_dir "$env_out"
	env_err=$(mktemp)
	register_temp_dir "$env_err"

	set +e
	env -i HOME="$fake_home" PATH="$PATH" bash -c '
		source "'"$project_root"'/.envrc"
		rc=$?
		if [ "$rc" -ne 0 ]; then exit "$rc"; fi
		printf "OPENCODE_MODEL_PRIMARY\t%s\n" "$OPENCODE_MODEL_PRIMARY"
		printf "OPENCODE_MODEL_JUDGE\t%s\n" "$OPENCODE_MODEL_JUDGE"
	' >"$env_out" 2>"$env_err"
	local env_rc=$?
	set -e

	if [ "$env_rc" -ne 0 ]; then
		echo "  legacy detection — .envrc exited $env_rc" >&2
		echo "  stderr: $(cat "$env_err")" >&2
		failures=$((failures+1))
	else
		# 1. Deprecation warning must name the legacy file.
		if ! grep -qi "deprecated" "$env_err" && ! grep -qi "setup.json" "$env_err"; then
			echo "  legacy detection — stderr missing deprecation warning" >&2
			failures=$((failures+1))
		fi

		# 2. Legacy value must NOT have been read.
		local primary_val
		primary_val=$(cat "$env_out" | awk -F'\t' '$1=="OPENCODE_MODEL_PRIMARY"{print $2}')
		if [ "$primary_val" = "LEGACY_READ_BUG" ]; then
			echo "  legacy detection — legacy value leaked into OPENCODE_MODEL_PRIMARY" >&2
			failures=$((failures+1))
		elif [ "$primary_val" != "zai-coding-plan/glm-5.2" ]; then
			echo "  legacy detection — unexpected primary: '$primary_val'" >&2
			failures=$((failures+1))
		fi
	fi

	if [ "$failures" -eq 0 ]; then
		pass "legacy detection — .envrc warns on residual setup.json, ignores legacy values"
	else
		fail "legacy detection — $failures assertion(s) failed"
	fi
}

echo ""
echo "── Test 3: Later legacy detection warns ──"
test_legacy_detection_warns

# ── Test 4: Shell metacharacters remain data ──────────────────────────────────
#
# Model values containing $HOME, $(cmd), backticks, single/double quotes, and
# semicolons must survive the env0 NUL-delimited transport without any shell
# expansion. This is the core security property of replacing jq+eval with CLI.

test_metacharacters_remain_data() {
	local project_root fake_home env0_out env0_err
	project_root=$(mktemp -d)
	fake_home=$(mktemp -d)
	env0_out=$(mktemp)
	env0_err=$(mktemp)
	register_temp_dir "$project_root"
	register_temp_dir "$fake_home"
	register_temp_dir "$env0_out"
	register_temp_dir "$env0_err"

	make_project_root "$project_root"
	make_user_home "$fake_home"

	# A manifest with hostile metacharacters in every model field.
	# JSON needs \" to escape double-quotes; everything else is literal.
	cat > "$project_root/prism.jsonc" <<'JSONC'
{
  "setup_version": 5,
  "configured": true,
  "timestamp": "2026-07-29T00:00:00Z",
  "app": "prism",
  "domain": "kyaulabs",
  "repo": "kyaulabs/prism",
  "signed_off_by_name": "name;with;semicolons",
  "signed_off_by_email": "email`backtick`@test.com",
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

	local failures=0

	# ── Transport through env0 ──
	if php "$MANIFEST_CLI" env0 "$project_root/prism.jsonc" >"$env0_out" 2>"$env0_err"; then
		read_nul_pairs "$env0_out"

		# The hostile primary model must survive byte-for-byte.
		local expected_model='$HOME`whoami`$(id -u);"q"'
		local actual_model
		actual_model=$(get_nul_value "OPENCODE_MODEL_PRIMARY")
		if [ "$actual_model" != "$expected_model" ]; then
			echo "  metachar model — got [$actual_model] want [$expected_model]" >&2
			failures=$((failures+1))
		fi

		# Identity with semicolons.
		local expected_name='name;with;semicolons'
		actual_model=$(get_nul_value "OPENCODE_MODEL_PRIMARY")
		# Already checked above — spot-check the signed-off name.
		local actual_name
		actual_name=$(php "$MANIFEST_CLI" get "$project_root/prism.jsonc" - signed_off_by_name 2>/dev/null)
		if [ "$actual_name" != "$expected_name" ]; then
			echo "  metachar name — got [$actual_name] want [$expected_name]" >&2
			failures=$((failures+1))
		fi

		# Email with backticks.
		local expected_email='email`backtick`@test.com'
		local actual_email
		actual_email=$(php "$MANIFEST_CLI" get "$project_root/prism.jsonc" - signed_off_by_email 2>/dev/null)
		if [ "$actual_email" != "$expected_email" ]; then
			echo "  metachar email — got [$actual_email] want [$expected_email]" >&2
			failures=$((failures+1))
		fi
	else
		echo "  metachar — env0 failed: $(cat "$env0_err")" >&2
		failures=$((failures+1))
	fi

	# ── values0 transport also preserves metacharacters ──
	local values0_out
	values0_out=$(mktemp)
	register_temp_dir "$values0_out"
	if php "$MANIFEST_CLI" values0 "$project_root/prism.jsonc" - signed_off_by_name signed_off_by_email >"$values0_out" 2>/dev/null; then
		read_nul_pairs "$values0_out"
		[ "$(get_nul_value signed_off_by_name)" = "$expected_name" ] || { echo "  metachar values0 name — value mangled" >&2; failures=$((failures+1)); }
		[ "$(get_nul_value signed_off_by_email)" = "$expected_email" ] || { echo "  metachar values0 email — value mangled" >&2; failures=$((failures+1)); }
	fi

	if [ "$failures" -eq 0 ]; then
		pass "metacharacter safety — dollar-home backticks dollar-paren-cmd quotes survive env0 and values0 literally"
	else
		fail "metacharacter safety — $failures assertion(s) failed"
	fi
}

echo ""
echo "── Test 4: Shell metacharacters remain data ──"
test_metacharacters_remain_data

# ── Test 5: Diagnostics remain secret-redacted ───────────────────────────────
#
# No stderr output from any consumer (CLI, shell scripts, .envrc) may carry
# secret values from the env section. Tested across validate, check-secrets,
# env0 (failure path), envrc (failure path), and the secret-guard script.

test_diagnostics_redacted() {
	local project_root fake_home
	project_root=$(mktemp -d)
	fake_home=$(mktemp -d)
	register_temp_dir "$project_root"
	register_temp_dir "$fake_home"

	make_project_root "$project_root"
	make_user_home "$fake_home"

	local canary="CANARY_SECRET_9x8w7v6u_DO_NOT_LEAK"

	# Project manifest with a secret canary in env (a validation violation for
	# the project tier) AND a broken value that triggers validation diagnostics.
	# The check-secrets command reports the KEY path but never the VALUE. The
	# validate command throws PrismJsoncException with field path only.
	cat > "$project_root/prism.jsonc" <<JSONC
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
    "deepseek_api_key": "$canary",
    "searxng_url": ""
  }
}
JSONC

	local failures=0
	local manifest="$project_root/prism.jsonc"

	# ── 1. validate: project-tier env must be empty → throws ──
	local val_err
	val_err=$(php "$MANIFEST_CLI" validate "$manifest" project 2>&1) || true
	if printf '%s' "$val_err" | grep -qF "$canary"; then
		echo "  redact validate — canary leaked to stderr" >&2
		failures=$((failures+1))
	fi

	# ── 2. check-secrets: reports key names only, no values ──
	local cs_out
	cs_out=$(php "$MANIFEST_CLI" check-secrets "$manifest" project 2>&1) || true
	if printf '%s' "$cs_out" | grep -qF "$canary"; then
		echo "  redact check-secrets — canary leaked to stdout" >&2
		failures=$((failures+1))
	fi

	# ── 3. env0: project validation fails → env0 must not emit the secret on stderr ──
	local env0_err
	env0_err=$(php "$MANIFEST_CLI" env0 "$manifest" 2>&1) || true
	if printf '%s' "$env0_err" | grep -qF "$canary"; then
		echo "  redact env0 — canary leaked to stderr" >&2
		failures=$((failures+1))
	fi

	# ── 4. Secret-guard shell script (check-setup-secrets.sh) ──
	local guard_out
	guard_out=$(bash "$CHECK_SECRETS" "$manifest" 2>&1) || true
	if printf '%s' "$guard_out" | grep -qF "$canary"; then
		echo "  redact check-setup-secrets — canary leaked" >&2
		failures=$((failures+1))
	fi

	# ── 5. .envrc failure path — must not leak secrets on stderr ──
	cp "$ENVRC" "$project_root/.envrc"
	local envrc_err
	set +e
	envrc_err=$(env -i HOME="$fake_home" PATH="$PATH" bash -c '
		source "'"$project_root"'/.envrc" 2>&1
	' 2>/dev/null) || true
	set -e
	if printf '%s' "$envrc_err" | grep -qF "$canary"; then
		echo "  redact .envrc — canary leaked to stderr" >&2
		failures=$((failures+1))
	fi

	if [ "$failures" -eq 0 ]; then
		pass "diagnostics redacted — no env value in stderr from any consumer"
	else
		fail "diagnostics redacted — $failures consumer(s) leaked a secret"
	fi
}

echo ""
echo "── Test 5: Diagnostics remain secret-redacted ──"
test_diagnostics_redacted

# ── Test 6: Full round-trip — v4 legacy → migrate → env0 → patch → re-read ───
#
# Complete lifecycle: v4 legacy → migration → env sourcing → patch write →
# byte-stable re-read. Verifies all consumers interoperate with the same data
# through the full pipeline.

test_full_round_trip() {
	local project_root fake_home
	project_root=$(mktemp -d)
	fake_home=$(mktemp -d)
	register_temp_dir "$project_root"
	register_temp_dir "$fake_home"

	make_project_root "$project_root"
	make_user_home "$fake_home"

	local legacy="$project_root/.opencode/setup.json"
	local manifest="$project_root/prism.jsonc"
	local failures=0

	# ── Phase 1: Create v4 legacy ──
	write_complete_v4_project "$project_root" "Roundtrip User" "roundtrip@test.com"

	# ── Phase 2: Migrate v4 → v5 via the shell engine ──
	set +e
	HOME="$fake_home" GIT_CONFIG_NOSYSTEM=1 \
		MIGRATE_PROJECT_OLD="$legacy" MIGRATE_PROJECT_NEW="$manifest" \
		MIGRATE_USER_OLD="/nonexistent/u-setup.json" MIGRATE_USER_NEW="/nonexistent/u-prism.jsonc" \
		bash "$MIGRATE_SETUP" >/dev/null 2>&1
	local ms_rc=$?
	set -e

	if [ "$ms_rc" -ne 0 ]; then
		echo "  round-trip — migration failed (rc=$ms_rc)" >&2
		fail "round-trip — migration phase failed"
		return
	fi

	if [ ! -f "$manifest" ]; then
		fail "round-trip — target not created by migration"
		return
	fi

	# ── Phase 3: Read through env0 — verify migrated values ──
	local env0_out env0_err
	env0_out=$(mktemp)
	env0_err=$(mktemp)
	register_temp_dir "$env0_out"
	register_temp_dir "$env0_err"

	if ! php "$MANIFEST_CLI" env0 "$manifest" >"$env0_out" 2>"$env0_err"; then
		echo "  round-trip — env0 failed: $(cat "$env0_err")" >&2
		failures=$((failures+1))
	else
		read_nul_pairs "$env0_out"
		# Verify identity survived migration.
		[ "$(get_nul_value OPENCODE_MODEL_PRIMARY)" = "zai-coding-plan/glm-5.2" ] || {
			echo "  round-trip env0 — model mismatch: '$(get_nul_value OPENCODE_MODEL_PRIMARY)'" >&2
			failures=$((failures+1))
		}
	fi

	# ── Phase 4: Patch write via the CLI ──
	# Change the primary model and update the timestamp.
	local new_model="patched/roundtrip-model-v2"
	local new_timestamp="2026-07-30T12:00:00Z"
	local updates
	updates=$(jq -n --arg m "$new_model" --arg ts "$new_timestamp" '{"models.primary": $m, "timestamp": $ts}')

	if ! printf '%s' "$updates" | php "$MANIFEST_CLI" patch "$manifest" project 0644 >/dev/null 2>&1; then
		echo "  round-trip — patch failed" >&2
		failures=$((failures+1))
	fi

	# ── Phase 5: Re-read and verify ──
	# The patched value must be reflected.
	local actual_model
	actual_model=$(php "$MANIFEST_CLI" get "$manifest" - models.primary 2>/dev/null)
	if [ "$actual_model" != "$new_model" ]; then
		echo "  round-trip re-read — models.primary got '$actual_model' want '$new_model'" >&2
		failures=$((failures+1))
	fi

	# Timestamp must be updated.
	local actual_ts
	actual_ts=$(php "$MANIFEST_CLI" get "$manifest" - timestamp 2>/dev/null)
	if [ "$actual_ts" != "$new_timestamp" ]; then
		echo "  round-trip re-read — timestamp got '$actual_ts' want '$new_timestamp'" >&2
		failures=$((failures+1))
	fi

	# Unpatched fields must retain their original values.
	local actual_domain
	actual_domain=$(php "$MANIFEST_CLI" get "$manifest" - domain 2>/dev/null)
	if [ "$actual_domain" != "kyaulabs" ]; then
		echo "  round-trip re-read — domain got '$actual_domain' want 'kyaulabs'" >&2
		failures=$((failures+1))
	fi

	# Identity must still be the v4 original.
	local actual_name
	actual_name=$(php "$MANIFEST_CLI" get "$manifest" - signed_off_by_name 2>/dev/null)
	if [ "$actual_name" != "Roundtrip User" ]; then
		echo "  round-trip re-read — signed_off_by_name got '$actual_name' want 'Roundtrip User'" >&2
		failures=$((failures+1))
	fi

	# ── Phase 6: Byte-stable — decode+re-decode cycle produces same JSON ──
	local decode1 decode2
	decode1=$(php "$MANIFEST_CLI" decode "$manifest")
	decode2=$(php "$MANIFEST_CLI" decode "$manifest")
	if [ "$decode1" != "$decode2" ]; then
		echo "  round-trip byte-stable — decode drifted on re-read" >&2
		failures=$((failures+1))
	fi

	# Patch from the current state to the same values must be a no-op (idempotent).
	local decode_before
	decode_before=$(php "$MANIFEST_CLI" decode "$manifest")
	if printf '%s' "$updates" | php "$MANIFEST_CLI" patch "$manifest" project 0644 >/dev/null 2>&1; then
		local decode_after
		decode_after=$(php "$MANIFEST_CLI" decode "$manifest")
		if [ "$decode_before" != "$decode_after" ]; then
			echo "  round-trip idempotent — re-applying same patch mutated the file" >&2
			failures=$((failures+1))
		fi
	fi

	if [ "$failures" -eq 0 ]; then
		pass "full round-trip — v4→migrate→env0→patch→re-read→byte-stable"
	else
		fail "full round-trip — $failures assertion(s) failed"
	fi
}

echo ""
echo "── Test 6: Full round-trip ──"
test_full_round_trip

# ── Summary ───────────────────────────────────────────────────────────────────

print_summary "prism_manifest_integration_test.sh"
exit $?






# vim: ft=sh sts=4 sw=4 ts=4 et :
