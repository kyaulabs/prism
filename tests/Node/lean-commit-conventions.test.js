// $KYAULabs: lean-commit-conventions.test.js kyau@aura.kyaulabs 2026/09/09 -0700 Exp $

'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');
const {spawnSync} = require('node:child_process');
const test = require('node:test');

const root = path.resolve(__dirname, '../..');

function lint(message) {
    return spawnSync(path.join(root, 'node_modules/.bin/commitlint'), [], {
        cwd: root,
        input: message,
        encoding: 'utf8',
    });
}

test('Conventional Commits accept implementation attribution and human sign-off without Tested-by', () => {
    const result = lint('refactor(core): simplify commits\n\nImplemented-by: test-model\nSigned-off-by: Example <example@example.test>\n');
    assert.equal(result.status, 0, result.stderr + result.stdout);
});

test('commit-msg validates locally without a Prism launcher or global readiness gate', (t) => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'prism-commit-conventions-'));
    t.after(() => fs.rmSync(directory, {recursive: true, force: true}));
    const message = path.join(directory, 'message');
    fs.writeFileSync(message, 'refactor(core): simplify commits\n\nImplemented-by: test-model\nSigned-off-by: Example <example@example.test>\n');
    const result = spawnSync('bash', [path.join(root, '.github/hooks/commit-msg'), message], {
        cwd: root,
        env: {...process.env, PRISM_TOOL: path.join(directory, 'no-launcher')},
        encoding: 'utf8',
    });
    assert.equal(result.status, 0, result.stderr + result.stdout);
});

for (const [name, message, accepted] of [
    ['missing attribution', 'feat: no trailers\n', false],
    ['missing implementation', 'feat: missing implementation\n\nSigned-off-by: Example <example@example.test>\n', false],
    ['missing sign-off', 'feat: missing sign-off\n\nImplemented-by: test-model\n', false],
    ['merge', 'Merge branch \'feature\'\n', true],
    ['pull-request merge', 'Merge pull request #42 from feature/branch\n', true],
    ['revert', 'Revert "feat: example"\n\nThis reverts commit abc123.\n', true],
    ...['Closes #42', 'Resolve: #42', 'Fixes #42', 'fixes: #42', 'Fix #42'].map((reference) => [
        reference,
        `fix: repair behavior\n\n${reference}\nImplemented-by: test-model\nSigned-off-by: Example <example@example.test>\n`,
        false,
    ]),
    ...['Fixes: #42', 'Refs: #42', 'Fix #42 was the hardest part of this change.'].map((reference) => [
        reference,
        `fix: repair behavior\n\n${reference}\n\nImplemented-by: test-model\nSigned-off-by: Example <example@example.test>\n`,
        true,
    ]),
    ['misplaced reference', 'fix: repair behavior\n\nImplemented-by: test-model\nSigned-off-by: Example <example@example.test>\nFixes: #42\n', false],
]) {
    test(`commit convention: ${name}`, () => {
        const result = lint(message);
        assert.equal(result.status, accepted ? 0 : 1, result.stderr + result.stdout);
    });
}

test('commit-msg rejects literal backslash-newlines', (t) => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'prism-commit-conventions-'));
    t.after(() => fs.rmSync(directory, {recursive: true, force: true}));
    const message = path.join(directory, 'message');
    fs.writeFileSync(message, 'feat: example\\n\\nImplemented-by: test-model');
    const result = spawnSync('bash', [path.join(root, '.github/hooks/commit-msg'), message], {
        cwd: root, encoding: 'utf8',
    });
    assert.equal(result.status, 1);
    assert.match(result.stderr, /use real line breaks/);
});

test('ordinary Git commits, merges and reverts use the project hook without Prism', (t) => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'prism-commit-integration-'));
    t.after(() => fs.rmSync(directory, {recursive: true, force: true}));
    const run = (...args) => {
        const result = spawnSync('git', args, {cwd: directory, encoding: 'utf8'});
        assert.equal(result.status, 0, result.stderr + result.stdout);
        return result.stdout.trim();
    };
    run('init', '--initial-branch=main');
    run('config', 'user.name', 'Example');
    run('config', 'user.email', 'example@example.test');
    run('config', 'commit.gpgsign', 'false');
    run('config', 'core.hooksPath', '.git/hooks');
    fs.symlinkSync(path.join(root, 'node_modules'), path.join(directory, 'node_modules'), 'dir');
    fs.writeFileSync(path.join(directory, 'commitlint.config.cjs'), `module.exports = require(${JSON.stringify(path.join(root, 'commitlint.config.js'))});\n`);
    fs.copyFileSync(path.join(root, '.github/hooks/commit-msg'), path.join(directory, '.git/hooks/commit-msg'));
    fs.chmodSync(path.join(directory, '.git/hooks/commit-msg'), 0o755);
    const message = 'feat: example\n\nImplemented-by: test-model\nSigned-off-by: Example <example@example.test>';
    fs.writeFileSync(path.join(directory, 'base.txt'), 'base\n');
    run('add', 'base.txt');
    run('commit', '-m', message);
    run('switch', '-c', 'feature');
    fs.writeFileSync(path.join(directory, 'feature.txt'), 'feature\n');
    run('add', 'feature.txt');
    const result = spawnSync('git', ['commit', '-m', 'feat: missing trailers'], {cwd: directory, encoding: 'utf8'});
    assert.notEqual(result.status, 0);
    assert.match(result.stdout + result.stderr, /trailers-exist/);
    run('commit', '-m', message);
    const target = run('rev-parse', 'HEAD');
    run('switch', 'main');
    run('merge', '--no-ff', 'feature', '-m', "Merge branch 'feature'");
    run('revert', '--no-edit', target);
    assert.equal(fs.existsSync(path.join(directory, 'feature.txt')), false);
});

test('commit-msg reports a missing commitlint without acquiring packages', (t) => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'prism-commit-unavailable-'));
    t.after(() => fs.rmSync(directory, {recursive: true, force: true}));
    fs.symlinkSync('/usr/bin/grep', path.join(directory, 'grep'));
    fs.writeFileSync(path.join(directory, 'message'), 'feat: example\n');
    const result = spawnSync('/bin/bash', [path.join(root, '.github/hooks/commit-msg'), 'message'], {
        cwd: directory, env: {...process.env, PATH: directory}, encoding: 'utf8',
    });
    assert.equal(result.status, 1);
    assert.match(result.stderr, /commitlint is unavailable/);
});

// vim: ft=javascript sts=4 sw=4 ts=4 et :
