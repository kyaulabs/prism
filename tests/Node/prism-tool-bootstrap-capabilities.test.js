// $KYAULabs: prism-tool-bootstrap-capabilities.test.js kyau@aura.kyaulabs 2026/08/25 -0700 Exp $

'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const {makeTempDir} = require('./helpers');
const {main} = require('../../packages/prism-core/scripts/prism-tool/cli');
const {
    normalizeProjectMetadata,
    validateNormalizedProjectMetadata,
} = require('../../packages/prism-core/scripts/prism-tool/bootstrap-metadata');

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

test('keeps every optional capability disabled by default', (t) => {
    const projectRoot = makeTempDir();
    t.after(() => fs.rmSync(projectRoot, {recursive: true, force: true}));

    const result = captureWrites(() => main([
        'setup', 'project', 'metadata', '--source=blank', '--adapter=core-only', '--json',
    ], {projectRoot}));

    assert.equal(result.status, 0, result.stderr);
    const report = JSON.parse(result.stdout);
    assert.deepEqual(report.capabilities, []);
    assert.deepEqual(report.data.fields.map(({id}) => id), ['displayName', 'summary']);
    assert.deepEqual(report.data.publications, []);
});

test('reports only the metadata fields required by selected licensing', (t) => {
    const projectRoot = makeTempDir();
    t.after(() => fs.rmSync(projectRoot, {recursive: true, force: true}));

    const result = captureWrites(() => main([
        'setup', 'project', 'metadata', '--source=blank', '--adapter=core-only',
        '--capabilities=licensing', '--json',
    ], {projectRoot}));
    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.stderr, '');
    const report = JSON.parse(result.stdout);
    assert.deepEqual(report.capabilities, ['licensing']);
    assert.deepEqual(report.data.fields.map(({id}) => id), [
        'displayName',
        'summary',
        'licensing.spdxId',
        'licensing.copyrightHolder',
    ]);
    assert.deepEqual(report.data.fields[2].choices, ['AGPL-3.0-only', 'MIT']);
    assert.deepEqual(report.data.publications, [{
        capability: 'licensing',
        field: 'licensing.copyrightHolder',
        outputs: ['LICENSE'],
    }]);
    assert.deepEqual(fs.readdirSync(projectRoot), []);
});

test('reports selected capability metadata in canonical order', (t) => {
    const projectRoot = makeTempDir();
    t.after(() => fs.rmSync(projectRoot, {recursive: true, force: true}));

    const result = captureWrites(() => main([
        'setup', 'project', 'metadata', '--source=blank', '--adapter=core-only',
        '--capabilities=github-collaboration,licensing,community-governance', '--json',
    ], {projectRoot}));

    assert.equal(result.status, 0, result.stderr);
    const report = JSON.parse(result.stdout);
    assert.deepEqual(report.capabilities, [
        'licensing', 'community-governance', 'github-collaboration',
    ]);
    assert.deepEqual(report.data.fields.map(({id}) => id), [
        'displayName',
        'summary',
        'licensing.spdxId',
        'licensing.copyrightHolder',
        'community-governance.conductContact',
    ]);
    assert.deepEqual(report.data.publications, [
        {
            capability: 'licensing',
            field: 'licensing.copyrightHolder',
            outputs: ['LICENSE'],
        },
        {
            capability: 'community-governance',
            field: 'community-governance.conductContact',
            outputs: ['CODE_OF_CONDUCT.md'],
        },
    ]);
});

test('rejects non-canonical capability selections without changing the root', (t) => {
    const selections = [
        'licensing,licensing',
        ' licensing',
        'licensing,',
        'unknown-capability',
        'security-disclosure',
    ];
    for (const selection of selections) {
        const projectRoot = makeTempDir();
        t.after(() => fs.rmSync(projectRoot, {recursive: true, force: true}));

        const result = captureWrites(() => main([
            'setup', 'project', 'metadata', '--source=blank', '--adapter=core-only',
            `--capabilities=${selection}`, '--json',
        ], {projectRoot}));

        assert.equal(result.status, 2, selection);
        assert.match(result.stderr, /^usage: prism-tool setup project metadata/);
        assert.deepEqual(fs.readdirSync(projectRoot), []);
    }
});

test('normalizes selected capability metadata into canonical persisted values', (t) => {
    const projectRoot = makeTempDir();
    t.after(() => fs.rmSync(projectRoot, {recursive: true, force: true}));
    const capabilities = [
        'licensing', 'community-governance', 'github-collaboration',
    ];

    const metadata = normalizeProjectMetadata({
        projectRoot,
        capabilities,
        currentYear: 2026,
        input: JSON.stringify({
            schemaVersion: 1,
            displayName: 'Example Project',
            summary: 'A deterministic project.',
            capabilityMetadata: {
                licensing: {
                    spdxId: 'MIT',
                    copyrightHolder: 'Example Organization',
                },
                'community-governance': {
                    conductContact: 'conduct@example.test',
                },
                'github-collaboration': {},
            },
        }),
    });

    assert.deepEqual(metadata, {
        schemaVersion: 1,
        displayName: 'Example Project',
        summary: 'A deterministic project.',
        suggestedDisplayName: path.basename(projectRoot),
        capabilityMetadata: {
            licensing: {
                spdxId: 'MIT',
                year: 2026,
                copyrightHolder: 'Example Organization',
            },
            'community-governance': {
                conductContact: {
                    kind: 'email',
                    value: 'conduct@example.test',
                },
            },
            'github-collaboration': {},
        },
    });
    assert.deepEqual(
        validateNormalizedProjectMetadata({metadata, capabilities}),
        metadata
    );
});

test('rejects unsafe and non-closed capability metadata', (t) => {
    const cases = [
        {
            capabilities: ['licensing'],
            capabilityMetadata: {
                licensing: {spdxId: 'Apache-2.0', copyrightHolder: 'Example'},
            },
        },
        {
            capabilities: ['licensing'],
            capabilityMetadata: {
                licensing: {spdxId: 'MIT', copyrightHolder: 'Example\nOrganization'},
            },
        },
        {
            capabilities: ['community-governance'],
            capabilityMetadata: {
                'community-governance': {conductContact: 'http://example.test/report'},
            },
        },
        {
            capabilities: ['github-collaboration'],
            capabilityMetadata: {
                'github-collaboration': {assignees: ['owner']},
            },
        },
    ];
    for (const entry of cases) {
        const projectRoot = makeTempDir();
        t.after(() => fs.rmSync(projectRoot, {recursive: true, force: true}));
        assert.throws(() => normalizeProjectMetadata({
            projectRoot,
            capabilities: entry.capabilities,
            currentYear: 2026,
            input: JSON.stringify({
                schemaVersion: 1,
                displayName: 'Example Project',
                summary: 'A deterministic project.',
                capabilityMetadata: entry.capabilityMetadata,
            }),
        }));
        assert.deepEqual(fs.readdirSync(projectRoot), []);
    }
});

// vim: ft=javascript sts=4 sw=4 ts=4 et :
