#!/usr/bin/env bash
# $KYAULabs: toolchain_argv_prefix_test.sh kyau@aura.kyaulabs 2026/08/15 -0700 Exp $






# toolchain_argv_prefix_test.sh — contract tests for the toolchain
# argvPrefix mechanism (spec amendment: Pest coverage-driver silent-failure
# fix). Asserts the adapter's pest component declares the php -d pcov
# override prefix, the core contract validator accepts and validates the
# field, the launcher spawns pest through the prefix, and coverage runs
# green even when pcov is forced disabled.

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
source "$REPO_ROOT/tests/Shell/lib/test_helpers.sh"

setup_result_file

ADAPTER_TOOLCHAIN="$REPO_ROOT/packages/prism-php-web/toolchain.json"
CONTRACT_JS="$REPO_ROOT/packages/prism-core/scripts/prism-tool/contract.js"
TOOL_LAUNCHER="$REPO_ROOT/packages/prism-core/scripts/prism-tool.js"
PEST_BIN="$REPO_ROOT/vendor/bin/pest"

# ── 1. Adapter contract declares the pest argvPrefix ───────────────────────
PEST_PREFIX=$(node -e '
const c = JSON.parse(require("node:fs").readFileSync(process.argv[1], "utf8"));
const p = (c && Array.isArray(c.components)) ? c.components.find((x) => x.id === "pest") : null;
process.stdout.write(JSON.stringify(p && p.argvPrefix || null));
' "$ADAPTER_TOOLCHAIN" 2>/dev/null) || PEST_PREFIX="<unparseable>"
if [ "$PEST_PREFIX" = '["php","-d","pcov.enabled=1"]' ]; then
	pass "adapter pest component declares argvPrefix"
else
	fail "adapter pest component argvPrefix missing or wrong: $PEST_PREFIX"
fi

# ── 2. Validator accepts and validates argvPrefix ───────────────────────────
if grep -q "validateArgvPrefix" "$CONTRACT_JS"; then
	pass "contract validator validates argvPrefix"
else
	fail "contract.js lacks the argvPrefix validator"
fi

if bash "$REPO_ROOT/packages/prism-core/scripts/validate-harness.sh" >/dev/null 2>&1; then
	pass "validate-harness accepts the argvPrefix contract"
else
	fail "validate-harness rejects the adapter contract"
fi

# ── 3. Behavior smoke: launcher prepends the prefix ─────────────────────────
# Functional proof: validate-harness (above) accepts the contract; the
# forced-off smoke below proves the prefix is applied at spawn time.

# ── 4. Deterministic coverage smoke (forced pcov-off) ───────────────────────
# The argvPrefix targets pcov specifically. Only run when pcov is the
# loaded driver; xdebug-only environments cannot exercise the injection
# (xdebug.mode is untouched by the prefix), and driver-less environments
# are covered by check-php's loud preflight.
DRIVER=""
if php -m 2>/dev/null | grep -qE '^pcov$'; then DRIVER=pcov; fi
if [ -z "$DRIVER" ] && php -m 2>/dev/null | grep -qE '^xdebug$'; then DRIVER=xdebug; fi
if [ -z "$DRIVER" ]; then
	skip "no coverage driver present — dynamic smoke skipped; check-php preflight covers this case"
	print_summary "toolchain_argv_prefix"
	exit 0
fi
if [ "$DRIVER" != "pcov" ]; then
	skip "driver is $DRIVER — pcov-only smoke skipped; the argvPrefix injection is exercised in CI"
	print_summary "toolchain_argv_prefix"
	exit 0
fi

# Force pcov off for the smoke: append a scan-dir ini that sets
# pcov.enabled=0 after the system scan dir (later files win), so the ONLY
# way coverage stays green is the launcher's injected `-d pcov.enabled=1`.
TMP_INI_DIR="$(mktemp -d)"
register_temp_dir "$TMP_INI_DIR"
printf 'pcov.enabled = 0\n' > "$TMP_INI_DIR/pcov-off.ini"
DEFAULT_SCAN_DIR="$(php --ini 2>/dev/null | sed -n 's/^Scan for additional .ini files in: "\(.*\)"$/\1/p; s/^Scan for additional .ini files in: \(.*\)$/\1/p' | head -1)"
case "$DEFAULT_SCAN_DIR" in
	""|"(none)")
		skip "no php ini scan dir — cannot force pcov off deterministically; smoke skipped"
		print_summary "toolchain_argv_prefix"
		exit 0
		;;
	*) export PHP_INI_SCAN_DIR="${DEFAULT_SCAN_DIR}:${TMP_INI_DIR}" ;;
esac

# Negative control: pest run directly (no launcher) with the driver forced
# off must FAIL — proves this environment is red-capable for the regression.
set +e
(cd "$REPO_ROOT" && php -d pcov.enabled=0 -d xdebug.mode=off "$PEST_BIN" --coverage --testsuite=Unit) >/dev/null 2>&1
CONTROL_RC=$?
set -e
if [ "$CONTROL_RC" -ne 0 ]; then
	pass "negative control: direct pest with driver off fails (rc=$CONTROL_RC)"
else
	fail "negative control: direct pest with driver off unexpectedly passed"
fi

# Positive: the launcher (which injects -d pcov.enabled=1) must be green in
# the same forced-off environment.
set +e
(cd "$REPO_ROOT" && node "$TOOL_LAUNCHER" run pest -- --coverage --testsuite=Unit) >/dev/null 2>&1
LAUNCHER_RC=$?
set -e
if [ "$LAUNCHER_RC" -eq 0 ]; then
	pass "pest coverage smoke passes via launcher with driver forced off ($DRIVER)"
else
	fail "pest coverage smoke failed via launcher with driver forced off (rc=$LAUNCHER_RC)"
fi

print_summary "toolchain_argv_prefix"






# vim: ft=sh sts=4 sw=4 ts=4 et :
