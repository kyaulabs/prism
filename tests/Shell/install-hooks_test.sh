#!/usr/bin/env bash
# $KYAULabs: install-hooks_test.sh kyau@aura.kyaulabs 2026/09/01 -0700 Exp $

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
source "$REPO_ROOT/tests/Shell/lib/test_helpers.sh"

setup_result_file

REAL_SCRIPT="$REPO_ROOT/packages/prism-core/scripts/install-hooks.sh"
CANONICAL_ROOT="$REPO_ROOT/packages/prism-core/config/bootstrap/hooks"

T1=$(mktemp -d)
register_temp_dir "$T1"
git_init_test_repo "$T1"
(
    cd "$T1"
    mkdir -p packages/prism-core/scripts .github/hooks bin
    cp "$REAL_SCRIPT" packages/prism-core/scripts/install-hooks.sh
    ln -s "$REPO_ROOT/packages/prism-core/scripts/prism-tool.js" bin/prism-tool
    printf '#!/usr/bin/env bash\nexit 0\n' > .github/hooks/custom-hook
    chmod 0755 .github/hooks/custom-hook
    if PATH="$T1/bin:$PATH" bash packages/prism-core/scripts/install-hooks.sh >/dev/null 2>&1; then
        for hook in commit-msg pre-commit pre-push prepare-commit-msg; do
            if cmp -s ".github/hooks/$hook" "$CANONICAL_ROOT/$hook" && \
               [ -x ".github/hooks/$hook" ]; then
                pass "$hook is canonical and executable"
            else
                fail "$hook is not canonical and executable"
            fi
        done
        if [ "$(git config --local core.hooksPath)" = ".github/hooks" ]; then
            pass "core.hooksPath is the canonical repository-local path"
        else
            fail "core.hooksPath is not canonical"
        fi
        if [ -f .github/hooks/custom-hook ]; then
            pass "unrelated hooks are preserved"
        else
            fail "unrelated hook was removed"
        fi
    else
        fail "install-hooks.sh failed to reconcile an empty repository"
    fi
)

T2=$(mktemp -d)
register_temp_dir "$T2"
git_init_test_repo "$T2"
(
    cd "$T2"
    mkdir -p packages/prism-core/scripts .github/hooks bin
    cp "$REAL_SCRIPT" packages/prism-core/scripts/install-hooks.sh
    ln -s "$REPO_ROOT/packages/prism-core/scripts/prism-tool.js" bin/prism-tool
    printf '#!/usr/bin/env bash\necho human\n' > .github/hooks/pre-commit
    chmod 0755 .github/hooks/pre-commit
    if PATH="$T2/bin:$PATH" bash packages/prism-core/scripts/install-hooks.sh >/dev/null 2>&1; then
        fail "install-hooks.sh overwrote an unowned hook"
    elif grep -qF 'echo human' .github/hooks/pre-commit; then
        pass "install-hooks.sh preserves an unowned collision"
    else
        fail "install-hooks.sh changed an unowned collision"
    fi
)

T3=$(mktemp -d)
register_temp_dir "$T3"
mkdir -p "$T3/bin"
cp "$REAL_SCRIPT" "$T3/install-hooks.sh"
if PATH="$T3/bin" /bin/bash "$T3/install-hooks.sh" >"$T3/out" 2>"$T3/err"; then
    fail "install-hooks.sh succeeded without prism-tool"
elif grep -qF '/setup' "$T3/err"; then
    pass "missing prism-tool fails closed with setup remediation"
else
    fail "missing prism-tool diagnostic is incomplete"
fi

if ! grep -qE '(^|[[:space:]])(cp|chmod|git config)([[:space:]]|$)' "$REAL_SCRIPT"; then
    pass "install-hooks.sh delegates reconciliation without copying hooks"
else
    fail "install-hooks.sh still mutates hooks directly"
fi

print_summary "install-hooks"
exit $?

# vim: ft=sh sts=4 sw=4 ts=4 et :
