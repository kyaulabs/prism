// $KYAULabs: prism-tool-setup-route.test.js kyau@aura.kyaulabs 2026/08/24 -0700 Exp $

'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const {makeTempDir} = require('./helpers');
const {main} = require('../../packages/prism-core/scripts/prism-tool/cli');

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

function route(projectRoot, ...controls) {
    return captureWrites(() => main(['setup', 'route', '--json', ...controls], {projectRoot}));
}

test('routes a stable canonical empty root to strict-empty source selection', (t) => {
    const projectRoot = makeTempDir();
    t.after(() => fs.rmSync(projectRoot, {recursive: true, force: true}));

    const result = route(projectRoot);

    assert.equal(result.status, 0);
    assert.equal(result.stderr, '');
    assert.deepEqual(JSON.parse(result.stdout), {
        schemaVersion: 1,
        command: 'setup route',
        status: 'GO',
        disposition: 'STRICT_EMPTY',
        source: null,
        route: 'SELECT_SOURCE',
        reason: 'EMPTY_ROOT',
        projectRoot: fs.realpathSync(projectRoot),
        checks: [{
            id: 'setup-entry',
            status: 'PASS',
            message: 'canonical project root is strictly empty',
        }],
    });
    assert.deepEqual(fs.readdirSync(projectRoot), []);
});

test('routes non-empty roots and existing repositories to established setup', (t) => {
    const nonEmptyRoot = makeTempDir();
    const repositoryRoot = makeTempDir();
    t.after(() => fs.rmSync(nonEmptyRoot, {recursive: true, force: true}));
    t.after(() => fs.rmSync(repositoryRoot, {recursive: true, force: true}));
    fs.writeFileSync(path.join(nonEmptyRoot, 'README.md'), '# project\n');
    fs.mkdirSync(path.join(repositoryRoot, '.git'));

    const nonEmpty = JSON.parse(route(nonEmptyRoot).stdout);
    const repository = JSON.parse(route(repositoryRoot).stdout);

    assert.equal(nonEmpty.disposition, 'ESTABLISHED');
    assert.equal(nonEmpty.route, 'ESTABLISHED_SETUP');
    assert.equal(nonEmpty.reason, 'NON_EMPTY_ROOT');
    assert.equal(repository.disposition, 'ESTABLISHED');
    assert.equal(repository.route, 'ESTABLISHED_SETUP');
    assert.equal(repository.reason, 'EXISTING_REPOSITORY');
});

test('routes an empty directory inside a containing worktree to established setup', (t) => {
    const repositoryRoot = makeTempDir();
    const projectRoot = path.join(repositoryRoot, 'empty-child');
    t.after(() => fs.rmSync(repositoryRoot, {recursive: true, force: true}));
    fs.mkdirSync(path.join(repositoryRoot, '.git'));
    fs.mkdirSync(projectRoot);

    const result = route(projectRoot);
    const report = JSON.parse(result.stdout);

    assert.equal(result.status, 0);
    assert.equal(report.disposition, 'ESTABLISHED');
    assert.equal(report.route, 'ESTABLISHED_SETUP');
    assert.equal(report.reason, 'CONTAINING_WORKTREE');
});

test('fails closed for unsafe and indeterminate setup roots', (t) => {
    const parent = makeTempDir();
    const fileRoot = path.join(parent, 'project-file');
    const symlinkRoot = path.join(parent, 'symlink-project');
    const missingRoot = path.join(parent, 'missing-project');
    const gitTarget = path.join(parent, 'git-target');
    t.after(() => fs.rmSync(parent, {recursive: true, force: true}));
    fs.writeFileSync(fileRoot, 'not a directory\n');
    fs.mkdirSync(symlinkRoot);
    fs.mkdirSync(gitTarget);
    fs.symlinkSync(gitTarget, path.join(symlinkRoot, '.git'), 'dir');

    const unsafeRoot = route(fileRoot);
    const unsafeGit = route(symlinkRoot);
    const indeterminate = route(missingRoot);

    assert.equal(unsafeRoot.status, 5);
    assert.equal(JSON.parse(unsafeRoot.stdout).disposition, 'CONFLICT');
    assert.equal(JSON.parse(unsafeRoot.stdout).reason, 'UNSAFE_ROOT');
    assert.equal(unsafeGit.status, 5);
    assert.equal(JSON.parse(unsafeGit.stdout).disposition, 'CONFLICT');
    assert.equal(JSON.parse(unsafeGit.stdout).reason, 'UNSAFE_GIT_STATE');
    assert.equal(indeterminate.status, 5);
    assert.equal(JSON.parse(indeterminate.stdout).disposition, 'CONFLICT');
    assert.equal(JSON.parse(indeterminate.stdout).reason, 'INDETERMINATE');
});

test('fails closed for a malformed Gitfile marker', (t) => {
    const projectRoot = makeTempDir();
    t.after(() => fs.rmSync(projectRoot, {recursive: true, force: true}));
    fs.writeFileSync(path.join(projectRoot, '.git'), 'not a gitdir\n');

    const result = route(projectRoot);
    const report = JSON.parse(result.stdout);

    assert.equal(result.status, 5);
    assert.equal(report.status, 'NO-GO');
    assert.equal(report.disposition, 'CONFLICT');
    assert.equal(report.route, 'STOP');
    assert.equal(report.reason, 'UNSAFE_GIT_STATE');
});

test('fails closed for a Gitfile whose target is unavailable', (t) => {
    const projectRoot = makeTempDir();
    t.after(() => fs.rmSync(projectRoot, {recursive: true, force: true}));
    fs.writeFileSync(path.join(projectRoot, '.git'), 'gitdir: missing-git-dir\n');

    const result = route(projectRoot);
    const report = JSON.parse(result.stdout);

    assert.equal(result.status, 5);
    assert.equal(report.disposition, 'CONFLICT');
    assert.equal(report.reason, 'UNSAFE_GIT_STATE');
});

test('routes a valid Gitfile marker to established setup', (t) => {
    const parent = makeTempDir();
    const projectRoot = path.join(parent, 'project');
    const gitDir = path.join(parent, 'git-dir');
    t.after(() => fs.rmSync(parent, {recursive: true, force: true}));
    fs.mkdirSync(projectRoot);
    fs.mkdirSync(gitDir);
    fs.writeFileSync(path.join(projectRoot, '.git'), 'gitdir: ../git-dir\n');

    const result = route(projectRoot);
    const report = JSON.parse(result.stdout);

    assert.equal(result.status, 0);
    assert.equal(report.disposition, 'ESTABLISHED');
    assert.equal(report.route, 'ESTABLISHED_SETUP');
    assert.equal(report.reason, 'EXISTING_REPOSITORY');
});

test('rejects unsupported setup route controls', () => {
    const result = captureWrites(() => main(['setup', 'route', '--unknown'], {projectRoot: process.cwd()}));

    assert.equal(result.status, 2);
    assert.equal(result.stdout, '');
    assert.match(result.stderr, /usage: prism-tool setup route/);
});

test('returns closed Template and Blank bootstrap routes only for strict-empty roots', (t) => {
    const projectRoot = makeTempDir();
    t.after(() => fs.rmSync(projectRoot, {recursive: true, force: true}));

    const template = route(projectRoot, '--source=template');
    const blank = route(projectRoot, '--source=blank');

    assert.equal(template.status, 0);
    assert.equal(JSON.parse(template.stdout).disposition, 'STRICT_EMPTY');
    assert.equal(JSON.parse(template.stdout).source, 'TEMPLATE');
    assert.equal(JSON.parse(template.stdout).route, 'BOOTSTRAP_TEMPLATE');
    assert.equal(blank.status, 0);
    assert.equal(JSON.parse(blank.stdout).source, 'BLANK');
    assert.equal(JSON.parse(blank.stdout).route, 'BOOTSTRAP_BLANK');
});

test('Cancel is terminal and leaves the strict-empty root untouched', (t) => {
    const projectRoot = makeTempDir();
    t.after(() => fs.rmSync(projectRoot, {recursive: true, force: true}));
    let externalEffects = 0;

    const result = captureWrites(() => main(
        ['setup', 'route', '--source=cancel', '--json'],
        {projectRoot, run: () => { externalEffects += 1; }}
    ));
    const report = JSON.parse(result.stdout);

    assert.equal(result.status, 0);
    assert.equal(report.disposition, 'STRICT_EMPTY');
    assert.equal(report.source, 'CANCEL');
    assert.equal(report.route, 'STOP');
    assert.equal(externalEffects, 0);
    assert.deepEqual(fs.readdirSync(projectRoot), []);
});

test('fails closed when a source is supplied for an established root', (t) => {
    const projectRoot = makeTempDir();
    t.after(() => fs.rmSync(projectRoot, {recursive: true, force: true}));
    fs.writeFileSync(path.join(projectRoot, 'README.md'), '# project\n');

    const result = route(projectRoot, '--source=template');
    const report = JSON.parse(result.stdout);

    assert.equal(result.status, 5);
    assert.equal(report.status, 'NO-GO');
    assert.equal(report.disposition, 'CONFLICT');
    assert.equal(report.source, null);
    assert.equal(report.route, 'STOP');
    assert.equal(report.reason, 'SOURCE_REQUIRES_STRICT_EMPTY');
});

test('rejects unknown or duplicate source controls', (t) => {
    const projectRoot = makeTempDir();
    t.after(() => fs.rmSync(projectRoot, {recursive: true, force: true}));

    for (const controls of [
        ['--source=unknown'],
        ['--source=template', '--source=blank'],
    ]) {
        const result = route(projectRoot, ...controls);
        assert.equal(result.status, 2);
        assert.equal(result.stdout, '');
        assert.match(result.stderr, /--source=template\|blank\|cancel/);
    }
});

// vim: ft=javascript sts=4 sw=4 ts=4 et :
