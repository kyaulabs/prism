// $KYAULabs: prism-tool-web-access.test.js kyau@aura.kyaulabs 2026/08/26 -0700 Exp $

'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const {main} = require('../../packages/prism-core/scripts/prism-tool/cli');
const {
    DEFAULT_CONFIG,
    inspectWebAccessConfig,
} = require('../../packages/prism-core/scripts/prism-tool/web-access-config');
const {resolveWebAccessBrowser} = require('../../packages/prism-core/scripts/prism-tool/web-access-browser');

function fixture(t) {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'prism-web-access-'));
    const agent = path.join(root, 'agent');
    fs.mkdirSync(agent, {mode: 0o700});
    const webAccessPath = path.join(agent, 'prism-web-access.json');
    t.after(() => fs.rmSync(root, {recursive: true, force: true}));
    return {agent, root, webAccessPath};
}

function capture(action) {
    let stdout = '';
    let stderr = '';
    const stdoutWrite = process.stdout.write;
    const stderrWrite = process.stderr.write;
    process.stdout.write = (chunk) => { stdout += chunk; return true; };
    process.stderr.write = (chunk) => { stderr += chunk; return true; };
    try {
        return {status: action(), stdout, stderr};
    } finally {
        process.stdout.write = stdoutWrite;
        process.stderr.write = stderrWrite;
    }
}

function writeRecord(target, record, mode = 0o600) {
    fs.writeFileSync(target.webAccessPath, `${JSON.stringify(record)}\n`, {mode});
    fs.chmodSync(target.webAccessPath, mode);
}

test('status reports absent defaults and sanitized browser availability', (t) => {
    const target = fixture(t);
    const executable = path.join(target.root, 'brave-real');
    fs.writeFileSync(executable, '#!/bin/sh\n', {mode: 0o700});
    const status = capture(() => main([
        'web-access', 'status', '--json',
    ], {
        webAccessPath: target.webAccessPath,
        platform: 'linux',
        resolveExecutable: (name) => name === 'brave' ? executable : null,
    }));

    assert.equal(status.status, 0);
    assert.equal(status.stderr, '');
    assert.deepEqual(JSON.parse(status.stdout), {
        schemaVersion: 1,
        command: 'web-access status',
        status: 'ABSENT',
        config: {searxngUrl: null, browser: 'auto'},
        browser: {status: 'AVAILABLE', family: 'brave'},
    });
    assert.deepEqual(inspectWebAccessConfig({webAccessPath: target.webAccessPath}), {
        state: 'ABSENT',
        path: target.webAccessPath,
        config: DEFAULT_CONFIG,
    });
});

test('configure publishes the closed private schema and remove is idempotent', (t) => {
    const target = fixture(t);
    const context = {
        webAccessPath: target.webAccessPath,
        platform: 'linux',
        resolveExecutable: () => null,
    };
    const configured = capture(() => main([
        'web-access', 'configure',
        '--searxng-url=http://127.0.0.1:8080/',
        '--browser=auto', '--approval=yes', '--json',
    ], context));

    assert.equal(configured.status, 0);
    assert.deepEqual(JSON.parse(configured.stdout), {
        schemaVersion: 1,
        command: 'web-access configure',
        status: 'CONFIGURED',
        config: {searxngUrl: 'http://127.0.0.1:8080', browser: 'auto'},
    });
    assert.deepEqual(JSON.parse(fs.readFileSync(target.webAccessPath, 'utf8')), {
        schemaVersion: 1,
        searxngUrl: 'http://127.0.0.1:8080',
        browser: 'auto',
    });
    assert.equal(fs.statSync(target.webAccessPath).mode & 0o777, 0o600);

    const removed = capture(() => main([
        'web-access', 'remove', '--approval=yes', '--json',
    ], context));
    assert.equal(removed.status, 0);
    assert.deepEqual(JSON.parse(removed.stdout), {
        schemaVersion: 1,
        command: 'web-access remove',
        status: 'ABSENT',
        config: {searxngUrl: null, browser: 'auto'},
    });
    assert.equal(fs.existsSync(target.webAccessPath), false);
    const repeated = capture(() => main([
        'web-access', 'remove', '--approval=yes', '--json',
    ], context));
    assert.equal(repeated.status, 0);
});

test('browser disabled is valid without a SearXNG URL', (t) => {
    const target = fixture(t);
    const configured = capture(() => main([
        'web-access', 'configure', '--browser=disabled', '--approval=yes', '--json',
    ], {webAccessPath: target.webAccessPath, platform: 'linux'}));

    assert.equal(configured.status, 0);
    assert.deepEqual(resolveWebAccessBrowser({
        webAccessPath: target.webAccessPath,
        platform: 'linux',
        resolveExecutable: () => { throw new Error('must not resolve'); },
    }), {status: 'UNAVAILABLE'});
});

test('configuration grammar and loopback URL policy fail closed', (t) => {
    const target = fixture(t);
    const canary = 'PRIVATE_CONFIG_CANARY';
    const context = {webAccessPath: target.webAccessPath};
    for (const args of [
        ['web-access', 'configure', '--browser=auto', '--json'],
        ['web-access', 'configure', '--browser=auto', '--approval=no', '--json'],
        ['web-access', 'configure', '--browser=auto', '--approval=yes', '--approval=yes', '--json'],
        ['web-access', 'configure', '--browser=other', '--approval=yes', '--json'],
        ['web-access', 'configure', '--unknown=value', '--approval=yes', '--json'],
        ['web-access', 'configure', '--searxng-url=https://example.com', '--approval=yes', '--json'],
        ['web-access', 'configure', '--searxng-url=http://user:pass@127.0.0.1', '--approval=yes', '--json'],
        ['web-access', 'configure', '--searxng-url=http://127.0.0.1/#fragment', '--approval=yes', '--json'],
        ['web-access', 'configure', `--searxng-url=http://127.0.0.1/${canary}`, '--approval=yes'],
        ['web-access', 'remove', '--approval=no', '--json'],
    ]) {
        const result = capture(() => main(args, context));
        assert.equal(result.status, 2, args.join(' '));
        assert.doesNotMatch(result.stderr, new RegExp(canary));
        assert.equal(fs.existsSync(target.webAccessPath), false);
    }
});

test('unsafe configuration files are never replaced or removed', (t) => {
    const target = fixture(t);
    const canary = 'UNSAFE_WEB_CONFIG_CANARY';
    writeRecord(target, {
        schemaVersion: 1,
        searxngUrl: null,
        browser: 'auto',
        extra: canary,
    });
    const before = fs.readFileSync(target.webAccessPath, 'utf8');

    const status = capture(() => main([
        'web-access', 'status', '--json',
    ], {webAccessPath: target.webAccessPath, platform: 'linux'}));
    assert.deepEqual(JSON.parse(status.stdout), {
        schemaVersion: 1,
        command: 'web-access status',
        status: 'UNSAFE',
        config: {searxngUrl: null, browser: 'auto'},
        browser: {status: 'UNAVAILABLE'},
    });
    for (const args of [
        ['web-access', 'configure', '--browser=auto', '--approval=yes', '--json'],
        ['web-access', 'remove', '--approval=yes', '--json'],
    ]) {
        const result = capture(() => main(args, {webAccessPath: target.webAccessPath}));
        assert.equal(result.status, 5);
        assert.doesNotMatch(result.stderr, new RegExp(canary));
        assert.equal(fs.readFileSync(target.webAccessPath, 'utf8'), before);
    }
});

test('browser resolution is Linux-only, realpath-based, and priority ordered', (t) => {
    const target = fixture(t);
    const real = path.join(target.root, 'browser-real');
    const linked = path.join(target.root, 'browser-link');
    fs.writeFileSync(real, '#!/bin/sh\n', {mode: 0o700});
    fs.symlinkSync(real, linked);
    const attempts = [];

    assert.deepEqual(resolveWebAccessBrowser({
        config: {searxngUrl: null, browser: 'auto'},
        platform: 'darwin',
        resolveExecutable: () => { throw new Error('must not resolve'); },
    }), {status: 'UNAVAILABLE'});
    assert.deepEqual(resolveWebAccessBrowser({
        config: {searxngUrl: null, browser: 'auto'},
        platform: 'linux',
        resolveExecutable: (name) => {
            attempts.push(name);
            return name === 'brave-browser-stable' ? linked : null;
        },
    }), {status: 'AVAILABLE', family: 'brave', executable: real});
    assert.deepEqual(attempts, [
        'chromium', 'chromium-browser', 'brave', 'brave-browser', 'brave-browser-stable',
    ]);
});

test('all supported Brave executable names resolve to the Brave family', (t) => {
    const target = fixture(t);
    const executable = path.join(target.root, 'browser');
    fs.writeFileSync(executable, '#!/bin/sh\n', {mode: 0o700});
    for (const candidate of ['brave', 'brave-browser', 'brave-browser-stable']) {
        assert.deepEqual(resolveWebAccessBrowser({
            config: {searxngUrl: null, browser: 'auto'},
            platform: 'linux',
            resolveExecutable: (name) => name === candidate ? executable : null,
        }), {status: 'AVAILABLE', family: 'brave', executable});
    }
});

// vim: ft=javascript sts=4 sw=4 ts=4 et :
