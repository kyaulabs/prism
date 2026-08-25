// $KYAULabs: bootstrap-transaction.js kyau@aura.kyaulabs 2026/08/25 -0700 Exp $

'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const {
    readBootstrapJournal,
    transitionBootstrapJournal,
} = require('./bootstrap-journal');
const {validateBootstrapProjectPlan} = require('./bootstrap-plan');
const {cleanupBootstrapAdapter} = require('./bootstrap-adapter');

function sha256(value) {
    return crypto.createHash('sha256').update(value).digest('hex');
}

function sameFile(left, right) {
    return left.dev === right.dev && left.ino === right.ino;
}

function holdDirectory(root, directoryPath) {
    if (
        typeof fs.constants.O_DIRECTORY !== 'number' ||
        typeof fs.constants.O_NOFOLLOW !== 'number' ||
        fs.realpathSync(root) !== root
    ) {
        throw new Error('safe filesystem flags are unavailable');
    }
    const relation = path.relative(root, directoryPath);
    if (relation.startsWith('..') || path.isAbsolute(relation)) {
        throw new Error('bootstrap directory is invalid');
    }
    const heldDirectories = [];
    let currentPath = root;
    let openPath = root;
    try {
        for (const segment of ['', ...relation.split(path.sep).filter(Boolean)]) {
            if (segment !== '') {
                currentPath = path.join(currentPath, segment);
                openPath = path.join(heldDirectories.at(-1).anchor, segment);
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
                const current = fs.lstatSync(currentPath);
                if (!sameFile(initial, held) || !sameFile(current, held)) {
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
                if (anchor === undefined) {
                    throw new Error('bootstrap directory cannot be held safely');
                }
                heldDirectories.push({path: currentPath, descriptor, held, anchor});
            } catch (error) {
                fs.closeSync(descriptor);
                throw error;
            }
        }
        const target = heldDirectories.at(-1);
        return {
            anchor: target.anchor,
            assertCurrent() {
                for (const directory of heldDirectories) {
                    const latest = fs.lstatSync(directory.path);
                    if (
                        latest.isSymbolicLink() ||
                        !latest.isDirectory() ||
                        !sameFile(latest, directory.held) ||
                        !sameFile(fs.statSync(directory.anchor), directory.held)
                    ) {
                        throw new Error('bootstrap directory changed');
                    }
                }
            },
            sync() {
                fs.fsyncSync(target.descriptor);
            },
            close() {
                for (const directory of [...heldDirectories].reverse()) {
                    fs.closeSync(directory.descriptor);
                }
            },
        };
    } catch (error) {
        for (const directory of [...heldDirectories].reverse()) {
            fs.closeSync(directory.descriptor);
        }
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

function removePreparedAttempt(projectRoot, attemptId, adapter = null) {
    const piRoot = path.join(projectRoot, '.pi');
    const prismRoot = path.join(piRoot, 'prism-tool');
    const bootstrapRoot = path.join(prismRoot, 'bootstrap');
    const attemptRoot = path.join(bootstrapRoot, attemptId);
    if (adapter !== null) {
        const allowedAttemptEntries = new Set([
            'adapter.json', 'candidate', 'reports', 'plan', 'journal.json',
        ]);
        if (
            fs.readdirSync(projectRoot).join(',') !== '.pi' ||
            fs.readdirSync(piRoot).some((entry) =>
                !['npm', 'prism-tool', 'settings.json'].includes(entry)
            ) ||
            fs.readdirSync(prismRoot).join(',') !== 'bootstrap' ||
            fs.readdirSync(bootstrapRoot).join(',') !== attemptId ||
            fs.readdirSync(attemptRoot).some((entry) => !allowedAttemptEntries.has(entry))
        ) {
            throw new Error('bootstrap project root changed');
        }
        for (const entry of fs.readdirSync(attemptRoot)) {
            if (entry === 'adapter.json') continue;
            const entryPath = path.join(attemptRoot, entry);
            const stat = fs.lstatSync(entryPath);
            if (stat.isSymbolicLink() || (!stat.isDirectory() && !stat.isFile())) {
                throw new Error('bootstrap attempt state is unsafe');
            }
            if (stat.isDirectory()) fs.rmSync(entryPath, {recursive: true});
            else fs.unlinkSync(entryPath);
        }
        const cleanup = cleanupBootstrapAdapter({projectRoot, attemptId});
        if (cleanup.status !== 'GO' || fs.readdirSync(projectRoot).length !== 0) {
            throw new Error('bootstrap adapter cleanup failed');
        }
        return;
    }
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

function applyLockContents(attemptId, pid = process.pid) {
    return Buffer.from(`${JSON.stringify({schemaVersion: 1, attemptId, pid})}\n`, 'utf8');
}

function writeApplyLock(lockPath, attemptId) {
    const contents = applyLockContents(attemptId);
    fs.writeFileSync(lockPath, contents, {flag: 'wx', mode: 0o600});
    fs.chmodSync(lockPath, 0o600);
    const descriptor = fs.openSync(lockPath, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW);
    try {
        fs.fsyncSync(descriptor);
    } finally {
        fs.closeSync(descriptor);
    }
    const stat = fs.lstatSync(lockPath);
    return {path: lockPath, dev: stat.dev, ino: stat.ino, contents, pid: process.pid};
}

function assertApplyLockStat(stat) {
    if (
        stat.isSymbolicLink() ||
        !stat.isFile() ||
        (stat.mode & 0o777) !== 0o600 ||
        stat.size > 1024 ||
        typeof fs.constants.O_NOFOLLOW !== 'number'
    ) {
        throw new Error('bootstrap apply lock changed');
    }
}

function readStableApplyLock(lockPath, stat) {
    const descriptor = fs.openSync(lockPath, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW);
    try {
        const held = fs.fstatSync(descriptor);
        if (held.dev !== stat.dev || held.ino !== stat.ino || held.size !== stat.size) {
            throw new Error('bootstrap apply lock changed');
        }
        const contents = fs.readFileSync(descriptor);
        const final = fs.fstatSync(descriptor);
        const current = fs.lstatSync(lockPath);
        if (
            final.dev !== held.dev ||
            final.ino !== held.ino ||
            final.size !== held.size ||
            contents.length !== held.size ||
            current.isSymbolicLink() ||
            !current.isFile() ||
            current.dev !== held.dev ||
            current.ino !== held.ino
        ) {
            throw new Error('bootstrap apply lock changed');
        }
        return contents;
    } finally {
        fs.closeSync(descriptor);
    }
}

function parseApplyLock(contents, attemptId) {
    let value;
    try {
        value = JSON.parse(contents);
    } catch {
        throw new Error('bootstrap apply lock changed');
    }
    const keys = Object.keys(value ?? {}).sort().join(',');
    if (
        value === null ||
        typeof value !== 'object' ||
        Array.isArray(value) ||
        !['attemptId,schemaVersion', 'attemptId,pid,schemaVersion'].includes(keys) ||
        value.schemaVersion !== 1 ||
        value.attemptId !== attemptId ||
        (
            value.pid !== undefined &&
            (!Number.isSafeInteger(value.pid) || value.pid < 1)
        )
    ) {
        throw new Error('bootstrap apply lock changed');
    }
    return value;
}

function readApplyLockPath(lockPath, attemptId) {
    const stat = fs.lstatSync(lockPath);
    assertApplyLockStat(stat);
    const contents = readStableApplyLock(lockPath, stat);
    const value = parseApplyLock(contents, attemptId);
    return {path: lockPath, dev: stat.dev, ino: stat.ino, contents, pid: value.pid ?? null};
}

function readApplyLock(attemptRoot, attemptId) {
    return readApplyLockPath(path.join(attemptRoot, 'apply.lock'), attemptId);
}

function processIsRunning(pid) {
    try {
        process.kill(pid, 0);
        return true;
    } catch (error) {
        if (error?.code === 'ESRCH') return false;
        throw error;
    }
}

function assertApplyRecovery(attemptRoot, allowedRecovery = null) {
    if (fs.readdirSync(attemptRoot).some((name) => name.startsWith('apply.claim-'))) {
        throw new Error('bootstrap apply lock changed');
    }
    const recoveryPath = path.join(attemptRoot, 'apply.recovery.lock');
    const stat = fs.lstatSync(recoveryPath, {throwIfNoEntry: false});
    if (allowedRecovery === null) {
        if (stat !== undefined) throw new Error('bootstrap apply lock recovery requires manual action');
        return;
    }
    if (
        stat === undefined ||
        stat.isSymbolicLink() ||
        !stat.isFile() ||
        stat.dev !== allowedRecovery.dev ||
        stat.ino !== allowedRecovery.ino
    ) {
        throw new Error('bootstrap apply lock recovery changed');
    }
}

function acquireApplyLock(attemptRoot, attemptId, allowedRecovery = null) {
    assertApplyRecovery(attemptRoot, allowedRecovery);
    const lock = writeApplyLock(path.join(attemptRoot, 'apply.lock'), attemptId);
    try {
        assertApplyRecovery(attemptRoot, allowedRecovery);
        return lock;
    } catch (error) {
        releaseApplyLock(lock);
        throw error;
    }
}

function acquireDurableApplyLock(attemptRoot, attemptId) {
    try {
        return acquireApplyLock(attemptRoot, attemptId);
    } catch (error) {
        if (error?.code !== 'EEXIST') throw error;
    }
    const retained = readApplyLock(attemptRoot, attemptId);
    if (retained.pid === null || processIsRunning(retained.pid)) {
        throw new Error('bootstrap apply lock is active');
    }
    const recovery = writeApplyLock(
        path.join(attemptRoot, 'apply.recovery.lock'),
        attemptId
    );
    let lock = null;
    try {
        const current = readApplyLock(attemptRoot, attemptId);
        if (
            current.dev !== retained.dev ||
            current.ino !== retained.ino ||
            !current.contents.equals(retained.contents)
        ) {
            throw new Error('bootstrap apply lock changed');
        }
        releaseApplyLock(current);
        lock = acquireApplyLock(attemptRoot, attemptId, recovery);
        releaseApplyLock(recovery);
        return lock;
    } catch (error) {
        if (lock !== null) releaseDurableApplyLock(lock);
        releaseDurableApplyLock(recovery);
        throw error;
    }
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

function releaseDurableApplyLock(lock) {
    try {
        releaseApplyLock(lock);
        return true;
    } catch {
        return false;
    }
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

function readCandidateOutput(attemptRoot, candidate, output, candidatePath) {
    if (
        typeof candidatePath !== 'string' ||
        !candidatePath.startsWith('candidate/') ||
        path.posix.normalize(candidatePath) !== candidatePath
    ) {
        throw new Error('bootstrap candidate path is invalid');
    }
    const candidateRelative = candidatePath.slice('candidate/'.length);
    const parent = path.posix.dirname(candidateRelative);
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
        const filePath = path.join(directory.anchor, path.posix.basename(candidateRelative));
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

function expectedProjectInventory(outputs) {
    const entries = new Map();
    for (const output of outputs) {
        const segments = output.path.split('/');
        for (let index = 1; index < segments.length; index += 1) {
            entries.set(segments.slice(0, index).join('/'), 'directory');
        }
        entries.set(output.path, output.kind);
    }
    return [...entries]
        .map(([entryPath, kind]) => ({path: entryPath, kind}))
        .sort((left, right) => left.path.localeCompare(right.path));
}

function actualProjectInventory(projectRoot, project, allowRepository = false) {
    const entries = [];
    const visit = (relativeRoot, directory) => {
        for (const name of fs.readdirSync(directory.anchor).sort()) {
            if (
                relativeRoot === '' &&
                (name === '.pi' || (allowRepository && name === '.git'))
            ) continue;
            const relativePath = relativeRoot === '' ? name : `${relativeRoot}/${name}`;
            const stat = fs.lstatSync(path.join(directory.anchor, name));
            if (stat.isSymbolicLink()) throw new Error('durable bootstrap project contains a symlink');
            if (stat.isDirectory()) {
                entries.push({path: relativePath, kind: 'directory'});
                const child = holdDirectory(
                    projectRoot,
                    path.join(projectRoot, ...relativePath.split('/'))
                );
                try {
                    visit(relativePath, child);
                    child.assertCurrent();
                } finally {
                    child.close();
                }
            } else if (stat.isFile()) {
                entries.push({path: relativePath, kind: 'file'});
            } else {
                throw new Error('durable bootstrap project contains an unsupported entry');
            }
        }
    };
    visit('', project);
    return entries.sort((left, right) => left.path.localeCompare(right.path));
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

function validateDurableProject({
    projectRoot,
    coreRoot,
    attemptId,
    planDigest,
    journal,
    allowRepository = false,
    allowUntracked = false,
}) {
    const plan = validateBootstrapProjectPlan({
        projectRoot,
        coreRoot,
        attemptId,
        planDigest,
        allowAppliedProject: true,
    });
    if (
        !(
            journal.phase === 'DURABLE' ||
            (allowRepository && journal.phase === 'POST_APPLICATION')
        ) ||
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
        const expectedInventory = expectedProjectInventory(plan.outputs);
        const actualInventory = actualProjectInventory(projectRoot, project, allowRepository);
        if (!allowUntracked && JSON.stringify(actualInventory) !== JSON.stringify(expectedInventory)) {
            throw new Error('durable bootstrap project inventory changed');
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

function validProviderResumePhase(value) {
    return typeof value === 'string' &&
        /^PROVIDER_(?:EFFECT|VERIFICATION):[a-z0-9][a-z0-9-]*$/.test(value);
}

function postDurableFailureReport(attemptId, planDigest, inventoryDigest, resumePhase, checks) {
    return Object.freeze({
        status: 'NO-GO',
        disposition: 'PROJECT_DURABLE',
        checks: Object.freeze(checks.map((check) => Object.freeze({...check}))),
        data: Object.freeze({
            attempt: Object.freeze({id: attemptId}),
            planDigest,
            appliedInventoryDigest: inventoryDigest,
            resumePhase,
        }),
    });
}

function runPostDurableAdapterEffects({
    projectRoot,
    attemptId,
    planDigest,
    inventoryDigest,
    journal,
    adapter,
    run,
}) {
    let current = journal;
    const installed = adapter.handler.installBootstrapDependencies({
        contract: adapter.contract,
        projectRoot,
        run,
        resumePhase: current.resumePhase,
    });
    if (installed?.status !== 'GO' || !Array.isArray(installed.checks)) {
        const resumePhase = validProviderResumePhase(installed?.data?.resumePhase)
            ? installed.data.resumePhase
            : 'BOOTSTRAP_DEPENDENCIES';
        transitionBootstrapJournal({
            projectRoot,
            attemptId,
            expectedPhase: 'DURABLE',
            next: {...current, resumePhase},
        });
        return postDurableFailureReport(
            attemptId,
            planDigest,
            inventoryDigest,
            resumePhase,
            installed?.checks ?? [{
                id: 'bootstrap-dependencies',
                status: 'FAIL',
                message: 'bootstrap dependency installation failed',
            }]
        );
    }
    current = transitionBootstrapJournal({
        projectRoot,
        attemptId,
        expectedPhase: 'DURABLE',
        next: {...current, resumePhase: 'BOOTSTRAP_VERIFICATION'},
    });
    const verified = adapter.handler.verifyBootstrapProject({
        contract: adapter.contract,
        projectRoot,
        report: adapter.report,
        run,
    });
    if (verified?.status !== 'GO' || !Array.isArray(verified.checks)) {
        const failedCheck = verified?.checks?.find(({status}) => status === 'FAIL');
        const candidateResumePhase = `PROVIDER_VERIFICATION:${failedCheck?.id ?? ''}`;
        const resumePhase = validProviderResumePhase(candidateResumePhase)
            ? candidateResumePhase
            : 'BOOTSTRAP_VERIFICATION';
        transitionBootstrapJournal({
            projectRoot,
            attemptId,
            expectedPhase: 'DURABLE',
            next: {...current, resumePhase},
        });
        return postDurableFailureReport(
            attemptId,
            planDigest,
            inventoryDigest,
            resumePhase,
            verified?.checks ?? [{
                id: 'bootstrap-provider-verification',
                status: 'FAIL',
                message: 'bootstrap provider verification failed',
            }]
        );
    }
    transitionBootstrapJournal({
        projectRoot,
        attemptId,
        expectedPhase: 'DURABLE',
        next: {...current, resumePhase: 'REPOSITORY_BOOTSTRAP'},
    });
    return Object.freeze({
        status: 'GO',
        disposition: 'PROJECT_DURABLE',
        checks: Object.freeze([
            ...installed.checks.map((check) => Object.freeze({...check})),
            ...verified.checks.map((check) => Object.freeze({...check})),
        ]),
        data: Object.freeze({
            attempt: Object.freeze({id: attemptId}),
            planDigest,
            appliedInventoryDigest: inventoryDigest,
            resumePhase: 'REPOSITORY_BOOTSTRAP',
        }),
    });
}

function durableProjectReport(
    attemptId,
    planDigest,
    inventoryDigest,
    resumePhase = 'REPOSITORY_BOOTSTRAP'
) {
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
            resumePhase,
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
    run,
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
        const lock = acquireDurableApplyLock(attemptRoot, attemptId);
        try {
            const durable = validateDurableProject({
                projectRoot,
                coreRoot,
                attemptId,
                planDigest,
                journal,
                allowUntracked: journal.adapter !== null,
            });
            if (
                journal.adapter !== null &&
                journal.resumePhase !== 'REPOSITORY_BOOTSTRAP'
            ) {
                return runPostDurableAdapterEffects({
                    projectRoot,
                    attemptId,
                    planDigest,
                    inventoryDigest: durable.appliedInventoryDigest,
                    journal,
                    adapter: durable.plan.data.adapter,
                    run,
                });
            }
            return durableProjectReport(attemptId, planDigest, durable.appliedInventoryDigest);
        } catch (error) {
            markRecoveryRequired(projectRoot, attemptId, journal);
            throw error;
        } finally {
            releaseDurableApplyLock(lock);
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
            const candidateOutput = plan.data.candidates[index];
            if (
                candidateOutput?.path !== output.path ||
                JSON.stringify(candidateOutput.provider) !== JSON.stringify(output.provider)
            ) {
                throw new Error('bootstrap candidate inventory is stale');
            }
            const contents = readCandidateOutput(
                attemptRoot,
                candidate,
                output,
                candidateOutput.candidatePath
            );
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
                next: {
                    ...current,
                    applied: [...applied],
                    createdDirectories: [...createdDirectories],
                },
            });
            fault({name: 'after-output', index, output: output.path});
        }
        project.assertCurrent();
        project.sync();
        fault({name: 'before-durable'});
        const inventoryDigest = appliedInventoryDigest(applied);
        current = transitionBootstrapJournal({
            projectRoot,
            attemptId,
            expectedPhase: 'APPLYING',
            next: {
                ...current,
                phase: 'DURABLE',
                resumePhase: plan.adapter === null
                    ? 'REPOSITORY_BOOTSTRAP'
                    : 'BOOTSTRAP_DEPENDENCIES',
                applied: [...applied],
                appliedInventoryDigest: inventoryDigest,
            },
        });
        project.close();
        project = undefined;
        try {
            fault({name: 'after-durable'});
        } catch {
            releaseDurableApplyLock(lock);
            return postDurableFailureReport(
                attemptId,
                planDigest,
                inventoryDigest,
                current.resumePhase,
                [{
                    id: 'bootstrap-post-application',
                    status: 'FAIL',
                    message: 'bootstrap post-application operation failed',
                }]
            );
        }
        if (plan.data.adapter !== null) {
            try {
                return runPostDurableAdapterEffects({
                    projectRoot,
                    attemptId,
                    planDigest,
                    inventoryDigest,
                    journal: current,
                    adapter: plan.data.adapter,
                    run,
                });
            } finally {
                releaseDurableApplyLock(lock);
            }
        }
        releaseDurableApplyLock(lock);
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
        removePreparedAttempt(projectRoot, attemptId, journal.adapter);
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

function recoverApplyingBootstrapProject({
    projectRoot,
    coreRoot,
    attemptId,
    planDigest,
    journal,
}) {
    const attemptRoot = path.join(projectRoot, '.pi', 'prism-tool', 'bootstrap', attemptId);
    let project;
    try {
        const plan = validateBootstrapProjectPlan({
            projectRoot,
            coreRoot,
            attemptId,
            planDigest,
            allowAppliedProject: true,
        });
        const expectedApplied = plan.outputs.slice(0, journal.applied.length)
            .map(({path: outputPath, kind, mode, sha256: digest}) => ({
                path: outputPath,
                kind,
                mode,
                sha256: digest,
            }));
        const actualApplied = journal.applied
            .map(({path: outputPath, kind, mode, sha256: digest}) => ({
                path: outputPath,
                kind,
                mode,
                sha256: digest,
            }));
        if (JSON.stringify(actualApplied) !== JSON.stringify(expectedApplied)) {
            throw new Error('applying bootstrap inventory is stale');
        }
        const expectedDirectories = expectedProjectInventory(plan.outputs.slice(0, journal.applied.length))
            .filter(({kind}) => kind === 'directory')
            .map(({path: directoryPath}) => directoryPath);
        const actualDirectories = journal.createdDirectories.map(({path: directoryPath}) => directoryPath)
            .sort((left, right) => left.localeCompare(right));
        if (JSON.stringify(actualDirectories) !== JSON.stringify(expectedDirectories)) {
            throw new Error('applying bootstrap directory inventory is stale');
        }
        const lock = readApplyLock(attemptRoot, attemptId);
        project = holdDirectory(projectRoot, projectRoot);
        rollbackAppliedOutputs(projectRoot, project, journal.applied);
        rollbackCreatedDirectories(projectRoot, project, journal.createdDirectories);
        project.assertCurrent();
        project.sync();
        project.close();
        project = undefined;
        releaseApplyLock(lock);
        removePreparedAttempt(projectRoot, attemptId, journal.adapter);
        return rootRestoredReport(attemptId);
    } catch (error) {
        if (project !== undefined) project.close();
        markRecoveryRequired(projectRoot, attemptId, journal);
        throw error;
    }
}

function recoverBootstrapProject({projectRoot: requestedRoot, coreRoot, attemptId, planDigest}) {
    const projectRoot = fs.realpathSync(requestedRoot);
    const journal = readBootstrapJournal({projectRoot, attemptId});
    if (journal.planDigest !== planDigest) throw new Error('bootstrap journal is stale');
    if (journal.status === 'RECOVERY_REQUIRED') {
        throw new Error('bootstrap project recovery requires manual action');
    }
    if (journal.phase === 'APPLYING') {
        return recoverApplyingBootstrapProject({
            projectRoot,
            coreRoot,
            attemptId,
            planDigest,
            journal,
        });
    }
    if (journal.phase === 'DURABLE') {
        try {
            const durable = validateDurableProject({
                projectRoot,
                coreRoot,
                attemptId,
                planDigest,
                journal,
                allowUntracked: journal.adapter !== null,
            });
            return durableProjectReport(
                attemptId,
                planDigest,
                durable.appliedInventoryDigest,
                journal.resumePhase
            );
        } catch (error) {
            markRecoveryRequired(projectRoot, attemptId, journal);
            throw error;
        }
    }
    try {
        validateBootstrapProjectPlan({projectRoot, coreRoot, attemptId, planDigest});
        removePreparedAttempt(projectRoot, attemptId, journal.adapter);
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

function validateDurableBootstrapProject({
    projectRoot: requestedRoot,
    coreRoot,
    attemptId,
    planDigest,
    allowRepository = false,
    allowUntracked = false,
}) {
    const projectRoot = fs.realpathSync(requestedRoot);
    const journal = readBootstrapJournal({projectRoot, attemptId});
    return validateDurableProject({
        projectRoot,
        coreRoot,
        attemptId,
        planDigest,
        journal,
        allowRepository,
        allowUntracked,
    });
}

module.exports = {
    applyBootstrapProject,
    recoverBootstrapProject,
    validateDurableBootstrapProject,
};

// vim: ft=javascript sts=4 sw=4 ts=4 et :
