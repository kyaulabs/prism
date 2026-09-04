// $KYAULabs: supported-adapters.js kyau@aura.kyaulabs 2026/09/04 -0700 Exp $

'use strict';

const fs = require('node:fs');
const path = require('node:path');
const {acquireVerifiedCatalogue, inspectCatalogueCache} = require('./adapter-catalogue-cache');
const {
    CatalogueError,
    selectCompatibleAdapters,
    validateCataloguePayload,
} = require('./adapter-catalogue-validation');
const {inspectSetupRoute} = require('./setup-route');

const EXACT_VERSION = /^(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)(?:-(?:0|[1-9]\d*|\d*[A-Za-z-][0-9A-Za-z-]*)(?:\.(?:0|[1-9]\d*|\d*[A-Za-z-][0-9A-Za-z-]*))*)?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/;
const ADAPTER_ID = /^[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?$/;
const PACKAGE_NAME = /^@kyaulabs\/[a-z0-9][a-z0-9._-]*$/;
const MAX_JSON_BYTES = 1048576;
const BOOTSTRAP_PROTOCOL = 1;
const SHA256 = /^[0-9a-f]{64}$/;
const CORE_ONLY = Object.freeze({id: 'core-only', displayName: 'Core only', adapter: null});

function isRecord(value) {
    return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function hasExactKeys(value, expected) {
    const actual = Object.keys(value).sort();
    const sorted = [...expected].sort();
    return actual.length === sorted.length && actual.every((key, index) => key === sorted[index]);
}

function readCoreManifest(coreRoot) {
    const filePath = path.join(fs.realpathSync(coreRoot), 'package.json');
    const stat = fs.lstatSync(filePath);
    if (stat.isSymbolicLink() || !stat.isFile() || stat.size > MAX_JSON_BYTES) {
        throw new Error('core package manifest is invalid');
    }
    let manifest;
    try {
        manifest = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    } catch {
        throw new Error('core package manifest is invalid');
    }
    if (
        !isRecord(manifest) ||
        manifest.name !== '@kyaulabs/prism-core' ||
        !EXACT_VERSION.test(manifest.version)
    ) {
        throw new Error('core package manifest is invalid');
    }
    return manifest;
}

function defaultCatalogue(coreRoot) {
    const manifest = readCoreManifest(coreRoot);
    return {
        schemaVersion: 1,
        coreOnly: {id: 'core-only', displayName: 'Core only', adapter: null},
        adapters: [{
            id: 'php-web',
            displayName: 'PHP/web',
            packageName: '@kyaulabs/prism-php-web',
            packageVersion: manifest.version,
            bootstrapProtocol: 1,
        }],
    };
}

function loadSupportedAdapterCatalogue({coreRoot, catalogue}) {
    const coreVersion = readCoreManifest(coreRoot).version;
    const value = catalogue ?? defaultCatalogue(coreRoot);
    if (!isRecord(value) || !hasExactKeys(value, ['schemaVersion', 'coreOnly', 'adapters'])) {
        throw new Error('supported adapter catalogue is invalid');
    }
    if (value.schemaVersion !== 1) throw new Error('supported adapter catalogue is unsupported');
    if (
        !isRecord(value.coreOnly) ||
        !hasExactKeys(value.coreOnly, ['id', 'displayName', 'adapter']) ||
        value.coreOnly.id !== 'core-only' ||
        value.coreOnly.displayName !== 'Core only' ||
        value.coreOnly.adapter !== null
    ) {
        throw new Error('Core-only catalogue entry is invalid');
    }
    if (!Array.isArray(value.adapters) || value.adapters.length !== 1) {
        throw new Error('supported adapters are invalid');
    }
    const ids = new Set();
    const packages = new Set();
    const adapters = value.adapters.map((entry) => {
        if (!isRecord(entry) || !hasExactKeys(entry, [
            'id', 'displayName', 'packageName', 'packageVersion', 'bootstrapProtocol',
        ])) {
            throw new Error('supported adapter entry is invalid');
        }
        if (entry.id !== 'php-web' || !ADAPTER_ID.test(entry.id) || ids.has(entry.id)) {
            throw new Error('supported adapter ID is invalid');
        }
        if (
            entry.displayName !== 'PHP/web' ||
            typeof entry.displayName !== 'string' ||
            entry.displayName.length > 80 ||
            /[\0\r\n]/.test(entry.displayName)
        ) {
            throw new Error('supported adapter display name is invalid');
        }
        if (
            entry.packageName !== '@kyaulabs/prism-php-web' ||
            !PACKAGE_NAME.test(entry.packageName) ||
            packages.has(entry.packageName)
        ) {
            throw new Error('supported adapter package is invalid');
        }
        if (entry.packageVersion !== coreVersion || !EXACT_VERSION.test(entry.packageVersion)) {
            throw new Error('supported adapter version is invalid');
        }
        if (entry.bootstrapProtocol !== 1) {
            throw new Error('supported adapter protocol is unsupported');
        }
        ids.add(entry.id);
        packages.add(entry.packageName);
        return Object.freeze({...entry});
    });
    return Object.freeze({
        schemaVersion: 1,
        coreOnly: Object.freeze({...value.coreOnly}),
        adapters: Object.freeze(adapters),
    });
}

function selectCoreOnlyAdapter({projectRoot, source}) {
    if (!['TEMPLATE', 'BLANK'].includes(source)) throw new Error('setup source is invalid');
    const route = inspectSetupRoute({projectRoot, source});
    if (route.status !== 'GO' || route.disposition !== 'STRICT_EMPTY') {
        return {
            schemaVersion: 1,
            command: 'setup adapter select',
            status: 'NO-GO',
            disposition: 'STOP',
            reason: route.reason,
            projectRoot: route.projectRoot,
            source,
            checks: [{
                id: 'bootstrap-adapter-selection',
                status: 'FAIL',
                message: 'adapter selection requires strict-empty setup',
            }],
            data: null,
        };
    }
    return {
        schemaVersion: 1,
        command: 'setup adapter select',
        status: 'GO',
        disposition: 'CORE_ONLY',
        reason: 'CORE_ONLY_SELECTED',
        projectRoot: route.projectRoot,
        source,
        checks: [{
            id: 'bootstrap-adapter-selection',
            status: 'PASS',
            message: 'Core-only bootstrap selected',
        }],
        data: {
            selection: CORE_ONLY,
            adapter: null,
            acquisition: null,
            attempt: null,
        },
    };
}

function cacheContext(options) {
    return {
        ...(options.context ?? {}),
        coreRoot: options.coreRoot,
        catalogueCachePath: options.catalogueCachePath ?? options.context?.catalogueCachePath,
        catalogueTrust: options.catalogueTrust ?? options.context?.catalogueTrust,
        now: options.now ?? options.context?.now,
    };
}

function catalogueEvidence(verified) {
    return Object.freeze({
        source: verified.source,
        catalogueId: verified.catalogue.catalogueId,
        sequence: verified.catalogue.sequence,
        digest: verified.envelopeDigest,
        payloadDigest: verified.payloadDigest,
        keyId: verified.keyId,
        issuedAt: verified.catalogue.issuedAt,
        expiresAt: verified.catalogue.expiresAt,
    });
}

async function inspectSupportedAdapters(options) {
    const route = inspectSetupRoute({projectRoot: options.projectRoot});
    if (route.status !== 'GO' || route.disposition !== 'STRICT_EMPTY') {
        return {
            schemaVersion: 1,
            command: 'setup adapter catalogue',
            status: 'NO-GO',
            disposition: 'STOP',
            reason: route.reason,
            projectRoot: route.projectRoot,
            checks: [{
                id: 'bootstrap-adapter-catalogue',
                status: 'FAIL',
                message: 'adapter selection requires strict-empty setup',
            }],
            data: null,
        };
    }
    readCoreManifest(options.coreRoot);
    const verified = await acquireVerifiedCatalogue({
        fetchImpl: options.fetchImpl,
        context: cacheContext(options),
        coreRoot: options.coreRoot,
        trust: options.catalogueTrust ?? options.context?.catalogueTrust,
        now: options.now ?? options.context?.now,
    });
    const adapters = selectCompatibleAdapters({
        catalogue: verified.catalogue,
        bootstrapProtocol: BOOTSTRAP_PROTOCOL,
    });
    if (adapters.length === 0) throw new CatalogueError('NO_COMPATIBLE_ADAPTER');
    return {
        schemaVersion: 1,
        command: 'setup adapter catalogue',
        status: 'GO',
        disposition: 'ADAPTER_SELECTION_REQUIRED',
        reason: 'CATALOGUE_VALID',
        projectRoot: route.projectRoot,
        checks: [{
            id: 'bootstrap-adapter-catalogue',
            status: 'PASS',
            message: 'signed supported adapter catalogue is valid',
        }],
        data: {
            schemaVersion: 1,
            coreOnly: CORE_ONLY,
            catalogueEvidence: catalogueEvidence(verified),
            adapters,
        },
    };
}

function loadSelectedAdapter(options) {
    if (!SHA256.test(options.digest) || !ADAPTER_ID.test(options.adapterId)) {
        throw new CatalogueError('CATALOGUE_SELECTION_INVALID');
    }
    const context = cacheContext(options);
    const detail = inspectCatalogueCache(context);
    if (detail.state !== 'GRANTED') throw new CatalogueError('CATALOGUE_SELECTION_UNAVAILABLE');
    const verified = detail.verifiedEntries.get(options.digest);
    if (!verified) throw new CatalogueError('CATALOGUE_SELECTION_UNAVAILABLE');
    const catalogue = validateCataloguePayload({
        catalogue: verified.catalogue,
        now: options.now ?? options.context?.now,
    });
    readCoreManifest(options.coreRoot);
    const selected = selectCompatibleAdapters({
        catalogue,
        bootstrapProtocol: options.bootstrapProtocol ?? BOOTSTRAP_PROTOCOL,
    }).find((adapter) => adapter.id === options.adapterId);
    if (!selected) throw new CatalogueError('CATALOGUE_SELECTION_UNAVAILABLE');
    return selected;
}

module.exports = {
    inspectSupportedAdapters,
    loadSelectedAdapter,
    loadSupportedAdapterCatalogue,
    selectCoreOnlyAdapter,
};

// vim: ft=javascript sts=4 sw=4 ts=4 et :
