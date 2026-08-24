// $KYAULabs: prism-tool-template-source.test.js kyau@aura.kyaulabs 2026/08/24 -0700 Exp $

'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const test = require('node:test');
const {makeTempDir} = require('./helpers');
const {createTemplateFixture} = require('./fixtures/template-source');
const {main} = require('../../packages/prism-core/scripts/prism-tool/cli');

async function captureWrites(action) {
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
        return {status: await action(), stdout, stderr};
    } finally {
        process.stdout.write = stdoutWrite;
        process.stderr.write = stderrWrite;
    }
}

function source(projectRoot, fetchImpl, ...controls) {
    return captureWrites(() => main(
        ['setup', 'source', '--json', ...controls],
        {projectRoot, fetch: fetchImpl}
    ));
}

test('resolves Template to immutable source evidence through fixed public URLs', async (t) => {
    const projectRoot = makeTempDir();
    const fixture = createTemplateFixture();
    t.after(() => fs.rmSync(projectRoot, {recursive: true, force: true}));

    const result = await source(
        projectRoot,
        fixture.fetch,
        '--source=template',
        '--network-approved=yes'
    );
    assert.equal(result.status, 0);
    assert.equal(result.stderr, '');
    const report = JSON.parse(result.stdout);
    assert.equal(report.schemaVersion, 1);
    assert.equal(report.command, 'setup source');
    assert.equal(report.status, 'GO');
    assert.equal(report.disposition, 'SOURCE_READY');
    assert.equal(report.source, 'TEMPLATE');
    assert.equal(report.reason, 'TEMPLATE_VALID');
    assert.equal(report.projectRoot, fs.realpathSync(projectRoot));
    assert.equal(report.data.attestation.templateId, 'kyaulabs/template');
    assert.equal(report.data.attestation.defaultBranch, 'develop');
    assert.equal(report.data.attestation.commitSha, fixture.commitSha);
    assert.equal(report.data.attestation.treeSha, fixture.treeSha);
    assert.equal(report.data.attestation.manifest.path, '.prism/template-manifest.json');
    assert.equal(report.data.catalogue.schemaVersion, 1);
    assert.equal(report.data.catalogue.bootstrapProtocol, 1);
    assert.deepEqual(fixture.calls.map(({url}) => url), fixture.urls);
    assert.equal(fixture.calls.every(({options}) => options.method === 'GET'), true);
    assert.equal(fixture.calls.every(({options}) => options.redirect === 'manual'), true);
    assert.equal(fixture.calls.every(({options}) => options.credentials === 'omit'), true);
    assert.equal(
        fixture.calls.every(({options}) => !Object.keys(options.headers)
            .some((name) => /authorization|cookie/i.test(name))),
        true
    );
    assert.deepEqual(fs.readdirSync(projectRoot), []);
});

test('returns Blank source evidence without a template network call', async (t) => {
    const projectRoot = makeTempDir();
    let calls = 0;
    t.after(() => fs.rmSync(projectRoot, {recursive: true, force: true}));

    const result = await source(projectRoot, async () => {
        calls += 1;
        throw new Error('Blank must not fetch');
    }, '--source=blank');

    assert.equal(result.status, 0);
    assert.equal(result.stderr, '');
    const report = JSON.parse(result.stdout);
    assert.equal(report.status, 'GO');
    assert.equal(report.disposition, 'SOURCE_READY');
    assert.equal(report.source, 'BLANK');
    assert.equal(report.reason, 'BLANK_SELECTED');
    assert.equal(report.data.attestation.source, 'BLANK');
    assert.equal(report.data.attestation.template, null);
    assert.equal(report.data.catalogue, null);
    assert.equal(calls, 0);
    assert.deepEqual(fs.readdirSync(projectRoot), []);
});

test('rejects caller-selected source authority and invalid network controls', async (t) => {
    const projectRoot = makeTempDir();
    t.after(() => fs.rmSync(projectRoot, {recursive: true, force: true}));

    for (const controls of [
        ['--source=template'],
        ['--source=blank', '--network-approved=yes'],
        ['--source=other', '--network-approved=yes'],
        ['--source=template', '--repository=other/repository', '--network-approved=yes'],
        ['--source=template', '--branch=main', '--network-approved=yes'],
        ['--source=template', '--url=https://example.invalid', '--network-approved=yes'],
    ]) {
        const result = await source(projectRoot, async () => {
            throw new Error('invalid controls must not fetch');
        }, ...controls);

        assert.equal(result.status, 2);
        assert.equal(result.stdout, '');
        assert.match(result.stderr, /usage: prism-tool setup source/);
    }
});

// vim: ft=javascript sts=4 sw=4 ts=4 et :
