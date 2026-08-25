// $KYAULabs: prism-tool-bootstrap-seed.test.js kyau@aura.kyaulabs 2026/08/24 -0700 Exp $

'use strict';

const assert = require('node:assert/strict');
const {execFileSync} = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const {makeTempDir} = require('./helpers');
const {main} = require('../../packages/prism-core/scripts/prism-tool/cli');
const {
    completeBootstrapSeed,
    validateActiveBootstrapSeed,
} = require('../../packages/prism-core/scripts/prism-tool/bootstrap-seed');
const {runBounded} = require('../../packages/prism-core/scripts/prism-tool/process');

const ATTEMPT_ID = '12345678-1234-4123-8123-123456789abc';
const CORE_ROOT = path.resolve(__dirname, '../../packages/prism-core');
const ADAPTER_ROOT = path.resolve(__dirname, '../../packages/prism-php-web');
const ADAPTER_CONTRACT = JSON.parse(
    fs.readFileSync(path.join(ADAPTER_ROOT, 'toolchain.json'), 'utf8')
);

function captureWrites(action) {
    let stdout = '';
    let stderr = '';
    const stdoutWrite = process.stdout.write;
    const stderrWrite = process.stderr.write;
    process.stdout.write = (chunk) => {
        stdout += chunk;
        return true;
    };
    process.stderr.write = (chunk) => {
        stderr += chunk;
        return true;
    };
    try {
        return {status: action(), stdout, stderr};
    } finally {
        process.stdout.write = stdoutWrite;
        process.stderr.write = stderrWrite;
    }
}

async function captureAsyncWrites(action) {
    let stdout = '';
    let stderr = '';
    const stdoutWrite = process.stdout.write;
    const stderrWrite = process.stderr.write;
    process.stdout.write = (chunk) => {
        stdout += chunk;
        return true;
    };
    process.stderr.write = (chunk) => {
        stderr += chunk;
        return true;
    };
    try {
        return {status: await action(), stdout, stderr};
    } finally {
        process.stdout.write = stdoutWrite;
        process.stderr.write = stderrWrite;
    }
}

function planProject(projectRoot) {
    return captureWrites(() => main([
        'setup', 'project', 'plan', '--source=blank', '--adapter=core-only', '--json',
    ], {
        projectRoot,
        coreRoot: CORE_ROOT,
        input: JSON.stringify({
            schemaVersion: 1,
            displayName: 'Seed Project',
            summary: 'A deterministic Core-only seed project.',
        }),
        randomUUID: () => ATTEMPT_ID,
    }));
}

function bootstrapRunner(projectRoot) {
    return (command, args, options) => {
        if (command === '/usr/bin/pi') {
            fs.writeFileSync(
                path.join(projectRoot, '.pi', 'settings.json'),
                `${JSON.stringify({packages: [ADAPTER_ROOT]}, null, 2)}\n`
            );
        }
        if (command === 'composer' && args[0] === 'update') {
            const packages = ADAPTER_CONTRACT.components
                .filter(({ecosystem}) => ecosystem === 'composer')
                .map(({package: packageName, version}) => ({name: packageName, version}));
            fs.writeFileSync(
                path.join(options.cwd, 'composer.lock'),
                `${JSON.stringify({packages: [], 'packages-dev': packages})}\n`
            );
        }
        if (command === 'npm' && args[0] === 'install') {
            const packages = Object.fromEntries(ADAPTER_CONTRACT.components
                .filter(({ecosystem}) => ecosystem === 'npm')
                .map(({package: packageName, version}) => [
                    `node_modules/${packageName}`,
                    {version},
                ]));
            fs.writeFileSync(
                path.join(options.cwd, 'package-lock.json'),
                `${JSON.stringify({lockfileVersion: 3, packages: {'': {}, ...packages}})}\n`
            );
        }
        if (command === 'composer' && args[0] === 'audit') {
            return {status: 0, stdout: '{"advisories":[]}', stderr: '', error: undefined};
        }
        if (command === 'npm' && args[0] === 'audit') {
            return {
                status: 0,
                stdout: '{"metadata":{"vulnerabilities":{"info":0,"low":0,"moderate":0,"high":0,"critical":0}},"vulnerabilities":{}}',
                stderr: '',
                error: undefined,
            };
        }
        return {status: 0, stdout: '', stderr: '', error: undefined};
    };
}

function installedGraphRunner(projectRoot) {
    const commandVersions = new Map(ADAPTER_CONTRACT.components
        .filter(({kind}) => kind === 'command')
        .map(({executable, version}) => [executable, version]));
    return (command, args) => {
        if (command === 'composer' && args[0] === 'install') {
            const binRoot = path.join(projectRoot, 'vendor', 'bin');
            fs.mkdirSync(binRoot, {recursive: true});
            for (const {ecosystem, kind, executable} of ADAPTER_CONTRACT.components) {
                if (ecosystem !== 'composer' || kind !== 'command') continue;
                fs.writeFileSync(path.join(binRoot, executable), '#!/usr/bin/env php\n', {mode: 0o755});
            }
        }
        if (command === 'npm' && args[0] === 'ci') {
            const binRoot = path.join(projectRoot, 'node_modules', '.bin');
            fs.mkdirSync(binRoot, {recursive: true});
            for (const {ecosystem, kind, executable} of ADAPTER_CONTRACT.components) {
                if (ecosystem !== 'npm' || kind !== 'command') continue;
                fs.writeFileSync(path.join(binRoot, executable), '#!/usr/bin/env node\n', {mode: 0o755});
            }
        }
        if (command === 'composer' && args[0] === 'audit') {
            return {status: 0, stdout: '{"advisories":[]}', stderr: '', error: undefined};
        }
        if (command === 'npm' && args[0] === 'audit') {
            return {
                status: 0,
                stdout: '{"metadata":{"vulnerabilities":{"info":0,"low":0,"moderate":0,"high":0,"critical":0}},"vulnerabilities":{}}',
                stderr: '',
                error: undefined,
            };
        }
        const version = commandVersions.get(path.basename(command));
        return {
            status: 0,
            stdout: version === undefined ? '' : `${version}\n`,
            stderr: '',
            error: undefined,
        };
    };
}

function planSelectedProject(projectRoot, context = {}) {
    const run = context.run ?? bootstrapRunner(projectRoot);
    const selected = captureWrites(() => main([
        'setup', 'adapter', 'select', '--adapter=php-web', '--source=blank',
        '--network-approved=yes', '--json',
    ], {
        projectRoot,
        coreRoot: CORE_ROOT,
        piExecutable: '/usr/bin/pi',
        randomUUID: () => ATTEMPT_ID,
        run,
    }));
    assert.equal(selected.status, 0, selected.stderr || selected.stdout);
    return captureWrites(() => main([
        'setup', 'project', 'plan', '--source=blank',
        '--adapter=@kyaulabs/prism-php-web', `--attempt=${ATTEMPT_ID}`, '--json',
    ], {
        projectRoot,
        coreRoot: CORE_ROOT,
        input: JSON.stringify({
            schemaVersion: 1,
            displayName: 'Selected Seed Project',
            summary: 'A deterministic selected-adapter seed project.',
        }),
        run,
    }));
}

function applyProject(projectRoot, planDigest, context = {}) {
    return captureWrites(() => main([
        'setup', 'project', 'apply', `--attempt=${ATTEMPT_ID}`,
        `--digest=${planDigest}`, '--approval=yes', '--json',
    ], {projectRoot, coreRoot: CORE_ROOT, ...context}));
}

function createRepository(projectRoot, planDigest, context = {}) {
    return captureWrites(() => main([
        'setup', 'repository', 'create', `--attempt=${ATTEMPT_ID}`,
        `--digest=${planDigest}`, '--json',
    ], {projectRoot, coreRoot: CORE_ROOT, ...context}));
}

function inspectHooks(projectRoot, planDigest, context = {}) {
    return captureWrites(() => main([
        'setup', 'hooks', 'inspect', `--attempt=${ATTEMPT_ID}`,
        `--digest=${planDigest}`, '--json',
    ], {projectRoot, coreRoot: CORE_ROOT, ...context}));
}

function applyHooks(projectRoot, planDigest, context = {}) {
    return captureWrites(() => main([
        'setup', 'hooks', 'apply', `--attempt=${ATTEMPT_ID}`,
        `--digest=${planDigest}`, '--approval=yes', '--json',
    ], {projectRoot, coreRoot: CORE_ROOT, ...context}));
}

function git(projectRoot, args) {
    return execFileSync('git', ['-C', projectRoot, ...args], {encoding: 'utf8'}).trim();
}

function readyRepository(t) {
    const projectRoot = makeTempDir();
    t.after(() => fs.rmSync(projectRoot, {recursive: true, force: true}));
    const plan = JSON.parse(planProject(projectRoot).stdout);
    assert.equal(applyProject(projectRoot, plan.planDigest).status, 0);
    assert.equal(createRepository(projectRoot, plan.planDigest).status, 0);
    return {projectRoot, plan};
}

function readyHooks(t) {
    const ready = readyRepository(t);
    assert.equal(applyHooks(ready.projectRoot, ready.plan.planDigest).status, 0);
    return ready;
}

function readySelectedHooks(t) {
    const projectRoot = makeTempDir();
    t.after(() => fs.rmSync(projectRoot, {recursive: true, force: true}));
    const planned = planSelectedProject(projectRoot);
    assert.equal(planned.status, 0, planned.stderr || planned.stdout);
    const plan = JSON.parse(planned.stdout);
    assert.equal(applyProject(projectRoot, plan.planDigest, {
        run: installedGraphRunner(projectRoot),
    }).status, 0);
    assert.equal(createRepository(projectRoot, plan.planDigest).status, 0);
    assert.equal(applyHooks(projectRoot, plan.planDigest).status, 0);
    return {projectRoot, plan};
}

function prepareSeed(projectRoot, planDigest, context = {}) {
    const runTool = context.bootstrapSeedToolRun ?? ((command, args, options) => {
        if (command === process.execPath && args.includes('doctor')) {
            return {status: 0, stdout: '', stderr: '', error: undefined};
        }
        return runBounded(command, args, options);
    });
    return captureWrites(() => main([
        'setup', 'seed', 'prepare', `--attempt=${ATTEMPT_ID}`,
        `--digest=${planDigest}`, '--json',
    ], {
        projectRoot,
        coreRoot: CORE_ROOT,
        ...context,
        bootstrapSeedToolRun: runTool,
    }));
}

function selectedSeedToolRunner({qualityStatus = 0, invocations = null, onQuality = null} = {}) {
    return (command, args, options) => {
        if (invocations !== null) invocations.push({command, args});
        if (command === process.execPath && args.includes('doctor')) {
            return {status: 0, stdout: '', stderr: '', error: undefined};
        }
        if (command.endsWith('/.github/scripts/check-php.sh')) {
            if (onQuality !== null) onQuality({command, args, cwd: options.cwd});
            return {status: qualityStatus, stdout: '', stderr: '', error: undefined};
        }
        return runBounded(command, args, options);
    };
}

function stagedNames(projectRoot) {
    return execFileSync('git', [
        '-C', projectRoot, 'diff', '--cached', '--name-only', '-z',
    ]).toString('utf8').split('\0').filter(Boolean).sort();
}

function runHook(projectRoot, event, args = [], context = {}) {
    return captureWrites(() => main(['hook', event, ...args], {
        projectRoot,
        coreRoot: CORE_ROOT,
        ...context,
    }));
}

function hookRunWithReadiness(invocations = []) {
    return (command, args, options) => {
        invocations.push({command, args, cwd: options.cwd});
        if (command === process.execPath && args.includes('doctor')) {
            return {status: 0, stdout: '', stderr: '', error: undefined};
        }
        return runBounded(command, args, options);
    };
}

function createCommit(projectRoot, parents = [], message = 'test commit', indexTree = false) {
    const tree = git(projectRoot, [indexTree ? 'write-tree' : 'mktree']);
    return execFileSync('git', [
        '-C', projectRoot, 'commit-tree', tree,
        ...parents.flatMap((parent) => ['-p', parent]),
    ], {
        encoding: 'utf8',
        input: `${message}\n`,
        env: {
            ...process.env,
            GIT_AUTHOR_NAME: 'Test Author',
            GIT_AUTHOR_EMAIL: 'test@example.invalid',
            GIT_COMMITTER_NAME: 'Test Committer',
            GIT_COMMITTER_EMAIL: 'test@example.invalid',
        },
    }).trim();
}

test('creates an eligible unborn develop repository only after durable application', (t) => {
    const projectRoot = makeTempDir();
    t.after(() => fs.rmSync(projectRoot, {recursive: true, force: true}));
    const planned = planProject(projectRoot);
    const plan = JSON.parse(planned.stdout);
    const applied = applyProject(projectRoot, plan.planDigest);

    assert.equal(planned.status, 0);
    assert.equal(applied.status, 0);
    assert.equal(fs.existsSync(path.join(projectRoot, '.git')), false);

    const result = createRepository(projectRoot, plan.planDigest);

    assert.equal(result.status, 0);
    const report = JSON.parse(result.stdout);
    assert.equal(result.stderr, '');
    assert.equal(report.status, 'GO');
    assert.equal(report.disposition, 'REPOSITORY_CREATED');
    assert.equal(report.data.resumePhase, 'HOOK_ACTIVATION');
    assert.equal(git(projectRoot, ['symbolic-ref', 'HEAD']), 'refs/heads/develop');
    assert.equal(git(projectRoot, ['remote']), '');
    assert.equal(git(projectRoot, ['rev-parse', '--show-object-format=storage']), 'sha1');
    assert.equal(git(projectRoot, ['rev-parse', '--show-ref-format']), 'files');
    assert.throws(
        () => execFileSync('git', ['-C', projectRoot, 'rev-parse', '--verify', 'HEAD'], {
            stdio: 'pipe',
        }),
        {status: 128}
    );
    const attemptRoot = path.dirname(path.dirname(plan.data.planPath));
    const journal = JSON.parse(fs.readFileSync(path.join(attemptRoot, 'journal.json'), 'utf8'));
    assert.equal(journal.phase, 'POST_APPLICATION');
    assert.equal(journal.resumePhase, 'HOOK_ACTIVATION');
    assert.equal(journal.repository.disposition, 'CREATE');
    assert.equal(journal.hooks, null);
    assert.equal(journal.seed, null);
});

test('creates a repository after durable selected-adapter dependency state', (t) => {
    const projectRoot = makeTempDir();
    t.after(() => fs.rmSync(projectRoot, {recursive: true, force: true}));
    const planned = planSelectedProject(projectRoot);
    assert.equal(planned.status, 0, planned.stderr || planned.stdout);
    const plan = JSON.parse(planned.stdout);
    const applied = applyProject(projectRoot, plan.planDigest, {
        run: installedGraphRunner(projectRoot),
    });
    assert.equal(applied.status, 0, applied.stderr || applied.stdout);

    const result = createRepository(projectRoot, plan.planDigest);

    assert.equal(result.status, 0, result.stderr || result.stdout);
    assert.equal(JSON.parse(result.stdout).data.resumePhase, 'HOOK_ACTIVATION');
    assert.equal(fs.existsSync(path.join(projectRoot, 'vendor')), true);
    assert.equal(fs.existsSync(path.join(projectRoot, 'node_modules')), true);
});

test('resumes an exact agent-started repository after interruption', (t) => {
    const projectRoot = makeTempDir();
    t.after(() => fs.rmSync(projectRoot, {recursive: true, force: true}));
    const plan = JSON.parse(planProject(projectRoot).stdout);
    assert.equal(applyProject(projectRoot, plan.planDigest).status, 0);

    const interrupted = createRepository(projectRoot, plan.planDigest, {
        bootstrapRepositoryFault(event) {
            if (event.name === 'after-init') throw new Error('simulated interruption');
        },
    });
    assert.equal(interrupted.status, 5);
    const initial = fs.lstatSync(path.join(projectRoot, '.git'));
    const attemptRoot = path.dirname(path.dirname(plan.data.planPath));
    fs.writeFileSync(
        path.join(attemptRoot, 'repository.lock'),
        `${JSON.stringify({schemaVersion: 1, attemptId: ATTEMPT_ID})}\n`,
        {mode: 0o600}
    );
    fs.mkdirSync(path.join(attemptRoot, 'git-template'), {mode: 0o700});
    fs.writeFileSync(path.join(attemptRoot, 'git-global.config'), '', {mode: 0o600});

    const resumed = createRepository(projectRoot, plan.planDigest);

    assert.equal(resumed.status, 0, resumed.stderr);
    assert.equal(fs.existsSync(path.join(attemptRoot, 'repository.lock')), false);
    assert.equal(fs.existsSync(path.join(attemptRoot, 'git-template')), false);
    assert.equal(fs.existsSync(path.join(attemptRoot, 'git-global.config')), false);
    const current = fs.lstatSync(path.join(projectRoot, '.git'));
    assert.equal(current.dev, initial.dev);
    assert.equal(current.ino, initial.ino);
    assert.equal(JSON.parse(resumed.stdout).data.resumePhase, 'HOOK_ACTIVATION');
});

test('resumes exact operation evidence retained before repository initialization', (t) => {
    const projectRoot = makeTempDir();
    t.after(() => fs.rmSync(projectRoot, {recursive: true, force: true}));
    const plan = JSON.parse(planProject(projectRoot).stdout);
    assert.equal(applyProject(projectRoot, plan.planDigest).status, 0);
    const interrupted = createRepository(projectRoot, plan.planDigest, {
        bootstrapRepositoryFault(event) {
            if (event.name === 'before-init') throw new Error('simulated interruption');
        },
    });
    assert.equal(interrupted.status, 5);
    assert.equal(fs.existsSync(path.join(projectRoot, '.git')), false);
    const attemptRoot = path.dirname(path.dirname(plan.data.planPath));
    fs.writeFileSync(
        path.join(attemptRoot, 'repository.lock'),
        `${JSON.stringify({schemaVersion: 1, attemptId: ATTEMPT_ID})}\n`,
        {mode: 0o600}
    );
    fs.mkdirSync(path.join(attemptRoot, 'git-template'), {mode: 0o700});
    fs.writeFileSync(path.join(attemptRoot, 'git-global.config'), '', {mode: 0o600});

    const resumed = createRepository(projectRoot, plan.planDigest);

    assert.equal(resumed.status, 0, resumed.stderr);
    assert.equal(fs.existsSync(path.join(projectRoot, '.git')), true);
    assert.equal(fs.existsSync(path.join(attemptRoot, 'repository.lock')), false);
    assert.equal(fs.existsSync(path.join(attemptRoot, 'git-template')), false);
    assert.equal(fs.existsSync(path.join(attemptRoot, 'git-global.config')), false);
});

test('removes inherited Git configuration injection during repository creation', (t) => {
    const projectRoot = makeTempDir();
    t.after(() => fs.rmSync(projectRoot, {recursive: true, force: true}));
    const plan = JSON.parse(planProject(projectRoot).stdout);
    assert.equal(applyProject(projectRoot, plan.planDigest).status, 0);

    const injected = {
        ...process.env,
        GIT_CONFIG_COUNT: '1',
        GIT_CONFIG_KEY_0: 'core.bare',
        GIT_CONFIG_VALUE_0: 'true',
        GIT_CONFIG_PARAMETERS: "'core.hooksPath'='ambient-hooks'",
    };
    const result = createRepository(projectRoot, plan.planDigest, {
        env: injected,
        bootstrapGitRun(command, args, options) {
            if (
                Object.keys(options.env).some((name) =>
                    name === 'GIT_CONFIG_COUNT' ||
                    name === 'GIT_CONFIG_PARAMETERS' ||
                    /^GIT_CONFIG_(?:KEY|VALUE)_\d+$/.test(name)
                )
            ) return {status: 1, stdout: '', stderr: '', error: undefined};
            return runBounded(command, args, options);
        },
    });

    assert.equal(result.status, 0, result.stderr);
    assert.equal(git(projectRoot, ['config', '--local', '--get', 'core.bare']), 'false');
    assert.throws(() => execFileSync(
        'git', ['-C', projectRoot, 'config', '--local', '--get', 'core.hooksPath'],
        {stdio: 'pipe'}
    ), {status: 1});
});

test('keeps successful setup reports structured when final root canonicalization races', (t) => {
    const projectRoot = makeTempDir();
    t.after(() => fs.rmSync(projectRoot, {recursive: true, force: true}));
    const plan = JSON.parse(planProject(projectRoot).stdout);
    assert.equal(applyProject(projectRoot, plan.planDigest).status, 0);
    const originalRealpath = fs.realpathSync;
    fs.realpathSync = function raceFinalReport(filePath, ...args) {
        const stack = new Error().stack ?? '';
        if (
            filePath === projectRoot &&
            stack.includes('setup (') &&
            !stack.includes('createBootstrapRepository') &&
            !stack.includes('readBootstrapJournal') &&
            !stack.includes('transitionBootstrapJournal')
        ) throw new Error('simulated final report race');
        return originalRealpath.call(this, filePath, ...args);
    };
    try {
        const result = createRepository(projectRoot, plan.planDigest);
        assert.equal(result.status, 0, result.stderr);
        assert.equal(JSON.parse(result.stdout).projectRoot, path.resolve(projectRoot));
    } finally {
        fs.realpathSync = originalRealpath;
    }
});

test('inspects and activates canonical hooks without rewriting wrappers', (t) => {
    const projectRoot = makeTempDir();
    t.after(() => fs.rmSync(projectRoot, {recursive: true, force: true}));
    const plan = JSON.parse(planProject(projectRoot).stdout);
    assert.equal(applyProject(projectRoot, plan.planDigest).status, 0);
    assert.equal(createRepository(projectRoot, plan.planDigest).status, 0);
    const events = ['commit-msg', 'pre-commit', 'pre-push', 'prepare-commit-msg'];
    const initial = new Map(events.map((event) => [
        event,
        fs.lstatSync(path.join(projectRoot, '.github', 'hooks', event)),
    ]));

    const inspected = inspectHooks(projectRoot, plan.planDigest);

    assert.equal(inspected.status, 0);
    const inspection = JSON.parse(inspected.stdout);
    assert.equal(inspection.status, 'GO');
    assert.equal(inspection.disposition, 'HOOKS_READY');
    assert.equal(inspection.data.activeHooksPath, null);
    assert.deepEqual(
        inspection.data.hooks,
        events.map((event) => ({event, path: `.github/hooks/${event}`, disposition: 'PRESERVE'}))
    );
    assert.throws(() => execFileSync(
        'git', ['-C', projectRoot, 'config', '--local', '--get', 'core.hooksPath'],
        {stdio: 'pipe'}
    ), {status: 1});

    const applied = applyHooks(projectRoot, plan.planDigest);

    assert.equal(applied.status, 0);
    const report = JSON.parse(applied.stdout);
    assert.equal(report.status, 'GO');
    assert.equal(report.disposition, 'HOOKS_ACTIVE');
    assert.equal(report.data.hooks.hooksPath, '.github/hooks');
    assert.equal(git(projectRoot, ['config', '--local', '--get', 'core.hooksPath']), '.github/hooks');
    for (const event of events) {
        const current = fs.lstatSync(path.join(projectRoot, '.github', 'hooks', event));
        assert.equal(current.dev, initial.get(event).dev);
        assert.equal(current.ino, initial.get(event).ino);
        assert.equal(current.mtimeMs, initial.get(event).mtimeMs);
    }
    const attemptRoot = path.dirname(path.dirname(plan.data.planPath));
    const journal = JSON.parse(fs.readFileSync(path.join(attemptRoot, 'journal.json'), 'utf8'));
    assert.equal(journal.phase, 'POST_APPLICATION');
    assert.equal(journal.resumePhase, 'ROOT_SEED_PREPARATION');
    assert.equal(journal.hooks.disposition, 'ACTIVE');
    assert.equal(journal.hooks.hooksPath, '.github/hooks');
    const configPath = path.join(projectRoot, '.git', 'config');
    const activeConfig = fs.lstatSync(configPath);

    const resumed = applyHooks(projectRoot, plan.planDigest);

    assert.equal(resumed.status, 0);
    assert.equal(JSON.parse(resumed.stdout).disposition, 'HOOKS_ACTIVE');
    const resumedConfig = fs.lstatSync(configPath);
    assert.equal(resumedConfig.dev, activeConfig.dev);
    assert.equal(resumedConfig.ino, activeConfig.ino);
    assert.equal(resumedConfig.mtimeMs, activeConfig.mtimeMs);
});

test('rejects conflicting hook inventories and effective configuration without writes', async (t) => {
    const cases = [
        {
            name: 'changed canonical bytes',
            mutate(projectRoot) {
                fs.appendFileSync(path.join(projectRoot, '.github', 'hooks', 'pre-commit'), '# drift\n');
            },
        },
        {
            name: 'canonical mode drift',
            mutate(projectRoot) {
                fs.chmodSync(path.join(projectRoot, '.github', 'hooks', 'pre-push'), 0o644);
            },
        },
        {
            name: 'symlinked canonical wrapper',
            mutate(projectRoot) {
                const hookPath = path.join(projectRoot, '.github', 'hooks', 'commit-msg');
                fs.unlinkSync(hookPath);
                fs.symlinkSync(path.join(CORE_ROOT, 'config', 'bootstrap', 'hooks', 'commit-msg'), hookPath);
            },
        },
        {
            name: 'non-regular canonical wrapper',
            mutate(projectRoot) {
                const hookPath = path.join(projectRoot, '.github', 'hooks', 'prepare-commit-msg');
                fs.unlinkSync(hookPath);
                fs.mkdirSync(hookPath);
            },
        },
        {
            name: 'unknown canonical wrapper',
            mutate(projectRoot) {
                fs.writeFileSync(path.join(projectRoot, '.github', 'hooks', 'post-commit'), '#!/bin/sh\n');
            },
        },
        {
            name: 'active legacy hook',
            mutate(projectRoot) {
                const hooksRoot = path.join(projectRoot, '.git', 'hooks');
                fs.mkdirSync(hooksRoot);
                fs.writeFileSync(path.join(hooksRoot, 'pre-commit'), '#!/bin/sh\n', {mode: 0o755});
            },
        },
        {
            name: 'differing local hooks path',
            mutate(projectRoot) {
                execFileSync('git', ['-C', projectRoot, 'config', '--local', 'core.hooksPath', 'human-hooks']);
            },
        },
    ];
    for (const scenario of cases) {
        await t.test(scenario.name, (nested) => {
            const {projectRoot, plan} = readyRepository(nested);
            scenario.mutate(projectRoot);
            const configPath = path.join(projectRoot, '.git', 'config');
            const before = fs.readFileSync(configPath);

            const result = inspectHooks(projectRoot, plan.planDigest);

            assert.equal(result.status, 5);
            assert.equal(JSON.parse(result.stdout).disposition, 'HOOKS_CONFLICT');
            assert.equal(fs.readFileSync(configPath).equals(before), true);
        });
    }
});

test('rejects ambient hook configuration and literal-approval bypasses', (t) => {
    const {projectRoot, plan} = readyRepository(t);
    const ambient = inspectHooks(projectRoot, plan.planDigest, {
        env: {
            ...process.env,
            GIT_CONFIG_COUNT: '1',
            GIT_CONFIG_KEY_0: 'core.hooksPath',
            GIT_CONFIG_VALUE_0: 'ambient-hooks',
        },
    });
    assert.equal(ambient.status, 5);
    assert.throws(() => execFileSync(
        'git', ['-C', projectRoot, 'config', '--local', '--get', 'core.hooksPath'],
        {stdio: 'pipe'}
    ), {status: 1});

    const bypass = captureWrites(() => main([
        'setup', 'hooks', 'apply', `--attempt=${ATTEMPT_ID}`,
        `--digest=${plan.planDigest}`, '--approval=true', '--json',
    ], {projectRoot, coreRoot: CORE_ROOT}));
    assert.equal(bypass.status, 2);
    assert.throws(() => execFileSync(
        'git', ['-C', projectRoot, 'config', '--local', '--get', 'core.hooksPath'],
        {stdio: 'pipe'}
    ), {status: 1});
});

test('rejects repository configuration substitution before activation', (t) => {
    const {projectRoot, plan} = readyRepository(t);
    const configPath = path.join(projectRoot, '.git', 'config');
    const originalPath = path.join(projectRoot, '.git', 'config.original');
    const original = fs.readFileSync(configPath);

    const result = applyHooks(projectRoot, plan.planDigest, {
        bootstrapHooksFault(event) {
            if (event.name === 'before-config') {
                fs.renameSync(configPath, originalPath);
                fs.writeFileSync(configPath, original);
            }
        },
    });

    assert.equal(result.status, 5);
    assert.equal(fs.readFileSync(configPath).equals(original), true);
    assert.equal(fs.readFileSync(originalPath).equals(original), true);
    assert.throws(() => execFileSync(
        'git', ['-C', projectRoot, 'config', '--local', '--get', 'core.hooksPath'],
        {stdio: 'pipe'}
    ), {status: 1});
});

test('preserves repository configuration when hook activation fails', (t) => {
    const {projectRoot, plan} = readyRepository(t);
    const configPath = path.join(projectRoot, '.git', 'config');
    const initial = fs.readFileSync(configPath);
    const failingGit = (command, args, options) => {
        if (args.join(' ') === 'config --local core.hooksPath .github/hooks') {
            return {status: 1, stdout: '', stderr: '', error: undefined};
        }
        return runBounded(command, args, options);
    };

    const result = applyHooks(projectRoot, plan.planDigest, {bootstrapGitRun: failingGit});

    assert.equal(result.status, 5);
    assert.equal(fs.readFileSync(configPath).equals(initial), true);
});

test('rolls back only its hook value after concurrent configuration change', (t) => {
    const {projectRoot, plan} = readyRepository(t);

    const result = applyHooks(projectRoot, plan.planDigest, {
        bootstrapHooksFault(event) {
            if (event.name === 'after-config') {
                execFileSync('git', [
                    '-C', projectRoot, 'config', '--local', 'user.name', 'Concurrent Human',
                ]);
            }
        },
    });

    assert.equal(result.status, 5);
    assert.equal(git(projectRoot, ['config', '--local', '--get', 'user.name']), 'Concurrent Human');
    assert.throws(() => execFileSync(
        'git', ['-C', projectRoot, 'config', '--local', '--get', 'core.hooksPath'],
        {stdio: 'pipe'}
    ), {status: 1});
    const attemptRoot = path.dirname(path.dirname(plan.data.planPath));
    const journal = JSON.parse(fs.readFileSync(path.join(attemptRoot, 'journal.json'), 'utf8'));
    assert.equal(journal.resumePhase, 'HOOK_ACTIVATION');
    assert.equal(journal.hooks, null);
});

test('fails closed when hook configuration changes before journal publication', (t) => {
    const {projectRoot, plan} = readyRepository(t);

    const result = applyHooks(projectRoot, plan.planDigest, {
        bootstrapHooksFault(event) {
            if (event.name === 'before-journal') {
                execFileSync('git', [
                    '-C', projectRoot, 'config', '--local', 'core.hooksPath', 'human-hooks',
                ]);
            }
        },
    });

    assert.equal(result.status, 5);
    assert.equal(git(projectRoot, ['config', '--local', '--get', 'core.hooksPath']), 'human-hooks');
});

test('preserves active hook configuration when journal evidence becomes unreadable', (t) => {
    const {projectRoot, plan} = readyRepository(t);
    const attemptRoot = path.dirname(path.dirname(plan.data.planPath));
    const journalPath = path.join(attemptRoot, 'journal.json');

    const result = applyHooks(projectRoot, plan.planDigest, {
        bootstrapHooksFault(event) {
            if (event.name === 'after-journal') fs.writeFileSync(journalPath, '{}\n');
        },
    });

    assert.equal(result.status, 5);
    assert.equal(
        git(projectRoot, ['config', '--local', '--get', 'core.hooksPath']),
        '.github/hooks'
    );
    assert.equal(fs.readFileSync(journalPath, 'utf8'), '{}\n');
});

test('reads canonical hooks through a bounded descriptor loop', (t) => {
    const {projectRoot, plan} = readyRepository(t);
    const originalRead = fs.readFileSync;
    fs.readFileSync = function rejectUnboundedHookDescriptor(target, ...args) {
        if (Number.isInteger(target) && (new Error().stack ?? '').includes('readRegularExecutable')) {
            throw new Error('unbounded hook descriptor read');
        }
        return originalRead.call(this, target, ...args);
    };
    try {
        assert.equal(inspectHooks(projectRoot, plan.planDigest).status, 0);
    } finally {
        fs.readFileSync = originalRead;
    }
});

test('stages and attests the exact Core-only seed', (t) => {
    const {projectRoot, plan} = readyHooks(t);
    fs.writeFileSync(path.join(projectRoot, 'human-note.txt'), 'leave unstaged\n');

    const result = prepareSeed(projectRoot, plan.planDigest);

    assert.equal(result.status, 0, result.stderr);
    const report = JSON.parse(result.stdout);
    assert.equal(report.status, 'GO');
    assert.equal(report.disposition, 'SEED_READY');
    assert.deepEqual(report.data.commit, {
        type: 'ignore',
        scope: null,
        subject: 'bootstrap prism project',
    });
    assert.deepEqual(stagedNames(projectRoot), plan.outputs.map(({path: name}) => name).sort());
    assert.equal(fs.existsSync(path.join(projectRoot, 'human-note.txt')), true);
    assert.equal(stagedNames(projectRoot).includes('human-note.txt'), false);
    const attemptRoot = path.dirname(path.dirname(plan.data.planPath));
    const attestationPath = path.join(attemptRoot, 'seed-attestation.json');
    assert.equal(fs.statSync(attestationPath).mode & 0o777, 0o600);
    const attestation = JSON.parse(fs.readFileSync(attestationPath, 'utf8'));
    assert.equal(attestation.projectRoot, projectRoot);
    assert.equal(attestation.attemptId, ATTEMPT_ID);
    assert.equal(attestation.source.mode, 'BLANK');
    assert.equal(attestation.adapter, null);
    assert.equal(attestation.planDigest, plan.planDigest);
    assert.equal(attestation.repository.branch, 'develop');
    assert.equal(typeof attestation.hookInventoryDigest, 'string');
    assert.equal(typeof attestation.stagedIndexDigest, 'string');
    const journal = JSON.parse(fs.readFileSync(path.join(attemptRoot, 'journal.json'), 'utf8'));
    assert.equal(journal.resumePhase, 'ROOT_SEED_COMMIT');
    assert.equal(journal.seed.status, 'READY');
    assert.doesNotThrow(() => validateActiveBootstrapSeed({
        projectRoot,
        coreRoot: CORE_ROOT,
    }));
    const hookRun = hookRunWithReadiness();
    assert.equal(runHook(projectRoot, 'pre-commit', [], {hookRun}).status, 0);
    fs.appendFileSync(path.join(projectRoot, 'README.md'), 'index drift\n');
    execFileSync('git', ['-C', projectRoot, 'add', 'README.md']);
    assert.equal(runHook(projectRoot, 'pre-commit', [], {hookRun}).status, 1);
});

test('stages and attests selected-adapter evidence after shared quality passes', (t) => {
    const {projectRoot, plan} = readySelectedHooks(t);
    const qualityInvocations = [];
    const result = prepareSeed(projectRoot, plan.planDigest, {
        bootstrapSeedToolRun: selectedSeedToolRunner({
            onQuality: (invocation) => qualityInvocations.push(invocation),
        }),
    });

    assert.equal(result.status, 0, result.stderr || result.stdout);
    assert.equal(qualityInvocations.length, 1);
    assert.deepEqual(qualityInvocations[0].args, ['--local']);
    assert.deepEqual(stagedNames(projectRoot), [
        ...plan.outputs.map(({path: name}) => name),
        '.pi/settings.json',
    ].sort());
    assert.equal(stagedNames(projectRoot).some((name) => name.startsWith('vendor/')), false);
    assert.equal(stagedNames(projectRoot).some((name) => name.startsWith('node_modules/')), false);
    assert.equal(stagedNames(projectRoot).some((name) => name.startsWith('.pi/prism-tool/')), false);
    const attemptRoot = path.dirname(path.dirname(plan.data.planPath));
    const attestation = JSON.parse(fs.readFileSync(
        path.join(attemptRoot, 'seed-attestation.json'),
        'utf8'
    ));
    assert.deepEqual(attestation.adapter, {
        ...plan.adapter,
        reportDigest: plan.adapterReportDigest,
    });
    assert.doesNotThrow(() => validateActiveBootstrapSeed({
        projectRoot,
        coreRoot: CORE_ROOT,
    }));
});

test('blocks selected-adapter seed readiness when shared quality fails', (t) => {
    const {projectRoot, plan} = readySelectedHooks(t);
    const result = prepareSeed(projectRoot, plan.planDigest, {
        bootstrapSeedToolRun: selectedSeedToolRunner({qualityStatus: 1}),
    });

    assert.equal(result.status, 5);
    assert.deepEqual(stagedNames(projectRoot), []);
    const attemptRoot = path.dirname(path.dirname(plan.data.planPath));
    assert.equal(fs.existsSync(path.join(attemptRoot, 'seed-attestation.json')), false);
});

test('rejects selected-adapter activation mode drift without changing the staged index', (t) => {
    const {projectRoot, plan} = readySelectedHooks(t);
    const result = prepareSeed(projectRoot, plan.planDigest, {
        bootstrapSeedToolRun: selectedSeedToolRunner(),
    });
    assert.equal(result.status, 0, result.stderr || result.stdout);
    const expectedStaging = stagedNames(projectRoot);
    fs.chmodSync(
        path.join(projectRoot, '.pi', 'settings.json'),
        plan.activation.mode === 0o600 ? 0o644 : 0o600
    );

    assert.throws(() => validateActiveBootstrapSeed({
        projectRoot,
        coreRoot: CORE_ROOT,
    }), /bootstrap adapter activation is stale/);
    assert.deepEqual(stagedNames(projectRoot), expectedStaging);
});

test('rejects selected-adapter activation drift without changing the staged index', (t) => {
    const {projectRoot, plan} = readySelectedHooks(t);
    const result = prepareSeed(projectRoot, plan.planDigest, {
        bootstrapSeedToolRun: selectedSeedToolRunner(),
    });
    assert.equal(result.status, 0, result.stderr || result.stdout);
    const expectedStaging = stagedNames(projectRoot);
    fs.appendFileSync(path.join(projectRoot, '.pi', 'settings.json'), ' ');

    assert.throws(() => validateActiveBootstrapSeed({
        projectRoot,
        coreRoot: CORE_ROOT,
    }), /bootstrap adapter settings are stale/);
    assert.deepEqual(stagedNames(projectRoot), expectedStaging);
});

test('rejects substituted selected-adapter seed evidence without changing the staged index', (t) => {
    const {projectRoot, plan} = readySelectedHooks(t);
    const result = prepareSeed(projectRoot, plan.planDigest, {
        bootstrapSeedToolRun: selectedSeedToolRunner(),
    });
    assert.equal(result.status, 0, result.stderr || result.stdout);
    const expectedStaging = stagedNames(projectRoot);
    const attemptRoot = path.dirname(path.dirname(plan.data.planPath));
    const attestationPath = path.join(attemptRoot, 'seed-attestation.json');
    const attestation = JSON.parse(fs.readFileSync(attestationPath, 'utf8'));
    attestation.adapter.reportDigest = 'f'.repeat(64);
    fs.writeFileSync(attestationPath, `${JSON.stringify(attestation)}\n`, {mode: 0o600});

    assert.throws(() => validateActiveBootstrapSeed({
        projectRoot,
        coreRoot: CORE_ROOT,
    }), /bootstrap attempt state is (?:invalid|stale)|seed attestation/);
    assert.deepEqual(stagedNames(projectRoot), expectedStaging);
});

test('runs the public Blank PHP web bootstrap through seed readiness without publication', async (t) => {
    const projectRoot = makeTempDir();
    const invocations = [];
    let templateFetches = 0;
    let adapterInstallations = 0;
    t.after(() => fs.rmSync(projectRoot, {recursive: true, force: true}));

    const routed = captureWrites(() => main([
        'setup', 'route', '--source=blank', '--json',
    ], {projectRoot, coreRoot: CORE_ROOT}));
    assert.equal(routed.status, 0, routed.stderr || routed.stdout);
    assert.equal(JSON.parse(routed.stdout).route, 'BOOTSTRAP_BLANK');

    const sourced = await captureAsyncWrites(() => main([
        'setup', 'source', '--source=blank', '--json',
    ], {
        projectRoot,
        coreRoot: CORE_ROOT,
        fetch() {
            templateFetches += 1;
            throw new Error('Blank source must not access the Template network boundary');
        },
    }));
    assert.equal(sourced.status, 0, sourced.stderr || sourced.stdout);
    assert.equal(JSON.parse(sourced.stdout).source, 'BLANK');

    const prepareRun = bootstrapRunner(projectRoot);
    const planned = planSelectedProject(projectRoot, {
        run(command, args, options) {
            invocations.push({command, args});
            if (command === '/usr/bin/pi') adapterInstallations += 1;
            return prepareRun(command, args, options);
        },
    });
    assert.equal(planned.status, 0, planned.stderr || planned.stdout);
    const plan = JSON.parse(planned.stdout);

    const effectRun = installedGraphRunner(projectRoot);
    const applied = applyProject(projectRoot, plan.planDigest, {
        run(command, args, options) {
            invocations.push({command, args});
            return effectRun(command, args, options);
        },
    });
    assert.equal(applied.status, 0, applied.stderr || applied.stdout);
    assert.equal(createRepository(projectRoot, plan.planDigest).status, 0);
    assert.equal(inspectHooks(projectRoot, plan.planDigest).status, 0);
    assert.equal(applyHooks(projectRoot, plan.planDigest).status, 0);

    let qualityRuns = 0;
    const seeded = prepareSeed(projectRoot, plan.planDigest, {
        bootstrapSeedToolRun: selectedSeedToolRunner({
            invocations,
            onQuality() {
                qualityRuns += 1;
            },
        }),
    });

    assert.equal(seeded.status, 0, seeded.stderr || seeded.stdout);
    assert.equal(JSON.parse(seeded.stdout).disposition, 'SEED_READY');
    assert.equal(templateFetches, 0);
    assert.equal(adapterInstallations, 1);
    assert.equal(qualityRuns, 1);
    assert.deepEqual(stagedNames(projectRoot), [
        ...plan.outputs.map(({path: name}) => name),
        '.pi/settings.json',
    ].sort());
    assert.equal(stagedNames(projectRoot).some((name) => /^(?:vendor|node_modules|\.pi\/prism-tool)\//.test(name)), false);
    assert.equal(fs.existsSync(path.join(projectRoot, 'aurora')), false);
    assert.equal(fs.existsSync(path.join(projectRoot, 'cdn', 'sass', 'app.scss')), false);
    assert.equal(fs.existsSync(path.join(projectRoot, 'app.nginx.conf')), false);
    assert.equal(git(projectRoot, ['remote']), '');
    assert.equal(invocations.some(({command, args}) => {
        const executable = path.basename(command);
        return executable === 'gh' ||
            (executable === 'git' && ['clone', 'fetch', 'pull', 'push', 'remote'].includes(args[0])) ||
            (executable === 'npm' && ['publish', 'pack'].includes(args[0]));
    }), false);
});

test('rejects pre-staged entries and rolls back owned staging on readiness failure', async (t) => {
    await t.test('pre-staged entry', (nested) => {
        const {projectRoot, plan} = readyHooks(nested);
        fs.writeFileSync(path.join(projectRoot, 'human-note.txt'), 'human staged entry\n');
        execFileSync('git', ['-C', projectRoot, 'add', 'human-note.txt']);

        const result = prepareSeed(projectRoot, plan.planDigest);

        assert.equal(result.status, 5);
        assert.deepEqual(stagedNames(projectRoot), ['human-note.txt']);
    });
    await t.test('partial staging failure', (nested) => {
        const {projectRoot, plan} = readyHooks(nested);
        let additions = 0;
        const runGit = (command, args, options) => {
            if (args[0] === 'add' && ++additions === 2) {
                return {status: 1, stdout: '', stderr: '', error: undefined};
            }
            return runBounded(command, args, options);
        };

        const result = prepareSeed(projectRoot, plan.planDigest, {bootstrapGitRun: runGit});

        assert.equal(result.status, 5);
        assert.deepEqual(stagedNames(projectRoot), []);
    });
    await t.test('readiness failure', (nested) => {
        const {projectRoot, plan} = readyHooks(nested);

        const result = prepareSeed(projectRoot, plan.planDigest, {
            bootstrapSeedToolRun() {
                return {status: 1, stdout: '', stderr: '', error: undefined};
            },
        });

        assert.equal(result.status, 5);
        assert.deepEqual(stagedNames(projectRoot), []);
        const attemptRoot = path.dirname(path.dirname(plan.data.planPath));
        assert.equal(fs.existsSync(path.join(attemptRoot, 'seed-attestation.json')), false);
    });
});

test('preserves an ambiguously changed index during seed preparation', (t) => {
    const {projectRoot, plan} = readyHooks(t);

    const result = prepareSeed(projectRoot, plan.planDigest, {
        bootstrapSeedFault(event) {
            if (event.name === 'after-staging') {
                fs.writeFileSync(path.join(projectRoot, 'human-note.txt'), 'human staged entry\n');
                execFileSync('git', ['-C', projectRoot, 'add', 'human-note.txt']);
            }
        },
    });

    assert.equal(result.status, 5);
    assert.equal(stagedNames(projectRoot).includes('human-note.txt'), true);
    assert.equal(stagedNames(projectRoot).length, plan.outputs.length + 1);
});

test('preserves substituted seed attestation as recovery evidence', (t) => {
    const {projectRoot, plan} = readyHooks(t);
    const attemptRoot = path.dirname(path.dirname(plan.data.planPath));
    const attestationPath = path.join(attemptRoot, 'seed-attestation.json');

    const result = prepareSeed(projectRoot, plan.planDigest, {
        bootstrapSeedFault(event) {
            if (event.name === 'after-attestation') {
                fs.unlinkSync(attestationPath);
                fs.writeFileSync(attestationPath, '{}\n', {mode: 0o600});
            }
        },
    });

    assert.equal(result.status, 5);
    assert.equal(fs.readFileSync(attestationPath, 'utf8'), '{}\n');
    assert.deepEqual(stagedNames(projectRoot), plan.outputs.map(({path: name}) => name).sort());
    const journal = JSON.parse(fs.readFileSync(path.join(attemptRoot, 'journal.json'), 'utf8'));
    assert.equal(journal.resumePhase, 'ROOT_SEED_PREPARATION');
    assert.equal(journal.seed, null);
});

test('completes one attested root commit and removes only transient attempt state', (t) => {
    const {projectRoot, plan} = readyHooks(t);
    assert.equal(prepareSeed(projectRoot, plan.planDigest).status, 0);
    const active = validateActiveBootstrapSeed({projectRoot, coreRoot: CORE_ROOT});
    const rootCommit = createCommit(projectRoot, [], 'ignore: bootstrap prism project', true);
    execFileSync('git', ['-C', projectRoot, 'update-ref', 'refs/heads/develop', rootCommit]);
    const runGit = (command, args, options) => {
        if (args[0] === 'verify-commit') {
            return {status: 0, stdout: '', stderr: '', error: undefined};
        }
        return runBounded(command, args, options);
    };

    const result = completeBootstrapSeed({
        projectRoot,
        coreRoot: CORE_ROOT,
        attestation: active,
        previousHead: 'unborn',
        newHead: rootCommit,
        runGit,
    });

    assert.equal(result.status, 'COMPLETE');
    assert.equal(git(projectRoot, ['rev-list', '--count', 'HEAD']), '1');
    assert.equal(git(projectRoot, ['remote']), '');
    assert.equal(fs.existsSync(path.join(projectRoot, '.pi')), false);
    for (const entry of plan.outputs) assert.equal(fs.existsSync(path.join(projectRoot, entry.path)), true);
    assert.equal(git(projectRoot, ['status', '--porcelain=v1']), '');
});

test('retains consumed seed evidence when completion cleanup is interrupted', (t) => {
    const {projectRoot, plan} = readyHooks(t);
    assert.equal(prepareSeed(projectRoot, plan.planDigest).status, 0);
    const active = validateActiveBootstrapSeed({projectRoot, coreRoot: CORE_ROOT});
    const rootCommit = createCommit(projectRoot, [], 'ignore: bootstrap prism project', true);
    execFileSync('git', ['-C', projectRoot, 'update-ref', 'refs/heads/develop', rootCommit]);
    const runGit = (command, args, options) => args[0] === 'verify-commit'
        ? {status: 0, stdout: '', stderr: '', error: undefined}
        : runBounded(command, args, options);

    assert.throws(() => completeBootstrapSeed({
        projectRoot,
        coreRoot: CORE_ROOT,
        attestation: active,
        previousHead: 'unborn',
        newHead: rootCommit,
        runGit,
        fault(event) {
            if (event.name === 'before-cleanup-entry') throw new Error('cleanup interrupted');
        },
    }));

    const attemptRoot = path.dirname(path.dirname(plan.data.planPath));
    const journal = JSON.parse(fs.readFileSync(path.join(attemptRoot, 'journal.json'), 'utf8'));
    assert.equal(journal.phase, 'COMPLETE');
    assert.equal(journal.seed.status, 'CONSUMED');
    assert.equal(journal.seed.rootCommit, rootCommit);
    assert.equal(fs.existsSync(path.join(attemptRoot, 'seed-attestation.json')), true);
});

test('rejects unsupported public bootstrap controls before mutation', () => {
    const digest = 'a'.repeat(64);
    const cases = [
        ['setup', 'repository', 'unknown'],
        ['setup', 'repository', 'create', `--attempt=${ATTEMPT_ID}`, `--digest=${digest}`, `--digest=${digest}`],
        ['setup', 'hooks', 'apply', `--attempt=${ATTEMPT_ID}`, `--digest=${digest}`],
        ['setup', 'hooks', 'apply', `--attempt=${ATTEMPT_ID}`, `--digest=${digest}`, '--approval=true'],
        ['setup', 'seed', 'prepare', `--attempt=${ATTEMPT_ID}`, `--digest=${digest}`, '--attestation=chosen'],
        ['setup', 'seed', 'prepare', '--attempt=invalid', `--digest=${digest}`],
        ['setup', 'seed', 'prepare', `--attempt=${ATTEMPT_ID}`, '--digest=invalid'],
        ['setup', 'seed', 'prepare', `--attempt=${ATTEMPT_ID}`, `--digest=${digest}`, '--index=chosen'],
    ];
    for (const args of cases) {
        let calls = 0;
        const result = captureWrites(() => main(args, {
            run() {
                calls += 1;
                return {status: 1, stdout: '', stderr: '', error: undefined};
            },
        }));
        assert.equal(result.status, 2, args.join(' '));
        assert.equal(calls, 0, args.join(' '));
    }
});

test('runs the public Core-only seed sequence without publication', (t) => {
    const projectRoot = makeTempDir();
    t.after(() => fs.rmSync(projectRoot, {recursive: true, force: true}));
    const plan = JSON.parse(planProject(projectRoot).stdout);
    assert.equal(applyProject(projectRoot, plan.planDigest).status, 0);
    assert.equal(createRepository(projectRoot, plan.planDigest).status, 0);
    assert.equal(inspectHooks(projectRoot, plan.planDigest).status, 0);
    assert.equal(applyHooks(projectRoot, plan.planDigest).status, 0);
    assert.equal(prepareSeed(projectRoot, plan.planDigest).status, 0);
    const invocations = [];
    const run = (command, args, options = {}) => {
        invocations.push({command, args});
        if (command === process.execPath && (args.includes('doctor') || args.includes('commitlint'))) {
            return {status: 0, stdout: '', stderr: '', error: undefined};
        }
        if (command === 'bash' && path.basename(args[0]) === 'resolve-identity.sh') {
            return {status: 0, stdout: 'Test User <test@example.invalid>\n', stderr: '', error: undefined};
        }
        if (command === 'bash' && path.basename(args[0]) === 'resolve-ocr-model.sh') {
            return {status: 0, stdout: 'review-model\n', stderr: '', error: undefined};
        }
        if (command === 'git' && args[0] === 'verify-commit') {
            return {status: 0, stdout: '', stderr: '', error: undefined};
        }
        if (command === 'git' && args[0] === 'commit') {
            const tree = execFileSync('git', ['-C', projectRoot, 'write-tree'], {
                encoding: 'utf8',
                env: options.env,
            }).trim();
            const commit = execFileSync('git', ['-C', projectRoot, 'commit-tree', tree], {
                encoding: 'utf8',
                input: fs.readFileSync(args[3]),
                env: {
                    ...options.env,
                    GIT_AUTHOR_NAME: 'Test User',
                    GIT_AUTHOR_EMAIL: 'test@example.invalid',
                    GIT_COMMITTER_NAME: 'Test User',
                    GIT_COMMITTER_EMAIL: 'test@example.invalid',
                },
            }).trim();
            execFileSync('git', ['-C', projectRoot, 'update-ref', 'refs/heads/develop', commit]);
            return {status: 0, stdout: '', stderr: '', error: undefined};
        }
        return runBounded(command, args, options);
    };

    const committed = captureWrites(() => main([
        'commit', 'create', '--type', 'ignore', '--subject', 'bootstrap prism project',
    ], {
        projectRoot,
        coreRoot: CORE_ROOT,
        cwd: projectRoot,
        env: {...process.env, PI_MODEL: 'provider/implementation-model'},
        randomBytes: () => Buffer.from('0123456789abcdef0123456789abcdef', 'hex'),
        run,
    }));

    assert.equal(committed.status, 0, committed.stderr);
    assert.match(committed.stdout, /^ignore: bootstrap prism project/m);
    assert.equal(git(projectRoot, ['rev-list', '--count', 'HEAD']), '1');
    assert.equal(git(projectRoot, ['status', '--porcelain=v1']), '');
    assert.equal(git(projectRoot, ['remote']), '');
    assert.equal(fs.existsSync(path.join(projectRoot, '.pi')), false);
    const forbidden = /^(?:gh|npm|pnpm|composer|ocr)$/;
    const forbiddenGit = new Set(['clone', 'fetch', 'pull', 'push', 'merge', 'tag']);
    assert.equal(invocations.some(({command, args}) =>
        forbidden.test(path.basename(command)) ||
        (path.basename(command) === 'git' && forbiddenGit.has(args[0]))
    ), false);
});

test('rejects a READY seed when another bootstrap attempt is malformed', (t) => {
    const {projectRoot, plan} = readyHooks(t);
    assert.equal(prepareSeed(projectRoot, plan.planDigest).status, 0);
    const malformedRoot = path.join(
        projectRoot, '.pi', 'prism-tool', 'bootstrap',
        '87654321-4321-4321-8321-cba987654321'
    );
    fs.mkdirSync(malformedRoot);
    fs.writeFileSync(path.join(malformedRoot, 'journal.json'), '{}\n', {mode: 0o600});

    assert.throws(
        () => validateActiveBootstrapSeed({projectRoot, coreRoot: CORE_ROOT}),
        /bootstrap attempt state is (?:invalid|stale)/
    );
});

test('dispatches Core-only pre-commit readiness without adapter execution', (t) => {
    const {projectRoot} = readyHooks(t);
    execFileSync('git', ['-C', projectRoot, 'add', 'README.md']);
    const invocations = [];
    const hookRun = (command, args, options) => {
        invocations.push({command, args, cwd: options.cwd});
        if (command === process.execPath && args.includes('doctor')) {
            return {status: 0, stdout: '', stderr: '', error: undefined};
        }
        return runBounded(command, args, options);
    };

    const result = runHook(projectRoot, 'pre-commit', [], {
        hookRun,
        loadHookAdapter() {
            throw new Error('Core-only hooks must not load an adapter');
        },
    });

    assert.equal(result.status, 0);
    assert.equal(result.stdout, '');
    assert.equal(result.stderr, '');
    assert.equal(invocations.some(({args}) => args.includes('doctor')), true);
    assert.equal(invocations.some(({args}) => args.join(' ') === 'diff --cached --check'), true);
    assert.equal(runHook(projectRoot, 'unknown').status, 2);
});

test('dispatches selected-adapter quality through the pre-commit hook', (t) => {
    const {projectRoot, plan} = readySelectedHooks(t);
    execFileSync('git', ['-C', projectRoot, 'add', 'README.md']);
    const qualityCalls = [];

    const result = runHook(projectRoot, 'pre-commit', [], {
        hookRun: hookRunWithReadiness(),
        loadHookAdapter(identity) {
            assert.deepEqual(identity, plan.adapter);
            return {
                runBootstrapQuality(options) {
                    qualityCalls.push(options.projectRoot);
                    return {status: 'GO', checks: []};
                },
            };
        },
    });

    assert.equal(result.status, 0, result.stderr);
    assert.deepEqual(qualityCalls, [projectRoot]);
});

test('blocks the pre-commit hook when selected-adapter quality fails', (t) => {
    const {projectRoot} = readySelectedHooks(t);
    execFileSync('git', ['-C', projectRoot, 'add', 'README.md']);

    const result = runHook(projectRoot, 'pre-commit', [], {
        hookRun: hookRunWithReadiness(),
        loadHookAdapter() {
            return {
                runBootstrapQuality() {
                    return {status: 'NO-GO', checks: []};
                },
            };
        },
    });

    assert.equal(result.status, 1);
});

test('fails closed for non-Core project metadata without adapter execution', (t) => {
    const {projectRoot} = readyHooks(t);
    const manifestPath = path.join(projectRoot, '.prism', 'project.json');
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    manifest.adapter = {package: '@example/adapter'};
    fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
    const invocations = [];

    const result = runHook(projectRoot, 'pre-commit', [], {
        hookRun: hookRunWithReadiness(invocations),
        loadHookAdapter() {
            throw new Error('adapter must not load');
        },
    });

    assert.equal(result.status, 1);
    assert.deepEqual(invocations.map(({command}) => command), ['git']);
});

test('validates contained commit messages after local readiness', (t) => {
    const {projectRoot} = readyHooks(t);
    const messagePath = path.join(projectRoot, '.git', 'COMMIT_EDITMSG');
    fs.writeFileSync(messagePath, 'ignore: bootstrap prism project\n');
    const invocations = [];
    const hookRun = (command, args, options) => {
        invocations.push({command, args, cwd: options.cwd, input: options.input});
        if (command === process.execPath && (args.includes('doctor') || args.includes('commitlint'))) {
            return {status: 0, stdout: '', stderr: '', error: undefined};
        }
        return runBounded(command, args, options);
    };

    const result = runHook(projectRoot, 'commit-msg', [messagePath], {hookRun});

    assert.equal(result.status, 0);
    const readiness = invocations.findIndex(({args}) => args.includes('doctor'));
    const commitlint = invocations.findIndex(({args}) => args.includes('commitlint'));
    assert.equal(readiness >= 0, true);
    assert.equal(commitlint > readiness, true);
    assert.equal(invocations[commitlint].args.includes('--edit'), false);
    assert.equal(
        Buffer.from(invocations[commitlint].input).toString('utf8'),
        'ignore: bootstrap prism project\n'
    );

    const outside = path.join(projectRoot, 'outside-message');
    fs.writeFileSync(outside, 'ignore: bootstrap prism project\n');
    assert.equal(runHook(projectRoot, 'commit-msg', [outside], {hookRun}).status, 1);
    const symlink = path.join(projectRoot, '.git', 'MESSAGE_LINK');
    fs.symlinkSync(messagePath, symlink);
    assert.equal(runHook(projectRoot, 'commit-msg', [symlink], {hookRun}).status, 1);
});

test('reads the Core manifest through a bounded descriptor loop', (t) => {
    const {projectRoot} = readyHooks(t);
    const originalRead = fs.readFileSync;
    fs.readFileSync = function rejectUnboundedManifestDescriptor(target, ...args) {
        if (Number.isInteger(target)) {
            const linked = fs.readlinkSync(`/proc/self/fd/${target}`);
            if (linked.endsWith('/.prism/project.json')) {
                throw new Error('unbounded manifest descriptor read');
            }
        }
        return originalRead.call(this, target, ...args);
    };
    try {
        assert.equal(runHook(projectRoot, 'pre-commit', [], {
            hookRun: hookRunWithReadiness(),
        }).status, 0);
    } finally {
        fs.readFileSync = originalRead;
    }
});

test('permits only the unborn protected develop root exception', (t) => {
    const {projectRoot} = readyHooks(t);
    const messagePath = path.join(projectRoot, '.git', 'COMMIT_EDITMSG');
    fs.writeFileSync(messagePath, 'ignore: bootstrap prism project\n');

    assert.equal(runHook(projectRoot, 'prepare-commit-msg', [messagePath]).status, 0);

    const rootCommit = createCommit(projectRoot);
    execFileSync('git', ['-C', projectRoot, 'update-ref', 'refs/heads/develop', rootCommit]);
    assert.equal(runHook(projectRoot, 'prepare-commit-msg', [messagePath]).status, 1);

    execFileSync('git', ['-C', projectRoot, 'symbolic-ref', 'HEAD', 'refs/heads/feat/test-abcd-seed']);
    execFileSync('git', ['-C', projectRoot, 'update-ref', 'HEAD', rootCommit]);
    assert.equal(runHook(projectRoot, 'prepare-commit-msg', [messagePath]).status, 0);
    execFileSync('git', [
        '-C', projectRoot, 'update-ref', 'refs/remotes/origin/feat/test-abcd-seed', rootCommit,
    ]);
    assert.equal(
        runHook(projectRoot, 'prepare-commit-msg', [messagePath, 'commit', 'HEAD']).status,
        1
    );
    assert.equal(runHook(projectRoot, 'prepare-commit-msg', [messagePath, 'commit']).status, 2);
});

test('allows only an exact protected root push and rejects rewritten history', (t) => {
    const {projectRoot} = readyHooks(t);
    const rootCommit = createCommit(projectRoot);
    const childCommit = createCommit(projectRoot, [rootCommit]);
    const otherCommit = createCommit(projectRoot, [], 'other commit');
    const zeros = '0'.repeat(40);
    const hookRun = hookRunWithReadiness();

    const initial = runHook(projectRoot, 'pre-push', ['origin', 'example.invalid'], {
        input: `refs/heads/develop ${rootCommit} refs/heads/develop ${zeros}\n`,
        hookRun,
    });
    assert.equal(initial.status, 0);

    const shallowRun = (command, args, options) => {
        if (command === 'git' && args.join(' ') === 'rev-parse --is-shallow-repository') {
            return {status: 0, stdout: 'true\n', stderr: '', error: undefined};
        }
        return hookRun(command, args, options);
    };
    assert.equal(runHook(projectRoot, 'pre-push', ['origin', 'example.invalid'], {
        input: `refs/heads/develop ${rootCommit} refs/heads/develop ${zeros}\n`,
        hookRun: shallowRun,
    }).status, 1);

    const laterProtected = runHook(projectRoot, 'pre-push', ['origin', 'example.invalid'], {
        input: `refs/heads/develop ${childCommit} refs/heads/develop ${zeros}\n`,
        hookRun,
    });
    assert.equal(laterProtected.status, 1);
    const mainRoot = runHook(projectRoot, 'pre-push', ['origin', 'example.invalid'], {
        input: `refs/heads/main ${rootCommit} refs/heads/main ${zeros}\n`,
        hookRun,
    });
    assert.equal(mainRoot.status, 1);

    const fastForward = runHook(projectRoot, 'pre-push', ['origin', 'example.invalid'], {
        input: `refs/heads/feat/test-abcd-seed ${childCommit} refs/heads/feat/test-abcd-seed ${rootCommit}\n`,
        hookRun,
    });
    assert.equal(fastForward.status, 0);

    const rewritten = runHook(projectRoot, 'pre-push', ['origin', 'example.invalid'], {
        input: `refs/heads/feat/test-abcd-seed ${otherCommit} refs/heads/feat/test-abcd-seed ${rootCommit}\n`,
        hookRun,
    });
    assert.equal(rewritten.status, 1);
    assert.equal(runHook(projectRoot, 'pre-push', ['origin', 'example.invalid'], {
        input: 'malformed\n',
        hookRun,
    }).status, 1);
    assert.equal(runHook(projectRoot, 'pre-push', ['origin', 'example.invalid'], {
        input: `refs/heads/a..b ${zeros} refs/heads/a..b ${zeros}\n`,
        hookRun,
    }).status, 1);
});

test('preserves concurrently changed repository state without granting seed eligibility', (t) => {
    const projectRoot = makeTempDir();
    t.after(() => fs.rmSync(projectRoot, {recursive: true, force: true}));
    const plan = JSON.parse(planProject(projectRoot).stdout);
    assert.equal(applyProject(projectRoot, plan.planDigest).status, 0);

    const result = createRepository(projectRoot, plan.planDigest, {
        bootstrapRepositoryFault(event) {
            if (event.name === 'after-init') {
                execFileSync('git', ['-C', projectRoot, 'config', '--local', 'user.name', 'Concurrent']);
            }
        },
    });

    assert.equal(result.status, 5);
    const report = JSON.parse(result.stdout);
    assert.equal(report.disposition, 'REPOSITORY_CONFLICT');
    assert.equal(fs.existsSync(path.join(projectRoot, '.git')), true);
    assert.equal(git(projectRoot, ['config', '--local', 'user.name']), 'Concurrent');
    const attemptRoot = path.dirname(path.dirname(plan.data.planPath));
    const journal = JSON.parse(fs.readFileSync(path.join(attemptRoot, 'journal.json'), 'utf8'));
    assert.equal(journal.phase, 'POST_APPLICATION');
    assert.equal(journal.resumePhase, 'REPOSITORY_CREATION');
    assert.equal(journal.repository, null);
});

test('preserves an active-attempt repository without rerunning initialization', (t) => {
    const projectRoot = makeTempDir();
    t.after(() => fs.rmSync(projectRoot, {recursive: true, force: true}));
    const plan = JSON.parse(planProject(projectRoot).stdout);
    assert.equal(applyProject(projectRoot, plan.planDigest).status, 0);
    const first = createRepository(projectRoot, plan.planDigest);
    assert.equal(first.status, 0);
    const initial = fs.lstatSync(path.join(projectRoot, '.git'));

    const second = createRepository(projectRoot, plan.planDigest);

    assert.equal(second.status, 0);
    const report = JSON.parse(second.stdout);
    const current = fs.lstatSync(path.join(projectRoot, '.git'));
    assert.equal(report.disposition, 'REPOSITORY_CREATED');
    assert.deepEqual(report.data.repository, JSON.parse(first.stdout).data.repository);
    assert.equal(current.dev, initial.dev);
    assert.equal(current.ino, initial.ino);
});

test('does not initialize a replacement project root', (t) => {
    const parent = makeTempDir();
    const projectRoot = path.join(parent, 'project');
    const movedRoot = path.join(parent, 'moved-project');
    fs.mkdirSync(projectRoot);
    t.after(() => fs.rmSync(parent, {recursive: true, force: true}));
    const plan = JSON.parse(planProject(projectRoot).stdout);
    assert.equal(applyProject(projectRoot, plan.planDigest).status, 0);

    const result = createRepository(projectRoot, plan.planDigest, {
        bootstrapRepositoryFault(event) {
            if (event.name === 'before-init') {
                fs.renameSync(projectRoot, movedRoot);
                fs.mkdirSync(projectRoot);
            }
        },
    });

    assert.equal(result.status, 5);
    assert.deepEqual(fs.readdirSync(projectRoot), []);
    assert.equal(fs.existsSync(path.join(projectRoot, '.git')), false);
    assert.equal(fs.existsSync(path.join(movedRoot, '.git')), false);
    assert.equal(fs.existsSync(path.join(movedRoot, 'README.md')), true);
});

test('preserves a concurrently created Git entry without normalizing it', (t) => {
    const projectRoot = makeTempDir();
    t.after(() => fs.rmSync(projectRoot, {recursive: true, force: true}));
    const plan = JSON.parse(planProject(projectRoot).stdout);
    assert.equal(applyProject(projectRoot, plan.planDigest).status, 0);

    const result = createRepository(projectRoot, plan.planDigest, {
        bootstrapRepositoryFault(event) {
            if (event.name === 'before-init') {
                fs.mkdirSync(path.join(projectRoot, '.git'));
                fs.writeFileSync(path.join(projectRoot, '.git', 'human-note'), 'preserve me\n');
            }
        },
    });

    assert.equal(result.status, 5);
    assert.deepEqual(fs.readdirSync(path.join(projectRoot, '.git')), ['human-note']);
    assert.equal(
        fs.readFileSync(path.join(projectRoot, '.git', 'human-note'), 'utf8'),
        'preserve me\n'
    );
    const attemptRoot = path.dirname(path.dirname(plan.data.planPath));
    const journal = JSON.parse(fs.readFileSync(path.join(attemptRoot, 'journal.json'), 'utf8'));
    assert.equal(journal.phase, 'POST_APPLICATION');
    assert.equal(journal.resumePhase, 'REPOSITORY_CREATION');
    assert.equal(journal.repository, null);
});

test('preserves a replaced repository lock as ambiguous evidence', (t) => {
    const projectRoot = makeTempDir();
    t.after(() => fs.rmSync(projectRoot, {recursive: true, force: true}));
    const plan = JSON.parse(planProject(projectRoot).stdout);
    assert.equal(applyProject(projectRoot, plan.planDigest).status, 0);
    const attemptRoot = path.dirname(path.dirname(plan.data.planPath));
    const lockPath = path.join(attemptRoot, 'repository.lock');

    const result = createRepository(projectRoot, plan.planDigest, {
        bootstrapRepositoryFault(event) {
            if (event.name === 'after-init') {
                fs.unlinkSync(lockPath);
                fs.writeFileSync(lockPath, 'human evidence\n', {mode: 0o600});
                execFileSync('git', ['-C', projectRoot, 'config', '--local', 'user.name', 'Concurrent']);
            }
        },
    });

    assert.equal(result.status, 5);
    assert.equal(fs.readFileSync(lockPath, 'utf8'), 'human evidence\n');
    assert.equal(fs.existsSync(path.join(projectRoot, '.git')), true);
});

// vim: ft=javascript sts=4 sw=4 ts=4 et :
