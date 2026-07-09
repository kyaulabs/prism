#!/usr/bin/env bash
# $KYAULabs: semgrep_ci_test.sh Sean Bruen@NOVA 2026/07/08 -0700 Exp $

# -- Regression guard: CI semgrep step structure ----------------------------
# Prevents `semgrep ci --config` (silently rejected by Semgrep in ci mode).
# Asserts:
#   1. Enforcement step uses `semgrep scan` (not `semgrep ci --config`).
#   2. References .semgrep/kyaulabs.yml + all three registry packs from ADR-0002.
#   3. Includes --error (CI gate on findings).
#   4. Includes --metrics off (disable telemetry).
#   5. Includes --disable-version-check (faster exit).
#   6. Never combines `semgrep ci` with `--config` on the same line.

set -euo pipefail

SCRIPT_DIR=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" &>/dev/null && pwd)
REPO_ROOT=$(cd "$SCRIPT_DIR/../.." && pwd)
CI_FILE="$REPO_ROOT/.github/workflows/ci.yml"

RED=$'\033[1;31m'
GREEN=$'\033[1;32m'
RESET=$'\033[0m'

pass() { echo "  ${GREEN}PASS${RESET} $*"; }
fail() { echo "  ${RED}FAIL${RESET} $*" >&2; }

errors=0

# 1. Enforcement step must use `semgrep scan` (not `semgrep ci --config`)
if grep -q 'semgrep scan' "$CI_FILE"; then
    pass "Enforcement step uses 'semgrep scan'"
else
    fail "Enforcement step must use 'semgrep scan' (semgrep ci --config is silently rejected in ci mode)"
    errors=$((errors + 1))
fi

# 2. Must reference the first-party rules pack
if grep -q -- '--config .semgrep/kyaulabs.yml' "$CI_FILE"; then
    pass "References first-party rules pack --config .semgrep/kyaulabs.yml"
else
    fail "Must reference --config .semgrep/kyaulabs.yml"
    errors=$((errors + 1))
fi

# 3. Must reference all three registry packs (ADR-0002:12)
for pack in p/php p/secrets p/javascript; do
    if grep -q -- "--config $pack" "$CI_FILE"; then
        pass "References registry pack --config $pack"
    else
        fail "Must reference registry pack --config $pack (ADR-0002)"
        errors=$((errors + 1))
    fi
done

# 4. Must include --error (CI gate on findings)
if grep -q -- '--error' "$CI_FILE"; then
    pass "Includes --error (CI gate on findings)"
else
    fail "Must include --error (exit 1 on findings, CI enforcement gate)"
    errors=$((errors + 1))
fi

# 5. Must include --metrics off (disable telemetry, mirrors @semgrep agent convention)
if grep -q -- '--metrics off' "$CI_FILE"; then
    pass "Includes --metrics off (disable telemetry)"
else
    fail "Must include --metrics off (disable telemetry, mirrors @semgrep agent)"
    errors=$((errors + 1))
fi

# 6. Must include --disable-version-check (faster exit, mirrors @semgrep agent convention)
if grep -q -- '--disable-version-check' "$CI_FILE"; then
    pass "Includes --disable-version-check (faster exit)"
else
    fail "Must include --disable-version-check (faster exit, mirrors @semgrep agent)"
    errors=$((errors + 1))
fi

# 7. Never combine `semgrep ci` with `--config` on the same line
if grep -qE 'semgrep ci .*--config' "$CI_FILE"; then
    fail "Must not combine 'semgrep ci' with --config (Semgrep rejects --config in ci mode)"
    errors=$((errors + 1))
else
    pass "Does not combine 'semgrep ci' with --config"
fi

# -- Summary -----------------------------------------------------------------

if [ "$errors" -eq 0 ]; then
    echo ""
    echo "Semgrep CI test PASSED -- 0 failures"
    exit 0
else
    echo ""
    echo "Semgrep CI test FAILED -- $errors failure(s)"
    exit 1
fi

# vim: ft=sh sts=4 sw=4 ts=4 et :
