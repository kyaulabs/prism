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

function validateAppliedOutput(projectRoot, project, entry) {
    const parent = existingTargetParent(projectRoot, project, entry.path);
    try {
        const targetPath = path.join(parent.anchor, path.posix.basename(entry.path));
        const descriptor = fs.openSync(targetPath, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW);
        try {
            const stat = fs.fstatSync(descriptor);
            const contents = fs.readFileSync(descriptor);
            if (
                !stat.isFile() ||
                stat.dev !== entry.dev ||
                stat.ino !== entry.ino ||
                (stat.mode & 0o777) !== entry.mode ||
                sha256(contents) !== entry.sha256
            ) {
                throw new Error('durable bootstrap output changed');
            }
        } finally {
            fs.closeSync(descriptor);
        }
        parent.assertCurrent();
    } finally {
        parent.close();
    }
}

function validateDurableProject({projectRoot, coreRoot, attemptId, planDigest, journal}) {
    const plan = validateBootstrapProjectPlan({
        projectRoot,
        coreRoot,
        attemptId,
        planDigest,
        allowAppliedProject: true,
    });
    if (
        journal.phase !== 'DURABLE' ||
        journal.status !== 'ACTIVE' ||
        journal.applied.length !== plan.outputs.length ||
        journal.appliedInventoryDigest !== appliedInventoryDigest(journal.applied)
    ) {
        throw new Error('durable bootstrap journal is invalid');
    }
    const expected = plan.outputs.map(({path: outputPath, kind, mode, sha256: digest}) => ({
        path: outputPath,
        kind,
        mode,
        sha256: digest,
    }));
    const actual = journal.applied.map(({path: outputPath, kind, mode, sha256: digest}) => ({
        path: outputPath,
        kind,
        mode,
        sha256: digest,
    }));
    if (JSON.stringify(actual) !== JSON.stringify(expected)) {
        throw new Error('durable bootstrap inventory is stale');
    }
    const project = holdDirectory(projectRoot, projectRoot);
    try {
        const expectedRootEntries = new Set(['.pi']);
        for (const output of plan.outputs) expectedRootEntries.add(output.path.split('/')[0]);
        const rootEntries = fs.readdirSync(project.anchor).sort();
        if (JSON.stringify(rootEntries) !== JSON.stringify([...expectedRootEntries].sort())) {
            throw new Error('durable bootstrap root changed');
        }
        if (fs.lstatSync(path.join(project.anchor, '.git'), {throwIfNoEntry: false}) !== undefined) {
            throw new Error('durable bootstrap repository state is unexpected');
        }
        for (const entry of journal.applied) validateAppliedOutput(projectRoot, project, entry);
        project.assertCurrent();
    } finally {
        project.close();
    }
    return Object.freeze({plan, appliedInventoryDigest: journal.appliedInventoryDigest});
}

function markRecoveryRequired(projectRoot, attemptId, journal) {
    return transitionBootstrapJournal({
        projectRoot,
        attemptId,
        expectedPhase: journal.phase,
        next: {
            ...journal,
            status: 'RECOVERY_REQUIRED',
            reason: 'AMBIGUOUS_PROJECT_STATE',
            resumePhase: 'MANUAL_RECOVERY',
        },
    });
}

function durableProjectReport(attemptId, planDigest, inventoryDigest) {
    return Object.freeze({
        status: 'GO',
        disposition: 'PROJECT_DURABLE',
        checks: Object.freeze([Object.freeze({
            id: 'bootstrap-project-recovery',
            status: 'PASS',
            message: 'durable bootstrap project state was revalidated',
        })]),
        data: Object.freeze({
            attempt: Object.freeze({id: attemptId}),
            planDigest,
            appliedInventoryDigest: inventoryDigest,
            resumePhase: 'REPOSITORY_BOOTSTRAP',
        }),
    });
}

function existingTargetParent(projectRoot, project, relativePath) {
    const parent = path.posix.dirname(relativePath);
    if (parent === '.') {
        return {
            anchor: project.anchor,
            assertCurrent: project.assertCurrent,
            sync: project.sync,
            close() {},
        };
    }
    const directoryPath = path.join(projectRoot, ...parent.split('/'));
    const openPath = path.join(project.anchor, ...parent.split('/'));
    return holdDirectory(projectRoot, directoryPath, openPath);
}

function rollbackAppliedOutputs(projectRoot, project, applied) {
    for (const entry of [...applied].reverse()) {
        const parent = existingTargetParent(projectRoot, project, entry.path);
        try {
            const targetPath = path.join(parent.anchor, path.posix.basename(entry.path));
            const descriptor = fs.openSync(
                targetPath,
                fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW
            );
            try {
                const stat = fs.fstatSync(descriptor);
                const contents = fs.readFileSync(descriptor);
                if (
                    !stat.isFile() ||
                    stat.dev !== entry.dev ||
                    stat.ino !== entry.ino ||
                    (stat.mode & 0o777) !== entry.mode ||
                    sha256(contents) !== entry.sha256
                ) {
                    throw new Error('bootstrap target changed during recovery');
                }
            } finally {
                fs.closeSync(descriptor);
            }
            parent.assertCurrent();
            fs.unlinkSync(targetPath);
            parent.sync();
        } finally {
            parent.close();
        }
    }
}

function rollbackCreatedDirectories(projectRoot, project, createdDirectories) {
    for (const created of [...createdDirectories].reverse()) {
        const parentPath = path.posix.dirname(created.path);
        const parent = parentPath === '.'
            ? {
                anchor: project.anchor,
                assertCurrent: project.assertCurrent,
                sync: project.sync,
                close() {},
            }
            : holdDirectory(
                projectRoot,
                path.join(projectRoot, ...parentPath.split('/')),
                path.join(project.anchor, ...parentPath.split('/'))
            );
        try {
            const directoryPath = path.join(parent.anchor, path.posix.basename(created.path));
            const stat = fs.lstatSync(directoryPath);
            if (
                stat.isSymbolicLink() ||
                !stat.isDirectory() ||
                stat.dev !== created.dev ||
                stat.ino !== created.ino ||
                fs.readdirSync(directoryPath).length !== 0
            ) {
                throw new Error('bootstrap directory changed during recovery');
            }
            parent.assertCurrent();
            fs.rmdirSync(directoryPath);
            parent.sync();
        } finally {
            parent.close();
        }
    }
}

function rootRestoredReport(attemptId) {
    return Object.freeze({
        status: 'NO-GO',
        disposition: 'ROOT_RESTORED',
        checks: Object.freeze([Object.freeze({
            id: 'bootstrap-project-application',
            status: 'FAIL',
            message: 'bootstrap project application failed and owned state was removed',
        })]),
        data: Object.freeze({
            attempt: Object.freeze({id: attemptId}),
            resumePhase: null,
        }),
    });
}

function applyBootstrapProject({
    projectRoot: requestedRoot,
    coreRoot,
    attemptId,
    planDigest,
    approval,
    fault = () => {},
}) {
    if (approval !== 'yes') throw new Error('bootstrap project approval is required');
    const projectRoot = fs.realpathSync(requestedRoot);
    const attemptRoot = path.join(projectRoot, '.pi', 'prism-tool', 'bootstrap', attemptId);
    const journal = readBootstrapJournal({projectRoot, attemptId});
    if (journal.planDigest !== planDigest) throw new Error('bootstrap journal is stale');
    if (journal.status === 'RECOVERY_REQUIRED') {
        throw new Error('bootstrap project recovery requires manual action');
    }
    if (journal.phase === 'DURABLE') {
        try {
            const durable = validateDurableProject({
                projectRoot,
                coreRoot,
                attemptId,
                planDigest,
                journal,
            });
            return durableProjectReport(attemptId, planDigest, durable.appliedInventoryDigest);
        } catch (error) {
            markRecoveryRequired(projectRoot, attemptId, journal);
            throw error;
        }
    }
    const lock = acquireApplyLock(attemptRoot, attemptId);
    const createdDirectories = [];
    const applied = [];
    let project;
    let candidate;
    let applying = false;
    let current = journal;
    let failure;
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
        current = transitionBootstrapJournal({
            projectRoot,
            attemptId,
            expectedPhase: 'PREPARED',
            next: {
                ...journal,
                phase: 'APPLYING',
                resumePhase: 'PROJECT_APPLICATION',
            },
        });
        applying = true;
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
            fault({name: 'after-output', index, output: output.path});
        }
        project.assertCurrent();
        project.sync();
        fault({name: 'before-durable'});
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
    } catch (error) {
        failure = error;
    } finally {
        if (candidate !== undefined) candidate.close();
    }
    if (!applying) {
        if (project !== undefined) project.close();
        releaseApplyLock(lock);
        throw failure;
    }
    let rollbackComplete = false;
    try {
        rollbackAppliedOutputs(projectRoot, project, applied);
        rollbackCreatedDirectories(projectRoot, project, createdDirectories);
        project.assertCurrent();
        project.sync();
        rollbackComplete = true;
        project.close();
        project = undefined;
        releaseApplyLock(lock);
        removePreparedAttempt(projectRoot, attemptId);
        return rootRestoredReport(attemptId);
    } catch (recoveryError) {
        if (project !== undefined) project.close();
        transitionBootstrapJournal({
            projectRoot,
            attemptId,
            expectedPhase: 'APPLYING',
            next: {
                ...current,
                status: 'RECOVERY_REQUIRED',
                reason: 'AMBIGUOUS_PROJECT_STATE',
                resumePhase: 'MANUAL_RECOVERY',
                applied: rollbackComplete ? [] : current.applied,
            },
        });
        throw new Error('bootstrap project recovery requires manual action', {
            cause: recoveryError,
        });
    }
}

function recoverBootstrapProject({projectRoot: requestedRoot, coreRoot, attemptId, planDigest}) {
    const projectRoot = fs.realpathSync(requestedRoot);
    const journal = readBootstrapJournal({projectRoot, attemptId});
    if (journal.planDigest !== planDigest) throw new Error('bootstrap journal is stale');
    if (journal.status === 'RECOVERY_REQUIRED') {
        throw new Error('bootstrap project recovery requires manual action');
    }
    if (journal.phase === 'DURABLE') {
        try {
            const durable = validateDurableProject({
                projectRoot,
                coreRoot,
                attemptId,
                planDigest,
                journal,
            });
            return durableProjectReport(attemptId, planDigest, durable.appliedInventoryDigest);
        } catch (error) {
            markRecoveryRequired(projectRoot, attemptId, journal);
            throw error;
        }
    }
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
