// $KYAULabs: prism-tool-managed-hooks.test.js kyau@aura.kyaulabs 2026/09/04 -0700 Exp $

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
