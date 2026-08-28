// $KYAULabs: prism-tool-bootstrap-adapter.test.js kyau@aura.kyaulabs 2026/08/27 -0700 Exp $

'use strict';

const assert = require('node:assert/strict');
const {spawnSync} = require('node:child_process');
const {createHash, generateKeyPairSync, sign} = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const {makeTempDir, writeJson} = require('./helpers');
const {main: cliMain} = require('../../packages/prism-core/scripts/prism-tool/cli');
const {
    inspectProvisionedBootstrapAdapter,
} = require('../../packages/prism-core/scripts/prism-tool/bootstrap-adapter');

const ADAPTER_INTEGRITY = 'sha512-QkJCQkJCQkJCQkJCQkJCQkJCQkJCQkJCQkJCQkJCQkJCQkJCQkJCQkJCQkJCQkJCQkJCQkJCQkJCQkJCQkJCQg==';

function captureWrites(action) {
    let stdout = '';
    let stderr = '';
    const stdoutWrite = process.stdout.write;
    const stderrWrite = process.stderr.write;
    process.stdout.write = (chunk) => {
        stdout += chunk;
        return true;
    };
    process.stderr.write = (chunk) => {
        stderr += chunk;
        return true;
    };
    try {
        return {status: action(), stdout, stderr};
    } finally {
        process.stdout.write = stdoutWrite;
        process.stderr.write = stderrWrite;
    }
}

function writeCorePackage(coreRoot, version = '0.3.1') {
    writeJson(path.join(coreRoot, 'package.json'), {
        name: '@kyaulabs/prism-core',
        version,
    });
    fs.copyFileSync(
        path.resolve(__dirname, '../../packages/prism-core/toolchain.json'),
        path.join(coreRoot, 'toolchain.json')
    );
}

function signedEnvelope(payload) {
    const pair = generateKeyPairSync('ed25519');
    const payloadBytes = Buffer.from(JSON.stringify(payload), 'utf8');
    const publicKeyBytes = pair.publicKey.export({type: 'spki', format: 'der'});
    const keyId = 'test-key';
    return {
        bytes: Buffer.from(JSON.stringify({
            schemaVersion: 1,
            keyId,
            algorithm: 'Ed25519',
            payload: payloadBytes.toString('base64'),
            signature: sign(null, payloadBytes, pair.privateKey).toString('base64'),
        }), 'utf8'),
        trust: {
            schemaVersion: 1,
            keys: [{
                id: keyId,
                algorithm: 'Ed25519',
                publicKeySpki: publicKeyBytes.toString('base64'),
                sha256: createHash('sha256').update(publicKeyBytes).digest('hex'),
            }],
        },
    };
}

const projectCoreRoots = new Map();

function signedSelectionContext(context) {
    const coreRoot = context.coreRoot;
    const manifest = JSON.parse(fs.readFileSync(path.join(coreRoot, 'package.json'), 'utf8'));
    const catalogue = {
        schemaVersion: 1,
        catalogueId: 'kyaulabs/prism-adapters',
        sequence: 7,
        issuedAt: '2026-08-27T00:00:00Z',
        expiresAt: '2026-09-03T00:00:00Z',
        adapters: [{
            id: 'php-web',
            displayName: 'PHP/web',
            packageName: '@kyaulabs/prism-php-web',
            releases: [{
                version: manifest.version,
                coreRange: manifest.version,
                bootstrapProtocol: 1,
                integrity: ADAPTER_INTEGRITY,
                publishedAt: '2026-08-26T00:00:00Z',
                status: 'ACTIVE',
            }],
        }],
    };
    const envelope = signedEnvelope(catalogue);
    const digest = createHash('sha256').update(envelope.bytes).digest('hex');
    const catalogueCachePath = path.join(coreRoot, '.adapter-catalogue-cache.json');
    writeJson(path.join(coreRoot, 'config', 'adapter-catalogue-trust.json'), envelope.trust);
    writeJson(catalogueCachePath, {
        schemaVersion: 1,
        entries: [{
            digest,
            sequence: catalogue.sequence,
            envelope: envelope.bytes.toString('base64'),
            cachedAt: '2026-08-27T12:00:00.000Z',
        }],
    });
    fs.chmodSync(catalogueCachePath, 0o600);
    return {
        digest,
        context: {
            ...context,
            catalogueCachePath,
            catalogueTrust: envelope.trust,
            now: new Date('2026-08-27T12:00:00Z'),
        },
    };
}

function main(args, context = {}) {
    let effectiveArgs = args;
    let effectiveContext = context;
    if (args[0] === 'setup' && args[1] === 'adapter' && args[2] === 'select') {
        const adapter = args.find((argument) => argument.startsWith('--adapter='));
        if (adapter !== '--adapter=core-only' && !args.some((argument) =>
            argument.startsWith('--catalogue-digest=')) && context.rawSelectionControls !== true) {
            const signed = signedSelectionContext(context);
            const sourceIndex = args.findIndex((argument) => argument.startsWith('--source='));
            effectiveArgs = [
                ...args.slice(0, sourceIndex),
                `--catalogue-digest=${signed.digest}`,
                ...args.slice(sourceIndex),
            ];
            effectiveContext = signed.context;
        }
        if (effectiveContext.projectRoot && effectiveContext.coreRoot) {
            projectCoreRoots.set(path.resolve(effectiveContext.projectRoot), effectiveContext.coreRoot);
        }
    }
    if (args[0] === 'setup' && args[1] === 'adapter' && args[2] === 'cleanup' &&
        effectiveContext.coreRoot === undefined && effectiveContext.projectRoot !== undefined) {
        effectiveContext = {
            ...effectiveContext,
            coreRoot: projectCoreRoots.get(path.resolve(effectiveContext.projectRoot)),
        };
    }
    return cliMain(effectiveArgs, effectiveContext);
}

function writeBootstrapAdapterPackage(packageRoot, options = {}) {
    const packageName = options.packageName ?? '@kyaulabs/prism-php-web';
    const packageVersion = options.packageVersion ?? '0.3.1';
    const bootstrapProtocol = options.bootstrapProtocol ?? 1;
    const manifest = {
        name: packageName,
        version: packageVersion,
        prism: {
            adapter: true,
            bootstrapProtocol,
            handler: './scripts/prism-tool-adapter.js',
            toolchain: './toolchain.json',
        },
    };
    if (options.lifecycleMarker) {
        manifest.scripts = {
            postinstall: `node -e "require('node:fs').writeFileSync('${options.lifecycleMarker}', 'ran')"`,
        };
    }
    writeJson(path.join(packageRoot, 'package.json'), manifest);
    writeJson(path.join(packageRoot, 'toolchain.json'), {
        schemaVersion: 1,
        package: packageName,
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
    });
    fs.mkdirSync(path.join(packageRoot, 'scripts'), {recursive: true});
    const loadMarker = options.loadMarker
        ? `require('node:fs').writeFileSync(${JSON.stringify(options.loadMarker)}, 'loaded\\n');\n`
        : '';
    fs.writeFileSync(
        path.join(packageRoot, 'scripts/prism-tool-adapter.js'),
        `'use strict';\n${loadMarker}module.exports = {bootstrapProtocol: ${bootstrapProtocol}, prepareBootstrapProject() {}, installBootstrapDependencies() {}, runBootstrapQuality() {}, verifyBootstrapProject() {}, inspect() {}, resolveTool() {}};\n`
    );
}

function provisionContext(t, options = {}) {
    const projectRoot = makeTempDir();
    const coreRoot = makeTempDir();
    const cacheRoot = makeTempDir();
    const attemptId = options.attemptId ?? '11111111-1111-4111-8111-111111111111';
    const installedIntegrity = options.installedIntegrity ?? ADAPTER_INTEGRITY;
    const childEnv = {};
    t.after(() => fs.rmSync(projectRoot, {recursive: true, force: true}));
    t.after(() => fs.rmSync(coreRoot, {recursive: true, force: true}));
    t.after(() => fs.rmSync(cacheRoot, {recursive: true, force: true}));
    writeCorePackage(coreRoot, '1.4.0');
    const catalogue = {
        schemaVersion: 1,
        catalogueId: 'kyaulabs/prism-adapters',
        sequence: 7,
        issuedAt: '2026-08-27T00:00:00Z',
        expiresAt: '2026-09-03T00:00:00Z',
        adapters: [{
            id: 'php-web',
            displayName: 'PHP/web',
            packageName: '@kyaulabs/prism-php-web',
            releases: [{
                version: '1.8.2',
                coreRange: '^1.3.0',
                bootstrapProtocol: 1,
                integrity: ADAPTER_INTEGRITY,
                publishedAt: '2026-08-26T00:00:00Z',
                status: 'ACTIVE',
            }],
        }],
    };
    const envelope = signedEnvelope(catalogue);
    const digest = createHash('sha256').update(envelope.bytes).digest('hex');
    const catalogueCachePath = path.join(cacheRoot, 'cache.json');
    writeJson(path.join(coreRoot, 'config', 'adapter-catalogue-trust.json'), envelope.trust);
    writeJson(catalogueCachePath, {
        schemaVersion: 1,
        entries: [{
            digest,
            sequence: catalogue.sequence,
            envelope: envelope.bytes.toString('base64'),
            cachedAt: '2026-08-27T12:00:00.000Z',
        }],
    });
    fs.chmodSync(catalogueCachePath, 0o600);
    const args = [
        'setup', 'adapter', 'select',
        '--adapter=php-web',
        `--catalogue-digest=${digest}`,
        '--source=blank',
        '--network-approved=yes',
        '--json',
    ];
    const context = {
        projectRoot,
        coreRoot,
        catalogueCachePath,
        catalogueTrust: envelope.trust,
        now: new Date('2026-08-27T12:00:00Z'),
        piExecutable: '/fixture/bin/pi',
        randomUUID: () => attemptId,
        run: (command, runArgs, runOptions) => {
            Object.assign(childEnv, runOptions.env);
            assert.equal(command, '/fixture/bin/pi');
            assert.deepEqual(runArgs, [
                'install',
                'npm:@kyaulabs/prism-php-web@1.8.2',
                '-l',
                '--approve',
            ]);
            writeJson(path.join(projectRoot, '.pi', 'settings.json'), {
                packages: ['npm:@kyaulabs/prism-php-web@1.8.2'],
            });
            writeJson(path.join(projectRoot, '.pi', 'npm', 'package.json'), {
                name: 'pi-extensions',
                private: true,
                dependencies: {'@kyaulabs/prism-php-web': '1.8.2'},
            });
            writeJson(path.join(projectRoot, '.pi', 'npm', 'package-lock.json'), {
                name: 'pi-extensions',
                lockfileVersion: 3,
                packages: {
                    '': {dependencies: {'@kyaulabs/prism-php-web': '1.8.2'}},
                    'node_modules/@kyaulabs/prism-php-web': {
                        version: '1.8.2',
                        integrity: installedIntegrity,
                    },
                },
            });
            fs.writeFileSync(path.join(projectRoot, '.pi', 'npm', '.gitignore'), '*\n!.gitignore\n');
            writeBootstrapAdapterPackage(
                path.join(projectRoot, '.pi', 'npm', 'node_modules', '@kyaulabs', 'prism-php-web'),
                {packageVersion: '1.8.2'}
            );
            return {status: 0, stdout: '', stderr: '', error: undefined};
        },
    };
    return {args, context, digest, projectRoot, childEnv};
}

test('installs the digest-bound signed npm release and records schema 2', (t) => {
    const fixture = provisionContext(t);
    const result = captureWrites(() => main(fixture.args, fixture.context));
    const report = JSON.parse(result.stdout);
    const receipt = JSON.parse(fs.readFileSync(report.data.attempt.receiptPath, 'utf8'));

    assert.equal(result.status, 0);
    assert.equal(report.data.acquisition.kind, 'NPM');
    assert.equal(report.data.acquisition.installSource, 'npm:@kyaulabs/prism-php-web@1.8.2');
    assert.equal(fixture.childEnv.npm_config_save_exact, 'true');
    assert.equal(fixture.childEnv.NPM_CONFIG_SAVE_EXACT, 'true');
    assert.equal(receipt.schemaVersion, 2);
    assert.deepEqual(Object.keys(receipt.catalogueEvidence).sort(), [
        'catalogueId', 'envelopeDigest', 'expiresAt', 'integrity', 'issuedAt',
        'keyId', 'payloadDigest', 'selectedAt', 'sequence',
    ]);
    assert.equal(receipt.catalogueEvidence.envelopeDigest, fixture.digest);
    assert.equal(receipt.catalogueEvidence.selectedAt, '2026-08-27T12:00:00.000Z');
    assert.equal(receipt.catalogueEvidence.integrity, ADAPTER_INTEGRITY);
    assert.equal(
        createHash('sha256').update(Buffer.from(receipt.catalogueEnvelope, 'base64')).digest('hex'),
        fixture.digest
    );
});

test('rejects an installed lockfile integrity mismatch and restores strict emptiness', (t) => {
    const fixture = provisionContext(t, {installedIntegrity: 'sha512-WRONG'});
    const result = captureWrites(() => main(fixture.args, fixture.context));

    assert.equal(JSON.parse(result.stdout).reason, 'POSTINSTALL_VALIDATION_FAILED');
    assert.deepEqual(fs.readdirSync(fixture.projectRoot), []);
});

test('reverifies embedded signed evidence against selectedAt after catalogue expiry', (t) => {
    const fixture = provisionContext(t);
    const result = captureWrites(() => main(fixture.args, fixture.context));
    const report = JSON.parse(result.stdout);
    const inspected = inspectProvisionedBootstrapAdapter({
        projectRoot: fixture.projectRoot,
        coreRoot: fixture.context.coreRoot,
        attemptId: report.data.attempt.id,
        packageName: '@kyaulabs/prism-php-web',
        expectedSource: 'BLANK',
        now: new Date('2026-09-10T00:00:00Z'),
    });

    assert.equal(inspected.receipt.catalogueEvidence.envelopeDigest, fixture.digest);
    assert.equal(inspected.adapter.packageVersion, '1.8.2');
});

test('rejects receipt evidence whose selectedAt falls outside signed validity', (t) => {
    const fixture = provisionContext(t);
    const result = captureWrites(() => main(fixture.args, fixture.context));
    const report = JSON.parse(result.stdout);
    const receipt = JSON.parse(fs.readFileSync(report.data.attempt.receiptPath, 'utf8'));
    receipt.catalogueEvidence.selectedAt = '2026-09-03T00:00:00.000Z';
    writeJson(report.data.attempt.receiptPath, receipt);
    fs.chmodSync(report.data.attempt.receiptPath, 0o600);

    assert.throws(() => inspectProvisionedBootstrapAdapter({
        projectRoot: fixture.projectRoot,
        coreRoot: fixture.context.coreRoot,
        attemptId: report.data.attempt.id,
        packageName: '@kyaulabs/prism-php-web',
        expectedSource: 'BLANK',
    }));
});

test('catalogue discovery requires exact network approval and JSON controls', (t) => {
    const projectRoot = makeTempDir();
    const coreRoot = makeTempDir();
    t.after(() => fs.rmSync(projectRoot, {recursive: true, force: true}));
    t.after(() => fs.rmSync(coreRoot, {recursive: true, force: true}));
    writeCorePackage(coreRoot, '0.3.1');

    for (const args of [
        ['setup', 'adapter', 'catalogue'],
        ['setup', 'adapter', 'catalogue', '--json'],
        ['setup', 'adapter', 'catalogue', '--network-approved=no', '--json'],
        ['setup', 'adapter', 'catalogue', '--network-approved=yes'],
    ]) {
        const result = captureWrites(() => main(args, {projectRoot, coreRoot}));
        assert.equal(result.status, 2);
        assert.equal(result.stdout, '');
    }
    assert.deepEqual(fs.readdirSync(projectRoot), []);
});

test('selects Core-only without package, handler, or filesystem effects', (t) => {
    const projectRoot = makeTempDir();
    const coreRoot = makeTempDir();
    let invocations = 0;
    t.after(() => fs.rmSync(projectRoot, {recursive: true, force: true}));
    t.after(() => fs.rmSync(coreRoot, {recursive: true, force: true}));
    writeCorePackage(coreRoot);

    const result = captureWrites(() => main([
        'setup', 'adapter', 'select', '--adapter=core-only', '--source=blank', '--json',
    ], {
        projectRoot,
        coreRoot,
        run: () => {
            invocations += 1;
            throw new Error('Core-only must not invoke a subprocess');
        },
    }));
    const report = JSON.parse(result.stdout);

    assert.equal(result.status, 0);
    assert.equal(report.disposition, 'CORE_ONLY');
    assert.equal(report.data.adapter, null);
    assert.equal(report.data.acquisition, null);
    assert.equal(report.data.attempt, null);
    assert.equal(invocations, 0);
    assert.deepEqual(fs.readdirSync(projectRoot), []);
});

test('resolves the exact signed npm source even from a source checkout', (t) => {
    const checkoutRoot = makeTempDir();
    t.after(() => fs.rmSync(checkoutRoot, {recursive: true, force: true}));
    const coreRoot = path.join(checkoutRoot, 'packages', 'prism-core');
    const adapterRoot = path.join(checkoutRoot, 'packages', 'prism-php-web');
    writeCorePackage(coreRoot);
    writeBootstrapAdapterPackage(adapterRoot);
    const adapter = {
        id: 'php-web',
        displayName: 'PHP/web',
        packageName: '@kyaulabs/prism-php-web',
        packageVersion: '0.3.1',
        bootstrapProtocol: 1,
        integrity: ADAPTER_INTEGRITY,
    };
    const {resolveBootstrapAcquisition} = require(
        '../../packages/prism-core/scripts/prism-tool/bootstrap-adapter'
    );

    assert.deepEqual(resolveBootstrapAcquisition({coreRoot, adapter}), {
        kind: 'NPM',
        installSource: 'npm:@kyaulabs/prism-php-web@0.3.1',
        packageRoot: null,
    });
});

function installFixture({
    projectRoot,
    packageName,
    packageVersion,
    bootstrapProtocol = 1,
    installSource = `npm:${packageName}@${packageVersion}`,
    lifecycleMarker,
    loadMarker,
    integrity = ADAPTER_INTEGRITY,
}) {
    return (command, args, options) => {
        assert.equal(command, '/fixture/bin/pi');
        assert.deepEqual(args, [
            'install',
            installSource,
            '-l',
            '--approve',
        ]);
        assert.equal(options.cwd, fs.realpathSync(projectRoot));
        assert.equal(options.env.npm_config_ignore_scripts, 'true');
        assert.equal(options.env.NPM_CONFIG_IGNORE_SCRIPTS, 'true');
        assert.equal(options.env.npm_config_save_exact, 'true');
        assert.equal(options.env.NPM_CONFIG_SAVE_EXACT, 'true');
        writeJson(path.join(projectRoot, '.pi', 'settings.json'), {
            packages: [installSource],
        });
        if (installSource.startsWith('npm:')) {
            writeJson(path.join(projectRoot, '.pi', 'npm', 'package.json'), {
                name: 'pi-extensions',
                private: true,
                dependencies: {[packageName]: packageVersion},
            });
            writeJson(path.join(projectRoot, '.pi', 'npm', 'package-lock.json'), {
                name: 'pi-extensions',
                lockfileVersion: 3,
                packages: {
                    '': {dependencies: {[packageName]: packageVersion}},
                    [`node_modules/${packageName}`]: {version: packageVersion, integrity},
                },
            });
            fs.writeFileSync(path.join(projectRoot, '.pi', 'npm', '.gitignore'), '*\n!.gitignore\n');
            writeBootstrapAdapterPackage(
                path.join(projectRoot, '.pi', 'npm', 'node_modules', ...packageName.split('/')),
                {
                    packageName,
                    packageVersion,
                    bootstrapProtocol,
                    lifecycleMarker,
                    loadMarker,
                }
            );
        }
        return {status: 0, stdout: '', stderr: '', error: undefined};
    };
}

test('provisions the exact pinned npm adapter through Pi and records the attempt', (t) => {
    const projectRoot = makeTempDir();
    const coreRoot = makeTempDir();
    const attemptId = '11111111-1111-4111-8111-111111111111';
    t.after(() => fs.rmSync(projectRoot, {recursive: true, force: true}));
    t.after(() => fs.rmSync(coreRoot, {recursive: true, force: true}));
    writeCorePackage(coreRoot);

    const result = captureWrites(() => main([
        'setup', 'adapter', 'select',
        '--adapter=php-web',
        '--source=blank',
        '--network-approved=yes',
        '--json',
    ], {
        projectRoot,
        coreRoot,
        piExecutable: '/fixture/bin/pi',
        randomUUID: () => attemptId,
        run: installFixture({
            projectRoot,
            packageName: '@kyaulabs/prism-php-web',
            packageVersion: '0.3.1',
        }),
    }));
    const report = JSON.parse(result.stdout);
    const receiptPath = path.join(
        projectRoot,
        '.pi',
        'prism-tool',
        'bootstrap',
        attemptId,
        'adapter.json'
    );

    assert.equal(result.status, 0);
    assert.equal(result.stderr, '');
    assert.equal(report.disposition, 'ADAPTER_PROVISIONED');
    assert.equal(report.data.adapter.id, 'php-web');
    assert.equal(report.data.adapter.packageName, '@kyaulabs/prism-php-web');
    assert.equal(report.data.adapter.packageVersion, '0.3.1');
    assert.equal(report.data.adapter.bootstrapProtocol, 1);
    assert.deepEqual(report.data.acquisition, {
        kind: 'NPM',
        installSource: 'npm:@kyaulabs/prism-php-web@0.3.1',
    });
    assert.equal(report.data.attempt.id, attemptId);
    assert.equal(report.data.attempt.receiptPath, fs.realpathSync(receiptPath));
    assert.equal(fs.statSync(path.dirname(receiptPath)).mode & 0o777, 0o700);
    assert.equal(fs.statSync(receiptPath).mode & 0o777, 0o600);
    const receipt = JSON.parse(fs.readFileSync(receiptPath, 'utf8'));
    assert.equal(receipt.phase, 'PROVISIONED');
    assert.equal(receipt.projectRoot, fs.realpathSync(projectRoot));
    assert.match(receipt.settings.sha256, /^[0-9a-f]{64}$/);
    assert.match(receipt.npmInventory.sha256, /^[0-9a-f]{64}$/);
    assert.ok(receipt.npmInventory.entries.length > 0);
    assert.equal(receipt.registration.packageName, '@kyaulabs/prism-php-web');
    assert.equal(receipt.registration.packageVersion, '0.3.1');
    assert.equal(receipt.registration.bootstrapProtocol, 1);
});

test('provisions the signed npm adapter when Core runs from a checkout', (t) => {
    const checkoutRoot = makeTempDir();
    const projectRoot = makeTempDir();
    const attemptId = '22222222-2222-4222-8222-222222222222';
    t.after(() => fs.rmSync(checkoutRoot, {recursive: true, force: true}));
    t.after(() => fs.rmSync(projectRoot, {recursive: true, force: true}));
    const coreRoot = path.join(checkoutRoot, 'packages', 'prism-core');
    const adapterRoot = path.join(checkoutRoot, 'packages', 'prism-php-web');
    writeCorePackage(coreRoot);
    writeBootstrapAdapterPackage(adapterRoot);

    const result = captureWrites(() => main([
        'setup', 'adapter', 'select',
        '--adapter=php-web',
        '--source=template',
        '--network-approved=yes',
        '--json',
    ], {
        projectRoot,
        coreRoot,
        piExecutable: '/fixture/bin/pi',
        randomUUID: () => attemptId,
        run: installFixture({
            projectRoot,
            packageName: '@kyaulabs/prism-php-web',
            packageVersion: '0.3.1',
        }),
    }));
    const report = JSON.parse(result.stdout);

    assert.equal(result.status, 0);
    assert.equal(report.disposition, 'ADAPTER_PROVISIONED');
    assert.deepEqual(report.data.acquisition, {
        kind: 'NPM',
        installSource: 'npm:@kyaulabs/prism-php-web@0.3.1',
    });
    assert.deepEqual(
        JSON.parse(fs.readFileSync(path.join(projectRoot, '.pi', 'settings.json'), 'utf8')).packages,
        ['npm:@kyaulabs/prism-php-web@0.3.1']
    );
    assert.equal(fs.existsSync(path.join(projectRoot, '.pi', 'npm')), true);
    const receipt = JSON.parse(fs.readFileSync(report.data.attempt.receiptPath, 'utf8'));
    assert.equal(receipt.source, 'TEMPLATE');
    const inspected = inspectProvisionedBootstrapAdapter({
        projectRoot,
        coreRoot,
        attemptId,
        packageName: '@kyaulabs/prism-php-web',
        expectedSource: 'TEMPLATE',
    });
    assert.equal(inspected.receipt.source, 'TEMPLATE');
    assert.throws(() => inspectProvisionedBootstrapAdapter({
        projectRoot,
        coreRoot,
        attemptId,
        packageName: '@kyaulabs/prism-php-web',
        expectedSource: 'BLANK',
    }), /receipt is stale/);
});

test('cleans only attempt-created paths when Pi adapter installation fails', (t) => {
    const projectRoot = makeTempDir();
    const coreRoot = makeTempDir();
    t.after(() => fs.rmSync(projectRoot, {recursive: true, force: true}));
    t.after(() => fs.rmSync(coreRoot, {recursive: true, force: true}));
    writeCorePackage(coreRoot);

    const result = captureWrites(() => main([
        'setup', 'adapter', 'select',
        '--adapter=php-web',
        '--source=blank',
        '--network-approved=yes',
        '--json',
    ], {
        projectRoot,
        coreRoot,
        piExecutable: '/fixture/bin/pi',
        randomUUID: () => '33333333-3333-4333-8333-333333333333',
        run: () => ({status: 1, stdout: '', stderr: 'failed', error: undefined}),
    }));

    const report = JSON.parse(result.stdout);
    assert.equal(result.status, 5);
    assert.equal(result.stderr, '');
    assert.equal(report.disposition, 'INSTALL_FAILED');
    assert.deepEqual(fs.readdirSync(projectRoot), []);
});

test('removes created Pi state when settings verification fails', (t) => {
    const projectRoot = makeTempDir();
    const coreRoot = makeTempDir();
    t.after(() => fs.rmSync(projectRoot, {recursive: true, force: true}));
    t.after(() => fs.rmSync(coreRoot, {recursive: true, force: true}));
    writeCorePackage(coreRoot);
    const install = installFixture({
        projectRoot,
        packageName: '@kyaulabs/prism-php-web',
        packageVersion: '0.3.1',
    });

    const result = captureWrites(() => main([
        'setup', 'adapter', 'select',
        '--adapter=php-web',
        '--source=blank',
        '--network-approved=yes',
        '--json',
    ], {
        projectRoot,
        coreRoot,
        piExecutable: '/fixture/bin/pi',
        randomUUID: () => '44444444-4444-4444-8444-444444444444',
        run: (...args) => {
            const completed = install(...args);
            writeJson(path.join(projectRoot, '.pi', 'settings.json'), {
                packages: ['npm:@kyaulabs/prism-php-web@0.3.2'],
            });
            return completed;
        },
    }));

    assert.equal(result.status, 5);
    assert.equal(JSON.parse(result.stdout).disposition, 'INSTALL_FAILED');
    assert.deepEqual(fs.readdirSync(projectRoot), []);
});

test('fails closed and cleans the attempt when Pi lock state is corrupt', (t) => {
    const projectRoot = makeTempDir();
    const coreRoot = makeTempDir();
    t.after(() => fs.rmSync(projectRoot, {recursive: true, force: true}));
    t.after(() => fs.rmSync(coreRoot, {recursive: true, force: true}));
    writeCorePackage(coreRoot);
    const install = installFixture({
        projectRoot,
        packageName: '@kyaulabs/prism-php-web',
        packageVersion: '0.3.1',
    });

    const result = captureWrites(() => main([
        'setup', 'adapter', 'select',
        '--adapter=php-web',
        '--source=blank',
        '--network-approved=yes',
        '--json',
    ], {
        projectRoot,
        coreRoot,
        piExecutable: '/fixture/bin/pi',
        randomUUID: () => '55555555-5555-4555-8555-555555555555',
        run: (...args) => {
            const completed = install(...args);
            fs.writeFileSync(path.join(projectRoot, '.pi', 'npm', 'package-lock.json'), '{');
            return completed;
        },
    }));

    assert.equal(result.status, 5);
    assert.equal(JSON.parse(result.stdout).disposition, 'INSTALL_FAILED');
    assert.deepEqual(fs.readdirSync(projectRoot), []);
});

test('preserves an unrelated file discovered during failed-attempt cleanup', (t) => {
    const projectRoot = makeTempDir();
    const coreRoot = makeTempDir();
    t.after(() => fs.rmSync(projectRoot, {recursive: true, force: true}));
    t.after(() => fs.rmSync(coreRoot, {recursive: true, force: true}));
    writeCorePackage(coreRoot);

    const result = captureWrites(() => main([
        'setup', 'adapter', 'select',
        '--adapter=php-web',
        '--source=blank',
        '--network-approved=yes',
        '--json',
    ], {
        projectRoot,
        coreRoot,
        piExecutable: '/fixture/bin/pi',
        randomUUID: () => '66666666-6666-4666-8666-666666666666',
        run: () => {
            fs.writeFileSync(path.join(projectRoot, 'KEEP.txt'), 'user-owned\n');
            return {status: 1, stdout: '', stderr: 'failed', error: undefined};
        },
    }));

    assert.equal(result.status, 5);
    assert.equal(JSON.parse(result.stdout).disposition, 'RECOVERY_REQUIRED');
    assert.equal(fs.readFileSync(path.join(projectRoot, 'KEEP.txt'), 'utf8'), 'user-owned\n');
    assert.deepEqual(fs.readdirSync(projectRoot).sort(), ['.pi', 'KEEP.txt']);
});

test('rejects a lockfile that does not pin the selected adapter version', (t) => {
    const projectRoot = makeTempDir();
    const coreRoot = makeTempDir();
    t.after(() => fs.rmSync(projectRoot, {recursive: true, force: true}));
    t.after(() => fs.rmSync(coreRoot, {recursive: true, force: true}));
    writeCorePackage(coreRoot);
    const install = installFixture({
        projectRoot,
        packageName: '@kyaulabs/prism-php-web',
        packageVersion: '0.3.1',
    });

    const result = captureWrites(() => main([
        'setup', 'adapter', 'select',
        '--adapter=php-web',
        '--source=blank',
        '--network-approved=yes',
        '--json',
    ], {
        projectRoot,
        coreRoot,
        piExecutable: '/fixture/bin/pi',
        randomUUID: () => '77777777-7777-4777-8777-777777777777',
        run: (...args) => {
            const completed = install(...args);
            const lockPath = path.join(projectRoot, '.pi', 'npm', 'package-lock.json');
            const lock = JSON.parse(fs.readFileSync(lockPath, 'utf8'));
            lock.packages['node_modules/@kyaulabs/prism-php-web'].version = '0.3.2';
            writeJson(lockPath, lock);
            return completed;
        },
    }));

    assert.equal(result.status, 5);
    assert.equal(JSON.parse(result.stdout).disposition, 'INSTALL_FAILED');
    assert.deepEqual(fs.readdirSync(projectRoot), []);
});

test('cleans post-install identity, protocol, collision, and containment failures', async (t) => {
    const coreComponentId = JSON.parse(fs.readFileSync(
        path.resolve(__dirname, '../../packages/prism-core/toolchain.json'),
        'utf8'
    )).components[0].id;
    const cases = [
        {
            name: 'installed version mismatch',
            mutate(packageRoot) {
                const manifestPath = path.join(packageRoot, 'package.json');
                const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
                manifest.version = '0.3.2';
                writeJson(manifestPath, manifest);
            },
        },
        {
            name: 'handler protocol mismatch',
            mutate(packageRoot) {
                fs.writeFileSync(
                    path.join(packageRoot, 'scripts', 'prism-tool-adapter.js'),
                    "'use strict';\nmodule.exports = {bootstrapProtocol: 2, inspect() {}, resolveTool() {}};\n"
                );
            },
        },
        {
            name: 'core component collision',
            mutate(packageRoot) {
                const contractPath = path.join(packageRoot, 'toolchain.json');
                const contract = JSON.parse(fs.readFileSync(contractPath, 'utf8'));
                contract.components[0].id = coreComponentId;
                writeJson(contractPath, contract);
            },
        },
        {
            name: 'handler containment escape',
            mutate(packageRoot, coreRoot) {
                const handlerPath = path.join(packageRoot, 'scripts', 'prism-tool-adapter.js');
                const externalHandler = path.join(coreRoot, 'external-handler.js');
                fs.writeFileSync(
                    externalHandler,
                    "'use strict';\nmodule.exports = {bootstrapProtocol: 1, inspect() {}, resolveTool() {}};\n"
                );
                fs.unlinkSync(handlerPath);
                fs.symlinkSync(externalHandler, handlerPath);
            },
        },
    ];

    const attemptIds = [
        '88888888-8888-4888-8888-888888888888',
        '99999999-9999-4999-8999-999999999999',
        'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
    ];
    for (let index = 0; index < cases.length; index += 1) {
        await t.test(cases[index].name, () => {
            const projectRoot = makeTempDir();
            const coreRoot = makeTempDir();
            t.after(() => fs.rmSync(projectRoot, {recursive: true, force: true}));
            t.after(() => fs.rmSync(coreRoot, {recursive: true, force: true}));
            writeCorePackage(coreRoot);
            const install = installFixture({
                projectRoot,
                packageName: '@kyaulabs/prism-php-web',
                packageVersion: '0.3.1',
            });

            const result = captureWrites(() => main([
                'setup', 'adapter', 'select',
                '--adapter=php-web',
                '--source=blank',
                '--network-approved=yes',
                '--json',
            ], {
                projectRoot,
                coreRoot,
                piExecutable: '/fixture/bin/pi',
                randomUUID: () => attemptIds[index],
                run: (...args) => {
                    const completed = install(...args);
                    const packageRoot = path.join(
                        projectRoot,
                        '.pi',
                        'npm',
                        'node_modules',
                        '@kyaulabs',
                        'prism-php-web'
                    );
                    cases[index].mutate(packageRoot, coreRoot);
                    return completed;
                },
            }));

            assert.equal(result.status, 5);
            assert.equal(JSON.parse(result.stdout).disposition, 'INSTALL_FAILED');
            assert.deepEqual(fs.readdirSync(projectRoot), []);
        });
    }
});

test('a symlinked receipt cannot redirect cleanup outside the attempt directory', (t) => {
    const projectRoot = makeTempDir();
    const coreRoot = makeTempDir();
    const attemptId = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
    const outsideFile = path.join(coreRoot, 'outside.json');
    t.after(() => fs.rmSync(projectRoot, {recursive: true, force: true}));
    t.after(() => fs.rmSync(coreRoot, {recursive: true, force: true}));
    writeCorePackage(coreRoot);
    fs.writeFileSync(outsideFile, 'preserve\n');

    const result = captureWrites(() => main([
        'setup', 'adapter', 'select',
        '--adapter=php-web',
        '--source=blank',
        '--network-approved=yes',
        '--json',
    ], {
        projectRoot,
        coreRoot,
        piExecutable: '/fixture/bin/pi',
        randomUUID: () => attemptId,
        run: () => {
            const receiptPath = path.join(
                projectRoot,
                '.pi',
                'prism-tool',
                'bootstrap',
                attemptId,
                'adapter.json'
            );
            fs.unlinkSync(receiptPath);
            fs.symlinkSync(outsideFile, receiptPath);
            return {status: 1, stdout: '', stderr: 'failed', error: undefined};
        },
    }));

    assert.equal(result.status, 5);
    assert.equal(JSON.parse(result.stdout).disposition, 'INSTALL_FAILED');
    assert.equal(fs.readFileSync(outsideFile, 'utf8'), 'preserve\n');
    assert.deepEqual(fs.readdirSync(projectRoot), []);
});

test('rejects traversal-shaped attempt identifiers before creating state', (t) => {
    const projectRoot = makeTempDir();
    const coreRoot = makeTempDir();
    let invocations = 0;
    t.after(() => fs.rmSync(projectRoot, {recursive: true, force: true}));
    t.after(() => fs.rmSync(coreRoot, {recursive: true, force: true}));
    writeCorePackage(coreRoot);

    const result = captureWrites(() => main([
        'setup', 'adapter', 'select',
        '--adapter=php-web',
        '--source=blank',
        '--network-approved=yes',
        '--json',
    ], {
        projectRoot,
        coreRoot,
        piExecutable: '/fixture/bin/pi',
        randomUUID: () => '../../outside',
        run: () => { invocations += 1; },
    }));

    assert.equal(result.status, 5);
    assert.equal(result.stdout, '');
    assert.match(result.stderr, /bootstrap adapter selection failed/);
    assert.equal(invocations, 0);
    assert.deepEqual(fs.readdirSync(projectRoot), []);
});

test('preserves an unexpected user file inside .pi during cleanup', (t) => {
    const projectRoot = makeTempDir();
    const coreRoot = makeTempDir();
    t.after(() => fs.rmSync(projectRoot, {recursive: true, force: true}));
    t.after(() => fs.rmSync(coreRoot, {recursive: true, force: true}));
    writeCorePackage(coreRoot);

    const result = captureWrites(() => main([
        'setup', 'adapter', 'select',
        '--adapter=php-web',
        '--source=blank',
        '--network-approved=yes',
        '--json',
    ], {
        projectRoot,
        coreRoot,
        piExecutable: '/fixture/bin/pi',
        randomUUID: () => 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
        run: () => {
            fs.writeFileSync(path.join(projectRoot, '.pi', 'KEEP.txt'), 'user-owned\n');
            return {status: 1, stdout: '', stderr: 'failed', error: undefined};
        },
    }));

    assert.equal(result.status, 5);
    assert.equal(JSON.parse(result.stdout).disposition, 'RECOVERY_REQUIRED');
    assert.equal(
        fs.readFileSync(path.join(projectRoot, '.pi', 'KEEP.txt'), 'utf8'),
        'user-owned\n'
    );
    assert.deepEqual(
        fs.readdirSync(path.join(projectRoot, '.pi')).sort(),
        ['KEEP.txt', 'prism-tool']
    );
});

test('rejects unexpected package-manager dependencies in a fresh bootstrap', (t) => {
    const projectRoot = makeTempDir();
    const coreRoot = makeTempDir();
    t.after(() => fs.rmSync(projectRoot, {recursive: true, force: true}));
    t.after(() => fs.rmSync(coreRoot, {recursive: true, force: true}));
    writeCorePackage(coreRoot);
    const install = installFixture({
        projectRoot,
        packageName: '@kyaulabs/prism-php-web',
        packageVersion: '0.3.1',
    });

    const result = captureWrites(() => main([
        'setup', 'adapter', 'select',
        '--adapter=php-web',
        '--source=blank',
        '--network-approved=yes',
        '--json',
    ], {
        projectRoot,
        coreRoot,
        piExecutable: '/fixture/bin/pi',
        randomUUID: () => 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
        run: (...args) => {
            const completed = install(...args);
            const manifestPath = path.join(projectRoot, '.pi', 'npm', 'package.json');
            const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
            manifest.dependencies['unexpected-package'] = '1.0.0';
            writeJson(manifestPath, manifest);
            return completed;
        },
    }));

    assert.equal(result.status, 5);
    assert.equal(JSON.parse(result.stdout).disposition, 'INSTALL_FAILED');
    assert.deepEqual(fs.readdirSync(projectRoot), []);
});

test('explicit cleanup removes unchanged provisioned adapter state', (t) => {
    const projectRoot = makeTempDir();
    const coreRoot = makeTempDir();
    const attemptId = 'ffffffff-ffff-4fff-8fff-ffffffffffff';
    t.after(() => fs.rmSync(projectRoot, {recursive: true, force: true}));
    t.after(() => fs.rmSync(coreRoot, {recursive: true, force: true}));
    writeCorePackage(coreRoot);
    const provisioned = captureWrites(() => main([
        'setup', 'adapter', 'select',
        '--adapter=php-web',
        '--source=blank',
        '--network-approved=yes',
        '--json',
    ], {
        projectRoot,
        coreRoot,
        piExecutable: '/fixture/bin/pi',
        randomUUID: () => attemptId,
        run: installFixture({
            projectRoot,
            packageName: '@kyaulabs/prism-php-web',
            packageVersion: '0.3.1',
        }),
    }));
    assert.equal(provisioned.status, 0);

    const result = captureWrites(() => main([
        'setup', 'adapter', 'cleanup', `--attempt=${attemptId}`, '--json',
    ], {projectRoot}));
    const report = JSON.parse(result.stdout);

    assert.equal(result.status, 0);
    assert.equal(report.status, 'GO');
    assert.equal(report.disposition, 'CLEANED');
    assert.equal(report.data.attempt.id, attemptId);
    assert.deepEqual(fs.readdirSync(projectRoot), []);
});

test('cleanup returns structured recovery when the final root inspection fails', (t) => {
    const projectRoot = makeTempDir();
    const coreRoot = makeTempDir();
    const attemptId = '01010101-0101-4101-8101-010101010101';
    t.after(() => fs.rmSync(projectRoot, {recursive: true, force: true}));
    t.after(() => fs.rmSync(coreRoot, {recursive: true, force: true}));
    writeCorePackage(coreRoot);
    const provisioned = captureWrites(() => main([
        'setup', 'adapter', 'select',
        '--adapter=php-web',
        '--source=blank',
        '--network-approved=yes',
        '--json',
    ], {
        projectRoot,
        coreRoot,
        piExecutable: '/fixture/bin/pi',
        randomUUID: () => attemptId,
        run: installFixture({
            projectRoot,
            packageName: '@kyaulabs/prism-php-web',
            packageVersion: '0.3.1',
        }),
    }));
    assert.equal(provisioned.status, 0);

    const readdirSync = fs.readdirSync;
    fs.readdirSync = (target, ...args) => {
        const entries = readdirSync(target, ...args);
        if (path.resolve(target) === projectRoot && entries.length === 0) {
            throw new Error('final root inspection failed');
        }
        return entries;
    };
    let result;
    try {
        result = captureWrites(() => main([
            'setup', 'adapter', 'cleanup', `--attempt=${attemptId}`, '--json',
        ], {projectRoot}));
    } finally {
        fs.readdirSync = readdirSync;
    }
    const report = JSON.parse(result.stdout);

    assert.equal(result.status, 5);
    assert.equal(report.disposition, 'RECOVERY_REQUIRED');
    assert.equal(report.reason, 'ROOT_STATE_UNSAFE');
});

test('cleanup preserves changed or ambiguous provisioned state for recovery', async (t) => {
    const cases = [
        {
            name: 'changed settings',
            mutate({projectRoot}) {
                fs.appendFileSync(path.join(projectRoot, '.pi', 'settings.json'), ' ');
            },
        },
        {
            name: 'changed npm inventory',
            mutate({projectRoot}) {
                fs.appendFileSync(path.join(projectRoot, '.pi', 'npm', 'package-lock.json'), ' ');
            },
        },
        {
            name: 'unexpected root entry',
            mutate({projectRoot}) {
                fs.writeFileSync(path.join(projectRoot, 'KEEP.txt'), 'preserve\n');
            },
        },
        {
            name: 'unexpected .pi child',
            mutate({projectRoot}) {
                fs.writeFileSync(path.join(projectRoot, '.pi', 'KEEP.txt'), 'preserve\n');
            },
        },
        {
            name: 'invalid receipt',
            mutate({receiptPath}) {
                fs.writeFileSync(receiptPath, '{');
            },
        },
    ];
    const attemptIds = [
        '10101010-1010-4010-8010-101010101010',
        '20202020-2020-4020-8020-202020202020',
        '30303030-3030-4030-8030-303030303030',
        '40404040-4040-4040-8040-404040404040',
        '50505050-5050-4050-8050-505050505050',
    ];

    for (let index = 0; index < cases.length; index += 1) {
        await t.test(cases[index].name, () => {
            const projectRoot = makeTempDir();
            const coreRoot = makeTempDir();
            const attemptId = attemptIds[index];
            t.after(() => fs.rmSync(projectRoot, {recursive: true, force: true}));
            t.after(() => fs.rmSync(coreRoot, {recursive: true, force: true}));
            writeCorePackage(coreRoot);
            const provisioned = captureWrites(() => main([
                'setup', 'adapter', 'select',
                '--adapter=php-web',
                '--source=blank',
                '--network-approved=yes',
                '--json',
            ], {
                projectRoot,
                coreRoot,
                piExecutable: '/fixture/bin/pi',
                randomUUID: () => attemptId,
                run: installFixture({
                    projectRoot,
                    packageName: '@kyaulabs/prism-php-web',
                    packageVersion: '0.3.1',
                }),
            }));
            assert.equal(provisioned.status, 0);
            const receiptPath = path.join(
                projectRoot,
                '.pi',
                'prism-tool',
                'bootstrap',
                attemptId,
                'adapter.json'
            );
            cases[index].mutate({projectRoot, receiptPath});

            const result = captureWrites(() => main([
                'setup', 'adapter', 'cleanup', `--attempt=${attemptId}`, '--json',
            ], {projectRoot}));
            const report = JSON.parse(result.stdout);

            assert.equal(result.status, 5);
            assert.equal(report.disposition, 'RECOVERY_REQUIRED');
            assert.equal(fs.existsSync(path.join(projectRoot, '.pi')), true);
        });
    }
});

test('rejects unsupported selection and cleanup controls before mutation', (t) => {
    const projectRoot = makeTempDir();
    const coreRoot = makeTempDir();
    let invocations = 0;
    t.after(() => fs.rmSync(projectRoot, {recursive: true, force: true}));
    t.after(() => fs.rmSync(coreRoot, {recursive: true, force: true}));
    writeCorePackage(coreRoot);
    const cases = [
        ['setup', 'adapter', 'select', '--adapter=php-web', '--source=blank', '--json'],
        [
            'setup', 'adapter', 'select', '--adapter=php-web', '--source=blank',
            '--network-approved=yes', '--network-approved=yes', '--json',
        ],
        [
            'setup', 'adapter', 'select', '--adapter=UNKNOWN', '--source=blank',
            '--network-approved=yes', '--json',
        ],
        ...['--package=other', '--version=1.0.0', '--integrity=sha512-AAAA',
            '--url=https://example.com'].map((control) => [
            'setup', 'adapter', 'select', '--adapter=php-web', '--source=blank',
            '--network-approved=yes', control, '--json',
        ]),
        [
            'setup', 'adapter', 'select', '--adapter=php-web', '--source=other',
            '--network-approved=yes', '--json',
        ],
        ['setup', 'adapter', 'cleanup', '--attempt=../../outside', '--json'],
        [
            'setup', 'adapter', 'cleanup',
            '--attempt=11111111-1111-4111-8111-111111111111',
            '--attempt=22222222-2222-4222-8222-222222222222',
            '--json',
        ],
    ];

    for (const args of cases) {
        const result = captureWrites(() => main(args, {
            projectRoot,
            coreRoot,
            piExecutable: '/fixture/bin/pi',
            randomUUID: () => '60606060-6060-4060-8060-606060606060',
            run: () => { invocations += 1; },
        }));
        assert.equal(result.status, 2);
        assert.equal(result.stdout, '');
        assert.deepEqual(fs.readdirSync(projectRoot), []);
    }
    const missingDigest = captureWrites(() => cliMain([
        'setup', 'adapter', 'select', '--adapter=php-web', '--source=blank',
        '--network-approved=yes', '--json',
    ], {
        projectRoot,
        coreRoot,
        piExecutable: '/fixture/bin/pi',
        run: () => { invocations += 1; },
    }));
    assert.equal(missingDigest.status, 2);
    assert.equal(missingDigest.stdout, '');
    assert.equal(invocations, 0);
});

test('cleans bounded partial Pi state after a failed install subprocess', (t) => {
    const projectRoot = makeTempDir();
    const coreRoot = makeTempDir();
    t.after(() => fs.rmSync(projectRoot, {recursive: true, force: true}));
    t.after(() => fs.rmSync(coreRoot, {recursive: true, force: true}));
    writeCorePackage(coreRoot);

    const result = captureWrites(() => main([
        'setup', 'adapter', 'select',
        '--adapter=php-web',
        '--source=blank',
        '--network-approved=yes',
        '--json',
    ], {
        projectRoot,
        coreRoot,
        piExecutable: '/fixture/bin/pi',
        randomUUID: () => '70707070-7070-4070-8070-707070707070',
        run: () => {
            writeJson(path.join(projectRoot, '.pi', 'settings.json'), {
                packages: ['npm:@kyaulabs/prism-php-web@0.3.1'],
            });
            writeJson(path.join(projectRoot, '.pi', 'npm', 'package.json'), {
                dependencies: {'@kyaulabs/prism-php-web': '0.3.1'},
            });
            return {status: 1, stdout: 'ignored', stderr: 'ignored', error: undefined};
        },
    }));

    assert.equal(result.status, 5);
    assert.equal(JSON.parse(result.stdout).disposition, 'INSTALL_FAILED');
    assert.deepEqual(fs.readdirSync(projectRoot), []);
});

test('does not invoke Pi for established or containing-worktree roots', (t) => {
    const establishedRoot = makeTempDir();
    const worktreeRoot = makeTempDir();
    const coreRoot = makeTempDir();
    const nestedRoot = path.join(worktreeRoot, 'empty-project');
    let invocations = 0;
    t.after(() => fs.rmSync(establishedRoot, {recursive: true, force: true}));
    t.after(() => fs.rmSync(worktreeRoot, {recursive: true, force: true}));
    t.after(() => fs.rmSync(coreRoot, {recursive: true, force: true}));
    writeCorePackage(coreRoot);
    fs.writeFileSync(path.join(establishedRoot, 'README.md'), 'existing\n');
    fs.mkdirSync(nestedRoot);
    assert.equal(spawnSync('git', ['init', '-q'], {cwd: worktreeRoot}).status, 0);

    for (const projectRoot of [establishedRoot, nestedRoot]) {
        const result = captureWrites(() => main([
            'setup', 'adapter', 'select',
            '--adapter=php-web',
            '--source=blank',
            '--network-approved=yes',
            '--json',
        ], {
            projectRoot,
            coreRoot,
            piExecutable: '/fixture/bin/pi',
            randomUUID: () => '80808080-8080-4080-8080-808080808080',
            run: () => { invocations += 1; },
        }));
        assert.equal(result.status, 5);
        assert.equal(JSON.parse(result.stdout).disposition, 'STOP');
    }
    assert.equal(invocations, 0);
    assert.equal(fs.readFileSync(path.join(establishedRoot, 'README.md'), 'utf8'), 'existing\n');
    assert.deepEqual(fs.readdirSync(nestedRoot), []);
});

test('disables package lifecycle scripts during provisional installation', (t) => {
    const projectRoot = makeTempDir();
    const coreRoot = makeTempDir();
    const lifecycleMarker = path.join(projectRoot, 'lifecycle-ran');
    t.after(() => fs.rmSync(projectRoot, {recursive: true, force: true}));
    t.after(() => fs.rmSync(coreRoot, {recursive: true, force: true}));
    writeCorePackage(coreRoot);

    const result = captureWrites(() => main([
        'setup', 'adapter', 'select',
        '--adapter=php-web',
        '--source=blank',
        '--network-approved=yes',
        '--json',
    ], {
        projectRoot,
        coreRoot,
        piExecutable: '/fixture/bin/pi',
        randomUUID: () => '90909090-9090-4090-8090-909090909090',
        run: installFixture({
            projectRoot,
            packageName: '@kyaulabs/prism-php-web',
            packageVersion: '0.3.1',
            lifecycleMarker,
        }),
    }));

    assert.equal(result.status, 0);
    assert.equal(fs.existsSync(lifecycleMarker), false);
});

test('inherits the process environment while suppressing lifecycle scripts', (t) => {
    const projectRoot = makeTempDir();
    const coreRoot = makeTempDir();
    const canaryName = 'PRISM_BOOTSTRAP_ENV_CANARY';
    const originalCanary = process.env[canaryName];
    let childEnvironment;
    t.after(() => fs.rmSync(projectRoot, {recursive: true, force: true}));
    t.after(() => fs.rmSync(coreRoot, {recursive: true, force: true}));
    t.after(() => {
        if (originalCanary === undefined) delete process.env[canaryName];
        else process.env[canaryName] = originalCanary;
    });
    process.env[canaryName] = 'inherited';
    writeCorePackage(coreRoot);
    const install = installFixture({
        projectRoot,
        packageName: '@kyaulabs/prism-php-web',
        packageVersion: '0.3.1',
    });

    const result = captureWrites(() => main([
        'setup', 'adapter', 'select',
        '--adapter=php-web',
        '--source=blank',
        '--network-approved=yes',
        '--json',
    ], {
        projectRoot,
        coreRoot,
        piExecutable: '/fixture/bin/pi',
        randomUUID: () => '91919191-9191-4191-8191-919191919191',
        run: (...args) => {
            childEnvironment = args[2].env;
            return install(...args);
        },
    }));

    assert.equal(result.status, 0);
    assert.equal(childEnvironment[canaryName], 'inherited');
    assert.equal(childEnvironment.npm_config_ignore_scripts, 'true');
    assert.equal(childEnvironment.NPM_CONFIG_IGNORE_SCRIPTS, 'true');
});

test('rejects registration metadata before loading adapter handler code', (t) => {
    const projectRoot = makeTempDir();
    const coreRoot = makeTempDir();
    const loadMarker = path.join(coreRoot, 'handler-loaded');
    t.after(() => fs.rmSync(projectRoot, {recursive: true, force: true}));
    t.after(() => fs.rmSync(coreRoot, {recursive: true, force: true}));
    writeCorePackage(coreRoot);
    const install = installFixture({
        projectRoot,
        packageName: '@kyaulabs/prism-php-web',
        packageVersion: '0.3.1',
        loadMarker,
    });

    const result = captureWrites(() => main([
        'setup', 'adapter', 'select',
        '--adapter=php-web',
        '--source=blank',
        '--network-approved=yes',
        '--json',
    ], {
        projectRoot,
        coreRoot,
        piExecutable: '/fixture/bin/pi',
        randomUUID: () => 'abababab-abab-4bab-8bab-abababababab',
        run: (...args) => {
            const completed = install(...args);
            const manifestPath = path.join(
                projectRoot,
                '.pi',
                'npm',
                'node_modules',
                '@kyaulabs',
                'prism-php-web',
                'package.json'
            );
            const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
            manifest.version = '0.3.2';
            writeJson(manifestPath, manifest);
            return completed;
        },
    }));

    assert.equal(result.status, 5);
    assert.equal(JSON.parse(result.stdout).disposition, 'INSTALL_FAILED');
    assert.equal(fs.existsSync(loadMarker), false);
});

test('rejects oversized inventory files before reading their bytes', (t) => {
    const projectRoot = makeTempDir();
    const coreRoot = makeTempDir();
    const largePath = path.join(
        projectRoot,
        '.pi',
        'npm',
        'node_modules',
        '@kyaulabs',
        'prism-php-web',
        'large.bin'
    );
    let readLarge = false;
    t.after(() => fs.rmSync(projectRoot, {recursive: true, force: true}));
    t.after(() => fs.rmSync(coreRoot, {recursive: true, force: true}));
    writeCorePackage(coreRoot);
    const install = installFixture({
        projectRoot,
        packageName: '@kyaulabs/prism-php-web',
        packageVersion: '0.3.1',
    });
    const readFileSync = fs.readFileSync;
    fs.readFileSync = (...args) => {
        if (args[0] === largePath) {
            readLarge = true;
            throw new Error('oversized file bytes must not be read');
        }
        return readFileSync(...args);
    };
    t.after(() => { fs.readFileSync = readFileSync; });

    const result = captureWrites(() => main([
        'setup', 'adapter', 'select',
        '--adapter=php-web',
        '--source=blank',
        '--network-approved=yes',
        '--json',
    ], {
        projectRoot,
        coreRoot,
        piExecutable: '/fixture/bin/pi',
        randomUUID: () => '12121212-1212-4212-8212-121212121212',
        run: (...args) => {
            const completed = install(...args);
            const descriptor = fs.openSync(largePath, 'w');
            fs.ftruncateSync(descriptor, 268435457);
            fs.closeSync(descriptor);
            return completed;
        },
    }));

    assert.equal(result.status, 5);
    assert.equal(JSON.parse(result.stdout).disposition, 'INSTALL_FAILED');
    assert.equal(readLarge, false);
});

test('maps a thrown Pi runner failure to bounded transaction cleanup', (t) => {
    const projectRoot = makeTempDir();
    const coreRoot = makeTempDir();
    t.after(() => fs.rmSync(projectRoot, {recursive: true, force: true}));
    t.after(() => fs.rmSync(coreRoot, {recursive: true, force: true}));
    writeCorePackage(coreRoot);

    const result = captureWrites(() => main([
        'setup', 'adapter', 'select',
        '--adapter=php-web',
        '--source=blank',
        '--network-approved=yes',
        '--json',
    ], {
        projectRoot,
        coreRoot,
        piExecutable: '/fixture/bin/pi',
        randomUUID: () => '13131313-1313-4313-8313-131313131313',
        run: () => { throw new Error('runner canary'); },
    }));

    assert.equal(result.status, 5);
    assert.equal(result.stderr, '');
    assert.equal(JSON.parse(result.stdout).disposition, 'INSTALL_FAILED');
    assert.deepEqual(fs.readdirSync(projectRoot), []);
});

test('maps cleanup filesystem failures to transaction failure', (t) => {
    const parentRoot = makeTempDir();
    const missingRoot = path.join(parentRoot, 'missing');
    t.after(() => fs.rmSync(parentRoot, {recursive: true, force: true}));
    const result = captureWrites(() => main([
        'setup', 'adapter', 'cleanup',
        '--attempt=14141414-1414-4414-8414-141414141414',
        '--json',
    ], {projectRoot: missingRoot}));

    assert.equal(result.status, 5);
    assert.equal(result.stdout, '');
    assert.match(result.stderr, /bootstrap adapter cleanup failed/);
});

test('maps selection filesystem failures to transaction failure', (t) => {
    const parentRoot = makeTempDir();
    const coreRoot = makeTempDir();
    const missingRoot = path.join(parentRoot, 'missing');
    t.after(() => fs.rmSync(parentRoot, {recursive: true, force: true}));
    t.after(() => fs.rmSync(coreRoot, {recursive: true, force: true}));
    writeCorePackage(coreRoot);
    const result = captureWrites(() => main([
        'setup', 'adapter', 'select',
        '--adapter=php-web',
        '--source=blank',
        '--network-approved=yes',
        '--json',
    ], {
        projectRoot: missingRoot,
        coreRoot,
        piExecutable: '/fixture/bin/pi',
    }));

    assert.equal(result.status, 5);
    assert.equal(result.stdout, '');
    assert.match(result.stderr, /bootstrap adapter selection failed/);
});

test('preserves a settings replacement introduced at the quarantine boundary', (t) => {
    const projectRoot = makeTempDir();
    const coreRoot = makeTempDir();
    const attemptId = '15151515-1515-4515-8515-151515151515';
    t.after(() => fs.rmSync(projectRoot, {recursive: true, force: true}));
    t.after(() => fs.rmSync(coreRoot, {recursive: true, force: true}));
    writeCorePackage(coreRoot);
    const provisioned = captureWrites(() => main([
        'setup', 'adapter', 'select',
        '--adapter=php-web',
        '--source=blank',
        '--network-approved=yes',
        '--json',
    ], {
        projectRoot,
        coreRoot,
        piExecutable: '/fixture/bin/pi',
        randomUUID: () => attemptId,
        run: installFixture({
            projectRoot,
            packageName: '@kyaulabs/prism-php-web',
            packageVersion: '0.3.1',
        }),
    }));
    assert.equal(provisioned.status, 0);
    const settingsPath = path.join(projectRoot, '.pi', 'settings.json');
    const renameSync = fs.renameSync;
    let replaced = false;
    fs.renameSync = (source, destination) => {
        if (!replaced && source === settingsPath) {
            replaced = true;
            fs.unlinkSync(settingsPath);
            fs.writeFileSync(settingsPath, 'user-owned\n');
        }
        return renameSync(source, destination);
    };
    t.after(() => { fs.renameSync = renameSync; });

    const result = captureWrites(() => main([
        'setup', 'adapter', 'cleanup', `--attempt=${attemptId}`, '--json',
    ], {projectRoot}));
    const report = JSON.parse(result.stdout);

    assert.equal(result.status, 5);
    assert.equal(report.disposition, 'RECOVERY_REQUIRED');
    assert.equal(
        fs.readFileSync(path.join(report.data.recoveryPath, 'settings.json'), 'utf8'),
        'user-owned\n'
    );
});

test('preserves an npm replacement introduced at failed-cleanup boundary', (t) => {
    const projectRoot = makeTempDir();
    const coreRoot = makeTempDir();
    const npmRoot = path.join(projectRoot, '.pi', 'npm');
    t.after(() => fs.rmSync(projectRoot, {recursive: true, force: true}));
    t.after(() => fs.rmSync(coreRoot, {recursive: true, force: true}));
    writeCorePackage(coreRoot);
    const install = installFixture({
        projectRoot,
        packageName: '@kyaulabs/prism-php-web',
        packageVersion: '0.3.1',
    });
    const renameSync = fs.renameSync;
    let replaced = false;
    fs.renameSync = (source, destination) => {
        if (!replaced && source === npmRoot) {
            replaced = true;
            renameSync(npmRoot, path.join(projectRoot, '.pi', 'npm-owned'));
            fs.mkdirSync(npmRoot);
            fs.writeFileSync(path.join(npmRoot, 'user.txt'), 'user-owned\n');
        }
        return renameSync(source, destination);
    };
    t.after(() => { fs.renameSync = renameSync; });

    const result = captureWrites(() => main([
        'setup', 'adapter', 'select',
        '--adapter=php-web',
        '--source=blank',
        '--network-approved=yes',
        '--json',
    ], {
        projectRoot,
        coreRoot,
        piExecutable: '/fixture/bin/pi',
        randomUUID: () => '16161616-1616-4616-8616-161616161616',
        run: (...args) => {
            install(...args);
            return {status: 1, stdout: '', stderr: '', error: undefined};
        },
    }));

    const report = JSON.parse(result.stdout);
    assert.equal(result.status, 5);
    assert.equal(report.disposition, 'RECOVERY_REQUIRED');
    assert.equal(
        fs.readFileSync(path.join(report.data.recoveryPath, 'cleanup-failed', 'npm', 'user.txt'), 'utf8'),
        'user-owned\n'
    );
});

// vim: ft=javascript sts=4 sw=4 ts=4 et :
