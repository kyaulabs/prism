// $KYAULabs: prism-tool-bootstrap-seed.test.js kyau@aura.kyaulabs 2026/08/24 -0700 Exp $

'use strict';

const assert = require('node:assert/strict');
const {execFileSync} = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const {makeTempDir} = require('./helpers');
const {main} = require('../../packages/prism-core/scripts/prism-tool/cli');

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

function git(projectRoot, args) {
    return execFileSync('git', ['-C', projectRoot, ...args], {encoding: 'utf8'}).trim();
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
