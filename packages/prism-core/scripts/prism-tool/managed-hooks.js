// $KYAULabs: managed-hooks.js kyau@aura.kyaulabs 2026/09/01 -0700 Exp $

'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const {runBounded} = require('./process');

const CANONICAL_HOOKS = Object.freeze([
    'commit-msg',
    'pre-commit',
    'pre-push',
    'prepare-commit-msg',
]);
const OBSOLETE_MANAGED_HOOKS = Object.freeze(['post-checkout', 'post-merge']);
const PRISM_HOOK_MARKERS = Object.freeze([
    '# prism-managed: @kyaulabs/prism-core',
    'prism-tool hook ',
]);
const LEGACY_CANONICAL_DIGESTS = Object.freeze(new Set([
    '6cb4d2f8461eb26a59ef755122ec62fa3472126acf53d79977350c2578bc2b80',
    'dc3f0455d5675ea9c144a6a7ad52581296d821c7754b1f89dafd993c7f1ac60e',
    '73c8276a9d4609b056f5f2f147a4caaa9c7bce2ca9df58172ffab00a604958ed',
    '17d3993c35d7c2d164d16ad2df1bab6556dc30c32eb269f7b3d31b98000e4431',
]));
const LEGACY_OBSOLETE_DIGESTS = Object.freeze(new Set([
    '98795b5671d8f7f8a38f54efced83ead3777e7c807319ee39171bef75a833966',
    '7110e91d655a7a77892eb1789b5de6d7b4ccdd18e5fe9a011e8782a9861c2c15',
]));
const HOOKS_PATH = '.github/hooks';
const MAX_HOOK_BYTES = 65536;

function sha256(value) {
    return crypto.createHash('sha256').update(value).digest('hex');
}

function output(result) {
    return Buffer.isBuffer(result.stdout) ? result.stdout.toString('utf8') : result.stdout ?? '';
}

function invoke(run, projectRoot, args, env) {
    return run('git', args, {cwd: projectRoot, env});
}

function requireSuccess(result, message) {
    if (result?.error || result?.status !== 0) throw new Error(message);
    return output(result).trim();
}

function readRegular(filePath, expectedMode = null) {
    const initial = fs.lstatSync(filePath);
    if (
        initial.isSymbolicLink() ||
        !initial.isFile() ||
        initial.size > MAX_HOOK_BYTES ||
        (expectedMode !== null && (initial.mode & 0o777) !== expectedMode) ||
        typeof fs.constants.O_NOFOLLOW !== 'number'
    ) {
        throw new Error('managed hook is invalid');
    }
    const descriptor = fs.openSync(filePath, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW);
    try {
        const held = fs.fstatSync(descriptor);
        const contents = fs.readFileSync(descriptor);
        const current = fs.lstatSync(filePath);
        if (
            !held.isFile() ||
            held.dev !== initial.dev ||
            held.ino !== initial.ino ||
            current.dev !== held.dev ||
            current.ino !== held.ino ||
            contents.length !== held.size ||
            contents.length > MAX_HOOK_BYTES
        ) {
            throw new Error('managed hook changed');
        }
        return Object.freeze({contents, mode: held.mode & 0o777});
    } finally {
        fs.closeSync(descriptor);
    }
}

function canonicalManagedHooks(coreRoot) {
    const canonicalCore = fs.realpathSync(coreRoot);
    return Object.freeze(CANONICAL_HOOKS.map((name) => Object.freeze({
        name,
        contents: readRegular(
            path.join(canonicalCore, 'config', 'bootstrap', 'hooks', name),
            0o755
        ).contents,
        mode: 0o755,
    })));
}

function hookPathState(projectRoot, run, env) {
    const result = invoke(run, projectRoot, [
        'config', '--show-origin', '--show-scope', '--get-all', 'core.hooksPath',
    ], env);
    if (result?.error || ![0, 1].includes(result?.status)) {
        throw new Error('Git hooks path inspection failed');
    }
    if (result.status === 1) return Object.freeze({active: false, value: null});
    const lines = output(result).split('\n').filter(Boolean);
    if (lines.length !== 1) throw new Error('Git hooks path conflicts with Prism');
    const fields = lines[0].split('\t');
    if (
        fields.length !== 3 ||
        fields[0] !== 'local' ||
        fields[2] !== HOOKS_PATH
    ) {
        throw new Error('Git hooks path conflicts with Prism');
    }
    return Object.freeze({active: true, value: HOOKS_PATH});
}

function resolveHooksRoot(projectRoot, run, env, active) {
    const args = [
        ...(active ? [] : ['-c', `core.hooksPath=${HOOKS_PATH}`]),
        'rev-parse', '--path-format=absolute', '--git-path', 'hooks',
    ];
    const resolved = requireSuccess(
        invoke(run, projectRoot, args, env),
        'Git hooks destination is unavailable'
    );
    if (resolved.includes('\0') || resolved.includes('\n')) {
        throw new Error('Git hooks destination is invalid');
    }
    const expected = path.join(projectRoot, '.github', 'hooks');
    if (path.resolve(resolved) !== expected) throw new Error('Git hooks destination is invalid');
    return expected;
}

function inspectHooksDirectory(projectRoot, hooksRoot) {
    const relation = path.relative(projectRoot, hooksRoot);
    if (relation !== '.github/hooks') throw new Error('managed hooks path is invalid');
    let current = projectRoot;
    for (const segment of ['.github', 'hooks']) {
        current = path.join(current, segment);
        const entry = fs.lstatSync(current, {throwIfNoEntry: false});
        if (entry === undefined) return;
        if (entry.isSymbolicLink() || !entry.isDirectory()) {
            throw new Error('managed hooks directory is invalid');
        }
    }
}

function existingHook(hooksRoot, name) {
    const filePath = path.join(hooksRoot, name);
    const entry = fs.lstatSync(filePath, {throwIfNoEntry: false});
    if (entry === undefined) return null;
    return readRegular(filePath);
}

function prismOwned(contents) {
    const lines = contents.toString('utf8').split(/\r?\n/);
    return lines.includes(PRISM_HOOK_MARKERS[0]) &&
        lines.some((line) => /^exec prism-tool hook (?:commit-msg|pre-commit|pre-push|prepare-commit-msg) "\$@"$/.test(line)) ||
        LEGACY_CANONICAL_DIGESTS.has(sha256(contents));
}

function conflictReport(message = 'managed hook ownership conflicts') {
    return Object.freeze({
        status: 'NO-GO',
        disposition: 'CONFLICT',
        hooks: Object.freeze([]),
        remove: Object.freeze([]),
        checks: Object.freeze([Object.freeze({
            id: 'managed-hooks',
            status: 'FAIL',
            message,
        })]),
    });
}

function inspectManagedHooks({
    projectRoot: requestedRoot,
    coreRoot,
    run = runBounded,
    env = process.env,
}) {
    try {
        const projectRoot = fs.realpathSync(requestedRoot);
        const top = requireSuccess(
            invoke(run, projectRoot, ['rev-parse', '--show-toplevel'], env),
            'repository is unavailable'
        );
        if (fs.realpathSync(top) !== projectRoot) throw new Error('repository root changed');
        const hookPath = hookPathState(projectRoot, run, env);
        const hooksRoot = resolveHooksRoot(projectRoot, run, env, hookPath.active);
        inspectHooksDirectory(projectRoot, hooksRoot);
        const hooks = canonicalManagedHooks(coreRoot).map((canonical) => {
            const current = existingHook(hooksRoot, canonical.name);
            let disposition;
            if (current === null) disposition = 'CREATE';
            else if (current.mode === canonical.mode && current.contents.equals(canonical.contents)) {
                disposition = 'CURRENT';
            } else if (prismOwned(current.contents)) disposition = 'MIGRATE';
            else disposition = 'CONFLICT';
            return Object.freeze({
                name: canonical.name,
                path: `${HOOKS_PATH}/${canonical.name}`,
                disposition,
                sha256: sha256(canonical.contents),
            });
        });
        const remove = [];
        for (const name of OBSOLETE_MANAGED_HOOKS) {
            const current = existingHook(hooksRoot, name);
            if (current === null) continue;
            if (!prismOwned(current.contents) && !LEGACY_OBSOLETE_DIGESTS.has(sha256(current.contents))) {
                return conflictReport();
            }
            remove.push(name);
        }
        if (hooks.some(({disposition}) => disposition === 'CONFLICT')) {
            return conflictReport();
        }
        const current = hookPath.active &&
            hooks.every(({disposition}) => disposition === 'CURRENT') &&
            remove.length === 0;
        return Object.freeze({
            status: 'GO',
            disposition: current ? 'CURRENT' : 'RECONCILE',
            hooks: Object.freeze(hooks),
            remove: Object.freeze(remove),
            hooksPath: HOOKS_PATH,
            active: hookPath.active,
            checks: Object.freeze([Object.freeze({
                id: 'managed-hooks',
                status: 'PASS',
                message: current ? 'managed hooks are current' : 'managed hooks can be reconciled',
            })]),
        });
    } catch {
        return conflictReport();
    }
}

function planManagedHooks(options) {
    return inspectManagedHooks(options);
}

function ensureHooksRoot(projectRoot) {
    const created = [];
    let current = projectRoot;
    for (const segment of ['.github', 'hooks']) {
        current = path.join(current, segment);
        const entry = fs.lstatSync(current, {throwIfNoEntry: false});
        if (entry === undefined) {
            fs.mkdirSync(current, {mode: 0o755});
            created.push(current);
        }
        const held = fs.lstatSync(current);
        if (held.isSymbolicLink() || !held.isDirectory()) {
            throw new Error('managed hooks directory is invalid');
        }
    }
    return created;
}

function publishHook(destination, contents, mode, rename) {
    const temporary = path.join(
        path.dirname(destination),
        `.${path.basename(destination)}.prism-${crypto.randomBytes(8).toString('hex')}`
    );
    try {
        fs.writeFileSync(temporary, contents, {flag: 'wx', mode});
        fs.chmodSync(temporary, mode);
        rename(temporary, destination);
    } finally {
        fs.rmSync(temporary, {force: true});
    }
}

function semanticPlan(plan) {
    return JSON.stringify({
        status: plan.status,
        disposition: plan.disposition,
        hooks: plan.hooks,
        remove: plan.remove,
        hooksPath: plan.hooksPath,
        active: plan.active,
    });
}

function observedHookState(hooksRoot) {
    return JSON.stringify([...CANONICAL_HOOKS, ...OBSOLETE_MANAGED_HOOKS].map((name) => {
        const current = existingHook(hooksRoot, name);
        return current === null ? {name, state: 'ABSENT'} : {
            name,
            state: 'PRESENT',
            mode: current.mode,
            sha256: sha256(current.contents),
        };
    }));
}

function bestEffort(action) {
    try {
        action();
    } catch {
        return false;
    }
    return true;
}

function applyManagedHooks({
    projectRoot: requestedRoot,
    coreRoot,
    approval,
    run = runBounded,
    env = process.env,
    rename = fs.renameSync,
}) {
    if (approval !== 'yes') throw new Error('literal hook reconciliation approval is required');
    const projectRoot = fs.realpathSync(requestedRoot);
    const planned = inspectManagedHooks({projectRoot, coreRoot, run, env});
    if (planned.status !== 'GO') return planned;
    if (planned.disposition === 'CURRENT') return planned;
    const hooksRoot = path.join(projectRoot, '.github', 'hooks');
    const canonical = new Map(canonicalManagedHooks(coreRoot).map((hook) => [hook.name, hook]));
    let observed;
    const originals = new Map();
    const published = [];
    const removed = [];
    const createdDirectories = [];
    let activated = false;
    try {
        observed = observedHookState(hooksRoot);
        const locked = inspectManagedHooks({projectRoot, coreRoot, run, env});
        if (semanticPlan(locked) !== semanticPlan(planned) ||
            observedHookState(hooksRoot) !== observed) {
            throw new Error('managed hook state changed');
        }
        createdDirectories.push(...ensureHooksRoot(projectRoot));
        for (const hook of planned.hooks) {
            if (hook.disposition === 'CURRENT') continue;
            const destination = path.join(hooksRoot, hook.name);
            const existing = existingHook(hooksRoot, hook.name);
            originals.set(hook.name, existing);
            const source = canonical.get(hook.name);
            publishHook(destination, source.contents, source.mode, rename);
            published.push(hook.name);
        }
        for (const name of planned.remove) {
            const current = existingHook(hooksRoot, name);
            if (
                current === null ||
                (!prismOwned(current.contents) &&
                 !LEGACY_OBSOLETE_DIGESTS.has(sha256(current.contents)))
            ) {
                throw new Error('obsolete managed hook changed');
            }
            fs.unlinkSync(path.join(hooksRoot, name));
            removed.push({name, current});
        }
        if (!planned.active) {
            requireSuccess(
                invoke(run, projectRoot, ['config', '--local', 'core.hooksPath', HOOKS_PATH], env),
                'Git hooks path activation failed'
            );
            activated = true;
        }
        const verified = verifyManagedHooks({projectRoot, coreRoot, run, env});
        if (verified.status !== 'GO') throw new Error('managed hook verification failed');
        return Object.freeze({...verified, disposition: 'APPLIED'});
    } catch {
        let rollbackComplete = true;
        if (activated && !bestEffort(() => invoke(run, projectRoot, [
            'config', '--local', '--fixed-value', '--unset-all',
            'core.hooksPath', HOOKS_PATH,
        ], env))) rollbackComplete = false;
        for (const {name, current} of removed.reverse()) {
            if (!bestEffort(() => publishHook(
                path.join(hooksRoot, name),
                current.contents,
                current.mode,
                fs.renameSync
            ))) rollbackComplete = false;
        }
        for (const name of published.reverse()) {
            if (!bestEffort(() => {
                const original = originals.get(name);
                const destination = path.join(hooksRoot, name);
                if (original === null) fs.rmSync(destination, {force: true});
                else publishHook(destination, original.contents, original.mode, fs.renameSync);
            })) rollbackComplete = false;
        }
        for (const directory of createdDirectories.reverse()) {
            if (!bestEffort(() => {
                if (fs.existsSync(directory) && fs.readdirSync(directory).length === 0) {
                    fs.rmdirSync(directory);
                }
            })) rollbackComplete = false;
        }
        return conflictReport(rollbackComplete
            ? 'managed hooks were not reconciled'
            : 'managed hook rollback is incomplete');
    }
}

function verifyManagedHooks(options) {
    const inspected = inspectManagedHooks(options);
    if (inspected.status === 'GO' && inspected.disposition === 'CURRENT') return inspected;
    return Object.freeze({
        ...inspected,
        status: 'NO-GO',
        checks: Object.freeze([Object.freeze({
            id: 'managed-hooks',
            status: 'FAIL',
            message: 'managed hooks are not current',
        })]),
    });
}

module.exports = {
    CANONICAL_HOOKS,
    OBSOLETE_MANAGED_HOOKS,
    PRISM_HOOK_MARKERS,
    applyManagedHooks,
    canonicalManagedHooks,
    inspectManagedHooks,
    planManagedHooks,
    verifyManagedHooks,
};

// vim: ft=javascript sts=4 sw=4 ts=4 et :
