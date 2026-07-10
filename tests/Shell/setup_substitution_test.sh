#!/usr/bin/env bash
# $KYAULabs: setup_substitution_test.sh kyau@nova 2026/07/09 -0700 Exp $


# ── Tests for setup-substitute.sh identity/token substitution ────────────────
# Verifies that the substitution script correctly replaces template default
# identity tokens with user-provided values, with correct longest-match-first
# ordering to prevent partial replacement.

set -euo pipefail

RESULT_FILE=$(mktemp)
trap 'rm -f "$RESULT_FILE"' EXIT

RED=$'\033[1;31m'
GREEN=$'\033[1;32m'
RESET=$'\033[0m'

pass() { echo "${GREEN}PASS${RESET} $*"; echo "PASS" >> "$RESULT_FILE"; }
fail() { echo "${RED}FAIL${RESET} $*" >&2; echo "FAIL" >> "$RESULT_FILE"; }

# ── Resolve paths BEFORE any cd ────────────────────────────────────────────────

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
SCRIPT="$REPO_ROOT/.github/scripts/setup-substitute.sh"

if [ ! -f "$SCRIPT" ]; then
	fail "Cannot find setup-substitute.sh at $SCRIPT"
	exit 1
fi

# Test values
T_NAME="Test User"
T_EMAIL="test@example.org"
T_APP="myapp"
T_DOMAIN="example.org"
T_ORG="myorg"
T_REPO="myrepo"

# ── Test 1: Composite identity replacement ──────────────────────────────────

echo ""
echo "── Test 1: Composite identity (kyau <git@kyaulabs.com>) replaced ──"
T1=$(mktemp -d)
(
	cd "$T1"
	printf 'Signed-off-by: kyau <git@kyaulabs.com>\n' > file.md
	bash "$SCRIPT" file.md "$T_NAME" "$T_EMAIL" "$T_APP" "$T_DOMAIN" "$T_ORG" "$T_REPO"
	result=$(cat file.md)
	expected="Signed-off-by: ${T_NAME} <${T_EMAIL}>"
	if [ "$result" = "$expected" ]; then
		pass "composite identity replaced correctly"
	else
		fail "expected: $expected, got: $result"
	fi
)
rm -rf "$T1"

# ── Test 2: Abuse contact replacement ────────────────────────────────────────

echo ""
echo "── Test 2: Abuse contact (git+abuse@kyaulabs.com) replaced ──"
T2=$(mktemp -d)
(
	cd "$T2"
	printf 'Contact: git+abuse@kyaulabs.com for issues.\n' > file.md
	bash "$SCRIPT" file.md "$T_NAME" "$T_EMAIL" "$T_APP" "$T_DOMAIN" "$T_ORG" "$T_REPO"
	result=$(cat file.md)
	expected="Contact: abuse@${T_DOMAIN} for issues."
	if [ "$result" = "$expected" ]; then
		pass "abuse contact replaced correctly"
	else
		fail "expected: $expected, got: $result"
	fi
)
rm -rf "$T2"

# ── Test 3: Bare email replacement ──────────────────────────────────────────

echo ""
echo "── Test 3: Bare email (git@kyaulabs.com) replaced ──"
T3=$(mktemp -d)
(
	cd "$T3"
	printf 'Email git@kyaulabs.com for details.\n' > file.md
	bash "$SCRIPT" file.md "$T_NAME" "$T_EMAIL" "$T_APP" "$T_DOMAIN" "$T_ORG" "$T_REPO"
	result=$(cat file.md)
	expected="Email ${T_EMAIL} for details."
	if [ "$result" = "$expected" ]; then
		pass "bare email replaced correctly"
	else
		fail "expected: $expected, got: $result"
	fi
)
rm -rf "$T3"

# ── Test 4: GitHub org/repo replacement ──────────────────────────────────────

echo ""
echo "── Test 4: GitHub org/repo (kyaulabs/template) replaced ──"
T4=$(mktemp -d)
(
	cd "$T4"
	printf 'Repo: kyaulabs/template\n' > file.md
	bash "$SCRIPT" file.md "$T_NAME" "$T_EMAIL" "$T_APP" "$T_DOMAIN" "$T_ORG" "$T_REPO"
	result=$(cat file.md)
	expected="Repo: ${T_ORG}/${T_REPO}"
	if [ "$result" = "$expected" ]; then
		pass "GitHub org/repo replaced correctly"
	else
		fail "expected: $expected, got: $result"
	fi
)
rm -rf "$T4"

# ── Test 5: App name placeholder replacement ────────────────────────────────

echo ""
echo "── Test 5: App name (<app>) replaced ──"
T5=$(mktemp -d)
(
	cd "$T5"
	printf 'Webroot: <app>\n' > file.md
	bash "$SCRIPT" file.md "$T_NAME" "$T_EMAIL" "$T_APP" "$T_DOMAIN" "$T_ORG" "$T_REPO"
	result=$(cat file.md)
	expected="Webroot: ${T_APP}"
	if [ "$result" = "$expected" ]; then
		pass "app name placeholder replaced correctly"
	else
		fail "expected: $expected, got: $result"
	fi
)
rm -rf "$T5"

# ── Test 6: Domain placeholder replacement ───────────────────────────────────

echo ""
echo "── Test 6: Domain (<domain>) replaced ──"
T6=$(mktemp -d)
(
	cd "$T6"
	printf 'Server: <domain>\n' > file.md
	bash "$SCRIPT" file.md "$T_NAME" "$T_EMAIL" "$T_APP" "$T_DOMAIN" "$T_ORG" "$T_REPO"
	result=$(cat file.md)
	expected="Server: ${T_DOMAIN}"
	if [ "$result" = "$expected" ]; then
		pass "domain placeholder replaced correctly"
	else
		fail "expected: $expected, got: $result"
	fi
)
rm -rf "$T6"

# ── Test 7: Username placeholder replacement ─────────────────────────────────

echo ""
echo "── Test 7: Username (<username>) replaced ──"
T7=$(mktemp -d)
(
	cd "$T7"
	printf 'Branch: feat/<username>-abc123-desc\n' > file.md
	bash "$SCRIPT" file.md "$T_NAME" "$T_EMAIL" "$T_APP" "$T_DOMAIN" "$T_ORG" "$T_REPO"
	result=$(cat file.md)
	expected="Branch: feat/${T_NAME}-abc123-desc"
	if [ "$result" = "$expected" ]; then
		pass "username placeholder replaced correctly"
	else
		fail "expected: $expected, got: $result"
	fi
)
rm -rf "$T7"

# ── Test 8: Ordering — composite fires before bare email ────────────────────

echo ""
echo "── Test 8: Ordering — composite identity not partially replaced ──"
T8=$(mktemp -d)
(
	cd "$T8"
	# File with BOTH composite identity and bare email on different lines
	printf 'Signed-off-by: kyau <git@kyaulabs.com>\nEmail: git@kyaulabs.com\n' > file.md
	bash "$SCRIPT" file.md "$T_NAME" "$T_EMAIL" "$T_APP" "$T_DOMAIN" "$T_ORG" "$T_REPO"
	line1=$(sed -n '1p' file.md)
	line2=$(sed -n '2p' file.md)
	exp1="Signed-off-by: ${T_NAME} <${T_EMAIL}>"
	exp2="Email: ${T_EMAIL}"
	if [ "$line1" = "$exp1" ] && [ "$line2" = "$exp2" ]; then
		pass "ordering correct — composite fully replaced, bare email caught separately"
	else
		fail "line1 expected: $exp1 got: $line1; line2 expected: $exp2 got: $line2"
	fi
)
rm -rf "$T8"

# ── Test 9: Multiple tokens in one file ──────────────────────────────────────

echo ""
echo "── Test 9: Multiple tokens in one file all replaced ──"
T9=$(mktemp -d)
(
	cd "$T9"
	cat > file.md <<EOF
# Project: <app>
Domain: <domain>
Repo: kyaulabs/template
Author: kyau <git@kyaulabs.com>
Abuse: git+abuse@kyaulabs.com
Branch: feat/<username>-hash
EOF
	bash "$SCRIPT" file.md "$T_NAME" "$T_EMAIL" "$T_APP" "$T_DOMAIN" "$T_ORG" "$T_REPO"
	# Verify NO old identity strings remain
	if grep -qF 'kyau <git@kyaulabs.com>' file.md; then
		fail "composite identity still present after substitution"
	elif grep -qF 'git+abuse@kyaulabs.com' file.md; then
		fail "abuse contact still present after substitution"
	elif grep -qF 'git@kyaulabs.com' file.md; then
		fail "bare email still present after substitution"
	elif grep -qF 'kyaulabs/template' file.md; then
		fail "GitHub org/repo still present after substitution"
	elif grep -qF '<app>' file.md; then
		fail "app placeholder still present after substitution"
	elif grep -qF '<domain>' file.md; then
		fail "domain placeholder still present after substitution"
	elif grep -qF '<username>' file.md; then
		fail "username placeholder still present after substitution"
	else
		pass "all tokens replaced, no old identity strings remain"
	fi
)
rm -rf "$T9"

# ── Test 10: Post-run verification grep pattern ──────────────────────────────

echo ""
echo "── Test 10: Post-run verification grep excludes LICENSE/NOTICE ──"
T10=$(mktemp -d)
(
	cd "$T10"
	# Create files with old identity
	printf 'Signed-off-by: kyau <git@kyaulabs.com>\n' > swept.md
	printf 'Copyright (C) 2026 kyau <git@kyaulabs.com>\n' > LICENSE
	printf 'Copyright (C) 2026 kyau <git@kyaulabs.com>\n' > NOTICE
	bash "$SCRIPT" swept.md "$T_NAME" "$T_EMAIL" "$T_APP" "$T_DOMAIN" "$T_ORG" "$T_REPO"
	# Post-run grep: should find old identity ONLY in LICENSE and NOTICE
	remaining=$(grep -rnF 'kyau <git@kyaulabs.com>' . --exclude=LICENSE --exclude=NOTICE 2>/dev/null || true)
	if [ -z "$remaining" ]; then
		pass "post-run grep clean — old identity only in LICENSE/NOTICE"
	else
		fail "old identity found outside LICENSE/NOTICE: $remaining"
	fi
	# Verify LICENSE and NOTICE still have the old identity (not swept)
	if grep -qF 'kyau <git@kyaulabs.com>' LICENSE && grep -qF 'kyau <git@kyaulabs.com>' NOTICE; then
		pass "LICENSE and NOTICE correctly preserved"
	else
		fail "LICENSE or NOTICE was incorrectly modified"
	fi
)
rm -rf "$T10"

# ── Test 11: runs under BSD-style sed (no GNU -i) ─────────────────────────────

test_runs_under_bsd_sed() {
	local tmp_bin
	tmp_bin=$(mktemp -d)

	# BSD-emulating sed: error if -i given without a backup-extension arg.
	cat > "$tmp_bin/sed" <<'SHIM'
#!/usr/bin/env bash
prev=""
for a in "$@"; do
    if [ "$prev" = "-i" ]; then
        case "$a" in
            s*|y*) echo "sed: -i requires a backup extension (BSD)" >&2; exit 1 ;;
        esac
    fi
    prev="$a"
done
exec /usr/bin/sed "$@"
SHIM
	chmod +x "$tmp_bin/sed"

	local f
	f=$(mktemp -d)/file.md
	printf 'kyau <git@kyaulabs.com>\n' > "$f"

	PATH="$tmp_bin:$PATH" bash "$SCRIPT" "$f" "Jane" "jane@example.com" "org" "repo" "myapp" "example.com" "Jane" >/dev/null 2>&1
	local rc=$?
	if [ "$rc" -ne 0 ]; then
		fail "script failed under BSD sed (rc=$rc)"
		return 1
	fi
	pass "runs under BSD sed"
}

echo ""
echo "── Test 11: runs under BSD-style sed (no GNU -i) ──"
test_runs_under_bsd_sed

# ── Summary ───────────────────────────────────────────────────────────────────

total_pass=$(grep -c "PASS" "$RESULT_FILE" 2>/dev/null || true)
total_fail=$(grep -c "FAIL" "$RESULT_FILE" 2>/dev/null || true)
: "${total_pass:=0}"
: "${total_fail:=0}"

echo ""
echo "═══════════════════════════════════════════════════════════"
if [ "$total_fail" -eq 0 ]; then
	echo "✓ setup substitution tests PASSED — $total_pass assertion(s), 0 failures"
	echo "═══════════════════════════════════════════════════════════"
	exit 0
else
	echo "✗ setup substitution tests FAILED — $total_pass passed, $total_fail failure(s)"
	echo "═══════════════════════════════════════════════════════════"
	exit 1
fi


# vim: ft=sh sts=4 sw=4 ts=4 et :
