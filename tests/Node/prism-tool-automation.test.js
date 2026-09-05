// $KYAULabs: prism-tool-automation.test.js kyau@aura.kyaulabs 2026/09/04 -0700 Exp $

'use strict';

const assert = require('node:assert/strict');
const {execFileSync} = require('node:child_process');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const {main} = require('../../packages/prism-core/scripts/prism-tool/cli');
const {
    applyAutomation,
    inspectAutomation,
    planAutomation,
    verifyAutomation,
} = require('../../packages/prism-core/scripts/prism-tool/automation');
const {renderCoreAutomationProvider} = require(
    '../../packages/prism-core/scripts/prism-tool/automation-providers'
);
const {renderProjectManifest} = require(
    '../../packages/prism-core/scripts/prism-tool/project-manifest'
);
const adapterHandler = require('../../packages/prism-php-web/scripts/prism-tool-adapter');
const {makeTempDir, writeJson} = require('./helpers');

const CORE_ROOT = path.resolve(__dirname, '../../packages/prism-core');
const ADAPTER_ROOT = path.resolve(__dirname, '../../packages/prism-php-web');
const ADAPTER_CONTRACT = JSON.parse(
    fs.readFileSync(path.join(ADAPTER_ROOT, 'toolchain.json'), 'utf8')
);

function captureWrites(action) {
    let stdout = '';
    let stderr = '';
    const stdoutWrite = process.stdout.write;
    const stderrWrite = process.stderr.write;
    process.stdout.write = (chunk) => { stdout += String(chunk); return true; };
    process.stderr.write = (chunk) => { stderr += String(chunk); return true; };
    try {
        return {status: action(), stdout, stderr};
    } finally {
        process.stdout.write = stdoutWrite;
        process.stderr.write = stderrWrite;
    }
}

function makeFixture(t, adapterRoot = ADAPTER_ROOT) {
    const projectRoot = makeTempDir();
    writeJson(path.join(projectRoot, '.pi', 'settings.json'), {
        skills: [path.join(adapterRoot, 'skills')],
    });
    const adapterManifest = JSON.parse(fs.readFileSync(
        path.join(adapterRoot, 'package.json'), 'utf8'
    ));
    const manifestPath = path.join(projectRoot, '.prism', 'project.json');
    fs.mkdirSync(path.dirname(manifestPath), {recursive: true});
    fs.writeFileSync(manifestPath, renderProjectManifest({
        schemaVersion: 2,
        source: {mode: 'ESTABLISHED', evidence: null},
        capabilities: [],
        metadata: {
            schemaVersion: 1,
            displayName: 'Automation Fixture',
            summary: 'An established adapter automation fixture.',
        },
        coreVersion: require('../../packages/prism-core/package.json').version,
        adapter: {
            id: adapterManifest.name,
            packageName: adapterManifest.name,
            packageVersion: adapterManifest.version,
            bootstrapProtocol: adapterManifest.prism.bootstrapProtocol,
        },
    }), {mode: 0o644});
    fs.chmodSync(manifestPath, 0o644);
    t.after(() => fs.rmSync(projectRoot, {recursive: true, force: true}));
    return {projectRoot, coreRoot: CORE_ROOT};
}

function makeGitFixture(t, adapterRoot = ADAPTER_ROOT) {
    const fixture = makeFixture(t, adapterRoot);
    fs.writeFileSync(path.join(fixture.projectRoot, '.gitignore'), '.pi/prism-tool/\n');
    execFileSync('git', ['init', '-b', 'feat/tester-abcd-automation'], {
        cwd: fixture.projectRoot,
        stdio: 'ignore',
    });
    execFileSync('git', ['config', 'user.name', 'Test User'], {cwd: fixture.projectRoot});
    execFileSync('git', ['config', 'user.email', 'test@example.com'], {cwd: fixture.projectRoot});
    execFileSync('git', ['add', '.'], {cwd: fixture.projectRoot});
    execFileSync('git', ['commit', '-m', 'test fixture'], {
        cwd: fixture.projectRoot,
        stdio: 'ignore',
    });
    return fixture;
}

function makeCoreOnlyGitFixture(t) {
    const projectRoot = makeTempDir();
    fs.mkdirSync(path.join(projectRoot, '.pi'));
    fs.writeFileSync(path.join(projectRoot, '.gitignore'), '.pi/prism-tool/\n');
    execFileSync('git', ['init', '-b', 'feat/tester-abcd-automation'], {
        cwd: projectRoot,
        stdio: 'ignore',
    });
    execFileSync('git', ['config', 'user.name', 'Test User'], {cwd: projectRoot});
    execFileSync('git', ['config', 'user.email', 'test@example.com'], {cwd: projectRoot});
    execFileSync('git', ['add', '.'], {cwd: projectRoot});
    execFileSync('git', ['commit', '-m', 'test fixture'], {
        cwd: projectRoot,
        stdio: 'ignore',
    });
    t.after(() => fs.rmSync(projectRoot, {recursive: true, force: true}));
    return {projectRoot, coreRoot: CORE_ROOT};
}

function writeEstablishedMetadata(fixture, releaseRepository = null) {
    const metadataPath = path.join(fixture.projectRoot, '.pi', 'setup-metadata.json');
    const metadata = {
        schemaVersion: 1,
        displayName: 'Automation Fixture',
        summary: 'An established adapter automation fixture.',
        ...(releaseRepository === null ? {} : {
            capabilityMetadata: {
                'release-management': {repository: releaseRepository},
            },
        }),
    };
    fs.writeFileSync(metadataPath, `${JSON.stringify(metadata)}\n`, {mode: 0o600});
    fs.chmodSync(metadataPath, 0o600);
    return metadataPath;
}

function installCanonicalAutomation(fixture) {
    renderCoreAutomationProvider({
        coreRoot: fixture.coreRoot,
        candidateRoot: fixture.projectRoot,
    });
    adapterHandler.prepareAutomation({
        candidateRoot: fixture.projectRoot,
        contract: ADAPTER_CONTRACT,
    });
}

test('plans an established Core-only manifest with Core automation', (t) => {
    const fixture = makeCoreOnlyGitFixture(t);
    const metadataPath = path.join(fixture.projectRoot, '.pi', 'setup-metadata.json');
    fs.writeFileSync(metadataPath, JSON.stringify({
        schemaVersion: 1,
        displayName: 'Core Project',
        summary: 'A Core-only established project.',
    }), {mode: 0o600});
    fs.chmodSync(metadataPath, 0o600);

    const planned = captureWrites(() => main([
        'automation', 'plan', `--metadata=${metadataPath}`, '--json',
    ], fixture));

    assert.equal(planned.status, 0, planned.stderr || planned.stdout);
    const report = JSON.parse(planned.stdout);
    assert.equal(report.composition, 'CORE_ONLY');
    assert.deepEqual(report.providers.map(({id}) => id), [
        'core-repository-automation',
        'core-project-manifest',
    ]);

    const applied = captureWrites(() => main([
        'automation', 'apply', `--plan=${report.planPath}`, '--approval=yes', '--json',
    ], fixture));
    assert.equal(applied.status, 0, applied.stderr || applied.stdout);
    const manifest = JSON.parse(fs.readFileSync(
        path.join(fixture.projectRoot, '.prism', 'project.json'), 'utf8'
    ));
    assert.equal(manifest.schemaVersion, 2);
    assert.equal(manifest.source.mode, 'ESTABLISHED');
    assert.equal(manifest.adapter, null);

    fs.rmSync(path.join(fixture.projectRoot, '.prism', 'project.json'));
    const verified = captureWrites(() => main(['automation', 'verify', '--json'], fixture));
    assert.equal(verified.status, 5);
    assert.deepEqual(JSON.parse(verified.stdout).checks, [{
        id: 'automation-project-metadata',
        status: 'FAIL',
        message: 'established project metadata is required',
    }]);
});

test('reports established Core-only metadata requirements', (t) => {
    const fixture = makeCoreOnlyGitFixture(t);

    const result = captureWrites(() => main([
        'setup', 'project', 'metadata', '--source=established',
        '--adapter=core-only', '--json',
    ], fixture));

    assert.equal(result.status, 0, result.stderr);
    const report = JSON.parse(result.stdout);
    assert.equal(report.source, 'ESTABLISHED');
    assert.equal(report.adapter, null);
    assert.equal(report.disposition, 'METADATA_REQUIRED');
});

test('rejects established metadata inspection when .pi is not a directory', (t) => {
    const fixture = makeCoreOnlyGitFixture(t);
    fs.rmSync(path.join(fixture.projectRoot, '.pi'), {recursive: true});
    fs.writeFileSync(path.join(fixture.projectRoot, '.pi'), 'not a directory\n');

    const result = captureWrites(() => main([
        'setup', 'project', 'metadata', '--source=established',
        '--adapter=core-only', '--json',
    ], fixture));

    assert.equal(result.status, 5);
    assert.equal(result.stdout, '');
    assert.equal(
        result.stderr,
        'prism-tool: project metadata requires valid established adapter state\n'
    );
});

test('reports a closed metadata failure when .pi is absent during planning', (t) => {
    const projectRoot = makeTempDir();
    t.after(() => fs.rmSync(projectRoot, {recursive: true, force: true}));
    const metadataPath = path.join(projectRoot, '.pi', 'setup-metadata.json');

    const result = captureWrites(() => main([
        'automation', 'plan', `--metadata=${metadataPath}`, '--json',
    ], {projectRoot, coreRoot: CORE_ROOT}));

    assert.equal(result.status, 5);
    assert.equal(result.stderr, '');
    assert.deepEqual(JSON.parse(result.stdout).checks, [{
        id: 'automation-project-metadata',
        status: 'FAIL',
        message: 'established project metadata is invalid',
    }]);
});

test('reports established active-adapter metadata requirements', (t) => {
    const fixture = makeGitFixture(t);

    const result = captureWrites(() => main([
        'setup', 'project', 'metadata', '--source=established',
        '--adapter=active', '--json',
    ], fixture));

    assert.equal(result.status, 0, result.stderr);
    const report = JSON.parse(result.stdout);
    assert.equal(report.source, 'ESTABLISHED');
    assert.equal(report.adapter.packageName, '@kyaulabs/prism-php-web');
    assert.equal(report.adapter.bootstrapProtocol, 1);
});

test('creates an established manifest for an active adapter', (t) => {
    const fixture = makeGitFixture(t);
    fs.rmSync(path.join(fixture.projectRoot, '.prism', 'project.json'));
    const planned = planAutomation({
        ...fixture,
        metadataPath: writeEstablishedMetadata(fixture),
    });

    assert.equal(planned.composition, 'ADAPTER');
    assert.equal(applyAutomation({...fixture, planPath: planned.planPath}).status, 'GO');
    const manifest = JSON.parse(fs.readFileSync(
        path.join(fixture.projectRoot, '.prism', 'project.json'), 'utf8'
    ));
    assert.equal(manifest.source.mode, 'ESTABLISHED');
    assert.equal(manifest.adapter.packageName, '@kyaulabs/prism-php-web');
    assert.equal(manifest.adapter.id, '@kyaulabs/prism-php-web');
});

test('preserves a valid schema-one Blank manifest', (t) => {
    const fixture = makeCoreOnlyGitFixture(t);
    const manifestPath = path.join(fixture.projectRoot, '.prism', 'project.json');
    fs.mkdirSync(path.dirname(manifestPath), {recursive: true});
    fs.writeFileSync(manifestPath, renderProjectManifest({
        schemaVersion: 1,
        source: {mode: 'BLANK', evidence: null},
        capabilities: [],
        metadata: {
            schemaVersion: 1,
            displayName: 'Core Project',
            summary: 'A Core-only established project.',
        },
        coreVersion: require('../../packages/prism-core/package.json').version,
        adapter: null,
    }), {mode: 0o644});
    fs.chmodSync(manifestPath, 0o644);

    const planned = planAutomation(fixture);
    const manifest = planned.providers.find(({id}) => id === 'core-project-manifest');
    assert.equal(manifest.outputs[0].disposition, 'CURRENT');
});

test('migrates a stale established Core-only manifest in the transaction', (t) => {
    const fixture = makeCoreOnlyGitFixture(t);
    const manifestPath = path.join(fixture.projectRoot, '.prism', 'project.json');
    fs.mkdirSync(path.dirname(manifestPath), {recursive: true});
    fs.writeFileSync(manifestPath, renderProjectManifest({
        schemaVersion: 2,
        source: {mode: 'ESTABLISHED', evidence: null},
        capabilities: [],
        metadata: {
            schemaVersion: 1,
            displayName: 'Core Project',
            summary: 'A Core-only established project.',
        },
        coreVersion: '0.4.0',
        adapter: null,
    }), {mode: 0o644});
    fs.chmodSync(manifestPath, 0o644);

    const planned = planAutomation(fixture);
    const manifest = planned.providers.find(({id}) => id === 'core-project-manifest');
    assert.equal(manifest.outputs[0].disposition, 'MIGRATE');
    assert.equal(applyAutomation({...fixture, planPath: planned.planPath}).status, 'GO');
    assert.equal(JSON.parse(fs.readFileSync(manifestPath, 'utf8'))
        .compatibility.coreVersion, require('../../packages/prism-core/package.json').version);
});

test('requires metadata when an established project manifest is absent', (t) => {
    const fixture = makeCoreOnlyGitFixture(t);

    const planned = captureWrites(() => main(['automation', 'plan', '--json'], fixture));

    assert.equal(planned.status, 5);
    assert.deepEqual(JSON.parse(planned.stdout).checks, [{
        id: 'automation-project-metadata',
        status: 'FAIL',
        message: 'established project metadata is required',
    }]);
});

test('rejects invalid established metadata with a bounded diagnostic', (t) => {
    const invalidCases = [
        {
            name: 'outside .pi',
            arrange(fixture) {
                const metadataPath = path.join(fixture.projectRoot, 'metadata.json');
                fs.writeFileSync(metadataPath, JSON.stringify({
                    schemaVersion: 1,
                    displayName: 'Automation Fixture',
                    summary: 'An established adapter automation fixture.',
                }), {mode: 0o600});
                fs.chmodSync(metadataPath, 0o600);
                return metadataPath;
            },
        },
        {
            name: 'symlinked .pi',
            arrange(fixture) {
                const target = writeEstablishedMetadata(fixture);
                const piRoot = path.join(fixture.projectRoot, '.pi');
                const realPi = path.join(fixture.projectRoot, '.pi-real');
                fs.renameSync(piRoot, realPi);
                fs.symlinkSync(realPi, piRoot);
                return path.join(realPi, path.basename(target));
            },
        },
        {
            name: 'public mode',
            arrange(fixture) {
                const metadataPath = writeEstablishedMetadata(fixture);
                fs.chmodSync(metadataPath, 0o644);
                return metadataPath;
            },
        },
        {
            name: 'symlink',
            arrange(fixture) {
                const target = writeEstablishedMetadata(fixture);
                const metadataPath = path.join(fixture.projectRoot, '.pi', 'metadata-link.json');
                fs.symlinkSync(target, metadataPath);
                return metadataPath;
            },
        },
        {
            name: 'oversized',
            arrange(fixture) {
                const metadataPath = writeEstablishedMetadata(fixture);
                fs.writeFileSync(metadataPath, Buffer.alloc(16385, 0x20));
                fs.chmodSync(metadataPath, 0o600);
                return metadataPath;
            },
        },
        {
            name: 'invalid UTF-8',
            arrange(fixture) {
                const metadataPath = writeEstablishedMetadata(fixture);
                fs.writeFileSync(metadataPath, Buffer.from([0xff]));
                fs.chmodSync(metadataPath, 0o600);
                return metadataPath;
            },
        },
    ];
    for (const invalid of invalidCases) {
        const fixture = makeCoreOnlyGitFixture(t);
        const result = captureWrites(() => main([
            'automation', 'plan', `--metadata=${invalid.arrange(fixture)}`, '--json',
        ], fixture));
        assert.equal(result.status, 5, invalid.name);
        assert.deepEqual(JSON.parse(result.stdout).checks, [{
            id: 'automation-project-metadata',
            status: 'FAIL',
            message: 'established project metadata is invalid',
        }], invalid.name);
    }
});

test('rejects metadata changed through the held descriptor', (t) => {
    const fixture = makeCoreOnlyGitFixture(t);
    const metadataPath = writeEstablishedMetadata(fixture);
    const originalFstat = fs.fstatSync;
    let calls = 0;
    fs.fstatSync = (descriptor) => {
        const stat = originalFstat(descriptor);
        if (calls === 0) fs.appendFileSync(metadataPath, ' ');
        calls += 1;
        return stat;
    };
    try {
        assert.throws(() => planAutomation({...fixture, metadataPath}), (error) =>
            error.stage === 'automation-project-metadata-invalid'
        );
    } finally {
        fs.fstatSync = originalFstat;
    }
});

test('rejects incoherent existing manifest evidence with a bounded diagnostic', (t) => {
    const fixture = makeCoreOnlyGitFixture(t);
    const manifestPath = path.join(fixture.projectRoot, '.prism', 'project.json');
    fs.mkdirSync(path.dirname(manifestPath), {recursive: true});
    const manifest = JSON.parse(renderProjectManifest({
        schemaVersion: 2,
        source: {mode: 'ESTABLISHED', evidence: null},
        capabilities: [],
        metadata: {
            schemaVersion: 1,
            displayName: 'Core Project',
            summary: 'A Core-only established project.',
        },
        coreVersion: require('../../packages/prism-core/package.json').version,
        adapter: null,
    }));
    manifest.adapter = {
        id: '@example/adapter',
        packageName: '@example/adapter',
        packageVersion: '1.0.0',
        bootstrapProtocol: 1,
    };
    fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, {mode: 0o644});
    fs.chmodSync(manifestPath, 0o644);

    const result = captureWrites(() => main(['automation', 'plan', '--json'], fixture));
    assert.equal(result.status, 5);
    assert.deepEqual(JSON.parse(result.stdout).checks, [{
        id: 'automation-project-metadata',
        status: 'FAIL',
        message: 'established project metadata is invalid',
    }]);
});

test('adds repository release management only when enabled', (t) => {
    const fixture = makeGitFixture(t);
    const disabled = planAutomation(fixture);
    assert.equal(disabled.providers.some(({id}) => id === 'core-repository-release'), false);
    fs.rmSync(path.join(fixture.projectRoot, '.pi', 'prism-tool', 'automation'), {
        recursive: true,
        force: true,
    });

    const enabled = planAutomation({
        ...fixture,
        releaseRepository: 'example/project',
        metadataPath: writeEstablishedMetadata(fixture, 'example/project'),
    });
    const release = enabled.providers.find(({id}) => id === 'core-repository-release');
    assert.deepEqual(release.outputs.map(({path: outputPath}) => outputPath), [
        'CHANGELOG.md',
        'cliff.toml',
        '.github/workflows/release.yml',
    ]);
    assert.equal(applyAutomation({...fixture, planPath: enabled.planPath}).status, 'GO');
    assert.equal(verifyAutomation({
        ...fixture,
        releaseRepository: 'example/project',
    }).status, 'GO');
    assert.match(fs.readFileSync(path.join(fixture.projectRoot, 'cliff.toml'), 'utf8'),
        /github\.com\/example\/project\/releases/);
    assert.equal(fs.existsSync(path.join(fixture.projectRoot, '.prism', 'release.json')), false);
});

test('exposes repository release selection through automation CLI controls', (t) => {
    const fixture = makeGitFixture(t);
    const planned = captureWrites(() => main([
        'automation',
        'plan',
        '--release-repository=example/project',
        `--metadata=${writeEstablishedMetadata(fixture, 'example/project')}`,
        '--json',
    ], fixture));

    assert.equal(planned.status, 0, planned.stderr);
    const report = JSON.parse(planned.stdout);
    assert.equal(report.providers.some(({id}) => id === 'core-repository-release'), true);
    const applied = captureWrites(() => main([
        'automation',
        'apply',
        `--plan=${report.planPath}`,
        '--approval=yes',
        '--json',
    ], fixture));
    assert.equal(applied.status, 0, applied.stderr);
    const verified = captureWrites(() => main([
        'automation',
        'verify',
        '--release-repository=example/project',
        '--json',
    ], fixture));
    assert.equal(verified.status, 0, verified.stderr);
});

test('classifies an older owned release workflow as migratable', (t) => {
    const fixture = makeFixture(t);
    const workflowPath = path.join(fixture.projectRoot, '.github', 'workflows', 'release.yml');
    fs.mkdirSync(path.dirname(workflowPath), {recursive: true});
    fs.writeFileSync(
        workflowPath,
        fs.readFileSync(path.join(CORE_ROOT, 'config', 'release.yml'), 'utf8')
            .replace('# prism-release-schema: 4', '# prism-release-schema: 3')
    );

    const inspected = inspectAutomation({
        ...fixture,
        releaseRepository: 'example/project',
    });
    const release = inspected.providers.find(({id}) => id === 'core-repository-release');
    assert.equal(release.outputs.find(({path: outputPath}) =>
        outputPath === '.github/workflows/release.yml'
    ).disposition, 'MIGRATE');
});

test('rejects an unowned repository release output', (t) => {
    const fixture = makeGitFixture(t);
    fs.writeFileSync(path.join(fixture.projectRoot, 'CHANGELOG.md'), '# Human changelog\n');

    assert.throws(() => planAutomation({
        ...fixture,
        releaseRepository: 'example/project',
        metadataPath: writeEstablishedMetadata(fixture, 'example/project'),
    }), /ownership conflicts/);
    assert.equal(fs.readFileSync(path.join(fixture.projectRoot, 'CHANGELOG.md'), 'utf8'),
        '# Human changelog\n');
});

test('exposes the approved automation transaction through the CLI', (t) => {
    const fixture = makeGitFixture(t);
    const planned = captureWrites(() => main(['automation', 'plan', '--json'], fixture));
    assert.equal(planned.status, 0, planned.stderr);
    const plan = JSON.parse(planned.stdout);

    const rejected = captureWrites(() => main([
        'automation',
        'apply',
        `--plan=${plan.planPath}`,
        '--json',
    ], fixture));
    assert.equal(rejected.status, 2);
    assert.equal(fs.existsSync(path.join(
        fixture.projectRoot,
        '.github',
        'workflows',
        'back-merge.yml'
    )), false);

    const applied = captureWrites(() => main([
        'automation',
        'apply',
        `--plan=${plan.planPath}`,
        '--approval=yes',
        '--json',
    ], fixture));
    assert.equal(applied.status, 0, applied.stderr);
    assert.equal(JSON.parse(applied.stdout).command, 'automation apply');
    const verified = captureWrites(() => main(['automation', 'verify', '--json'], fixture));
    assert.equal(verified.status, 0, verified.stderr);
    assert.equal(JSON.parse(verified.stdout).disposition, 'CURRENT');
});

test('rejects stale ownership without changing project automation', (t) => {
    const fixture = makeGitFixture(t);
    const planned = planAutomation(fixture);
    const workflowPath = path.join(
        fixture.projectRoot,
        '.github',
        'workflows',
        'back-merge.yml'
    );
    fs.mkdirSync(path.dirname(workflowPath), {recursive: true});
    fs.writeFileSync(workflowPath, 'name: Human workflow\n');

    assert.throws(() => applyAutomation({...fixture, planPath: planned.planPath}));
    assert.equal(fs.readFileSync(workflowPath, 'utf8'), 'name: Human workflow\n');
    assert.equal(fs.existsSync(path.join(
        fixture.projectRoot,
        '.github',
        'scripts',
        'check-php.sh'
    )), false);
});

test('rejects a stale Git worktree precondition', (t) => {
    const fixture = makeGitFixture(t);
    const planned = planAutomation(fixture);
    fs.appendFileSync(path.join(fixture.projectRoot, '.gitignore'), '# changed\n');

    assert.throws(
        () => applyAutomation({...fixture, planPath: planned.planPath}),
        /Git precondition changed/
    );
    assert.equal(fs.existsSync(path.join(fixture.projectRoot, '.github')), false);
});

test('keeps the automation lock held through retained-state cleanup', (t) => {
    const fixture = makeGitFixture(t);
    const planned = planAutomation(fixture);
    const operationRoot = path.dirname(planned.planPath);
    const lockPath = path.join(fixture.projectRoot, '.pi', 'prism-tool', 'automation.lock');
    const originalRemove = fs.rmSync;
    let lockHeldDuringCleanup = false;
    fs.rmSync = function observeCleanup(target, options) {
        if (target === operationRoot && options?.recursive === true) {
            lockHeldDuringCleanup = fs.existsSync(lockPath);
        }
        return originalRemove.call(this, target, options);
    };

    try {
        assert.equal(applyAutomation({...fixture, planPath: planned.planPath}).status, 'GO');
    } finally {
        fs.rmSync = originalRemove;
    }
    assert.equal(lockHeldDuringCleanup, true);
    assert.equal(fs.existsSync(lockPath), false);
});

test('preserves a competing automation lock', (t) => {
    const fixture = makeGitFixture(t);
    const planned = planAutomation(fixture);
    const lockPath = path.join(fixture.projectRoot, '.pi', 'prism-tool', 'automation.lock');
    fs.writeFileSync(lockPath, 'competing lock\n', {mode: 0o600});

    assert.throws(() => applyAutomation({...fixture, planPath: planned.planPath}));
    assert.equal(fs.readFileSync(lockPath, 'utf8'), 'competing lock\n');
    assert.equal(fs.existsSync(path.join(fixture.projectRoot, '.github')), false);
});

test('rolls back published outputs after a rename failure', (t) => {
    const fixture = makeGitFixture(t);
    const planned = planAutomation(fixture);
    let renames = 0;

    assert.throws(() => applyAutomation({
        ...fixture,
        planPath: planned.planPath,
        rename(source, destination) {
            renames += 1;
            if (renames === 2) throw new Error('injected rename failure');
            fs.renameSync(source, destination);
        },
    }), /injected rename failure/);
    assert.equal(renames, 2);
    assert.equal(fs.existsSync(path.join(fixture.projectRoot, '.github')), false);
    assert.equal(fs.existsSync(path.join(
        fixture.projectRoot,
        '.pi',
        'prism-tool',
        'automation.lock'
    )), false);
});

test('continues automation rollback and releases the lock after a rollback read failure', (t) => {
    const fixture = makeGitFixture(t);
    const planned = planAutomation(fixture);
    const lockPath = path.join(fixture.projectRoot, '.pi', 'prism-tool', 'automation.lock');
    const originalStat = fs.lstatSync;
    const destinations = [];
    let rollback = false;
    let failedRollbackRead = false;
    fs.lstatSync = function failOneRollbackRead(filePath, ...args) {
        if (rollback && !failedRollbackRead && filePath === destinations[1]) {
            failedRollbackRead = true;
            throw new Error('injected rollback read failure');
        }
        return originalStat.call(this, filePath, ...args);
    };

    try {
        assert.throws(() => applyAutomation({
            ...fixture,
            planPath: planned.planPath,
            rename(source, destination) {
                if (destinations.length === 2) {
                    rollback = true;
                    throw new Error('stop publication');
                }
                fs.renameSync(source, destination);
                destinations.push(destination);
            },
        }), /automation rollback incomplete/);
    } finally {
        fs.lstatSync = originalStat;
    }
    assert.equal(failedRollbackRead, true);
    assert.equal(fs.existsSync(destinations[0]), false);
    assert.equal(fs.existsSync(lockPath), false);
});

test('does not follow a substituted automation destination parent', (t) => {
    const fixture = makeGitFixture(t);
    const outside = makeTempDir();
    t.after(() => fs.rmSync(outside, {recursive: true, force: true}));
    const planned = planAutomation(fixture);
    fs.symlinkSync(outside, path.join(fixture.projectRoot, '.github'), 'dir');

    assert.throws(() => applyAutomation({...fixture, planPath: planned.planPath}));
    assert.deepEqual(fs.readdirSync(outside), []);
    assert.equal(fs.lstatSync(path.join(fixture.projectRoot, '.github')).isSymbolicLink(), true);
});

test('does not read through a substituted automation candidate', (t) => {
    const fixture = makeGitFixture(t);
    const outside = path.join(makeTempDir(), 'outside.txt');
    t.after(() => fs.rmSync(path.dirname(outside), {recursive: true, force: true}));
    fs.writeFileSync(outside, 'outside\n');
    const planned = planAutomation(fixture);
    const candidatePath = path.join(
        fixture.projectRoot,
        '.pi',
        'prism-tool',
        'automation',
        'candidate',
        '.github',
        'scripts',
        'check-php.sh'
    );
    fs.unlinkSync(candidatePath);
    fs.symlinkSync(outside, candidatePath);
    const originalRead = fs.readFileSync;
    let followed = false;
    fs.readFileSync = function observeCandidate(filePath, ...args) {
        if (filePath === candidatePath) followed = true;
        return originalRead.call(this, filePath, ...args);
    };

    try {
        assert.throws(() => applyAutomation({...fixture, planPath: planned.planPath}));
    } finally {
        fs.readFileSync = originalRead;
    }
    assert.equal(followed, false);
    assert.equal(fs.existsSync(path.join(fixture.projectRoot, '.github')), false);
});

test('rejects oversized retained candidates before reading them', (t) => {
    const fixture = makeGitFixture(t);
    const planned = planAutomation(fixture);
    const envelope = JSON.parse(fs.readFileSync(planned.planPath, 'utf8'));
    const candidatePath = path.join(
        path.dirname(planned.planPath),
        ...envelope.plan.outputs[0].candidatePath.split('/')
    );
    const originalOpen = fs.openSync;
    const originalStat = fs.fstatSync;
    const originalRead = fs.readFileSync;
    const originalClose = fs.closeSync;
    let candidateDescriptor;
    let candidateRead = false;
    fs.openSync = function observeOpen(filePath, ...args) {
        const descriptor = originalOpen.call(this, filePath, ...args);
        if (filePath === candidatePath) candidateDescriptor = descriptor;
        return descriptor;
    };
    fs.fstatSync = function reportOversized(descriptor, ...args) {
        const stat = originalStat.call(this, descriptor, ...args);
        if (descriptor !== candidateDescriptor) return stat;
        return new Proxy(stat, {
            get(target, property) {
                if (property === 'size') return 1048577;
                return Reflect.get(target, property, target);
            },
        });
    };
    fs.readFileSync = function observeRead(file, ...args) {
        if (file === candidateDescriptor) candidateRead = true;
        return originalRead.call(this, file, ...args);
    };
    fs.closeSync = function observeClose(descriptor) {
        const result = originalClose.call(this, descriptor);
        if (descriptor === candidateDescriptor) candidateDescriptor = undefined;
        return result;
    };

    try {
        assert.throws(
            () => applyAutomation({...fixture, planPath: planned.planPath}),
            /candidate changed/
        );
    } finally {
        fs.openSync = originalOpen;
        fs.fstatSync = originalStat;
        fs.readFileSync = originalRead;
        fs.closeSync = originalClose;
    }
    assert.equal(candidateRead, false);
});

test('uses a bounded descriptor read when a retained candidate grows', (t) => {
    const fixture = makeGitFixture(t);
    const planned = planAutomation(fixture);
    const envelope = JSON.parse(fs.readFileSync(planned.planPath, 'utf8'));
    const candidatePath = path.join(
        path.dirname(planned.planPath),
        ...envelope.plan.outputs[0].candidatePath.split('/')
    );
    const originalOpen = fs.openSync;
    const originalRead = fs.readFileSync;
    const originalReadSync = fs.readSync;
    const originalClose = fs.closeSync;
    let candidateDescriptor;
    let unboundedRead = false;
    fs.openSync = function observeOpen(filePath, ...args) {
        const descriptor = originalOpen.call(this, filePath, ...args);
        if (filePath === candidatePath) candidateDescriptor = descriptor;
        return descriptor;
    };
    fs.readFileSync = function rejectUnboundedRead(file, ...args) {
        if (file === candidateDescriptor) {
            unboundedRead = true;
            return Buffer.alloc(1048577);
        }
        return originalRead.call(this, file, ...args);
    };
    fs.readSync = function growDuringRead(descriptor, buffer, offset, length, position) {
        if (descriptor === candidateDescriptor) {
            buffer.fill(0x61, offset, offset + length);
            return length;
        }
        return originalReadSync.call(this, descriptor, buffer, offset, length, position);
    };
    fs.closeSync = function observeClose(descriptor) {
        const result = originalClose.call(this, descriptor);
        if (descriptor === candidateDescriptor) candidateDescriptor = undefined;
        return result;
    };

    try {
        assert.throws(
            () => applyAutomation({...fixture, planPath: planned.planPath}),
            /candidate changed/
        );
    } finally {
        fs.openSync = originalOpen;
        fs.readFileSync = originalRead;
        fs.readSync = originalReadSync;
        fs.closeSync = originalClose;
    }
    assert.equal(unboundedRead, false);
});

test('rejects provider identity drift after planning', (t) => {
    const adapterRoot = makeTempDir();
    fs.cpSync(ADAPTER_ROOT, adapterRoot, {recursive: true});
    t.after(() => fs.rmSync(adapterRoot, {recursive: true, force: true}));
    const fixture = makeGitFixture(t, adapterRoot);
    const planned = planAutomation(fixture);
    const manifestPath = path.join(adapterRoot, 'package.json');
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    manifest.version = '9.9.9';
    fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);

    assert.throws(() => applyAutomation({...fixture, planPath: planned.planPath}));
    assert.equal(fs.existsSync(path.join(fixture.projectRoot, '.github')), false);
});

test('refuses to replace a plan while the automation lock is held', (t) => {
    const fixture = makeGitFixture(t);
    const planned = planAutomation(fixture);
    const lockPath = path.join(fixture.projectRoot, '.pi', 'prism-tool', 'automation.lock');
    fs.writeFileSync(lockPath, 'held\n', {mode: 0o600});

    assert.throws(() => planAutomation(fixture), /locked/);
    assert.equal(fs.existsSync(planned.planPath), true);
    assert.equal(fs.readFileSync(lockPath, 'utf8'), 'held\n');
});

test('preserves unowned automation operation state', (t) => {
    const fixture = makeGitFixture(t);
    const operationRoot = path.join(
        fixture.projectRoot,
        '.pi',
        'prism-tool',
        'automation'
    );
    fs.mkdirSync(operationRoot, {recursive: true});
    const humanPath = path.join(operationRoot, 'human.txt');
    fs.writeFileSync(humanPath, 'human state\n');

    assert.throws(() => planAutomation(fixture));
    assert.equal(fs.readFileSync(humanPath, 'utf8'), 'human state\n');
});

test('preserves a replacement automation lock during cleanup', (t) => {
    const fixture = makeGitFixture(t);
    const planned = planAutomation(fixture);
    const lockPath = path.join(fixture.projectRoot, '.pi', 'prism-tool', 'automation.lock');

    assert.throws(() => applyAutomation({
        ...fixture,
        planPath: planned.planPath,
        rename() {
            fs.unlinkSync(lockPath);
            fs.writeFileSync(lockPath, 'replacement\n', {mode: 0o600});
            throw new Error('replace lock');
        },
    }));
    assert.equal(fs.readFileSync(lockPath, 'utf8'), 'replacement\n');
});

test('preserves concurrently changed output during rollback', (t) => {
    const fixture = makeGitFixture(t);
    const planned = planAutomation(fixture);
    let renames = 0;
    let changedPath;

    assert.throws(() => applyAutomation({
        ...fixture,
        planPath: planned.planPath,
        rename(source, destination) {
            renames += 1;
            if (renames === 1) {
                fs.renameSync(source, destination);
                fs.appendFileSync(destination, 'concurrent change\n');
                changedPath = destination;
                return;
            }
            throw new Error('stop publication');
        },
    }));
    assert.match(fs.readFileSync(changedPath, 'utf8'), /concurrent change/);
});

test('rejects unowned retained automation state before publication', (t) => {
    const fixture = makeGitFixture(t);
    const planned = planAutomation(fixture);
    const markerPath = path.join(
        fixture.projectRoot,
        '.pi',
        'prism-tool',
        'automation',
        '.prism-automation-operation'
    );
    fs.writeFileSync(markerPath, 'unowned\n', {mode: 0o600});
    let publications = 0;

    assert.throws(() => applyAutomation({
        ...fixture,
        planPath: planned.planPath,
        rename(source, destination) {
            publications += 1;
            fs.renameSync(source, destination);
        },
    }), /operation state/);
    assert.equal(publications, 0);
    assert.equal(fs.existsSync(path.join(fixture.projectRoot, '.github')), false);
});

test('rejects a changed immutable automation plan', (t) => {
    const fixture = makeGitFixture(t);
    const planned = planAutomation(fixture);
    const envelope = JSON.parse(fs.readFileSync(planned.planPath, 'utf8'));
    envelope.plan.outputs[0].sha256 = '0'.repeat(64);
    fs.writeFileSync(planned.planPath, `${JSON.stringify(envelope, null, 2)}\n`);

    assert.throws(() => applyAutomation({...fixture, planPath: planned.planPath}));
    assert.equal(fs.existsSync(path.join(fixture.projectRoot, '.github')), false);
});

test('rejects an oversized retained plan before parsing', (t) => {
    const fixture = makeGitFixture(t);
    const planned = planAutomation(fixture);
    fs.writeFileSync(planned.planPath, Buffer.alloc(1048577, 0x20));
    fs.chmodSync(planned.planPath, 0o600);

    assert.throws(() => applyAutomation({...fixture, planPath: planned.planPath}),
        /automation plan is invalid/);
    assert.equal(fs.existsSync(path.join(fixture.projectRoot, '.github')), false);
});

test('rejects an open retained established configuration', (t) => {
    const fixture = makeGitFixture(t);
    const planned = planAutomation(fixture);
    const envelope = JSON.parse(fs.readFileSync(planned.planPath, 'utf8'));
    envelope.plan.configuration.established.extra = true;
    envelope.planDigest = crypto.createHash('sha256')
        .update(JSON.stringify(envelope.plan))
        .digest('hex');
    const changedPlanPath = path.join(
        path.dirname(planned.planPath),
        `plan-${envelope.planDigest}.json`
    );
    fs.unlinkSync(planned.planPath);
    fs.writeFileSync(changedPlanPath, `${JSON.stringify(envelope, null, 2)}\n`, {mode: 0o600});

    assert.throws(() => applyAutomation({...fixture, planPath: changedPlanPath}),
        /automation plan is invalid/);
    assert.equal(fs.existsSync(path.join(fixture.projectRoot, '.github')), false);
});

test('rejects an automation plan output that escapes the project', (t) => {
    const fixture = makeGitFixture(t);
    const planned = planAutomation(fixture);
    const escapedPath = path.join(path.dirname(fixture.projectRoot), 'escaped-automation.txt');
    t.after(() => fs.rmSync(escapedPath, {force: true}));
    const envelope = JSON.parse(fs.readFileSync(planned.planPath, 'utf8'));
    envelope.plan.outputs[0].path = '../escaped-automation.txt';
    envelope.planDigest = crypto.createHash('sha256')
        .update(JSON.stringify(envelope.plan))
        .digest('hex');
    const changedPlanPath = path.join(
        path.dirname(planned.planPath),
        `plan-${envelope.planDigest}.json`
    );
    fs.writeFileSync(changedPlanPath, `${JSON.stringify(envelope, null, 2)}\n`, {mode: 0o600});

    assert.throws(() => applyAutomation({...fixture, planPath: changedPlanPath}));
    assert.equal(fs.existsSync(escapedPath), false);
});

test('plans, applies, and verifies established automation atomically', (t) => {
    const fixture = makeGitFixture(t);

    const planned = planAutomation(fixture);

    assert.equal(planned.status, 'GO');
    assert.match(
        planned.planPath,
        /[.]pi\/prism-tool\/automation\/plan-[a-f0-9]{64}[.]json$/
    );
    assert.equal(
        planned.planDigest,
        path.basename(planned.planPath).slice('plan-'.length, -'.json'.length)
    );
    assert.equal(fs.statSync(planned.planPath).mode & 0o777, 0o600);
    const applied = applyAutomation({...fixture, planPath: planned.planPath});
    assert.equal(applied.status, 'GO');
    assert.equal(fs.existsSync(path.join(
        fixture.projectRoot,
        '.github',
        'workflows',
        'back-merge.yml'
    )), true);
    assert.equal(verifyAutomation(fixture).status, 'GO');
    assert.equal(fs.existsSync(path.join(
        fixture.projectRoot,
        '.pi',
        'prism-tool',
        'automation'
    )), false);
    assert.equal(fs.existsSync(path.join(
        fixture.projectRoot,
        '.pi',
        'prism-tool',
        'automation.lock'
    )), false);
});

test('inspects absent Core and adapter automation as createable', (t) => {
    const fixture = makeFixture(t);

    const result = captureWrites(() => main(['automation', 'inspect', '--json'], fixture));

    assert.equal(result.status, 0, result.stderr);
    const report = JSON.parse(result.stdout);
    assert.deepEqual(Object.keys(report), [
        'schemaVersion', 'command', 'status', 'disposition', 'composition',
        'providers', 'checks',
    ]);
    assert.equal(report.schemaVersion, 2);
    assert.equal(report.command, 'automation inspect');
    assert.equal(report.composition, 'ADAPTER');
    assert.equal(report.status, 'GO');
    assert.equal(report.disposition, 'CREATE');
    assert.deepEqual(report.providers.map(({id}) => id), [
        'core-repository-automation',
        'php-web-quality',
    ]);
    assert.deepEqual(report.providers[0].outputs[0], {
        path: '.github/workflows/back-merge.yml',
        disposition: 'CREATE',
        owner: '@kyaulabs/prism-core',
    });
});

test('inspects owned legacy automation as migratable', (t) => {
    const fixture = makeFixture(t);
    const workflowPath = path.join(
        fixture.projectRoot,
        '.github',
        'workflows',
        'back-merge.yml'
    );
    fs.mkdirSync(path.dirname(workflowPath), {recursive: true});
    fs.writeFileSync(workflowPath, [
        '# prism-managed: @kyaulabs/prism-core',
        '# prism-automation-schema: 0',
        'name: Legacy back-merge',
        '',
    ].join('\n'));

    const result = captureWrites(() => main(['automation', 'inspect', '--json'], fixture));

    assert.equal(result.status, 0, result.stderr);
    const report = JSON.parse(result.stdout);
    assert.equal(report.disposition, 'MIGRATE');
    assert.equal(report.providers[0].outputs[0].disposition, 'MIGRATE');
});

test('inspects drifted owned automation as migratable', (t) => {
    const fixture = makeFixture(t);
    installCanonicalAutomation(fixture);
    fs.appendFileSync(
        path.join(fixture.projectRoot, '.github', 'workflows', 'back-merge.yml'),
        '# changed\n'
    );

    const result = captureWrites(() => main(['automation', 'inspect', '--json'], fixture));

    assert.equal(result.status, 0, result.stderr);
    const report = JSON.parse(result.stdout);
    assert.equal(report.disposition, 'MIGRATE');
    assert.equal(report.providers[0].outputs[0].disposition, 'MIGRATE');
});

test('rejects an unowned automation collision', (t) => {
    const fixture = makeFixture(t);
    const workflowPath = path.join(
        fixture.projectRoot,
        '.github',
        'workflows',
        'back-merge.yml'
    );
    fs.mkdirSync(path.dirname(workflowPath), {recursive: true});
    fs.writeFileSync(workflowPath, 'name: Human workflow\n');

    const result = captureWrites(() => main(['automation', 'inspect', '--json'], fixture));

    assert.equal(result.status, 5);
    const report = JSON.parse(result.stdout);
    assert.equal(report.status, 'NO-GO');
    assert.equal(report.disposition, 'CONFLICT');
    assert.deepEqual(report.providers[0].outputs[0], {
        path: '.github/workflows/back-merge.yml',
        disposition: 'CONFLICT',
        owner: null,
    });
});

test('inspects established Core-only automation without adapter execution', (t) => {
    const projectRoot = makeTempDir();
    t.after(() => fs.rmSync(projectRoot, {recursive: true, force: true}));
    fs.mkdirSync(path.join(projectRoot, '.pi'));

    const result = captureWrites(() => main(['automation', 'inspect', '--json'], {
        projectRoot,
        coreRoot: CORE_ROOT,
    }));

    assert.equal(result.status, 0, result.stderr);
    const report = JSON.parse(result.stdout);
    assert.equal(report.schemaVersion, 2);
    assert.equal(report.status, 'GO');
    assert.equal(report.composition, 'CORE_ONLY');
    assert.deepEqual(report.providers.map(({id}) => id), ['core-repository-automation']);
    assert.equal(report.providers[0].outputs[0].path, '.github/workflows/back-merge.yml');
});

test('reports invalid adapter evidence with a bounded diagnostic', (t) => {
    const projectRoot = makeTempDir();
    t.after(() => fs.rmSync(projectRoot, {recursive: true, force: true}));
    fs.mkdirSync(path.join(projectRoot, '.pi'));
    fs.writeFileSync(path.join(projectRoot, '.pi', 'settings.json'), '{');

    const result = captureWrites(() => main(['automation', 'inspect', '--json'], {
        projectRoot,
        coreRoot: CORE_ROOT,
    }));

    assert.equal(result.status, 5);
    const report = JSON.parse(result.stdout);
    assert.equal(report.schemaVersion, 2);
    assert.equal(report.composition, null);
    assert.deepEqual(report.checks, [{
        id: 'automation-adapter-discovery',
        status: 'FAIL',
        message: 'automation adapter evidence is invalid',
    }]);
});

test('inspects canonical automation as current', (t) => {
    const fixture = makeFixture(t);
    installCanonicalAutomation(fixture);

    const result = captureWrites(() => main(['automation', 'inspect', '--json'], fixture));

    assert.equal(result.status, 0, result.stderr);
    const report = JSON.parse(result.stdout);
    assert.equal(report.disposition, 'CURRENT');
    assert.equal(report.providers.every(({outputs}) =>
        outputs.every(({disposition}) => disposition === 'CURRENT')
    ), true);
});

// vim: ft=javascript sts=4 sw=4 ts=4 et :
