// $KYAULabs: bootstrap-providers.js kyau@aura.kyaulabs 2026/08/24 -0700 Exp $

'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

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

function readRegular(filePath, label, expectedMode = null) {
    const stat = fs.lstatSync(filePath);
    if (
        stat.isSymbolicLink() ||
        !stat.isFile() ||
        stat.size > MAX_RESOURCE_BYTES ||
        (expectedMode !== null && (stat.mode & 0o777) !== expectedMode)
    ) {
        throw new Error(`${label} is invalid`);
    }
    return fs.readFileSync(filePath);
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

function loadTrustedProviderRegistry({coreRoot}) {
    const canonicalCore = fs.realpathSync(coreRoot);
    const manifest = readCoreManifest(canonicalCore);
    return Object.freeze({
        schemaVersion: 1,
        providers: Object.freeze([Object.freeze({
            id: 'core-baseline',
            displayName: 'Prism Core baseline',
            packageName: '@kyaulabs/prism-core',
            packageVersion: manifest.version,
            protocolVersion: 1,
            outputs: OUTPUTS,
        })]),
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
            candidatePath: fs.realpathSync(target),
        });
    } finally {
        if (descriptor !== undefined) fs.closeSync(descriptor);
        parent.close();
    }
}

function projectManifest(metadata, coreVersion) {
    return Buffer.from(`${JSON.stringify({
        schemaVersion: 1,
        source: {mode: 'BLANK', evidence: null},
        capabilities: [],
        project: {
            displayName: metadata.displayName,
            summary: metadata.summary,
        },
        adapter: null,
        compatibility: {
            corePackage: '@kyaulabs/prism-core',
            coreVersion,
            providerProtocol: 1,
        },
    }, null, 2)}\n`, 'utf8');
}

function projectReadme(metadata) {
    return Buffer.from(
        `# ${metadata.displayName}\n\n${metadata.summary}\n\n` +
        '## Development\n\n' +
        'This project uses Prism Core. Verify local readiness with ' +
        '`prism-tool doctor --local-only` and follow the Prism engineering pipeline.\n',
        'utf8'
    );
}

function validateRequest(request) {
    if (!isRecord(request) || !hasExactKeys(request, [
        'schemaVersion', 'source', 'capabilities', 'metadata', 'adapter',
    ])) {
        throw new Error('provider request is invalid');
    }
    if (
        request.schemaVersion !== 1 ||
        !isRecord(request.source) ||
        !hasExactKeys(request.source, ['mode', 'evidence']) ||
        request.source.mode !== 'BLANK' ||
        request.source.evidence !== null ||
        !Array.isArray(request.capabilities) ||
        request.capabilities.length !== 0 ||
        request.adapter !== null ||
        !isRecord(request.metadata) ||
        !hasExactKeys(request.metadata, [
            'schemaVersion', 'displayName', 'summary', 'suggestedDisplayName',
        ]) ||
        request.metadata.schemaVersion !== 1
    ) {
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
        ['.prism/project.json', projectManifest(request.metadata, provider.packageVersion)],
        ['README.md', projectReadme(request.metadata)],
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

module.exports = {loadTrustedProviderRegistry, renderCoreBaseline};

// vim: ft=javascript sts=4 sw=4 ts=4 et :
