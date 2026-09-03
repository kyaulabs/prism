// $KYAULabs: prism-review-check.test.js kyau@aura.kyaulabs 2026/09/02 -0700 Exp $

'use strict';

const assert = require('node:assert/strict');
const childProcess = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const {makeTempDir} = require('./helpers');
const {
    inspectCheck,
    runDeterministicCheck,
    verifyCheck,
} = require('../../packages/prism-core/scripts/prism-review/check');
const {CORE_GATE_IDS} = require('../../packages/prism-core/scripts/prism-review/core-quality');

const coreRoot = path.resolve(__dirname, '../../packages/prism-core');
const EMPTY_DIGEST = {
    bytes: 0,
    sha256: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
};

function git(root, args) {
    const result = childProcess.spawnSync('git', args, {cwd: root, encoding: 'utf8'});
    assert.equal(result.status, 0, result.stderr);
    return result.stdout.trim();
}

function repository(t) {
    const root = makeTempDir();
    t.after(() => fs.rmSync(root, {recursive: true, force: true}));
    git(root, ['init', '-b', 'develop']);
    git(root, ['config', 'user.name', 'Prism Test']);
    git(root, ['config', 'user.email', 'prism@example.test']);
    fs.writeFileSync(path.join(root, '.gitignore'), '.pi/prism-tool/code-review/\n');
    fs.writeFileSync(path.join(root, 'README.md'), 'base\n');
    git(root, ['add', '.']);
    git(root, ['commit', '-m', 'base']);
    git(root, ['checkout', '-b', 'feat/check']);
    fs.writeFileSync(path.join(root, 'README.md'), 'head\n');
    git(root, ['add', 'README.md']);
    git(root, ['commit', '-m', 'head']);
    return {
        root,
        baseSha: git(root, ['rev-parse', 'develop']),
        headSha: git(root, ['rev-parse', 'HEAD']),
    };
}

function gate(id) {
    return {
        id,
        status: 'PASS',
        command: ['fixture', id],
        tools: [],
        stdout: EMPTY_DIGEST,
        stderr: EMPTY_DIGEST,
        artifacts: [],
    };
}

function coreReport() {
    return {
        schemaVersion: 1,
        core: {packageName: '@kyaulabs/prism-core', packageVersion: '0.4.3'},
        status: 'PASS',
        gates: CORE_GATE_IDS.map(gate),
    };
}

function adapterProvider(transform = (report) => report) {
    if (typeof transform !== 'function') transform = (report) => report;
    const identity = {
        id: 'fixture-quality',
        packageName: '@fixture/adapter',
        packageVersion: '1.0.0',
        protocolVersion: 1,
        gates: ['fixture.test'],
        sourceClass: 'INSTALLED_EXTERNAL',
    };
    return {
        identity,
        run: async () => transform({
            schemaVersion: 1,
            provider: {
                id: identity.id,
                packageName: identity.packageName,
                packageVersion: identity.packageVersion,
                protocolVersion: identity.protocolVersion,
            },
            status: 'PASS',
            gates: [gate('fixture.test')],
        }),
    };
}

test('publishes FAIL when HEAD changes after Core quality execution', async (t) => {
    const fixture = repository(t);
    const result = await runDeterministicCheck({baseRef: 'develop'}, {
        projectRoot: fixture.root,
        coreRoot,
        randomBytes: () => Buffer.from('0123456789abcdef'),
        resolveQualityProvider: adapterProvider,
        runCoreQuality: async () => {
            fs.writeFileSync(path.join(fixture.root, 'README.md'), 'moved HEAD\n');
            git(fixture.root, ['add', 'README.md']);
            git(fixture.root, ['commit', '-m', 'move head']);
            return coreReport();
        },
    });

    assert.equal(result.status, 'FAIL');
    assert.equal(inspectCheck({projectRoot: fixture.root}).record.status, 'FAIL');
});

test('rejects a dirty worktree and makes an existing PASS unverifiable', async (t) => {
    const fixture = repository(t);
    const context = {
        projectRoot: fixture.root,
        coreRoot,
        randomBytes: () => Buffer.from('0123456789abcdef'),
        resolveQualityProvider: adapterProvider,
        runCoreQuality: async () => coreReport(),
    };
    assert.equal((await runDeterministicCheck({baseRef: 'develop'}, context)).status, 'PASS');
    fs.writeFileSync(path.join(fixture.root, 'untracked.txt'), 'dirty\n');

    await assert.rejects(() => runDeterministicCheck({baseRef: 'develop'}, context), /dirty/);
    assert.throws(() => verifyCheck({
        branch: 'feat/check',
        baseRef: 'develop',
        baseSha: fixture.baseSha,
        headSha: fixture.headSha,
    }, {projectRoot: fixture.root}), /unavailable/);
});

test('publishes bounded failed adapter gate evidence without raw output', async (t) => {
    const fixture = repository(t);
    const provider = adapterProvider((report) => ({
        ...report,
        status: 'FAIL',
        gates: [{...report.gates[0], status: 'FAIL', stdout: {bytes: 23,
            sha256: 'a'.repeat(64)}}],
    }));

    const result = await runDeterministicCheck({baseRef: 'develop'}, {
        projectRoot: fixture.root,
        coreRoot,
        randomBytes: () => Buffer.from('0123456789abcdef'),
        resolveQualityProvider: async () => provider,
        runCoreQuality: async () => coreReport(),
    });

    assert.equal(result.status, 'FAIL');
    assert.equal(result.gates.find(({id}) => id === 'fixture.test').status, 'FAIL');
    assert.deepEqual(Object.keys(result.gates.find(({id}) => id === 'fixture.test')).sort(),
        ['artifacts', 'command', 'id', 'status', 'stderr', 'stdout', 'tools']);
});

test('retains no reusable PASS after a provider omits a declared gate', async (t) => {
    const fixture = repository(t);
    const provider = adapterProvider((report) => ({...report, gates: []}));

    const result = await runDeterministicCheck({baseRef: 'develop'}, {
        projectRoot: fixture.root,
        coreRoot,
        randomBytes: () => Buffer.from('0123456789abcdef'),
        resolveQualityProvider: async () => provider,
        runCoreQuality: async () => coreReport(),
    });

    assert.equal(result.status, 'FAIL');
    assert.equal(inspectCheck({projectRoot: fixture.root}).record.status, 'FAIL');
    assert.throws(() => verifyCheck({
        branch: 'feat/check',
        baseRef: 'develop',
        baseSha: fixture.baseSha,
        headSha: fixture.headSha,
    }, {projectRoot: fixture.root}), /unavailable/);
});

test('invalidates a prior PASS when the installed provider becomes unavailable', async (t) => {
    const fixture = repository(t);
    const context = {
        projectRoot: fixture.root,
        coreRoot,
        randomBytes: () => Buffer.from('0123456789abcdef'),
        resolveQualityProvider: adapterProvider,
        runCoreQuality: async () => coreReport(),
    };
    assert.equal((await runDeterministicCheck({baseRef: 'develop'}, context)).status, 'PASS');
    context.resolveQualityProvider = async () => {
        throw new Error('provider-resolution-output-canary');
    };

    const failed = await runDeterministicCheck({baseRef: 'develop'}, context);

    assert.equal(failed.status, 'FAIL');
    assert.equal(inspectCheck({projectRoot: fixture.root}).record.status, 'FAIL');
    assert.equal(JSON.stringify(failed).includes('provider-resolution-output-canary'), false);
});

test('invalidates a prior PASS before an interrupted retry invokes a gate', async (t) => {
    const fixture = repository(t);
    const context = {
        projectRoot: fixture.root,
        coreRoot,
        randomBytes: () => Buffer.from('0123456789abcdef'),
        resolveQualityProvider: adapterProvider,
        runCoreQuality: async () => coreReport(),
    };
    assert.equal((await runDeterministicCheck({baseRef: 'develop'}, context)).status, 'PASS');
    let observed;
    context.runCoreQuality = async () => {
        observed = inspectCheck({projectRoot: fixture.root});
        throw Object.assign(new Error('interrupted-output-canary'), {code: 'SIGINT'});
    };

    const failed = await runDeterministicCheck({baseRef: 'develop'}, context);

    assert.equal(observed.record.status, 'RUNNING');
    assert.equal(failed.status, 'FAIL');
    assert.equal(inspectCheck({projectRoot: fixture.root}).record.status, 'FAIL');
    assert.equal(JSON.stringify(inspectCheck({projectRoot: fixture.root}).record)
        .includes('interrupted-output-canary'), false);
    assert.throws(() => verifyCheck({
        branch: 'feat/check',
        baseRef: 'develop',
        baseSha: fixture.baseSha,
        headSha: fixture.headSha,
    }, {projectRoot: fixture.root}), /unavailable/);
});

test('publishes RUNNING before gates and verifies the exact passing HEAD', async (t) => {
    const fixture = repository(t);
    let running;
    const result = await runDeterministicCheck({baseRef: 'develop'}, {
        projectRoot: fixture.root,
        coreRoot,
        randomBytes: () => Buffer.from('0123456789abcdef'),
        resolveQualityProvider: adapterProvider,
        runCoreQuality: async () => {
            running = inspectCheck({projectRoot: fixture.root});
            return coreReport();
        },
    });

    assert.equal(running.record.status, 'RUNNING');
    assert.equal(running.record.attemptId, '30313233343536373839616263646566');
    assert.equal(result.status, 'PASS');
    assert.equal(result.baseSha, fixture.baseSha);
    assert.equal(result.headSha, fixture.headSha);
    assert.equal(verifyCheck({
        branch: 'feat/check',
        baseRef: 'develop',
        baseSha: fixture.baseSha,
        headSha: fixture.headSha,
    }, {projectRoot: fixture.root}).digest, result.digest);
});

// vim: ft=javascript sts=4 sw=4 ts=4 et :
