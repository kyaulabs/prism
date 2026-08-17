// $KYAULabs: contract.js kyau@aura.kyaulabs 2026/08/16 -0700 Exp $














'use strict';

const fs = require('node:fs');

const EXACT_VERSION = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/;
const MIN_EXECUTION_TIMEOUT_MS = 1000;
const MAX_EXECUTION_TIMEOUT_MS = 600000;
const STABLE_VERSION = /^(?:0|[1-9]\d{0,8})\.(?:0|[1-9]\d{0,8})\.(?:0|[1-9]\d{0,8})$/;
const IDENTIFIER = /^[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?$/;
const EXECUTABLE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;
const ARGV_TOKEN = /^-{0,2}[A-Za-z0-9][A-Za-z0-9._:=@/-]{0,127}$/;
const PACKAGE_NAME = /^(?:@[a-z0-9][a-z0-9._-]*\/[a-z0-9][a-z0-9._-]*|[a-z0-9][a-z0-9._-]*(?:\/[a-z0-9][a-z0-9._-]*)?)$/;
const TOP_LEVEL_KEYS = new Set([
    'browserTargets',
    'components',
    'package',
    'role',
    'schemaVersion',
]);
const COMPONENT_KEYS = new Set([
    'argumentPolicy',
    'argvPrefix',
    'authentication',
    'ecosystem',
    'executable',
    'executionTimeoutMs',
    'id',
    'kind',
    'package',
    'provisioning',
    'version',
    'versionArguments',
    'versionRequirement',
]);
const BASE_COMPONENT_KEYS = new Set([
    'authentication',
    'ecosystem',
    'id',
    'kind',
    'package',
    'provisioning',
    'version',
    'versionRequirement',
]);

function fail(filePath, message) {
    throw new Error(`${filePath}: ${message}`);
}

function isRecord(value) {
    return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function assertKnownKeys(value, allowed, filePath, label) {
    for (const key of Object.keys(value)) {
        if (!allowed.has(key)) {
            fail(filePath, `${label} has unknown key ${key}`);
        }
    }
}

function assertString(value, pattern, filePath, label) {
    if (typeof value !== 'string' || !pattern.test(value)) {
        fail(filePath, `${label} is invalid`);
    }
}

function assertStringArray(value, filePath, label) {
    if (!Array.isArray(value) || value.length === 0 || value.length > 32) {
        fail(filePath, `${label} must be a non-empty bounded array`);
    }
    for (const item of value) {
        if (typeof item !== 'string' || item.length === 0 || item.length > 128 || /[\0\r\n]/.test(item)) {
            fail(filePath, `${label} contains an invalid value`);
        }
    }
}

function validateArgvPrefix(component, filePath) {
    if (component.argvPrefix === undefined) return;
    assertStringArray(component.argvPrefix, filePath, `component ${component.id} argv prefix`);
    for (const token of component.argvPrefix) {
        if (!ARGV_TOKEN.test(token)) {
            fail(filePath, `component ${component.id} argv prefix token is not a safe argv token`);
        }
    }
    // argv[0] is spawned as the command (interpreter or executable) by
    // cli.js, which resolves it via PATH — it must be a bare executable
    // name, not a flag. assertStringArray above already rejects empty.
    if (!EXECUTABLE.test(component.argvPrefix[0])) {
        fail(filePath, `component ${component.id} argv prefix command is not a valid executable name`);
    }
}

function compareStableVersions(left, right) {
    const leftParts = left.split('.').map(Number);
    const rightParts = right.split('.').map(Number);
    for (let index = 0; index < leftParts.length; index += 1) {
        if (leftParts[index] !== rightParts[index]) {
            return leftParts[index] - rightParts[index];
        }
    }
    return 0;
}

function validateVersion(component, filePath) {
    const hasVersion = Object.prototype.hasOwnProperty.call(component, 'version');
    const hasRequirement = Object.prototype.hasOwnProperty.call(component, 'versionRequirement');
    if (hasVersion === hasRequirement) {
        fail(filePath, `component ${component.id} requires exactly one version policy`);
    }
    if (hasVersion) {
        if (!EXACT_VERSION.test(component.version)) {
            fail(filePath, `component ${component.id} requires an exact version`);
        }
        return;
    }
    const requirement = component.versionRequirement;
    if (!isRecord(requirement)) {
        fail(filePath, `component ${component.id} version requirement must be an object`);
    }
    assertKnownKeys(
        requirement,
        new Set(['maximumExclusive', 'minimum', 'mode']),
        filePath,
        `component ${component.id} version requirement`
    );
    if (
        requirement.mode !== 'range' ||
        !STABLE_VERSION.test(requirement.minimum) ||
        !STABLE_VERSION.test(requirement.maximumExclusive) ||
        compareStableVersions(requirement.minimum, requirement.maximumExclusive) >= 0
    ) {
        fail(filePath, `component ${component.id} has invalid version requirement`);
    }
}

function validateArgumentPolicy(policy, filePath, componentId) {
    if (!isRecord(policy)) {
        fail(filePath, `component ${componentId} requires an argument policy`);
    }
    const mode = policy.mode;
    if (mode === 'passthrough') {
        assertKnownKeys(policy, new Set(['mode']), filePath, `component ${componentId} argument policy`);
        return;
    }
    if (mode === 'first-token') {
        assertKnownKeys(policy, new Set(['allowed', 'mode']), filePath, `component ${componentId} argument policy`);
        assertStringArray(policy.allowed, filePath, `component ${componentId} allowed arguments`);
        for (const argument of policy.allowed) {
            assertString(argument, EXECUTABLE, filePath, `component ${componentId} allowed argument`);
        }
        if (new Set(policy.allowed).size !== policy.allowed.length) {
            fail(filePath, `component ${componentId} allowed arguments contain duplicates`);
        }
        return;
    }
    fail(filePath, `component ${componentId} has unsupported argument policy`);
}

function isApprovedBoundedExternal(component, role) {
    if (role !== 'core' || component.kind !== 'command' || component.provisioning !== 'external') {
        return false;
    }
    if (component.id === 'semgrep') {
        return (
            component.ecosystem === 'pypi' &&
            component.package === 'semgrep' &&
            component.authentication === 'optional' &&
            component.executable === 'semgrep'
        );
    }
    return (
        component.id === 'ocr' &&
        component.ecosystem === 'npm' &&
        component.package === '@alibaba-group/open-code-review' &&
        component.authentication === 'required' &&
        component.executable === 'ocr'
    );
}

function validateComponent(component, role, filePath) {
    if (!isRecord(component)) {
        fail(filePath, 'component must be an object');
    }
    assertKnownKeys(component, COMPONENT_KEYS, filePath, 'component');
    assertString(component.id, IDENTIFIER, filePath, 'component id');
    assertString(component.package, PACKAGE_NAME, filePath, `component ${component.id} package`);
    validateVersion(component, filePath);
    if (!['command', 'library'].includes(component.kind)) {
        fail(filePath, `component ${component.id} has unsupported kind`);
    }
    if (!['composer', 'npm', 'pypi'].includes(component.ecosystem)) {
        fail(filePath, `component ${component.id} has unsupported ecosystem`);
    }
    if (!['bundled', 'consumer-dev', 'external'].includes(component.provisioning)) {
        fail(filePath, `component ${component.id} has unsupported provisioning`);
    }
    if (!['none', 'optional', 'required'].includes(component.authentication)) {
        fail(filePath, `component ${component.id} has unsupported authentication`);
    }
    if (role === 'core' && component.provisioning === 'consumer-dev') {
        fail(filePath, `core component ${component.id} cannot be consumer-dev`);
    }
    if (role === 'adapter' && component.provisioning !== 'consumer-dev') {
        fail(filePath, `adapter component ${component.id} must be consumer-dev`);
    }
    if (component.provisioning === 'bundled' && component.ecosystem !== 'npm') {
        fail(filePath, `bundled component ${component.id} must use npm`);
    }
    if (component.versionRequirement && !isApprovedBoundedExternal(component, role)) {
        fail(filePath, `component ${component.id} cannot use a bounded version requirement`);
    }
    if (component.kind === 'library') {
        for (const key of Object.keys(component)) {
            if (!BASE_COMPONENT_KEYS.has(key)) {
                fail(filePath, `library component ${component.id} cannot declare ${key}`);
            }
        }
        return;
    }
    assertString(component.executable, EXECUTABLE, filePath, `component ${component.id} executable`);
    assertStringArray(component.versionArguments, filePath, `component ${component.id} version arguments`);
    validateArgvPrefix(component, filePath);
    validateArgumentPolicy(component.argumentPolicy, filePath, component.id);
    if (
        component.executionTimeoutMs !== undefined &&
        (
            !Number.isInteger(component.executionTimeoutMs) ||
            component.executionTimeoutMs < MIN_EXECUTION_TIMEOUT_MS ||
            component.executionTimeoutMs > MAX_EXECUTION_TIMEOUT_MS
        )
    ) {
        fail(filePath, `component ${component.id} has invalid execution timeout`);
    }
}

function validateContract(value, filePath) {
    if (!isRecord(value)) {
        fail(filePath, 'contract must be an object');
    }
    assertKnownKeys(value, TOP_LEVEL_KEYS, filePath, 'contract');
    if (value.schemaVersion !== 1) {
        fail(filePath, 'unsupported schema version');
    }
    assertString(value.package, PACKAGE_NAME, filePath, 'package identity');
    if (!['adapter', 'core'].includes(value.role)) {
        fail(filePath, 'unsupported package role');
    }
    if (!Array.isArray(value.components) || value.components.length === 0 || value.components.length > 100) {
        fail(filePath, 'components must be a non-empty bounded array');
    }
    if (value.role === 'core' && value.browserTargets !== undefined) {
        fail(filePath, 'core contract cannot declare browser targets');
    }
    if (value.browserTargets !== undefined) {
        assertStringArray(value.browserTargets, filePath, 'browser targets');
        if (value.browserTargets.some((target) => target !== 'chromium')) {
            fail(filePath, 'unsupported browser target');
        }
        if (new Set(value.browserTargets).size !== value.browserTargets.length) {
            fail(filePath, 'browser targets contain duplicates');
        }
    }

    const ids = new Set();
    for (const component of value.components) {
        validateComponent(component, value.role, filePath);
        if (ids.has(component.id)) {
            fail(filePath, `duplicate component ${component.id}`);
        }
        ids.add(component.id);
    }

    return value;
}

function deepFreeze(value) {
    for (const child of Object.values(value)) {
        if (child !== null && typeof child === 'object' && !Object.isFrozen(child)) {
            deepFreeze(child);
        }
    }
    return Object.freeze(value);
}

function assertPackageParity(contract, packageJson) {
    if (contract.package !== packageJson.name) {
        throw new Error(`${contract.package}: package identity drift`);
    }

    for (const component of contract.components) {
        if (component.provisioning !== 'bundled' || component.ecosystem !== 'npm') {
            continue;
        }
        if (packageJson.dependencies?.[component.package] !== component.version) {
            throw new Error(`${contract.package}: package dependency drift for ${component.package}`);
        }
    }
}

function loadContract(filePath) {
    const stat = fs.lstatSync(filePath);
    if (stat.isSymbolicLink()) {
        fail(filePath, 'symbolic links are not allowed');
    }
    if (!stat.isFile()) {
        fail(filePath, 'contract must be a regular file');
    }
    if (stat.size > 1048576) {
        fail(filePath, 'contract exceeds 1048576 bytes');
    }

    const content = fs.readFileSync(filePath, 'utf8');
    let value;
    try {
        value = JSON.parse(content);
    } catch {
        fail(filePath, 'invalid JSON');
    }
    return deepFreeze(validateContract(value, filePath));
}

module.exports = {
    assertPackageParity,
    compareStableVersions,
    loadContract,
    validateContract,
};














// vim: ft=javascript sts=4 sw=4 ts=4 et :
