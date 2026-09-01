// $KYAULabs: prism-tool-managed-hooks.test.js kyau@aura.kyaulabs 2026/09/01 -0700 Exp $

'use strict';

const assert = require('node:assert/strict');
const {execFileSync} = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const {main} = require('../../packages/prism-core/scripts/prism-tool/cli');
const {
    applyManagedHooks,
    inspectManagedHooks,
    planManagedHooks,
    verifyManagedHooks,
} = require('../../packages/prism-core/scripts/prism-tool/managed-hooks');
const {makeTempDir} = require('./helpers');

const CORE_ROOT = path.resolve(__dirname, '../../packages/prism-core');
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
    t.after(() => fs.rmSync(projectRoot, {recursive: true, force: true}));
    return {projectRoot, coreRoot: CORE_ROOT};
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

test('does not treat an unmarked prism-tool invocation as owned', (t) => {
    const fixture = makeFixture(t);
    writeHook(
        fixture.projectRoot,
        'pre-commit',
        '#!/usr/bin/env bash\nexec prism-tool hook pre-commit "$@"\n'
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
    assert.equal(fs.existsSync(path.join(fixture.projectRoot, '.github')), false);

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
