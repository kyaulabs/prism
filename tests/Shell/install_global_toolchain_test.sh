#!/usr/bin/env bash
# $KYAULabs: install_global_toolchain_test.sh kyau@aura.kyaulabs 2026/09/03 -0700 Exp $

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
    printf '{"name":"@kyaulabs/prism-core","version":"0.4.3"}\n' > "$package_root/package.json"
    cat > "$package_root/scripts/prism-tool.js" <<'JSEOF'
#!/usr/bin/env node
'use strict';
if (process.argv[2] !== 'doctor') process.exit(2);
process.stdout.write('fixture\tPASS\tready\nGO\n');
JSEOF
    cat > "$package_root/scripts/prism-review.js" <<'JSEOF'
#!/usr/bin/env node
'use strict';
process.stdout.write(process.argv[2] === '--version' ? '0.4.3\n' : 'fixture review\n');
JSEOF
    chmod +x "$package_root/scripts/prism-tool.js" "$package_root/scripts/prism-review.js"
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

launcher_artifacts_absent() {
    local directory="$1"
    ! compgen -G "$directory/.prism-tool.*" >/dev/null \
        && ! compgen -G "$directory/.prism-review.*" >/dev/null
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
review_launcher="$T1/bin-dir/prism-review"
if [ "$status" -eq 0 ]; then
    pass "local source installation needs no registry approval"
else
    fail "local source installation exited $status: $output"
fi
if [ -f "$launcher" ] && [ ! -L "$launcher" ] && [ "$(file_mode "$launcher")" = "755" ] \
    && [ -f "$review_launcher" ] && [ ! -L "$review_launcher" ] \
    && [ "$(file_mode "$review_launcher")" = "755" ]; then
    pass "managed launchers are mode-0755 regular files"
else
    fail "managed launchers were not installed as mode-0755 regular files"
fi
if grep -qF '# prism-core:managed-launcher prism-tool begin' "$launcher" 2>/dev/null \
    && grep -qF '# prism-core:managed-launcher prism-tool end' "$launcher" 2>/dev/null \
    && grep -qF "exec node '$REPO_ROOT/packages/prism-core/scripts/prism-tool.js' \"\$@\"" "$launcher" 2>/dev/null \
    && grep -qF '# prism-core:managed-launcher prism-review begin' "$review_launcher" 2>/dev/null \
    && grep -qF '# prism-core:managed-launcher prism-review end' "$review_launcher" 2>/dev/null \
    && grep -qF "exec env -u NODE_OPTIONS -u NODE_PATH node '$REPO_ROOT/packages/prism-core/scripts/prism-review.js' \"\$@\"" "$review_launcher" 2>/dev/null; then
    pass "launchers invoke canonical local Core CLIs with distinct ownership sentinels"
else
    fail "launchers do not invoke canonical local Core CLIs"
fi
launcher_output=""
status=0
launcher_output=$(PATH="$T1/bin:$PATH" "$launcher" doctor --local-only 2>&1) || status=$?
if [ "$status" -eq 0 ] && grep -qFx 'GO' <<< "$launcher_output"; then
    pass "installed launcher executes the core CLI"
else
    fail "installed launcher could not execute the core CLI"
fi
review_launcher_output=""
review_status=0
review_launcher_output=$(PATH="$T1/bin:$PATH" "$review_launcher" --version 2>&1) || review_status=$?
if [ "$review_status" -eq 0 ] \
    && grep -Eq '^[0-9]+\.[0-9]+\.[0-9]+$' <<< "$review_launcher_output"; then
    pass "installed review launcher executes the review CLI"
else
    fail "installed review launcher could not execute the review CLI"
fi
cat > "$T1/preload.cjs" <<'JSEOF'
require('node:fs').writeFileSync(process.env.PRISM_PRELOAD_MARKER, 'ran');
JSEOF
preload_status=0
NODE_OPTIONS="--require=$T1/preload.cjs" \
    NODE_PATH="$T1" \
    PRISM_PRELOAD_MARKER="$T1/preload-ran" \
    "$review_launcher" --version >/dev/null 2>&1 || preload_status=$?
if [ "$preload_status" -eq 0 ] && [ ! -e "$T1/preload-ran" ]; then
    pass "installed review launcher strips Node module injection"
else
    fail "installed review launcher accepted Node module injection"
fi
if grep -qFx '✓ prism review packaged executable PASS' <<< "$output"; then
    pass "installer verifies the packaged review executable"
else
    fail "installer omitted packaged review executable verification"
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
review_launcher_before=$(cksum "$review_launcher" | awk '{print $1 ":" $2}')
status=0
HOME="$T1/home" \
    PI_CODING_AGENT_DIR="$T1/pi-agent" \
    PRISM_BIN_DIR="$T1/bin-dir" \
    PI_INVOCATIONS="$T1/pi-invocations" \
    PATH="$T1/bin:$PATH" \
    bash "$INSTALLER" >/dev/null 2>&1 || status=$?
launcher_after=$(cksum "$launcher" | awk '{print $1 ":" $2}')
review_launcher_after=$(cksum "$review_launcher" | awk '{print $1 ":" $2}')
if [ "$status" -eq 0 ] && [ "$launcher_before" = "$launcher_after" ] \
    && [ "$review_launcher_before" = "$review_launcher_after" ]; then
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
cat > "$T14/pi-agent/local-core/scripts/prism-review.js" <<'JSEOF'
#!/usr/bin/env node
'use strict';
if (process.argv[2] !== '--version') process.exit(2);
process.stdout.write('0.4.3\n');
JSEOF
chmod +x "$T14/pi-agent/local-core/scripts/prism-tool.js" \
    "$T14/pi-agent/local-core/scripts/prism-review.js"
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
output=""
output=$(HOME="$T14/home" \
    PI_CODING_AGENT_DIR="$T14/pi-agent" \
    PRISM_BIN_DIR="$T14/bin-dir" \
    PI_INVOCATIONS="$T14/pi-invocations" \
    PATH="$T14/bin:$PATH" \
    bash "$T14/pi-agent/local-core/scripts/install-global.sh" 2>&1) || status=$?
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
    fail "the under-Pi installation path did not reconcile exclusively: $output"
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
npm_review_launcher="$T2/bin-dir/prism-review"
expected_npm_cli="$T2/pi-agent/npm/node_modules/@kyaulabs/prism-core/scripts/prism-tool.js"
expected_npm_review_cli="$T2/pi-agent/npm/node_modules/@kyaulabs/prism-core/scripts/prism-review.js"
npm_review_output=""
npm_review_status=0
npm_review_output=$(PATH="$T2/bin:$PATH" "$npm_review_launcher" --fixture-argument 2>&1) || npm_review_status=$?
if grep -qF "exec node '$expected_npm_cli' \"\$@\"" "$npm_launcher" 2>/dev/null \
    && grep -qF "exec env -u NODE_OPTIONS -u NODE_PATH node '$expected_npm_review_cli' \"\$@\"" "$npm_review_launcher" 2>/dev/null \
    && [ -f "$expected_npm_review_cli" ] \
    && [ "$npm_review_status" -eq 0 ] \
    && grep -qFx 'fixture review' <<< "$npm_review_output"; then
    pass "npm launchers target executable canonical package CLIs"
else
    fail "npm launchers do not target executable package CLIs"
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
cat > "$T5/bin-dir/prism-tool" <<'EOF'
#!/usr/bin/env bash
# prism-core:managed-launcher prism-tool begin
printf 'not a managed wrapper\n'
# prism-core:managed-launcher prism-tool end
EOF
spoof_before=$(cksum "$T5/bin-dir/prism-tool" | awk '{print $1 ":" $2}')
status=0
HOME="$T5/home" \
    PI_CODING_AGENT_DIR="$T5/pi-agent" \
    PRISM_BIN_DIR="$T5/bin-dir" \
    PI_INVOCATIONS="$T5/pi-invocations" \
    PATH="$T5/bin:$PATH" \
    bash "$INSTALLER" >/dev/null 2>&1 || status=$?
spoof_after=$(cksum "$T5/bin-dir/prism-tool" | awk '{print $1 ":" $2}')
if [ "$status" -ne 0 ] && [ "$spoof_before" = "$spoof_after" ]; then
    pass "installer rejects sentinel-shaped unmanaged launchers"
else
    fail "installer accepted a launcher based only on sentinels"
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
cat > "$T6/bin-dir/prism-review" <<'EOF'
#!/usr/bin/env bash
# prism-core:managed-launcher prism-review begin
exec node '/stale/prism-review.js' "$@"
# prism-core:managed-launcher prism-review end
EOF
chmod 0755 "$T6/bin-dir/prism-review"
status=0
HOME="$T6/home" \
    PI_CODING_AGENT_DIR="$T6/pi-agent" \
    PRISM_BIN_DIR="$T6/bin-dir" \
    PI_INVOCATIONS="$T6/pi-invocations" \
    PATH="$T6/bin:$PATH" \
    bash "$INSTALLER" >/dev/null 2>&1 || status=$?
if [ "$status" -eq 0 ] \
    && grep -qF "exec node '$REPO_ROOT/packages/prism-core/scripts/prism-tool.js' \"\$@\"" "$T6/bin-dir/prism-tool" \
    && grep -qF "exec env -u NODE_OPTIONS -u NODE_PATH node '$REPO_ROOT/packages/prism-core/scripts/prism-review.js' \"\$@\"" "$T6/bin-dir/prism-review"; then
    pass "installer refreshes and completes its owned launcher set"
else
    fail "installer did not refresh its owned launcher set"
fi
pi_count_before=$(wc -l < "$T6/pi-invocations" | tr -d ' ')
status=0
HOME="$T6/home" \
    PI_CODING_AGENT_DIR="$T6/pi-agent" \
    PRISM_BIN_DIR="$T6/bin-dir" \
    PI_INVOCATIONS="$T6/pi-invocations" \
    PATH="$T6/bin:$PATH" \
    bash "$INSTALLER" --uninstall-launcher >/dev/null 2>&1 || status=$?
if [ "$status" -eq 0 ] && [ ! -e "$T6/bin-dir/prism-tool" ] \
    && [ ! -e "$T6/bin-dir/prism-review" ]; then
    pass "uninstall removes only managed launchers"
else
    fail "uninstall did not remove the managed launchers"
fi
pi_count_after=$(wc -l < "$T6/pi-invocations" | tr -d ' ')
if [ "$pi_count_before" = "$pi_count_after" ]; then
    pass "uninstall exits without an additional Pi installation"
else
    fail "uninstall unexpectedly invoked Pi"
fi

T5B=$(mktemp -d)
register_temp_dir "$T5B"
write_fake_tools "$T5B"
mkdir -p "$T5B/home" "$T5B/pi-agent" "$T5B/bin-dir"
: > "$T5B/pi-invocations"
printf 'unrelated review executable\n' > "$T5B/bin-dir/prism-review"
chmod 0755 "$T5B/bin-dir/prism-review"
status=0
HOME="$T5B/home" \
    PI_CODING_AGENT_DIR="$T5B/pi-agent" \
    PRISM_BIN_DIR="$T5B/bin-dir" \
    PI_INVOCATIONS="$T5B/pi-invocations" \
    PATH="$T5B/bin:$PATH" \
    bash "$INSTALLER" >/dev/null 2>&1 || status=$?
if [ "$status" -ne 0 ] && [ ! -e "$T5B/bin-dir/prism-tool" ] \
    && [ "$(cat "$T5B/bin-dir/prism-review")" = 'unrelated review executable' ]; then
    pass "a review-launcher collision blocks both launcher writes"
else
    fail "a review-launcher collision caused a partial launcher write"
fi
cat > "$T5B/bin-dir/prism-tool" <<'EOF'
#!/usr/bin/env bash
# prism-core:managed-launcher prism-tool begin
exit 0
# prism-core:managed-launcher prism-tool end
EOF
chmod 0755 "$T5B/bin-dir/prism-tool"
status=0
HOME="$T5B/home" \
    PI_CODING_AGENT_DIR="$T5B/pi-agent" \
    PRISM_BIN_DIR="$T5B/bin-dir" \
    PI_INVOCATIONS="$T5B/pi-invocations" \
    PATH="$T5B/bin:$PATH" \
    bash "$INSTALLER" --uninstall-launcher >/dev/null 2>&1 || status=$?
if [ "$status" -ne 0 ] && [ -e "$T5B/bin-dir/prism-tool" ] \
    && [ "$(cat "$T5B/bin-dir/prism-review")" = 'unrelated review executable' ]; then
    pass "uninstall collision preserves the complete launcher set"
else
    fail "uninstall collision removed part of the launcher set"
fi

T5B2=$(mktemp -d)
register_temp_dir "$T5B2"
write_fake_tools "$T5B2"
mkdir -p "$T5B2/home" "$T5B2/pi-agent" "$T5B2/bin-dir"
: > "$T5B2/pi-invocations"
cat > "$T5B2/bin-dir/prism-tool" <<'EOF'
#!/usr/bin/env bash
# prism-core:managed-launcher prism-tool begin
exec node '/previous/prism-tool.js' "$@"
# prism-core:managed-launcher prism-tool end
EOF
cat > "$T5B2/bin-dir/prism-review" <<'EOF'
#!/usr/bin/env bash
# prism-core:managed-launcher prism-review begin
exec node '/previous/prism-review.js' "$@"
# prism-core:managed-launcher prism-review end
EOF
chmod 0755 "$T5B2/bin-dir/prism-tool" "$T5B2/bin-dir/prism-review"
tool_before=$(cksum "$T5B2/bin-dir/prism-tool")
review_before=$(cksum "$T5B2/bin-dir/prism-review")
cat > "$T5B2/bin/mv" <<'EOF'
#!/usr/bin/env bash
for argument in "$@"; do
    if [ "$argument" = "${FAIL_MOVE_SOURCE:-}" ]; then exit 70; fi
done
exec /usr/bin/mv "$@"
EOF
chmod 0755 "$T5B2/bin/mv"
status=0
HOME="$T5B2/home" \
    PI_CODING_AGENT_DIR="$T5B2/pi-agent" \
    PRISM_BIN_DIR="$T5B2/bin-dir" \
    PI_INVOCATIONS="$T5B2/pi-invocations" \
    FAIL_MOVE_SOURCE="$T5B2/bin-dir/prism-review" \
    PATH="$T5B2/bin:$PATH" \
    bash "$INSTALLER" --uninstall-launcher >/dev/null 2>&1 || status=$?
if [ "$status" -ne 0 ] \
    && [ "$tool_before" = "$(cksum "$T5B2/bin-dir/prism-tool")" ] \
    && [ "$review_before" = "$(cksum "$T5B2/bin-dir/prism-review")" ]; then
    pass "failed uninstall restores the managed launcher pair"
else
    fail "failed uninstall removed part of the managed launcher pair"
fi

T5C=$(mktemp -d)
register_temp_dir "$T5C"
write_fake_tools "$T5C"
mkdir -p "$T5C/home" "$T5C/pi-agent" "$T5C/bin-dir"
: > "$T5C/pi-invocations"
cat > "$T5C/bin-dir/prism-tool" <<'EOF'
#!/usr/bin/env bash
# prism-core:managed-launcher prism-tool begin
exec node '/previous/prism-tool.js' "$@"
# prism-core:managed-launcher prism-tool end
EOF
cat > "$T5C/bin-dir/prism-review" <<'EOF'
#!/usr/bin/env bash
# prism-core:managed-launcher prism-review begin
exec node '/previous/prism-review.js' "$@"
# prism-core:managed-launcher prism-review end
EOF
chmod 0755 "$T5C/bin-dir/prism-tool" "$T5C/bin-dir/prism-review"
tool_before=$(cksum "$T5C/bin-dir/prism-tool")
review_before=$(cksum "$T5C/bin-dir/prism-review")
cat > "$T5C/bin/mv" <<'EOF'
#!/usr/bin/env bash
for argument in "$@"; do
    if [ "$argument" = "${FAIL_MOVE_DEST:-}" ]; then exit 70; fi
done
exec /usr/bin/mv "$@"
EOF
chmod 0755 "$T5C/bin/mv"
status=0
HOME="$T5C/home" \
    PI_CODING_AGENT_DIR="$T5C/pi-agent" \
    PRISM_BIN_DIR="$T5C/bin-dir" \
    PI_INVOCATIONS="$T5C/pi-invocations" \
    FAIL_MOVE_DEST="$T5C/bin-dir/prism-review" \
    PATH="$T5C/bin:$PATH" \
    bash "$INSTALLER" >/dev/null 2>&1 || status=$?
if [ "$status" -ne 0 ] \
    && [ "$tool_before" = "$(cksum "$T5C/bin-dir/prism-tool")" ] \
    && [ "$review_before" = "$(cksum "$T5C/bin-dir/prism-review")" ]; then
    pass "failed pair deployment restores existing launchers"
else
    fail "failed pair deployment did not restore existing launchers"
fi

T5D=$(mktemp -d)
register_temp_dir "$T5D"
write_fake_tools "$T5D"
mkdir -p "$T5D/home" "$T5D/pi-agent" "$T5D/bin-dir"
: > "$T5D/pi-invocations"
cat > "$T5D/bin/mv" <<'EOF'
#!/usr/bin/env bash
destination=""
for argument in "$@"; do destination="$argument"; done
if [ "$destination" = "${RACE_MOVE_DEST:-}" ] && [ ! -e "${RACE_MARKER:-}" ]; then
    printf 'concurrent unmanaged launcher\n' > "$destination"
    chmod 0755 "$destination"
    : > "$RACE_MARKER"
fi
exec /usr/bin/mv "$@"
EOF
chmod 0755 "$T5D/bin/mv"
status=0
HOME="$T5D/home" \
    PI_CODING_AGENT_DIR="$T5D/pi-agent" \
    PRISM_BIN_DIR="$T5D/bin-dir" \
    PI_INVOCATIONS="$T5D/pi-invocations" \
    RACE_MOVE_DEST="$T5D/bin-dir/prism-tool" \
    RACE_MARKER="$T5D/raced" \
    PATH="$T5D/bin:$PATH" \
    bash "$INSTALLER" >/dev/null 2>&1 || status=$?
if [ "$status" -ne 0 ] \
    && [ "$(cat "$T5D/bin-dir/prism-tool" 2>/dev/null)" = 'concurrent unmanaged launcher' ] \
    && [ ! -e "$T5D/bin-dir/prism-review" ]; then
    pass "tool launcher commit does not overwrite a concurrent unmanaged file"
else
    fail "tool launcher commit overwrote or accepted a concurrent unmanaged file"
fi

T5D2=$(mktemp -d)
register_temp_dir "$T5D2"
write_fake_tools "$T5D2"
mkdir -p "$T5D2/home" "$T5D2/pi-agent" "$T5D2/bin-dir"
: > "$T5D2/pi-invocations"
cat > "$T5D2/bin/mv" <<'EOF'
#!/usr/bin/env bash
destination=""
for argument in "$@"; do destination="$argument"; done
if [ "$destination" = "${RACE_MOVE_DEST:-}" ] && [ ! -e "${RACE_MARKER:-}" ]; then
    printf 'concurrent unmanaged launcher\n' > "$destination"
    chmod 0755 "$destination"
    : > "$RACE_MARKER"
fi
exec /usr/bin/mv "$@"
EOF
chmod 0755 "$T5D2/bin/mv"
status=0
HOME="$T5D2/home" \
    PI_CODING_AGENT_DIR="$T5D2/pi-agent" \
    PRISM_BIN_DIR="$T5D2/bin-dir" \
    PI_INVOCATIONS="$T5D2/pi-invocations" \
    RACE_MOVE_DEST="$T5D2/bin-dir/prism-review" \
    RACE_MARKER="$T5D2/raced" \
    PATH="$T5D2/bin:$PATH" \
    bash "$INSTALLER" >/dev/null 2>&1 || status=$?
if [ "$status" -ne 0 ] \
    && [ "$(cat "$T5D2/bin-dir/prism-review" 2>/dev/null)" = 'concurrent unmanaged launcher' ] \
    && [ ! -e "$T5D2/bin-dir/prism-tool" ]; then
    pass "review launcher commit does not overwrite a concurrent unmanaged file"
else
    fail "review launcher commit overwrote or accepted a concurrent unmanaged file"
fi

T5E=$(mktemp -d)
register_temp_dir "$T5E"
write_fake_tools "$T5E"
mkdir -p "$T5E/home" "$T5E/pi-agent" "$T5E/bin-dir/.prism-launchers.lock"
: > "$T5E/pi-invocations"
status=0
HOME="$T5E/home" \
    PI_CODING_AGENT_DIR="$T5E/pi-agent" \
    PRISM_BIN_DIR="$T5E/bin-dir" \
    PI_INVOCATIONS="$T5E/pi-invocations" \
    PATH="$T5E/bin:$PATH" \
    bash "$INSTALLER" >/dev/null 2>&1 || status=$?
if [ "$status" -ne 0 ] && [ ! -e "$T5E/bin-dir/prism-tool" ] \
    && [ ! -e "$T5E/bin-dir/prism-review" ]; then
    pass "launcher deployment rejects a concurrent transaction"
else
    fail "launcher deployment was not serialized"
fi

T5F=$(mktemp -d)
register_temp_dir "$T5F"
write_fake_tools "$T5F"
mkdir -p "$T5F/home" "$T5F/pi-agent" "$T5F/bin-dir"
: > "$T5F/pi-invocations"
cat > "$T5F/bin-dir/prism-tool" <<'EOF'
#!/usr/bin/env bash
# prism-core:managed-launcher prism-tool begin
exec node '/previous/prism-tool.js' "$@"
# prism-core:managed-launcher prism-tool end
EOF
cat > "$T5F/bin-dir/prism-review" <<'EOF'
#!/usr/bin/env bash
# prism-core:managed-launcher prism-review begin
exec node '/previous/prism-review.js' "$@"
# prism-core:managed-launcher prism-review end
EOF
chmod 0755 "$T5F/bin-dir/prism-tool" "$T5F/bin-dir/prism-review"
tool_before=$(cksum "$T5F/bin-dir/prism-tool")
review_before=$(cksum "$T5F/bin-dir/prism-review")
tool_mode_before=$(file_mode "$T5F/bin-dir/prism-tool")
review_mode_before=$(file_mode "$T5F/bin-dir/prism-review")
cat > "$T5F/bin/mv" <<'EOF'
#!/usr/bin/env bash
destination=""
for argument in "$@"; do destination="$argument"; done
/usr/bin/mv "$@" || exit $?
case "$destination" in
    "$SIGNAL_MOVE_DIR"/.prism-tool.backup.*)
        if [ ! -e "${SIGNAL_MARKER:-}" ]; then
            : > "$SIGNAL_MARKER"
            kill -TERM "$PPID"
        fi
        ;;
esac
EOF
chmod 0755 "$T5F/bin/mv"
status=0
HOME="$T5F/home" \
    PI_CODING_AGENT_DIR="$T5F/pi-agent" \
    PRISM_BIN_DIR="$T5F/bin-dir" \
    PI_INVOCATIONS="$T5F/pi-invocations" \
    SIGNAL_MOVE_DIR="$T5F/bin-dir" \
    SIGNAL_MARKER="$T5F/signalled" \
    PATH="$T5F/bin:$PATH" \
    bash "$INSTALLER" >/dev/null 2>&1 || status=$?
if [ "$status" -ne 0 ] \
    && [ -e "$T5F/signalled" ] \
    && [ -f "$T5F/bin-dir/prism-tool" ] && [ ! -L "$T5F/bin-dir/prism-tool" ] \
    && [ -f "$T5F/bin-dir/prism-review" ] && [ ! -L "$T5F/bin-dir/prism-review" ] \
    && [ "$tool_before" = "$(cksum "$T5F/bin-dir/prism-tool")" ] \
    && [ "$review_before" = "$(cksum "$T5F/bin-dir/prism-review")" ] \
    && [ "$tool_mode_before" = "$(file_mode "$T5F/bin-dir/prism-tool")" ] \
    && [ "$review_mode_before" = "$(file_mode "$T5F/bin-dir/prism-review")" ] \
    && [ ! -e "$T5F/bin-dir/.prism-launchers.lock" ] \
    && launcher_artifacts_absent "$T5F/bin-dir"; then
    pass "launcher deployment rolls back on TERM"
else
    fail "launcher deployment did not roll back after TERM"
fi
rm -f "$T5F/signalled"
status=0
HOME="$T5F/home" \
    PI_CODING_AGENT_DIR="$T5F/pi-agent" \
    PRISM_BIN_DIR="$T5F/bin-dir" \
    PI_INVOCATIONS="$T5F/pi-invocations" \
    SIGNAL_MOVE_DIR="$T5F/bin-dir" \
    SIGNAL_MARKER="$T5F/signalled" \
    PATH="$T5F/bin:$PATH" \
    bash "$INSTALLER" --uninstall-launcher >/dev/null 2>&1 || status=$?
if [ "$status" -ne 0 ] \
    && [ -e "$T5F/signalled" ] \
    && [ -f "$T5F/bin-dir/prism-tool" ] && [ ! -L "$T5F/bin-dir/prism-tool" ] \
    && [ -f "$T5F/bin-dir/prism-review" ] && [ ! -L "$T5F/bin-dir/prism-review" ] \
    && [ "$tool_before" = "$(cksum "$T5F/bin-dir/prism-tool")" ] \
    && [ "$review_before" = "$(cksum "$T5F/bin-dir/prism-review")" ] \
    && [ "$tool_mode_before" = "$(file_mode "$T5F/bin-dir/prism-tool")" ] \
    && [ "$review_mode_before" = "$(file_mode "$T5F/bin-dir/prism-review")" ] \
    && [ ! -e "$T5F/bin-dir/.prism-launchers.lock" ] \
    && launcher_artifacts_absent "$T5F/bin-dir"; then
    pass "launcher uninstall rolls back on TERM"
else
    fail "launcher uninstall did not roll back after TERM"
fi

T5G=$(mktemp -d)
register_temp_dir "$T5G"
write_fake_tools "$T5G"
mkdir -p "$T5G/home" "$T5G/pi-agent" "$T5G/bin-dir"
: > "$T5G/pi-invocations"
cat > "$T5G/bin/chmod" <<'EOF'
#!/usr/bin/env bash
for argument in "$@"; do
    case "$argument" in
        "$FAIL_CHMOD_DIR"/.prism-tool.*) exit 70 ;;
    esac
done
exec /usr/bin/chmod "$@"
EOF
chmod 0755 "$T5G/bin/chmod"
status=0
HOME="$T5G/home" \
    PI_CODING_AGENT_DIR="$T5G/pi-agent" \
    PRISM_BIN_DIR="$T5G/bin-dir" \
    PI_INVOCATIONS="$T5G/pi-invocations" \
    FAIL_CHMOD_DIR="$T5G/bin-dir" \
    PATH="$T5G/bin:$PATH" \
    bash "$INSTALLER" >/dev/null 2>&1 || status=$?
if [ "$status" -ne 0 ] && [ ! -e "$T5G/bin-dir/prism-tool" ] \
    && [ ! -e "$T5G/bin-dir/prism-review" ]; then
    pass "launcher preparation failure stops before pair mutation"
else
    fail "launcher preparation failure was masked"
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

T7B=$(mktemp -d)
register_temp_dir "$T7B"
write_fake_tools "$T7B"
mkdir -p "$T7B/home" "$T7B/pi-agent" "$T7B/bin-dir" \
    "$T7B/source/scripts" "$T7B/external/scripts"
: > "$T7B/pi-invocations"
printf '{"name":"@kyaulabs/prism-core","version":"0.4.3"}\n' > "$T7B/source/package.json"
cat > "$T7B/source/scripts/prism-tool.js" <<'JSEOF'
#!/usr/bin/env node
'use strict';
if (process.argv[2] !== 'doctor') process.exit(2);
process.stdout.write('{"status":"GO"}\n');
JSEOF
printf '{"name":"@kyaulabs/prism-core","version":"0.4.3"}\n' > "$T7B/external/package.json"
cat > "$T7B/external/scripts/prism-review.js" <<'JSEOF'
#!/usr/bin/env node
'use strict';
process.stdout.write('0.4.3\n');
JSEOF
chmod +x "$T7B/source/scripts/prism-tool.js" "$T7B/external/scripts/prism-review.js"
ln -s "$T7B/external/scripts/prism-review.js" "$T7B/source/scripts/prism-review.js"
status=0
HOME="$T7B/home" \
    PI_CODING_AGENT_DIR="$T7B/pi-agent" \
    PRISM_BIN_DIR="$T7B/bin-dir" \
    PRISM_CORE_SOURCE="$T7B/source" \
    PI_INVOCATIONS="$T7B/pi-invocations" \
    PATH="$T7B/bin:$PATH" \
    bash "$INSTALLER" >/dev/null 2>&1 || status=$?
if [ "$status" -ne 0 ] && [ ! -e "$T7B/bin-dir/prism-review" ]; then
    pass "installer rejects a review CLI outside the selected Core package"
else
    fail "installer accepted a review CLI outside the selected Core package"
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
if [ "$status" -eq 0 ] && [ -x "$T10/home/.local/bin/prism-tool" ] \
    && [ -x "$T10/home/.local/bin/prism-review" ]; then
    pass "default launcher destination contains both managed launchers"
else
    fail "installer did not use the default launcher destination"
fi

print_summary "install global toolchain"
exit $?

# vim: ft=sh sts=4 sw=4 ts=4 et :
