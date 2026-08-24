// $KYAULabs: supported-adapters.js kyau@aura.kyaulabs 2026/08/24 -0700 Exp $

'use strict';

const fs = require('node:fs');
const path = require('node:path');
const {inspectSetupRoute} = require('./setup-route');

const EXACT_VERSION = /^(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)(?:-[0-9A-Za-z.-]+)?$/;
const ADAPTER_ID = /^[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?$/;
const PACKAGE_NAME = /^@kyaulabs\/[a-z0-9][a-z0-9._-]*$/;
const MAX_JSON_BYTES = 1048576;

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
    if (!Array.isArray(value.adapters) || value.adapters.length === 0 || value.adapters.length > 16) {
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
        if (!ADAPTER_ID.test(entry.id) || entry.id === 'core-only' || ids.has(entry.id)) {
            throw new Error('supported adapter ID is invalid');
        }
        if (
            typeof entry.displayName !== 'string' ||
            entry.displayName.length === 0 ||
            entry.displayName.length > 80 ||
            /[\0\r\n]/.test(entry.displayName)
        ) {
            throw new Error('supported adapter display name is invalid');
        }
        if (!PACKAGE_NAME.test(entry.packageName) || packages.has(entry.packageName)) {
            throw new Error('supported adapter package is invalid');
        }
        if (!EXACT_VERSION.test(entry.packageVersion)) {
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

function selectCoreOnlyAdapter({projectRoot, coreRoot, catalogue, source}) {
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
    const supported = loadSupportedAdapterCatalogue({coreRoot, catalogue});
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
            selection: supported.coreOnly,
            adapter: null,
            acquisition: null,
            attempt: null,
        },
    };
}

function inspectSupportedAdapters({projectRoot, coreRoot, catalogue}) {
    const route = inspectSetupRoute({projectRoot});
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
    const supported = loadSupportedAdapterCatalogue({coreRoot, catalogue});
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
            message: 'supported adapter catalogue is valid',
        }],
        data: supported,
    };
}

module.exports = {
    inspectSupportedAdapters,
    loadSupportedAdapterCatalogue,
    selectCoreOnlyAdapter,
};

// vim: ft=javascript sts=4 sw=4 ts=4 et :
