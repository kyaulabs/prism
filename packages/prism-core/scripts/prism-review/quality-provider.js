// $KYAULabs: quality-provider.js kyau@aura.kyaulabs 2026/09/02 -0700 Exp $

'use strict';

const childProcess = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const {TextDecoder} = require('node:util');
const {validateContract} = require('../prism-tool/contract');
const {
    loadQualityProviderHandler,
    registrationFor,
} = require('../prism-tool/discovery');
const {safeRelativePath} = require('./schema');

const FILE_LIMIT = 1048576;
const PACKAGE_VERSION = /^(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)(?:-[0-9A-Za-z.-]+)?$/;
const PACKAGE_NAME = /^(?:@[a-z0-9][a-z0-9._-]*\/)?[a-z0-9][a-z0-9._-]*$/;
const ID = /^[a-z0-9]+(?:[.-][a-z0-9]+)*$/;
const SHA256 = /^[0-9a-f]{64}$/;
const decoder = new TextDecoder('utf-8', {fatal: true});

function exact(value, keys, label) {
    if (value === null || typeof value !== 'object' || Array.isArray(value) ||
        Object.getPrototypeOf(value) !== Object.prototype ||
        Object.keys(value).sort().join(',') !== [...keys].sort().join(',')) {
        throw new Error(`${label} is invalid`);
    }
}

function inside(root, candidate) {
    const relation = path.relative(root, candidate);
    return relation === '' || (!relation.startsWith('..') && !path.isAbsolute(relation));
}

function decodeJson(bytes, label) {
    try {
        const value = JSON.parse(decoder.decode(bytes));
        if (value === null || typeof value !== 'object' || Array.isArray(value)) throw new Error();
        return value;
    } catch (error) {
        throw new Error(`${label} is invalid`, {cause: error});
    }
}

function runGit(options, args) {
    const result = (options.run ?? childProcess.spawnSync)('git', args, {
        cwd: options.repositoryRoot,
        env: options.env ?? process.env,
        encoding: null,
        maxBuffer: FILE_LIMIT + 1,
        timeout: 30000,
    });
    const stdout = Buffer.isBuffer(result.stdout) ? result.stdout : Buffer.from(result.stdout ?? '');
    if (result.error || result.status !== 0 || stdout.length > FILE_LIMIT) {
        throw new Error('protected adapter evidence is unavailable');
    }
    return stdout;
}

function packageRelativePath(value, label) {
    if (typeof value !== 'string') throw new Error(`${label} is invalid`);
    const normalized = value.startsWith('./') ? value.slice(2) : value;
    safeRelativePath(normalized, label);
    return normalized;
}

function protectedAdapterIdentity(options) {
    const repositoryRoot = fs.realpathSync(options.repositoryRoot);
    const packageRoot = fs.realpathSync(options.registration.packageRoot);
    if (!inside(repositoryRoot, packageRoot) ||
        typeof options.protectedBase !== 'string' ||
        !/^(?:[0-9a-f]{40}|[0-9a-f]{64})$/.test(options.protectedBase)) {
        throw new Error('protected adapter identity is unavailable');
    }
    const packagePath = path.relative(repositoryRoot, packageRoot).split(path.sep).join('/');
    safeRelativePath(packagePath, 'adapter package path');
    const manifest = decodeJson(
        runGit(options, ['show', `${options.protectedBase}:${packagePath}/package.json`]),
        'protected adapter manifest'
    );
    if (manifest.name !== options.registration.packageName ||
        !PACKAGE_NAME.test(manifest.name ?? '') ||
        !PACKAGE_VERSION.test(manifest.version ?? '') ||
        manifest.prism === null || typeof manifest.prism !== 'object' || Array.isArray(manifest.prism) ||
        manifest.prism.adapter !== true) {
        throw new Error('protected adapter identity is invalid');
    }
    const toolchainPath = packageRelativePath(manifest.prism.toolchain, 'protected adapter toolchain');
    const handlerPath = packageRelativePath(manifest.prism.handler, 'protected adapter handler');
    const reviewPath = packageRelativePath(manifest.prism.review, 'protected adapter review profile');
    const contract = validateContract(decodeJson(
        runGit(options, ['show', `${options.protectedBase}:${packagePath}/${toolchainPath}`]),
        'protected adapter contract'
    ), 'protected adapter contract');
    if (contract.role !== 'adapter' || contract.package !== manifest.name ||
        contract.qualityProvider === undefined) {
        throw new Error('protected adapter quality provider is unavailable');
    }
    return Object.freeze({
        packageName: manifest.name,
        packageVersion: manifest.version,
        packagePath,
        bootstrapProtocol: manifest.prism.bootstrapProtocol ?? null,
        toolchainPath,
        handlerPath,
        reviewPath,
        qualityProvider: contract.qualityProvider,
        contract,
    });
}

function defaultResolvePackage(coreRoot, packageName) {
    const manifest = require.resolve(`${packageName}/package.json`, {paths: [fs.realpathSync(coreRoot)]});
    return path.dirname(manifest);
}

function resolveQualityProvider(options) {
    const expected = protectedAdapterIdentity(options);
    const repositoryRoot = fs.realpathSync(options.repositoryRoot);
    const requested = (options.resolvePackage ?? defaultResolvePackage)(
        options.coreRoot,
        expected.packageName
    );
    const requestedRoot = path.resolve(requested);
    const requestedIdentity = fs.lstatSync(requestedRoot);
    const packageRoot = fs.realpathSync(requestedRoot);
    if (!requestedIdentity.isDirectory() || requestedIdentity.isSymbolicLink() ||
        packageRoot !== requestedRoot) {
        throw new Error('adapter quality provider path is invalid');
    }
    if (inside(repositoryRoot, packageRoot)) {
        throw new Error('adapter quality provider is not externally installed');
    }
    const registration = registrationFor(packageRoot, expected.packageName);
    const relative = (candidate) => candidate === null
        ? null
        : path.relative(packageRoot, candidate).split(path.sep).join('/');
    if (registration === null || registration.packageVersion !== expected.packageVersion ||
        registration.bootstrapProtocol !== expected.bootstrapProtocol ||
        relative(registration.contractPath) !== expected.toolchainPath ||
        relative(registration.handlerPath) !== expected.handlerPath ||
        relative(registration.reviewPath) !== expected.reviewPath ||
        JSON.stringify(registration.contract.qualityProvider) !== JSON.stringify(expected.qualityProvider)) {
        throw new Error('adapter quality provider identity mismatch');
    }
    const handler = loadQualityProviderHandler(registration);
    return Object.freeze({
        identity: Object.freeze({
            id: expected.qualityProvider.id,
            packageName: expected.packageName,
            packageVersion: expected.packageVersion,
            protocolVersion: expected.qualityProvider.protocolVersion,
            gates: expected.qualityProvider.gates,
            sourceClass: 'INSTALLED_EXTERNAL',
        }),
        registration,
        run: handler.runQualityProvider.bind(handler),
    });
}

function boundedText(value, label, maximum = 1024) {
    if (typeof value !== 'string' || value.length === 0 ||
        Buffer.byteLength(value, 'utf8') > maximum || /[\x00-\x1f\x7f]/.test(value)) {
        throw new Error(`${label} is invalid`);
    }
    return value;
}

function digestRecord(value, label, maximum) {
    exact(value, ['bytes', 'sha256'], label);
    if (!Number.isSafeInteger(value.bytes) || value.bytes < 0 || value.bytes > maximum ||
        !SHA256.test(value.sha256)) throw new Error(`${label} is invalid`);
    return {...value};
}

function validateProviderIdentity(value, expected) {
    exact(value, ['id', 'packageName', 'packageVersion', 'protocolVersion'], 'quality provider identity');
    if (value.id !== expected.id || value.packageName !== expected.packageName ||
        value.packageVersion !== expected.packageVersion ||
        value.protocolVersion !== expected.protocolVersion) {
        throw new Error('quality provider identity mismatch');
    }
    return {...value};
}

function validateGate(value, expectedIds) {
    exact(value, ['id', 'status', 'command', 'tools', 'stdout', 'stderr', 'artifacts'], 'quality gate');
    if (!expectedIds.has(value.id) || !['PASS', 'FAIL', 'SKIPPED'].includes(value.status) ||
        !Array.isArray(value.command) || value.command.length === 0 || value.command.length > 128 ||
        value.command.some((token) => typeof token !== 'string' || token.length === 0 ||
            Buffer.byteLength(token, 'utf8') > 4096 || /[\x00-\x1f\x7f]/.test(token) ||
            path.isAbsolute(token)) ||
        !Array.isArray(value.tools) || value.tools.length > 32 ||
        !Array.isArray(value.artifacts) || value.artifacts.length > 32) {
        throw new Error('quality gate is invalid');
    }
    const tools = value.tools.map((tool) => {
        exact(tool, ['id', 'version'], 'quality gate tool');
        if (!ID.test(tool.id ?? '') || !PACKAGE_VERSION.test(tool.version ?? '')) {
            throw new Error('quality gate tool is invalid');
        }
        return {...tool};
    });
    if (new Set(tools.map(({id}) => id)).size !== tools.length) {
        throw new Error('quality gate tools contain duplicates');
    }
    const artifacts = value.artifacts.map((artifact) => {
        exact(artifact, ['path', 'bytes', 'sha256'], 'quality gate artifact');
        safeRelativePath(artifact.path, 'quality gate artifact path');
        return {path: artifact.path, ...digestRecord({bytes: artifact.bytes, sha256: artifact.sha256},
            'quality gate artifact', 262144)};
    });
    if (new Set(artifacts.map(({path: artifactPath}) => artifactPath)).size !== artifacts.length) {
        throw new Error('quality gate artifacts contain duplicates');
    }
    return {
        id: value.id,
        status: value.status,
        command: value.command.map((token) => boundedText(token, 'quality gate command', 4096)),
        tools,
        stdout: digestRecord(value.stdout, 'quality gate stdout', 1048576),
        stderr: digestRecord(value.stderr, 'quality gate stderr', 1048576),
        artifacts,
    };
}

function validateQualityReport(value, expected) {
    exact(value, ['schemaVersion', 'provider', 'status', 'gates'], 'quality report');
    if (value.schemaVersion !== 1 || !['PASS', 'FAIL'].includes(value.status) ||
        !Array.isArray(value.gates) || value.gates.length !== expected.gates.length) {
        throw new Error('quality report is invalid');
    }
    const provider = validateProviderIdentity(value.provider, expected);
    const expectedIds = new Set(expected.gates);
    const gates = value.gates.map((gate) => validateGate(gate, expectedIds));
    const ids = gates.map(({id}) => id);
    if (new Set(ids).size !== ids.length || ids.some((id, index) => id !== expected.gates[index]) ||
        (value.status === 'PASS') !== gates.every(({status}) => status !== 'FAIL')) {
        throw new Error('quality report gate state is invalid');
    }
    return Object.freeze({schemaVersion: 1, provider, status: value.status, gates});
}

module.exports = {
    protectedAdapterIdentity,
    resolveQualityProvider,
    validateQualityReport,
};

// vim: ft=javascript sts=4 sw=4 ts=4 et :
