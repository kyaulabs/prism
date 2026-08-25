// $KYAULabs: bootstrap-hooks.js kyau@aura.kyaulabs 2026/08/24 -0700 Exp $

'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const {readBootstrapJournal, transitionBootstrapJournal} = require('./bootstrap-journal');
const {createBootstrapRepository} = require('./bootstrap-repository');
const {runBounded} = require('./process');

const EVENTS = Object.freeze(['commit-msg', 'pre-commit', 'pre-push', 'prepare-commit-msg']);
const HOOKS_PATH = '.github/hooks';
const MAX_HOOK_BYTES = 65536;

function sha256(value) {
    return crypto.createHash('sha256').update(value).digest('hex');
}

function output(result) {
    return Buffer.isBuffer(result.stdout) ? result.stdout.toString('utf8') : result.stdout ?? '';
}

function invoke(runGit, projectRoot, env, args) {
    return runGit('git', args, {cwd: projectRoot, env});
}

function requireSuccess(result, message) {
    if (result.error || result.status !== 0) throw new Error(message);
    return output(result);
}

function readRegularExecutable(filePath) {
    const initial = fs.lstatSync(filePath);
    if (
        initial.isSymbolicLink() ||
        !initial.isFile() ||
        (initial.mode & 0o777) !== 0o755 ||
        initial.size > MAX_HOOK_BYTES
    ) {
        throw new Error('bootstrap hook is invalid');
    }
    const descriptor = fs.openSync(filePath, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW);
    try {
        const held = fs.fstatSync(descriptor);
        const contents = fs.readFileSync(descriptor);
        const final = fs.fstatSync(descriptor);
        if (
            held.dev !== initial.dev ||
            held.ino !== initial.ino ||
            final.dev !== held.dev ||
            final.ino !== held.ino ||
            final.size !== held.size
        ) {
            throw new Error('bootstrap hook changed');
        }
        return Object.freeze({contents, stat: held});
    } finally {
        fs.closeSync(descriptor);
    }
}

function inspectLegacyHooks(projectRoot) {
    const hooksRoot = path.join(projectRoot, '.git', 'hooks');
    const root = fs.lstatSync(hooksRoot, {throwIfNoEntry: false});
    if (root === undefined) return;
    if (root.isSymbolicLink() || !root.isDirectory()) {
        throw new Error('legacy Git hooks state is invalid');
    }
    for (const name of fs.readdirSync(hooksRoot)) {
        if (name.endsWith('.sample')) continue;
        const entry = fs.lstatSync(path.join(hooksRoot, name));
        if (entry.isSymbolicLink() || !entry.isFile() || (entry.mode & 0o111) !== 0) {
            throw new Error('active legacy Git hook conflicts with bootstrap');
        }
    }
}

function parseHookPathOrigins(result) {
    if (result.error) throw new Error('Git hooks path inspection failed');
    if (result.status === 1) return [];
    if (result.status !== 0) throw new Error('Git hooks path inspection failed');
    return output(result).split('\n').filter(Boolean).map((line) => {
        const fields = line.split('\t');
        if (fields.length !== 3 || fields.some((field) => field === '')) {
            throw new Error('Git hooks path inspection is invalid');
        }
        return Object.freeze({scope: fields[0], origin: fields[1], value: fields[2]});
    });
}

function inspectHookPath(projectRoot, runGit, env) {
    const values = parseHookPathOrigins(invoke(runGit, projectRoot, env, [
        'config', '--show-origin', '--show-scope', '--get-all', 'core.hooksPath',
    ]));
    if (values.length === 0) return Object.freeze({activeHooksPath: null, state: 'READY'});
    if (
        values.length === 1 &&
        values[0].scope === 'local' &&
        values[0].value === HOOKS_PATH &&
        (values[0].origin === 'file:.git/config' || values[0].origin.endsWith('/.git/config'))
    ) {
        return Object.freeze({activeHooksPath: HOOKS_PATH, state: 'ACTIVE'});
    }
    throw new Error('effective Git hooks path conflicts with bootstrap');
}

function inspectBootstrapHooks({
    projectRoot,
    coreRoot,
    attemptId,
    planDigest,
    runGit = runBounded,
    env = process.env,
    allowUntracked = false,
    allowCommittedRoot = false,
}) {
    const root = fs.realpathSync(projectRoot);
    const journal = readBootstrapJournal({projectRoot: root, attemptId});
    if (
        journal.phase !== 'POST_APPLICATION' ||
        journal.status !== 'ACTIVE' ||
        !['HOOK_ACTIVATION', 'ROOT_SEED_PREPARATION', 'ROOT_SEED_COMMIT'].includes(
            journal.resumePhase
        )
    ) {
        throw new Error('bootstrap hooks require an eligible repository');
    }
    const repository = createBootstrapRepository({
        projectRoot: root,
        coreRoot,
        attemptId,
        planDigest,
        runGit,
        env,
        allowUntracked,
        allowCommittedRoot,
    }).data.repository;
    const planPathSet = new Set(journal.applied.map((entry) => entry.path));
    const hookInventory = [];
    for (const event of EVENTS) {
        const relative = `${HOOKS_PATH}/${event}`;
        if (!planPathSet.has(relative)) throw new Error('bootstrap hook is absent from the plan');
        const packaged = readRegularExecutable(path.join(coreRoot, 'config', 'bootstrap', 'hooks', event));
        const project = readRegularExecutable(path.join(root, HOOKS_PATH, event));
        if (!project.contents.equals(packaged.contents)) throw new Error('bootstrap hook bytes changed');
        hookInventory.push(Object.freeze({
            event,
            mode: 0o755,
            sha256: sha256(project.contents),
        }));
    }
    const hookRootEntries = fs.readdirSync(path.join(root, HOOKS_PATH)).sort();
    if (JSON.stringify(hookRootEntries) !== JSON.stringify([...EVENTS].sort())) {
        throw new Error('bootstrap hook inventory is invalid');
    }
    inspectLegacyHooks(root);
    const hookPath = inspectHookPath(root, runGit, env);
    const inventoryDigest = sha256(Buffer.from(JSON.stringify(hookInventory)));
    const evidence = Object.freeze({
        disposition: 'ACTIVE',
        hooksPath: HOOKS_PATH,
        inventoryDigest,
    });
    if (
        hookPath.state === 'ACTIVE' &&
        (journal.hooks === null || JSON.stringify(journal.hooks) !== JSON.stringify(evidence))
    ) {
        throw new Error('active bootstrap hook evidence changed');
    }
    return Object.freeze({
        status: 'GO',
        disposition: hookPath.state === 'ACTIVE' ? 'HOOKS_ACTIVE' : 'HOOKS_READY',
        checks: Object.freeze([Object.freeze({
            id: 'bootstrap-hooks',
            status: 'PASS',
            message: 'canonical bootstrap hooks were revalidated',
        })]),
        data: Object.freeze({
            attempt: Object.freeze({id: attemptId}),
            planDigest,
            repository,
            hooks: Object.freeze(EVENTS.map((event) => Object.freeze({
                event,
                path: `${HOOKS_PATH}/${event}`,
                disposition: 'PRESERVE',
            }))),
            activeHooksPath: hookPath.activeHooksPath,
            evidence,
            resumePhase: hookPath.state === 'ACTIVE' ? 'ROOT_SEED_PREPARATION' : 'HOOK_ACTIVATION',
        }),
    });
}

function localConfigEntries(projectRoot, runGit, env) {
    const contents = requireSuccess(
        invoke(runGit, projectRoot, env, ['config', '--local', '--null', '--list']),
        'local Git configuration inspection failed'
    );
    return contents.split('\0').filter(Boolean).sort();
}

function exactLocalHooksPath(projectRoot, runGit, env) {
    try {
        return inspectHookPath(projectRoot, runGit, env).state === 'ACTIVE';
    } catch {
        return false;
    }
}

function applyBootstrapHooks({
    projectRoot,
    coreRoot,
    attemptId,
    planDigest,
    approval,
    runGit = runBounded,
    env = process.env,
    fault = () => {},
}) {
    if (approval !== 'yes') throw new Error('literal hook activation approval is required');
    const root = fs.realpathSync(projectRoot);
    const inspected = inspectBootstrapHooks({
        projectRoot: root,
        coreRoot,
        attemptId,
        planDigest,
        runGit,
        env,
    });
    if (inspected.disposition === 'HOOKS_ACTIVE') return inspected;
    const journal = readBootstrapJournal({projectRoot: root, attemptId});
    const configPath = path.join(root, '.git', 'config');
    const configIdentity = fs.lstatSync(configPath);
    const baseline = localConfigEntries(root, runGit, env);
    let wrote = false;
    try {
        fault({name: 'before-config', projectRoot: root});
        const currentConfig = fs.lstatSync(configPath);
        if (
            currentConfig.isSymbolicLink() ||
            !currentConfig.isFile() ||
            currentConfig.dev !== configIdentity.dev ||
            currentConfig.ino !== configIdentity.ino
        ) {
            throw new Error('repository configuration changed');
        }
        requireSuccess(
            invoke(runGit, root, env, ['config', '--local', 'core.hooksPath', HOOKS_PATH]),
            'Git hooks path activation failed'
        );
        wrote = true;
        fault({name: 'after-config', projectRoot: root});
        const current = localConfigEntries(root, runGit, env);
        const expectedEntry = `core.hookspath\n${HOOKS_PATH}`;
        const remaining = [...current];
        const index = remaining.indexOf(expectedEntry);
        if (index < 0) throw new Error('local Git hooks path is invalid');
        remaining.splice(index, 1);
        if (
            JSON.stringify(remaining) !== JSON.stringify(baseline) ||
            !exactLocalHooksPath(root, runGit, env)
        ) {
            throw new Error('repository configuration changed during hook activation');
        }
        const evidence = inspected.data.evidence;
        transitionBootstrapJournal({
            projectRoot: root,
            attemptId,
            expectedPhase: 'POST_APPLICATION',
            next: {
                ...journal,
                resumePhase: 'ROOT_SEED_PREPARATION',
                hooks: evidence,
            },
        });
        return Object.freeze({
            ...inspected,
            disposition: 'HOOKS_ACTIVE',
            checks: Object.freeze([Object.freeze({
                id: 'bootstrap-hooks',
                status: 'PASS',
                message: 'canonical bootstrap hooks are active',
            })]),
            data: Object.freeze({
                ...inspected.data,
                hooks: evidence,
                activeHooksPath: HOOKS_PATH,
                resumePhase: 'ROOT_SEED_PREPARATION',
            }),
        });
    } catch (error) {
        let recorded = false;
        try {
            const currentJournal = readBootstrapJournal({projectRoot: root, attemptId});
            recorded = currentJournal.resumePhase === 'ROOT_SEED_PREPARATION' &&
                JSON.stringify(currentJournal.hooks) === JSON.stringify(inspected.data.evidence);
        } catch {
            recorded = true;
        }
        if (!recorded && wrote && exactLocalHooksPath(root, runGit, env)) {
            const rollback = invoke(runGit, root, env, [
                'config', '--local', '--fixed-value', '--unset-all', 'core.hooksPath', HOOKS_PATH,
            ]);
            if (rollback.error || ![0, 5].includes(rollback.status)) {
                throw new Error('Git hooks path rollback failed');
            }
        }
        throw error;
    }
}

module.exports = {applyBootstrapHooks, inspectBootstrapHooks};

// vim: ft=javascript sts=4 sw=4 ts=4 et :
