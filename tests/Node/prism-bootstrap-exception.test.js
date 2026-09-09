// $KYAULabs: prism-bootstrap-exception.test.js kyau@aura.kyaulabs 2026/09/08 -0700 Exp $

'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');

test('bootstrap approval binds exact branch, HEAD, base and committed specification', () => {
    const {parseBootstrapApproval} = require('../../packages/prism-core/scripts/prism-tool/bootstrap-exception');
    assert.deepEqual(parseBootstrapApproval([
        '--approval=yes', '--branch', 'fix/tester-abcd-bootstrap', '--head-sha', '1'.repeat(40),
        '--base-sha', '2'.repeat(40), '--criteria-commit', '3'.repeat(40),
        '--criteria-path', 'docs/specs/approved.md',
    ]), {branch: 'fix/tester-abcd-bootstrap', headSha: '1'.repeat(40), baseSha: '2'.repeat(40),
        criteriaCommit: '3'.repeat(40), criteriaPath: 'docs/specs/approved.md'});
});

async function preflightCase(t, scenario) {
    const fs = require('node:fs');
    const os = require('node:os');
    const path = require('node:path');
    const {execFileSync} = require('node:child_process');
    const {prCommand} = require('../../packages/prism-core/scripts/prism-tool/pr');
    const {CORE_GATE_IDS} = require('../../packages/prism-core/scripts/prism-review/core-quality');
    const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'prism-bootstrap-test-'));
    t.after(() => fs.rmSync(cwd, {recursive: true, force: true}));
    execFileSync('git', ['init', '-q', '-b', 'fix/tester-abcd-bootstrap'], {cwd});
    const branch = 'fix/tester-abcd-bootstrap';
    const headSha = '1'.repeat(40);
    const baseSha = '2'.repeat(40);
    const args = ['--approval=yes', '--branch', branch, '--head-sha', headSha,
        '--base-sha', baseSha, '--criteria-commit', '3'.repeat(40), '--criteria-path', 'docs/specs/approved.md'];
    if (scenario === 'unsafe-chain') {
        fs.mkdirSync(path.join(cwd, '.pi/prism-tool/code-review'), {recursive: true, mode: 0o700});
        fs.writeFileSync(path.join(cwd, '.pi/prism-tool/code-review/review-chain.json'), '{}', {mode: 0o600});
    }
    let checks = 0;
    let output = '';
    const original = process.stdout.write;
    process.stdout.write = chunk => { output += chunk; return true; };
    try {
        const status = await prCommand(['bootstrap-preflight', ...args], {cwd, run(command, argv) {
            let stdout = '';
            let status = 0;
            if (command === process.execPath && argv.includes('bootstrap-checks')) {
                checks++;
                stdout = JSON.stringify({schemaVersion: 1, kind: 'LOCAL_BOOTSTRAP_CHECKS',
                    identity: {branch, baseRef: 'origin/develop', baseSha, headSha},
                    core: {status: 'PASS', gates: CORE_GATE_IDS.filter((id, index) => scenario !== 'missing-gate' || index !== 0)
                        .map(id => ({id, status: 'PASS'}))}, adapter: null});
                if (scenario === 'failed-checks') status = 4;
                if (scenario === 'wrong-check-binding') stdout = stdout.replace(headSha, '4'.repeat(40));
            } else if (command === 'git') {
                const query = argv.join(' ');
                if (query.startsWith('symbolic-ref')) stdout = branch;
                else if (query.startsWith('rev-list')) stdout = '2';
                else if (query === 'rev-parse HEAD') stdout = scenario === 'stale-head' ||
                    (scenario === 'changed-after-checks' && checks > 0) ? '4'.repeat(40) : headSha;
                else if (query.startsWith('ls-tree')) stdout = scenario === 'spec-symlink' ? '120000' : '100644';
                else if (query.startsWith('cat-file -t')) stdout = 'blob';
                else if (query.startsWith('rev-parse')) stdout = baseSha;
                else if (query === 'merge-base origin/develop HEAD') stdout = baseSha;
                else if (query.startsWith('diff --quiet')) status = 1;
                else if (query.startsWith('status ') && (scenario === 'dirty' ||
                    (scenario === 'dirty-after-checks' && checks > 0))) stdout = ' M dirty.txt';
                else assert.ok(query.startsWith('status ') || query.startsWith('merge-base --is-ancestor'), query);
                if (scenario === 'base-moved' && query.startsWith('rev-parse') && query.includes('origin/develop')) stdout = '4'.repeat(40);
            } else assert.ok(command === process.execPath || command === 'bash');
            return {status, stdout, stderr: ''};
        }});
        if (scenario !== 'valid') {
            assert.equal(status, 4);
            assert.doesNotMatch(output, /USER_WAIVED/);
            return;
        }
        assert.equal(status, 0);
        assert.equal(checks, 1);
        assert.match(output, /REVIEW_CHAIN\tUSER_WAIVED/);
        assert.match(output, /LOCAL_CHECKS\tPASS/);
        assert.match(output, /TARGET_BRANCH\tdevelop/);
        assert.doesNotMatch(output, /REVIEW_CHAIN\tVALID/);
    } finally { process.stdout.write = original; }
}

test('bootstrap preflight preserves exact approval and all non-waived gates', async (t) => {
    for (const scenario of ['valid', 'stale-head', 'base-moved', 'dirty', 'failed-checks', 'missing-gate',
        'unsafe-chain', 'spec-symlink', 'changed-after-checks', 'dirty-after-checks', 'wrong-check-binding']) {
        await t.test(scenario, child => preflightCase(child, scenario));
    }
});
test('local bootstrap checks reject a dirty revision without publishing review evidence', async () => {
    const {prCommand} = require('../../packages/prism-core/scripts/prism-tool/pr');
    const args = ['--approval=yes', '--branch', 'fix/tester-abcd-bootstrap', '--head-sha', '1'.repeat(40),
        '--base-sha', '2'.repeat(40), '--criteria-commit', '3'.repeat(40), '--criteria-path', 'docs/specs/approved.md'];
    const status = await prCommand(['bootstrap-checks', ...args], {run(command, argv) {
        assert.equal(command, 'git');
        const query = argv.join(' ');
        const stdout = query.startsWith('symbolic-ref') ? 'fix/tester-abcd-bootstrap' :
            query === 'rev-parse HEAD' ? '1'.repeat(40) : query.startsWith('rev-parse') ? '2'.repeat(40) : ' M dirty.txt';
        return {status: 0, stdout, stderr: ''};
    }});
    assert.equal(status, 4);
});
test('local bootstrap checks execute gates without minting authoritative receipts', async (t) => {
    const fs = require('node:fs');
    const os = require('node:os');
    const path = require('node:path');
    const {execFileSync} = require('node:child_process');
    const {prCommand} = require('../../packages/prism-core/scripts/prism-tool/pr');
    const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'prism-local-checks-test-'));
    t.after(() => fs.rmSync(cwd, {recursive: true, force: true}));
    execFileSync('git', ['init', '-q'], {cwd});
    const args = ['--approval=yes', '--branch', 'fix/tester-abcd-bootstrap', '--head-sha', '1'.repeat(40),
        '--base-sha', '2'.repeat(40), '--criteria-commit', '3'.repeat(40), '--criteria-path', 'docs/specs/approved.md'];
    let gates = 0;
    let stdout = '';
    const original = process.stdout.write;
    process.stdout.write = chunk => { stdout += chunk; return true; };
    try {
        const status = await prCommand(['bootstrap-checks', ...args], {cwd, run(command, argv) {
            assert.equal(command, 'git');
            const query = argv.join(' ');
            const stdout = query.startsWith('symbolic-ref') ? 'fix/tester-abcd-bootstrap' :
                query === 'rev-parse HEAD' ? '1'.repeat(40) : query.startsWith('rev-parse') ? '2'.repeat(40) : '';
            return {status: 0, stdout, stderr: ''};
        }, execute(request) {
            gates++;
            return {status: request.command.includes('grep') ? 1 : 0, stdout: '', stderr: ''};
        }});
        assert.equal(status, 0);
        assert.ok(gates >= 5);
        assert.equal(JSON.parse(stdout).kind, 'LOCAL_BOOTSTRAP_CHECKS');
        assert.equal(fs.existsSync(path.join(cwd, '.pi')), false);
    } finally { process.stdout.write = original; }
});

// vim: ft=javascript sts=4 sw=4 ts=4 et :
