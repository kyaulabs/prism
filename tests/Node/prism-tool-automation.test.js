// $KYAULabs: prism-tool-automation.test.js kyau@aura.kyaulabs 2026/09/01 -0700 Exp $

'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const {main} = require('../../packages/prism-core/scripts/prism-tool/cli');
const {renderCoreAutomationProvider} = require(
    '../../packages/prism-core/scripts/prism-tool/automation-providers'
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

function makeFixture(t) {
    const projectRoot = makeTempDir();
    writeJson(path.join(projectRoot, '.pi', 'settings.json'), {
        skills: [path.join(ADAPTER_ROOT, 'skills')],
    });
    t.after(() => fs.rmSync(projectRoot, {recursive: true, force: true}));
    return {projectRoot, coreRoot: CORE_ROOT};
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

test('inspects absent Core and adapter automation as createable', (t) => {
    const fixture = makeFixture(t);

    const result = captureWrites(() => main(['automation', 'inspect', '--json'], fixture));

    assert.equal(result.status, 0, result.stderr);
    const report = JSON.parse(result.stdout);
    assert.deepEqual(Object.keys(report), [
        'schemaVersion', 'command', 'status', 'disposition', 'providers', 'checks',
    ]);
    assert.equal(report.schemaVersion, 1);
    assert.equal(report.command, 'automation inspect');
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

test('fails closed when no trusted automation adapter is active', (t) => {
    const projectRoot = makeTempDir();
    t.after(() => fs.rmSync(projectRoot, {recursive: true, force: true}));

    const result = captureWrites(() => main(['automation', 'inspect', '--json'], {
        projectRoot,
        coreRoot: CORE_ROOT,
    }));

    assert.equal(result.status, 5);
    assert.deepEqual(JSON.parse(result.stdout), {
        schemaVersion: 1,
        command: 'automation inspect',
        status: 'NO-GO',
        disposition: 'CONFLICT',
        providers: [],
        checks: [{
            id: 'automation-ownership',
            status: 'FAIL',
            message: 'automation inspection failed',
        }],
    });
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
