// $KYAULabs: sdk.js kyau@aura.kyaulabs 2026/09/08 -0700 Exp $

'use strict';

const fs = require('node:fs');
const path = require('node:path');
const {fileURLToPath} = require('node:url');
const {TextDecoder} = require('node:util');
const semver = require('semver');
const {readinessError, atStage, atStageAsync} = require('./readiness');

const PACKAGE = '@earendil-works/pi-coding-agent';
const RANGE = '>=0.84.1 <=5.0.0';
const MAX_BYTES = 65536;

function validateSdkVersion(version) {
    if (typeof version !== 'string' ||
        !/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/.test(version) ||
        semver.valid(version) === null || !semver.satisfies(version, RANGE)) {
        throw readinessError('SDK_VERSION_UNSUPPORTED');
    }
    return version;
}

function requireMethods(value, names) {
    atStage('SDK_API_UNSUPPORTED', () => {
        if (value === null || value === undefined || names.some(name => typeof value[name] !== 'function')) {
            throw readinessError('SDK_API_UNSUPPORTED');
        }
    });
}

function validateSdkApi(sdk) {
    return atStage('SDK_API_UNSUPPORTED', () => {
        requireMethods(sdk, ['DefaultResourceLoader', 'createAgentSession']);
        requireMethods(sdk.ModelRuntime, ['create']);
        requireMethods(sdk.SettingsManager, ['inMemory']);
        requireMethods(sdk.SessionManager, ['inMemory']);
        Reflect.construct(Object, [], sdk.DefaultResourceLoader);
        return sdk;
    });
}

function readManifest(file) {
    const before = fs.lstatSync(file);
    if (!before.isFile() || before.isSymbolicLink() || before.size < 1 || before.size > MAX_BYTES) {
        throw readinessError('SDK_METADATA_INVALID');
    }
    const fd = fs.openSync(file, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW);
    try {
        const held = fs.fstatSync(fd);
        const bytes = Buffer.alloc(MAX_BYTES + 1);
        let length = 0;
        while (length < bytes.length) {
            const count = fs.readSync(fd, bytes, length, bytes.length - length, length);
            if (count === 0) break;
            length += count;
        }
        const after = fs.fstatSync(fd);
        if (!held.isFile() || held.dev !== before.dev || held.ino !== before.ino ||
            length !== held.size || length > MAX_BYTES || after.dev !== held.dev ||
            after.ino !== held.ino || after.size !== held.size) {
            throw readinessError('SDK_METADATA_INVALID');
        }
        return JSON.parse(new TextDecoder('utf-8', {fatal: true}).decode(bytes.subarray(0, length)));
    } finally {
        fs.closeSync(fd);
    }
}

function sdkMetadata(entry, repositoryRoot) {
    const canonical = fs.realpathSync(fileURLToPath(entry));
    if (repositoryRoot !== undefined) {
        const repository = fs.realpathSync(repositoryRoot);
        const relative = path.relative(repository, canonical);
        if (relative === '' || (relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative))) {
            throw readinessError('SDK_PROVENANCE_INVALID');
        }
    }
    if (!fs.statSync(canonical).isFile()) throw readinessError('SDK_METADATA_INVALID');
    let directory = path.dirname(canonical);
    for (let depth = 0; depth < 16; depth += 1) {
        const manifest = path.join(directory, 'package.json');
        let present;
        try {
            fs.lstatSync(manifest);
            present = true;
        } catch (error) {
            if (error.code !== 'ENOENT') throw error;
            present = false;
        }
        if (present) {
            const value = readManifest(manifest);
            if (value?.name === PACKAGE) return {version: validateSdkVersion(value.version), manifest};
        }
        const parent = path.dirname(directory);
        if (parent === directory) break;
        directory = parent;
    }
    throw readinessError('SDK_METADATA_INVALID');
}

async function loadSdk(options = {}) {
    const bridge = await import('./sdk-import.mjs');
    let entry;
    try {
        entry = await (options.resolveEntry ?? bridge.resolveEntry)();
    } catch (error) {
        throw readinessError(error?.code === 'ERR_MODULE_NOT_FOUND' ? 'SDK_MISSING' : 'SDK_LOAD_FAILED');
    }
    const metadata = atStage('SDK_METADATA_INVALID', () => sdkMetadata(entry, options.repositoryRoot));
    const sdk = await atStageAsync('SDK_LOAD_FAILED', () => (options.importSdk ?? bridge.importSdk)());
    validateSdkApi(sdk);
    const after = atStage('SDK_METADATA_INVALID', () => readManifest(metadata.manifest));
    if (after?.name !== PACKAGE || after.version !== metadata.version) throw readinessError('SDK_METADATA_INVALID');
    return Object.freeze({sdk, version: metadata.version});
}

module.exports = {loadSdk, validateSdkVersion, validateSdkApi, requireMethods};

// vim: ft=javascript sts=4 sw=4 ts=4 et :
