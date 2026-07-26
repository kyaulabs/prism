#!/usr/bin/env bash
# $KYAULabs: semgrep_ci_test.sh kyau@cosmos.kyaulabs 2026/07/26 -0700 Exp $



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

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
source "$REPO_ROOT/tests/Shell/lib/test_helpers.sh"

setup_result_file

CI_FILE="$REPO_ROOT/.github/workflows/ci.yml"

# 1. Enforcement step must use `semgrep scan` (not `semgrep ci --config`)
if grep -q 'semgrep scan' "$CI_FILE"; then
    pass "Enforcement step uses 'semgrep scan'"
else
    fail "Enforcement step must use 'semgrep scan' (semgrep ci --config is silently rejected in ci mode)"
fi

# 2. Must reference the first-party rules pack
if grep -q -- '--config .semgrep/kyaulabs.yml' "$CI_FILE"; then
    pass "References first-party rules pack --config .semgrep/kyaulabs.yml"
else
    fail "Must reference --config .semgrep/kyaulabs.yml"
fi

# 3. Must reference all three registry packs (ADR-0002:12)
for pack in p/php p/secrets p/javascript; do
    if grep -q -- "--config $pack" "$CI_FILE"; then
        pass "References registry pack --config $pack"
    else
        fail "Must reference registry pack --config $pack (ADR-0002)"
    fi
done

# 4. Must include --error (CI gate on findings)
if grep -q -- '--error' "$CI_FILE"; then
    pass "Includes --error (CI gate on findings)"
else
    fail "Must include --error (exit 1 on findings, CI enforcement gate)"
fi

# 5. Every semgrep invocation must include --metrics off
#    Handles both inline `run: semgrep ci` and YAML >- folded `semgrep scan` blocks.
#    Tracks missing via a variable: awk exit in body still runs END, so we
#    cannot rely on exit status — set a flag and check in END.
if awk '
  /run: >-$/     { in_fold = 1; next }
  in_fold && /^[[:space:]]{6,}/ {
    gsub(/^[[:space:]]+/, "")
    folded = folded " " $0
    next
  }
  in_fold {
    if (folded ~ /semgrep/ && folded !~ /--metrics off/) missing = 1
    in_fold = 0
    folded = ""
  }
  /run:.*semgrep/ {
    if ($0 !~ /--metrics off/) missing = 1
  }
  END { exit missing ? 1 : 0 }
' "$CI_FILE"; then
    pass "All semgrep invocations include --metrics off"
else
    fail "Not all semgrep invocations include --metrics off"
fi

# 6. Every semgrep invocation must include --disable-version-check
#    Handles both inline `run: semgrep ci` and YAML >- folded `semgrep scan` blocks.
if awk '
  /run: >-$/     { in_fold = 1; next }
  in_fold && /^[[:space:]]{6,}/ {
    gsub(/^[[:space:]]+/, "")
    folded = folded " " $0
    next
  }
  in_fold {
    if (folded ~ /semgrep/ && folded !~ /--disable-version-check/) missing = 1
    in_fold = 0
    folded = ""
  }
  /run:.*semgrep/ {
    if ($0 !~ /--disable-version-check/) missing = 1
  }
  END { exit missing ? 1 : 0 }
' "$CI_FILE"; then
    pass "All semgrep invocations include --disable-version-check"
else
    fail "Not all semgrep invocations include --disable-version-check"
fi

# 7. Never combine `semgrep ci` with `--config` on the same line
if grep -qE 'semgrep ci .*--config' "$CI_FILE"; then
    fail "Must not combine 'semgrep ci' with --config (Semgrep rejects --config in ci mode)"
else
    pass "Does not combine 'semgrep ci' with --config"
fi

print_summary "semgrep_ci_test"
exit $?



# vim: ft=sh sts=4 sw=4 ts=4 et :
