// $KYAULabs: package-release.js kyau@aura.kyaulabs 2026/08/21 -0700 Exp $

'use strict';

const fs = require('node:fs');
const path = require('node:path');

const PACKAGE_NAME = /^(?:@[a-z0-9](?:[a-z0-9._-]*[a-z0-9])?\/)?[a-z0-9](?:[a-z0-9._-]*[a-z0-9])?$/;
const RELEASE_VERSION = /^(?:0|[1-9][0-9]*)\.(?:0|[1-9][0-9]*)\.(?:0|[1-9][0-9]*)(?:-[0-9A-Za-z.-]+)?$/;
const MAX_JSON_BYTES = 1048576;
const MANAGED_BY = '@kyaulabs/prism-core';
const RELEASE_SCHEMA_VERSION = 1;

function readJsonObject(filePath, label) {
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

function packageTagPrefix(name) {
    return name.includes('/') ? name.slice(name.indexOf('/') + 1) : name;
}

function hasControl(value) {
    return [...value].some((character) => {
        const code = character.charCodeAt(0);
        return code <= 31 || code === 127;
    });
}

function isInside(root, candidate) {
    const relation = path.relative(root, candidate);
    return relation === '' || (!relation.startsWith('..') && !path.isAbsolute(relation));
}

function normalizePackageDirectory(projectRoot, value) {
    if (
        typeof value !== 'string' ||
        value.length === 0 ||
        value.includes('\\') ||
        /\s/.test(value) ||
        hasControl(value) ||
        path.posix.isAbsolute(value) ||
        value.split('/').includes('..')
    ) {
        throw new Error('package path is invalid');
    }
    const normalized = path.posix.normalize(value);
    if (normalized !== value || (value !== '.' && value.startsWith('./'))) {
        throw new Error('package path is invalid');
    }
    const lexical = path.resolve(projectRoot, value);
    if (!isInside(projectRoot, lexical)) throw new Error('package path escapes project root');
    const canonical = fs.realpathSync(lexical);
    if (!isInside(projectRoot, canonical) || canonical !== lexical) {
        throw new Error('package path is symlinked or escaping');
    }
    return value;
}

function packageRecord(projectRoot, relativeDirectory, rejectPrivate = false) {
    const normalized = normalizePackageDirectory(projectRoot, relativeDirectory);
    const directory = normalized === '.'
        ? projectRoot
        : path.join(projectRoot, normalized);
    const manifest = readJsonObject(path.join(directory, 'package.json'), `package ${normalized}`);
    if (manifest.private === true) {
        if (rejectPrivate) throw new Error(`private package ${normalized} cannot be release-managed`);
        return null;
    }
    if (
        typeof manifest.name !== 'string' ||
        manifest.name.length > 214 ||
        !PACKAGE_NAME.test(manifest.name)
    ) {
        throw new Error(`package ${relativeDirectory} has an invalid name`);
    }
    if (typeof manifest.version !== 'string' || !RELEASE_VERSION.test(manifest.version)) {
        throw new Error(`package ${relativeDirectory} has an invalid version`);
    }
    return {
        name: manifest.name,
        path: normalized,
        version: manifest.version,
        tagPrefix: packageTagPrefix(manifest.name),
    };
}

function workspacePatterns(rootManifest) {
    if (rootManifest.workspaces === undefined) return [];
    if (Array.isArray(rootManifest.workspaces)) return rootManifest.workspaces;
    if (
        rootManifest.workspaces !== null &&
        typeof rootManifest.workspaces === 'object' &&
        !Array.isArray(rootManifest.workspaces) &&
        Object.keys(rootManifest.workspaces).length === 1 &&
        Object.prototype.hasOwnProperty.call(rootManifest.workspaces, 'packages') &&
        Array.isArray(rootManifest.workspaces.packages)
    ) {
        return rootManifest.workspaces.packages;
    }
    throw new Error('root workspaces declaration is invalid');
}

function assertUniqueRecords(records) {
    const paths = new Set(records.map(({path: packagePath}) => packagePath));
    const names = new Set(records.map(({name}) => name));
    const tags = new Set(records.map(({tagPrefix}) => tagPrefix));
    if (paths.size !== records.length) throw new Error('package paths contain duplicates');
    if (names.size !== records.length) throw new Error('package names contain duplicates');
    if (tags.size !== records.length) throw new Error('package tag prefixes contain duplicates');
    return records;
}

function validateConfiguredPackages({projectRoot, packagePaths}) {
    const canonicalRoot = fs.realpathSync(projectRoot);
    if (!Array.isArray(packagePaths) || packagePaths.length === 0) {
        throw new Error('packages must be a non-empty array');
    }
    return assertUniqueRecords(
        packagePaths.map((packagePath) => packageRecord(canonicalRoot, packagePath, true))
    );
}

function loadReleaseConfiguration({projectRoot, allowLegacy = false}) {
    const configPath = path.join(fs.realpathSync(projectRoot), '.prism', 'release.json');
    if (!fs.existsSync(configPath)) return {kind: 'ABSENT', packages: []};
    const value = readJsonObject(configPath, 'release configuration');
    const keys = Object.keys(value).sort();
    let kind;
    if (
        keys.join(',') === 'managedBy,packages,schemaVersion,versionPolicy' &&
        value.schemaVersion === RELEASE_SCHEMA_VERSION &&
        value.managedBy === MANAGED_BY &&
        value.versionPolicy === 'lockstep'
    ) {
        kind = 'MANAGED';
    } else if (allowLegacy && keys.join(',') === 'packages') {
        kind = 'LEGACY';
    } else {
        throw new Error('release configuration schema is invalid');
    }
    const records = validateConfiguredPackages({projectRoot, packagePaths: value.packages});
    return {kind, packages: records.map(({path: packagePath}) => packagePath)};
}

function discoverReleasePackages({projectRoot, glob = fs.globSync}) {
    const canonicalRoot = fs.realpathSync(projectRoot);
    const rootManifest = readJsonObject(path.join(canonicalRoot, 'package.json'), 'root package manifest');
    const records = [];
    const rootRecord = packageRecord(canonicalRoot, '.');
    if (rootRecord) records.push(rootRecord);

    const directories = new Set();
    for (const pattern of workspacePatterns(rootManifest)) {
        if (
            typeof pattern !== 'string' ||
            pattern.length === 0 ||
            pattern.includes('\\') ||
            /\s/.test(pattern) ||
            hasControl(pattern) ||
            path.posix.isAbsolute(pattern) ||
            pattern.split('/').includes('..')
        ) {
            throw new Error('workspace pattern is invalid');
        }
        for (const manifestPath of glob(`${pattern.replace(/\/$/, '')}/package.json`, {
            cwd: canonicalRoot,
        })) {
            directories.add(path.posix.dirname(manifestPath.split(path.sep).join('/')));
        }
    }
    for (const directory of [...directories].sort()) {
        const record = packageRecord(canonicalRoot, directory);
        if (record) records.push(record);
    }
    return assertUniqueRecords(records);
}

module.exports = {
    MANAGED_BY,
    RELEASE_SCHEMA_VERSION,
    discoverReleasePackages,
    loadReleaseConfiguration,
    packageTagPrefix,
    validateConfiguredPackages,
};

// vim: ft=javascript sts=4 sw=4 ts=4 et :
