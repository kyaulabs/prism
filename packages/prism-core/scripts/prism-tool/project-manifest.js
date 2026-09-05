// $KYAULabs: project-manifest.js kyau@aura.kyaulabs 2026/09/04 -0700 Exp $

'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const semver = require('semver');
const {TextDecoder} = require('node:util');
const {validateNormalizedProjectMetadata} = require('./bootstrap-metadata');
const {validateBootstrapSource} = require('./bootstrap-source');

const MAX_MANIFEST_BYTES = 65536;

function isRecord(value) {
    return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function exactKeys(value, expected) {
    if (!isRecord(value)) return false;
    const actual = Object.keys(value).sort();
    const wanted = [...expected].sort();
    return actual.length === wanted.length &&
        actual.every((key, index) => key === wanted[index]);
}

function validAdapter(value) {
    return value === null || (
        exactKeys(value, ['id', 'packageName', 'packageVersion', 'bootstrapProtocol']) &&
        ['id', 'packageName', 'packageVersion'].every((key) =>
            typeof value[key] === 'string' && value[key].length > 0
        ) &&
        Number.isSafeInteger(value.bootstrapProtocol) &&
        value.bootstrapProtocol > 0
    );
}

function validEstablishedSource(value) {
    return exactKeys(value, ['mode', 'evidence']) &&
        value.mode === 'ESTABLISHED' &&
        value.evidence === null;
}

function validateProjectManifest({value, coreVersion, allowVersionMigration = false}) {
    const capabilities = Array.isArray(value?.capabilities) ? value.capabilities : [];
    if (
        !isRecord(value) ||
        ![1, 2].includes(value.schemaVersion) ||
        !exactKeys(value, [
            'schemaVersion', 'source', 'capabilities', 'project',
            ...(capabilities.length === 0 ? [] : ['capabilityMetadata']),
            'adapter', 'compatibility',
        ]) ||
        !exactKeys(value.project, ['displayName', 'summary']) ||
        !validAdapter(value.adapter) ||
        !exactKeys(value.compatibility, [
            'corePackage', 'coreVersion', 'providerProtocol',
        ]) ||
        value.compatibility.corePackage !== '@kyaulabs/prism-core' ||
        typeof value.compatibility.coreVersion !== 'string' ||
        semver.valid(value.compatibility.coreVersion) === null ||
        semver.valid(coreVersion) === null ||
        value.compatibility.providerProtocol !== 1
    ) {
        throw new Error('project manifest is invalid');
    }
    try {
        if (value.schemaVersion === 1) validateBootstrapSource(value.source);
        else if (!validEstablishedSource(value.source)) throw new Error('invalid source');
        validateNormalizedProjectMetadata({
            capabilities,
            metadata: {
                schemaVersion: 1,
                ...value.project,
                ...(capabilities.length === 0 ? {} : {
                    capabilityMetadata: value.capabilityMetadata,
                }),
            },
        });
    } catch {
        throw new Error('project manifest is invalid');
    }
    const versionCurrent = value.compatibility.coreVersion === coreVersion;
    if (!versionCurrent && (
        !allowVersionMigration || !semver.lt(value.compatibility.coreVersion, coreVersion)
    )) {
        throw new Error('project manifest is invalid');
    }
    return Object.freeze({value: Object.freeze(value), versionCurrent});
}

function renderProjectManifest({
    schemaVersion,
    source,
    capabilities,
    metadata,
    coreVersion,
    adapter,
}) {
    const value = {
        schemaVersion,
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
    };
    validateProjectManifest({value, coreVersion});
    return Buffer.from(`${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function sameFile(left, right) {
    return left.dev === right.dev &&
        left.ino === right.ino &&
        left.size === right.size &&
        left.mode === right.mode;
}

function readBounded(descriptor) {
    const buffer = Buffer.alloc(MAX_MANIFEST_BYTES + 1);
    let offset = 0;
    while (offset < buffer.length) {
        const count = fs.readSync(descriptor, buffer, offset, buffer.length - offset, offset);
        if (count === 0) break;
        offset += count;
    }
    if (offset > MAX_MANIFEST_BYTES) throw new Error('project manifest is invalid');
    return buffer.subarray(0, offset);
}

function readProjectManifest({projectRoot, coreRoot, allowVersionMigration = false}) {
    const manifestPath = path.join(fs.realpathSync(projectRoot), '.prism', 'project.json');
    const initial = fs.lstatSync(manifestPath);
    if (
        initial.isSymbolicLink() ||
        !initial.isFile() ||
        (initial.mode & 0o777) !== 0o644 ||
        initial.size > MAX_MANIFEST_BYTES ||
        fs.realpathSync(manifestPath) !== manifestPath ||
        typeof fs.constants.O_NOFOLLOW !== 'number'
    ) {
        throw new Error('project manifest is invalid');
    }
    const descriptor = fs.openSync(
        manifestPath,
        fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW
    );
    try {
        const held = fs.fstatSync(descriptor);
        if (!sameFile(initial, held)) throw new Error('project manifest changed');
        const contents = readBounded(descriptor);
        const final = fs.fstatSync(descriptor);
        const current = fs.lstatSync(manifestPath);
        if (
            contents.length !== held.size ||
            !sameFile(held, final) ||
            !sameFile(held, current)
        ) {
            throw new Error('project manifest changed');
        }
        let value;
        try {
            value = JSON.parse(new TextDecoder('utf-8', {fatal: true}).decode(contents));
        } catch {
            throw new Error('project manifest is invalid');
        }
        const core = JSON.parse(fs.readFileSync(path.join(coreRoot, 'package.json'), 'utf8'));
        const validated = validateProjectManifest({
            value,
            coreVersion: core.version,
            allowVersionMigration,
        });
        return Object.freeze({
            ...validated,
            contents,
            digest: crypto.createHash('sha256').update(contents).digest('hex'),
        });
    } finally {
        fs.closeSync(descriptor);
    }
}

module.exports = {
    readProjectManifest,
    renderProjectManifest,
    validateProjectManifest,
};

// vim: ft=javascript sts=4 sw=4 ts=4 et :
