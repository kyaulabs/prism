// $KYAULabs: package-release.js kyau@aura.kyaulabs 2026/08/22 -0700 Exp $

'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const PACKAGE_NAME = /^(?:@[a-z0-9](?:[a-z0-9._-]*[a-z0-9])?\/)?[a-z0-9](?:[a-z0-9._-]*[a-z0-9])?$/;
const RELEASE_VERSION = /^(?:0|[1-9][0-9]*)\.(?:0|[1-9][0-9]*)\.(?:0|[1-9][0-9]*)(?:-[0-9A-Za-z.-]+)?$/;
const MAX_JSON_BYTES = 1048576;
const MANAGED_BY = '@kyaulabs/prism-core';
const RELEASE_SCHEMA_VERSION = 1;
const CONFIG_PATH = '.prism/release.json';
const WORKFLOW_PATH = '.github/workflows/release.yml';
const WORKFLOW_MARKER = '# prism-managed: @kyaulabs/prism-core';
const WORKFLOW_SCHEMA_MARKER = '# prism-release-schema: 1';
const LEGACY_WORKFLOW_SHA256 = 'dd4cd0fdf362e4243117e620c906a7bfe42b8b52c011759a2a6ea8f1850f0ef6';
const OPERATION_ROOT = path.join('.pi', 'prism-tool', 'package-release');
const OPERATION_MARKER = '.prism-package-release.json';

function sha256(value) {
    return crypto.createHash('sha256').update(value).digest('hex');
}

function fileEntry(filePath) {
    return fs.lstatSync(filePath, {throwIfNoEntry: false});
}

function readRegularFile(filePath, label) {
    const initial = fs.lstatSync(filePath);
    if (initial.isSymbolicLink() || !initial.isFile() || initial.size > MAX_JSON_BYTES) {
        throw new Error(`${label} is invalid`);
    }
    let descriptor;
    try {
        descriptor = fs.openSync(
            filePath,
            fs.constants.O_RDONLY | (fs.constants.O_NOFOLLOW ?? 0)
        );
        const held = fs.fstatSync(descriptor);
        if (!held.isFile() || held.size > MAX_JSON_BYTES || !sameFile(initial, held)) {
            throw new Error(`${label} is invalid`);
        }
        const content = fs.readFileSync(descriptor);
        if (content.length > MAX_JSON_BYTES) throw new Error(`${label} is invalid`);
        return content;
    } finally {
        if (descriptor !== undefined) fs.closeSync(descriptor);
    }
}

function parseJsonObject(content, label) {
    let value;
    try {
        value = JSON.parse(content.toString('utf8'));
    } catch {
        throw new Error(`${label} is invalid`);
    }
    if (value === null || typeof value !== 'object' || Array.isArray(value)) {
        throw new Error(`${label} is invalid`);
    }
    return value;
}

function readJsonObject(filePath, label) {
    return parseJsonObject(readRegularFile(filePath, label), label);
}

function holdManagedParent(projectRoot, relativePath) {
    let current = projectRoot;
    for (const segment of path.dirname(relativePath).split('/')) {
        if (segment === '.') continue;
        current = path.join(current, segment);
        const entry = fileEntry(current);
        if (entry === undefined) return null;
        if (entry.isSymbolicLink() || !entry.isDirectory()) {
            throw new Error('managed release parent is invalid');
        }
    }
    return holdDirectory(projectRoot, current);
}

function managedFileEntry(projectRoot, relativePath) {
    const parent = holdManagedParent(projectRoot, relativePath);
    if (parent === null) return undefined;
    try {
        parent.assertCurrent();
        const entry = fs.lstatSync(
            path.join(parent.anchor, path.basename(relativePath)),
            {throwIfNoEntry: false}
        );
        parent.assertCurrent();
        return entry;
    } finally {
        parent.close();
    }
}

function readManagedFile(projectRoot, relativePath, label) {
    const parent = holdManagedParent(projectRoot, relativePath);
    if (parent === null) throw new Error(`${label} is invalid`);
    try {
        parent.assertCurrent();
        const content = readRegularFile(
            path.join(parent.anchor, path.basename(relativePath)),
            label
        );
        parent.assertCurrent();
        return content;
    } finally {
        parent.close();
    }
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
    const canonicalProject = fs.realpathSync(projectRoot);
    if (managedFileEntry(canonicalProject, CONFIG_PATH) === undefined) {
        return {kind: 'ABSENT', packages: []};
    }
    const value = parseJsonObject(
        readManagedFile(canonicalProject, CONFIG_PATH, 'release configuration'),
        'release configuration'
    );
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

function renderManagedConfiguration(candidates) {
    return `${JSON.stringify({
        schemaVersion: RELEASE_SCHEMA_VERSION,
        managedBy: MANAGED_BY,
        versionPolicy: 'lockstep',
        packages: candidates.map(({path: packagePath}) => packagePath),
    }, null, 2)}\n`;
}

function workflowOwnership(content, canonicalContent, legacyWorkflowSha256) {
    const firstLines = content.toString('utf8').split('\n', 5);
    const owned = firstLines.includes(WORKFLOW_MARKER) && firstLines.includes(WORKFLOW_SCHEMA_MARKER);
    if (owned) return content.equals(canonicalContent) ? 'OWNED_CANONICAL' : 'OWNED_OUTDATED';
    return sha256(content) === legacyWorkflowSha256 ? 'LEGACY' : 'UNOWNED';
}

function conflictResult(candidates, configuredPackages = []) {
    return {
        status: 'NO-GO',
        disposition: 'CONFLICT',
        candidates,
        configuredPackages,
        checks: [
            {id: 'package-release-ownership', status: 'FAIL', message: 'managed release files conflict'},
        ],
    };
}

function inspectReleaseCapability({
    projectRoot,
    coreRoot,
    legacyWorkflowSha256 = LEGACY_WORKFLOW_SHA256,
}) {
    const canonicalProject = fs.realpathSync(projectRoot);
    const canonicalCore = fs.realpathSync(coreRoot);
    const canonicalWorkflow = readRegularFile(
        path.join(canonicalCore, 'config', 'release.yml'),
        'canonical release workflow'
    );
    const candidates = discoverReleasePackages({projectRoot: canonicalProject});
    let configExists;
    let workflowExists;
    try {
        configExists = managedFileEntry(canonicalProject, CONFIG_PATH) !== undefined;
        workflowExists = managedFileEntry(canonicalProject, WORKFLOW_PATH) !== undefined;
    } catch {
        return conflictResult(candidates);
    }
    if (!configExists && !workflowExists) {
        return {
            status: 'GO',
            disposition: 'CREATE',
            candidates,
            configuredPackages: [],
            checks: [
                {
                    id: 'package-release-ownership',
                    status: 'PASS',
                    message: 'managed release files can be created',
                },
            ],
        };
    }
    if (configExists !== workflowExists) return conflictResult(candidates);

    let configuration;
    try {
        configuration = loadReleaseConfiguration({projectRoot: canonicalProject, allowLegacy: true});
    } catch {
        return conflictResult(candidates);
    }
    let workflowContent;
    try {
        workflowContent = readManagedFile(canonicalProject, WORKFLOW_PATH, 'release workflow');
    } catch {
        return conflictResult(candidates, configuration.packages);
    }
    const workflowState = workflowOwnership(workflowContent, canonicalWorkflow, legacyWorkflowSha256);
    if (configuration.kind === 'LEGACY' && workflowState === 'LEGACY') {
        return {
            status: 'GO',
            disposition: 'MIGRATE',
            candidates,
            configuredPackages: configuration.packages,
            checks: [
                {id: 'package-release-ownership', status: 'PASS', message: 'legacy release files can be migrated'},
            ],
        };
    }
    if (configuration.kind !== 'MANAGED' || !workflowState.startsWith('OWNED_')) {
        return conflictResult(candidates, configuration.packages);
    }
    const configContent = readManagedFile(canonicalProject, CONFIG_PATH, 'release configuration');
    const desiredConfig = Buffer.from(renderManagedConfiguration(candidates));
    const unchanged = configContent.equals(desiredConfig) && workflowState === 'OWNED_CANONICAL';
    return {
        status: 'GO',
        disposition: unchanged ? 'UNCHANGED' : 'UPDATE',
        candidates,
        configuredPackages: configuration.packages,
        checks: [
            {
                id: 'package-release-ownership',
                status: 'PASS',
                message: unchanged ? 'managed release files are current' : 'managed release files can be updated',
            },
        ],
    };
}

function operationPath(projectRoot) {
    return path.join(projectRoot, OPERATION_ROOT);
}

function acquirePackageReleaseLock(projectRoot) {
    const lockDirectory = ensureDirectory(projectRoot, path.join('.pi', 'prism-tool'));
    const parent = holdDirectory(projectRoot, lockDirectory);
    const anchoredLock = path.join(parent.anchor, 'package-release.lock');
    let descriptor;
    try {
        parent.assertCurrent();
        descriptor = fs.openSync(anchoredLock, 'wx', 0o600);
        parent.assertCurrent();
    } catch (error) {
        if (descriptor !== undefined) {
            fs.closeSync(descriptor);
            fs.rmSync(anchoredLock, {force: true});
        }
        parent.close();
        throw error;
    }
    return {
        release() {
            try {
                fs.closeSync(descriptor);
                fs.rmSync(anchoredLock, {force: true});
            } finally {
                parent.close();
            }
        },
    };
}

function ensureDirectory(projectRoot, relativeDirectory, mode = 0o700) {
    let current = projectRoot;
    let parent = holdDirectory(projectRoot, projectRoot);
    try {
        for (const segment of relativeDirectory.split(path.sep)) {
            parent.assertCurrent();
            const anchoredChild = path.join(parent.anchor, segment);
            let entry = fs.lstatSync(anchoredChild, {throwIfNoEntry: false});
            if (entry === undefined) {
                let created = false;
                try {
                    fs.mkdirSync(anchoredChild, {mode});
                    created = true;
                } catch (error) {
                    if (error.code !== 'EEXIST') throw error;
                }
                entry = fs.lstatSync(anchoredChild);
                if (created && !entry.isSymbolicLink() && entry.isDirectory()) {
                    fs.chmodSync(anchoredChild, mode);
                }
            }
            if (entry.isSymbolicLink() || !entry.isDirectory()) {
                throw new Error('package-release operation directory is invalid');
            }
            const childPath = path.join(current, segment);
            const child = holdAnchoredDirectory(projectRoot, childPath, anchoredChild, entry);
            parent.assertCurrent();
            parent.close();
            parent = child;
            current = childPath;
        }
        return current;
    } finally {
        parent.close();
    }
}

function readOwnedOperation(projectRoot) {
    const root = operationPath(projectRoot);
    if (!fs.existsSync(root)) return null;
    const stat = fs.lstatSync(root);
    if (stat.isSymbolicLink() || !stat.isDirectory() || fs.realpathSync(root) !== root) {
        throw new Error('package-release operation directory is invalid');
    }
    const markerPath = path.join(root, OPERATION_MARKER);
    const marker = readJsonObject(markerPath, 'package-release ownership marker');
    if (
        Object.keys(marker).sort().join(',') !== 'managedBy,projectRoot,schemaVersion' ||
        marker.schemaVersion !== 1 ||
        marker.managedBy !== MANAGED_BY ||
        marker.projectRoot !== projectRoot
    ) {
        throw new Error('package-release ownership marker does not match');
    }
    return {markerPath, root};
}

function recoverOwnedOperation(projectRoot) {
    const operation = readOwnedOperation(projectRoot);
    if (!operation) return false;
    fs.rmSync(operation.root, {recursive: true, force: false});
    return true;
}

function createOperation(projectRoot) {
    recoverOwnedOperation(projectRoot);
    const root = ensureDirectory(projectRoot, OPERATION_ROOT);
    const parent = holdDirectory(projectRoot, root);
    const markerPath = path.join(root, OPERATION_MARKER);
    const anchoredMarker = path.join(parent.anchor, OPERATION_MARKER);
    try {
        parent.assertCurrent();
        fs.writeFileSync(anchoredMarker, `${JSON.stringify({
            schemaVersion: 1,
            managedBy: MANAGED_BY,
            projectRoot,
        }, null, 2)}\n`, {flag: 'wx', mode: 0o600});
        fs.chmodSync(anchoredMarker, 0o600);
        parent.assertCurrent();
    } finally {
        parent.close();
    }
    return {markerPath, root};
}

function renderDiff(relativePath, before, after) {
    const beforeLines = before === null ? [] : before.toString('utf8').split('\n');
    const afterLines = after.toString('utf8').split('\n');
    const lines = [`--- a/${relativePath}`, `+++ b/${relativePath}`];
    lines.push(...beforeLines.filter((line, index) => line.length > 0 || index < beforeLines.length - 1)
        .map((line) => `-${line}`));
    lines.push(...afterLines.filter((line, index) => line.length > 0 || index < afterLines.length - 1)
        .map((line) => `+${line}`));
    return `${lines.join('\n')}\n`;
}

function writePlanFile(root, area, relativePath, content) {
    const destination = path.join(root, area, relativePath);
    fs.mkdirSync(path.dirname(destination), {recursive: true, mode: 0o700});
    fs.writeFileSync(destination, content, {flag: 'wx', mode: 0o600});
    fs.chmodSync(destination, 0o600);
}

function planReleaseCapability({projectRoot, coreRoot, legacyWorkflowSha256 = LEGACY_WORKFLOW_SHA256}) {
    const canonicalProject = fs.realpathSync(projectRoot);
    const inspection = inspectReleaseCapability({
        projectRoot: canonicalProject,
        coreRoot,
        legacyWorkflowSha256,
    });
    if (!['CREATE', 'UPDATE', 'MIGRATE'].includes(inspection.disposition)) {
        return {...inspection, planPath: null, diff: ''};
    }
    const lock = acquirePackageReleaseLock(canonicalProject);
    try {
        const operation = createOperation(canonicalProject);
        const desired = new Map([
            [CONFIG_PATH, Buffer.from(renderManagedConfiguration(inspection.candidates))],
            [WORKFLOW_PATH, readRegularFile(
                path.join(fs.realpathSync(coreRoot), 'config', 'release.yml'),
                'canonical release workflow'
            )],
        ]);
        const files = {};
        let diff = '';
        for (const [relativePath, after] of desired) {
            const before = managedFileEntry(canonicalProject, relativePath) === undefined
                ? null
                : readManagedFile(canonicalProject, relativePath, 'managed release file');
            if (before !== null) writePlanFile(operation.root, 'before', relativePath, before);
            writePlanFile(operation.root, 'after', relativePath, after);
            files[relativePath] = {
                before: before === null ? 'absent' : sha256(before),
                after: sha256(after),
            };
            diff += renderDiff(relativePath, before, after);
        }
        const plan = {
            schemaVersion: 1,
            managedBy: MANAGED_BY,
            projectRoot: canonicalProject,
            disposition: inspection.disposition,
            files,
        };
        const planPath = path.join(operation.root, `plan-${sha256(JSON.stringify(plan))}.json`);
        fs.writeFileSync(planPath, `${JSON.stringify(plan, null, 2)}\n`, {flag: 'wx', mode: 0o600});
        fs.chmodSync(planPath, 0o600);
        return {
            status: 'GO',
            disposition: inspection.disposition,
            candidates: inspection.candidates,
            configuredPackages: inspection.configuredPackages,
            checks: inspection.checks,
            planPath,
            diff,
        };
    } finally {
        lock.release();
    }
}

function readPlan(operation, planPath, projectRoot) {
    if (
        typeof planPath !== 'string' ||
        path.dirname(path.resolve(planPath)) !== operation.root ||
        !/^plan-[a-f0-9]{64}[.]json$/.test(path.basename(planPath))
    ) {
        throw new Error('package-release plan path is invalid');
    }
    const expectedPlan = path.resolve(planPath);
    const plan = readJsonObject(expectedPlan, 'package-release plan');
    if (
        Object.keys(plan).sort().join(',') !== 'disposition,files,managedBy,projectRoot,schemaVersion' ||
        plan.schemaVersion !== 1 ||
        plan.managedBy !== MANAGED_BY ||
        plan.projectRoot !== projectRoot ||
        !['CREATE', 'UPDATE', 'MIGRATE'].includes(plan.disposition) ||
        plan.files === null ||
        typeof plan.files !== 'object' ||
        Array.isArray(plan.files) ||
        Object.keys(plan.files).sort().join(',') !== [CONFIG_PATH, WORKFLOW_PATH].sort().join(',')
    ) {
        throw new Error('package-release plan is invalid');
    }
    for (const relativePath of [CONFIG_PATH, WORKFLOW_PATH]) {
        const record = plan.files[relativePath];
        if (
            record === null ||
            typeof record !== 'object' ||
            Array.isArray(record) ||
            Object.keys(record).sort().join(',') !== 'after,before' ||
            (record.before !== 'absent' && !/^[a-f0-9]{64}$/.test(record.before)) ||
            !/^[a-f0-9]{64}$/.test(record.after)
        ) {
            throw new Error('package-release plan is invalid');
        }
    }
    if (path.basename(expectedPlan) !== `plan-${sha256(JSON.stringify(plan))}.json`) {
        throw new Error('package-release plan is invalid');
    }
    return plan;
}

function currentFileState(filePath) {
    const stat = fileEntry(filePath);
    if (stat === undefined) return {digest: 'absent', content: null, mode: null};
    if (stat.isSymbolicLink() || !stat.isFile()) throw new Error('managed release target is invalid');
    const content = fs.readFileSync(filePath);
    return {digest: sha256(content), content, mode: stat.mode & 0o777};
}

function sameFile(left, right) {
    return left.dev === right.dev && left.ino === right.ino;
}

function createHeldDirectory(projectRoot, directoryPath, descriptor, expected) {
    try {
        const held = fs.fstatSync(descriptor);
        const current = fs.lstatSync(directoryPath);
        if (
            expected.isSymbolicLink() ||
            !expected.isDirectory() ||
            current.isSymbolicLink() ||
            !current.isDirectory() ||
            !sameFile(expected, held) ||
            !sameFile(current, held) ||
            fs.realpathSync(directoryPath) !== directoryPath ||
            !isInside(projectRoot, directoryPath)
        ) {
            throw new Error('managed release parent changed');
        }
        let anchor;
        for (const candidate of [`/proc/self/fd/${descriptor}`, `/dev/fd/${descriptor}`]) {
            try {
                if (sameFile(fs.statSync(candidate), held)) {
                    anchor = candidate;
                    break;
                }
            } catch {
                continue;
            }
        }
        if (anchor === undefined) {
            throw new Error('managed release parent cannot be held safely');
        }
        return {
            anchor,
            assertCurrent() {
                const latest = fs.lstatSync(directoryPath);
                if (
                    latest.isSymbolicLink() ||
                    !latest.isDirectory() ||
                    !sameFile(latest, held) ||
                    fs.realpathSync(directoryPath) !== directoryPath
                ) {
                    throw new Error('managed release parent changed');
                }
            },
            close() {
                fs.closeSync(descriptor);
            },
        };
    } catch (error) {
        fs.closeSync(descriptor);
        throw error;
    }
}

function holdAnchoredDirectory(projectRoot, directoryPath, anchoredPath, expected) {
    const descriptor = fs.openSync(
        anchoredPath,
        fs.constants.O_RDONLY |
            (fs.constants.O_DIRECTORY ?? 0) |
            (fs.constants.O_NOFOLLOW ?? 0)
    );
    return createHeldDirectory(projectRoot, directoryPath, descriptor, expected);
}

function holdDirectory(projectRoot, directoryPath) {
    const initial = fs.lstatSync(directoryPath);
    if (initial.isSymbolicLink() || !initial.isDirectory()) {
        throw new Error('managed release parent is invalid');
    }
    const descriptor = fs.openSync(
        directoryPath,
        fs.constants.O_RDONLY |
            (fs.constants.O_DIRECTORY ?? 0) |
            (fs.constants.O_NOFOLLOW ?? 0)
    );
    return createHeldDirectory(projectRoot, directoryPath, descriptor, initial);
}

function restoreHeldTarget(parent, targetPath, state, rename) {
    if (state.content === null) {
        fs.rmSync(targetPath, {force: true});
        return;
    }
    const tempPath = `${targetPath}.restore-${process.pid}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    let descriptor;
    try {
        descriptor = fs.openSync(tempPath, 'wx', state.mode);
        fs.writeFileSync(descriptor, state.content);
        fs.fsyncSync(descriptor);
        fs.closeSync(descriptor);
        descriptor = undefined;
        fs.chmodSync(tempPath, state.mode);
        rename(tempPath, targetPath);
    } catch (error) {
        if (descriptor !== undefined) fs.closeSync(descriptor);
        fs.rmSync(tempPath, {force: true});
        throw error;
    }
}

function writeAtomic(
    projectRoot,
    filePath,
    content,
    mode,
    rename = fs.renameSync,
    onMutation = () => {},
    replacedState = {content: null, mode: null}
) {
    const parent = holdDirectory(projectRoot, path.dirname(filePath));
    const tempName = `.${path.basename(filePath)}.prism-${process.pid}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const tempPath = path.join(parent.anchor, tempName);
    const targetPath = path.join(parent.anchor, path.basename(filePath));
    let descriptor;
    let renamed = false;
    try {
        parent.assertCurrent();
        descriptor = fs.openSync(tempPath, 'wx', mode);
        fs.writeFileSync(descriptor, content);
        fs.fsyncSync(descriptor);
        fs.closeSync(descriptor);
        descriptor = undefined;
        fs.chmodSync(tempPath, mode);
        parent.assertCurrent();
        rename(tempPath, targetPath);
        renamed = true;
        onMutation();
        parent.assertCurrent();
    } catch (error) {
        if (descriptor !== undefined) fs.closeSync(descriptor);
        fs.rmSync(tempPath, {force: true});
        if (renamed) restoreHeldTarget(parent, targetPath, replacedState, rename);
        throw error;
    } finally {
        parent.close();
    }
}

function removeManagedTarget(projectRoot, filePath) {
    const parent = holdDirectory(projectRoot, path.dirname(filePath));
    try {
        parent.assertCurrent();
        fs.rmSync(path.join(parent.anchor, path.basename(filePath)), {force: true});
        parent.assertCurrent();
    } finally {
        parent.close();
    }
}

function ensureTargetParent(projectRoot, relativePath, createdDirectories) {
    let current = projectRoot;
    for (const segment of path.dirname(relativePath).split('/')) {
        current = path.join(current, segment);
        if (fs.existsSync(current)) {
            const stat = fs.lstatSync(current);
            if (stat.isSymbolicLink() || !stat.isDirectory()) throw new Error('managed release parent is invalid');
            continue;
        }
        fs.mkdirSync(current, {mode: 0o755});
        fs.chmodSync(current, 0o755);
        createdDirectories.push(current);
    }
}

function removeEmptyCreatedDirectories(createdDirectories) {
    for (const directory of [...createdDirectories].reverse()) {
        if (fs.readdirSync(directory).length === 0) fs.rmdirSync(directory);
    }
}

function applyReleaseCapability({projectRoot, coreRoot, planPath, rename = fs.renameSync}) {
    const canonicalProject = fs.realpathSync(projectRoot);
    let lock;
    let operation;
    const createdDirectories = [];
    const originals = new Map();
    const appliedDigests = new Map();
    const mutated = [];
    let durable = false;
    try {
        lock = acquirePackageReleaseLock(canonicalProject);
        operation = readOwnedOperation(canonicalProject);
        if (!operation) throw new Error('package-release operation is missing');
        const plan = readPlan(operation, planPath, canonicalProject);
        for (const relativePath of [WORKFLOW_PATH, CONFIG_PATH]) {
            const targetPath = path.join(canonicalProject, relativePath);
            const state = currentFileState(targetPath);
            if (state.digest !== plan.files[relativePath].before) {
                throw new Error('package-release plan is stale');
            }
            const afterPath = path.join(operation.root, 'after', relativePath);
            const after = readRegularFile(afterPath, 'planned release file');
            if (sha256(after) !== plan.files[relativePath].after) {
                throw new Error('package-release plan is invalid');
            }
            originals.set(relativePath, state);
        }
        for (const relativePath of [WORKFLOW_PATH, CONFIG_PATH]) {
            ensureTargetParent(canonicalProject, relativePath, createdDirectories);
            const targetPath = path.join(canonicalProject, relativePath);
            if (currentFileState(targetPath).digest !== plan.files[relativePath].before) {
                throw new Error('package-release plan is stale');
            }
            const after = readRegularFile(
                path.join(operation.root, 'after', relativePath),
                'planned release file'
            );
            const original = originals.get(relativePath);
            const defaultMode = relativePath === CONFIG_PATH ? 0o600 : 0o644;
            writeAtomic(
                canonicalProject,
                targetPath,
                after,
                original.mode ?? defaultMode,
                rename,
                () => {
                    mutated.push(relativePath);
                    appliedDigests.set(relativePath, plan.files[relativePath].after);
                },
                original
            );
        }
        durable = true;
        const verification = inspectReleaseCapability({projectRoot: canonicalProject, coreRoot});
        if (verification.disposition !== 'UNCHANGED') {
            throw new Error('package-release verification failed');
        }
        recoverOwnedOperation(canonicalProject);
        operation = null;
        return {
            status: 'GO',
            checks: [
                {id: 'package-release-application', status: 'PASS', message: 'managed release files applied'},
            ],
            data: {disposition: plan.disposition},
        };
    } catch {
        let recoveryFailed = false;
        if (!durable) {
            for (const relativePath of [...mutated].reverse()) {
                try {
                    const targetPath = path.join(canonicalProject, relativePath);
                    const original = originals.get(relativePath);
                    if (currentFileState(targetPath).digest !== appliedDigests.get(relativePath)) {
                        throw new Error('managed release target changed during recovery');
                    }
                    if (original.content === null) removeManagedTarget(canonicalProject, targetPath);
                    else {
                        const replacedState = currentFileState(targetPath);
                        writeAtomic(
                            canonicalProject,
                            targetPath,
                            original.content,
                            original.mode,
                            rename,
                            () => {},
                            replacedState
                        );
                    }
                } catch {
                    recoveryFailed = true;
                }
            }
            try {
                removeEmptyCreatedDirectories(createdDirectories);
            } catch {
                recoveryFailed = true;
            }
        }
        if (operation && !recoveryFailed) {
            try {
                recoverOwnedOperation(canonicalProject);
            } catch {
                recoveryFailed = true;
            }
        }
        return {
            status: 'NO-GO',
            checks: [
                {id: 'package-release-application', status: 'FAIL', message: 'managed release files were not applied'},
            ],
            data: {
                reason: durable ? 'verification failure' : 'transaction failure',
                recovery: recoveryFailed
                    ? 'manual recovery required'
                    : durable ? 'prism-tool package-release verify' : undefined,
            },
        };
    } finally {
        if (lock !== undefined) lock.release();
    }
}

function verifyReleaseCapability({projectRoot, coreRoot}) {
    try {
        const inspection = inspectReleaseCapability({projectRoot, coreRoot});
        if (inspection.disposition !== 'UNCHANGED') {
            return {
                status: 'NO-GO',
                checks: [
                    {id: 'package-release-verification', status: 'FAIL', message: 'managed release files are not current'},
                ],
                data: {reason: inspection.disposition},
            };
        }
        return {
            status: 'GO',
            checks: [
                {id: 'package-release-verification', status: 'PASS', message: 'managed release files are current'},
            ],
            data: {packages: inspection.configuredPackages},
        };
    } catch {
        return {
            status: 'NO-GO',
            checks: [
                {id: 'package-release-verification', status: 'FAIL', message: 'managed release files are invalid'},
            ],
            data: {reason: 'verification failure'},
        };
    }
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
    CONFIG_PATH,
    LEGACY_WORKFLOW_SHA256,
    MANAGED_BY,
    RELEASE_SCHEMA_VERSION,
    WORKFLOW_MARKER,
    WORKFLOW_PATH,
    WORKFLOW_SCHEMA_MARKER,
    applyReleaseCapability,
    discoverReleasePackages,
    inspectReleaseCapability,
    loadReleaseConfiguration,
    packageTagPrefix,
    planReleaseCapability,
    renderManagedConfiguration,
    sha256,
    validateConfiguredPackages,
    verifyReleaseCapability,
};

// vim: ft=javascript sts=4 sw=4 ts=4 et :
