// $KYAULabs: prism-tool-source-checkout.test.js kyau@aura.kyaulabs 2026/09/07 -0700 Exp $

'use strict';

const assert = require('node:assert/strict');
const {execFileSync, spawnSync} = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const {makeTempDir} = require('./helpers');
const {main} = require('../../packages/prism-core/scripts/prism-tool/cli');

const CORE = path.resolve(__dirname, '../../packages/prism-core');
const CLI = path.join(CORE, 'scripts/prism-tool.js');

function fixture(t) {
    const root = makeTempDir();
    t.after(() => fs.rmSync(root, {recursive: true, force: true}));
    execFileSync('git', ['init', '--quiet', root], {timeout: 10000});
    fs.writeFileSync(path.join(root, 'package.json'), '{"name":"prism","private":true}\n');
    for (const name of ['scripts', 'skills', 'prompts']) {
        fs.mkdirSync(path.join(root, 'packages/prism-core', name), {recursive: true});
    }
    for (const name of ['package.json', 'toolchain.json']) {
        fs.copyFileSync(path.join(CORE, name), path.join(root, 'packages/prism-core', name));
    }
    for (const name of ['prism-tool.js', 'validate-harness.sh']) {
        fs.writeFileSync(path.join(root, 'packages/prism-core/scripts', name), 'must not execute source during classification\n', {mode: 0o700});
    }
    return root;
}

function route(root, ...args) {
    const result = spawnSync(process.execPath, [CLI, 'setup', 'route', '--json', ...args], {
        cwd: root, encoding: 'utf8', timeout: 10000,
    });
    const report = JSON.parse(result.stdout);
    assert.equal(result.status, report.status === 'GO' ? 0 : 5, result.stderr);
    return report;
}

test('routes independent Prism source checkouts through the public CLI without executing their source', (t) => {
    const root = fixture(t);

    const result = route(root);

    assert.equal(result.status, 'GO');
    assert.equal(result.disposition, 'SOURCE_CHECKOUT');
    assert.equal(result.automationApplicability, 'SOURCE_CHECKOUT');
    assert.equal(result.route, 'SOURCE_CHECKOUT_SETUP');
    assert.equal(result.source, null);
    assert.equal(result.projectRoot, fs.realpathSync(root));
    assert.equal(fs.existsSync(path.join(root, '.prism')), false);
});

test('rejects incomplete or incoherent source claims instead of selecting consumer setup', (t) => {
    for (const [relative, contents] of [
        ['package.json', '{"name":"prism","private":false}'],
        ['package.json', '{invalid'],
        ['package.json', null],
        ['packages/prism-core/package.json', '{"name":"wrong"}'],
        ['packages/prism-core/toolchain.json', '{}'],
        ['packages/prism-core/scripts/prism-tool.js', null],
        ['packages/prism-core/scripts/validate-harness.sh', null],
        ['packages/prism-core/skills', null],
        ['packages/prism-core/prompts', null],
    ]) {
        const root = fixture(t);
        const target = path.join(root, relative);
        if (contents === null) fs.rmSync(target, {recursive: true});
        else fs.writeFileSync(target, contents);

        const result = route(root);

        assert.equal(result.status, 'NO-GO', relative);
        assert.equal(result.disposition, 'CONFLICT', relative);
        assert.equal(result.route, 'STOP', relative);
        assert.equal(result.automationApplicability, null, relative);
        assert.equal(result.checks[0].message, 'Prism source checkout evidence is incomplete or unsafe');
    }
});

test('rejects source-shaped non-repositories and Gitfile checkouts without consumer fallback', (t) => {
    for (const gitfile of [false, true]) {
        const root = fixture(t);
        fs.renameSync(path.join(root, '.git'), path.join(root, 'git-state'));
        if (gitfile) fs.writeFileSync(path.join(root, '.git'), 'gitdir: git-state\n');
        const result = route(root);
        assert.equal(result.status, 'NO-GO');
        assert.equal(result.route, 'STOP');
    }
});

test('rejects unsafe source evidence modes and symlinks without repairing them', (t) => {
    for (const [relative, change] of [
        ['package.json', 0o664], ['packages/prism-core/package.json', 0o4755],
        ['packages/prism-core/toolchain.json', 0o000],
        ['packages/prism-core/scripts/prism-tool.js', 0o777],
        ['packages/prism-core/scripts/validate-harness.sh', 0o600],
        ['packages/prism-core/skills', 0o777],
        ['package.json', 'link'], ['packages', 'link'],
        ['packages/prism-core/package.json', 'link'],
        ['packages/prism-core/scripts', 'link'],
    ]) {
        const root = fixture(t);
        const target = path.join(root, relative);
        if (change === 'link') {
            const original = path.join(root, 'original');
            fs.renameSync(target, original);
            fs.symlinkSync(original, target);
        } else fs.chmodSync(target, change);
        const before = fs.lstatSync(target);

        assert.equal(route(root).status, 'NO-GO', `${relative}: ${change}`);
        assert.deepEqual(fs.lstatSync(target), before);
    }
});

test('does not read outside a source directory replaced after validation', (t) => {
    const root = fixture(t);
    const outside = makeTempDir();
    t.after(() => fs.rmSync(outside, {recursive: true, force: true}));
    const core = path.join(root, 'packages/prism-core');
    fs.cpSync(core, outside, {recursive: true});
    const outsideInode = fs.lstatSync(path.join(outside, 'package.json')).ino;
    const coreInode = fs.lstatSync(core).ino;
    const lstat = fs.lstatSync;
    const read = fs.readFileSync;
    const readSync = fs.readSync;
    let swapped = false;
    let outsideRead = false;
    t.mock.method(fs, 'lstatSync', (file, ...args) => {
        const stat = lstat(file, ...args);
        if (!swapped && stat?.ino === coreInode) {
            swapped = true;
            fs.renameSync(core, path.join(root, 'original-core'));
            fs.symlinkSync(outside, core);
        }
        return stat;
    });
    t.mock.method(fs, 'readFileSync', (file, ...args) => {
        if (typeof file === 'string' && file.endsWith('/package.json') && fs.statSync(file).ino === outsideInode) outsideRead = true;
        return read(file, ...args);
    });
    t.mock.method(fs, 'readSync', (fd, ...args) => {
        if (fs.fstatSync(fd).ino === outsideInode) outsideRead = true;
        return readSync(fd, ...args);
    });
    let output = '';
    t.mock.method(process.stdout, 'write', (chunk) => { output += chunk; return true; });

    const status = main(['setup', 'route', '--json'], {projectRoot: root});

    t.mock.restoreAll();
    assert.equal(swapped, true);
    assert.equal(outsideRead, false);
    assert.equal(status, 5);
    assert.equal(JSON.parse(output).route, 'STOP');
});

test('rejects excluded source identity inputs before reading their contents', (t) => {
    const root = fixture(t);
    const target = path.join(root, 'packages/prism-core/package.json');
    const inode = fs.lstatSync(target).ino;
    const previous = process.env.PRISM_SENSITIVE_PATHS;
    process.env.PRISM_SENSITIVE_PATHS = `${previous ?? ''}\n${target}`;
    t.after(() => {
        if (previous === undefined) delete process.env.PRISM_SENSITIVE_PATHS;
        else process.env.PRISM_SENSITIVE_PATHS = previous;
    });
    let attempted = false;
    const read = fs.readSync;
    t.mock.method(fs, 'readSync', (fd, ...args) => {
        if (fs.fstatSync(fd).ino === inode) attempted = true;
        return read(fd, ...args);
    });
    let output = '';
    t.mock.method(process.stdout, 'write', (chunk) => { output += chunk; return true; });

    const status = main(['setup', 'route', '--json'], {projectRoot: root});

    t.mock.restoreAll();
    assert.equal(attempted, false);
    assert.equal(status, 5);
    assert.equal(JSON.parse(output).route, 'STOP');
});

test('preserves fork identity and restrictive source modes without requiring pristine bytes or remotes', (t) => {
    const root = fixture(t);
    execFileSync('git', ['remote', 'add', 'fork', 'https://example.test/fork.git'], {cwd: root, timeout: 10000});
    fs.appendFileSync(path.join(root, 'packages/prism-core/scripts/prism-tool.js'), 'uncommitted source edit\n');
    const names = ['package.json', 'packages/prism-core/package.json', 'packages/prism-core/toolchain.json',
        'packages/prism-core/scripts/prism-tool.js', 'packages/prism-core/scripts/validate-harness.sh', '.git/config'];
    for (const name of names) fs.chmodSync(path.join(root, name), name.includes('/scripts/') ? 0o700 : 0o600);
    const snapshot = () => names.map((name) => {
        const file = path.join(root, name);
        const {dev, ino, uid, gid, mode, size, mtimeMs, ctimeMs} = fs.lstatSync(file);
        return {name, bytes: fs.readFileSync(file), dev, ino, uid, gid, mode, size, mtimeMs, ctimeMs};
    });
    const before = snapshot();
    assert.equal(route(root).route, 'SOURCE_CHECKOUT_SETUP');
    assert.deepEqual(snapshot(), before);
    for (const selector of ['blank', 'template', 'cancel']) assert.equal(route(root, `--source=${selector}`).route, 'STOP');
});

test('does not turn unrelated package metadata or an installed dependency into source identity', (t) => {
    for (const contents of ['{"name":"consumer","dependencies":{"@kyaulabs/prism-core":"1.0.0"}}', '{invalid', '[]']) {
        const root = makeTempDir();
        t.after(() => fs.rmSync(root, {recursive: true, force: true}));
        execFileSync('git', ['init', '--quiet', root], {timeout: 10000});
        fs.writeFileSync(path.join(root, 'package.json'), contents);
        fs.mkdirSync(path.join(root, 'node_modules/@kyaulabs/prism-core'), {recursive: true});
        assert.equal(route(root).route, 'ESTABLISHED_SETUP');
    }
    const root = fixture(t);
    fs.writeFileSync(path.join(root, 'package.json'), '{"name":"consumer"}');
    assert.equal(route(root).route, 'ESTABLISHED_SETUP');
});

test('rejects another owner before reading source identity bytes', (t) => {
    const root = fixture(t);
    const target = path.join(root, 'packages/prism-core/package.json');
    const inode = fs.lstatSync(target).ino;
    const lstat = fs.lstatSync;
    t.mock.method(fs, 'lstatSync', (file, ...args) => {
        const stat = lstat(file, ...args);
        if (stat?.ino === inode) stat.uid += 1;
        return stat;
    });
    let attempted = false;
    const read = fs.readSync;
    t.mock.method(fs, 'readSync', (fd, ...args) => {
        if (fs.fstatSync(fd).ino === inode) attempted = true;
        return read(fd, ...args);
    });
    t.mock.method(process.stdout, 'write', () => true);
    const status = main(['setup', 'route', '--json'], {projectRoot: root});
    t.mock.restoreAll();
    assert.equal(status, 5);
    assert.equal(attempted, false);
});

test('rejects source identity growth or identical-byte replacement during a held read', (t) => {
    for (const mutation of ['grow', 'replace', 'replace-earlier']) {
        const root = fixture(t);
        const target = path.join(root, 'packages/prism-core/package.json');
        const targetInode = fs.lstatSync(target).ino;
        const laterInode = fs.lstatSync(path.join(root, 'packages/prism-core/toolchain.json')).ino;
        const bytes = fs.readFileSync(target);
        let changed = false;
        const read = fs.readSync;
        t.mock.method(fs, 'readSync', (fd, ...args) => {
            const count = read(fd, ...args);
            if (!changed && fs.fstatSync(fd).ino === (mutation === 'replace-earlier' ? laterInode : targetInode)) {
                changed = true;
                if (mutation === 'grow') fs.appendFileSync(target, ' '.repeat(1048576));
                else {
                    fs.renameSync(target, path.join(root, 'old-manifest'));
                    fs.writeFileSync(target, bytes, {mode: 0o600});
                }
            }
            return count;
        });
        t.mock.method(process.stdout, 'write', () => true);
        const status = main(['setup', 'route', '--json'], {projectRoot: root});
        t.mock.restoreAll();
        assert.equal(changed, true, mutation);
        assert.equal(status, 5, mutation);
        if (mutation !== 'grow') assert.deepEqual(fs.readFileSync(target), bytes);
    }
});

// vim: ft=javascript sts=4 sw=4 ts=4 et :
