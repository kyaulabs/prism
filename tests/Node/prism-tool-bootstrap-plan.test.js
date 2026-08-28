// $KYAULabs: prism-tool-bootstrap-plan.test.js kyau@aura.kyaulabs 2026/08/27 -0700 Exp $

'use strict';

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const {makeTempDir} = require('./helpers');
const {createTemplateFixture} = require('./fixtures/template-source');
const {main} = require('../../packages/prism-core/scripts/prism-tool/cli');
const {
    readBootstrapJournal,
} = require('../../packages/prism-core/scripts/prism-tool/bootstrap-journal');
const phpWebHandler = require('../../packages/prism-php-web/scripts/prism-tool-adapter');
const {
    validateBootstrapProjectPlan,
} = require('../../packages/prism-core/scripts/prism-tool/bootstrap-plan');
const {
    validateAdapterEvidence,
} = require('../../packages/prism-core/scripts/prism-tool/bootstrap-composer');
const {
    applyBootstrapProject,
} = require('../../packages/prism-core/scripts/prism-tool/bootstrap-transaction');
const {renderCoreBaseline} = require(
    '../../packages/prism-core/scripts/prism-tool/bootstrap-providers'
);

const ATTEMPT_ID = '12345678-1234-4123-8123-123456789abc';
const CORE_SOURCE_ROOT = path.resolve(__dirname, '../../packages/prism-core');
const CORE_VERSION = JSON.parse(
    fs.readFileSync(path.join(CORE_SOURCE_ROOT, 'package.json'), 'utf8')
).version;
const ADAPTER_ROOT = path.resolve(__dirname, '../../packages/prism-php-web');
const ADAPTER_VERSION = JSON.parse(
    fs.readFileSync(path.join(ADAPTER_ROOT, 'package.json'), 'utf8')
).version;
const ADAPTER_CONTRACT = JSON.parse(
    fs.readFileSync(path.join(ADAPTER_ROOT, 'toolchain.json'), 'utf8')
);
const TEMPLATE_SOURCE = Object.freeze({
    mode: 'TEMPLATE',
    evidence: Object.freeze({
        schemaVersion: 1,
        source: 'TEMPLATE',
        templateId: 'kyaulabs/template',
        defaultBranch: 'develop',
        commitSha: 'b'.repeat(40),
        treeSha: 'a'.repeat(40),
        manifest: Object.freeze({
            path: '.prism/template-manifest.json',
            blobSha: 'c'.repeat(40),
            size: 1024,
            sha256: 'd'.repeat(64),
        }),
        classificationSha256: 'e'.repeat(64),
    }),
});
const ADAPTER_INTEGRITY = 'sha512-QkJCQkJCQkJCQkJCQkJCQkJCQkJCQkJCQkJCQkJCQkJCQkJCQkJCQkJCQkJCQkJCQkJCQkJCQkJCQkJCQkJCQg==';
const projectCoreRoots = new Map();
let signedAdapterFixture;

function writeJson(filePath, value) {
    fs.mkdirSync(path.dirname(filePath), {recursive: true});
    fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

function signedEnvelope(payload) {
    const pair = crypto.generateKeyPairSync('ed25519');
    const payloadBytes = Buffer.from(JSON.stringify(payload), 'utf8');
    const publicKeyBytes = pair.publicKey.export({type: 'spki', format: 'der'});
    const keyId = 'test-key';
    return {
        bytes: Buffer.from(JSON.stringify({
            schemaVersion: 1,
            keyId,
            algorithm: 'Ed25519',
            payload: payloadBytes.toString('base64'),
            signature: crypto.sign(null, payloadBytes, pair.privateKey).toString('base64'),
        }), 'utf8'),
        payloadBytes,
        trust: {
            schemaVersion: 1,
            keys: [{
                id: keyId,
                algorithm: 'Ed25519',
                publicKeySpki: publicKeyBytes.toString('base64'),
                sha256: crypto.createHash('sha256').update(publicKeyBytes).digest('hex'),
            }],
        },
    };
}

function loadSignedAdapterFixture() {
    if (signedAdapterFixture !== undefined) return signedAdapterFixture;
    const coreRoot = makeTempDir();
    fs.cpSync(CORE_SOURCE_ROOT, coreRoot, {recursive: true});
    for (const hook of ['commit-msg', 'pre-commit', 'pre-push', 'prepare-commit-msg']) {
        fs.chmodSync(path.join(coreRoot, 'config', 'bootstrap', 'hooks', hook), 0o755);
    }
    const catalogue = {
        schemaVersion: 1,
        catalogueId: 'kyaulabs/prism-adapters',
        sequence: 7,
        issuedAt: '2026-08-27T00:00:00Z',
        expiresAt: '2026-09-03T00:00:00Z',
        adapters: [{
            id: 'php-web',
            displayName: 'PHP/web',
            packageName: '@kyaulabs/prism-php-web',
            releases: [{
                version: ADAPTER_VERSION,
                coreRange: CORE_VERSION,
                bootstrapProtocol: 1,
                integrity: ADAPTER_INTEGRITY,
                publishedAt: '2026-08-26T00:00:00Z',
                status: 'ACTIVE',
            }],
        }],
    };
    const envelope = signedEnvelope(catalogue);
    const envelopeDigest = crypto.createHash('sha256').update(envelope.bytes).digest('hex');
    const payloadDigest = crypto.createHash('sha256').update(envelope.payloadBytes).digest('hex');
    const catalogueCachePath = path.join(coreRoot, '.adapter-catalogue-cache.json');
    writeJson(path.join(coreRoot, 'config', 'adapter-catalogue-trust.json'), envelope.trust);
    writeJson(catalogueCachePath, {
        schemaVersion: 1,
        entries: [{
            digest: envelopeDigest,
            sequence: catalogue.sequence,
            envelope: envelope.bytes.toString('base64'),
            cachedAt: '2026-08-27T12:00:00.000Z',
        }],
    });
    fs.chmodSync(catalogueCachePath, 0o600);
    signedAdapterFixture = Object.freeze({
        coreRoot,
        catalogueCachePath,
        trust: envelope.trust,
        digest: envelopeDigest,
        evidence: Object.freeze({
            catalogueId: catalogue.catalogueId,
            sequence: catalogue.sequence,
            keyId: envelope.trust.keys[0].id,
            issuedAt: catalogue.issuedAt,
            expiresAt: catalogue.expiresAt,
            envelopeDigest,
            payloadDigest,
            selectedAt: '2026-08-27T12:00:00.000Z',
            integrity: ADAPTER_INTEGRITY,
        }),
    });
    return signedAdapterFixture;
}

const CORE_ROOT = loadSignedAdapterFixture().coreRoot;

test.after(() => {
    if (signedAdapterFixture !== undefined) {
        fs.rmSync(signedAdapterFixture.coreRoot, {recursive: true, force: true});
    }
});

test('rejects durable adapter evidence without an exact SHA-512 digest', () => {
    assert.throws(
        () => validateAdapterEvidence({
            ...loadSignedAdapterFixture().evidence,
            integrity: 'sha512-A',
        }),
        /bootstrap adapter evidence is invalid/
    );
});

function coreRootFor(projectRoot, fallback = CORE_ROOT) {
    return projectCoreRoots.get(path.resolve(projectRoot)) ?? fallback;
}

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

async function captureAsyncWrites(action) {
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

function planInput(projectRoot, input, context = {}) {
    return captureWrites(() => main([
        'setup', 'project', 'plan', '--source=blank', '--adapter=core-only', '--json',
    ], {projectRoot, input, ...context}));
}

function planProject(projectRoot, input, context = {}) {
    return planInput(projectRoot, JSON.stringify(input), context);
}

function planTemplateCoreProject(projectRoot, fixture, context = {}) {
    return captureAsyncWrites(() => main([
        'setup', 'project', 'plan', '--source=template', '--adapter=core-only',
        '--network-approved=yes', '--json',
    ], {
        projectRoot,
        coreRoot: CORE_ROOT,
        fetch: fixture.fetch,
        randomUUID: () => ATTEMPT_ID,
        input: JSON.stringify({
            schemaVersion: 1,
            displayName: 'Template Core Project',
            summary: 'A trusted-provider Core project.',
        }),
        ...context,
    }));
}

function bootstrapRunner(projectRoot) {
    return (command, args) => {
        if (command === '/usr/bin/pi') {
            assert.deepEqual(args, [
                'install',
                `npm:@kyaulabs/prism-php-web@${ADAPTER_VERSION}`,
                '-l',
                '--approve',
            ]);
            const npmRoot = path.join(projectRoot, '.pi', 'npm');
            const packageRoot = path.join(
                npmRoot,
                'node_modules',
                '@kyaulabs',
                'prism-php-web'
            );
            writeJson(path.join(projectRoot, '.pi', 'settings.json'), {
                packages: [`npm:@kyaulabs/prism-php-web@${ADAPTER_VERSION}`],
            });
            writeJson(path.join(npmRoot, 'package.json'), {
                name: 'pi-extensions',
                private: true,
                dependencies: {'@kyaulabs/prism-php-web': ADAPTER_VERSION},
            });
            writeJson(path.join(npmRoot, 'package-lock.json'), {
                name: 'pi-extensions',
                lockfileVersion: 3,
                packages: {
                    '': {dependencies: {'@kyaulabs/prism-php-web': ADAPTER_VERSION}},
                    'node_modules/@kyaulabs/prism-php-web': {
                        version: ADAPTER_VERSION,
                        integrity: ADAPTER_INTEGRITY,
                    },
                },
            });
            fs.writeFileSync(path.join(npmRoot, '.gitignore'), '*\n!.gitignore\n');
            fs.cpSync(ADAPTER_ROOT, packageRoot, {recursive: true});
            fs.writeFileSync(
                path.join(packageRoot, 'scripts', 'prism-tool-adapter.js'),
                `'use strict';\nmodule.exports = require(${JSON.stringify(
                    path.join(ADAPTER_ROOT, 'scripts', 'prism-tool-adapter.js')
                )});\n`
            );
            return {status: 0, stdout: '', stderr: '', error: undefined};
        }
        if (command === 'composer' && args[0] === 'audit') {
            return {status: 0, stdout: '{"advisories":[]}', stderr: '', error: undefined};
        }
        if (command === 'npm' && args[0] === 'audit') {
            return {
                status: 0,
                stdout: '{"metadata":{"vulnerabilities":{"info":0,"low":0,"moderate":0,"high":0,"critical":0}},"vulnerabilities":{}}',
                stderr: '',
                error: undefined,
            };
        }
        return {status: 0, stdout: '', stderr: '', error: undefined};
    };
}

function bootstrapGraphRunner(projectRoot) {
    const run = bootstrapRunner(projectRoot);
    return (command, args, options) => {
        if (command === 'composer' && args[0] === 'update') {
            const packages = ADAPTER_CONTRACT.components
                .filter(({ecosystem}) => ecosystem === 'composer')
                .map(({package: packageName, version}) => ({name: packageName, version}));
            fs.writeFileSync(
                path.join(options.cwd, 'composer.lock'),
                `${JSON.stringify({packages: [], 'packages-dev': packages})}\n`
            );
        }
        if (command === 'npm' && args[0] === 'install') {
            const packages = Object.fromEntries(ADAPTER_CONTRACT.components
                .filter(({ecosystem}) => ecosystem === 'npm')
                .map(({package: packageName, version}) => [
                    `node_modules/${packageName}`,
                    {version},
                ]));
            fs.writeFileSync(
                path.join(options.cwd, 'package-lock.json'),
                `${JSON.stringify({lockfileVersion: 3, packages: {'': {}, ...packages}})}\n`
            );
        }
        return run(command, args, options);
    };
}

function installedGraphRunner(projectRoot, operations) {
    const commandVersions = new Map(ADAPTER_CONTRACT.components
        .filter(({kind}) => kind === 'command')
        .map(({executable, version}) => [executable, version]));
    return (command, args) => {
        const journal = readBootstrapJournal({projectRoot, attemptId: ATTEMPT_ID});
        assert.equal(journal.phase, 'DURABLE');
        operations.push(`${command} ${args.join(' ')}`);
        if (command === 'composer' && args[0] === 'install') {
            const binRoot = path.join(projectRoot, 'vendor', 'bin');
            fs.mkdirSync(binRoot, {recursive: true});
            for (const {ecosystem, kind, executable} of ADAPTER_CONTRACT.components) {
                if (ecosystem !== 'composer' || kind !== 'command') continue;
                fs.writeFileSync(path.join(binRoot, executable), '#!/usr/bin/env php\n', {mode: 0o755});
            }
        }
        if (command === 'npm' && args[0] === 'ci') {
            const binRoot = path.join(projectRoot, 'node_modules', '.bin');
            fs.mkdirSync(binRoot, {recursive: true});
            for (const {ecosystem, kind, executable} of ADAPTER_CONTRACT.components) {
                if (ecosystem !== 'npm' || kind !== 'command') continue;
                fs.writeFileSync(path.join(binRoot, executable), '#!/usr/bin/env node\n', {mode: 0o755});
            }
        }
        if (command === 'composer' && args[0] === 'audit') {
            return {status: 0, stdout: '{"advisories":[]}', stderr: '', error: undefined};
        }
        if (command === 'npm' && args[0] === 'audit') {
            return {
                status: 0,
                stdout: '{"metadata":{"vulnerabilities":{"info":0,"low":0,"moderate":0,"high":0,"critical":0}},"vulnerabilities":{}}',
                stderr: '',
                error: undefined,
            };
        }
        const version = commandVersions.get(path.basename(command));
        return {
            status: 0,
            stdout: version === undefined ? '' : `${version}\n`,
            stderr: '',
            error: undefined,
        };
    };
}

function provisionPhpWebAdapter(projectRoot, source = 'blank') {
    const fixture = loadSignedAdapterFixture();
    projectCoreRoots.set(path.resolve(projectRoot), fixture.coreRoot);
    return captureWrites(() => main([
        'setup', 'adapter', 'select', '--adapter=php-web',
        `--catalogue-digest=${fixture.digest}`, `--source=${source}`,
        '--network-approved=yes', '--json',
    ], {
        projectRoot,
        coreRoot: fixture.coreRoot,
        catalogueCachePath: fixture.catalogueCachePath,
        catalogueTrust: fixture.trust,
        now: new Date('2026-08-27T12:00:00Z'),
        piExecutable: '/usr/bin/pi',
        randomUUID: () => ATTEMPT_ID,
        run: bootstrapRunner(projectRoot),
    }));
}

function planPhpWebProject(projectRoot, run = bootstrapRunner(projectRoot)) {
    return captureWrites(() => main([
        'setup', 'project', 'plan', '--source=blank',
        '--adapter=@kyaulabs/prism-php-web', `--attempt=${ATTEMPT_ID}`, '--json',
    ], {
        projectRoot,
        coreRoot: coreRootFor(projectRoot),
        input: JSON.stringify({
            schemaVersion: 1,
            displayName: 'Blank PHP Project',
            summary: 'An application-free PHP web scaffold.',
        }),
        run,
    }));
}

function planTemplatePhpWebProject(projectRoot, fixture, run = bootstrapRunner(projectRoot)) {
    return captureAsyncWrites(() => main([
        'setup', 'project', 'plan', '--source=template',
        '--adapter=@kyaulabs/prism-php-web', `--attempt=${ATTEMPT_ID}`,
        '--network-approved=yes', '--json',
    ], {
        projectRoot,
        coreRoot: coreRootFor(projectRoot),
        fetch: fixture.fetch,
        input: JSON.stringify({
            schemaVersion: 1,
            displayName: 'Template PHP Project',
            summary: 'A trusted-provider PHP web scaffold.',
        }),
        run,
    }));
}

function validationContext(projectRoot, context) {
    const selectedCoreRoot = projectCoreRoots.get(path.resolve(projectRoot));
    return selectedCoreRoot === undefined
        ? {projectRoot, ...context}
        : {projectRoot, ...context, coreRoot: selectedCoreRoot};
}

function validatePlan(projectRoot, attemptId, planDigest, context = {}) {
    return captureWrites(() => main([
        'setup', 'project', 'validate', `--attempt=${attemptId}`, `--digest=${planDigest}`, '--json',
    ], validationContext(projectRoot, context)));
}

function recoverProject(projectRoot, attemptId, planDigest, context = {}) {
    return captureWrites(() => main([
        'setup', 'project', 'recover', `--attempt=${attemptId}`,
        `--digest=${planDigest}`, '--json',
    ], validationContext(projectRoot, context)));
}

function applyProject(projectRoot, attemptId, planDigest, context = {}) {
    return captureWrites(() => main([
        'setup', 'project', 'apply', `--attempt=${attemptId}`,
        `--digest=${planDigest}`, '--approval=yes', '--json',
    ], validationContext(projectRoot, context)));
}

function gitBlobSha(bytes) {
    return crypto.createHash('sha1')
        .update(Buffer.from(`blob ${bytes.length}\0`, 'utf8'))
        .update(bytes)
        .digest('hex');
}

function allCapabilityMetadata() {
    return {
        licensing: {
            spdxId: 'MIT',
            copyrightHolder: 'Example Organization',
        },
        'community-governance': {
            conductContact: 'conduct@example.test',
        },
        'github-collaboration': {},
        'security-disclosure': {
            reportingContact: 'security@example.test',
            supportedVersionPolicy: 'custom',
            supportedVersionRows: [
                {version: '2.x', status: 'supported'},
                {version: '1.x', status: 'unsupported'},
            ],
            acknowledgementHours: 72,
        },
        'repository-ownership': {
            owners: ['@example', '@example/core'],
            rules: [{pattern: '/docs/**', owners: ['@example/docs']}],
        },
        'support-routing': {
            destination: 'https://example.test/support',
        },
        funding: {
            records: [
                {provider: 'github', account: 'example'},
                {provider: 'custom', destination: 'https://example.test/fund'},
            ],
        },
    };
}

function advertiseTemplateCapabilities(fixture, capabilities) {
    const additions = capabilities.filter((capability) =>
        !fixture.manifest.entries.some((entry) => entry.capability === capability)
    );
    if (additions.length > 0) {
        fixture.responses.tree.tree.push({
            path: 'catalogue',
            mode: '040000',
            type: 'tree',
            sha: 'abababababababababababababababababababab',
        });
    }
    for (const capability of additions) {
        const contents = Buffer.from(`${capability}\n`, 'utf8');
        const entry = {
            path: `catalogue/${capability}.txt`,
            blobSha: gitBlobSha(contents),
            size: contents.length,
            class: 'optional-profile',
            capability,
            provider: {scope: 'core', id: capability},
            disposition: 'render',
        };
        fixture.manifest.entries.push(entry);
        fixture.responses.tree.tree.push({
            path: entry.path,
            mode: '100644',
            type: 'blob',
            sha: entry.blobSha,
            size: entry.size,
        });
    }
    const manifestBytes = Buffer.from(`${JSON.stringify(fixture.manifest)}\n`, 'utf8');
    const manifestSha = gitBlobSha(manifestBytes);
    const manifestTreeEntry = fixture.responses.tree.tree.find(({path: entryPath}) =>
        entryPath === '.prism/template-manifest.json'
    );
    manifestTreeEntry.sha = manifestSha;
    manifestTreeEntry.size = manifestBytes.length;
    fixture.responses.manifestBlob.sha = manifestSha;
    fixture.responses.manifestBlob.size = manifestBytes.length;
    fixture.responses.manifestBlob.content = manifestBytes.toString('base64');
}

function attemptInventoryDigest(attemptRoot) {
    const entries = [];
    const walk = (relativeRoot) => {
        const absoluteRoot = relativeRoot === '' ? attemptRoot : path.join(attemptRoot, relativeRoot);
        for (const name of fs.readdirSync(absoluteRoot).sort()) {
            const relativePath = relativeRoot === '' ? name : `${relativeRoot}/${name}`;
            if ([
                'plan/project.json', 'journal.json', 'apply.lock', 'seed-attestation.json',
            ].includes(relativePath)) continue;
            const absolutePath = path.join(absoluteRoot, name);
            const stat = fs.lstatSync(absolutePath);
            if (stat.isDirectory()) {
                entries.push({
                    path: relativePath,
                    kind: 'directory',
                    mode: stat.mode & 0o777,
                    bytes: 0,
                    sha256: null,
                });
                walk(relativePath);
                continue;
            }
            const contents = fs.readFileSync(absolutePath);
            entries.push({
                path: relativePath,
                kind: 'file',
                mode: stat.mode & 0o777,
                bytes: contents.length,
                sha256: crypto.createHash('sha256').update(contents).digest('hex'),
            });
        }
    };
    walk('');
    return crypto.createHash('sha256')
        .update(Buffer.from(JSON.stringify(entries), 'utf8'))
        .digest('hex');
}

test('reports structured transaction failures when the project root is unavailable', (t) => {
    const parent = makeTempDir();
    const projectRoot = path.join(parent, 'missing-project');
    t.after(() => fs.rmSync(parent, {recursive: true, force: true}));
    for (const operation of ['apply', 'recover']) {
        const result = operation === 'apply'
            ? applyProject(projectRoot, ATTEMPT_ID, '0'.repeat(64), {coreRoot: CORE_ROOT})
            : recoverProject(projectRoot, ATTEMPT_ID, '0'.repeat(64), {coreRoot: CORE_ROOT});
        const report = JSON.parse(result.stdout);

        assert.equal(result.status, 5);
        assert.equal(report.status, 'NO-GO');
        assert.equal(report.disposition, 'RECOVERY_REQUIRED');
        assert.equal(report.projectRoot, path.resolve(projectRoot));
    }
});

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

test('creates a digest-bound Blank Core-only project plan from edited metadata', (t) => {
    const projectRoot = makeTempDir();
    t.after(() => fs.rmSync(projectRoot, {recursive: true, force: true}));

    const result = planProject(projectRoot, {
        schemaVersion: 1,
        displayName: 'Editable Project Name',
        summary: 'A deterministic Core-only project.',
    }, {
        coreRoot: CORE_ROOT,
        randomUUID: () => ATTEMPT_ID,
    });
    const report = JSON.parse(result.stdout);

    assert.equal(result.status, 0);
    assert.equal(result.stderr, '');
    assert.equal(report.schemaVersion, 1);
    assert.equal(report.command, 'setup project plan');
    assert.equal(report.status, 'GO');
    assert.equal(report.disposition, 'PLAN_READY');
    assert.deepEqual(report.source, {mode: 'BLANK', evidence: null});
    assert.match(report.sourceDigest, /^[0-9a-f]{64}$/);
    assert.equal(report.adapter, null);
    assert.deepEqual(report.capabilities, []);
    assert.equal(report.metadata.displayName, 'Editable Project Name');
    assert.match(report.metadataDigest, /^[0-9a-f]{64}$/);
    assert.match(report.planDigest, /^[0-9a-f]{64}$/);
    assert.equal(report.providers.length, 1);
    assert.equal(report.outputs.length, 7);
    assert.deepEqual(report.effects, []);
    assert.deepEqual(report.recovery, {
        beforeDurable: 'REMOVE_OWNED_ATTEMPT_AND_PROVE_STRICT_EMPTY',
        afterDurable: 'RETAIN_PROJECT_AND_RESUME',
    });
    assert.equal(report.data.attempt.id, ATTEMPT_ID);
    assert.equal(path.isAbsolute(report.data.planPath), true);
    assert.deepEqual(fs.readdirSync(projectRoot), ['.pi']);
    assert.equal(fs.existsSync(path.join(projectRoot, 'README.md')), false);
    assert.equal(fs.existsSync(path.join(projectRoot, '.prism', 'project.json')), false);

    const attemptRoot = path.dirname(path.dirname(report.data.planPath));
    const journalPath = path.join(attemptRoot, 'journal.json');
    const journal = JSON.parse(fs.readFileSync(journalPath, 'utf8'));
    assert.equal(fs.statSync(journalPath).mode & 0o777, 0o600);
    assert.deepEqual(journal, {
        schemaVersion: 1,
        attemptId: ATTEMPT_ID,
        projectRoot: fs.realpathSync(projectRoot),
        planDigest: report.planDigest,
        sourceDigest: report.sourceDigest,
        metadataDigest: report.metadataDigest,
        source: {mode: 'BLANK', evidence: null},
        adapter: null,
        adapterEvidence: null,
        phase: 'PREPARED',
        status: 'ACTIVE',
        reason: null,
        resumePhase: 'PROJECT_APPLICATION',
        applied: [],
        createdDirectories: [],
        appliedInventoryDigest: null,
        repository: null,
        hooks: null,
        seed: null,
    });
});

test('creates a digest-bound Template Core-only project plan from fixed source evidence', async (t) => {
    const projectRoot = makeTempDir();
    const fixture = createTemplateFixture();
    t.after(() => fs.rmSync(projectRoot, {recursive: true, force: true}));

    const result = await captureAsyncWrites(() => main([
        'setup', 'project', 'plan', '--source=template', '--adapter=core-only',
        '--network-approved=yes', '--json',
    ], {
        projectRoot,
        coreRoot: CORE_ROOT,
        fetch: fixture.fetch,
        randomUUID: () => ATTEMPT_ID,
        input: JSON.stringify({
            schemaVersion: 1,
            displayName: 'Template Core Project',
            summary: 'A trusted-provider Core project.',
        }),
    }));

    assert.equal(result.status, 0, result.stderr || result.stdout);
    const report = JSON.parse(result.stdout);
    assert.equal(report.status, 'GO');
    assert.equal(report.disposition, 'PLAN_READY');
    assert.equal(report.source.mode, 'TEMPLATE');
    assert.equal(report.source.evidence.commitSha, fixture.commitSha);
    assert.match(report.sourceDigest, /^[0-9a-f]{64}$/);
    assert.equal(report.adapter, null);
    assert.deepEqual(report.capabilities, []);
    assert.equal(report.providers.length, 1);
    assert.equal(report.outputs.length, 7);
    assert.deepEqual(fixture.calls.map(({url}) => url), fixture.urls);
    const attemptRoot = path.dirname(path.dirname(report.data.planPath));
    const sourcePath = path.join(attemptRoot, 'reports', 'source.json');
    const sourceContents = fs.readFileSync(sourcePath);
    assert.equal(fs.statSync(sourcePath).mode & 0o777, 0o600);
    assert.deepEqual(Object.keys(JSON.parse(sourceContents)), [
        'schemaVersion', 'source', 'catalogue',
    ]);
    assert.equal(crypto.createHash('sha256').update(sourceContents).digest('hex'), report.sourceDigest);
    assert.equal(sourceContents.includes(Buffer.from('api.github.com')), false);
    const validated = validateBootstrapProjectPlan({
        projectRoot,
        coreRoot: CORE_ROOT,
        attemptId: ATTEMPT_ID,
        planDigest: report.planDigest,
    });
    assert.deepEqual(validated.source, report.source);
    assert.equal(validated.sourceDigest, report.sourceDigest);
    assert.equal(fs.existsSync(path.join(projectRoot, '.prism', 'template-manifest.json')), false);
});

test('keeps failed Template Core-only planning strict-empty without Blank fallback', async (t) => {
    const projectRoot = makeTempDir();
    const fixture = createTemplateFixture({transport: {rejectIndex: 0}});
    t.after(() => fs.rmSync(projectRoot, {recursive: true, force: true}));

    const result = await captureAsyncWrites(() => main([
        'setup', 'project', 'plan', '--source=template', '--adapter=core-only',
        '--network-approved=yes', '--json',
    ], {
        projectRoot,
        coreRoot: CORE_ROOT,
        fetch: fixture.fetch,
        randomUUID: () => ATTEMPT_ID,
        input: JSON.stringify({
            schemaVersion: 1,
            displayName: 'Template Core Project',
            summary: 'A trusted-provider Core project.',
        }),
    }));

    assert.equal(result.status, 5);
    assert.equal(result.stdout, '');
    assert.match(result.stderr, /Template source is unavailable/);
    assert.equal(result.stderr.includes('Blank'), false);
    assert.equal(fixture.calls.length, 1);
    assert.deepEqual(fs.readdirSync(projectRoot), []);
});

test('rejects changed private Template source state before project mutation', async (t) => {
    const projectRoot = makeTempDir();
    const fixture = createTemplateFixture();
    t.after(() => fs.rmSync(projectRoot, {recursive: true, force: true}));

    const planned = await captureAsyncWrites(() => main([
        'setup', 'project', 'plan', '--source=template', '--adapter=core-only',
        '--network-approved=yes', '--json',
    ], {
        projectRoot,
        coreRoot: CORE_ROOT,
        fetch: fixture.fetch,
        randomUUID: () => ATTEMPT_ID,
        input: JSON.stringify({
            schemaVersion: 1,
            displayName: 'Template Core Project',
            summary: 'A trusted-provider Core project.',
        }),
    }));
    const plan = JSON.parse(planned.stdout);
    const sourcePath = path.join(path.dirname(path.dirname(plan.data.planPath)), 'reports', 'source.json');
    const changed = JSON.parse(fs.readFileSync(sourcePath, 'utf8'));
    changed.catalogue.entries[0].path = 'changed/path';
    fs.writeFileSync(sourcePath, `${JSON.stringify(changed)}\n`, {mode: 0o600});

    const result = validatePlan(projectRoot, ATTEMPT_ID, plan.planDigest, {coreRoot: CORE_ROOT});
    const report = JSON.parse(result.stdout);
    assert.equal(result.status, 5);
    assert.equal(report.disposition, 'STALE_PROJECT_STATE');
    assert.deepEqual(fs.readdirSync(projectRoot), ['.pi']);
    assert.equal(fs.existsSync(path.join(projectRoot, 'README.md')), false);
    assert.equal(changed.source.mode, 'TEMPLATE');
});

test('rejects substituted Template journal evidence before application', async (t) => {
    const projectRoot = makeTempDir();
    const fixture = createTemplateFixture();
    t.after(() => fs.rmSync(projectRoot, {recursive: true, force: true}));
    const planned = await captureAsyncWrites(() => main([
        'setup', 'project', 'plan', '--source=template', '--adapter=core-only',
        '--network-approved=yes', '--json',
    ], {
        projectRoot,
        coreRoot: CORE_ROOT,
        fetch: fixture.fetch,
        randomUUID: () => ATTEMPT_ID,
        input: JSON.stringify({
            schemaVersion: 1,
            displayName: 'Template Core Project',
            summary: 'A trusted-provider Core project.',
        }),
    }));
    const plan = JSON.parse(planned.stdout);
    const attemptRoot = path.dirname(path.dirname(plan.data.planPath));
    const journalPath = path.join(attemptRoot, 'journal.json');
    const journal = JSON.parse(fs.readFileSync(journalPath, 'utf8'));
    journal.source.evidence.commitSha = 'a'.repeat(40);
    fs.writeFileSync(journalPath, `${JSON.stringify(journal)}\n`, {mode: 0o600});

    const validation = validatePlan(projectRoot, ATTEMPT_ID, plan.planDigest, {coreRoot: CORE_ROOT});
    assert.equal(validation.status, 5);
    const result = applyProject(projectRoot, ATTEMPT_ID, plan.planDigest, {coreRoot: CORE_ROOT});
    assert.equal(result.status, 5);
    assert.equal(fs.existsSync(path.join(projectRoot, 'README.md')), false);
});

test('rejects substituted Template evidence at every retained pre-application boundary', async () => {
    const cases = [
        {
            name: 'source evidence',
            action: 'validate',
            mutate: ({attemptRoot}) => {
                const sourcePath = path.join(attemptRoot, 'reports', 'source.json');
                const source = JSON.parse(fs.readFileSync(sourcePath, 'utf8'));
                source.source.evidence.commitSha = 'a'.repeat(40);
                fs.writeFileSync(sourcePath, `${JSON.stringify(source)}\n`, {mode: 0o600});
            },
        },
        {
            name: 'source catalogue',
            action: 'validate',
            mutate: ({attemptRoot}) => {
                const sourcePath = path.join(attemptRoot, 'reports', 'source.json');
                const source = JSON.parse(fs.readFileSync(sourcePath, 'utf8'));
                source.catalogue.entries[0].path = 'changed/path';
                fs.writeFileSync(sourcePath, `${JSON.stringify(source)}\n`, {mode: 0o600});
            },
        },
        {
            name: 'plan source digest',
            action: 'validate',
            mutate: ({planPath}) => {
                const envelope = JSON.parse(fs.readFileSync(planPath, 'utf8'));
                envelope.plan.sourceDigest = '0'.repeat(64);
                fs.writeFileSync(planPath, `${JSON.stringify(envelope)}\n`, {mode: 0o600});
            },
        },
        {
            name: 'candidate project source',
            action: 'apply',
            mutate: ({attemptRoot}) => {
                const manifestPath = path.join(attemptRoot, 'candidate', '.prism', 'project.json');
                const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
                manifest.source.evidence.commitSha = 'a'.repeat(40);
                fs.writeFileSync(manifestPath, `${JSON.stringify(manifest)}\n`);
            },
        },
    ];

    for (const boundary of cases) {
        const projectRoot = makeTempDir();
        try {
            const fixture = createTemplateFixture();
            const planned = await planTemplateCoreProject(projectRoot, fixture);
            assert.equal(planned.status, 0, boundary.name);
            const plan = JSON.parse(planned.stdout);
            const attemptRoot = path.dirname(path.dirname(plan.data.planPath));
            boundary.mutate({attemptRoot, planPath: plan.data.planPath});
            const result = boundary.action === 'apply'
                ? applyProject(projectRoot, ATTEMPT_ID, plan.planDigest, {coreRoot: CORE_ROOT})
                : validatePlan(projectRoot, ATTEMPT_ID, plan.planDigest, {coreRoot: CORE_ROOT});
            assert.equal(result.status, 5, boundary.name);
            assert.equal(fs.existsSync(path.join(projectRoot, 'README.md')), false, boundary.name);
        } finally {
            fs.rmSync(projectRoot, {recursive: true, force: true});
        }
    }
});

test('retains a durable Template project when its manifest source is substituted', async (t) => {
    const projectRoot = makeTempDir();
    const fixture = createTemplateFixture();
    t.after(() => fs.rmSync(projectRoot, {recursive: true, force: true}));
    const planned = await planTemplateCoreProject(projectRoot, fixture);
    const plan = JSON.parse(planned.stdout);
    const applied = applyProject(projectRoot, ATTEMPT_ID, plan.planDigest, {coreRoot: CORE_ROOT});
    assert.equal(applied.status, 0);
    const attemptRoot = path.dirname(path.dirname(plan.data.planPath));
    assert.equal(fs.existsSync(path.join(attemptRoot, 'reports', 'source.json')), true);
    const durableJournal = readBootstrapJournal({projectRoot, attemptId: ATTEMPT_ID});
    assert.equal(durableJournal.applied.some(({path: outputPath}) => outputPath.startsWith('.pi/')), false);
    assert.equal(fs.existsSync(path.join(projectRoot, '.prism', 'template-manifest.json')), false);
    const manifestPath = path.join(projectRoot, '.prism', 'project.json');
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    manifest.source.evidence.commitSha = 'a'.repeat(40);
    fs.writeFileSync(manifestPath, `${JSON.stringify(manifest)}\n`);

    const result = applyProject(projectRoot, ATTEMPT_ID, plan.planDigest, {coreRoot: CORE_ROOT});
    assert.equal(result.status, 5);
    assert.equal(fs.existsSync(path.join(projectRoot, 'README.md')), true);
    assert.equal(readBootstrapJournal({projectRoot, attemptId: ATTEMPT_ID}).status, 'RECOVERY_REQUIRED');
});

test('restores strict emptiness when a Template provider fails after acquisition', async (t) => {
    const projectRoot = makeTempDir();
    const coreRoot = makeTempDir();
    const fixture = createTemplateFixture();
    t.after(() => fs.rmSync(projectRoot, {recursive: true, force: true}));
    t.after(() => fs.rmSync(coreRoot, {recursive: true, force: true}));
    fs.writeFileSync(path.join(coreRoot, 'package.json'), JSON.stringify({
        name: '@kyaulabs/not-prism-core',
        version: '0.3.1',
    }));

    const result = await captureAsyncWrites(() => main([
        'setup', 'project', 'plan', '--source=template', '--adapter=core-only',
        '--network-approved=yes', '--json',
    ], {
        projectRoot,
        coreRoot,
        fetch: fixture.fetch,
        randomUUID: () => ATTEMPT_ID,
        input: JSON.stringify({
            schemaVersion: 1,
            displayName: 'Template Core Project',
            summary: 'A trusted-provider Core project.',
        }),
    }));

    assert.equal(result.status, 5);
    assert.match(result.stderr, /project planning failed/);
    assert.equal(fixture.calls.length, 4);
    assert.deepEqual(fs.readdirSync(projectRoot), []);
});

test('rejects malformed project-plan source and network controls', (t) => {
    const projectRoot = makeTempDir();
    t.after(() => fs.rmSync(projectRoot, {recursive: true, force: true}));
    const cases = [
        ['--source=template', '--adapter=core-only'],
        ['--source=template', '--adapter=core-only', '--network-approved=no'],
        ['--source=blank', '--adapter=core-only', '--network-approved=yes'],
    ];

    for (const controls of cases) {
        const result = captureWrites(() => main(['setup', 'project', 'plan', ...controls], {
            projectRoot,
            coreRoot: CORE_ROOT,
            input: '{}',
        }));
        assert.equal(result.status, 2);
        assert.match(result.stderr, /^usage: prism-tool setup project plan/);
        assert.deepEqual(fs.readdirSync(projectRoot), []);
    }
});

test('plans a Blank project with the provisioned PHP web adapter', (t) => {
    const projectRoot = makeTempDir();
    t.after(() => fs.rmSync(projectRoot, {recursive: true, force: true}));
    const selected = provisionPhpWebAdapter(projectRoot);
    assert.equal(selected.status, 0, selected.stderr || selected.stdout);

    const result = planPhpWebProject(projectRoot);

    assert.equal(result.status, 0, result.stderr || result.stdout);
    assert.equal(result.stderr, '');
    const report = JSON.parse(result.stdout);
    assert.deepEqual(report.adapter, {
        id: 'php-web',
        packageName: '@kyaulabs/prism-php-web',
        packageVersion: ADAPTER_VERSION,
        bootstrapProtocol: 1,
    });
    assert.deepEqual(report.providers.map(({id}) => id), [
        'core-baseline',
        'php-web-scaffold',
    ]);
    assert.match(report.adapterReportDigest, /^[0-9a-f]{64}$/);
    assert.equal(report.outputs.length, 40);
    assert.equal(report.outputs.every((output, index, outputs) =>
        index === 0 || outputs[index - 1].path.localeCompare(output.path) < 0
    ), true);
    assert.deepEqual(report.effects.map(({id}) => id), [
        'composer-lock-resolution',
        'npm-lock-resolution',
        'composer-install',
        'npm-install',
        'playwright-chromium',
    ]);
    assert.deepEqual(report.checks.map(({id}) => id), [
        'core-baseline-render',
        'php-web-scaffold-render',
    ]);
    assert.deepEqual(report.verification.map(({id}) => id), [
        'core-baseline-inventory',
        'php-web-scaffold-inventory',
    ]);
    assert.deepEqual(report.filesystem.allowedRootEntries, ['.pi']);
    assert.equal(report.data.attempt.id, ATTEMPT_ID);
});

test('composes all governance profiles with a Blank PHP web adapter plan', (t) => {
    const projectRoot = makeTempDir();
    t.after(() => fs.rmSync(projectRoot, {recursive: true, force: true}));
    assert.equal(provisionPhpWebAdapter(projectRoot).status, 0);

    const result = captureWrites(() => main([
        'setup', 'project', 'plan', '--source=blank',
        '--adapter=@kyaulabs/prism-php-web', `--attempt=${ATTEMPT_ID}`,
        '--capabilities=licensing,community-governance,github-collaboration', '--json',
    ], {
        projectRoot,
        coreRoot: CORE_ROOT,
        currentYear: 2026,
        input: JSON.stringify({
            schemaVersion: 1,
            displayName: 'Governed PHP Project',
            summary: 'A governed PHP web scaffold.',
            capabilityMetadata: {
                licensing: {
                    spdxId: 'AGPL-3.0-only',
                    copyrightHolder: 'Example Organization',
                },
                'community-governance': {
                    conductContact: 'conduct@example.test',
                },
                'github-collaboration': {},
            },
        }),
        run: bootstrapRunner(projectRoot),
    }));

    assert.equal(result.status, 0, result.stderr || result.stdout);
    const report = JSON.parse(result.stdout);
    assert.deepEqual(report.capabilities, [
        'licensing', 'community-governance', 'github-collaboration',
    ]);
    assert.deepEqual(report.providers.map(({id}) => id), [
        'core-baseline', 'licensing', 'community-governance',
        'github-collaboration', 'php-web-scaffold',
    ]);
    assert.equal(report.outputs.length, 46);
    assert.equal(report.checks.length, 5);
    assert.equal(report.verification.length, 5);
    const readme = fs.readFileSync(path.join(
        path.dirname(path.dirname(report.data.planPath)),
        'candidate', 'README.md'
    ), 'utf8');
    assert.match(readme, /\[License\]\(LICENSE\)/);
    assert.ok(readme.indexOf('[License]') < readme.indexOf('[Code of Conduct]'));
    assert.ok(readme.indexOf('[Code of Conduct]') < readme.indexOf('[Issue templates]'));
});

test('composes support with funding and all seven capabilities in canonical Blank plans', (t) => {
    const pairRoot = makeTempDir();
    const allRoot = makeTempDir();
    t.after(() => fs.rmSync(pairRoot, {recursive: true, force: true}));
    t.after(() => fs.rmSync(allRoot, {recursive: true, force: true}));

    const pairResult = captureWrites(() => main([
        'setup', 'project', 'plan', '--source=blank', '--adapter=core-only',
        '--capabilities=funding,support-routing', '--json',
    ], {
        projectRoot: pairRoot,
        coreRoot: CORE_ROOT,
        randomUUID: () => ATTEMPT_ID,
        input: JSON.stringify({
            schemaVersion: 1,
            displayName: 'Supported Project',
            summary: 'A supported and funded project.',
            capabilityMetadata: {
                'support-routing': {destination: 'https://example.test/support'},
                funding: {records: [{provider: 'github', account: 'example'}]},
            },
        }),
    }));
    assert.equal(pairResult.status, 0, pairResult.stderr);
    const pair = JSON.parse(pairResult.stdout);
    assert.deepEqual(pair.capabilities, ['support-routing', 'funding']);
    assert.deepEqual(pair.providers.map(({id}) => id), [
        'core-baseline', 'support-routing', 'funding',
    ]);
    assert.match(
        fs.readFileSync(path.join(
            path.dirname(path.dirname(pair.data.planPath)),
            'candidate', '.github', 'ISSUE_TEMPLATE', 'config.yml'
        ), 'utf8'),
        /^blank_issues_enabled: true$/m
    );

    const allResult = captureWrites(() => main([
        'setup', 'project', 'plan', '--source=blank', '--adapter=core-only',
        '--capabilities=funding,support-routing,repository-ownership,security-disclosure,github-collaboration,community-governance,licensing',
        '--json',
    ], {
        projectRoot: allRoot,
        coreRoot: CORE_ROOT,
        currentYear: 2026,
        randomUUID: () => ATTEMPT_ID,
        input: JSON.stringify({
            schemaVersion: 1,
            displayName: 'Complete Project',
            summary: 'A project with every optional capability.',
            capabilityMetadata: allCapabilityMetadata(),
        }),
    }));
    assert.equal(allResult.status, 0, allResult.stderr);
    const all = JSON.parse(allResult.stdout);
    assert.deepEqual(all.capabilities, [
        'licensing', 'community-governance', 'github-collaboration',
        'security-disclosure', 'repository-ownership', 'support-routing', 'funding',
    ]);
    assert.deepEqual(all.providers.map(({id}) => id), [
        'core-baseline', 'licensing', 'community-governance', 'github-collaboration',
        'security-disclosure', 'repository-ownership', 'support-routing', 'funding',
    ]);
    assert.equal(all.outputs.length, 17);
    assert.equal(all.checks.length, 8);
    assert.equal(all.verification.length, 8);
    const attemptRoot = path.dirname(path.dirname(all.data.planPath));
    assert.match(
        fs.readFileSync(path.join(
            attemptRoot, 'candidate', '.github', 'ISSUE_TEMPLATE', 'config.yml'
        ), 'utf8'),
        /^blank_issues_enabled: false$/m
    );
    assert.deepEqual(fs.readdirSync(path.join(attemptRoot, 'reports')).sort(), [
        'core-baseline.json',
        'metadata.json',
        'profile-community-governance.json',
        'profile-funding.json',
        'profile-github-collaboration.json',
        'profile-licensing.json',
        'profile-repository-ownership.json',
        'profile-security-disclosure.json',
        'profile-support-routing.json',
        'source.json',
    ]);
});

test('keeps the PHP web provider source- and capability-independent with all seven profiles', async (t) => {
    const parents = [makeTempDir(), makeTempDir(), makeTempDir()];
    const [minimalRoot, blankRoot, templateRoot] = parents.map((parent) =>
        path.join(parent, 'complete-php-project')
    );
    for (const [index, projectRoot] of [minimalRoot, blankRoot, templateRoot].entries()) {
        fs.mkdirSync(projectRoot);
        t.after(() => fs.rmSync(parents[index], {recursive: true, force: true}));
    }
    assert.equal(provisionPhpWebAdapter(minimalRoot).status, 0);
    assert.equal(provisionPhpWebAdapter(blankRoot).status, 0);
    assert.equal(provisionPhpWebAdapter(templateRoot, 'template').status, 0);

    const selection = 'funding,support-routing,repository-ownership,security-disclosure,' +
        'github-collaboration,community-governance,licensing';
    const minimalInput = JSON.stringify({
        schemaVersion: 1,
        displayName: 'Complete PHP Project',
        summary: 'A PHP project with every optional capability.',
    });
    const minimalResult = captureWrites(() => main([
        'setup', 'project', 'plan', '--source=blank',
        '--adapter=@kyaulabs/prism-php-web', `--attempt=${ATTEMPT_ID}`, '--json',
    ], {
        projectRoot: minimalRoot,
        coreRoot: CORE_ROOT,
        input: minimalInput,
        run: bootstrapRunner(minimalRoot),
    }));
    assert.equal(minimalResult.status, 0, minimalResult.stderr);
    const allInput = JSON.stringify({
        schemaVersion: 1,
        displayName: 'Complete PHP Project',
        summary: 'A PHP project with every optional capability.',
        capabilityMetadata: allCapabilityMetadata(),
    });
    const blankResult = captureWrites(() => main([
        'setup', 'project', 'plan', '--source=blank',
        '--adapter=@kyaulabs/prism-php-web', `--attempt=${ATTEMPT_ID}`,
        `--capabilities=${selection}`, '--json',
    ], {
        projectRoot: blankRoot,
        coreRoot: CORE_ROOT,
        currentYear: 2026,
        input: allInput,
        run: bootstrapRunner(blankRoot),
    }));
    assert.equal(blankResult.status, 0, blankResult.stderr);
    const fixture = createTemplateFixture();
    advertiseTemplateCapabilities(fixture, [
        'licensing', 'community-governance', 'github-collaboration',
        'security-disclosure', 'repository-ownership', 'support-routing', 'funding',
    ]);
    const templateResult = await captureAsyncWrites(() => main([
        'setup', 'project', 'plan', '--source=template',
        '--adapter=@kyaulabs/prism-php-web', `--attempt=${ATTEMPT_ID}`,
        `--capabilities=${selection}`, '--network-approved=yes', '--json',
    ], {
        projectRoot: templateRoot,
        coreRoot: CORE_ROOT,
        currentYear: 2026,
        fetch: fixture.fetch,
        input: allInput,
        run: bootstrapRunner(templateRoot),
    }));
    assert.equal(templateResult.status, 0, templateResult.stderr);

    const reports = [minimalResult, blankResult, templateResult].map((result) => {
        const plan = JSON.parse(result.stdout);
        const attemptRoot = path.dirname(path.dirname(plan.data.planPath));
        const reportPath = path.join(attemptRoot, 'reports', 'adapter-provider.json');
        assert.equal(fs.statSync(reportPath).mode & 0o777, 0o600);
        return {plan, provider: JSON.parse(fs.readFileSync(reportPath, 'utf8'))};
    });
    assert.deepEqual(reports[1].provider, reports[0].provider);
    assert.deepEqual(reports[2].provider, reports[0].provider);
    for (const {plan} of reports.slice(1)) {
        assert.deepEqual(plan.providers.map(({id}) => id), [
            'core-baseline', 'licensing', 'community-governance', 'github-collaboration',
            'security-disclosure', 'repository-ownership', 'support-routing', 'funding',
            'php-web-scaffold',
        ]);
        assert.equal(plan.outputs.length, 50);
    }
    const adapterPaths = reports[0].provider.outputs.map(({path: outputPath}) => outputPath);
    for (const profilePath of [
        'SECURITY.md', '.github/CODEOWNERS', '.github/ISSUE_TEMPLATE/config.yml',
        '.github/FUNDING.yml',
    ]) {
        assert.equal(adapterPaths.includes(profilePath), false);
    }
    assert.equal(fixture.calls.length, 4);
});

test('plans a Template project with the provisioned PHP web adapter', async (t) => {
    const projectRoot = makeTempDir();
    const fixture = createTemplateFixture();
    t.after(() => fs.rmSync(projectRoot, {recursive: true, force: true}));
    const selected = provisionPhpWebAdapter(projectRoot, 'template');
    assert.equal(selected.status, 0);

    const result = await captureAsyncWrites(() => main([
        'setup', 'project', 'plan', '--source=template',
        '--adapter=@kyaulabs/prism-php-web', `--attempt=${ATTEMPT_ID}`,
        '--network-approved=yes', '--json',
    ], {
        projectRoot,
        coreRoot: CORE_ROOT,
        fetch: fixture.fetch,
        input: JSON.stringify({
            schemaVersion: 1,
            displayName: 'Template PHP Project',
            summary: 'A trusted-provider PHP web scaffold.',
        }),
        run: bootstrapRunner(projectRoot),
    }));

    assert.equal(result.status, 0, result.stderr || result.stdout);
    const report = JSON.parse(result.stdout);
    assert.equal(report.source.mode, 'TEMPLATE');
    assert.match(report.sourceDigest, /^[0-9a-f]{64}$/);
    assert.deepEqual(report.providers.map(({id}) => id), [
        'core-baseline',
        'php-web-scaffold',
    ]);
    assert.equal(report.outputs.length, 40);
    assert.equal(report.effects.length, 5);
    assert.equal(report.checks.length, 2);
    assert.equal(report.verification.length, 2);
    assert.deepEqual(fixture.calls.map(({url}) => url), fixture.urls);
});

test('composes an explicitly selected advertised Template capability', async (t) => {
    const projectRoot = makeTempDir();
    const fixture = createTemplateFixture();
    t.after(() => fs.rmSync(projectRoot, {recursive: true, force: true}));
    assert.equal(provisionPhpWebAdapter(projectRoot, 'template').status, 0);

    const result = await captureAsyncWrites(() => main([
        'setup', 'project', 'plan', '--source=template',
        '--adapter=@kyaulabs/prism-php-web', `--attempt=${ATTEMPT_ID}`,
        '--capabilities=licensing', '--network-approved=yes', '--json',
    ], {
        projectRoot,
        coreRoot: CORE_ROOT,
        currentYear: 2026,
        fetch: fixture.fetch,
        input: JSON.stringify({
            schemaVersion: 1,
            displayName: 'Licensed Template Project',
            summary: 'An explicitly licensed Template project.',
            capabilityMetadata: {
                licensing: {
                    spdxId: 'MIT',
                    copyrightHolder: 'Example Organization',
                },
            },
        }),
        run: bootstrapRunner(projectRoot),
    }));

    assert.equal(result.status, 0, result.stderr || result.stdout);
    const report = JSON.parse(result.stdout);
    assert.deepEqual(report.capabilities, ['licensing']);
    assert.deepEqual(report.providers.map(({id}) => id), [
        'core-baseline', 'licensing', 'php-web-scaffold',
    ]);
    assert.equal(report.outputs.some(({path: outputPath}) => outputPath === 'LICENSE'), true);
});

test('composes each advertised security identity profile into a Template Core-only plan', async () => {
    const scenarios = [
        {
            capability: 'security-disclosure',
            metadata: {
                reportingContact: 'security@example.test',
                supportedVersionPolicy: 'latest-release',
            },
            output: 'SECURITY.md',
        },
        {
            capability: 'repository-ownership',
            metadata: {owners: ['@example']},
            output: '.github/CODEOWNERS',
        },
        {
            capability: 'support-routing',
            metadata: {destination: 'https://example.test/support'},
            output: '.github/ISSUE_TEMPLATE/config.yml',
        },
        {
            capability: 'funding',
            metadata: {records: [{provider: 'github', account: 'example'}]},
            output: '.github/FUNDING.yml',
        },
    ];

    for (const scenario of scenarios) {
        const projectRoot = makeTempDir();
        try {
            const fixture = createTemplateFixture();
            advertiseTemplateCapabilities(fixture, [scenario.capability]);
            const result = await captureAsyncWrites(() => main([
                'setup', 'project', 'plan', '--source=template', '--adapter=core-only',
                `--capabilities=${scenario.capability}`, '--network-approved=yes', '--json',
            ], {
                projectRoot,
                coreRoot: CORE_ROOT,
                fetch: fixture.fetch,
                randomUUID: () => ATTEMPT_ID,
                input: JSON.stringify({
                    schemaVersion: 1,
                    displayName: 'Template Identity Project',
                    summary: 'A Template project with explicit identity policy.',
                    capabilityMetadata: {[scenario.capability]: scenario.metadata},
                }),
            }));

            assert.equal(result.status, 0, `${scenario.capability}: ${result.stderr}`);
            const report = JSON.parse(result.stdout);
            const attemptRoot = path.dirname(path.dirname(report.data.planPath));
            const metadataPath = path.join(attemptRoot, 'reports', 'metadata.json');
            const manifest = JSON.parse(fs.readFileSync(
                path.join(attemptRoot, 'candidate', '.prism', 'project.json'),
                'utf8'
            ));
            assert.deepEqual(report.capabilities, [scenario.capability]);
            assert.deepEqual(report.providers.map(({id}) => id), [
                'core-baseline', scenario.capability,
            ]);
            assert.equal(report.outputs.some(({path: outputPath}) => outputPath === scenario.output), true);
            assert.equal(
                fs.statSync(path.join(
                    attemptRoot, 'reports', `profile-${scenario.capability}.json`
                )).mode & 0o777,
                0o600
            );
            assert.equal(
                crypto.createHash('sha256').update(fs.readFileSync(metadataPath)).digest('hex'),
                report.metadataDigest
            );
            assert.deepEqual(manifest.capabilities, report.capabilities);
            assert.deepEqual(manifest.capabilityMetadata, report.metadata.capabilityMetadata);
            assert.equal(fixture.calls.length, 4);
        } finally {
            fs.rmSync(projectRoot, {recursive: true, force: true});
        }
    }
});

test('rejects an unadvertised Template capability without preselecting advertisements', async (t) => {
    const projectRoot = makeTempDir();
    const fixture = createTemplateFixture();
    t.after(() => fs.rmSync(projectRoot, {recursive: true, force: true}));

    const result = await captureAsyncWrites(() => main([
        'setup', 'project', 'plan', '--source=template', '--adapter=core-only',
        '--capabilities=community-governance', '--network-approved=yes', '--json',
    ], {
        projectRoot,
        coreRoot: CORE_ROOT,
        fetch: fixture.fetch,
        randomUUID: () => ATTEMPT_ID,
        input: JSON.stringify({
            schemaVersion: 1,
            displayName: 'Governed Template Project',
            summary: 'A Template project with explicit governance.',
            capabilityMetadata: {
                'community-governance': {
                    conductContact: 'conduct@example.test',
                },
            },
        }),
    }));

    assert.equal(result.status, 5);
    assert.match(result.stderr, /Template source is invalid/);
    assert.deepEqual(fs.readdirSync(projectRoot), []);
    assert.equal(fixture.calls.length, 4);
});

test('rejects Template planning against a Blank adapter receipt before acquisition', async (t) => {
    const projectRoot = makeTempDir();
    const fixture = createTemplateFixture();
    t.after(() => fs.rmSync(projectRoot, {recursive: true, force: true}));
    assert.equal(provisionPhpWebAdapter(projectRoot).status, 0);

    const result = await captureAsyncWrites(() => main([
        'setup', 'project', 'plan', '--source=template',
        '--adapter=@kyaulabs/prism-php-web', `--attempt=${ATTEMPT_ID}`,
        '--network-approved=yes', '--json',
    ], {
        projectRoot,
        coreRoot: CORE_ROOT,
        fetch: fixture.fetch,
        input: JSON.stringify({
            schemaVersion: 1,
            displayName: 'Template PHP Project',
            summary: 'A trusted-provider PHP web scaffold.',
        }),
        run: bootstrapRunner(projectRoot),
    }));

    assert.equal(result.status, 5);
    assert.match(result.stderr, /valid adapter state/);
    assert.equal(fixture.calls.length, 0);
    const receiptPath = path.join(
        projectRoot, '.pi', 'prism-tool', 'bootstrap', ATTEMPT_ID, 'adapter.json'
    );
    assert.equal(JSON.parse(fs.readFileSync(receiptPath, 'utf8')).source, 'BLANK');
});

test('cleans Template adapter attempts at every fixed-source acquisition boundary', async () => {
    for (const rejectIndex of [0, 1, 2, 3]) {
        const projectRoot = makeTempDir();
        const fixture = createTemplateFixture({transport: {rejectIndex}});
        try {
            assert.equal(provisionPhpWebAdapter(projectRoot, 'template').status, 0);
            const result = await captureAsyncWrites(() => main([
                'setup', 'project', 'plan', '--source=template',
                '--adapter=@kyaulabs/prism-php-web', `--attempt=${ATTEMPT_ID}`,
                '--network-approved=yes', '--json',
            ], {
                projectRoot,
                coreRoot: CORE_ROOT,
                fetch: fixture.fetch,
                input: JSON.stringify({
                    schemaVersion: 1,
                    displayName: 'Template PHP Project',
                    summary: 'A trusted-provider PHP web scaffold.',
                }),
                run: bootstrapRunner(projectRoot),
            }));

            assert.equal(result.status, 5);
            assert.match(result.stderr, /Template source is unavailable/);
            assert.equal(fixture.calls.length, rejectIndex + 1);
            assert.deepEqual(fs.readdirSync(projectRoot), []);
        } finally {
            fs.rmSync(projectRoot, {recursive: true, force: true});
        }
    }
});

test('cleans a Template adapter attempt when advertisements omit its provider', async (t) => {
    const projectRoot = makeTempDir();
    const fixture = createTemplateFixture({
        mutateManifest: (manifest) => {
            const entry = manifest.entries.find(({path: entryPath}) => entryPath === '.gitignore');
            entry.class = 'optional-profile';
            entry.capability = 'licensing';
            entry.provider = {scope: 'core', id: 'licensing'};
        },
    });
    t.after(() => fs.rmSync(projectRoot, {recursive: true, force: true}));
    assert.equal(provisionPhpWebAdapter(projectRoot, 'template').status, 0);

    const result = await captureAsyncWrites(() => main([
        'setup', 'project', 'plan', '--source=template',
        '--adapter=@kyaulabs/prism-php-web', `--attempt=${ATTEMPT_ID}`,
        '--network-approved=yes', '--json',
    ], {
        projectRoot,
        coreRoot: CORE_ROOT,
        fetch: fixture.fetch,
        input: JSON.stringify({
            schemaVersion: 1,
            displayName: 'Template PHP Project',
            summary: 'A trusted-provider PHP web scaffold.',
        }),
        run: bootstrapRunner(projectRoot),
    }));

    assert.equal(result.status, 5);
    assert.match(result.stderr, /Template source is invalid/);
    assert.equal(fixture.calls.length, 4);
    assert.deepEqual(fs.readdirSync(projectRoot), []);
});

test('retains ambiguous Template adapter state with one recovery action', async (t) => {
    const projectRoot = makeTempDir();
    t.after(() => fs.rmSync(projectRoot, {recursive: true, force: true}));
    assert.equal(provisionPhpWebAdapter(projectRoot, 'template').status, 0);

    const result = await captureAsyncWrites(() => main([
        'setup', 'project', 'plan', '--source=template',
        '--adapter=@kyaulabs/prism-php-web', `--attempt=${ATTEMPT_ID}`,
        '--network-approved=yes', '--json',
    ], {
        projectRoot,
        coreRoot: CORE_ROOT,
        fetch: async () => {
            fs.writeFileSync(path.join(projectRoot, 'user-state.txt'), 'retain\n');
            throw new Error('network failure');
        },
        input: JSON.stringify({
            schemaVersion: 1,
            displayName: 'Template PHP Project',
            summary: 'A trusted-provider PHP web scaffold.',
        }),
        run: bootstrapRunner(projectRoot),
    }));
    const report = JSON.parse(result.stdout);

    assert.equal(result.status, 5);
    assert.equal(result.stderr, '');
    assert.equal(report.disposition, 'RECOVERY_REQUIRED');
    assert.equal(report.source, 'TEMPLATE');
    assert.equal(report.data.recoveryPath, path.join(
        fs.realpathSync(projectRoot), '.pi', 'prism-tool', 'bootstrap', ATTEMPT_ID
    ));
    assert.equal(fs.readFileSync(path.join(projectRoot, 'user-state.txt'), 'utf8'), 'retain\n');
});

test('cleans Template adapter state when trusted provider composition fails', async (t) => {
    const projectRoot = makeTempDir();
    const fixture = createTemplateFixture();
    t.after(() => fs.rmSync(projectRoot, {recursive: true, force: true}));
    assert.equal(provisionPhpWebAdapter(projectRoot, 'template').status, 0);
    const prepare = phpWebHandler.prepareBootstrapProject;
    t.after(() => { phpWebHandler.prepareBootstrapProject = prepare; });
    phpWebHandler.prepareBootstrapProject = () => {
        throw new Error('injected provider failure');
    };

    const result = await captureAsyncWrites(() => main([
        'setup', 'project', 'plan', '--source=template',
        '--adapter=@kyaulabs/prism-php-web', `--attempt=${ATTEMPT_ID}`,
        '--network-approved=yes', '--json',
    ], {
        projectRoot,
        coreRoot: CORE_ROOT,
        fetch: fixture.fetch,
        input: JSON.stringify({
            schemaVersion: 1,
            displayName: 'Template PHP Project',
            summary: 'A trusted-provider PHP web scaffold.',
        }),
        run: bootstrapRunner(projectRoot),
    }));

    assert.equal(result.status, 5);
    assert.match(result.stderr, /project planning failed/);
    assert.equal(fixture.calls.length, 4);
    assert.deepEqual(fs.readdirSync(projectRoot), []);
});

test('rejects adapter report declarations that differ from the package-owned manifest', (t) => {
    const projectRoot = makeTempDir();
    t.after(() => fs.rmSync(projectRoot, {recursive: true, force: true}));
    assert.equal(provisionPhpWebAdapter(projectRoot).status, 0);
    const prepare = phpWebHandler.prepareBootstrapProject;
    t.after(() => { phpWebHandler.prepareBootstrapProject = prepare; });
    phpWebHandler.prepareBootstrapProject = (options) => {
        const report = JSON.parse(JSON.stringify(prepare(options)));
        report.effects[4].command = 'playwright install firefox';
        return report;
    };

    const result = planPhpWebProject(projectRoot);

    assert.equal(result.status, 5);
    assert.match(result.stderr, /project planning failed/);
    assert.deepEqual(fs.readdirSync(projectRoot), []);
});

test('rejects release management when Core-only and PHP web candidates are not publishable', (t) => {
    const coreRoot = makeTempDir();
    t.after(() => fs.rmSync(coreRoot, {recursive: true, force: true}));
    const corePlan = captureWrites(() => main([
        'setup', 'project', 'plan', '--source=blank', '--adapter=core-only',
        '--capabilities=release-management', '--json',
    ], {
        projectRoot: coreRoot,
        coreRoot: CORE_ROOT,
        randomUUID: () => ATTEMPT_ID,
        input: JSON.stringify({
            schemaVersion: 1,
            displayName: 'Core Release Project',
            summary: 'A Core project without publishable packages.',
            capabilityMetadata: {
                'release-management': {repository: 'example/core-project'},
            },
        }),
    }));
    assert.equal(corePlan.status, 5);
    assert.deepEqual(fs.readdirSync(coreRoot), []);

    const phpRoot = makeTempDir();
    t.after(() => fs.rmSync(phpRoot, {recursive: true, force: true}));
    assert.equal(provisionPhpWebAdapter(phpRoot).status, 0);
    const phpPlan = captureWrites(() => main([
        'setup', 'project', 'plan', '--source=blank',
        '--adapter=@kyaulabs/prism-php-web', `--attempt=${ATTEMPT_ID}`,
        '--capabilities=release-management', '--json',
    ], {
        projectRoot: phpRoot,
        coreRoot: CORE_ROOT,
        input: JSON.stringify({
            schemaVersion: 1,
            displayName: 'PHP Release Project',
            summary: 'A PHP project with a private npm package.',
            capabilityMetadata: {
                'release-management': {repository: 'example/php-project'},
            },
        }),
        run: bootstrapRunner(phpRoot),
    }));
    assert.equal(phpPlan.status, 5);
    assert.deepEqual(fs.readdirSync(phpRoot), []);
});

test('composes release management after a publishable adapter candidate is rendered', (t) => {
    const projectRoot = makeTempDir();
    t.after(() => fs.rmSync(projectRoot, {recursive: true, force: true}));
    assert.equal(provisionPhpWebAdapter(projectRoot).status, 0);
    const prepare = phpWebHandler.prepareBootstrapProject;
    t.after(() => { phpWebHandler.prepareBootstrapProject = prepare; });
    phpWebHandler.prepareBootstrapProject = (options) => {
        const report = JSON.parse(JSON.stringify(prepare(options)));
        const packagePath = path.join(options.candidateRoot, 'package.json');
        const contents = Buffer.from(`${JSON.stringify({
            name: '@example/release-project',
            version: '0.1.0',
        }, null, 2)}\n`, 'utf8');
        fs.writeFileSync(packagePath, contents);
        report.outputs.find(({path: outputPath}) => outputPath === 'package.json').sha256 =
            crypto.createHash('sha256').update(contents).digest('hex');
        return report;
    };

    const planned = captureWrites(() => main([
        'setup', 'project', 'plan', '--source=blank',
        '--adapter=@kyaulabs/prism-php-web', `--attempt=${ATTEMPT_ID}`,
        '--capabilities=release-management,funding,support-routing,repository-ownership,security-disclosure,github-collaboration,community-governance,licensing',
        '--json',
    ], {
        projectRoot,
        coreRoot: CORE_ROOT,
        currentYear: 2026,
        input: JSON.stringify({
            schemaVersion: 1,
            displayName: 'Release Project',
            summary: 'A project with every optional capability.',
            capabilityMetadata: {
                ...allCapabilityMetadata(),
                'release-management': {repository: 'example/release-project'},
            },
        }),
        run: bootstrapRunner(projectRoot),
    }));

    assert.equal(planned.status, 0, planned.stderr);
    const plan = JSON.parse(planned.stdout);
    assert.deepEqual(plan.providers.map(({id}) => id), [
        'core-baseline',
        'licensing',
        'community-governance',
        'github-collaboration',
        'security-disclosure',
        'repository-ownership',
        'support-routing',
        'funding',
        'release-management',
        'php-web-scaffold',
    ]);
    for (const outputPath of [
        'CHANGELOG.md',
        'cliff.toml',
        '.github/workflows/release.yml',
        '.prism/release.json',
    ]) {
        assert.equal(plan.outputs.some(({path: candidatePath}) => candidatePath === outputPath), true);
    }
    assert.deepEqual(JSON.parse(fs.readFileSync(path.join(
        path.dirname(path.dirname(plan.data.planPath)),
        'candidate',
        '.prism',
        'release.json'
    ), 'utf8')).packages, ['.']);
    assert.equal(validatePlan(
        projectRoot,
        ATTEMPT_ID,
        plan.planDigest,
        {coreRoot: CORE_ROOT}
    ).status, 0);
});

test('composes explicitly advertised release management into a Template adapter plan', async (t) => {
    const projectRoot = makeTempDir();
    const fixture = createTemplateFixture();
    advertiseTemplateCapabilities(fixture, ['release-management']);
    t.after(() => fs.rmSync(projectRoot, {recursive: true, force: true}));
    assert.equal(provisionPhpWebAdapter(projectRoot, 'template').status, 0);
    const prepare = phpWebHandler.prepareBootstrapProject;
    t.after(() => { phpWebHandler.prepareBootstrapProject = prepare; });
    phpWebHandler.prepareBootstrapProject = (options) => {
        const report = JSON.parse(JSON.stringify(prepare(options)));
        const packagePath = path.join(options.candidateRoot, 'package.json');
        const contents = Buffer.from(`${JSON.stringify({
            name: '@example/template-release',
            version: '0.1.0',
        }, null, 2)}\n`, 'utf8');
        fs.writeFileSync(packagePath, contents);
        report.outputs.find(({path: outputPath}) => outputPath === 'package.json').sha256 =
            crypto.createHash('sha256').update(contents).digest('hex');
        return report;
    };

    const planned = await captureAsyncWrites(() => main([
        'setup', 'project', 'plan', '--source=template',
        '--adapter=@kyaulabs/prism-php-web', `--attempt=${ATTEMPT_ID}`,
        '--capabilities=release-management', '--network-approved=yes', '--json',
    ], {
        projectRoot,
        coreRoot: CORE_ROOT,
        fetch: fixture.fetch,
        input: JSON.stringify({
            schemaVersion: 1,
            displayName: 'Template Release Project',
            summary: 'A Template project with managed releases.',
            capabilityMetadata: {
                'release-management': {repository: 'example/template-release'},
            },
        }),
        run: bootstrapRunner(projectRoot),
    }));

    assert.equal(planned.status, 0, planned.stderr);
    const plan = JSON.parse(planned.stdout);
    assert.deepEqual(plan.capabilities, ['release-management']);
    assert.equal(plan.source.mode, 'TEMPLATE');
    assert.equal(fixture.calls.length, 4);
    assert.equal(plan.outputs.some(({path: outputPath}) =>
        outputPath === '.github/workflows/release.yml'
    ), true);
});

test('carries immutable adapter evidence without exposing it to providers', (t) => {
    const projectRoot = makeTempDir();
    t.after(() => fs.rmSync(projectRoot, {recursive: true, force: true}));
    assert.equal(provisionPhpWebAdapter(projectRoot).status, 0);
    const prepare = phpWebHandler.prepareBootstrapProject;
    let providerRequest;
    t.after(() => { phpWebHandler.prepareBootstrapProject = prepare; });
    phpWebHandler.prepareBootstrapProject = (options) => {
        providerRequest = options.request;
        return prepare(options);
    };

    const planned = planPhpWebProject(projectRoot);
    assert.equal(planned.status, 0, planned.stderr || planned.stdout);
    const plan = JSON.parse(planned.stdout);
    const attemptRoot = path.dirname(path.dirname(plan.data.planPath));
    const journal = JSON.parse(fs.readFileSync(path.join(attemptRoot, 'journal.json'), 'utf8'));

    assert.deepEqual(plan.adapterEvidence, loadSignedAdapterFixture().evidence);
    assert.deepEqual(journal.adapterEvidence, loadSignedAdapterFixture().evidence);
    assert.equal('adapterEvidence' in providerRequest, false);
    assert.deepEqual(Object.keys(providerRequest.adapter).sort(), [
        'bootstrapProtocol', 'id', 'packageName', 'packageVersion',
    ]);
});

test('uses null adapter evidence for Core-only and rejects changed evidence', (t) => {
    const coreRoot = makeTempDir();
    t.after(() => fs.rmSync(coreRoot, {recursive: true, force: true}));
    const coreOnly = planProject(coreRoot, {
        schemaVersion: 1,
        displayName: 'Core Project',
        summary: 'A Core-only project.',
    }, {
        coreRoot: CORE_ROOT,
        randomUUID: () => ATTEMPT_ID,
    });
    assert.equal(coreOnly.status, 0, coreOnly.stderr || coreOnly.stdout);
    const corePlan = JSON.parse(coreOnly.stdout);
    const coreAttemptRoot = path.dirname(path.dirname(corePlan.data.planPath));
    const coreJournal = JSON.parse(fs.readFileSync(
        path.join(coreAttemptRoot, 'journal.json'),
        'utf8'
    ));
    assert.equal(corePlan.adapterEvidence, null);
    assert.equal(coreJournal.adapterEvidence, null);

    const selectedRoot = makeTempDir();
    t.after(() => fs.rmSync(selectedRoot, {recursive: true, force: true}));
    assert.equal(provisionPhpWebAdapter(selectedRoot).status, 0);
    const selected = planPhpWebProject(selectedRoot);
    assert.equal(selected.status, 0, selected.stderr || selected.stdout);
    const selectedPlan = JSON.parse(selected.stdout);
    const selectedAttemptRoot = path.dirname(path.dirname(selectedPlan.data.planPath));
    const journalPath = path.join(selectedAttemptRoot, 'journal.json');
    const journal = JSON.parse(fs.readFileSync(journalPath, 'utf8'));
    journal.adapterEvidence.envelopeDigest = '0'.repeat(64);
    fs.writeFileSync(journalPath, `${JSON.stringify(journal, null, 2)}\n`, {mode: 0o600});

    assert.throws(() => validateBootstrapProjectPlan({
        projectRoot: selectedRoot,
        coreRoot: coreRootFor(selectedRoot),
        attemptId: ATTEMPT_ID,
        planDigest: selectedPlan.planDigest,
    }), /source|evidence/);
});

test('persists and validates the selected-adapter project plan', (t) => {
    const projectRoot = makeTempDir();
    t.after(() => fs.rmSync(projectRoot, {recursive: true, force: true}));
    assert.equal(provisionPhpWebAdapter(projectRoot).status, 0);
    const planned = planPhpWebProject(projectRoot);
    assert.equal(planned.status, 0);
    const plan = JSON.parse(planned.stdout);

    const result = validatePlan(projectRoot, ATTEMPT_ID, plan.planDigest, {coreRoot: CORE_ROOT});
    assert.equal(result.status, 0);
    assert.equal(result.stderr, '');
    const report = JSON.parse(result.stdout);
    assert.equal(report.disposition, 'PLAN_VALID');
    assert.deepEqual(report.adapter, plan.adapter);
    const attemptRoot = path.dirname(path.dirname(plan.data.planPath));
    const journal = JSON.parse(fs.readFileSync(path.join(attemptRoot, 'journal.json'), 'utf8'));
    assert.deepEqual(journal.adapter, plan.adapter);
    assert.equal(journal.phase, 'PREPARED');
});

test('revalidates retained provider declarations against the package-owned manifest', (t) => {
    const projectRoot = makeTempDir();
    t.after(() => fs.rmSync(projectRoot, {recursive: true, force: true}));
    assert.equal(provisionPhpWebAdapter(projectRoot).status, 0);
    const planned = planPhpWebProject(projectRoot);
    assert.equal(planned.status, 0, planned.stderr || planned.stdout);
    const plan = JSON.parse(planned.stdout);
    const providersPath = require.resolve(
        '../../packages/prism-core/scripts/prism-tool/bootstrap-providers'
    );
    const planPath = require.resolve('../../packages/prism-core/scripts/prism-tool/bootstrap-plan');
    const providers = require(providersPath);
    const loadDescriptor = providers.loadTrustedAdapterProviderDescriptor;
    providers.loadTrustedAdapterProviderDescriptor = (options) => {
        const descriptor = loadDescriptor(options);
        return {
            ...descriptor,
            verification: [{id: 'php-web-scaffold-inventory', command: 'changed verification'}],
        };
    };
    delete require.cache[planPath];

    try {
        const {validateBootstrapProjectPlan} = require(planPath);
        assert.throws(() => validateBootstrapProjectPlan({
            projectRoot,
            coreRoot: CORE_ROOT,
            attemptId: ATTEMPT_ID,
            planDigest: plan.planDigest,
        }), /provider report/);
    } finally {
        providers.loadTrustedAdapterProviderDescriptor = loadDescriptor;
        delete require.cache[planPath];
    }
});

test('removes provisional adapter state when provider planning fails', (t) => {
    const projectRoot = makeTempDir();
    t.after(() => fs.rmSync(projectRoot, {recursive: true, force: true}));
    assert.equal(provisionPhpWebAdapter(projectRoot).status, 0);
    const runner = bootstrapRunner(projectRoot);

    const result = planPhpWebProject(projectRoot, (command, args, options) => {
        if (command === 'composer' && args[0] === 'update') {
            return {status: 1, stdout: '', stderr: 'resolution failed', error: undefined};
        }
        return runner(command, args, options);
    });

    assert.equal(result.status, 5);
    assert.match(result.stderr, /project planning failed/);
    assert.deepEqual(fs.readdirSync(projectRoot), []);
});

test('preserves changed provisional adapter state for recovery', (t) => {
    const projectRoot = makeTempDir();
    t.after(() => fs.rmSync(projectRoot, {recursive: true, force: true}));
    assert.equal(provisionPhpWebAdapter(projectRoot).status, 0);
    fs.writeFileSync(
        path.join(projectRoot, '.pi', 'settings.json'),
        `${JSON.stringify({packages: [ADAPTER_ROOT], themes: []}, null, 2)}\n`
    );

    const result = planPhpWebProject(projectRoot);
    const report = JSON.parse(result.stdout);

    assert.equal(result.status, 5);
    assert.equal(report.disposition, 'RECOVERY_REQUIRED');
    assert.equal(fs.existsSync(path.join(projectRoot, '.pi', 'settings.json')), true);
});

test('normalizes the pre-sourceDigest schema-1 journal shape for recovery', (t) => {
    const projectRoot = makeTempDir();
    t.after(() => fs.rmSync(projectRoot, {recursive: true, force: true}));
    const planned = planProject(projectRoot, {
        schemaVersion: 1,
        displayName: 'Project',
        summary: 'One sentence.',
    }, {
        coreRoot: CORE_ROOT,
        randomUUID: () => ATTEMPT_ID,
    });
    const plan = JSON.parse(planned.stdout);
    const attemptRoot = path.dirname(path.dirname(plan.data.planPath));
    const journalPath = path.join(attemptRoot, 'journal.json');
    const journal = JSON.parse(fs.readFileSync(journalPath, 'utf8'));
    delete journal.sourceDigest;
    delete journal.adapterEvidence;
    delete journal.repository;
    delete journal.hooks;
    delete journal.seed;
    fs.writeFileSync(journalPath, `${JSON.stringify(journal)}\n`, {mode: 0o600});

    const normalized = readBootstrapJournal({projectRoot, attemptId: ATTEMPT_ID});

    assert.equal(normalized.sourceDigest, plan.sourceDigest);
    assert.equal(normalized.repository, null);
    assert.equal(normalized.hooks, null);
    assert.equal(normalized.seed, null);
    assert.equal(normalized.phase, 'PREPARED');
});

test('rejects non-canonical applied paths in retained journals', (t) => {
    const projectRoot = makeTempDir();
    t.after(() => fs.rmSync(projectRoot, {recursive: true, force: true}));
    const planned = planProject(projectRoot, {
        schemaVersion: 1,
        displayName: 'Project',
        summary: 'One sentence.',
    }, {
        coreRoot: CORE_ROOT,
        randomUUID: () => ATTEMPT_ID,
    });
    const plan = JSON.parse(planned.stdout);
    applyProject(projectRoot, ATTEMPT_ID, plan.planDigest, {coreRoot: CORE_ROOT});
    const attemptRoot = path.dirname(path.dirname(plan.data.planPath));
    const journalPath = path.join(attemptRoot, 'journal.json');
    const journal = JSON.parse(fs.readFileSync(journalPath, 'utf8'));
    journal.applied[0].path = '../outside';
    fs.writeFileSync(journalPath, `${JSON.stringify(journal)}\n`, {mode: 0o600});

    assert.throws(
        () => readBootstrapJournal({projectRoot, attemptId: ATTEMPT_ID}),
        /bootstrap journal is invalid/
    );
});

test('reads retained journals through a bounded descriptor loop', (t) => {
    const projectRoot = makeTempDir();
    t.after(() => fs.rmSync(projectRoot, {recursive: true, force: true}));
    planProject(projectRoot, {
        schemaVersion: 1,
        displayName: 'Project',
        summary: 'One sentence.',
    }, {
        coreRoot: CORE_ROOT,
        randomUUID: () => ATTEMPT_ID,
    });
    const originalReadFile = fs.readFileSync;
    fs.readFileSync = function rejectUnboundedDescriptorRead(file, ...args) {
        if (typeof file === 'number') throw new Error('unbounded descriptor read');
        return originalReadFile.call(this, file, ...args);
    };

    let journal;
    try {
        journal = readBootstrapJournal({projectRoot, attemptId: ATTEMPT_ID});
    } finally {
        fs.readFileSync = originalReadFile;
    }

    assert.equal(journal.phase, 'PREPARED');
});

test('restores strict emptiness when a prepared project plan is declined', (t) => {
    const projectRoot = makeTempDir();
    t.after(() => fs.rmSync(projectRoot, {recursive: true, force: true}));
    const planned = planProject(projectRoot, {
        schemaVersion: 1,
        displayName: 'Project',
        summary: 'One sentence.',
    }, {
        coreRoot: CORE_ROOT,
        randomUUID: () => ATTEMPT_ID,
    });
    const plan = JSON.parse(planned.stdout);

    const result = recoverProject(projectRoot, ATTEMPT_ID, plan.planDigest, {
        coreRoot: CORE_ROOT,
    });
    const report = JSON.parse(result.stdout);

    assert.equal(result.status, 0);
    assert.equal(result.stderr, '');
    assert.equal(report.status, 'GO');
    assert.equal(report.disposition, 'ROOT_RESTORED');
    assert.equal(report.data.resumePhase, null);
    assert.deepEqual(fs.readdirSync(projectRoot), []);
});

test('restores strict emptiness when a selected-adapter plan is declined', (t) => {
    const projectRoot = makeTempDir();
    t.after(() => fs.rmSync(projectRoot, {recursive: true, force: true}));
    assert.equal(provisionPhpWebAdapter(projectRoot).status, 0);
    const planned = planPhpWebProject(projectRoot);
    assert.equal(planned.status, 0);
    const plan = JSON.parse(planned.stdout);

    const result = recoverProject(projectRoot, ATTEMPT_ID, plan.planDigest, {
        coreRoot: CORE_ROOT,
    });
    const report = JSON.parse(result.stdout);

    assert.equal(result.status, 0);
    assert.equal(result.stderr, '');
    assert.equal(report.disposition, 'ROOT_RESTORED');
    assert.deepEqual(fs.readdirSync(projectRoot), []);
});

test('preserves Template mode across pre-durable rollback and post-durable retention', async () => {
    for (const adapter of ['core-only', 'php-web']) {
        for (const boundary of ['before-durable', 'after-durable']) {
            const projectRoot = makeTempDir();
            try {
                const fixture = createTemplateFixture();
                let planned;
                if (adapter === 'core-only') {
                    planned = await planTemplateCoreProject(projectRoot, fixture);
                } else {
                    assert.equal(provisionPhpWebAdapter(projectRoot, 'template').status, 0);
                    planned = await planTemplatePhpWebProject(projectRoot, fixture);
                }
                assert.equal(planned.status, 0, `${adapter}:${boundary}`);
                const plan = JSON.parse(planned.stdout);
                const result = applyProject(projectRoot, ATTEMPT_ID, plan.planDigest, {
                    coreRoot: CORE_ROOT,
                    bootstrapApplyFault: ({name}) => {
                        if (name === boundary) throw new Error(`injected ${boundary} failure`);
                    },
                });
                const report = JSON.parse(result.stdout);

                assert.equal(result.status, 5, `${adapter}:${boundary}`);
                assert.equal(result.stdout.includes('BLANK'), false, `${adapter}:${boundary}`);
                assert.equal(plan.source.mode, 'TEMPLATE');
                assert.equal(fixture.calls.length, 4);
                if (boundary === 'before-durable') {
                    assert.equal(report.disposition, 'ROOT_RESTORED');
                    assert.deepEqual(fs.readdirSync(projectRoot), []);
                } else {
                    assert.equal(report.disposition, 'PROJECT_DURABLE');
                    assert.equal(report.data.resumePhase, adapter === 'core-only'
                        ? 'REPOSITORY_BOOTSTRAP'
                        : 'BOOTSTRAP_DEPENDENCIES');
                    const journal = readBootstrapJournal({projectRoot, attemptId: ATTEMPT_ID});
                    assert.equal(journal.source.mode, 'TEMPLATE');
                    for (const output of plan.outputs) {
                        assert.equal(fs.existsSync(path.join(projectRoot, output.path)), true);
                    }
                }
            } finally {
                fs.rmSync(projectRoot, {recursive: true, force: true});
            }
        }
    }
});

test('applies the combined selected-adapter scaffold durably', (t) => {
    const projectRoot = makeTempDir();
    t.after(() => fs.rmSync(projectRoot, {recursive: true, force: true}));
    assert.equal(provisionPhpWebAdapter(projectRoot).status, 0);
    const planned = planPhpWebProject(projectRoot, bootstrapGraphRunner(projectRoot));
    assert.equal(planned.status, 0, planned.stderr || planned.stdout);
    const plan = JSON.parse(planned.stdout);

    const result = applyProject(projectRoot, ATTEMPT_ID, plan.planDigest, {
        coreRoot: CORE_ROOT,
        run: installedGraphRunner(projectRoot, []),
    });
    const report = JSON.parse(result.stdout);

    assert.equal(result.status, 0, result.stderr || result.stdout);
    assert.equal(result.stderr, '');
    assert.equal(report.disposition, 'PROJECT_DURABLE');
    const journal = readBootstrapJournal({projectRoot, attemptId: ATTEMPT_ID});
    assert.deepEqual(journal.adapterEvidence, plan.adapterEvidence);
    for (const output of plan.outputs) {
        const outputPath = path.join(projectRoot, ...output.path.split('/'));
        assert.equal(fs.statSync(outputPath).mode & 0o777, output.mode);
        assert.equal(crypto.createHash('sha256').update(fs.readFileSync(outputPath)).digest('hex'), output.sha256);
    }
    assert.equal(fs.existsSync(path.join(projectRoot, '.pi', 'settings.json')), true);
    assert.equal(fs.existsSync(path.join(projectRoot, '.pi', 'prism-tool')), true);
});

test('restores strict emptiness when selected-adapter application fails before durability', (t) => {
    const projectRoot = makeTempDir();
    t.after(() => fs.rmSync(projectRoot, {recursive: true, force: true}));
    assert.equal(provisionPhpWebAdapter(projectRoot).status, 0);
    const planned = planPhpWebProject(projectRoot);
    assert.equal(planned.status, 0, planned.stderr || planned.stdout);
    const plan = JSON.parse(planned.stdout);

    const result = applyProject(projectRoot, ATTEMPT_ID, plan.planDigest, {
        coreRoot: CORE_ROOT,
        bootstrapApplyFault: ({name}) => {
            if (name === 'before-durable') throw new Error('injected pre-durable failure');
        },
    });
    const report = JSON.parse(result.stdout);

    assert.equal(result.status, 5);
    assert.equal(report.disposition, 'ROOT_RESTORED');
    assert.deepEqual(fs.readdirSync(projectRoot), []);
});

test('retains the complete scaffold when failure is injected after durability', (t) => {
    const projectRoot = makeTempDir();
    t.after(() => fs.rmSync(projectRoot, {recursive: true, force: true}));
    assert.equal(provisionPhpWebAdapter(projectRoot).status, 0);
    const planned = planPhpWebProject(projectRoot);
    assert.equal(planned.status, 0, planned.stderr || planned.stdout);
    const plan = JSON.parse(planned.stdout);
    let injected = false;

    const result = applyProject(projectRoot, ATTEMPT_ID, plan.planDigest, {
        coreRoot: CORE_ROOT,
        bootstrapApplyFault: ({name}) => {
            if (name === 'after-durable') {
                injected = true;
                throw new Error('injected post-durable failure');
            }
        },
    });
    const report = JSON.parse(result.stdout);

    assert.equal(result.status, 5);
    assert.equal(injected, true);
    assert.equal(report.disposition, 'PROJECT_DURABLE');
    assert.equal(report.data.resumePhase, 'BOOTSTRAP_DEPENDENCIES');
    for (const output of plan.outputs) {
        assert.equal(fs.existsSync(path.join(projectRoot, ...output.path.split('/'))), true);
    }
});

test('runs selected-adapter effects only after the scaffold is durable', (t) => {
    const projectRoot = makeTempDir();
    t.after(() => fs.rmSync(projectRoot, {recursive: true, force: true}));
    assert.equal(provisionPhpWebAdapter(projectRoot).status, 0);
    const planned = planPhpWebProject(projectRoot, bootstrapGraphRunner(projectRoot));
    assert.equal(planned.status, 0, planned.stderr || planned.stdout);
    const plan = JSON.parse(planned.stdout);
    const operations = [];

    const result = applyProject(projectRoot, ATTEMPT_ID, plan.planDigest, {
        coreRoot: CORE_ROOT,
        run: installedGraphRunner(projectRoot, operations),
    });

    assert.equal(result.status, 0, result.stderr || result.stdout);
    assert.deepEqual(operations, [
        'composer install --no-scripts --no-interaction',
        'npm ci --ignore-scripts',
        `${path.join(projectRoot, 'node_modules', '.bin', 'playwright')} install chromium`,
        'composer audit --locked --format=json',
        'npm audit --package-lock-only --json',
        `${path.join(projectRoot, 'vendor', 'bin', 'php-cs-fixer')} --version`,
        `${path.join(projectRoot, 'vendor', 'bin', 'pest')} --version`,
        `${path.join(projectRoot, 'node_modules', '.bin', 'sass')} --version`,
        `${path.join(projectRoot, 'node_modules', '.bin', 'uglifyjs')} --version`,
        `${path.join(projectRoot, 'node_modules', '.bin', 'eslint')} --version`,
        `${path.join(projectRoot, 'node_modules', '.bin', 'stylelint')} --version`,
        `${path.join(projectRoot, 'node_modules', '.bin', 'playwright')} --version`,
    ]);
    const journal = readBootstrapJournal({projectRoot, attemptId: ATTEMPT_ID});
    assert.equal(journal.resumePhase, 'REPOSITORY_BOOTSTRAP');
});

test('serializes post-durable adapter effects for one bootstrap attempt', (t) => {
    const projectRoot = makeTempDir();
    t.after(() => fs.rmSync(projectRoot, {recursive: true, force: true}));
    assert.equal(provisionPhpWebAdapter(projectRoot).status, 0);
    const planned = planPhpWebProject(projectRoot, bootstrapGraphRunner(projectRoot));
    assert.equal(planned.status, 0, planned.stderr || planned.stdout);
    const plan = JSON.parse(planned.stdout);
    const run = installedGraphRunner(projectRoot, []);
    let nestedError;
    let nested = false;

    const result = applyProject(projectRoot, ATTEMPT_ID, plan.planDigest, {
        coreRoot: CORE_ROOT,
        run: (command, args, options) => {
            if (!nested && command === 'composer' && args[0] === 'install') {
                nested = true;
                try {
                    applyBootstrapProject({
                        projectRoot,
                        coreRoot: CORE_ROOT,
                        attemptId: ATTEMPT_ID,
                        planDigest: plan.planDigest,
                        approval: 'yes',
                        run: installedGraphRunner(projectRoot, []),
                    });
                } catch (error) {
                    nestedError = error;
                }
            }
            return run(command, args, options);
        },
    });

    assert.equal(result.status, 0, result.stderr || result.stdout);
    assert.match(nestedError?.message ?? '', /exist|lock/i);
});

test('retains the durable scaffold when Composer installation fails', (t) => {
    const projectRoot = makeTempDir();
    t.after(() => fs.rmSync(projectRoot, {recursive: true, force: true}));
    assert.equal(provisionPhpWebAdapter(projectRoot).status, 0);
    const planned = planPhpWebProject(projectRoot, bootstrapGraphRunner(projectRoot));
    assert.equal(planned.status, 0, planned.stderr || planned.stdout);
    const plan = JSON.parse(planned.stdout);
    const run = installedGraphRunner(projectRoot, []);

    const result = applyProject(projectRoot, ATTEMPT_ID, plan.planDigest, {
        coreRoot: CORE_ROOT,
        run: (command, args, options) => command === 'composer' && args[0] === 'install'
            ? {status: 1, stdout: '', stderr: 'install failed', error: undefined}
            : run(command, args, options),
    });
    const report = JSON.parse(result.stdout);

    assert.equal(result.status, 5);
    assert.equal(report.disposition, 'PROJECT_DURABLE');
    assert.equal(report.data.resumePhase, 'PROVIDER_EFFECT:composer-install');
    for (const output of plan.outputs) {
        assert.equal(fs.existsSync(path.join(projectRoot, ...output.path.split('/'))), true);
    }
    const journal = readBootstrapJournal({projectRoot, attemptId: ATTEMPT_ID});
    assert.equal(journal.phase, 'DURABLE');
    assert.equal(journal.status, 'ACTIVE');
    assert.equal(journal.resumePhase, 'PROVIDER_EFFECT:composer-install');
});

test('retains the durable scaffold when npm installation fails', (t) => {
    const projectRoot = makeTempDir();
    t.after(() => fs.rmSync(projectRoot, {recursive: true, force: true}));
    assert.equal(provisionPhpWebAdapter(projectRoot).status, 0);
    const planned = planPhpWebProject(projectRoot, bootstrapGraphRunner(projectRoot));
    assert.equal(planned.status, 0, planned.stderr || planned.stdout);
    const plan = JSON.parse(planned.stdout);
    const run = installedGraphRunner(projectRoot, []);

    const result = applyProject(projectRoot, ATTEMPT_ID, plan.planDigest, {
        coreRoot: CORE_ROOT,
        run: (command, args, options) => command === 'npm' && args[0] === 'ci'
            ? {status: 1, stdout: '', stderr: 'install failed', error: undefined}
            : run(command, args, options),
    });
    const report = JSON.parse(result.stdout);

    assert.equal(result.status, 5);
    assert.equal(report.disposition, 'PROJECT_DURABLE');
    assert.equal(report.data.resumePhase, 'PROVIDER_EFFECT:npm-install');
    for (const output of plan.outputs) {
        assert.equal(fs.existsSync(path.join(projectRoot, ...output.path.split('/'))), true);
    }
    const journal = readBootstrapJournal({projectRoot, attemptId: ATTEMPT_ID});
    assert.equal(journal.resumePhase, 'PROVIDER_EFFECT:npm-install');
});

test('retains the durable scaffold when Chromium acquisition fails', (t) => {
    const projectRoot = makeTempDir();
    t.after(() => fs.rmSync(projectRoot, {recursive: true, force: true}));
    assert.equal(provisionPhpWebAdapter(projectRoot).status, 0);
    const planned = planPhpWebProject(projectRoot, bootstrapGraphRunner(projectRoot));
    assert.equal(planned.status, 0, planned.stderr || planned.stdout);
    const plan = JSON.parse(planned.stdout);
    const run = installedGraphRunner(projectRoot, []);

    const result = applyProject(projectRoot, ATTEMPT_ID, plan.planDigest, {
        coreRoot: CORE_ROOT,
        run: (command, args, options) => path.basename(command) === 'playwright' && args[0] === 'install'
            ? {status: 1, stdout: '', stderr: 'browser failed', error: undefined}
            : run(command, args, options),
    });
    const report = JSON.parse(result.stdout);

    assert.equal(result.status, 5);
    assert.equal(report.disposition, 'PROJECT_DURABLE');
    assert.equal(report.data.resumePhase, 'PROVIDER_EFFECT:playwright-chromium');
    for (const output of plan.outputs) {
        assert.equal(fs.existsSync(path.join(projectRoot, ...output.path.split('/'))), true);
    }
    const journal = readBootstrapJournal({projectRoot, attemptId: ATTEMPT_ID});
    assert.equal(journal.resumePhase, 'PROVIDER_EFFECT:playwright-chromium');
    const operations = [];

    const resumed = applyProject(projectRoot, ATTEMPT_ID, plan.planDigest, {
        coreRoot: CORE_ROOT,
        run: installedGraphRunner(projectRoot, operations),
    });

    assert.equal(resumed.status, 0, resumed.stderr || resumed.stdout);
    assert.equal(
        operations[0],
        `${path.join(projectRoot, 'node_modules', '.bin', 'playwright')} install chromium`
    );
    assert.equal(
        operations.some((operation) => operation.startsWith('composer install ')),
        false
    );
    assert.equal(operations.includes('npm ci --ignore-scripts'), false);
});

test('retains the durable scaffold when installed graph verification fails', (t) => {
    const projectRoot = makeTempDir();
    t.after(() => fs.rmSync(projectRoot, {recursive: true, force: true}));
    assert.equal(provisionPhpWebAdapter(projectRoot).status, 0);
    const planned = planPhpWebProject(projectRoot, bootstrapGraphRunner(projectRoot));
    assert.equal(planned.status, 0, planned.stderr || planned.stdout);
    const plan = JSON.parse(planned.stdout);
    const run = installedGraphRunner(projectRoot, []);

    const result = applyProject(projectRoot, ATTEMPT_ID, plan.planDigest, {
        coreRoot: CORE_ROOT,
        run: (command, args, options) => command === 'composer' && args[0] === 'audit'
            ? {status: 1, stdout: '', stderr: 'audit failed', error: undefined}
            : run(command, args, options),
    });
    const report = JSON.parse(result.stdout);

    assert.equal(result.status, 5);
    assert.equal(report.disposition, 'PROJECT_DURABLE');
    assert.equal(report.data.resumePhase, 'PROVIDER_EFFECT:composer-install');
    for (const output of plan.outputs) {
        assert.equal(fs.existsSync(path.join(projectRoot, ...output.path.split('/'))), true);
    }
    const journal = readBootstrapJournal({projectRoot, attemptId: ATTEMPT_ID});
    assert.equal(journal.resumePhase, 'PROVIDER_EFFECT:composer-install');
});

test('retains the durable scaffold when provider byte verification fails', (t) => {
    const projectRoot = makeTempDir();
    t.after(() => fs.rmSync(projectRoot, {recursive: true, force: true}));
    assert.equal(provisionPhpWebAdapter(projectRoot).status, 0);
    const planned = planPhpWebProject(projectRoot, bootstrapGraphRunner(projectRoot));
    assert.equal(planned.status, 0, planned.stderr || planned.stdout);
    const plan = JSON.parse(planned.stdout);
    const run = installedGraphRunner(projectRoot, []);

    const result = applyProject(projectRoot, ATTEMPT_ID, plan.planDigest, {
        coreRoot: CORE_ROOT,
        run: (command, args, options) => {
            const outcome = run(command, args, options);
            if (path.basename(command) === 'playwright' && args[0] === '--version') {
                fs.appendFileSync(path.join(projectRoot, 'composer.json'), ' ');
            }
            return outcome;
        },
    });
    const report = JSON.parse(result.stdout);

    assert.equal(result.status, 5);
    assert.equal(report.disposition, 'PROJECT_DURABLE');
    assert.equal(
        report.data.resumePhase,
        'PROVIDER_VERIFICATION:php-web-scaffold-inventory'
    );
    assert.equal(fs.existsSync(path.join(projectRoot, 'README.md')), true);
    assert.equal(fs.existsSync(path.join(projectRoot, 'composer.json')), true);
    const journal = readBootstrapJournal({projectRoot, attemptId: ATTEMPT_ID});
    assert.equal(
        journal.resumePhase,
        'PROVIDER_VERIFICATION:php-web-scaffold-inventory'
    );
});

test('resumes selected-adapter effects from a durable failure journal', (t) => {
    const projectRoot = makeTempDir();
    t.after(() => fs.rmSync(projectRoot, {recursive: true, force: true}));
    assert.equal(provisionPhpWebAdapter(projectRoot).status, 0);
    const planned = planPhpWebProject(projectRoot, bootstrapGraphRunner(projectRoot));
    assert.equal(planned.status, 0, planned.stderr || planned.stdout);
    const plan = JSON.parse(planned.stdout);
    const firstRun = installedGraphRunner(projectRoot, []);
    const failed = applyProject(projectRoot, ATTEMPT_ID, plan.planDigest, {
        coreRoot: CORE_ROOT,
        run: (command, args, options) => command === 'composer' && args[0] === 'install'
            ? {status: 1, stdout: '', stderr: 'install failed', error: undefined}
            : firstRun(command, args, options),
    });
    assert.equal(failed.status, 5);
    const operations = [];

    const resumed = applyProject(projectRoot, ATTEMPT_ID, plan.planDigest, {
        coreRoot: CORE_ROOT,
        run: installedGraphRunner(projectRoot, operations),
    });
    const report = JSON.parse(resumed.stdout);

    assert.equal(resumed.status, 0, resumed.stderr || resumed.stdout);
    assert.equal(report.data.resumePhase, 'REPOSITORY_BOOTSTRAP');
    assert.equal(operations[0], 'composer install --no-scripts --no-interaction');
    assert.equal(operations.includes('npm ci --ignore-scripts'), true);
    const journal = readBootstrapJournal({projectRoot, attemptId: ATTEMPT_ID});
    assert.equal(journal.resumePhase, 'REPOSITORY_BOOTSTRAP');
});

test('resumes after dependency-created state without weakening scaffold validation', (t) => {
    const projectRoot = makeTempDir();
    t.after(() => fs.rmSync(projectRoot, {recursive: true, force: true}));
    assert.equal(provisionPhpWebAdapter(projectRoot).status, 0);
    const planned = planPhpWebProject(projectRoot, bootstrapGraphRunner(projectRoot));
    assert.equal(planned.status, 0, planned.stderr || planned.stdout);
    const plan = JSON.parse(planned.stdout);
    const firstRun = installedGraphRunner(projectRoot, []);
    const failed = applyProject(projectRoot, ATTEMPT_ID, plan.planDigest, {
        coreRoot: CORE_ROOT,
        run: (command, args, options) => command === 'npm' && args[0] === 'ci'
            ? {status: 1, stdout: '', stderr: 'install failed', error: undefined}
            : firstRun(command, args, options),
    });
    assert.equal(failed.status, 5);
    assert.equal(fs.existsSync(path.join(projectRoot, 'vendor')), true);

    const operations = [];
    const resumed = applyProject(projectRoot, ATTEMPT_ID, plan.planDigest, {
        coreRoot: CORE_ROOT,
        run: installedGraphRunner(projectRoot, operations),
    });
    const report = JSON.parse(resumed.stdout);

    assert.equal(resumed.status, 0, resumed.stderr || resumed.stdout);
    assert.equal(report.data.resumePhase, 'REPOSITORY_BOOTSTRAP');
    assert.equal(operations[0], 'npm ci --ignore-scripts');
    assert.equal(
        operations.some((operation) => operation.startsWith('composer install ')),
        false
    );
    for (const output of plan.outputs) {
        const outputPath = path.join(projectRoot, ...output.path.split('/'));
        assert.equal(
            crypto.createHash('sha256').update(fs.readFileSync(outputPath)).digest('hex'),
            output.sha256
        );
    }
});

test('repairs dependencies before retrying installed graph verification', (t) => {
    const projectRoot = makeTempDir();
    t.after(() => fs.rmSync(projectRoot, {recursive: true, force: true}));
    assert.equal(provisionPhpWebAdapter(projectRoot).status, 0);
    const planned = planPhpWebProject(projectRoot, bootstrapGraphRunner(projectRoot));
    assert.equal(planned.status, 0, planned.stderr || planned.stdout);
    const plan = JSON.parse(planned.stdout);
    const firstRun = installedGraphRunner(projectRoot, []);
    const failed = applyProject(projectRoot, ATTEMPT_ID, plan.planDigest, {
        coreRoot: CORE_ROOT,
        run: (command, args, options) => command === 'composer' && args[0] === 'audit'
            ? {status: 1, stdout: '', stderr: 'audit failed', error: undefined}
            : firstRun(command, args, options),
    });
    assert.equal(failed.status, 5);
    const operations = [];

    const resumed = applyProject(projectRoot, ATTEMPT_ID, plan.planDigest, {
        coreRoot: CORE_ROOT,
        run: installedGraphRunner(projectRoot, operations),
    });

    assert.equal(resumed.status, 0, resumed.stderr || resumed.stdout);
    assert.equal(operations[0], 'composer install --no-scripts --no-interaction');
    assert.equal(operations.includes('npm ci --ignore-scripts'), true);
    assert.equal(
        operations.some((operation) => operation.endsWith('install chromium')),
        true
    );
});

test('resumes provider inventory verification without rerunning dependency effects', (t) => {
    const projectRoot = makeTempDir();
    t.after(() => fs.rmSync(projectRoot, {recursive: true, force: true}));
    assert.equal(provisionPhpWebAdapter(projectRoot).status, 0);
    const planned = planPhpWebProject(projectRoot, bootstrapGraphRunner(projectRoot));
    assert.equal(planned.status, 0, planned.stderr || planned.stdout);
    const plan = JSON.parse(planned.stdout);
    const composerPath = path.join(projectRoot, 'composer.json');
    const firstRun = installedGraphRunner(projectRoot, []);
    const failed = applyProject(projectRoot, ATTEMPT_ID, plan.planDigest, {
        coreRoot: CORE_ROOT,
        run: (command, args, options) => {
            const outcome = firstRun(command, args, options);
            if (path.basename(command) === 'playwright' && args[0] === '--version') {
                fs.appendFileSync(composerPath, ' ');
            }
            return outcome;
        },
    });
    assert.equal(failed.status, 5);
    const expectedComposer = plan.outputs.find(({path: outputPath}) => outputPath === 'composer.json');
    const candidateComposer = path.join(
        projectRoot,
        '.pi',
        'prism-tool',
        'bootstrap',
        ATTEMPT_ID,
        'candidate',
        'adapter',
        'composer.json'
    );
    fs.writeFileSync(composerPath, fs.readFileSync(candidateComposer));
    fs.chmodSync(composerPath, expectedComposer.mode);
    const operations = [];

    const resumed = applyProject(projectRoot, ATTEMPT_ID, plan.planDigest, {
        coreRoot: CORE_ROOT,
        run: installedGraphRunner(projectRoot, operations),
    });

    assert.equal(resumed.status, 0, resumed.stderr || resumed.stdout);
    assert.deepEqual(operations, []);
});

test('reports the retained selected-adapter resume phase during recovery', (t) => {
    const projectRoot = makeTempDir();
    t.after(() => fs.rmSync(projectRoot, {recursive: true, force: true}));
    assert.equal(provisionPhpWebAdapter(projectRoot).status, 0);
    const planned = planPhpWebProject(projectRoot, bootstrapGraphRunner(projectRoot));
    assert.equal(planned.status, 0, planned.stderr || planned.stdout);
    const plan = JSON.parse(planned.stdout);
    const run = installedGraphRunner(projectRoot, []);
    const failed = applyProject(projectRoot, ATTEMPT_ID, plan.planDigest, {
        coreRoot: CORE_ROOT,
        run: (command, args, options) => command === 'npm' && args[0] === 'ci'
            ? {status: 1, stdout: '', stderr: 'install failed', error: undefined}
            : run(command, args, options),
    });
    assert.equal(failed.status, 5);

    const recovered = recoverProject(projectRoot, ATTEMPT_ID, plan.planDigest, {
        coreRoot: CORE_ROOT,
    });
    const report = JSON.parse(recovered.stdout);

    assert.equal(recovered.status, 0, recovered.stderr || recovered.stdout);
    assert.equal(report.disposition, 'PROJECT_DURABLE');
    assert.equal(report.data.resumePhase, 'PROVIDER_EFFECT:npm-install');
    assert.equal(fs.existsSync(path.join(projectRoot, 'vendor')), true);
    assert.equal(fs.existsSync(path.join(projectRoot, 'README.md')), true);
});

test('preserves unowned root state when prepared recovery cannot prove emptiness', (t) => {
    const projectRoot = makeTempDir();
    t.after(() => fs.rmSync(projectRoot, {recursive: true, force: true}));
    const planned = planProject(projectRoot, {
        schemaVersion: 1,
        displayName: 'Project',
        summary: 'One sentence.',
    }, {
        coreRoot: CORE_ROOT,
        randomUUID: () => ATTEMPT_ID,
    });
    const plan = JSON.parse(planned.stdout);
    const humanPath = path.join(projectRoot, 'human-note.txt');
    fs.writeFileSync(humanPath, 'preserve me\n');

    const result = recoverProject(projectRoot, ATTEMPT_ID, plan.planDigest, {
        coreRoot: CORE_ROOT,
    });
    const report = JSON.parse(result.stdout);

    assert.equal(result.status, 5);
    assert.equal(report.status, 'NO-GO');
    assert.equal(report.disposition, 'RECOVERY_REQUIRED');
    assert.equal(report.data.resumePhase, 'MANUAL_RECOVERY');
    assert.equal(fs.readFileSync(humanPath, 'utf8'), 'preserve me\n');
    const attemptRoot = path.dirname(path.dirname(plan.data.planPath));
    assert.equal(fs.existsSync(attemptRoot), true);
    const journal = JSON.parse(fs.readFileSync(path.join(attemptRoot, 'journal.json'), 'utf8'));
    assert.equal(journal.status, 'RECOVERY_REQUIRED');
    assert.equal(journal.reason, 'ROOT_STATE_CHANGED');
    assert.equal(journal.resumePhase, 'MANUAL_RECOVERY');
});

test('applies an approved Blank Core-only plan and marks the project durable', (t) => {
    const projectRoot = makeTempDir();
    t.after(() => fs.rmSync(projectRoot, {recursive: true, force: true}));
    const planned = planProject(projectRoot, {
        schemaVersion: 1,
        displayName: 'Project',
        summary: 'One sentence.',
    }, {
        coreRoot: CORE_ROOT,
        randomUUID: () => ATTEMPT_ID,
    });
    const plan = JSON.parse(planned.stdout);

    const result = applyProject(projectRoot, ATTEMPT_ID, plan.planDigest, {
        coreRoot: CORE_ROOT,
    });
    const report = JSON.parse(result.stdout);
    const attemptRoot = path.dirname(path.dirname(plan.data.planPath));
    const journal = JSON.parse(fs.readFileSync(path.join(attemptRoot, 'journal.json'), 'utf8'));

    assert.equal(result.status, 0);
    assert.equal(result.stderr, '');
    assert.equal(report.status, 'GO');
    assert.equal(report.disposition, 'PROJECT_DURABLE');
    assert.equal(report.data.resumePhase, 'REPOSITORY_BOOTSTRAP');
    assert.equal(fs.existsSync(path.join(projectRoot, '.git')), false);
    assert.deepEqual(
        plan.outputs.map(({path: outputPath}) => outputPath).sort(),
        journal.applied.map(({path: outputPath}) => outputPath).sort()
    );
    assert.equal(journal.phase, 'DURABLE');
    assert.equal(journal.status, 'ACTIVE');
    assert.equal(journal.resumePhase, 'REPOSITORY_BOOTSTRAP');
    assert.match(journal.appliedInventoryDigest, /^[0-9a-f]{64}$/);
    for (const output of plan.outputs) {
        const targetPath = path.join(projectRoot, output.path);
        const stat = fs.lstatSync(targetPath);
        const contents = fs.readFileSync(targetPath);
        assert.equal(stat.isSymbolicLink(), false);
        assert.equal(stat.isFile(), true);
        assert.equal(stat.mode & 0o777, output.mode);
        assert.equal(crypto.createHash('sha256').update(contents).digest('hex'), output.sha256);
    }
});

test('closes a directory descriptor when holding validation throws', (t) => {
    const projectRoot = makeTempDir();
    t.after(() => fs.rmSync(projectRoot, {recursive: true, force: true}));
    const planned = planProject(projectRoot, {
        schemaVersion: 1,
        displayName: 'Project',
        summary: 'One sentence.',
    }, {
        coreRoot: CORE_ROOT,
        randomUUID: () => ATTEMPT_ID,
    });
    const plan = JSON.parse(planned.stdout);
    const originalFstat = fs.fstatSync;
    let rejectedDescriptor;
    fs.fstatSync = function rejectHeldDirectory(descriptor, ...args) {
        if (
            rejectedDescriptor === undefined &&
            new Error().stack.includes('at holdDirectory')
        ) {
            rejectedDescriptor = descriptor;
            throw new Error('injected held-directory validation failure');
        }
        return originalFstat.call(this, descriptor, ...args);
    };
    t.after(() => {
        if (rejectedDescriptor === undefined) return;
        try {
            fs.closeSync(rejectedDescriptor);
        } catch {
            return;
        }
    });

    let result;
    try {
        result = applyProject(projectRoot, ATTEMPT_ID, plan.planDigest, {coreRoot: CORE_ROOT});
    } finally {
        fs.fstatSync = originalFstat;
    }

    assert.equal(result.status, 5);
    assert.notEqual(rejectedDescriptor, undefined);
    assert.throws(
        () => fs.fstatSync(rejectedDescriptor),
        (error) => error.code === 'EBADF'
    );
});

test('does not follow a candidate intermediate directory substituted after plan validation', (t) => {
    const projectRoot = makeTempDir();
    t.after(() => fs.rmSync(projectRoot, {recursive: true, force: true}));
    const planned = planProject(projectRoot, {
        schemaVersion: 1,
        displayName: 'Project',
        summary: 'One sentence.',
    }, {
        coreRoot: CORE_ROOT,
        randomUUID: () => ATTEMPT_ID,
    });
    const plan = JSON.parse(planned.stdout);
    const attemptRoot = path.dirname(path.dirname(plan.data.planPath));
    const candidateRoot = path.join(attemptRoot, 'candidate');
    const originalGithub = path.join(candidateRoot, '.github');
    const displacedGithub = path.join(candidateRoot, '.github-held');
    const originalOpen = fs.openSync;
    let candidateOpens = 0;
    let replaced = false;
    let openedSubstitutedOutput = false;
    fs.openSync = function replaceCandidateIntermediate(filePath, ...args) {
        if (
            replaced &&
            typeof filePath === 'string' &&
            path.basename(filePath) === 'commit-msg' &&
            fs.realpathSync(filePath).includes('/.github-held/')
        ) {
            openedSubstitutedOutput = true;
        }
        const descriptor = originalOpen.call(this, filePath, ...args);
        if (typeof filePath === 'string' && path.basename(filePath) === 'candidate') {
            candidateOpens += 1;
            if (candidateOpens === 10) {
                fs.renameSync(originalGithub, displacedGithub);
                fs.symlinkSync('.github-held', originalGithub, 'dir');
                replaced = true;
            }
        }
        return descriptor;
    };

    let result;
    try {
        result = applyProject(projectRoot, ATTEMPT_ID, plan.planDigest, {coreRoot: CORE_ROOT});
    } finally {
        fs.openSync = originalOpen;
    }
    const report = JSON.parse(result.stdout);

    assert.equal(replaced, true);
    assert.equal(openedSubstitutedOutput, false);
    assert.equal(result.status, 5);
    assert.equal(report.disposition, 'ROOT_RESTORED');
    assert.deepEqual(fs.readdirSync(projectRoot), []);
});

test('does not roll back durable outputs when apply-lock cleanup fails', (t) => {
    const projectRoot = makeTempDir();
    t.after(() => fs.rmSync(projectRoot, {recursive: true, force: true}));
    const planned = planProject(projectRoot, {
        schemaVersion: 1,
        displayName: 'Project',
        summary: 'One sentence.',
    }, {
        coreRoot: CORE_ROOT,
        randomUUID: () => ATTEMPT_ID,
    });
    const plan = JSON.parse(planned.stdout);
    const originalUnlink = fs.unlinkSync;
    let rejected = false;
    fs.unlinkSync = function rejectFirstApplyLock(filePath, ...args) {
        if (!rejected && path.basename(filePath) === 'apply.lock') {
            rejected = true;
            throw new Error('injected lock cleanup failure');
        }
        return originalUnlink.call(this, filePath, ...args);
    };

    let result;
    try {
        result = applyProject(projectRoot, ATTEMPT_ID, plan.planDigest, {coreRoot: CORE_ROOT});
    } finally {
        fs.unlinkSync = originalUnlink;
    }
    const report = JSON.parse(result.stdout);
    const attemptRoot = path.dirname(path.dirname(plan.data.planPath));
    const journal = JSON.parse(fs.readFileSync(path.join(attemptRoot, 'journal.json'), 'utf8'));

    assert.equal(result.status, 0);
    assert.equal(report.disposition, 'PROJECT_DURABLE');
    assert.equal(journal.phase, 'DURABLE');
    for (const output of plan.outputs) assert.equal(fs.existsSync(path.join(projectRoot, output.path)), true);
});

test('recovers a crash-retained apply lock for a durable attempt', (t) => {
    const projectRoot = makeTempDir();
    t.after(() => fs.rmSync(projectRoot, {recursive: true, force: true}));
    const planned = planProject(projectRoot, {
        schemaVersion: 1,
        displayName: 'Project',
        summary: 'One sentence.',
    }, {
        coreRoot: CORE_ROOT,
        randomUUID: () => ATTEMPT_ID,
    });
    const plan = JSON.parse(planned.stdout);
    const applied = applyProject(projectRoot, ATTEMPT_ID, plan.planDigest, {coreRoot: CORE_ROOT});
    assert.equal(applied.status, 0, applied.stderr || applied.stdout);
    const lockPath = path.join(projectRoot, '.pi', 'prism-tool', 'bootstrap', ATTEMPT_ID, 'apply.lock');
    fs.writeFileSync(lockPath, `${JSON.stringify({
        schemaVersion: 1,
        attemptId: ATTEMPT_ID,
        pid: 2147483647,
    })}\n`, {mode: 0o600});

    const resumed = applyProject(projectRoot, ATTEMPT_ID, plan.planDigest, {coreRoot: CORE_ROOT});

    assert.equal(resumed.status, 0, resumed.stderr || resumed.stdout);
    assert.equal(fs.existsSync(lockPath), false);
});

test('serializes competing recovery of one stale durable apply lock', (t) => {
    const projectRoot = makeTempDir();
    t.after(() => fs.rmSync(projectRoot, {recursive: true, force: true}));
    const planned = planProject(projectRoot, {
        schemaVersion: 1,
        displayName: 'Project',
        summary: 'One sentence.',
    }, {
        coreRoot: CORE_ROOT,
        randomUUID: () => ATTEMPT_ID,
    });
    const plan = JSON.parse(planned.stdout);
    const applied = applyProject(projectRoot, ATTEMPT_ID, plan.planDigest, {coreRoot: CORE_ROOT});
    assert.equal(applied.status, 0, applied.stderr || applied.stdout);
    const attemptRoot = path.join(projectRoot, '.pi', 'prism-tool', 'bootstrap', ATTEMPT_ID);
    const lockPath = path.join(attemptRoot, 'apply.lock');
    fs.writeFileSync(lockPath, `${JSON.stringify({
        schemaVersion: 1,
        attemptId: ATTEMPT_ID,
        pid: 2147483647,
    })}\n`, {mode: 0o600});
    const originalWrite = fs.writeFileSync;
    let competing = null;
    fs.writeFileSync = function competeAfterRecoveryLock(file, ...args) {
        const result = originalWrite.call(this, file, ...args);
        if (competing === null && path.basename(file) === 'apply.recovery.lock') {
            competing = applyProject(projectRoot, ATTEMPT_ID, plan.planDigest, {coreRoot: CORE_ROOT});
        }
        return result;
    };

    let resumed;
    try {
        resumed = applyProject(projectRoot, ATTEMPT_ID, plan.planDigest, {coreRoot: CORE_ROOT});
    } finally {
        fs.writeFileSync = originalWrite;
    }

    assert.notEqual(competing, null);
    assert.notEqual(competing.status, 0, competing.stdout);
    assert.equal(resumed.status, 0, resumed.stderr || resumed.stdout);
    assert.equal(fs.existsSync(lockPath), false);
    assert.equal(fs.existsSync(path.join(attemptRoot, 'apply.recovery.lock')), false);
});

test('preserves a crash-retained recovery mutex for manual action', (t) => {
    const projectRoot = makeTempDir();
    t.after(() => fs.rmSync(projectRoot, {recursive: true, force: true}));
    const planned = planProject(projectRoot, {
        schemaVersion: 1,
        displayName: 'Project',
        summary: 'One sentence.',
    }, {
        coreRoot: CORE_ROOT,
        randomUUID: () => ATTEMPT_ID,
    });
    const plan = JSON.parse(planned.stdout);
    const applied = applyProject(projectRoot, ATTEMPT_ID, plan.planDigest, {coreRoot: CORE_ROOT});
    assert.equal(applied.status, 0, applied.stderr || applied.stdout);
    const attemptRoot = path.join(projectRoot, '.pi', 'prism-tool', 'bootstrap', ATTEMPT_ID);
    const lockPath = path.join(attemptRoot, 'apply.lock');
    const recoveryPath = path.join(attemptRoot, 'apply.recovery.lock');
    const stale = `${JSON.stringify({
        schemaVersion: 1,
        attemptId: ATTEMPT_ID,
        pid: 2147483647,
    })}\n`;
    fs.writeFileSync(lockPath, stale, {mode: 0o600});
    fs.writeFileSync(recoveryPath, stale, {mode: 0o600});

    const resumed = applyProject(projectRoot, ATTEMPT_ID, plan.planDigest, {coreRoot: CORE_ROOT});
    const recovered = recoverProject(projectRoot, ATTEMPT_ID, plan.planDigest, {coreRoot: CORE_ROOT});
    const recovery = JSON.parse(recovered.stdout);

    assert.notEqual(resumed.status, 0, resumed.stdout);
    assert.equal(recovered.status, 5);
    assert.equal(recovery.disposition, 'RECOVERY_REQUIRED');
    assert.equal(
        recovery.data.recoveryPath,
        `.pi/prism-tool/bootstrap/${ATTEMPT_ID}/apply.recovery.lock`
    );
    assert.equal(
        recovery.data.nextAction,
        'After confirming no setup process is running, remove only the recovery path and rerun setup project apply.'
    );
    assert.equal(fs.readFileSync(lockPath, 'utf8'), stale);
    assert.equal(fs.readFileSync(recoveryPath, 'utf8'), stale);
});

test('revalidates the apply lock after acquiring the recovery mutex', (t) => {
    const projectRoot = makeTempDir();
    t.after(() => fs.rmSync(projectRoot, {recursive: true, force: true}));
    const planned = planProject(projectRoot, {
        schemaVersion: 1,
        displayName: 'Project',
        summary: 'One sentence.',
    }, {
        coreRoot: CORE_ROOT,
        randomUUID: () => ATTEMPT_ID,
    });
    const plan = JSON.parse(planned.stdout);
    const applied = applyProject(projectRoot, ATTEMPT_ID, plan.planDigest, {coreRoot: CORE_ROOT});
    assert.equal(applied.status, 0, applied.stderr || applied.stdout);
    const attemptRoot = path.join(projectRoot, '.pi', 'prism-tool', 'bootstrap', ATTEMPT_ID);
    const lockPath = path.join(attemptRoot, 'apply.lock');
    fs.writeFileSync(lockPath, `${JSON.stringify({
        schemaVersion: 1,
        attemptId: ATTEMPT_ID,
        pid: 2147483647,
    })}\n`, {mode: 0o600});
    const originalWrite = fs.writeFileSync;
    let replaced = false;
    fs.writeFileSync = function replaceAfterRecoveryLock(file, ...args) {
        const result = originalWrite.call(this, file, ...args);
        if (!replaced && path.basename(file) === 'apply.recovery.lock') {
            replaced = true;
            fs.unlinkSync(lockPath);
            originalWrite.call(this, lockPath, `${JSON.stringify({
                schemaVersion: 1,
                attemptId: ATTEMPT_ID,
                pid: process.pid,
            })}\n`, {mode: 0o600});
        }
        return result;
    };

    let resumed;
    try {
        resumed = applyProject(projectRoot, ATTEMPT_ID, plan.planDigest, {coreRoot: CORE_ROOT});
    } finally {
        fs.writeFileSync = originalWrite;
    }

    assert.equal(replaced, true);
    assert.notEqual(resumed.status, 0, resumed.stdout);
    assert.equal(JSON.parse(fs.readFileSync(lockPath)).pid, process.pid);
});

test('restores strict emptiness when application fails before durability', (t) => {
    const projectRoot = makeTempDir();
    t.after(() => fs.rmSync(projectRoot, {recursive: true, force: true}));
    const planned = planProject(projectRoot, {
        schemaVersion: 1,
        displayName: 'Project',
        summary: 'One sentence.',
    }, {
        coreRoot: CORE_ROOT,
        randomUUID: () => ATTEMPT_ID,
    });
    const plan = JSON.parse(planned.stdout);

    const result = applyProject(projectRoot, ATTEMPT_ID, plan.planDigest, {
        coreRoot: CORE_ROOT,
        bootstrapApplyFault(event) {
            if (event.name === 'after-output' && event.index === 0) {
                throw new Error('injected application failure');
            }
        },
    });
    const report = JSON.parse(result.stdout);

    assert.equal(result.status, 5);
    assert.equal(report.status, 'NO-GO');
    assert.equal(report.disposition, 'ROOT_RESTORED');
    assert.equal(report.data.resumePhase, null);
    assert.deepEqual(fs.readdirSync(projectRoot), []);
});

test('restores strict emptiness at every pre-durable application boundary', () => {
    const scenarios = [
        {attemptId: '10000000-0000-4000-8000-000000000000', event: 'after-output', index: 0},
        {attemptId: '20000000-0000-4000-8000-000000000000', event: 'after-output', index: 1},
        {attemptId: '30000000-0000-4000-8000-000000000000', event: 'after-output', index: 2},
        {attemptId: '40000000-0000-4000-8000-000000000000', event: 'after-output', index: 3},
        {attemptId: '50000000-0000-4000-8000-000000000000', event: 'after-output', index: 4},
        {attemptId: '60000000-0000-4000-8000-000000000000', event: 'after-output', index: 5},
        {attemptId: '70000000-0000-4000-8000-000000000000', event: 'after-output', index: 6},
        {attemptId: '80000000-0000-4000-8000-000000000000', event: 'before-durable'},
    ];
    for (const scenario of scenarios) {
        const projectRoot = makeTempDir();
        try {
            const planned = planProject(projectRoot, {
                schemaVersion: 1,
                displayName: 'Project',
                summary: 'One sentence.',
            }, {
                coreRoot: CORE_ROOT,
                randomUUID: () => scenario.attemptId,
            });
            const plan = JSON.parse(planned.stdout);
            const result = applyProject(projectRoot, scenario.attemptId, plan.planDigest, {
                coreRoot: CORE_ROOT,
                bootstrapApplyFault(event) {
                    if (
                        event.name === scenario.event &&
                        (scenario.index === undefined || event.index === scenario.index)
                    ) {
                        throw new Error('injected application failure');
                    }
                },
            });
            const report = JSON.parse(result.stdout);
            assert.equal(report.disposition, 'ROOT_RESTORED');
            assert.deepEqual(fs.readdirSync(projectRoot), []);
        } finally {
            fs.rmSync(projectRoot, {recursive: true, force: true});
        }
    }
});

test('recovers exact recorded outputs from a crash-retained applying journal', (t) => {
    const projectRoot = makeTempDir();
    t.after(() => fs.rmSync(projectRoot, {recursive: true, force: true}));
    const planned = planProject(projectRoot, {
        schemaVersion: 1,
        displayName: 'Project',
        summary: 'One sentence.',
    }, {
        coreRoot: CORE_ROOT,
        randomUUID: () => ATTEMPT_ID,
    });
    const plan = JSON.parse(planned.stdout);
    const attemptRoot = path.dirname(path.dirname(plan.data.planPath));
    const output = plan.outputs[0];
    const candidatePath = path.join(attemptRoot, 'candidate', ...output.path.split('/'));
    const targetPath = path.join(projectRoot, ...output.path.split('/'));
    const createdDirectories = [];
    let parent = projectRoot;
    let relative = '';
    for (const segment of output.path.split('/').slice(0, -1)) {
        relative = relative === '' ? segment : `${relative}/${segment}`;
        parent = path.join(parent, segment);
        fs.mkdirSync(parent, {mode: 0o755});
        const stat = fs.lstatSync(parent);
        createdDirectories.push({path: relative, dev: stat.dev, ino: stat.ino});
    }
    fs.copyFileSync(candidatePath, targetPath);
    fs.chmodSync(targetPath, output.mode);
    const target = fs.lstatSync(targetPath);
    const journalPath = path.join(attemptRoot, 'journal.json');
    const journal = JSON.parse(fs.readFileSync(journalPath, 'utf8'));
    journal.phase = 'APPLYING';
    journal.applied = [{
        path: output.path,
        kind: output.kind,
        mode: output.mode,
        sha256: output.sha256,
        dev: target.dev,
        ino: target.ino,
    }];
    journal.createdDirectories = createdDirectories;
    fs.writeFileSync(journalPath, `${JSON.stringify(journal)}\n`, {mode: 0o600});
    fs.writeFileSync(
        path.join(attemptRoot, 'apply.lock'),
        `${JSON.stringify({schemaVersion: 1, attemptId: ATTEMPT_ID})}\n`,
        {mode: 0o600}
    );

    const result = recoverProject(projectRoot, ATTEMPT_ID, plan.planDigest, {
        coreRoot: CORE_ROOT,
    });
    const report = JSON.parse(result.stdout);

    assert.equal(result.status, 0);
    assert.equal(report.disposition, 'ROOT_RESTORED');
    assert.deepEqual(fs.readdirSync(projectRoot), []);
});

test('preserves concurrent third-state content during failed application recovery', (t) => {
    const projectRoot = makeTempDir();
    t.after(() => fs.rmSync(projectRoot, {recursive: true, force: true}));
    const planned = planProject(projectRoot, {
        schemaVersion: 1,
        displayName: 'Project',
        summary: 'One sentence.',
    }, {
        coreRoot: CORE_ROOT,
        randomUUID: () => ATTEMPT_ID,
    });
    const plan = JSON.parse(planned.stdout);
    const humanPath = path.join(projectRoot, 'human-note.txt');

    const result = applyProject(projectRoot, ATTEMPT_ID, plan.planDigest, {
        coreRoot: CORE_ROOT,
        bootstrapApplyFault(event) {
            if (event.name === 'after-output' && event.index === 0) {
                fs.writeFileSync(humanPath, 'preserve me\n');
                throw new Error('injected concurrent state');
            }
        },
    });
    const report = JSON.parse(result.stdout);
    const attemptRoot = path.dirname(path.dirname(plan.data.planPath));
    const journal = JSON.parse(fs.readFileSync(path.join(attemptRoot, 'journal.json'), 'utf8'));

    assert.equal(result.status, 5);
    assert.equal(report.disposition, 'RECOVERY_REQUIRED');
    assert.equal(report.data.resumePhase, 'MANUAL_RECOVERY');
    assert.equal(fs.readFileSync(humanPath, 'utf8'), 'preserve me\n');
    assert.equal(fs.existsSync(path.join(projectRoot, '.github', 'hooks', 'commit-msg')), false);
    assert.equal(journal.status, 'RECOVERY_REQUIRED');
    assert.equal(journal.reason, 'AMBIGUOUS_PROJECT_STATE');
    assert.equal(journal.resumePhase, 'MANUAL_RECOVERY');
});

test('preserves an applied output that changes before rollback', (t) => {
    const projectRoot = makeTempDir();
    t.after(() => fs.rmSync(projectRoot, {recursive: true, force: true}));
    const planned = planProject(projectRoot, {
        schemaVersion: 1,
        displayName: 'Project',
        summary: 'One sentence.',
    }, {
        coreRoot: CORE_ROOT,
        randomUUID: () => ATTEMPT_ID,
    });
    const plan = JSON.parse(planned.stdout);
    const changedPath = path.join(projectRoot, '.github', 'hooks', 'commit-msg');

    const result = applyProject(projectRoot, ATTEMPT_ID, plan.planDigest, {
        coreRoot: CORE_ROOT,
        bootstrapApplyFault(event) {
            if (event.name === 'after-output' && event.index === 0) {
                fs.writeFileSync(changedPath, 'human replacement\n');
                throw new Error('injected changed output');
            }
        },
    });
    const report = JSON.parse(result.stdout);
    const attemptRoot = path.dirname(path.dirname(plan.data.planPath));
    const journal = JSON.parse(fs.readFileSync(path.join(attemptRoot, 'journal.json'), 'utf8'));

    assert.equal(result.status, 5);
    assert.equal(report.disposition, 'RECOVERY_REQUIRED');
    assert.equal(fs.readFileSync(changedPath, 'utf8'), 'human replacement\n');
    assert.equal(journal.status, 'RECOVERY_REQUIRED');
    assert.equal(journal.applied.length, 1);
});

test('revalidates and idempotently resumes a durable project', (t) => {
    const projectRoot = makeTempDir();
    t.after(() => fs.rmSync(projectRoot, {recursive: true, force: true}));
    const planned = planProject(projectRoot, {
        schemaVersion: 1,
        displayName: 'Project',
        summary: 'One sentence.',
    }, {
        coreRoot: CORE_ROOT,
        randomUUID: () => ATTEMPT_ID,
    });
    const plan = JSON.parse(planned.stdout);
    const applied = applyProject(projectRoot, ATTEMPT_ID, plan.planDigest, {
        coreRoot: CORE_ROOT,
    });
    const first = JSON.parse(applied.stdout);
    const readmePath = path.join(projectRoot, 'README.md');
    const before = fs.statSync(readmePath);

    const recovered = recoverProject(projectRoot, ATTEMPT_ID, plan.planDigest, {
        coreRoot: CORE_ROOT,
    });
    const recovery = JSON.parse(recovered.stdout);
    const repeated = applyProject(projectRoot, ATTEMPT_ID, plan.planDigest, {
        coreRoot: CORE_ROOT,
    });
    const second = JSON.parse(repeated.stdout);
    const after = fs.statSync(readmePath);

    assert.equal(recovered.status, 0);
    assert.equal(recovery.disposition, 'PROJECT_DURABLE');
    assert.equal(recovery.data.resumePhase, 'REPOSITORY_BOOTSTRAP');
    assert.equal(repeated.status, 0);
    assert.equal(second.disposition, 'PROJECT_DURABLE');
    assert.equal(second.data.appliedInventoryDigest, first.data.appliedInventoryDigest);
    assert.equal(after.ino, before.ino);
    assert.equal(after.mtimeMs, before.mtimeMs);
});

test('does not traverse a durable directory replaced after inventory inspection', (t) => {
    const projectRoot = makeTempDir();
    const outside = makeTempDir();
    t.after(() => fs.rmSync(projectRoot, {recursive: true, force: true}));
    t.after(() => fs.rmSync(outside, {recursive: true, force: true}));
    const planned = planProject(projectRoot, {
        schemaVersion: 1,
        displayName: 'Project',
        summary: 'One sentence.',
    }, {
        coreRoot: CORE_ROOT,
        randomUUID: () => ATTEMPT_ID,
    });
    const plan = JSON.parse(planned.stdout);
    applyProject(projectRoot, ATTEMPT_ID, plan.planDigest, {coreRoot: CORE_ROOT});
    const githubPath = path.join(projectRoot, '.github');
    const displacedPath = path.join(projectRoot, '.github-held');
    const originalLstat = fs.lstatSync;
    const originalReaddir = fs.readdirSync;
    let replaced = false;
    let traversedOutside = false;
    fs.lstatSync = function replaceInspectedDirectory(filePath, ...args) {
        const stat = originalLstat.call(this, filePath, ...args);
        if (
            !replaced &&
            typeof filePath === 'string' &&
            path.basename(filePath) === '.github' &&
            filePath.includes('/proc/self/fd/') &&
            fs.realpathSync(filePath) === githubPath
        ) {
            fs.renameSync(githubPath, displacedPath);
            fs.symlinkSync(outside, githubPath, 'dir');
            replaced = true;
        }
        return stat;
    };
    fs.readdirSync = function detectOutsideTraversal(directoryPath, ...args) {
        if (
            replaced &&
            typeof directoryPath === 'string' &&
            fs.realpathSync(directoryPath) === outside
        ) {
            traversedOutside = true;
        }
        return originalReaddir.call(this, directoryPath, ...args);
    };

    let result;
    try {
        result = recoverProject(projectRoot, ATTEMPT_ID, plan.planDigest, {
            coreRoot: CORE_ROOT,
        });
    } finally {
        fs.lstatSync = originalLstat;
        fs.readdirSync = originalReaddir;
    }
    const report = JSON.parse(result.stdout);

    assert.equal(replaced, true);
    assert.equal(traversedOutside, false);
    assert.equal(result.status, 5);
    assert.equal(report.disposition, 'RECOVERY_REQUIRED');
});

test('retains a durable project when unexpected nested state appears', (t) => {
    const projectRoot = makeTempDir();
    t.after(() => fs.rmSync(projectRoot, {recursive: true, force: true}));
    const planned = planProject(projectRoot, {
        schemaVersion: 1,
        displayName: 'Project',
        summary: 'One sentence.',
    }, {
        coreRoot: CORE_ROOT,
        randomUUID: () => ATTEMPT_ID,
    });
    const plan = JSON.parse(planned.stdout);
    applyProject(projectRoot, ATTEMPT_ID, plan.planDigest, {coreRoot: CORE_ROOT});
    const unexpectedPath = path.join(projectRoot, '.github', 'hooks', 'unexpected');
    fs.writeFileSync(unexpectedPath, 'preserve me\n');

    const result = recoverProject(projectRoot, ATTEMPT_ID, plan.planDigest, {
        coreRoot: CORE_ROOT,
    });
    const report = JSON.parse(result.stdout);

    assert.equal(result.status, 5);
    assert.equal(report.disposition, 'RECOVERY_REQUIRED');
    assert.equal(fs.readFileSync(unexpectedPath, 'utf8'), 'preserve me\n');
});

test('retains a durable project when an applied output drifts', (t) => {
    const projectRoot = makeTempDir();
    t.after(() => fs.rmSync(projectRoot, {recursive: true, force: true}));
    const planned = planProject(projectRoot, {
        schemaVersion: 1,
        displayName: 'Project',
        summary: 'One sentence.',
    }, {
        coreRoot: CORE_ROOT,
        randomUUID: () => ATTEMPT_ID,
    });
    const plan = JSON.parse(planned.stdout);
    applyProject(projectRoot, ATTEMPT_ID, plan.planDigest, {coreRoot: CORE_ROOT});
    const readmePath = path.join(projectRoot, 'README.md');
    fs.writeFileSync(readmePath, 'changed after durability\n');

    const result = recoverProject(projectRoot, ATTEMPT_ID, plan.planDigest, {
        coreRoot: CORE_ROOT,
    });
    const report = JSON.parse(result.stdout);
    const attemptRoot = path.dirname(path.dirname(plan.data.planPath));
    const journal = JSON.parse(fs.readFileSync(path.join(attemptRoot, 'journal.json'), 'utf8'));

    assert.equal(result.status, 5);
    assert.equal(report.disposition, 'RECOVERY_REQUIRED');
    assert.equal(fs.readFileSync(readmePath, 'utf8'), 'changed after durability\n');
    assert.equal(journal.phase, 'DURABLE');
    assert.equal(journal.status, 'RECOVERY_REQUIRED');
    assert.equal(journal.reason, 'AMBIGUOUS_PROJECT_STATE');
    assert.equal(journal.resumePhase, 'MANUAL_RECOVERY');
});

test('requires literal approval before applying a project plan', (t) => {
    const projectRoot = makeTempDir();
    t.after(() => fs.rmSync(projectRoot, {recursive: true, force: true}));
    const planned = planProject(projectRoot, {
        schemaVersion: 1,
        displayName: 'Project',
        summary: 'One sentence.',
    }, {
        coreRoot: CORE_ROOT,
        randomUUID: () => ATTEMPT_ID,
    });
    const plan = JSON.parse(planned.stdout);

    const result = captureWrites(() => main([
        'setup', 'project', 'apply', `--attempt=${ATTEMPT_ID}`,
        `--digest=${plan.planDigest}`, '--json',
    ], {projectRoot, coreRoot: CORE_ROOT}));

    assert.equal(result.status, 2);
    assert.match(result.stderr, /--approval=yes/);
    assert.equal(fs.existsSync(path.join(projectRoot, 'README.md')), false);
    assert.equal(fs.existsSync(path.join(projectRoot, '.git')), false);
});

test('keeps semantic plan digests stable across roots and attempt IDs', () => {
    const roots = [makeTempDir(), makeTempDir()];
    try {
        const reports = roots.map((projectRoot, index) => {
            const result = planProject(projectRoot, {
                schemaVersion: 1,
                displayName: 'Project',
                summary: 'One sentence.',
            }, {
                coreRoot: CORE_ROOT,
                randomUUID: () => index === 0
                    ? ATTEMPT_ID
                    : 'abcdefab-cdef-4abc-8def-abcdefabcdef',
            });
            return JSON.parse(result.stdout);
        });

        assert.equal(reports[0].planDigest, reports[1].planDigest);
        assert.equal(reports[0].metadataDigest, reports[1].metadataDigest);
        assert.equal(
            reports[0].filesystem.attemptInventoryDigest,
            reports[1].filesystem.attemptInventoryDigest
        );
        assert.deepEqual(reports[0].outputs, reports[1].outputs);
        assert.notEqual(reports[0].data.attempt.id, reports[1].data.attempt.id);
        assert.notEqual(reports[0].data.planPath, reports[1].data.planPath);
    } finally {
        for (const projectRoot of roots) fs.rmSync(projectRoot, {recursive: true, force: true});
    }
});

test('revalidates an unchanged active project plan', (t) => {
    const projectRoot = makeTempDir();
    t.after(() => fs.rmSync(projectRoot, {recursive: true, force: true}));
    const planned = planProject(projectRoot, {
        schemaVersion: 1,
        displayName: 'Project',
        summary: 'One sentence.',
    }, {
        coreRoot: CORE_ROOT,
        randomUUID: () => ATTEMPT_ID,
    });
    const plan = JSON.parse(planned.stdout);

    const result = validatePlan(projectRoot, ATTEMPT_ID, plan.planDigest, {coreRoot: CORE_ROOT});
    const report = JSON.parse(result.stdout);

    assert.equal(result.status, 0);
    assert.equal(result.stderr, '');
    assert.equal(report.status, 'GO');
    assert.equal(report.disposition, 'PLAN_VALID');
    assert.equal(report.planDigest, plan.planDigest);
    assert.equal(report.data.attempt.id, ATTEMPT_ID);
});

test('does not traverse the project manifest through an unheld intermediate directory', (t) => {
    const projectRoot = makeTempDir();
    const outside = makeTempDir();
    t.after(() => fs.rmSync(projectRoot, {recursive: true, force: true}));
    t.after(() => fs.rmSync(outside, {recursive: true, force: true}));
    const planned = planProject(projectRoot, {
        schemaVersion: 1,
        displayName: 'Project',
        summary: 'One sentence.',
    }, {
        coreRoot: CORE_ROOT,
        randomUUID: () => ATTEMPT_ID,
    });
    const plan = JSON.parse(planned.stdout);
    const attemptRoot = path.dirname(path.dirname(plan.data.planPath));
    const prismRoot = path.join(attemptRoot, 'candidate', '.prism');
    const displaced = path.join(attemptRoot, 'candidate', '.prism-held');
    const externalPrism = path.join(outside, '.prism');
    fs.cpSync(prismRoot, externalPrism, {recursive: true});
    const originalOpen = fs.openSync;
    let replaced = false;
    fs.openSync = function replaceManifestParent(filePath, ...args) {
        if (
            !replaced &&
            typeof filePath === 'string' &&
            filePath.endsWith(`${path.sep}.prism${path.sep}project.json`)
        ) {
            replaced = true;
            fs.renameSync(prismRoot, displaced);
            fs.symlinkSync(externalPrism, prismRoot, 'dir');
        }
        return originalOpen.call(this, filePath, ...args);
    };

    let result;
    try {
        result = validatePlan(projectRoot, ATTEMPT_ID, plan.planDigest, {coreRoot: CORE_ROOT});
    } finally {
        fs.openSync = originalOpen;
    }

    assert.equal(result.status, 0);
    assert.equal(replaced, false);
});

test('rejects a substituted attempt child before opening external state', (t) => {
    const projectRoot = makeTempDir();
    const outside = makeTempDir();
    t.after(() => fs.rmSync(projectRoot, {recursive: true, force: true}));
    t.after(() => fs.rmSync(outside, {recursive: true, force: true}));
    const planned = planProject(projectRoot, {
        schemaVersion: 1,
        displayName: 'Project',
        summary: 'One sentence.',
    }, {
        coreRoot: CORE_ROOT,
        randomUUID: () => ATTEMPT_ID,
    });
    const plan = JSON.parse(planned.stdout);
    const attemptRoot = path.dirname(path.dirname(plan.data.planPath));
    const reportsRoot = path.join(attemptRoot, 'reports');
    const externalReports = path.join(outside, 'reports');
    fs.cpSync(reportsRoot, externalReports, {recursive: true});
    fs.rmSync(reportsRoot, {recursive: true});
    fs.symlinkSync(externalReports, reportsRoot, 'dir');
    const originalOpen = fs.openSync;
    let externalOpens = 0;
    fs.openSync = function countExternalOpen(filePath, ...args) {
        if (typeof filePath === 'string' && filePath.startsWith(`${reportsRoot}${path.sep}`)) {
            externalOpens += 1;
        }
        return originalOpen.call(this, filePath, ...args);
    };

    let result;
    try {
        result = validatePlan(projectRoot, ATTEMPT_ID, plan.planDigest, {coreRoot: CORE_ROOT});
    } finally {
        fs.openSync = originalOpen;
    }

    assert.equal(result.status, 5);
    assert.equal(externalOpens, 0);
});

test('rejects an unknown profile report even when private digests are rebound', (t) => {
    const projectRoot = makeTempDir();
    t.after(() => fs.rmSync(projectRoot, {recursive: true, force: true}));
    const planned = captureWrites(() => main([
        'setup', 'project', 'plan', '--source=blank', '--adapter=core-only',
        '--capabilities=security-disclosure', '--json',
    ], {
        projectRoot,
        coreRoot: CORE_ROOT,
        randomUUID: () => ATTEMPT_ID,
        input: JSON.stringify({
            schemaVersion: 1,
            displayName: 'Security Project',
            summary: 'A digest-bound security project.',
            capabilityMetadata: {
                'security-disclosure': {
                    reportingContact: 'security@example.test',
                    supportedVersionPolicy: 'latest-release',
                },
            },
        }),
    }));
    assert.equal(planned.status, 0, planned.stderr);
    const plan = JSON.parse(planned.stdout);
    const attemptRoot = path.dirname(path.dirname(plan.data.planPath));
    fs.writeFileSync(
        path.join(attemptRoot, 'reports', 'profile-release-management.json'),
        '{}\n',
        {mode: 0o600}
    );
    const envelope = JSON.parse(fs.readFileSync(plan.data.planPath, 'utf8'));
    envelope.plan.filesystem.attemptInventoryDigest = attemptInventoryDigest(attemptRoot);
    const reboundDigest = crypto.createHash('sha256')
        .update(Buffer.from(JSON.stringify(envelope.plan), 'utf8'))
        .digest('hex');
    envelope.planDigest = reboundDigest;
    fs.writeFileSync(plan.data.planPath, `${JSON.stringify(envelope, null, 2)}\n`, {mode: 0o600});
    const journalPath = path.join(attemptRoot, 'journal.json');
    const journal = JSON.parse(fs.readFileSync(journalPath, 'utf8'));
    journal.planDigest = reboundDigest;
    fs.writeFileSync(journalPath, `${JSON.stringify(journal, null, 2)}\n`, {mode: 0o600});

    const result = validatePlan(projectRoot, ATTEMPT_ID, reboundDigest, {coreRoot: CORE_ROOT});
    const report = JSON.parse(result.stdout);

    assert.equal(result.status, 5);
    assert.equal(report.disposition, 'STALE_PROJECT_STATE');
});

test('fails closed when any active project-plan state changes', () => {
    const cases = [
        {
            name: 'root entry',
            mutate: ({projectRoot}) => fs.writeFileSync(path.join(projectRoot, 'human.txt'), 'human'),
        },
        {
            name: 'candidate bytes',
            mutate: ({candidateRoot}) => fs.appendFileSync(path.join(candidateRoot, 'README.md'), 'changed'),
        },
        {
            name: 'candidate mode',
            mutate: ({candidateRoot}) => fs.chmodSync(path.join(candidateRoot, 'README.md'), 0o600),
        },
        {
            name: 'candidate symlink',
            mutate: ({candidateRoot}) => {
                fs.unlinkSync(path.join(candidateRoot, 'README.md'));
                fs.symlinkSync('commitlint.config.cjs', path.join(candidateRoot, 'README.md'));
            },
        },
        {
            name: 'metadata report',
            mutate: ({reportsRoot}) => {
                const filePath = path.join(reportsRoot, 'metadata.json');
                const value = JSON.parse(fs.readFileSync(filePath, 'utf8'));
                value.unknown = true;
                fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, {mode: 0o600});
            },
        },
        {
            name: 'provider report',
            mutate: ({reportsRoot}) => {
                const filePath = path.join(reportsRoot, 'core-baseline.json');
                const value = JSON.parse(fs.readFileSync(filePath, 'utf8'));
                value.unknown = true;
                fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, {mode: 0o600});
            },
        },
        {
            name: 'plan schema',
            disposition: 'INVALID_PLAN',
            mutate: ({planPath}) => {
                const value = JSON.parse(fs.readFileSync(planPath, 'utf8'));
                value.plan.unknown = true;
                fs.writeFileSync(planPath, `${JSON.stringify(value, null, 2)}\n`, {mode: 0o600});
            },
        },
        {
            name: 'another attempt',
            mutate: ({bootstrapRoot}) => fs.mkdirSync(
                path.join(bootstrapRoot, 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'),
                {mode: 0o700}
            ),
        },
    ];

    for (const scenario of cases) {
        const projectRoot = makeTempDir();
        try {
            const planned = planProject(projectRoot, {
                schemaVersion: 1,
                displayName: 'Project',
                summary: 'One sentence.',
            }, {
                coreRoot: CORE_ROOT,
                randomUUID: () => ATTEMPT_ID,
            });
            const plan = JSON.parse(planned.stdout);
            const attemptRoot = path.dirname(path.dirname(plan.data.planPath));
            scenario.mutate({
                projectRoot,
                attemptRoot,
                candidateRoot: path.join(attemptRoot, 'candidate'),
                reportsRoot: path.join(attemptRoot, 'reports'),
                bootstrapRoot: path.dirname(attemptRoot),
                planPath: plan.data.planPath,
            });

            const result = validatePlan(projectRoot, ATTEMPT_ID, plan.planDigest, {
                coreRoot: CORE_ROOT,
            });
            const report = JSON.parse(result.stdout);

            assert.equal(result.status, 5, scenario.name);
            assert.equal(result.stderr, '', scenario.name);
            assert.equal(
                report.disposition,
                scenario.disposition ?? 'STALE_PROJECT_STATE',
                scenario.name
            );
        } finally {
            fs.rmSync(projectRoot, {recursive: true, force: true});
        }
    }

    const projectRoot = makeTempDir();
    try {
        const planned = planProject(projectRoot, {
            schemaVersion: 1,
            displayName: 'Project',
            summary: 'One sentence.',
        }, {
            coreRoot: CORE_ROOT,
            randomUUID: () => ATTEMPT_ID,
        });
        const plan = JSON.parse(planned.stdout);
        for (const [attemptId, digest] of [
            ['aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', plan.planDigest],
            [ATTEMPT_ID, '0'.repeat(64)],
        ]) {
            const result = validatePlan(projectRoot, attemptId, digest, {coreRoot: CORE_ROOT});
            const report = JSON.parse(result.stdout);
            assert.equal(result.status, 5);
            assert.equal(report.disposition, 'STALE_PROJECT_STATE');
        }
    } finally {
        fs.rmSync(projectRoot, {recursive: true, force: true});
    }
});

test('restores strict emptiness when planning fails before readiness', (t) => {
    const projectRoot = makeTempDir();
    const coreRoot = makeTempDir();
    t.after(() => fs.rmSync(projectRoot, {recursive: true, force: true}));
    t.after(() => fs.rmSync(coreRoot, {recursive: true, force: true}));
    fs.writeFileSync(path.join(coreRoot, 'package.json'), JSON.stringify({
        name: '@kyaulabs/not-prism-core',
        version: '0.3.1',
    }));

    const result = planProject(projectRoot, {
        schemaVersion: 1,
        displayName: 'Project',
        summary: 'One sentence.',
    }, {
        coreRoot,
        randomUUID: () => ATTEMPT_ID,
    });

    assert.equal(result.status, 5);
    assert.equal(result.stdout, '');
    assert.match(result.stderr, /project planning failed/);
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

test('rejects malformed UTF-8 metadata bytes without changing the project root', (t) => {
    const projectRoot = makeTempDir();
    t.after(() => fs.rmSync(projectRoot, {recursive: true, force: true}));
    const input = Buffer.concat([
        Buffer.from('{"schemaVersion":1,"displayName":"Project'),
        Buffer.from([0xff]),
        Buffer.from('","summary":"One sentence."}'),
    ]);

    const result = planInput(projectRoot, input);

    assert.equal(result.status, 5);
    assert.equal(result.stdout, '');
    assert.match(result.stderr, /project metadata is invalid/);
    assert.deepEqual(fs.readdirSync(projectRoot), []);
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

test('renders immutable Template evidence through the trusted Core baseline', (t) => {
    const candidateRoot = makeTempDir();
    t.after(() => fs.rmSync(candidateRoot, {recursive: true, force: true}));

    const report = renderCoreBaseline({
        coreRoot: CORE_ROOT,
        candidateRoot,
        request: {
            schemaVersion: 1,
            source: TEMPLATE_SOURCE,
            capabilities: [],
            metadata: {
                schemaVersion: 1,
                displayName: 'Template Project',
                summary: 'A trusted-provider project.',
                suggestedDisplayName: 'template-project',
            },
            adapter: null,
        },
    });
    const manifestOutput = report.outputs.find(({path: outputPath}) =>
        outputPath === '.prism/project.json'
    );
    const manifest = JSON.parse(fs.readFileSync(manifestOutput.candidatePath, 'utf8'));

    assert.deepEqual(manifest.source, TEMPLATE_SOURCE);
    assert.equal(
        report.outputs.some(({candidatePath}) =>
            fs.readFileSync(candidatePath).includes(Buffer.from('remote template bytes'))
        ),
        false
    );
});

test('rejects a symlinked candidate parent without writing through it', (t) => {
    const projectRoot = makeTempDir();
    const candidateRoot = makeTempDir();
    const outside = makeTempDir();
    t.after(() => fs.rmSync(projectRoot, {recursive: true, force: true}));
    t.after(() => fs.rmSync(candidateRoot, {recursive: true, force: true}));
    t.after(() => fs.rmSync(outside, {recursive: true, force: true}));
    fs.symlinkSync(outside, path.join(candidateRoot, '.github'));

    const result = planProject(projectRoot, {
        schemaVersion: 1,
        displayName: 'Project',
        summary: 'One sentence.',
    }, {
        coreRoot: CORE_ROOT,
        bootstrapPlanStage: 'provider',
        bootstrapCandidateRoot: candidateRoot,
    });

    assert.equal(result.status, 5);
    assert.equal(result.stdout, '');
    assert.match(result.stderr, /Core baseline provider failed/);
    assert.deepEqual(fs.readdirSync(outside), []);
    assert.deepEqual(fs.readdirSync(projectRoot), []);
});

test('does not follow a candidate parent replaced at the file-creation boundary', (t) => {
    const projectRoot = makeTempDir();
    const candidateRoot = makeTempDir();
    const outside = makeTempDir();
    const displaced = path.join(candidateRoot, '.github-held');
    t.after(() => fs.rmSync(projectRoot, {recursive: true, force: true}));
    t.after(() => fs.rmSync(candidateRoot, {recursive: true, force: true}));
    t.after(() => fs.rmSync(outside, {recursive: true, force: true}));
    fs.mkdirSync(path.join(outside, 'hooks'));
    const originalOpen = fs.openSync;
    const originalWrite = fs.writeFileSync;
    let replaced = false;
    const replaceParent = (filePath) => {
        if (!replaced && typeof filePath === 'string' && path.basename(filePath) === 'commit-msg') {
            replaced = true;
            fs.renameSync(path.join(candidateRoot, '.github'), displaced);
            fs.symlinkSync(outside, path.join(candidateRoot, '.github'), 'dir');
        }
    };
    fs.openSync = function openWithReplacement(filePath, ...args) {
        replaceParent(filePath);
        return originalOpen.call(this, filePath, ...args);
    };
    fs.writeFileSync = function writeWithReplacement(filePath, ...args) {
        replaceParent(filePath);
        return originalWrite.call(this, filePath, ...args);
    };

    let result;
    try {
        result = planProject(projectRoot, {
            schemaVersion: 1,
            displayName: 'Project',
            summary: 'One sentence.',
        }, {
            coreRoot: CORE_ROOT,
            bootstrapPlanStage: 'provider',
            bootstrapCandidateRoot: candidateRoot,
        });
    } finally {
        fs.openSync = originalOpen;
        fs.writeFileSync = originalWrite;
    }

    assert.equal(result.status, 5);
    assert.equal(result.stdout, '');
    assert.match(result.stderr, /Core baseline provider failed/);
    assert.deepEqual(fs.readdirSync(path.join(outside, 'hooks')), []);
    assert.deepEqual(fs.readdirSync(projectRoot), []);
});

test('does not re-resolve a candidate pathname after file identity validation', (t) => {
    const projectRoot = makeTempDir();
    const candidateRoot = makeTempDir();
    const outside = makeTempDir();
    t.after(() => fs.rmSync(projectRoot, {recursive: true, force: true}));
    t.after(() => fs.rmSync(candidateRoot, {recursive: true, force: true}));
    t.after(() => fs.rmSync(outside, {recursive: true, force: true}));
    const target = path.join(candidateRoot, '.github', 'hooks', 'commit-msg');
    const displaced = path.join(candidateRoot, 'commit-msg-held');
    const external = path.join(outside, 'commit-msg');
    fs.writeFileSync(external, 'external');
    const originalRealpath = fs.realpathSync;
    let replaced = false;
    fs.realpathSync = function replaceAtFinalResolution(filePath, ...args) {
        if (!replaced && filePath === target) {
            replaced = true;
            fs.renameSync(target, displaced);
            fs.symlinkSync(external, target);
        }
        return originalRealpath.call(this, filePath, ...args);
    };

    let result;
    try {
        result = planProject(projectRoot, {
            schemaVersion: 1,
            displayName: 'Project',
            summary: 'One sentence.',
        }, {
            coreRoot: CORE_ROOT,
            bootstrapPlanStage: 'provider',
            bootstrapCandidateRoot: candidateRoot,
        });
    } finally {
        fs.realpathSync = originalRealpath;
    }
    const report = JSON.parse(result.stdout);

    assert.equal(result.status, 0);
    assert.equal(replaced, false);
    assert.equal(report.data.outputs[0].candidatePath, target);
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
        packageVersion: CORE_VERSION,
        protocolVersion: 1,
    });
    assert.equal(outputs.every(({kind}) => kind === 'file'), true);
});

test('rejects candidate bytes reached through a substituted intermediate parent', (t) => {
    const projectRoot = makeTempDir();
    const candidateRoot = makeTempDir();
    const outside = makeTempDir();
    t.after(() => fs.rmSync(projectRoot, {recursive: true, force: true}));
    t.after(() => fs.rmSync(candidateRoot, {recursive: true, force: true}));
    t.after(() => fs.rmSync(outside, {recursive: true, force: true}));
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
    fs.cpSync(path.join(candidateRoot, '.github'), outside, {recursive: true});
    fs.rmSync(path.join(candidateRoot, '.github'), {recursive: true});
    fs.symlinkSync(outside, path.join(candidateRoot, '.github'), 'dir');
    const {loadTrustedProviderRegistry} = require(
        '../../packages/prism-core/scripts/prism-tool/bootstrap-providers'
    );
    const {validateProviderReport} = require(
        '../../packages/prism-core/scripts/prism-tool/bootstrap-composer'
    );

    assert.throws(() => validateProviderReport({
        projectRoot,
        candidateRoot,
        registry: loadTrustedProviderRegistry({coreRoot: CORE_ROOT}),
        report: provider,
    }), /candidate/);
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
