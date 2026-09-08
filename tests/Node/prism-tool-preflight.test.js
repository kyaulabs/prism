// $KYAULabs: prism-tool-preflight.test.js kyau@aura.kyaulabs 2026/09/08 -0700 Exp $

'use strict';

const assert = require('node:assert/strict');
const {execFileSync, spawnSync} = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const {makeTempDir} = require('./helpers');
const {main} = require('../../packages/prism-core/scripts/prism-tool/cli');
const {runBounded} = require('../../packages/prism-core/scripts/prism-tool/process');
const {
    checkExternalTools,
} = require('../../packages/prism-core/scripts/prism-tool/preflight');

const coreRoot = path.resolve(__dirname, '../../packages/prism-core');

async function captureWrites(action) {
    const stdout = [];
    const stderr = [];
    const originalStdout = process.stdout.write;
    const originalStderr = process.stderr.write;
    process.stdout.write = (chunk) => {
        stdout.push(String(chunk));
        return true;
    };
    process.stderr.write = (chunk) => {
        stderr.push(String(chunk));
        return true;
    };
    try {
        return {status: await action(), stderr: stderr.join(''), stdout: stdout.join('')};
    } finally {
        process.stdout.write = originalStdout;
        process.stderr.write = originalStderr;
    }
}

function writeExecutable(directory, name, source) {
    const executable = path.join(directory, name);
    fs.writeFileSync(executable, `#!${process.execPath}\n${source}`, {mode: 0o755});
    fs.chmodSync(executable, 0o755);
    return executable;
}

function externalContract() {
    return {
        components: [
            {
                id: 'semgrep',
                kind: 'command',
                provisioning: 'external',
                executable: 'semgrep',
                versionRequirement: {
                    mode: 'range',
                    minimum: '1.173.0',
                    maximumExclusive: '2.0.0',
                },
                versionArguments: ['--version'],
            },
        ],
    };
}

test('passes lower-bound external tools while ignoring update advertisements', (t) => {
    const directory = makeTempDir();
    t.after(() => fs.rmSync(directory, {recursive: true, force: true}));
    writeExecutable(
        directory,
        'semgrep',
        "process.stdout.write('A new Semgrep version 1.174.0 is available.\\n1.173.0\\n');\n"
    );

    const checks = checkExternalTools({
        contract: externalContract(),
        env: {PATH: directory},
        run: runBounded,
    });

    assert.deepEqual(checks, [
        {id: 'semgrep', status: 'PASS', expected: '>=1.173.0 <2.0.0', actual: '1.173.0', message: 'compatible version'},
    ]);
});

test('rejects duplicate Semgrep installed-version evidence', (t) => {
    const directory = makeTempDir();
    t.after(() => fs.rmSync(directory, {recursive: true, force: true}));
    writeExecutable(directory, 'semgrep', '');
    const run = (command) => ({
        status: 0,
        stdout: '1.173.0\n1.174.0',
        stderr: '',
        error: undefined,
    });

    const checks = checkExternalTools({contract: externalContract(), env: {PATH: directory}, run});

    assert.deepEqual(checks[0], {
        id: 'semgrep',
        status: 'FAIL',
        expected: '>=1.173.0 <2.0.0',
        message: 'malformed version',
    });
});

test('enforces lower-inclusive and upper-exclusive Semgrep compatibility', (t) => {
    const directory = makeTempDir();
    t.after(() => fs.rmSync(directory, {recursive: true, force: true}));
    writeExecutable(directory, 'semgrep', '');
    const cases = [
        {actual: '1.999.7', status: 'PASS', message: 'compatible version'},
        {actual: '1.172.9', status: 'FAIL', message: 'version mismatch'},
        {actual: '2.0.0', status: 'FAIL', message: 'version mismatch'},
    ];

    for (const fixture of cases) {
        const run = (command) => ({
            status: 0,
            stdout: fixture.actual,
            stderr: '',
            error: undefined,
        });
        const checks = checkExternalTools({contract: externalContract(), env: {PATH: directory}, run});
        assert.deepEqual(checks[0], {
            id: 'semgrep',
            status: fixture.status,
            expected: '>=1.173.0 <2.0.0',
            actual: fixture.actual,
            message: fixture.message,
        });
    }
});

test('bounds every external version probe with a fixed argument array', (t) => {
    const directory = makeTempDir();
    t.after(() => fs.rmSync(directory, {recursive: true, force: true}));
    writeExecutable(directory, 'semgrep', '');
    const env = {PATH: directory};
    const invocations = [];
    const run = (command, args, options) => {
        invocations.push({command: path.basename(command), args, options});
        const stdout = '1.173.0';
        return {status: 0, stdout, stderr: '', error: undefined};
    };

    checkExternalTools({contract: externalContract(), env, run});

    assert.deepEqual(invocations, [
        {command: 'semgrep', args: ['--version'], options: {env, maxBuffer: 1048576, timeout: 30000}},
    ]);
});

test('reports a safe actual version when an external version mismatches', (t) => {
    const directory = makeTempDir();
    t.after(() => fs.rmSync(directory, {recursive: true, force: true}));
    writeExecutable(directory, 'semgrep', "process.stdout.write('1.172.0\\n');\n");

    const checks = checkExternalTools({
        contract: externalContract(),
        env: {PATH: directory},
        run: runBounded,
    });

    assert.deepEqual(checks[0], {
        id: 'semgrep',
        status: 'FAIL',
        expected: '>=1.173.0 <2.0.0',
        actual: '1.172.0',
        message: 'version mismatch',
    });
});

test('sanitizes conflicting version output and secret canaries', (t) => {
    const directory = makeTempDir();
    t.after(() => fs.rmSync(directory, {recursive: true, force: true}));
    writeExecutable(
        directory,
        'semgrep',
        "process.stdout.write('1.173.0 helper 9.9.9 CANARY-API-KEY-94f0\\n');\n"
    );

    const checks = checkExternalTools({
        contract: externalContract(),
        env: {PATH: directory},
        run: runBounded,
    });
    const rendered = JSON.stringify(checks);

    assert.deepEqual(checks[0], {
        id: 'semgrep',
        status: 'FAIL',
        expected: '>=1.173.0 <2.0.0',
        message: 'malformed version',
    });
    assert.doesNotMatch(rendered, /CANARY-API-KEY-94f0/);
});

test('reports a version probe timeout without subprocess output', (t) => {
    const directory = makeTempDir();
    t.after(() => fs.rmSync(directory, {recursive: true, force: true}));
    writeExecutable(directory, 'semgrep', "process.stderr.write('CANARY-API-KEY-94f0');\nsetTimeout(() => {}, 1000);\n");
    const run = (command, args, options) => runBounded(command, args, {...options, timeout: 20});

    const checks = checkExternalTools({contract: externalContract(), env: {PATH: directory}, run});

    assert.deepEqual(checks[0], {
        id: 'semgrep',
        status: 'FAIL',
        expected: '>=1.173.0 <2.0.0',
        message: 'version probe timeout',
    });
    assert.doesNotMatch(JSON.stringify(checks), /CANARY-API-KEY-94f0/);
});

test('reports a version probe output limit without relaying output', (t) => {
    const directory = makeTempDir();
    t.after(() => fs.rmSync(directory, {recursive: true, force: true}));
    writeExecutable(directory, 'semgrep', "process.stdout.write('CANARY-API-KEY-94f0'.repeat(1024));\n");
    const run = (command, args, options) => runBounded(command, args, {...options, maxBuffer: 1024});

    const checks = checkExternalTools({contract: externalContract(), env: {PATH: directory}, run});

    assert.deepEqual(checks[0], {
        id: 'semgrep',
        status: 'FAIL',
        expected: '>=1.173.0 <2.0.0',
        message: 'version probe output limit',
    });
    assert.doesNotMatch(JSON.stringify(checks), /CANARY-API-KEY-94f0/);
});

test('Semgrep local scan runs without login or network approval', (t) => {
    const directory = makeTempDir();
    t.after(() => fs.rmSync(directory, {recursive: true, force: true}));
    const projectRoot = path.join(directory, 'project');
    fs.mkdirSync(projectRoot, {mode: 0o700});
    fs.writeFileSync(path.join(projectRoot, 'rules.yml'), 'rules:\n  - id: fixture\n    languages: [javascript]\n    message: fixture\n    severity: WARNING\n    pattern: dangerous(...)\n', {mode: 0o600});
    const env = {
        PATH: `${directory}${path.delimiter}${process.env.PATH}`, HOME: directory,
        GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_NOSYSTEM: '1',
    };
    const git = (...args) => execFileSync('git', args, {cwd: projectRoot, env, timeout: 15000, stdio: 'pipe'});
    git('init', '--quiet', '-b', 'fixture');
    git('add', '--', 'rules.yml');
    git('-c', 'core.hooksPath=/dev/null', '-c', 'commit.gpgsign=false', '-c', 'user.name=Test User',
        '-c', 'user.email=test@example.com', 'commit', '--quiet', '-m', 'committed local rule fixture');
    const invocation = path.join(directory, 'semgrep-run');
    writeExecutable(directory, 'semgrep', `
if (process.argv[2] === '--version') { process.stdout.write('1.173.0\\n'); process.exit(0); }
if (process.argv[2] !== 'scan') process.exit(97);
require('node:fs').appendFileSync(${JSON.stringify(invocation)}, JSON.stringify({args: process.argv.slice(2), cwd: process.cwd()}));
`);

    const result = spawnSync(process.execPath, [
        path.join(coreRoot, 'scripts', 'prism-tool.js'), 'run', 'semgrep', '--', 'scan', '--config', 'rules.yml',
    ], {cwd: projectRoot, env, input: '', encoding: 'utf8', timeout: 30000});

    assert.equal(result.status, 0, result.stderr);
    const scanned = JSON.parse(fs.readFileSync(invocation, 'utf8'));
    assert.deepEqual(scanned.args, ['scan', '--config', './rules.yml']);
    assert.notEqual(scanned.cwd, projectRoot);
    assert.equal(fs.existsSync(scanned.cwd), false);
});

// vim: ft=javascript sts=4 sw=4 ts=4 et :
