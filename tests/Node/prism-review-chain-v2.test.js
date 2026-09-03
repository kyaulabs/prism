// $KYAULabs: prism-review-chain-v2.test.js kyau@aura.kyaulabs 2026/09/02 -0700 Exp $

'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {spawnSync} = require('node:child_process');
const test = require('node:test');
const {AXES, LIMIT} = require('../../packages/prism-core/scripts/prism-review/constants');
const {
    inspectReviewChain: inspectReviewChainV1,
    recordReviewSegment,
} = require('../../packages/prism-core/scripts/prism-tool/review-chain');
const {
    inspectReviewChainV2,
    recordReviewAttempt,
    selectReviewChainVersion,
    verifyReviewChainV2,
} = require('../../packages/prism-core/scripts/prism-review/review-chain-v2');

function git(root, ...args) {
    const result = spawnSync('git', args, {cwd: root, encoding: 'utf8'});
    assert.equal(result.status, 0, result.stderr);
    return result.stdout.trim();
}

function fixture(t) {
    const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'prism-review-chain-v2-'));
    t.after(() => fs.rmSync(projectRoot, {recursive: true, force: true}));
    git(projectRoot, 'init', '-q');
    git(projectRoot, 'config', 'user.name', 'Fixture');
    git(projectRoot, 'config', 'user.email', 'fixture@example.com');
    fs.writeFileSync(path.join(projectRoot, 'file.txt'), 'base\n');
    git(projectRoot, 'add', 'file.txt');
    git(projectRoot, 'commit', '-q', '-m', 'base');
    const baseSha = git(projectRoot, 'rev-parse', 'HEAD');
    git(projectRoot, 'checkout', '-q', '-b', 'feat/tester-abcd-review-v2');
    fs.writeFileSync(path.join(projectRoot, 'file.txt'), 'changed\n');
    git(projectRoot, 'commit', '-qam', 'change');
    const headSha = git(projectRoot, 'rev-parse', 'HEAD');
    return {baseSha, headSha, projectRoot};
}

const digests = Object.freeze({
    criteria: '1'.repeat(64),
    check: '2'.repeat(64),
    manifest: '3'.repeat(64),
    diff: '4'.repeat(64),
    policy: '5'.repeat(64),
    plan: '6'.repeat(64),
    profile: '7'.repeat(64),
    resource: '8'.repeat(64),
    skill: '9'.repeat(64),
    core: 'a'.repeat(64),
    adapter: 'b'.repeat(64),
    entry: 'c'.repeat(64),
    entryDiff: 'd'.repeat(64),
    source: 'e'.repeat(64),
});

function finding(overrides = {}) {
    return {
        axis: 'tooling-style',
        lensId: 'core.tooling-style',
        classification: 'ADVISORY',
        path: 'file.txt',
        side: 'head',
        line: 1,
        summary: 'The name could be clearer.',
        evidence: 'changed',
        causality: null,
        relevance: null,
        workflowImpact: null,
        entryDigest: digests.entry,
        changedLine: true,
        fingerprint: 'f'.repeat(64),
        ...overrides,
    };
}

function report(target, overrides = {}) {
    const findings = overrides.findings ?? [finding()];
    return {
        schemaVersion: 1,
        command: 'review authoritative',
        authoritative: true,
        sourceClass: 'INSTALLED_EXTERNAL',
        outcome: overrides.outcome ?? 'PASS',
        scope: {
            mode: 'branch',
            baseCommit: overrides.fromSha ?? target.baseSha,
            headCommit: target.headSha,
        },
        model: {
            provider: 'fixture-provider',
            id: 'fixture-model',
            reasoningLevel: 'high',
            contextWindow: 200000,
            authentication: 'UNKNOWN',
        },
        policyDigest: digests.policy,
        planDigest: digests.plan,
        manifestDigest: digests.manifest,
        axes: AXES.map((id) => ({id, status: 'COMPLETE', outcome: 'PASS', reason: null})),
        byteExposure: [{
            entryDigest: digests.entry,
            status: 'M',
            path: 'file.txt',
            kind: 'text',
            oldObjectId: 'a'.repeat(40),
            newObjectId: 'b'.repeat(40),
            diffDigest: digests.entryDiff,
            axes: Object.fromEntries(AXES.map((axis) => [axis, 'EXPOSED'])),
        }],
        criteriaExposure: {
            disposition: 'DECLARED',
            status: 'EXPOSED',
            sources: [{
                role: 'SPEC',
                commit: target.baseSha,
                path: 'docs/specs/example.md',
                blobOid: 'c'.repeat(40),
                byteCount: 123,
                sha256: digests.source,
            }],
        },
        lenses: AXES.map((axis) => ({
            axis,
            id: `core.${axis}`,
            package: '@kyaulabs/prism-core',
            status: 'COMPLETE',
        })),
        exemptions: [],
        findings,
        verifier: {
            complete: true,
            chunks: findings.length === 0 ? 0 : 1,
            dispositions: findings.map((item) => ({
                fingerprint: item.fingerprint,
                disposition: 'CONFIRMED',
                rationale: 'Confirmed against immutable review evidence.',
                duplicateOf: null,
            })),
        },
        limits: LIMIT,
        ...overrides.report,
    };
}

function attempt(target, overrides = {}) {
    const review = overrides.report ?? report(target);
    return {
        operation: overrides.operation ?? 'initial',
        branch: 'feat/tester-abcd-review-v2',
        baseRef: 'origin/develop',
        baseSha: target.baseSha,
        fromSha: overrides.fromSha ?? target.baseSha,
        criteriaDigest: digests.criteria,
        check: {digest: digests.check, headSha: target.headSha},
        core: {
            name: '@kyaulabs/prism-core', version: '0.1.0', digest: digests.core,
            sourceClass: 'INSTALLED_EXTERNAL',
        },
        adapter: {
            name: '@kyaulabs/prism-php-web', version: '0.1.0', digest: digests.adapter,
            sourceClass: 'INSTALLED_EXTERNAL', providerId: 'php-web-quality', protocolVersion: 1,
        },
        profileDigest: digests.profile,
        resourceDigest: digests.resource,
        skillDigest: digests.skill,
        snapshot: {manifestDigest: digests.manifest, diffDigest: digests.diff},
        report: review,
        closures: overrides.closures ?? [],
        newInitial: overrides.newInitial ?? false,
    };
}

function expectation(target, overrides = {}) {
    return {
        branch: 'feat/tester-abcd-review-v2',
        baseRef: 'origin/develop',
        baseSha: target.baseSha,
        headSha: target.headSha,
        criteriaDigest: digests.criteria,
        checkDigest: overrides.checkDigest ?? digests.check,
    };
}

test('distinguishes only missing state from malformed and symlinked state', (t) => {
    const target = fixture(t);
    const directory = path.join(target.projectRoot, '.pi', 'prism-tool', 'code-review');
    const chainPath = path.join(directory, 'review-chain.json');

    assert.equal(inspectReviewChainV2(target).state, 'ABSENT');
    assert.deepEqual(selectReviewChainVersion(target), {state: 'ABSENT', version: null});
    fs.mkdirSync(directory, {recursive: true, mode: 0o700});
    fs.chmodSync(directory, 0o700);
    fs.writeFileSync(chainPath, '{}\n', {mode: 0o600});
    assert.equal(inspectReviewChainV2(target).state, 'UNSAFE');
    fs.rmSync(chainPath);
    fs.writeFileSync(path.join(target.projectRoot, 'outside.json'), '{}\n');
    fs.symlinkSync(path.join(target.projectRoot, 'outside.json'), chainPath);
    assert.equal(inspectReviewChainV2(target).state, 'UNSAFE');
});

test('classifies strict version-one state as LEGACY without changing OCR authority', (t) => {
    const target = fixture(t);
    recordReviewSegment({
        schemaVersion: 1,
        kind: 'initial',
        branch: 'feat/tester-abcd-review-v2',
        baseRef: 'origin/develop',
        baseSha: target.baseSha,
        from: target.baseSha,
        to: target.headSha,
        axes: {tooling: 'COMPLETE', standards: 'COMPLETE', spec: 'COMPLETE', sast: 'COMPLETE'},
        findings: [],
        closures: [],
    }, target);

    assert.equal(inspectReviewChainV1(target).state, 'VALID');
    assert.equal(inspectReviewChainV2(target).state, 'LEGACY');
    assert.equal(inspectReviewChainV2(target).version, 1);
    assert.equal(selectReviewChainVersion(target).version, 1);
});

test('replays a continuous repair, confirmed closure, and preserved Advisory finding', (t) => {
    const target = fixture(t);
    const blocking = finding({
        classification: 'BLOCKING',
        summary: 'The changed flow fails.',
        causality: 'The reviewed change introduced the failing branch.',
        relevance: 'The branch is exercised by the changed runtime.',
        workflowImpact: 'The command cannot complete.',
        fingerprint: '0'.repeat(64),
    });
    const initialReport = report(target, {
        findings: [blocking],
        outcome: 'BLOCKING',
        report: {
            axes: AXES.map((id, index) => ({
                id,
                status: 'COMPLETE',
                outcome: index === 0 ? 'BLOCKING' : 'PASS',
                reason: null,
            })),
        },
    });
    const initial = recordReviewAttempt(attempt(target, {report: initialReport}), target);
    assert.deepEqual(initial.openBlocking, [blocking.fingerprint]);

    fs.writeFileSync(path.join(target.projectRoot, 'file.txt'), 'repaired\n');
    git(target.projectRoot, 'commit', '-qam', 'repair');
    const repairedHead = git(target.projectRoot, 'rev-parse', 'HEAD');
    const repaired = {...target, headSha: repairedHead};
    const repairReport = report(repaired, {fromSha: target.headSha, findings: [finding()]});
    const record = recordReviewAttempt(attempt(repaired, {
        operation: 'repair',
        fromSha: target.headSha,
        report: repairReport,
        closures: [{
            fingerprint: blocking.fingerprint,
            evidence: 'The focused regression now passes.',
            tests: [{path: 'tests/Node/example.test.js', gateId: 'php-web.node-tests'}],
            disposition: 'CONFIRMED',
            rationale: 'The repair removes the immutable failure path.',
        }],
    }), repaired);

    assert.equal(record.segments.length, 2);
    assert.deepEqual(record.openBlocking, []);
    assert.equal(record.findings[0].state, 'CLOSED');
    assert.equal(record.findings[1].classification, 'ADVISORY');
    const verified = verifyReviewChainV2(expectation(repaired), repaired);
    assert.equal(verified.advisoryFindings.length, 1);
});

test('rejects incomplete authority ledgers, malformed verifier state, and stale identities', (t) => {
    const cases = [
        (input) => { input.report.axes.pop(); },
        (input) => { input.report.lenses[0].status = 'INCONCLUSIVE'; },
        (input) => { input.report.byteExposure[0].axes['tooling-style'] = 'INCOMPLETE'; },
        (input) => { input.report.criteriaExposure.status = 'INCOMPLETE'; },
        (input) => { input.report.verifier.dispositions[0].disposition = 'UNKNOWN'; },
        (input) => { input.report.findings.push({...input.report.findings[0]}); },
        (input) => { input.snapshot.manifestDigest = '0'.repeat(64); },
        (input) => { input.report.scope.baseCommit = input.check.headSha; },
        (input) => { input.check.headSha = input.baseSha; },
    ];
    for (const mutate of cases) {
        const target = fixture(t);
        const input = structuredClone(attempt(target));
        mutate(input);
        assert.throws(() => recordReviewAttempt(input, target));
        assert.equal(inspectReviewChainV2(target).state, 'ABSENT');
    }
});

test('rejects invalid closure targets and duplicate findings across repair segments', (t) => {
    for (const duplicate of [false, true]) {
        const target = fixture(t);
        const initialFinding = finding();
        recordReviewAttempt(attempt(target, {report: report(target, {findings: [initialFinding]})}), target);
        fs.writeFileSync(path.join(target.projectRoot, 'file.txt'), 'repaired\n');
        git(target.projectRoot, 'commit', '-qam', 'repair');
        const repaired = {...target, headSha: git(target.projectRoot, 'rev-parse', 'HEAD')};
        const repairFindings = duplicate ? [initialFinding] : [];
        const repairReport = report(repaired, {fromSha: target.headSha, findings: repairFindings});
        const repair = attempt(repaired, {
            operation: 'repair',
            fromSha: target.headSha,
            report: repairReport,
            closures: duplicate ? [] : [{
                fingerprint: initialFinding.fingerprint,
                evidence: 'The focused regression now passes.',
                tests: [{path: 'tests/Node/example.test.js', gateId: 'php-web.node-tests'}],
                disposition: 'CONFIRMED',
                rationale: 'The candidate is resolved.',
            }],
        });

        assert.throws(() => recordReviewAttempt(repair, repaired), duplicate ? /duplicate/ : /closure target/);
        assert.equal(inspectReviewChainV2(repaired).record.headSha, target.headSha);
    }
});

test('persists confirmed Blocking state and refuses finalization verification', (t) => {
    const target = fixture(t);
    const blocking = finding({
        classification: 'BLOCKING',
        causality: 'The changed condition introduces the failure.',
        relevance: 'The condition is part of the reviewed delta.',
        workflowImpact: 'The reviewed command fails.',
    });
    const blockingReport = report(target, {
        findings: [blocking],
        outcome: 'BLOCKING',
        report: {
            axes: AXES.map((id, index) => ({
                id, status: 'COMPLETE', outcome: index === 0 ? 'BLOCKING' : 'PASS', reason: null,
            })),
        },
    });

    const record = recordReviewAttempt(attempt(target, {report: blockingReport}), target);

    assert.deepEqual(record.openBlocking, [blocking.fingerprint]);
    assert.throws(() => verifyReviewChainV2(expectation(target), target), /unresolved Blocking/);
});

test('rejects stale branch, base, HEAD, criteria, and check expectations', (t) => {
    const target = fixture(t);
    recordReviewAttempt(attempt(target), target);
    const mutations = [
        (value) => { value.branch = 'feat/another'; },
        (value) => { value.baseRef = 'origin/main'; },
        (value) => { value.baseSha = '0'.repeat(40); },
        (value) => { value.headSha = '1'.repeat(40); },
        (value) => { value.criteriaDigest = '0'.repeat(64); },
        (value) => { value.checkDigest = '0'.repeat(64); },
    ];
    for (const mutate of mutations) {
        const expected = expectation(target);
        mutate(expected);
        assert.throws(() => verifyReviewChainV2(expected, target), /stale/);
    }
});

test('rejects discontinuous repair ranges and changed criteria authority', (t) => {
    for (const changeCriteria of [false, true]) {
        const target = fixture(t);
        recordReviewAttempt(attempt(target), target);
        fs.writeFileSync(path.join(target.projectRoot, 'file.txt'), 'repaired\n');
        git(target.projectRoot, 'commit', '-qam', 'repair');
        const repaired = {...target, headSha: git(target.projectRoot, 'rev-parse', 'HEAD')};
        const fromSha = changeCriteria ? target.headSha : target.baseSha;
        const input = attempt(repaired, {
            operation: 'repair',
            fromSha,
            report: report(repaired, {fromSha, findings: []}),
        });
        if (changeCriteria) input.criteriaDigest = '0'.repeat(64);

        assert.throws(() => recordReviewAttempt(input, repaired), /discontinuous/);
        assert.equal(inspectReviewChainV2(repaired).record.headSha, target.headSha);
    }
});

test('rejects unvalidated Inconclusive report fields instead of persisting model bytes', (t) => {
    const target = fixture(t);
    const inconclusive = report(target, {findings: [], outcome: 'INCONCLUSIVE'});
    inconclusive.rawOutput = 'CANARY-RAW-MODEL-OUTPUT';

    assert.throws(() => recordReviewAttempt(attempt(target, {report: inconclusive}), target));
    assert.equal(inspectReviewChainV2(target).state, 'ABSENT');
    assert.equal(fs.existsSync(path.join(
        target.projectRoot, '.pi', 'prism-tool', 'code-review', 'review-attempt.json'
    )), false);
});

test('stores bounded Inconclusive diagnostics without advancing the chain', (t) => {
    const target = fixture(t);
    const inconclusive = report(target, {
        findings: [],
        outcome: 'INCONCLUSIVE',
        report: {
            axes: AXES.map((id, index) => index === 0
                ? {
                    id, status: 'INCONCLUSIVE', outcome: 'INCONCLUSIVE',
                    reason: 'AXIS_SESSION_FAILED',
                }
                : {
                    id, status: 'NOT_RUN', outcome: 'INCONCLUSIVE',
                    reason: 'PRIOR_AXIS_INCONCLUSIVE',
                }),
            criteriaExposure: {
                disposition: 'DECLARED', status: 'INCOMPLETE',
                sources: report(target).criteriaExposure.sources,
            },
        },
    });
    inconclusive.command = 'CANARY-DIAGNOSTIC-MUST-NOT-PERSIST';

    const result = recordReviewAttempt(attempt(target, {report: inconclusive}), target);

    assert.equal(result.status, 'INCONCLUSIVE');
    assert.equal(inspectReviewChainV2(target).state, 'ABSENT');
    const diagnosticPath = path.join(
        target.projectRoot, '.pi', 'prism-tool', 'code-review', 'review-attempt.json'
    );
    const persisted = fs.readFileSync(diagnosticPath, 'utf8');
    assert.match(persisted, /REVIEW_INCONCLUSIVE/);
    assert.doesNotMatch(persisted, /CANARY-DIAGNOSTIC/);
});

test('replaces safe legacy state only after a complete new initial publication', (t) => {
    const target = fixture(t);
    recordReviewSegment({
        schemaVersion: 1, kind: 'initial', branch: 'feat/tester-abcd-review-v2',
        baseRef: 'origin/develop', baseSha: target.baseSha, from: target.baseSha,
        to: target.headSha,
        axes: {tooling: 'COMPLETE', standards: 'COMPLETE', spec: 'COMPLETE', sast: 'COMPLETE'},
        findings: [], closures: [],
    }, target);

    assert.throws(() => recordReviewAttempt(attempt(target), target), /initial review chain state/);
    const replacement = recordReviewAttempt(attempt(target, {newInitial: true}), target);

    assert.equal(replacement.schemaVersion, 2);
    assert.equal(inspectReviewChainV2(target).state, 'VALID');
});

test('preserves legacy bytes when atomic replacement publication fails', (t) => {
    const target = fixture(t);
    const legacy = recordReviewSegment({
        schemaVersion: 1, kind: 'initial', branch: 'feat/tester-abcd-review-v2',
        baseRef: 'origin/develop', baseSha: target.baseSha, from: target.baseSha,
        to: target.headSha,
        axes: {tooling: 'COMPLETE', standards: 'COMPLETE', spec: 'COMPLETE', sast: 'COMPLETE'},
        findings: [], closures: [],
    }, target);
    const bytes = fs.readFileSync(legacy.path);
    let links = 0;
    const failingFs = new Proxy(fs, {
        get(targetFs, property) {
            if (property === 'linkSync') {
                return (source, destination) => {
                    links += 1;
                    if (links === 2) throw new Error('publication failure');
                    return targetFs.linkSync(source, destination);
                };
            }
            const value = Reflect.get(targetFs, property);
            return typeof value === 'function' ? value.bind(targetFs) : value;
        },
    });

    assert.throws(() => recordReviewAttempt(
        attempt(target, {newInitial: true}),
        {...target, fs: failingFs}
    ));
    assert.deepEqual(fs.readFileSync(legacy.path), bytes);
    assert.equal(inspectReviewChainV2(target).state, 'LEGACY');
});

test('replays aggregate findings and open Blocking state instead of trusting copies', (t) => {
    const mutations = [
        (record) => { record.findings = []; },
        (record) => { record.openBlocking = ['0'.repeat(64)]; },
    ];
    for (const mutate of mutations) {
        const target = fixture(t);
        const recorded = recordReviewAttempt(attempt(target), target);
        const chainPath = path.join(
            target.projectRoot, '.pi', 'prism-tool', 'code-review', 'review-chain.json'
        );
        const changed = structuredClone(recorded);
        mutate(changed);
        fs.writeFileSync(chainPath, `${JSON.stringify(changed)}\n`, {mode: 0o600});
        assert.equal(inspectReviewChainV2(target).state, 'UNSAFE');
    }
});

test('rejects oversized in-memory fields and persisted records', (t) => {
    const target = fixture(t);
    const oversized = structuredClone(attempt(target));
    oversized.report.command = 'x'.repeat(129);
    assert.throws(() => recordReviewAttempt(oversized, target), /command/);

    const directory = path.join(target.projectRoot, '.pi', 'prism-tool', 'code-review');
    fs.mkdirSync(directory, {recursive: true, mode: 0o700});
    fs.chmodSync(directory, 0o700);
    fs.writeFileSync(path.join(directory, 'review-chain.json'), 'x'.repeat(131073), {
        mode: 0o600,
    });
    assert.equal(inspectReviewChainV2(target).state, 'UNSAFE');
});

test('records and verifies one complete engine-authored initial review', (t) => {
    const target = fixture(t);

    const record = recordReviewAttempt(attempt(target), target);

    assert.deepEqual(Object.keys(record), [
        'schemaVersion', 'kind', 'branch', 'baseRef', 'baseSha', 'headSha',
        'criteriaDigest', 'segments', 'findings', 'openBlocking',
    ]);
    assert.equal(record.schemaVersion, 2);
    assert.equal(record.kind, 'review-chain');
    assert.deepEqual(record.segments[0].range, {from: target.baseSha, to: target.headSha});
    assert.deepEqual(record.segments[0].axes.map(({id, status}) => ({id, status})),
        AXES.map((id) => ({id, status: 'COMPLETE'})));
    assert.equal(record.findings.length, 1);
    assert.equal(record.openBlocking.length, 0);
    assert.equal(inspectReviewChainV2(target).state, 'VALID');
    assert.deepEqual(verifyReviewChainV2(expectation(target), target).advisoryFindings,
        record.findings);
});

// vim: ft=javascript sts=4 sw=4 ts=4 et :
