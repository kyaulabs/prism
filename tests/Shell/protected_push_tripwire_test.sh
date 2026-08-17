#!/usr/bin/env bash
# $KYAULabs: protected_push_tripwire_test.sh kyau@aura.kyaulabs 2026/08/17 -0700 Exp $




# ── CI protected-push provenance tripwire tests ───────────────────────────────
# Verifies that verify-protected-push.sh correctly gates protected-branch
# pushes: non-protected events skip, root commits pass, and exact PR merge-SHA
# provenance is required. Uses disposable git repos and a fake gh API shim.

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
source "$REPO_ROOT/tests/Shell/lib/test_helpers.sh"

setup_result_file

SCRIPT="$REPO_ROOT/.github/scripts/verify-protected-push.sh"

# ── Fake gh infrastructure ────────────────────────────────────────────────────
# FAKE_GH_LOG  — log file for recorded invocations
# FAKE_GH_FIXTURES — directory containing fixture files for the gh shim
#
# The fake gh writes all arguments to FAKE_GH_LOG, then serves the
# repos/{owner}/{repo}/commits/{sha}/pulls endpoint from fixture files.
# If no fixture exists for the endpoint, it returns an empty JSON array.

fake_gh_setup() {
	local bin_dir="$1"
	local fake_gh="$bin_dir/gh"

	cat > "$fake_gh" <<'GH_SCRIPT'
#!/usr/bin/env bash
echo "$@" >> "${FAKE_GH_LOG:?FAKE_GH_LOG not set}"
FIXTURES="${FAKE_GH_FIXTURES:-}"

case "$1" in
	api)
		shift
		endpoint=""
		for arg in "$@"; do
			case "$arg" in
				repos/*/commits/*/pulls) endpoint="$arg" ;;
			esac
		done

		case "$endpoint" in
			repos/*/commits/*/pulls)
				# Sequence mode for retry testing
				if [ -n "${FAKE_GH_SEQ_FILE:-}" ]; then
					seq=$(cat "$FAKE_GH_SEQ_FILE" 2>/dev/null || echo 0)
					seq=$((seq + 1))
					echo "$seq" > "$FAKE_GH_SEQ_FILE"
					if [ -f "$FIXTURES/response.${seq}" ]; then
						cat "$FIXTURES/response.${seq}"
						exit 0
					fi
				fi

				# Failure simulation
				if [ -n "${FAKE_GH_FAIL:-}" ]; then
					echo "gh: API error" >&2
					exit 1
				fi

				# Default response
				if [ -f "$FIXTURES/pulls.json" ]; then
					cat "$FIXTURES/pulls.json"
				else
					echo '[]'
				fi
				exit 0
				;;
		esac
		echo "gh api: unexpected endpoint $endpoint" >&2
		exit 1
		;;
	*)
		echo "gh: unexpected command: $*" >&2
		exit 1
		;;
esac
GH_SCRIPT
	chmod +x "$fake_gh"
}

# run_verifier <repo_dir> <fake_bin> <fake_log> [env_vars...]
# Runs the verifier script with fake gh in PATH and specified env vars.
# Sets the global exit_code to the script's exit code.
run_verifier() {
	local repo_dir="$1" fake_bin="$2" fake_log="$3"
	shift 3
	(
		cd "$repo_dir"
		env \
			FAKE_GH_LOG="$fake_log" \
			FAKE_GH_FIXTURES="$fake_bin" \
			PATH="$fake_bin:$PATH" \
			"$@" \
			bash "$SCRIPT" 2>/dev/null
	)
}

# ── Test 1: Non-push event skips ──────────────────────────────────────────────

echo ""
echo "── Test 1: Non-push event skips ──"
T1=$(mktemp -d)
register_temp_dir "$T1"
git_init_test_repo "$T1"

fake_bin=$(mktemp -d)
register_temp_dir "$fake_bin"
fake_gh_setup "$fake_bin"
fake_log=$(mktemp)
register_temp_dir "$fake_log"

exit_code=0
run_verifier "$T1" "$fake_bin" "$fake_log" \
	GITHUB_EVENT_NAME=workflow_dispatch \
	GITHUB_REF=refs/heads/main \
	GITHUB_SHA=abc123 \
	GITHUB_EVENT_BEFORE=0000000000000000000000000000000000000000 \
	GITHUB_REPOSITORY=testowner/testrepo \
	GH_TOKEN=fake || exit_code=$?

if [ "$exit_code" -eq 0 ]; then
	pass "Non-push event exits 0"
else
	fail "Expected exit 0 for non-push event, got $exit_code"
fi

# ── Test 2: Push to a work ref skips ───────────────────────────────────────────

echo ""
echo "── Test 2: Push to a work ref skips ──"
T2=$(mktemp -d)
register_temp_dir "$T2"
git_init_test_repo "$T2"

fake_bin2=$(mktemp -d)
register_temp_dir "$fake_bin2"
fake_gh_setup "$fake_bin2"
fake_log2=$(mktemp)
register_temp_dir "$fake_log2"

exit_code=0
run_verifier "$T2" "$fake_bin2" "$fake_log2" \
	GITHUB_EVENT_NAME=push \
	GITHUB_REF=refs/heads/feature/foo \
	GITHUB_SHA=abc123 \
	GITHUB_EVENT_BEFORE=0000000000000000000000000000000000000000 \
	GITHUB_REPOSITORY=testowner/testrepo \
	GH_TOKEN=fake || exit_code=$?

if [ "$exit_code" -eq 0 ]; then
	pass "Work ref push exits 0"
else
	fail "Expected exit 0 for work ref push, got $exit_code"
fi

# ── Test 10: Malformed repository fails before API access ──────────────────────

echo ""
echo "── Test 10: Malformed repository/SHA/env fails before API access ──"
T10=$(mktemp -d)
register_temp_dir "$T10"
git_init_test_repo "$T10"

fake_bin10=$(mktemp -d)
register_temp_dir "$fake_bin10"
fake_gh_setup "$fake_bin10"
fake_log10=$(mktemp)
register_temp_dir "$fake_log10"

# Bad repo name (no slash)
exit_code=0
run_verifier "$T10" "$fake_bin10" "$fake_log10" \
	GITHUB_EVENT_NAME=push \
	GITHUB_REF=refs/heads/main \
	GITHUB_SHA=aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa \
	GITHUB_EVENT_BEFORE=0000000000000000000000000000000000000000 \
	GITHUB_REPOSITORY=badrepo \
	GH_TOKEN=fake || exit_code=$?

if [ "$exit_code" -eq 2 ]; then
	pass "Malformed repo exits 2"
else
	fail "Expected exit 2 for malformed repo, got $exit_code"
fi

# ── Test 3: Zero-before + one root commit passes without API access ────────────

echo ""
echo "── Test 3: Zero-before + one root commit passes without API access ──"
T3=$(mktemp -d)
register_temp_dir "$T3"
git_init_test_repo "$T3"
(
	cd "$T3"
	echo "initial" > README.md
	git add README.md
	git commit --quiet -m "Initial commit"
)
root_sha=$(cd "$T3" && git rev-parse HEAD)

fake_bin3=$(mktemp -d)
register_temp_dir "$fake_bin3"
fake_gh_setup "$fake_bin3"
fake_log3=$(mktemp)
register_temp_dir "$fake_log3"

exit_code=0
run_verifier "$T3" "$fake_bin3" "$fake_log3" \
	GITHUB_EVENT_NAME=push \
	GITHUB_REF=refs/heads/main \
	GITHUB_SHA="$root_sha" \
	GITHUB_EVENT_BEFORE=0000000000000000000000000000000000000000 \
	GITHUB_REPOSITORY=testowner/testrepo \
	GH_TOKEN=fake || exit_code=$?

if [ "$exit_code" -eq 0 ]; then
	pass "Root commit push exits 0"
else
	fail "Expected exit 0 for root commit push, got $exit_code"
fi

# ── Test 4: Zero-before + multi-commit history fails ───────────────────────────

echo ""
echo "── Test 4: Zero-before + multi-commit history fails ──"
T4=$(mktemp -d)
register_temp_dir "$T4"
git_init_test_repo "$T4"
(
	cd "$T4"
	echo "initial" > README.md
	git add README.md
	git commit --quiet -m "Initial commit"
	echo "second" >> README.md
	git add README.md
	git commit --quiet -m "Second commit"
)
multi_sha=$(cd "$T4" && git rev-parse HEAD)

fake_bin4=$(mktemp -d)
register_temp_dir "$fake_bin4"
fake_gh_setup "$fake_bin4"
fake_log4=$(mktemp)
register_temp_dir "$fake_log4"

exit_code=0
run_verifier "$T4" "$fake_bin4" "$fake_log4" \
	GITHUB_EVENT_NAME=push \
	GITHUB_REF=refs/heads/main \
	GITHUB_SHA="$multi_sha" \
	GITHUB_EVENT_BEFORE=0000000000000000000000000000000000000000 \
	GITHUB_REPOSITORY=testowner/testrepo \
	GH_TOKEN=fake || exit_code=$?

if [ "$exit_code" -eq 1 ]; then
	pass "Multi-commit history push exits 1"
else
	fail "Expected exit 1 for multi-commit history push, got $exit_code"
fi

# ── Test 5: Merged PR with matching base and merge_commit_sha passes ───────────

echo ""
echo "── Test 5: Merged PR with matching base and merge_commit_sha passes ──"
T5=$(mktemp -d)
register_temp_dir "$T5"
git_init_test_repo "$T5"
(
	cd "$T5"
	echo "initial" > README.md
	git add README.md
	git commit --quiet -m "Initial commit"
	echo "second" >> README.md
	git add README.md
	git commit --quiet -m "Second commit"
)
pr_sha=$(cd "$T5" && git rev-parse HEAD)

fake_bin5=$(mktemp -d)
register_temp_dir "$fake_bin5"
fake_gh_setup "$fake_bin5"
fake_log5=$(mktemp)
register_temp_dir "$fake_log5"

# Fixture: merged PR with correct base and merge_commit_sha
cat > "$fake_bin5/pulls.json" <<JSON
[
  {
    "merged_at": "2026-07-30T12:00:00Z",
    "base": {"ref": "main"},
    "merge_commit_sha": "$pr_sha",
    "state": "closed",
    "title": "Test PR"
  }
]
JSON

exit_code=0
run_verifier "$T5" "$fake_bin5" "$fake_log5" \
	GITHUB_EVENT_NAME=push \
	GITHUB_REF=refs/heads/main \
	GITHUB_SHA="$pr_sha" \
	GITHUB_EVENT_BEFORE=aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa \
	GITHUB_REPOSITORY=testowner/testrepo \
	GH_TOKEN=fake || exit_code=$?

if [ "$exit_code" -eq 0 ]; then
	pass "Merged PR with matching provenance exits 0"
else
	fail "Expected exit 0 for merged PR with matching provenance, got $exit_code"
fi

# ── Test 6: No associated PR fails ─────────────────────────────────────────────

echo ""
echo "── Test 6: No associated PR fails ──"
T6=$(mktemp -d)
register_temp_dir "$T6"
git_init_test_repo "$T6"
(
	cd "$T6"
	echo "initial" > README.md
	git add README.md
	git commit --quiet -m "Initial commit"
	echo "second" >> README.md
	git add README.md
	git commit --quiet -m "Second commit"
)
nopr_sha=$(cd "$T6" && git rev-parse HEAD)

fake_bin6=$(mktemp -d)
register_temp_dir "$fake_bin6"
fake_gh_setup "$fake_bin6"
fake_log6=$(mktemp)
register_temp_dir "$fake_log6"

# Fixture: empty pulls array
echo '[]' > "$fake_bin6/pulls.json"

exit_code=0
run_verifier "$T6" "$fake_bin6" "$fake_log6" \
	GITHUB_EVENT_NAME=push \
	GITHUB_REF=refs/heads/main \
	GITHUB_SHA="$nopr_sha" \
	GITHUB_EVENT_BEFORE=aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa \
	GITHUB_REPOSITORY=testowner/testrepo \
	GH_TOKEN=fake || exit_code=$?

if [ "$exit_code" -eq 1 ]; then
	pass "No associated PR exits 1"
else
	fail "Expected exit 1 for no associated PR, got $exit_code"
fi

# ── Test 7: Closed-but-unmerged PR fails ───────────────────────────────────────

echo ""
echo "── Test 7: Closed-but-unmerged PR fails ──"
T7=$(mktemp -d)
register_temp_dir "$T7"
git_init_test_repo "$T7"
(
	cd "$T7"
	echo "initial" > README.md
	git add README.md
	git commit --quiet -m "Initial commit"
	echo "second" >> README.md
	git add README.md
	git commit --quiet -m "Second commit"
)
closed_sha=$(cd "$T7" && git rev-parse HEAD)

fake_bin7=$(mktemp -d)
register_temp_dir "$fake_bin7"
fake_gh_setup "$fake_bin7"
fake_log7=$(mktemp)
register_temp_dir "$fake_log7"

# Fixture: closed PR with null merged_at
cat > "$fake_bin7/pulls.json" <<JSON
[
  {
    "merged_at": null,
    "base": {"ref": "main"},
    "merge_commit_sha": "$closed_sha",
    "state": "closed",
    "title": "Closed PR"
  }
]
JSON

exit_code=0
run_verifier "$T7" "$fake_bin7" "$fake_log7" \
	GITHUB_EVENT_NAME=push \
	GITHUB_REF=refs/heads/main \
	GITHUB_SHA="$closed_sha" \
	GITHUB_EVENT_BEFORE=aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa \
	GITHUB_REPOSITORY=testowner/testrepo \
	GH_TOKEN=fake || exit_code=$?

if [ "$exit_code" -eq 1 ]; then
	pass "Closed-but-unmerged PR exits 1"
else
	fail "Expected exit 1 for closed-but-unmerged PR, got $exit_code"
fi

# ── Test 8: Merged PR with wrong base fails ────────────────────────────────────

echo ""
echo "── Test 8: Merged PR with wrong base fails ──"
T8=$(mktemp -d)
register_temp_dir "$T8"
git_init_test_repo "$T8"
(
	cd "$T8"
	echo "initial" > README.md
	git add README.md
	git commit --quiet -m "Initial commit"
	echo "second" >> README.md
	git add README.md
	git commit --quiet -m "Second commit"
)
wrong_base_sha=$(cd "$T8" && git rev-parse HEAD)

fake_bin8=$(mktemp -d)
register_temp_dir "$fake_bin8"
fake_gh_setup "$fake_bin8"
fake_log8=$(mktemp)
register_temp_dir "$fake_log8"

# Fixture: merged PR but base is wrong branch
cat > "$fake_bin8/pulls.json" <<JSON
[
  {
    "merged_at": "2026-07-30T12:00:00Z",
    "base": {"ref": "develop"},
    "merge_commit_sha": "$wrong_base_sha",
    "state": "closed",
    "title": "Wrong base PR"
  }
]
JSON

exit_code=0
run_verifier "$T8" "$fake_bin8" "$fake_log8" \
	GITHUB_EVENT_NAME=push \
	GITHUB_REF=refs/heads/main \
	GITHUB_SHA="$wrong_base_sha" \
	GITHUB_EVENT_BEFORE=aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa \
	GITHUB_REPOSITORY=testowner/testrepo \
	GH_TOKEN=fake || exit_code=$?

if [ "$exit_code" -eq 1 ]; then
	pass "Merged PR with wrong base exits 1"
else
	fail "Expected exit 1 for merged PR with wrong base, got $exit_code"
fi

# ── Test 9: Merged PR with wrong merge SHA fails ───────────────────────────────

echo ""
echo "── Test 9: Merged PR with wrong merge SHA fails ──"
T9=$(mktemp -d)
register_temp_dir "$T9"
git_init_test_repo "$T9"
(
	cd "$T9"
	echo "initial" > README.md
	git add README.md
	git commit --quiet -m "Initial commit"
	echo "second" >> README.md
	git add README.md
	git commit --quiet -m "Second commit"
)
wrong_sha_sha=$(cd "$T9" && git rev-parse HEAD)

fake_bin9=$(mktemp -d)
register_temp_dir "$fake_bin9"
fake_gh_setup "$fake_bin9"
fake_log9=$(mktemp)
register_temp_dir "$fake_log9"

# Fixture: merged PR but merge_commit_sha does not match
cat > "$fake_bin9/pulls.json" <<JSON
[
  {
    "merged_at": "2026-07-30T12:00:00Z",
    "base": {"ref": "main"},
    "merge_commit_sha": "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
    "state": "closed",
    "title": "Wrong merge SHA PR"
  }
]
JSON

exit_code=0
run_verifier "$T9" "$fake_bin9" "$fake_log9" \
	GITHUB_EVENT_NAME=push \
	GITHUB_REF=refs/heads/main \
	GITHUB_SHA="$wrong_sha_sha" \
	GITHUB_EVENT_BEFORE=aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa \
	GITHUB_REPOSITORY=testowner/testrepo \
	GH_TOKEN=fake || exit_code=$?

if [ "$exit_code" -eq 1 ]; then
	pass "Merged PR with wrong merge SHA exits 1"
else
	fail "Expected exit 1 for merged PR with wrong merge SHA, got $exit_code"
fi

# ── Test 11: Malformed JSON and repeated API failures fail closed ──────────────

echo ""
echo "── Test 11: Malformed JSON and repeated API failures fail closed ──"
T11=$(mktemp -d)
register_temp_dir "$T11"
git_init_test_repo "$T11"
(
	cd "$T11"
	echo "initial" > README.md
	git add README.md
	git commit --quiet -m "Initial commit"
	echo "second" >> README.md
	git add README.md
	git commit --quiet -m "Second commit"
)
mal_sha=$(cd "$T11" && git rev-parse HEAD)

fake_bin11=$(mktemp -d)
register_temp_dir "$fake_bin11"
fake_gh_setup "$fake_bin11"
fake_log11=$(mktemp)
register_temp_dir "$fake_log11"

# Fixture: malformed JSON
echo 'not json {{{' > "$fake_bin11/pulls.json"

exit_code=0
run_verifier "$T11" "$fake_bin11" "$fake_log11" \
	GITHUB_EVENT_NAME=push \
	GITHUB_REF=refs/heads/main \
	GITHUB_SHA="$mal_sha" \
	GITHUB_EVENT_BEFORE=aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa \
	GITHUB_REPOSITORY=testowner/testrepo \
	GH_TOKEN=fake || exit_code=$?

if [ "$exit_code" -eq 2 ]; then
	pass "Malformed JSON exits 2"
else
	fail "Expected exit 2 for malformed JSON, got $exit_code"
fi

# ── Test 12: Transient API failure followed by success passes within 3 attempts

echo ""
echo "── Test 12: Transient API failure followed by success passes within 3 attempts ──"
T12=$(mktemp -d)
register_temp_dir "$T12"
git_init_test_repo "$T12"
(
	cd "$T12"
	echo "initial" > README.md
	git add README.md
	git commit --quiet -m "Initial commit"
	echo "second" >> README.md
	git add README.md
	git commit --quiet -m "Second commit"
)
retry_sha=$(cd "$T12" && git rev-parse HEAD)

fake_bin12=$(mktemp -d)
register_temp_dir "$fake_bin12"
fake_gh_setup "$fake_bin12"
fake_log12=$(mktemp)
register_temp_dir "$fake_log12"

# Sequence mode: response.1 = failure (triggered by FAKE_GH_FAIL), response.2 = failure, response.3 = success
# We set up pulls.json as success, then use FAKE_GH_FAIL for the first 2 calls
# The sequence file will cause the fake gh to serve response.N.
# For attempts 1-2: FAKE_GH_FAIL causes exit 1. For attempt 3: serve pulls.json.
# We use a trick: set FAKE_GH_FAIL initially, then make response.3 override it.
cat > "$fake_bin12/pulls.json" <<JSON
[
  {
    "merged_at": "2026-07-30T12:00:00Z",
    "base": {"ref": "main"},
    "merge_commit_sha": "$retry_sha",
    "state": "closed",
    "title": "Retry PR"
  }
]
JSON

# response.1 and response.2 = failure (faked by FAKE_GH_FAIL)
# response.3 = the actual success content
cat > "$fake_bin12/response.3" <<JSON
[
  {
    "merged_at": "2026-07-30T12:00:00Z",
    "base": {"ref": "main"},
    "merge_commit_sha": "$retry_sha",
    "state": "closed",
    "title": "Retry PR"
  }
]
JSON

seq_file=$(mktemp)
register_temp_dir "$seq_file"
echo 0 > "$seq_file"
export FAKE_GH_SEQ_FILE="$seq_file"

# For the first 2 attempts we want it to fail. Since FAKE_GH_FAIL causes exit 1
# regardless of response.N content, we set it. The sequence mode will try
# response.1 and response.2 (they don't exist, so it falls through to the failure
# simulation). For response.3, the sequence mode finds the file and outputs it
# before reaching the failure check.
export FAKE_GH_FAIL=1

exit_code=0
run_verifier "$T12" "$fake_bin12" "$fake_log12" \
	GITHUB_EVENT_NAME=push \
	GITHUB_REF=refs/heads/main \
	GITHUB_SHA="$retry_sha" \
	GITHUB_EVENT_BEFORE=aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa \
	GITHUB_REPOSITORY=testowner/testrepo \
	GH_TOKEN=fake || exit_code=$?

unset FAKE_GH_FAIL FAKE_GH_SEQ_FILE

if [ "$exit_code" -eq 0 ]; then
	pass "Transient API failure with retry succeeds"
else
	fail "Expected exit 0 for transient failure + retry, got $exit_code"
fi

print_summary "protected_push_tripwire"


# vim: ft=sh sts=4 sw=4 ts=4 et :
