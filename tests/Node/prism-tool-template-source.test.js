// $KYAULabs: prism-tool-template-source.test.js kyau@aura.kyaulabs 2026/08/24 -0700 Exp $

'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
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
    assert.equal(fixture.calls.slice(2).some(({url}) => url.includes('develop')), false);
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

test('rejects an unsafe default branch before resolving a commit', async (t) => {
    const projectRoot = makeTempDir();
    const fixture = createTemplateFixture({
        mutate(responses) {
            responses.repository.default_branch = 'main/other';
        },
    });
    t.after(() => fs.rmSync(projectRoot, {recursive: true, force: true}));

    const result = await source(
        projectRoot,
        fixture.fetch,
        '--source=template',
        '--network-approved=yes'
    );

    assert.equal(result.status, 5);
    assert.equal(result.stderr, '');
    const report = JSON.parse(result.stdout);
    assert.equal(report.status, 'NO-GO');
    assert.equal(report.disposition, 'SOURCE_UNAVAILABLE');
    assert.equal(report.source, 'TEMPLATE');
    assert.equal(report.reason, 'DEFAULT_BRANCH_INVALID');
    assert.equal(report.data, null);
    assert.equal(fixture.calls.length, 1);
    assert.deepEqual(fs.readdirSync(projectRoot), []);
});

test('fails closed for rejected, malformed, oversized, and unavailable responses', async (t) => {
    const cases = [
        ['redirect', {responseIndex: 0, status: 302, redirected: true}, 'RESPONSE_REJECTED'],
        ['authentication', {responseIndex: 0, status: 401}, 'RESPONSE_REJECTED'],
        ['rate limit', {responseIndex: 0, status: 429}, 'RESPONSE_REJECTED'],
        ['malformed JSON', {responseIndex: 0, rawBody: Buffer.from('{')}, 'RESPONSE_INVALID'],
        ['invalid UTF-8', {responseIndex: 0, rawBody: Buffer.from([0xc3, 0x28])}, 'RESPONSE_INVALID'],
        ['oversized metadata', {responseIndex: 0, rawBody: Buffer.alloc(65537, 0x20)}, 'RESPONSE_TOO_LARGE'],
        ['network failure', {rejectIndex: 0}, 'NETWORK_FAILED'],
    ];

    for (const [name, transport, expectedReason] of cases) {
        await t.test(name, async (t) => {
            const projectRoot = makeTempDir();
            const fixture = createTemplateFixture({transport});
            t.after(() => fs.rmSync(projectRoot, {recursive: true, force: true}));

            const result = await source(
                projectRoot,
                fixture.fetch,
                '--source=template',
                '--network-approved=yes'
            );

            assert.equal(result.status, 5);
            assert.equal(result.stderr, '');
            const report = JSON.parse(result.stdout);
            assert.equal(report.status, 'NO-GO');
            assert.equal(report.disposition, 'SOURCE_UNAVAILABLE');
            assert.equal(report.source, 'TEMPLATE');
            assert.equal(report.reason, expectedReason);
            assert.equal(report.data, null);
            assert.equal(fixture.calls.length, 1);
            assert.deepEqual(fs.readdirSync(projectRoot), []);
        });
    }
});

test('rejects invalid source identity, default branches, and immutable commit evidence', async (t) => {
    const cases = [
        ['wrong repository', (responses) => { responses.repository.full_name = 'other/template'; }, 'SOURCE_IDENTITY_INVALID', 1],
        ['private repository', (responses) => { responses.repository.private = true; }, 'SOURCE_IDENTITY_INVALID', 1],
        ['private visibility', (responses) => { responses.repository.visibility = 'private'; }, 'SOURCE_IDENTITY_INVALID', 1],
        ['hidden branch', (responses) => { responses.repository.default_branch = '.hidden'; }, 'DEFAULT_BRANCH_INVALID', 1],
        ['double-dot branch', (responses) => { responses.repository.default_branch = 'bad..name'; }, 'DEFAULT_BRANCH_INVALID', 1],
        ['lock branch', (responses) => { responses.repository.default_branch = 'name.lock'; }, 'DEFAULT_BRANCH_INVALID', 1],
        ['trailing-dot branch', (responses) => { responses.repository.default_branch = 'name.'; }, 'DEFAULT_BRANCH_INVALID', 1],
        ['control branch', (responses) => { responses.repository.default_branch = 'bad\nname'; }, 'DEFAULT_BRANCH_INVALID', 1],
        ['long branch', (responses) => { responses.repository.default_branch = `a${'b'.repeat(128)}`; }, 'DEFAULT_BRANCH_INVALID', 1],
        ['malformed commit', (responses) => { responses.commit.sha = 'bad'; }, 'COMMIT_INVALID', 2],
        ['uppercase commit', (responses) => { responses.commit.sha = 'B'.repeat(40); }, 'COMMIT_INVALID', 2],
        ['missing tree', (responses) => { delete responses.commit.commit.tree.sha; }, 'COMMIT_INVALID', 2],
        ['uppercase tree', (responses) => { responses.commit.commit.tree.sha = 'A'.repeat(40); }, 'COMMIT_INVALID', 2],
    ];

    for (const [name, mutate, expectedReason, expectedCalls] of cases) {
        await t.test(name, async (t) => {
            const projectRoot = makeTempDir();
            const fixture = createTemplateFixture({mutate});
            t.after(() => fs.rmSync(projectRoot, {recursive: true, force: true}));

            const result = await source(
                projectRoot,
                fixture.fetch,
                '--source=template',
                '--network-approved=yes'
            );

            assert.equal(result.status, 5);
            const report = JSON.parse(result.stdout);
            assert.equal(report.reason, expectedReason);
            assert.equal(report.data, null);
            assert.equal(fixture.calls.length, expectedCalls);
            assert.deepEqual(fs.readdirSync(projectRoot), []);
        });
    }
});

test('stops before network access when the root is established', async (t) => {
    const projectRoot = makeTempDir();
    const fixture = createTemplateFixture();
    const readme = path.join(projectRoot, 'README.md');
    t.after(() => fs.rmSync(projectRoot, {recursive: true, force: true}));
    fs.writeFileSync(readme, '# existing\n');

    const result = await source(
        projectRoot,
        fixture.fetch,
        '--source=template',
        '--network-approved=yes'
    );

    assert.equal(result.status, 5);
    const report = JSON.parse(result.stdout);
    assert.equal(report.status, 'NO-GO');
    assert.equal(report.disposition, 'STOP');
    assert.equal(report.source, 'TEMPLATE');
    assert.equal(report.data, null);
    assert.equal(fixture.calls.length, 0);
    assert.equal(fs.readFileSync(readme, 'utf8'), '# existing\n');
});

// vim: ft=javascript sts=4 sw=4 ts=4 et :
