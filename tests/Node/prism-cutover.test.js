// $KYAULabs: prism-cutover.test.js kyau@aura.kyaulabs 2026/09/08 -0700 Exp $

'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const {execFileSync} = require('node:child_process');
const {makeTempDir} = require('./helpers');
const {main} = require('../../packages/prism-core/scripts/prism-tool/cli');

async function capture(action) {
    let stdout = '';
    let stderr = '';
    const out = process.stdout.write;
    const err = process.stderr.write;
    process.stdout.write = (chunk) => { stdout += chunk; return true; };
    process.stderr.write = (chunk) => { stderr += chunk; return true; };
    try { return {status: await action(), stdout, stderr}; }
    finally { process.stdout.write = out; process.stderr.write = err; }
}

test('local readiness requires only Semgrep and never invokes a reviewer', async (t) => {
    const directory = makeTempDir();
    t.after(() => fs.rmSync(directory, {recursive: true, force: true}));
    fs.writeFileSync(path.join(directory, 'semgrep'), '', {mode: 0o700});
    const calls = [];
    const result = await capture(() => main(['doctor', '--local-only', '--json'], {
        env: {PATH: directory},
        run(command, args) {
            calls.push([path.basename(command), args]);
            return {status: 0, stdout: '1.173.0\n', stderr: ''};
        },
    }));
    assert.equal(result.status, 0, result.stdout);
    assert.deepEqual(calls, [['semgrep', ['--version']]]);
    assert.equal(JSON.parse(result.stdout).status, 'GO');
});

test('full doctor delegates local review readiness without consulting consent', async (t) => {
    const directory = makeTempDir();
    t.after(() => fs.rmSync(directory, {recursive: true, force: true}));
    for (const name of ['semgrep', 'prism-review']) {
        fs.writeFileSync(path.join(directory, name), '', {mode: 0o700});
    }
    const calls = [];
    const result = await capture(() => main(['doctor', '--json'], {
        env: {PATH: directory},
        consentPath: path.join(directory, 'absent'),
        run(command, args) {
            calls.push([path.basename(command), args]);
            return {status: 0, stdout: path.basename(command) === 'semgrep' ? '1.173.0\n' :
                JSON.stringify({schemaVersion: 1, command: 'doctor', status: 'GO', eligibleForAuthority: true}), stderr: ''};
        },
    }));
    assert.equal(result.status, 0, result.stdout);
    assert.deepEqual(calls, [['semgrep', ['--version']], ['prism-review', ['doctor', '--json']]]);
});

test('setup migration preserves the legacy web choice and requires explicit approval', async (t) => {
    const directory = makeTempDir();
    t.after(() => fs.rmSync(directory, {recursive: true, force: true}));
    const consentPath = path.join(directory, 'prism-consent.json');
    const legacy = JSON.stringify({schemaVersion: 2, ocr: true, webAccess: true});
    fs.writeFileSync(consentPath, legacy, {mode: 0o600});
    const context = {consentPath};
    const before = await capture(() => main(['consent', 'status', '--json'], context));
    assert.deepEqual(JSON.parse(before.stdout), {schemaVersion: 3, command: 'consent status',
        status: 'GRANTED', webAccess: true, legacy: true});
    assert.equal(fs.readFileSync(consentPath, 'utf8'), legacy);
    assert.equal((await capture(() => main(['consent', 'migrate'], context))).status, 2);
    assert.equal(fs.readFileSync(consentPath, 'utf8'), legacy);
    assert.equal((await capture(() => main(['consent', 'migrate', '--approval=yes'], context))).status, 0);
    assert.deepEqual(JSON.parse(fs.readFileSync(consentPath)), {schemaVersion: 3, webAccess: true});
});

test('retired review dispatch cannot execute any subprocess', async () => {
    for (const args of [['code-review', 'ocr', '--', 'review'], ['code-review', 'chain', 'record'],
        ['run', 'ocr', '--', 'scan', '.']]) {
        const result = await capture(() => main(args, {
            run: () => assert.fail('retired review dispatch must not spawn'),
        }));
        assert.equal(result.status, 2);
    }
});

test('current contracts contain no retired review integration outside bounded migration and safety exceptions', () => {
    const root = path.resolve(__dirname, '../..');
    const paths = execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard', '-z', '--',
        'packages', '.github', 'README.md', 'CODING_HARNESS.md', 'CONTRIBUTING.md', 'backend', 'tests'],
    {cwd: root, encoding: 'utf8'}).split('\0').filter(Boolean);
    const migrationAndRegression = new Set([
        'packages/prism-core/scripts/prism-tool/consent.js',
        'packages/prism-core/scripts/prism-review/legacy-review-chain.js',
        'packages/prism-core/scripts/sensitive-path-policy.js',
        'packages/prism-core/extensions/safety/sensitive-paths.ts',
        'tests/Node/prism-cutover.test.js', 'tests/Node/prism-tool-consent.test.js',
        'tests/Node/prism-tool-php-web-bootstrap.test.js', 'tests/Node/safety-sensitive-paths.test.ts',
        'tests/Shell/prism_review_architecture_contract_test.sh',
    ]);
    const violations = [];
    for (const relative of new Set(paths)) {
        if (migrationAndRegression.has(relative) || /(?:^|\/)(?:\.env(?:\..*)?|auth\.json|mcp-auth\.json)$/.test(relative) ||
            /(?:^|\/)(?:node_modules|vendor|coverage)(?:\/|$)/.test(relative) || /lock\.(?:json|yaml)$/.test(relative)) continue;
        const file = path.join(root, relative);
        if (!fs.existsSync(file) || !fs.lstatSync(file).isFile()) continue;
        if (/\bocr\b|open.?code.?review|COMPLETE_NO_OCR/i.test(fs.readFileSync(file, 'utf8'))) violations.push(relative);
    }
    assert.deepEqual(violations, []);
    for (const retired of ['scripts/resolve-ocr-model.sh', 'scripts/prism-tool/code-review.js',
        'scripts/prism-tool/ocr-applicability.js', 'scripts/prism-tool/review-chain.js']) {
        assert.equal(fs.existsSync(path.join(root, 'packages/prism-core', retired)), false, retired);
    }
    for (const lock of ['package-lock.json', 'pnpm-lock.yaml']) {
        assert.doesNotMatch(fs.readFileSync(path.join(root, lock), 'utf8'), /@alibaba-group\/open-code-review/);
    }
});

// vim: ft=javascript sts=4 sw=4 ts=4 et :
