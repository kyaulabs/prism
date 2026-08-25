// $KYAULabs: prism-tool-bootstrap-seed.test.js kyau@aura.kyaulabs 2026/08/24 -0700 Exp $

'use strict';

const assert = require('node:assert/strict');
const {execFileSync} = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const {makeTempDir} = require('./helpers');
const {main} = require('../../packages/prism-core/scripts/prism-tool/cli');
const {runBounded} = require('../../packages/prism-core/scripts/prism-tool/process');

const ATTEMPT_ID = '12345678-1234-4123-8123-123456789abc';
const CORE_ROOT = path.resolve(__dirname, '../../packages/prism-core');

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

function applyProject(projectRoot, planDigest) {
    return captureWrites(() => main([
        'setup', 'project', 'apply', `--attempt=${ATTEMPT_ID}`,
        `--digest=${planDigest}`, '--approval=yes', '--json',
    ], {projectRoot, coreRoot: CORE_ROOT}));
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
    assert.equal(journal.phase, 'DURABLE');
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
    assert.equal(journal.phase, 'DURABLE');
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
