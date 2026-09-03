// $KYAULabs: toolchain-contract.test.js kyau@aura.kyaulabs 2026/09/02 -0700 Exp $

'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const {makeTempDir, writeJson} = require('./helpers');
const {
    assertPackageParity,
    loadContract,
    validateContract,
} = require('../../packages/prism-core/scripts/prism-tool/contract');

const root = path.resolve(__dirname, '../..');
const coreContract = path.join(root, 'packages/prism-core/toolchain.json');
const adapterContract = path.join(root, 'packages/prism-php-web/toolchain.json');

function boundedSemgrepContract(versionRequirement = {
    mode: 'range',
    minimum: '1.173.0',
    maximumExclusive: '2.0.0',
}) {
    return {
        schemaVersion: 1,
        package: '@kyaulabs/example',
        role: 'core',
        components: [{
            id: 'semgrep',
            kind: 'command',
            ecosystem: 'pypi',
            package: 'semgrep',
            versionRequirement,
            provisioning: 'external',
            authentication: 'optional',
            executable: 'semgrep',
            versionArguments: ['--version'],
            argumentPolicy: {mode: 'first-token', allowed: ['scan', 'ci']},
        }],
    };
}

function boundedOcrContract(versionRequirement = {
    mode: 'range',
    minimum: '1.9.1',
    maximumExclusive: '2.0.0',
}) {
    return {
        schemaVersion: 1,
        package: '@kyaulabs/example',
        role: 'core',
        components: [{
            id: 'ocr',
            kind: 'command',
            ecosystem: 'npm',
            package: '@alibaba-group/open-code-review',
            versionRequirement,
            provisioning: 'external',
            authentication: 'required',
            executable: 'ocr',
            versionArguments: ['--version'],
            argumentPolicy: {mode: 'first-token', allowed: ['review', 'scan']},
        }],
    };
}

function serverProfileContract(overrides = {}) {
    return {
        schemaVersion: 1,
        package: '@fixture/adapter',
        role: 'adapter',
        components: [{
            id: 'fixture-client',
            kind: 'command',
            ecosystem: 'npm',
            package: 'fixture-client',
            version: '1.0.0',
            provisioning: 'consumer-dev',
            authentication: 'none',
            executable: 'fixture-client',
            versionArguments: ['--version'],
            argumentPolicy: {mode: 'passthrough'},
        }],
        serverProfiles: [{
            id: 'fixture',
            host: '127.0.0.1',
            preferredPort: 8080,
            startupTimeoutMs: 10000,
            server: {
                executable: 'fixture-server',
                arguments: ['--listen', '{host}:{port}'],
            },
            health: {
                executable: 'fixture-health',
                arguments: ['--host', '{host}', '--port', '{port}'],
            },
            clients: [{
                toolId: 'fixture-client',
                environment: {FIXTURE_ENDPOINT: 'tcp://{host}:{port}'},
            }],
            ...overrides,
        }],
    };
}

test('loads both schema-v1 package contracts', () => {
    assert.equal(loadContract(coreContract).role, 'core');
    assert.equal(loadContract(adapterContract).role, 'adapter');
});

test('accepts a closed adapter quality-provider declaration', () => {
    const input = serverProfileContract();
    input.qualityProvider = {
        id: 'fixture-quality',
        protocolVersion: 1,
        gates: ['fixture.lint', 'fixture.test'],
    };

    const contract = validateContract(input, 'fixture.json');

    assert.deepEqual(contract.qualityProvider, {
        id: 'fixture-quality',
        protocolVersion: 1,
        gates: ['fixture.lint', 'fixture.test'],
    });
    assert.equal(Object.isFrozen(contract.qualityProvider), true);
});

test('rejects malformed adapter quality-provider declarations', () => {
    const invalid = [
        {id: 'fixture-quality', protocolVersion: 2, gates: ['fixture.test']},
        {id: 'fixture-quality', protocolVersion: 1, gates: []},
        {id: 'fixture-quality', protocolVersion: 1, gates: ['fixture.test', 'fixture.test']},
        {id: 'fixture-quality', protocolVersion: 1, gates: ['fixture.test', 'fixture.lint']},
        {id: 'fixture-quality', protocolVersion: 1, gates: ['fixture test']},
        {id: 'fixture-quality', protocolVersion: 1, gates: ['fixture.test'], command: 'npm test'},
    ];
    for (const qualityProvider of invalid) {
        const contract = serverProfileContract();
        contract.qualityProvider = qualityProvider;
        assert.throws(() => validateContract(contract, 'fixture.json'), /quality provider/);
    }
    const core = boundedSemgrepContract();
    core.qualityProvider = {id: 'fixture-quality', protocolVersion: 1, gates: ['fixture.test']};
    assert.throws(() => validateContract(core, 'fixture.json'), /quality provider/);
});

test('accepts and freezes a bounded adapter server profile', () => {
    const contract = validateContract(serverProfileContract(), 'fixture.json');

    assert.equal(contract.serverProfiles[0].preferredPort, 8080);
    assert.equal(Object.isFrozen(contract.serverProfiles[0]), true);
});

test('rejects malformed or unsafe server profiles', () => {
    const invalid = [
        {...serverProfileContract(), role: 'core'},
        serverProfileContract({id: 'UPPER'}),
        serverProfileContract({host: '0.0.0.0'}),
        serverProfileContract({preferredPort: 0}),
        serverProfileContract({preferredPort: 65536}),
        serverProfileContract({startupTimeoutMs: 99}),
        serverProfileContract({server: {executable: '../server', arguments: []}}),
        serverProfileContract({server: {executable: 'server', arguments: ['$(id)']}}),
        serverProfileContract({clients: [{toolId: 'missing', environment: {}}]}),
        serverProfileContract({
            clients: [{toolId: 'fixture-client', environment: {'bad-key': 'x'}}],
        }),
    ];

    for (const contract of invalid) {
        assert.throws(() => validateContract(contract, 'fixture.json'), /fixture\.json/);
    }
});

test('rejects unmatched closing braces in server templates', () => {
    const contract = serverProfileContract({
        clients: [{
            toolId: 'fixture-client',
            environment: {FIXTURE_ENDPOINT: 'tcp://{host}:{port}}'},
        }],
    });

    assert.throws(
        () => validateContract(contract, 'fixture.json'),
        /server profile fixture environment value is invalid/
    );
});

test('rejects duplicate server profiles and duplicate clients', () => {
    const duplicateProfile = serverProfileContract();
    duplicateProfile.serverProfiles.push({...duplicateProfile.serverProfiles[0]});
    const duplicateClient = serverProfileContract();
    duplicateClient.serverProfiles[0].clients.push(
        {...duplicateClient.serverProfiles[0].clients[0]}
    );

    assert.throws(
        () => validateContract(duplicateProfile, 'fixture.json'),
        /duplicate server profile/
    );
    assert.throws(
        () => validateContract(duplicateClient, 'fixture.json'),
        /duplicate server client/
    );
});

test('declares the exact bundled Markdown engine', () => {
    const contract = loadContract(coreContract);
    const component = contract.components.find(({id}) => id === 'markdownlint-cli2');
    const corePackage = require('../../packages/prism-core/package.json');
    const rootPackage = require('../../package.json');
    const lock = require('../../package-lock.json');

    assert.deepEqual(component, {
        id: 'markdownlint-cli2',
        kind: 'command',
        ecosystem: 'npm',
        package: 'markdownlint-cli2',
        version: '0.23.2',
        provisioning: 'bundled',
        authentication: 'none',
        executable: 'markdownlint-cli2',
        versionArguments: ['--version'],
        argumentPolicy: {mode: 'passthrough'},
    });
    assert.equal(corePackage.dependencies['markdownlint-cli2'], '0.23.2');
    assert.equal(rootPackage.devDependencies['markdownlint-cli2'], '0.23.2');
    assert.equal(lock.packages['node_modules/markdownlint-cli2'].version, '0.23.2');
});

test('declares the approved bounded external compatibility requirements', () => {
    const components = new Map(
        loadContract(coreContract).components.map((component) => [component.id, component])
    );

    assert.equal(components.get('semgrep').version, undefined);
    assert.deepEqual(components.get('semgrep').versionRequirement, {
        mode: 'range',
        minimum: '1.173.0',
        maximumExclusive: '2.0.0',
    });
    assert.equal(components.get('ocr').version, undefined);
    assert.deepEqual(components.get('ocr').versionRequirement, {
        mode: 'range',
        minimum: '1.9.1',
        maximumExclusive: '2.0.0',
    });
    assert.equal(components.get('ocr').executionTimeoutMs, 600000);
});

test('accepts the bounded OCR external version requirement', () => {
    assert.doesNotThrow(() => validateContract(boundedOcrContract(), 'fixture.json'));
});

test('accepts the bounded Semgrep external version requirement', () => {
    assert.doesNotThrow(() => validateContract(boundedSemgrepContract(), 'fixture.json'));
});

test('rejects empty and inverted bounded OCR intervals', () => {
    for (const versionRequirement of [
        {mode: 'range', minimum: '1.9.1', maximumExclusive: '1.9.1'},
        {mode: 'range', minimum: '2.0.0', maximumExclusive: '1.9.1'},
    ]) {
        assert.throws(
            () => validateContract(boundedOcrContract(versionRequirement), 'fixture.json'),
            /version requirement/
        );
    }
});

test('rejects bounded requirements for undeclared external package identities', () => {
    const contracts = [boundedSemgrepContract(), boundedOcrContract()];
    for (const contract of contracts) {
        contract.components[0].package = 'other-tool';
        assert.throws(
            () => validateContract(contract, 'fixture.json'),
            /cannot use a bounded version requirement/
        );
    }
});

test('accepts the 15-minute execution timeout ceiling', () => {
    const contract = boundedOcrContract();
    contract.components[0].executionTimeoutMs = 900000;

    assert.doesNotThrow(() => validateContract(contract, 'fixture.json'));
});

test('rejects execution timeouts outside the bounded contract policy', () => {
    for (const executionTimeoutMs of [999, 900001, 1.5, '360000']) {
        const contract = boundedOcrContract();
        contract.components[0].executionTimeoutMs = executionTimeoutMs;
        assert.throws(
            () => validateContract(contract, 'fixture.json'),
            /invalid execution timeout/
        );
    }
});

test('requires mutually exclusive valid version policies', () => {
    const both = boundedOcrContract();
    both.components[0].version = '1.9.1';
    const neither = boundedOcrContract();
    delete neither.components[0].versionRequirement;
    const prereleaseBoundary = boundedOcrContract({
        mode: 'range',
        minimum: '1.9.1-beta.1',
        maximumExclusive: '2.0.0',
    });
    const unknownRangeKey = boundedOcrContract({
        mode: 'range',
        minimum: '1.9.1',
        maximumExclusive: '2.0.0',
        includePrerelease: true,
    });

    for (const contract of [both, neither, prereleaseBoundary, unknownRangeKey]) {
        assert.throws(() => validateContract(contract, 'fixture.json'), /version/);
    }
});

test('rejects an unstructured component version range', () => {
    const invalid = {
        schemaVersion: 1,
        package: '@kyaulabs/example',
        role: 'core',
        components: [{
            id: 'library',
            kind: 'library',
            ecosystem: 'npm',
            package: 'library',
            version: '^1.0.0',
            provisioning: 'bundled',
            authentication: 'none',
        }],
    };

    assert.throws(() => validateContract(invalid, 'fixture.json'), /exact version/);
});

test('rejects a duplicate component id', () => {
    const component = {
        id: 'same',
        kind: 'library',
        ecosystem: 'npm',
        package: 'library',
        version: '1.0.0',
        provisioning: 'bundled',
        authentication: 'none',
    };
    const invalid = {
        schemaVersion: 1,
        package: '@kyaulabs/example',
        role: 'core',
        components: [component, {...component, package: 'other'}],
    };

    assert.throws(() => validateContract(invalid, 'fixture.json'), /duplicate component/);
});

test('requires bundled npm components to match exact package dependencies', () => {
    const contract = loadContract(coreContract);

    assert.doesNotThrow(() => {
        assertPackageParity(
            contract,
            require('../../packages/prism-core/package.json')
        );
    });
    assert.throws(
        () => assertPackageParity(contract, {
            name: '@kyaulabs/prism-core',
            dependencies: {commitlint: '^21'},
        }),
        /package dependency drift/
    );
});

test('pins every approved root npm tool exactly and drops the unowned language server', () => {
    const rootPackage = require('../../package.json');
    const expected = {
        '@commitlint/config-conventional': '21.2.2',
        '@eslint/js': '10.0.1',
        commitlint: '21.2.2',
        eslint: '10.8.1',
        'git-cliff': '2.13.1',
        'markdownlint-cli2': '0.23.2',
        playwright: '1.62.1',
        sass: '1.102.0',
        stylelint: '17.14.1',
        'stylelint-config-standard-scss': '17.0.0',
        'uglify-js': '3.19.3',
    };

    const lock = require('../../package-lock.json');
    for (const [name, version] of Object.entries(expected)) {
        assert.equal(rootPackage.devDependencies[name], version);
        assert.equal(lock.packages[`node_modules/${name}`].version, version);
    }
    assert.equal(rootPackage.devDependencies['@stylelint/language-server'], undefined);
    assert.equal(lock.packages['node_modules/@stylelint/language-server'], undefined);
});

test('rejects malformed contract shapes at the boundary', () => {
    const library = {
        id: 'library',
        kind: 'library',
        ecosystem: 'npm',
        package: 'library',
        version: '1.0.0',
        provisioning: 'bundled',
        authentication: 'none',
    };
    const command = {
        ...library,
        id: 'command',
        kind: 'command',
        executable: 'command',
        versionArguments: ['--version'],
        argumentPolicy: {mode: 'passthrough'},
    };
    const valid = {
        schemaVersion: 1,
        package: '@kyaulabs/example',
        role: 'core',
        components: [command],
    };
    const invalidContracts = [
        null,
        {...valid, schemaVersion: 2},
        {...valid, unknown: true},
        {...valid, role: 'worker'},
        {...valid, components: [{...command, kind: 'binary'}]},
        {...valid, components: [{...command, ecosystem: 'cargo'}]},
        {...valid, components: [{...command, provisioning: 'global'}]},
        {...valid, components: [{...command, authentication: 'token'}]},
        {...valid, components: [{...command, executable: undefined}]},
        {...valid, components: [{...library, executable: 'library'}]},
        {...valid, components: [{...command, argumentPolicy: {mode: 'first-token', allowed: []}}]},
        {...valid, components: [{...command, argumentPolicy: {mode: 'first-token', allowed: ['review now']}}]},
        {...valid, components: [{...command, provisioning: 'consumer-dev'}]},
        {...valid, browserTargets: ['chromium']},
        {
            ...valid,
            role: 'adapter',
            components: [{...command, provisioning: 'consumer-dev'}],
            browserTargets: ['firefox'],
        },
    ];

    for (const invalid of invalidContracts) {
        assert.throws(() => validateContract(invalid, 'fixture.json'), /fixture\.json/);
    }
});

test('loads contracts through a bounded immutable file boundary', (t) => {
    const directory = makeTempDir();
    t.after(() => fs.rmSync(directory, {recursive: true, force: true}));
    const value = {
        schemaVersion: 1,
        package: '@kyaulabs/example',
        role: 'core',
        components: [{
            id: 'library',
            kind: 'library',
            ecosystem: 'npm',
            package: 'library',
            version: '1.0.0',
            provisioning: 'bundled',
            authentication: 'none',
        }],
    };
    const validPath = path.join(directory, 'valid.json');
    writeJson(validPath, value);
    const contract = loadContract(validPath);

    assert.equal(Object.isFrozen(contract), true);
    assert.equal(Object.isFrozen(contract.components), true);
    assert.equal(Object.isFrozen(contract.components[0]), true);

    const malformedPath = path.join(directory, 'malformed.json');
    fs.writeFileSync(malformedPath, '{invalid');
    assert.throws(() => loadContract(malformedPath), /malformed\.json: invalid JSON/);

    const oversizedPath = path.join(directory, 'oversized.json');
    fs.writeFileSync(oversizedPath, 'x'.repeat(1048577));
    assert.throws(() => loadContract(oversizedPath), /oversized\.json: contract exceeds 1048576 bytes/);

    const symlinkPath = path.join(directory, 'symlink.json');
    fs.symlinkSync(validPath, symlinkPath);
    assert.throws(() => loadContract(symlinkPath), /symlink\.json: symbolic links are not allowed/);
});

test('loads the PHP browser fixture as an adapter-owned server profile', () => {
    const contract = loadContract(adapterContract);
    const [profile] = contract.serverProfiles;

    assert.equal(profile.id, 'browser-fixture');
    assert.equal(profile.host, '127.0.0.1');
    assert.equal(profile.preferredPort, 8080);
    assert.deepEqual(profile.clients, [{
        toolId: 'pest',
        environment: {PEST_BROWSER_BASE_URL: 'http://{host}:{port}'},
    }]);
});

test('declares the exact PHP web adapter components and registration', () => {
    const contract = loadContract(adapterContract);
    const packageJson = require('../../packages/prism-php-web/package.json');
    const expected = new Map([
        ['php-cs-fixer', '3.95.18'],
        ['pest', '5.1.1'],
        ['pest-browser', '5.0.1'],
        ['sass', '1.102.0'],
        ['uglify-js', '3.19.3'],
        ['eslint', '10.8.1'],
        ['eslint-js', '10.0.1'],
        ['stylelint', '17.14.1'],
        ['stylelint-config-scss', '17.0.0'],
        ['typescript', '7.0.2'],
        ['playwright', '1.62.1'],
    ]);

    assert.deepEqual(
        new Map(contract.components.map(({id, version}) => [id, version])),
        expected
    );
    assert.deepEqual(contract.browserTargets, ['chromium']);
    assert.deepEqual(packageJson.prism, {
        adapter: true,
        bootstrapProtocol: 1,
        toolchain: './toolchain.json',
        handler: './scripts/prism-tool-adapter.js',
        review: './config/prism-review.json',
    });
});

// vim: ft=javascript sts=4 sw=4 ts=4 et :
