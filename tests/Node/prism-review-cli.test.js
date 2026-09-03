// $KYAULabs: prism-review-cli.test.js kyau@aura.kyaulabs 2026/09/02 -0700 Exp $

'use strict';

const assert = require('node:assert/strict');
const {spawnSync} = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const CORE_ROOT = path.resolve(__dirname, '../../packages/prism-core');
const {main} = require('../../packages/prism-core/scripts/prism-review/cli');
const {EXIT} = require('../../packages/prism-core/scripts/prism-review/constants');

function capture() {
    let stdout = '';
    let stderr = '';
    return {
        context: {
            coreRoot: CORE_ROOT,
            stdout: {write: (value) => { stdout += value; }},
            stderr: {write: (value) => { stderr += value; }},
        },
        result: () => ({stdout, stderr}),
    };
}

test('the executable exposes the public version command', () => {
    const result = spawnSync(process.execPath, [
        path.join(CORE_ROOT, 'scripts/prism-review.js'),
        '--version',
    ], {encoding: 'utf8'});

    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.stdout, '0.4.3\n');
    assert.equal(result.stderr, '');
});

test('the executable strips inherited Node preload injection', (t) => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'prism-review-preload-'));
    const preload = path.join(root, 'preload.cjs');
    const marker = path.join(root, 'executed');
    fs.writeFileSync(preload, "require('node:fs').writeFileSync(process.env.PRISM_PRELOAD_MARKER, 'ran');\n");
    t.after(() => fs.rmSync(root, {recursive: true, force: true}));

    const result = spawnSync(path.join(CORE_ROOT, 'scripts/prism-review.js'), ['--version'], {
        encoding: 'utf8',
        env: {
            ...process.env,
            NODE_OPTIONS: `--require=${preload}`,
            NODE_PATH: root,
            PRISM_PRELOAD_MARKER: marker,
        },
    });

    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.stdout, '0.4.3\n');
    assert.equal(fs.existsSync(marker), false);
});

test('prints the packaged Core version without touching runtime boundaries', async () => {
    const output = capture();
    const status = await main(['--version'], {
        ...output.context,
        run: () => { throw new Error('Git must not run'); },
        loadSdk: () => { throw new Error('SDK must not load'); },
    });

    assert.equal(status, 0);
    assert.deepEqual(output.result(), {stdout: '0.4.3\n', stderr: ''});
});

test('uses a bounded descriptor read for the package version manifest', async (t) => {
    const coreRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'prism-review-version-'));
    fs.writeFileSync(
        path.join(coreRoot, 'package.json'),
        '{"name":"@kyaulabs/prism-core","version":"1.2.3"}\n'
    );
    t.after(() => fs.rmSync(coreRoot, {recursive: true, force: true}));
    const originalReadFileSync = fs.readFileSync;
    let unboundedDescriptorRead = false;
    fs.readFileSync = (target, ...args) => {
        if (typeof target === 'number') {
            unboundedDescriptorRead = true;
            throw new Error('whole descriptor reads are not permitted');
        }
        return originalReadFileSync(target, ...args);
    };
    t.after(() => { fs.readFileSync = originalReadFileSync; });
    const output = capture();

    const status = await main(['--version'], {...output.context, coreRoot});

    assert.equal(status, EXIT.OK);
    assert.equal(unboundedDescriptorRead, false);
    assert.deepEqual(output.result(), {stdout: '1.2.3\n', stderr: ''});
});

test('prints the closed command grammar without touching runtime boundaries', async () => {
    const output = capture();
    const status = await main(['--help'], {
        ...output.context,
        run: () => { throw new Error('Git must not run'); },
        loadSdk: () => { throw new Error('SDK must not load'); },
    });

    assert.equal(status, 0);
    assert.equal(output.result().stderr, '');
    assert.match(output.result().stdout, /^usage: prism-review/m);
    assert.match(output.result().stdout, /review staged --json/);
    assert.match(output.result().stdout, /review commit --commit SHA --json/);
    assert.match(output.result().stdout, /review branch --base SHA --head SHA --json/);
    assert.match(output.result().stdout, /review path --path RELATIVE_TRACKED_PATH --json/);
});

test('classifies checkout Core as ineligible for authority', () => {
    const {classifyTrustRoot} = require('../../packages/prism-core/scripts/prism-review/trust');
    const repositoryRoot = path.resolve(__dirname, '../..');

    assert.deepEqual(classifyTrustRoot(CORE_ROOT, repositoryRoot), {
        eligibleForAuthority: false,
        sourceClass: 'REVIEWED_WORKTREE',
    });
});

test('rejects a symlinked external Core path into the reviewed repository', (t) => {
    const {classifyTrustRoot} = require('../../packages/prism-core/scripts/prism-review/trust');
    const repositoryRoot = path.resolve(__dirname, '../..');
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'prism-review-trust-link-'));
    const linkedCore = path.join(root, 'core');
    fs.symlinkSync(CORE_ROOT, linkedCore);
    t.after(() => fs.rmSync(root, {recursive: true, force: true}));

    assert.throws(() => classifyTrustRoot(linkedCore, repositoryRoot), /trust root is invalid/);
});

test('classifies a separate installed Core root as authority-eligible', (t) => {
    const {classifyTrustRoot} = require('../../packages/prism-core/scripts/prism-review/trust');
    const fixtureRoot = path.resolve(__dirname, '../../.pi/prism-review/work/trust');
    fs.rmSync(fixtureRoot, {recursive: true, force: true});
    fs.mkdirSync(path.join(fixtureRoot, 'core'), {recursive: true});
    fs.mkdirSync(path.join(fixtureRoot, 'repository'));
    t.after(() => fs.rmSync(fixtureRoot, {recursive: true, force: true}));

    assert.deepEqual(
        classifyTrustRoot(path.join(fixtureRoot, 'core'), path.join(fixtureRoot, 'repository')),
        {eligibleForAuthority: true, sourceClass: 'INSTALLED_EXTERNAL'}
    );
});

test('rejects every command outside the closed grammar before dependencies run', async () => {
    const invalid = [
        [],
        ['unknown'],
        ['--help', '--help'],
        ['doctor'],
        ['doctor', '--json', '--json'],
        ['review', 'staged'],
        ['review', 'staged', '--json', 'extra'],
        ['review', 'commit', '--commit', 'HEAD', '--json'],
        ['review', 'commit', '--commit', 'a'.repeat(40), '--json', '--json'],
        ['review', 'branch', '--head', 'a'.repeat(40), '--base', 'b'.repeat(40), '--json'],
        ['review', 'path', '--path', '../outside', '--json'],
        ['review', 'path', '--path', 'bad\npath', '--json'],
    ];
    for (const argv of invalid) {
        const output = capture();
        const status = await main(argv, {
            ...output.context,
            run: () => { throw new Error('Git must not run'); },
            loadSdk: () => { throw new Error('SDK must not load'); },
        });
        assert.equal(status, EXIT.USAGE, JSON.stringify(argv));
        assert.equal(output.result().stdout, '', JSON.stringify(argv));
        assert.equal(output.result().stderr, 'prism-review: invalid arguments\n', JSON.stringify(argv));
    }
});

test('reports exact model and isolated SDK readiness without running Git', async () => {
    const output = capture();
    const repositoryRoot = path.resolve(__dirname, '../..');
    const calls = [];
    const status = await main(['doctor', '--json'], {
        ...output.context,
        projectRoot: repositoryRoot,
        env: {
            PI_PROVIDER: 'anthropic',
            PI_MODEL: 'claude-sonnet-4-5',
            PI_REASONING_LEVEL: 'high',
        },
        coreProfilePresent: false,
        run: () => { throw new Error('Git must not run'); },
        async inspectIsolatedRuntime(options) {
            calls.push(options.repositoryRoot);
            return {
                provider: 'anthropic',
                id: 'claude-sonnet-4-5',
                reasoningLevel: 'high',
                contextWindow: 200000,
                authentication: 'UNKNOWN',
            };
        },
    });

    assert.equal(status, EXIT.OK);
    assert.deepEqual(calls, [repositoryRoot]);
    assert.equal(output.result().stderr, '');
    assert.deepEqual(JSON.parse(output.result().stdout), {
        schemaVersion: 1,
        command: 'doctor',
        status: 'GO',
        sourceClass: 'REVIEWED_WORKTREE',
        eligibleForAuthority: false,
        model: {
            provider: 'anthropic',
            id: 'claude-sonnet-4-5',
            reasoningLevel: 'high',
            contextWindow: 200000,
            authentication: 'UNKNOWN',
        },
        checks: [
            {id: 'trust-root', status: 'PASS', message: 'review trust root classified'},
            {id: 'active-model', status: 'PASS', message: 'active Pi model resolved exactly'},
            {id: 'sdk-isolation', status: 'PASS', message: 'isolated Pi resources validated'},
        ],
    });
});

test('doctor validates an available Core profile and optional adapter state without inference', async () => {
    const repositoryRoot = path.resolve(__dirname, '../..');
    const calls = [];
    const output = capture();
    const status = await main(['doctor', '--json'], {
        ...output.context,
        projectRoot: repositoryRoot,
        env: {
            PI_PROVIDER: 'anthropic',
            PI_MODEL: 'claude-sonnet-4-5',
            PI_REASONING_LEVEL: 'high',
        },
        coreProfilePresent: true,
        inspectIsolatedRuntime: async () => ({
            provider: 'anthropic',
            id: 'claude-sonnet-4-5',
            reasoningLevel: 'high',
            contextWindow: 200000,
            authentication: 'UNKNOWN',
        }),
        loadCoreProfile() {
            calls.push('core');
            return {profileDigest: 'a'.repeat(64), policyDigest: 'b'.repeat(64)};
        },
        discoverOptionalAdapter() {
            calls.push('adapter-discovery');
            return null;
        },
        loadSdk: () => { throw new Error('SDK must not load'); },
    });

    assert.equal(status, EXIT.OK);
    assert.deepEqual(calls, ['core', 'adapter-discovery']);
    const report = JSON.parse(output.result().stdout);
    assert.deepEqual(report.profile, {
        core: {profileDigest: 'a'.repeat(64), policyDigest: 'b'.repeat(64)},
        adapter: null,
    });
    assert.deepEqual(report.checks.at(-1), {
        id: 'review-profile', status: 'PASS', message: 'closed review profile validated',
    });
});

test('fails readiness without echoing invalid model environment values', async () => {
    const repositoryRoot = path.resolve(__dirname, '../..');
    for (const env of [
        {},
        {PI_PROVIDER: 'bad\nprovider', PI_MODEL: 'model', PI_REASONING_LEVEL: 'high'},
        {PI_PROVIDER: 'provider', PI_MODEL: 'bad model', PI_REASONING_LEVEL: 'high'},
        {PI_PROVIDER: 'provider', PI_MODEL: 'model', PI_REASONING_LEVEL: 'extreme'},
    ]) {
        const output = capture();
        const status = await main(['doctor', '--json'], {
            ...output.context,
            projectRoot: repositoryRoot,
            env,
        });
        assert.equal(status, EXIT.READINESS);
        assert.deepEqual(JSON.parse(output.result().stdout), {
            schemaVersion: 1,
            command: 'doctor',
            status: 'NO-GO',
            reason: 'RUNTIME_READINESS_FAILED',
        });
        assert.equal(output.result().stderr, '');
        assert.doesNotMatch(output.result().stdout, /bad|extreme/);
    }
});

test('readiness errors do not disclose canonical package paths', async () => {
    const repositoryRoot = path.resolve(__dirname, '../..');
    const canary = 'private-core-path-canary';
    const output = capture();
    const status = await main(['doctor', '--json'], {
        ...output.context,
        coreRoot: path.join(repositoryRoot, canary),
        projectRoot: repositoryRoot,
        env: {PI_PROVIDER: 'provider', PI_MODEL: 'model'},
    });

    assert.equal(status, EXIT.READINESS);
    assert.doesNotMatch(output.result().stdout + output.result().stderr, new RegExp(canary));
});

test('dispatches every review scope through snapshot, planning, and orchestration', async () => {
    const repositoryRoot = path.resolve(__dirname, '../..');
    const shaA = 'a'.repeat(40);
    const shaB = 'b'.repeat(40);
    const cases = [
        {argv: ['review', 'staged', '--json'], command: 'review staged', scope: {mode: 'staged'}},
        {
            argv: ['review', 'commit', '--commit', shaA, '--json'],
            command: 'review commit',
            scope: {mode: 'commit', commit: shaA},
        },
        {
            argv: ['review', 'branch', '--base', shaA, '--head', shaB, '--json'],
            command: 'review branch',
            scope: {mode: 'branch', base: shaA, head: shaB},
        },
        {
            argv: ['review', 'path', '--path', 'src/file.js', '--json'],
            command: 'review path',
            scope: {mode: 'path', path: 'src/file.js'},
        },
    ];
    for (const {argv, command, scope} of cases) {
        const calls = [];
        const output = capture();
        const snapshot = {
            ...scope,
            baseCommit: shaA,
            headCommit: shaB,
            manifestDigest: 'c'.repeat(64),
            entries: [{oldPath: null, newPath: 'src/file.js', kind: 'text'}],
        };
        const core = {
            role: 'core',
            profile: {sessionSkill: 'session', verifierSkills: ['verifier']},
            resources: [{id: 'session', text: 'session'}, {id: 'verifier', text: 'verifier'}],
        };
        const plan = {policyDigest: 'd'.repeat(64), planDigest: 'e'.repeat(64)};
        const report = {
            schemaVersion: 1,
            command,
            authoritative: false,
            sourceClass: 'REVIEWED_WORKTREE',
            outcome: command === 'review commit'
                ? 'BLOCKING'
                : command === 'review path' ? 'INCONCLUSIVE' : 'PASS',
        };
        const status = await main(argv, {
            ...output.context,
            projectRoot: repositoryRoot,
            env: {PI_PROVIDER: 'fixture', PI_MODEL: 'model', PI_REASONING_LEVEL: 'high'},
            createSnapshot(options) {
                calls.push(['snapshot', options]);
                return snapshot;
            },
            loadCoreProfile() { calls.push(['core']); return core; },
            discoverOptionalAdapter() { calls.push(['adapter']); return null; },
            buildReviewPlan(options) {
                calls.push(['plan', options.changedPaths]);
                return plan;
            },
            async resolveActiveModel() {
                calls.push(['model']);
                return {metadata: {provider: 'fixture', id: 'model'}};
            },
            async runReviewAttempt(options) {
                calls.push(['run', options.command, options.snapshot, options.plan]);
                return report;
            },
        });

        assert.equal(status, report.outcome === 'PASS' ? EXIT.OK : EXIT.REVIEW);
        assert.deepEqual(JSON.parse(output.result().stdout), report);
        assert.equal(output.result().stderr, '');
        assert.deepEqual(calls[0][0], 'snapshot');
        assert.deepEqual(calls[0][1], {repositoryRoot, ...scope});
        assert.deepEqual(calls.map(([name]) => name), ['snapshot', 'core', 'adapter', 'plan', 'model', 'run']);
    }
});

test('uses readiness exit three before an attempt and review exit four for Inconclusive reports', async () => {
    const repositoryRoot = path.resolve(__dirname, '../..');
    const readiness = capture();
    assert.equal(await main(['review', 'staged', '--json'], {
        ...readiness.context,
        projectRoot: repositoryRoot,
        createSnapshot() { throw new Error('private readiness canary'); },
    }), EXIT.READINESS);
    assert.equal(JSON.parse(readiness.result().stdout).reason, 'RUNTIME_READINESS_FAILED');
    assert.doesNotMatch(readiness.result().stdout, /private readiness canary/);
});

// vim: ft=javascript sts=4 sw=4 ts=4 et :
