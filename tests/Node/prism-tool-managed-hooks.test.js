// $KYAULabs: prism-tool-managed-hooks.test.js kyau@aura.kyaulabs 2026/09/07 -0700 Exp $

'use strict';

const assert = require('node:assert/strict');
const {execFileSync} = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const {renderCoreAutomationProvider} = require(
    '../../packages/prism-core/scripts/prism-tool/automation-providers'
);
const {main} = require('../../packages/prism-core/scripts/prism-tool/cli');
const {hookCommand} = require('../../packages/prism-core/scripts/prism-tool/hook');
const {verifyAutomation} = require('../../packages/prism-core/scripts/prism-tool/automation');
const {renderProjectManifest} = require(
    '../../packages/prism-core/scripts/prism-tool/project-manifest'
);
const {
    applyManagedHooks,
    inspectManagedHooks,
    planManagedHooks,
    verifyManagedHooks,
} = require('../../packages/prism-core/scripts/prism-tool/managed-hooks');
const {runBounded} = require('../../packages/prism-core/scripts/prism-tool/process');
const {makeTempDir} = require('./helpers');

const CORE_ROOT = path.resolve(__dirname, '../../packages/prism-core');
const ADAPTER_ROOT = path.resolve(__dirname, '../../packages/prism-php-web');
const REPOSITORY_ROOT = path.resolve(__dirname, '../..');
const CANONICAL_HOOKS = [
    'commit-msg',
    'pre-commit',
    'pre-push',
    'prepare-commit-msg',
];

function makeFixture(t) {
    const projectRoot = makeTempDir();
    execFileSync('git', ['init', '-b', 'feat/tester-abcd-hooks'], {
        cwd: projectRoot,
        stdio: 'ignore',
    });
    execFileSync('git', ['config', 'user.name', 'Test User'], {cwd: projectRoot});
    execFileSync('git', ['config', 'user.email', 'test@example.com'], {cwd: projectRoot});
    fs.mkdirSync(path.join(projectRoot, '.prism'));
    const manifestPath = path.join(projectRoot, '.prism', 'project.json');
    fs.writeFileSync(manifestPath, renderProjectManifest({
        schemaVersion: 2,
        source: {mode: 'ESTABLISHED', evidence: null},
        capabilities: [],
        metadata: {
            schemaVersion: 1,
            displayName: 'Hook Fixture',
            summary: 'An established Core-only hook fixture.',
        },
        coreVersion: require('../../packages/prism-core/package.json').version,
        adapter: null,
    }), {mode: 0o644});
    fs.chmodSync(manifestPath, 0o644);
    renderCoreAutomationProvider({coreRoot: CORE_ROOT, candidateRoot: projectRoot});
    t.after(() => fs.rmSync(projectRoot, {recursive: true, force: true}));
    return {projectRoot, coreRoot: CORE_ROOT};
}

function writeAdapterSettings(projectRoot) {
    fs.mkdirSync(path.join(projectRoot, '.pi'), {recursive: true});
    fs.writeFileSync(path.join(projectRoot, '.pi', 'settings.json'), `${JSON.stringify({
        skills: [path.join(ADAPTER_ROOT, 'skills')],
    })}\n`);
}

function replaceManifest(projectRoot, {adapter = null, coreVersion = null} = {}) {
    const manifestPath = path.join(projectRoot, '.prism', 'project.json');
    fs.writeFileSync(manifestPath, renderProjectManifest({
        schemaVersion: 2,
        source: {mode: 'ESTABLISHED', evidence: null},
        capabilities: [],
        metadata: {
            schemaVersion: 1,
            displayName: 'Hook Fixture',
            summary: 'An established Core-only hook fixture.',
        },
        coreVersion: coreVersion ?? require('../../packages/prism-core/package.json').version,
        adapter,
    }), {mode: 0o644});
    fs.chmodSync(manifestPath, 0o644);
}

function canonical(name) {
    return fs.readFileSync(path.join(CORE_ROOT, 'config', 'bootstrap', 'hooks', name));
}

function hookPath(projectRoot, name) {
    return path.join(projectRoot, '.github', 'hooks', name);
}

function writeHook(projectRoot, name, contents, mode = 0o755) {
    const destination = hookPath(projectRoot, name);
    fs.mkdirSync(path.dirname(destination), {recursive: true});
    fs.writeFileSync(destination, contents, {mode});
    fs.chmodSync(destination, mode);
}

function readHooksPath(projectRoot) {
    try {
        return execFileSync('git', [
            'config', '--local', '--get', 'core.hooksPath',
        ], {cwd: projectRoot, encoding: 'utf8'}).trim();
    } catch (error) {
        if (error.status === 1) return null;
        throw error;
    }
}

function passingHookRun(command, args, options = {}) {
    if (command === 'git' && args[0] === 'rev-parse' && args[1] === '--show-toplevel') {
        return {status: 0, stdout: `${options.cwd}\n`, stderr: ''};
    }
    return {status: 0, stdout: '', stderr: ''};
}

function captureWrites(action) {
    let stdout = '';
    let stderr = '';
    const stdoutWrite = process.stdout.write;
    const stderrWrite = process.stderr.write;
    process.stdout.write = (chunk) => { stdout += String(chunk); return true; };
    process.stderr.write = (chunk) => { stderr += String(chunk); return true; };
    try {
        return {status: action(), stdout, stderr};
    } finally {
        process.stdout.write = stdoutWrite;
        process.stderr.write = stderrWrite;
    }
}

test('reports current managed health without rewriting restrictive project files', (t) => {
    const fixture = makeFixture(t);
    assert.equal(applyManagedHooks({...fixture, approval: 'yes'}).status, 'GO');
    const files = ['.prism/project.json', '.github/workflows/back-merge.yml',
        ...CANONICAL_HOOKS.map((name) => `.github/hooks/${name}`)];
    for (const relative of files) {
        fs.chmodSync(path.join(fixture.projectRoot, relative), relative.includes('/hooks/') ? 0o700 : 0o600);
    }
    execFileSync('git', ['add', '--', ...files], {cwd: fixture.projectRoot});
    const observed = [...files, '.git/index', '.git/config'];
    const snapshot = () => observed.map((relative) => {
        const file = path.join(fixture.projectRoot, relative);
        const stat = fs.lstatSync(file);
        return {relative, bytes: fs.readFileSync(file), dev: stat.dev, ino: stat.ino, uid: stat.uid,
            gid: stat.gid, size: stat.size, mode: stat.mode, mtimeMs: stat.mtimeMs, ctimeMs: stat.ctimeMs};
    });
    const before = snapshot();

    const result = captureWrites(() => main(['automation', 'health', '--json'], fixture));

    assert.equal(result.status, 0, result.stderr);
    const report = JSON.parse(result.stdout);
    assert.equal(report.command, 'automation health');
    assert.equal(report.disposition, 'CURRENT');
    assert.deepEqual(report.checks.map(({id, status}) => ({id, status})), [
        {id: 'project-manifest', status: 'PASS'},
        {id: 'project-adapter', status: 'PASS'},
        {id: 'project-automation', status: 'PASS'},
        {id: 'managed-hooks', status: 'PASS'},
    ]);
    assert.deepEqual(snapshot(), before);
    assert.equal(fs.existsSync(path.join(fixture.projectRoot, '.pi', 'prism-tool')), false);
});

test('managed health verifies adapter-selected restrictive automation without mutation', (t) => {
    const fixture = makeFixture(t);
    writeAdapterSettings(fixture.projectRoot);
    replaceManifest(fixture.projectRoot, {adapter: {
        id: '@kyaulabs/prism-php-web',
        packageName: '@kyaulabs/prism-php-web',
        packageVersion: require('../../packages/prism-php-web/package.json').version,
        bootstrapProtocol: 1,
    }});
    const {prepareAutomation} = require('../../packages/prism-php-web/scripts/toolchain/automation-provider');
    const rendered = prepareAutomation({packageRoot: ADAPTER_ROOT, candidateRoot: fixture.projectRoot,
        contract: require('../../packages/prism-php-web/toolchain.json')});
    assert.equal(applyManagedHooks({...fixture, approval: 'yes'}).status, 'GO');
    const files = ['.prism/project.json', '.pi/settings.json', '.github/workflows/back-merge.yml',
        ...rendered.outputs.map(({path: relative}) => relative),
        ...CANONICAL_HOOKS.map((name) => `.github/hooks/${name}`)];
    for (const relative of files) {
        const file = path.join(fixture.projectRoot, relative);
        fs.chmodSync(file, fs.lstatSync(file).mode & 0o100 ? 0o700 : 0o600);
    }
    execFileSync('git', ['add', '--', ...files], {cwd: fixture.projectRoot});
    const snapshot = () => [...files, '.git/index', '.git/config'].map((relative) => {
        const file = path.join(fixture.projectRoot, relative);
        const stat = fs.lstatSync(file);
        return {relative, bytes: fs.readFileSync(file), dev: stat.dev, ino: stat.ino, uid: stat.uid,
            gid: stat.gid, size: stat.size, mode: stat.mode, mtimeMs: stat.mtimeMs, ctimeMs: stat.ctimeMs};
    });
    const before = snapshot();

    const result = captureWrites(() => main(['automation', 'health', '--json'], fixture));

    assert.equal(result.status, 0, result.stderr || result.stdout);
    assert.equal(JSON.parse(result.stdout).disposition, 'CURRENT');
    assert.deepEqual(snapshot(), before);
    assert.equal(fs.existsSync(path.join(fixture.projectRoot, '.pi/prism-tool')), false);

    fs.chmodSync(path.join(fixture.projectRoot, '.github/workflows/ci.yml'), 0o664);
    const invalid = captureWrites(() => main(['automation', 'health', '--json'], fixture));
    assert.equal(invalid.status, 5);
    assert.equal(JSON.parse(invalid.stdout).checks.some(({message}) => message ===
        'managed file permissions are invalid: .github/workflows/ci.yml (observed 0664; requires 0400 within 0644)'), true,
    invalid.stdout);
    assert.equal(fs.lstatSync(path.join(fixture.projectRoot, '.github/workflows/ci.yml')).mode & 0o7777, 0o664);
});

test('managed health distinguishes missing files, content drift, and unsafe permissions', (t) => {
    const cases = [
        ['.github/workflows/back-merge.yml', 'missing', 'managed automation file is missing: .github/workflows/back-merge.yml'],
        ['.github/workflows/back-merge.yml', 'content', 'managed automation file is not current: .github/workflows/back-merge.yml'],
        ['.github/hooks/pre-commit', 'missing', 'managed hook file is missing: .github/hooks/pre-commit'],
        ['.github/hooks/pre-commit', 'content', 'managed hook file is not current: .github/hooks/pre-commit'],
        ['.prism/project.json', 'mode', 'managed file permissions are invalid: .prism/project.json (observed 0666; requires 0400 within 0644)'],
        ['.github/hooks/pre-commit', 'mode', 'managed file permissions are invalid: .github/hooks/pre-commit (observed 0666; requires 0500 within 0755)'],
    ];
    for (const [relative, change, message] of cases) {
        const fixture = makeFixture(t);
        assert.equal(applyManagedHooks({...fixture, approval: 'yes'}).status, 'GO');
        const file = path.join(fixture.projectRoot, relative);
        if (change === 'missing') fs.unlinkSync(file);
        else if (change === 'content') fs.appendFileSync(file, '\n# unexpected local change\n');
        else fs.chmodSync(file, 0o666);
        const before = fs.lstatSync(file, {throwIfNoEntry: false});

        const result = captureWrites(() => main(['automation', 'health', '--json'], fixture));

        assert.equal(result.status, 5, `${relative}: ${change}`);
        const report = JSON.parse(result.stdout);
        assert.equal(report.disposition, 'CONFLICT');
        assert.equal(report.checks.some((check) => check.status === 'FAIL' && check.message === message), true,
            JSON.stringify(report));
        const after = fs.lstatSync(file, {throwIfNoEntry: false});
        for (const field of ['dev', 'ino', 'uid', 'gid', 'size', 'mode', 'mtimeMs', 'ctimeMs']) {
            assert.equal(after?.[field], before?.[field], `${relative}: ${field}`);
        }
    }
});

test('reports unconfigured repositories and the Prism source checkout without fabricating managed state', (t) => {
    const fixture = makeFixture(t);
    fs.unlinkSync(path.join(fixture.projectRoot, '.prism', 'project.json'));
    for (const projectRoot of [fixture.projectRoot, REPOSITORY_ROOT]) {
        const result = captureWrites(() => main(['automation', 'health', '--json'], {projectRoot, coreRoot: CORE_ROOT}));

        assert.equal(result.status, 0, result.stderr);
        const report = JSON.parse(result.stdout);
        assert.equal(report.disposition, 'NOT_CONFIGURED');
        assert.equal(report.checks.every(({status}) => status === 'SKIPPED'), true);
        assert.equal(fs.existsSync(path.join(projectRoot, '.prism', 'project.json')), false);
    }
});

test('missing manifests conflict with managed claims at the effective Git hooks path only', (t) => {
    for (const [directory, active, managed, expected] of [
        ['.github/hooks', true, true, 'CONFLICT'],
        ['.git/hooks', false, true, 'CONFLICT'],
        ['custom-hooks', true, true, 'CONFLICT'],
        ['.github/hooks', false, true, 'NOT_CONFIGURED'],
        ['custom-hooks', true, false, 'NOT_CONFIGURED'],
    ]) {
        const fixture = makeFixture(t);
        fs.unlinkSync(path.join(fixture.projectRoot, '.prism', 'project.json'));
        const hooks = path.join(fixture.projectRoot, directory);
        fs.mkdirSync(hooks, {recursive: true});
        fs.writeFileSync(path.join(hooks, 'pre-commit'), managed ? canonical('pre-commit') : '#!/bin/sh\nexit 0\n', {mode: 0o700});
        if (active) execFileSync('git', ['config', '--local', 'core.hooksPath', directory], {cwd: fixture.projectRoot});

        const result = captureWrites(() => main(['automation', 'health', '--json'], fixture));
        const report = JSON.parse(result.stdout);

        assert.equal(report.disposition, expected, `${directory}: ${active}: ${managed}`);
        assert.equal(result.status, expected === 'CONFLICT' ? 5 : 0);
        if (expected === 'CONFLICT') assert.equal(report.checks[0].message, 'project manifest is missing: .prism/project.json');
        assert.equal(fs.existsSync(path.join(fixture.projectRoot, '.prism', 'project.json')), false);
    }
});

test('managed health never treats malformed, unreadable, or symlinked manifest state as absence', (t) => {
    for (const change of ['malformed', 'unreadable', 'dangling-file', 'dangling-parent', 'linked-parent']) {
        const fixture = makeFixture(t);
        const directory = path.join(fixture.projectRoot, '.prism');
        const file = path.join(directory, 'project.json');
        if (change === 'malformed') fs.writeFileSync(file, '{invalid');
        else if (change === 'unreadable') fs.chmodSync(file, 0o000);
        else {
            fs.unlinkSync(file);
            if (change === 'dangling-file') fs.symlinkSync(path.join(fixture.projectRoot, 'absent'), file);
            else {
                fs.rmdirSync(directory);
                const target = path.join(fixture.projectRoot, 'alternate-state');
                if (change === 'linked-parent') fs.mkdirSync(target);
                fs.symlinkSync(target, directory);
            }
        }

        const result = captureWrites(() => main(['automation', 'health', '--json'], fixture));

        assert.equal(result.status, 5, change);
        const report = JSON.parse(result.stdout);
        assert.equal(report.disposition, 'CONFLICT', change);
        assert.equal(report.checks[0].id, 'project-manifest', change);
    }
});

test('unconfigured health fails closed on unsafe or excluded effective hooks without reading them', (t) => {
    for (const change of ['link', 'ancestor-link', 'private', 'outside', 'permissions']) {
        const fixture = makeFixture(t);
        fs.unlinkSync(path.join(fixture.projectRoot, '.prism', 'project.json'));
        const target = path.join(fixture.projectRoot, 'canary');
        fs.writeFileSync(target, 'public unreadable canary\n', {mode: 0o000});
        let directory = 'custom-hooks';
        if (change === 'private') directory = '.pi/prism-review';
        if (change === 'outside') directory = path.dirname(fixture.projectRoot);
        const hooks = path.resolve(fixture.projectRoot, directory);
        if (change !== 'outside') {
            if (change === 'ancestor-link') fs.symlinkSync(path.join(fixture.projectRoot, '.git/hooks'), hooks);
            else {
                fs.mkdirSync(hooks, {recursive: true});
                if (change === 'link') fs.symlinkSync(target, path.join(hooks, 'pre-commit'));
                else fs.writeFileSync(path.join(hooks, 'pre-commit'), canonical('pre-commit'), {mode: 0o000});
            }
        }
        execFileSync('git', ['config', '--local', 'core.hooksPath', directory], {cwd: fixture.projectRoot});
        const open = t.mock.method(fs, 'openSync');

        const result = captureWrites(() => main(['automation', 'health', '--json'], fixture));

        assert.equal(result.status, 5, change);
        assert.equal(JSON.parse(result.stdout).disposition, 'CONFLICT', change);
        assert.equal(open.mock.calls.some((call) => call.arguments[0] === target || call.arguments[0] === path.join(hooks, 'pre-commit')), false, change);
        t.mock.restoreAll();
    }
});

test('does not activate canonical hooks before the project manifest exists', (t) => {
    const fixture = makeFixture(t);
    fs.unlinkSync(path.join(fixture.projectRoot, '.prism', 'project.json'));

    const result = captureWrites(() => main([
        'hook', 'reconcile', '--approval=yes', '--json',
    ], fixture));

    assert.equal(result.status, 5);
    assert.equal(JSON.parse(result.stdout).checks[0].id, 'project-manifest');
    assert.equal(fs.existsSync(path.join(fixture.projectRoot, '.github', 'hooks')), false);
    assert.equal(readHooksPath(fixture.projectRoot), null);
});

test('does not activate hooks before Core automation verifies', (t) => {
    const fixture = makeFixture(t);
    fs.rmSync(path.join(fixture.projectRoot, '.github', 'workflows', 'back-merge.yml'));

    const result = captureWrites(() => main([
        'hook', 'reconcile', '--approval=yes', '--json',
    ], fixture));

    assert.equal(result.status, 5);
    assert.equal(JSON.parse(result.stdout).checks[0].id, 'project-automation');
    assert.equal(fs.existsSync(path.join(fixture.projectRoot, '.github', 'hooks')), false);
    assert.equal(readHooksPath(fixture.projectRoot), null);
});

test('runs canonical pre-commit for a verified Core-only manifest without adapter loading', (t) => {
    const fixture = makeFixture(t);
    let adapterLoads = 0;
    const status = hookCommand(['pre-commit'], {
        ...fixture,
        hookRun: passingHookRun,
        loadHookAdapter() {
            adapterLoads += 1;
            throw new Error('unexpected adapter load');
        },
    });
    assert.equal(status, 0);
    assert.equal(adapterLoads, 0);
});

test('explains managed permission failures at the hook command boundary', (t) => {
    for (const relative of ['.prism/project.json', '.github/workflows/back-merge.yml']) {
        const fixture = makeFixture(t);
        const file = path.join(fixture.projectRoot, relative);
        fs.chmodSync(file, 0o664);
        const message = `managed file permissions are invalid: ${relative} (observed 0664; requires 0400 within 0644)`;

        const hook = captureWrites(() => hookCommand(['pre-commit'], {
            ...fixture, hookRun: passingHookRun,
        }));
        assert.equal(hook.status, 1);
        assert.equal(hook.stderr, `prism hook: ${message}\n`);

        const reconcile = captureWrites(() => main(['hook', 'reconcile',
            '--approval=yes', '--json'], fixture));
        assert.equal(reconcile.status, 5);
        assert.equal(JSON.parse(reconcile.stdout).checks[0].message, message);
        assert.equal(fs.lstatSync(file).mode & 0o7777, 0o664);
        assert.equal(readHooksPath(fixture.projectRoot), null);
    }
});

test('keeps Core-only hooks usable after Git checkout, switch, and fast-forward under restrictive umasks', (t) => {
    for (const [mask, dataMode, executableMode] of [
        ['0022', 0o644, 0o755], ['0027', 0o640, 0o750], ['0077', 0o600, 0o700],
    ]) {
        for (const operation of ['checkout', 'switch', 'fast-forward']) {
            const fixture = makeFixture(t);
            const env = {
                PATH: process.env.PATH,
                HOME: fixture.projectRoot,
                LC_ALL: 'C',
                GIT_CONFIG_NOSYSTEM: '1',
                GIT_CONFIG_GLOBAL: '/dev/null',
                GIT_TERMINAL_PROMPT: '0',
                GIT_AUTHOR_DATE: '2026-09-06T12:00:00Z',
                GIT_COMMITTER_DATE: '2026-09-06T12:00:00Z',
            };
            const git = (args, umask = '0022') => execFileSync('bash', [
                '-c', 'umask "$1"; shift; exec git "$@"', 'fixture-git', umask, ...args,
            ], {cwd: fixture.projectRoot, env, encoding: 'utf8', timeout: 15000, stdio: 'pipe'});
            const commit = (subject) => git(['-c', 'core.hooksPath=/dev/null',
                '-c', 'commit.gpgsign=false', 'commit', '--allow-empty', '-m', subject]);
            commit('empty fixture');
            assert.equal(applyManagedHooks({...fixture, env, approval: 'yes'}).status, 'GO');
            git(['switch', '-c', 'feat/tester-abcd-complete']);
            const files = ['.prism/project.json', '.github/workflows/back-merge.yml',
                ...CANONICAL_HOOKS.map((name) => `.github/hooks/${name}`)];
            git(['add', '--', ...files]);
            commit('managed fixture');
            const complete = git(['rev-parse', 'HEAD']).trim();
            git(['switch', 'feat/tester-abcd-hooks']);
            assert.equal(files.every((relative) => !fs.existsSync(path.join(fixture.projectRoot, relative))), true);

            const args = operation === 'checkout' ? ['checkout', complete, '--', ...files]
                : operation === 'switch' ? ['switch', 'feat/tester-abcd-complete']
                    : ['merge', '--ff-only', 'feat/tester-abcd-complete'];
            git(args, mask);

            const before = new Map(files.map((relative) => {
                const stat = fs.lstatSync(path.join(fixture.projectRoot, relative));
                assert.equal(stat.mode & 0o7777,
                    relative.startsWith('.github/hooks/') ? executableMode : dataMode,
                    `${operation} ${mask}: ${relative}`);
                return [relative, stat];
            }));
            const index = fs.readFileSync(path.join(fixture.projectRoot, '.git/index'));
            assert.equal(verifyAutomation(fixture).status, 'GO');
            assert.equal(verifyManagedHooks({...fixture, env}).status, 'GO');
            const context = {
                ...fixture,
                env,
                hookRun(command, commandArgs, options) {
                    return command === 'git' ? runBounded(command, commandArgs, {...options, env})
                        : {status: 0, stdout: '', stderr: ''};
                },
                input: `refs/heads/feat/tester-abcd-hooks ${complete} refs/heads/feat/tester-abcd-hooks ${'0'.repeat(40)}\n`,
            };
            assert.equal(hookCommand(['pre-commit'], context), 0, `${operation} ${mask}`);
            assert.equal(hookCommand(['pre-push', 'origin', 'fixture'], context), 0, `${operation} ${mask}`);
            assert.deepEqual(fs.readFileSync(path.join(fixture.projectRoot, '.git/index')), index);
            for (const relative of files) {
                const after = fs.lstatSync(path.join(fixture.projectRoot, relative));
                for (const field of ['dev', 'ino', 'uid', 'gid', 'size', 'mode', 'mtimeMs', 'ctimeMs']) {
                    assert.equal(after[field], before.get(relative)[field], `${relative}: ${field}`);
                }
            }
        }
    }
});

test('Core-only catalogue consumers retain native scan findings and usable hooks after restrictive Git recreation', (t) => {
    const fixture = makeFixture(t);
    const home = makeTempDir();
    t.after(() => fs.rmSync(home, {recursive: true, force: true}));
    const env = {PATH: process.env.PATH, HOME: home, LC_ALL: 'C',
        GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: '/dev/null', GIT_TERMINAL_PROMPT: '0'};
    const git = (...args) => execFileSync('git', args, {cwd: fixture.projectRoot, env,
        encoding: 'utf8', timeout: 15000, stdio: 'pipe'}).trim();
    const commit = () => git('-c', 'core.hooksPath=/dev/null', '-c', 'commit.gpgsign=false',
        'commit', '--allow-empty', '--quiet', '-m', 'catalogue fixture');
    commit();
    const empty = git('rev-parse', 'HEAD');
    assert.equal(applyManagedHooks({...fixture, env, approval: 'yes'}).status, 'GO');
    fs.writeFileSync(path.join(fixture.projectRoot, 'catalogue.json'), '{"adapters":[]}\n');
    fs.writeFileSync(path.join(fixture.projectRoot, 'validate.js'), 'danger("existing");\n');
    fs.writeFileSync(path.join(fixture.projectRoot, 'rules.yml'),
        'rules:\n  - id: catalogue-danger\n    languages: [javascript]\n    severity: WARNING\n    message: Unsafe catalogue operation\n    pattern: danger(...)\n');
    git('add', '--all');
    commit();
    const baseline = git('rev-parse', 'HEAD');
    fs.appendFileSync(path.join(fixture.projectRoot, 'validate.js'), 'danger("new");\n');
    git('add', '--all');
    commit();
    const head = git('rev-parse', 'HEAD');
    const files = ['.prism/project.json', '.github/workflows/back-merge.yml', 'catalogue.json',
        'validate.js', 'rules.yml', ...CANONICAL_HOOKS.map((name) => `.github/hooks/${name}`)];
    const snapshot = () => [...files, '.git/index', '.git/config', '.git/HEAD', '.git/logs/HEAD',
        '.git/refs/heads/feat/tester-abcd-hooks'].map((relative) => {
        const file = path.join(fixture.projectRoot, relative);
        const stat = fs.lstatSync(file);
        return {relative, bytes: fs.readFileSync(file), dev: stat.dev, ino: stat.ino, uid: stat.uid,
            gid: stat.gid, size: stat.size, mode: stat.mode, mtimeMs: stat.mtimeMs, ctimeMs: stat.ctimeMs};
    });
    const launcher = path.join(CORE_ROOT, 'scripts/prism-tool.js');
    const scan = () => JSON.parse(execFileSync('bash', ['-c', 'umask 077; exec "$@"', 'scan-fixture',
        process.execPath, launcher, 'run', 'semgrep', '--', 'scan', '--config', 'rules.yml',
        '--baseline-commit', baseline, '--metrics', 'off', '--disable-version-check', '--json'],
    {cwd: fixture.projectRoot, env, encoding: 'utf8', timeout: 120000, maxBuffer: 1048576, stdio: 'pipe'}));
    const initial = snapshot();
    const first = scan();
    assert.deepEqual(first.errors, []);
    assert.deepEqual(first.results.map(({check_id: id, path: relative, start}) => ({id, relative, line: start.line})),
        [{id: 'catalogue-danger', relative: 'validate.js', line: 2}]);
    assert.deepEqual(snapshot(), initial);

    git('switch', '--detach', empty);
    assert.equal(files.every((relative) => !fs.existsSync(path.join(fixture.projectRoot, relative))), true);
    execFileSync('bash', ['-c', 'umask 077; exec git switch feat/tester-abcd-hooks'],
        {cwd: fixture.projectRoot, env, timeout: 15000, stdio: 'pipe'});
    for (const relative of files) {
        assert.equal(fs.lstatSync(path.join(fixture.projectRoot, relative)).mode & 0o7777,
            relative.includes('/hooks/') ? 0o700 : 0o600, relative);
    }
    const recreated = snapshot();
    assert.deepEqual(scan().results.map(({check_id: id, path: relative, start}) => ({id, relative, line: start.line})),
        [{id: 'catalogue-danger', relative: 'validate.js', line: 2}]);
    assert.deepEqual(snapshot(), recreated);
    for (const event of ['pre-commit', 'pre-push']) {
        execFileSync(hookPath(fixture.projectRoot, event), event === 'pre-push' ? ['origin', 'fixture'] : [],
            {cwd: fixture.projectRoot, env, encoding: 'utf8', timeout: 30000, stdio: 'pipe',
                input: `refs/heads/feat/tester-abcd-hooks ${head} refs/heads/feat/tester-abcd-hooks ${'0'.repeat(40)}\n`});
    }
    assert.deepEqual(snapshot(), recreated);
    const health = captureWrites(() => main(['automation', 'health', '--json'], fixture));
    assert.equal(health.status, 0, health.stdout);
    assert.equal(JSON.parse(health.stdout).disposition, 'CURRENT');
    assert.deepEqual(snapshot(), recreated);
    fs.chmodSync(path.join(fixture.projectRoot, '.prism/project.json'), 0o666);
    for (const event of ['pre-commit', 'pre-push']) {
        assert.throws(() => execFileSync(hookPath(fixture.projectRoot, event),
            event === 'pre-push' ? ['origin', 'fixture'] : [],
            {cwd: fixture.projectRoot, env, timeout: 30000, stdio: 'pipe', input: ''}),
        (error) => error.status === 1 && /managed file permissions are invalid/.test(error.stderr));
    }
    assert.equal(fs.lstatSync(path.join(fixture.projectRoot, '.prism/project.json')).mode & 0o7777, 0o666);
});

test('rejects incoherent manifest and adapter evidence before hook mutation', (t) => {
    const adapterIdentity = {
        id: '@kyaulabs/prism-php-web',
        packageName: '@kyaulabs/prism-php-web',
        packageVersion: require('../../packages/prism-php-web/package.json').version,
        bootstrapProtocol: 1,
    };
    const cases = [
        {
            name: 'unexpected adapter',
            arrange(fixture) { writeAdapterSettings(fixture.projectRoot); },
            check: 'project-adapter',
        },
        {
            name: 'missing adapter',
            arrange(fixture) { replaceManifest(fixture.projectRoot, {adapter: adapterIdentity}); },
            check: 'project-adapter',
        },
        {
            name: 'different adapter',
            arrange(fixture) {
                writeAdapterSettings(fixture.projectRoot);
                replaceManifest(fixture.projectRoot, {adapter: {
                    ...adapterIdentity,
                    id: '@example/different-adapter',
                }});
            },
            check: 'project-adapter',
        },
        {
            name: 'stale Core',
            arrange(fixture) { replaceManifest(fixture.projectRoot, {coreVersion: '0.4.0'}); },
            check: 'project-manifest',
        },
    ];
    for (const item of cases) {
        const fixture = makeFixture(t);
        item.arrange(fixture);
        const result = captureWrites(() => main([
            'hook', 'reconcile', '--approval=yes', '--json',
        ], fixture));
        assert.equal(result.status, 5, item.name);
        assert.equal(JSON.parse(result.stdout).checks[0].id, item.check, item.name);
        assert.equal(fs.existsSync(path.join(fixture.projectRoot, '.github', 'hooks')), false);
        assert.equal(readHooksPath(fixture.projectRoot), null);
        const health = captureWrites(() => main(['automation', 'health', '--json'], fixture));
        assert.equal(health.status, 5, item.name);
        assert.equal(JSON.parse(health.stdout).checks.find(({status}) => status === 'FAIL').id, item.check, item.name);
    }
});

test('rejects incoherent composition before adapter hook execution', (t) => {
    const fixture = makeFixture(t);
    writeAdapterSettings(fixture.projectRoot);
    let adapterLoads = 0;

    const status = hookCommand(['pre-commit'], {
        ...fixture,
        hookRun: passingHookRun,
        loadHookAdapter() { adapterLoads += 1; },
    });

    assert.equal(status, 1);
    assert.equal(adapterLoads, 0);
});

test('plans create, preserve, migrate, and obsolete managed removal', (t) => {
    const fixture = makeFixture(t);
    writeHook(fixture.projectRoot, 'pre-commit', canonical('pre-commit'));
    writeHook(
        fixture.projectRoot,
        'pre-push',
        Buffer.concat([canonical('pre-push'), Buffer.from('\n# older owned wrapper\n')])
    );
    for (const name of ['post-checkout', 'post-merge']) {
        writeHook(
            fixture.projectRoot,
            name,
            fs.readFileSync(path.join(REPOSITORY_ROOT, '.github', 'hooks', name))
        );
    }

    const plan = planManagedHooks(fixture);

    assert.deepEqual(plan.hooks.map(({name, disposition}) => ({name, disposition})), [
        {name: 'commit-msg', disposition: 'CREATE'},
        {name: 'pre-commit', disposition: 'CURRENT'},
        {name: 'pre-push', disposition: 'MIGRATE'},
        {name: 'prepare-commit-msg', disposition: 'CREATE'},
    ]);
    assert.deepEqual(plan.remove, ['post-checkout', 'post-merge']);
});

test('applies canonical hooks, removes only owned obsolete hooks, and is idempotent', (t) => {
    const fixture = makeFixture(t);
    writeHook(fixture.projectRoot, 'custom-hook', '#!/usr/bin/env bash\nexit 0\n');
    for (const name of ['post-checkout', 'post-merge']) {
        writeHook(
            fixture.projectRoot,
            name,
            fs.readFileSync(path.join(REPOSITORY_ROOT, '.github', 'hooks', name))
        );
    }

    assert.equal(applyManagedHooks({...fixture, approval: 'yes'}).status, 'GO');
    for (const name of CANONICAL_HOOKS) {
        assert.equal(fs.readFileSync(hookPath(fixture.projectRoot, name)).equals(canonical(name)), true);
        assert.equal(fs.statSync(hookPath(fixture.projectRoot, name)).mode & 0o777, 0o755);
    }
    assert.equal(fs.existsSync(hookPath(fixture.projectRoot, 'post-checkout')), false);
    assert.equal(fs.existsSync(hookPath(fixture.projectRoot, 'post-merge')), false);
    assert.equal(fs.existsSync(hookPath(fixture.projectRoot, 'custom-hook')), true);
    assert.equal(
        execFileSync('git', ['config', '--local', 'core.hooksPath'], {
            cwd: fixture.projectRoot,
            encoding: 'utf8',
        }).trim(),
        '.github/hooks'
    );
    assert.equal(verifyManagedHooks(fixture).status, 'GO');
    assert.equal(applyManagedHooks({...fixture, approval: 'yes'}).disposition, 'CURRENT');
});

test('preserves current restrictive hooks without migrating or rewriting them', (t) => {
    for (const mode of [0o700, 0o750, 0o500]) {
        const fixture = makeFixture(t);
        assert.equal(applyManagedHooks({...fixture, approval: 'yes'}).status, 'GO');
        const before = new Map(CANONICAL_HOOKS.map((name) => {
            const file = hookPath(fixture.projectRoot, name);
            fs.chmodSync(file, mode);
            return [name, fs.lstatSync(file)];
        }));

        assert.equal(inspectManagedHooks(fixture).disposition, 'CURRENT');
        assert.equal(verifyManagedHooks(fixture).status, 'GO');
        assert.equal(applyManagedHooks({...fixture, approval: 'yes'}).disposition, 'CURRENT');

        for (const name of CANONICAL_HOOKS) {
            const file = hookPath(fixture.projectRoot, name);
            assert.deepEqual(fs.readFileSync(file), canonical(name));
            const after = fs.lstatSync(file);
            for (const field of ['dev', 'ino', 'uid', 'gid', 'size', 'mode', 'mtimeMs', 'ctimeMs']) {
                assert.equal(after[field], before.get(name)[field], `${name}: ${field}`);
            }
        }
    }
});

test('rejects unsafe owned hook modes instead of treating them as migration', (t) => {
    const fixture = makeFixture(t);
    assert.equal(applyManagedHooks({...fixture, approval: 'yes'}).status, 'GO');
    const file = hookPath(fixture.projectRoot, 'pre-commit');
    for (const older of [false, true]) {
        fs.chmodSync(file, 0o755);
        fs.writeFileSync(file, Buffer.concat([
            canonical('pre-commit'),
            Buffer.from(older ? '\n# older owned wrapper\n' : ''),
        ]));
        for (const [mode, observed] of [
            [0o777, '0777'], [0o775, '0775'], [0o757, '0757'],
            [0o4755, '4755'], [0o2755, '2755'], [0o1755, '1755'],
            [0o600, '0600'], [0o400, '0400'], [0o100, '0100'],
        ]) {
            fs.chmodSync(file, mode);
            const before = fs.lstatSync(file);

            for (const result of [inspectManagedHooks(fixture), verifyManagedHooks(fixture),
                applyManagedHooks({...fixture, approval: 'yes'})]) {
                assert.equal(result.status, 'NO-GO', observed);
                assert.equal(result.checks[0].message,
                    `managed file permissions are invalid: .github/hooks/pre-commit (observed ${observed}; requires 0500 within 0755)`);
            }

            const after = fs.lstatSync(file);
            for (const field of ['dev', 'ino', 'uid', 'gid', 'size', 'mode', 'mtimeMs', 'ctimeMs']) {
                assert.equal(after[field], before[field], `${observed}: ${field}`);
            }
        }
    }
});

test('rejects another owner at the managed hook boundary before opening the hook', (t) => {
    const fixture = makeFixture(t);
    assert.equal(applyManagedHooks({...fixture, approval: 'yes'}).status, 'GO');
    const file = hookPath(fixture.projectRoot, 'pre-commit');
    const lstat = fs.lstatSync;
    t.mock.method(fs, 'lstatSync', (target, options) => {
        const stat = lstat(target, options);
        if (target === file) stat.uid = process.getuid() + 1;
        return stat;
    });
    const open = t.mock.method(fs, 'openSync');

    const result = verifyManagedHooks(fixture);

    assert.equal(result.status, 'NO-GO');
    assert.equal(result.checks[0].message,
        'managed file ownership is invalid: .github/hooks/pre-commit');
    assert.equal(open.mock.calls.some((call) => call.arguments[0] === file), false);
});

test('rejects hook identity drift at open before reading managed contents', (t) => {
    const fixture = makeFixture(t);
    assert.equal(applyManagedHooks({...fixture, approval: 'yes'}).status, 'GO');
    const inode = fs.lstatSync(hookPath(fixture.projectRoot, 'pre-commit')).ino;
    const fstat = fs.fstatSync;
    const read = fs.readFileSync;
    for (const field of ['uid', 'gid', 'mode', 'size', 'mtimeMs', 'ctimeMs']) {
        let readChangedHook = false;
        t.mock.method(fs, 'fstatSync', (descriptor) => {
            const stat = fstat(descriptor);
            if (stat.ino === inode) stat[field] += 1;
            return stat;
        });
        t.mock.method(fs, 'readFileSync', (file, ...args) => {
            if (typeof file === 'number' && fstat(file).ino === inode) readChangedHook = true;
            return read(file, ...args);
        });

        assert.equal(inspectManagedHooks(fixture).status, 'NO-GO', field);
        assert.equal(readChangedHook, false, field);
        t.mock.restoreAll();
    }
});

test('rejects managed hooks that become unsafe during the content read', (t) => {
    const fixture = makeFixture(t);
    assert.equal(applyManagedHooks({...fixture, approval: 'yes'}).status, 'GO');
    const file = hookPath(fixture.projectRoot, 'pre-commit');
    const inode = fs.lstatSync(file).ino;
    const read = fs.readFileSync;
    t.mock.method(fs, 'readFileSync', (target, ...args) => {
        const contents = read(target, ...args);
        if (typeof target === 'number' && fs.fstatSync(target).ino === inode) {
            fs.chmodSync(file, 0o777);
        }
        return contents;
    });

    assert.equal(inspectManagedHooks(fixture).status, 'NO-GO');
    assert.equal(fs.lstatSync(file).mode & 0o7777, 0o777);
});

test('keeps packaged hook resource modes exact rather than using runtime acceptance', (t) => {
    const fixture = makeFixture(t);
    assert.equal(applyManagedHooks({...fixture, approval: 'yes'}).status, 'GO');
    const coreRoot = makeTempDir();
    t.after(() => fs.rmSync(coreRoot, {recursive: true, force: true}));
    const resources = path.join(coreRoot, 'config', 'bootstrap', 'hooks');
    fs.mkdirSync(resources, {recursive: true});
    for (const name of CANONICAL_HOOKS) {
        fs.writeFileSync(path.join(resources, name), canonical(name));
        fs.chmodSync(path.join(resources, name), 0o755);
    }
    assert.equal(verifyManagedHooks({...fixture, coreRoot}).status, 'GO');

    for (const mode of [0o700, 0o750, 0o4755, 0o2755, 0o1755]) {
        fs.chmodSync(path.join(resources, 'pre-commit'), mode);
        assert.equal(verifyManagedHooks({...fixture, coreRoot}).status, 'NO-GO', mode.toString(8));
    }
});

test('fails closed on unowned canonical and obsolete collisions', (t) => {
    for (const name of ['pre-commit', 'post-checkout']) {
        const fixture = makeFixture(t);
        writeHook(fixture.projectRoot, name, '#!/usr/bin/env bash\necho human\n');

        const inspected = inspectManagedHooks(fixture);
        assert.equal(inspected.status, 'NO-GO');
        assert.equal(applyManagedHooks({...fixture, approval: 'yes'}).status, 'NO-GO');
        assert.equal(fs.readFileSync(hookPath(fixture.projectRoot, name), 'utf8'),
            '#!/usr/bin/env bash\necho human\n');
    }
});

test('returns a conflict when the initial hook snapshot becomes unreadable', (t) => {
    const fixture = makeFixture(t);
    const target = hookPath(fixture.projectRoot, 'pre-commit');
    writeHook(fixture.projectRoot, 'pre-commit', Buffer.concat([
        canonical('pre-commit'),
        Buffer.from('\n# older owned wrapper\n'),
    ]));
    const originalStat = fs.lstatSync;
    let reads = 0;
    fs.lstatSync = function failSnapshot(filePath, ...args) {
        if (filePath === target) {
            reads += 1;
            if (reads === 4) throw new Error('injected snapshot failure');
        }
        return originalStat.call(this, filePath, ...args);
    };

    let result;
    try {
        result = applyManagedHooks({...fixture, approval: 'yes'});
    } finally {
        fs.lstatSync = originalStat;
    }
    assert.equal(result.status, 'NO-GO');
    assert.equal(result.checks[0].message, 'managed hooks were not reconciled');
    assert.equal(fs.readFileSync(target).includes(Buffer.from('# older owned wrapper')), true);
});

test('rejects an owned hook changed during reconciliation', (t) => {
    const fixture = makeFixture(t);
    const older = Buffer.concat([
        canonical('pre-commit'),
        Buffer.from('\n# older owned wrapper\n'),
    ]);
    const changed = Buffer.concat([
        canonical('pre-commit'),
        Buffer.from('\n# concurrent owned change\n'),
    ]);
    writeHook(fixture.projectRoot, 'pre-commit', older);
    let gitCalls = 0;

    const result = applyManagedHooks({
        ...fixture,
        approval: 'yes',
        run(command, args, options) {
            gitCalls += 1;
            if (gitCalls === 4) writeHook(fixture.projectRoot, 'pre-commit', changed);
            return runBounded(command, args, options);
        },
    });

    assert.equal(result.status, 'NO-GO');
    assert.equal(fs.readFileSync(hookPath(fixture.projectRoot, 'pre-commit')).equals(changed), true);
});

test('rolls back published hooks when atomic reconciliation fails', (t) => {
    const fixture = makeFixture(t);
    const older = Buffer.concat([
        canonical('pre-commit'),
        Buffer.from('\n# older owned wrapper\n'),
    ]);
    writeHook(fixture.projectRoot, 'pre-commit', older);
    let publications = 0;

    const result = applyManagedHooks({
        ...fixture,
        approval: 'yes',
        rename(source, destination) {
            publications += 1;
            if (publications === 2) throw new Error('injected publication failure');
            fs.renameSync(source, destination);
        },
    });

    assert.equal(result.status, 'NO-GO');
    assert.equal(fs.readFileSync(hookPath(fixture.projectRoot, 'pre-commit')).equals(older), true);
    assert.equal(fs.existsSync(hookPath(fixture.projectRoot, 'commit-msg')), false);
    assert.throws(() => execFileSync(
        'git',
        ['config', '--local', '--get', 'core.hooksPath'],
        {cwd: fixture.projectRoot, stdio: 'ignore'}
    ));
});

test('continues managed-hook rollback after one restoration fails', (t) => {
    const fixture = makeFixture(t);
    const older = Buffer.concat([
        canonical('pre-commit'),
        Buffer.from('\n# older owned wrapper\n'),
    ]);
    writeHook(fixture.projectRoot, 'pre-commit', older);
    const originalRename = fs.renameSync;
    const preCommitPath = hookPath(fixture.projectRoot, 'pre-commit');
    let publications = 0;
    let rollback = false;
    let failedRestore = false;
    fs.renameSync = function failOneRestore(source, destination) {
        if (rollback && !failedRestore && destination === preCommitPath) {
            failedRestore = true;
            throw new Error('injected restore failure');
        }
        return originalRename.call(this, source, destination);
    };

    let result;
    try {
        result = applyManagedHooks({
            ...fixture,
            approval: 'yes',
            rename(source, destination) {
                publications += 1;
                if (publications === 3) {
                    rollback = true;
                    throw new Error('stop publication');
                }
                originalRename(source, destination);
            },
        });
    } finally {
        fs.renameSync = originalRename;
    }
    assert.equal(result.status, 'NO-GO');
    assert.equal(result.checks[0].message, 'managed hook rollback is incomplete');
    assert.equal(failedRestore, true);
    assert.equal(fs.existsSync(hookPath(fixture.projectRoot, 'commit-msg')), false);
});

test('does not treat an unmarked prism-tool invocation as owned', (t) => {
    const fixture = makeFixture(t);
    writeHook(
        fixture.projectRoot,
        'pre-commit',
        '#!/usr/bin/env bash\nexec prism-tool hook pre-commit "$@"\n'
    );

    assert.equal(inspectManagedHooks(fixture).status, 'NO-GO');
});

test('does not infer Prism ownership from embedded marker fragments', (t) => {
    const fixture = makeFixture(t);
    writeHook(
        fixture.projectRoot,
        'pre-commit',
        [
            '#!/usr/bin/env bash',
            "printf '%s\\n' '# prism-managed: @kyaulabs/prism-core'",
            "printf '%s\\n' 'prism-tool hook '",
            '',
        ].join('\n')
    );

    assert.equal(inspectManagedHooks(fixture).status, 'NO-GO');
});

test('fails closed on symlinked hook state and conflicting hook paths', (t) => {
    const symlinkFixture = makeFixture(t);
    fs.mkdirSync(path.join(symlinkFixture.projectRoot, '.github'), {recursive: true});
    fs.symlinkSync(
        path.join(symlinkFixture.projectRoot, '.git', 'hooks'),
        path.join(symlinkFixture.projectRoot, '.github', 'hooks')
    );
    assert.equal(inspectManagedHooks(symlinkFixture).status, 'NO-GO');

    const configFixture = makeFixture(t);
    execFileSync('git', ['config', '--local', 'core.hooksPath', 'human-hooks'], {
        cwd: configFixture.projectRoot,
    });
    assert.equal(inspectManagedHooks(configFixture).status, 'NO-GO');
});

test('requires literal approval through the reconcile command', (t) => {
    const fixture = makeFixture(t);
    const rejected = captureWrites(() => main(['hook', 'reconcile'], fixture));
    assert.equal(rejected.status, 2);
    assert.equal(fs.existsSync(path.join(fixture.projectRoot, '.github', 'hooks')), false);

    const applied = captureWrites(() => main([
        'hook',
        'reconcile',
        '--approval=yes',
        '--json',
    ], fixture));
    assert.equal(applied.status, 0, applied.stderr);
    assert.equal(JSON.parse(applied.stdout).status, 'GO');
});

// vim: ft=javascript sts=4 sw=4 ts=4 et :
