#!/usr/bin/env bash
# $KYAULabs: source_checkout_setup_test.sh kyau@aura.kyaulabs 2026/09/07 -0700 Exp $

# Instruction-owned source setup dispatch; native classification is exercised
# independently through the public CLI in prism-tool-source-checkout.test.js.
set -euo pipefail
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"

node - "$REPO_ROOT/packages/prism-core/prompts/setup.md" <<'NODE'
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const prompt = fs.readFileSync(process.argv[2], 'utf8');
const section = (heading) => {
    const start = prompt.indexOf(`## ${heading}\n`);
    assert.notEqual(start, -1, `missing ${heading}`);
    const end = prompt.indexOf('\n## ', start + 4);
    return prompt.slice(start, end === -1 ? undefined : end).replace(/\s+/g, ' ');
};
const entry = section('Setup entry routing');
assert.ok(entry.indexOf('- `SOURCE_CHECKOUT`') >= 0, 'source dispatch is explicit');
assert.ok(entry.indexOf('- `SOURCE_CHECKOUT`') < entry.indexOf('- `ESTABLISHED`'), 'source dispatch precedes consumers');
assert.match(section('Source checkout setup'), /NO_ACTIVE_BOOTSTRAP/);
assert.match(section('Source checkout setup'), /preserv/i);
assert.match(section('Source checkout setup'), /Any active, ambiguous, or recovery-required state stops/);
assert.match(section('Source checkout setup'), /Never adopt, delete, replay, or recover/);
assert.match(section('Source checkout setup'), /independent approvals/);
assert.match(section('Source checkout setup'), /no.*review authority/);
assert.match(section('6. Detect and offer the project adapter'), /FAIL, never implicit Core-only success/);
assert.match(section('6. Detect and offer the project adapter'), /do not rewrite `\.pi\/settings\.json`/);
for (const heading of ['5. Managed npm package releases', '6. Detect and offer the project adapter',
    '7. Provision the declared adapter toolchain', '8. Git hooks']) {
    assert.match(section(heading), /SOURCE_CHECKOUT.*(?:skip|preserve)/i, `${heading} guards source effects`);
}
console.log('PASS: source setup dispatch and project-effect guards');
const validation = section('11. Validate and report');
assert.match(validation, /expand and run `\/check`/);
assert.match(validation, /clean-tree and branch/);
assert.match(validation, /final.*prism-tool setup route --json/i);
assert.match(validation, /same.*SOURCE_CHECKOUT_SETUP/);
assert.match(validation, /NO-GO/);
assert.match(validation, /Missing tools, missing or invalid adapter activation, any failed quality gate/);
assert.match(validation, /A missing validator or nonzero exit is FAIL, not SKIPPED/);
assert.match(validation, /bootstrap continuity was clear/);
assert.match(validation, /preserved.*not applicable/i);
assert.doesNotMatch(validation, /prism-tool hook pre-commit/);
console.log('PASS: source success requires quality checks and final identity revalidation');

// Run the actual instruction-owned validator block with a test-owned executable.
// This proves exit propagation, not a synthetic native classifier/quality pass.
const os = require('node:os');
const path = require('node:path');
const {spawnSync} = require('node:child_process');
const blocks = [...prompt.matchAll(/```bash\n([\s\S]*?)```/g)].map((match) => match[1]);
const validatorBlocks = blocks.filter((block) => block.includes('/absolute/resolved/scripts/validate-harness.sh'));
assert.equal(validatorBlocks.length, 1);
assert.equal(validatorBlocks[0].trim(), 'bash /absolute/resolved/scripts/validate-harness.sh');
const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'prism-source-workflow-'));
try {
    const validator = path.join(temporary, 'validate-harness.sh');
    fs.writeFileSync(validator, '#!/usr/bin/env bash\nprintf "validator executed\\n"\nexit "$SOURCE_VALIDATOR_EXIT"\n', {mode: 0o700});
    const quoted = `'${validator.replaceAll("'", "'\\''")}'`;
    const command = validatorBlocks[0].replace('/absolute/resolved/scripts/validate-harness.sh', quoted);
    for (const exitCode of [0, 17]) {
        const result = spawnSync('bash', ['-c', command], {
            cwd: temporary, encoding: 'utf8', timeout: 5000,
            env: {PATH: process.env.PATH, SOURCE_VALIDATOR_EXIT: String(exitCode)},
        });
        assert.equal(result.status, exitCode, result.stderr);
        assert.equal(result.stdout, 'validator executed\n');
    }
} finally { fs.rmSync(temporary, {recursive: true, force: true}); }
console.log('PASS: instruction-owned validator block preserves success and failure exits');
NODE

# vim: ft=sh sts=4 sw=4 ts=4 et :
