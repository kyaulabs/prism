#!/usr/bin/env bash
# $KYAULabs: commit-msg_test.sh kyau@cosmos.kyaulabs 2026/07/27 -0700 Exp $










# ── Tests for commit-msg hook ───────────────────────────────────────────────
# Covers:
#   - Guard: fail-closed when commitlint is not installed (ADR-0025).
#     CI enforces commitlint on every PR; local parity requires it here too.
#   - Merge/revert exemption + regression tests (added in Task 2).

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
source "$REPO_ROOT/tests/Shell/lib/test_helpers.sh"

setup_result_file

# shellcheck disable=SC2317,SC2329  # used in tests that skip when commitlint absent
skip() { echo "  ${YELLOW}SKIP${RESET} $*"; }
REAL_HOOK="$REPO_ROOT/.github/hooks/commit-msg"

if [ ! -f "$REAL_HOOK" ]; then
	fail "Cannot find commit-msg at $REAL_HOOK"
	exit 1
fi

# Commitlint-dependent tests skip (with notice) when commitlint is absent,
# mirroring the hook's own guard. CI always has node_modules installed.
# shellcheck disable=SC2034  # used in Task 2 (merge/revert exemption)
COMMITLINT_AVAILABLE=$([ -d "$REPO_ROOT/node_modules/commitlint" ] && echo true || echo false)

# ── Test 1: Guard skips with notice when commitlint absent ───────────────────
# A stub `npx` is placed first on PATH so the unguarded hook (before the fix)
# fails fast without a network fetch. After the fix, the guard fires before
# npx is ever reached.

echo ""
echo "── Test 1: Guard fails closed when commitlint not installed ──"
T1=$(mktemp -d)
register_temp_dir "$T1"
(
	cd "$T1"
	# Stub npx: exits non-zero with a known message. Only reached if the
	# hook lacks a guard (the pre-fix state).
	mkdir -p "$T1/bin"
	cat > "$T1/bin/npx" <<'STUB'
#!/usr/bin/env bash
echo "stub-npx: commitlint not available" >&2
exit 1
STUB
	chmod +x "$T1/bin/npx"

	# Sample valid commit message (content irrelevant — guard fires first)
	printf 'feat: test\n\nAuthored-by: x\nImplemented-by: x\nTested-by: x\nSigned-off-by: x <x@x>\n' > msg

	set +e
	output=$(PATH="$T1/bin:$PATH" "$REAL_HOOK" msg 2>&1)
	ret=$?
	set -e

	if [ "$ret" -eq 1 ] && echo "$output" | grep -qi "commitlint is not installed"; then
		pass "Guard fails closed when commitlint absent (exit 1)"
	else
		fail "Guard did not fail closed (exit=$ret): $output"
	fi
)

# ── Test 2: Merge commit passes the hook (commitlint required) ───────────────

echo ""
echo "── Test 2: Merge commit (--no-ff) passes ──"
if [ "$COMMITLINT_AVAILABLE" = false ]; then
	skip "Test 2 (merge) — commitlint not installed"
else
T2=$(mktemp -d)
register_temp_dir "$T2"
(
	cd "$T2"
	git_init_test_repo "$T2"
	# Expose commitlint + config to the hook (which checks ./node_modules/commitlint)
	ln -s "$REPO_ROOT/node_modules" "$T2/node_modules"
	cp "$REPO_ROOT/commitlint.config.js" "$T2/commitlint.config.js"
	cp "$REAL_HOOK" .git/hooks/commit-msg
	chmod +x .git/hooks/commit-msg

	VALID=$'feat: base commit\n\nAuthored-by: x\nImplemented-by: x\nTested-by: x\nSigned-off-by: x <x@x>'
	echo a > a; git add a; git commit -q -m "$VALID"
	git checkout -q -b feature
	echo b > b; git add b; git commit -q -m "$VALID"
	git checkout -q main 2>/dev/null || git checkout -q master

	set +e
	output=$(git merge --no-ff feature -m "Merge branch 'feature'" 2>&1)
	ret=$?
	set -e

	if [ "$ret" -eq 0 ]; then
		pass "Merge commit (--no-ff) passes the hook"
	else
		fail "Merge commit blocked (exit=$ret): $output"
	fi
)
fi

# ── Test 3: Revert commit passes the hook (commitlint required) ───────────────

echo "── Test 3: Revert commit passes ──"
if [ "$COMMITLINT_AVAILABLE" = false ]; then
	skip "Test 3 (revert) — commitlint not installed"
else
T3=$(mktemp -d)
register_temp_dir "$T3"
(
	cd "$T3"
	git_init_test_repo "$T3"
	ln -s "$REPO_ROOT/node_modules" "$T3/node_modules"
	cp "$REPO_ROOT/commitlint.config.js" "$T3/commitlint.config.js"
	cp "$REAL_HOOK" .git/hooks/commit-msg
	chmod +x .git/hooks/commit-msg

	VALID=$'feat: original\n\nAuthored-by: x\nImplemented-by: x\nTested-by: x\nSigned-off-by: x <x@x>'
	echo a > a; git add a; git commit -q -m "$VALID"
	TARGET=$(git rev-parse HEAD)

	set +e
	output=$(git revert --no-edit "$TARGET" 2>&1)
	ret=$?
	set -e

	if [ "$ret" -eq 0 ]; then
		pass "Revert commit passes the hook"
	else
		fail "Revert commit blocked (exit=$ret): $output"
	fi
)
fi

# ── Test 4: Regression — missing trailers still fails (commitlint required) ──

echo "── Test 4: Missing trailers still fails ──"
if [ "$COMMITLINT_AVAILABLE" = false ]; then
	skip "Test 4 (missing-trailers regression) — commitlint not installed"
else
T4=$(mktemp -d)
register_temp_dir "$T4"
(
	cd "$T4"
	git_init_test_repo "$T4"
	ln -s "$REPO_ROOT/node_modules" "$T4/node_modules"
	cp "$REPO_ROOT/commitlint.config.js" "$T4/commitlint.config.js"
	cp "$REAL_HOOK" .git/hooks/commit-msg
	chmod +x .git/hooks/commit-msg

	echo a > a; git add a
	set +e
	output=$(git commit -q -m "feat: no trailers here" 2>&1)
	ret=$?
	set -e

	if [ "$ret" -ne 0 ]; then
		pass "Missing trailers rejected (exit=$ret)"
	else
		fail "Missing trailers allowed — enforcement broken"
	fi
)
fi

# ── Test 5: Regression — valid commit with all trailers passes ───────────────

echo "── Test 5: Valid commit with trailers passes ──"
if [ "$COMMITLINT_AVAILABLE" = false ]; then
	skip "Test 5 (valid-commit regression) — commitlint not installed"
else
T5=$(mktemp -d)
register_temp_dir "$T5"
(
	cd "$T5"
	git_init_test_repo "$T5"
	ln -s "$REPO_ROOT/node_modules" "$T5/node_modules"
	cp "$REPO_ROOT/commitlint.config.js" "$T5/commitlint.config.js"
	cp "$REAL_HOOK" .git/hooks/commit-msg
	chmod +x .git/hooks/commit-msg

	VALID=$'feat: valid commit\n\nAuthored-by: x\nImplemented-by: x\nTested-by: x\nSigned-off-by: x <x@x>'
	echo a > a; git add a
	set +e
	output=$(git commit -q -m "$VALID" 2>&1)
	ret=$?
	set -e

	if [ "$ret" -eq 0 ]; then
		pass "Valid commit with trailers passes"
	else
		fail "Valid commit blocked (exit=$ret): $output"
	fi
)
fi

# ── Test 6: Plugin exemption exercises on non-standard merge header ──────────
# commitlint's built-in isIgnored() matches ^Merge branch but NOT
# ^Merge pull request. This ensures our plugin exemption (not just
# isIgnored) actually handles merge detection for the header fallback path.

echo "── Test 6: Plugin exemption on non-standard merge header ──"
if [ "$COMMITLINT_AVAILABLE" = false ]; then
	skip "Test 6 (plugin-exemption exercise) — commitlint not installed"
else
T6=$(mktemp -d)
register_temp_dir "$T6"
(
	cd "$T6"
	git_init_test_repo "$T6"
	ln -s "$REPO_ROOT/node_modules" "$T6/node_modules"
	cp "$REPO_ROOT/commitlint.config.js" "$T6/commitlint.config.js"

	# Non-standard merge message — does NOT match isIgnored's ^Merge branch
	# pattern, so commitlint evaluates our trailersExist rule. Our rule
	# detects the /^Merge / header and returns pass.
	printf 'Merge pull request #42 from feature/branch\n\nThis change integrates the feature branch.\n' > msg

	set +e
	output=$(npx commitlint --edit msg 2>&1)
	ret=$?
	set -e

	if [ "$ret" -eq 0 ]; then
		pass "Plugin exempts non-standard merge header"
	else
		fail "Plugin did not exempt merge header (exit=$ret): $output"
	fi
)
fi

# ── Test 7: Reject Closes #NN (banned closing keyword) ───────────────────────

echo ""
echo "── Test 7: Closes #NN rejected ──"
if [ "$COMMITLINT_AVAILABLE" = false ]; then
	skip "Test 7 (banned Closes) — commitlint not installed"
else
(
	MSG=$(mktemp)
	printf 'fix(db): sqli in search\n\nCloses #40\nAuthored-by: x\nImplemented-by: x\nTested-by: x\nSigned-off-by: x <x@x>\n' > "$MSG"
	cd "$REPO_ROOT"
	set +e
	output=$(npx commitlint --edit "$MSG" 2>&1)
	ret=$?
	set -e
	rm -f "$MSG"
	if [ "$ret" -ne 0 ]; then
		pass "Test 7: Closes #40 rejected (banned keyword)"
	else
		fail "Test 7: Closes #40 accepted (should be banned) (exit=$ret): $output"
	fi
)
fi

# ── Test 8: Reject Resolve: #NN (banned closing keyword) ─────────────────────

echo "── Test 8: Resolve: #NN rejected ──"
if [ "$COMMITLINT_AVAILABLE" = false ]; then
	skip "Test 8 (banned Resolve) — commitlint not installed"
else
(
	MSG=$(mktemp)
	printf 'fix(db): sqli in search\n\nResolve: #50\nAuthored-by: x\nImplemented-by: x\nTested-by: x\nSigned-off-by: x <x@x>\n' > "$MSG"
	cd "$REPO_ROOT"
	set +e
	output=$(npx commitlint --edit "$MSG" 2>&1)
	ret=$?
	set -e
	rm -f "$MSG"
	if [ "$ret" -ne 0 ]; then
		pass "Test 8: Resolve: #50 rejected (banned keyword)"
	else
		fail "Test 8: Resolve: #50 accepted (should be banned) (exit=$ret): $output"
	fi
)
fi

# ── Test 9: Reject Fixes #42 (no colon) ───────────────────────────────────────

echo "── Test 9: Fixes #42 (no colon) rejected ──"
if [ "$COMMITLINT_AVAILABLE" = false ]; then
	skip "Test 9 (no colon) — commitlint not installed"
else
(
	MSG=$(mktemp)
	printf 'fix(db): sqli in search\n\nFixes #42\nAuthored-by: x\nImplemented-by: x\nTested-by: x\nSigned-off-by: x <x@x>\n' > "$MSG"
	cd "$REPO_ROOT"
	set +e
	output=$(npx commitlint --edit "$MSG" 2>&1)
	ret=$?
	set -e
	rm -f "$MSG"
	if [ "$ret" -ne 0 ]; then
		pass "Test 9: Fixes #42 (no colon) rejected"
	else
		fail "Test 9: Fixes #42 (no colon) accepted (should be rejected) (exit=$ret): $output"
	fi
)
fi

# ── Test 10: Reject fixes: #42 (lowercase keyword) ────────────────────────────

echo "── Test 10: fixes: #42 (lowercase) rejected ──"
if [ "$COMMITLINT_AVAILABLE" = false ]; then
	skip "Test 10 (lowercase) — commitlint not installed"
else
(
	MSG=$(mktemp)
	printf 'fix(db): sqli in search\n\nfixes: #42\nAuthored-by: x\nImplemented-by: x\nTested-by: x\nSigned-off-by: x <x@x>\n' > "$MSG"
	cd "$REPO_ROOT"
	set +e
	output=$(npx commitlint --edit "$MSG" 2>&1)
	ret=$?
	set -e
	rm -f "$MSG"
	if [ "$ret" -ne 0 ]; then
		pass "Test 10: fixes: #42 (lowercase) rejected"
	else
		fail "Test 10: fixes: #42 (lowercase) accepted (should be rejected) (exit=$ret): $output"
	fi
)
fi

# ── Test 11: Reject Fixes: placed after Authored-by: (placement) ───────────────────

echo "── Test 11: Fixes: after Authored-by: rejected ──"
if [ "$COMMITLINT_AVAILABLE" = false ]; then
	skip "Test 11 (placement) — commitlint not installed"
else
(
	MSG=$(mktemp)
	printf 'fix(db): sqli in search\n\nAuthored-by: x\nImplemented-by: x\nTested-by: x\nSigned-off-by: x <x@x>\nFixes: #42\n' > "$MSG"
	cd "$REPO_ROOT"
	set +e
	output=$(npx commitlint --edit "$MSG" 2>&1)
	ret=$?
	set -e
	rm -f "$MSG"
	if [ "$ret" -ne 0 ]; then
		pass "Test 11: Fixes: after Authored-by: rejected (placement)"
	else
		fail "Test 11: Fixes: after Authored-by: accepted (should be rejected) (exit=$ret): $output"
	fi
)
fi

# ── Test 12: Accept Fixes: #NN at top of footer (green path) ───────────────────

echo "── Test 12: Fixes: at top of footer accepted ──"
if [ "$COMMITLINT_AVAILABLE" = false ]; then
	skip "Test 12 (green Fixes) — commitlint not installed"
else
(
	MSG=$(mktemp)
	printf 'fix(db): sqli in search\n\nFixes: #42\nAuthored-by: x\nImplemented-by: x\nTested-by: x\nSigned-off-by: x <x@x>\n' > "$MSG"
	cd "$REPO_ROOT"
	set +e
	output=$(npx commitlint --edit "$MSG" 2>&1)
	ret=$?
	set -e
	rm -f "$MSG"
	if [ "$ret" -eq 0 ]; then
		pass "Test 12: Fixes: #42 at top of footer accepted"
	else
		fail "Test 12: Fixes: #42 at top rejected (exit=$ret): $output"
	fi
)
fi

# ── Test 13: Accept Refs: #NN at top of footer (non-closing reference) ────────

echo "── Test 13: Refs: at top of footer accepted ──"
if [ "$COMMITLINT_AVAILABLE" = false ]; then
	skip "Test 13 (green Refs) — commitlint not installed"
else
(
	MSG=$(mktemp)
	printf 'feat(db): add index\n\nRefs: #123\nAuthored-by: x\nImplemented-by: x\nTested-by: x\nSigned-off-by: x <x@x>\n' > "$MSG"
	cd "$REPO_ROOT"
	set +e
	output=$(npx commitlint --edit "$MSG" 2>&1)
	ret=$?
	set -e
	rm -f "$MSG"
	if [ "$ret" -eq 0 ]; then
		pass "Test 13: Refs: #123 at top of footer accepted"
	else
		fail "Test 13: Refs: #123 at top rejected (exit=$ret): $output"
	fi
)
fi

# ── Test 14: Reject Fix #42 (banned keyword, Sentence-case, no colon) ──────────

echo "── Test 14: Fix #42 rejected ──"
if [ "$COMMITLINT_AVAILABLE" = false ]; then
	skip "Test 14 (banned Fix) — commitlint not installed"
else
(
	MSG=$(mktemp)
	printf 'fix(db): sqli in search\n\nFix #42\nAuthored-by: x\nImplemented-by: x\nTested-by: x\nSigned-off-by: x <x@x>\n' > "$MSG"
	cd "$REPO_ROOT"
	set +e
	output=$(npx commitlint --edit "$MSG" 2>&1)
	ret=$?
	set -e
	rm -f "$MSG"
	if [ "$ret" -ne 0 ]; then
		pass "Test 14: Fix #42 rejected (banned keyword)"
	else
		fail "Test 14: Fix #42 accepted (should be banned) (exit=$ret): $output"
	fi
)
fi

# ── Test 15: Body prose with keyword not falsely rejected ($ anchor guard) ─────

echo "── Test 15: Body prose Fix #NN passes ──"
if [ "$COMMITLINT_AVAILABLE" = false ]; then
	skip "Test 15 (body prose) — commitlint not installed"
else
(
	MSG=$(mktemp)
	printf 'fix(db): sqli in search\n\nFix #42 was the hardest part of this refactor.\n\nAuthored-by: x\nImplemented-by: x\nTested-by: x\nSigned-off-by: x <x@x>\n' > "$MSG"
	cd "$REPO_ROOT"
	set +e
	output=$(npx commitlint --edit "$MSG" 2>&1)
	ret=$?
	set -e
	rm -f "$MSG"
	if [ "$ret" -eq 0 ]; then
		pass "Test 15: body prose 'Fix #42 was the hardest...' not falsely rejected"
	else
		fail "Test 15: body prose falsely rejected (exit=$ret): $output"
	fi
)
fi

# ── Test 16: Reject messages missing Implemented-by: trailer ──────────────

echo "── Test 16: Missing Implemented-by rejected ──"
if [ "$COMMITLINT_AVAILABLE" = false ]; then
	skip "Test 16 (missing Implemented-by) — commitlint not installed"
else
(
	MSG=$(mktemp)
	printf 'feat: missing impl\n\nAuthored-by: x\nTested-by: x\nSigned-off-by: x <x@x>\n' > "$MSG"
	cd "$REPO_ROOT"
	set +e
	output=$(npx commitlint --edit "$MSG" 2>&1)
	ret=$?
	set -e
	rm -f "$MSG"
	if [ "$ret" -ne 0 ]; then
		pass "Test 16: missing Implemented-by rejected"
	else
		fail "Test 16: missing Implemented-by accepted (should be rejected) (exit=$ret): $output"
	fi
)
fi

# ── Summary ────────────────────────────────────────────────────────────

print_summary "commit-msg_test.sh"
exit $?


# vim: ft=sh sts=4 sw=4 ts=4 et :
