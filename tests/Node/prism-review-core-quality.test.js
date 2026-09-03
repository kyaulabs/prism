// $KYAULabs: prism-review-core-quality.test.js kyau@aura.kyaulabs 2026/09/03 -0700 Exp $

'use strict';

const assert = require('node:assert/strict');
const childProcess = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const {makeTempDir} = require('./helpers');
const {
    CORE_GATE_IDS,
    createQualityCallbacks,
    runCoreQuality,
} = require('../../packages/prism-core/scripts/prism-review/core-quality');

const projectRoot = path.resolve(__dirname, '../..');
const coreRoot = path.join(projectRoot, 'packages', 'prism-core');
const baseSha = '1'.repeat(40);
const headSha = '2'.repeat(40);

function success(request) {
    return {
        status: request.id === 'core.conflict-markers' ? 1 : 0,
        stdout: request.id === 'core.repository-clean' ? Buffer.alloc(0) : Buffer.from('quality-output-canary'),
        stderr: Buffer.alloc(0),
        tools: request.id === 'core.semgrep' ? [{id: 'semgrep', version: '1.173.0'}] : [],
        artifacts: [],
    };
}

test('records actual versions for bounded adapter command callbacks', async (t) => {
    const root = makeTempDir();
    t.after(() => fs.rmSync(root, {recursive: true, force: true}));
    const git = (args) => {
        const result = childProcess.spawnSync('git', args, {cwd: root, encoding: 'utf8'});
        assert.equal(result.status, 0, result.stderr);
        return result.stdout.trim();
    };
    git(['init', '-b', 'develop']);
    git(['config', 'user.name', 'Prism Test']);
    git(['config', 'user.email', 'prism@example.test']);
    fs.writeFileSync(path.join(root, 'README.md'), 'fixture\n');
    fs.mkdirSync(path.join(root, 'vendor', 'bin'), {recursive: true});
    fs.writeFileSync(path.join(root, 'vendor', 'bin', 'php-cs-fixer'), '#!/bin/sh\nexit 0\n',
        {mode: 0o755});
    git(['add', '.']);
    git(['commit', '-m', 'base']);
    const head = git(['rev-parse', 'HEAD']);
    const bin = makeTempDir();
    t.after(() => fs.rmSync(bin, {recursive: true, force: true}));
    fs.writeFileSync(path.join(bin, 'composer'), '#!/bin/sh\nexit 0\n', {mode: 0o755});
    const callbacks = createQualityCallbacks({
        branch: 'develop', baseRef: 'develop', baseSha: head, headSha: head,
    }, {
        projectRoot: root,
        env: {PATH: `${bin}${path.delimiter}${process.env.PATH}`},
        registration: {contract: {components: [{
            id: 'php-cs-fixer',
            kind: 'command',
            provisioning: 'consumer-dev',
            version: '3.95.18',
            versionArguments: ['--version'],
            argumentPolicy: {mode: 'passthrough'},
        }], serverProfiles: []}},
        handler: {resolveTool: () => path.join(root, 'vendor', 'bin', 'php-cs-fixer')},
        run: (command, args) => args.includes('--version')
            ? {status: 0, stdout: path.basename(command) === 'composer'
                ? 'Composer version 2.8.1 2026-01-01'
                : 'PHP CS Fixer 3.95.18 running on PHP runtime 8.5.9', stderr: '', error: undefined}
            : {status: 0, stdout: '', stderr: '', error: undefined},
    });

    const result = await callbacks.runCommand({command: 'composer', args: ['audit', '--locked']});
    const tool = await callbacks.runTool({toolId: 'php-cs-fixer', args: ['fix', '--dry-run']});

    assert.deepEqual(result.tools, [{id: 'composer', version: '2.8.1'}]);
    assert.deepEqual(tool.tools, [{id: 'php-cs-fixer', version: '3.95.18'}]);
});

test('derives bounded adapter inputs from the immutable Git range', async (t) => {
    const root = makeTempDir();
    t.after(() => fs.rmSync(root, {recursive: true, force: true}));
    const git = (args) => {
        const result = childProcess.spawnSync('git', args, {cwd: root, encoding: 'utf8'});
        assert.equal(result.status, 0, result.stderr);
        return result.stdout.trim();
    };
    git(['init', '-b', 'develop']);
    git(['config', 'user.name', 'Prism Test']);
    git(['config', 'user.email', 'prism@example.test']);
    fs.mkdirSync(path.join(root, 'app'));
    fs.writeFileSync(path.join(root, 'app/example.php'), "<?php\nreturn 1;\n");
    fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify({scripts: {'test:node': 'node --test'}}));
    git(['add', '.']);
    git(['commit', '-m', 'base']);
    const base = git(['rev-parse', 'HEAD']);
    git(['checkout', '-b', 'feat/check']);
    fs.writeFileSync(path.join(root, 'app/example.php'), "<?php\nreturn 2;\n");
    git(['add', '.']);
    git(['commit', '-m', 'head']);
    const head = git(['rev-parse', 'HEAD']);

    const callbacks = createQualityCallbacks({
        branch: 'feat/check',
        baseRef: 'develop',
        baseSha: base,
        headSha: head,
    }, {projectRoot: root, registration: {contract: {components: [], serverProfiles: []}},
        handler: {resolveTool() {}}});

    assert.deepEqual(callbacks.trackedPaths, ['app/example.php', 'package.json']);
    assert.deepEqual(callbacks.packageScripts, ['test:node']);
    assert.deepEqual(await callbacks.changedLines({baseSha: base, headSha: head, extensions: ['php']}), [
        {file: 'app/example.php', line: 2},
    ]);
});

test('applies process-level sensitive paths to the tracked quality scope', (t) => {
    const root = makeTempDir();
    t.after(() => fs.rmSync(root, {recursive: true, force: true}));
    const prior = process.env.PRISM_SENSITIVE_PATHS;
    t.after(() => {
        if (prior === undefined) delete process.env.PRISM_SENSITIVE_PATHS;
        else process.env.PRISM_SENSITIVE_PATHS = prior;
    });
    const git = (args) => {
        const result = childProcess.spawnSync('git', args, {cwd: root, encoding: 'utf8'});
        assert.equal(result.status, 0, result.stderr);
        return result.stdout.trim();
    };
    git(['init', '-b', 'develop']);
    git(['config', 'user.name', 'Prism Test']);
    git(['config', 'user.email', 'prism@example.test']);
    fs.writeFileSync(path.join(root, 'review-input.txt'), 'tracked\n');
    git(['add', '.']);
    git(['commit', '-m', 'base']);
    const head = git(['rev-parse', 'HEAD']);
    process.env.PRISM_SENSITIVE_PATHS = path.join(root, 'review-input.txt');

    assert.throws(() => createQualityCallbacks({
        branch: 'develop', baseRef: 'develop', baseSha: head, headSha: head,
    }, {projectRoot: root, registration: {contract: {components: [], serverProfiles: []}},
        handler: {resolveTool() {}}}), /sensitive/);
});

test('passes only validated tracked paths to the default Semgrep gate', async (t) => {
    const root = makeTempDir();
    const bin = makeTempDir();
    t.after(() => fs.rmSync(root, {recursive: true, force: true}));
    t.after(() => fs.rmSync(bin, {recursive: true, force: true}));
    fs.writeFileSync(path.join(root, 'safe.js'), 'module.exports = true;\n');
    fs.writeFileSync(path.join(root, 'ignored-secret.txt'), 'not-for-semgrep\n');
    fs.writeFileSync(path.join(bin, 'semgrep'), '#!/bin/sh\nexit 0\n', {mode: 0o755});
    let scanArgs;

    const report = await runCoreQuality({
        branch: 'feat/check', baseRef: 'develop', baseSha, headSha,
    }, {
        projectRoot: root,
        coreRoot,
        env: {PATH: `${bin}${path.delimiter}${process.env.PATH}`},
        runGit: (_command, args) => ({
            status: 0,
            stdout: args[0] === 'ls-tree' ? Buffer.from('safe.js\0') : Buffer.alloc(0),
            stderr: Buffer.alloc(0),
        }),
        run: (command, args) => {
            if (path.basename(command) === 'semgrep' && args.includes('--version')) {
                return {status: 0, stdout: '1.173.0\n', stderr: '', error: undefined};
            }
            if (path.basename(command) === 'semgrep') scanArgs = args;
            return {status: args[0] === 'grep' ? 1 : 0, stdout: Buffer.alloc(0),
                stderr: Buffer.alloc(0), error: undefined};
        },
        hasHarness: false,
        verifySnapshot: async () => true,
    });

    assert.equal(report.status, 'PASS');
    assert.deepEqual(scanArgs.slice(-2), ['--', 'safe.js']);
    assert.equal(scanArgs.includes('ignored-secret.txt'), false);
});

test('fails bounded Core receipts on timeout, nonzero status, and output overflow', async () => {
    const report = await runCoreQuality({
        branch: 'feat/check',
        baseRef: 'develop',
        baseSha,
        headSha,
    }, {
        projectRoot,
        coreRoot,
        execute: async (request) => {
            if (request.id === 'core.diff-check') {
                return {...success(request), status: null, timedOut: true, error: {code: 'ETIMEDOUT'}};
            }
            if (request.id === 'core.semgrep') return {...success(request), status: 1};
            if (request.id === 'core.markdown') {
                return {...success(request), stdout: Buffer.alloc(1048577)};
            }
            return success(request);
        },
        hasHarness: false,
        verifySnapshot: async () => true,
    });

    assert.equal(report.status, 'FAIL');
    assert.equal(report.gates.find(({id}) => id === 'core.diff-check').status, 'FAIL');
    assert.equal(report.gates.find(({id}) => id === 'core.markdown').status, 'FAIL');
    assert.equal(report.gates.find(({id}) => id === 'core.harness').status, 'SKIPPED');
    assert.equal(report.gates.find(({id}) => id === 'core.semgrep').status, 'FAIL');
    assert.equal(JSON.stringify(report).includes('ETIMEDOUT'), false);
});

test('fails the conflict-marker gate when Git reports a match', async () => {
    const report = await runCoreQuality({
        branch: 'feat/check',
        baseRef: 'develop',
        baseSha,
        headSha,
    }, {
        projectRoot,
        coreRoot,
        execute: async (request) => request.id === 'core.conflict-markers'
            ? {...success(request), status: 0, stdout: Buffer.from('file.js:1:<<<<<<< HEAD\n')}
            : success(request),
        hasHarness: true,
        verifySnapshot: async () => true,
    });

    assert.equal(report.status, 'FAIL');
    assert.equal(report.gates.find(({id}) => id === 'core.conflict-markers').status, 'FAIL');
});

test('runs the six fixed Core gates with normalized commands and digest-only output', async () => {
    const requests = [];
    let verifications = 0;
    const report = await runCoreQuality({
        branch: 'feat/check',
        baseRef: 'develop',
        baseSha,
        headSha,
    }, {
        projectRoot,
        coreRoot,
        execute: async (request) => {
            requests.push(request);
            return success(request);
        },
        hasHarness: true,
        verifySnapshot: async () => {
            verifications += 1;
            return true;
        },
    });

    assert.equal(report.status, 'PASS');
    assert.equal(verifications, 6);
    assert.deepEqual(report.gates.map(({id}) => id), CORE_GATE_IDS);
    assert.deepEqual(requests.map(({command}) => command), [
        ['git', 'status', '--porcelain=v1', '-z', '--untracked-files=all'],
        ['git', 'diff', '--check', `${baseSha}..${headSha}`],
        ['prism-tool', 'markdown', 'lint', '--changed-from', baseSha],
        ['git', 'grep', '-nE', '^(<<<<<<< |=======|>>>>>>> )', headSha, '--', '.', ':!adr/**', ':!docs/plans/**'],
        ['bash', 'packages/prism-core/scripts/validate-harness.sh'],
        ['semgrep', 'scan', '--config', '.semgrep/kyaulabs.yml', '--config', 'p/php', '--config',
            'p/secrets', '--config', 'p/javascript', '--error', '--metrics', 'off', '--disable-version-check'],
    ]);
    assert.equal(JSON.stringify(report).includes('quality-output-canary'), false);
});

// vim: ft=javascript sts=4 sw=4 ts=4 et :
