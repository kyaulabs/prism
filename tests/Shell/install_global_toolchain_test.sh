#!/usr/bin/env bash
# $KYAULabs: install_global_toolchain_test.sh kyau@aura.kyaulabs 2026/08/20 -0700 Exp $

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
source "$REPO_ROOT/tests/Shell/lib/test_helpers.sh"

setup_result_file

INSTALLER="$REPO_ROOT/packages/prism-core/scripts/install-global.sh"

write_fake_tools() {
    local root="$1"
    mkdir -p "$root/bin"
    cat > "$root/bin/pi" <<'EOF'
#!/usr/bin/env bash
printf '%s|ignore=%s\n' "$*" "${npm_config_ignore_scripts:-unset}" >> "$PI_INVOCATIONS"
if [ "${PI_INSTALL_STATUS:-0}" -ne 0 ]; then
    exit "$PI_INSTALL_STATUS"
fi
if [ "${1:-}" = "install" ] && [ "${PI_SKIP_SETTINGS_WRITE:-0}" != "1" ]; then
    node - "$PI_CODING_AGENT_DIR/settings.json" "${2:-}" <<'JSEOF'
const fs = require('node:fs');
const path = require('node:path');
const settingsPath = process.argv[2];
const source = process.argv[3];
fs.mkdirSync(path.dirname(settingsPath), {recursive: true});
let settings = {};
if (fs.existsSync(settingsPath)) settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
if (!Array.isArray(settings.packages)) settings.packages = [];
settings.packages.push(source);
fs.writeFileSync(settingsPath, `${JSON.stringify(settings, null, 2)}\n`, {mode: 0o600});
JSEOF
fi
if [[ "${2:-}" == npm:* ]]; then
    package_root="$PI_CODING_AGENT_DIR/npm/node_modules/@kyaulabs/prism-core"
    mkdir -p "$package_root/scripts"
    cat > "$package_root/scripts/prism-tool.js" <<'JSEOF'
#!/usr/bin/env node
'use strict';
if (process.argv[2] !== 'doctor') process.exit(2);
process.stdout.write('fixture\tPASS\tready\nGO\n');
JSEOF
    chmod +x "$package_root/scripts/prism-tool.js"
fi
EOF
    cat > "$root/bin/semgrep" <<'EOF'
#!/usr/bin/env bash
printf '%s\n' "${SEMGREP_VERSION:-1.173.0}"
EOF
    cat > "$root/bin/ocr" <<'EOF'
#!/usr/bin/env bash
if [ -n "${OCR_INVOCATIONS:-}" ]; then
    printf '%s\n' "$*" >> "$OCR_INVOCATIONS"
fi
if [ "${1:-}" = "--version" ]; then
    printf 'open-code-review v%s linux/amd64\n' "${OCR_VERSION:-1.9.1}"
    exit 0
fi
if [ "${1:-}" = "llm" ] && [ "${2:-}" = "test" ]; then
    printf 'ok\n'
    exit "${OCR_TEST_STATUS:-0}"
fi
exit 2
EOF
    chmod +x "$root/bin/pi" "$root/bin/semgrep" "$root/bin/ocr"
}

file_mode() {
    stat -c '%a' "$1" 2>/dev/null || stat -f '%Lp' "$1"
}

echo "── local source installation and managed launcher ──"
T1=$(mktemp -d)
register_temp_dir "$T1"
write_fake_tools "$T1"
mkdir -p "$T1/home" "$T1/pi-agent" "$T1/bin-dir"
: > "$T1/pi-invocations"
: > "$T1/ocr-invocations"
output=""
status=0
output=$(HOME="$T1/home" \
    PI_CODING_AGENT_DIR="$T1/pi-agent" \
    PRISM_BIN_DIR="$T1/bin-dir" \
    PI_INVOCATIONS="$T1/pi-invocations" \
    OCR_INVOCATIONS="$T1/ocr-invocations" \
    PATH="$T1/bin:$PATH" \
    bash "$INSTALLER" 2>&1) || status=$?

launcher="$T1/bin-dir/prism-tool"
if [ "$status" -eq 0 ]; then
    pass "local source installation needs no registry approval"
else
    fail "local source installation exited $status: $output"
fi
if [ -f "$launcher" ] && [ ! -L "$launcher" ] && [ "$(file_mode "$launcher")" = "755" ]; then
    pass "managed launcher is a mode-0755 regular file"
else
    fail "managed launcher was not installed as a mode-0755 regular file"
fi
if grep -qF '# prism-core:managed-launcher begin' "$launcher" 2>/dev/null \
    && grep -qF '# prism-core:managed-launcher end' "$launcher" 2>/dev/null \
    && grep -qF "exec node '$REPO_ROOT/packages/prism-core/scripts/prism-tool.js' \"\$@\"" "$launcher" 2>/dev/null; then
    pass "launcher invokes the canonical local core CLI with both ownership sentinels"
else
    fail "launcher does not invoke the canonical local core CLI"
fi
launcher_output=""
status=0
launcher_output=$(PATH="$T1/bin:$PATH" "$launcher" doctor --local-only 2>&1) || status=$?
if [ "$status" -eq 0 ] && grep -qFx 'GO' <<< "$launcher_output"; then
    pass "installed launcher executes the core CLI"
else
    fail "installed launcher could not execute the core CLI"
fi
if grep -qFx '✓ prism toolchain local readiness PASS' <<< "$output" \
    && grep -qFx '  • Run /setup to grant standing OCR consent and verify live readiness.' <<< "$output" \
    && ! grep -qF 'llm test' "$T1/ocr-invocations" \
    && grep -qFx "install $REPO_ROOT/packages/prism-core|ignore=unset" "$T1/pi-invocations" \
    && [ "$(wc -l < "$T1/pi-invocations")" -eq 1 ] \
    && [ ! -e "$T1/pi-agent/prism-consent.json" ]; then
    pass "installer stays local-only and directs standing consent to /setup"
else
    fail "installer ran live OCR, created consent, or omitted the /setup next action"
fi
if grep -qF "$T1/bin-dir is not on PATH" <<< "$output"; then
    pass "installer reports an absent launcher directory without editing PATH"
else
    fail "installer did not report that its launcher directory is absent from PATH"
fi
if [ -f "$T1/pi-agent/AGENTS.md" ] && [ -f "$T1/pi-agent/APPEND_SYSTEM.md" ]; then
    pass "always-on context resources remain deployed"
else
    fail "always-on context resources were not deployed"
fi
if grep -q 'bash packages/prism-core/' "$T1/pi-agent/AGENTS.md"; then
    fail "deployed AGENTS.md retains checkout-relative script references"
else
    pass "deployed AGENTS.md has no checkout-relative script references"
fi
printf 'shell-startup-sentinel\n' > "$T1/home/.bashrc"
printf 'profile-sentinel\n' > "$T1/home/.profile"
launcher_before=$(cksum "$launcher" | awk '{print $1 ":" $2}')
status=0
HOME="$T1/home" \
    PI_CODING_AGENT_DIR="$T1/pi-agent" \
    PRISM_BIN_DIR="$T1/bin-dir" \
    PI_INVOCATIONS="$T1/pi-invocations" \
    PATH="$T1/bin:$PATH" \
    bash "$INSTALLER" >/dev/null 2>&1 || status=$?
launcher_after=$(cksum "$launcher" | awk '{print $1 ":" $2}')
if [ "$status" -eq 0 ] && [ "$launcher_before" = "$launcher_after" ]; then
    pass "managed launcher refresh is idempotent"
else
    fail "managed launcher refresh changed content or failed"
fi
if [ "$(cat "$T1/home/.bashrc")" = 'shell-startup-sentinel' ] \
    && [ "$(cat "$T1/home/.profile")" = 'profile-sentinel' ]; then
    pass "installer does not edit shell startup files"
else
    fail "installer edited a shell startup file"
fi

echo "── selected source exclusivity ──"
T9=$(mktemp -d)
register_temp_dir "$T9"
write_fake_tools "$T9"
mkdir -p "$T9/home" "$T9/pi-agent" "$T9/bin-dir" "$T9/stale-core"
: > "$T9/pi-invocations"
printf '{"name":"@kyaulabs/prism-core"}\n' > "$T9/stale-core/package.json"
cat > "$T9/pi-agent/settings.json" <<EOF
{
  "theme": "dark",
  "packages": [
    "npm:@kyaulabs/prism-core",
    "$T9/stale-core",
    "npm:unrelated"
  ]
}
EOF
status=0
HOME="$T9/home" \
    PI_CODING_AGENT_DIR="$T9/pi-agent" \
    PRISM_BIN_DIR="$T9/bin-dir" \
    PI_INVOCATIONS="$T9/pi-invocations" \
    PATH="$T9/bin:$PATH" \
    bash "$INSTALLER" >/dev/null 2>&1 || status=$?
if [ "$status" -eq 0 ] && node - "$T9/pi-agent/settings.json" "$REPO_ROOT/packages/prism-core" <<'JSEOF'
const fs = require('node:fs');
const settings = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
const selected = fs.realpathSync(process.argv[3]);
if (settings.theme !== 'dark') process.exit(1);
if (JSON.stringify(settings.packages) !== JSON.stringify(['npm:unrelated', selected])) process.exit(1);
JSEOF
then
    pass "local installation removes stale npm and local core registrations"
else
    fail "local installation did not make the selected core source exclusive"
fi

T11=$(mktemp -d)
register_temp_dir "$T11"
write_fake_tools "$T11"
mkdir -p "$T11/home" "$T11/pi-agent" "$T11/bin-dir" "$T11/stale-core"
: > "$T11/pi-invocations"
printf '{"name":"@kyaulabs/prism-core"}\n' > "$T11/stale-core/package.json"
cat > "$T11/pi-agent/settings.json" <<EOF
{
  "packages": [
    "$T11/stale-core",
    "npm:unrelated"
  ]
}
EOF
status=0
HOME="$T11/home" \
    PI_CODING_AGENT_DIR="$T11/pi-agent" \
    PRISM_BIN_DIR="$T11/bin-dir" \
    PRISM_CORE_SOURCE='npm:@kyaulabs/prism-core' \
    PI_INVOCATIONS="$T11/pi-invocations" \
    PATH="$T11/bin:$PATH" \
    bash "$INSTALLER" --network-approved=yes >/dev/null 2>&1 || status=$?
if [ "$status" -eq 0 ] && node - "$T11/pi-agent/settings.json" <<'JSEOF'
const fs = require('node:fs');
const settings = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
const expected = ['npm:unrelated', 'npm:@kyaulabs/prism-core'];
if (JSON.stringify(settings.packages) !== JSON.stringify(expected)) process.exit(1);
JSEOF
then
    pass "npm installation removes stale local core registrations"
else
    fail "npm installation did not make the selected core source exclusive"
fi

T12=$(mktemp -d)
register_temp_dir "$T12"
write_fake_tools "$T12"
mkdir -p "$T12/home" "$T12/pi-agent" "$T12/bin-dir"
: > "$T12/pi-invocations"
printf '{invalid\n' > "$T12/pi-agent/settings.json"
settings_before=$(cksum "$T12/pi-agent/settings.json" | awk '{print $1 ":" $2}')
status=0
HOME="$T12/home" \
    PI_CODING_AGENT_DIR="$T12/pi-agent" \
    PRISM_BIN_DIR="$T12/bin-dir" \
    PI_INVOCATIONS="$T12/pi-invocations" \
    PI_SKIP_SETTINGS_WRITE=1 \
    PATH="$T12/bin:$PATH" \
    bash "$INSTALLER" >/dev/null 2>&1 || status=$?
settings_after=$(cksum "$T12/pi-agent/settings.json" | awk '{print $1 ":" $2}')
if [ "$status" -ne 0 ] && [ "$settings_before" = "$settings_after" ] \
    && [ ! -e "$T12/pi-agent/AGENTS.md" ] \
    && [ ! -e "$T12/pi-agent/APPEND_SYSTEM.md" ] \
    && [ ! -e "$T12/bin-dir/prism-tool" ]; then
    pass "reconciliation failure preserves settings and stops deployment"
else
    fail "reconciliation failure changed settings or continued deployment"
fi

T13=$(mktemp -d)
register_temp_dir "$T13"
write_fake_tools "$T13"
mkdir -p "$T13/home" "$T13/pi-agent" "$T13/bin-dir"
: > "$T13/pi-invocations"
printf '{"packages":["npm:@kyaulabs/prism-core","npm:unrelated"]}\n' > "$T13/pi-agent/settings.json"
settings_before=$(cksum "$T13/pi-agent/settings.json" | awk '{print $1 ":" $2}')
status=0
HOME="$T13/home" \
    PI_CODING_AGENT_DIR="$T13/pi-agent" \
    PRISM_BIN_DIR="$T13/bin-dir" \
    PI_INVOCATIONS="$T13/pi-invocations" \
    PI_INSTALL_STATUS=9 \
    PATH="$T13/bin:$PATH" \
    bash "$INSTALLER" >/dev/null 2>&1 || status=$?
settings_after=$(cksum "$T13/pi-agent/settings.json" | awk '{print $1 ":" $2}')
if [ "$status" -ne 0 ] && [ "$settings_before" = "$settings_after" ] \
    && [ ! -e "$T13/pi-agent/AGENTS.md" ] \
    && [ ! -e "$T13/pi-agent/APPEND_SYSTEM.md" ] \
    && [ ! -e "$T13/bin-dir/prism-tool" ]; then
    pass "installation failure preserves the prior source before reconciliation"
else
    fail "installation failure changed settings or continued deployment"
fi

T14=$(mktemp -d)
register_temp_dir "$T14"
write_fake_tools "$T14"
mkdir -p "$T14/home" "$T14/pi-agent" "$T14/bin-dir"
: > "$T14/pi-invocations"
cp -R "$REPO_ROOT/packages/prism-core" "$T14/pi-agent/local-core"
cat > "$T14/pi-agent/local-core/scripts/prism-tool.js" <<'JSEOF'
#!/usr/bin/env node
'use strict';
if (process.argv[2] !== 'doctor') process.exit(2);
process.stdout.write('fixture\tPASS\tready\nGO\n');
JSEOF
chmod +x "$T14/pi-agent/local-core/scripts/prism-tool.js"
cat > "$T14/pi-agent/settings.json" <<EOF
{
  "packages": [
    "npm:@kyaulabs/prism-core",
    "$T14/pi-agent/local-core",
    "npm:unrelated"
  ]
}
EOF
status=0
HOME="$T14/home" \
    PI_CODING_AGENT_DIR="$T14/pi-agent" \
    PRISM_BIN_DIR="$T14/bin-dir" \
    PI_INVOCATIONS="$T14/pi-invocations" \
    PATH="$T14/bin:$PATH" \
    bash "$T14/pi-agent/local-core/scripts/install-global.sh" >/dev/null 2>&1 || status=$?
if [ "$status" -eq 0 ] && [ ! -s "$T14/pi-invocations" ] \
    && node - "$T14/pi-agent/settings.json" "$T14/pi-agent/local-core" <<'JSEOF'
const fs = require('node:fs');
const settings = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
const selected = fs.realpathSync(process.argv[3]);
const expected = [selected, 'npm:unrelated'];
if (JSON.stringify(settings.packages) !== JSON.stringify(expected)) process.exit(1);
JSEOF
then
    pass "an already installed local core reconciles without invoking Pi"
else
    fail "the under-Pi installation path did not reconcile exclusively"
fi

echo "── npm source registry approval ──"
T15=$(mktemp -d)
register_temp_dir "$T15"
write_fake_tools "$T15"
mkdir -p "$T15/home" "$T15/pi-agent" "$T15/bin-dir"
: > "$T15/pi-invocations"
status=0
HOME="$T15/home" \
    PI_CODING_AGENT_DIR="$T15/pi-agent" \
    PRISM_BIN_DIR="$T15/bin-dir" \
    PRISM_CORE_SOURCE='npm:unrelated' \
    PI_INVOCATIONS="$T15/pi-invocations" \
    PATH="$T15/bin:$PATH" \
    bash "$INSTALLER" --network-approved=yes >/dev/null 2>&1 || status=$?
if [ "$status" -ne 0 ] && [ ! -s "$T15/pi-invocations" ]; then
    pass "non-core npm sources are rejected before Pi access"
else
    fail "a non-core npm source reached Pi"
fi

T2=$(mktemp -d)
register_temp_dir "$T2"
write_fake_tools "$T2"
mkdir -p "$T2/home" "$T2/pi-agent" "$T2/bin-dir"
: > "$T2/pi-invocations"
status=0
HOME="$T2/home" \
    PI_CODING_AGENT_DIR="$T2/pi-agent" \
    PRISM_BIN_DIR="$T2/bin-dir" \
    PRISM_CORE_SOURCE='npm:@kyaulabs/prism-core' \
    PI_INVOCATIONS="$T2/pi-invocations" \
    PATH="$T2/bin:$PATH" \
    bash "$INSTALLER" >/dev/null 2>&1 || status=$?
if [ "$status" -ne 0 ] && [ ! -s "$T2/pi-invocations" ]; then
    pass "npm source is rejected before Pi access without registry approval"
else
    fail "npm source ran Pi without exact registry approval"
fi

output=""
status=0
output=$(HOME="$T2/home" \
    PI_CODING_AGENT_DIR="$T2/pi-agent" \
    PRISM_BIN_DIR="$T2/bin-dir" \
    PRISM_CORE_SOURCE='npm:@kyaulabs/prism-core' \
    PI_INVOCATIONS="$T2/pi-invocations" \
    PATH="$T2/bin:$PATH" \
    bash "$INSTALLER" --network-approved=yes 2>&1) || status=$?
if [ "$status" -eq 0 ] \
    && grep -qF 'install npm:@kyaulabs/prism-core|ignore=true' "$T2/pi-invocations"; then
    pass "approved npm installation disables lifecycle scripts"
else
    fail "approved npm installation failed or did not disable lifecycle scripts: $output"
fi
npm_launcher="$T2/bin-dir/prism-tool"
expected_npm_cli="$T2/pi-agent/npm/node_modules/@kyaulabs/prism-core/scripts/prism-tool.js"
if grep -qF "exec node '$expected_npm_cli' \"\$@\"" "$npm_launcher" 2>/dev/null; then
    pass "npm launcher targets the canonical Pi-managed package CLI"
else
    fail "npm launcher does not target the Pi-managed package CLI"
fi

echo "── installer defers standing consent and live readiness to setup ──"
T3=$(mktemp -d)
register_temp_dir "$T3"
write_fake_tools "$T3"
mkdir -p "$T3/home" "$T3/pi-agent" "$T3/bin-dir"
: > "$T3/pi-invocations"
: > "$T3/ocr-invocations"
output=""
status=0
output=$(HOME="$T3/home" \
    PI_CODING_AGENT_DIR="$T3/pi-agent" \
    PRISM_BIN_DIR="$T3/bin-dir" \
    PI_INVOCATIONS="$T3/pi-invocations" \
    OCR_INVOCATIONS="$T3/ocr-invocations" \
    PATH="$T3/bin:$PATH" \
    bash "$INSTALLER" 2>&1) || status=$?
if [ "$status" -eq 0 ] \
    && grep -qFx '✓ prism toolchain local readiness PASS' <<< "$output" \
    && grep -qFx '  • Run /setup to grant standing OCR consent and verify live readiness.' <<< "$output" \
    && ! grep -qF 'llm test' "$T3/ocr-invocations" \
    && grep -qFx "install $REPO_ROOT/packages/prism-core|ignore=unset" "$T3/pi-invocations" \
    && [ "$(wc -l < "$T3/pi-invocations")" -eq 1 ] \
    && [ ! -e "$T3/pi-agent/prism-consent.json" ]; then
    pass "installer performs no live OCR or consent mutation"
else
    fail "installer did not defer consent and live readiness to /setup"
fi
if [ -f "$T3/bin-dir/prism-tool" ] \
    && [ -f "$T3/pi-agent/AGENTS.md" ] \
    && [ -f "$T3/pi-agent/APPEND_SYSTEM.md" ]; then
    pass "local readiness leaves installed launcher and context resources"
else
    fail "local readiness did not retain installed resources"
fi

T4=$(mktemp -d)
register_temp_dir "$T4"
write_fake_tools "$T4"
mkdir -p "$T4/home" "$T4/pi-agent" "$T4/bin-dir"
: > "$T4/pi-invocations"
: > "$T4/ocr-invocations"
output=""
status=0
output=$(HOME="$T4/home" \
    PI_CODING_AGENT_DIR="$T4/pi-agent" \
    PRISM_BIN_DIR="$T4/bin-dir" \
    PI_INVOCATIONS="$T4/pi-invocations" \
    OCR_INVOCATIONS="$T4/ocr-invocations" \
    SEMGREP_VERSION='1.172.9' \
    PATH="$T4/bin:$PATH" \
    bash "$INSTALLER" 2>&1) || status=$?
if [ "$status" -ne 0 ] \
    && grep -qF 'prism toolchain local readiness failed' <<< "$output" \
    && [ -f "$T4/bin-dir/prism-tool" ] \
    && [ -f "$T4/pi-agent/AGENTS.md" ] \
    && ! grep -qFx '  • Run /setup to grant standing OCR consent and verify live readiness.' <<< "$output" \
    && ! grep -qF 'llm test' "$T4/ocr-invocations" \
    && [ ! -e "$T4/pi-agent/prism-consent.json" ]; then
    pass "failed mandatory readiness retains resources and stops before setup"
else
    fail "failed mandatory readiness removed resources or continued to setup"
fi

echo "── launcher ownership and uninstall ──"
T5=$(mktemp -d)
register_temp_dir "$T5"
write_fake_tools "$T5"
mkdir -p "$T5/home" "$T5/pi-agent" "$T5/bin-dir"
: > "$T5/pi-invocations"
printf 'unrelated executable\n' > "$T5/bin-dir/prism-tool"
chmod 0755 "$T5/bin-dir/prism-tool"
status=0
HOME="$T5/home" \
    PI_CODING_AGENT_DIR="$T5/pi-agent" \
    PRISM_BIN_DIR="$T5/bin-dir" \
    PI_INVOCATIONS="$T5/pi-invocations" \
    PATH="$T5/bin:$PATH" \
    bash "$INSTALLER" >/dev/null 2>&1 || status=$?
if [ "$status" -ne 0 ] && [ "$(cat "$T5/bin-dir/prism-tool")" = 'unrelated executable' ]; then
    pass "installer refuses to replace an unrelated executable"
else
    fail "installer replaced or accepted an unrelated executable"
fi
status=0
HOME="$T5/home" \
    PI_CODING_AGENT_DIR="$T5/pi-agent" \
    PRISM_BIN_DIR="$T5/bin-dir" \
    PI_INVOCATIONS="$T5/pi-invocations" \
    PATH="$T5/bin:$PATH" \
    bash "$INSTALLER" --uninstall-launcher >/dev/null 2>&1 || status=$?
if [ "$status" -ne 0 ] && [ -f "$T5/bin-dir/prism-tool" ]; then
    pass "uninstall refuses to remove an unrelated executable"
else
    fail "uninstall removed or accepted an unrelated executable"
fi
cat > "$T5/bin-dir/prism-tool" <<'EOF'
#!/usr/bin/env bash
# prism-core:managed-launcher begin
exit 0
EOF
partial_before=$(cksum "$T5/bin-dir/prism-tool" | awk '{print $1 ":" $2}')
status=0
HOME="$T5/home" \
    PI_CODING_AGENT_DIR="$T5/pi-agent" \
    PRISM_BIN_DIR="$T5/bin-dir" \
    PI_INVOCATIONS="$T5/pi-invocations" \
    PATH="$T5/bin:$PATH" \
    bash "$INSTALLER" >/dev/null 2>&1 || status=$?
partial_after=$(cksum "$T5/bin-dir/prism-tool" | awk '{print $1 ":" $2}')
if [ "$status" -ne 0 ] && [ "$partial_before" = "$partial_after" ]; then
    pass "installer requires both ownership sentinels before replacement"
else
    fail "installer replaced a launcher with incomplete ownership sentinels"
fi
rm -f "$T5/bin-dir/prism-tool"
printf 'symlink target\n' > "$T5/symlink-target"
ln -s "$T5/symlink-target" "$T5/bin-dir/prism-tool"
status=0
HOME="$T5/home" \
    PI_CODING_AGENT_DIR="$T5/pi-agent" \
    PRISM_BIN_DIR="$T5/bin-dir" \
    PI_INVOCATIONS="$T5/pi-invocations" \
    PATH="$T5/bin:$PATH" \
    bash "$INSTALLER" >/dev/null 2>&1 || status=$?
if [ "$status" -ne 0 ] && [ -L "$T5/bin-dir/prism-tool" ] \
    && [ "$(cat "$T5/symlink-target")" = 'symlink target' ]; then
    pass "installer refuses launcher symlinks without touching their targets"
else
    fail "installer accepted a launcher symlink or changed its target"
fi

T6=$(mktemp -d)
register_temp_dir "$T6"
write_fake_tools "$T6"
mkdir -p "$T6/home" "$T6/pi-agent" "$T6/bin-dir"
: > "$T6/pi-invocations"
cat > "$T6/bin-dir/prism-tool" <<'EOF'
#!/usr/bin/env bash
# prism-core:managed-launcher begin
exec node '/stale/prism-tool.js' "$@"
# prism-core:managed-launcher end
EOF
chmod 0755 "$T6/bin-dir/prism-tool"
status=0
HOME="$T6/home" \
    PI_CODING_AGENT_DIR="$T6/pi-agent" \
    PRISM_BIN_DIR="$T6/bin-dir" \
    PI_INVOCATIONS="$T6/pi-invocations" \
    PATH="$T6/bin:$PATH" \
    bash "$INSTALLER" >/dev/null 2>&1 || status=$?
if [ "$status" -eq 0 ] \
    && grep -qF "exec node '$REPO_ROOT/packages/prism-core/scripts/prism-tool.js' \"\$@\"" "$T6/bin-dir/prism-tool"; then
    pass "installer refreshes a launcher carrying both ownership sentinels"
else
    fail "installer did not refresh its owned launcher"
fi
pi_count_before=$(wc -l < "$T6/pi-invocations" | tr -d ' ')
status=0
HOME="$T6/home" \
    PI_CODING_AGENT_DIR="$T6/pi-agent" \
    PRISM_BIN_DIR="$T6/bin-dir" \
    PI_INVOCATIONS="$T6/pi-invocations" \
    PATH="$T6/bin:$PATH" \
    bash "$INSTALLER" --uninstall-launcher >/dev/null 2>&1 || status=$?
if [ "$status" -eq 0 ] && [ ! -e "$T6/bin-dir/prism-tool" ]; then
    pass "uninstall removes only a managed launcher"
else
    fail "uninstall did not remove the managed launcher"
fi
pi_count_after=$(wc -l < "$T6/pi-invocations" | tr -d ' ')
if [ "$pi_count_before" = "$pi_count_after" ]; then
    pass "uninstall exits without an additional Pi installation"
else
    fail "uninstall unexpectedly invoked Pi"
fi

echo "── fail-closed options and paths ──"
T7=$(mktemp -d)
register_temp_dir "$T7"
write_fake_tools "$T7"
mkdir -p "$T7/home" "$T7/pi-agent" "$T7/bin-dir"
: > "$T7/pi-invocations"
unsupported_sources=(
    "$T7/local'core"
    "$T7/local"$'\n'"core"
    "$T7/local"$'\r'"core"
)
unsupported_failed=0
for unsupported_source in "${unsupported_sources[@]}"; do
    cp -R "$REPO_ROOT/packages/prism-core" "$unsupported_source"
    status=0
    HOME="$T7/home" \
        PI_CODING_AGENT_DIR="$T7/pi-agent" \
        PRISM_BIN_DIR="$T7/bin-dir" \
        PRISM_CORE_SOURCE="$unsupported_source" \
        PI_INVOCATIONS="$T7/pi-invocations" \
        PATH="$T7/bin:$PATH" \
        bash "$INSTALLER" >/dev/null 2>&1 || status=$?
    if [ "$status" -eq 0 ] || [ -e "$T7/bin-dir/prism-tool" ]; then
        unsupported_failed=1
    fi
done
if [ "$unsupported_failed" -eq 0 ]; then
    pass "launcher deployment rejects quote, newline, and carriage-return CLI paths"
else
    fail "launcher accepted an unsupported canonical CLI path"
fi

T8=$(mktemp -d)
register_temp_dir "$T8"
write_fake_tools "$T8"
mkdir -p "$T8/home" "$T8/pi-agent" "$T8/bin-dir"
: > "$T8/pi-invocations"
invalid_options=('--network-approved=no' '--ocr-test-approved=yes' '--ocr-test-approved=YES' '--unknown')
for invalid_option in "${invalid_options[@]}"; do
    status=0
    HOME="$T8/home" \
        PI_CODING_AGENT_DIR="$T8/pi-agent" \
        PRISM_BIN_DIR="$T8/bin-dir" \
        PI_INVOCATIONS="$T8/pi-invocations" \
        PATH="$T8/bin:$PATH" \
        bash "$INSTALLER" "$invalid_option" >/dev/null 2>&1 || status=$?
    if [ "$status" -eq 0 ]; then
        fail "installer accepted invalid option $invalid_option"
    fi
done
if [ ! -s "$T8/pi-invocations" ]; then
    pass "non-literal and unknown options fail before Pi access"
else
    fail "an invalid option reached Pi"
fi
output=""
status=0
output=$(HOME="$T8/home" \
    PI_CODING_AGENT_DIR="$T8/pi-agent" \
    PRISM_BIN_DIR="$T8/bin-dir" \
    PI_INVOCATIONS="$T8/pi-invocations" \
    PATH="$T8/bin:$PATH" \
    bash "$INSTALLER" $'--unknown=CANARY-OPTION\nsecond-line' 2>&1) || status=$?
if [ "$status" -ne 0 ] && ! grep -qF 'CANARY-OPTION' <<< "$output"; then
    pass "invalid option diagnostics do not relay untrusted argument text"
else
    fail "invalid option diagnostics relayed untrusted argument text"
fi

T10=$(mktemp -d)
register_temp_dir "$T10"
write_fake_tools "$T10"
mkdir -p "$T10/home" "$T10/pi-agent"
: > "$T10/pi-invocations"
status=0
HOME="$T10/home" \
    PI_CODING_AGENT_DIR="$T10/pi-agent" \
    PI_INVOCATIONS="$T10/pi-invocations" \
    PATH="$T10/bin:$PATH" \
    bash "$INSTALLER" >/dev/null 2>&1 || status=$?
if [ "$status" -eq 0 ] && [ -x "$T10/home/.local/bin/prism-tool" ]; then
    pass "default launcher destination is HOME/.local/bin/prism-tool"
else
    fail "installer did not use the default launcher destination"
fi

print_summary "install global toolchain"
exit $?

# vim: ft=sh sts=4 sw=4 ts=4 et :
