// $KYAULabs: prism-tool-project-manifest.test.js kyau@aura.kyaulabs 2026/09/04 -0700 Exp $

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

test('renders and reads a closed established Core-only manifest', (t) => {
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
    fs.writeFileSync(manifestPath, contents, {mode: 0o644});
    fs.chmodSync(manifestPath, 0o644);

    const result = readProjectManifest({projectRoot, coreRoot: CORE_ROOT});

    assert.equal(result.value.schemaVersion, 2);
    assert.deepEqual(result.value.source, {mode: 'ESTABLISHED', evidence: null});
    assert.equal(result.value.adapter, null);
    assert.equal(result.versionCurrent, true);
    assert.deepEqual(result.contents, contents);
    assert.match(result.digest, /^[0-9a-f]{64}$/);
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
