#!/usr/bin/env bash
# $KYAULabs: migrate_setup_test.sh kyau@cosmos.kyaulabs 2026/07/29 -0700 Exp $





# ── Isolated integration tests for migrate-setup.sh (ADR-0043) ────────────────
#
# Verifies that migrate-setup.sh is a shell engine wrapping the PHP CLI's
# migrate / migrate-preview commands for dual-path v4→v5 migration:
#   project: .opencode/setup.json → root prism.jsonc  (mode 0644)
#   user:    ~/.config/opencode/setup.json → ~/.config/opencode/prism.jsonc (0600)
#
# Idempotent, validates projections before deleting legacy, refuses downgrade,
# handles tracked-vs-untracked legacy retention, and fails closed on conflicts.
#
# Every test runs in throwaway temp directories: the real $HOME and the real
# project files are never touched. Each fixture project root gets a symlinked
# .github/scripts so the real prism_manifest.php CLI runs for real, plus a
# disposable git repo so git rev-parse / git ls-files resolve locally. Explicit
# MIGRATE_* env-var overrides point the engine at fixture paths.

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
SCRIPT="$REPO_ROOT/.github/scripts/migrate-setup.sh"
MANIFEST_CLI="$REPO_ROOT/.github/scripts/prism_manifest.php"

source "$REPO_ROOT/tests/Shell/lib/test_helpers.sh"
setup_result_file

# ── Fixture helpers ──────────────────────────────────────────────────────────

# make_project_root <dir> — scaffold an isolated project root: a real git repo
# (so git rev-parse / git ls-files resolve locally) and a symlinked .github/
# scripts so the real prism_manifest.php CLI runs. Writes no manifest files.
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

# write_complete_v4_project <dir> [name] [email] — write a schema-v4 project
# legacy setup.json carrying every field validateProject() requires, so the v5
# projection passes project validation. Values are distinctive literals.
write_complete_v4_project() {
	local dir="$1" name="${2:-Migrator Project}" email="${3:-migrator@project.test}"
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

# Per-test fixture globals. fresh_fixture() populates them; run_migrator()
# consumes them.
FX_PROJECT=""
FX_HOME=""
PROJ_OLD=""
PROJ_NEW=""
USER_OLD=""
USER_NEW=""
FX_OUT=""
FX_ERR=""
RUN_RC=0

# fresh_fixture — create an isolated project root (git + scripts symlink) and an
# empty user home, all registered for EXIT-trap cleanup. Wires the four tier
# paths (project old/new, user old/new) to fixture locations.
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
	PROJ_OLD="$FX_PROJECT/.opencode/setup.json"
	PROJ_NEW="$FX_PROJECT/prism.jsonc"
	USER_OLD="$FX_HOME/.config/opencode/setup.json"
	USER_NEW="$FX_HOME/.config/opencode/prism.jsonc"
}

# run_migrator — invoke migrate-setup.sh from inside FX_PROJECT with an isolated
# HOME (no host global git config) and the four tier paths pinned to fixture
# locations via MIGRATE_* env overrides. Captures stdout/stderr into FX_OUT/
# FX_ERR and the exit status into RUN_RC.
run_migrator() {
	set +e
	(
		cd "$FX_PROJECT"
		HOME="$FX_HOME" GIT_CONFIG_NOSYSTEM=1 \
		MIGRATE_PROJECT_OLD="$PROJ_OLD" MIGRATE_PROJECT_NEW="$PROJ_NEW" \
		MIGRATE_USER_OLD="$USER_OLD" MIGRATE_USER_NEW="$USER_NEW" \
		bash "$SCRIPT"
	) >"$FX_OUT" 2>"$FX_ERR"
	RUN_RC=$?
	set -e
}

# decode_field <file> <jq-expr> — read one field from a JSONC manifest via the
# shared CLI (which strips comments) and jq. Avoids feeding JSONC to jq directly.
decode_field() {
	php "$MANIFEST_CLI" decode "$1" | jq -r "$2"
}

# file_mode <file> — portable octal mode (GNU stat -c / BSD stat -f).
file_mode() {
	stat -c '%a' "$1" 2>/dev/null || stat -f '%Lp' "$1"
}

# ── Test 1: Project success — v4 setup.json → prism.jsonc (0644), legacy gone ──

test_project_success() {
	fresh_fixture
	write_complete_v4_project "$FX_PROJECT"

	run_migrator

	local failures=0
	# Engine must succeed.
	if [ "$RUN_RC" -ne 0 ]; then
		echo "  project success — exited $RUN_RC (expected 0)" >&2
		echo "  stderr: $(cat "$FX_ERR")" >&2
		failures=$((failures+1))
	fi
	# New v5 target must exist.
	if [ ! -f "$PROJ_NEW" ]; then
		echo "  project success — target $PROJ_NEW not created" >&2
		failures=$((failures+1))
	fi
	# Legacy must be deleted.
	if [ -e "$PROJ_OLD" ]; then
		echo "  project success — legacy still present at $PROJ_OLD" >&2
		failures=$((failures+1))
	fi
	# Mode must be 0644.
	local mode
	mode=$(file_mode "$PROJ_NEW")
	if [ "$mode" != "644" ]; then
		echo "  project success — mode $mode, expected 644" >&2
		failures=$((failures+1))
	fi
	# Distinctive identity value must be preserved through the migration.
	local name
	name=$(decode_field "$PROJ_NEW" '.signed_off_by_name')
	if [ "$name" != "Migrator Project" ]; then
		echo "  project success — signed_off_by_name got '$name', want 'Migrator Project'" >&2
		failures=$((failures+1))
	fi

	if [ "$failures" -eq 0 ]; then
		pass "project success — v4 → prism.jsonc (0644), values preserved, legacy deleted"
	else
		fail "project success — $failures assertion(s) failed"
	fi
}

echo ""
echo "── Test 1: Project success — v4 → prism.jsonc (0644) ──"
test_project_success

# ── Test 2: User success — v4 user setup.json → user prism.jsonc (0600) ──────

test_user_success() {
	fresh_fixture
	# User legacy carrying a distinctive identity + model override.
	cat > "$USER_OLD" <<'JSON'
{
  "setup_version": 4,
  "signed_off_by_name": "Migrator User",
  "signed_off_by_email": "migrator@user.test",
  "models": { "primary": "user/override-model" }
}
JSON

	run_migrator

	local failures=0
	if [ "$RUN_RC" -ne 0 ]; then
		echo "  user success — exited $RUN_RC (expected 0)" >&2
		echo "  stderr: $(cat "$FX_ERR")" >&2
		failures=$((failures+1))
	fi
	if [ ! -f "$USER_NEW" ]; then
		echo "  user success — target $USER_NEW not created" >&2
		failures=$((failures+1))
	fi
	if [ -e "$USER_OLD" ]; then
		echo "  user success — legacy still present at $USER_OLD" >&2
		failures=$((failures+1))
	fi
	local mode
	mode=$(file_mode "$USER_NEW")
	if [ "$mode" != "600" ]; then
		echo "  user success — mode $mode, expected 600" >&2
		failures=$((failures+1))
	fi
	# Distinctive user values must be preserved.
	local model
	model=$(decode_field "$USER_NEW" '.models.primary')
	if [ "$model" != "user/override-model" ]; then
		echo "  user success — models.primary got '$model', want 'user/override-model'" >&2
		failures=$((failures+1))
	fi

	if [ "$failures" -eq 0 ]; then
		pass "user success — v4 → user prism.jsonc (0600), values preserved, legacy deleted"
	else
		fail "user success — $failures assertion(s) failed"
	fi
}

echo ""
echo "── Test 2: User success — v4 → user prism.jsonc (0600) ──"
test_user_success

# ── Test 3: Canonical comments — migrated v5 doc is JSONC, not bare JSON ─────

test_canonical_comments() {
	fresh_fixture
	write_complete_v4_project "$FX_PROJECT"

	run_migrator

	# The migrated document must carry a line comment (it is genuine JSONC, the
	# canonical render from pm_canonical_v5, not bare strict JSON).
	if grep -q '//' "$PROJ_NEW"; then
		pass "canonical comments — migrated v5 doc carries JSONC comments"
	else
		fail "canonical comments — no '//' found in $PROJ_NEW"
	fi
}

echo ""
echo "── Test 3: Canonical comments ──"
test_canonical_comments

# ── Test 4: Verified target — migrated file independently validates as v5 ────
#
# Deletion-after-verify is owned by the PHP migrate command, but its observable
# outcome is that the new file is a real, reparsable, contract-valid v5 manifest
# once the legacy is gone. Assert the target validates after migration.

test_verified_target_validates() {
	fresh_fixture
	write_complete_v4_project "$FX_PROJECT"

	run_migrator

	local failures=0
	if [ "$RUN_RC" -ne 0 ]; then
		echo "  verified target — engine exited $RUN_RC" >&2
		failures=$((failures+1))
	fi
	# The new target must independently pass the project tier contract.
	if ! php "$MANIFEST_CLI" validate "$PROJ_NEW" project >/dev/null 2>&1; then
		echo "  verified target — $PROJ_NEW fails project validation" >&2
		failures=$((failures+1))
	fi
	# And the legacy must be gone (deletion only after the verified write).
	if [ -e "$PROJ_OLD" ]; then
		echo "  verified target — legacy still present" >&2
		failures=$((failures+1))
	fi
	if [ "$failures" -eq 0 ]; then
		pass "verified target — migrated file validates as v5, legacy deleted"
	else
		fail "verified target — $failures assertion(s) failed"
	fi
}

echo ""
echo "── Test 4: Verified target validates ──"
test_verified_target_validates

# ── Test 5: Source retention on failure — legacy kept when migration fails ───
#
# A project legacy whose v5 projection fails validateProject (missing required
# fields) must leave the legacy untouched and create no target. The migrate
# command validates before writing or deleting, so a failure is abortive.

test_source_retention_on_failure() {
	fresh_fixture
	# v4 but missing every required field validateProject demands.
	cat > "$PROJ_OLD" <<'JSON'
{ "setup_version": 4, "app": "prism" }
JSON

	run_migrator

	local failures=0
	# Migration must fail.
	if [ "$RUN_RC" -eq 0 ]; then
		echo "  retention — engine exited 0 (expected non-zero)" >&2
		failures=$((failures+1))
	fi
	# Legacy must survive untouched.
	if [ ! -e "$PROJ_OLD" ]; then
		echo "  retention — legacy was deleted despite failure" >&2
		failures=$((failures+1))
	fi
	# No partial target must be created.
	if [ -e "$PROJ_NEW" ]; then
		echo "  retention — target was created despite failure" >&2
		failures=$((failures+1))
	fi
	if [ "$failures" -eq 0 ]; then
		pass "source retention — failed migration keeps legacy, creates no target"
	else
		fail "source retention — $failures assertion(s) failed"
	fi
}

echo ""
echo "── Test 5: Source retention on failure ──"
test_source_retention_on_failure

# write_complete_v5_project <dir> <name> <email> — write a schema-v5 project
# prism.jsonc carrying every required field, with a distinctive identity.
write_complete_v5_project() {
	local dir="$1" name="$2" email="$3"
	cat > "$dir/prism.jsonc" <<JSON
{
  "setup_version": 5,
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

# ── Test 6: Divergent old/new coexistence — fail without modifying either ────

test_divergent_coexistence() {
	fresh_fixture
	# Legacy carries identity "Alice Legacy".
	write_complete_v4_project "$FX_PROJECT" "Alice Legacy" "alice@legacy.test"
	# Target already present with a DIFFERENT identity ("Bob Target").
	write_complete_v5_project "$FX_PROJECT" "Bob Target" "bob@target.test"

	# Snapshot both files before the run to prove they are left byte-identical.
	local old_before new_before
	old_before=$(jq -S . "$PROJ_OLD")
	new_before=$(jq -S . "$PROJ_NEW")

	run_migrator

	local failures=0
	# Must fail (divergence).
	if [ "$RUN_RC" -eq 0 ]; then
		echo "  divergent — engine exited 0 (expected non-zero)" >&2
		failures=$((failures+1))
	fi
	# Legacy unchanged.
	if [ ! -e "$PROJ_OLD" ] || [ "$(jq -S . "$PROJ_OLD")" != "$old_before" ]; then
		echo "  divergent — legacy was modified or deleted" >&2
		failures=$((failures+1))
	fi
	# Target unchanged.
	if [ ! -e "$PROJ_NEW" ] || [ "$(jq -S . "$PROJ_NEW")" != "$new_before" ]; then
		echo "  divergent — target was modified or deleted" >&2
		failures=$((failures+1))
	fi
	if [ "$failures" -eq 0 ]; then
		pass "divergent coexistence — fails, leaves both files untouched"
	else
		fail "divergent coexistence — $failures assertion(s) failed"
	fi
}

echo ""
echo "── Test 6: Divergent old/new coexistence ──"
test_divergent_coexistence

# ── Test 7: Equivalent old/new coexistence — equal → delete old, keep new ────
#
# The legacy (v4) and target (v5) carry identical values, so their v5
# projections match. The project legacy is untracked here (the downstream-upgrade
# case after a git pull), so the engine removes the redundant old.

test_equivalent_coexistence_untracked() {
	fresh_fixture
	# Same identity + fields in both; only the schema version differs.
	write_complete_v4_project "$FX_PROJECT" "Eve Equal" "eve@equal.test"
	write_complete_v5_project "$FX_PROJECT" "Eve Equal" "eve@equal.test"

	run_migrator

	local failures=0
	if [ "$RUN_RC" -ne 0 ]; then
		echo "  equivalent — engine exited $RUN_RC (expected 0)" >&2
		echo "  stderr: $(cat "$FX_ERR")" >&2
		failures=$((failures+1))
	fi
	# Redundant legacy removed.
	if [ -e "$PROJ_OLD" ]; then
		echo "  equivalent — legacy retained (expected deletion, untracked)" >&2
		failures=$((failures+1))
	fi
	# Target preserved.
	if [ ! -e "$PROJ_NEW" ]; then
		echo "  equivalent — target missing" >&2
		failures=$((failures+1))
	fi
	if [ "$failures" -eq 0 ]; then
		pass "equivalent coexistence (untracked) — deletes redundant old, keeps new"
	else
		fail "equivalent coexistence — $failures assertion(s) failed"
	fi
}

echo ""
echo "── Test 7: Equivalent old/new coexistence (untracked) ──"
test_equivalent_coexistence_untracked

# ── Test 8: Malformed source — broken JSON fails closed ──────────────────────

test_malformed_source() {
	fresh_fixture
	printf '%s\n' '{ "setup_version": 4, this is : not : valid }' > "$PROJ_OLD"

	run_migrator

	local failures=0
	if [ "$RUN_RC" -eq 0 ]; then
		echo "  malformed — engine exited 0 (expected non-zero)" >&2
		failures=$((failures+1))
	fi
	if [ ! -e "$PROJ_OLD" ]; then
		echo "  malformed — legacy deleted despite being unparseable" >&2
		failures=$((failures+1))
	fi
	if [ -e "$PROJ_NEW" ]; then
		echo "  malformed — target created from unparseable source" >&2
		failures=$((failures+1))
	fi
	if [ "$failures" -eq 0 ]; then
		pass "malformed source — fails closed, keeps legacy, creates no target"
	else
		fail "malformed source — $failures assertion(s) failed"
	fi
}

echo ""
echo "── Test 8: Malformed source ──"
test_malformed_source

# ── Test 9: Source versions 1-4 all migrate to v5 ────────────────────────────

test_versions_1_to_4_migrate() {
	local failures=0
	local v
	for v in 1 2 3 4; do
		fresh_fixture
		printf '{ "setup_version": %s, "signed_off_by_name": "v%s-user" }\n' "$v" "$v" > "$USER_OLD"

		run_migrator

		local rc=$RUN_RC
		if [ "$rc" -ne 0 ]; then
			echo "  v$v — engine exited $rc (expected 0)" >&2
			failures=$((failures+1))
			continue
		fi
		if [ ! -f "$USER_NEW" ]; then
			echo "  v$v — target not created" >&2
			failures=$((failures+1))
			continue
		fi
		local ver name
		ver=$(decode_field "$USER_NEW" '.setup_version')
		name=$(decode_field "$USER_NEW" '.signed_off_by_name')
		if [ "$ver" != "5" ]; then
			echo "  v$v — target setup_version $ver (expected 5)" >&2
			failures=$((failures+1))
		elif [ "$name" != "v$v-user" ]; then
			echo "  v$v — value not preserved: '$name'" >&2
			failures=$((failures+1))
		elif [ -e "$USER_OLD" ]; then
			echo "  v$v — legacy not deleted" >&2
			failures=$((failures+1))
		fi
	done

	if [ "$failures" -eq 0 ]; then
		pass "versions 1-4 — each source migrates to v5 with values preserved"
	else
		fail "versions 1-4 — $failures assertion(s) failed"
	fi
}

echo ""
echo "── Test 9: Source versions 1-4 migrate to v5 ──"
test_versions_1_to_4_migrate

# ── Test 10: Version 5 at legacy path is renamed, not left in place ──────────
#
# A v5 document sitting at the legacy path is still renamed to the canonical
# target and removed from the legacy location. Version-based no-op applies only
# when the canonical target is already valid AND the legacy is absent.

test_v5_at_legacy_path_moved() {
	fresh_fixture
	# A complete v5 document, but at the LEGACY path; target absent.
	cat > "$PROJ_OLD" <<'JSON'
{
  "setup_version": 5,
  "configured": true,
  "timestamp": "2026-07-06T23:44:00Z",
  "app": "prism",
  "domain": "kyaulabs",
  "repo": "kyaulabs/prism",
  "signed_off_by_name": "Vfive Atlegacy",
  "signed_off_by_email": "vfive@legacy.test",
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

	run_migrator

	local failures=0
	if [ "$RUN_RC" -ne 0 ]; then
		echo "  v5-at-legacy — engine exited $RUN_RC (expected 0)" >&2
		echo "  stderr: $(cat "$FX_ERR")" >&2
		failures=$((failures+1))
	fi
	# Legacy location must be empty (renamed away).
	if [ -e "$PROJ_OLD" ]; then
		echo "  v5-at-legacy — source left at legacy path (expected rename)" >&2
		failures=$((failures+1))
	fi
	# Target must exist and carry the v5 identity through.
	if [ ! -f "$PROJ_NEW" ]; then
		echo "  v5-at-legacy — target not created" >&2
		failures=$((failures+1))
	else
		local name
		name=$(decode_field "$PROJ_NEW" '.signed_off_by_name')
		if [ "$name" != "Vfive Atlegacy" ]; then
			echo "  v5-at-legacy — identity not preserved: '$name'" >&2
			failures=$((failures+1))
		fi
	fi
	if [ "$failures" -eq 0 ]; then
		pass "v5 at legacy path — renamed to target, removed from legacy location"
	else
		fail "v5 at legacy path — $failures assertion(s) failed"
	fi
}

echo ""
echo "── Test 10: Version 5 at legacy path moved ──"
test_v5_at_legacy_path_moved

# ── Test 11: Version 6 (downgrade) refusal — source > 5 fails ────────────────

test_version_6_refused() {
	fresh_fixture
	printf '{ "setup_version": 6, "signed_off_by_name": "future" }\n' > "$USER_OLD"

	run_migrator

	local failures=0
	if [ "$RUN_RC" -eq 0 ]; then
		echo "  v6 — engine exited 0 (expected non-zero)" >&2
		failures=$((failures+1))
	fi
	if [ ! -e "$USER_OLD" ]; then
		echo "  v6 — legacy deleted despite downgrade refusal" >&2
		failures=$((failures+1))
	fi
	if [ -e "$USER_NEW" ]; then
		echo "  v6 — target created despite downgrade refusal" >&2
		failures=$((failures+1))
	fi
	if [ "$failures" -eq 0 ]; then
		pass "version 6 — refused (downgrade), legacy kept, no target"
	else
		fail "version 6 — $failures assertion(s) failed"
	fi
}

echo ""
echo "── Test 11: Version 6 downgrade refusal ──"
test_version_6_refused

# ── Test 12: Idempotent — repeated invocation is a no-op ─────────────────────

test_idempotent() {
	fresh_fixture
	write_complete_v4_project "$FX_PROJECT"

	run_migrator
	if [ "$RUN_RC" -ne 0 ]; then
		fail "idempotent — first run failed (rc=$RUN_RC)"
		echo "  stderr: $(cat "$FX_ERR")" >&2
		return
	fi

	# Snapshot the settled state, then run again. The migrated target is JSONC
	# (it carries comments), so compare raw bytes rather than feeding jq.
	local target_before
	target_before=$(cat "$PROJ_NEW")

	run_migrator

	local failures=0
	if [ "$RUN_RC" -ne 0 ]; then
		echo "  idempotent — second run exited $RUN_RC (expected 0)" >&2
		echo "  stderr: $(cat "$FX_ERR")" >&2
		failures=$((failures+1))
	fi
	# Target must be byte-identical to the settled state.
	if [ "$(cat "$PROJ_NEW")" != "$target_before" ]; then
		echo "  idempotent — target changed on second run" >&2
		failures=$((failures+1))
	fi
	# No legacy reappeared.
	if [ -e "$PROJ_OLD" ]; then
		echo "  idempotent — legacy present after second run" >&2
		failures=$((failures+1))
	fi
	if [ "$failures" -eq 0 ]; then
		pass "idempotent — second run is a no-op (no mutation, exit 0)"
	else
		fail "idempotent — $failures assertion(s) failed"
	fi
}

echo ""
echo "── Test 12: Idempotent repeated invocation ──"
test_idempotent

# ── Test 13: Read symlink refusal — legacy symlink is not followed ───────────

test_read_symlink_refused() {
	if ! can_symlink; then
		skip "read symlink — platform lacks symlink support"
		return
	fi
	fresh_fixture
	# Real legacy content lives off to the side; the legacy PATH is a symlink.
	write_complete_v4_project "$FX_PROJECT" "Symlinked Legacy" "sym@legacy.test"
	mv "$PROJ_OLD" "$PROJ_OLD.real"
	ln -s setup.json.real "$PROJ_OLD"

	run_migrator

	local failures=0
	if [ "$RUN_RC" -eq 0 ]; then
		echo "  read symlink — engine exited 0 (expected non-zero)" >&2
		failures=$((failures+1))
	fi
	# The symlink legacy must still be present (not followed/deleted).
	if [ ! -L "$PROJ_OLD" ]; then
		echo "  read symlink — legacy symlink removed" >&2
		failures=$((failures+1))
	fi
	# No target must be created.
	if [ -e "$PROJ_NEW" ] || [ -L "$PROJ_NEW" ]; then
		echo "  read symlink — target created from a symlinked source" >&2
		failures=$((failures+1))
	fi
	if [ "$failures" -eq 0 ]; then
		pass "read symlink — refused, legacy symlink kept, no target"
	else
		fail "read symlink — $failures assertion(s) failed"
	fi
}

echo ""
echo "── Test 13: Read symlink refusal ──"
test_read_symlink_refused

# ── Test 14: Write symlink refusal — symlink target is not written through ───

test_write_symlink_refused() {
	if ! can_symlink; then
		skip "write symlink — platform lacks symlink support"
		return
	fi
	fresh_fixture
	write_complete_v4_project "$FX_PROJECT" "Real Legacy" "real@legacy.test"
	# Target path is a symlink to a non-existent file (a trap the engine must
	# not write through).
	local trap_target="$FX_PROJECT/should-not-be-created.json"
	ln -s "$trap_target" "$PROJ_NEW"

	run_migrator

	local failures=0
	if [ "$RUN_RC" -eq 0 ]; then
		echo "  write symlink — engine exited 0 (expected non-zero)" >&2
		failures=$((failures+1))
	fi
	# Nothing must have been written through the symlink.
	if [ -e "$trap_target" ] || [ -L "$trap_target" ]; then
		echo "  write symlink — content written through symlink target" >&2
		failures=$((failures+1))
	fi
	# Legacy must survive (no migration succeeded).
	if [ ! -e "$PROJ_OLD" ]; then
		echo "  write symlink — legacy deleted despite symlink-target failure" >&2
		failures=$((failures+1))
	fi
	if [ "$failures" -eq 0 ]; then
		pass "write symlink — refused, nothing written through symlink target"
	else
		fail "write symlink — $failures assertion(s) failed"
	fi
}

echo ""
echo "── Test 14: Write symlink refusal ──"
test_write_symlink_refused

# ── Test 15: Tracked legacy retention — git-tracked project legacy kept ──────
#
# During the branch transition the project .opencode/setup.json is still tracked
# by Git alongside the new prism.jsonc. When both are semantically equal, the
# engine must NOT delete the tracked legacy (Task 13 removes it after cutover);
# it warns on stderr instead. The untracked case is covered by Test 7.

test_tracked_legacy_retained() {
	fresh_fixture
	# Equal values in both tiers; only the schema version differs.
	write_complete_v4_project "$FX_PROJECT" "Tracked Pair" "tracked@pair.test"
	write_complete_v5_project "$FX_PROJECT" "Tracked Pair" "tracked@pair.test"
	# The legacy is git-tracked (the in-repo transition state).
	git -C "$FX_PROJECT" add .opencode/setup.json

	run_migrator

	local failures=0
	if [ "$RUN_RC" -ne 0 ]; then
		echo "  tracked — engine exited $RUN_RC (expected 0)" >&2
		echo "  stderr: $(cat "$FX_ERR")" >&2
		failures=$((failures+1))
	fi
	# Tracked legacy must be retained.
	if [ ! -e "$PROJ_OLD" ]; then
		echo "  tracked — legacy deleted despite being git-tracked" >&2
		failures=$((failures+1))
	fi
	# Target must remain.
	if [ ! -e "$PROJ_NEW" ]; then
		echo "  tracked — target missing" >&2
		failures=$((failures+1))
	fi
	# A transition warning must point at the retention.
	if ! grep -qi "transition" "$FX_ERR"; then
		echo "  tracked — no transition warning on stderr" >&2
		failures=$((failures+1))
	fi
	if [ "$failures" -eq 0 ]; then
		pass "tracked legacy — retained with a transition warning (not deleted)"
	else
		fail "tracked legacy — $failures assertion(s) failed"
	fi
}

echo ""
echo "── Test 15: Tracked legacy retention ──"
test_tracked_legacy_retained

# ── Test 16: User-tier coexistence — equal old+new → delete old (never tracked) ─
#
# The user tier lives outside the repo, so its legacy is never git-tracked and
# always follows the deletion rule when it equals the target.

test_user_coexistence_deletes() {
	fresh_fixture
	# Equal v4 legacy and v5 target in the USER tier (outside the repo).
	cat > "$USER_OLD" <<'JSON'
{ "setup_version": 4, "signed_off_by_name": "User Coexist" }
JSON
	cat > "$USER_NEW" <<'JSON'
{ "setup_version": 5, "signed_off_by_name": "User Coexist" }
JSON

	run_migrator

	local failures=0
	if [ "$RUN_RC" -ne 0 ]; then
		echo "  user coexist — engine exited $RUN_RC (expected 0)" >&2
		echo "  stderr: $(cat "$FX_ERR")" >&2
		failures=$((failures+1))
	fi
	if [ -e "$USER_OLD" ]; then
		echo "  user coexist — redundant legacy retained (expected deletion)" >&2
		failures=$((failures+1))
	fi
	if [ ! -e "$USER_NEW" ]; then
		echo "  user coexist — target missing" >&2
		failures=$((failures+1))
	fi
	if [ "$failures" -eq 0 ]; then
		pass "user coexistence — equal old+new deletes the (untracked) legacy"
	else
		fail "user coexistence — $failures assertion(s) failed"
	fi
}

echo ""
echo "── Test 16: User-tier coexistence ──"
test_user_coexistence_deletes

# ── Summary ──────────────────────────────────────────────────────────────────

print_summary "migrate_setup_test.sh"
exit $?






# vim: ft=sh sts=4 sw=4 ts=4 et :
