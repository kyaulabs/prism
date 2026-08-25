// $KYAULabs: bootstrap-source.js kyau@aura.kyaulabs 2026/08/25 -0700 Exp $

'use strict';

const path = require('node:path');
const {
    BRANCH_PATTERN,
    CAPABILITIES,
    digestJson,
    MANIFEST_PATH,
} = require('./template-source-validation');

const SHA1 = /^[0-9a-f]{40}$/;
const SHA256 = /^[0-9a-f]{64}$/;
const EXACT_VERSION = /^(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)$/;
const PACKAGE_NAME = /^@[a-z0-9][a-z0-9._-]*\/[a-z0-9][a-z0-9._-]*$/;
const REQUIRED_BASELINE = Object.freeze(['project-readme', 'core-hooks', 'commit-policy']);

function isRecord(value) {
    return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function hasExactKeys(value, expected) {
    if (!isRecord(value)) return false;
    const actual = Object.keys(value).sort();
    const keys = [...expected].sort();
    return actual.length === keys.length && actual.every((key, index) => key === keys[index]);
}

function deepFreeze(value) {
    if (value !== null && typeof value === 'object' && !Object.isFrozen(value)) {
        Object.freeze(value);
        for (const child of Object.values(value)) deepFreeze(child);
    }
    return value;
}

function cloneFrozen(value) {
    return deepFreeze(globalThis.structuredClone(value));
}

function validPath(value) {
    return typeof value === 'string' &&
        value.length > 0 &&
        Buffer.byteLength(value) <= 4096 &&
        value.isWellFormed() &&
        value.normalize('NFC') === value &&
        !value.startsWith('/') &&
        !value.includes('\\') &&
        path.posix.normalize(value) === value &&
        value.split('/').every((segment) => segment !== '' && segment !== '.' && segment !== '..') &&
        ![...value].some((character) => {
            const code = character.codePointAt(0);
            return code <= 0x1f || (code >= 0x7f && code <= 0x9f);
        });
}

function validateEvidence(value) {
    if (!hasExactKeys(value, [
        'schemaVersion', 'source', 'templateId', 'defaultBranch', 'commitSha', 'treeSha',
        'manifest', 'classificationSha256',
    ]) ||
        value.schemaVersion !== 1 ||
        value.source !== 'TEMPLATE' ||
        value.templateId !== 'kyaulabs/template' ||
        typeof value.defaultBranch !== 'string' ||
        !BRANCH_PATTERN.test(value.defaultBranch) ||
        !SHA1.test(value.commitSha) ||
        !SHA1.test(value.treeSha) ||
        !hasExactKeys(value.manifest, ['path', 'blobSha', 'size', 'sha256']) ||
        value.manifest.path !== MANIFEST_PATH ||
        !SHA1.test(value.manifest.blobSha) ||
        !Number.isSafeInteger(value.manifest.size) ||
        value.manifest.size < 0 ||
        value.manifest.size > 262144 ||
        !SHA256.test(value.manifest.sha256) ||
        !SHA256.test(value.classificationSha256)
    ) {
        throw new Error('Template bootstrap source evidence is invalid');
    }
}

function validateCatalogueEntry(entry) {
    if (!hasExactKeys(entry, [
        'path', 'blobSha', 'size', 'class', 'capability', 'provider', 'disposition',
    ]) ||
        !validPath(entry.path) ||
        !SHA1.test(entry.blobSha) ||
        !Number.isSafeInteger(entry.size) ||
        entry.size < 0 ||
        entry.size > 4194304 ||
        !Object.hasOwn(CAPABILITIES, entry.capability)
    ) {
        throw new Error('Template bootstrap source catalogue is invalid');
    }
    const [expectedClass, expectedScope, expectedId] = CAPABILITIES[entry.capability];
    if (expectedScope === null) {
        if (
            entry.class !== expectedClass ||
            entry.provider !== null ||
            entry.disposition !== 'exclude'
        ) {
            throw new Error('Template bootstrap source catalogue is invalid');
        }
        return;
    }
    if (
        entry.class !== expectedClass ||
        entry.disposition !== 'render' ||
        !hasExactKeys(entry.provider, ['scope', 'id']) ||
        entry.provider.scope !== expectedScope ||
        entry.provider.id !== expectedId
    ) {
        throw new Error('Template bootstrap source catalogue is invalid');
    }
}

function validateCatalogue(value, capabilities, adapter) {
    if (!hasExactKeys(value, ['schemaVersion', 'bootstrapProtocol', 'entries']) ||
        value.schemaVersion !== 1 ||
        value.bootstrapProtocol !== 1 ||
        !Array.isArray(value.entries) ||
        value.entries.length === 0 ||
        value.entries.length > 1024
    ) {
        throw new Error('Template bootstrap source catalogue is invalid');
    }
    const paths = new Set();
    const advertised = new Set();
    let previousPath = null;
    for (const entry of value.entries) {
        validateCatalogueEntry(entry);
        if (
            paths.has(entry.path) ||
            (previousPath !== null && Buffer.compare(
                Buffer.from(previousPath),
                Buffer.from(entry.path)
            ) >= 0)
        ) {
            throw new Error('Template bootstrap source catalogue is invalid');
        }
        paths.add(entry.path);
        advertised.add(entry.capability);
        previousPath = entry.path;
    }
    const required = [
        ...REQUIRED_BASELINE,
        ...(adapter === null ? [] : ['adapter-scaffold']),
        ...capabilities,
    ];
    if (required.some((capability) => !advertised.has(capability))) {
        throw new Error('Template bootstrap source catalogue is incomplete');
    }
}

function validateAdapterSelection(value) {
    if (value === null) return;
    if (!hasExactKeys(value, [
        'id', 'packageName', 'packageVersion', 'bootstrapProtocol',
    ]) ||
        typeof value.id !== 'string' ||
        !/^[a-z0-9][a-z0-9-]*$/.test(value.id) ||
        !PACKAGE_NAME.test(value.packageName) ||
        !EXACT_VERSION.test(value.packageVersion) ||
        !Number.isSafeInteger(value.bootstrapProtocol) ||
        value.bootstrapProtocol < 1
    ) {
        throw new Error('Template bootstrap adapter selection is invalid');
    }
}

function blankBootstrapSource() {
    return cloneFrozen({
        schemaVersion: 1,
        source: {mode: 'BLANK', evidence: null},
        catalogue: null,
    });
}

function normalizeTemplateBootstrapSource({report, capabilities, adapter}) {
    validateAdapterSelection(adapter);
    if (!Array.isArray(capabilities) || new Set(capabilities).size !== capabilities.length ||
        capabilities.some((capability) =>
            !Object.hasOwn(CAPABILITIES, capability) ||
            REQUIRED_BASELINE.includes(capability) ||
            ['adapter-scaffold', 'template-maintenance'].includes(capability)
        ) ||
        !hasExactKeys(report, [
            'schemaVersion', 'command', 'status', 'disposition', 'source', 'reason',
            'projectRoot', 'checks', 'data',
        ]) ||
        report.schemaVersion !== 1 ||
        report.command !== 'setup source' ||
        report.status !== 'GO' ||
        report.disposition !== 'SOURCE_READY' ||
        report.source !== 'TEMPLATE' ||
        report.reason !== 'TEMPLATE_VALID' ||
        typeof report.projectRoot !== 'string' ||
        !path.isAbsolute(report.projectRoot) ||
        !Array.isArray(report.checks) ||
        report.checks.length !== 1 ||
        !hasExactKeys(report.checks[0], ['id', 'status', 'message']) ||
        report.checks[0].id !== 'setup-source' ||
        report.checks[0].status !== 'PASS' ||
        report.checks[0].message !== 'setup source is valid' ||
        !hasExactKeys(report.data, ['attestation', 'catalogue'])
    ) {
        throw new Error('Template bootstrap source report is invalid');
    }
    validateEvidence(report.data.attestation);
    validateCatalogue(report.data.catalogue, capabilities, adapter);
    if (digestJson(report.data.catalogue) !== report.data.attestation.classificationSha256) {
        throw new Error('Template bootstrap source classification is stale');
    }
    return cloneFrozen({
        schemaVersion: 1,
        source: {mode: 'TEMPLATE', evidence: report.data.attestation},
        catalogue: report.data.catalogue,
    });
}

function validateBootstrapSourceState(value) {
    if (!hasExactKeys(value, ['schemaVersion', 'source', 'catalogue']) || value.schemaVersion !== 1 ||
        !hasExactKeys(value.source, ['mode', 'evidence'])
    ) {
        throw new Error('bootstrap source state is invalid');
    }
    if (value.source.mode === 'BLANK' && value.source.evidence === null && value.catalogue === null) {
        return blankBootstrapSource();
    }
    if (value.source.mode !== 'TEMPLATE') throw new Error('bootstrap source state is invalid');
    validateEvidence(value.source.evidence);
    validateCatalogue(value.catalogue, [], null);
    if (digestJson(value.catalogue) !== value.source.evidence.classificationSha256) {
        throw new Error('Template bootstrap source classification is stale');
    }
    return cloneFrozen(value);
}

module.exports = {
    blankBootstrapSource,
    normalizeTemplateBootstrapSource,
    validateBootstrapSourceState,
};

// vim: ft=javascript sts=4 sw=4 ts=4 et :
