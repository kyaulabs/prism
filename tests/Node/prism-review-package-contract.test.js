// $KYAULabs: prism-review-package-contract.test.js kyau@aura.kyaulabs 2026/09/08 -0700 Exp $

'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const {spawnSync} = require('node:child_process');
const path = require('node:path');
const test = require('node:test');
const root = path.resolve(__dirname, '../..');

test('CI verifies installed SDK baselines and latest compatibility rather than usage failure', () => {
    const ci = fs.readFileSync(path.join(root, '.github/workflows/ci.yml'), 'utf8');
    assert.match(ci, /tests\/Package\/prism-review-smoke\.js/);
    assert.match(ci, /0\.84\.1/);
    assert.match(ci, /0\.85\.1/);
    assert.match(ci, /--sdk latest --network-approved=yes/);
    const smoke = fs.readFileSync(path.join(root, 'tests/Package/prism-review-smoke.js'), 'utf8');
    assert.match(smoke, /pi-coding-agent@>=0\.84\.1 <=5\.0\.0/);
    assert.doesNotMatch(ci, /packaged CLI unexpectedly succeeded/);
});

test('the credential guard rejects synthetic reads before filesystem access', t => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'prism-guard-test-'));
    t.after(() => fs.rmSync(directory, {recursive: true, force: true}));
    const evidence = path.join(directory, 'evidence.json');
    const guard = path.join(root, 'tests/Package/prism-review-credential-guard.cjs');
    for (const program of [
        "require('node:fs').readFileSync('auth.json')",
        "require('node:fs').openSync('auth.json', 'r')",
        "require('node:fs').readFile('auth.json', () => {})",
        "require('node:fs').open('auth.json', 'r', () => {})",
        "require('node:fs').createReadStream('auth.json')",
        "require('node:fs').promises.readFile('auth.json')",
        "require('node:fs').promises.open('auth.json', 'r')",
        "import('node:fs').then(fs => fs.readFileSync('auth.json'))",
    ]) {
        fs.rmSync(evidence, {force: true});
        const result = spawnSync(process.execPath, ['--require', guard, '-e', program], {
            cwd: directory, encoding: 'utf8', timeout: 10000, maxBuffer: 65536,
            env: {PATH: process.env.PATH, PRISM_TEST_GUARD_LOG: evidence},
        });
        assert.equal(result.error, undefined);
        assert.notEqual(result.status, 0);
        assert.match(result.stderr, /credential access forbidden by package test/);
        assert.deepEqual(JSON.parse(fs.readFileSync(evidence, 'utf8')), {loaded: true, denied: true});
    }
});

test('the installed-package smoke declares peer omission and explicit negative SDK cases', () => {
    const smoke = fs.readFileSync(path.join(root, 'tests/Package/prism-review-smoke.js'), 'utf8');
    assert.match(smoke, /--legacy-peer-deps/);
    assert.match(smoke, /SDK_MISSING/);
    assert.match(smoke, /SDK_API_UNSUPPORTED/);
    assert.match(smoke, /SDK_VERSION_UNSUPPORTED/);
    assert.match(smoke, /doctor/);
    assert.match(smoke, /--network-approved=yes/);
});

// vim: ft=javascript sts=4 sw=4 ts=4 et :
