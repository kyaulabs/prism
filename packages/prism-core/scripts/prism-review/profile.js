// $KYAULabs: profile.js kyau@aura.kyaulabs 2026/09/02 -0700 Exp $

'use strict';

const childProcess = require('node:child_process');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const {TextDecoder} = require('node:util');
const {parseFrontmatter} = require('../frontmatter-parser');
const {AXES, LIMIT} = require('./constants');
const {digestJson} = require('./canonical-json');
const {safeRelativePath, triggerMatches, validateProfile} = require('./schema');

const SHA = /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/;
const MAX_MANIFEST_BYTES = 65536;
const decoder = new TextDecoder('utf-8', {fatal: true});

function isInside(root, candidate) {
    const relative = path.relative(root, candidate);
    return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

function readHeldFile(filePath, maximum, label, executableAllowed = false) {
    const identity = fs.lstatSync(filePath);
    if (identity.isSymbolicLink() || !identity.isFile() || identity.size > maximum ||
        (!executableAllowed && (identity.mode & 0o111) !== 0)) {
        throw new Error(`${label} is invalid`);
    }
    const descriptor = fs.openSync(filePath, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW);
    try {
        const held = fs.fstatSync(descriptor);
        const bytes = fs.readFileSync(descriptor);
        const after = fs.fstatSync(descriptor);
        if (!held.isFile() || held.dev !== identity.dev || held.ino !== identity.ino ||
            held.size !== bytes.length || after.dev !== held.dev || after.ino !== held.ino ||
            after.size !== held.size || bytes.length > maximum) {
            throw new Error(`${label} changed`);
        }
        return bytes;
    } finally {
        fs.closeSync(descriptor);
    }
}

function resolveInstalledFile(packageRoot, relativePath, label) {
    safeRelativePath(relativePath, label);
    const root = fs.realpathSync(packageRoot);
    let current = root;
    for (const segment of relativePath.split('/')) {
        current = path.join(current, segment);
        const identity = fs.lstatSync(current);
        if (identity.isSymbolicLink()) throw new Error(`${label} is invalid`);
    }
    const canonical = fs.realpathSync(current);
    if (!isInside(root, canonical) || canonical !== current) throw new Error(`${label} escapes package`);
    return canonical;
}

function decode(bytes, label) {
    try {
        return decoder.decode(bytes);
    } catch {
        throw new Error(`${label} is not valid UTF-8`);
    }
}

function parseJson(bytes, label) {
    try {
        const value = JSON.parse(decode(bytes, label));
        if (value === null || typeof value !== 'object' || Array.isArray(value)) throw new Error();
        return value;
    } catch (error) {
        if (/UTF-8/.test(error.message)) throw error;
        throw new Error(`${label} is invalid`);
    }
}

function sha256(bytes) {
    return crypto.createHash('sha256').update(bytes).digest('hex');
}

function validateSkill(resource, bytes) {
    if (bytes.length > LIMIT.RESOURCE_BYTES) throw new Error('review resource exceeds limit');
    const text = decode(bytes, 'review resource');
    let frontmatter;
    try {
        frontmatter = parseFrontmatter(text);
    } catch {
        throw new Error('review resource frontmatter is invalid');
    }
    const expectedName = path.posix.basename(path.posix.dirname(resource.path));
    if (frontmatter === null || frontmatter.name !== expectedName) {
        throw new Error('review resource frontmatter is invalid');
    }
    return Object.freeze({
        id: resource.id,
        path: resource.path,
        license: resource.license,
        source: resource.source ?? null,
        sha256: sha256(bytes),
        bytes: Buffer.from(bytes),
        text,
    });
}

function readManifest(packageRoot) {
    const manifestPath = resolveInstalledFile(packageRoot, 'package.json', 'package manifest');
    const manifest = parseJson(
        readHeldFile(manifestPath, MAX_MANIFEST_BYTES, 'package manifest'),
        'package manifest'
    );
    if (typeof manifest.name !== 'string') throw new Error('package manifest is invalid');
    return manifest;
}

function finishProfile(profileBytes, resourceReader, expectedRole, expectedPackage) {
    if (profileBytes.length > LIMIT.POLICY_BYTES) throw new Error('review policy exceeds limit');
    const profile = validateProfile(
        parseJson(profileBytes, 'review profile'),
        expectedRole,
        expectedPackage
    );
    if (expectedRole === 'adapter' && profile.exemptions.length !== 0) {
        throw new Error('adapter exemptions are not permitted');
    }
    const resources = [];
    let aggregateBytes = profileBytes.length;
    for (const resource of profile.resources) {
        const bytes = resourceReader(resource);
        aggregateBytes += bytes.length;
        if (aggregateBytes > LIMIT.POLICY_BYTES) throw new Error('review policy exceeds limit');
        resources.push(validateSkill(resource, bytes));
    }
    const profileDigest = sha256(profileBytes);
    const policyDigest = digestJson({
        profileDigest,
        resources: resources.map(({id, path: resourcePath, sha256: digest}) => ({
            id,
            path: resourcePath,
            sha256: digest,
        })),
    });
    return Object.freeze({
        packageName: expectedPackage,
        role: expectedRole,
        profile,
        profileDigest,
        policyDigest,
        resources: Object.freeze(resources),
    });
}

function loadCoreProfile({packageRoot}) {
    const root = fs.realpathSync(packageRoot);
    const manifest = readManifest(root);
    const profilePath = resolveInstalledFile(root, 'config/prism-review.json', 'Core review profile');
    const profileBytes = readHeldFile(profilePath, LIMIT.POLICY_BYTES, 'Core review profile');
    return finishProfile(
        profileBytes,
        (resource) => readHeldFile(
            resolveInstalledFile(root, resource.path, 'Core review resource'),
            LIMIT.RESOURCE_BYTES,
            'Core review resource'
        ),
        'core',
        manifest.name
    );
}

function defaultGitBlobReader(repositoryRoot) {
    return (base, relativePath) => {
        const result = childProcess.spawnSync('git', ['show', `${base}:${relativePath}`], {
            cwd: repositoryRoot,
            encoding: null,
            maxBuffer: LIMIT.POLICY_BYTES + 1,
            timeout: 10000,
        });
        if (result.error || result.status !== 0 || !Buffer.isBuffer(result.stdout)) {
            throw new Error('protected-base review resource is unavailable');
        }
        return result.stdout;
    };
}

function loadAdapterProfile(options) {
    const {registration} = options;
    if (registration === null || typeof registration !== 'object' ||
        typeof registration.packageName !== 'string' || typeof registration.packageRoot !== 'string' ||
        typeof registration.reviewPath !== 'string') {
        throw new Error('adapter review registration is invalid');
    }
    const packageRoot = fs.realpathSync(registration.packageRoot);
    const registeredProfile = fs.lstatSync(registration.reviewPath);
    if (!path.isAbsolute(registration.reviewPath) || registeredProfile.isSymbolicLink() ||
        !registeredProfile.isFile()) {
        throw new Error('adapter review registration is invalid');
    }
    const reviewPath = fs.realpathSync(registration.reviewPath);
    if (!isInside(packageRoot, reviewPath)) throw new Error('adapter review profile escapes package');
    const manifest = readManifest(packageRoot);
    if (manifest.name !== registration.packageName) throw new Error('adapter package identity mismatch');
    const repositoryRoot = options.repositoryRoot === undefined
        ? null
        : fs.realpathSync(options.repositoryRoot);
    const local = repositoryRoot !== null && isInside(repositoryRoot, packageRoot);
    if (local && options.protectedBase !== undefined) {
        if (!SHA.test(options.protectedBase)) throw new Error('protected base is invalid');
        const packageRelative = path.relative(repositoryRoot, packageRoot).split(path.sep).join('/');
        const profileRelative = path.relative(packageRoot, reviewPath).split(path.sep).join('/');
        safeRelativePath(packageRelative, 'adapter package path');
        safeRelativePath(profileRelative, 'adapter review path');
        const readGitBlob = options.readGitBlob ?? defaultGitBlobReader(repositoryRoot);
        const profileBytes = Buffer.from(readGitBlob(
            options.protectedBase,
            path.posix.join(packageRelative, profileRelative)
        ));
        return finishProfile(
            profileBytes,
            (resource) => Buffer.from(readGitBlob(
                options.protectedBase,
                path.posix.join(packageRelative, resource.path)
            )),
            'adapter',
            registration.packageName
        );
    }
    const registeredRelative = path.relative(packageRoot, reviewPath).split(path.sep).join('/');
    const checkedReviewPath = resolveInstalledFile(packageRoot, registeredRelative, 'adapter review profile');
    return finishProfile(
        readHeldFile(checkedReviewPath, LIMIT.POLICY_BYTES, 'adapter review profile'),
        (resource) => readHeldFile(
            resolveInstalledFile(packageRoot, resource.path, 'adapter review resource'),
            LIMIT.RESOURCE_BYTES,
            'adapter review resource'
        ),
        'adapter',
        registration.packageName
    );
}

function changedDescriptor(value) {
    if (typeof value === 'string') {
        safeRelativePath(value, 'changed path');
        return {oldPath: null, newPath: value, kind: 'text', text: true};
    }
    if (value === null || typeof value !== 'object' || Array.isArray(value)) {
        throw new Error('changed path descriptor is invalid');
    }
    const allowed = ['oldPath', 'newPath', 'kind', 'text'];
    if (Object.keys(value).some((key) => !allowed.includes(key))) {
        throw new Error('changed path descriptor is invalid');
    }
    const oldPath = value.oldPath ?? null;
    const newPath = value.newPath ?? null;
    if (oldPath === null && newPath === null) throw new Error('changed path descriptor is invalid');
    if (oldPath !== null) safeRelativePath(oldPath, 'changed path');
    if (newPath !== null) safeRelativePath(newPath, 'changed path');
    const kind = value.kind ?? 'text';
    const text = value.text ?? kind === 'text';
    if (!['text', 'binary', 'symlink', 'gitlink', 'unsupported-mode'].includes(kind) ||
        typeof text !== 'boolean') {
        throw new Error('changed path descriptor is invalid');
    }
    if (kind !== 'text' && text) throw new Error('metadata exemption cannot target regular text');
    return {oldPath, newPath, kind, text};
}

function descriptorPaths(descriptor) {
    return [descriptor.oldPath, descriptor.newPath].filter((value) => value !== null);
}

function buildReviewPlan({core, adapter = null, changedPaths = []}) {
    if (core?.role !== 'core' || (adapter !== null && adapter?.role !== 'adapter') ||
        !Array.isArray(changedPaths)) throw new Error('review plan input is invalid');
    const descriptors = changedPaths.map(changedDescriptor).sort((left, right) => {
        const leftKey = `${left.oldPath ?? ''}\0${left.newPath ?? ''}\0${left.kind}\0${left.text}`;
        const rightKey = `${right.oldPath ?? ''}\0${right.newPath ?? ''}\0${right.kind}\0${right.text}`;
        return leftKey < rightKey ? -1 : leftKey > rightKey ? 1 : 0;
    });
    const paths = [...new Set(descriptors.flatMap(descriptorPaths))].sort();
    const lensIds = new Set();
    const axes = AXES.map((axisId) => {
        const lenses = [];
        for (const loaded of [core, adapter]) {
            if (loaded === null) continue;
            const axis = loaded.profile.axes.find((entry) => entry.id === axisId);
            for (const lens of axis?.lenses ?? []) {
                if (lensIds.has(lens.id)) throw new Error('adapter lens replaces Core lens');
                lensIds.add(lens.id);
                if (lens.trigger.mode === 'always' || paths.some((entry) => triggerMatches(lens.trigger, entry))) {
                    lenses.push(Object.freeze({...lens, package: loaded.packageName}));
                }
            }
        }
        return Object.freeze({id: axisId, lenses: Object.freeze(lenses)});
    });
    const exemptions = [];
    for (const descriptor of descriptors) {
        if (descriptor.kind === 'text') continue;
        const match = core.profile.exemptions.find((entry) => entry.kind === descriptor.kind &&
            (entry.trigger.mode === 'always' || descriptorPaths(descriptor).some((changedPath) =>
                triggerMatches(entry.trigger, changedPath))));
        if (match !== undefined) exemptions.push({
            id: match.id,
            kind: descriptor.kind,
            axes: match.axes,
            oldPath: descriptor.oldPath,
            newPath: descriptor.newPath,
        });
    }
    const policyDigest = digestJson({
        core: core.policyDigest,
        adapter: adapter?.policyDigest ?? null,
    });
    const planValue = {
        schemaVersion: 1,
        packages: [core, adapter].filter(Boolean).map((loaded) => ({
            name: loaded.packageName,
            role: loaded.role,
            profileDigest: loaded.profileDigest,
            policyDigest: loaded.policyDigest,
            resources: loaded.resources.map(({id, path: resourcePath, sha256: digest}) => ({
                id,
                path: resourcePath,
                sha256: digest,
            })),
        })),
        axes,
        changedPaths: descriptors,
        exemptions,
        policyDigest,
    };
    return Object.freeze({...planValue, planDigest: digestJson(planValue)});
}

module.exports = {buildReviewPlan, loadAdapterProfile, loadCoreProfile};

// vim: ft=javascript sts=4 sw=4 ts=4 et :
