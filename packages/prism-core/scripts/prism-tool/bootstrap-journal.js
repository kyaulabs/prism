// $KYAULabs: bootstrap-journal.js kyau@aura.kyaulabs 2026/08/25 -0700 Exp $

'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const {blankBootstrapSource, validateBootstrapSource} = require('./bootstrap-source');

const ATTEMPT_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const SHA256 = /^[0-9a-f]{64}$/;
const MAX_JOURNAL_BYTES = 1048576;

function isRecord(value) {
    return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function hasExactKeys(value, expected) {
    const actual = Object.keys(value).sort();
    const sorted = [...expected].sort();
    return actual.length === sorted.length && actual.every((key, index) => key === sorted[index]);
}

function journalPath(projectRoot, attemptId) {
    if (!ATTEMPT_ID.test(attemptId)) throw new Error('bootstrap attempt ID is invalid');
    return path.join(projectRoot, '.pi', 'prism-tool', 'bootstrap', attemptId, 'journal.json');
}

function readBoundedDescriptor(descriptor, size) {
    if (!Number.isSafeInteger(size) || size < 0 || size > MAX_JOURNAL_BYTES) {
        throw new Error('bootstrap journal is invalid');
    }
    const contents = Buffer.alloc(size);
    let offset = 0;
    while (offset < size) {
        const count = fs.readSync(descriptor, contents, offset, size - offset, offset);
        if (count === 0) break;
        offset += count;
    }
    if (offset !== size) throw new Error('bootstrap journal changed');
    return contents;
}

function sameFile(left, right) {
    return left.dev === right.dev && left.ino === right.ino;
}

function holdBootstrapAttemptDirectory({projectRoot: requestedRoot, attemptId}) {
    if (
        typeof fs.constants.O_DIRECTORY !== 'number' ||
        typeof fs.constants.O_NOFOLLOW !== 'number'
    ) {
        throw new Error('safe filesystem flags are unavailable');
    }
    const projectRoot = fs.realpathSync(requestedRoot);
    const attemptRoot = path.dirname(journalPath(projectRoot, attemptId));
    const initial = fs.lstatSync(attemptRoot);
    if (
        initial.isSymbolicLink() ||
        !initial.isDirectory() ||
        (initial.mode & 0o777) !== 0o700
    ) {
        throw new Error('bootstrap attempt directory is invalid');
    }
    const descriptor = fs.openSync(
        attemptRoot,
        fs.constants.O_RDONLY | fs.constants.O_DIRECTORY | fs.constants.O_NOFOLLOW
    );
    try {
        const held = fs.fstatSync(descriptor);
        if (!sameFile(initial, held)) throw new Error('bootstrap attempt directory changed');
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
            throw new Error('bootstrap attempt directory cannot be held safely');
        }
        const directory = {
            anchor,
            assertCurrent() {
                const current = fs.lstatSync(attemptRoot);
                if (
                    current.isSymbolicLink() ||
                    !current.isDirectory() ||
                    !sameFile(current, held) ||
                    !sameFile(fs.statSync(anchor), held)
                ) {
                    throw new Error('bootstrap attempt directory changed');
                }
            },
            close() {
                fs.closeSync(descriptor);
            },
            readJournal() {
                const journal = readBootstrapJournalAt({
                    projectRoot,
                    attemptId,
                    attemptRoot: anchor,
                });
                directory.assertCurrent();
                return journal;
            },
        };
        return directory;
    } catch (error) {
        fs.closeSync(descriptor);
        throw error;
    }
}

function validAdapter(value) {
    return value === null || (
        isRecord(value) &&
        hasExactKeys(value, ['id', 'packageName', 'packageVersion', 'bootstrapProtocol']) &&
        typeof value.id === 'string' &&
        value.id.length > 0 &&
        typeof value.packageName === 'string' &&
        value.packageName.length > 0 &&
        typeof value.packageVersion === 'string' &&
        value.packageVersion.length > 0 &&
        Number.isSafeInteger(value.bootstrapProtocol) &&
        value.bootstrapProtocol > 0
    );
}

function preparedJournal({projectRoot, attemptId, planDigest, plan}) {
    try {
        validateBootstrapSource(plan?.source);
    } catch {
        throw new Error('bootstrap journal input is invalid');
    }
    if (
        typeof projectRoot !== 'string' ||
        !ATTEMPT_ID.test(attemptId) ||
        !SHA256.test(planDigest) ||
        !isRecord(plan) ||
        !SHA256.test(plan.sourceDigest) ||
        !SHA256.test(plan.metadataDigest) ||
        !validAdapter(plan.adapter)
    ) {
        throw new Error('bootstrap journal input is invalid');
    }
    return {
        schemaVersion: 1,
        attemptId,
        projectRoot,
        planDigest,
        sourceDigest: plan.sourceDigest,
        metadataDigest: plan.metadataDigest,
        source: plan.source,
        adapter: plan.adapter,
        phase: 'PREPARED',
        status: 'ACTIVE',
        reason: null,
        resumePhase: 'PROJECT_APPLICATION',
        applied: [],
        createdDirectories: [],
        appliedInventoryDigest: null,
        repository: null,
        hooks: null,
        seed: null,
    };
}

function validJournalPath(value) {
    return typeof value === 'string' &&
        value !== '' &&
        !path.posix.isAbsolute(value) &&
        path.posix.normalize(value) === value &&
        value.split('/').every((segment) => segment !== '' && segment !== '.' && segment !== '..');
}

function validAppliedEntry(value) {
    return isRecord(value) &&
        hasExactKeys(value, ['path', 'kind', 'mode', 'sha256', 'dev', 'ino']) &&
        validJournalPath(value.path) &&
        value.kind === 'file' &&
        Number.isSafeInteger(value.mode) &&
        value.mode >= 0 &&
        value.mode <= 0o777 &&
        SHA256.test(value.sha256) &&
        Number.isSafeInteger(value.dev) &&
        value.dev >= 0 &&
        Number.isSafeInteger(value.ino) &&
        value.ino > 0;
}

function validCreatedDirectory(value) {
    return isRecord(value) &&
        hasExactKeys(value, ['path', 'dev', 'ino']) &&
        validJournalPath(value.path) &&
        Number.isSafeInteger(value.dev) &&
        value.dev >= 0 &&
        Number.isSafeInteger(value.ino) &&
        value.ino > 0;
}

function validRepositoryEvidence(value) {
    return isRecord(value) &&
        hasExactKeys(value, [
            'disposition', 'gitDirectory', 'branch', 'objectFormat', 'refFormat',
            'configDigest',
        ]) &&
        value.disposition === 'CREATE' &&
        isRecord(value.gitDirectory) &&
        hasExactKeys(value.gitDirectory, ['dev', 'ino']) &&
        Number.isSafeInteger(value.gitDirectory.dev) &&
        value.gitDirectory.dev >= 0 &&
        Number.isSafeInteger(value.gitDirectory.ino) &&
        value.gitDirectory.ino > 0 &&
        value.branch === 'develop' &&
        value.objectFormat === 'sha1' &&
        value.refFormat === 'files' &&
        SHA256.test(value.configDigest);
}

function validHookEvidence(value) {
    return isRecord(value) &&
        hasExactKeys(value, ['disposition', 'hooksPath', 'inventoryDigest']) &&
        value.disposition === 'ACTIVE' &&
        value.hooksPath === '.github/hooks' &&
        SHA256.test(value.inventoryDigest);
}

function validSeedEvidence(value) {
    if (!isRecord(value)) return false;
    if (
        hasExactKeys(value, ['status', 'attestationDigest', 'stagedIndexDigest']) &&
        value.status === 'READY'
    ) {
        return SHA256.test(value.attestationDigest) && SHA256.test(value.stagedIndexDigest);
    }
    return hasExactKeys(value, [
        'status', 'attestationDigest', 'stagedIndexDigest', 'rootCommit',
    ]) &&
        value.status === 'CONSUMED' &&
        SHA256.test(value.attestationDigest) &&
        SHA256.test(value.stagedIndexDigest) &&
        /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/.test(value.rootCommit);
}

function validJournalState(value) {
    const noPostApplicationEvidence = value.repository === null &&
        value.hooks === null && value.seed === null;
    if (
        value.phase === 'PREPARED' &&
        value.applied.length === 0 &&
        value.createdDirectories.length === 0 &&
        value.appliedInventoryDigest === null &&
        noPostApplicationEvidence
    ) {
        return (
            value.status === 'ACTIVE' &&
            value.reason === null &&
            value.resumePhase === 'PROJECT_APPLICATION'
        ) || (
            value.status === 'RECOVERY_REQUIRED' &&
            value.reason === 'ROOT_STATE_CHANGED' &&
            value.resumePhase === 'MANUAL_RECOVERY'
        );
    }
    if (
        value.phase === 'APPLYING' &&
        value.appliedInventoryDigest === null &&
        noPostApplicationEvidence
    ) {
        return (
            value.status === 'ACTIVE' &&
            value.reason === null &&
            value.resumePhase === 'PROJECT_APPLICATION'
        ) || (
            value.status === 'RECOVERY_REQUIRED' &&
            value.reason === 'AMBIGUOUS_PROJECT_STATE' &&
            value.resumePhase === 'MANUAL_RECOVERY'
        );
    }
    if (
        value.phase === 'DURABLE' &&
        value.applied.length > 0 &&
        SHA256.test(value.appliedInventoryDigest) &&
        noPostApplicationEvidence
    ) {
        return (
            value.status === 'ACTIVE' &&
            value.reason === null &&
            (
                ['BOOTSTRAP_DEPENDENCIES', 'BOOTSTRAP_VERIFICATION', 'REPOSITORY_BOOTSTRAP']
                    .includes(value.resumePhase) ||
                (
                    value.adapter !== null &&
                    typeof value.resumePhase === 'string' &&
                    /^PROVIDER_(?:EFFECT|VERIFICATION):[a-z0-9][a-z0-9-]*$/.test(value.resumePhase)
                )
            )
        ) || (
            value.status === 'RECOVERY_REQUIRED' &&
            value.reason === 'AMBIGUOUS_PROJECT_STATE' &&
            value.resumePhase === 'MANUAL_RECOVERY'
        );
    }
    if (
        value.phase === 'POST_APPLICATION' &&
        value.status === 'ACTIVE' &&
        value.reason === null &&
        value.resumePhase === 'REPOSITORY_CREATION' &&
        value.applied.length > 0 &&
        SHA256.test(value.appliedInventoryDigest) &&
        noPostApplicationEvidence
    ) {
        return true;
    }
    if (
        value.phase === 'COMPLETE' &&
        value.status === 'COMPLETE' &&
        value.reason === null &&
        value.resumePhase === null &&
        value.applied.length > 0 &&
        SHA256.test(value.appliedInventoryDigest) &&
        validRepositoryEvidence(value.repository) &&
        validHookEvidence(value.hooks) &&
        validSeedEvidence(value.seed) &&
        value.seed.status === 'CONSUMED'
    ) {
        return true;
    }
    if (
        value.phase !== 'POST_APPLICATION' ||
        value.status !== 'ACTIVE' ||
        value.reason !== null ||
        value.applied.length === 0 ||
        !SHA256.test(value.appliedInventoryDigest) ||
        !validRepositoryEvidence(value.repository)
    ) {
        return false;
    }
    return (
        value.resumePhase === 'HOOK_ACTIVATION' &&
        value.hooks === null &&
        value.seed === null
    ) || (
        value.resumePhase === 'ROOT_SEED_PREPARATION' &&
        validHookEvidence(value.hooks) &&
        value.seed === null
    ) || (
        value.resumePhase === 'ROOT_SEED_COMMIT' &&
        validHookEvidence(value.hooks) &&
        validSeedEvidence(value.seed)
    );
}

function normalizeLegacyJournal(value) {
    const legacyKeys = [
        'schemaVersion', 'attemptId', 'projectRoot', 'planDigest', 'metadataDigest',
        'source', 'adapter', 'phase', 'status', 'reason', 'resumePhase', 'applied',
        'createdDirectories', 'appliedInventoryDigest',
    ];
    const sourceBoundLegacyKeys = [...legacyKeys, 'sourceDigest'];
    if (
        !isRecord(value) ||
        value.schemaVersion !== 1 ||
        !['PREPARED', 'APPLYING', 'DURABLE'].includes(value.phase) ||
        (!hasExactKeys(value, legacyKeys) && !hasExactKeys(value, sourceBoundLegacyKeys))
    ) {
        return value;
    }
    let sourceDigest = value.sourceDigest;
    if (sourceDigest === undefined) {
        if (
            !isRecord(value.source) ||
            !hasExactKeys(value.source, ['mode', 'evidence']) ||
            value.source.mode !== 'BLANK' ||
            value.source.evidence !== null
        ) {
            return value;
        }
        const sourceState = blankBootstrapSource();
        sourceDigest = crypto.createHash('sha256').update(
            `${JSON.stringify(sourceState, null, 2)}\n`
        ).digest('hex');
    }
    return {...value, sourceDigest, repository: null, hooks: null, seed: null};
}

function validateJournal(input, projectRoot, attemptId) {
    const value = normalizeLegacyJournal(input);
    try {
        validateBootstrapSource(value?.source);
    } catch {
        throw new Error('bootstrap journal is invalid');
    }
    if (
        !isRecord(value) ||
        !hasExactKeys(value, [
            'schemaVersion', 'attemptId', 'projectRoot', 'planDigest', 'sourceDigest', 'metadataDigest',
            'source', 'adapter', 'phase', 'status', 'reason', 'resumePhase', 'applied',
            'createdDirectories', 'appliedInventoryDigest', 'repository', 'hooks', 'seed',
        ]) ||
        value.schemaVersion !== 1 ||
        value.attemptId !== attemptId ||
        value.projectRoot !== projectRoot ||
        !SHA256.test(value.planDigest) ||
        !SHA256.test(value.sourceDigest) ||
        !SHA256.test(value.metadataDigest) ||
        !validAdapter(value.adapter) ||
        !Array.isArray(value.applied) ||
        value.applied.length > 1024 ||
        value.applied.some((entry) => !validAppliedEntry(entry)) ||
        !Array.isArray(value.createdDirectories) ||
        value.createdDirectories.length > 1024 ||
        value.createdDirectories.some((entry) => !validCreatedDirectory(entry)) ||
        !validJournalState(value)
    ) {
        throw new Error('bootstrap journal is invalid');
    }
    return Object.freeze(value);
}

function readBootstrapJournalAt({projectRoot, attemptId, attemptRoot}) {
    const filePath = path.join(attemptRoot, 'journal.json');
    const initial = fs.lstatSync(filePath);
    if (
        initial.isSymbolicLink() ||
        !initial.isFile() ||
        (initial.mode & 0o777) !== 0o600 ||
        initial.size > MAX_JOURNAL_BYTES
    ) {
        throw new Error('bootstrap journal is invalid');
    }
    const descriptor = fs.openSync(filePath, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW);
    try {
        const held = fs.fstatSync(descriptor);
        if (
            !held.isFile() ||
            held.dev !== initial.dev ||
            held.ino !== initial.ino ||
            held.size !== initial.size ||
            (held.mode & 0o777) !== 0o600
        ) {
            throw new Error('bootstrap journal changed');
        }
        const contents = readBoundedDescriptor(descriptor, held.size);
        const final = fs.fstatSync(descriptor);
        if (final.dev !== held.dev || final.ino !== held.ino || final.size !== held.size) {
            throw new Error('bootstrap journal changed');
        }
        return validateJournal(JSON.parse(contents.toString('utf8')), projectRoot, attemptId);
    } finally {
        fs.closeSync(descriptor);
    }
}

function readBootstrapJournal({projectRoot, attemptId}) {
    const directory = holdBootstrapAttemptDirectory({projectRoot, attemptId});
    try {
        return directory.readJournal();
    } finally {
        directory.close();
    }
}

function transitionBootstrapJournal({
    projectRoot: requestedRoot,
    attemptId,
    expectedPhase,
    next,
}) {
    const projectRoot = fs.realpathSync(requestedRoot);
    const current = readBootstrapJournal({projectRoot, attemptId});
    if (current.phase !== expectedPhase) throw new Error('bootstrap journal phase changed');
    const value = validateJournal(next, projectRoot, attemptId);
    const filePath = journalPath(projectRoot, attemptId);
    const temporaryPath = path.join(path.dirname(filePath), 'journal.next');
    const original = fs.lstatSync(filePath);
    const contents = Buffer.from(`${JSON.stringify(value, null, 2)}\n`, 'utf8');
    try {
        fs.writeFileSync(temporaryPath, contents, {flag: 'wx', mode: 0o600});
        fs.chmodSync(temporaryPath, 0o600);
        const descriptor = fs.openSync(
            temporaryPath,
            fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW
        );
        try {
            fs.fsyncSync(descriptor);
        } finally {
            fs.closeSync(descriptor);
        }
        const latest = fs.lstatSync(filePath);
        if (
            latest.isSymbolicLink() ||
            latest.dev !== original.dev ||
            latest.ino !== original.ino ||
            (latest.mode & 0o777) !== 0o600
        ) {
            throw new Error('bootstrap journal changed');
        }
        fs.renameSync(temporaryPath, filePath);
        const directory = fs.openSync(
            path.dirname(filePath),
            fs.constants.O_RDONLY | fs.constants.O_DIRECTORY
        );
        try {
            fs.fsyncSync(directory);
        } finally {
            fs.closeSync(directory);
        }
    } catch (error) {
        fs.rmSync(temporaryPath, {force: true});
        throw error;
    }
    return readBootstrapJournal({projectRoot, attemptId});
}

function createPreparedBootstrapJournal({projectRoot: requestedRoot, attemptId, planDigest, plan}) {
    const projectRoot = fs.realpathSync(requestedRoot);
    const filePath = journalPath(projectRoot, attemptId);
    const contents = Buffer.from(`${JSON.stringify(
        preparedJournal({projectRoot, attemptId, planDigest, plan}),
        null,
        2
    )}\n`, 'utf8');
    if (contents.length > MAX_JOURNAL_BYTES) throw new Error('bootstrap journal is too large');
    fs.writeFileSync(filePath, contents, {flag: 'wx', mode: 0o600});
    fs.chmodSync(filePath, 0o600);
    const descriptor = fs.openSync(filePath, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW);
    try {
        const stat = fs.fstatSync(descriptor);
        if (!stat.isFile() || (stat.mode & 0o777) !== 0o600 || stat.size !== contents.length) {
            throw new Error('bootstrap journal is invalid');
        }
        const actual = readBoundedDescriptor(descriptor, contents.length);
        if (!actual.equals(contents)) throw new Error('bootstrap journal changed');
        fs.fsyncSync(descriptor);
    } finally {
        fs.closeSync(descriptor);
    }
    const directory = fs.openSync(path.dirname(filePath), fs.constants.O_RDONLY | fs.constants.O_DIRECTORY);
    try {
        fs.fsyncSync(directory);
    } finally {
        fs.closeSync(directory);
    }
    return Object.freeze(JSON.parse(contents.toString('utf8')));
}

module.exports = {
    createPreparedBootstrapJournal,
    holdBootstrapAttemptDirectory,
    readBootstrapJournal,
    transitionBootstrapJournal,
};

// vim: ft=javascript sts=4 sw=4 ts=4 et :
