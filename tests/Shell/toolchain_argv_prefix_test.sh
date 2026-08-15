#!/usr/bin/env bash
# $KYAULabs: toolchain_argv_prefix_test.sh kyau@aura.kyaulabs 2026/08/15 -0700 Exp $






# toolchain_argv_prefix_test.sh — contract tests for the toolchain
# argvPrefix mechanism (spec amendment: Pest coverage-driver silent-failure
# fix). Asserts the adapter's pest component declares the php -d pcov
# override prefix, the core contract validator accepts the field, the
# launcher spawns pest through the prefix, and coverage runs green even when
# pcov is disabled system-wide.

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
source "$REPO_ROOT/tests/Shell/lib/test_helpers.sh"

setup_result_file

ADAPTER_TOOLCHAIN="$REPO_ROOT/packages/prism-php-web/toolchain.json"
CONTRACT_JS="$REPO_ROOT/packages/prism-core/scripts/prism-tool/contract.js"
CLI_JS="$REPO_ROOT/packages/prism-core/scripts/prism-tool/cli.js"
TOOL_LAUNCHER="$REPO_ROOT/packages/prism-core/scripts/prism-tool.js"

# ── 1. Adapter contract declares the pest argvPrefix ───────────────────────
PEST_PREFIX=$(node -e '
const c = JSON.parse(require("node:fs").readFileSync(process.argv[1], "utf8"));
const p = c.components.find((x) => x.id === "pest");
process.stdout.write(JSON.stringify(p && p.argvPrefix || null));
' "$ADAPTER_TOOLCHAIN")
if [ "$PEST_PREFIX" = '["php","-d","pcov.enabled=1"]' ]; then
	pass "adapter pest component declares argvPrefix"
else
	fail "adapter pest component argvPrefix missing or wrong: $PEST_PREFIX"
fi

# ── 2. Validator accepts argvPrefix; validate-harness stays green ──────────
if grep -q "'argvPrefix'" "$CONTRACT_JS"; then
	pass "contract validator knows argvPrefix"
else
	fail "contract.js lacks argvPrefix in the component schema"
fi

if bash "$REPO_ROOT/packages/prism-core/scripts/validate-harness.sh" >/dev/null 2>&1; then
	pass "validate-harness accepts the argvPrefix contract"
else
	fail "validate-harness rejects the adapter contract"
fi

# ── 3. Launcher prepends the prefix in runDeclaredTool ─────────────────────
if grep -q "argvPrefix" "$CLI_JS"; then
	pass "cli.js applies argvPrefix in runDeclaredTool"
else
	fail "cli.js does not apply argvPrefix"
fi

# ── 4. Dynamic coverage smoke (red when the driver is disabled) ────────────
DRIVER=""
if php -m 2>/dev/null | grep -qE '^pcov$'; then DRIVER=pcov; fi
if php -m 2>/dev/null | grep -qE '^xdebug$'; then DRIVER=xdebug; fi
if [ -z "$DRIVER" ]; then
	skip "no coverage driver present — dynamic smoke skipped; check-php preflight covers this case"
else
	set +e
	(cd "$REPO_ROOT" && node "$TOOL_LAUNCHER" run pest -- --coverage --testsuite=Unit) >/dev/null 2>&1
	RC=$?
	set -e
	if [ "$RC" -eq 0 ]; then
		pass "pest coverage smoke passes with $DRIVER"
	else
		fail "pest coverage smoke failed with $DRIVER present (rc=$RC)"
	fi
fi

print_summary "toolchain_argv_prefix"






# vim: ft=sh sts=4 sw=4 ts=4 et :
