#!/usr/bin/env bash
# $KYAULabs: bootstrap_hook_dispatch_test.sh kyau@aura.kyaulabs 2026/08/24 -0700 Exp $

set -euo pipefail

ROOT=$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)
TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT
FAKE_BIN="$TMP/bin"
EMPTY_BIN="$TMP/empty-bin"
mkdir -p "$FAKE_BIN" "$EMPTY_BIN"
cat >"$FAKE_BIN/prism-tool" <<'EOF'
#!/bin/bash
printf '%s\0' "$@" >"$HOOK_LOG.args"
/bin/cat >"$HOOK_LOG.stdin"
exit "${HOOK_STATUS:-0}"
EOF
chmod 0755 "$FAKE_BIN/prism-tool"

assert_args() {
    local log=$1
    shift
    local -a actual=()
    mapfile -d '' -t actual <"$log.args"
    if [[ "${actual[*]}" != "$*" ]]; then
        printf 'unexpected hook arguments: %s\n' "${actual[*]}" >&2
        exit 1
    fi
}

HOOK_LOG="$TMP/pre-commit" PATH="$FAKE_BIN:/usr/bin:/bin" \
    /bin/bash "$ROOT/packages/prism-core/config/bootstrap/hooks/pre-commit"
assert_args "$TMP/pre-commit" hook pre-commit
[[ ! -s "$TMP/pre-commit.stdin" ]]

MESSAGE="$TMP/COMMIT_EDITMSG"
printf 'ignore: bootstrap prism project\n' >"$MESSAGE"
HOOK_LOG="$TMP/commit-msg" PATH="$FAKE_BIN:/usr/bin:/bin" \
    /bin/bash "$ROOT/packages/prism-core/config/bootstrap/hooks/commit-msg" "$MESSAGE"
assert_args "$TMP/commit-msg" hook commit-msg "$MESSAGE"

HOOK_LOG="$TMP/prepare-commit-msg" PATH="$FAKE_BIN:/usr/bin:/bin" \
    /bin/bash "$ROOT/packages/prism-core/config/bootstrap/hooks/prepare-commit-msg" \
    "$MESSAGE" commit HEAD
assert_args "$TMP/prepare-commit-msg" hook prepare-commit-msg "$MESSAGE" commit HEAD

printf 'refs/heads/develop 1111111111111111111111111111111111111111 refs/heads/develop 0000000000000000000000000000000000000000\n' |
    HOOK_LOG="$TMP/pre-push" PATH="$FAKE_BIN:/usr/bin:/bin" \
    /bin/bash "$ROOT/packages/prism-core/config/bootstrap/hooks/pre-push" origin example.invalid
assert_args "$TMP/pre-push" hook pre-push origin example.invalid
grep -q '^refs/heads/develop ' "$TMP/pre-push.stdin"

set +e
PATH="$EMPTY_BIN" /bin/bash "$ROOT/packages/prism-core/config/bootstrap/hooks/pre-commit" \
    >"$TMP/missing.out" 2>"$TMP/missing.err"
STATUS=$?
set -e
[[ "$STATUS" -eq 1 ]]
grep -q 'prism-tool is unavailable' "$TMP/missing.err"

printf 'PASS: bootstrap hook dispatch\n'

# vim: ft=sh sts=4 sw=4 ts=4 et :
