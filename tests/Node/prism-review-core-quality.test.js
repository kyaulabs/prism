// $KYAULabs: prism-review-core-quality.test.js kyau@aura.kyaulabs 2026/09/08 -0700 Exp $

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
    let versionAvailable = true;
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
        run: (command, args) => args.includes('--version') && !versionAvailable
            ? {status: 2, stdout: '', stderr: 'unsupported version option'}
            : args.includes('--version')
                ? {status: 0, stdout: path.basename(command) === 'composer'
                ? 'Composer version 2.8.1 2026-01-01'
                : 'PHP CS Fixer 3.94.0', stderr: '', error: undefined}
            : {status: 0, stdout: '', stderr: '', error: undefined},
    });

    const result = await callbacks.runCommand({command: 'composer', args: ['audit', '--locked']});
    const tool = await callbacks.runTool({toolId: 'php-cs-fixer', args: ['fix', '--dry-run']});

    assert.deepEqual(result.tools, [{id: 'composer', version: '2.8.1'}]);
    assert.deepEqual(tool.tools, [{id: 'php-cs-fixer', version: '3.94.0'}]);
    versionAvailable = false;
    const unknown = await callbacks.runTool({toolId: 'php-cs-fixer', args: ['fix', '--dry-run']});
    assert.equal(unknown.status, 0);
    assert.deepEqual(unknown.tools, [{id: 'php-cs-fixer', version: null}]);
    const unknownRuntime = await callbacks.runCommand({command: 'node', args: ['--help']});
    assert.equal(unknownRuntime.status, 0);
    assert.deepEqual(unknownRuntime.tools, [{id: 'node', version: null}]);
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

test('scans an isolated tracked snapshot without overriding Semgrep ignore rules', async (t) => {
    const root = makeTempDir();
    const bin = makeTempDir();
    t.after(() => fs.rmSync(root, {recursive: true, force: true}));
    t.after(() => fs.rmSync(bin, {recursive: true, force: true}));
    const env = {PATH: `${bin}${path.delimiter}${process.env.PATH}`, HOME: bin,
        GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_NOSYSTEM: '1'};
    const git = (...args) => childProcess.execFileSync('git', args, {cwd: root, env, encoding: 'utf8', timeout: 15000}).trim();
    git('init', '--quiet', '-b', 'fixture');
    fs.mkdirSync(path.join(root, '.semgrep'), {mode: 0o700});
    fs.writeFileSync(path.join(root, '.semgrep', 'kyaulabs.yml'), 'rules: []\n');
    fs.writeFileSync(path.join(root, '.gitignore'), 'ignored-secret.txt\n');
    fs.writeFileSync(path.join(root, 'safe.js'), 'module.exports = false;\n');
    git('add', '--all');
    const commit = () => git('-c', 'core.hooksPath=/dev/null', '-c', 'commit.gpgsign=false', '-c', 'user.name=Fixture',
        '-c', 'user.email=fixture@example.test', 'commit', '--quiet', '-m', 'fixture');
    commit();
    const baseline = git('rev-parse', 'HEAD');
    fs.writeFileSync(path.join(root, 'safe.js'), 'module.exports = true;\n');
    git('add', '--', 'safe.js');
    commit();
    const head = git('rev-parse', 'HEAD');
    const trackedPaths = ['.gitignore', '.semgrep/kyaulabs.yml', 'safe.js'];
    fs.writeFileSync(path.join(root, 'ignored-secret.txt'), 'not-for-semgrep\n', {mode: 0o000});
    const invocation = path.join(bin, 'scan.json');
    fs.writeFileSync(path.join(bin, 'semgrep'), `#!${process.execPath}
if (process.argv[2] === '--version') { process.stdout.write('1.173.0\\n'); process.exit(0); }
process.umask(0o077);
const fs = require('node:fs');
const git = (...args) => require('node:child_process').execFileSync('git', args, {stdio: 'pipe'});
git('reset', '--hard', ${JSON.stringify(baseline)});
git('reset', '--hard', ${JSON.stringify(head)});
fs.writeFileSync(${JSON.stringify(invocation)}, JSON.stringify({cwd: process.cwd(), args: process.argv.slice(2), ignored: fs.existsSync('ignored-secret.txt')}));
`, {mode: 0o700});
    const observedPaths = ['safe.js', '.git/index', '.git/refs/heads/fixture', '.git/logs/HEAD', '.git/logs/refs/heads/fixture'];
    const snapshot = () => observedPaths.map((relative) => {
        const file = path.join(root, relative);
        const stat = fs.lstatSync(file);
        return {relative, bytes: fs.readFileSync(file), mode: stat.mode, ino: stat.ino, mtimeMs: stat.mtimeMs, ctimeMs: stat.ctimeMs};
    });
    const before = snapshot();

    const report = await runCoreQuality({
        branch: 'fixture', baseRef: baseline, baseSha: baseline, headSha: head,
    }, {
        projectRoot: root,
        coreRoot,
        env: {...env, SEMGREP_BASELINE_COMMIT: baseline},
        runGit: (_command, args) => ({
            status: 0,
            stdout: args[0] === 'ls-tree' ? Buffer.from(`${trackedPaths.join('\0')}\0`) : Buffer.alloc(0),
            stderr: Buffer.alloc(0),
        }),
        run: (command, args, options) => {
            if (path.basename(command) === 'semgrep') return childProcess.spawnSync(command, args, options);
            return {status: args[0] === 'grep' ? 1 : 0, stdout: Buffer.alloc(0),
                stderr: Buffer.alloc(0), error: undefined};
        },
        hasHarness: false,
        verifySnapshot: async () => true,
    });

    assert.equal(report.status, 'PASS');
    assert.deepEqual(snapshot(), before);
    const scanned = JSON.parse(fs.readFileSync(invocation, 'utf8'));
    assert.deepEqual(scanned.args, ['scan', '--config', './.semgrep/kyaulabs.yml', '--config', 'p/php',
        '--config', 'p/secrets', '--config', 'p/javascript', '--error', '--metrics', 'off', '--disable-version-check',
        '--baseline-commit', baseline]);
    assert.equal(scanned.ignored, false);
    assert.notEqual(scanned.cwd, root);
    assert.equal(fs.existsSync(scanned.cwd), false);
    assert.deepEqual(report.gates.at(-1).tools, [{id: 'semgrep', version: '1.173.0'}]);
});

test('fails the real Semgrep gate on scanner or preservation failure while retaining its outcome digest', async (t) => {
    for (const kind of ['scanner', 'preservation']) {
        const root = makeTempDir();
        const bin = makeTempDir();
        t.after(() => fs.rmSync(root, {recursive: true, force: true}));
        t.after(() => fs.rmSync(bin, {recursive: true, force: true}));
        const env = {PATH: `${bin}${path.delimiter}${process.env.PATH}`, HOME: bin,
            GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_NOSYSTEM: '1'};
        const git = (...args) => childProcess.execFileSync('git', args, {cwd: root, env, encoding: 'utf8', timeout: 15000}).trim();
        git('init', '--quiet', '-b', 'fixture');
        fs.mkdirSync(path.join(root, '.semgrep'), {mode: 0o700});
        const rules = path.join(root, '.semgrep', 'kyaulabs.yml');
        fs.writeFileSync(rules, 'rules: []\n', {mode: 0o600});
        git('add', '--all');
        git('-c', 'core.hooksPath=/dev/null', '-c', 'commit.gpgsign=false', '-c', 'user.name=Fixture',
            '-c', 'user.email=fixture@example.test', 'commit', '--quiet', '-m', 'fixture');
        const head = git('rev-parse', 'HEAD');
        fs.writeFileSync(path.join(bin, 'semgrep'), `#!${process.execPath}
if (process.argv[2] === '--version') { process.stdout.write('1.173.0\\n'); process.exit(0); }
${kind === 'preservation' ? `require('node:fs').chmodSync(${JSON.stringify(rules)}, 0o400);` : ''}
process.stdout.write('scanner-complete');
process.exitCode = ${kind === 'scanner' ? 7 : 0};
`, {mode: 0o700});
        const report = await runCoreQuality({branch: 'fixture', baseRef: head, baseSha: head, headSha: head}, {
            projectRoot: root, coreRoot, env, hasHarness: false,
            verifySnapshot: async () => true,
            run: (command, args, options) => path.basename(command) === 'semgrep'
                ? childProcess.spawnSync(command, args, options)
                : {status: args[0] === 'grep' ? 1 : 0, stdout: '', stderr: '', error: undefined},
        });
        assert.equal(report.status, 'FAIL', kind);
        const gate = report.gates.find(({id}) => id === 'core.semgrep');
        assert.equal(gate.status, 'FAIL', kind);
        assert.equal(gate.stdout.bytes, 16, kind);
        assert.deepEqual(gate.tools, [{id: 'semgrep', version: '1.173.0'}], kind);
        assert.equal(fs.lstatSync(rules).mode & 0o7777, kind === 'preservation' ? 0o400 : 0o600);
    }
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

test('fails the conflict-marker gate when its execution throws', async () => {
    const report = await runCoreQuality({
        branch: 'feat/check',
        baseRef: 'develop',
        baseSha,
        headSha,
    }, {
        projectRoot,
        coreRoot,
        execute: async (request) => {
            if (request.id === 'core.conflict-markers') throw new Error('execution-output-canary');
            return success(request);
        },
        hasHarness: true,
        verifySnapshot: async () => true,
    });

    assert.equal(report.status, 'FAIL');
    assert.equal(report.gates.find(({id}) => id === 'core.conflict-markers').status, 'FAIL');
    assert.equal(JSON.stringify(report).includes('execution-output-canary'), false);
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
