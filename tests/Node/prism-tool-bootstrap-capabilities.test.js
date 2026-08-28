// $KYAULabs: prism-tool-bootstrap-capabilities.test.js kyau@aura.kyaulabs 2026/08/27 -0700 Exp $

'use strict';

const assert = require('node:assert/strict');
const {spawnSync} = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const {createSignedAdapterSelection, makeTempDir} = require('./helpers');
const {main} = require('../../packages/prism-core/scripts/prism-tool/cli');

const ATTEMPT_ID = '12345678-1234-4123-8123-123456789abc';
const CORE_ROOT = path.resolve(__dirname, '../../packages/prism-core');
const CORE_VERSION = JSON.parse(
    fs.readFileSync(path.join(CORE_ROOT, 'package.json'), 'utf8')
).version;
const ADAPTER_ROOT = path.resolve(__dirname, '../../packages/prism-php-web');
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

test('reports selected adapter metadata fields without changing provisional state', (t) => {
    const projectRoot = makeTempDir();
    t.after(() => fs.rmSync(projectRoot, {recursive: true, force: true}));
    const selection = createSignedAdapterSelection({
        t,
        projectRoot,
        coreRoot: CORE_ROOT,
        adapterRoot: ADAPTER_ROOT,
        attemptId: ATTEMPT_ID,
    });
    const provisioned = captureWrites(() => main([
        'setup', 'adapter', 'select', '--adapter=php-web',
        `--catalogue-digest=${selection.digest}`, '--source=blank',
        '--network-approved=yes', '--json',
    ], selection.context));
    assert.equal(provisioned.status, 0, provisioned.stderr);
    const adapterPath = path.join(
        projectRoot, '.pi', 'prism-tool', 'bootstrap', ATTEMPT_ID, 'adapter.json'
    );
    const before = fs.readFileSync(adapterPath);

    const result = captureWrites(() => main([
        'setup', 'project', 'metadata', '--source=blank',
        '--adapter=@kyaulabs/prism-php-web', `--attempt=${ATTEMPT_ID}`,
        '--capabilities=licensing', '--json',
    ], {projectRoot, coreRoot: selection.context.coreRoot}));

    assert.equal(result.status, 0, result.stderr);
    const report = JSON.parse(result.stdout);
    assert.equal(report.source, 'BLANK');
    assert.equal(report.adapter.packageName, '@kyaulabs/prism-php-web');
    assert.deepEqual(report.capabilities, ['licensing']);
    assert.deepEqual(report.data.fields.map(({id}) => id), [
        'displayName', 'summary', 'licensing.spdxId', 'licensing.copyrightHolder',
    ]);
    assert.deepEqual(fs.readFileSync(adapterPath), before);
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

test('reports only the metadata fields required by selected security disclosure', (t) => {
    const projectRoot = makeTempDir();
    t.after(() => fs.rmSync(projectRoot, {recursive: true, force: true}));

    const result = captureWrites(() => main([
        'setup', 'project', 'metadata', '--source=blank', '--adapter=core-only',
        '--capabilities=security-disclosure', '--json',
    ], {projectRoot}));

    assert.equal(result.status, 0, result.stderr);
    const report = JSON.parse(result.stdout);
    assert.deepEqual(report.capabilities, ['security-disclosure']);
    assert.deepEqual(report.data.fields.map(({id, required}) => ({id, required})), [
        {id: 'displayName', required: true},
        {id: 'summary', required: true},
        {id: 'security-disclosure.reportingContact', required: true},
        {id: 'security-disclosure.supportedVersionPolicy', required: true},
        {id: 'security-disclosure.supportedVersionRows', required: false},
        {id: 'security-disclosure.acknowledgementHours', required: false},
    ]);
    assert.deepEqual(report.data.publications, [{
        capability: 'security-disclosure',
        field: 'security-disclosure.reportingContact',
        outputs: ['SECURITY.md'],
    }]);
    assert.deepEqual(fs.readdirSync(projectRoot), []);
});

test('reports repository ownership, support, and funding metadata independently', (t) => {
    const scenarios = [
        {
            capability: 'repository-ownership',
            fields: [
                'displayName', 'summary',
                'repository-ownership.owners', 'repository-ownership.rules',
            ],
            publication: {
                capability: 'repository-ownership',
                field: 'repository-ownership.owners',
                outputs: ['.github/CODEOWNERS'],
            },
        },
        {
            capability: 'support-routing',
            fields: [
                'displayName', 'summary',
                'support-routing.destination', 'support-routing.displayLabel',
                'support-routing.description',
            ],
            publication: {
                capability: 'support-routing',
                field: 'support-routing.destination',
                outputs: ['.github/ISSUE_TEMPLATE/config.yml'],
            },
        },
        {
            capability: 'funding',
            fields: ['displayName', 'summary', 'funding.records'],
            publication: {
                capability: 'funding',
                field: 'funding.records',
                outputs: ['.github/FUNDING.yml'],
            },
        },
    ];

    for (const scenario of scenarios) {
        const projectRoot = makeTempDir();
        t.after(() => fs.rmSync(projectRoot, {recursive: true, force: true}));
        const result = captureWrites(() => main([
            'setup', 'project', 'metadata', '--source=blank', '--adapter=core-only',
            `--capabilities=${scenario.capability}`, '--json',
        ], {projectRoot}));

        assert.equal(result.status, 0, `${scenario.capability}: ${result.stderr}`);
        const report = JSON.parse(result.stdout);
        assert.deepEqual(report.capabilities, [scenario.capability]);
        assert.deepEqual(report.data.fields.map(({id}) => id), scenario.fields);
        assert.deepEqual(report.data.publications, [scenario.publication]);
        assert.deepEqual(fs.readdirSync(projectRoot), []);
    }
});

test('reports release management repository metadata and publication targets', (t) => {
    const projectRoot = makeTempDir();
    t.after(() => fs.rmSync(projectRoot, {recursive: true, force: true}));

    const result = captureWrites(() => main([
        'setup', 'project', 'metadata', '--source=blank', '--adapter=core-only',
        '--capabilities=release-management', '--json',
    ], {projectRoot}));

    assert.equal(result.status, 0, result.stderr);
    const report = JSON.parse(result.stdout);
    assert.deepEqual(report.capabilities, ['release-management']);
    assert.deepEqual(report.data.fields.map(({id}) => id), [
        'displayName',
        'summary',
        'release-management.repository',
    ]);
    assert.deepEqual(report.data.publications, [{
        capability: 'release-management',
        field: 'release-management.repository',
        outputs: [
            'CHANGELOG.md',
            'cliff.toml',
            '.github/workflows/release.yml',
            '.prism/release.json',
        ],
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
            outputs: ['CODE_OF_CONDUCT.md', 'CONTRIBUTING.md'],
        },
        {
            capability: 'github-collaboration',
            field: null,
            outputs: [
                '.github/ISSUE_TEMPLATE/bug_report.yml',
                '.github/ISSUE_TEMPLATE/feature_request.yml',
                '.github/pull_request_template.md',
            ],
        },
    ]);
});

test('normalizes all project capabilities into canonical order', (t) => {
    const projectRoot = makeTempDir();
    t.after(() => fs.rmSync(projectRoot, {recursive: true, force: true}));

    const result = captureWrites(() => main([
        'setup', 'project', 'metadata', '--source=blank', '--adapter=core-only',
        '--capabilities=release-management,funding,support-routing,repository-ownership,security-disclosure,github-collaboration,community-governance,licensing',
        '--json',
    ], {projectRoot}));

    assert.equal(result.status, 0, result.stderr);
    assert.deepEqual(JSON.parse(result.stdout).capabilities, [
        'licensing',
        'community-governance',
        'github-collaboration',
        'security-disclosure',
        'repository-ownership',
        'support-routing',
        'funding',
        'release-management',
    ]);
});

test('rejects non-canonical capability selections without changing the root', (t) => {
    const selections = [
        'licensing,licensing',
        ' licensing',
        'licensing,',
        'unknown-capability',
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

test('normalizes security disclosure metadata without inventing promises', (t) => {
    const projectRoot = makeTempDir();
    t.after(() => fs.rmSync(projectRoot, {recursive: true, force: true}));

    const metadata = normalizeProjectMetadata({
        projectRoot,
        capabilities: ['security-disclosure'],
        input: JSON.stringify({
            schemaVersion: 1,
            displayName: 'Secure Project',
            summary: 'A project with a vulnerability reporting policy.',
            capabilityMetadata: {
                'security-disclosure': {
                    reportingContact: 'security@example.test',
                    supportedVersionPolicy: 'custom',
                    supportedVersionRows: [
                        {version: '2.x', status: 'supported'},
                        {version: '1.x', status: 'unsupported'},
                    ],
                    acknowledgementHours: 72,
                },
            },
        }),
    });

    assert.deepEqual(metadata.capabilityMetadata['security-disclosure'], {
        reportingContact: {kind: 'email', value: 'security@example.test'},
        supportedVersions: {
            policy: 'custom',
            rows: [
                {version: '2.x', status: 'supported'},
                {version: '1.x', status: 'unsupported'},
            ],
        },
        acknowledgementHours: 72,
    });
    assert.deepEqual(validateNormalizedProjectMetadata({
        metadata,
        capabilities: ['security-disclosure'],
    }), metadata);
});

test('normalizes repository ownership, support routing, and funding metadata', (t) => {
    const projectRoot = makeTempDir();
    t.after(() => fs.rmSync(projectRoot, {recursive: true, force: true}));
    const capabilities = ['repository-ownership', 'support-routing', 'funding'];

    const metadata = normalizeProjectMetadata({
        projectRoot,
        capabilities,
        input: JSON.stringify({
            schemaVersion: 1,
            displayName: 'Identity Project',
            summary: 'A project with explicit ownership and public destinations.',
            capabilityMetadata: {
                'repository-ownership': {
                    owners: ['@Example', '@Example/Core'],
                    rules: [{pattern: '/docs/**', owners: ['@Example/Docs']}],
                },
                'support-routing': {
                    destination: 'https://example.test/support',
                },
                funding: {
                    records: [
                        {provider: 'github', account: 'Example'},
                        {provider: 'custom', destination: 'https://example.test/fund'},
                    ],
                },
            },
        }),
    });

    assert.deepEqual(metadata.capabilityMetadata, {
        'repository-ownership': {
            owners: ['@example', '@example/core'],
            rules: [{pattern: '/docs/**', owners: ['@example/docs']}],
        },
        'support-routing': {
            destination: 'https://example.test/support',
            displayLabel: 'Support',
            description: 'Get help with this project.',
        },
        funding: {
            records: [
                {provider: 'github', value: 'Example'},
                {provider: 'custom', value: 'https://example.test/fund'},
            ],
        },
    });
    assert.deepEqual(validateNormalizedProjectMetadata({metadata, capabilities}), metadata);
});

test('normalizes release management repository coordinates without external lookup', (t) => {
    const projectRoot = makeTempDir();
    t.after(() => fs.rmSync(projectRoot, {recursive: true, force: true}));

    const metadata = normalizeProjectMetadata({
        projectRoot,
        capabilities: ['release-management'],
        input: JSON.stringify({
            schemaVersion: 1,
            displayName: 'Release Project',
            summary: 'A project with managed releases.',
            capabilityMetadata: {
                'release-management': {repository: 'Example-Org/Example-Project'},
            },
        }),
    });

    assert.deepEqual(metadata.capabilityMetadata['release-management'], {
        repository: 'example-org/example-project',
    });
    assert.deepEqual(validateNormalizedProjectMetadata({
        metadata,
        capabilities: ['release-management'],
    }), metadata);
    assert.deepEqual(fs.readdirSync(projectRoot), []);
});

test('rejects unsafe release management repository coordinates', (t) => {
    const repositories = [
        'https://github.com/example/project',
        'example/project/extra',
        'example/.project',
        '-example/project',
        'example/project.git',
        'example /project',
        'example/project\n',
        'example/',
    ];
    for (const repository of repositories) {
        const projectRoot = makeTempDir();
        t.after(() => fs.rmSync(projectRoot, {recursive: true, force: true}));
        assert.throws(() => normalizeProjectMetadata({
            projectRoot,
            capabilities: ['release-management'],
            input: JSON.stringify({
                schemaVersion: 1,
                displayName: 'Unsafe Release Project',
                summary: 'A project with invalid release metadata.',
                capabilityMetadata: {
                    'release-management': {repository},
                },
            }),
        }), /release/);
        assert.deepEqual(fs.readdirSync(projectRoot), []);
    }
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

test('rejects unsafe and non-closed security identity metadata', (t) => {
    const cases = [
        {
            capabilities: ['security-disclosure'],
            metadata: {
                'security-disclosure': {
                    reportingContact: 'http://example.test/report',
                    supportedVersionPolicy: 'latest-release',
                },
            },
        },
        {
            capabilities: ['security-disclosure'],
            metadata: {
                'security-disclosure': {
                    reportingContact: 'security@example.test',
                    supportedVersionPolicy: 'latest-release',
                    supportedVersionRows: [{version: '1.x', status: 'supported'}],
                },
            },
        },
        {
            capabilities: ['security-disclosure'],
            metadata: {
                'security-disclosure': {
                    reportingContact: 'security@example.test',
                    supportedVersionPolicy: 'custom',
                    supportedVersionRows: [],
                    acknowledgementHours: 0,
                },
            },
        },
        {
            capabilities: ['repository-ownership'],
            metadata: {'repository-ownership': {owners: ['owner']}},
        },
        {
            capabilities: ['repository-ownership'],
            metadata: {
                'repository-ownership': {
                    owners: ['@owner'],
                    rules: [{pattern: '/../secret', owners: ['@owner']}],
                },
            },
        },
        {
            capabilities: ['support-routing'],
            metadata: {'support-routing': {destination: 'http://example.test/support'}},
        },
        {
            capabilities: ['funding'],
            metadata: {
                funding: {
                    records: [
                        {provider: 'patreon', account: 'one'},
                        {provider: 'patreon', account: 'two'},
                    ],
                },
            },
        },
        {
            capabilities: ['funding'],
            metadata: {
                funding: {
                    records: [{provider: 'custom', destination: 'http://example.test/fund'}],
                },
            },
        },
    ];

    for (const entry of cases) {
        const projectRoot = makeTempDir();
        t.after(() => fs.rmSync(projectRoot, {recursive: true, force: true}));
        assert.throws(() => normalizeProjectMetadata({
            projectRoot,
            capabilities: entry.capabilities,
            input: JSON.stringify({
                schemaVersion: 1,
                displayName: 'Unsafe Project',
                summary: 'A project with invalid public metadata.',
                capabilityMetadata: entry.metadata,
            }),
        }));
        assert.deepEqual(fs.readdirSync(projectRoot), []);
    }
});

test('renders a trusted release management provider from publishable candidate packages', (t) => {
    const candidateRoot = makeTempDir();
    const packageRoot = makeTempDir();
    t.after(() => fs.rmSync(candidateRoot, {recursive: true, force: true}));
    t.after(() => fs.rmSync(packageRoot, {recursive: true, force: true}));
    fs.writeFileSync(path.join(packageRoot, 'package.json'), `${JSON.stringify({
        name: '@example/project',
        version: '0.1.0',
    }, null, 2)}\n`);
    const {renderReleaseManagementProvider} = require(
        '../../packages/prism-core/scripts/prism-tool/bootstrap-release-provider'
    );

    const report = renderReleaseManagementProvider({
        coreRoot: CORE_ROOT,
        candidateRoot,
        packageRoot,
        request: {
            schemaVersion: 1,
            source: {mode: 'BLANK', evidence: null},
            capabilities: ['release-management'],
            metadata: {
                schemaVersion: 1,
                displayName: 'Release Project',
                summary: 'A project with managed releases.',
                suggestedDisplayName: 'release-project',
                capabilityMetadata: {
                    'release-management': {repository: 'example/project'},
                },
            },
            adapter: null,
        },
    });

    assert.equal(report.status, 'GO');
    assert.equal(report.provider.id, 'release-management');
    assert.deepEqual(report.outputs.map(({path: outputPath}) => outputPath), [
        'CHANGELOG.md',
        'cliff.toml',
        '.github/workflows/release.yml',
        '.prism/release.json',
    ]);
    assert.match(fs.readFileSync(path.join(candidateRoot, 'cliff.toml'), 'utf8'),
        /github\.com\/example\/project\/releases/);
    assert.deepEqual(JSON.parse(fs.readFileSync(
        path.join(candidateRoot, '.prism', 'release.json'),
        'utf8'
    )).packages, ['.']);
    assert.equal(fs.existsSync(path.join(packageRoot, '.pi')), false);
});

test('rejects release management when package candidates or trusted resources are invalid', (t) => {
    const candidateRoot = makeTempDir();
    const packageRoot = makeTempDir();
    const fixtureCore = makeTempDir();
    t.after(() => fs.rmSync(candidateRoot, {recursive: true, force: true}));
    t.after(() => fs.rmSync(packageRoot, {recursive: true, force: true}));
    t.after(() => fs.rmSync(fixtureCore, {recursive: true, force: true}));
    fs.cpSync(CORE_ROOT, fixtureCore, {recursive: true});
    const {renderReleaseManagementProvider} = require(
        '../../packages/prism-core/scripts/prism-tool/bootstrap-release-provider'
    );
    const request = {
        schemaVersion: 1,
        source: {mode: 'BLANK', evidence: null},
        capabilities: ['release-management'],
        metadata: {
            schemaVersion: 1,
            displayName: 'Release Project',
            summary: 'A project with managed releases.',
            suggestedDisplayName: 'release-project',
            capabilityMetadata: {
                'release-management': {repository: 'example/project'},
            },
        },
        adapter: null,
    };
    fs.writeFileSync(path.join(packageRoot, 'package.json'), `${JSON.stringify({
        name: '@example/private',
        version: '0.1.0',
        private: true,
    }, null, 2)}\n`);

    assert.throws(() => renderReleaseManagementProvider({
        coreRoot: CORE_ROOT,
        candidateRoot,
        packageRoot,
        request,
    }), /no publishable release packages/);

    fs.writeFileSync(path.join(packageRoot, 'package.json'), `${JSON.stringify({
        name: '@example/public',
        version: '0.1.0',
    }, null, 2)}\n`);
    const templatePath = path.join(
        fixtureCore,
        'config',
        'bootstrap',
        'release',
        'cliff.toml'
    );
    fs.writeFileSync(
        templatePath,
        fs.readFileSync(templatePath, 'utf8').replaceAll('{{REPOSITORY_COORDINATE}}', 'example/fixed')
    );
    assert.throws(() => renderReleaseManagementProvider({
        coreRoot: fixtureCore,
        candidateRoot,
        packageRoot,
        request,
    }), /cliff template is invalid/);
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
        packageVersion: CORE_VERSION,
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

test('rejects Markdown injection in conduct-contact metadata', (t) => {
    const projectRoot = makeTempDir();
    t.after(() => fs.rmSync(projectRoot, {recursive: true, force: true}));

    for (const conductContact of [
        'attacker](https://example.test)@example.test',
        '.user@example.test',
        'user..name@example.test',
        'user@-example.test',
        'user@example-.test',
    ]) {
        assert.throws(() => normalizeProjectMetadata({
            projectRoot,
            capabilities: ['community-governance'],
            currentYear: 2026,
            input: JSON.stringify({
                schemaVersion: 1,
                displayName: 'Unsafe Contact Project',
                summary: 'A project with unsafe conduct metadata.',
                capabilityMetadata: {
                    'community-governance': {conductContact},
                },
            }),
        }), /conduct contact is invalid/, conductContact);
    }
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

test('renders a security policy without an implicit acknowledgement promise', (t) => {
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
            capabilities: ['security-disclosure'],
            metadata: {
                schemaVersion: 1,
                displayName: 'Secure Project',
                summary: 'A project with a vulnerability reporting policy.',
                suggestedDisplayName: 'secure-project',
                capabilityMetadata: {
                    'security-disclosure': {
                        reportingContact: {
                            kind: 'https',
                            value: 'https://security.example.test/report',
                        },
                        supportedVersions: {
                            policy: 'latest-release',
                            rows: [],
                        },
                    },
                },
            },
            adapter: null,
        },
    });

    assert.deepEqual(reports[0].outputs.map(({path: outputPath, mode}) => ({
        path: outputPath,
        mode,
    })), [{path: 'SECURITY.md', mode: 0o644}]);
    const contents = fs.readFileSync(path.join(candidateRoot, 'SECURITY.md'), 'utf8');
    assert.match(contents, /Security fixes are provided for the latest released version\./);
    assert.match(contents, /https:\/\/security\.example\.test\/report/);
    assert.doesNotMatch(contents, /acknowledge|within \d+ hours/i);
    assert.deepEqual(reports[0].effects, []);
    assert.equal(reports[0].checks[0].status, 'PASS');
});

test('renders custom supported versions and an explicit acknowledgement target', (t) => {
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
            capabilities: ['security-disclosure'],
            metadata: {
                schemaVersion: 1,
                displayName: 'Secure Project',
                summary: 'A project with explicit supported versions.',
                suggestedDisplayName: 'secure-project',
                capabilityMetadata: {
                    'security-disclosure': {
                        reportingContact: {kind: 'email', value: 'security@example.test'},
                        supportedVersions: {
                            policy: 'custom',
                            rows: [
                                {version: '2.x', status: 'supported'},
                                {version: '1.x', status: 'unsupported'},
                            ],
                        },
                        acknowledgementHours: 72,
                    },
                },
            },
            adapter: null,
        },
    });

    const contents = fs.readFileSync(path.join(candidateRoot, 'SECURITY.md'), 'utf8');
    assert.match(contents, /\| 2\.x \| Yes \|/);
    assert.match(contents, /\| 1\.x \| No \|/);
    assert.match(contents, /mailto:security@example\.test/);
    assert.match(contents, /acknowledge complete vulnerability reports within 72 hours/);
});

test('renders repository ownership with a default and contained path rules', (t) => {
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
            capabilities: ['repository-ownership'],
            metadata: {
                schemaVersion: 1,
                displayName: 'Owned Project',
                summary: 'A project with explicit review ownership.',
                suggestedDisplayName: 'owned-project',
                capabilityMetadata: {
                    'repository-ownership': {
                        owners: ['@example', '@example/core'],
                        rules: [{pattern: '/docs/**', owners: ['@example/docs']}],
                    },
                },
            },
            adapter: null,
        },
    });

    assert.deepEqual(reports[0].outputs.map(({path: outputPath, mode}) => ({
        path: outputPath,
        mode,
    })), [{path: '.github/CODEOWNERS', mode: 0o644}]);
    assert.equal(
        fs.readFileSync(path.join(candidateRoot, '.github', 'CODEOWNERS'), 'utf8'),
        '*\t@example @example/core\n/docs/**\t@example/docs\n'
    );
});

test('renders support routing with safe defaults and blank issues enabled', (t) => {
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
            capabilities: ['support-routing'],
            metadata: {
                schemaVersion: 1,
                displayName: 'Supported Project',
                summary: 'A project with an explicit support destination.',
                suggestedDisplayName: 'supported-project',
                capabilityMetadata: {
                    'support-routing': {
                        destination: 'https://example.test/support',
                        displayLabel: 'Support',
                        description: 'Get help with this project.',
                    },
                },
            },
            adapter: null,
        },
    });

    assert.deepEqual(reports[0].outputs.map(({path: outputPath, mode}) => ({
        path: outputPath,
        mode,
    })), [{path: '.github/ISSUE_TEMPLATE/config.yml', mode: 0o644}]);
    assert.equal(
        fs.readFileSync(path.join(candidateRoot, '.github', 'ISSUE_TEMPLATE', 'config.yml'), 'utf8'),
        'blank_issues_enabled: true\n' +
        'contact_links:\n' +
        '  - name: "Support"\n' +
        '    url: "https://example.test/support"\n' +
        '    about: "Get help with this project."\n'
    );
});

test('disables blank issues when collaboration and support are selected together', (t) => {
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
            capabilities: ['github-collaboration', 'support-routing'],
            metadata: {
                schemaVersion: 1,
                displayName: 'Collaborative Project',
                summary: 'A project with structured intake and support routing.',
                suggestedDisplayName: 'collaborative-project',
                capabilityMetadata: {
                    'github-collaboration': {},
                    'support-routing': {
                        destination: 'https://example.test/support',
                        displayLabel: 'Help: support',
                        description: 'Ask a question before filing an issue.',
                    },
                },
            },
            adapter: null,
        },
    });

    const contents = fs.readFileSync(
        path.join(candidateRoot, '.github', 'ISSUE_TEMPLATE', 'config.yml'),
        'utf8'
    );
    assert.match(contents, /^blank_issues_enabled: false$/m);
    assert.match(contents, /name: "Help: support"/);
});

test('renders funding records in closed provider order', (t) => {
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
            capabilities: ['funding'],
            metadata: {
                schemaVersion: 1,
                displayName: 'Funded Project',
                summary: 'A project with approved funding identities.',
                suggestedDisplayName: 'funded-project',
                capabilityMetadata: {
                    funding: {
                        records: [
                            {provider: 'github', value: 'example'},
                            {provider: 'github', value: 'example-team'},
                            {provider: 'open_collective', value: 'example'},
                            {provider: 'custom', value: 'https://example.test/fund'},
                        ],
                    },
                },
            },
            adapter: null,
        },
    });

    assert.deepEqual(reports[0].outputs.map(({path: outputPath, mode}) => ({
        path: outputPath,
        mode,
    })), [{path: '.github/FUNDING.yml', mode: 0o644}]);
    assert.equal(
        fs.readFileSync(path.join(candidateRoot, '.github', 'FUNDING.yml'), 'utf8'),
        'github: ["example","example-team"]\n' +
        'open_collective: "example"\n' +
        'custom: ["https://example.test/fund"]\n'
    );
});

test('declares exact trusted ownership for selected profile providers', () => {
    const {loadCoreProfileProviderDescriptors} = require(
        '../../packages/prism-core/scripts/prism-tool/bootstrap-profile-providers'
    );

    const descriptors = loadCoreProfileProviderDescriptors({
        coreRoot: CORE_ROOT,
        capabilities: [
            'licensing', 'community-governance', 'github-collaboration',
            'security-disclosure', 'repository-ownership', 'support-routing', 'funding',
            'release-management',
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
        {id: 'security-disclosure', outputs: ['SECURITY.md']},
        {id: 'repository-ownership', outputs: ['.github/CODEOWNERS']},
        {id: 'support-routing', outputs: ['.github/ISSUE_TEMPLATE/config.yml']},
        {id: 'funding', outputs: ['.github/FUNDING.yml']},
        {
            id: 'release-management',
            outputs: [
                'CHANGELOG.md',
                'cliff.toml',
                '.github/workflows/release.yml',
                '.prism/release.json',
            ],
        },
    ]);
    for (const descriptor of descriptors) {
        assert.equal(descriptor.packageName, '@kyaulabs/prism-core');
        assert.equal(descriptor.packageVersion, CORE_VERSION);
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
            'security-disclosure', 'repository-ownership', 'support-routing', 'funding',
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
                    conductContact: {
                        kind: 'https', value: 'https://example.test/conduct_(team)',
                    },
                },
                'github-collaboration': {},
                'security-disclosure': {
                    reportingContact: {kind: 'email', value: 'security@example.test'},
                    supportedVersions: {policy: 'latest-release', rows: []},
                },
                'repository-ownership': {
                    owners: ['@example'],
                    rules: [{pattern: '/docs/**', owners: ['@example/docs']}],
                },
                'support-routing': {
                    destination: 'https://example.test/support',
                    displayLabel: 'Support',
                    description: 'Get help with this project.',
                },
                funding: {
                    records: [{provider: 'github', value: 'example'}],
                },
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
    const conduct = fs.readFileSync(path.join(roots[0], 'CODE_OF_CONDUCT.md'), 'utf8');
    assert.match(
        conduct,
        /\[https:\/\/example\.test\/conduct_\(team\)\]\(<https:\/\/example\.test\/conduct_\(team\)>\)/
    );
});

test('plans each project capability independently through the public launcher', (t) => {
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
        {
            capability: 'security-disclosure',
            capabilityMetadata: {
                'security-disclosure': {
                    reportingContact: 'security@example.test',
                    supportedVersionPolicy: 'latest-release',
                },
            },
            outputs: ['SECURITY.md'],
        },
        {
            capability: 'repository-ownership',
            capabilityMetadata: {
                'repository-ownership': {owners: ['@example']},
            },
            outputs: ['.github/CODEOWNERS'],
        },
        {
            capability: 'support-routing',
            capabilityMetadata: {
                'support-routing': {destination: 'https://example.test/support'},
            },
            outputs: ['.github/ISSUE_TEMPLATE/config.yml'],
        },
        {
            capability: 'funding',
            capabilityMetadata: {
                funding: {records: [{provider: 'github', account: 'example'}]},
            },
            outputs: ['.github/FUNDING.yml'],
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
        (value) => {
            value.capabilities = null;
            delete value.capabilityMetadata;
        },
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
