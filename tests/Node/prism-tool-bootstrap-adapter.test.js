// $KYAULabs: prism-tool-bootstrap-adapter.test.js kyau@aura.kyaulabs 2026/08/24 -0700 Exp $

'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const {makeTempDir, writeJson} = require('./helpers');
const {main} = require('../../packages/prism-core/scripts/prism-tool/cli');

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

function writeBootstrapAdapterPackage(packageRoot, options = {}) {
    const packageName = options.packageName ?? '@kyaulabs/prism-php-web';
    const packageVersion = options.packageVersion ?? '0.3.1';
    const bootstrapProtocol = options.bootstrapProtocol ?? 1;
    writeJson(path.join(packageRoot, 'package.json'), {
        name: packageName,
        version: packageVersion,
        prism: {
            adapter: true,
            bootstrapProtocol,
            handler: './scripts/prism-tool-adapter.js',
            toolchain: './toolchain.json',
        },
    });
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
    fs.writeFileSync(
        path.join(packageRoot, 'scripts/prism-tool-adapter.js'),
        `'use strict';\nmodule.exports = {bootstrapProtocol: ${bootstrapProtocol}, inspect() {}, resolveTool() {}};\n`
    );
}

test('reports one exact supported adapter and explicit Core-only selection', (t) => {
    const projectRoot = makeTempDir();
    const coreRoot = makeTempDir();
    t.after(() => fs.rmSync(projectRoot, {recursive: true, force: true}));
    t.after(() => fs.rmSync(coreRoot, {recursive: true, force: true}));
    writeCorePackage(coreRoot, '0.3.1');

    const result = captureWrites(() => main(
        ['setup', 'adapter', 'catalogue', '--json'],
        {projectRoot, coreRoot}
    ));
    const report = JSON.parse(result.stdout);

    assert.equal(result.status, 0);
    assert.equal(result.stderr, '');
    assert.equal(report.schemaVersion, 1);
    assert.equal(report.command, 'setup adapter catalogue');
    assert.equal(report.status, 'GO');
    assert.equal(report.disposition, 'ADAPTER_SELECTION_REQUIRED');
    assert.deepEqual(report.data.coreOnly, {
        id: 'core-only',
        displayName: 'Core only',
        adapter: null,
    });
    assert.deepEqual(report.data.adapters, [{
        id: 'php-web',
        displayName: 'PHP/web',
        packageName: '@kyaulabs/prism-php-web',
        packageVersion: '0.3.1',
        bootstrapProtocol: 1,
    }]);
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

test('rejects unsupported or ambiguous adapter catalogues', (t) => {
    const projectRoot = makeTempDir();
    const coreRoot = makeTempDir();
    t.after(() => fs.rmSync(projectRoot, {recursive: true, force: true}));
    t.after(() => fs.rmSync(coreRoot, {recursive: true, force: true}));
    writeCorePackage(coreRoot);
    const valid = {
        schemaVersion: 1,
        coreOnly: {id: 'core-only', displayName: 'Core only', adapter: null},
        adapters: [{
            id: 'php-web',
            displayName: 'PHP/web',
            packageName: '@kyaulabs/prism-php-web',
            packageVersion: '0.3.1',
            bootstrapProtocol: 1,
        }],
    };
    const cases = [
        {...valid, unknown: true},
        {...valid, schemaVersion: 2},
        {...valid, coreOnly: {id: 'core-only', displayName: 'Core only', adapter: {}}},
        {...valid, adapters: []},
        {...valid, adapters: [valid.adapters[0], {...valid.adapters[0]}]},
        {...valid, adapters: [{...valid.adapters[0], packageName: '@other/adapter'}]},
        {...valid, adapters: [{...valid.adapters[0], packageVersion: '^0.3.1'}]},
        {...valid, adapters: [{...valid.adapters[0], bootstrapProtocol: 2}]},
        {...valid, adapters: [{...valid.adapters[0], displayName: ''}]},
        {...valid, adapters: [{...valid.adapters[0], unknown: true}]},
    ];

    for (const adapterCatalogue of cases) {
        let invocations = 0;
        const result = captureWrites(() => main(
            ['setup', 'adapter', 'catalogue', '--json'],
            {
                projectRoot,
                coreRoot,
                adapterCatalogue,
                run: () => { invocations += 1; },
            }
        ));

        assert.equal(result.status, 2);
        assert.equal(result.stdout, '');
        assert.match(result.stderr, /supported adapter catalogue is invalid/);
        assert.equal(invocations, 0);
        assert.deepEqual(fs.readdirSync(projectRoot), []);
    }
});

test('resolves only a co-shipped checkout adapter or the exact pinned npm source', (t) => {
    const checkoutRoot = makeTempDir();
    const installedCoreRoot = makeTempDir();
    t.after(() => fs.rmSync(checkoutRoot, {recursive: true, force: true}));
    t.after(() => fs.rmSync(installedCoreRoot, {recursive: true, force: true}));
    const coreRoot = path.join(checkoutRoot, 'packages', 'prism-core');
    const adapterRoot = path.join(checkoutRoot, 'packages', 'prism-php-web');
    writeCorePackage(coreRoot);
    writeBootstrapAdapterPackage(adapterRoot);
    writeCorePackage(installedCoreRoot);
    const adapter = {
        id: 'php-web',
        displayName: 'PHP/web',
        packageName: '@kyaulabs/prism-php-web',
        packageVersion: '0.3.1',
        bootstrapProtocol: 1,
    };
    const {resolveBootstrapAcquisition} = require(
        '../../packages/prism-core/scripts/prism-tool/bootstrap-adapter'
    );

    assert.deepEqual(resolveBootstrapAcquisition({coreRoot, adapter}), {
        kind: 'LOCAL',
        installSource: fs.realpathSync(adapterRoot),
        packageRoot: fs.realpathSync(adapterRoot),
    });
    assert.deepEqual(resolveBootstrapAcquisition({coreRoot: installedCoreRoot, adapter}), {
        kind: 'NPM',
        installSource: 'npm:@kyaulabs/prism-php-web@0.3.1',
        packageRoot: null,
    });

    writeJson(path.join(adapterRoot, 'package.json'), {
        name: '@kyaulabs/prism-php-web',
        version: '0.3.2',
        prism: {
            adapter: true,
            bootstrapProtocol: 1,
            handler: './scripts/prism-tool-adapter.js',
            toolchain: './toolchain.json',
        },
    });
    assert.throws(
        () => resolveBootstrapAcquisition({coreRoot, adapter}),
        /co-shipped adapter is incompatible/
    );
});

function installFixture({
    projectRoot,
    packageName,
    packageVersion,
    bootstrapProtocol = 1,
    installSource = `npm:${packageName}@${packageVersion}`,
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
                    [`node_modules/${packageName}`]: {version: packageVersion},
                },
            });
            fs.writeFileSync(path.join(projectRoot, '.pi', 'npm', '.gitignore'), '*\n!.gitignore\n');
            writeBootstrapAdapterPackage(
                path.join(projectRoot, '.pi', 'npm', 'node_modules', ...packageName.split('/')),
                {packageName, packageVersion, bootstrapProtocol}
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
    assert.equal(fs.statSync(receiptPath).mode & 0o777, 0o600);
    assert.equal(JSON.parse(fs.readFileSync(receiptPath, 'utf8')).phase, 'PROVISIONED');
});

test('provisions a validated co-shipped adapter by exact local path', (t) => {
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
            installSource: fs.realpathSync(adapterRoot),
        }),
    }));
    const report = JSON.parse(result.stdout);

    assert.equal(result.status, 0);
    assert.equal(report.disposition, 'ADAPTER_PROVISIONED');
    assert.deepEqual(report.data.acquisition, {
        kind: 'LOCAL',
        installSource: fs.realpathSync(adapterRoot),
    });
    assert.deepEqual(
        JSON.parse(fs.readFileSync(path.join(projectRoot, '.pi', 'settings.json'), 'utf8')).packages,
        [fs.realpathSync(adapterRoot)]
    );
    assert.equal(fs.existsSync(path.join(projectRoot, '.pi', 'npm')), false);
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

    assert.equal(result.status, 2);
    assert.equal(result.stdout, '');
    assert.match(result.stderr, /bootstrap adapter selection failed/);
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

    assert.equal(result.status, 2);
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

    assert.equal(result.status, 2);
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

    assert.equal(result.status, 2);
    assert.equal(fs.readFileSync(path.join(projectRoot, 'KEEP.txt'), 'utf8'), 'user-owned\n');
    assert.deepEqual(fs.readdirSync(projectRoot), ['KEEP.txt']);
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

    assert.equal(result.status, 2);
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

            assert.equal(result.status, 2);
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

    assert.equal(result.status, 2);
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

    assert.equal(result.status, 2);
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

    assert.equal(result.status, 2);
    assert.equal(
        fs.readFileSync(path.join(projectRoot, '.pi', 'KEEP.txt'), 'utf8'),
        'user-owned\n'
    );
    assert.deepEqual(fs.readdirSync(path.join(projectRoot, '.pi')), ['KEEP.txt']);
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

    assert.equal(result.status, 2);
    assert.deepEqual(fs.readdirSync(projectRoot), []);
});

// vim: ft=javascript sts=4 sw=4 ts=4 et :
