// $KYAULabs: bootstrap-providers.js kyau@aura.kyaulabs 2026/08/25 -0700 Exp $

'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const {validateNormalizedProjectMetadata} = require('./bootstrap-metadata');
const {validateBootstrapSource} = require('./bootstrap-source');

const EXACT_VERSION = /^(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/;
const MAX_RESOURCE_BYTES = 1048576;
const OUTPUTS = Object.freeze([
    '.github/hooks/commit-msg',
    '.github/hooks/pre-commit',
    '.github/hooks/pre-push',
    '.github/hooks/prepare-commit-msg',
    '.prism/project.json',
    'README.md',
    'commitlint.config.cjs',
]);

function isRecord(value) {
    return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function hasExactKeys(value, expected) {
    const actual = Object.keys(value).sort();
    const sorted = [...expected].sort();
    return actual.length === sorted.length && actual.every((key, index) => key === sorted[index]);
}

function sha256(value) {
    return crypto.createHash('sha256').update(value).digest('hex');
}

function readBounded(descriptor, label) {
    const chunks = [];
    let total = 0;
    while (total <= MAX_RESOURCE_BYTES) {
        const chunk = Buffer.allocUnsafe(Math.min(65536, MAX_RESOURCE_BYTES + 1 - total));
        const count = fs.readSync(descriptor, chunk, 0, chunk.length, null);
        if (count === 0) break;
        chunks.push(chunk.subarray(0, count));
        total += count;
    }
    if (total > MAX_RESOURCE_BYTES) throw new Error(`${label} is invalid`);
    return Buffer.concat(chunks, total);
}

function resourceMode(stat) {
    return Number(stat.mode & 0o777n);
}

function sameResourceVersion(left, right) {
    return left.dev === right.dev &&
        left.ino === right.ino &&
        left.size === right.size &&
        left.mode === right.mode &&
        left.ctimeNs === right.ctimeNs &&
        left.mtimeNs === right.mtimeNs;
}

function readHeldRegular(filePath, openPath, label, expectedMode = null) {
    const initial = fs.lstatSync(openPath, {bigint: true});
    if (
        initial.isSymbolicLink() ||
        !initial.isFile() ||
        initial.size > BigInt(MAX_RESOURCE_BYTES) ||
        (expectedMode !== null && resourceMode(initial) !== expectedMode) ||
        typeof fs.constants.O_NOFOLLOW !== 'number'
    ) {
        throw new Error(`${label} is invalid`);
    }
    const descriptor = fs.openSync(openPath, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW);
    try {
        const held = fs.fstatSync(descriptor, {bigint: true});
        if (
            !held.isFile() ||
            !sameResourceVersion(initial, held) ||
            (expectedMode !== null && resourceMode(held) !== expectedMode)
        ) {
            throw new Error(`${label} changed`);
        }
        const contents = readBounded(descriptor, label);
        const final = fs.fstatSync(descriptor, {bigint: true});
        const current = fs.lstatSync(filePath, {bigint: true});
        if (
            !sameResourceVersion(held, final) ||
            contents.length !== Number(held.size) ||
            current.isSymbolicLink() ||
            !current.isFile() ||
            !sameResourceVersion(held, current)
        ) {
            throw new Error(`${label} changed`);
        }
        return contents;
    } finally {
        fs.closeSync(descriptor);
    }
}

function readRegular(filePath, label, expectedMode = null) {
    return readHeldRegular(filePath, filePath, label, expectedMode);
}

function readCoreManifest(coreRoot) {
    const value = JSON.parse(readRegular(path.join(coreRoot, 'package.json'), 'core package manifest'));
    if (
        !isRecord(value) ||
        value.name !== '@kyaulabs/prism-core' ||
        typeof value.version !== 'string' ||
        !EXACT_VERSION.test(value.version)
    ) {
        throw new Error('core package manifest is invalid');
    }
    return value;
}

function validateProviderOutputPath(value) {
    if (
        typeof value !== 'string' ||
        value.length === 0 ||
        value.includes('\\') ||
        path.posix.isAbsolute(value) ||
        path.posix.normalize(value) !== value ||
        value.split('/').some((segment) => segment === '' || segment === '.' || segment === '..')
    ) {
        throw new Error('adapter provider output path is invalid');
    }
    return value;
}

function validateDeclarations(values, keys, label, validate) {
    if (
        !Array.isArray(values) ||
        values.some((value) => !isRecord(value) || !hasExactKeys(value, keys) || !validate(value))
    ) {
        throw new Error(`adapter provider ${label} are invalid`);
    }
    return Object.freeze(values.map((value) => Object.freeze({...value})));
}

function loadTrustedAdapterProviderDescriptor({registration}) {
    if (
        !isRecord(registration) ||
        typeof registration.packageRoot !== 'string' ||
        typeof registration.packageName !== 'string' ||
        typeof registration.packageVersion !== 'string' ||
        !EXACT_VERSION.test(registration.packageVersion) ||
        !Number.isSafeInteger(registration.bootstrapProtocol) ||
        registration.bootstrapProtocol < 1
    ) {
        throw new Error('adapter registration is invalid');
    }
    const packageRoot = fs.realpathSync(registration.packageRoot);
    if (packageRoot !== registration.packageRoot) {
        throw new Error('adapter registration root is invalid');
    }
    const packageManifest = JSON.parse(readCanonicalRegular(
        packageRoot,
        'package.json',
        'adapter package manifest'
    ));
    if (
        packageManifest.name !== registration.packageName ||
        packageManifest.version !== registration.packageVersion
    ) {
        throw new Error('adapter registration identity is invalid');
    }
    const manifest = JSON.parse(readCanonicalRegular(
        packageRoot,
        'config/bootstrap/scaffold.json',
        'adapter provider manifest'
    ));
    if (
        !isRecord(manifest) ||
        !hasExactKeys(manifest, [
            'schemaVersion', 'providerId', 'displayName', 'outputs',
            'effects', 'checks', 'verification',
        ]) ||
        manifest.schemaVersion !== 1 ||
        typeof manifest.providerId !== 'string' ||
        manifest.providerId.length === 0 ||
        typeof manifest.displayName !== 'string' ||
        manifest.displayName.length === 0 ||
        !Array.isArray(manifest.outputs) ||
        new Set(manifest.outputs).size !== manifest.outputs.length
    ) {
        throw new Error('adapter provider manifest is invalid');
    }
    const outputs = Object.freeze(manifest.outputs.map(validateProviderOutputPath).sort());
    const effects = validateDeclarations(
        manifest.effects,
        ['id', 'kind', 'command'],
        'effects',
        (effect) => ['id', 'kind', 'command'].every((key) =>
            typeof effect[key] === 'string' && effect[key].length > 0
        )
    );
    const checks = validateDeclarations(
        manifest.checks,
        ['id', 'status', 'message'],
        'checks',
        (check) => check.status === 'PASS' && ['id', 'message'].every((key) =>
            typeof check[key] === 'string' && check[key].length > 0
        )
    );
    const verification = validateDeclarations(
        manifest.verification,
        ['id', 'command'],
        'verification',
        (item) => ['id', 'command'].every((key) =>
            typeof item[key] === 'string' && item[key].length > 0
        )
    );
    return Object.freeze({
        id: manifest.providerId,
        displayName: manifest.displayName,
        packageName: registration.packageName,
        packageVersion: registration.packageVersion,
        protocolVersion: registration.bootstrapProtocol,
        outputs,
        effects,
        checks,
        verification,
    });
}

function loadTrustedProviderRegistry({coreRoot, capabilities = []}) {
    const canonicalCore = fs.realpathSync(coreRoot);
    const manifest = readCoreManifest(canonicalCore);
    const baseline = Object.freeze({
        id: 'core-baseline',
        displayName: 'Prism Core baseline',
        packageName: '@kyaulabs/prism-core',
        packageVersion: manifest.version,
        protocolVersion: 1,
        outputs: OUTPUTS,
        effects: Object.freeze([]),
        checks: Object.freeze([Object.freeze({
            id: 'core-baseline-render',
            status: 'PASS',
            message: 'Core baseline candidate files were rendered',
        })]),
        verification: Object.freeze([Object.freeze({
            id: 'core-baseline-inventory',
            command: 'setup project validate',
        })]),
    });
    const profiles = capabilities.length === 0
        ? []
        : require('./bootstrap-profile-providers').loadCoreProfileProviderDescriptors({
            coreRoot: canonicalCore,
            capabilities,
        });
    return Object.freeze({
        schemaVersion: 1,
        providers: Object.freeze([baseline, ...profiles]),
    });
}

function ensureCandidateRoot(candidateRoot) {
    const canonicalRoot = fs.realpathSync(candidateRoot);
    const stat = fs.lstatSync(candidateRoot);
    if (stat.isSymbolicLink() || !stat.isDirectory()) {
        throw new Error('candidate root is invalid');
    }
    return canonicalRoot;
}

function sameFile(left, right) {
    return left.dev === right.dev && left.ino === right.ino;
}

function directoryFlags() {
    if (
        typeof fs.constants.O_DIRECTORY !== 'number' ||
        typeof fs.constants.O_NOFOLLOW !== 'number'
    ) {
        throw new Error('safe filesystem flags are unavailable');
    }
    return fs.constants.O_RDONLY | fs.constants.O_DIRECTORY | fs.constants.O_NOFOLLOW;
}

function createHeldDirectory(candidateRoot, directoryPath, openPath) {
    const initial = fs.lstatSync(openPath);
    if (initial.isSymbolicLink() || !initial.isDirectory()) {
        throw new Error('candidate parent is invalid');
    }
    const descriptor = fs.openSync(openPath, directoryFlags());
    try {
        const held = fs.fstatSync(descriptor);
        const current = fs.lstatSync(directoryPath);
        const relation = path.relative(candidateRoot, fs.realpathSync(directoryPath));
        if (
            current.isSymbolicLink() ||
            !current.isDirectory() ||
            !sameFile(initial, held) ||
            !sameFile(current, held) ||
            relation.startsWith('..') ||
            path.isAbsolute(relation)
        ) {
            throw new Error('candidate parent changed');
        }
        let anchor;
        for (const candidate of [`/proc/self/fd/${descriptor}`, `/dev/fd/${descriptor}`]) {
            try {
                if (sameFile(fs.statSync(candidate), held)) {
                    anchor = candidate;
                    break;
                }
            } catch {
                continue;
            }
        }
        if (anchor === undefined) throw new Error('candidate parent cannot be held safely');
        return {
            anchor,
            assertCurrent() {
                const latest = fs.lstatSync(directoryPath);
                if (
                    latest.isSymbolicLink() ||
                    !latest.isDirectory() ||
                    !sameFile(latest, held) ||
                    !sameFile(fs.statSync(anchor), held)
                ) {
                    throw new Error('candidate parent changed');
                }
            },
            close() {
                fs.closeSync(descriptor);
            },
        };
    } catch (error) {
        fs.closeSync(descriptor);
        throw error;
    }
}

function holdCandidateParent(candidateRoot, relativePath) {
    let directoryPath = candidateRoot;
    let parent = createHeldDirectory(candidateRoot, candidateRoot, candidateRoot);
    try {
        for (const segment of relativePath.split('/').slice(0, -1)) {
            const childPath = path.join(directoryPath, segment);
            const anchoredChild = path.join(parent.anchor, segment);
            parent.assertCurrent();
            if (fs.lstatSync(anchoredChild, {throwIfNoEntry: false}) === undefined) {
                fs.mkdirSync(anchoredChild, {mode: 0o700});
            }
            const child = createHeldDirectory(candidateRoot, childPath, anchoredChild);
            parent.close();
            parent = child;
            directoryPath = childPath;
        }
        return parent;
    } catch (error) {
        parent.close();
        throw error;
    }
}

function holdExistingParent(root, relativePath) {
    let directoryPath = root;
    let parent = createHeldDirectory(root, root, root);
    try {
        for (const segment of relativePath.split('/').slice(0, -1)) {
            const childPath = path.join(directoryPath, segment);
            const child = createHeldDirectory(root, childPath, path.join(parent.anchor, segment));
            parent.close();
            parent = child;
            directoryPath = childPath;
        }
        return parent;
    } catch (error) {
        parent.close();
        throw error;
    }
}

function readCanonicalRegular(root, relativePath, label, expectedMode = null) {
    const lexical = path.join(root, ...relativePath.split('/'));
    const relation = path.relative(root, lexical);
    if (relation.startsWith('..') || path.isAbsolute(relation)) {
        throw new Error(`${label} is invalid`);
    }
    const parent = holdExistingParent(root, relativePath);
    try {
        const contents = readHeldRegular(
            lexical,
            path.join(parent.anchor, path.posix.basename(relativePath)),
            label,
            expectedMode
        );
        parent.assertCurrent();
        return contents;
    } finally {
        parent.close();
    }
}

function writeCandidate(candidateRoot, relativePath, contents, mode) {
    const target = path.join(candidateRoot, ...relativePath.split('/'));
    const relation = path.relative(candidateRoot, target);
    if (relation.startsWith('..') || path.isAbsolute(relation)) {
        throw new Error('candidate path escapes its root');
    }
    const parent = holdCandidateParent(candidateRoot, relativePath);
    const anchoredTarget = path.join(parent.anchor, path.basename(relativePath));
    let descriptor;
    try {
        parent.assertCurrent();
        descriptor = fs.openSync(
            anchoredTarget,
            fs.constants.O_WRONLY | fs.constants.O_CREAT | fs.constants.O_EXCL | fs.constants.O_NOFOLLOW,
            mode
        );
        fs.writeFileSync(descriptor, contents);
        fs.fchmodSync(descriptor, mode);
        const held = fs.fstatSync(descriptor);
        parent.assertCurrent();
        const current = fs.lstatSync(target);
        if (
            current.isSymbolicLink() ||
            !current.isFile() ||
            !sameFile(current, held) ||
            (held.mode & 0o777) !== mode
        ) {
            throw new Error('candidate file changed');
        }
        return Object.freeze({
            path: relativePath,
            kind: 'file',
            mode,
            sha256: sha256(contents),
            candidatePath: target,
        });
    } finally {
        if (descriptor !== undefined) fs.closeSync(descriptor);
        parent.close();
    }
}

function projectManifest(source, capabilities, metadata, coreVersion, adapter) {
    return Buffer.from(`${JSON.stringify({
        schemaVersion: 1,
        source,
        capabilities,
        project: {
            displayName: metadata.displayName,
            summary: metadata.summary,
        },
        ...(capabilities.length === 0 ? {} : {
            capabilityMetadata: metadata.capabilityMetadata,
        }),
        adapter,
        compatibility: {
            corePackage: '@kyaulabs/prism-core',
            coreVersion,
            providerProtocol: 1,
        },
    }, null, 2)}\n`, 'utf8');
}

function projectReadme(metadata, capabilities) {
    const links = {
        licensing: ['- [License](LICENSE)'],
        'community-governance': [
            '- [Code of Conduct](CODE_OF_CONDUCT.md)',
            '- [Contributing](CONTRIBUTING.md)',
        ],
        'github-collaboration': [
            '- [Issue templates](.github/ISSUE_TEMPLATE/)',
            '- [Pull request template](.github/pull_request_template.md)',
        ],
        'security-disclosure': ['- [Security policy](SECURITY.md)'],
        'repository-ownership': ['- [Repository ownership](.github/CODEOWNERS)'],
        'support-routing': ['- [Support](.github/ISSUE_TEMPLATE/config.yml)'],
        funding: ['- [Funding](.github/FUNDING.yml)'],
        'release-management': ['- [Changelog](CHANGELOG.md)'],
    };
    const projectLinks = capabilities.flatMap((capability) => links[capability] ?? []);
    return Buffer.from(
        `# ${metadata.displayName}\n\n${metadata.summary}\n\n` +
        '## Development\n\n' +
        'This project uses Prism Core. Verify local readiness with ' +
        '`prism-tool doctor --local-only` and follow the Prism engineering pipeline.\n' +
        (projectLinks.length === 0
            ? ''
            : `\n## Project policies\n\n${projectLinks.join('\n')}\n`),
        'utf8'
    );
}

function validateRequest(request) {
    if (!isRecord(request) || !hasExactKeys(request, [
        'schemaVersion', 'source', 'capabilities', 'metadata', 'adapter',
    ])) {
        throw new Error('provider request is invalid');
    }
    try {
        validateBootstrapSource(request.source);
    } catch {
        throw new Error('provider request is invalid');
    }
    if (
        request.schemaVersion !== 1 ||
        !Array.isArray(request.capabilities) ||
        (
            request.adapter !== null &&
            (
                !isRecord(request.adapter) ||
                !hasExactKeys(request.adapter, [
                    'id', 'packageName', 'packageVersion', 'bootstrapProtocol',
                ]) ||
                typeof request.adapter.id !== 'string' ||
                typeof request.adapter.packageName !== 'string' ||
                typeof request.adapter.packageVersion !== 'string' ||
                !EXACT_VERSION.test(request.adapter.packageVersion) ||
                !Number.isSafeInteger(request.adapter.bootstrapProtocol) ||
                request.adapter.bootstrapProtocol < 1
            )
        )
    ) {
        throw new Error('provider request is invalid');
    }
    try {
        validateNormalizedProjectMetadata({
            metadata: request.metadata,
            capabilities: request.capabilities,
        });
    } catch {
        throw new Error('provider request is invalid');
    }
}

function renderCoreBaseline({coreRoot, candidateRoot, request}) {
    validateRequest(request);
    const canonicalCore = fs.realpathSync(coreRoot);
    const canonicalCandidate = ensureCandidateRoot(candidateRoot);
    const registry = loadTrustedProviderRegistry({coreRoot: canonicalCore});
    const provider = registry.providers[0];
    const contents = new Map([
        ['.prism/project.json', projectManifest(
            request.source,
            request.capabilities,
            request.metadata,
            provider.packageVersion,
            request.adapter
        )],
        ['README.md', projectReadme(request.metadata, request.capabilities)],
        ['commitlint.config.cjs', readRegular(
            path.join(canonicalCore, 'config', 'commitlint.config.cjs'),
            'commitlint configuration'
        )],
    ]);
    for (const event of ['commit-msg', 'pre-commit', 'pre-push', 'prepare-commit-msg']) {
        contents.set(
            `.github/hooks/${event}`,
            readRegular(
                path.join(canonicalCore, 'config', 'bootstrap', 'hooks', event),
                `${event} hook`,
                0o755
            )
        );
    }
    const outputs = OUTPUTS.map((outputPath) => writeCandidate(
        canonicalCandidate,
        outputPath,
        contents.get(outputPath),
        outputPath.startsWith('.github/hooks/') ? 0o755 : 0o644
    ));
    return Object.freeze({
        schemaVersion: 1,
        provider: Object.freeze({
            id: provider.id,
            packageName: provider.packageName,
            packageVersion: provider.packageVersion,
            protocolVersion: provider.protocolVersion,
        }),
        status: 'GO',
        outputs: Object.freeze(outputs),
        effects: Object.freeze([]),
        checks: Object.freeze([Object.freeze({
            id: 'core-baseline-render',
            status: 'PASS',
            message: 'Core baseline candidate files were rendered',
        })]),
        verification: Object.freeze([Object.freeze({
            id: 'core-baseline-inventory',
            command: 'setup project validate',
        })]),
    });
}

module.exports = {
    loadTrustedAdapterProviderDescriptor,
    loadTrustedProviderRegistry,
    readCoreManifest,
    readRegular,
    renderCoreBaseline,
    writeCandidate,
};

// vim: ft=javascript sts=4 sw=4 ts=4 et :
