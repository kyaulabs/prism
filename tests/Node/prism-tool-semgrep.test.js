// $KYAULabs: prism-tool-semgrep.test.js kyau@aura.kyaulabs 2026/09/07 -0700 Exp $

'use strict';

const assert = require('node:assert/strict');
const {execFileSync, spawn, spawnSync} = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {performance} = require('node:perf_hooks');
const test = require('node:test');
const {setTimeout: delay} = require('node:timers/promises');
const {setTimeout, clearTimeout} = require('node:timers');
const {makeTempDir} = require('./helpers');
const {runIsolatedSemgrep} = require('../../packages/prism-core/scripts/prism-tool/semgrep');
const {resolveExecutable} = require('../../packages/prism-core/scripts/prism-tool/preflight');

const CLI = path.resolve(__dirname, '../../packages/prism-core/scripts/prism-tool.js');

function fixture(t, objectFormat = 'sha1') {
    const root = makeTempDir();
    t.after(() => fs.rmSync(root, {recursive: true, force: true}));
    const projectRoot = path.join(root, 'consumer');
    const bin = path.join(root, 'bin');
    fs.mkdirSync(projectRoot, {mode: 0o700});
    fs.mkdirSync(bin, {mode: 0o700});
    const env = {
        PATH: `${bin}${path.delimiter}${process.env.PATH}`, HOME: root, LC_ALL: 'C',
        GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_NOSYSTEM: '1', GIT_TERMINAL_PROMPT: '0',
        GIT_AUTHOR_DATE: '2026-09-06T12:00:00Z', GIT_COMMITTER_DATE: '2026-09-06T12:00:00Z',
    };
    const git = (...args) => execFileSync('git', args, {
        cwd: projectRoot, env, encoding: 'utf8', timeout: 15000, stdio: 'pipe',
    });
    const commit = (message) => git('-c', 'core.hooksPath=/dev/null', '-c', 'commit.gpgsign=false',
        'commit', '--quiet', '-m', message);
    git('init', '--quiet', '-b', 'fixture', `--object-format=${objectFormat}`);
    git('config', 'user.name', 'Test User');
    git('config', 'user.email', 'test@example.com');
    const files = {
        '.gitignore': ['ignored-canaries/\n', 0o644],
        '.prism/project.json': ['{"schemaVersion":1}\n', 0o644],
        '.github/hooks/pre-commit': ['#!/bin/sh\nexit 0\n', 0o755],
        'rules.yml': ['rules:\n  - id: fixture\n    languages: [javascript]\n    message: fixture\n    severity: WARNING\n    pattern: dangerous(...)\n', 0o644],
        'source file.js': ['dangerous("old");\n', 0o644],
    };
    for (const [relative, [contents, mode]] of Object.entries(files)) {
        const file = path.join(projectRoot, relative);
        fs.mkdirSync(path.dirname(file), {recursive: true, mode: 0o700});
        fs.writeFileSync(file, contents, {mode});
        fs.chmodSync(file, mode);
    }
    git('add', '--', ...Object.keys(files));
    commit('baseline fixture');
    const baseline = git('rev-parse', 'HEAD').trim();
    fs.appendFileSync(path.join(projectRoot, 'source file.js'), 'dangerous("new");\n');
    fs.appendFileSync(path.join(projectRoot, '.prism/project.json'), '\n');
    fs.appendFileSync(path.join(projectRoot, '.github/hooks/pre-commit'), '\n');
    git('add', '--', ...Object.keys(files));
    commit('head fixture');
    const head = git('rev-parse', 'HEAD').trim();
    const executable = (name, source) => {
        const target = path.join(bin, name);
        fs.writeFileSync(target, `#!${process.execPath}\n${source}`, {mode: 0o700});
        fs.chmodSync(target, 0o700);
        return target;
    };
    executable('ocr', "if (process.argv[2] !== '--version') process.exit(97); process.stdout.write('open-code-review v1.9.8 linux/amd64\\n');\n");
    executable('semgrep', `
const {execFileSync} = require('node:child_process');
const fs = require('node:fs');
const args = process.argv.slice(2);
if (args[0] === '--version') { process.stdout.write('1.173.0\\n'); process.exit(0); }
const git = (...values) => execFileSync('git', values, {encoding: 'utf8', stdio: 'pipe'}).trim();
const head = git('rev-parse', 'HEAD');
const baseline = args[args.indexOf('--baseline-commit') + 1];
git('reset', '--hard', baseline);
git('reset', '--hard', head);
process.stdout.write(JSON.stringify({cwd: process.cwd(), head, baseline,
    baselineEnv: process.env.SEMGREP_BASELINE_COMMIT,
    dataMode: fs.statSync('.prism/project.json').mode & 0o7777,
    hookMode: fs.statSync('.github/hooks/pre-commit').mode & 0o7777}));
`);
    return {root, projectRoot, env, git, commit, baseline, head, files, executable};
}

function snapshot(projectRoot, paths) {
    return Object.fromEntries(paths.map((relative) => {
        const file = path.join(projectRoot, relative);
        const stat = fs.lstatSync(file);
        return [relative, {
            contents: fs.readFileSync(file), dev: stat.dev, ino: stat.ino,
            uid: stat.uid, gid: stat.gid, size: stat.size, mode: stat.mode,
            mtimeMs: stat.mtimeMs, ctimeMs: stat.ctimeMs,
        }];
    }));
}

test('isolates baseline resets through the launcher without changing consumer files or Git administration', (t) => {
    const input = fixture(t);
    const paths = [...Object.keys(input.files), '.git/HEAD', '.git/index',
        '.git/refs/heads/fixture', '.git/logs/HEAD', '.git/logs/refs/heads/fixture'];
    const before = snapshot(input.projectRoot, paths);

    const result = spawnSync('bash', ['-c', 'umask 077; exec "$@"', 'fixture-launcher',
        process.execPath, CLI, 'run', 'semgrep', '--', 'scan', '--config', 'rules.yml',
        '--baseline-commit', input.baseline, '--metrics', 'off', '--disable-version-check', '--json'], {
        cwd: input.projectRoot, env: input.env, input: '', encoding: 'utf8', timeout: 30000,
    });

    assert.equal(result.status, 0, result.stderr);
    assert.deepEqual(snapshot(input.projectRoot, paths), before);
    const scanned = JSON.parse(result.stdout);
    assert.notEqual(scanned.cwd, input.projectRoot);
    assert.equal(scanned.head, input.head);
    assert.equal(scanned.baseline, input.baseline);
    assert.equal(scanned.dataMode, 0o600);
    assert.equal(scanned.hookMode, 0o700);
    assert.equal(fs.existsSync(scanned.cwd), false);
    assert.equal(input.git('status', '--porcelain'), '');
});

for (const objectFormat of ['sha1', 'sha256']) {
    test(`retains native Semgrep baseline filtering and relative paths with ${objectFormat}`, (t) => {
        const input = fixture(t, objectFormat);
        const paths = [...Object.keys(input.files), '.git/HEAD', '.git/index',
            '.git/refs/heads/fixture', '.git/logs/HEAD', '.git/logs/refs/heads/fixture'];
        const before = snapshot(input.projectRoot, paths);

        const result = spawnSync(process.execPath, [CLI, 'run', 'semgrep', '--',
            'scan', '--config', 'rules.yml', '--baseline-commit', input.baseline,
            '--metrics', 'off', '--disable-version-check', '--json'], {
            cwd: input.projectRoot, env: {...input.env, PATH: process.env.PATH},
            input: '', encoding: 'utf8', timeout: 60000,
        });

        assert.equal(result.status, 0, result.stderr);
        const report = JSON.parse(result.stdout);
        assert.deepEqual(report.results.map((finding) => ({path: finding.path, line: finding.start.line})),
            [{path: 'source file.js', line: 2}]);
        assert.deepEqual(snapshot(input.projectRoot, paths), before);
    });
}

test('reports consumer drift separately from scanner success without repairing it', async (t) => {
    const input = fixture(t);
    const file = path.join(input.projectRoot, '.prism/project.json');
    const executable = input.executable('semgrep', `
require('node:fs').chmodSync(${JSON.stringify(file)}, 0o600);
process.stdout.write(JSON.stringify({cwd: process.cwd(), results: []}));
`);

    const result = await runIsolatedSemgrep({
        projectRoot: input.projectRoot, executable, env: input.env,
        args: ['scan', '--config', 'rules.yml', '--baseline-commit', input.baseline,
            '--metrics', 'off', '--disable-version-check', '--json'],
    });

    assert.equal(result.status, 0);
    assert.equal(result.error?.code, 'SEMGREP_PRESERVATION');
    assert.equal(fs.lstatSync(file).mode & 0o7777, 0o600);
    const scanned = JSON.parse(result.stdout);
    assert.deepEqual(scanned.results, []);
    assert.equal(fs.existsSync(scanned.cwd), false);
});

test('rejects undeclared registry and untracked configurations before scanner execution', async (t) => {
    const input = fixture(t);
    const marker = path.join(input.root, 'scanner-ran');
    const executable = input.executable('semgrep', `require('node:fs').writeFileSync(${JSON.stringify(marker)}, 'ran');`);
    fs.writeFileSync(path.join(input.projectRoot, 'untracked.yml'), 'rules: []\n', {mode: 0o600});
    for (const config of ['p/unapproved', 'auto', 'untracked.yml', 'https://example.test/rules.yml']) {
        const result = await runIsolatedSemgrep({
            projectRoot: input.projectRoot, executable, env: input.env,
            args: ['scan', '--config', config, '--baseline-commit', input.baseline,
                '--metrics', 'off', '--disable-version-check'],
        });

        assert.notEqual(result.error, undefined, config);
        assert.equal(fs.existsSync(marker), false, config);
    }
});

test('isolates an environment-selected baseline and passes its identity explicitly', (t) => {
    const input = fixture(t);
    const before = snapshot(input.projectRoot, [...Object.keys(input.files), '.git/index', '.git/logs/HEAD']);

    const result = spawnSync(process.execPath, [CLI, 'run', 'semgrep', '--',
        'scan', '--config', 'rules.yml', '--metrics', 'off', '--disable-version-check', '--json'], {
        cwd: input.projectRoot, env: {...input.env, SEMGREP_BASELINE_COMMIT: input.baseline},
        input: '', encoding: 'utf8', timeout: 30000,
    });

    assert.equal(result.status, 0, result.stderr);
    const scanned = JSON.parse(result.stdout);
    assert.equal(scanned.baseline, input.baseline);
    assert.equal(scanned.baselineEnv, undefined);
    assert.notEqual(scanned.cwd, input.projectRoot);
    assert.deepEqual(snapshot(input.projectRoot, Object.keys(before)), before);
});

test('rejects conflicting CLI and environment baselines before scanning', async (t) => {
    const input = fixture(t);
    const marker = path.join(input.root, 'scanner-ran');
    const executable = input.executable('semgrep', `require('node:fs').writeFileSync(${JSON.stringify(marker)}, 'ran');`);

    const result = await runIsolatedSemgrep({
        projectRoot: input.projectRoot, executable,
        env: {...input.env, SEMGREP_BASELINE_COMMIT: input.head},
        args: ['scan', '--config', 'rules.yml', '--baseline-commit', input.baseline],
    });

    assert.notEqual(result.error, undefined);
    assert.equal(fs.existsSync(marker), false);
});

test('runs native no-baseline scans without dropping existing findings', (t) => {
    const input = fixture(t);
    const before = snapshot(input.projectRoot, [...Object.keys(input.files), '.git/index', '.git/logs/HEAD']);

    const result = spawnSync(process.execPath, [CLI, 'run', 'semgrep', '--',
        'scan', '--config', 'rules.yml', '--metrics', 'off', '--disable-version-check', '--json'], {
        cwd: input.projectRoot, env: {...input.env, PATH: process.env.PATH},
        input: '', encoding: 'utf8', timeout: 60000,
    });

    assert.equal(result.status, 0, result.stderr);
    assert.deepEqual(JSON.parse(result.stdout).results.map((finding) => ({path: finding.path, line: finding.start.line})),
        [{path: 'source file.js', line: 1}, {path: 'source file.js', line: 2}]);
    assert.deepEqual(snapshot(input.projectRoot, Object.keys(before)), before);
});

test('retains the native effective merge base for divergent history', (t) => {
    const input = fixture(t);
    input.git('switch', '-c', 'divergent', input.baseline);
    fs.appendFileSync(path.join(input.projectRoot, 'source file.js'), 'dangerous("new");\n');
    input.git('add', '--', 'source file.js');
    input.commit('same finding on divergent branch');
    const baseline = input.git('rev-parse', 'HEAD').trim();
    input.git('switch', 'fixture');
    assert.equal(input.git('merge-base', baseline, input.head).trim(), input.baseline);
    const before = snapshot(input.projectRoot, [...Object.keys(input.files), '.git/index', '.git/logs/HEAD']);

    const result = spawnSync(process.execPath, [CLI, 'run', 'semgrep', '--',
        'scan', '--config', 'rules.yml', '--baseline-commit', baseline,
        '--metrics', 'off', '--disable-version-check', '--json'], {
        cwd: input.projectRoot, env: {...input.env, PATH: process.env.PATH},
        input: '', encoding: 'utf8', timeout: 60000,
    });

    assert.equal(result.status, 0, result.stderr);
    assert.deepEqual(JSON.parse(result.stdout).results.map((finding) => ({path: finding.path, line: finding.start.line})),
        [{path: 'source file.js', line: 2}]);
    assert.deepEqual(snapshot(input.projectRoot, Object.keys(before)), before);
});

test('resolves revision baselines and accepts consistent CLI and environment identities', (t) => {
    const input = fixture(t);
    const before = snapshot(input.projectRoot, [...Object.keys(input.files), '.git/index', '.git/logs/HEAD']);

    const result = spawnSync(process.execPath, [CLI, 'run', 'semgrep', '--',
        'scan', '--config', 'rules.yml', '--baseline-commit', 'HEAD~1', '--metrics', 'off', '--json'], {
        cwd: input.projectRoot, env: {...input.env, SEMGREP_BASELINE_COMMIT: input.baseline},
        input: '', encoding: 'utf8', timeout: 30000,
    });

    assert.equal(result.status, 0, result.stderr);
    assert.equal(JSON.parse(result.stdout).baseline, input.baseline);
    assert.deepEqual(snapshot(input.projectRoot, Object.keys(before)), before);
});

test('rejects untracked source changes rather than silently omitting them', async (t) => {
    const input = fixture(t);
    fs.writeFileSync(path.join(input.projectRoot, 'untracked.js'), 'dangerous("untracked");\n');
    const marker = path.join(input.root, 'scanner-ran');
    const executable = input.executable('semgrep', `require('node:fs').writeFileSync(${JSON.stringify(marker)}, 'ran');`);

    const result = await runIsolatedSemgrep({
        projectRoot: input.projectRoot, executable, env: input.env,
        args: ['scan', '--config', 'rules.yml', '--baseline-commit', input.baseline],
    });

    assert.notEqual(result.error, undefined);
    assert.equal(fs.existsSync(marker), false);
    assert.equal(fs.readFileSync(path.join(input.projectRoot, 'untracked.js'), 'utf8'), 'dangerous("untracked");\n');
});

test('omits ignored canaries without reading them and isolates scanner environment state', async (t) => {
    const input = fixture(t);
    const canary = path.join(input.projectRoot, 'ignored-canaries', 'fixture.txt');
    fs.mkdirSync(path.dirname(canary), {mode: 0o700});
    fs.writeFileSync(canary, 'synthetic unreadable canary', {mode: 0o000});
    const before = fs.lstatSync(canary);
    const executable = input.executable('semgrep', `
const fs = require('node:fs');
process.stdout.write(JSON.stringify({cwd: process.cwd(),
    canaryPresent: fs.existsSync('ignored-canaries/fixture.txt'),
    directories: ['HOME', 'XDG_CONFIG_HOME', 'XDG_CACHE_HOME', 'TMPDIR'].map(key =>
        ({path: process.env[key], mode: fs.lstatSync(process.env[key]).mode & 0o7777})),
    inherited: [process.env.SEMGREP_APP_TOKEN, process.env.GIT_SSH_COMMAND, process.env.NODE_OPTIONS]}));
`);

    const result = await runIsolatedSemgrep({
        projectRoot: input.projectRoot, executable,
        env: {...input.env, SEMGREP_APP_TOKEN: 'not-a-real-token', GIT_SSH_COMMAND: 'synthetic-command',
            NODE_OPTIONS: '--synthetic-unsupported-option'},
        args: ['scan', '--config', 'rules.yml', '--baseline-commit', input.baseline],
    });

    assert.equal(result.error, undefined);
    assert.equal(result.status, 0, result.stderr);
    const scanned = JSON.parse(result.stdout);
    assert.equal(scanned.canaryPresent, false);
    assert.deepEqual(scanned.inherited, [null, null, null]);
    for (const directory of scanned.directories) {
        assert.equal(directory.mode, 0o700);
        assert.equal(path.dirname(directory.path), path.dirname(scanned.cwd));
        assert.equal(fs.existsSync(directory.path), false);
    }
    assert.deepEqual(fs.lstatSync(canary), before);
});

test('rejects invalid caller bounds before starting a scanner', async (t) => {
    const input = fixture(t);
    const marker = path.join(input.root, 'scanner-ran');
    const executable = input.executable('semgrep', `require('node:fs').writeFileSync(${JSON.stringify(marker)}, 'ran');`);
    for (const limits of [{maxBuffer: NaN}, {maxBuffer: 0}, {maxBuffer: Infinity},
        {timeoutMs: NaN}, {timeoutMs: 0}, {timeoutMs: Infinity}]) {
        const result = await runIsolatedSemgrep({
            projectRoot: input.projectRoot, executable, env: input.env,
            args: ['scan', '--config', 'rules.yml'], ...limits,
        });
        assert.notEqual(result.error, undefined, JSON.stringify(limits));
        assert.equal(fs.existsSync(marker), false);
    }
});

test('distinguishes scanner spawn failure from an ordinary nonzero scanner exit', async (t) => {
    const input = fixture(t);
    const request = {projectRoot: input.projectRoot, env: input.env,
        args: ['scan', '--config', 'rules.yml']};
    const failed = await runIsolatedSemgrep({...request, executable: path.join(input.root, 'missing-scanner')});
    assert.notEqual(failed.error, undefined);
    assert.equal(failed.timedOut, false);

    const executable = input.executable('semgrep', `
process.stdout.write(JSON.stringify({cwd: process.cwd(), results: []}));
process.stderr.write('synthetic scanner failure');
process.exitCode = 127;
`);
    const exited = await runIsolatedSemgrep({...request, executable});
    assert.equal(exited.status, 127);
    assert.equal(exited.error, undefined);
    assert.equal(exited.stderr, 'synthetic scanner failure');
    assert.equal(fs.existsSync(JSON.parse(exited.stdout).cwd), false);
});

test('reserves time for preservation proof and cleanup after a scanner timeout', async (t) => {
    const input = fixture(t);
    t.mock.method(os, 'tmpdir', () => input.root);
    const before = snapshot(input.projectRoot, [...Object.keys(input.files), '.git/index', '.git/logs/HEAD']);
    const executable = input.executable('semgrep', `setInterval(() => {}, 1000);`);
    const temporaryEntries = fs.readdirSync(input.root).sort();

    const result = await runIsolatedSemgrep({
        projectRoot: input.projectRoot, executable, env: input.env, timeoutMs: 2000,
        args: ['scan', '--config', 'rules.yml'],
    });

    assert.equal(result.timedOut, true);
    assert.match(result.error?.message ?? '', /timed out/);
    assert.notEqual(result.error?.code, 'SEMGREP_PRESERVATION');
    assert.deepEqual(snapshot(input.projectRoot, Object.keys(before)), before);
    assert.deepEqual(fs.readdirSync(input.root).sort(), temporaryEntries);
});

test('supports shipped targeted rule-fixture arguments without widening the scan', (t) => {
    const input = fixture(t);
    fs.writeFileSync(path.join(input.projectRoot, 'other.js'), 'dangerous("outside target");\n');
    input.git('add', '--', 'other.js');
    input.commit('additional public source');
    const before = snapshot(input.projectRoot, [...Object.keys(input.files), 'other.js', '.git/index', '.git/logs/HEAD']);

    const result = spawnSync(process.execPath, [CLI, 'run', 'semgrep', '--',
        'scan', '--config', 'rules.yml', '--baseline-commit', input.baseline,
        '--metrics', 'off', '--disable-version-check', '--json', '--x-ignore-semgrepignore-files', 'source file.js'], {
        cwd: input.projectRoot, env: {...input.env, PATH: process.env.PATH},
        input: '', encoding: 'utf8', timeout: 60000,
    });

    assert.equal(result.status, 0, result.stderr);
    assert.deepEqual(JSON.parse(result.stdout).results.map((finding) => ({path: finding.path, line: finding.start.line})),
        [{path: 'source file.js', line: 2}]);
    assert.deepEqual(snapshot(input.projectRoot, Object.keys(before)), before);
});

test('rejects executable-bit working changes without normalizing the consumer', async (t) => {
    const input = fixture(t);
    const file = path.join(input.projectRoot, 'source file.js');
    fs.chmodSync(file, 0o744);
    const marker = path.join(input.root, 'scanner-ran');
    const executable = input.executable('semgrep', `require('node:fs').writeFileSync(${JSON.stringify(marker)}, 'ran');`);

    const result = await runIsolatedSemgrep({
        projectRoot: input.projectRoot, executable, env: input.env,
        args: ['scan', '--config', 'rules.yml'],
    });

    assert.notEqual(result.error, undefined);
    assert.equal(fs.existsSync(marker), false);
    assert.equal(fs.lstatSync(file).mode & 0o7777, 0o744);
});

test('rejects a consumer-contained temporary root before creating any workspace', async (t) => {
    const input = fixture(t);
    t.mock.method(os, 'tmpdir', () => input.projectRoot);
    const before = fs.lstatSync(input.projectRoot);
    const result = await runIsolatedSemgrep({
        projectRoot: input.projectRoot, executable: path.join(input.root, 'bin', 'semgrep'), env: input.env,
        args: ['scan', '--config', 'rules.yml', '--baseline-commit', input.baseline],
    });

    assert.notEqual(result.error, undefined);
    const after = fs.lstatSync(input.projectRoot);
    for (const field of ['dev', 'ino', 'uid', 'gid', 'mode', 'mtimeMs', 'ctimeMs']) {
        assert.equal(after[field], before[field], field);
    }
});

for (const signal of ['SIGINT', 'SIGTERM']) {
    test(`handles ${signal} by stopping the owned scanner group before cleanup`, async (t) => {
        const input = fixture(t);
        const marker = path.join(input.root, 'scanner-started.json');
        input.executable('semgrep', `
if (process.argv[2] === '--version') { process.stdout.write('1.173.0\\n'); process.exit(0); }
require('node:fs').writeFileSync(${JSON.stringify(marker)}, JSON.stringify({cwd: process.cwd(), group: process.ppid}));
setInterval(() => {}, 1000);
`);
        const before = snapshot(input.projectRoot, [...Object.keys(input.files), '.git/index', '.git/logs/HEAD']);
        const child = spawn(process.execPath, [CLI, 'run', 'semgrep', '--', 'scan', '--config', 'rules.yml'], {
            cwd: input.projectRoot, env: {...input.env, TMPDIR: input.root}, stdio: ['ignore', 'pipe', 'pipe'],
        });
        let group;
        t.after(() => {
            if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL');
            if (Number.isSafeInteger(group) && group > 1) {
                try { process.kill(-group, 'SIGKILL'); }
                catch (error) { if (error.code !== 'ESRCH') throw error; }
            }
        });
        let stderr = '';
        child.stdout.resume();
        child.stderr.on('data', (bytes) => { stderr += bytes; });
        const closed = new Promise((resolve) => child.once('close', (status, caughtSignal) => resolve({status, caughtSignal})));
        for (let attempt = 0; !fs.existsSync(marker) && attempt < 400; attempt += 1) await delay(25);
        assert.equal(fs.existsSync(marker), true, stderr);
        const started = JSON.parse(fs.readFileSync(marker, 'utf8'));
        group = started.group;
        child.kill(signal);
        const result = await closed;

        assert.equal(result.status, 4, stderr);
        assert.equal(result.caughtSignal, null);
        assert.match(stderr, /semgrep.*interrupted/);
        assert.equal(fs.existsSync(started.cwd), false);
        assert.deepEqual(snapshot(input.projectRoot, Object.keys(before)), before);
    });
}

test('handles interruption during Git preparation without waiting for the Git timeout', async (t) => {
    const input = fixture(t);
    const marker = path.join(input.root, 'git-started.json');
    const nativeGit = resolveExecutable('git', process.env);
    assert.equal(typeof nativeGit, 'string');
    input.executable('git', `
const args = process.argv.slice(2);
if (args.includes('cat-file')) {
    require('node:fs').writeFileSync(${JSON.stringify(marker)}, JSON.stringify({pid: process.pid}));
    setInterval(() => {}, 1000);
} else {
    require('node:child_process').execFileSync(${JSON.stringify(nativeGit)}, args, {stdio: 'inherit'});
}
`);
    const before = snapshot(input.projectRoot, [...Object.keys(input.files), '.git/index', '.git/logs/HEAD']);
    const child = spawn(process.execPath, [CLI, 'run', 'semgrep', '--', 'scan', '--config', 'rules.yml'], {
        cwd: input.projectRoot, env: {...input.env, TMPDIR: input.root}, detached: true,
        stdio: ['ignore', 'pipe', 'pipe'],
    });
    let gitPid;
    t.after(() => {
        for (const group of [child.pid, gitPid]) {
            if (!Number.isSafeInteger(group) || group <= 1) continue;
            try { process.kill(-group, 'SIGKILL'); }
            catch (error) { if (error.code !== 'ESRCH') throw error; }
        }
    });
    child.stdout.resume();
    let stderr = '';
    child.stderr.on('data', (bytes) => { stderr += bytes; });
    const closed = new Promise((resolve) => child.once('close', (status) => resolve(status)));
    for (let attempt = 0; !fs.existsSync(marker) && attempt < 400; attempt += 1) await delay(25);
    assert.equal(fs.existsSync(marker), true, stderr);
    gitPid = JSON.parse(fs.readFileSync(marker, 'utf8')).pid;
    child.kill('SIGTERM');
    let timer;
    const tooSlow = new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error('preparation interruption did not stop promptly')), 2500);
    });
    try {
        assert.equal(await Promise.race([closed, tooSlow]), 4, stderr);
    } finally {
        clearTimeout(timer);
    }
    assert.match(stderr, /semgrep.*interrupted/);
    assert.deepEqual(fs.readdirSync(input.root).filter((name) => name.startsWith('prism-semgrep-')), []);
    assert.deepEqual(snapshot(input.projectRoot, Object.keys(before)), before);
});

test('retains native Gitlink identity without exporting populated submodule contents', (t) => {
    const input = fixture(t);
    input.git('update-index', '--add', '--cacheinfo', `160000,${input.baseline},third-party`);
    input.commit('opaque Gitlink fixture');
    const canary = path.join(input.projectRoot, 'third-party', 'canary.js');
    fs.mkdirSync(path.dirname(canary), {mode: 0o700});
    fs.writeFileSync(canary, 'dangerous("submodule content");\n', {mode: 0o000});
    const canaryBefore = fs.lstatSync(canary);
    const before = snapshot(input.projectRoot, [...Object.keys(input.files), '.git/index', '.git/logs/HEAD']);

    const result = spawnSync(process.execPath, [CLI, 'run', 'semgrep', '--',
        'scan', '--config', 'rules.yml', '--baseline-commit', input.baseline,
        '--metrics', 'off', '--disable-version-check', '--json'], {
        cwd: input.projectRoot, env: {...input.env, PATH: process.env.PATH},
        input: '', encoding: 'utf8', timeout: 60000,
    });

    assert.equal(result.status, 0, result.stderr);
    assert.deepEqual(JSON.parse(result.stdout).results.map((finding) => ({path: finding.path, line: finding.start.line})),
        [{path: 'source file.js', line: 2}]);
    assert.deepEqual(snapshot(input.projectRoot, Object.keys(before)), before);
    assert.deepEqual(fs.lstatSync(canary), canaryBefore);
});

test('keeps exact help probes separate from repository scanning and baseline selection', (t) => {
    const input = fixture(t);
    fs.appendFileSync(path.join(input.projectRoot, 'source file.js'), '// dirty input is not scanned by help\n');
    const before = snapshot(input.projectRoot, [...Object.keys(input.files), '.git/index', '.git/logs/HEAD']);

    const result = spawnSync(process.execPath, [CLI, 'run', 'semgrep', '--', 'scan', '--help'], {
        cwd: input.projectRoot, env: {...input.env, PATH: process.env.PATH, SEMGREP_BASELINE_COMMIT: 'missing-help-baseline'},
        input: '', encoding: 'utf8', timeout: 60000,
    });

    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout.replace(/\x1b\[[0-9;]*m/g, ''), /x-ignore-semgrepignore-files/);
    assert.deepEqual(snapshot(input.projectRoot, Object.keys(before)), before);
});

test('rejects excluded historical endpoints before blob reads but permits unrelated historical blobs', (t) => {
    const input = fixture(t);
    const relative = 'historical-private.txt';
    const protectedPath = path.join(input.projectRoot, relative);
    fs.writeFileSync(protectedPath, 'synthetic historical canary\n');
    input.git('add', '--', relative);
    input.commit('historical canary');
    const unsafeBaseline = input.git('rev-parse', 'HEAD').trim();
    const canaryId = input.git('rev-parse', `${unsafeBaseline}:${relative}`).trim();
    fs.unlinkSync(protectedPath);
    input.git('add', '--', relative);
    input.commit('remove historical canary');
    const attempted = path.join(input.root, 'forbidden-read-attempted');
    const preload = path.join(input.root, 'guard-historical-read.cjs');
    fs.writeFileSync(preload, `
const cp = require('node:child_process');
const original = cp.spawn;
cp.spawn = function(command, args, options) {
    if (command === 'git' && args.includes('cat-file') && args.includes(${JSON.stringify(canaryId)})) {
        require('node:fs').writeFileSync(${JSON.stringify(attempted)}, 'blocked before content read');
        throw new Error('synthetic canary read blocked');
    }
    return original.call(this, command, args, options);
};
`);
    const before = snapshot(input.projectRoot, [...Object.keys(input.files), '.git/index', '.git/logs/HEAD']);
    const run = (baseline) => spawnSync(process.execPath, [CLI, 'run', 'semgrep', '--',
        'scan', '--config', 'rules.yml', '--baseline-commit', baseline,
        '--metrics', 'off', '--disable-version-check', '--json'], {
        cwd: input.projectRoot, env: {...input.env, PATH: process.env.PATH,
            PRISM_SENSITIVE_PATHS: protectedPath, NODE_OPTIONS: `--require=${preload}`},
        input: '', encoding: 'utf8', timeout: 60000,
    });

    const rejected = run(unsafeBaseline);
    assert.equal(rejected.status, 4);
    assert.equal(fs.existsSync(attempted), false);
    assert.deepEqual(snapshot(input.projectRoot, Object.keys(before)), before);

    const permitted = run(input.baseline);
    assert.equal(permitted.status, 0, permitted.stderr);
    assert.deepEqual(JSON.parse(permitted.stdout).results.map((finding) => ({path: finding.path, line: finding.start.line})),
        [{path: 'source file.js', line: 2}]);
    assert.equal(fs.existsSync(attempted), false);
    assert.deepEqual(snapshot(input.projectRoot, Object.keys(before)), before);
});

test('does not silently classify untracked first-party directories as dependencies by name', async (t) => {
    const input = fixture(t);
    fs.mkdirSync(path.join(input.projectRoot, 'vendor'), {mode: 0o700});
    const source = path.join(input.projectRoot, 'vendor', 'first-party.js');
    fs.writeFileSync(source, 'dangerous("untracked first-party code");\n');
    const marker = path.join(input.root, 'scanner-ran');
    const executable = input.executable('semgrep', `require('node:fs').writeFileSync(${JSON.stringify(marker)}, 'ran');`);

    const result = await runIsolatedSemgrep({
        projectRoot: input.projectRoot, executable, env: input.env,
        args: ['scan', '--config', 'rules.yml'],
    });

    assert.notEqual(result.error, undefined);
    assert.equal(fs.existsSync(marker), false);
    assert.equal(fs.readFileSync(source, 'utf8'), 'dangerous("untracked first-party code");\n');
});

test('scans an Actions-style checkout without reading inactive worktree configuration', (t) => {
    const input = fixture(t);
    input.git('sparse-checkout', 'disable');
    input.git('config', '--local', '--unset-all', 'extensions.worktreeConfig');
    const dormant = path.join(input.projectRoot, '.git', 'config.worktree');
    assert.equal(fs.lstatSync(dormant).isFile(), true);
    fs.chmodSync(dormant, 0o000);
    const dormantBefore = fs.lstatSync(dormant);
    const before = snapshot(input.projectRoot, [...Object.keys(input.files), '.git/config', '.git/index', '.git/HEAD']);

    const result = spawnSync(process.execPath, [CLI, 'run', 'semgrep', '--',
        'scan', '--config', 'rules.yml', '--metrics', 'off', '--disable-version-check', '--json'], {
        cwd: input.projectRoot, env: {...input.env, PATH: process.env.PATH},
        input: '', encoding: 'utf8', timeout: 60000,
    });

    assert.equal(result.status, 0, result.stderr);
    assert.deepEqual(JSON.parse(result.stdout).results.map((finding) => ({path: finding.path, line: finding.start.line})),
        [{path: 'source file.js', line: 1}, {path: 'source file.js', line: 2}]);
    assert.deepEqual(snapshot(input.projectRoot, Object.keys(before)), before);
    assert.deepEqual(fs.lstatSync(dormant), dormantBefore);
});

test('rejects additional worktree configuration before invoking source Git', (t) => {
    const input = fixture(t);
    input.git('config', 'extensions.worktreeConfig', 'true');
    fs.writeFileSync(path.join(input.projectRoot, '.git', 'config.worktree'), 'synthetic private configuration\n', {mode: 0o000});
    const attempted = path.join(input.root, 'source-git-attempted');
    const preload = path.join(input.root, 'guard-source-git.cjs');
    fs.writeFileSync(preload, `
const cp = require('node:child_process');
const original = cp.spawn;
cp.spawn = function(command, args, options) {
    if (command === 'git' && options.cwd === ${JSON.stringify(input.projectRoot)}) {
        require('node:fs').writeFileSync(${JSON.stringify(attempted)}, 'blocked before Git can read private configuration');
        throw new Error('synthetic source Git blocked');
    }
    return original.call(this, command, args, options);
};
`);
    const result = spawnSync(process.execPath, [CLI, 'run', 'semgrep', '--', 'scan', '--config', 'rules.yml'], {
        cwd: input.projectRoot, env: {...input.env, NODE_OPTIONS: `--require=${preload}`},
        input: '', encoding: 'utf8', timeout: 30000,
    });

    assert.equal(result.status, 4);
    assert.equal(fs.existsSync(attempted), false);
});

test('makes tracked local configurations unambiguous instead of treating them as registry identifiers', async (t) => {
    const input = fixture(t);
    fs.mkdirSync(path.join(input.projectRoot, 'p'), {mode: 0o700});
    fs.writeFileSync(path.join(input.projectRoot, 'p', 'local-fixture'), input.files['rules.yml'][0]);
    input.git('add', '--', 'p/local-fixture');
    input.commit('local configuration with a registry-like path');
    const executable = input.executable('semgrep', 'process.stdout.write(JSON.stringify(process.argv.slice(2)));');

    const result = await runIsolatedSemgrep({
        projectRoot: input.projectRoot, executable, env: input.env,
        args: ['scan', '--config', 'p/local-fixture'],
    });

    assert.equal(result.error, undefined);
    assert.deepEqual(JSON.parse(result.stdout), ['scan', '--config', './p/local-fixture']);
});

test('rejects invalid UTF-8 tree paths instead of conflating them with different working files', async (t) => {
    const input = fixture(t);
    const rawPath = Buffer.concat([Buffer.from(`${input.projectRoot}/`), Buffer.from([0xff]), Buffer.from('.js')]);
    const contents = 'dangerous("encoding collision");\n';
    fs.writeFileSync(rawPath, contents);
    input.git('add', '--all');
    input.commit('raw byte filename');
    fs.writeFileSync(path.join(input.projectRoot, '\ufffd.js'), contents);
    const marker = path.join(input.root, 'scanner-ran');
    const executable = input.executable('semgrep', `require('node:fs').writeFileSync(${JSON.stringify(marker)}, 'ran');`);
    const before = snapshot(input.projectRoot, [...Object.keys(input.files), '.git/index']);

    const result = await runIsolatedSemgrep({
        projectRoot: input.projectRoot, executable, env: input.env,
        args: ['scan', '--config', 'rules.yml'],
    });

    assert.notEqual(result.error, undefined);
    assert.equal(fs.existsSync(marker), false);
    assert.deepEqual(snapshot(input.projectRoot, Object.keys(before)), before);
});

test('rejects invalid UTF-8 staged paths instead of hiding an index rename', async (t) => {
    const input = fixture(t);
    const valid = '\ufffd.js';
    const contents = 'dangerous("staged encoding collision");\n';
    fs.writeFileSync(path.join(input.projectRoot, valid), contents);
    input.git('add', '--', valid);
    input.commit('valid Unicode filename');
    const id = input.git('rev-parse', `HEAD:${valid}`).trim();
    fs.writeFileSync(Buffer.concat([Buffer.from(`${input.projectRoot}/`), Buffer.from([0xff]), Buffer.from('.js')]), contents);
    input.git('rm', '--cached', '--', valid);
    execFileSync('git', ['update-index', '-z', '--index-info'], {
        cwd: input.projectRoot, env: input.env, timeout: 15000,
        input: Buffer.concat([Buffer.from(`100644 ${id}\t`), Buffer.from([0xff]), Buffer.from('.js\0')]),
    });
    const marker = path.join(input.root, 'scanner-ran');
    const executable = input.executable('semgrep', `require('node:fs').writeFileSync(${JSON.stringify(marker)}, 'ran');`);
    const before = snapshot(input.projectRoot, [...Object.keys(input.files), '.git/index']);

    const result = await runIsolatedSemgrep({
        projectRoot: input.projectRoot, executable, env: input.env,
        args: ['scan', '--config', 'rules.yml'],
    });

    assert.notEqual(result.error, undefined);
    assert.equal(fs.existsSync(marker), false);
    assert.deepEqual(snapshot(input.projectRoot, Object.keys(before)), before);
});

test('rejects untracked raw-byte names that collide after UTF-8 replacement', async (t) => {
    const input = fixture(t);
    fs.writeFileSync(path.join(input.projectRoot, '\ufffd.js'), 'dangerous("tracked");\n');
    input.git('add', '--all');
    input.commit('tracked Unicode filename');
    const rawPath = Buffer.concat([Buffer.from(`${input.projectRoot}/`), Buffer.from([0xff]), Buffer.from('.js')]);
    fs.writeFileSync(rawPath, 'dangerous("untracked");\n');
    const marker = path.join(input.root, 'scanner-ran');
    const executable = input.executable('semgrep', `require('node:fs').writeFileSync(${JSON.stringify(marker)}, 'ran');`);

    const result = await runIsolatedSemgrep({
        projectRoot: input.projectRoot, executable, env: input.env,
        args: ['scan', '--config', 'rules.yml'],
    });

    assert.notEqual(result.error, undefined);
    assert.equal(fs.existsSync(marker), false);
});

test('preserves validated Unicode target paths in native findings', (t) => {
    const input = fixture(t);
    const directory = 'café sources';
    const relative = `${directory}/é.js`;
    fs.mkdirSync(path.join(input.projectRoot, directory), {mode: 0o700});
    fs.writeFileSync(path.join(input.projectRoot, relative), 'dangerous("Unicode target");\n');
    input.git('add', '--', relative);
    input.commit('Unicode target fixture');
    const result = spawnSync(process.execPath, [CLI, 'run', 'semgrep', '--',
        'scan', '--config', 'rules.yml', '--baseline-commit', input.baseline,
        '--metrics', 'off', '--disable-version-check', '--json', '--', `${directory}/`], {
        cwd: input.projectRoot, env: {...input.env, PATH: process.env.PATH},
        input: '', encoding: 'utf8', timeout: 60000,
    });

    assert.equal(result.status, 0, result.stderr);
    assert.deepEqual(JSON.parse(result.stdout).results.map((finding) => ({path: finding.path, line: finding.start.line})),
        [{path: relative, line: 1}]);
});

test('bounds aggregate Git preparation metadata rather than each response independently', async (t) => {
    const input = fixture(t);
    const nativeGit = resolveExecutable('git', process.env);
    input.executable('git', `
const args = process.argv.slice(2);
if (args.includes('rev-list')) {
    process.stdout.write((${JSON.stringify(input.head)} + '\\n').repeat(Math.floor(67108864 / 41)));
} else {
    require('node:child_process').execFileSync(${JSON.stringify(nativeGit)}, args, {stdio: 'inherit'});
}
`);
    const marker = path.join(input.root, 'scanner-ran');
    const executable = input.executable('semgrep', `require('node:fs').writeFileSync(${JSON.stringify(marker)}, 'ran');`);

    const result = await runIsolatedSemgrep({
        projectRoot: input.projectRoot, executable, env: input.env,
        args: ['scan', '--config', 'rules.yml'],
    });

    assert.notEqual(result.error, undefined);
    assert.equal(fs.existsSync(marker), false);
});

test('rejects stdin selectors and unsupported controls before scanner execution', async (t) => {
    const input = fixture(t);
    fs.writeFileSync(path.join(input.projectRoot, '-'), input.files['rules.yml'][0]);
    input.git('add', '--', '-');
    input.commit('literal dash filename');
    const marker = path.join(input.root, 'scanner-ran');
    const executable = input.executable('semgrep', `require('node:fs').writeFileSync(${JSON.stringify(marker)}, 'ran');`);
    for (const args of [
        ['scan', '--config', '-'],
        ['scan', '--config', 'rules.yml', '--', '-'],
        ['scan', '--config', 'rules.yml', '--autofix'],
        ['scan', '--config', 'rules.yml', '--output', 'results.json'],
        ['scan', '--config', 'rules.yml', '--stdin-filename', 'input.js'],
        ['scan', '--config', 'rules.yml', '--metrics', 'on'],
        ['scan', '--config', 'rules.yml', '--baseline-commit'],
        ['scan', '--config', 'rules.yml', '--baseline-commit', input.baseline, '--baseline-commit', input.baseline],
        ['scan', '--help', '--autofix'],
        ['scan', '--config', 'rules.yml', '--unknown-control'],
        ['ci'], ['login'], ['publish'],
    ]) {
        const result = await runIsolatedSemgrep({projectRoot: input.projectRoot, executable, env: input.env, args});
        assert.notEqual(result.error, undefined, JSON.stringify(args));
        assert.equal(fs.existsSync(marker), false, JSON.stringify(args));
    }
});

test('cleans a newly owned workspace when its initial permission setup fails', async (t) => {
    const input = fixture(t);
    t.mock.method(os, 'tmpdir', () => input.root);
    const chmod = fs.chmodSync;
    t.mock.method(fs, 'chmodSync', (file, mode) => {
        if (path.dirname(file) === input.root && path.basename(file).startsWith('prism-semgrep-')) {
            throw Object.assign(new Error('synthetic initial chmod failure'), {code: 'EACCES'});
        }
        return chmod(file, mode);
    });
    const result = await runIsolatedSemgrep({
        projectRoot: input.projectRoot, executable: path.join(input.root, 'bin', 'semgrep'), env: input.env,
        args: ['scan', '--config', 'rules.yml'],
    });

    assert.notEqual(result.error, undefined);
    assert.deepEqual(fs.readdirSync(input.root).filter((name) => name.startsWith('prism-semgrep-')), []);
});

test('reports cleanup failure independently of scanner success without retrying', async (t) => {
    const input = fixture(t);
    t.mock.method(os, 'tmpdir', () => input.root);
    const remove = fs.rmSync;
    let cleanupAttempts = 0;
    t.mock.method(fs, 'rmSync', (file, options) => {
        if (path.dirname(file) === input.root && path.basename(file).startsWith('prism-semgrep-')) {
            cleanupAttempts += 1;
            throw Object.assign(new Error('synthetic cleanup failure'), {code: 'EACCES'});
        }
        return remove(file, options);
    });
    const executable = input.executable('semgrep', 'process.stdout.write(JSON.stringify({cwd: process.cwd()}));');
    const result = await runIsolatedSemgrep({
        projectRoot: input.projectRoot, executable, env: input.env,
        args: ['scan', '--config', 'rules.yml'],
    });

    assert.equal(result.status, 0);
    assert.match(result.error?.message ?? '', /cleanup failed/);
    assert.equal(cleanupAttempts, 1);
    const directory = JSON.parse(result.stdout).cwd;
    assert.equal(fs.existsSync(directory), true);
    assert.equal(fs.lstatSync(path.dirname(directory)).mode & 0o7777, 0o700);
});

test('fails on either output stream exceeding caller or fixed bounds', async (t) => {
    const input = fixture(t);
    t.mock.method(os, 'tmpdir', () => input.root);
    for (const stream of ['stdout', 'stderr']) {
        for (const maximum of [32, 2097152]) {
            const limit = Math.min(maximum, 1048576);
            const executable = input.executable('semgrep', `process.${stream}.write('x'.repeat(${limit + 1}));`);
            const result = await runIsolatedSemgrep({
                projectRoot: input.projectRoot, executable, env: input.env, maxBuffer: maximum,
                args: ['scan', '--config', 'rules.yml'],
            });
            assert.match(result.error?.message ?? '', /output exceeds limit/);
            assert.equal(result.timedOut, false);
            assert.ok(Buffer.byteLength(result[stream]) <= limit);
            assert.deepEqual(fs.readdirSync(input.root).filter((name) => name.startsWith('prism-semgrep-')), []);
        }
    }
});

test('fails on missing historical objects without fetching or repairing the consumer', async (t) => {
    const input = fixture(t);
    const missing = input.git('rev-parse', `${input.baseline}:source file.js`).trim();
    const objectPath = path.join(input.projectRoot, '.git', 'objects', missing.slice(0, 2), missing.slice(2));
    input.git('remote', 'add', 'origin', 'fixture::unavailable');
    input.git('config', 'core.repositoryformatversion', '1');
    input.git('config', 'extensions.partialClone', 'origin');
    input.git('config', 'remote.origin.promisor', 'true');
    input.git('config', 'remote.origin.partialCloneFilter', 'blob:none');
    const fetchMarker = path.join(input.root, 'fetch-attempted');
    input.executable('git-remote-fixture', `require('node:fs').writeFileSync(${JSON.stringify(fetchMarker)}, 'fetch attempted'); process.exitCode = 1;`);
    fs.unlinkSync(objectPath);
    const scannerMarker = path.join(input.root, 'scanner-ran');
    const executable = input.executable('semgrep', `require('node:fs').writeFileSync(${JSON.stringify(scannerMarker)}, 'ran');`);
    const before = snapshot(input.projectRoot, [...Object.keys(input.files), '.git/index', '.git/logs/HEAD']);

    const result = await runIsolatedSemgrep({
        projectRoot: input.projectRoot, executable, env: input.env,
        args: ['scan', '--config', 'rules.yml', '--baseline-commit', input.baseline],
    });

    assert.notEqual(result.error, undefined);
    assert.equal(fs.existsSync(scannerMarker), false);
    assert.equal(fs.existsSync(fetchMarker), false);
    assert.equal(fs.existsSync(objectPath), false);
    assert.deepEqual(snapshot(input.projectRoot, Object.keys(before)), before);
});

test('rejects symlinked working files, parents, and Git administration without reading their targets', async (t) => {
    for (const kind of ['file', 'parent', 'index', 'git-directory']) {
        const input = fixture(t);
        let target;
        if (kind === 'file') {
            target = path.join(input.root, 'outside-rules.yml');
            fs.renameSync(path.join(input.projectRoot, 'rules.yml'), target);
            fs.symlinkSync(target, path.join(input.projectRoot, 'rules.yml'));
        } else if (kind === 'parent') {
            const directory = path.join(input.root, 'outside-manifest');
            fs.renameSync(path.join(input.projectRoot, '.prism'), directory);
            fs.symlinkSync(directory, path.join(input.projectRoot, '.prism'));
            target = path.join(directory, 'project.json');
        } else if (kind === 'index') {
            target = path.join(input.root, 'outside-index');
            fs.renameSync(path.join(input.projectRoot, '.git', 'index'), target);
            fs.symlinkSync(target, path.join(input.projectRoot, '.git', 'index'));
        } else {
            const directory = path.join(input.root, 'outside-git');
            fs.renameSync(path.join(input.projectRoot, '.git'), directory);
            fs.symlinkSync(directory, path.join(input.projectRoot, '.git'));
            target = path.join(directory, 'config');
        }
        const before = fs.lstatSync(target);
        const marker = path.join(input.root, 'scanner-ran');
        const executable = input.executable('semgrep', `require('node:fs').writeFileSync(${JSON.stringify(marker)}, 'ran');`);
        const result = await runIsolatedSemgrep({
            projectRoot: input.projectRoot, executable, env: input.env,
            args: ['scan', '--config', 'rules.yml'],
        });
        assert.notEqual(result.error, undefined, kind);
        assert.equal(fs.existsSync(marker), false, kind);
        assert.deepEqual(fs.lstatSync(target), before, kind);
    }
});

test('terminates lingering scanner descendants rather than leaving them behind', async (t) => {
    const input = fixture(t);
    const executable = input.executable('semgrep', `
const child = require('node:child_process').spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], {stdio: 'ignore'});
child.unref();
process.stdout.write(JSON.stringify({cwd: process.cwd(), group: process.ppid, descendant: child.pid}));
`);
    const result = await runIsolatedSemgrep({
        projectRoot: input.projectRoot, executable, env: input.env,
        args: ['scan', '--config', 'rules.yml'],
    });
    assert.equal(result.error, undefined);
    assert.equal(result.status, 0);
    const scanned = JSON.parse(result.stdout);
    t.after(() => {
        if (!Number.isSafeInteger(scanned.group) || scanned.group <= 1) return;
        try { process.kill(-scanned.group, 'SIGKILL'); }
        catch (error) { if (error.code !== 'ESRCH') throw error; }
    });
    const running = () => {
        try { process.kill(scanned.descendant, 0); }
        catch (error) { if (error.code === 'ESRCH') return false; throw error; }
        try {
            const stat = fs.readFileSync(`/proc/${scanned.descendant}/stat`, 'utf8');
            if (/\) Z /.test(stat)) return false;
        } catch (error) { if (error.code !== 'ENOENT') throw error; }
        return true;
    };
    for (let attempt = 0; running() && attempt < 200; attempt += 1) await delay(10);
    assert.equal(running(), false);
    assert.equal(fs.existsSync(scanned.cwd), false);
});

test('detects concurrent index and reference changes without repairing them', async (t) => {
    for (const kind of ['index', 'branch', 'new-tag']) {
        const input = fixture(t);
        const target = kind === 'index' ? '.git/index' : kind === 'branch'
            ? '.git/refs/heads/fixture' : '.git/refs/tags/concurrent-tag';
        const file = path.join(input.projectRoot, target);
        const action = kind === 'index'
            ? `fs.appendFileSync(${JSON.stringify(file)}, Buffer.from([0]));`
            : `fs.writeFileSync(${JSON.stringify(file)}, ${JSON.stringify(`${input.baseline}\n`)});`;
        const executable = input.executable('semgrep', `
const fs = require('node:fs');
${action}
process.stdout.write(JSON.stringify({cwd: process.cwd(), results: []}));
`);
        const result = await runIsolatedSemgrep({
            projectRoot: input.projectRoot, executable, env: input.env,
            args: ['scan', '--config', 'rules.yml'],
        });

        assert.equal(result.status, 0, kind);
        assert.equal(result.error?.code, 'SEMGREP_PRESERVATION', kind);
        assert.equal(fs.existsSync(JSON.parse(result.stdout).cwd), false, kind);
        if (kind !== 'index') assert.equal(fs.readFileSync(file, 'utf8'), `${input.baseline}\n`, kind);
    }
});

test('fails closed on reference storage that its preservation reader cannot verify', async (t) => {
    const input = fixture(t);
    fs.mkdirSync(path.join(input.projectRoot, '.git', 'reftable'), {mode: 0o700});
    const marker = path.join(input.root, 'scanner-ran');
    const executable = input.executable('semgrep', `require('node:fs').writeFileSync(${JSON.stringify(marker)}, 'ran');`);
    const result = await runIsolatedSemgrep({
        projectRoot: input.projectRoot, executable, env: input.env,
        args: ['scan', '--config', 'rules.yml'],
    });

    assert.notEqual(result.error, undefined);
    assert.equal(fs.existsSync(marker), false);
});

for (const kind of ['main', 'additional']) {
    test(`detects changed consumer Git configuration before another Git process can load it (${kind})`, (t) => {
        const input = fixture(t);
        if (kind === 'additional') input.git('config', 'extensions.worktreeConfig', 'true');
        const changed = path.join(input.root, 'configuration-changed');
        const attempted = path.join(input.root, 'changed-configuration-load-attempted');
        const canary = path.join(input.root, 'private-include-fixture');
        fs.writeFileSync(canary, 'synthetic unreadable include\n', {mode: 0o000});
        const configTarget = path.join(input.projectRoot, '.git', kind === 'main' ? 'config' : 'config.worktree');
        input.executable('semgrep', `
if (process.argv[2] === '--version') { process.stdout.write('1.173.0\\n'); process.exit(0); }
const fs = require('node:fs');
fs.appendFileSync(${JSON.stringify(configTarget)}, ${JSON.stringify(`[include]\n path = ${canary}\n`)});
fs.writeFileSync(${JSON.stringify(changed)}, 'changed');
process.stdout.write(JSON.stringify({cwd: process.cwd()}));
`);
        const preload = path.join(input.root, 'guard-changed-configuration.cjs');
        fs.writeFileSync(preload, `
const cp = require('node:child_process');
const fs = require('node:fs');
const original = cp.spawn;
cp.spawn = function(command, args, options) {
    if (command === 'git' && options.cwd === ${JSON.stringify(input.projectRoot)} && fs.existsSync(${JSON.stringify(changed)})) {
        fs.writeFileSync(${JSON.stringify(attempted)}, 'blocked before configuration load');
        throw new Error('synthetic changed configuration blocked');
    }
    return original.call(this, command, args, options);
};
`);
        const result = spawnSync(process.execPath, [CLI, 'run', 'semgrep', '--', 'scan', '--config', 'rules.yml'], {
            cwd: input.projectRoot, env: {...input.env, NODE_OPTIONS: `--require=${preload}`},
            input: '', encoding: 'utf8', timeout: 30000,
        });

        assert.equal(result.status, 4);
        assert.match(result.stderr, /preservation failed/);
        assert.equal(fs.existsSync(changed), true);
        assert.equal(fs.existsSync(attempted), false);
    });
}

test('stops reading public files when preparation exhausts the caller deadline', async (t) => {
    const input = fixture(t);
    const now = performance.now();
    let elapsed = 0;
    let publicReads = 0;
    t.mock.method(performance, 'now', () => now + elapsed);
    const publicFiles = new Set(Object.keys(input.files).map((name) => path.join(input.projectRoot, name)));
    const open = fs.openSync;
    t.mock.method(fs, 'openSync', (file, ...args) => {
        if (publicFiles.has(file)) {
            publicReads += 1;
            elapsed = 2000;
        }
        return open(file, ...args);
    });
    const result = await runIsolatedSemgrep({
        projectRoot: input.projectRoot, executable: path.join(input.root, 'bin', 'semgrep'), env: input.env,
        args: ['scan', '--config', 'rules.yml'], timeoutMs: 1000,
    });

    assert.equal(result.timedOut, true);
    assert.notEqual(result.error, undefined);
    assert.equal(publicReads, 1);
});

test('excludes known private runtime endpoints before any blob export', (t) => {
    const input = fixture(t);
    const id = input.git('rev-parse', `${input.baseline}:source file.js`).trim();
    const attempted = path.join(input.root, 'blob-export-attempted');
    const preload = path.join(input.root, 'guard-private-endpoints.cjs');
    fs.writeFileSync(preload, `
const cp = require('node:child_process');
const original = cp.spawn;
cp.spawn = function(command, args, options) {
    if (command === 'git' && options.cwd === ${JSON.stringify(input.projectRoot)} && args.includes('cat-file') && args.includes('blob')) {
        require('node:fs').writeFileSync(${JSON.stringify(attempted)}, 'blocked before blob export');
        throw new Error('synthetic blob export blocked');
    }
    return original.call(this, command, args, options);
};
`);
    for (const relative of [
        '.pi/prism-review/runtime-fixture', '.pi/npm/runtime-fixture', '.pi/git/runtime-fixture',
        '.semgrep/settings.yml', '.semgrep/settings.yaml',
    ]) {
        input.git('update-index', '--add', '--cacheinfo', `100644,${id},${relative}`);
        input.commit('metadata-only private endpoint');
        const baseline = input.git('rev-parse', 'HEAD').trim();
        input.git('update-index', '--force-remove', '--', relative);
        input.commit('remove private endpoint from HEAD');
        const result = spawnSync(process.execPath, [CLI, 'run', 'semgrep', '--', 'scan', '--config', 'rules.yml', '--baseline-commit', baseline], {
            cwd: input.projectRoot, env: {...input.env, NODE_OPTIONS: `--require=${preload}`},
            input: '', encoding: 'utf8', timeout: 30000,
        });
        assert.equal(result.status, 4, relative);
        assert.equal(fs.existsSync(attempted), false, relative);
    }
});

test('rejects Git worktree redirection instead of assuming the caller root matches Git', async (t) => {
    const input = fixture(t);
    const redirected = path.join(input.root, 'different-working-tree');
    fs.mkdirSync(redirected, {mode: 0o700});
    input.git('config', 'core.worktree', redirected);
    const marker = path.join(input.root, 'scanner-ran');
    const executable = input.executable('semgrep', `require('node:fs').writeFileSync(${JSON.stringify(marker)}, 'ran');`);
    const result = await runIsolatedSemgrep({
        projectRoot: input.projectRoot, executable, env: input.env,
        args: ['scan', '--config', 'rules.yml'],
    });

    assert.notEqual(result.error, undefined);
    assert.equal(fs.existsSync(marker), false);
    assert.deepEqual(fs.readdirSync(redirected), []);
});

test('handles interruption during filesystem preparation without finishing the inventory', async (t) => {
    const input = fixture(t);
    const inventory = path.join(input.projectRoot, '.git', 'objects', 'preparation-fixture');
    fs.mkdirSync(inventory, {mode: 0o700});
    for (let index = 0; index < 512; index += 1) fs.writeFileSync(path.join(inventory, String(index)), '', {mode: 0o600});
    const marker = path.join(input.root, 'filesystem-preparation-started');
    const preload = path.join(input.root, 'slow-filesystem-metadata.cjs');
    fs.writeFileSync(preload, `
const fs = require('node:fs');
const original = fs.lstatSync;
fs.lstatSync = function(file, ...args) {
    const result = original.call(this, file, ...args);
    if (typeof file === 'string' && file.startsWith(${JSON.stringify(`${inventory}/`)})) {
        fs.writeFileSync(${JSON.stringify(marker)}, 'started');
        const until = Date.now() + 10;
        while (Date.now() < until) {}
    }
    return result;
};
`);
    const child = spawn(process.execPath, [CLI, 'run', 'semgrep', '--', 'scan', '--config', 'rules.yml'], {
        cwd: input.projectRoot, env: {...input.env, TMPDIR: input.root, NODE_OPTIONS: `--require=${preload}`},
        detached: true, stdio: ['ignore', 'ignore', 'pipe'],
    });
    t.after(() => {
        try { process.kill(-child.pid, 'SIGKILL'); }
        catch (error) { if (error.code !== 'ESRCH') throw error; }
    });
    let stderr = '';
    child.stderr.on('data', (bytes) => { stderr += bytes; });
    const closed = new Promise((resolve) => child.on('close', (status) => resolve(status)));
    for (let attempt = 0; !fs.existsSync(marker) && attempt < 2000; attempt += 1) await delay(10);
    assert.equal(fs.existsSync(marker), true);
    child.kill('SIGTERM');
    const status = await Promise.race([closed, delay(2500, 'not interrupted promptly', {ref: false})]);
    if (status === 'not interrupted promptly') {
        process.kill(-child.pid, 'SIGKILL');
        await closed;
    }

    assert.equal(status, 4, stderr);
    assert.match(stderr, /interrupted/);
    assert.deepEqual(fs.readdirSync(input.root).filter((name) => name.startsWith('prism-semgrep-')), []);
});

test('rejects invalid UTF-8 administrative names instead of overlooking distinct references', async (t) => {
    const input = fixture(t);
    const tags = path.join(input.projectRoot, '.git', 'refs', 'tags');
    fs.writeFileSync(Buffer.concat([Buffer.from(`${tags}/`), Buffer.from([0xff])]), `${input.baseline}\n`);
    fs.writeFileSync(path.join(tags, '\ufffd'), `${input.baseline}\n`);
    const marker = path.join(input.root, 'scanner-ran');
    const executable = input.executable('semgrep', `require('node:fs').writeFileSync(${JSON.stringify(marker)}, 'ran');`);
    const result = await runIsolatedSemgrep({
        projectRoot: input.projectRoot, executable, env: input.env,
        args: ['scan', '--config', 'rules.yml'],
    });

    assert.notEqual(result.error, undefined);
    assert.equal(fs.existsSync(marker), false);
});

test('includes preservation records in the aggregate metadata bound', (t) => {
    const input = fixture(t);
    const metadata = ['config', 'HEAD', 'index', 'refs/heads/fixture', 'logs/HEAD', 'logs/refs/heads/fixture'];
    const existingBytes = metadata.reduce((total, name) => total + fs.lstatSync(path.join(input.projectRoot, '.git', name)).size, 0);
    const descriptor = fs.openSync(path.join(input.projectRoot, '.git', 'FETCH_HEAD'), 'wx', 0o600);
    try { fs.ftruncateSync(descriptor, 67108864 - existingBytes - 128); }
    finally { fs.closeSync(descriptor); }
    const attempted = path.join(input.root, 'source-git-attempted');
    const preload = path.join(input.root, 'guard-metadata-budget.cjs');
    fs.writeFileSync(preload, `
const cp = require('node:child_process');
const original = cp.spawn;
cp.spawn = function(command, args, options) {
    if (command === 'git' && options.cwd === ${JSON.stringify(input.projectRoot)}) {
        require('node:fs').writeFileSync(${JSON.stringify(attempted)}, 'blocked before source Git');
        throw new Error('synthetic source Git blocked');
    }
    return original.call(this, command, args, options);
};
`);
    const result = spawnSync(process.execPath, [CLI, 'run', 'semgrep', '--', 'scan', '--config', 'rules.yml'], {
        cwd: input.projectRoot, env: {...input.env, NODE_OPTIONS: `--require=${preload}`},
        input: '', encoding: 'utf8', timeout: 30000,
    });

    assert.equal(result.status, 4);
    assert.equal(fs.existsSync(attempted), false);
});

test('measures execution budgets independently of wall-clock corrections', async (t) => {
    const input = fixture(t);
    const now = Date.now();
    let calls = 0;
    t.mock.method(Date, 'now', () => now + (calls++ === 0 ? 0 : 3600000));
    const executable = input.executable('semgrep', 'process.stdout.write("probe complete");');
    const result = await runIsolatedSemgrep({
        projectRoot: input.projectRoot, executable, env: input.env,
        args: ['scan', '--help'], timeoutMs: 5000,
    });

    assert.equal(result.error, undefined);
    assert.equal(result.status, 0);
    assert.equal(result.stdout, 'probe complete');
});

function phpRulesFixture(t) {
    const input = fixture(t);
    const repository = path.resolve(__dirname, '../..');
    const files = ['.semgrep/kyaulabs.yml', 'tests/Unit/Semgrep/RulesPackTest.php', 'tests/Unit/Semgrep/FixtureRepository.php'];
    for (const name of fs.readdirSync(path.join(repository, 'tests', 'Semgrep'))) {
        for (const leaf of ['positive.php', 'negative.php']) files.push(`tests/Semgrep/${name}/${leaf}`);
    }
    for (const relative of files) {
        const target = path.join(input.projectRoot, relative);
        fs.mkdirSync(path.dirname(target), {recursive: true, mode: 0o700});
        fs.copyFileSync(path.join(repository, relative), target);
        fs.chmodSync(target, 0o600);
    }
    const launcher = path.join(input.projectRoot, 'packages/prism-core/scripts/prism-tool.js');
    fs.mkdirSync(path.dirname(launcher), {recursive: true, mode: 0o700});
    fs.writeFileSync(launcher, `require(${JSON.stringify(CLI)});\n`, {mode: 0o600});
    input.git('add', '--all');
    input.commit('PHP rule suite fixture');
    return {...input, launcher, pest: (filter) => spawnSync(process.execPath, [CLI, 'run', 'pest', '--',
        path.join(input.projectRoot, 'tests/Unit/Semgrep/RulesPackTest.php'), `--filter=${filter}`,
        '--no-coverage', `--cache-directory=${path.join(input.root, 'pest-cache')}`], {
        cwd: repository, env: {...input.env, TMPDIR: input.root, SEMGREP_BASELINE_COMMIT: input.git('rev-parse', 'HEAD').trim()},
        input: '', encoding: 'utf8', timeout: 120000, maxBuffer: 1048576,
    })};
}

test('PHP rule tests scan a disposable committed fixture without an inherited baseline', (t) => {
    const input = phpRulesFixture(t);
    const marker = path.join(input.root, 'php-scanner.json');
    const executable = input.executable('semgrep', `
if (process.argv[2] === '--version') { process.stdout.write('1.173.0\\n'); process.exit(0); }
const fs = require('node:fs');
fs.appendFileSync(${JSON.stringify(marker)}, JSON.stringify({cwd: process.cwd(), baseline: process.env.SEMGREP_BASELINE_COMMIT ?? null, args: process.argv.slice(2)}) + '\\n');
process.stdout.write(JSON.stringify({results: [], errors: []}));
`);
    const localBin = path.join(input.root, '.local', 'bin');
    fs.mkdirSync(localBin, {recursive: true, mode: 0o700});
    fs.copyFileSync(executable, path.join(localBin, 'semgrep'));
    const before = snapshot(input.projectRoot, ['.git/index', '.git/HEAD', '.git/logs/HEAD', '.semgrep/kyaulabs.yml']);
    const result = input.pest('semgrepScanAll invokes exactly one');

    assert.equal(result.status, 0, result.stdout + result.stderr);
    const scans = fs.readFileSync(marker, 'utf8').trim().split('\n').map((line) => JSON.parse(line));
    assert.equal(scans.length, 1);
    assert.notEqual(scans[0].cwd, input.projectRoot);
    assert.equal(scans[0].baseline, null);
    assert.equal(scans[0].args.includes('--baseline-commit'), false);
    assert.equal(scans[0].args.includes('--x-ignore-semgrepignore-files'), true);
    assert.equal(fs.existsSync(scans[0].cwd), false);
    assert.deepEqual(snapshot(input.projectRoot, Object.keys(before)), before);
    assert.deepEqual(fs.readdirSync(input.root).filter((name) => name.startsWith('prism-rule-fixture-')), []);
});

test('PHP negative rule assertions fail rather than skip when Semgrep is unavailable', (t) => {
    const input = phpRulesFixture(t);
    const marker = path.join(input.root, 'version-probed');
    input.executable('semgrep', `
const fs = require('node:fs');
if (process.argv[2] === '--version' && !fs.existsSync(${JSON.stringify(marker)})) {
    fs.writeFileSync(${JSON.stringify(marker)}, 'ready once'); process.stdout.write('1.173.0\\n');
} else process.exitCode = 127;
`);
    const result = input.pest('each negative fixture');

    assert.notEqual(result.status, 0, result.stdout + result.stderr);
    assert.match(result.stdout + result.stderr, /Semgrep fixture scan failed|semgrep.*(?:unavailable|missing|failed)/i);
    assert.deepEqual(fs.readdirSync(input.root).filter((name) => name.startsWith('prism-rule-fixture-')), []);
});

for (const output of ['not JSON', '{}', '{"results":[],"errors":[{"message":"scan failed"}]}', '{"results":[{}],"errors":[]}']) {
    test(`PHP negative rule assertions reject incomplete scanner evidence: ${output}`, (t) => {
        const input = phpRulesFixture(t);
        const marker = path.join(input.root, 'scan-attempts');
        input.executable('semgrep', `
if (process.argv[2] === '--version') process.stdout.write('1.173.0\\n');
else {
    require('node:fs').appendFileSync(${JSON.stringify(marker)}, '.');
    process.stdout.write(${JSON.stringify(output)});
}
`);
        const result = input.pest('each negative fixture');

        assert.notEqual(result.status, 0, result.stdout + result.stderr);
        assert.match(result.stdout + result.stderr, /Semgrep fixture output is invalid/);
        assert.equal(fs.readFileSync(marker, 'utf8'), '.');
        assert.deepEqual(fs.readdirSync(input.root).filter((name) => name.startsWith('prism-rule-fixture-')), []);
    });
}

for (const [relative, mode] of [['', 0o500], ['home', 0o000]]) {
    test(`PHP rule assertions fail if their fixture cannot be cleaned after a successful isolated scan: ${relative || 'root'}`, (t) => {
        const input = phpRulesFixture(t);
        const marker = path.join(input.root, 'cleanup-outcome.json');
        input.executable('semgrep', `
process.stdout.write(process.argv[2] === '--version' ? '1.173.0\\n' : '{"results":[],"errors":[]}');
`);
        fs.writeFileSync(input.launcher, `
const fs = require('node:fs');
const path = require('node:path');
const result = require('node:child_process').spawnSync(process.execPath, [${JSON.stringify(CLI)}, ...process.argv.slice(2)],
    {env: process.env, encoding: 'utf8', timeout: 90000, maxBuffer: 1048576});
const root = path.dirname(process.cwd());
if (root === ${JSON.stringify(input.root)} || !root.startsWith(${JSON.stringify(input.root + path.sep)})) process.exit(99);
const blocked = path.join(root, ${JSON.stringify(relative)});
fs.writeFileSync(${JSON.stringify(marker)}, JSON.stringify({root, blocked, status: result.status}));
fs.chmodSync(blocked, ${mode});
process.stdout.write(result.stdout); process.stderr.write(result.stderr); process.exitCode = result.status;
`);
        let remaining;
        try {
            const result = input.pest('each negative fixture');
            remaining = JSON.parse(fs.readFileSync(marker, 'utf8'));
            assert.equal(remaining.status, 0);
            assert.notEqual(result.status, 0, result.stdout + result.stderr);
            assert.match(result.stdout + result.stderr, /Semgrep fixture directory cleanup failed/);
            assert.equal(fs.lstatSync(remaining.blocked).mode & 0o7777, mode);
        } finally {
            if (remaining && fs.existsSync(remaining.blocked)) fs.chmodSync(remaining.blocked, 0o700);
        }
    });
}

test('PHP rule inputs reject unsafe source permissions before scanning', (t) => {
    const input = phpRulesFixture(t);
    const marker = path.join(input.root, 'unexpected-scan');
    input.executable('semgrep', `
if (process.argv[2] === '--version') process.stdout.write('1.173.0\\n');
else {
    require('node:fs').writeFileSync(${JSON.stringify(marker)}, 'scanned');
    process.stdout.write('{"results":[],"errors":[]}');
}
`);
    fs.chmodSync(path.join(input.projectRoot, '.semgrep', 'kyaulabs.yml'), 0o666);
    const result = input.pest('each negative fixture');

    assert.notEqual(result.status, 0, result.stdout + result.stderr);
    assert.match(result.stdout + result.stderr, /Semgrep fixture input is unsafe/);
    assert.equal(fs.existsSync(marker), false);
    assert.deepEqual(fs.readdirSync(input.root).filter((name) => name.startsWith('prism-rule-fixture-')), []);
});

test('native PHP rule outcomes preserve unrelated source changes and all observed metadata', (t) => {
    const input = phpRulesFixture(t);
    const native = resolveExecutable('semgrep', process.env);
    assert.ok(native, 'native Semgrep is required');
    const marker = path.join(input.root, 'native-php-scan.json');
    input.executable('semgrep', `
const cp = require('node:child_process');
if (process.argv[2] === 'scan' && !process.argv.includes('--help')) {
    require('node:fs').writeFileSync(${JSON.stringify(marker)}, JSON.stringify({cwd: process.cwd(),
        files: cp.execFileSync('git', ['ls-files', '-z'], {encoding: 'utf8'}).split('\\0').filter(Boolean)}));
}
const result = cp.spawnSync(${JSON.stringify(native)}, process.argv.slice(2), {stdio: 'inherit', timeout: 60000});
process.exitCode = result.status ?? 99;
`);
    fs.appendFileSync(path.join(input.projectRoot, 'source file.js'), '// unrelated local work\n');
    fs.writeFileSync(path.join(input.projectRoot, 'local-notes.txt'), 'untracked local work\n', {mode: 0o600});
    const paths = [...input.git('ls-files', '-z').split('\0').filter(Boolean), 'local-notes.txt',
        '.git/HEAD', '.git/index', '.git/refs/heads/fixture', '.git/logs/HEAD', '.git/logs/refs/heads/fixture'];
    const before = snapshot(input.projectRoot, paths);
    const result = input.pest('.*');

    assert.equal(result.status, 0, result.stdout + result.stderr);
    assert.match(result.stdout.replace(/\u001b\[[0-9;]*m/g, ''), /16 passed/);
    const scanned = JSON.parse(fs.readFileSync(marker, 'utf8'));
    const expected = ['.semgrep/kyaulabs.yml'];
    for (const name of ['AuroraStatusTrue', 'SqliInterpolatedQuery', 'XssEchoRequestSink',
        'UnserializeRequestData', 'MissingCsrfToken', 'HardcodedDisplayErrors']) {
        expected.push(`tests/Semgrep/${name}/positive.php`, `tests/Semgrep/${name}/negative.php`);
    }
    assert.deepEqual(scanned.files.sort(), expected.sort());
    assert.equal(fs.existsSync(scanned.cwd), false);
    assert.deepEqual(snapshot(input.projectRoot, paths), before);
    assert.deepEqual(fs.readdirSync(input.root).filter((name) => name.startsWith('prism-rule-fixture-')), []);
});

test('PHP rule tests use the source launcher without an installed prism-tool', (t) => {
    const input = phpRulesFixture(t);
    input.env.PATH = input.env.PATH.split(path.delimiter)
        .filter((directory) => !fs.existsSync(path.join(directory, 'prism-tool'))).join(path.delimiter);
    input.executable('semgrep', `
process.stdout.write(process.argv[2] === '--version' ? '1.173.0\\n' : '{"results":[],"errors":[]}');
`);
    const result = input.pest('semgrepScanAll invokes exactly one');

    assert.equal(result.status, 0, result.stdout + result.stderr);
    assert.deepEqual(fs.readdirSync(input.root).filter((name) => name.startsWith('prism-rule-fixture-')), []);
});

// vim: ft=javascript sts=4 sw=4 ts=4 et :
