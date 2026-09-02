// $KYAULabs: discovery.js kyau@aura.kyaulabs 2026/09/02 -0700 Exp $

'use strict';

const fs = require('node:fs');
const path = require('node:path');
const {loadContract} = require('./contract');

const MAX_JSON_BYTES = 1048576;
const EXACT_VERSION = /^(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)(?:-(?:0|[1-9]\d*|\d*[A-Za-z-][0-9A-Za-z-]*)(?:\.(?:0|[1-9]\d*|\d*[A-Za-z-][0-9A-Za-z-]*))*)?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/;

function readJson(filePath, label) {
    const stat = fs.lstatSync(filePath);
    if (stat.isSymbolicLink() || !stat.isFile() || stat.size > MAX_JSON_BYTES) {
        throw new Error(`${label} is invalid`);
    }
    let value;
    try {
        value = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    } catch {
        throw new Error(`${label} is invalid`);
    }
    if (value === null || typeof value !== 'object' || Array.isArray(value)) {
        throw new Error(`${label} is invalid`);
    }
    return value;
}

function isInside(root, candidate) {
    const relation = path.relative(root, candidate);
    return relation === '' || (!relation.startsWith('..') && !path.isAbsolute(relation));
}

function resolveOwnedFile(packageRoot, relativePath, label) {
    if (typeof relativePath !== 'string' || relativePath.length === 0 || path.isAbsolute(relativePath)) {
        throw new Error(`${label} is invalid`);
    }
    const lexical = path.resolve(packageRoot, relativePath);
    if (!isInside(packageRoot, lexical)) throw new Error(`${label} escapes package root`);
    const canonical = fs.realpathSync(lexical);
    if (!isInside(packageRoot, canonical)) throw new Error(`${label} escapes package root`);
    if (!fs.statSync(canonical).isFile()) throw new Error(`${label} is invalid`);
    return canonical;
}

function resolveOwnedReviewFile(packageRoot, relativePath) {
    const resolved = resolveOwnedFile(packageRoot, relativePath, 'adapter review profile');
    let current = packageRoot;
    for (const segment of relativePath.replace(/^\.\//, '').split('/')) {
        current = path.join(current, segment);
        if (fs.lstatSync(current).isSymbolicLink()) {
            throw new Error('adapter review profile is invalid');
        }
    }
    return resolved;
}

function registrationFor(packageRoot, expectedName) {
    const canonicalRoot = fs.realpathSync(packageRoot);
    const manifest = readJson(path.join(canonicalRoot, 'package.json'), 'adapter package manifest');
    if (manifest.name !== expectedName) throw new Error('adapter package identity mismatch');
    const prism = manifest.prism;
    if (
        prism === null ||
        typeof prism !== 'object' ||
        Array.isArray(prism) ||
        prism.adapter !== true
    ) {
        return null;
    }
    if (Object.keys(prism).some((key) => ![
        'adapter', 'bootstrapProtocol', 'handler', 'review', 'toolchain',
    ].includes(key))) {
        throw new Error('adapter package metadata is unsupported');
    }
    if (
        typeof manifest.version !== 'string' ||
        !EXACT_VERSION.test(manifest.version) ||
        /[\r\n]/.test(manifest.version)
    ) {
        throw new Error('adapter package version is invalid');
    }
    if (
        prism.bootstrapProtocol !== undefined &&
        (!Number.isSafeInteger(prism.bootstrapProtocol) || prism.bootstrapProtocol < 1)
    ) {
        throw new Error('adapter bootstrap protocol is invalid');
    }
    const contractPath = resolveOwnedFile(canonicalRoot, prism.toolchain, 'adapter contract');
    const handlerPath = resolveOwnedFile(canonicalRoot, prism.handler, 'adapter handler');
    const reviewPath = prism.review === undefined
        ? null
        : resolveOwnedReviewFile(canonicalRoot, prism.review);
    const contract = loadContract(contractPath);
    if (contract.role !== 'adapter' || contract.package !== manifest.name) {
        throw new Error('adapter contract identity mismatch');
    }
    return {
        packageName: manifest.name,
        packageVersion: manifest.version,
        packageRoot: canonicalRoot,
        bootstrapProtocol: prism.bootstrapProtocol ?? null,
        contractPath,
        handlerPath,
        reviewPath,
        contract,
    };
}

function adapterRootAbove(resourcePath) {
    let current = fs.lstatSync(resourcePath).isFile() ? path.dirname(resourcePath) : resourcePath;
    for (let depth = 0; depth <= 6; depth += 1) {
        const manifestPath = path.join(current, 'package.json');
        if (!fs.lstatSync(current).isSymbolicLink() && fs.existsSync(manifestPath)) {
            const manifest = readJson(manifestPath, 'local package manifest');
            if (manifest.prism?.adapter === true) return fs.realpathSync(current);
        }
        const parent = path.dirname(current);
        if (parent === current) break;
        current = parent;
    }
    return null;
}

function findAdapterPackageRoot(resourcePath) {
    const lexicalResource = path.resolve(resourcePath);
    const declaredRoot = adapterRootAbove(lexicalResource);
    const canonicalResource = fs.realpathSync(lexicalResource);
    if (declaredRoot) {
        if (!isInside(declaredRoot, canonicalResource)) {
            throw new Error('settings resource escapes adapter package');
        }
        return declaredRoot;
    }
    return adapterRootAbove(canonicalResource);
}

function isLocalSource(source) {
    return typeof source === 'string' && (source.startsWith('.') || path.isAbsolute(source));
}

function settingsPaths(settings) {
    const paths = [];
    for (const key of ['extensions', 'skills', 'prompts', 'themes']) {
        const values = settings[key] ?? [];
        if (!Array.isArray(values) || values.some((value) => typeof value !== 'string')) {
            throw new Error(`Pi ${key} settings are invalid`);
        }
        paths.push(...values);
    }
    const packages = settings.packages ?? [];
    if (!Array.isArray(packages)) throw new Error('Pi package settings are invalid');
    for (const entry of packages) {
        const source = typeof entry === 'string' ? entry : entry?.source;
        if (isLocalSource(source)) paths.push(source);
    }
    return paths;
}

function localCandidates(piDir) {
    const settingsPath = path.join(piDir, 'settings.json');
    if (!fs.existsSync(settingsPath)) return [];
    const settings = readJson(settingsPath, 'Pi project settings');
    const roots = new Set();
    for (const configuredPath of settingsPaths(settings)) {
        if (!isLocalSource(configuredPath)) continue;
        const packageRoot = findAdapterPackageRoot(path.resolve(piDir, configuredPath));
        if (packageRoot) roots.add(packageRoot);
    }
    return [...roots].map((packageRoot) => {
        const manifest = readJson(path.join(packageRoot, 'package.json'), 'adapter package manifest');
        return registrationFor(packageRoot, manifest.name);
    });
}

function managedCandidates(piDir) {
    const npmRoot = path.join(piDir, 'npm');
    const manifestPath = path.join(npmRoot, 'package.json');
    if (!fs.existsSync(manifestPath)) return [];
    const manifest = readJson(manifestPath, 'Pi npm manifest');
    const dependencies = manifest.dependencies ?? {};
    if (dependencies === null || typeof dependencies !== 'object' || Array.isArray(dependencies)) {
        throw new Error('Pi npm dependencies are invalid');
    }
    const nodeModules = fs.realpathSync(path.join(npmRoot, 'node_modules'));
    const registrations = [];
    for (const packageName of Object.keys(dependencies)) {
        const packageRoot = fs.realpathSync(path.join(nodeModules, ...packageName.split('/')));
        if (!isInside(nodeModules, packageRoot)) throw new Error('Pi npm package escapes node_modules');
        const registration = registrationFor(packageRoot, packageName);
        if (registration) registrations.push(registration);
    }
    return registrations;
}

function validateBootstrapRegistration(registration, expected, coreRoot) {
    if (registration.packageName !== expected.packageName) {
        throw new Error('bootstrap adapter package identity mismatch');
    }
    if (registration.packageVersion !== expected.packageVersion) {
        throw new Error('bootstrap adapter package version mismatch');
    }
    if (registration.bootstrapProtocol !== expected.bootstrapProtocol) {
        throw new Error('bootstrap adapter protocol mismatch');
    }
    if (registration.contract.role !== 'adapter' || registration.contract.package !== expected.packageName) {
        throw new Error('bootstrap adapter contract identity mismatch');
    }
    const coreContract = loadContract(path.join(coreRoot, 'toolchain.json'));
    const coreIds = new Set(coreContract.components.map(({id}) => id));
    for (const {id} of registration.contract.components) {
        if (coreIds.has(id)) throw new Error(`adapter component collides with core component ${id}`);
    }
    return registration;
}

function loadAdapterHandler(registration, expectedBootstrapProtocol = null) {
    if (registration === null || typeof registration !== 'object') {
        throw new Error('adapter registration is invalid');
    }
    const packageRoot = fs.realpathSync(registration.packageRoot);
    const handlerPath = fs.realpathSync(registration.handlerPath);
    if (!isInside(packageRoot, handlerPath) || handlerPath !== registration.handlerPath) {
        throw new Error('adapter handler registration is invalid');
    }
    const handler = require(handlerPath);
    if (
        handler === null ||
        typeof handler !== 'object' ||
        typeof handler.inspect !== 'function' ||
        typeof handler.resolveTool !== 'function'
    ) {
        throw new Error('adapter handler interface is invalid');
    }
    if (expectedBootstrapProtocol !== null) {
        if (handler.bootstrapProtocol !== expectedBootstrapProtocol) {
            throw new Error('adapter handler bootstrap protocol mismatch');
        }
        if (
            typeof handler.prepareBootstrapProject !== 'function' ||
            typeof handler.installBootstrapDependencies !== 'function' ||
            typeof handler.runBootstrapQuality !== 'function' ||
            typeof handler.verifyBootstrapProject !== 'function'
        ) {
            throw new Error('adapter handler bootstrap interface is invalid');
        }
    }
    return handler;
}

function discoverAutomationAdapter(options) {
    const registration = discoverAdapter(options);
    const handler = loadAdapterHandler(registration);
    if (
        typeof handler.describeAutomation !== 'function' ||
        typeof handler.prepareAutomation !== 'function' ||
        typeof handler.verifyAutomation !== 'function'
    ) {
        throw new Error('adapter automation interface is invalid');
    }
    return Object.freeze({registration, handler});
}

function optionalRegistrations(projectRoot, piDir) {
    const canonicalProject = fs.realpathSync(projectRoot);
    const canonicalPi = fs.realpathSync(piDir);
    if (!isInside(canonicalProject, canonicalPi)) throw new Error('Pi directory escapes project root');
    const registrations = [...managedCandidates(canonicalPi), ...localCandidates(canonicalPi)];
    return new Map(registrations.map((registration) => [registration.packageRoot, registration]));
}

function discoverOptionalAdapter({projectRoot, piDir = path.join(projectRoot, '.pi')}) {
    try {
        fs.lstatSync(piDir);
    } catch (error) {
        if (error.code === 'ENOENT') return null;
        throw error;
    }
    const byRoot = optionalRegistrations(projectRoot, piDir);
    if (byRoot.size === 0) return null;
    if (byRoot.size > 1) throw new Error('more than one active adapter is not permitted');
    return [...byRoot.values()][0];
}

function discoverAdapter({projectRoot, piDir = path.join(projectRoot, '.pi')}) {
    const byRoot = optionalRegistrations(projectRoot, piDir);
    if (byRoot.size !== 1) throw new Error('exactly one active adapter is required');
    const registration = [...byRoot.values()][0];
    const coreContract = loadContract(path.resolve(__dirname, '../../toolchain.json'));
    const coreIds = new Set(coreContract.components.map(({id}) => id));
    for (const {id} of registration.contract.components) {
        if (coreIds.has(id)) throw new Error(`adapter component collides with core component ${id}`);
    }
    return registration;
}

module.exports = {
    discoverAdapter,
    discoverAutomationAdapter,
    discoverOptionalAdapter,
    loadAdapterHandler,
    registrationFor,
    validateBootstrapRegistration,
};

// vim: ft=javascript sts=4 sw=4 ts=4 et :
