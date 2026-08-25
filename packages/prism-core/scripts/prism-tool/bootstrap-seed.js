// $KYAULabs: bootstrap-seed.js kyau@aura.kyaulabs 2026/08/24 -0700 Exp $

'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const {loadActiveBootstrapAdapter} = require('./bootstrap-adapter');
const {inspectBootstrapHooks} = require('./bootstrap-hooks');
const {readBootstrapJournal, transitionBootstrapJournal} = require('./bootstrap-journal');
const {runBounded} = require('./process');
const {validateDurableBootstrapProject} = require('./bootstrap-transaction');

const MAX_ATTESTATION_BYTES = 1048576;

function exactKeys(value, expected) {
    if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
    const actual = Object.keys(value).sort();
    const wanted = [...expected].sort();
    return actual.length === wanted.length && actual.every((key, index) => key === wanted[index]);
}

function sha256(value) {
    return crypto.createHash('sha256').update(value).digest('hex');
}

function output(result) {
    return Buffer.isBuffer(result.stdout) ? result.stdout : Buffer.from(result.stdout ?? '', 'utf8');
}

function invoke(runGit, projectRoot, env, args, options = {}) {
    return runGit('git', args, {cwd: projectRoot, env, ...options});
}

function requireSuccess(result, message) {
    if (result.error || result.status !== 0) throw new Error(message);
    return output(result);
}

function seedEntries(plan) {
    return plan.activation === null
        ? plan.outputs
        : [...plan.outputs, plan.activation];
}

function stagedInventory(projectRoot, plan, runGit, env) {
    const listing = requireSuccess(
        invoke(runGit, projectRoot, env, ['ls-files', '--stage', '-z']),
        'staged index inspection failed'
    ).toString('utf8').split('\0').filter(Boolean);
    const entries = seedEntries(plan);
    if (listing.length !== entries.length) throw new Error('staged index inventory is invalid');
    const expected = new Map(entries.map((entry) => [entry.path, entry]));
    const records = [];
    for (const line of listing) {
        const match = /^(100644|100755) ([0-9a-f]{40}|[0-9a-f]{64}) 0\t(.+)$/.exec(line);
        if (!match || !expected.has(match[3])) throw new Error('staged index entry is invalid');
        const planEntry = expected.get(match[3]);
        const gitMode = planEntry.mode === 0o755 ? '100755' : '100644';
        const contents = requireSuccess(
            invoke(runGit, projectRoot, env, ['show', `:${match[3]}`], {encoding: null}),
            'staged blob inspection failed'
        );
        if (match[1] !== gitMode || sha256(contents) !== planEntry.sha256) {
            throw new Error('staged index content changed');
        }
        records.push(Object.freeze({path: match[3], gitMode, sha256: planEntry.sha256}));
        expected.delete(match[3]);
    }
    if (expected.size !== 0) throw new Error('staged index inventory is incomplete');
    records.sort((left, right) => left.path < right.path ? -1 : left.path > right.path ? 1 : 0);
    return Object.freeze({
        records: Object.freeze(records),
        digest: sha256(Buffer.from(JSON.stringify(records))),
    });
}

function emptyIndex(projectRoot, runGit, env) {
    const result = invoke(runGit, projectRoot, env, ['ls-files', '--stage', '-z']);
    if (result.error || result.status !== 0 || output(result).length !== 0) {
        throw new Error('bootstrap seed requires an empty index');
    }
    const lock = fs.lstatSync(path.join(projectRoot, '.git', 'index.lock'), {throwIfNoEntry: false});
    if (lock !== undefined) throw new Error('Git index is locked');
}

function adapterQuality(projectRoot, coreRoot, plan, runTool) {
    if (plan.adapter === null) return null;
    const active = loadActiveBootstrapAdapter({
        projectRoot,
        coreRoot,
        identity: plan.adapter,
    });
    const result = active.handler.runBootstrapQuality({
        projectRoot,
        contract: active.registration.contract,
        run: runTool,
    });
    if (result?.status !== 'GO') throw new Error('adapter shared quality failed');
    return result;
}

function doctor(projectRoot, coreRoot, runTool, env) {
    const launcher = path.join(coreRoot, 'scripts', 'prism-tool.js');
    const result = runTool(process.execPath, [launcher, 'doctor', '--local-only'], {
        cwd: projectRoot,
        env,
    });
    if (result.error || result.status !== 0) throw new Error('Core local readiness failed');
}

function journalDigest(journal) {
    return sha256(Buffer.from(`${JSON.stringify(journal, null, 2)}\n`));
}

function untrackedCount(projectRoot, runGit, env) {
    const status = requireSuccess(
        invoke(runGit, projectRoot, env, ['status', '--porcelain=v1', '-z', '--untracked-files=all']),
        'working tree inspection failed'
    ).toString('utf8').split('\0').filter(Boolean);
    return Math.min(status.filter((entry) => entry.startsWith('?? ')).length, 1024);
}

function writeAttestation(attestationPath, value) {
    const contents = Buffer.from(`${JSON.stringify(value, null, 2)}\n`, 'utf8');
    if (contents.length > MAX_ATTESTATION_BYTES) throw new Error('seed attestation is too large');
    fs.writeFileSync(attestationPath, contents, {flag: 'wx', mode: 0o600});
    fs.chmodSync(attestationPath, 0o600);
    const descriptor = fs.openSync(attestationPath, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW);
    try {
        const stat = fs.fstatSync(descriptor);
        const actual = fs.readFileSync(descriptor);
        if (!stat.isFile() || (stat.mode & 0o777) !== 0o600 || !actual.equals(contents)) {
            throw new Error('seed attestation publication failed');
        }
        fs.fsyncSync(descriptor);
    } finally {
        fs.closeSync(descriptor);
    }
    return Object.freeze({contents, digest: sha256(contents)});
}

function removeOwnedStaging(projectRoot, plan, runGit, env) {
    const expected = new Map(seedEntries(plan).map((entry) => [entry.path, entry]));
    const listing = requireSuccess(
        invoke(runGit, projectRoot, env, ['ls-files', '--stage', '-z']),
        'seed index rollback inspection failed'
    ).toString('utf8').split('\0').filter(Boolean);
    if (listing.length === 0) return;
    const paths = [];
    for (const line of listing) {
        const match = /^(100644|100755) ([0-9a-f]{40}|[0-9a-f]{64}) 0\t(.+)$/.exec(line);
        if (!match || !expected.has(match[3])) return;
        const entry = expected.get(match[3]);
        const mode = entry.mode === 0o755 ? '100755' : '100644';
        const contents = requireSuccess(
            invoke(runGit, projectRoot, env, ['show', `:${match[3]}`], {encoding: null}),
            'seed index rollback inspection failed'
        );
        if (match[1] !== mode || sha256(contents) !== entry.sha256) return;
        paths.push(match[3]);
    }
    const result = invoke(runGit, projectRoot, env, [
        'rm', '--cached', '--quiet', '--', ...paths,
    ]);
    if (result.error || result.status !== 0) throw new Error('seed index rollback failed');
}

function prepareBootstrapSeed({
    projectRoot: requestedRoot,
    coreRoot,
    attemptId,
    planDigest,
    runGit = runBounded,
    runTool = runBounded,
    env = process.env,
    fault = () => {},
}) {
    const projectRoot = fs.realpathSync(requestedRoot);
    const journal = readBootstrapJournal({projectRoot, attemptId});
    if (
        journal.phase !== 'POST_APPLICATION' ||
        journal.status !== 'ACTIVE' ||
        journal.resumePhase !== 'ROOT_SEED_PREPARATION' ||
        journal.seed !== null
    ) {
        throw new Error('bootstrap seed is not eligible');
    }
    const durable = validateDurableBootstrapProject({
        projectRoot,
        coreRoot,
        attemptId,
        planDigest,
        allowRepository: true,
        allowUntracked: true,
    });
    const hooks = inspectBootstrapHooks({
        projectRoot,
        coreRoot,
        attemptId,
        planDigest,
        runGit,
        env,
        allowUntracked: true,
    });
    if (hooks.disposition !== 'HOOKS_ACTIVE') throw new Error('bootstrap hooks are inactive');
    emptyIndex(projectRoot, runGit, env);
    let staged;
    let published = false;
    try {
        for (const entry of seedEntries(durable.plan)) {
            requireSuccess(
                invoke(runGit, projectRoot, env, ['add', '--', entry.path]),
                'bootstrap seed staging failed'
            );
        }
        staged = stagedInventory(projectRoot, durable.plan, runGit, env);
        fault({name: 'after-staging', projectRoot});
        doctor(projectRoot, coreRoot, runTool, env);
        const adapterChecks = adapterQuality(projectRoot, coreRoot, durable.plan, runTool);
        validateDurableBootstrapProject({
            projectRoot,
            coreRoot,
            attemptId,
            planDigest,
            allowRepository: true,
            allowUntracked: true,
        });
        const finalHooks = inspectBootstrapHooks({
            projectRoot,
            coreRoot,
            attemptId,
            planDigest,
            runGit,
            env,
            allowUntracked: true,
        });
        requireSuccess(
            invoke(runGit, projectRoot, env, ['diff', '--cached', '--check']),
            'seed quality checks failed'
        );
        const finalIndex = stagedInventory(projectRoot, durable.plan, runGit, env);
        if (finalIndex.digest !== staged.digest) throw new Error('staged index changed');
        const attestation = Object.freeze({
            schemaVersion: 1,
            projectRoot,
            attemptId,
            source: durable.plan.source,
            providers: durable.plan.providers.map((provider) => Object.freeze({
                ...provider,
                reportDigest: sha256(Buffer.from(JSON.stringify({
                    provider,
                    checks: durable.plan.checks,
                    verification: durable.plan.verification,
                }))),
            })),
            metadataDigest: journal.metadataDigest,
            adapter: durable.plan.adapter === null ? null : Object.freeze({
                ...durable.plan.adapter,
                reportDigest: durable.plan.adapterReportDigest,
            }),
            planDigest,
            appliedInventoryDigest: journal.appliedInventoryDigest,
            durableJournalDigest: journalDigest(journal),
            repository: journal.repository,
            hookInventoryDigest: finalHooks.data.evidence.inventoryDigest,
            stagedIndexDigest: staged.digest,
            commit: Object.freeze({
                type: 'ignore',
                scope: null,
                subject: 'bootstrap prism project',
            }),
        });
        const attemptRoot = path.join(
            projectRoot, '.pi', 'prism-tool', 'bootstrap', attemptId
        );
        const attestationPath = path.join(attemptRoot, 'seed-attestation.json');
        const publication = writeAttestation(attestationPath, attestation);
        published = true;
        fault({name: 'after-attestation', projectRoot, attestationPath});
        const retainedAttestation = readAttestation(attestationPath);
        if (
            sha256(retainedAttestation.contents) !== publication.digest ||
            JSON.stringify(retainedAttestation.value) !== JSON.stringify(attestation)
        ) {
            throw new Error('seed attestation changed');
        }
        const finalCheck = stagedInventory(projectRoot, durable.plan, runGit, env);
        if (finalCheck.digest !== staged.digest) throw new Error('staged index changed');
        transitionBootstrapJournal({
            projectRoot,
            attemptId,
            expectedPhase: 'POST_APPLICATION',
            next: {
                ...journal,
                resumePhase: 'ROOT_SEED_COMMIT',
                seed: {
                    status: 'READY',
                    attestationDigest: publication.digest,
                    stagedIndexDigest: staged.digest,
                },
            },
        });
        return Object.freeze({
            status: 'GO',
            disposition: 'SEED_READY',
            checks: Object.freeze([
                Object.freeze({id: 'core-readiness', status: 'PASS', message: 'Core local readiness passed'}),
                Object.freeze({id: 'seed-index', status: 'PASS', message: 'exact seed index was attested'}),
                Object.freeze({id: 'bootstrap-hooks', status: 'PASS', message: 'canonical hooks are active'}),
                ...(adapterChecks === null ? [] : adapterChecks.checks.map((check) =>
                    Object.freeze({...check})
                )),
            ]),
            data: Object.freeze({
                attempt: Object.freeze({id: attemptId}),
                planDigest,
                attestationPath,
                stagedIndexDigest: staged.digest,
                untrackedCount: untrackedCount(projectRoot, runGit, env),
                commit: attestation.commit,
                resumePhase: 'ROOT_SEED_COMMIT',
            }),
        });
    } catch (error) {
        if (!published) {
            removeOwnedStaging(projectRoot, durable.plan, runGit, env);
        }
        throw error;
    }
}

function readAttestation(filePath) {
    const stat = fs.lstatSync(filePath);
    if (
        stat.isSymbolicLink() ||
        !stat.isFile() ||
        (stat.mode & 0o777) !== 0o600 ||
        stat.size > MAX_ATTESTATION_BYTES
    ) throw new Error('seed attestation is invalid');
    const descriptor = fs.openSync(filePath, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW);
    try {
        const held = fs.fstatSync(descriptor);
        const contents = fs.readFileSync(descriptor);
        const final = fs.fstatSync(descriptor);
        if (
            held.dev !== stat.dev ||
            held.ino !== stat.ino ||
            held.size !== stat.size ||
            final.dev !== held.dev ||
            final.ino !== held.ino ||
            final.size !== held.size
        ) throw new Error('seed attestation changed');
        return Object.freeze({contents, value: JSON.parse(contents.toString('utf8'))});
    } finally {
        fs.closeSync(descriptor);
    }
}

function validateActiveBootstrapSeed({
    projectRoot: requestedRoot,
    coreRoot,
    runGit = runBounded,
    env = process.env,
    allowCommittedRoot = false,
}) {
    const projectRoot = fs.realpathSync(requestedRoot);
    const bootstrapRoot = path.join(projectRoot, '.pi', 'prism-tool', 'bootstrap');
    const candidates = [];
    for (const attemptId of fs.readdirSync(bootstrapRoot)) {
        try {
            const journal = readBootstrapJournal({projectRoot, attemptId});
            if (
                journal.status === 'ACTIVE' &&
                journal.resumePhase === 'ROOT_SEED_COMMIT' &&
                journal.seed?.status === 'READY'
            ) candidates.push({attemptId, journal});
        } catch {
            continue;
        }
    }
    if (candidates.length !== 1) throw new Error('active bootstrap seed is ambiguous');
    const [{attemptId, journal}] = candidates;
    const attestationPath = path.join(bootstrapRoot, attemptId, 'seed-attestation.json');
    const attestation = readAttestation(attestationPath);
    if (sha256(attestation.contents) !== journal.seed.attestationDigest) {
        throw new Error('seed attestation changed');
    }
    const durable = validateDurableBootstrapProject({
        projectRoot,
        coreRoot,
        attemptId,
        planDigest: journal.planDigest,
        allowRepository: true,
        allowUntracked: true,
    });
    const current = stagedInventory(projectRoot, durable.plan, runGit, env);
    const hooks = inspectBootstrapHooks({
        projectRoot,
        coreRoot,
        attemptId,
        planDigest: journal.planDigest,
        runGit,
        env,
        allowUntracked: true,
        allowCommittedRoot,
    });
    const expectedProviders = durable.plan.providers.map((provider) => ({
        ...provider,
        reportDigest: sha256(Buffer.from(JSON.stringify({
            provider,
            checks: durable.plan.checks,
            verification: durable.plan.verification,
        }))),
    }));
    const predecessor = {
        ...journal,
        resumePhase: 'ROOT_SEED_PREPARATION',
        seed: null,
    };
    const expectedJournalDigest = sha256(Buffer.from(`${JSON.stringify(predecessor, null, 2)}\n`));
    const value = attestation.value;
    if (
        !exactKeys(value, [
            'schemaVersion', 'projectRoot', 'attemptId', 'source', 'providers',
            'metadataDigest', 'adapter', 'planDigest', 'appliedInventoryDigest',
            'durableJournalDigest', 'repository', 'hookInventoryDigest',
            'stagedIndexDigest', 'commit',
        ]) ||
        value.schemaVersion !== 1 ||
        current.digest !== journal.seed.stagedIndexDigest ||
        value.projectRoot !== projectRoot ||
        value.attemptId !== attemptId ||
        JSON.stringify(value.source) !== JSON.stringify(journal.source) ||
        JSON.stringify(value.providers) !== JSON.stringify(expectedProviders) ||
        value.metadataDigest !== journal.metadataDigest ||
        JSON.stringify(value.adapter) !== JSON.stringify(
            durable.plan.adapter === null ? null : {
                ...durable.plan.adapter,
                reportDigest: durable.plan.adapterReportDigest,
            }
        ) ||
        value.planDigest !== journal.planDigest ||
        value.appliedInventoryDigest !== journal.appliedInventoryDigest ||
        value.durableJournalDigest !== expectedJournalDigest ||
        JSON.stringify(value.repository) !== JSON.stringify(journal.repository) ||
        value.hookInventoryDigest !== hooks.data.evidence.inventoryDigest ||
        value.stagedIndexDigest !== current.digest ||
        JSON.stringify(value.commit) !== JSON.stringify({
            type: 'ignore', scope: null, subject: 'bootstrap prism project',
        })
    ) throw new Error('active bootstrap seed changed');
    return Object.freeze({
        projectRoot,
        attemptId,
        journal,
        attestation: attestation.value,
        attestationPath,
        stagedIndexDigest: current.digest,
    });
}

function fileDigest(filePath, expected) {
    const descriptor = fs.openSync(filePath, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW);
    try {
        const held = fs.fstatSync(descriptor);
        if (
            !held.isFile() ||
            held.dev !== expected.dev ||
            held.ino !== expected.ino ||
            held.mode !== expected.mode ||
            held.size !== expected.size
        ) throw new Error('bootstrap attempt cleanup state changed');
        const contents = fs.readFileSync(descriptor);
        const final = fs.fstatSync(descriptor);
        if (final.dev !== held.dev || final.ino !== held.ino || final.size !== held.size) {
            throw new Error('bootstrap attempt cleanup state changed');
        }
        return sha256(contents);
    } finally {
        fs.closeSync(descriptor);
    }
}

function snapshotTree(root) {
    const records = [];
    function walk(current) {
        const stat = fs.lstatSync(current);
        if (stat.isSymbolicLink() || (!stat.isDirectory() && !stat.isFile())) {
            throw new Error('bootstrap attempt cleanup state is invalid');
        }
        const directory = stat.isDirectory();
        const digest = directory ? null : fileDigest(current, stat);
        records.push({path: current, stat, directory, digest});
        if (directory) {
            for (const name of fs.readdirSync(current).sort()) walk(path.join(current, name));
        }
        if (records.length > 4096) throw new Error('bootstrap attempt cleanup state is too large');
    }
    walk(root);
    return records;
}

function removeSnapshot(records, fault) {
    for (const record of [...records].reverse()) {
        fault({name: 'before-cleanup-entry', path: record.path});
        const current = fs.lstatSync(record.path);
        if (
            current.dev !== record.stat.dev ||
            current.ino !== record.stat.ino ||
            current.mode !== record.stat.mode ||
            current.isDirectory() !== record.directory ||
            current.isSymbolicLink() ||
            (!record.directory && (
                current.size !== record.stat.size ||
                fileDigest(record.path, current) !== record.digest
            ))
        ) throw new Error('bootstrap attempt cleanup state changed');
        if (record.directory) fs.rmdirSync(record.path);
        else fs.unlinkSync(record.path);
    }
}

function removeEmptyOperationalParents(projectRoot) {
    for (const directory of [
        path.join(projectRoot, '.pi', 'prism-tool', 'bootstrap'),
        path.join(projectRoot, '.pi', 'prism-tool'),
        path.join(projectRoot, '.pi'),
    ]) {
        const stat = fs.lstatSync(directory, {throwIfNoEntry: false});
        if (stat === undefined || stat.isSymbolicLink() || !stat.isDirectory()) break;
        if (fs.readdirSync(directory).length !== 0) break;
        fs.rmdirSync(directory);
    }
}

function completeBootstrapSeed({
    projectRoot: requestedRoot,
    coreRoot,
    attestation,
    previousHead,
    newHead,
    runGit = runBounded,
    env = process.env,
    fault = () => {},
}) {
    const projectRoot = fs.realpathSync(requestedRoot);
    if (previousHead !== 'unborn' || !/^(?:[0-9a-f]{40}|[0-9a-f]{64})$/.test(newHead)) {
        throw new Error('root seed commit state is invalid');
    }
    const active = validateActiveBootstrapSeed({
        projectRoot,
        coreRoot,
        runGit,
        env,
        allowCommittedRoot: true,
    });
    if (!sameAttestation(active, attestation)) throw new Error('root seed attestation changed');
    const branch = requireSuccess(
        invoke(runGit, projectRoot, env, ['symbolic-ref', '--quiet', '--short', 'HEAD']),
        'root seed branch is invalid'
    ).toString('utf8').trim();
    const head = requireSuccess(
        invoke(runGit, projectRoot, env, ['rev-parse', '--verify', 'HEAD']),
        'root seed HEAD is invalid'
    ).toString('utf8').trim();
    const count = requireSuccess(
        invoke(runGit, projectRoot, env, ['rev-list', '--count', 'HEAD']),
        'root seed history is invalid'
    ).toString('utf8').trim();
    const parents = requireSuccess(
        invoke(runGit, projectRoot, env, ['rev-list', '--parents', '-n', '1', 'HEAD']),
        'root seed history is invalid'
    ).toString('utf8').trim().split(/\s+/);
    const remotes = requireSuccess(
        invoke(runGit, projectRoot, env, ['remote']),
        'root seed remotes are invalid'
    ).toString('utf8').trim();
    requireSuccess(
        invoke(runGit, projectRoot, env, ['verify-commit', newHead]),
        'root seed signature is invalid'
    );
    if (
        branch !== 'develop' ||
        head !== newHead ||
        count !== '1' ||
        parents.length !== 1 ||
        parents[0] !== newHead ||
        remotes !== ''
    ) throw new Error('root seed commit is invalid');
    const journal = active.journal;
    transitionBootstrapJournal({
        projectRoot,
        attemptId: active.attemptId,
        expectedPhase: 'POST_APPLICATION',
        next: {
            ...journal,
            phase: 'COMPLETE',
            status: 'COMPLETE',
            resumePhase: null,
            seed: {
                ...journal.seed,
                status: 'CONSUMED',
                rootCommit: newHead,
            },
        },
    });
    fault({name: 'after-completion', projectRoot});
    const attemptRoot = path.join(
        projectRoot, '.pi', 'prism-tool', 'bootstrap', active.attemptId
    );
    removeSnapshot(snapshotTree(attemptRoot), fault);
    removeEmptyOperationalParents(projectRoot);
    requireSuccess(
        invoke(runGit, projectRoot, env, ['diff', '--cached', '--quiet', 'HEAD', '--']),
        'root seed index is not clean'
    );
    const status = requireSuccess(
        invoke(runGit, projectRoot, env, ['status', '--porcelain=v1', '--untracked-files=all']),
        'root seed worktree is unavailable'
    ).toString('utf8').trim();
    if (status !== '') throw new Error('root seed worktree is not clean');
    return Object.freeze({status: 'COMPLETE', rootCommit: newHead});
}

function sameAttestation(left, right) {
    return left.attemptId === right.attemptId &&
        left.stagedIndexDigest === right.stagedIndexDigest &&
        JSON.stringify(left.attestation) === JSON.stringify(right.attestation);
}

module.exports = {
    completeBootstrapSeed,
    prepareBootstrapSeed,
    validateActiveBootstrapSeed,
};

// vim: ft=javascript sts=4 sw=4 ts=4 et :
