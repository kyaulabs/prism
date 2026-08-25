// $KYAULabs: prism-tool-bootstrap-capabilities.test.js kyau@aura.kyaulabs 2026/08/25 -0700 Exp $

'use strict';

const assert = require('node:assert/strict');
const {spawnSync} = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const {makeTempDir} = require('./helpers');
const {main} = require('../../packages/prism-core/scripts/prism-tool/cli');

const ATTEMPT_ID = '12345678-1234-4123-8123-123456789abc';
const CORE_ROOT = path.resolve(__dirname, '../../packages/prism-core');
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

test('renders a trusted MIT licensing provider report', (t) => {
    const candidateRoot = makeTempDir();
    t.after(() => fs.rmSync(candidateRoot, {recursive: true, force: true}));
    const {renderCoreProfileProviders} = require(
        '../../packages/prism-core/scripts/prism-tool/bootstrap-profile-providers'
    );

    const reports = renderCoreProfileProviders({
        coreRoot: CORE_ROOT,
        candidateRoot,
        request: {
            schemaVersion: 1,
            source: {mode: 'BLANK', evidence: null},
            capabilities: ['licensing'],
            metadata: {
                schemaVersion: 1,
                displayName: 'Example Project',
                summary: 'A deterministic project.',
                suggestedDisplayName: 'example-project',
                capabilityMetadata: {
                    licensing: {
                        spdxId: 'MIT',
                        year: 2026,
                        copyrightHolder: 'Example Organization',
                    },
                },
            },
            adapter: null,
        },
    });

    assert.equal(reports.length, 1);
    assert.deepEqual(reports[0].provider, {
        id: 'licensing',
        packageName: '@kyaulabs/prism-core',
        packageVersion: '0.3.1',
        protocolVersion: 1,
    });
    assert.deepEqual(reports[0].outputs.map(({path: outputPath, mode}) => ({
        path: outputPath,
        mode,
    })), [{path: 'LICENSE', mode: 0o644}]);
    assert.match(
        fs.readFileSync(path.join(candidateRoot, 'LICENSE'), 'utf8'),
        /^MIT License\n\nCopyright \(c\) 2026 Example Organization\n\nPermission is hereby granted/m
    );
    assert.deepEqual(reports[0].effects, []);
    assert.equal(reports[0].checks[0].status, 'PASS');
});

test('renders a bundled AGPL licensing provider report', (t) => {
    const candidateRoot = makeTempDir();
    t.after(() => fs.rmSync(candidateRoot, {recursive: true, force: true}));
    const {renderCoreProfileProviders} = require(
        '../../packages/prism-core/scripts/prism-tool/bootstrap-profile-providers'
    );

    renderCoreProfileProviders({
        coreRoot: CORE_ROOT,
        candidateRoot,
        request: {
            schemaVersion: 1,
            source: {mode: 'BLANK', evidence: null},
            capabilities: ['licensing'],
            metadata: {
                schemaVersion: 1,
                displayName: 'Example Project',
                summary: 'A deterministic project.',
                suggestedDisplayName: 'example-project',
                capabilityMetadata: {
                    licensing: {
                        spdxId: 'AGPL-3.0-only',
                        year: 2026,
                        copyrightHolder: 'Example Organization',
                    },
                },
            },
            adapter: null,
        },
    });

    const contents = fs.readFileSync(path.join(candidateRoot, 'LICENSE'), 'utf8');
    assert.match(contents, /^Copyright \(c\) 2026 Example Organization\n\n {20}GNU AFFERO GENERAL PUBLIC LICENSE/m);
    assert.match(contents, /Version 3, 19 November 2007/);
});

test('renders community governance from the normalized conduct contact', (t) => {
    const candidateRoot = makeTempDir();
    t.after(() => fs.rmSync(candidateRoot, {recursive: true, force: true}));
    const {renderCoreProfileProviders} = require(
        '../../packages/prism-core/scripts/prism-tool/bootstrap-profile-providers'
    );

    const reports = renderCoreProfileProviders({
        coreRoot: CORE_ROOT,
        candidateRoot,
        request: {
            schemaVersion: 1,
            source: {mode: 'BLANK', evidence: null},
            capabilities: ['community-governance'],
            metadata: {
                schemaVersion: 1,
                displayName: 'Example Project',
                summary: 'A deterministic project.',
                suggestedDisplayName: 'example-project',
                capabilityMetadata: {
                    'community-governance': {
                        conductContact: {
                            kind: 'email',
                            value: 'conduct@example.test',
                        },
                    },
                },
            },
            adapter: null,
        },
    });

    assert.deepEqual(reports[0].outputs.map(({path: outputPath}) => outputPath), [
        'CODE_OF_CONDUCT.md', 'CONTRIBUTING.md',
    ]);
    assert.match(
        fs.readFileSync(path.join(candidateRoot, 'CODE_OF_CONDUCT.md'), 'utf8'),
        /mailto:conduct@example\.test/
    );
    const contributing = fs.readFileSync(path.join(candidateRoot, 'CONTRIBUTING.md'), 'utf8');
    assert.match(contributing, /Red → Green → Refactor/);
    assert.match(contributing, /Humans push work branches/);
    assert.doesNotMatch(contributing, /kyaulabs\/prism|discord/i);
});

test('renders neutral GitHub collaboration templates without project metadata', (t) => {
    const candidateRoot = makeTempDir();
    t.after(() => fs.rmSync(candidateRoot, {recursive: true, force: true}));
    const {renderCoreProfileProviders} = require(
        '../../packages/prism-core/scripts/prism-tool/bootstrap-profile-providers'
    );

    const reports = renderCoreProfileProviders({
        coreRoot: CORE_ROOT,
        candidateRoot,
        request: {
            schemaVersion: 1,
            source: {mode: 'BLANK', evidence: null},
            capabilities: ['github-collaboration'],
            metadata: {
                schemaVersion: 1,
                displayName: 'Example Project',
                summary: 'A deterministic project.',
                suggestedDisplayName: 'example-project',
                capabilityMetadata: {'github-collaboration': {}},
            },
            adapter: null,
        },
    });

    assert.deepEqual(reports[0].outputs.map(({path: outputPath}) => outputPath), [
        '.github/ISSUE_TEMPLATE/bug_report.yml',
        '.github/ISSUE_TEMPLATE/feature_request.yml',
        '.github/pull_request_template.md',
    ]);
    const contents = reports[0].outputs.map(({path: outputPath}) =>
        fs.readFileSync(path.join(candidateRoot, ...outputPath.split('/')), 'utf8')
    ).join('\n');
    assert.match(contents, /reproduction steps/i);
    assert.match(contents, /acceptance criteria/i);
    assert.match(contents, /verification/i);
    assert.doesNotMatch(contents, /assignees:|labels:|windows|kyaulabs\/|github\.com\//i);
});

test('declares exact trusted ownership for selected profile providers', () => {
    const {loadCoreProfileProviderDescriptors} = require(
        '../../packages/prism-core/scripts/prism-tool/bootstrap-profile-providers'
    );

    const descriptors = loadCoreProfileProviderDescriptors({
        coreRoot: CORE_ROOT,
        capabilities: [
            'licensing', 'community-governance', 'github-collaboration',
        ],
    });

    assert.deepEqual(descriptors.map(({id, outputs}) => ({id, outputs})), [
        {id: 'licensing', outputs: ['LICENSE']},
        {
            id: 'community-governance',
            outputs: ['CODE_OF_CONDUCT.md', 'CONTRIBUTING.md'],
        },
        {
            id: 'github-collaboration',
            outputs: [
                '.github/ISSUE_TEMPLATE/bug_report.yml',
                '.github/ISSUE_TEMPLATE/feature_request.yml',
                '.github/pull_request_template.md',
            ],
        },
    ]);
    for (const descriptor of descriptors) {
        assert.equal(descriptor.packageName, '@kyaulabs/prism-core');
        assert.equal(descriptor.packageVersion, '0.3.1');
        assert.equal(descriptor.protocolVersion, 1);
        assert.deepEqual(descriptor.effects, []);
        assert.equal(descriptor.checks.length, 1);
        assert.equal(descriptor.verification.length, 1);
    }
});

test('loads selected profiles into the trusted Core provider registry', () => {
    const {loadTrustedProviderRegistry} = require(
        '../../packages/prism-core/scripts/prism-tool/bootstrap-providers'
    );

    const registry = loadTrustedProviderRegistry({
        coreRoot: CORE_ROOT,
        capabilities: ['licensing', 'github-collaboration'],
    });

    assert.deepEqual(registry.providers.map(({id}) => id), [
        'core-baseline', 'licensing', 'github-collaboration',
    ]);
});

test('fails closed when a packaged profile resource changes shape', (t) => {
    const fixtureRoot = makeTempDir();
    const coreRoot = path.join(fixtureRoot, 'core');
    const candidateRoot = path.join(fixtureRoot, 'candidate');
    fs.cpSync(CORE_ROOT, coreRoot, {recursive: true});
    fs.mkdirSync(candidateRoot);
    t.after(() => fs.rmSync(fixtureRoot, {recursive: true, force: true}));
    fs.appendFileSync(
        path.join(coreRoot, 'config', 'bootstrap', 'licenses', 'MIT.txt'),
        '{{COPYRIGHT_NOTICE}}\n'
    );
    const {renderCoreProfileProviders} = require(
        '../../packages/prism-core/scripts/prism-tool/bootstrap-profile-providers'
    );

    assert.throws(() => renderCoreProfileProviders({
        coreRoot,
        candidateRoot,
        request: {
            schemaVersion: 1,
            source: {mode: 'BLANK', evidence: null},
            capabilities: ['licensing'],
            metadata: {
                schemaVersion: 1,
                displayName: 'Example Project',
                summary: 'A deterministic project.',
                suggestedDisplayName: 'example-project',
                capabilityMetadata: {
                    licensing: {
                        spdxId: 'MIT',
                        year: 2026,
                        copyrightHolder: 'Example Organization',
                    },
                },
            },
            adapter: null,
        },
    }), /license resource is invalid/);
});

test('renders all selected profiles deterministically without ownership overlap', (t) => {
    const roots = [makeTempDir(), makeTempDir()];
    for (const root of roots) t.after(() => fs.rmSync(root, {recursive: true, force: true}));
    const {renderCoreProfileProviders} = require(
        '../../packages/prism-core/scripts/prism-tool/bootstrap-profile-providers'
    );
    const request = {
        schemaVersion: 1,
        source: {mode: 'BLANK', evidence: null},
        capabilities: [
            'licensing', 'community-governance', 'github-collaboration',
        ],
        metadata: {
            schemaVersion: 1,
            displayName: 'Example Project',
            summary: 'A deterministic project.',
            suggestedDisplayName: 'example-project',
            capabilityMetadata: {
                licensing: {
                    spdxId: 'MIT',
                    year: 2026,
                    copyrightHolder: 'Example Organization',
                },
                'community-governance': {
                    conductContact: {kind: 'https', value: 'https://example.test/conduct'},
                },
                'github-collaboration': {},
            },
        },
        adapter: null,
    };

    const reports = roots.map((candidateRoot) => renderCoreProfileProviders({
        coreRoot: CORE_ROOT,
        candidateRoot,
        request,
    }));
    const paths = reports[0].flatMap(({outputs}) => outputs.map(({path: outputPath}) => outputPath));
    assert.equal(new Set(paths).size, paths.length);
    for (let index = 0; index < paths.length; index += 1) {
        const left = fs.readFileSync(path.join(roots[0], ...paths[index].split('/')));
        const right = fs.readFileSync(path.join(roots[1], ...paths[index].split('/')));
        assert.equal(left.equals(right), true, paths[index]);
    }
});

test('plans each governance capability independently through the public launcher', (t) => {
    const scenarios = [
        {
            capability: 'licensing',
            capabilityMetadata: {
                licensing: {
                    spdxId: 'MIT',
                    copyrightHolder: 'Example Organization',
                },
            },
            outputs: ['LICENSE'],
        },
        {
            capability: 'community-governance',
            capabilityMetadata: {
                'community-governance': {
                    conductContact: 'conduct@example.test',
                },
            },
            outputs: ['CODE_OF_CONDUCT.md', 'CONTRIBUTING.md'],
        },
        {
            capability: 'github-collaboration',
            capabilityMetadata: {'github-collaboration': {}},
            outputs: [
                '.github/ISSUE_TEMPLATE/bug_report.yml',
                '.github/ISSUE_TEMPLATE/feature_request.yml',
                '.github/pull_request_template.md',
            ],
        },
    ];

    for (const scenario of scenarios) {
        const projectRoot = makeTempDir();
        t.after(() => fs.rmSync(projectRoot, {recursive: true, force: true}));
        const result = captureWrites(() => main([
            'setup', 'project', 'plan', '--source=blank', '--adapter=core-only',
            `--capabilities=${scenario.capability}`, '--json',
        ], {
            projectRoot,
            coreRoot: CORE_ROOT,
            randomUUID: () => ATTEMPT_ID,
            currentYear: 2026,
            input: JSON.stringify({
                schemaVersion: 1,
                displayName: 'Independent Project',
                summary: 'An independently configured project.',
                capabilityMetadata: scenario.capabilityMetadata,
            }),
        }));

        assert.equal(result.status, 0, scenario.capability);
        const report = JSON.parse(result.stdout);
        assert.deepEqual(report.capabilities, [scenario.capability]);
        assert.deepEqual(report.providers.map(({id}) => id), [
            'core-baseline', scenario.capability,
        ]);
        assert.deepEqual(
            report.outputs
                .map(({path: outputPath}) => outputPath)
                .filter((outputPath) => scenario.outputs.includes(outputPath)),
            scenario.outputs
        );
    }
});

test('composes a selected licensing provider into a Blank Core-only plan', (t) => {
    const projectRoot = makeTempDir();
    t.after(() => fs.rmSync(projectRoot, {recursive: true, force: true}));

    const result = captureWrites(() => main([
        'setup', 'project', 'plan', '--source=blank', '--adapter=core-only',
        '--capabilities=licensing', '--json',
    ], {
        projectRoot,
        coreRoot: CORE_ROOT,
        randomUUID: () => ATTEMPT_ID,
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
            },
        }),
    }));

    assert.equal(result.status, 0, result.stderr);
    const report = JSON.parse(result.stdout);
    assert.deepEqual(report.capabilities, ['licensing']);
    assert.deepEqual(report.providers.map(({id}) => id), ['core-baseline', 'licensing']);
    assert.equal(report.outputs.some(({path: outputPath}) => outputPath === 'LICENSE'), true);
    assert.equal(report.outputs.length, 8);
    assert.deepEqual(report.metadata.capabilityMetadata.licensing, {
        spdxId: 'MIT',
        year: 2026,
        copyrightHolder: 'Example Organization',
    });
    const attemptRoot = path.dirname(path.dirname(report.data.planPath));
    const manifest = JSON.parse(fs.readFileSync(
        path.join(attemptRoot, 'candidate', '.prism', 'project.json'),
        'utf8'
    ));
    assert.deepEqual(manifest.capabilities, ['licensing']);
    assert.deepEqual(manifest.capabilityMetadata, report.metadata.capabilityMetadata);
    assert.equal(fs.statSync(
        path.join(attemptRoot, 'reports', 'profile-licensing.json')
    ).mode & 0o777, 0o600);
});

test('fails closed when retained capability evidence drifts', (t) => {
    const cases = [
        {
            name: 'missing selected report',
            mutate: ({attemptRoot}) => fs.unlinkSync(
                path.join(attemptRoot, 'reports', 'profile-licensing.json')
            ),
        },
        {
            name: 'unknown report',
            mutate: ({attemptRoot}) => fs.writeFileSync(
                path.join(attemptRoot, 'reports', 'profile-unknown.json'),
                '{}\n',
                {mode: 0o600}
            ),
        },
        {
            name: 'changed metadata report',
            mutate: ({attemptRoot}) => {
                const metadataPath = path.join(attemptRoot, 'reports', 'metadata.json');
                const metadata = JSON.parse(fs.readFileSync(metadataPath, 'utf8'));
                metadata.capabilityMetadata.licensing.year = 2025;
                fs.writeFileSync(metadataPath, `${JSON.stringify(metadata, null, 2)}\n`, {mode: 0o600});
            },
        },
        {
            name: 'changed project manifest',
            mutate: ({attemptRoot}) => {
                const manifestPath = path.join(attemptRoot, 'candidate', '.prism', 'project.json');
                const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
                manifest.capabilityMetadata.licensing.spdxId = 'AGPL-3.0-only';
                fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
            },
        },
    ];

    for (const scenario of cases) {
        const projectRoot = makeTempDir();
        t.after(() => fs.rmSync(projectRoot, {recursive: true, force: true}));
        const planned = captureWrites(() => main([
            'setup', 'project', 'plan', '--source=blank', '--adapter=core-only',
            '--capabilities=licensing', '--json',
        ], {
            projectRoot,
            coreRoot: CORE_ROOT,
            randomUUID: () => ATTEMPT_ID,
            currentYear: 2026,
            input: JSON.stringify({
                schemaVersion: 1,
                displayName: 'Continuity Project',
                summary: 'A durable continuity project.',
                capabilityMetadata: {
                    licensing: {
                        spdxId: 'MIT',
                        copyrightHolder: 'Example Organization',
                    },
                },
            }),
        }));
        assert.equal(planned.status, 0, scenario.name);
        const plan = JSON.parse(planned.stdout);
        const attemptRoot = path.dirname(path.dirname(plan.data.planPath));
        scenario.mutate({attemptRoot});
        const validated = captureWrites(() => main([
            'setup', 'project', 'validate', `--attempt=${ATTEMPT_ID}`,
            `--digest=${plan.planDigest}`, '--json',
        ], {projectRoot, coreRoot: CORE_ROOT}));
        assert.equal(validated.status, 5, scenario.name);
        assert.equal(fs.existsSync(attemptRoot), true, scenario.name);
    }
});

test('accepts selected capabilities in hooks and rejects malformed profile metadata', (t) => {
    const projectRoot = makeTempDir();
    t.after(() => fs.rmSync(projectRoot, {recursive: true, force: true}));
    const metadata = {
        schemaVersion: 1,
        displayName: 'Governed Project',
        summary: 'A governed hook project.',
        capabilityMetadata: {
            licensing: {
                spdxId: 'MIT',
                copyrightHolder: 'Example Organization',
            },
        },
    };
    const planned = captureWrites(() => main([
        'setup', 'project', 'plan', '--source=blank', '--adapter=core-only',
        '--capabilities=licensing', '--json',
    ], {
        projectRoot,
        coreRoot: CORE_ROOT,
        randomUUID: () => ATTEMPT_ID,
        currentYear: 2026,
        input: JSON.stringify(metadata),
    }));
    assert.equal(planned.status, 0, planned.stderr);
    const plan = JSON.parse(planned.stdout);
    const applied = captureWrites(() => main([
        'setup', 'project', 'apply', `--attempt=${ATTEMPT_ID}`,
        `--digest=${plan.planDigest}`, '--approval=yes', '--json',
    ], {projectRoot, coreRoot: CORE_ROOT}));
    assert.equal(applied.status, 0, applied.stderr);
    assert.equal(spawnSync('git', ['init', '-b', 'develop'], {cwd: projectRoot}).status, 0);
    const hookRun = (command, args, options) => {
        if (command === process.execPath && args.includes('doctor')) {
            return {status: 0, stdout: '', stderr: '', error: undefined};
        }
        const result = spawnSync(command, args, {
            cwd: options.cwd,
            env: options.env,
            encoding: 'utf8',
            input: options.input,
        });
        return {
            status: result.status,
            stdout: result.stdout,
            stderr: result.stderr,
            error: result.error,
        };
    };
    const runHook = () => captureWrites(() => main(['hook', 'pre-commit'], {
        projectRoot,
        coreRoot: CORE_ROOT,
        hookRun,
    }));

    assert.equal(runHook().status, 0);
    const manifestPath = path.join(projectRoot, '.prism', 'project.json');
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    for (const mutate of [
        (value) => { value.capabilities = ['unknown-capability']; },
        (value) => { delete value.capabilityMetadata; },
        (value) => { value.capabilityMetadata['community-governance'] = {}; },
        (value) => { value.capabilityMetadata.licensing.year = 1969; },
    ]) {
        const changed = globalThis.structuredClone(manifest);
        mutate(changed);
        fs.writeFileSync(manifestPath, `${JSON.stringify(changed, null, 2)}\n`);
        assert.equal(runHook().status, 1);
    }
    fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
    assert.equal(runHook().status, 0);
});

// vim: ft=javascript sts=4 sw=4 ts=4 et :
