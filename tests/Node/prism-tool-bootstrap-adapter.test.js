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

// vim: ft=javascript sts=4 sw=4 ts=4 et :
