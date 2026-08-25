// $KYAULabs: bootstrap-repository.js kyau@aura.kyaulabs 2026/08/24 -0700 Exp $

'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const {readBootstrapJournal, transitionBootstrapJournal} = require('./bootstrap-journal');
const {runBounded} = require('./process');
const {validateDurableBootstrapProject} = require('./bootstrap-transaction');

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
    return output(result).trim();
}

function repositoryEnvironment(base, emptyConfig = null) {
    const env = {...base};
    for (const name of Object.keys(env)) {
        if (
            [
                'GIT_DIR', 'GIT_WORK_TREE', 'GIT_COMMON_DIR', 'GIT_OBJECT_DIRECTORY',
                'GIT_ALTERNATE_OBJECT_DIRECTORIES', 'GIT_INDEX_FILE', 'GIT_NAMESPACE',
                'GIT_CEILING_DIRECTORIES', 'GIT_DISCOVERY_ACROSS_FILESYSTEM',
                'GIT_CONFIG_COUNT', 'GIT_CONFIG_PARAMETERS', 'GIT_CONFIG_SYSTEM',
            ].includes(name) ||
            /^GIT_CONFIG_(?:KEY|VALUE)_\d+$/.test(name)
        ) delete env[name];
    }
    env.GIT_CONFIG_NOSYSTEM = '1';
    if (emptyConfig !== null) env.GIT_CONFIG_GLOBAL = emptyConfig;
    else delete env.GIT_CONFIG_GLOBAL;
    return env;
}

function sameFile(left, right) {
    return left.dev === right.dev && left.ino === right.ino;
}

function ownedFile(filePath, contents) {
    const stat = fs.lstatSync(filePath);
    return {path: filePath, stat, contents: Buffer.from(contents)};
}

function removeOwnedFile(owned) {
    const current = fs.lstatSync(owned.path);
    if (
        current.isSymbolicLink() ||
        !current.isFile() ||
        !sameFile(current, owned.stat) ||
        !fs.readFileSync(owned.path).equals(owned.contents)
    ) {
        throw new Error('repository operation file changed');
    }
    fs.unlinkSync(owned.path);
}

function removeOwnedDirectory(owned) {
    const current = fs.lstatSync(owned.path);
    if (
        current.isSymbolicLink() ||
        !current.isDirectory() ||
        !sameFile(current, owned.stat) ||
        fs.readdirSync(owned.path).length !== 0
    ) {
        throw new Error('repository operation directory changed');
    }
    fs.rmdirSync(owned.path);
}

function cleanupInterruptedOperation(attemptRoot, attemptId) {
    const lockPath = path.join(attemptRoot, 'repository.lock');
    const templateRoot = path.join(attemptRoot, 'git-template');
    const emptyConfig = path.join(attemptRoot, 'git-global.config');
    const paths = [lockPath, templateRoot, emptyConfig];
    const present = paths.map((entry) => fs.lstatSync(entry, {throwIfNoEntry: false}));
    if (present.every((entry) => entry === undefined)) return;
    if (present.some((entry) => entry === undefined)) {
        throw new Error('repository operation evidence is incomplete');
    }
    const lockContents = Buffer.from(`${JSON.stringify({schemaVersion: 1, attemptId})}\n`);
    const lock = ownedFile(lockPath, lockContents);
    const config = ownedFile(emptyConfig, Buffer.alloc(0));
    const template = {path: templateRoot, stat: present[1]};
    if (
        (present[0].mode & 0o777) !== 0o600 ||
        (present[1].mode & 0o777) !== 0o700 ||
        (present[2].mode & 0o777) !== 0o600
    ) throw new Error('repository operation evidence is invalid');
    removeOwnedDirectory(template);
    removeOwnedFile(config);
    removeOwnedFile(lock);
}

function validateCreatedRepository(
    projectRoot,
    runGit,
    env,
    allowHooksPath = false,
    allowCommittedRoot = false
) {
    const gitPath = path.join(projectRoot, '.git');
    const gitDirectory = fs.lstatSync(gitPath);
    if (
        gitDirectory.isSymbolicLink() ||
        !gitDirectory.isDirectory() ||
        fs.realpathSync(gitPath) !== gitPath
    ) {
        throw new Error('created repository is invalid');
    }
    const branch = requireSuccess(
        invoke(runGit, projectRoot, env, ['symbolic-ref', '--quiet', '--short', 'HEAD']),
        'created repository branch is invalid'
    );
    const objectFormat = requireSuccess(
        invoke(runGit, projectRoot, env, ['rev-parse', '--show-object-format=storage']),
        'created repository object format is invalid'
    );
    const refFormat = requireSuccess(
        invoke(runGit, projectRoot, env, ['rev-parse', '--show-ref-format']),
        'created repository ref format is invalid'
    );
    const head = invoke(runGit, projectRoot, env, ['rev-parse', '--verify', 'HEAD']);
    const refs = invoke(runGit, projectRoot, env, ['show-ref']);
    const remotes = requireSuccess(
        invoke(runGit, projectRoot, env, ['remote']),
        'created repository remotes are invalid'
    );
    const configNames = requireSuccess(
        invoke(runGit, projectRoot, env, ['config', '--local', '--name-only', '--list']),
        'created repository configuration is invalid'
    ).split('\n').filter(Boolean).sort();
    const allowedConfig = [
        'core.bare', 'core.filemode', 'core.logallrefupdates', 'core.repositoryformatversion',
    ];
    if (allowHooksPath) allowedConfig.push('core.hookspath');
    allowedConfig.sort();
    if (
        branch !== 'develop' ||
        objectFormat !== 'sha1' ||
        refFormat !== 'files' ||
        head.error ||
        (allowCommittedRoot ? head.status !== 0 : head.status === 0) ||
        refs.error ||
        (allowCommittedRoot ? refs.status !== 0 : refs.status !== 1) ||
        remotes !== '' ||
        JSON.stringify(configNames) !== JSON.stringify(allowedConfig) ||
        fs.lstatSync(path.join(gitPath, 'hooks'), {throwIfNoEntry: false}) !== undefined
    ) {
        throw new Error('created repository postconditions failed');
    }
    const configEntries = requireSuccess(
        invoke(runGit, projectRoot, env, ['config', '--local', '--null', '--list']),
        'created repository configuration is invalid'
    ).split('\0').filter(Boolean).filter((entry) => !entry.startsWith('core.hookspath\n')).sort();
    const configDigest = sha256(Buffer.from(JSON.stringify(configEntries)));
    return Object.freeze({
        disposition: 'CREATE',
        gitDirectory: Object.freeze({dev: gitDirectory.dev, ino: gitDirectory.ino}),
        branch,
        objectFormat,
        refFormat,
        configDigest,
    });
}

function createBootstrapRepository({
    projectRoot: requestedRoot,
    coreRoot,
    attemptId,
    planDigest,
    runGit = runBounded,
    env = process.env,
    fault = () => {},
    allowUntracked = false,
    allowCommittedRoot = false,
}) {
    const projectRoot = fs.realpathSync(requestedRoot);
    const projectIdentity = fs.lstatSync(projectRoot);
    let journal = readBootstrapJournal({projectRoot, attemptId});
    const attemptRoot = path.join(projectRoot, '.pi', 'prism-tool', 'bootstrap', attemptId);
    const gitPath = path.join(projectRoot, '.git');
    if (
        journal.phase === 'POST_APPLICATION' &&
        journal.status === 'ACTIVE' &&
        ['HOOK_ACTIVATION', 'ROOT_SEED_PREPARATION', 'ROOT_SEED_COMMIT'].includes(
            journal.resumePhase
        )
    ) {
        validateDurableBootstrapProject({
            projectRoot,
            coreRoot,
            attemptId,
            planDigest,
            allowRepository: true,
            allowUntracked,
        });
        const repository = validateCreatedRepository(
            projectRoot,
            runGit,
            repositoryEnvironment(env, '/dev/null'),
            journal.hooks !== null,
            allowCommittedRoot
        );
        if (JSON.stringify(repository) !== JSON.stringify(journal.repository)) {
            throw new Error('created repository evidence changed');
        }
        return Object.freeze({
            status: 'GO',
            disposition: 'REPOSITORY_CREATED',
            checks: Object.freeze([Object.freeze({
                id: 'bootstrap-repository',
                status: 'PASS',
                message: 'durable project repository was revalidated',
            })]),
            data: Object.freeze({
                attempt: Object.freeze({id: attemptId}),
                planDigest,
                repository,
                resumePhase: journal.resumePhase,
            }),
        });
    }
    let durable;
    if (
        journal.phase === 'POST_APPLICATION' &&
        journal.status === 'ACTIVE' &&
        journal.resumePhase === 'REPOSITORY_CREATION' &&
        journal.repository === null
    ) {
        cleanupInterruptedOperation(attemptRoot, attemptId);
        durable = validateDurableBootstrapProject({
            projectRoot,
            coreRoot,
            attemptId,
            planDigest,
            allowRepository: true,
            allowUntracked,
        });
    } else {
        durable = validateDurableBootstrapProject({
            projectRoot,
            coreRoot,
            attemptId,
            planDigest,
            allowUntracked,
        });
        if (
            journal.phase !== 'DURABLE' ||
            journal.status !== 'ACTIVE' ||
            journal.appliedInventoryDigest !== durable.appliedInventoryDigest ||
            fs.lstatSync(path.join(projectRoot, '.git'), {throwIfNoEntry: false}) !== undefined
        ) {
            throw new Error('repository bootstrap requires a durable project');
        }
        transitionBootstrapJournal({
            projectRoot,
            attemptId,
            expectedPhase: 'DURABLE',
            next: {
                ...journal,
                phase: 'POST_APPLICATION',
                resumePhase: 'REPOSITORY_CREATION',
            },
        });
        journal = readBootstrapJournal({projectRoot, attemptId});
    }
    if (fs.lstatSync(gitPath, {throwIfNoEntry: false}) !== undefined) {
        const repository = validateCreatedRepository(
            projectRoot,
            runGit,
            repositoryEnvironment(env, '/dev/null')
        );
        cleanupInterruptedOperation(attemptRoot, attemptId);
        transitionBootstrapJournal({
            projectRoot,
            attemptId,
            expectedPhase: 'POST_APPLICATION',
            next: {
                ...journal,
                resumePhase: 'HOOK_ACTIVATION',
                repository,
            },
        });
        return Object.freeze({
            status: 'GO',
            disposition: 'REPOSITORY_CREATED',
            checks: Object.freeze([Object.freeze({
                id: 'bootstrap-repository',
                status: 'PASS',
                message: 'agent-started repository creation was reconciled',
            })]),
            data: Object.freeze({
                attempt: Object.freeze({id: attemptId}),
                planDigest,
                repository,
                resumePhase: 'HOOK_ACTIVATION',
            }),
        });
    }
    const lockPath = path.join(attemptRoot, 'repository.lock');
    const templateRoot = path.join(attemptRoot, 'git-template');
    const emptyConfig = path.join(attemptRoot, 'git-global.config');
    const lockContents = Buffer.from(`${JSON.stringify({schemaVersion: 1, attemptId})}\n`);
    fs.writeFileSync(lockPath, lockContents, {flag: 'wx', mode: 0o600});
    const lock = ownedFile(lockPath, lockContents);
    let template;
    let globalConfig;
    try {
        fs.mkdirSync(templateRoot, {mode: 0o700});
        template = {path: templateRoot, stat: fs.lstatSync(templateRoot)};
        fs.writeFileSync(emptyConfig, '', {flag: 'wx', mode: 0o600});
        globalConfig = ownedFile(emptyConfig, Buffer.alloc(0));
        const gitEnv = repositoryEnvironment(env, emptyConfig);
        const containing = invoke(runGit, projectRoot, gitEnv, ['rev-parse', '--show-toplevel']);
        if (containing.status === 0 || containing.error) {
            throw new Error('project belongs to an existing repository');
        }
        fault({name: 'before-init', projectRoot});
        const currentProject = fs.lstatSync(projectRoot);
        if (
            currentProject.isSymbolicLink() ||
            !currentProject.isDirectory() ||
            currentProject.dev !== projectIdentity.dev ||
            currentProject.ino !== projectIdentity.ino
        ) {
            throw new Error('project root changed');
        }
        if (fs.lstatSync(path.join(projectRoot, '.git'), {throwIfNoEntry: false}) !== undefined) {
            throw new Error('repository state changed');
        }
        requireSuccess(invoke(runGit, projectRoot, gitEnv, [
            'init', '--initial-branch=develop', '--object-format=sha1', '--ref-format=files',
            `--template=${templateRoot}`, projectRoot,
        ]), 'repository initialization failed');
        fault({name: 'after-init', projectRoot});
        const repository = validateCreatedRepository(projectRoot, runGit, gitEnv);
        transitionBootstrapJournal({
            projectRoot,
            attemptId,
            expectedPhase: 'POST_APPLICATION',
            next: {
                ...journal,
                phase: 'POST_APPLICATION',
                resumePhase: 'HOOK_ACTIVATION',
                repository,
            },
        });
        return Object.freeze({
            status: 'GO',
            disposition: 'REPOSITORY_CREATED',
            checks: Object.freeze([Object.freeze({
                id: 'bootstrap-repository',
                status: 'PASS',
                message: 'durable project repository was created deterministically',
            })]),
            data: Object.freeze({
                attempt: Object.freeze({id: attemptId}),
                planDigest,
                repository,
                resumePhase: 'HOOK_ACTIVATION',
            }),
        });
    } finally {
        if (template !== undefined) removeOwnedDirectory(template);
        if (globalConfig !== undefined) removeOwnedFile(globalConfig);
        removeOwnedFile(lock);
    }
}

module.exports = {createBootstrapRepository};

// vim: ft=javascript sts=4 sw=4 ts=4 et :
