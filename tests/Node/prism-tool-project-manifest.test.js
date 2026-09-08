// $KYAULabs: prism-tool-project-manifest.test.js kyau@aura.kyaulabs 2026/09/06 -0700 Exp $

'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const {
    readProjectManifest,
    renderProjectManifest,
    validateProjectManifest,
} = require('../../packages/prism-core/scripts/prism-tool/project-manifest');
const {makeTempDir} = require('./helpers');

const CORE_ROOT = path.resolve(__dirname, '../../packages/prism-core');
const CORE_VERSION = require('../../packages/prism-core/package.json').version;
const metadata = Object.freeze({
    schemaVersion: 1,
    displayName: 'Core Project',
    summary: 'A Core-only established project.',
    suggestedDisplayName: 'fixture',
});

function manifestFixture(t, mode = 0o644) {
    const projectRoot = makeTempDir();
    t.after(() => fs.rmSync(projectRoot, {recursive: true, force: true}));
    fs.mkdirSync(path.join(projectRoot, '.prism'));
    const contents = renderProjectManifest({
        schemaVersion: 2,
        source: {mode: 'ESTABLISHED', evidence: null},
        capabilities: [],
        metadata,
        coreVersion: CORE_VERSION,
        adapter: null,
    });
    const manifestPath = path.join(projectRoot, '.prism', 'project.json');
    fs.writeFileSync(manifestPath, contents, {mode});
    fs.chmodSync(manifestPath, mode);
    return {projectRoot, manifestPath, contents};
}

test('renders and reads a closed established Core-only manifest', (t) => {
    const {projectRoot, contents} = manifestFixture(t);

    const result = readProjectManifest({projectRoot, coreRoot: CORE_ROOT});

    assert.equal(result.value.schemaVersion, 2);
    assert.deepEqual(result.value.source, {mode: 'ESTABLISHED', evidence: null});
    assert.equal(result.value.adapter, null);
    assert.equal(result.versionCurrent, true);
    assert.deepEqual(result.contents, contents);
    assert.match(result.digest, /^[0-9a-f]{64}$/);
});

test('reads an owner-only managed manifest without changing the file', (t) => {
    const {projectRoot, manifestPath, contents} = manifestFixture(t, 0o600);
    const before = fs.lstatSync(manifestPath);
    assert.equal(before.mode & 0o7777, 0o600);

    const result = readProjectManifest({projectRoot, coreRoot: CORE_ROOT});

    assert.equal(result.value.project.displayName, 'Core Project');
    assert.equal(result.value.adapter, null);
    assert.deepEqual(fs.readFileSync(manifestPath), contents);
    const after = fs.lstatSync(manifestPath);
    for (const field of ['dev', 'ino', 'uid', 'gid', 'size', 'mode', 'mtimeMs', 'ctimeMs']) {
        assert.equal(after[field], before[field], field);
    }
});

test('reports unsafe manifest modes separately from malformed content', (t) => {
    const {projectRoot, manifestPath} = manifestFixture(t);
    for (const [mode, observed] of [
        [0o0000, '0000'], [0o0200, '0200'], [0o0646, '0646'],
        [0o0660, '0660'], [0o0744, '0744'], [0o0645, '0645'],
        [0o4644, '4644'], [0o2644, '2644'], [0o1644, '1644'],
    ]) {
        fs.chmodSync(manifestPath, mode);

        assert.throws(() => readProjectManifest({projectRoot, coreRoot: CORE_ROOT}), {
            code: 'MANAGED_MODE',
            message: `managed file permissions are invalid: .prism/project.json (observed ${observed}; requires 0400 within 0644)`,
        });
        assert.equal(fs.lstatSync(manifestPath).mode & 0o7777, mode);
    }
});

test('rejects a manifest owned by another user before reading its contents', (t) => {
    const {projectRoot, manifestPath} = manifestFixture(t, 0o600);
    const lstat = fs.lstatSync;
    t.mock.method(fs, 'lstatSync', (file, options) => {
        const stat = lstat(file, options);
        if (file === manifestPath) stat.uid = process.getuid() + 1;
        return stat;
    });
    const read = t.mock.method(fs, 'readSync');

    assert.throws(() => readProjectManifest({projectRoot, coreRoot: CORE_ROOT}), {
        code: 'MANAGED_OWNER',
        message: 'managed file ownership is invalid: .prism/project.json',
    });
    assert.equal(read.mock.callCount(), 0);
});

test('rejects manifest identity changes at open before reading contents', (t) => {
    const {projectRoot} = manifestFixture(t);
    const fstat = fs.fstatSync;
    for (const field of ['uid', 'gid', 'mode', 'size', 'mtimeMs', 'ctimeMs']) {
        t.mock.method(fs, 'fstatSync', (descriptor) => {
            const stat = fstat(descriptor);
            stat[field] += 1;
            return stat;
        });
        const read = t.mock.method(fs, 'readSync');

        assert.throws(() => readProjectManifest({projectRoot, coreRoot: CORE_ROOT}),
            /project manifest changed/, field);
        assert.equal(read.mock.callCount(), 0, field);
        t.mock.restoreAll();
    }
});

test('continues to render a schema-one Blank manifest', () => {
    const contents = renderProjectManifest({
        schemaVersion: 1,
        source: {mode: 'BLANK', evidence: null},
        capabilities: [],
        metadata,
        coreVersion: CORE_VERSION,
        adapter: null,
    });

    assert.equal(JSON.parse(contents).schemaVersion, 1);
});

test('keeps established and bootstrap source schemas distinct', () => {
    assert.throws(() => renderProjectManifest({
        schemaVersion: 1,
        source: {mode: 'ESTABLISHED', evidence: null},
        capabilities: [],
        metadata,
        coreVersion: CORE_VERSION,
        adapter: null,
    }), /project manifest is invalid/);
    assert.throws(() => renderProjectManifest({
        schemaVersion: 2,
        source: {mode: 'BLANK', evidence: null},
        capabilities: [],
        metadata,
        coreVersion: CORE_VERSION,
        adapter: null,
    }), /project manifest is invalid/);
});

test('allows only an older semantic Core version to migrate', () => {
    const original = JSON.parse(renderProjectManifest({
        schemaVersion: 2,
        source: {mode: 'ESTABLISHED', evidence: null},
        capabilities: [],
        metadata,
        coreVersion: CORE_VERSION,
        adapter: null,
    }));
    original.compatibility.coreVersion = '0.4.0';
    assert.equal(validateProjectManifest({
        value: original,
        coreVersion: CORE_VERSION,
        allowVersionMigration: true,
    }).versionCurrent, false);
    for (const version of ['not-semver', '999.0.0']) {
        original.compatibility.coreVersion = version;
        assert.throws(() => validateProjectManifest({
            value: original,
            coreVersion: CORE_VERSION,
            allowVersionMigration: true,
        }), /project manifest is invalid/);
    }
});

test('rejects open, malformed, and stale manifest authority', () => {
    const original = JSON.parse(renderProjectManifest({
        schemaVersion: 2,
        source: {mode: 'ESTABLISHED', evidence: null},
        capabilities: [],
        metadata,
        coreVersion: CORE_VERSION,
        adapter: null,
    }));
    const mutations = [
        (value) => { value.extra = true; },
        (value) => { value.adapter = {}; },
        (value) => {
            value.adapter = {
                id: '@kyaulabs/prism-php-web',
                packageName: '@kyaulabs/prism-php-web',
                packageVersion: 'latest',
                bootstrapProtocol: 1,
            };
        },
        (value) => { value.compatibility.providerProtocol = 2; },
        (value) => { value.source.evidence = {}; },
    ];
    for (const mutate of mutations) {
        const value = structuredClone(original);
        mutate(value);
        assert.throws(() => validateProjectManifest({
            value,
            coreVersion: CORE_VERSION,
        }), /project manifest is invalid/);
    }
    const stale = structuredClone(original);
    stale.compatibility.coreVersion = '0.0.1';
    assert.throws(() => validateProjectManifest({
        value: stale,
        coreVersion: CORE_VERSION,
    }), /project manifest is invalid/);
    assert.equal(validateProjectManifest({
        value: stale,
        coreVersion: CORE_VERSION,
        allowVersionMigration: true,
    }).versionCurrent, false);
});

test('rejects non-UTF-8 project manifests', (t) => {
    const projectRoot = makeTempDir();
    t.after(() => fs.rmSync(projectRoot, {recursive: true, force: true}));
    const contents = renderProjectManifest({
        schemaVersion: 2,
        source: {mode: 'ESTABLISHED', evidence: null},
        capabilities: [],
        metadata,
        coreVersion: CORE_VERSION,
        adapter: null,
    });
    contents[contents.indexOf(Buffer.from('Core Project'))] = 0xff;
    const manifestPath = path.join(projectRoot, '.prism', 'project.json');
    fs.mkdirSync(path.dirname(manifestPath));
    fs.writeFileSync(manifestPath, contents, {mode: 0o644});
    fs.chmodSync(manifestPath, 0o644);

    assert.throws(() => readProjectManifest({projectRoot, coreRoot: CORE_ROOT}),
        /project manifest is invalid/);
});

test('rejects a symlinked project manifest', (t) => {
    const projectRoot = makeTempDir();
    t.after(() => fs.rmSync(projectRoot, {recursive: true, force: true}));
    fs.mkdirSync(path.join(projectRoot, '.prism'));
    const target = path.join(projectRoot, 'manifest.json');
    fs.writeFileSync(target, '{}\n');
    fs.symlinkSync(target, path.join(projectRoot, '.prism', 'project.json'));

    assert.throws(() => readProjectManifest({
        projectRoot,
        coreRoot: CORE_ROOT,
    }), /project manifest is invalid/);
});

// vim: ft=javascript sts=4 sw=4 ts=4 et :
