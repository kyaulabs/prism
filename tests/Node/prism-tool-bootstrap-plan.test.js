// $KYAULabs: prism-tool-bootstrap-plan.test.js kyau@aura.kyaulabs 2026/08/24 -0700 Exp $

'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const {makeTempDir} = require('./helpers');
const {main} = require('../../packages/prism-core/scripts/prism-tool/cli');

const CORE_ROOT = path.resolve(__dirname, '../../packages/prism-core');

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

function planInput(projectRoot, input, context = {}) {
    return captureWrites(() => main([
        'setup', 'project', 'plan', '--source=blank', '--adapter=core-only', '--json',
    ], {projectRoot, input, ...context}));
}

function planProject(projectRoot, input, context = {}) {
    return planInput(projectRoot, JSON.stringify(input), context);
}

test('reports minimal metadata fields without changing a strict-empty root', (t) => {
    const parent = makeTempDir();
    const projectRoot = path.join(parent, 'example-project');
    fs.mkdirSync(projectRoot);
    t.after(() => fs.rmSync(parent, {recursive: true, force: true}));

    const result = captureWrites(() => main([
        'setup', 'project', 'metadata', '--source=blank', '--adapter=core-only', '--json',
    ], {projectRoot}));
    const report = JSON.parse(result.stdout);

    assert.equal(result.status, 0);
    assert.equal(result.stderr, '');
    assert.equal(report.schemaVersion, 1);
    assert.equal(report.command, 'setup project metadata');
    assert.equal(report.status, 'GO');
    assert.equal(report.disposition, 'METADATA_REQUIRED');
    assert.equal(report.projectRoot, fs.realpathSync(projectRoot));
    assert.equal(report.source, 'BLANK');
    assert.equal(report.adapter, null);
    assert.deepEqual(report.data.fields, [
        {
            id: 'displayName',
            required: true,
            suggestedValue: 'example-project',
            maximumLength: 100,
        },
        {
            id: 'summary',
            required: true,
            suggestedValue: null,
            maximumLength: 240,
        },
    ]);
    assert.deepEqual(fs.readdirSync(projectRoot), []);
});

test('accepts an edited display name before project planning', (t) => {
    const projectRoot = makeTempDir();
    t.after(() => fs.rmSync(projectRoot, {recursive: true, force: true}));

    const result = planProject(projectRoot, {
        schemaVersion: 1,
        displayName: 'Editable Project Name',
        summary: 'A deterministic Core-only project.',
    });

    assert.equal(result.status, 5);
    assert.equal(result.stdout, '');
    assert.match(result.stderr, /project planning is not implemented/);
    assert.deepEqual(fs.readdirSync(projectRoot), []);
});

test('rejects metadata outside the closed minimal schema', (t) => {
    const projectRoot = makeTempDir();
    t.after(() => fs.rmSync(projectRoot, {recursive: true, force: true}));
    const valid = {
        schemaVersion: 1,
        displayName: 'Project',
        summary: 'One sentence.',
    };
    const cases = [
        JSON.stringify({...valid, unknown: true}),
        JSON.stringify({...valid, schemaVersion: 2}),
        JSON.stringify({...valid, displayName: ''}),
        JSON.stringify({...valid, displayName: ' Project'}),
        JSON.stringify({...valid, displayName: 'Project\nName'}),
        JSON.stringify({...valid, displayName: 'x'.repeat(101)}),
        JSON.stringify({...valid, displayName: []}),
        JSON.stringify({...valid, summary: 'Two sentences. Another.'}),
        JSON.stringify({...valid, summary: 'No terminator'}),
        JSON.stringify({...valid, summary: 'x'.repeat(240) + '.'}),
        '{"schemaVersion":1,"displayName":"First","displayName":"Second","summary":"One sentence."}',
        `\ufeff${JSON.stringify(valid)}`,
        `${JSON.stringify(valid)} trailing`,
    ];

    for (const input of cases) {
        const result = planInput(projectRoot, input);
        assert.equal(result.status, 5, input);
        assert.equal(result.stdout, '', input);
        assert.match(result.stderr, /project metadata is invalid/, input);
        assert.deepEqual(fs.readdirSync(projectRoot), [], input);
    }
});

test('renders the trusted Core baseline into a launcher-designated candidate root', (t) => {
    const projectRoot = makeTempDir();
    const candidateRoot = makeTempDir();
    t.after(() => fs.rmSync(projectRoot, {recursive: true, force: true}));
    t.after(() => fs.rmSync(candidateRoot, {recursive: true, force: true}));

    const result = planInput(projectRoot, JSON.stringify({
        schemaVersion: 1,
        displayName: 'Editable Project Name',
        summary: 'A deterministic Core-only project.',
    }), {
        coreRoot: CORE_ROOT,
        bootstrapPlanStage: 'provider',
        bootstrapCandidateRoot: candidateRoot,
    });
    const report = JSON.parse(result.stdout);

    assert.equal(result.status, 0);
    assert.equal(result.stderr, '');
    assert.equal(report.status, 'GO');
    assert.equal(report.disposition, 'PROVIDER_READY');
    assert.deepEqual(report.data.outputs.map(({path: outputPath}) => outputPath), [
        '.github/hooks/commit-msg',
        '.github/hooks/pre-commit',
        '.github/hooks/pre-push',
        '.github/hooks/prepare-commit-msg',
        '.prism/project.json',
        'README.md',
        'commitlint.config.cjs',
    ]);
    for (const output of report.data.outputs) {
        assert.match(output.sha256, /^[0-9a-f]{64}$/);
        assert.equal(path.isAbsolute(output.candidatePath), true);
        assert.equal(path.relative(candidateRoot, output.candidatePath).startsWith('..'), false);
    }
    assert.deepEqual(fs.readdirSync(projectRoot), []);
});

test('rejects a packaged Core hook with a non-canonical mode', (t) => {
    const projectRoot = makeTempDir();
    const candidateRoot = makeTempDir();
    const coreRoot = makeTempDir();
    t.after(() => fs.rmSync(projectRoot, {recursive: true, force: true}));
    t.after(() => fs.rmSync(candidateRoot, {recursive: true, force: true}));
    t.after(() => fs.rmSync(coreRoot, {recursive: true, force: true}));
    fs.writeFileSync(path.join(coreRoot, 'package.json'), JSON.stringify({
        name: '@kyaulabs/prism-core',
        version: '0.3.1',
    }));
    fs.mkdirSync(path.join(coreRoot, 'config', 'bootstrap'), {recursive: true});
    fs.cpSync(path.join(CORE_ROOT, 'config', 'bootstrap', 'hooks'), path.join(
        coreRoot, 'config', 'bootstrap', 'hooks'
    ), {recursive: true});
    fs.copyFileSync(
        path.join(CORE_ROOT, 'config', 'commitlint.config.cjs'),
        path.join(coreRoot, 'config', 'commitlint.config.cjs')
    );
    fs.chmodSync(path.join(coreRoot, 'config', 'bootstrap', 'hooks', 'pre-commit'), 0o644);

    const result = planProject(projectRoot, {
        schemaVersion: 1,
        displayName: 'Project',
        summary: 'One sentence.',
    }, {
        coreRoot,
        bootstrapPlanStage: 'provider',
        bootstrapCandidateRoot: candidateRoot,
    });

    assert.equal(result.status, 5);
    assert.equal(result.stdout, '');
    assert.match(result.stderr, /Core baseline provider failed/);
    assert.deepEqual(fs.readdirSync(projectRoot), []);
});

test('validates provider identity and candidate bytes before composition', (t) => {
    const projectRoot = makeTempDir();
    const candidateRoot = makeTempDir();
    t.after(() => fs.rmSync(projectRoot, {recursive: true, force: true}));
    t.after(() => fs.rmSync(candidateRoot, {recursive: true, force: true}));
    const rendered = planInput(projectRoot, JSON.stringify({
        schemaVersion: 1,
        displayName: 'Project',
        summary: 'One sentence.',
    }), {
        coreRoot: CORE_ROOT,
        bootstrapPlanStage: 'provider',
        bootstrapCandidateRoot: candidateRoot,
    });
    const provider = JSON.parse(rendered.stdout).data;
    const {loadTrustedProviderRegistry} = require(
        '../../packages/prism-core/scripts/prism-tool/bootstrap-providers'
    );
    const {validateProviderReport} = require(
        '../../packages/prism-core/scripts/prism-tool/bootstrap-composer'
    );

    const outputs = validateProviderReport({
        projectRoot,
        candidateRoot,
        registry: loadTrustedProviderRegistry({coreRoot: CORE_ROOT}),
        report: provider,
    });

    assert.equal(outputs.length, 7);
    assert.deepEqual(outputs[0].provider, {
        id: 'core-baseline',
        packageName: '@kyaulabs/prism-core',
        packageVersion: '0.3.1',
        protocolVersion: 1,
    });
    assert.equal(outputs.every(({kind}) => kind === 'file'), true);
});

test('rejects malformed, untrusted, and stale provider reports', (t) => {
    const projectRoot = makeTempDir();
    const candidateRoot = makeTempDir();
    t.after(() => fs.rmSync(projectRoot, {recursive: true, force: true}));
    t.after(() => fs.rmSync(candidateRoot, {recursive: true, force: true}));
    const rendered = planInput(projectRoot, JSON.stringify({
        schemaVersion: 1,
        displayName: 'Project',
        summary: 'One sentence.',
    }), {
        coreRoot: CORE_ROOT,
        bootstrapPlanStage: 'provider',
        bootstrapCandidateRoot: candidateRoot,
    });
    const provider = JSON.parse(rendered.stdout).data;
    const {loadTrustedProviderRegistry} = require(
        '../../packages/prism-core/scripts/prism-tool/bootstrap-providers'
    );
    const {validateProviderReport} = require(
        '../../packages/prism-core/scripts/prism-tool/bootstrap-composer'
    );
    const registry = loadTrustedProviderRegistry({coreRoot: CORE_ROOT});
    const copy = () => JSON.parse(JSON.stringify(provider));
    const cases = [
        (report) => { report.unknown = true; },
        (report) => { report.schemaVersion = 2; },
        (report) => { report.provider.id = 'unknown'; },
        (report) => { report.provider.packageName = '@kyaulabs/prism-other'; },
        (report) => { report.provider.packageVersion = '9.9.9'; },
        (report) => { report.provider.protocolVersion = 2; },
        (report) => { report.status = 'UNKNOWN'; },
        (report) => { report.outputs[0].unknown = true; },
        (report) => { report.outputs[0].path = '/absolute'; },
        (report) => { report.outputs[0].mode = 0o600; },
        (report) => { report.outputs[0].sha256 = '0'.repeat(64); },
        (report) => { report.effects = ['network']; },
        (report) => { report.checks[0].id = 'unknown'; },
        (report) => { report.verification[0].command = 'unknown'; },
    ];

    for (const mutate of cases) {
        const report = copy();
        mutate(report);
        assert.throws(
            () => validateProviderReport({projectRoot, candidateRoot, registry, report})
        );
    }

    fs.appendFileSync(provider.outputs.find(({path: outputPath}) => outputPath === 'README.md').candidatePath, 'changed');
    assert.throws(
        () => validateProviderReport({projectRoot, candidateRoot, registry, report: provider}),
        /candidate|digest/
    );
});

test('rejects exact and prefix provider ownership overlap', () => {
    const {composeProviderReports} = require(
        '../../packages/prism-core/scripts/prism-tool/bootstrap-composer'
    );
    const reportFor = (outputPath) => ({
        schemaVersion: 1,
        provider: {
            id: 'core-baseline',
            packageName: '@kyaulabs/prism-core',
            packageVersion: '0.3.1',
            protocolVersion: 1,
        },
        status: 'GO',
        outputs: [{
            path: outputPath,
            kind: 'file',
            mode: 0o644,
            sha256: 'a'.repeat(64),
            candidatePath: `/candidate/${outputPath}`,
        }],
        effects: [],
        checks: [{
            id: 'core-baseline-render',
            status: 'PASS',
            message: 'Core baseline candidate files were rendered',
        }],
        verification: [{
            id: 'core-baseline-inventory',
            command: 'setup project validate',
        }],
    });

    assert.throws(
        () => composeProviderReports({reports: [reportFor('README.md'), reportFor('README.md')]}),
        /provider ownership overlaps/
    );
    assert.throws(
        () => composeProviderReports({
            reports: [reportFor('.github'), reportFor('.github/hooks/pre-commit')],
        }),
        /provider ownership overlaps/
    );
    assert.throws(
        () => composeProviderReports({
            reports: [reportFor('.github/hooks/pre-commit'), reportFor('.github')],
        }),
        /provider ownership overlaps/
    );
});

// vim: ft=javascript sts=4 sw=4 ts=4 et :
