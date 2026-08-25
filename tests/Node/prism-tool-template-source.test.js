// $KYAULabs: prism-tool-template-source.test.js kyau@aura.kyaulabs 2026/08/25 -0700 Exp $

'use strict';

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const {makeTempDir} = require('./helpers');
const {createTemplateFixture} = require('./fixtures/template-source');
const {main} = require('../../packages/prism-core/scripts/prism-tool/cli');
const {inspectTemplateSource} = require('../../packages/prism-core/scripts/prism-tool/template-source');

const ATTEMPT_ID = '12345678-1234-4123-8123-123456789abc';
const CORE_ROOT = path.resolve(__dirname, '../../packages/prism-core');
const ADAPTER_ROOT = path.resolve(__dirname, '../../packages/prism-php-web');

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

test('resolves Template catalogue after exact adapter provisioning', async (t) => {
    const projectRoot = makeTempDir();
    const fixture = createTemplateFixture();
    t.after(() => fs.rmSync(projectRoot, {recursive: true, force: true}));
    const provisioned = await captureWrites(() => main([
        'setup', 'adapter', 'select', '--adapter=php-web', '--source=template',
        '--network-approved=yes', '--json',
    ], {
        projectRoot,
        coreRoot: CORE_ROOT,
        piExecutable: '/usr/bin/pi',
        randomUUID: () => ATTEMPT_ID,
        run() {
            fs.mkdirSync(path.join(projectRoot, '.pi'), {recursive: true});
            fs.writeFileSync(
                path.join(projectRoot, '.pi', 'settings.json'),
                `${JSON.stringify({packages: [ADAPTER_ROOT]}, null, 2)}\n`
            );
            return {status: 0, stdout: '', stderr: '', error: undefined};
        },
    }));
    assert.equal(provisioned.status, 0, provisioned.stderr);

    const result = await source(
        projectRoot,
        fixture.fetch,
        '--source=template',
        '--adapter=@kyaulabs/prism-php-web',
        `--attempt=${ATTEMPT_ID}`,
        '--network-approved=yes'
    );

    assert.equal(result.status, 0, result.stderr);
    const report = JSON.parse(result.stdout);
    assert.equal(report.disposition, 'SOURCE_READY');
    assert.equal(report.source, 'TEMPLATE');
    assert.equal(report.adapter.packageName, '@kyaulabs/prism-php-web');
    assert.equal(report.data.catalogue.schemaVersion, 1);
    assert.deepEqual(fixture.calls.map(({url}) => url), fixture.urls);
});

test('returns Blank source evidence after exact adapter provisioning without fetching', async (t) => {
    const projectRoot = makeTempDir();
    let fetches = 0;
    t.after(() => fs.rmSync(projectRoot, {recursive: true, force: true}));
    const provisioned = await captureWrites(() => main([
        'setup', 'adapter', 'select', '--adapter=php-web', '--source=blank',
        '--network-approved=yes', '--json',
    ], {
        projectRoot,
        coreRoot: CORE_ROOT,
        piExecutable: '/usr/bin/pi',
        randomUUID: () => ATTEMPT_ID,
        run() {
            fs.mkdirSync(path.join(projectRoot, '.pi'), {recursive: true});
            fs.writeFileSync(
                path.join(projectRoot, '.pi', 'settings.json'),
                `${JSON.stringify({packages: [ADAPTER_ROOT]}, null, 2)}\n`
            );
            return {status: 0, stdout: '', stderr: '', error: undefined};
        },
    }));
    assert.equal(provisioned.status, 0, provisioned.stderr);

    const result = await source(projectRoot, async () => {
        fetches += 1;
        throw new Error('Blank must not fetch');
    }, '--source=blank', '--adapter=@kyaulabs/prism-php-web', `--attempt=${ATTEMPT_ID}`);

    assert.equal(result.status, 0, result.stderr);
    const report = JSON.parse(result.stdout);
    assert.equal(report.disposition, 'SOURCE_READY');
    assert.equal(report.source, 'BLANK');
    assert.equal(report.adapter.packageName, '@kyaulabs/prism-php-web');
    assert.equal(report.data.catalogue, null);
    assert.equal(fetches, 0);
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

test('rejects a truncated recursive tree with a closed reason', async (t) => {
    const projectRoot = makeTempDir();
    const fixture = createTemplateFixture({
        mutate(responses) {
            responses.tree.truncated = true;
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
    const report = JSON.parse(result.stdout);
    assert.equal(report.reason, 'TREE_TRUNCATED');
    assert.equal(report.data, null);
    assert.equal(fixture.calls.length, 3);
    assert.deepEqual(fs.readdirSync(projectRoot), []);
});

test('rejects hostile tree paths, modes, sizes, and topology', async (t) => {
    const cases = [
        ['tree SHA mismatch', (tree) => { tree.sha = '9999999999999999999999999999999999999999'; }, 'TREE_INVALID'],
        ['entry count', (tree) => {
            for (let index = 0; index < 1025; index += 1) {
                tree.tree.push({
                    path: `extra-${index}`,
                    mode: '100644',
                    type: 'blob',
                    sha: '8888888888888888888888888888888888888888',
                    size: 1,
                });
            }
        }, 'TREE_TOO_LARGE'],
        ['individual blob size', (tree) => { tree.tree.find(({path}) => path === 'README.md').size = 4194305; }, 'TREE_TOO_LARGE'],
        ['aggregate blob size', (tree) => {
            for (let index = 0; index < 17; index += 1) {
                tree.tree.push({
                    path: `large-${index}`,
                    mode: '100644',
                    type: 'blob',
                    sha: '8888888888888888888888888888888888888888',
                    size: 4194304,
                });
            }
        }, 'TREE_TOO_LARGE'],
        ['long path', (tree) => { tree.tree.find(({path}) => path === 'README.md').path = 'a'.repeat(4097); }, 'PATH_INVALID'],
        ['absolute path', (tree) => { tree.tree.find(({path}) => path === 'README.md').path = '/README.md'; }, 'PATH_INVALID'],
        ['empty segment', (tree) => { tree.tree.find(({path}) => path === 'README.md').path = 'a//b'; }, 'PATH_INVALID'],
        ['dot segment', (tree) => { tree.tree.find(({path}) => path === 'README.md').path = 'a/./b'; }, 'PATH_INVALID'],
        ['traversal', (tree) => { tree.tree.find(({path}) => path === 'README.md').path = '../README.md'; }, 'PATH_INVALID'],
        ['backslash', (tree) => { tree.tree.find(({path}) => path === 'README.md').path = 'a\\b'; }, 'PATH_INVALID'],
        ['control character', (tree) => { tree.tree.find(({path}) => path === 'README.md').path = 'bad\nname'; }, 'PATH_INVALID'],
        ['non-NFC path', (tree) => { tree.tree.find(({path}) => path === 'README.md').path = 'e\u0301.txt'; }, 'PATH_INVALID'],
        ['ill-formed Unicode', (tree) => { tree.tree.find(({path}) => path === 'README.md').path = '\ud800.txt'; }, 'PATH_INVALID'],
        ['duplicate path', (tree) => { tree.tree.push({...tree.tree.find(({path}) => path === 'README.md')}); }, 'PATH_INVALID'],
        ['missing parent', (tree) => { tree.tree.find(({path}) => path === 'README.md').path = 'missing/README.md'; }, 'PATH_INVALID'],
        ['blob prefix', (tree) => { tree.tree.push({path: 'README.md/child', mode: '100644', type: 'blob', sha: '8888888888888888888888888888888888888888', size: 1}); }, 'PATH_INVALID'],
        ['Git collision', (tree) => { tree.tree.find(({path}) => path === 'README.md').path = '.git/config'; }, 'PATH_INVALID'],
        ['operational collision', (tree) => { tree.tree.find(({path}) => path === 'README.md').path = '.pi/prism-tool/work'; }, 'PATH_INVALID'],
        ['symlink', (tree) => { Object.assign(tree.tree.find(({path}) => path === 'README.md'), {mode: '120000', type: 'blob'}); }, 'MODE_INVALID'],
        ['submodule', (tree) => { Object.assign(tree.tree.find(({path}) => path === 'README.md'), {mode: '160000', type: 'commit'}); }, 'MODE_INVALID'],
        ['executable blob', (tree) => { tree.tree.find(({path}) => path === 'README.md').mode = '100755'; }, 'MODE_INVALID'],
        ['unknown mode', (tree) => { tree.tree.find(({path}) => path === 'README.md').mode = '100600'; }, 'MODE_INVALID'],
        ['tree type mismatch', (tree) => { tree.tree.find(({path}) => path === '.github').type = 'blob'; }, 'MODE_INVALID'],
        ['blob type mismatch', (tree) => { tree.tree.find(({path}) => path === 'README.md').type = 'tree'; }, 'MODE_INVALID'],
        ['missing manifest', (tree) => { tree.tree = tree.tree.filter(({path}) => path !== '.prism/template-manifest.json'); }, 'TREE_INVALID'],
        ['duplicate manifest', (tree) => { tree.tree.push({...tree.tree.find(({path}) => path === '.prism/template-manifest.json')}); }, 'PATH_INVALID'],
        ['oversized manifest', (tree) => { tree.tree.find(({path}) => path === '.prism/template-manifest.json').size = 262145; }, 'MANIFEST_BLOB_TOO_LARGE'],
    ];

    for (const [name, mutateTree, expectedReason] of cases) {
        await t.test(name, async (t) => {
            const projectRoot = makeTempDir();
            const fixture = createTemplateFixture({
                mutate(responses) {
                    mutateTree(responses.tree);
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
            const report = JSON.parse(result.stdout);
            assert.equal(report.reason, expectedReason);
            assert.equal(report.data, null);
            assert.equal(fixture.calls.length, 3);
            assert.deepEqual(fs.readdirSync(projectRoot), []);
        });
    }
});

test('rejects non-canonical manifest blob base64', async (t) => {
    const projectRoot = makeTempDir();
    const fixture = createTemplateFixture({
        mutate(responses) {
            responses.manifestBlob.content += '!';
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
    const report = JSON.parse(result.stdout);
    assert.equal(report.reason, 'MANIFEST_BLOB_INVALID');
    assert.equal(report.data, null);
    assert.equal(fixture.calls.length, 4);
    assert.deepEqual(fs.readdirSync(projectRoot), []);
});

test('rejects substituted and malformed manifest blob responses', async (t) => {
    const cases = [
        ['SHA mismatch', {mutate(responses) { responses.manifestBlob.sha = '9999999999999999999999999999999999999999'; }}, 'MANIFEST_BLOB_INVALID'],
        ['size mismatch', {mutate(responses) { responses.manifestBlob.size += 1; }}, 'MANIFEST_BLOB_INVALID'],
        ['encoding mismatch', {mutate(responses) { responses.manifestBlob.encoding = 'utf-8'; }}, 'MANIFEST_BLOB_INVALID'],
        ['malformed base64', {mutate(responses) { responses.manifestBlob.content = '@@@@'; }}, 'MANIFEST_BLOB_INVALID'],
        ['decoded size mismatch', {mutate(responses) { responses.manifestBlob.content = Buffer.from('x').toString('base64'); }}, 'MANIFEST_BLOB_INVALID'],
        ['Git blob mismatch', {mutate(responses) { responses.manifestBlob.content = Buffer.alloc(responses.manifestBlob.size, 0x78).toString('base64'); }}, 'MANIFEST_BLOB_INVALID'],
        ['oversized response', {transport: {responseIndex: 3, rawBody: Buffer.alloc(524289, 0x20)}}, 'RESPONSE_TOO_LARGE'],
    ];

    for (const [name, fixtureOptions, expectedReason] of cases) {
        await t.test(name, async (t) => {
            const projectRoot = makeTempDir();
            const fixture = createTemplateFixture(fixtureOptions);
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
            assert.equal(fixture.calls.length, 4);
            assert.deepEqual(fs.readdirSync(projectRoot), []);
        });
    }
});

test('rejects unknown manifest policy fields', async (t) => {
    const projectRoot = makeTempDir();
    const fixture = createTemplateFixture({
        mutateManifest(manifest) {
            manifest.default = 'licensing';
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
    const report = JSON.parse(result.stdout);
    assert.equal(report.reason, 'MANIFEST_INVALID');
    assert.equal(report.data, null);
    assert.equal(fixture.calls.length, 4);
    assert.deepEqual(fs.readdirSync(projectRoot), []);
});

test('rejects malformed, incomplete, and policy-bearing capability manifests', async (t) => {
    const prohibitedFields = [
        'copy', 'script', 'command', 'package', 'url', 'renderer',
        'outputPath', 'metadata', 'default', 'mode',
    ];
    const cases = [
        ['malformed JSON', {transformManifestBytes() { return Buffer.from('{'); }}, 'MANIFEST_INVALID'],
        ['invalid UTF-8', {transformManifestBytes() { return Buffer.from([0xc3, 0x28]); }}, 'MANIFEST_INVALID'],
        ['array root', {transformManifestBytes() { return Buffer.from('[]'); }}, 'MANIFEST_INVALID'],
        ['null root', {transformManifestBytes() { return Buffer.from('null'); }}, 'MANIFEST_INVALID'],
        ['missing top-level field', {mutateManifest(manifest) { delete manifest.templateId; }}, 'MANIFEST_INVALID'],
        ['unsupported schema', {mutateManifest(manifest) { manifest.schemaVersion = 2; }}, 'MANIFEST_SCHEMA_UNSUPPORTED'],
        ['unsupported protocol', {mutateManifest(manifest) { manifest.bootstrapProtocol = 2; }}, 'MANIFEST_SCHEMA_UNSUPPORTED'],
        ['wrong template identity', {mutateManifest(manifest) { manifest.templateId = 'other/template'; }}, 'MANIFEST_INVALID'],
        ['non-array entries', {mutateManifest(manifest) { manifest.entries = {}; }}, 'MANIFEST_INVALID'],
        ['missing tree classification', {mutateManifest(manifest) { manifest.entries.pop(); }}, 'MANIFEST_TREE_MISMATCH'],
        ['duplicate classification', {mutateManifest(manifest) { manifest.entries.push({...manifest.entries[0]}); }}, 'MANIFEST_TREE_MISMATCH'],
        ['extra classification', {mutateManifest(manifest) { manifest.entries.push({...manifest.entries[0], path: 'extra'}); }}, 'MANIFEST_TREE_MISMATCH'],
        ['path mismatch', {mutateManifest(manifest) { manifest.entries[0].path = 'OTHER.md'; }}, 'MANIFEST_TREE_MISMATCH'],
        ['SHA mismatch', {mutateManifest(manifest) { manifest.entries[0].blobSha = '9999999999999999999999999999999999999999'; }}, 'MANIFEST_TREE_MISMATCH'],
        ['size mismatch', {mutateManifest(manifest) { manifest.entries[0].size += 1; }}, 'MANIFEST_TREE_MISMATCH'],
        ['unknown entry field', {mutateManifest(manifest) { manifest.entries[0].extra = true; }}, 'MANIFEST_INVALID'],
        ['unknown class', {mutateManifest(manifest) { manifest.entries[0].class = 'unknown'; }}, 'CAPABILITY_UNSUPPORTED'],
        ['unknown capability', {mutateManifest(manifest) { manifest.entries[0].capability = 'unknown'; }}, 'CAPABILITY_UNSUPPORTED'],
        ['inherited capability name', {mutateManifest(manifest) { manifest.entries[0].capability = 'toString'; }}, 'CAPABILITY_UNSUPPORTED'],
        ['unknown provider scope', {mutateManifest(manifest) { manifest.entries[0].provider.scope = 'remote'; }}, 'CAPABILITY_UNSUPPORTED'],
        ['unknown provider ID', {mutateManifest(manifest) { manifest.entries[0].provider.id = 'unknown'; }}, 'CAPABILITY_UNSUPPORTED'],
        ['unknown disposition', {mutateManifest(manifest) { manifest.entries[0].disposition = 'copy'; }}, 'CAPABILITY_UNSUPPORTED'],
        ['Core capability with adapter provider', {mutateManifest(manifest) { manifest.entries[0].provider.scope = 'adapter'; }}, 'CAPABILITY_UNSUPPORTED'],
        ['adapter capability with Core provider', {mutateManifest(manifest) { manifest.entries[1].provider.scope = 'core'; }}, 'CAPABILITY_UNSUPPORTED'],
        ['optional capability with adapter provider', {mutateManifest(manifest) { manifest.entries[2].provider.scope = 'adapter'; }}, 'CAPABILITY_UNSUPPORTED'],
        ['maintenance provider', {mutateManifest(manifest) { manifest.entries[3].provider = {scope: 'core', id: 'template-maintenance'}; }}, 'CAPABILITY_UNSUPPORTED'],
        ['maintenance render', {mutateManifest(manifest) { manifest.entries[3].disposition = 'render'; }}, 'CAPABILITY_UNSUPPORTED'],
        ['render without provider', {mutateManifest(manifest) { manifest.entries[0].provider = null; }}, 'CAPABILITY_UNSUPPORTED'],
        ['render excluded', {mutateManifest(manifest) { manifest.entries[0].disposition = 'exclude'; }}, 'CAPABILITY_UNSUPPORTED'],
        ...prohibitedFields.map((field) => [
            `prohibited ${field}`,
            {mutateManifest(manifest) { manifest.entries[0][field] = 'attacker-controlled'; }},
            'MANIFEST_INVALID',
        ]),
    ];

    for (const [name, fixtureOptions, expectedReason] of cases) {
        await t.test(name, async (t) => {
            const projectRoot = makeTempDir();
            const fixture = createTemplateFixture(fixtureOptions);
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
            assert.equal(fixture.calls.length, 4);
            assert.deepEqual(fs.readdirSync(projectRoot), []);
        });
    }
});

test('normalizes catalogue ordering without exposing remote response content', async (t) => {
    const firstRoot = makeTempDir();
    const secondRoot = makeTempDir();
    const canary = 'REMOTE-CANARY-DO-NOT-MATERIALIZE';
    const first = createTemplateFixture({
        mutate(responses) {
            responses.repository.remote_content = canary;
            responses.tree.tree[0].remote_content = canary;
        },
    });
    const second = createTemplateFixture({
        mutateManifest(manifest) {
            manifest.entries.reverse();
        },
    });
    t.after(() => fs.rmSync(firstRoot, {recursive: true, force: true}));
    t.after(() => fs.rmSync(secondRoot, {recursive: true, force: true}));

    const firstResult = await source(
        firstRoot,
        first.fetch,
        '--source=template',
        '--network-approved=yes'
    );
    const secondResult = await source(
        secondRoot,
        second.fetch,
        '--source=template',
        '--network-approved=yes'
    );

    assert.equal(firstResult.status, 0);
    assert.equal(secondResult.status, 0);
    const firstReport = JSON.parse(firstResult.stdout);
    const secondReport = JSON.parse(secondResult.stdout);
    assert.equal(
        firstReport.data.attestation.classificationSha256,
        secondReport.data.attestation.classificationSha256
    );
    assert.deepEqual(firstReport.data.catalogue, secondReport.data.catalogue);
    assert.equal(firstResult.stdout.includes(canary), false);
    assert.deepEqual(fs.readdirSync(firstRoot), []);
    assert.deepEqual(fs.readdirSync(secondRoot), []);
});

test('normalizes immutable Template reports for trusted provider composition', async (t) => {
    const projectRoot = makeTempDir();
    const fixture = createTemplateFixture();
    t.after(() => fs.rmSync(projectRoot, {recursive: true, force: true}));
    const report = await inspectTemplateSource({
        projectRoot,
        source: 'TEMPLATE',
        fetchImpl: fixture.fetch,
    });
    const {normalizeTemplateBootstrapSource} = require(
        '../../packages/prism-core/scripts/prism-tool/bootstrap-source'
    );

    const normalized = normalizeTemplateBootstrapSource({
        report,
        capabilities: [],
        adapter: {
            id: 'php-web',
            packageName: '@kyaulabs/prism-php-web',
            packageVersion: '0.3.1',
            bootstrapProtocol: 1,
        },
    });

    assert.deepEqual(Object.keys(normalized), ['schemaVersion', 'source', 'catalogue']);
    assert.equal(normalized.schemaVersion, 1);
    assert.equal(normalized.source.mode, 'TEMPLATE');
    assert.deepEqual(normalized.source.evidence, report.data.attestation);
    assert.deepEqual(normalized.catalogue, report.data.catalogue);
    assert.match(normalized.source.evidence.classificationSha256, /^[0-9a-f]{64}$/);
    assert.equal(Object.isFrozen(normalized), true);
    assert.equal(Object.isFrozen(normalized.source), true);
    assert.equal(Object.isFrozen(normalized.source.evidence), true);
    assert.equal(JSON.stringify(normalized).includes('api.github.com'), false);
    assert.equal(JSON.stringify(normalized).includes('network-approved'), false);
    assert.deepEqual(fs.readdirSync(projectRoot), []);
});

test('rejects malformed local adapter selections before using Template advertisements', async (t) => {
    const projectRoot = makeTempDir();
    const fixture = createTemplateFixture();
    t.after(() => fs.rmSync(projectRoot, {recursive: true, force: true}));
    const report = await inspectTemplateSource({
        projectRoot,
        source: 'TEMPLATE',
        fetchImpl: fixture.fetch,
    });
    const {normalizeTemplateBootstrapSource} = require(
        '../../packages/prism-core/scripts/prism-tool/bootstrap-source'
    );

    assert.throws(() => normalizeTemplateBootstrapSource({
        report,
        capabilities: [],
        adapter: {},
    }), /adapter selection/);
});

test('rejects substituted Template source report checks', async (t) => {
    const projectRoot = makeTempDir();
    const fixture = createTemplateFixture();
    t.after(() => fs.rmSync(projectRoot, {recursive: true, force: true}));
    const report = await inspectTemplateSource({
        projectRoot,
        source: 'TEMPLATE',
        fetchImpl: fixture.fetch,
    });
    report.checks[0].status = 'UNKNOWN';
    const {normalizeTemplateBootstrapSource} = require(
        '../../packages/prism-core/scripts/prism-tool/bootstrap-source'
    );

    assert.throws(() => normalizeTemplateBootstrapSource({
        report,
        capabilities: [],
        adapter: null,
    }), /source report/);
});

test('acquires fixed Template evidence for a launcher-validated bootstrap attempt', async (t) => {
    const projectRoot = makeTempDir();
    const fixture = createTemplateFixture();
    fs.mkdirSync(path.join(projectRoot, '.pi'));
    t.after(() => fs.rmSync(projectRoot, {recursive: true, force: true}));
    const {acquireTemplateSource} = require(
        '../../packages/prism-core/scripts/prism-tool/template-source'
    );

    const report = await acquireTemplateSource({
        projectRoot: fs.realpathSync(projectRoot),
        fetchImpl: fixture.fetch,
    });

    assert.equal(report.status, 'GO');
    assert.equal(report.source, 'TEMPLATE');
    assert.equal(report.data.attestation.commitSha, fixture.commitSha);
    assert.deepEqual(fixture.calls.map(({url}) => url), fixture.urls);
    assert.deepEqual(fs.readdirSync(projectRoot), ['.pi']);
});

test('rejects reordered stored Template catalogues even with a matching digest', async (t) => {
    const projectRoot = makeTempDir();
    const fixture = createTemplateFixture();
    t.after(() => fs.rmSync(projectRoot, {recursive: true, force: true}));
    const report = await inspectTemplateSource({
        projectRoot,
        source: 'TEMPLATE',
        fetchImpl: fixture.fetch,
    });
    report.data.catalogue.entries.reverse();
    report.data.attestation.classificationSha256 = crypto.createHash('sha256')
        .update(JSON.stringify(report.data.catalogue))
        .digest('hex');
    const {normalizeTemplateBootstrapSource} = require(
        '../../packages/prism-core/scripts/prism-tool/bootstrap-source'
    );

    assert.throws(() => normalizeTemplateBootstrapSource({
        report,
        capabilities: [],
        adapter: null,
    }), /catalogue/);
});

test('canonicalizes catalogue ordering independently of locale collation', async (t) => {
    const firstRoot = makeTempDir();
    const secondRoot = makeTempDir();
    const first = createTemplateFixture();
    const second = createTemplateFixture();
    const localeCompare = String.prototype.localeCompare;
    t.after(() => fs.rmSync(firstRoot, {recursive: true, force: true}));
    t.after(() => fs.rmSync(secondRoot, {recursive: true, force: true}));

    const firstResult = await source(
        firstRoot,
        first.fetch,
        '--source=template',
        '--network-approved=yes'
    );
    let secondResult;
    String.prototype.localeCompare = function reverseLocaleCompare(other) {
        return localeCompare.call(other, this);
    };
    try {
        secondResult = await source(
            secondRoot,
            second.fetch,
            '--source=template',
            '--network-approved=yes'
        );
    } finally {
        String.prototype.localeCompare = localeCompare;
    }

    assert.equal(firstResult.status, 0);
    assert.equal(secondResult.status, 0);
    const firstReport = JSON.parse(firstResult.stdout);
    const secondReport = JSON.parse(secondResult.stdout);
    assert.equal(
        firstReport.data.attestation.classificationSha256,
        secondReport.data.attestation.classificationSha256
    );
    assert.deepEqual(firstReport.data.catalogue, secondReport.data.catalogue);
});

// vim: ft=javascript sts=4 sw=4 ts=4 et :
