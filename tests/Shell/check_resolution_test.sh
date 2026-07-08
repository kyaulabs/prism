#!/usr/bin/env bash
# $KYAULabs: check_resolution_test.sh kyau@nova 2026/07/07 -0700 Exp $

# ── Tests for /check tool resolution and mktemp isolation ──────────────────
# Covers:
#   - php-cs-fixer resolution: vendor/bin preferred over PATH global
#   - Fallback to PATH when vendor/bin is absent
#   - SKIPPED notice when php-cs-fixer is not found
#   - mktemp produces unique filenames (prevents /tmp collision)

set -euo pipefail

RESULT_FILE=$(mktemp)
TEMP_DIRS=""
trap 'rm -f "$RESULT_FILE"; [ -n "$TEMP_DIRS" ] && rm -rf $TEMP_DIRS' EXIT

RED=$'\033[1;31m'
GREEN=$'\033[1;32m'
RESET=$'\033[0m'

pass() { echo "  ${GREEN}PASS${RESET} $*"; echo "PASS" >> "$RESULT_FILE"; }
fail() { echo "  ${RED}FAIL${RESET} $*" >&2; echo "FAIL" >> "$RESULT_FILE"; }

# ── Test 1: Resolution prefers vendor/bin over PATH ────────────────────────

echo ""
echo "── Test 1: Resolution prefers vendor/bin over PATH ──"
T1=$(mktemp -d)
TEMP_DIRS="$TEMP_DIRS $T1"
(
    cd "$T1"

    # Create vendor/bin/php-cs-fixer stub — echoes "vendor"
    mkdir -p vendor/bin
    cat > vendor/bin/php-cs-fixer <<'STUB'
#!/usr/bin/env bash
echo "vendor"
STUB
    chmod +x vendor/bin/php-cs-fixer

    # Create global php-cs-fixer stub — echoes "global"
    mkdir -p global-bin
    cat > global-bin/php-cs-fixer <<'STUB'
#!/usr/bin/env bash
echo "global"
STUB
    chmod +x global-bin/php-cs-fixer

    # Write the EXACT resolution block (tab-indented, mirrors pre-commit hook
    # lines 18-23 and the block that will replace check.md line 12).
    cat > resolve.sh <<'RESOLVE'
CS_FIXER=""
if [ -x vendor/bin/php-cs-fixer ]; then
	CS_FIXER=vendor/bin/php-cs-fixer
elif command -v php-cs-fixer > /dev/null 2>&1; then
	CS_FIXER=php-cs-fixer
fi
if [ -n "$CS_FIXER" ]; then
	"$CS_FIXER" fix --dry-run --diff
else
	echo "SKIPPED: php-cs-fixer not found (install via composer install or globally)"
fi
RESOLVE
    chmod +x resolve.sh

    # shellcheck disable=SC2030  # intentional: PATH scoping is local to the test subshell
    PATH="$T1/vendor/bin:$T1/global-bin:$PATH"
    export PATH

    set +e
    output=$(bash resolve.sh 2>&1)
    ret=$?
    set -e

    if [ "$ret" -eq 0 ] && echo "$output" | grep -q "vendor" && ! echo "$output" | grep -q "global"; then
        pass "Resolution prefers vendor/bin over PATH (got 'vendor', not 'global')"
    else
        fail "Expected 'vendor' (not 'global'), got (exit=$ret): $output"
    fi
)
rm -rf "$T1"

# ── Test 2: Resolution falls back to PATH when vendor/bin absent ───────────

echo ""
echo "── Test 2: Falls back to PATH when vendor/bin absent ──"
T2=$(mktemp -d)
TEMP_DIRS="$TEMP_DIRS $T2"
(
    cd "$T2"

    # Global php-cs-fixer stub only — no vendor/bin
    mkdir -p global-bin
    cat > global-bin/php-cs-fixer <<'STUB'
#!/usr/bin/env bash
echo "global"
STUB
    chmod +x global-bin/php-cs-fixer

    # Same EXACT resolution block
    cat > resolve.sh <<'RESOLVE'
CS_FIXER=""
if [ -x vendor/bin/php-cs-fixer ]; then
	CS_FIXER=vendor/bin/php-cs-fixer
elif command -v php-cs-fixer > /dev/null 2>&1; then
	CS_FIXER=php-cs-fixer
fi
if [ -n "$CS_FIXER" ]; then
	"$CS_FIXER" fix --dry-run --diff
else
	echo "SKIPPED: php-cs-fixer not found (install via composer install or globally)"
fi
RESOLVE
    chmod +x resolve.sh

    # shellcheck disable=SC2030,SC2031  # intentional subshell PATH isolation
    PATH="$T2/global-bin:$PATH"
    export PATH

    set +e
    output=$(bash resolve.sh 2>&1)
    ret=$?
    set -e

    if [ "$ret" -eq 0 ] && echo "$output" | grep -q "global"; then
        pass "Falls back to PATH when vendor/bin absent (got 'global')"
    else
        fail "Expected 'global', got (exit=$ret): $output"
    fi
)
rm -rf "$T2"

# ── Test 3: SKIPPED notice when php-cs-fixer not found ─────────────────────

echo ""
echo "── Test 3: SKIPPED when php-cs-fixer not found ──"
T3=$(mktemp -d)
TEMP_DIRS="$TEMP_DIRS $T3"
BASH_PATH=$(command -v bash)
(
    cd "$T3"

    # Same EXACT resolution block
    cat > resolve.sh <<'RESOLVE'
CS_FIXER=""
if [ -x vendor/bin/php-cs-fixer ]; then
	CS_FIXER=vendor/bin/php-cs-fixer
elif command -v php-cs-fixer > /dev/null 2>&1; then
	CS_FIXER=php-cs-fixer
fi
if [ -n "$CS_FIXER" ]; then
	"$CS_FIXER" fix --dry-run --diff
else
	echo "SKIPPED: php-cs-fixer not found (install via composer install or globally)"
fi
RESOLVE
    chmod +x resolve.sh

    # shellcheck disable=SC2031  # intentional: reads PATH inside isolated test subshell
    OLD_PATH="$PATH"
    # shellcheck disable=SC2123  # intentional: empty PATH exercises the not-found branch
    PATH=""
    export PATH

    set +e
    output=$("$BASH_PATH" resolve.sh 2>&1)
    ret=$?
    set -e

    PATH="$OLD_PATH"
    export PATH

    if [ "$ret" -eq 0 ] && echo "$output" | grep -q "SKIPPED"; then
        pass "SKIPPED notice when php-cs-fixer not found"
    else
        fail "Expected SKIPPED, got (exit=$ret): $output"
    fi
)
rm -rf "$T3"

# ── Test 4: mktemp produces unique filenames ───────────────────────────────

echo ""
echo "── Test 4: mktemp produces unique filenames ──"
TMP1=$(mktemp)
TMP2=$(mktemp)
if [ "$TMP1" != "$TMP2" ]; then
    pass "mktemp produces unique filenames"
else
    fail "mktemp returned same name twice: $TMP1"
fi
rm -f "$TMP1" "$TMP2"

# ── Summary ────────────────────────────────────────────────────────────────

total_pass=$(grep -c "PASS" "$RESULT_FILE" 2>/dev/null || true)
total_fail=$(grep -c "FAIL" "$RESULT_FILE" 2>/dev/null || true)
: "${total_pass:=0}"
: "${total_fail:=0}"

echo ""
echo "═══════════════════════════════════════════════════════"
if [ "$total_fail" -eq 0 ]; then
    echo "✓ check resolution tests PASSED — $total_pass assertion(s), 0 failures"
    echo "═══════════════════════════════════════════════════════"
    exit 0
else
    echo "✗ check resolution tests FAILED — $total_pass passed, $total_fail failure(s)"
    echo "═══════════════════════════════════════════════════════"
    exit 1
fi

# vim: ft=sh sts=4 sw=4 ts=4 et :
