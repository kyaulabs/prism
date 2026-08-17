#!/usr/bin/env bash
# $KYAULabs: setup_rulesets_test.sh kyau@aura.kyaulabs 2026/08/16 -0700 Exp $
















# ── Tests for setup-rulesets.sh ───────────────────────────────────────────────
# Verifies ruleset discovery, canonical comparison, dry-run, check, and apply
# modes against a fake gh API shim. The script must never hard-code a
# repository name — all tests use testowner/testrepo.

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
source "$REPO_ROOT/tests/Shell/lib/test_helpers.sh"

setup_result_file

SCRIPT="$REPO_ROOT/packages/prism-core/scripts/setup-rulesets.sh"

# ── Fake gh infrastructure ────────────────────────────────────────────────────
# FAKE_GH_LOG  — log file for recorded invocations
# FAKE_GH_FIXTURES — directory containing fixture JSON files:
#   auth-status        : "ok" or "fail"
#   repo-view.json     : JSON for `gh repo view --json nameWithOwner`
#   rulesets-list.json : JSON array for GET repos/$REPO/rulesets
#   ruleset-<id>.json  : JSON object for GET repos/$REPO/rulesets/<id>
#   repo-settings.json : JSON object for GET repos/$REPO
#
# The fake gh writes all arguments to FAKE_GH_LOG, then dispatches based on
# subcommand. For API calls it reads the fixture dir to serve responses and
# also logs any POST/PUT/PATCH/DELETE method verbs to FAKE_GH_LOG.

fake_gh_setup() {
	local bin_dir="$1"
	local fake_gh="$bin_dir/gh"

	cat > "$fake_gh" <<'GH_SCRIPT'
#!/usr/bin/env bash
echo "$@" >> "${FAKE_GH_LOG:?FAKE_GH_LOG not set}"
FIXTURES="${FAKE_GH_FIXTURES:-}"

case "$1" in
	auth)
		if [ -f "$FIXTURES/auth-status" ] && [ "$(cat "$FIXTURES/auth-status")" = "fail" ]; then
			echo "gh auth status: not logged in" >&2
			exit 1
		fi
		exit 0
		;;
	repo)
		case "$2" in
			view)
				if [ -f "$FIXTURES/repo-view.json" ]; then
					cat "$FIXTURES/repo-view.json"
				else
					echo '{"nameWithOwner":"testowner/testrepo"}'
				fi
				exit 0
				;;
		esac
		;;
	api)
		shift
		# Collect args before the URL (flags like -X, --input, --jq, etc.)
		method="" input_file="" endpoint=""
		while [ $# -gt 0 ]; do
			case "$1" in
				-X) method="$2"; shift 2 ;;
				--input) input_file="$2"; shift 2 ;;
				--jq) shift 2 ;;
				-H) shift 2 ;;
				-f) shift ;;
				-*) shift ;;
				*) endpoint="${1#/}"; shift ;;
			esac
		done

		# Log mutation methods specially (append to log)
		case "$method" in
			POST|PUT|PATCH|DELETE)
				echo "MUTATION: $method $endpoint" >> "${FAKE_GH_LOG}"
				;;
		esac

		# Serve fixture responses for GET requests
		if [ -z "$method" ] || [ "$method" = "GET" ]; then
			case "$endpoint" in
				repos/*/*/rulesets)
					if [ -f "$FIXTURES/rulesets-list.json" ]; then
						cat "$FIXTURES/rulesets-list.json"
					else
						echo '[]'
					fi
					exit 0
					;;
				repos/*/*/rulesets/[0-9]*)
					ruleset_id="${endpoint##*/}"
					if [ -f "$FIXTURES/ruleset-${ruleset_id}.json" ]; then
						cat "$FIXTURES/ruleset-${ruleset_id}.json"
					else
						echo '{"message":"Not Found"}' >&2
						exit 1
					fi
					exit 0
					;;
				repos/*/*)
					# Must be last — catch-all for repo settings
					if [ -f "$FIXTURES/repo-settings.json" ]; then
						cat "$FIXTURES/repo-settings.json"
					else
						echo '{"allow_merge_commit":true,"allow_squash_merge":true,"allow_rebase_merge":true}'
					fi
					exit 0
					;;
			esac
		fi

		# 403 simulation for mutations
		if [ -n "$method" ]; then
			case "$method" in
				POST)
					if [ -f "$FIXTURES/ruleset-post-403" ]; then
						echo 'gh: Resource not accessible by integration (HTTP 403)' >&2
						exit 1
					fi
					;;
				PUT)
					if [ -f "$FIXTURES/ruleset-put-403" ]; then
						echo 'gh: Resource not accessible by integration (HTTP 403)' >&2
						exit 1
					fi
					;;
				PATCH)
					if [ -f "$FIXTURES/merge-patch-403" ]; then
						echo 'gh: Resource not accessible by integration (HTTP 403)' >&2
						exit 1
					fi
					;;
			esac
		fi

		# For mutations, echo the input file content (to simulate success)
		if [ -n "$input_file" ] && [ -f "$input_file" ]; then
			cat "$input_file"
		fi
		exit 0
		;;
esac
exit 0
GH_SCRIPT
	chmod +x "$fake_gh"
}

# ── Fixture helpers ───────────────────────────────────────────────────────────
# write_fixture_auth <fixture_dir> <ok|fail>
write_fixture_auth() { echo "$2" > "$1/auth-status"; }

# write_fixture_repo_view <fixture_dir> <nameWithOwner>
write_fixture_repo_view() {
	printf '{"nameWithOwner":"%s"}\n' "$2" > "$1/repo-view.json"
}

# write_fixture_rulesets_list <fixture_dir> <json>
write_fixture_rulesets_list() { echo "$2" > "$1/rulesets-list.json"; }

# write_fixture_ruleset_detail <fixture_dir> <id> <json>
write_fixture_ruleset_detail() { echo "$3" > "$1/ruleset-$2.json"; }

# write_fixture_repo_settings <fixture_dir> <json>
write_fixture_repo_settings() { echo "$2" > "$1/repo-settings.json"; }

# ── Canonical ruleset fixture (matching) ──────────────────────────────────────
CANONICAL_RULESET='{"name":"pr-only-integration","target":"branch","enforcement":"active","bypass_actors":[],"conditions":{"ref_name":{"include":["refs/heads/develop","refs/heads/main"],"exclude":[]}},"rules":[{"type":"deletion"},{"type":"non_fast_forward"},{"type":"required_signatures"},{"type":"pull_request","parameters":{"required_approving_review_count":0,"dismiss_stale_reviews_on_push":false,"require_code_owner_review":false,"require_last_push_approval":false,"required_review_thread_resolution":false,"allowed_merge_methods":["merge"]}}]}'

# ── Drifted ruleset fixture (same name, different rules) ──────────────────────
DRIFTED_RULESET='{"name":"pr-only-integration","target":"branch","enforcement":"active","bypass_actors":[],"conditions":{"ref_name":{"include":["refs/heads/develop"],"exclude":[]}},"rules":[{"type":"deletion"}]}'

# ── Unrelated ruleset fixture ─────────────────────────────────────────────────
UNRELATED_RULESET='{"name":"feature","target":"branch","enforcement":"active","bypass_actors":[],"conditions":{"ref_name":{"include":["refs/heads/feature/*"],"exclude":[]}},"rules":[{"type":"pull_request","parameters":{"required_approving_review_count":1,"dismiss_stale_reviews_on_push":false,"require_code_owner_review":false,"require_last_push_approval":false,"required_review_thread_resolution":false,"allowed_merge_methods":["merge"]}}]}'

# ── Canonical merge settings fixture (matching) ───────────────────────────────
CANONICAL_MERGE='{"allow_merge_commit":true,"allow_squash_merge":false,"allow_rebase_merge":false}'

# ── Drifted merge settings fixture ────────────────────────────────────────────
DRIFTED_MERGE='{"allow_merge_commit":true,"allow_squash_merge":true,"allow_rebase_merge":true}'

# ── Helper: create a full fixture with a single ruleset and repo settings ─────
# make_fixture <fixture_dir> <ruleset_id> <ruleset_json> <merge_json>
make_fixture() {
	local dir="$1" id="$2" ruleset="$3" merge="$4"
	write_fixture_auth "$dir" "ok"
	write_fixture_repo_view "$dir" "testowner/testrepo"
	local ruleset_with_id
	ruleset_with_id=$(echo "$ruleset" | php -r '$_=json_decode(file_get_contents("php://stdin"),true,512,JSON_THROW_ON_ERROR);$_["id"]='"$id"';echo json_encode($_,JSON_UNESCAPED_SLASHES);')
	write_fixture_rulesets_list "$dir" "[$ruleset_with_id]"
	write_fixture_ruleset_detail "$dir" "$id" "$ruleset_with_id"
	write_fixture_repo_settings "$dir" "$merge"
}

# ── Helper: run script with fake gh, capture output and exit code ─────────────
run_script() {
	local fake_bin="$1" fake_log="$2"
	shift 2
	env PATH="$fake_bin:$PATH" "$SCRIPT" "$@" 2>&1
}

# ═══════════════════════════════════════════════════════════════════════════════
# Tests
# ═══════════════════════════════════════════════════════════════════════════════

# ── Test 1: Script exists and is executable ───────────────────────────────────

test_script_exists() {
	if [ ! -f "$SCRIPT" ]; then
		fail "setup-rulesets.sh does not exist"
		return
	fi
	if [ ! -x "$SCRIPT" ]; then
		fail "setup-rulesets.sh is not executable"
		return
	fi
	pass "setup-rulesets.sh exists and is executable"
}

echo ""
echo "── Test 1: Script exists and is executable ──"
test_script_exists

# ── Test 2: No arguments defaults to --dry-run mode ───────────────────────────

test_default_mode_is_dry_run() {
	local fake_bin fake_log exit_code output
	fake_bin=$(mktemp -d)
	register_temp_dir "$fake_bin"
	fake_log=$(mktemp)
	: > "$fake_log"
	export FAKE_GH_LOG="$fake_log"
	export FAKE_GH_FIXTURES="$fake_bin"

	fake_gh_setup "$fake_bin"
	write_fixture_auth "$fake_bin" "ok"
	write_fixture_repo_view "$fake_bin" "testowner/testrepo"
	echo '[]' > "$fake_bin/rulesets-list.json"
	echo "$CANONICAL_MERGE" > "$fake_bin/repo-settings.json"

	exit_code=0
	output=$(run_script "$fake_bin" "$fake_log") || exit_code=$?

	if [ "$exit_code" -eq 2 ]; then
		fail "default mode — exit 2 (rejected valid default)"
		unset FAKE_GH_LOG FAKE_GH_FIXTURES
		return
	fi
	unset FAKE_GH_LOG FAKE_GH_FIXTURES
	pass "default mode — no arguments accepted (defaults to --dry-run)"
}

echo ""
echo "── Test 2: No arguments defaults to --dry-run mode ──"
test_default_mode_is_dry_run

# ── Test 3: Accepts --dry-run explicitly ──────────────────────────────────────

test_accepts_dry_run() {
	local fake_bin fake_log exit_code output
	fake_bin=$(mktemp -d)
	register_temp_dir "$fake_bin"
	fake_log=$(mktemp)
	: > "$fake_log"
	export FAKE_GH_LOG="$fake_log"
	export FAKE_GH_FIXTURES="$fake_bin"

	fake_gh_setup "$fake_bin"
	write_fixture_auth "$fake_bin" "ok"
	write_fixture_repo_view "$fake_bin" "testowner/testrepo"
	echo '[]' > "$fake_bin/rulesets-list.json"
	echo "$CANONICAL_MERGE" > "$fake_bin/repo-settings.json"

	exit_code=0
	output=$(run_script "$fake_bin" "$fake_log" "--dry-run") || exit_code=$?

	if [ "$exit_code" -eq 2 ]; then
		fail "accepts --dry-run — exit 2 (rejected valid mode)"
		unset FAKE_GH_LOG FAKE_GH_FIXTURES
		return
	fi
	unset FAKE_GH_LOG FAKE_GH_FIXTURES
	pass "accepts --dry-run — explicit mode accepted"
}

echo ""
echo "── Test 3: Accepts --dry-run explicitly ──"
test_accepts_dry_run

# ── Test 4: Rejects unknown mode with exit 2 ──────────────────────────────────

test_rejects_unknown_mode() {
	local exit_code output
	exit_code=0
	output=$("$SCRIPT" --bogus 2>&1) || exit_code=$?

	if [ "$exit_code" -ne 2 ]; then
		fail "unknown mode — exit code $exit_code (expected 2)"
		return
	fi
	if ! echo "$output" | grep -qi "unknown"; then
		fail "unknown mode — error message doesn't mention 'unknown'"
		return
	fi
	pass "unknown mode — exit 2 with clear error"
}

echo ""
echo "── Test 4: Rejects unknown mode with exit 2 ──"
test_rejects_unknown_mode

# ── Test 5: Rejects multiple arguments with exit 2 ────────────────────────────

test_rejects_multiple_args() {
	local exit_code output
	exit_code=0
	output=$("$SCRIPT" --dry-run --check 2>&1) || exit_code=$?

	if [ "$exit_code" -ne 2 ]; then
		fail "multiple args — exit code $exit_code (expected 2)"
		return
	fi
	pass "multiple args — exit 2, rejects extra argument"
}

echo ""
echo "── Test 5: Rejects multiple arguments with exit 2 ──"
test_rejects_multiple_args

# ── Test 6: Requires gh on PATH ───────────────────────────────────────────────

test_requires_gh() {
	local empty_path exit_code output
	empty_path=$(mktemp -d)
	register_temp_dir "$empty_path"
	ln -s "$(command -v bash)" "$empty_path/bash"
	ln -s "$(command -v php)" "$empty_path/php"

	exit_code=0
	output=$(env PATH="$empty_path" bash "$SCRIPT" --dry-run 2>&1) || exit_code=$?

	if [ "$exit_code" -ne 2 ]; then
		fail "requires gh — exit code $exit_code (expected 2)"
		echo "  output: $output" >&2
		return
	fi
	if ! echo "$output" | grep -qi "gh"; then
		fail "requires gh — error message doesn't mention gh/GitHub CLI"
		return
	fi
	pass "requires gh — exit 2, clear error"
}

echo ""
echo "── Test 6: Requires gh on PATH ──"
test_requires_gh

# ── Test 7: Requires successful gh auth status ────────────────────────────────

test_requires_gh_auth() {
	local fake_bin fake_log exit_code output
	fake_bin=$(mktemp -d)
	register_temp_dir "$fake_bin"
	fake_log=$(mktemp)
	: > "$fake_log"
	export FAKE_GH_LOG="$fake_log"
	export FAKE_GH_FIXTURES="$fake_bin"

	fake_gh_setup "$fake_bin"
	write_fixture_auth "$fake_bin" "fail"

	exit_code=0
	output=$(run_script "$fake_bin" "$fake_log" "--dry-run") || exit_code=$?

	if [ "$exit_code" -ne 2 ]; then
		fail "requires gh auth — exit code $exit_code (expected 2)"
		echo "  output: $output" >&2
		unset FAKE_GH_LOG FAKE_GH_FIXTURES
		return
	fi
	if [ ! -s "$fake_log" ]; then
		fail "requires gh auth — fake gh was not invoked"
		unset FAKE_GH_LOG FAKE_GH_FIXTURES
		return
	fi
	unset FAKE_GH_LOG FAKE_GH_FIXTURES
	pass "requires gh auth — exit 2 on auth failure"
}

echo ""
echo "── Test 7: Requires successful gh auth status ──"
test_requires_gh_auth

# ── Test 8: Detects repository dynamically via gh repo view ───────────────────

test_detects_repo_dynamically() {
	local fake_bin fake_log exit_code output recorded
	fake_bin=$(mktemp -d)
	register_temp_dir "$fake_bin"
	fake_log=$(mktemp)
	: > "$fake_log"
	export FAKE_GH_LOG="$fake_log"
	export FAKE_GH_FIXTURES="$fake_bin"

	fake_gh_setup "$fake_bin"
	write_fixture_auth "$fake_bin" "ok"
	write_fixture_repo_view "$fake_bin" "otherorg/otherrepo"
	echo '[]' > "$fake_bin/rulesets-list.json"
	echo "$CANONICAL_MERGE" > "$fake_bin/repo-settings.json"

	exit_code=0
	output=$(run_script "$fake_bin" "$fake_log" "--dry-run") || exit_code=$?

	if [ "$exit_code" -eq 2 ]; then
		fail "dynamic repo — prerequisite error: $output"
		unset FAKE_GH_LOG FAKE_GH_FIXTURES
		return
	fi
	recorded=$(cat "$fake_log")
	if ! echo "$recorded" | grep -q "repo view"; then
		fail "dynamic repo — gh repo view was not called"
		unset FAKE_GH_LOG FAKE_GH_FIXTURES
		return
	fi
	if grep -q "kyaulabs/prism" "$SCRIPT"; then
		fail "dynamic repo — script contains hard-coded repository name"
		unset FAKE_GH_LOG FAKE_GH_FIXTURES
		return
	fi
	unset FAKE_GH_LOG FAKE_GH_FIXTURES
	pass "dynamic repo — detects repo via gh repo view, no hard-coded name"
}

echo ""
echo "── Test 8: Detects repository dynamically via gh repo view ──"
test_detects_repo_dynamically

# ── Test 9: Absent ruleset → reports create ───────────────────────────────────

test_absent_ruleset_reports_create() {
	local fake_bin fake_log output exit_code
	fake_bin=$(mktemp -d)
	register_temp_dir "$fake_bin"
	fake_log=$(mktemp)
	: > "$fake_log"
	export FAKE_GH_LOG="$fake_log"
	export FAKE_GH_FIXTURES="$fake_bin"

	fake_gh_setup "$fake_bin"
	write_fixture_auth "$fake_bin" "ok"
	write_fixture_repo_view "$fake_bin" "testowner/testrepo"
	# Empty ruleset list — no pr-only-integration
	echo '[]' > "$fake_bin/rulesets-list.json"
	echo "$CANONICAL_MERGE" > "$fake_bin/repo-settings.json"

	exit_code=0
	output=$(run_script "$fake_bin" "$fake_log" "--dry-run") || exit_code=$?

	if [ "$exit_code" -ne 0 ]; then
		fail "absent ruleset — exit code $exit_code (expected 0 for dry-run)"
		echo "  output: $output" >&2
		unset FAKE_GH_LOG FAKE_GH_FIXTURES
		return
	fi
	if ! echo "$output" | grep -q "Ruleset pr-only-integration: create"; then
		fail "absent ruleset — output missing 'create': $output"
		unset FAKE_GH_LOG FAKE_GH_FIXTURES
		return
	fi
	unset FAKE_GH_LOG FAKE_GH_FIXTURES
	pass "absent ruleset — reports 'create'"
}

echo ""
echo "── Test 9: Absent ruleset → reports 'create' ──"
test_absent_ruleset_reports_create

# ── Test 10: Matching ruleset → reports unchanged ─────────────────────────────

test_matching_ruleset_reports_unchanged() {
	local fake_bin fake_log output exit_code
	fake_bin=$(mktemp -d)
	register_temp_dir "$fake_bin"
	fake_log=$(mktemp)
	: > "$fake_log"
	export FAKE_GH_LOG="$fake_log"
	export FAKE_GH_FIXTURES="$fake_bin"

	fake_gh_setup "$fake_bin"
	make_fixture "$fake_bin" "42" "$CANONICAL_RULESET" "$CANONICAL_MERGE"

	exit_code=0
	output=$(run_script "$fake_bin" "$fake_log" "--dry-run") || exit_code=$?

	if [ "$exit_code" -ne 0 ]; then
		fail "matching ruleset — exit code $exit_code (expected 0)"
		echo "  output: $output" >&2
		unset FAKE_GH_LOG FAKE_GH_FIXTURES
		return
	fi
	if ! echo "$output" | grep -q "Ruleset pr-only-integration: unchanged"; then
		fail "matching ruleset — output missing 'unchanged': $output"
		unset FAKE_GH_LOG FAKE_GH_FIXTURES
		return
	fi
	if ! echo "$output" | grep -q "Repository merge methods: unchanged"; then
		fail "matching ruleset — merge methods not reported unchanged: $output"
		unset FAKE_GH_LOG FAKE_GH_FIXTURES
		return
	fi
	unset FAKE_GH_LOG FAKE_GH_FIXTURES
	pass "matching ruleset — reports 'unchanged' for both"
}

echo ""
echo "── Test 10: Matching ruleset → reports 'unchanged' ──"
test_matching_ruleset_reports_unchanged

# ── Test 11: Drifted ruleset → reports update ─────────────────────────────────

test_drifted_ruleset_reports_update() {
	local fake_bin fake_log output exit_code
	fake_bin=$(mktemp -d)
	register_temp_dir "$fake_bin"
	fake_log=$(mktemp)
	: > "$fake_log"
	export FAKE_GH_LOG="$fake_log"
	export FAKE_GH_FIXTURES="$fake_bin"

	fake_gh_setup "$fake_bin"
	make_fixture "$fake_bin" "42" "$DRIFTED_RULESET" "$DRIFTED_MERGE"

	exit_code=0
	output=$(run_script "$fake_bin" "$fake_log" "--dry-run") || exit_code=$?

	if [ "$exit_code" -ne 0 ]; then
		fail "drifted ruleset — exit code $exit_code (expected 0)"
		echo "  output: $output" >&2
		unset FAKE_GH_LOG FAKE_GH_FIXTURES
		return
	fi
	if ! echo "$output" | grep -q "Ruleset pr-only-integration: update"; then
		fail "drifted ruleset — output missing 'update': $output"
		unset FAKE_GH_LOG FAKE_GH_FIXTURES
		return
	fi
	if ! echo "$output" | grep -q "Repository merge methods: update"; then
		fail "drifted ruleset — merge methods not reported update: $output"
		unset FAKE_GH_LOG FAKE_GH_FIXTURES
		return
	fi
	unset FAKE_GH_LOG FAKE_GH_FIXTURES
	pass "drifted ruleset — reports 'update' for both"
}

echo ""
echo "── Test 11: Drifted ruleset → reports 'update' ──"
test_drifted_ruleset_reports_update

# ── Test 12: Duplicate rulesets → exit 2 ──────────────────────────────────────

test_duplicate_rulesets_exit_2() {
	local fake_bin fake_log output exit_code
	fake_bin=$(mktemp -d)
	register_temp_dir "$fake_bin"
	fake_log=$(mktemp)
	: > "$fake_log"
	export FAKE_GH_LOG="$fake_log"
	export FAKE_GH_FIXTURES="$fake_bin"

	fake_gh_setup "$fake_bin"
	write_fixture_auth "$fake_bin" "ok"
	write_fixture_repo_view "$fake_bin" "testowner/testrepo"

	# Two rulesets both named pr-only-integration
	local r1 r2
	r1=$(echo "$CANONICAL_RULESET" | php -r '$_=json_decode(file_get_contents("php://stdin"),true,512,JSON_THROW_ON_ERROR);$_["id"]=1;echo json_encode($_,JSON_UNESCAPED_SLASHES);')
	r2=$(echo "$CANONICAL_RULESET" | php -r '$_=json_decode(file_get_contents("php://stdin"),true,512,JSON_THROW_ON_ERROR);$_["id"]=2;echo json_encode($_,JSON_UNESCAPED_SLASHES);')
	echo "[$r1,$r2]" > "$fake_bin/rulesets-list.json"
	write_fixture_ruleset_detail "$fake_bin" "1" "$r1"
	write_fixture_ruleset_detail "$fake_bin" "2" "$r2"
	write_fixture_repo_settings "$fake_bin" "$CANONICAL_MERGE"

	exit_code=0
	output=$(run_script "$fake_bin" "$fake_log" "--dry-run") || exit_code=$?

	if [ "$exit_code" -ne 2 ]; then
		fail "duplicate rulesets — exit code $exit_code (expected 2)"
		echo "  output: $output" >&2
		unset FAKE_GH_LOG FAKE_GH_FIXTURES
		return
	fi
	if ! echo "$output" | grep -qi "duplicate"; then
		fail "duplicate rulesets — error doesn't mention duplicate"
		unset FAKE_GH_LOG FAKE_GH_FIXTURES
		return
	fi
	unset FAKE_GH_LOG FAKE_GH_FIXTURES
	pass "duplicate rulesets — exit 2 with clear error"
}

echo ""
echo "── Test 12: Duplicate rulesets → exit 2 ──"
test_duplicate_rulesets_exit_2

# ── Test 13: Unrelated rulesets are preserved ─────────────────────────────────

test_unrelated_rulesets_preserved() {
	local fake_bin fake_log output exit_code
	fake_bin=$(mktemp -d)
	register_temp_dir "$fake_bin"
	fake_log=$(mktemp)
	: > "$fake_log"
	export FAKE_GH_LOG="$fake_log"
	export FAKE_GH_FIXTURES="$fake_bin"

	fake_gh_setup "$fake_bin"
	write_fixture_auth "$fake_bin" "ok"
	write_fixture_repo_view "$fake_bin" "testowner/testrepo"

	# One unrelated ruleset (not pr-only-integration)
	local unr
	unr=$(echo "$UNRELATED_RULESET" | php -r '$_=json_decode(file_get_contents("php://stdin"),true,512,JSON_THROW_ON_ERROR);$_["id"]=99;echo json_encode($_,JSON_UNESCAPED_SLASHES);')
	echo "[$unr]" > "$fake_bin/rulesets-list.json"
	write_fixture_ruleset_detail "$fake_bin" "99" "$unr"
	write_fixture_repo_settings "$fake_bin" "$CANONICAL_MERGE"

	exit_code=0
	output=$(run_script "$fake_bin" "$fake_log" "--dry-run") || exit_code=$?

	if [ "$exit_code" -ne 0 ]; then
		fail "unrelated rulesets — exit code $exit_code (expected 0)"
		echo "  output: $output" >&2
		unset FAKE_GH_LOG FAKE_GH_FIXTURES
		return
	fi
	# Must report create for pr-only-integration (absent)
	if ! echo "$output" | grep -q "Ruleset pr-only-integration: create"; then
		fail "unrelated rulesets — should report create for pr-only-integration: $output"
		unset FAKE_GH_LOG FAKE_GH_FIXTURES
		return
	fi
	# Must NOT mention the unrelated ruleset by name in the report
	if echo "$output" | grep -q "feature"; then
		fail "unrelated rulesets — leaked unrelated ruleset name in report: $output"
		unset FAKE_GH_LOG FAKE_GH_FIXTURES
		return
	fi
	unset FAKE_GH_LOG FAKE_GH_FIXTURES
	pass "unrelated rulesets — preserved, only owned ruleset reported"
}

echo ""
echo "── Test 13: Unrelated rulesets are preserved ──"
test_unrelated_rulesets_preserved

# ── Test 14: --dry-run exits 0, reports delta ─────────────────────────────────

test_dry_run_exits_zero() {
	local fake_bin fake_log output exit_code
	fake_bin=$(mktemp -d)
	register_temp_dir "$fake_bin"
	fake_log=$(mktemp)
	: > "$fake_log"
	export FAKE_GH_LOG="$fake_log"
	export FAKE_GH_FIXTURES="$fake_bin"

	fake_gh_setup "$fake_bin"
	write_fixture_auth "$fake_bin" "ok"
	write_fixture_repo_view "$fake_bin" "testowner/testrepo"
	echo '[]' > "$fake_bin/rulesets-list.json"
	echo "$DRIFTED_MERGE" > "$fake_bin/repo-settings.json"

	exit_code=0
	output=$(run_script "$fake_bin" "$fake_log" "--dry-run") || exit_code=$?

	if [ "$exit_code" -ne 0 ]; then
		fail "dry-run exits 0 — exit code $exit_code (expected 0)"
		echo "  output: $output" >&2
		unset FAKE_GH_LOG FAKE_GH_FIXTURES
		return
	fi
	unset FAKE_GH_LOG FAKE_GH_FIXTURES
	pass "dry-run exits 0 — always succeeds"
}

echo ""
echo "── Test 14: --dry-run exits 0, reports delta ──"
test_dry_run_exits_zero

# ── Test 15: --check exits 1 on drift ─────────────────────────────────────────

test_check_exits_one_on_drift() {
	local fake_bin fake_log output exit_code
	fake_bin=$(mktemp -d)
	register_temp_dir "$fake_bin"
	fake_log=$(mktemp)
	: > "$fake_log"
	export FAKE_GH_LOG="$fake_log"
	export FAKE_GH_FIXTURES="$fake_bin"

	fake_gh_setup "$fake_bin"
	make_fixture "$fake_bin" "42" "$DRIFTED_RULESET" "$DRIFTED_MERGE"

	exit_code=0
	output=$(run_script "$fake_bin" "$fake_log" "--check") || exit_code=$?

	if [ "$exit_code" -ne 1 ]; then
		fail "check exits 1 on drift — exit code $exit_code (expected 1)"
		echo "  output: $output" >&2
		unset FAKE_GH_LOG FAKE_GH_FIXTURES
		return
	fi
	unset FAKE_GH_LOG FAKE_GH_FIXTURES
	pass "check exits 1 on drift — drift detected"
}

echo ""
echo "── Test 15: --check exits 1 on drift ──"
test_check_exits_one_on_drift

# ── Test 16: --check exits 0 when canonical ───────────────────────────────────

test_check_exits_zero_when_canonical() {
	local fake_bin fake_log output exit_code
	fake_bin=$(mktemp -d)
	register_temp_dir "$fake_bin"
	fake_log=$(mktemp)
	: > "$fake_log"
	export FAKE_GH_LOG="$fake_log"
	export FAKE_GH_FIXTURES="$fake_bin"

	fake_gh_setup "$fake_bin"
	make_fixture "$fake_bin" "42" "$CANONICAL_RULESET" "$CANONICAL_MERGE"

	exit_code=0
	output=$(run_script "$fake_bin" "$fake_log" "--check") || exit_code=$?

	if [ "$exit_code" -ne 0 ]; then
		fail "check exits 0 canonical — exit code $exit_code (expected 0)"
		echo "  output: $output" >&2
		unset FAKE_GH_LOG FAKE_GH_FIXTURES
		return
	fi
	unset FAKE_GH_LOG FAKE_GH_FIXTURES
	pass "check exits 0 canonical — all in sync"
}

echo ""
echo "── Test 16: --check exits 0 when canonical ──"
test_check_exits_zero_when_canonical

# ── Test 17: No mutations in dry-run mode ─────────────────────────────────────

test_no_mutations_in_dry_run() {
	local fake_bin fake_log output exit_code
	fake_bin=$(mktemp -d)
	register_temp_dir "$fake_bin"
	fake_log=$(mktemp)
	: > "$fake_log"
	export FAKE_GH_LOG="$fake_log"
	export FAKE_GH_FIXTURES="$fake_bin"

	fake_gh_setup "$fake_bin"
	make_fixture "$fake_bin" "42" "$DRIFTED_RULESET" "$DRIFTED_MERGE"

	exit_code=0
	output=$(run_script "$fake_bin" "$fake_log" "--dry-run") || exit_code=$?

	if grep -q "MUTATION:" "$fake_log"; then
		fail "dry-run no mutations — log contains MUTATION entries"
		echo "  log: $(cat "$fake_log")" >&2
		unset FAKE_GH_LOG FAKE_GH_FIXTURES
		return
	fi
	unset FAKE_GH_LOG FAKE_GH_FIXTURES
	pass "dry-run no mutations — no POST/PUT/PATCH/DELETE logged"
}

echo ""
echo "── Test 17: No mutations in --dry-run mode ──"
test_no_mutations_in_dry_run

# ── Test 18: No mutations in --check mode ─────────────────────────────────────

test_no_mutations_in_check() {
	local fake_bin fake_log output exit_code
	fake_bin=$(mktemp -d)
	register_temp_dir "$fake_bin"
	fake_log=$(mktemp)
	: > "$fake_log"
	export FAKE_GH_LOG="$fake_log"
	export FAKE_GH_FIXTURES="$fake_bin"

	fake_gh_setup "$fake_bin"
	make_fixture "$fake_bin" "42" "$DRIFTED_RULESET" "$DRIFTED_MERGE"

	exit_code=0
	output=$(run_script "$fake_bin" "$fake_log" "--check") || exit_code=$?

	if grep -q "MUTATION:" "$fake_log"; then
		fail "check no mutations — log contains MUTATION entries"
		echo "  log: $(cat "$fake_log")" >&2
		unset FAKE_GH_LOG FAKE_GH_FIXTURES
		return
	fi
	unset FAKE_GH_LOG FAKE_GH_FIXTURES
	pass "check no mutations — no POST/PUT/PATCH/DELETE logged"
}

echo ""
echo "── Test 18: No mutations in --check mode ──"
test_no_mutations_in_check

# ── Test 19: --apply with absent ruleset causes one ruleset POST ───────────────

test_apply_absent_ruleset_posts() {
	local fake_bin fake_log output exit_code post_count
	fake_bin=$(mktemp -d)
	register_temp_dir "$fake_bin"
	fake_log=$(mktemp)
	: > "$fake_log"
	export FAKE_GH_LOG="$fake_log"
	export FAKE_GH_FIXTURES="$fake_bin"

	fake_gh_setup "$fake_bin"
	write_fixture_auth "$fake_bin" "ok"
	write_fixture_repo_view "$fake_bin" "testowner/testrepo"
	echo '[]' > "$fake_bin/rulesets-list.json"
	echo "$CANONICAL_MERGE" > "$fake_bin/repo-settings.json"

	exit_code=0
	output=$(run_script "$fake_bin" "$fake_log" "--apply") || exit_code=$?

	if [ "$exit_code" -ne 0 ]; then
		fail "apply absent ruleset — exit code $exit_code (expected 0)"
		echo "  output: $output" >&2
		unset FAKE_GH_LOG FAKE_GH_FIXTURES
		return
	fi
	if ! echo "$output" | grep -q "Ruleset pr-only-integration: created"; then
		fail "apply absent ruleset — output missing 'created': $output"
		unset FAKE_GH_LOG FAKE_GH_FIXTURES
		return
	fi
	post_count=$(grep -c "MUTATION: POST" "$fake_log" || true)
	if [ "$post_count" -ne 1 ]; then
		fail "apply absent ruleset — expected 1 POST, got $post_count"
		echo "  log: $(cat "$fake_log")" >&2
		unset FAKE_GH_LOG FAKE_GH_FIXTURES
		return
	fi
	if grep -qE "MUTATION: (PUT|PATCH|DELETE)" "$fake_log"; then
		fail "apply absent ruleset — unexpected PUT/PATCH/DELETE mutation"
		echo "  log: $(cat "$fake_log")" >&2
		unset FAKE_GH_LOG FAKE_GH_FIXTURES
		return
	fi
	unset FAKE_GH_LOG FAKE_GH_FIXTURES
	pass "apply absent ruleset — POST only, reports 'created'"
}

echo ""
echo "── Test 19: --apply with absent ruleset causes POST ──"
test_apply_absent_ruleset_posts

# ── Test 20: --apply with drifted ruleset causes one PUT to its digits-only ID ──

test_apply_drifted_ruleset_puts() {
	local fake_bin fake_log output exit_code put_count
	fake_bin=$(mktemp -d)
	register_temp_dir "$fake_bin"
	fake_log=$(mktemp)
	: > "$fake_log"
	export FAKE_GH_LOG="$fake_log"
	export FAKE_GH_FIXTURES="$fake_bin"

	fake_gh_setup "$fake_bin"
	make_fixture "$fake_bin" "42" "$DRIFTED_RULESET" "$CANONICAL_MERGE"

	exit_code=0
	output=$(run_script "$fake_bin" "$fake_log" "--apply") || exit_code=$?

	if [ "$exit_code" -ne 0 ]; then
		fail "apply drifted ruleset — exit code $exit_code (expected 0)"
		echo "  output: $output" >&2
		unset FAKE_GH_LOG FAKE_GH_FIXTURES
		return
	fi
	if ! echo "$output" | grep -q "Ruleset pr-only-integration: updated"; then
		fail "apply drifted ruleset — output missing 'updated': $output"
		unset FAKE_GH_LOG FAKE_GH_FIXTURES
		return
	fi
	put_count=$(grep -c "MUTATION: PUT" "$fake_log" || true)
	if [ "$put_count" -ne 1 ]; then
		fail "apply drifted ruleset — expected 1 PUT, got $put_count"
		echo "  log: $(cat "$fake_log")" >&2
		unset FAKE_GH_LOG FAKE_GH_FIXTURES
		return
	fi
	if ! grep -q "MUTATION: PUT repos/.*/rulesets/42" "$fake_log"; then
		fail "apply drifted ruleset — PUT not targeting ID 42"
		echo "  log: $(cat "$fake_log")" >&2
		unset FAKE_GH_LOG FAKE_GH_FIXTURES
		return
	fi
	if grep -q "MUTATION: POST" "$fake_log"; then
		fail "apply drifted ruleset — unexpected POST mutation"
		echo "  log: $(cat "$fake_log")" >&2
		unset FAKE_GH_LOG FAKE_GH_FIXTURES
		return
	fi
	unset FAKE_GH_LOG FAKE_GH_FIXTURES
	pass "apply drifted ruleset — PUT to ID 42, reports 'updated'"
}

echo ""
echo "── Test 20: --apply with drifted ruleset causes PUT to ID ──"
test_apply_drifted_ruleset_puts

# ── Test 21: --apply with matching ruleset causes no ruleset mutation ───────────

test_apply_matching_ruleset_no_mutation() {
	local fake_bin fake_log output exit_code
	fake_bin=$(mktemp -d)
	register_temp_dir "$fake_bin"
	fake_log=$(mktemp)
	: > "$fake_log"
	export FAKE_GH_LOG="$fake_log"
	export FAKE_GH_FIXTURES="$fake_bin"

	fake_gh_setup "$fake_bin"
	make_fixture "$fake_bin" "42" "$CANONICAL_RULESET" "$CANONICAL_MERGE"

	exit_code=0
	output=$(run_script "$fake_bin" "$fake_log" "--apply") || exit_code=$?

	if [ "$exit_code" -ne 0 ]; then
		fail "apply matching ruleset — exit code $exit_code (expected 0)"
		echo "  output: $output" >&2
		unset FAKE_GH_LOG FAKE_GH_FIXTURES
		return
	fi
	if ! echo "$output" | grep -q "Ruleset pr-only-integration: unchanged"; then
		fail "apply matching ruleset — output missing 'unchanged': $output"
		unset FAKE_GH_LOG FAKE_GH_FIXTURES
		return
	fi
	if grep -qE "MUTATION: (POST|PUT|PATCH|DELETE)" "$fake_log"; then
		fail "apply matching ruleset — unexpected mutation in log"
		echo "  log: $(cat "$fake_log")" >&2
		unset FAKE_GH_LOG FAKE_GH_FIXTURES
		return
	fi
	unset FAKE_GH_LOG FAKE_GH_FIXTURES
	pass "apply matching ruleset — no mutation, reports 'unchanged'"
}

echo ""
echo "── Test 21: --apply with matching ruleset causes no mutation ──"
test_apply_matching_ruleset_no_mutation

# ── Test 22: --apply with drifted merge settings causes one repo PATCH ──────────

test_apply_drifted_merge_patches() {
	local fake_bin fake_log output exit_code patch_count
	fake_bin=$(mktemp -d)
	register_temp_dir "$fake_bin"
	fake_log=$(mktemp)
	: > "$fake_log"
	export FAKE_GH_LOG="$fake_log"
	export FAKE_GH_FIXTURES="$fake_bin"

	fake_gh_setup "$fake_bin"
	make_fixture "$fake_bin" "42" "$CANONICAL_RULESET" "$DRIFTED_MERGE"

	exit_code=0
	output=$(run_script "$fake_bin" "$fake_log" "--apply") || exit_code=$?

	if [ "$exit_code" -ne 0 ]; then
		fail "apply drifted merge — exit code $exit_code (expected 0)"
		echo "  output: $output" >&2
		unset FAKE_GH_LOG FAKE_GH_FIXTURES
		return
	fi
	if ! echo "$output" | grep -q "Repository merge methods: updated"; then
		fail "apply drifted merge — output missing 'updated': $output"
		unset FAKE_GH_LOG FAKE_GH_FIXTURES
		return
	fi
	patch_count=$(grep -c "MUTATION: PATCH" "$fake_log" || true)
	if [ "$patch_count" -ne 1 ]; then
		fail "apply drifted merge — expected 1 PATCH, got $patch_count"
		echo "  log: $(cat "$fake_log")" >&2
		unset FAKE_GH_LOG FAKE_GH_FIXTURES
		return
	fi
	if ! grep -q "MUTATION: PATCH repos/" "$fake_log"; then
		fail "apply drifted merge — PATCH not targeting repo endpoint"
		echo "  log: $(cat "$fake_log")" >&2
		unset FAKE_GH_LOG FAKE_GH_FIXTURES
		return
	fi
	# Should NOT mutate the ruleset (it matched)
	if grep -qE "MUTATION: (POST|PUT).*rulesets" "$fake_log"; then
		fail "apply drifted merge — unexpected ruleset mutation alongside merge PATCH"
		echo "  log: $(cat "$fake_log")" >&2
		unset FAKE_GH_LOG FAKE_GH_FIXTURES
		return
	fi
	unset FAKE_GH_LOG FAKE_GH_FIXTURES
	pass "apply drifted merge — PATCH only, reports 'updated'"
}

echo ""
echo "── Test 22: --apply with drifted merge settings causes PATCH ──"
test_apply_drifted_merge_patches

# ── Test 23: --apply with matching merge settings causes no PATCH ───────────────

test_apply_matching_merge_no_patch() {
	local fake_bin fake_log output exit_code
	fake_bin=$(mktemp -d)
	register_temp_dir "$fake_bin"
	fake_log=$(mktemp)
	: > "$fake_log"
	export FAKE_GH_LOG="$fake_log"
	export FAKE_GH_FIXTURES="$fake_bin"

	fake_gh_setup "$fake_bin"
	make_fixture "$fake_bin" "42" "$DRIFTED_RULESET" "$CANONICAL_MERGE"

	exit_code=0
	output=$(run_script "$fake_bin" "$fake_log" "--apply") || exit_code=$?

	if [ "$exit_code" -ne 0 ]; then
		fail "apply matching merge — exit code $exit_code (expected 0)"
		echo "  output: $output" >&2
		unset FAKE_GH_LOG FAKE_GH_FIXTURES
		return
	fi
	if ! echo "$output" | grep -q "Repository merge methods: unchanged"; then
		fail "apply matching merge — output missing 'unchanged': $output"
		unset FAKE_GH_LOG FAKE_GH_FIXTURES
		return
	fi
	if grep -q "MUTATION: PATCH" "$fake_log"; then
		fail "apply matching merge — unexpected PATCH mutation"
		echo "  log: $(cat "$fake_log")" >&2
		unset FAKE_GH_LOG FAKE_GH_FIXTURES
		return
	fi
	unset FAKE_GH_LOG FAKE_GH_FIXTURES
	pass "apply matching merge — no PATCH, reports 'unchanged'"
}

echo ""
echo "── Test 23: --apply with matching merge settings causes no PATCH ──"
test_apply_matching_merge_no_patch

# ── Test 24: --apply never updates or deletes unrelated rulesets ────────────────

test_apply_unrelated_rulesets_untouched() {
	local fake_bin fake_log output exit_code unr
	fake_bin=$(mktemp -d)
	register_temp_dir "$fake_bin"
	fake_log=$(mktemp)
	: > "$fake_log"
	export FAKE_GH_LOG="$fake_log"
	export FAKE_GH_FIXTURES="$fake_bin"

	fake_gh_setup "$fake_bin"
	write_fixture_auth "$fake_bin" "ok"
	write_fixture_repo_view "$fake_bin" "testowner/testrepo"

	# One unrelated ruleset (not pr-only-integration)
	unr=$(echo "$UNRELATED_RULESET" | php -r '$_=json_decode(file_get_contents("php://stdin"),true,512,JSON_THROW_ON_ERROR);$_["id"]=99;echo json_encode($_,JSON_UNESCAPED_SLASHES);')
	echo "[$unr]" > "$fake_bin/rulesets-list.json"
	write_fixture_ruleset_detail "$fake_bin" "99" "$unr"
	write_fixture_repo_settings "$fake_bin" "$CANONICAL_MERGE"

	exit_code=0
	output=$(run_script "$fake_bin" "$fake_log" "--apply") || exit_code=$?

	if [ "$exit_code" -ne 0 ]; then
		fail "apply unrelated — exit code $exit_code (expected 0)"
		echo "  output: $output" >&2
		unset FAKE_GH_LOG FAKE_GH_FIXTURES
		return
	fi
	# Should POST to create pr-only-integration only
	if ! echo "$output" | grep -q "Ruleset pr-only-integration: created"; then
		fail "apply unrelated — missing 'created' for pr-only-integration: $output"
		unset FAKE_GH_LOG FAKE_GH_FIXTURES
		return
	fi
	# Must not PUT or DELETE the unrelated ruleset (ID 99)
	if grep -q "rulesets/99" "$fake_log"; then
		fail "apply unrelated — touched unrelated ruleset ID 99"
		echo "  log: $(cat "$fake_log")" >&2
		unset FAKE_GH_LOG FAKE_GH_FIXTURES
		return
	fi
	if grep -q "MUTATION: DELETE" "$fake_log"; then
		fail "apply unrelated — DELETE emitted"
		echo "  log: $(cat "$fake_log")" >&2
		unset FAKE_GH_LOG FAKE_GH_FIXTURES
		return
	fi
	unset FAKE_GH_LOG FAKE_GH_FIXTURES
	pass "apply unrelated rulesets — only owned ruleset touched, no DELETE"
}

echo ""
echo "── Test 24: --apply never touches unrelated rulesets ──"
test_apply_unrelated_rulesets_untouched

# ── Test 25: --apply fails on duplicate owned rulesets before mutation ──────────

test_apply_duplicate_fails_before_mutation() {
	local fake_bin fake_log output exit_code r1 r2
	fake_bin=$(mktemp -d)
	register_temp_dir "$fake_bin"
	fake_log=$(mktemp)
	: > "$fake_log"
	export FAKE_GH_LOG="$fake_log"
	export FAKE_GH_FIXTURES="$fake_bin"

	fake_gh_setup "$fake_bin"
	write_fixture_auth "$fake_bin" "ok"
	write_fixture_repo_view "$fake_bin" "testowner/testrepo"

	# Two rulesets both named pr-only-integration
	r1=$(echo "$CANONICAL_RULESET" | php -r '$_=json_decode(file_get_contents("php://stdin"),true,512,JSON_THROW_ON_ERROR);$_["id"]=1;echo json_encode($_,JSON_UNESCAPED_SLASHES);')
	r2=$(echo "$CANONICAL_RULESET" | php -r '$_=json_decode(file_get_contents("php://stdin"),true,512,JSON_THROW_ON_ERROR);$_["id"]=2;echo json_encode($_,JSON_UNESCAPED_SLASHES);')
	echo "[$r1,$r2]" > "$fake_bin/rulesets-list.json"
	write_fixture_ruleset_detail "$fake_bin" "1" "$r1"
	write_fixture_ruleset_detail "$fake_bin" "2" "$r2"
	write_fixture_repo_settings "$fake_bin" "$CANONICAL_MERGE"

	exit_code=0
	output=$(run_script "$fake_bin" "$fake_log" "--apply") || exit_code=$?

	if [ "$exit_code" -ne 2 ]; then
		fail "apply duplicate — exit code $exit_code (expected 2)"
		echo "  output: $output" >&2
		unset FAKE_GH_LOG FAKE_GH_FIXTURES
		return
	fi
	if ! echo "$output" | grep -qi "duplicate"; then
		fail "apply duplicate — error doesn't mention duplicate"
		unset FAKE_GH_LOG FAKE_GH_FIXTURES
		return
	fi
	# No mutations must have occurred
	if grep -qE "MUTATION:" "$fake_log"; then
		fail "apply duplicate — mutations occurred before duplicate detection"
		echo "  log: $(cat "$fake_log")" >&2
		unset FAKE_GH_LOG FAKE_GH_FIXTURES
		return
	fi
	unset FAKE_GH_LOG FAKE_GH_FIXTURES
	pass "apply duplicate — exit 2 before any mutation"
}

echo ""
echo "── Test 25: --apply fails on duplicate rulesets before mutation ──"
test_apply_duplicate_fails_before_mutation

# ── Test 26: A second canonical --apply run is a complete no-op ─────────────────

test_apply_second_run_noop() {
	local fake_bin fake_log output exit_code
	fake_bin=$(mktemp -d)
	register_temp_dir "$fake_bin"
	fake_log=$(mktemp)
	: > "$fake_log"
	export FAKE_GH_LOG="$fake_log"
	export FAKE_GH_FIXTURES="$fake_bin"

	fake_gh_setup "$fake_bin"
	make_fixture "$fake_bin" "42" "$CANONICAL_RULESET" "$CANONICAL_MERGE"

	# First apply run — already canonical, should be a no-op
	exit_code=0
	output=$(run_script "$fake_bin" "$fake_log" "--apply") || exit_code=$?
	if [ "$exit_code" -ne 0 ]; then
		fail "apply second run — first run exit code $exit_code (expected 0)"
		echo "  output: $output" >&2
		unset FAKE_GH_LOG FAKE_GH_FIXTURES
		return
	fi
	if grep -qE "MUTATION:" "$fake_log"; then
		fail "apply second run — first run had unexpected mutation"
		echo "  log: $(cat "$fake_log")" >&2
		unset FAKE_GH_LOG FAKE_GH_FIXTURES
		return
	fi

	# Truncate log and run second apply — also canonical, must be no-op
	: > "$fake_log"
	exit_code=0
	output=$(run_script "$fake_bin" "$fake_log" "--apply") || exit_code=$?
	if [ "$exit_code" -ne 0 ]; then
		fail "apply second run — second run exit code $exit_code (expected 0)"
		echo "  output: $output" >&2
		unset FAKE_GH_LOG FAKE_GH_FIXTURES
		return
	fi
	if grep -qE "MUTATION:" "$fake_log"; then
		fail "apply second run — second run had unexpected mutation"
		echo "  log: $(cat "$fake_log")" >&2
		unset FAKE_GH_LOG FAKE_GH_FIXTURES
		return
	fi
	if ! echo "$output" | grep -q "Ruleset pr-only-integration: unchanged"; then
		fail "apply second run — second run missing 'unchanged': $output"
		unset FAKE_GH_LOG FAKE_GH_FIXTURES
		return
	fi

	unset FAKE_GH_LOG FAKE_GH_FIXTURES
	pass "apply second canonical run — complete no-op, GET calls only"
}

echo ""
echo "── Test 26: Second canonical --apply run is a no-op ──"
test_apply_second_run_noop

# ── Test 27: A 403 names the required repository-administration permission ──────

test_apply_403_names_permission() {
	local fake_bin fake_log output exit_code
	fake_bin=$(mktemp -d)
	register_temp_dir "$fake_bin"
	fake_log=$(mktemp)
	: > "$fake_log"
	export FAKE_GH_LOG="$fake_log"
	export FAKE_GH_FIXTURES="$fake_bin"

	fake_gh_setup "$fake_bin"
	write_fixture_auth "$fake_bin" "ok"
	write_fixture_repo_view "$fake_bin" "testowner/testrepo"
	echo '[]' > "$fake_bin/rulesets-list.json"
	echo "$CANONICAL_MERGE" > "$fake_bin/repo-settings.json"
	# Trigger 403 on POST (ruleset creation)
	touch "$fake_bin/ruleset-post-403"

	exit_code=0
	output=$(run_script "$fake_bin" "$fake_log" "--apply") || exit_code=$?

	if [ "$exit_code" -ne 2 ]; then
		fail "apply 403 — exit code $exit_code (expected 2)"
		echo "  output: $output" >&2
		unset FAKE_GH_LOG FAKE_GH_FIXTURES
		return
	fi
	if ! echo "$output" | grep -qi "403"; then
		fail "apply 403 — error doesn't mention 403: $output"
		unset FAKE_GH_LOG FAKE_GH_FIXTURES
		return
	fi
	if ! echo "$output" | grep -qi "repository administration"; then
		fail "apply 403 — error doesn't name 'repository administration': $output"
		unset FAKE_GH_LOG FAKE_GH_FIXTURES
		return
	fi
	unset FAKE_GH_LOG FAKE_GH_FIXTURES
	pass "apply 403 — exit 2, names repository administration permission"
}

echo ""
echo "── Test 27: A 403 names repository-administration permission ──"
test_apply_403_names_permission

# ── Test 28: No code path emits DELETE ──────────────────────────────────────────

test_no_delete_code_path() {
	# The script must never issue a DELETE API call.
	# Check for -X DELETE usage (the gh api mutation flag).
	if grep -nqE '\-X[[:space:]]+DELETE' "$SCRIPT" 2>/dev/null; then
		fail "no DELETE — script contains -X DELETE"
		return
	fi
	# Also catch DELETE method in any form that would emit a mutation
	if grep -nqE '"DELETE"' "$SCRIPT" 2>/dev/null; then
		fail "no DELETE — script contains DELETE string literal"
		return
	fi
	pass "no DELETE — script never issues DELETE API calls"
}

echo ""
echo "── Test 28: No code path emits DELETE ──"
test_no_delete_code_path

# ── Test 29: All gh api call sites route through the gh_api wrapper ───────────

test_gh_api_call_sites_wrapped() {
	local outside bare wrapped
	# Strip the gh_api() definition; any remaining `gh api ` mention is a bare,
	# unbounded call site (run_gh contains no `gh api ` string).
	outside=$(awk '/^gh_api\(\) \{/{skip=1} skip && /^\}/{skip=0; next} !skip {print}' "$SCRIPT")
	bare=$(printf '%s\n' "$outside" | grep -v '^[[:space:]]*#' | grep -c 'gh api ' || true)
	wrapped=$(grep -c 'gh_api ' "$SCRIPT" || true)
	if [ "$bare" -eq 0 ] && [ "$wrapped" -ge 6 ]; then
		pass "gh api call sites — no bare gh api outside the wrapper ($wrapped wrapped sites)"
	else
		fail "gh api call sites — bare=$bare wrapped=$wrapped (expected 0 bare, >= 6 wrapped)"
	fi
}

echo ""
echo "── Test 29: All gh api call sites route through gh_api ──"
test_gh_api_call_sites_wrapped

# ── Test 30: gh_api wraps calls in timeout 60 when timeout exists ──────────────

test_gh_api_uses_timeout_when_available() {
	local fake_bin fake_log timeout_log output exit_code
	fake_bin=$(mktemp -d)
	register_temp_dir "$fake_bin"
	fake_log=$(mktemp)
	timeout_log=$(mktemp)
	: > "$fake_log"
	: > "$timeout_log"
	export FAKE_GH_LOG="$fake_log"
	export FAKE_GH_FIXTURES="$fake_bin"

	fake_gh_setup "$fake_bin"

	cat > "$fake_bin/timeout" <<'TIMEOUT_SHIM'
#!/usr/bin/env bash
echo "$@" >> "${FAKE_TIMEOUT_LOG:?FAKE_TIMEOUT_LOG not set}"
shift
cmd="$1"
shift
exec "$cmd" "$@"
TIMEOUT_SHIM
	chmod +x "$fake_bin/timeout"
	export FAKE_TIMEOUT_LOG="$timeout_log"

	write_fixture_auth "$fake_bin" "ok"
	write_fixture_repo_view "$fake_bin" "testowner/testrepo"
	echo '[]' > "$fake_bin/rulesets-list.json"
	echo "$CANONICAL_MERGE" > "$fake_bin/repo-settings.json"

	exit_code=0
	output=$(run_script "$fake_bin" "$fake_log" "--dry-run") || exit_code=$?

	unset FAKE_TIMEOUT_LOG FAKE_GH_LOG FAKE_GH_FIXTURES

	if [ "$exit_code" -ne 0 ]; then
		fail "gh_api timeout — exit code $exit_code (expected 0)"
		echo "  output: $output" >&2
		return
	fi
	if ! grep -q '^60 gh api ' "$timeout_log"; then
		fail "gh_api timeout — no 'timeout 60 gh api' invocation recorded"
		echo "  log: $(cat "$timeout_log")" >&2
		return
	fi
	if ! grep -q '^60 gh repo view ' "$timeout_log"; then
		fail "gh_api timeout — repo view not wrapped in timeout 60"
		echo "  log: $(cat "$timeout_log")" >&2
		return
	fi
	pass "gh_api timeout — api and repo-view calls wrapped in timeout 60"
}

echo ""
echo "── Test 30: gh_api wraps calls when timeout exists ──"
test_gh_api_uses_timeout_when_available

# ── Test 31: gh_api falls back to bare gh api when timeout is absent ───────────

test_gh_api_bare_without_timeout() {
	local fake_bin fake_log output exit_code tool
	fake_bin=$(mktemp -d)
	register_temp_dir "$fake_bin"
	fake_log=$(mktemp)
	: > "$fake_log"
	export FAKE_GH_LOG="$fake_log"
	export FAKE_GH_FIXTURES="$fake_bin"

	fake_gh_setup "$fake_bin"
	# Minimal PATH: the --dry-run path uses exactly these externals (the rest
	# are bash builtins). Deliberately no timeout/gtimeout so the gh_api
	# fallback is exercised; extend this list if the script gains externals
	# (set -euo pipefail aborts on a missing command).
	for tool in bash php mktemp cat grep rm; do
		ln -s "$(command -v "$tool")" "$fake_bin/$tool"
	done

	write_fixture_auth "$fake_bin" "ok"
	write_fixture_repo_view "$fake_bin" "testowner/testrepo"
	echo '[]' > "$fake_bin/rulesets-list.json"
	echo "$CANONICAL_MERGE" > "$fake_bin/repo-settings.json"

	exit_code=0
	output=$(env PATH="$fake_bin" bash "$SCRIPT" --dry-run 2>&1) || exit_code=$?

	unset FAKE_GH_LOG FAKE_GH_FIXTURES

	if [ "$exit_code" -ne 0 ]; then
		fail "gh_api bare — exit code $exit_code (expected 0)"
		echo "  output: $output" >&2
		return
	fi
	if ! grep -q '^api repos/testowner/testrepo/rulesets' "$fake_log"; then
		fail "gh_api bare — gh api not invoked"
		return
	fi
	pass "gh_api bare — calls gh api directly when timeout is absent"
}

echo ""
echo "── Test 31: gh_api falls back to bare gh api ──"
test_gh_api_bare_without_timeout

# ── Test 32: gh_api wraps calls in gtimeout when only gtimeout exists ─────────

test_gh_api_uses_gtimeout_when_available() {
	local fake_bin fake_log gtimeout_log output exit_code tool
	fake_bin=$(mktemp -d)
	register_temp_dir "$fake_bin"
	fake_log=$(mktemp)
	gtimeout_log=$(mktemp)
	: > "$fake_log"
	: > "$gtimeout_log"
	export FAKE_GH_LOG="$fake_log"
	export FAKE_GH_FIXTURES="$fake_bin"

	fake_gh_setup "$fake_bin"
	# Minimal PATH (like Test 31) so the host's /usr/bin/timeout cannot
	# shadow the gtimeout-only scenario; plus the gtimeout shim.
	for tool in bash php mktemp cat grep rm; do
		ln -s "$(command -v "$tool")" "$fake_bin/$tool"
	done

	cat > "$fake_bin/gtimeout" <<'GTIMEOUT_SHIM'
#!/usr/bin/env bash
echo "$@" >> "${FAKE_GTIMEOUT_LOG:?FAKE_GTIMEOUT_LOG not set}"
shift
cmd="$1"
shift
exec "$cmd" "$@"
GTIMEOUT_SHIM
	chmod +x "$fake_bin/gtimeout"
	export FAKE_GTIMEOUT_LOG="$gtimeout_log"

	write_fixture_auth "$fake_bin" "ok"
	write_fixture_repo_view "$fake_bin" "testowner/testrepo"
	echo '[]' > "$fake_bin/rulesets-list.json"
	echo "$CANONICAL_MERGE" > "$fake_bin/repo-settings.json"

	exit_code=0
	output=$(env PATH="$fake_bin" bash "$SCRIPT" --dry-run 2>&1) || exit_code=$?

	unset FAKE_GTIMEOUT_LOG FAKE_GH_LOG FAKE_GH_FIXTURES

	if [ "$exit_code" -ne 0 ]; then
		fail "gh_api gtimeout — exit code $exit_code (expected 0)"
		echo "  output: $output" >&2
		return
	fi
	if ! grep -q '^60 gh api ' "$gtimeout_log"; then
		fail "gh_api gtimeout — no 'gtimeout 60 gh api' invocation recorded"
		echo "  log: $(cat "$gtimeout_log")" >&2
		return
	fi
	pass "gh_api gtimeout — api calls wrapped in gtimeout 60 when timeout is absent"
}

echo ""
echo "── Test 32: gh_api wraps calls when only gtimeout exists ──"
test_gh_api_uses_gtimeout_when_available

# ── Summary ───────────────────────────────────────────────────────────────────

print_summary "setup_rulesets_test.sh"
exit $?
















# vim: ft=sh sts=4 sw=4 ts=4 et :
