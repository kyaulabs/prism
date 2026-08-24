// $KYAULabs: bootstrap-composer.js kyau@aura.kyaulabs 2026/08/24 -0700 Exp $

'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const DIGEST = /^[0-9a-f]{64}$/;
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

function validateTargetPath(value) {
    if (
        typeof value !== 'string' ||
        value.length === 0 ||
        Buffer.byteLength(value) > 240 ||
        value.includes('\\') ||
        path.posix.isAbsolute(value) ||
        path.posix.normalize(value) !== value ||
        value.split('/').some((segment) => segment === '' || segment === '.' || segment === '..') ||
        /[\u0000-\u001f\u007f-\u009f]/u.test(value) ||
        value === '.git' ||
        value.startsWith('.git/') ||
        value === '.pi/prism-tool' ||
        value.startsWith('.pi/prism-tool/') ||
        path.posix.basename(value) === '.env' ||
        (path.posix.basename(value).startsWith('.env.') && path.posix.basename(value) !== '.env.example')
    ) {
        throw new Error('provider output path is invalid');
    }
    return value;
}

function heldCandidate(candidateRoot, output) {
    if (typeof output.candidatePath !== 'string' || !path.isAbsolute(output.candidatePath)) {
        throw new Error('provider candidate path is invalid');
    }
    const expected = path.join(candidateRoot, ...output.path.split('/'));
    if (output.candidatePath !== expected || !inside(candidateRoot, expected)) {
        throw new Error('provider candidate path is invalid');
    }
    const initial = fs.lstatSync(expected);
    if (initial.isSymbolicLink() || !initial.isFile() || initial.size > MAX_FILE_BYTES) {
        throw new Error('provider candidate file is invalid');
    }
    if (typeof fs.constants.O_NOFOLLOW !== 'number') {
        throw new Error('safe filesystem flags are unavailable');
    }
    const descriptor = fs.openSync(expected, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW);
    try {
        const held = fs.fstatSync(descriptor);
        if (
            !held.isFile() ||
            held.dev !== initial.dev ||
            held.ino !== initial.ino ||
            held.size !== initial.size ||
            (held.mode & 0o777) !== output.mode
        ) {
            throw new Error('provider candidate file changed');
        }
        const contents = fs.readFileSync(descriptor);
        if (crypto.createHash('sha256').update(contents).digest('hex') !== output.sha256) {
            throw new Error('provider candidate digest is invalid');
        }
    } finally {
        fs.closeSync(descriptor);
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
        !Array.isArray(report.outputs) ||
        report.outputs.length !== trusted.outputs.length ||
        !Array.isArray(report.effects) ||
        report.effects.length !== 0 ||
        !Array.isArray(report.checks) ||
        report.checks.length !== 1 ||
        !hasExactKeys(report.checks[0], ['id', 'status', 'message']) ||
        report.checks[0].id !== 'core-baseline-render' ||
        report.checks[0].status !== 'PASS' ||
        typeof report.checks[0].message !== 'string' ||
        !Array.isArray(report.verification) ||
        report.verification.length !== 1 ||
        !hasExactKeys(report.verification[0], ['id', 'command']) ||
        report.verification[0].id !== 'core-baseline-inventory' ||
        report.verification[0].command !== 'setup project validate'
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

module.exports = {composeProviderReports, validateProviderReport};

// vim: ft=javascript sts=4 sw=4 ts=4 et :
