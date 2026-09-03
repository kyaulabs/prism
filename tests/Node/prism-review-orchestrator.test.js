// $KYAULabs: prism-review-orchestrator.test.js kyau@aura.kyaulabs 2026/09/03 -0700 Exp $

'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');
const test = require('node:test');
const {AXES} = require('../../packages/prism-core/scripts/prism-review/constants');
const {validateFindingAnchor} = require('../../packages/prism-core/scripts/prism-review/findings');
const {
    runAuthoritativeAttempt,
    runReviewAttempt,
} = require('../../packages/prism-core/scripts/prism-review/orchestrator');

const headText = 'first\nchanged value\ncontext\n';
const diffText = 'diff --git a/src/example.php b/src/example.php\n@@ -2 +2 @@\n-old\n+changed value\n';
const entry = Object.freeze({
    entryDigest: 'a'.repeat(64),
    diffDigest: 'b'.repeat(64),
    status: 'M',
    score: null,
    path: 'src/example.php',
    oldPath: 'src/example.php',
    newPath: 'src/example.php',
    oldMode: '100644',
    newMode: '100644',
    oldObjectId: 'c'.repeat(40),
    newObjectId: 'd'.repeat(40),
    kind: 'text',
    modeOnly: false,
    lineCount: Object.freeze({added: 1, deleted: 1}),
    baseText: null,
    headText,
    baseLineStarts: null,
    headLineStarts: Object.freeze([0, 6, 20, 28]),
    diffText,
    baseBytes: 0,
    headBytes: Buffer.byteLength(headText),
    diffBytes: Buffer.byteLength(diffText),
    byteCount: Buffer.byteLength(headText) + Buffer.byteLength(diffText),
    hunks: Object.freeze([Object.freeze({oldStart: 2, oldLines: 1, newStart: 2, newLines: 1})]),
    requiredSides: Object.freeze(['head']),
});
const metadata = Object.freeze({
    ...entry,
    entryDigest: 'e'.repeat(64),
    diffDigest: 'f'.repeat(64),
    status: 'A',
    path: 'asset.bin',
    oldPath: null,
    newPath: 'asset.bin',
    oldMode: null,
    newMode: '100644',
    oldObjectId: null,
    newObjectId: '1'.repeat(40),
    kind: 'binary',
    headText: null,
    headLineStarts: null,
    diffText: '',
    headBytes: 0,
    diffBytes: 0,
    byteCount: 0,
    hunks: Object.freeze([]),
    requiredSides: Object.freeze([]),
});
const snapshot = Object.freeze({
    mode: 'branch',
    baseCommit: '2'.repeat(40),
    headCommit: '3'.repeat(40),
    manifestDigest: '4'.repeat(64),
    diffDigest: '5'.repeat(64),
    manifest: Object.freeze([entry, metadata].map((item) => Object.freeze({
        entryDigest: item.entryDigest,
        path: item.path,
        kind: item.kind,
        diffDigest: item.diffDigest,
        byteCount: item.byteCount,
    }))),
    entries: Object.freeze([entry, metadata]),
});

const axisSkills = {
    'tooling-style': 'skill-tooling',
    'structural-smells': 'skill-structure',
    'requirement-coverage': 'skill-requirements',
    'static-security': 'skill-security',
};
const plan = Object.freeze({
    schemaVersion: 1,
    policyDigest: '6'.repeat(64),
    planDigest: '7'.repeat(64),
    axes: Object.freeze(AXES.map((axis) => Object.freeze({
        id: axis,
        lenses: Object.freeze([
            Object.freeze({id: `core.${axis}`, skill: axisSkills[axis], package: '@kyaulabs/prism-core'}),
            ...(axis === 'static-security'
                ? [Object.freeze({id: 'php.security', skill: 'skill-php', package: '@kyaulabs/prism-php-web'})]
                : []),
        ]),
    }))),
    exemptions: Object.freeze([Object.freeze({
        id: 'metadata.binary',
        kind: 'binary',
        axes: Object.freeze([...AXES]),
        oldPath: null,
        newPath: 'asset.bin',
    })]),
});
const resources = Object.freeze([
    {id: 'prism-review-session', text: 'session'},
    {id: 'prism-review-verifier', text: 'verifier'},
    {id: 'prism-review-false-positive-check', text: 'false positive'},
    ...Object.values(axisSkills).map((id) => ({id, text: id})),
    {id: 'skill-php', text: 'php'},
]);
const model = Object.freeze({
    provider: 'fixture', id: 'model', reasoningLevel: 'high', contextWindow: 200000,
    authentication: 'UNKNOWN',
});
const criteriaSource = Object.freeze({
    role: 'SPEC',
    commit: '8'.repeat(40),
    path: 'docs/specs/example.md',
    blobOid: '9'.repeat(40),
    byteCount: 11,
    sha256: '7e846cb2d6e3ee6bcb3b803b53d49b134b23e974d280d9a164c2f6919db0a7df',
});
const criteria = Object.freeze({
    record: Object.freeze({
        schemaVersion: 1,
        kind: 'criteria',
        branch: 'feat/example',
        disposition: 'DECLARED',
        sources: Object.freeze([criteriaSource]),
    }),
    digest: '8'.repeat(64),
    blobs: Object.freeze([Object.freeze({...criteriaSource, text: 'one € two'})]),
});

async function exposeAll(request) {
    const tools = Object.fromEntries(request.tools.map((tool) => [tool.name, tool]));
    for (const item of request.snapshot.entries) {
        if (item.kind !== 'text') continue;
        for (const side of item.requiredSides) {
            await tools.read_file.execute('read', {
                entryDigest: item.entryDigest,
                side,
                offset: 0,
                limit: side === 'base' ? item.baseBytes : item.headBytes,
            });
        }
        if (item.diffBytes > 0) {
            await tools.read_diff.execute('diff', {
                entryDigest: item.entryDigest,
                offset: 0,
                limit: item.diffBytes,
            });
        }
    }
}

async function exposeCriteria(request) {
    const tool = request.tools.find(({name}) => name === 'read_criteria');
    if (tool === undefined) return;
    for (const source of request.evidence.criteria.sources) {
        let offset = 0;
        while (offset < source.byteCount) {
            const chunk = await tool.execute('criteria', {
                sourceDigest: source.sha256,
                offset,
                limit: 7,
            });
            offset = chunk.nextOffset;
        }
    }
}

function axisSubmission(request, findings = []) {
    return {
        schemaVersion: 1,
        axis: request.axis,
        outcome: findings.some(({classification}) => classification === 'BLOCKING') ? 'BLOCKING' : 'PASS',
        lenses: request.lenses.map(({id}) => ({id, status: 'COMPLETE'})),
        findings,
        notes: [],
    };
}

function options(runSession, overrides = {}) {
    return {
        command: 'review branch',
        sourceClass: 'REVIEWED_WORKTREE',
        snapshot,
        plan,
        resources,
        sessionSkill: 'prism-review-session',
        verifierSkills: ['prism-review-verifier', 'prism-review-false-positive-check'],
        repositoryRoot: path.resolve(__dirname, '../..'),
        runSession,
        assertFresh: () => true,
        ...overrides,
    };
}

function proposed(classification = 'ADVISORY', summary = 'The changed value deserves attention.') {
    return {
        axis: 'tooling-style',
        lensId: 'core.tooling-style',
        classification,
        path: 'src/example.php',
        side: 'head',
        line: 2,
        summary,
        evidence: 'changed value',
        causality: classification === 'BLOCKING' ? 'The changed value reaches the runtime.' : null,
        relevance: classification === 'BLOCKING' ? 'The reviewed change introduced it.' : null,
        workflowImpact: classification === 'BLOCKING' ? 'The runtime result is incorrect.' : null,
    };
}

test('runs four fresh axes in canonical order with complete lenses and byte exposure', async () => {
    const calls = [];
    const runSession = async (request) => {
        calls.push(request);
        assert.deepEqual(request.tools.map(({name}) => name).sort(), ['read_diff', 'read_file']);
        await exposeAll(request);
        return {ok: true, submission: axisSubmission(request), model};
    };

    const report = await runReviewAttempt(options(runSession));

    assert.deepEqual(calls.map(({axis}) => axis), AXES);
    assert.equal(report.outcome, 'PASS');
    assert.equal(report.authoritative, false);
    assert.deepEqual(Object.keys(report), [
        'schemaVersion', 'command', 'authoritative', 'sourceClass', 'outcome', 'scope', 'model',
        'policyDigest', 'planDigest', 'manifestDigest', 'axes', 'byteExposure', 'lenses',
        'exemptions', 'findings', 'verifier', 'limits',
    ]);
    assert.equal(report.byteExposure.length, 2);
    for (const row of report.byteExposure) {
        assert.deepEqual(Object.values(row.axes), row.kind === 'text'
            ? ['EXPOSED', 'EXPOSED', 'EXPOSED', 'EXPOSED']
            : ['EXEMPTED', 'EXEMPTED', 'EXEMPTED', 'EXEMPTED']);
    }
    assert.equal(calls[0].resources.some(({id}) => id === 'skill-php'), false);
    assert.equal(calls[3].resources.some(({id}) => id === 'skill-php'), true);
    assert.equal(calls.every((call) => call.snapshot === snapshot), true);
});

test('rejects authoritative mode through the ad hoc review interface', async () => {
    await assert.rejects(() => runReviewAttempt(options(async () => {
        throw new Error('session must not run');
    }, {authoritative: true, criteria})), /authoritative review interface/i);
});

test('records complete criteria exposure for an authoritative requirement axis', async () => {
    const calls = [];
    const report = await runAuthoritativeAttempt(options(async (request) => {
        calls.push(request);
        await exposeAll(request);
        await exposeCriteria(request);
        return {ok: true, submission: axisSubmission(request), model};
    }, {criteria}));

    assert.equal(report.outcome, 'PASS');
    assert.equal(report.authoritative, true);
    assert.deepEqual(report.criteriaExposure, {
        disposition: 'DECLARED',
        status: 'EXPOSED',
        sources: [criteriaSource],
    });
    assert.deepEqual(calls.filter((request) =>
        request.tools.some(({name}) => name === 'read_criteria')).map(({axis}) => axis),
    ['requirement-coverage']);
    assert.doesNotMatch(JSON.stringify(report), /one € two/);
});

test('accepts NONE_DECLARED authority without criteria source calls', async () => {
    const none = Object.freeze({
        record: Object.freeze({
            schemaVersion: 1,
            kind: 'criteria',
            branch: 'feat/example',
            disposition: 'NONE_DECLARED',
            sources: Object.freeze([]),
        }),
        digest: '8'.repeat(64),
        blobs: Object.freeze([]),
    });
    const report = await runAuthoritativeAttempt(options(async (request) => {
        await exposeAll(request);
        return {ok: true, submission: axisSubmission(request), model};
    }, {criteria: none}));

    assert.equal(report.outcome, 'PASS');
    assert.deepEqual(report.criteriaExposure, {
        disposition: 'NONE_DECLARED',
        status: 'NONE_DECLARED',
        sources: [],
    });
});

test('makes an authoritative requirement submission Inconclusive until criteria are exposed', async () => {
    const calls = [];
    const report = await runAuthoritativeAttempt(options(async (request) => {
        calls.push(request);
        await exposeAll(request);
        return {ok: true, submission: axisSubmission(request), model};
    }, {criteria}));

    assert.equal(report.authoritative, true);
    assert.equal(report.outcome, 'INCONCLUSIVE');
    assert.deepEqual(calls.map(({axis}) => axis), AXES.slice(0, 3));
    assert.equal(calls[0].tools.some(({name}) => name === 'read_criteria'), false);
    assert.equal(calls[1].tools.some(({name}) => name === 'read_criteria'), false);
    assert.equal(calls[2].tools.some(({name}) => name === 'read_criteria'), true);
    assert.deepEqual(calls[2].evidence.criteria, {
        disposition: 'DECLARED',
        sources: [criteriaSource],
    });
    assert.equal(report.axes[2].reason, 'CRITERIA_EXPOSURE_INCOMPLETE');
    assert.deepEqual(report.criteriaExposure, {
        disposition: 'DECLARED',
        status: 'INCOMPLETE',
        sources: [criteriaSource],
    });
    assert.doesNotMatch(JSON.stringify(report), /one € two/);
    assert.doesNotMatch(JSON.stringify(calls[2].evidence), /one € two/);
});

test('rejects premature submission and stops after an Inconclusive axis', async () => {
    const calls = [];
    const report = await runReviewAttempt(options(async (request) => {
        calls.push(request.axis);
        return {ok: true, submission: axisSubmission(request), model};
    }));

    assert.equal(report.outcome, 'INCONCLUSIVE');
    assert.deepEqual(calls, ['tooling-style']);
    assert.equal(report.axes[0].reason, 'BYTE_EXPOSURE_INCOMPLETE');
});

test('rejects malformed axis, lens, outcome, notes, exemptions, and finding counts', async () => {
    const mutations = [
        (submission) => { submission.axis = 'static-security'; },
        (submission) => { submission.lenses.pop(); },
        (submission) => { submission.lenses.push({...submission.lenses[0]}); },
        (submission) => { submission.lenses[0].status = 'UNKNOWN'; },
        (submission) => { submission.outcome = 'UNKNOWN'; },
        (submission) => { submission.notes = Array(17).fill('note'); },
        (submission) => { submission.exemptions = []; },
        (submission) => { submission.findings = Array(65).fill(proposed()); },
    ];
    for (const mutate of mutations) {
        const report = await runReviewAttempt(options(async (request) => {
            await exposeAll(request);
            const submission = axisSubmission(request);
            mutate(submission);
            return {ok: true, submission, model};
        }));
        assert.equal(report.outcome, 'INCONCLUSIVE');
        assert.equal(report.axes.length, 4);
        assert.equal(report.axes.slice(1).every(({status}) => status === 'NOT_RUN'), true);
    }
});

test('fails closed on stale snapshots and failed sessions', async () => {
    let freshness = 0;
    const staleCalls = [];
    const stale = await runReviewAttempt(options(async (request) => {
        staleCalls.push(request.axis);
        await exposeAll(request);
        return {ok: true, submission: axisSubmission(request), model};
    }, {assertFresh: () => { freshness += 1; return freshness < 2; }}));
    assert.equal(stale.outcome, 'INCONCLUSIVE');
    assert.deepEqual(staleCalls, ['tooling-style']);
    assert.equal(stale.axes[0].status, 'INCONCLUSIVE');
    assert.equal(stale.axes[0].reason, 'SNAPSHOT_STALE');

    const failed = await runReviewAttempt(options(async () => ({
        ok: false, outcome: 'INCONCLUSIVE', reason: 'SESSION_TIMEOUT',
    })));
    assert.equal(failed.outcome, 'INCONCLUSIVE');
    assert.equal(failed.axes[0].reason, 'SESSION_TIMEOUT');

    const reasonless = await runReviewAttempt(options(async () => ({ok: false})));
    assert.equal(reasonless.outcome, 'INCONCLUSIVE');
    assert.equal(reasonless.axes[0].reason, 'AXIS_SESSION_FAILED');

    const times = [0, 1, 2, 101];
    const timedCalls = [];
    const timed = await runReviewAttempt(options(async (request) => {
        timedCalls.push(request.axis);
        await exposeAll(request);
        return {ok: true, submission: axisSubmission(request), model};
    }, {
        reviewTimeoutMs: 100,
        now: () => times.shift() ?? 101,
    }));
    assert.equal(timed.outcome, 'INCONCLUSIVE');
    assert.deepEqual(timedCalls, ['tooling-style']);
    assert.equal(timed.axes[1].reason, 'REVIEW_TIMEOUT');
});

test('recomputes the global deadline immediately before an axis session', async () => {
    const times = [0, 1, 50];
    let timeoutMs;
    await runReviewAttempt(options(async (request) => {
        timeoutMs = request.timeoutMs;
        return {ok: false, outcome: 'INCONCLUSIVE', reason: 'SESSION_FAILED'};
    }, {
        timeoutMs: 100,
        reviewTimeoutMs: 100,
        now: () => times.shift() ?? 50,
    }));

    assert.equal(timeoutMs, 50);
});

test('does not start an axis session after the global deadline expires', async () => {
    const times = [0, 1, 101];
    let calls = 0;
    const report = await runReviewAttempt(options(async () => {
        calls += 1;
        throw new Error('session must not start');
    }, {
        timeoutMs: 100,
        reviewTimeoutMs: 100,
        now: () => times.shift() ?? 101,
    }));

    assert.equal(calls, 0);
    assert.equal(report.outcome, 'INCONCLUSIVE');
    assert.equal(report.axes[0].reason, 'REVIEW_TIMEOUT');
});

test('recomputes the global deadline immediately before a verifier session', async () => {
    const times = Array.from({length: 11}, (_value, index) => index);
    let verifierTimeout;
    const report = await runReviewAttempt(options(async (request) => {
        await exposeAll(request);
        if (request.sessionType === 'axis') {
            return {
                ok: true,
                submission: axisSubmission(request, request.axis === 'tooling-style'
                    ? [proposed('ADVISORY')]
                    : []),
                model,
            };
        }
        verifierTimeout = request.timeoutMs;
        return {
            ok: true,
            submission: {
                schemaVersion: 1,
                dispositions: request.findings.map((finding) => ({
                    fingerprint: finding.fingerprint,
                    disposition: 'CONFIRMED',
                    rationale: 'Confirmed against immutable evidence.',
                    duplicateOf: null,
                })),
            },
            model,
        };
    }, {
        timeoutMs: 100,
        reviewTimeoutMs: 100,
        now: () => times.shift() ?? 10,
    }));

    assert.equal(report.outcome, 'PASS');
    assert.equal(verifierTimeout, 90);
});

test('does not start a verifier session after the global deadline expires', async () => {
    const times = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 101];
    let axisCalls = 0;
    let verifierCalls = 0;
    const report = await runReviewAttempt(options(async (request) => {
        await exposeAll(request);
        if (request.sessionType === 'verifier') {
            verifierCalls += 1;
            throw new Error('verifier must not start');
        }
        axisCalls += 1;
        return {
            ok: true,
            submission: axisSubmission(request, request.axis === 'tooling-style'
                ? [proposed('ADVISORY')]
                : []),
            model,
        };
    }, {
        timeoutMs: 100,
        reviewTimeoutMs: 100,
        now: () => times.shift() ?? 101,
    }));

    assert.equal(axisCalls, 4);
    assert.equal(verifierCalls, 0);
    assert.equal(report.outcome, 'INCONCLUSIVE');
    assert.equal(report.verifier.complete, false);
});

test('verifies canonical chunks, drops rejected findings, and keeps confirmed Blocking', async () => {
    const findings = [proposed('BLOCKING', 'Blocking changed behavior.')];
    for (let index = 0; index < 17; index += 1) {
        findings.push(proposed('ADVISORY', `Advisory finding ${index}.`));
    }
    const verifierChunks = [];
    const report = await runReviewAttempt(options(async (request) => {
        await exposeAll(request);
        if (request.sessionType === 'axis') {
            return {
                ok: true,
                submission: axisSubmission(request, request.axis === 'tooling-style' ? findings : []),
                model,
            };
        }
        verifierChunks.push(request.findings.map(({fingerprint}) => fingerprint));
        return {
            ok: true,
            submission: {
                schemaVersion: 1,
                dispositions: request.findings.map((finding) => ({
                    fingerprint: finding.fingerprint,
                    disposition: finding.classification === 'BLOCKING' ? 'CONFIRMED' : 'REJECTED',
                    rationale: 'Checked against immutable evidence.',
                    duplicateOf: null,
                })),
            },
            model,
        };
    }));

    assert.deepEqual(verifierChunks.map((chunk) => chunk.length), [16, 2]);
    assert.equal(report.outcome, 'BLOCKING');
    assert.equal(report.findings.length, 1);
    assert.equal(report.findings[0].classification, 'BLOCKING');
    assert.equal(report.verifier.complete, true);
});

test('merges verifier-confirmed duplicates deterministically without promotion', async () => {
    const duplicateFindings = [
        proposed('ADVISORY', 'Primary advisory claim.'),
        proposed('ADVISORY', 'Equivalent advisory wording.'),
    ];
    const report = await runReviewAttempt(options(async (request) => {
        await exposeAll(request);
        if (request.sessionType === 'axis') {
            return {
                ok: true,
                submission: axisSubmission(request, request.axis === 'tooling-style' ? duplicateFindings : []),
                model,
            };
        }
        const [primary, duplicate] = request.findings;
        return {
            ok: true,
            submission: {
                schemaVersion: 1,
                dispositions: [
                    {
                        fingerprint: primary.fingerprint,
                        disposition: 'CONFIRMED',
                        rationale: 'This is the canonical claim.',
                        duplicateOf: null,
                    },
                    {
                        fingerprint: duplicate.fingerprint,
                        disposition: 'DUPLICATE',
                        rationale: 'This repeats the canonical claim.',
                        duplicateOf: primary.fingerprint,
                    },
                ],
            },
            model,
        };
    }));

    assert.equal(report.outcome, 'PASS');
    assert.equal(report.findings.length, 1);
    assert.equal(report.findings[0].fingerprint, report.verifier.dispositions[0].fingerprint);
});

test('reviews repair context on every axis and confirms closures in a fresh session', async () => {
    const prior = validateFindingAnchor(proposed('BLOCKING', 'Prior blocking behavior.'), {
        snapshot,
        axis: 'tooling-style',
        lensIds: ['core.tooling-style'],
    });
    const closure = {
        fingerprint: prior.fingerprint,
        evidence: 'The focused regression now passes.',
        tests: [{path: 'tests/Node/example.test.js', gateId: 'php-web.node-tests'}],
    };
    const repair = {
        priorOpenBlocking: [prior],
        proposals: [closure],
        check: {
            digest: '8'.repeat(64),
            headSha: snapshot.headCommit,
            gates: [{id: 'php-web.node-tests', status: 'PASS'}],
        },
    };
    const calls = [];
    const result = await runAuthoritativeAttempt(options(async (request) => {
        calls.push(request);
        await exposeAll(request);
        if (request.sessionType === 'closure-verifier') {
            return {
                ok: true,
                submission: {
                    schemaVersion: 1,
                    dispositions: [{
                        fingerprint: prior.fingerprint,
                        disposition: 'CONFIRMED',
                        rationale: 'The complete repair delta removes the failure path.',
                    }],
                },
                model,
            };
        }
        return {ok: true, submission: axisSubmission(request), model};
    }, {criteria: {
        record: {schemaVersion: 1, kind: 'criteria', branch: 'feat/example',
            disposition: 'NONE_DECLARED', sources: []},
        digest: '8'.repeat(64),
        blobs: [],
    }, repair}));

    assert.equal(result.report.outcome, 'PASS');
    assert.equal(calls.filter(({sessionType}) => sessionType === 'axis').length, 4);
    assert.equal(calls.filter(({sessionType}) => sessionType === 'axis').every((request) =>
        request.evidence.repair === repair), true);
    const verifier = calls.at(-1);
    assert.equal(verifier.sessionType, 'closure-verifier');
    assert.equal(verifier.evidence.repair, repair);
    assert.equal(verifier.snapshot, snapshot);
    assert.deepEqual(result.closures, [{...closure,
        disposition: 'CONFIRMED',
        rationale: 'The complete repair delta removes the failure path.',
    }]);
});

test('keeps rejected closures open and makes uncertain or incomplete closure review Inconclusive', async () => {
    const prior = validateFindingAnchor(proposed('BLOCKING', 'Prior blocking behavior.'), {
        snapshot,
        axis: 'tooling-style',
        lensIds: ['core.tooling-style'],
    });
    for (const disposition of ['REJECTED', 'NEEDS_CONTEXT', 'INVALID_LOCATION', 'FAILED', 'NO_EXPOSURE']) {
        const repair = {
            priorOpenBlocking: [prior],
            proposals: [{fingerprint: prior.fingerprint, evidence: 'A regression passes.',
                tests: [{path: 'tests/Node/example.test.js', gateId: 'php-web.node-tests'}]}],
            check: {digest: '8'.repeat(64), headSha: snapshot.headCommit,
                gates: [{id: 'php-web.node-tests', status: 'PASS'}]},
        };
        const result = await runAuthoritativeAttempt(options(async (request) => {
            if (disposition !== 'NO_EXPOSURE' || request.sessionType !== 'closure-verifier') {
                await exposeAll(request);
            }
            if (request.sessionType !== 'closure-verifier') {
                return {ok: true, submission: axisSubmission(request), model};
            }
            if (disposition === 'FAILED') return {ok: false, reason: 'SESSION_FAILED'};
            if (disposition === 'NO_EXPOSURE') return {ok: true, submission: {schemaVersion: 1,
                dispositions: [{fingerprint: prior.fingerprint, disposition: 'CONFIRMED',
                    rationale: 'Claims closure without reading the complete repair.'}]}, model};
            return {ok: true, submission: {schemaVersion: 1, dispositions: [{
                fingerprint: prior.fingerprint, disposition,
                rationale: 'The supplied evidence has this disposition.',
            }]}, model};
        }, {criteria: {
            record: {schemaVersion: 1, kind: 'criteria', branch: 'feat/example',
                disposition: 'NONE_DECLARED', sources: []}, digest: '8'.repeat(64), blobs: [],
        }, repair}));

        if (disposition === 'REJECTED') {
            assert.equal(result.report.outcome, 'PASS');
            assert.equal(result.closures[0].disposition, 'REJECTED');
        } else {
            assert.equal(result.report.outcome, 'INCONCLUSIVE');
            assert.deepEqual(result.closures, []);
        }
    }
});

test('makes an incomplete verifier session Inconclusive', async () => {
    const report = await runReviewAttempt(options(async (request) => {
        await exposeAll(request);
        if (request.sessionType === 'verifier') {
            return {ok: false, outcome: 'INCONCLUSIVE', reason: 'SESSION_TIMEOUT'};
        }
        return {
            ok: true,
            submission: axisSubmission(request, request.axis === 'tooling-style'
                ? [proposed('BLOCKING', 'Verifier timeout candidate.')]
                : []),
            model,
        };
    }));

    assert.equal(report.outcome, 'INCONCLUSIVE');
    assert.equal(report.verifier.complete, false);
});

test('makes uncertain Blocking verification Inconclusive', async () => {
    const report = await runReviewAttempt(options(async (request) => {
        await exposeAll(request);
        if (request.sessionType === 'axis') {
            return {
                ok: true,
                submission: axisSubmission(request, request.axis === 'tooling-style'
                    ? [proposed('BLOCKING', 'Possible blocking issue.')]
                    : []),
                model,
            };
        }
        return {
            ok: true,
            submission: {
                schemaVersion: 1,
                dispositions: request.findings.map((finding) => ({
                    fingerprint: finding.fingerprint,
                    disposition: 'NEEDS_CONTEXT',
                    rationale: 'More immutable context is required.',
                    duplicateOf: null,
                })),
            },
            model,
        };
    }));

    assert.equal(report.outcome, 'INCONCLUSIVE');
    assert.deepEqual(report.findings, []);
});

// vim: ft=javascript sts=4 sw=4 ts=4 et :
