// $KYAULabs: prism-review-cli.test.js kyau@aura.kyaulabs 2026/09/03 -0700 Exp $

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
    assert.match(output.result().stdout,
        /criteria record --source ROLE:COMMIT:PATH \[--source ROLE:COMMIT:PATH \.\.\.\] --json/);
    assert.match(output.result().stdout, /criteria none --json/);
    assert.match(output.result().stdout, /criteria inspect --json/);
    assert.match(output.result().stdout, /check --base-ref origin\/develop\|origin\/main --json/);
    assert.match(output.result().stdout, /chain inspect --json/);
    assert.match(output.result().stdout,
        /chain verify --base-ref origin\/develop\|origin\/main --json/);
    assert.match(output.result().stdout,
        /review authoritative --base-ref origin\/develop\|origin\/main --json/);
    assert.match(output.result().stdout,
        /review authoritative --base-ref origin\/develop\|origin\/main --new-initial --json/);
    assert.match(output.result().stdout,
        /review repair --base-ref origin\/develop\|origin\/main --closures RELATIVE_PATH --json/);
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
        ['criteria', 'record', '--json'],
        ['criteria', 'record', '--source', `spec:${'a'.repeat(40)}:docs/spec.md`, '--json'],
        ['criteria', 'record', '--source', 'SPEC:HEAD:docs/spec.md', '--json'],
        ['criteria', 'record', '--source', `SPEC:${'a'.repeat(40)}:/docs/spec.md`, '--json'],
        ['criteria', 'record', '--source', `SPEC:${'a'.repeat(40)}:docs/a.md`,
            '--source', `PLAN:${'a'.repeat(40)}:docs/a.md`, '--json'],
        ['criteria', 'none', '--json', 'extra'],
        ['check', '--json', '--base-ref', 'origin/develop'],
        ['check', '--base-ref', 'develop', '--json'],
        ['chain', 'verify', '--base-ref', 'origin/develop', '--json', 'extra'],
        ['review', 'authoritative', '--new-initial', '--base-ref', 'origin/develop', '--json'],
        ['review', 'authoritative', '--base-ref', 'origin/develop', '--new-initial', '--new-initial', '--json'],
        ['review', 'repair', '--base-ref', 'origin/develop', '--closures', '../closures.json', '--json'],
        ['review', 'repair', '--base-ref', 'origin/develop', '--closures', 'closures/*.json', '--json'],
        ['review', 'repair', '--base-ref', 'origin/develop', '--closures', 'closures.json',
            '--closures', 'again.json', '--json'],
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

test('reports explicit read-only bridge state without requiring authority eligibility', async () => {
    const repositoryRoot = path.resolve(__dirname, '../..');
    const output = capture();
    const calls = [];

    const status = await main(['criteria', 'inspect', '--json'], {
        ...output.context,
        projectRoot: repositoryRoot,
        classifyTrustRoot(coreRoot, project) {
            calls.push(['trust', coreRoot, project]);
            return {eligibleForAuthority: false, sourceClass: 'REVIEWED_WORKTREE'};
        },
        inspectCriteria() {
            calls.push(['criteria']);
            return {state: 'ABSENT', path: '/private/canary'};
        },
    });

    assert.equal(status, EXIT.OK);
    assert.deepEqual(calls.map(([name]) => name), ['trust', 'criteria']);
    assert.deepEqual(JSON.parse(output.result().stdout), {
        schemaVersion: 1,
        command: 'criteria inspect',
        status: 'PASS',
        outcome: 'PASS',
        eligibleForAuthority: false,
        sourceClass: 'REVIEWED_WORKTREE',
        state: 'ABSENT',
        version: null,
        receiptDigest: null,
        reason: null,
    });
    assert.doesNotMatch(output.result().stdout, /private|canary/);
    assert.equal(output.result().stderr, '');
});

test('verifies a chain read-only from checkout Core', async () => {
    const repositoryRoot = path.resolve(__dirname, '../..');
    const sha = 'a'.repeat(40);
    const digest = 'b'.repeat(64);
    const output = capture();
    const status = await main([
        'chain', 'verify', '--base-ref', 'origin/develop', '--json',
    ], {
        ...output.context,
        projectRoot: repositoryRoot,
        classifyTrustRoot: () => ({eligibleForAuthority: false, sourceClass: 'REVIEWED_WORKTREE'}),
        resolveBridgeIdentity: () => ({
            branch: 'feat/example', baseRef: 'origin/develop', baseSha: sha, headSha: sha,
        }),
        verifyCriteria: () => ({digest}),
        verifyCheck: (identity) => ({...identity, digest, status: 'PASS'}),
        verifyReviewChainV2: () => ({record: {schemaVersion: 2, headSha: sha}}),
    });

    assert.equal(status, EXIT.OK);
    const report = JSON.parse(output.result().stdout);
    assert.equal(report.eligibleForAuthority, false);
    assert.equal(report.sourceClass, 'REVIEWED_WORKTREE');
    assert.equal(report.state, 'VALID');
    assert.equal(report.version, 2);
});

test('records exact criteria sources only through an eligible authority root', async () => {
    const repositoryRoot = path.resolve(__dirname, '../..');
    const sha = 'a'.repeat(40);
    const argv = [
        'criteria', 'record', '--source', `SPEC:${sha}:docs/specs/review:bridge.md`,
        '--source', `PLAN:${sha}:docs/plans/review.md`, '--json',
    ];
    const rejected = capture();
    let touched = false;
    assert.equal(await main(argv, {
        ...rejected.context,
        projectRoot: repositoryRoot,
        classifyTrustRoot: () => ({eligibleForAuthority: false, sourceClass: 'REVIEWED_WORKTREE'}),
        recordCriteria: () => { touched = true; },
    }), EXIT.READINESS);
    assert.equal(touched, false);

    const output = capture();
    let request;
    const status = await main(argv, {
        ...output.context,
        projectRoot: repositoryRoot,
        classifyTrustRoot: () => ({eligibleForAuthority: true, sourceClass: 'INSTALLED_EXTERNAL'}),
        recordCriteria(value) {
            request = value;
            return {disposition: 'DECLARED', digest: 'b'.repeat(64), path: '/private/canary'};
        },
    });

    assert.equal(status, EXIT.OK);
    assert.deepEqual(request, {
        disposition: 'DECLARED',
        sources: [
            {role: 'SPEC', commit: sha, path: 'docs/specs/review:bridge.md'},
            {role: 'PLAN', commit: sha, path: 'docs/plans/review.md'},
        ],
    });
    assert.deepEqual(JSON.parse(output.result().stdout), {
        schemaVersion: 1,
        command: 'criteria record',
        status: 'PASS',
        outcome: 'PASS',
        eligibleForAuthority: true,
        sourceClass: 'INSTALLED_EXTERNAL',
        state: 'VALID',
        version: 1,
        receiptDigest: 'b'.repeat(64),
        reason: null,
    });
    assert.doesNotMatch(output.result().stdout, /private|canary/);
});

test('dispatches each exact bridge operation with closed results', async (t) => {
    const repositoryRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'prism-review-cli-bridge-'));
    fs.writeFileSync(path.join(repositoryRoot, 'closures.json'), JSON.stringify({
        schemaVersion: 1,
        closures: [{
            fingerprint: 'a'.repeat(64),
            evidence: 'regression passes',
            tests: [{path: 'tests/Node/example.test.js', gateId: 'core.node-tests'}],
        }],
    }));
    t.after(() => fs.rmSync(repositoryRoot, {recursive: true, force: true}));
    const sha = 'b'.repeat(40);
    const digest = 'c'.repeat(64);
    const cases = [
        {argv: ['criteria', 'none', '--json'], command: 'criteria none', call: 'criteria-none'},
        {argv: ['check', '--base-ref', 'origin/develop', '--json'], command: 'check', call: 'check'},
        {argv: ['chain', 'inspect', '--json'], command: 'chain inspect', call: 'chain-inspect'},
        {argv: ['chain', 'verify', '--base-ref', 'origin/develop', '--json'],
            command: 'chain verify', call: 'chain-verify'},
        {argv: ['review', 'authoritative', '--base-ref', 'origin/develop', '--json'],
            command: 'review authoritative', call: 'review-initial'},
        {argv: ['review', 'authoritative', '--base-ref', 'origin/develop', '--new-initial', '--json'],
            command: 'review authoritative', call: 'review-replacement'},
        {argv: ['review', 'repair', '--base-ref', 'origin/develop', '--closures', 'closures.json', '--json'],
            command: 'review repair', call: 'review-repair'},
    ];

    for (const fixture of cases) {
        const calls = [];
        const output = capture();
        const status = await main(fixture.argv, {
            ...output.context,
            projectRoot: repositoryRoot,
            classifyTrustRoot: () => ({eligibleForAuthority: true, sourceClass: 'INSTALLED_EXTERNAL'}),
            recordCriteria(input) {
                calls.push(['criteria-none', input]);
                return {digest, disposition: 'NONE_DECLARED'};
            },
            runDeterministicCheck(input) {
                calls.push(['check', input]);
                return {status: 'PASS', digest, headSha: sha};
            },
            inspectReviewChainV2() {
                calls.push(['chain-inspect']);
                return {state: 'ABSENT'};
            },
            resolveBridgeIdentity(baseRef) {
                calls.push(['identity', baseRef]);
                return {branch: 'feat/example', baseRef, baseSha: sha, headSha: sha};
            },
            verifyCriteria() { calls.push(['verify-criteria']); return {digest}; },
            verifyCheck(identity) {
                calls.push(['verify-check', identity]);
                return {...identity, digest, status: 'PASS'};
            },
            verifyReviewChainV2(expected) {
                calls.push(['chain-verify', expected]);
                return {record: {schemaVersion: 2, headSha: sha}};
            },
            runAuthoritativeReview(input) {
                calls.push([input.operation === 'repair' ? 'review-repair' :
                    input.newInitial ? 'review-replacement' : 'review-initial', input]);
                return {authoritative: true, reused: false, outcome: 'PASS',
                    receipt: {schemaVersion: 2, headSha: sha}};
            },
        });

        assert.equal(status, EXIT.OK, fixture.call);
        const report = JSON.parse(output.result().stdout);
        assert.equal(report.command, fixture.command);
        assert.equal(report.status, 'PASS');
        assert.equal(report.outcome, 'PASS');
        assert.equal(report.eligibleForAuthority, true);
        assert.equal(report.sourceClass, 'INSTALLED_EXTERNAL');
        assert.equal(report.reason, null);
        assert.ok(calls.some(([name]) => name === fixture.call), fixture.call);
        if (fixture.call === 'review-repair') {
            assert.equal(calls.at(-1)[1].closures.closures[0].fingerprint, 'a'.repeat(64));
        }
    }
});

test('rejects checkout authority mutations with explicit trust state before dependencies run', async () => {
    const repositoryRoot = path.resolve(__dirname, '../..');
    const sha = 'a'.repeat(40);
    const cases = [
        ['criteria', 'record', '--source', `SPEC:${sha}:docs/spec.md`, '--json'],
        ['check', '--base-ref', 'origin/develop', '--json'],
        ['review', 'authoritative', '--base-ref', 'origin/develop', '--json'],
    ];
    for (const argv of cases) {
        const output = capture();
        let touched = false;
        const status = await main(argv, {
            ...output.context,
            projectRoot: repositoryRoot,
            classifyTrustRoot: () => ({eligibleForAuthority: false, sourceClass: 'REVIEWED_WORKTREE'}),
            recordCriteria: () => { touched = true; },
            runDeterministicCheck: () => { touched = true; },
            runAuthoritativeReview: () => { touched = true; },
        });
        assert.equal(status, EXIT.READINESS);
        assert.equal(touched, false);
        const report = JSON.parse(output.result().stdout);
        assert.equal(report.eligibleForAuthority, false);
        assert.equal(report.sourceClass, 'REVIEWED_WORKTREE');
        assert.equal(report.reason, 'AUTHORITY_INELIGIBLE');
    }
});

test('uses review exit semantics for failed checks and authoritative Blocking outcomes', async () => {
    const repositoryRoot = path.resolve(__dirname, '../..');
    const trust = () => ({eligibleForAuthority: true, sourceClass: 'INSTALLED_EXTERNAL'});
    const fixtures = [
        {
            argv: ['check', '--base-ref', 'origin/develop', '--json'],
            context: {runDeterministicCheck: () => ({status: 'FAIL', digest: 'a'.repeat(64)})},
            status: 'FAIL', outcome: 'INCONCLUSIVE',
        },
        {
            argv: ['review', 'authoritative', '--base-ref', 'origin/develop', '--json'],
            context: {runAuthoritativeReview: () => ({outcome: 'BLOCKING', receipt: {
                schemaVersion: 2, openBlocking: ['b'.repeat(64)],
            }})},
            status: 'BLOCKING', outcome: 'BLOCKING',
        },
    ];
    for (const fixture of fixtures) {
        const output = capture();
        const exit = await main(fixture.argv, {
            ...output.context,
            ...fixture.context,
            projectRoot: repositoryRoot,
            classifyTrustRoot: trust,
        });
        assert.equal(exit, EXIT.REVIEW);
        const report = JSON.parse(output.result().stdout);
        assert.equal(report.status, fixture.status);
        assert.equal(report.outcome, fixture.outcome);
    }
});

test('reads closure proposals through a bounded repository-confined no-follow boundary', async (t) => {
    const repositoryRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'prism-review-cli-closures-'));
    const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'prism-review-cli-outside-'));
    fs.writeFileSync(path.join(outside, 'closures.json'), '{}');
    fs.symlinkSync(path.join(outside, 'closures.json'), path.join(repositoryRoot, 'file-link.json'));
    fs.symlinkSync(outside, path.join(repositoryRoot, 'parent-link'));
    fs.writeFileSync(path.join(repositoryRoot, 'oversized.json'), 'x'.repeat(1048577));
    fs.writeFileSync(path.join(repositoryRoot, 'invalid-utf8.json'), Buffer.concat([
        Buffer.from(`{"schemaVersion":1,"closures":[{"fingerprint":"${'a'.repeat(64)}","evidence":"`),
        Buffer.from([0xff]),
        Buffer.from('","tests":[{"path":"tests/Node/example.test.js","gateId":"core.node-tests"}]}]}'),
    ]));
    t.after(() => {
        fs.rmSync(repositoryRoot, {recursive: true, force: true});
        fs.rmSync(outside, {recursive: true, force: true});
    });
    const unsafe = [
        'file-link.json', 'parent-link/closures.json', 'oversized.json', 'invalid-utf8.json',
    ];

    for (const closurePath of unsafe) {
        const output = capture();
        let attempted = false;
        const status = await main([
            'review', 'repair', '--base-ref', 'origin/develop', '--closures', closurePath, '--json',
        ], {
            ...output.context,
            projectRoot: repositoryRoot,
            classifyTrustRoot: () => ({eligibleForAuthority: true, sourceClass: 'INSTALLED_EXTERNAL'}),
            runAuthoritativeReview: () => { attempted = true; },
        });
        assert.equal(status, EXIT.READINESS, closurePath);
        assert.equal(attempted, false, closurePath);
        const report = JSON.parse(output.result().stdout);
        assert.equal(report.reason, 'RUNTIME_READINESS_FAILED');
        assert.doesNotMatch(output.result().stdout, /outside|closures-/);
    }
});

test('doctor reports exact external authority and absent receipt readiness without probing authentication', async (t) => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'prism-review-doctor-'));
    const coreRoot = path.join(root, 'core');
    const repositoryRoot = path.join(root, 'repository');
    fs.mkdirSync(coreRoot);
    fs.mkdirSync(repositoryRoot);
    fs.writeFileSync(path.join(coreRoot, 'package.json'),
        '{"name":"@kyaulabs/prism-core","version":"1.2.3"}\n');
    t.after(() => fs.rmSync(root, {recursive: true, force: true}));
    const output = capture();
    let authenticationProbes = 0;

    const status = await main(['doctor', '--json'], {
        ...output.context,
        coreRoot,
        projectRoot: repositoryRoot,
        classifyTrustRoot: () => ({eligibleForAuthority: true, sourceClass: 'INSTALLED_EXTERNAL'}),
        coreProfilePresent: true,
        inspectIsolatedRuntime: async () => ({
            provider: 'fixture-provider', id: 'fixture-model', reasoningLevel: 'high',
            contextWindow: 200000, authentication: 'UNKNOWN',
        }),
        loadCoreProfile: () => ({profileDigest: 'a'.repeat(64), policyDigest: 'b'.repeat(64)}),
        discoverOptionalAdapter: () => null,
        inspectCriteria: () => ({state: 'ABSENT'}),
        inspectCheck: () => ({state: 'ABSENT'}),
        probeAuthentication: () => { authenticationProbes += 1; },
    });

    assert.equal(status, EXIT.OK);
    assert.equal(authenticationProbes, 0);
    const report = JSON.parse(output.result().stdout);
    assert.equal(report.status, 'GO');
    assert.deepEqual(report.authority, {
        core: {
            packageName: '@kyaulabs/prism-core', packageVersion: '1.2.3',
            profileDigest: 'a'.repeat(64), policyDigest: 'b'.repeat(64),
            sourceClass: 'INSTALLED_EXTERNAL',
        },
        adapter: null,
        criteriaState: 'ABSENT',
        checkState: 'ABSENT',
    });
    assert.deepEqual(report.checks.map(({id, status: checkStatus}) => [id, checkStatus]), [
        ['authority-trust-root', 'PASS'],
        ['active-model', 'PASS'],
        ['sdk-isolation', 'PASS'],
        ['review-profile', 'PASS'],
        ['criteria-state', 'ABSENT'],
        ['check-state', 'ABSENT'],
        ['adapter-quality-provider', 'SKIPPED'],
    ]);
});

test('doctor binds a protected adapter profile to one matching external provider', async (t) => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'prism-review-doctor-adapter-'));
    const coreRoot = path.join(root, 'core');
    const repositoryRoot = path.join(root, 'repository');
    fs.mkdirSync(coreRoot);
    fs.mkdirSync(repositoryRoot);
    fs.writeFileSync(path.join(coreRoot, 'package.json'),
        '{"name":"@kyaulabs/prism-core","version":"1.2.3"}\n');
    t.after(() => fs.rmSync(root, {recursive: true, force: true}));
    const output = capture();
    const registration = {packageName: '@kyaulabs/prism-php-web', reviewPath: '/reviewed/profile'};
    const installedRegistration = {packageName: '@kyaulabs/prism-php-web', reviewPath: '/installed/profile'};

    const status = await main(['doctor', '--json'], {
        ...output.context,
        coreRoot,
        projectRoot: repositoryRoot,
        coreProfilePresent: true,
        classifyTrustRoot: () => ({eligibleForAuthority: true, sourceClass: 'INSTALLED_EXTERNAL'}),
        inspectIsolatedRuntime: async () => ({provider: 'fixture', id: 'model', reasoningLevel: 'high',
            contextWindow: 200000, authentication: 'UNKNOWN'}),
        loadCoreProfile: () => ({profileDigest: 'a'.repeat(64), policyDigest: 'b'.repeat(64)}),
        discoverOptionalAdapter: () => registration,
        resolveDoctorIdentity: () => ({baseSha: '1'.repeat(40)}),
        resolveQualityProvider: () => ({
            identity: {id: 'php-web-quality', packageName: '@kyaulabs/prism-php-web',
                packageVersion: '1.2.3', protocolVersion: 1, sourceClass: 'INSTALLED_EXTERNAL'},
            registration: installedRegistration,
        }),
        loadAdapterProfile: () => ({profileDigest: 'c'.repeat(64), policyDigest: 'd'.repeat(64)}),
        inspectCriteria: () => ({state: 'VALID'}),
        inspectCheck: () => ({state: 'VALID'}),
    });

    assert.equal(status, EXIT.OK);
    const report = JSON.parse(output.result().stdout);
    assert.deepEqual(report.authority.adapter, {
        protected: {
            packageName: '@kyaulabs/prism-php-web', packageVersion: '1.2.3',
            profileDigest: 'c'.repeat(64), policyDigest: 'd'.repeat(64),
        },
        provider: {
            id: 'php-web-quality', packageName: '@kyaulabs/prism-php-web', packageVersion: '1.2.3',
            protocolVersion: 1, sourceClass: 'INSTALLED_EXTERNAL',
        },
    });
    assert.equal(report.checks.at(-1).status, 'PASS');
});

test('doctor returns NO-GO for checkout Core and adapter-provider mismatch', async (t) => {
    const repositoryRoot = path.resolve(__dirname, '../..');
    const localOutput = capture();
    let runtimeTouched = false;
    const localStatus = await main(['doctor', '--json'], {
        ...localOutput.context,
        projectRoot: repositoryRoot,
        inspectIsolatedRuntime: () => { runtimeTouched = true; },
    });
    assert.equal(localStatus, EXIT.READINESS);
    assert.equal(runtimeTouched, false);
    assert.equal(JSON.parse(localOutput.result().stdout).status, 'NO-GO');

    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'prism-review-doctor-mismatch-'));
    const coreRoot = path.join(root, 'core');
    const projectRoot = path.join(root, 'repository');
    fs.mkdirSync(coreRoot);
    fs.mkdirSync(projectRoot);
    fs.writeFileSync(path.join(coreRoot, 'package.json'),
        '{"name":"@kyaulabs/prism-core","version":"1.2.3"}\n');
    t.after(() => fs.rmSync(root, {recursive: true, force: true}));
    const mismatchOutput = capture();
    const mismatchStatus = await main(['doctor', '--json'], {
        ...mismatchOutput.context,
        coreRoot,
        projectRoot,
        coreProfilePresent: true,
        classifyTrustRoot: () => ({eligibleForAuthority: true, sourceClass: 'INSTALLED_EXTERNAL'}),
        inspectIsolatedRuntime: async () => ({provider: 'fixture', id: 'model', reasoningLevel: 'high',
            contextWindow: 200000, authentication: 'UNKNOWN'}),
        loadCoreProfile: () => ({profileDigest: 'a'.repeat(64), policyDigest: 'b'.repeat(64)}),
        discoverOptionalAdapter: () => ({packageName: '@kyaulabs/prism-php-web', reviewPath: '/reviewed'}),
        resolveDoctorIdentity: () => ({baseSha: '1'.repeat(40)}),
        resolveQualityProvider: () => { throw new Error('PRIVATE_PROVIDER_CANARY'); },
    });
    assert.equal(mismatchStatus, EXIT.READINESS);
    assert.equal(JSON.parse(mismatchOutput.result().stdout).status, 'NO-GO');
    assert.doesNotMatch(mismatchOutput.result().stdout, /PRIVATE_PROVIDER_CANARY|reviewed/);
});

test('fails readiness when the mandatory Core review profile is absent', async () => {
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
        classifyTrustRoot: () => ({eligibleForAuthority: true, sourceClass: 'INSTALLED_EXTERNAL'}),
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

    assert.equal(status, EXIT.READINESS);
    assert.deepEqual(calls, [repositoryRoot]);
    assert.equal(output.result().stderr, '');
    assert.deepEqual(JSON.parse(output.result().stdout), {
        schemaVersion: 1,
        command: 'doctor',
        status: 'NO-GO',
        reason: 'RUNTIME_READINESS_FAILED',
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
        classifyTrustRoot: () => ({eligibleForAuthority: true, sourceClass: 'INSTALLED_EXTERNAL'}),
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
        inspectCriteria: () => ({state: 'ABSENT'}),
        inspectCheck: () => ({state: 'ABSENT'}),
        loadSdk: () => { throw new Error('SDK must not load'); },
    });

    assert.equal(status, EXIT.OK);
    assert.deepEqual(calls, ['core', 'adapter-discovery']);
    const report = JSON.parse(output.result().stdout);
    assert.deepEqual(report.profile, {
        core: {profileDigest: 'a'.repeat(64), policyDigest: 'b'.repeat(64)},
        adapter: null,
    });
    assert.deepEqual(report.checks.find(({id}) => id === 'review-profile'), {
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
