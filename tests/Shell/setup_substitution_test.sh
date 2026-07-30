#!/usr/bin/env bash
# $KYAULabs: setup_substitution_test.sh kyau@cosmos.kyaulabs 2026/07/30 -0700 Exp $










# ── Tests for setup-substitute.sh scaffolding token substitution ────────────
# Verifies that the substitution script correctly replaces template scaffolding
# tokens (abuse contact, org/repo, app, domain, username) with user-provided
# values. Identity tokens (composite `kyau <git@kyaulabs.com>` and bare
# `git@kyaulabs.com`) are no longer substituted by this script — they are
# resolved at runtime by resolve-identity.sh per ADR-0029.
#
# Script signature (5 args, no identity args):
#   setup-substitute.sh <file> <app> <domain> <org> <repo>

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
source "$REPO_ROOT/tests/Shell/lib/test_helpers.sh"

setup_result_file

SCRIPT="$REPO_ROOT/.github/scripts/setup-substitute.sh"

if [ ! -f "$SCRIPT" ]; then
	fail "Cannot find setup-substitute.sh at $SCRIPT"
	exit 1
fi

# Test values
T_APP="myapp"
T_DOMAIN="example.org"
T_ORG="myorg"
T_REPO="myrepo"
T_USER="TestUser"

# Helper: initialise a sandbox git repo so `git config user.name` (used by the
# script for <username> substitution) returns a deterministic value.
init_sandbox_repo() {
	git init --quiet >/dev/null
	git config commit.gpgsign false
	git config user.name "$T_USER"
	git config user.email "test@example.org"
}

# ── Test 1: Abuse contact replacement ────────────────────────────────────────

echo ""
echo "── Test 1: Abuse contact (git+abuse@kyaulabs.com) replaced ──"
T1=$(mktemp -d)
register_temp_dir "$T1"
(
	cd "$T1"
	init_sandbox_repo
	printf 'Contact: git+abuse@kyaulabs.com for issues.\n' > file.md
	bash "$SCRIPT" file.md "$T_APP" "$T_DOMAIN" "$T_ORG" "$T_REPO"
	result=$(cat file.md)
	expected="Contact: abuse@${T_DOMAIN} for issues."
	if [ "$result" = "$expected" ]; then
		pass "abuse contact replaced correctly"
	else
		fail "expected: $expected, got: $result"
	fi
)

# ── Test 2: GitHub org/repo replacement ──────────────────────────────────────

echo ""
echo "── Test 2: GitHub org/repo (kyaulabs/template) replaced ──"
T2=$(mktemp -d)
register_temp_dir "$T2"
(
	cd "$T2"
	init_sandbox_repo
	printf 'Repo: kyaulabs/template\n' > file.md
	bash "$SCRIPT" file.md "$T_APP" "$T_DOMAIN" "$T_ORG" "$T_REPO"
	result=$(cat file.md)
	expected="Repo: ${T_ORG}/${T_REPO}"
	if [ "$result" = "$expected" ]; then
		pass "GitHub org/repo replaced correctly"
	else
		fail "expected: $expected, got: $result"
	fi
)

# ── Test 3: App name placeholder replacement ─────────────────────────────────

echo ""
echo "── Test 3: App name (<app>) replaced ──"
T3=$(mktemp -d)
register_temp_dir "$T3"
(
	cd "$T3"
	init_sandbox_repo
	printf 'Webroot: <app>\n' > file.md
	bash "$SCRIPT" file.md "$T_APP" "$T_DOMAIN" "$T_ORG" "$T_REPO"
	result=$(cat file.md)
	expected="Webroot: ${T_APP}"
	if [ "$result" = "$expected" ]; then
		pass "app name placeholder replaced correctly"
	else
		fail "expected: $expected, got: $result"
	fi
)

# ── Test 4: Domain placeholder replacement ───────────────────────────────────

echo ""
echo "── Test 4: Domain (<domain>) replaced ──"
T4=$(mktemp -d)
register_temp_dir "$T4"
(
	cd "$T4"
	init_sandbox_repo
	printf 'Server: <domain>\n' > file.md
	bash "$SCRIPT" file.md "$T_APP" "$T_DOMAIN" "$T_ORG" "$T_REPO"
	result=$(cat file.md)
	expected="Server: ${T_DOMAIN}"
	if [ "$result" = "$expected" ]; then
		pass "domain placeholder replaced correctly"
	else
		fail "expected: $expected, got: $result"
	fi
)

# ── Test 5: Username placeholder replacement (auto-detected from git config) ─

echo ""
echo "── Test 5: Username (<username>) auto-detected from git config ──"
T5=$(mktemp -d)
register_temp_dir "$T5"
(
	cd "$T5"
	init_sandbox_repo
	printf 'Branch: feat/<username>-abc123-desc\n' > file.md
	bash "$SCRIPT" file.md "$T_APP" "$T_DOMAIN" "$T_ORG" "$T_REPO"
	result=$(cat file.md)
	expected="Branch: feat/${T_USER}-abc123-desc"
	if [ "$result" = "$expected" ]; then
		pass "username placeholder replaced from git config"
	else
		fail "expected: $expected, got: $result"
	fi
)

# ── Test 6: Multiple scaffolding tokens in one file ──────────────────────────

echo ""
echo "── Test 6: Multiple scaffolding tokens all replaced ──"
T6=$(mktemp -d)
register_temp_dir "$T6"
(
	cd "$T6"
	init_sandbox_repo
	cat > file.md <<EOF
# Project: <app>
Domain: <domain>
Repo: kyaulabs/template
Abuse: git+abuse@kyaulabs.com
Branch: feat/<username>-hash
EOF
	bash "$SCRIPT" file.md "$T_APP" "$T_DOMAIN" "$T_ORG" "$T_REPO"
	# Verify NO old scaffolding tokens remain (identity tokens are NOT
	# substituted by this script — they live in prism.jsonc now per ADR-0029).
	if grep -qF 'git+abuse@kyaulabs.com' file.md; then
		fail "abuse contact still present after substitution"
	elif grep -qF 'kyaulabs/template' file.md; then
		fail "GitHub org/repo still present after substitution"
	elif grep -qF '<app>' file.md; then
		fail "app placeholder still present after substitution"
	elif grep -qF '<domain>' file.md; then
		fail "domain placeholder still present after substitution"
	elif grep -qF '<username>' file.md; then
		fail "username placeholder still present after substitution"
	else
		pass "all scaffolding tokens replaced"
	fi
)

# ── Test 7: runs under BSD-style sed (no GNU -i) ─────────────────────────────

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

	local d
	d=$(mktemp -d)
	(
		cd "$d"
		init_sandbox_repo
		printf 'Repo: kyaulabs/template\n' > file.md

		# 5-arg signature; the script does not use -i (uses sed_edit helper)
		PATH="$tmp_bin:$PATH" bash "$SCRIPT" file.md "$T_APP" "$T_DOMAIN" "$T_ORG" "$T_REPO" >/dev/null 2>&1
		local rc=$?
		if [ "$rc" -ne 0 ]; then
			fail "script failed under BSD sed (rc=$rc)"
			return 1
		fi
		pass "runs under BSD sed"
	)
}

echo ""
echo "── Test 7: runs under BSD-style sed (no GNU -i) ──"
test_runs_under_bsd_sed

# ── Test 8: --target-dir redirects file resolution ───────────────────────────

echo ""
echo "── Test 8: --target-dir redirects file resolution ──"
T8=$(mktemp -d)
register_temp_dir "$T8"
(
	cd "$T8"
	init_sandbox_repo
	mkdir -p "$T8/subdir"
	printf 'Repo: kyaulabs/template\n' > "$T8/subdir/file.md"
	bash "$SCRIPT" --target-dir "$T8/subdir" file.md "$T_APP" "$T_DOMAIN" "$T_ORG" "$T_REPO"
	result=$(cat "$T8/subdir/file.md")
	expected="Repo: ${T_ORG}/${T_REPO}"
	if [ "$result" = "$expected" ]; then
		pass "org/repo replaced in target dir"
	else
		fail "expected: $expected, got: $result"
	fi
	if [ ! -f "$T8/file.md" ]; then
		pass "no file.md created in invocation dir"
	else
		fail "file.md leaked into invocation dir"
	fi
)

# ── Test 9: AC-9 regression (byte-identical without --target-dir) ───────────

echo ""
echo "── Test 9: AC-9 — byte-identical with and without --target-dir ──"
T9A=$(mktemp -d)
T9B=$(mktemp -d)
register_temp_dir "$T9A"
register_temp_dir "$T9B"
(
	# Multi-token input exercising all 5 scaffolding tokens (no identity tokens)
	cat > "$T9A/file.md" <<'EOF'
# Project: <app>
Domain: <domain>
Repo: kyaulabs/template
Abuse: git+abuse@kyaulabs.com
Branch: feat/<username>-hash
EOF
	cp "$T9A/file.md" "$T9B/file.md"

	# Run WITHOUT --target-dir (legacy path) — needs to be a git repo for <username>
	cd "$T9A"
	init_sandbox_repo
	bash "$SCRIPT" file.md "$T_APP" "$T_DOMAIN" "$T_ORG" "$T_REPO"

	# Run WITH --target-dir (pointer path)
	cd "$T9B"
	init_sandbox_repo
	bash "$SCRIPT" --target-dir "$T9B" file.md "$T_APP" "$T_DOMAIN" "$T_ORG" "$T_REPO"

	if cmp -s "$T9A/file.md" "$T9B/file.md"; then
		pass "output byte-identical with and without --target-dir"
	else
		fail "output differs — --target-dir is not byte-identical"
	fi
)

# ── Test 10: crafted injection payloads are rejected (AC-1, AC-2) ─────────────

echo ""
echo "── Test 10: crafted payloads rejected for every arg position ──"
T10=$(mktemp -d)
register_temp_dir "$T10"
(
	cd "$T10"
	init_sandbox_repo

	# Payloads that corrupt or enable command execution when spliced unescaped
	# into s|...|VALUE|g: | (delimiter), & (whole match), \ (escape),
	# quotes/backtick (shell), whitespace. The GNU sed `e`-flag payload
	# (value = "X|e") turns s|<app>|X|e|g into an execute command — must reject.
	payloads=(
		'a|b'
		'a&b'
		'a\b'
		'a"b'
		"a'b"
		'a`b'
		'a b'
		'a	b'
		'X|e'
	)

	rejected=0
	total=0
	for p in "${payloads[@]}"; do
		# Each forbidden payload is tried in each of the 4 arg positions.
		for pos in app domain org repo; do
			total=$((total + 1))
			printf 'Token: <app> <domain> kyaulabs/template\n' > file.md
			case "$pos" in
				app)    set -- "$p" "$T_DOMAIN" "$T_ORG" "$T_REPO" ;;
				domain) set -- "$T_APP" "$p"    "$T_ORG" "$T_REPO" ;;
				org)    set -- "$T_APP" "$T_DOMAIN" "$p"    "$T_REPO" ;;
				repo)   set -- "$T_APP" "$T_DOMAIN" "$T_ORG" "$p"    ;;
			esac
			if bash "$SCRIPT" file.md "$@" >/dev/null 2>&1; then
				fail "payload '$p' in $pos was NOT rejected"
			else
				rejected=$((rejected + 1))
			fi
		done
	done
	if [ "$rejected" -eq "$total" ]; then
		pass "all ${total} crafted payloads rejected"
	else
		fail "only ${rejected}/${total} payloads rejected"
	fi
)

# ── Test 11: file is byte-identical after a rejection (no partial write) ──────

echo ""
echo "── Test 11: file untouched on rejection ──"
T11=$(mktemp -d)
register_temp_dir "$T11"
(
	cd "$T11"
	init_sandbox_repo
	original='Token: <app> is the placeholder'
	printf '%s\n' "$original" > file.md
	cp file.md file.md.bak
	# Pipe in app position must be rejected; file must not change.
	if bash "$SCRIPT" file.md 'evil|payload' "$T_DOMAIN" "$T_ORG" "$T_REPO" >/dev/null 2>&1; then
		fail "pipe payload was accepted (should have been rejected)"
	elif cmp -s file.md file.md.bak; then
		pass "file byte-identical after rejection"
	else
		fail "file was modified despite rejection"
	fi
)

# ── Test 12: --validate-only accepts clean values, no file touched ───────────

echo ""
echo "── Test 12: --validate-only accepts clean values ──"
T12=$(mktemp -d)
register_temp_dir "$T12"
(
	cd "$T12"
	# No file argument is required in validate-only mode.
	if bash "$SCRIPT" --validate-only "$T_APP" "$T_DOMAIN" "$T_ORG" "$T_REPO" >/dev/null 2>&1; then
		pass "--validate-only exits 0 for clean values"
	else
		fail "--validate-only rejected clean values"
	fi
	# Confirm no file was created in the working directory.
	if [ ! -e file.md ] && [ ! -e "$T_APP" ]; then
		pass "--validate-only wrote no files"
	else
		fail "--validate-only created unexpected files"
	fi
)

# ── Test 13: --validate-only rejects a dirty manifest value ──────────────────

echo ""
echo "── Test 13: --validate-only rejects dirty value ──"
T13=$(mktemp -d)
register_temp_dir "$T13"
(
	cd "$T13"
	if bash "$SCRIPT" --validate-only "$T_APP" 'evil|domain' "$T_ORG" "$T_REPO" >/dev/null 2>&1; then
		fail "--validate-only accepted a pipe in the domain"
	else
		pass "--validate-only rejected a dirty domain"
	fi
)

# ── Summary ────────────────────────────────────────────────────────────

print_summary "setup substitution"
exit $?







# vim: ft=sh sts=4 sw=4 ts=4 et :
