// $KYAULabs: hook.js kyau@aura.kyaulabs 2026/08/24 -0700 Exp $

'use strict';

const fs = require('node:fs');
const path = require('node:path');
const {runBounded} = require('./process');

const OID = /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/;
const MAX_MANIFEST_BYTES = 65536;
const MAX_PUSH_BYTES = 1048576;

function output(result) {
    return Buffer.isBuffer(result.stdout) ? result.stdout.toString('utf8') : result.stdout ?? '';
}

function invoke(run, command, args, projectRoot, options = {}) {
    return run(command, args, {cwd: projectRoot, ...options});
}

function requireSuccess(result, message) {
    if (result.error || result.status !== 0) throw new Error(message);
    return output(result).trim();
}

function exactKeys(value, expected) {
    if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
    const actual = Object.keys(value).sort();
    const wanted = [...expected].sort();
    return actual.length === wanted.length && actual.every((key, index) => key === wanted[index]);
}

function readCoreProject(projectRoot, coreRoot) {
    const manifestPath = path.join(projectRoot, '.prism', 'project.json');
    const initial = fs.lstatSync(manifestPath);
    if (
        initial.isSymbolicLink() ||
        !initial.isFile() ||
        initial.size > MAX_MANIFEST_BYTES ||
        fs.realpathSync(manifestPath) !== manifestPath
    ) {
        throw new Error('project manifest is invalid');
    }
    const descriptor = fs.openSync(manifestPath, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW);
    let contents;
    try {
        const held = fs.fstatSync(descriptor);
        contents = fs.readFileSync(descriptor);
        const final = fs.fstatSync(descriptor);
        if (
            held.dev !== initial.dev ||
            held.ino !== initial.ino ||
            final.dev !== held.dev ||
            final.ino !== held.ino ||
            final.size !== held.size
        ) {
            throw new Error('project manifest changed');
        }
    } finally {
        fs.closeSync(descriptor);
    }
    const value = JSON.parse(contents.toString('utf8'));
    const corePackage = JSON.parse(fs.readFileSync(path.join(coreRoot, 'package.json'), 'utf8'));
    if (
        !exactKeys(value, [
            'schemaVersion', 'source', 'capabilities', 'project', 'adapter', 'compatibility',
        ]) ||
        value.schemaVersion !== 1 ||
        !exactKeys(value.source, ['mode', 'evidence']) ||
        value.source.mode !== 'BLANK' ||
        value.source.evidence !== null ||
        !Array.isArray(value.capabilities) ||
        value.capabilities.length !== 0 ||
        !exactKeys(value.project, ['displayName', 'summary']) ||
        typeof value.project.displayName !== 'string' ||
        typeof value.project.summary !== 'string' ||
        value.adapter !== null ||
        !exactKeys(value.compatibility, ['corePackage', 'coreVersion', 'providerProtocol']) ||
        value.compatibility.corePackage !== '@kyaulabs/prism-core' ||
        value.compatibility.coreVersion !== corePackage.version ||
        value.compatibility.providerProtocol !== 1
    ) {
        throw new Error('project manifest is invalid');
    }
}

function canonicalRepository(requestedRoot, run, env) {
    const projectRoot = fs.realpathSync(requestedRoot);
    const top = requireSuccess(
        invoke(run, 'git', ['rev-parse', '--show-toplevel'], projectRoot, {env}),
        'repository is unavailable'
    );
    if (fs.realpathSync(top) !== projectRoot) throw new Error('repository root changed');
    return projectRoot;
}

function localReadiness(projectRoot, coreRoot, run, env) {
    const launcher = path.join(coreRoot, 'scripts', 'prism-tool.js');
    requireSuccess(
        invoke(run, process.execPath, [launcher, 'doctor', '--local-only'], projectRoot, {env}),
        'local readiness failed'
    );
}

function preCommit(projectRoot, coreRoot, run, env) {
    localReadiness(projectRoot, coreRoot, run, env);
    requireSuccess(
        invoke(run, 'git', ['diff', '--cached', '--check'], projectRoot, {env}),
        'staged diff validation failed'
    );
}

function gitDirectory(projectRoot, run, env) {
    const value = requireSuccess(
        invoke(run, 'git', ['rev-parse', '--git-dir'], projectRoot, {env}),
        'Git directory is unavailable'
    );
    return fs.realpathSync(path.resolve(projectRoot, value));
}

function containedMessage(projectRoot, messagePath, run, env) {
    const initial = fs.lstatSync(messagePath);
    if (initial.isSymbolicLink() || !initial.isFile()) {
        throw new Error('commit message path is invalid');
    }
    const gitRoot = gitDirectory(projectRoot, run, env);
    const message = fs.realpathSync(messagePath);
    const relation = path.relative(gitRoot, message);
    if (
        relation === '' ||
        relation.startsWith('..') ||
        path.isAbsolute(relation)
    ) {
        throw new Error('commit message path is invalid');
    }
    return message;
}

function commitMessage(projectRoot, coreRoot, messagePath, run, env) {
    const message = containedMessage(projectRoot, messagePath, run, env);
    localReadiness(projectRoot, coreRoot, run, env);
    const launcher = path.join(coreRoot, 'scripts', 'prism-tool.js');
    requireSuccess(
        invoke(run, process.execPath, [
            launcher, 'run', 'commitlint', '--', '--edit', message,
        ], projectRoot, {env}),
        'commit message validation failed'
    );
}

function gitResult(run, projectRoot, env, args) {
    return invoke(run, 'git', args, projectRoot, {env});
}

function protectedRootAllowed(projectRoot, run, env) {
    const branch = requireSuccess(
        gitResult(run, projectRoot, env, ['symbolic-ref', '--quiet', '--short', 'HEAD']),
        'branch is unavailable'
    );
    if (branch !== 'develop') return false;
    const head = gitResult(run, projectRoot, env, ['rev-parse', '--verify', 'HEAD']);
    if (!head.error && head.status === 0) return false;
    const remotes = requireSuccess(
        gitResult(run, projectRoot, env, ['branch', '-r', '--list', `*/${branch}`]),
        'remote branch inspection failed'
    );
    return remotes === '';
}

function prepareCommitMessage(projectRoot, coreRoot, hookArgs, run, env) {
    requireSuccess(
        gitResult(run, projectRoot, env, ['symbolic-ref', '--quiet', '--short', 'HEAD']),
        'detached branches are unsupported'
    );
    const validator = path.join(coreRoot, 'scripts', 'validate-branch-name.sh');
    const validated = invoke(run, 'bash', [validator], projectRoot, {env});
    if (validated.error || ![0, 3].includes(validated.status)) {
        throw new Error('branch validation failed');
    }
    if (validated.status === 3 && !protectedRootAllowed(projectRoot, run, env)) {
        throw new Error('protected branch commit is forbidden');
    }
    if (hookArgs[1] === 'commit' && hookArgs[2] === 'HEAD') {
        const remotes = requireSuccess(
            gitResult(run, projectRoot, env, ['branch', '-r', '--contains', 'HEAD']),
            'published commit inspection failed'
        );
        if (remotes !== '') throw new Error('published commits cannot be amended');
    }
}

function isZero(oid) {
    return /^0+$/.test(oid);
}

function readPushInput(context) {
    if (Object.prototype.hasOwnProperty.call(context, 'input')) {
        const input = context.input ?? '';
        if (Buffer.byteLength(input) > MAX_PUSH_BYTES) throw new Error('push input is too large');
        return Buffer.isBuffer(input) ? input.toString('utf8') : String(input);
    }
    const chunks = [];
    let total = 0;
    const buffer = Buffer.alloc(16384);
    let count;
    while ((count = fs.readSync(0, buffer, 0, buffer.length, null)) > 0) {
        total += count;
        if (total > MAX_PUSH_BYTES) throw new Error('push input is too large');
        chunks.push(Buffer.from(buffer.subarray(0, count)));
    }
    return Buffer.concat(chunks).toString('utf8');
}

function initialProtectedPush(projectRoot, run, env, localRef, localOid, remoteRef, remoteOid) {
    if (
        localRef !== remoteRef ||
        isZero(localOid) ||
        !isZero(remoteOid)
    ) return false;
    const count = requireSuccess(
        gitResult(run, projectRoot, env, ['rev-list', '--count', localOid]),
        'push history inspection failed'
    );
    const parents = requireSuccess(
        gitResult(run, projectRoot, env, ['rev-list', '--parents', '-n', '1', localOid]),
        'push parent inspection failed'
    ).split(/\s+/);
    return count === '1' && parents.length === 1 && parents[0] === localOid;
}

function prePush(projectRoot, coreRoot, context, run, env) {
    const input = readPushInput(context);
    const lines = input.split('\n').filter((line) => line !== '');
    if (lines.length === 0 || lines.length > 1024) throw new Error('push input is invalid');
    for (const line of lines) {
        const fields = line.split(' ');
        if (
            fields.length !== 4 ||
            fields.some((field) => field === '') ||
            !OID.test(fields[1]) ||
            !OID.test(fields[3]) ||
            fields[1].length !== fields[3].length
        ) {
            throw new Error('push input is invalid');
        }
        const [localRef, localOid, remoteRef, remoteOid] = fields;
        if (!/^refs\/(?:heads|tags)\/[A-Za-z0-9._\/-]+$/.test(localRef) ||
            !/^refs\/(?:heads|tags)\/[A-Za-z0-9._\/-]+$/.test(remoteRef)) {
            throw new Error('push ref is invalid');
        }
        requireSuccess(
            gitResult(run, projectRoot, env, ['check-ref-format', localRef]),
            'push ref is invalid'
        );
        requireSuccess(
            gitResult(run, projectRoot, env, ['check-ref-format', remoteRef]),
            'push ref is invalid'
        );
        if (remoteRef === 'refs/heads/main' || (
            remoteRef === 'refs/heads/develop' &&
            !initialProtectedPush(projectRoot, run, env, localRef, localOid, remoteRef, remoteOid)
        )) {
            throw new Error('protected direct push is forbidden');
        }
        if (
            remoteRef.startsWith('refs/heads/') &&
            !isZero(localOid) &&
            !isZero(remoteOid)
        ) {
            requireSuccess(
                gitResult(run, projectRoot, env, [
                    'merge-base', '--is-ancestor', remoteOid, localOid,
                ]),
                'non-fast-forward push is forbidden'
            );
        }
    }
    localReadiness(projectRoot, coreRoot, run, env);
}

function validGrammar(event, args) {
    if (event === 'pre-commit') return args.length === 0;
    if (event === 'commit-msg') return args.length === 1;
    if (event === 'pre-push') return args.length === 2 && args.every((value) => value !== '');
    if (event !== 'prepare-commit-msg' || args.length < 1 || args.length > 3) return false;
    if (args.length === 1) return true;
    if (!['message', 'template', 'merge', 'squash', 'commit'].includes(args[1])) return false;
    if (args[1] === 'commit') return args.length === 3 && args[2] !== '';
    return args.length === 2;
}

function hookCommand(args, context = {}) {
    const [event, ...hookArgs] = args;
    if (!validGrammar(event, hookArgs)) {
        process.stderr.write('usage: prism-tool hook pre-commit|commit-msg|prepare-commit-msg|pre-push ...\n');
        return 2;
    }
    const run = context.hookRun ?? runBounded;
    const env = context.env ?? process.env;
    const coreRoot = fs.realpathSync(context.coreRoot ?? path.resolve(__dirname, '../..'));
    try {
        const projectRoot = canonicalRepository(
            context.projectRoot ?? context.cwd ?? process.cwd(),
            run,
            env
        );
        readCoreProject(projectRoot, coreRoot);
        if (event === 'pre-commit') preCommit(projectRoot, coreRoot, run, env);
        else if (event === 'commit-msg') {
            commitMessage(projectRoot, coreRoot, hookArgs[0], run, env);
        } else if (event === 'prepare-commit-msg') {
            prepareCommitMessage(projectRoot, coreRoot, hookArgs, run, env);
        } else prePush(projectRoot, coreRoot, context, run, env);
        return 0;
    } catch {
        process.stderr.write(`prism hook: ${event} policy failed\n`);
        return 1;
    }
}

module.exports = {hookCommand};

// vim: ft=javascript sts=4 sw=4 ts=4 et :
