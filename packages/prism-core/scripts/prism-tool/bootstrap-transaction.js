// $KYAULabs: bootstrap-transaction.js kyau@aura.kyaulabs 2026/08/24 -0700 Exp $

'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const {
    readBootstrapJournal,
    transitionBootstrapJournal,
} = require('./bootstrap-journal');
const {validateBootstrapProjectPlan} = require('./bootstrap-plan');

function sha256(value) {
    return crypto.createHash('sha256').update(value).digest('hex');
}

function sameFile(left, right) {
    return left.dev === right.dev && left.ino === right.ino;
}

function holdDirectory(root, directoryPath, openPath = directoryPath) {
    if (
        typeof fs.constants.O_DIRECTORY !== 'number' ||
        typeof fs.constants.O_NOFOLLOW !== 'number'
    ) {
        throw new Error('safe filesystem flags are unavailable');
    }
    const initial = fs.lstatSync(openPath);
    if (initial.isSymbolicLink() || !initial.isDirectory()) {
        throw new Error('bootstrap directory is invalid');
    }
    const descriptor = fs.openSync(
        openPath,
        fs.constants.O_RDONLY | fs.constants.O_DIRECTORY | fs.constants.O_NOFOLLOW
    );
    try {
        const held = fs.fstatSync(descriptor);
        const current = fs.lstatSync(directoryPath);
        const relation = path.relative(root, fs.realpathSync(directoryPath));
        if (
            !sameFile(initial, held) ||
            !sameFile(current, held) ||
            relation.startsWith('..') ||
            path.isAbsolute(relation)
        ) {
            throw new Error('bootstrap directory changed');
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
        if (anchor === undefined) throw new Error('bootstrap directory cannot be held safely');
        return {
            anchor,
            assertCurrent() {
                const latest = fs.lstatSync(directoryPath);
                if (
                    latest.isSymbolicLink() ||
                    !latest.isDirectory() ||
                    !sameFile(latest, held) ||
                    !sameFile(fs.statSync(anchor), held)
                ) {
                    throw new Error('bootstrap directory changed');
                }
            },
            sync() {
                fs.fsyncSync(descriptor);
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

function assertOwnedDirectory(directoryPath, expectedMode = 0o700) {
    const stat = fs.lstatSync(directoryPath);
    if (
        stat.isSymbolicLink() ||
        !stat.isDirectory() ||
        (stat.mode & 0o777) !== expectedMode ||
        fs.realpathSync(directoryPath) !== directoryPath
    ) {
        throw new Error('bootstrap attempt directory is invalid');
    }
    return {dev: stat.dev, ino: stat.ino};
}

function removePreparedAttempt(projectRoot, attemptId) {
    const piRoot = path.join(projectRoot, '.pi');
    const prismRoot = path.join(piRoot, 'prism-tool');
    const bootstrapRoot = path.join(prismRoot, 'bootstrap');
    const attemptRoot = path.join(bootstrapRoot, attemptId);
    if (
        fs.readdirSync(projectRoot).join(',') !== '.pi' ||
        fs.readdirSync(piRoot).join(',') !== 'prism-tool' ||
        fs.readdirSync(prismRoot).join(',') !== 'bootstrap' ||
        fs.readdirSync(bootstrapRoot).join(',') !== attemptId
    ) {
        throw new Error('bootstrap project root changed');
    }
    const identities = [
        [piRoot, assertOwnedDirectory(piRoot)],
        [prismRoot, assertOwnedDirectory(prismRoot)],
        [bootstrapRoot, assertOwnedDirectory(bootstrapRoot)],
        [attemptRoot, assertOwnedDirectory(attemptRoot)],
    ];
    for (const [directoryPath, identity] of identities) {
        const current = fs.lstatSync(directoryPath);
        if (current.dev !== identity.dev || current.ino !== identity.ino) {
            throw new Error('bootstrap attempt directory changed');
        }
    }
    fs.rmSync(attemptRoot, {recursive: true});
    fs.rmdirSync(bootstrapRoot);
    fs.rmdirSync(prismRoot);
    fs.rmdirSync(piRoot);
    if (fs.readdirSync(projectRoot).length !== 0) {
        throw new Error('bootstrap project root is not empty');
    }
}

function acquireApplyLock(attemptRoot, attemptId) {
    const lockPath = path.join(attemptRoot, 'apply.lock');
    const contents = Buffer.from(`${JSON.stringify({schemaVersion: 1, attemptId})}\n`, 'utf8');
    fs.writeFileSync(lockPath, contents, {flag: 'wx', mode: 0o600});
    fs.chmodSync(lockPath, 0o600);
    const descriptor = fs.openSync(lockPath, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW);
    try {
        fs.fsyncSync(descriptor);
    } finally {
        fs.closeSync(descriptor);
    }
    const stat = fs.lstatSync(lockPath);
    return {path: lockPath, dev: stat.dev, ino: stat.ino, contents};
}

function releaseApplyLock(lock) {
    const stat = fs.lstatSync(lock.path);
    if (
        stat.isSymbolicLink() ||
        !stat.isFile() ||
        stat.dev !== lock.dev ||
        stat.ino !== lock.ino ||
        !fs.readFileSync(lock.path).equals(lock.contents)
    ) {
        throw new Error('bootstrap apply lock changed');
    }
    fs.unlinkSync(lock.path);
}

function ensureTargetParent(projectRoot, project, relativePath, createdDirectories) {
    const parent = path.posix.dirname(relativePath);
    if (parent === '.') {
        return {
            anchor: project.anchor,
            assertCurrent: project.assertCurrent,
            sync: project.sync,
            close() {},
        };
    }
    let relative = '';
    for (const segment of parent.split('/')) {
        relative = relative === '' ? segment : `${relative}/${segment}`;
        const anchoredPath = path.join(project.anchor, ...relative.split('/'));
        let stat = fs.lstatSync(anchoredPath, {throwIfNoEntry: false});
        if (stat === undefined) {
            fs.mkdirSync(anchoredPath, {mode: 0o755});
            stat = fs.lstatSync(anchoredPath);
            createdDirectories.push({path: relative, dev: stat.dev, ino: stat.ino});
        }
        if (stat.isSymbolicLink() || !stat.isDirectory()) {
            throw new Error('bootstrap target parent is invalid');
        }
    }
    const directoryPath = path.join(projectRoot, ...parent.split('/'));
    const openPath = path.join(project.anchor, ...parent.split('/'));
    return holdDirectory(projectRoot, directoryPath, openPath);
}

function readCandidateOutput(attemptRoot, candidate, output) {
    const parent = path.posix.dirname(output.path);
    const parentPath = parent === '.'
        ? path.join(attemptRoot, 'candidate')
        : path.join(attemptRoot, 'candidate', ...parent.split('/'));
    const openPath = parent === '.'
        ? candidate.anchor
        : path.join(candidate.anchor, ...parent.split('/'));
    const directory = parent === '.'
        ? {
            anchor: candidate.anchor,
            assertCurrent: candidate.assertCurrent,
            close() {},
        }
        : holdDirectory(attemptRoot, parentPath, openPath);
    try {
        directory.assertCurrent();
        const filePath = path.join(directory.anchor, path.posix.basename(output.path));
        const descriptor = fs.openSync(filePath, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW);
        try {
            const stat = fs.fstatSync(descriptor);
            const contents = fs.readFileSync(descriptor);
            if (
                !stat.isFile() ||
                (stat.mode & 0o777) !== output.mode ||
                sha256(contents) !== output.sha256
            ) {
                throw new Error('bootstrap candidate output changed');
            }
            return contents;
        } finally {
            fs.closeSync(descriptor);
        }
    } finally {
        directory.close();
    }
}

function publishOutput({projectRoot, project, attemptId, index, output, contents, createdDirectories}) {
    if (output.kind !== 'file') throw new Error('bootstrap output kind is unsupported');
    const parent = ensureTargetParent(projectRoot, project, output.path, createdDirectories);
    const targetName = path.posix.basename(output.path);
    const targetPath = path.join(parent.anchor, targetName);
    const temporaryPath = path.join(parent.anchor, `.prism-bootstrap-${attemptId}-${index}.tmp`);
    try {
        if (fs.lstatSync(targetPath, {throwIfNoEntry: false}) !== undefined) {
            throw new Error('bootstrap target already exists');
        }
        fs.writeFileSync(temporaryPath, contents, {flag: 'wx', mode: output.mode});
        fs.chmodSync(temporaryPath, output.mode);
        const temporary = fs.openSync(
            temporaryPath,
            fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW
        );
        try {
            fs.fsyncSync(temporary);
        } finally {
            fs.closeSync(temporary);
        }
        parent.assertCurrent();
        fs.linkSync(temporaryPath, targetPath);
        fs.unlinkSync(temporaryPath);
        parent.sync();
        const descriptor = fs.openSync(targetPath, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW);
        try {
            const stat = fs.fstatSync(descriptor);
            const actual = fs.readFileSync(descriptor);
            if (
                !stat.isFile() ||
                (stat.mode & 0o777) !== output.mode ||
                sha256(actual) !== output.sha256
            ) {
                throw new Error('bootstrap target output changed');
            }
            return Object.freeze({
                path: output.path,
                kind: 'file',
                mode: output.mode,
                sha256: output.sha256,
                dev: stat.dev,
                ino: stat.ino,
            });
        } finally {
            fs.closeSync(descriptor);
        }
    } catch (error) {
        fs.rmSync(temporaryPath, {force: true});
        throw error;
    } finally {
        parent.close();
    }
}

function appliedInventoryDigest(applied) {
    return sha256(Buffer.from(JSON.stringify(applied.map(({path: outputPath, kind, mode, sha256: digest}) => ({
        path: outputPath,
        kind,
        mode,
        sha256: digest,
    }))), 'utf8'));
}

function applyBootstrapProject({
    projectRoot: requestedRoot,
    coreRoot,
    attemptId,
    planDigest,
    approval,
}) {
    if (approval !== 'yes') throw new Error('bootstrap project approval is required');
    const projectRoot = fs.realpathSync(requestedRoot);
    const attemptRoot = path.join(projectRoot, '.pi', 'prism-tool', 'bootstrap', attemptId);
    const journal = readBootstrapJournal({projectRoot, attemptId});
    if (journal.planDigest !== planDigest) throw new Error('bootstrap journal is stale');
    const lock = acquireApplyLock(attemptRoot, attemptId);
    let project;
    let candidate;
    try {
        const plan = validateBootstrapProjectPlan({projectRoot, coreRoot, attemptId, planDigest});
        project = holdDirectory(projectRoot, projectRoot);
        candidate = holdDirectory(attemptRoot, path.join(attemptRoot, 'candidate'));
        if (
            fs.readdirSync(project.anchor).join(',') !== '.pi' ||
            fs.lstatSync(path.join(project.anchor, '.git'), {throwIfNoEntry: false}) !== undefined
        ) {
            throw new Error('bootstrap project root changed');
        }
        let current = transitionBootstrapJournal({
            projectRoot,
            attemptId,
            expectedPhase: 'PREPARED',
            next: {
                ...journal,
                phase: 'APPLYING',
                resumePhase: 'PROJECT_APPLICATION',
            },
        });
        const createdDirectories = [];
        const applied = [];
        for (const [index, output] of plan.outputs.entries()) {
            const contents = readCandidateOutput(attemptRoot, candidate, output);
            const entry = publishOutput({
                projectRoot,
                project,
                attemptId,
                index,
                output,
                contents,
                createdDirectories,
            });
            applied.push(entry);
            current = transitionBootstrapJournal({
                projectRoot,
                attemptId,
                expectedPhase: 'APPLYING',
                next: {...current, applied: [...applied]},
            });
        }
        project.assertCurrent();
        project.sync();
        const inventoryDigest = appliedInventoryDigest(applied);
        transitionBootstrapJournal({
            projectRoot,
            attemptId,
            expectedPhase: 'APPLYING',
            next: {
                ...current,
                phase: 'DURABLE',
                resumePhase: 'REPOSITORY_BOOTSTRAP',
                applied: [...applied],
                appliedInventoryDigest: inventoryDigest,
            },
        });
        releaseApplyLock(lock);
        return Object.freeze({
            status: 'GO',
            disposition: 'PROJECT_DURABLE',
            checks: Object.freeze([Object.freeze({
                id: 'bootstrap-project-application',
                status: 'PASS',
                message: 'approved bootstrap project files were applied',
            })]),
            data: Object.freeze({
                attempt: Object.freeze({id: attemptId}),
                planDigest,
                appliedInventoryDigest: inventoryDigest,
                resumePhase: 'REPOSITORY_BOOTSTRAP',
            }),
        });
    } finally {
        if (candidate !== undefined) candidate.close();
        if (project !== undefined) project.close();
    }
}

function recoverBootstrapProject({projectRoot: requestedRoot, coreRoot, attemptId, planDigest}) {
    const projectRoot = fs.realpathSync(requestedRoot);
    const journal = readBootstrapJournal({projectRoot, attemptId});
    if (journal.planDigest !== planDigest) throw new Error('bootstrap journal is stale');
    try {
        validateBootstrapProjectPlan({projectRoot, coreRoot, attemptId, planDigest});
        removePreparedAttempt(projectRoot, attemptId);
    } catch (error) {
        transitionBootstrapJournal({
            projectRoot,
            attemptId,
            expectedPhase: 'PREPARED',
            next: {
                ...journal,
                status: 'RECOVERY_REQUIRED',
                reason: 'ROOT_STATE_CHANGED',
                resumePhase: 'MANUAL_RECOVERY',
            },
        });
        throw error;
    }
    return Object.freeze({
        status: 'GO',
        disposition: 'ROOT_RESTORED',
        checks: Object.freeze([Object.freeze({
            id: 'bootstrap-project-recovery',
            status: 'PASS',
            message: 'prepared bootstrap project state was removed',
        })]),
        data: Object.freeze({
            attempt: Object.freeze({id: attemptId}),
            resumePhase: null,
        }),
    });
}

module.exports = {applyBootstrapProject, recoverBootstrapProject};

// vim: ft=javascript sts=4 sw=4 ts=4 et :
