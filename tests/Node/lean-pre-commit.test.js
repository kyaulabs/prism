'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {spawnSync} = require('node:child_process');

const root = path.resolve(__dirname, '../..');
const hook = path.join(root, '.github/hooks/pre-commit');

function fixture(t) {
    const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'prism-native-hook-'));
    t.after(() => fs.rmSync(cwd, {recursive: true, force: true}));
    const bin = path.join(cwd, 'bin');
    fs.mkdirSync(bin);
    const env = {...process.env, PATH: `${bin}:/usr/bin:/bin`, PRISM_TOOL: '/not-installed/prism-tool'};
    const run = (command, args = []) => spawnSync(command, args, {cwd, env, encoding: 'utf8'});
    assert.equal(run('git', ['init', '-q']).status, 0);
    const tool = (name, body) => fs.writeFileSync(path.join(bin, name), `#!${process.execPath}\n${body}\n`, {mode: 0o755});
    tool('gitleaks', 'process.exit(0);');
    const stage = (name, content) => {
        fs.mkdirSync(path.dirname(path.join(cwd, name)), {recursive: true});
        fs.writeFileSync(path.join(cwd, name), content);
        assert.equal(run('git', ['add', '--', name]).status, 0);
    };
    return {cwd, run, tool, stage};
}

test('an ordinary staged file passes without Prism or unrelated tools', (t) => {
    const repo = fixture(t);
    repo.stage('notes.txt', 'An ordinary change\n');
    const result = repo.run('bash', [hook]);
    assert.equal(result.status, 0, result.stdout + result.stderr);
});

test('protected staged paths are rejected before scanners or linters read blobs', (t) => {
    const repo = fixture(t);
    repo.stage('.env', 'synthetic-protected-fixture\n');
    repo.tool('gitleaks', "require('node:fs').writeFileSync('scanner-ran', 'yes');");
    const result = repo.run('bash', [hook]);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /protected/i);
    assert.doesNotMatch(result.stdout + result.stderr, /synthetic-protected-fixture/);
    assert.equal(fs.existsSync(path.join(repo.cwd, 'scanner-ran')), false);
});

test('protected type changes are rejected before scanning', (t) => {
    const repo = fixture(t);
    repo.stage('example.txt', 'ordinary fixture\n');
    fs.symlinkSync('example.txt', path.join(repo.cwd, 'auth.json'));
    assert.equal(repo.run('git', ['add', '--', 'auth.json']).status, 0);
    assert.equal(repo.run('git', ['-c', 'core.hooksPath=/dev/null', '-c', 'commit.gpgsign=false',
        '-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid', 'commit', '-qm', 'fixture']).status, 0);
    fs.unlinkSync(path.join(repo.cwd, 'auth.json'));
    repo.stage('auth.json', 'synthetic-protected-fixture\n');
    repo.tool('gitleaks', "require('node:fs').writeFileSync('scanner-ran', 'yes');");
    assert.notEqual(repo.run('bash', [hook]).status, 0);
    assert.equal(fs.existsSync(path.join(repo.cwd, 'scanner-ran')), false);
});

test('shell lint checks staged bytes and preserves unstaged edits and unusual filenames', (t) => {
    const repo = fixture(t);
    const name = 'shell name\nwith newline.sh';
    const staged = '#!/bin/sh\necho staged\n';
    const working = '#!/bin/sh\necho working\n';
    repo.stage(name, staged);
    fs.writeFileSync(path.join(repo.cwd, name), working);
    repo.tool('shellcheck', `const fs=require('node:fs'); fs.writeFileSync('observed.json', JSON.stringify(process.argv.slice(2).filter(x => !x.startsWith('--')).map(x => fs.readFileSync(x,'utf8'))));`);
    const result = repo.run('bash', [hook]);
    assert.equal(result.status, 0, result.stdout + result.stderr);
    assert.deepEqual(JSON.parse(fs.readFileSync(path.join(repo.cwd, 'observed.json'), 'utf8')), [staged]);
    assert.equal(fs.readFileSync(path.join(repo.cwd, name), 'utf8'), working);
    assert.equal(repo.run('git', ['show', `:${name}`]).stdout, staged);
});

for (const [name, tool] of [['cdn/js/example.js', 'eslint'], ['cdn/sass/example.scss', 'stylelint']]) {
    test(`${tool} receives staged stdin and the original filename`, (t) => {
        const repo = fixture(t);
        repo.stage(name, 'staged bytes\n');
        fs.writeFileSync(path.join(repo.cwd, name), 'unstaged bytes\n');
        repo.tool(tool, `const fs=require('node:fs'); fs.writeFileSync('observed.json', JSON.stringify({args:process.argv.slice(2), input:fs.readFileSync(0,'utf8')}));`);
        const result = repo.run('bash', [hook]);
        assert.equal(result.status, 0, result.stdout + result.stderr);
        const observed = JSON.parse(fs.readFileSync(path.join(repo.cwd, 'observed.json'), 'utf8'));
        assert.equal(observed.input, 'staged bytes\n');
        assert.ok(observed.args.includes(name));
    });
}

test('PHP checks use staged snapshots and locally installed tools', (t) => {
    const repo = fixture(t);
    repo.stage('example.php', '<?php echo 1;\n');
    fs.writeFileSync(path.join(repo.cwd, 'example.php'), '<?php echo 2;\n');
    fs.mkdirSync(path.join(repo.cwd, 'vendor/bin'), {recursive: true});
    repo.tool('php', 'process.exit(0);');
    fs.writeFileSync(path.join(repo.cwd, 'vendor/bin/php-cs-fixer'), `#!${process.execPath}\nconst fs=require('node:fs'); fs.writeFileSync('observed.json',JSON.stringify({args:process.argv.slice(2), input:fs.readFileSync(process.argv.at(-1),'utf8')}));\n`, {mode: 0o755});
    const result = repo.run('bash', [hook]);
    assert.equal(result.status, 0, result.stdout + result.stderr);
    const observed = JSON.parse(fs.readFileSync(path.join(repo.cwd, 'observed.json'), 'utf8'));
    assert.equal(observed.input, '<?php echo 1;\n');
    assert.ok(observed.args.includes('--dry-run'));
});

test('Markdown checks only staged snapshots', (t) => {
    const repo = fixture(t);
    repo.stage('docs/example.md', '# Staged\n');
    fs.writeFileSync(path.join(repo.cwd, 'docs/example.md'), '# Unstaged\n');
    repo.tool('markdownlint-cli2', `const fs=require('node:fs'); const path=require('node:path'); const dir=process.argv.at(-1).replace('/**/*.md',''); fs.writeFileSync('observed.json',JSON.stringify(fs.readdirSync(dir,{recursive:true}).filter(x=>x.endsWith('.md')).map(x=>fs.readFileSync(path.join(dir,x),'utf8'))));`);
    const result = repo.run('bash', [hook]);
    assert.equal(result.status, 0, result.stdout + result.stderr);
    assert.deepEqual(JSON.parse(fs.readFileSync(path.join(repo.cwd, 'observed.json'), 'utf8')), ['# Staged\n']);
});

test('a failing native linter blocks the commit', (t) => {
    const repo = fixture(t);
    repo.stage('script.sh', '#!/bin/sh\necho test\n');
    repo.tool('shellcheck', 'process.exit(1);');
    assert.notEqual(repo.run('bash', [hook]).status, 0);
});

test('secret scan failure is redacted and a subsequent clean attempt succeeds', (t) => {
    const repo = fixture(t);
    repo.stage('notes.txt', 'Ordinary staged content\n');
    repo.tool('gitleaks', `require('node:assert/strict').ok(process.argv.includes('--staged') && process.argv.includes('--redact')); console.error('synthetic-scanner-output'); process.exit(1);`);
    const result = repo.run('bash', [hook]);
    assert.notEqual(result.status, 0);
    assert.doesNotMatch(result.stdout + result.stderr, /synthetic-scanner-output/);
    repo.tool('gitleaks', 'process.exit(0);');
    assert.equal(repo.run('bash', [hook]).status, 0);
});
