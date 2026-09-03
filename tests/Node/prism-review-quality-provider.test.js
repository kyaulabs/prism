// $KYAULabs: prism-review-quality-provider.test.js kyau@aura.kyaulabs 2026/09/02 -0700 Exp $

'use strict';

const assert = require('node:assert/strict');
const {spawnSync} = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const {registrationFor} = require('../../packages/prism-core/scripts/prism-tool/discovery');
const {
    protectedAdapterIdentity,
    resolveQualityProvider,
    validateQualityReport,
} = require('../../packages/prism-core/scripts/prism-review/quality-provider');

function git(root, ...args) {
    const result = spawnSync('git', args, {cwd: root, encoding: 'utf8'});
    assert.equal(result.status, 0, result.stderr);
    return result.stdout.trim();
}

function writeJson(file, value) {
    fs.mkdirSync(path.dirname(file), {recursive: true});
    fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);
}

function writeAdapter(root, version = '1.2.3') {
    const contract = {
        schemaVersion: 1,
        package: '@fixture/adapter',
        role: 'adapter',
        components: [{
            id: 'fixture-tool',
            kind: 'command',
            ecosystem: 'npm',
            package: 'fixture-tool',
            version: '1.0.0',
            provisioning: 'consumer-dev',
            authentication: 'none',
            executable: 'fixture-tool',
            versionArguments: ['--version'],
            argumentPolicy: {mode: 'passthrough'},
        }],
        qualityProvider: {
            id: 'fixture-quality',
            protocolVersion: 1,
            gates: ['fixture.lint', 'fixture.test'],
        },
    };
    writeJson(path.join(root, 'package.json'), {
        name: '@fixture/adapter',
        version,
        prism: {
            adapter: true,
            bootstrapProtocol: 1,
            toolchain: './toolchain.json',
            handler: './scripts/prism-tool-adapter.js',
            review: './config/prism-review.json',
        },
    });
    writeJson(path.join(root, 'toolchain.json'), contract);
    writeJson(path.join(root, 'config', 'prism-review.json'), {});
    fs.mkdirSync(path.join(root, 'scripts'), {recursive: true});
    fs.writeFileSync(path.join(root, 'scripts', 'prism-tool-adapter.js'), `'use strict';
module.exports = {
    inspect() {},
    resolveTool() {},
    async runQualityProvider() { return {status: 'PASS'}; },
};
`);
}

function fixture(t) {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'prism-quality-provider-'));
    t.after(() => fs.rmSync(root, {recursive: true, force: true}));
    const repositoryRoot = path.join(root, 'repository');
    const packageRoot = path.join(repositoryRoot, 'packages', 'adapter');
    const installedAdapter = path.join(root, 'installed', 'adapter');
    const coreRoot = path.join(root, 'installed', 'core');
    fs.mkdirSync(repositoryRoot, {recursive: true});
    fs.mkdirSync(coreRoot, {recursive: true});
    writeAdapter(packageRoot);
    writeAdapter(installedAdapter);
    git(repositoryRoot, 'init', '-q');
    git(repositoryRoot, 'config', 'user.name', 'Fixture');
    git(repositoryRoot, 'config', 'user.email', 'fixture@example.test');
    git(repositoryRoot, 'add', '-A');
    git(repositoryRoot, 'commit', '-q', '-m', 'build: add adapter');
    const protectedBase = git(repositoryRoot, 'rev-parse', 'HEAD');
    return {
        coreRoot,
        installedAdapter,
        packageRoot,
        protectedBase,
        repositoryRoot,
        registration: registrationFor(packageRoot, '@fixture/adapter'),
    };
}

function qualityReportFixture() {
    const expected = {
        id: 'fixture-quality',
        packageName: '@fixture/adapter',
        packageVersion: '1.2.3',
        protocolVersion: 1,
        gates: ['fixture.lint', 'fixture.test'],
    };
    const empty = 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855';
    const gate = (id) => ({
        id,
        status: 'PASS',
        command: ['fixture-tool', id],
        tools: [{id: 'fixture-tool', version: '1.0.0'}],
        stdout: {bytes: 0, sha256: empty},
        stderr: {bytes: 0, sha256: empty},
        artifacts: [],
    });
    return {
        expected,
        report: {
            schemaVersion: 1,
            provider: {
                id: expected.id,
                packageName: expected.packageName,
                packageVersion: expected.packageVersion,
                protocolVersion: expected.protocolVersion,
            },
            status: 'PASS',
            gates: expected.gates.map(gate),
        },
    };
}

test('accepts only a complete closed bounded quality report', () => {
    const fixture = qualityReportFixture();

    assert.equal(validateQualityReport(fixture.report, fixture.expected).status, 'PASS');
    const mutations = [
        (report) => { report.unknown = true; },
        (report) => { report.gates.pop(); },
        (report) => { report.gates[1].id = report.gates[0].id; },
        (report) => { report.gates[0].rawOutput = 'private output'; },
        (report) => { report.gates[0].stdout.bytes = 1048577; },
        (report) => { report.gates[0].status = 'FAIL'; },
    ];
    for (const mutate of mutations) {
        const changed = structuredClone(fixture.report);
        mutate(changed);
        assert.throws(() => validateQualityReport(changed, fixture.expected), /quality/);
    }
});

test('rejects absolute paths in normalized quality commands', () => {
    const expected = {
        id: 'fixture-quality',
        packageName: '@fixture/adapter',
        packageVersion: '1.2.3',
        protocolVersion: 1,
        gates: ['fixture.test'],
    };
    const digest = 'a'.repeat(64);
    const report = {
        schemaVersion: 1,
        provider: {
            id: expected.id,
            packageName: expected.packageName,
            packageVersion: expected.packageVersion,
            protocolVersion: expected.protocolVersion,
        },
        status: 'PASS',
        gates: [{
            id: 'fixture.test',
            status: 'PASS',
            command: ['node', '/private/repository/test.js'],
            tools: [{id: 'node', version: '24.0.0'}],
            stdout: {bytes: 0, sha256: digest},
            stderr: {bytes: 0, sha256: digest},
            artifacts: [],
        }],
    };

    assert.throws(() => validateQualityReport(report, expected), /quality gate/);
});

test('rejects an installed provider whose handler path differs from protected base', (t) => {
    const target = fixture(t);
    const manifestPath = path.join(target.installedAdapter, 'package.json');
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    manifest.prism.handler = './scripts/alternate.js';
    writeJson(manifestPath, manifest);
    fs.copyFileSync(
        path.join(target.installedAdapter, 'scripts', 'prism-tool-adapter.js'),
        path.join(target.installedAdapter, 'scripts', 'alternate.js')
    );

    assert.throws(() => resolveQualityProvider({
        ...target,
        resolvePackage: () => target.installedAdapter,
    }), /identity mismatch/);
});

test('rejects a symlink-selected external quality package', (t) => {
    const target = fixture(t);
    const linked = path.join(path.dirname(target.installedAdapter), 'linked-adapter');
    fs.symlinkSync(target.installedAdapter, linked);

    assert.throws(() => resolveQualityProvider({
        ...target,
        resolvePackage: () => linked,
    }), /provider/);
});

test('resolves exact protected-base adapter quality code outside the reviewed repository', (t) => {
    const target = fixture(t);

    const expected = protectedAdapterIdentity(target);
    const provider = resolveQualityProvider({
        ...target,
        resolvePackage: () => target.installedAdapter,
    });

    assert.equal(expected.packageName, '@fixture/adapter');
    assert.equal(expected.packageVersion, '1.2.3');
    assert.deepEqual(expected.qualityProvider.gates, ['fixture.lint', 'fixture.test']);
    assert.deepEqual(provider.identity, {
        id: 'fixture-quality',
        packageName: '@fixture/adapter',
        packageVersion: '1.2.3',
        protocolVersion: 1,
        gates: ['fixture.lint', 'fixture.test'],
        sourceClass: 'INSTALLED_EXTERNAL',
    });
    assert.equal(typeof provider.run, 'function');
});

// vim: ft=javascript sts=4 sw=4 ts=4 et :
