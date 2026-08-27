// $KYAULabs: bootstrap-composer.js kyau@aura.kyaulabs 2026/08/27 -0700 Exp $

'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const DIGEST = /^[0-9a-f]{64}$/;
const KEY_ID = /^[A-Za-z0-9](?:[A-Za-z0-9._-]{0,79})$/;
const INTEGRITY = /^sha512-[A-Za-z0-9+/]+={0,2}$/;
const UTC_TIMESTAMP = /^\d{4}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01])T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d{3})?Z$/;
const MAX_FILE_BYTES = 1048576;

function isRecord(value) {
    return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function hasExactKeys(value, expected) {
    const actual = Object.keys(value).sort();
    const sorted = [...expected].sort();
    return actual.length === sorted.length && actual.every((key, index) => key === sorted[index]);
}

function inside(root, candidate) {
    const relation = path.relative(root, candidate);
    return relation === '' || (!relation.startsWith('..') && !path.isAbsolute(relation));
}

function containsControl(value) {
    return [...value].some((character) => {
        const code = character.charCodeAt(0);
        return code <= 0x1f || code >= 0x7f && code <= 0x9f;
    });
}

function validUtcTimestamp(value) {
    if (typeof value !== 'string' || !UTC_TIMESTAMP.test(value)) return false;
    const parsed = new Date(value);
    const canonical = value.includes('.') ? value : value.replace('Z', '.000Z');
    return Number.isFinite(parsed.getTime()) && parsed.toISOString() === canonical;
}

function validateAdapterEvidence(value) {
    if (value === null) return null;
    if (!isRecord(value) || !hasExactKeys(value, [
        'catalogueId', 'sequence', 'keyId', 'issuedAt', 'expiresAt',
        'envelopeDigest', 'payloadDigest', 'selectedAt', 'integrity',
    ]) || value.catalogueId !== 'kyaulabs/prism-adapters' ||
        !Number.isSafeInteger(value.sequence) || value.sequence <= 0 ||
        typeof value.keyId !== 'string' || !KEY_ID.test(value.keyId) ||
        !validUtcTimestamp(value.issuedAt) || !validUtcTimestamp(value.expiresAt) ||
        !validUtcTimestamp(value.selectedAt) || !DIGEST.test(value.envelopeDigest) ||
        !DIGEST.test(value.payloadDigest) || typeof value.integrity !== 'string' ||
        value.integrity.length > 256 || !INTEGRITY.test(value.integrity)) {
        throw new Error('bootstrap adapter evidence is invalid');
    }
    const issuedAt = new Date(value.issuedAt).getTime();
    const expiresAt = new Date(value.expiresAt).getTime();
    const selectedAt = new Date(value.selectedAt).getTime();
    if (issuedAt >= expiresAt || selectedAt < issuedAt || selectedAt >= expiresAt) {
        throw new Error('bootstrap adapter evidence is invalid');
    }
    return Object.freeze({...value});
}

function validateTargetPath(value) {
    if (
        typeof value !== 'string' ||
        value.length === 0 ||
        Buffer.byteLength(value) > 240 ||
        value.includes('\\') ||
        path.posix.isAbsolute(value) ||
        path.posix.normalize(value) !== value ||
        value.split('/').some((segment) => segment === '' || segment === '.' || segment === '..') ||
        value === '.git' ||
        value.startsWith('.git/') ||
        value === '.pi/prism-tool' ||
        value.startsWith('.pi/prism-tool/') ||
        path.posix.basename(value) === '.env' ||
        (path.posix.basename(value).startsWith('.env.') && path.posix.basename(value) !== '.env.example') ||
        containsControl(value)
    ) {
        throw new Error('provider output path is invalid');
    }
    return value;
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
        throw new Error('provider candidate parent is invalid');
    }
    const descriptor = fs.openSync(openPath, directoryFlags());
    try {
        const held = fs.fstatSync(descriptor);
        const current = fs.lstatSync(directoryPath);
        if (
            current.isSymbolicLink() ||
            !current.isDirectory() ||
            !sameFile(initial, held) ||
            !sameFile(current, held) ||
            !inside(candidateRoot, fs.realpathSync(directoryPath))
        ) {
            throw new Error('provider candidate parent changed');
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
        if (anchor === undefined) throw new Error('provider candidate parent cannot be held safely');
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
                    throw new Error('provider candidate parent changed');
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

function holdCandidateParent(candidateRoot, outputPath) {
    let directoryPath = candidateRoot;
    let parent = createHeldDirectory(candidateRoot, candidateRoot, candidateRoot);
    try {
        for (const segment of outputPath.split('/').slice(0, -1)) {
            const childPath = path.join(directoryPath, segment);
            const child = createHeldDirectory(
                candidateRoot,
                childPath,
                path.join(parent.anchor, segment)
            );
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

function heldCandidate(candidateRoot, output) {
    if (typeof output.candidatePath !== 'string' || !path.isAbsolute(output.candidatePath)) {
        throw new Error('provider candidate path is invalid');
    }
    const expected = path.join(candidateRoot, ...output.path.split('/'));
    if (output.candidatePath !== expected || !inside(candidateRoot, expected)) {
        throw new Error('provider candidate path is invalid');
    }
    const parent = holdCandidateParent(candidateRoot, output.path);
    const anchored = path.join(parent.anchor, path.basename(output.path));
    let descriptor;
    try {
        parent.assertCurrent();
        const initial = fs.lstatSync(anchored);
        if (initial.isSymbolicLink() || !initial.isFile() || initial.size > MAX_FILE_BYTES) {
            throw new Error('provider candidate file is invalid');
        }
        descriptor = fs.openSync(anchored, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW);
        const held = fs.fstatSync(descriptor);
        if (
            !held.isFile() ||
            !sameFile(held, initial) ||
            held.size !== initial.size ||
            (held.mode & 0o777) !== output.mode
        ) {
            throw new Error('provider candidate file changed');
        }
        const contents = fs.readFileSync(descriptor);
        parent.assertCurrent();
        if (crypto.createHash('sha256').update(contents).digest('hex') !== output.sha256) {
            throw new Error('provider candidate digest is invalid');
        }
    } finally {
        if (descriptor !== undefined) fs.closeSync(descriptor);
        parent.close();
    }
}

function validateProviderIdentity(registry, provider) {
    if (!isRecord(registry) || registry.schemaVersion !== 1 || !Array.isArray(registry.providers)) {
        throw new Error('trusted provider registry is invalid');
    }
    if (!isRecord(provider) || !hasExactKeys(provider, [
        'id', 'packageName', 'packageVersion', 'protocolVersion',
    ])) {
        throw new Error('provider identity is invalid');
    }
    const trusted = registry.providers.find(({id}) => id === provider.id);
    if (
        !trusted ||
        trusted.packageName !== provider.packageName ||
        trusted.packageVersion !== provider.packageVersion ||
        trusted.protocolVersion !== provider.protocolVersion
    ) {
        throw new Error('provider identity is untrusted');
    }
    return trusted;
}

function validateProviderReport({projectRoot, candidateRoot, registry, report}) {
    fs.realpathSync(projectRoot);
    const canonicalCandidate = fs.realpathSync(candidateRoot);
    if (!isRecord(report) || !hasExactKeys(report, [
        'schemaVersion', 'provider', 'status', 'outputs', 'effects', 'checks', 'verification',
    ])) {
        throw new Error('provider report is invalid');
    }
    if (report.schemaVersion !== 1 || report.status !== 'GO') {
        throw new Error('provider report is invalid');
    }
    const trusted = validateProviderIdentity(registry, report.provider);
    if (
        !Array.isArray(trusted.outputs) ||
        !Array.isArray(trusted.effects) ||
        !Array.isArray(trusted.checks) ||
        !Array.isArray(trusted.verification) ||
        !Array.isArray(report.outputs) ||
        report.outputs.length !== trusted.outputs.length ||
        JSON.stringify(report.effects) !== JSON.stringify(trusted.effects) ||
        JSON.stringify(report.checks) !== JSON.stringify(trusted.checks) ||
        JSON.stringify(report.verification) !== JSON.stringify(trusted.verification)
    ) {
        throw new Error('provider report is invalid');
    }
    const expectedPaths = [...trusted.outputs].sort();
    const actualPaths = report.outputs.map(({path: outputPath}) => outputPath).sort();
    if (!actualPaths.every((outputPath, index) => outputPath === expectedPaths[index])) {
        throw new Error('provider output ownership is invalid');
    }
    return Object.freeze(report.outputs.map((output) => {
        if (!isRecord(output) || !hasExactKeys(output, [
            'path', 'kind', 'mode', 'sha256', 'candidatePath',
        ])) {
            throw new Error('provider output is invalid');
        }
        const outputPath = validateTargetPath(output.path);
        if (
            output.kind !== 'file' ||
            ![0o644, 0o755].includes(output.mode) ||
            typeof output.sha256 !== 'string' ||
            !DIGEST.test(output.sha256)
        ) {
            throw new Error('provider output is invalid');
        }
        heldCandidate(canonicalCandidate, {...output, path: outputPath});
        return Object.freeze({
            path: outputPath,
            kind: 'file',
            mode: output.mode,
            sha256: output.sha256,
            provider: Object.freeze({...report.provider}),
            candidatePath: output.candidatePath,
        });
    }));
}

function overlaps(left, right) {
    return left === right || left.startsWith(`${right}/`) || right.startsWith(`${left}/`);
}

function composeProviderReports({reports}) {
    if (!Array.isArray(reports) || reports.length === 0) {
        throw new Error('provider reports are invalid');
    }
    const outputs = reports.flatMap((report) => report.outputs.map((output) => ({
        ...output,
        provider: output.provider ?? report.provider,
    }))).sort((left, right) => left.path.localeCompare(right.path));
    for (let index = 1; index < outputs.length; index += 1) {
        if (overlaps(outputs[index - 1].path, outputs[index].path)) {
            throw new Error('provider ownership overlaps');
        }
    }
    return Object.freeze(outputs.map((output) => Object.freeze(output)));
}

module.exports = {composeProviderReports, validateAdapterEvidence, validateProviderReport};

// vim: ft=javascript sts=4 sw=4 ts=4 et :
