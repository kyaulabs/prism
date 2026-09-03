// $KYAULabs: prism-tool-php-web-quality.test.js kyau@aura.kyaulabs 2026/09/03 -0700 Exp $

'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');
const test = require('node:test');
const {setTimeout: delay} = require('node:timers/promises');

const {validateQualityReport} = require('../../packages/prism-core/scripts/prism-review/quality-provider');
const {loadContract} = require('../../packages/prism-core/scripts/prism-tool/contract');
const adapter = require('../../packages/prism-php-web/scripts/prism-tool-adapter');

const root = path.resolve(__dirname, '../..');
const expectedGates = [
    'php-web.changed-file-coverage',
    'php-web.composer-audit',
    'php-web.eslint',
    'php-web.node-tests',
    'php-web.npm-audit',
    'php-web.pest-coverage',
    'php-web.php-cs-fixer',
    'php-web.php-syntax',
    'php-web.playwright-list',
    'php-web.shell-tests',
    'php-web.stylelint',
    'php-web.typescript',
];

function success(request) {
    return Promise.resolve({
        status: 0,
        stdout: Buffer.from(`passed ${request.id}\n`),
        stderr: Buffer.alloc(0),
        tools: [{id: request.toolId ?? request.command, version: '1.0.0'}],
        artifacts: [],
    });
}

test('declares and exports the exact PHP/web quality-provider contract', () => {
    const contract = loadContract(path.join(root, 'packages/prism-php-web/toolchain.json'));

    assert.deepEqual(contract.qualityProvider, {
        id: 'php-web-quality',
        protocolVersion: 1,
        gates: expectedGates,
    });
    assert.equal(typeof adapter.runQualityProvider, 'function');
});

test('runs changed-file coverage only after the Pest artifact exists', async () => {
    let coverageReady = false;
    const runServer = async (request) => {
        if (request.toolId === 'pest') {
            await delay(20);
            coverageReady = true;
        }
        return success(request);
    };
    const report = await adapter.runQualityProvider({
        projectRoot: root,
        baseSha: '1'.repeat(40),
        headSha: '2'.repeat(40),
        trackedPaths: ['app/example.php', 'composer.lock'],
        runCommand: success,
        runTool: success,
        runServer,
        packageScripts: ['test:node'],
        verifySnapshot: async () => true,
        changedLines: async () => [{file: 'app/example.php', line: 7}],
        readArtifact: async () => {
            assert.equal(coverageReady, true);
            return Buffer.from('<coverage><file name="app/example.php"><line num="7" type="stmt" count="1"/></file></coverage>');
        },
    });

    assert.equal(report.gates.find(({id}) => id === 'php-web.changed-file-coverage').status, 'PASS');
});

test('executes quality gates sequentially', async () => {
    let active = 0;
    let maximum = 0;
    const tracked = async (request) => {
        active += 1;
        maximum = Math.max(maximum, active);
        await delay(5);
        active -= 1;
        return success(request);
    };

    await adapter.runQualityProvider({
        projectRoot: root,
        baseSha: '1'.repeat(40),
        headSha: '2'.repeat(40),
        trackedPaths: [
            'app/example.php',
            'assets/example.js',
            'tests/Node/example.test.js',
            'tests/Shell/example_test.sh',
            'composer.lock',
            'package-lock.json',
        ],
        packageScripts: ['test:node'],
        runCommand: tracked,
        runTool: tracked,
        runServer: tracked,
        changedLines: async () => [],
        readArtifact: async () => Buffer.from('<coverage/>'),
        verifySnapshot: async () => true,
    });

    assert.equal(maximum, 1);
});

test('executes only shell regression tests through the shell gate', async () => {
    const shellRequests = [];
    await adapter.runQualityProvider({
        projectRoot: root,
        baseSha: '1'.repeat(40),
        headSha: '2'.repeat(40),
        trackedPaths: ['scripts/deploy.sh', 'tests/Shell/example_test.sh'],
        packageScripts: [],
        runCommand: async (request) => {
            if (request.command === 'bash') shellRequests.push(request.args);
            return success(request);
        },
        runTool: success,
        runServer: success,
        changedLines: async () => [],
        readArtifact: async () => Buffer.from('<coverage/>'),
        verifySnapshot: async () => true,
    });

    assert.deepEqual(shellRequests, [['tests/Shell/example_test.sh']]);
});

test('ignores non-statement Clover lines in changed-file coverage', async () => {
    const report = await adapter.runQualityProvider({
        projectRoot: root,
        baseSha: '1'.repeat(40),
        headSha: '2'.repeat(40),
        trackedPaths: ['app/example.php'],
        packageScripts: [],
        runCommand: success,
        runTool: success,
        runServer: success,
        changedLines: async () => [{file: 'app/example.php', line: 7}],
        readArtifact: async () => Buffer.from(
            '<coverage><file name="app/example.php"><line num="7" type="method" count="1"/></file></coverage>'
        ),
        verifySnapshot: async () => true,
    });

    assert.equal(report.gates.find(({id}) => id === 'php-web.changed-file-coverage').status, 'FAIL');
});

test('stops multi-file quality execution when combined output exceeds its bound', async () => {
    let syntaxCalls = 0;
    const report = await adapter.runQualityProvider({
        projectRoot: root,
        baseSha: '1'.repeat(40),
        headSha: '2'.repeat(40),
        trackedPaths: ['app/one.php', 'app/two.php', 'app/three.php'],
        packageScripts: [],
        runCommand: async (request) => {
            if (request.command === 'php' && request.args[0] === '-l') {
                syntaxCalls += 1;
                return {...await success(request), stdout: Buffer.alloc(600000)};
            }
            return success(request);
        },
        runTool: success,
        runServer: success,
        changedLines: async () => [],
        readArtifact: async () => Buffer.from('<coverage/>'),
        verifySnapshot: async () => true,
    });

    assert.equal(report.gates.find(({id}) => id === 'php-web.php-syntax').status, 'FAIL');
    assert.equal(syntaxCalls, 2);
});

test('records the exact PHP CS Fixer invocation in its receipt', async () => {
    const report = await adapter.runQualityProvider({
        projectRoot: root,
        baseSha: '1'.repeat(40),
        headSha: '2'.repeat(40),
        trackedPaths: ['app/example.php'],
        packageScripts: [],
        runCommand: success,
        runTool: success,
        runServer: success,
        changedLines: async () => [],
        readArtifact: async () => Buffer.from('<coverage/>'),
        verifySnapshot: async () => true,
    });

    assert.deepEqual(report.gates.find(({id}) => id === 'php-web.php-cs-fixer').command,
        ['php-cs-fixer', 'fix', '--dry-run', '--diff', 'TRACKED_PHP_FILES']);
});

test('fails closed when execution output overflows or the snapshot drifts', async () => {
    const report = await adapter.runQualityProvider({
        projectRoot: root,
        baseSha: '1'.repeat(40),
        headSha: '2'.repeat(40),
        trackedPaths: ['app/example.php'],
        packageScripts: [],
        runCommand: success,
        runTool: async (request) => request.toolId === 'php-cs-fixer'
            ? {...await success(request), stdout: Buffer.alloc(1048577)}
            : success(request),
        runServer: success,
        changedLines: async () => [],
        readArtifact: async () => Buffer.from('<coverage/>'),
        verifySnapshot: async () => false,
    });

    assert.equal(report.status, 'FAIL');
    assert.equal(report.gates.find(({id}) => id === 'php-web.php-cs-fixer').status, 'FAIL');
    assert.equal(report.gates.find(({id}) => id === 'php-web.changed-file-coverage').status, 'FAIL');
});

test('returns a failed coverage receipt when coverage evidence cannot be read', async () => {
    const report = await adapter.runQualityProvider({
        projectRoot: root,
        baseSha: '1'.repeat(40),
        headSha: '2'.repeat(40),
        trackedPaths: ['app/example.php'],
        packageScripts: [],
        runCommand: success,
        runTool: success,
        runServer: success,
        changedLines: async () => [{file: 'app/example.php', line: 9}],
        readArtifact: async () => { throw new Error('coverage-output-canary'); },
        verifySnapshot: async () => true,
    });

    assert.equal(report.status, 'FAIL');
    const coverage = report.gates.find(({id}) => id === 'php-web.changed-file-coverage');
    assert.equal(coverage.status, 'FAIL');
    assert.equal(JSON.stringify(report).includes('coverage-output-canary'), false);
});

test('returns a failed report when final snapshot verification errors', async () => {
    const report = await adapter.runQualityProvider({
        projectRoot: root,
        baseSha: '1'.repeat(40),
        headSha: '2'.repeat(40),
        trackedPaths: [],
        packageScripts: [],
        runCommand: success,
        runTool: success,
        runServer: success,
        changedLines: async () => [],
        readArtifact: async () => Buffer.from('<coverage/>'),
        verifySnapshot: async () => { throw new Error('snapshot-output-canary'); },
    });

    assert.equal(report.status, 'FAIL');
    assert.equal(report.gates.find(({id}) => id === 'php-web.changed-file-coverage').status, 'FAIL');
    assert.equal(JSON.stringify(report).includes('snapshot-output-canary'), false);
});

test('fails the report for uncovered changed PHP lines without raw output', async () => {
    const report = await adapter.runQualityProvider({
        projectRoot: root,
        baseSha: '1'.repeat(40),
        headSha: '2'.repeat(40),
        trackedPaths: ['app/example.php'],
        runCommand: success,
        runTool: success,
        runServer: success,
        packageScripts: ['test:node'],
        verifySnapshot: async () => true,
        changedLines: async () => [{file: 'app/example.php', line: 9}],
        readArtifact: async () => Buffer.from('<coverage><file name="app/example.php"><line num="9" type="stmt" count="0"/></file></coverage>'),
    });

    assert.equal(report.status, 'FAIL');
    assert.equal(report.gates.find(({id}) => id === 'php-web.changed-file-coverage').status, 'FAIL');
    assert.equal(JSON.stringify(report).includes('<coverage>'), false);
});

test('returns one closed receipt for every declared PHP/web gate', async () => {
    const report = await adapter.runQualityProvider({
        projectRoot: root,
        baseSha: '1'.repeat(40),
        headSha: '2'.repeat(40),
        trackedPaths: [
            'app/example.php',
            'assets/example.scss',
            'assets/example.js',
            'tests/Node/example.test.js',
            'tests/Shell/example_test.sh',
            'tsconfig.json',
            'composer.lock',
            'package-lock.json',
        ],
        runCommand: success,
        runTool: success,
        runServer: success,
        packageScripts: ['test:node'],
        verifySnapshot: async () => true,
        changedLines: async () => [],
        readArtifact: async () => Buffer.from('<?xml version="1.0"?><coverage/>'),
    });

    assert.equal(report.schemaVersion, 1);
    assert.equal(report.provider.id, 'php-web-quality');
    assert.equal(report.status, 'PASS');
    assert.deepEqual(report.gates.map(({id}) => id), expectedGates);
    assert.equal(report.gates.every(({status}) => ['PASS', 'SKIPPED'].includes(status)), true);
    assert.equal(JSON.stringify(report).includes('passed php-web'), false);
    assert.equal(validateQualityReport(report, {
        id: 'php-web-quality',
        packageName: '@kyaulabs/prism-php-web',
        packageVersion: require('../../packages/prism-php-web/package.json').version,
        protocolVersion: 1,
        gates: expectedGates,
    }).status, 'PASS');
});

// vim: ft=javascript sts=4 sw=4 ts=4 et :
