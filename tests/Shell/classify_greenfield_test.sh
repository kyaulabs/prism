#!/usr/bin/env bash
# $KYAULabs: classify_greenfield_test.sh kyau@cosmos.kyaulabs 2026/08/04 -0700 Exp $


# ── Tests for .github/scripts/classify-greenfield.sh ─────────────────────────
# Exercises the strict-greenfield tri-state predicate (ADR-0050): stdout
# greenfield|established|indeterminate with exit codes 0|1|2. Every case
# asserts both the exit status and the exact stdout token through the public
# CLI interface: bash .github/scripts/classify-greenfield.sh [project-root].

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
source "$REPO_ROOT/tests/Shell/lib/test_helpers.sh"

setup_result_file

SCRIPT="$REPO_ROOT/.github/scripts/classify-greenfield.sh"

# ── Fixture helpers ─────────────────────────────────────────────────────────

# make_greenfield_fixture — build a strict-greenfield scaffold: an unborn git
# repository exposing the real quality-surface scripts via symlink and a copy
# of the valid project manifest. Echoes the fixture root.
make_greenfield_fixture() {
	local root
	root="$(mktemp -d)"
	register_temp_dir "$root"
	git_init_test_repo "$root"
	mkdir -p "$root/.github"
	ln -s "$REPO_ROOT/.github/scripts" "$root/.github/scripts"
	cp "$REPO_ROOT/prism.jsonc" "$root/prism.jsonc"
	printf '%s\n' "$root"
}

# assert_classification <expected_status> <expected_output> <root> — run the
# classifier against <root> and require both the exit status and the stdout.
assert_classification() {
	local expected_status="$1"
	local expected_output="$2"
	local root="$3"
	local output status

	set +e
	output="$(bash "$SCRIPT" "$root" 2>/dev/null)"
	status=$?
	set -e

	[[ "$status" -eq "$expected_status" && "$output" == "$expected_output" ]]
}

# ── Test 1: baseline greenfield fixture ─────────────────────────────────────

test_baseline_greenfield() {
	local root
	root="$(make_greenfield_fixture)"

	if assert_classification 0 greenfield "$root"; then
		pass "baseline greenfield — 0 greenfield"
	else
		fail "baseline greenfield — expected status 0 and stdout 'greenfield'"
	fi
}

echo ""
echo "── Test 1: baseline greenfield → 0 greenfield ──"
test_baseline_greenfield

# ── Tests 2-5: each forbidden doc path ──────────────────────────────────────

test_forbidden_context_md() {
	local root
	root="$(make_greenfield_fixture)"
	printf 'context\n' > "$root/CONTEXT.md"

	if assert_classification 1 established "$root"; then
		pass "CONTEXT.md present — 1 established"
	else
		fail "CONTEXT.md present — expected status 1 and stdout 'established'"
	fi
}

echo ""
echo "── Test 2: forbidden doc path CONTEXT.md → 1 established ──"
test_forbidden_context_md

test_forbidden_docs_plans() {
	local root
	root="$(make_greenfield_fixture)"
	mkdir -p "$root/docs/plans"

	if assert_classification 1 established "$root"; then
		pass "docs/plans present — 1 established"
	else
		fail "docs/plans present — expected status 1 and stdout 'established'"
	fi
}

echo ""
echo "── Test 3: forbidden doc path docs/plans → 1 established ──"
test_forbidden_docs_plans

test_forbidden_docs_specs() {
	local root
	root="$(make_greenfield_fixture)"
	mkdir -p "$root/docs/specs"

	if assert_classification 1 established "$root"; then
		pass "docs/specs present — 1 established"
	else
		fail "docs/specs present — expected status 1 and stdout 'established'"
	fi
}

echo ""
echo "── Test 4: forbidden doc path docs/specs → 1 established ──"
test_forbidden_docs_specs

test_forbidden_adr() {
	local root
	root="$(make_greenfield_fixture)"
	mkdir -p "$root/adr"

	if assert_classification 1 established "$root"; then
		pass "adr present — 1 established"
	else
		fail "adr present — expected status 1 and stdout 'established'"
	fi
}

echo ""
echo "── Test 5: forbidden doc path adr → 1 established ──"
test_forbidden_adr

# ── Tests 6-8: each forbidden source root ───────────────────────────────────

test_forbidden_backend() {
	local root
	root="$(make_greenfield_fixture)"
	mkdir -p "$root/backend"

	if assert_classification 1 established "$root"; then
		pass "backend present — 1 established"
	else
		fail "backend present — expected status 1 and stdout 'established'"
	fi
}

echo ""
echo "── Test 6: forbidden source root backend → 1 established ──"
test_forbidden_backend

test_forbidden_cdn() {
	local root
	root="$(make_greenfield_fixture)"
	mkdir -p "$root/cdn"

	if assert_classification 1 established "$root"; then
		pass "cdn present — 1 established"
	else
		fail "cdn present — expected status 1 and stdout 'established'"
	fi
}

echo ""
echo "── Test 7: forbidden source root cdn → 1 established ──"
test_forbidden_cdn

test_forbidden_aurora() {
	local root
	root="$(make_greenfield_fixture)"
	mkdir -p "$root/aurora"

	if assert_classification 1 established "$root"; then
		pass "aurora present — 1 established"
	else
		fail "aurora present — expected status 1 and stdout 'established'"
	fi
}

echo ""
echo "── Test 8: forbidden source root aurora → 1 established ──"
test_forbidden_aurora

# ── Test 9: app webroot present ─────────────────────────────────────────────

test_app_webroot() {
	local root app
	root="$(make_greenfield_fixture)"
	app="$(php "$REPO_ROOT/.github/scripts/prism_manifest.php" get "$root/prism.jsonc" - app)"
	mkdir -p "$root/$app"

	if assert_classification 1 established "$root"; then
		pass "app webroot present — 1 established"
	else
		fail "app webroot present — expected status 1 and stdout 'established'"
	fi
}

echo ""
echo "── Test 9: app webroot → 1 established ──"
test_app_webroot

# ── Test 10: repository with one commit ─────────────────────────────────────

test_one_commit() {
	local root
	root="$(make_greenfield_fixture)"
	printf 'seed\n' > "$root/README.md"
	git -C "$root" add README.md
	git -C "$root" commit -q -m "seed commit"

	if assert_classification 1 established "$root"; then
		pass "one commit — 1 established"
	else
		fail "one commit — expected status 1 and stdout 'established'"
	fi
}

echo ""
echo "── Test 10: one commit → 1 established ──"
test_one_commit

# ── Test 11: missing quality-surface manifest ───────────────────────────────

test_missing_quality_manifest() {
	local root
	root="$(make_greenfield_fixture)"
	# Remove the fixture's symlink only — never the real scripts directory.
	rm -f "$root/.github/scripts"

	if assert_classification 2 indeterminate "$root"; then
		pass "missing quality manifest — 2 indeterminate"
	else
		fail "missing quality manifest — expected status 2 and stdout 'indeterminate'"
	fi
}

echo ""
echo "── Test 11: missing quality manifest → 2 indeterminate ──"
test_missing_quality_manifest

# ── Test 12: directory that is not a Git worktree ───────────────────────────

test_non_git_directory() {
	local root
	root="$(make_greenfield_fixture)"
	rm -rf "$root/.git"

	if assert_classification 2 indeterminate "$root"; then
		pass "non-Git directory — 2 indeterminate"
	else
		fail "non-Git directory — expected status 2 and stdout 'indeterminate'"
	fi
}

echo ""
echo "── Test 12: non-Git directory → 2 indeterminate ──"
test_non_git_directory

# ── Test 13: missing project manifest ───────────────────────────────────────

test_missing_project_manifest() {
	local root
	root="$(make_greenfield_fixture)"
	rm -f "$root/prism.jsonc"

	if assert_classification 2 indeterminate "$root"; then
		pass "missing project manifest — 2 indeterminate"
	else
		fail "missing project manifest — expected status 2 and stdout 'indeterminate'"
	fi
}

echo ""
echo "── Test 13: missing project manifest → 2 indeterminate ──"
test_missing_project_manifest

# ── Test 14: malformed project manifest ─────────────────────────────────────

test_malformed_project_manifest() {
	local root
	root="$(make_greenfield_fixture)"
	printf '{ "setup_version": 6, "broken": ' > "$root/prism.jsonc"

	if assert_classification 2 indeterminate "$root"; then
		pass "malformed project manifest — 2 indeterminate"
	else
		fail "malformed project manifest — expected status 2 and stdout 'indeterminate'"
	fi
}

echo ""
echo "── Test 14: malformed project manifest → 2 indeterminate ──"
test_malformed_project_manifest

# ── Test 15: project manifest without an app value ──────────────────────────

test_missing_app_value() {
	local root
	root="$(make_greenfield_fixture)"
	# Valid schema-v6 manifest with every required field except `app`.
	cat > "$root/prism.jsonc" <<'MANIFEST'
{
  "setup_version": 6,
  "configured": true,
  "timestamp": "2026-08-03T00:00:00Z",
  "domain": "example.com",
  "repo": "testowner/testrepo",
  "signed_off_by_name": "tester",
  "signed_off_by_email": "tester@example.com",
  "accent": "sky-blue",
  "scaffold_mode": "skip",
  "project_folder": null,
  "models": {
    "primary": "test/model-p",
    "planner": "test/model-pl",
    "design": "test/model-d",
    "judge": "test/model-j",
    "utility": "test/model-u",
    "frontend": "test/model-f"
  },
  "variants": {
    "primary": "medium",
    "planner": "medium",
    "design": "medium",
    "judge": "medium",
    "utility": "medium",
    "frontend": "medium"
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
MANIFEST

	if assert_classification 2 indeterminate "$root"; then
		pass "missing app value — 2 indeterminate"
	else
		fail "missing app value — expected status 2 and stdout 'indeterminate'"
	fi
}

echo ""
echo "── Test 15: missing app value → 2 indeterminate ──"
test_missing_app_value

# ── Test 16: the real Prism repository ──────────────────────────────────────

test_real_prism_repository() {
	if assert_classification 1 established "$REPO_ROOT"; then
		pass "real Prism repository — 1 established"
	else
		fail "real Prism repository — expected status 1 and stdout 'established'"
	fi
}

echo ""
echo "── Test 16: real Prism repository → 1 established ──"
test_real_prism_repository

# ── Summary ─────────────────────────────────────────────────────────────────

print_summary "classify greenfield"
exit $?


# vim: ft=sh sts=4 sw=4 ts=4 et :
