// $KYAULabs: prism-tool-preflight.test.js kyau@aura.kyaulabs 2026/08/19 -0700 Exp $

'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const {makeTempDir} = require('./helpers');
const {main} = require('../../packages/prism-core/scripts/prism-tool/cli');
const {runBounded} = require('../../packages/prism-core/scripts/prism-tool/process');
const {
    checkExternalTools,
    testOcrConnectivity,
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

function writeConsent(directory, mode = 0o600) {
    const consentPath = path.join(directory, 'agent', 'prism-consent.json');
    fs.mkdirSync(path.dirname(consentPath), {mode: 0o700});
    fs.writeFileSync(consentPath, '{"schemaVersion":1,"ocr":true}\n', {mode});
    fs.chmodSync(consentPath, mode);
    return consentPath;
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
            {
                id: 'ocr',
                kind: 'command',
                provisioning: 'external',
                executable: 'ocr',
                versionRequirement: {
                    mode: 'range',
                    minimum: '1.9.1',
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
    writeExecutable(
        directory,
        'ocr',
        "process.stdout.write('\\u001b[33m[ocr] A new version (v1.9.3) is available.\\u001b[0m\\nopen-code-review v1.9.1 (abc123) linux/amd64\\n');\n"
    );

    const checks = checkExternalTools({
        contract: externalContract(),
        env: {PATH: directory},
        run: runBounded,
    });

    assert.deepEqual(checks, [
        {id: 'semgrep', status: 'PASS', expected: '>=1.173.0 <2.0.0', actual: '1.173.0', message: 'compatible version'},
        {id: 'ocr', status: 'PASS', expected: '>=1.9.1 <2.0.0', actual: '1.9.1', message: 'compatible version'},
    ]);
});

test('parses the OCR product line separately from warning output streams', (t) => {
    const directory = makeTempDir();
    t.after(() => fs.rmSync(directory, {recursive: true, force: true}));
    writeExecutable(directory, 'semgrep', '');
    writeExecutable(directory, 'ocr', '');
    const run = (command) => path.basename(command) === 'semgrep'
        ? {status: 0, stdout: '1.173.0', stderr: '', error: undefined}
        : {
            status: 0,
            stdout: '[ocr] A new version (v1.9.3) is available.',
            stderr: 'open-code-review v1.9.1 linux/amd64',
            error: undefined,
        };

    const checks = checkExternalTools({contract: externalContract(), env: {PATH: directory}, run});

    assert.deepEqual(checks[1], {
        id: 'ocr',
        status: 'PASS',
        expected: '>=1.9.1 <2.0.0',
        actual: '1.9.1',
        message: 'compatible version',
    });
});

test('rejects duplicate OCR installed-version evidence', (t) => {
    const directory = makeTempDir();
    t.after(() => fs.rmSync(directory, {recursive: true, force: true}));
    writeExecutable(directory, 'semgrep', "process.stdout.write('1.173.0\\n');\n");
    writeExecutable(
        directory,
        'ocr',
        "process.stdout.write('open-code-review v1.9.1 linux/amd64\\nopen-code-review v1.9.1 linux/amd64\\n');\n"
    );

    const checks = checkExternalTools({
        contract: externalContract(),
        env: {PATH: directory},
        run: runBounded,
    });

    assert.deepEqual(checks[1], {
        id: 'ocr',
        status: 'FAIL',
        expected: '>=1.9.1 <2.0.0',
        message: 'malformed version',
    });
});

test('rejects duplicate Semgrep installed-version evidence', (t) => {
    const directory = makeTempDir();
    t.after(() => fs.rmSync(directory, {recursive: true, force: true}));
    writeExecutable(directory, 'semgrep', '');
    writeExecutable(directory, 'ocr', '');
    const run = (command) => ({
        status: 0,
        stdout: path.basename(command) === 'semgrep'
            ? '1.173.0\n1.174.0'
            : 'open-code-review v1.9.1 linux/amd64',
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
    writeExecutable(directory, 'ocr', '');
    const cases = [
        {actual: '1.999.7', status: 'PASS', message: 'compatible version'},
        {actual: '1.172.9', status: 'FAIL', message: 'version mismatch'},
        {actual: '2.0.0', status: 'FAIL', message: 'version mismatch'},
    ];

    for (const fixture of cases) {
        const run = (command) => ({
            status: 0,
            stdout: path.basename(command) === 'semgrep'
                ? fixture.actual
                : 'open-code-review v1.9.1 linux/amd64',
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

test('enforces lower-inclusive and upper-exclusive OCR compatibility', (t) => {
    const directory = makeTempDir();
    t.after(() => fs.rmSync(directory, {recursive: true, force: true}));
    writeExecutable(directory, 'semgrep', '');
    writeExecutable(directory, 'ocr', '');
    const cases = [
        {actual: '1.99.7', status: 'PASS', message: 'compatible version'},
        {actual: '1.9.0', status: 'FAIL', message: 'version mismatch'},
        {actual: '2.0.0', status: 'FAIL', message: 'version mismatch'},
    ];

    for (const fixture of cases) {
        const run = (command) => ({
            status: 0,
            stdout: path.basename(command) === 'semgrep'
                ? '1.173.0'
                : `open-code-review v${fixture.actual} linux/amd64`,
            stderr: '',
            error: undefined,
        });
        const checks = checkExternalTools({contract: externalContract(), env: {PATH: directory}, run});
        assert.deepEqual(checks[1], {
            id: 'ocr',
            status: fixture.status,
            expected: '>=1.9.1 <2.0.0',
            actual: fixture.actual,
            message: fixture.message,
        });
    }
});

test('bounds every external version probe with a fixed argument array', (t) => {
    const directory = makeTempDir();
    t.after(() => fs.rmSync(directory, {recursive: true, force: true}));
    writeExecutable(directory, 'semgrep', '');
    writeExecutable(directory, 'ocr', '');
    const env = {PATH: directory};
    const invocations = [];
    const run = (command, args, options) => {
        invocations.push({command: path.basename(command), args, options});
        const stdout = path.basename(command) === 'semgrep'
            ? '1.173.0'
            : 'open-code-review v1.9.1 linux/amd64';
        return {status: 0, stdout, stderr: '', error: undefined};
    };

    checkExternalTools({contract: externalContract(), env, run});

    assert.deepEqual(invocations, [
        {command: 'semgrep', args: ['--version'], options: {env, maxBuffer: 1048576, timeout: 30000}},
        {command: 'ocr', args: ['--version'], options: {env, maxBuffer: 1048576, timeout: 30000}},
    ]);
});

test('reports a missing mandatory executable without probing authentication', (t) => {
    const directory = makeTempDir();
    t.after(() => fs.rmSync(directory, {recursive: true, force: true}));
    writeExecutable(directory, 'semgrep', "process.stdout.write('1.173.0\\n');\n");

    const checks = checkExternalTools({
        contract: externalContract(),
        env: {PATH: directory},
        run: runBounded,
    });

    assert.deepEqual(checks[1], {
        id: 'ocr',
        status: 'FAIL',
        expected: '>=1.9.1 <2.0.0',
        message: 'missing executable',
    });
});

test('reports a safe actual version when an external version mismatches', (t) => {
    const directory = makeTempDir();
    t.after(() => fs.rmSync(directory, {recursive: true, force: true}));
    writeExecutable(directory, 'semgrep', "process.stdout.write('1.172.0\\n');\n");
    writeExecutable(directory, 'ocr', "process.stdout.write('open-code-review v1.9.1 linux/amd64\\n');\n");

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
    writeExecutable(directory, 'ocr', "process.stdout.write('open-code-review v1.9.1 linux/amd64\\n');\n");

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
    writeExecutable(directory, 'ocr', "process.stdout.write('open-code-review v1.9.1 linux/amd64\\n');\n");
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
    writeExecutable(directory, 'ocr', "process.stdout.write('open-code-review v1.9.1 linux/amd64\\n');\n");
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

test('runs an OCR connectivity test with fixed bounded arguments', () => {
    const invocations = [];
    const result = testOcrConnectivity({
        run: (command, args, options) => {
            invocations.push({command, args, options});
            return {status: 0, stdout: 'CANARY-API-KEY-94f0', stderr: '', error: undefined};
        },
    });

    assert.deepEqual(invocations, [{
        command: 'ocr',
        args: ['llm', 'test'],
        options: {maxBuffer: 1048576, timeout: 30000},
    }]);
    assert.deepEqual(result, {
        id: 'ocr-connectivity',
        status: 'PASS',
        message: 'connectivity verified',
    });
    assert.doesNotMatch(JSON.stringify(result), /CANARY-API-KEY-94f0/);
});

test('reduces OCR connectivity failures to fixed sanitized reasons', () => {
    const cases = [
        {
            result: {status: 7, stdout: '', stderr: 'CANARY-API-KEY-94f0', error: undefined},
            message: 'non-zero',
        },
        {
            result: {status: null, stdout: '', stderr: 'CANARY-API-KEY-94f0', timedOut: true, error: {code: 'ETIMEDOUT'}},
            message: 'timeout',
        },
        {
            result: {status: null, stdout: 'CANARY-API-KEY-94f0', stderr: '', timedOut: false, error: {code: 'ENOBUFS'}},
            message: 'output-limit',
        },
        {
            result: {status: 'unexpected', stdout: 'CANARY-API-KEY-94f0', stderr: '', error: undefined},
            message: 'malformed',
        },
    ];

    for (const fixture of cases) {
        const result = testOcrConnectivity({run: () => fixture.result});
        assert.deepEqual(result, {
            id: 'ocr-connectivity',
            status: 'FAIL',
            message: fixture.message,
        });
        assert.doesNotMatch(JSON.stringify(result), /CANARY-API-KEY-94f0/);
    }
});

test('doctor local-only reports compatible readiness without OCR connectivity', async (t) => {
    const directory = makeTempDir();
    t.after(() => fs.rmSync(directory, {recursive: true, force: true}));
    const counter = path.join(directory, 'ocr-connectivity-runs');
    writeExecutable(directory, 'semgrep', "process.stdout.write('1.173.0\\n');\n");
    writeExecutable(
        directory,
        'ocr',
        `if (process.argv[2] === '--version') {\n\tprocess.stdout.write('open-code-review v1.9.1 linux/amd64\\n');\n} else {\n\trequire('node:fs').appendFileSync(${JSON.stringify(counter)}, 'run\\n');\n}\n`
    );

    const result = await captureWrites(() => main(['doctor', '--json', '--local-only'], {
        coreRoot,
        env: {PATH: directory},
        run: runBounded,
    }));

    assert.equal(result.status, 0);
    assert.equal(result.stderr, '');
    assert.deepEqual(JSON.parse(result.stdout), {
        schemaVersion: 1,
        command: 'doctor',
        status: 'GO',
        checks: [
            {id: 'semgrep', status: 'PASS', expected: '>=1.173.0 <2.0.0', actual: '1.173.0', message: 'compatible version'},
            {id: 'ocr', status: 'PASS', expected: '>=1.9.1 <2.0.0', actual: '1.9.1', message: 'compatible version'},
        ],
    });
    assert.equal(fs.existsSync(counter), false);
});

test('doctor reports NO-GO and never connects when standing consent is absent', async (t) => {
    const directory = makeTempDir();
    t.after(() => fs.rmSync(directory, {recursive: true, force: true}));
    const counter = path.join(directory, 'ocr-connectivity-runs');
    writeExecutable(directory, 'semgrep', "process.stdout.write('1.173.0\\n');\n");
    writeExecutable(
        directory,
        'ocr',
        `if (process.argv[2] === '--version') {\n\tprocess.stdout.write('open-code-review v1.9.1 linux/amd64\\n');\n} else {\n\trequire('node:fs').appendFileSync(${JSON.stringify(counter)}, 'run\\n');\n}\n`
    );

    const result = await captureWrites(() => main(['doctor', '--json'], {
        consentPath: path.join(directory, 'agent', 'prism-consent.json'),
        coreRoot,
        env: {PATH: directory},
        run: runBounded,
    }));

    assert.equal(result.status, 3);
    assert.equal(result.stderr, '');
    assert.deepEqual(JSON.parse(result.stdout).checks.at(-1), {
        id: 'ocr-consent',
        status: 'FAIL',
        message: 'run /setup to grant standing OCR consent',
    });
    assert.equal(JSON.parse(result.stdout).status, 'NO-GO');
    assert.equal(fs.existsSync(counter), false);
});

test('doctor reports NO-GO and never connects when standing consent is unsafe', async (t) => {
    const directory = makeTempDir();
    t.after(() => fs.rmSync(directory, {recursive: true, force: true}));
    const counter = path.join(directory, 'ocr-connectivity-runs');
    writeExecutable(directory, 'semgrep', "process.stdout.write('1.173.0\\n');\n");
    writeExecutable(
        directory,
        'ocr',
        `if (process.argv[2] === '--version') {\n\tprocess.stdout.write('open-code-review v1.9.1 linux/amd64\\n');\n} else {\n\trequire('node:fs').appendFileSync(${JSON.stringify(counter)}, 'run\\n');\n}\n`
    );
    const consentPath = writeConsent(directory, 0o644);

    const result = await captureWrites(() => main(['doctor', '--json'], {
        consentPath,
        coreRoot,
        env: {PATH: directory},
        run: runBounded,
    }));

    assert.equal(result.status, 3);
    assert.deepEqual(JSON.parse(result.stdout).checks.at(-1), {
        id: 'ocr-consent',
        status: 'FAIL',
        message: 'run /setup to grant standing OCR consent',
    });
    assert.equal(fs.existsSync(counter), false);
});

test('doctor runs one consented OCR connectivity test and sanitizes its output', async (t) => {
    const directory = makeTempDir();
    t.after(() => fs.rmSync(directory, {recursive: true, force: true}));
    const counter = path.join(directory, 'ocr-connectivity-runs');
    writeExecutable(directory, 'semgrep', "process.stdout.write('1.173.0\\n');\n");
    writeExecutable(
        directory,
        'ocr',
        `if (process.argv[2] === '--version') {\n\tprocess.stdout.write('open-code-review v1.9.1 linux/amd64\\n');\n} else {\n\trequire('node:fs').appendFileSync(${JSON.stringify(counter)}, 'run\\n');\n\tprocess.stdout.write('CANARY-API-KEY-94f0');\n}\n`
    );

    const result = await captureWrites(() => main(['doctor', '--json'], {
        consentPath: writeConsent(directory),
        coreRoot,
        env: {PATH: directory},
        run: runBounded,
    }));

    assert.equal(result.status, 0);
    assert.equal(result.stderr, '');
    assert.doesNotMatch(result.stdout, /CANARY-API-KEY-94f0/);
    assert.deepEqual(JSON.parse(result.stdout).checks.at(-1), {
        id: 'ocr-connectivity',
        status: 'PASS',
        message: 'connectivity verified',
    });
    assert.equal(fs.readFileSync(counter, 'utf8'), 'run\n');
});

test('generic OCR execution is unavailable for every former approval form', async () => {
    for (const args of [
        ['run', 'ocr', '--', 'review', '--audience', 'agent', '--format', 'json'],
        ['run', 'ocr', '--code-egress-approved=yes', '--', 'review', '--audience', 'agent', '--format', 'json'],
        ['run', 'ocr', '--timeout-ms=600000', '--', 'scan', '.'],
    ]) {
        let calls = 0;
        const result = await captureWrites(() => main(args, {
            coreRoot,
            input: 'CANARY-REVIEW-CONTENT',
            run: () => {
                calls += 1;
                throw new Error('generic OCR must not execute');
            },
        }));
        assert.equal(result.status, 2, args.join(' '));
        assert.match(result.stderr, /dedicated code-review operation|^usage:/);
        assert.equal(calls, 0, args.join(' '));
    }
});

test('Semgrep local scan runs without login or network approval', async (t) => {
    const directory = makeTempDir();
    t.after(() => fs.rmSync(directory, {recursive: true, force: true}));
    const invocation = path.join(directory, 'semgrep-run');
    writeExecutable(
        directory,
        'semgrep',
        `if (process.argv[2] === '--version') {\n\tprocess.stdout.write('1.173.0\\n');\n} else {\n\trequire('node:fs').writeFileSync(${JSON.stringify(invocation)}, JSON.stringify(process.argv.slice(2)));\n}\n`
    );
    writeExecutable(directory, 'ocr', "process.stdout.write('open-code-review v1.9.1 linux/amd64\\n');\n");

    const result = await captureWrites(() => main([
        'run',
        'semgrep',
        '--',
        'scan',
        '--config',
        'packages/prism-core/config/semgrep',
    ], {
        coreRoot,
        env: {PATH: directory},
        run: runBounded,
        input: '',
    }));

    assert.equal(result.status, 0);
    assert.deepEqual(JSON.parse(fs.readFileSync(invocation, 'utf8')), [
        'scan',
        '--config',
        'packages/prism-core/config/semgrep',
    ]);
});

// vim: ft=javascript sts=4 sw=4 ts=4 et :
