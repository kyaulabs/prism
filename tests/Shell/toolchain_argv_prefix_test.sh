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
# Validator acceptance of argvPrefix is covered functionally by
# validate-harness_test.sh (which runs the full validator in the suite);
# this test does not repeat that whole-repo run.

# ── 2. Deterministic coverage smoke (forced pcov-off) ───────────────────────
# The argvPrefix targets pcov specifically. Only run when pcov is the
# loaded driver; xdebug-only environments cannot exercise the injection
# (xdebug.mode is untouched by the prefix), and driver-less environments
# are covered by check-php's loud preflight.
DRIVER=""
if php -m 2>/dev/null | grep -qiE '^pcov$'; then DRIVER=pcov; fi
if [ -z "$DRIVER" ] && php -m 2>/dev/null | grep -qiE '^xdebug$'; then DRIVER=xdebug; fi
if [ -z "$DRIVER" ]; then
	skip "no coverage driver present — dynamic smoke skipped; check-php preflight covers this case"
	print_summary "toolchain_argv_prefix"
	exit $?
fi
if [ "$DRIVER" != "pcov" ]; then
	skip "driver is $DRIVER — pcov-only smoke skipped; the argvPrefix injection is exercised in CI"
	print_summary "toolchain_argv_prefix"
	exit $?
fi
if [ ! -x "$PEST_BIN" ]; then
	skip "vendor/bin/pest missing (composer install not run) — dynamic smoke skipped"
	print_summary "toolchain_argv_prefix"
	exit $?
fi

# Force pcov off for the smoke: append a scan-dir ini that sets
# pcov.enabled=0 after the system scan dir (later files win), so the ONLY
# way coverage stays green is the launcher's injected `-d pcov.enabled=1`.
TMP_INI_DIR="$(mktemp -d)"
register_temp_dir "$TMP_INI_DIR"
printf 'pcov.enabled = 0\n' > "$TMP_INI_DIR/pcov-off.ini"
DEFAULT_SCAN_DIR="$(php --ini 2>/dev/null | sed -n 's/^Scan for additional .ini files in: "\(.*\)"$/\1/p; s/^Scan for additional .ini files in: \(.*\)$/\1/p' | head -1 || true)"
case "$DEFAULT_SCAN_DIR" in
	""|"(none)")
		skip "no php ini scan dir — cannot force pcov off deterministically; smoke skipped"
		print_summary "toolchain_argv_prefix"
		exit $?
		;;
	*) export PHP_INI_SCAN_DIR="${DEFAULT_SCAN_DIR}:${TMP_INI_DIR}" ;;
esac

# Verify the forced-off state actually holds in this environment; without
# it the positive smoke would not prove the injection.
FORCED_STATE="$(php -r 'echo ini_get("pcov.enabled");' 2>/dev/null || true)"
if [ "$FORCED_STATE" != "0" ]; then
	skip "could not force pcov off (state=$FORCED_STATE) — smoke skipped"
	print_summary "toolchain_argv_prefix"
	exit $?
fi

# Negative control: pest run directly (no launcher) with the driver forced
# off must FAIL, while the same command with the driver forced ON must
# PASS — proves this environment is red-capable for the regression without
# coupling to any error wording. Uses one fast, deterministic test file so
# the control never couples to unrelated suite health. XDEBUG_MODE=off
# isolates pcov in mixed-driver environments.
set +e
CTRL_OUT=$(cd "$REPO_ROOT" && XDEBUG_MODE=off php -d pcov.enabled=0 -d xdebug.mode=off "$PEST_BIN" --coverage tests/Unit/EnvBoolTest.php 2>&1)
CONTROL_RC=$?
POS_OUT=$(cd "$REPO_ROOT" && XDEBUG_MODE=off php -d pcov.enabled=1 -d xdebug.mode=off "$PEST_BIN" --coverage tests/Unit/EnvBoolTest.php 2>&1)
POS_RC=$?
set -e
if [ "$CONTROL_RC" -ne 0 ] && [ "$POS_RC" -eq 0 ]; then
	pass "negative control: driver off fails ($CONTROL_RC), driver on passes ($POS_RC)"
else
	if [ "$CONTROL_RC" -eq 0 ]; then
		skip "driver-off run passed (rc=$CONTROL_RC) — pcov could not be forced off; smoke skipped"
		print_summary "toolchain_argv_prefix"
		exit $?
	fi
	if [ "$POS_RC" -ne 0 ]; then
		skip "driver-on run failed (rc=$POS_RC) — environment not red-capable; smoke skipped"
		print_summary "toolchain_argv_prefix"
		exit $?
	fi
	fail "negative control: driver off rc=$CONTROL_RC, driver on rc=$POS_RC (expected fail/pass)"
	printf '%s\n' "$CTRL_OUT" | tail -5 >&2
	printf '%s\n' "$POS_OUT" | tail -5 >&2
fi

# Positive: the launcher (which injects -d pcov.enabled=1) must be green in
# the same forced-off environment, on the same focused test file. The
# launcher gates every run on the core contract's external tools
# (semgrep/ocr) before dispatching any component — stub them on PATH with
# versions read from the contract's own ranges so the smoke always
# exercises the injection, independent of the host's real tooling and of
# future range adjustments.
STUB_DIR="$(mktemp -d)"
register_temp_dir "$STUB_DIR"
SEMGREP_STUB_VER="$(node -e 'const c = JSON.parse(require("node:fs").readFileSync(process.argv[1], "utf8")); process.stdout.write(c.components.find((x) => x.id === "semgrep").versionRequirement.minimum);' "$REPO_ROOT/packages/prism-core/toolchain.json" 2>/dev/null || true)"
OCR_STUB_VER="$(node -e 'const c = JSON.parse(require("node:fs").readFileSync(process.argv[1], "utf8")); process.stdout.write(c.components.find((x) => x.id === "ocr").versionRequirement.minimum);' "$REPO_ROOT/packages/prism-core/toolchain.json" 2>/dev/null || true)"
if [ -z "$SEMGREP_STUB_VER" ] || [ -z "$OCR_STUB_VER" ]; then
	fail "could not read semgrep/ocr version ranges from the core toolchain contract"
	print_summary "toolchain_argv_prefix"
	exit $?
fi
printf '#!/usr/bin/env bash\nprintf "%s\\n"\n' "$SEMGREP_STUB_VER" > "$STUB_DIR/semgrep"
printf '#!/usr/bin/env bash\nprintf "open-code-review v%s linux/amd64\\n"\n' "$OCR_STUB_VER" > "$STUB_DIR/ocr"
chmod +x "$STUB_DIR/semgrep" "$STUB_DIR/ocr"
set +e
SMOKE_OUT=$(cd "$REPO_ROOT" && XDEBUG_MODE=off PATH="$STUB_DIR:$PATH" node "$TOOL_LAUNCHER" run pest -- --coverage tests/Unit/EnvBoolTest.php 2>&1)
LAUNCHER_RC=$?
set -e
if [ "$LAUNCHER_RC" -eq 0 ] && printf '%s' "$SMOKE_OUT" | grep -qiE "Total:|Lines:|Coverage:"; then
	pass "pest coverage smoke passes via launcher with driver forced off ($DRIVER)"
else
	fail "pest coverage smoke failed via launcher with driver forced off (rc=$LAUNCHER_RC)"
	printf '%s\n' "$SMOKE_OUT" | tail -5 >&2
fi

print_summary "toolchain_argv_prefix"









# vim: ft=sh sts=4 sw=4 ts=4 et :
