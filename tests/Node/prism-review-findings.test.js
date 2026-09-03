// $KYAULabs: prism-review-findings.test.js kyau@aura.kyaulabs 2026/09/03 -0700 Exp $

'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const {
    normalizeFindings,
    validateClosureProposal,
    validateClosureSubmission,
    validateFindingAnchor,
    validateVerifierSubmission,
} = require('../../packages/prism-core/scripts/prism-review/findings');
const {closureSubmissionSchema} = require('../../packages/prism-core/scripts/prism-review/schema');

const entry = Object.freeze({
    entryDigest: 'a'.repeat(64),
    status: 'M',
    path: 'src/example.js',
    oldPath: 'src/example.js',
    newPath: 'src/example.js',
    kind: 'text',
    baseText: 'first\nold value\ncontext\n',
    headText: 'first\nnew value\ncontext\n',
    baseLineStarts: Object.freeze([0, 6, 16, 24]),
    headLineStarts: Object.freeze([0, 6, 16, 24]),
    hunks: Object.freeze([Object.freeze({oldStart: 2, oldLines: 1, newStart: 2, newLines: 1})]),
});
const metadata = Object.freeze({
    entryDigest: 'b'.repeat(64),
    status: 'A',
    path: 'asset.bin',
    oldPath: null,
    newPath: 'asset.bin',
    kind: 'binary',
    baseText: null,
    headText: null,
    baseLineStarts: null,
    headLineStarts: null,
    hunks: Object.freeze([]),
});
const snapshot = Object.freeze({entries: Object.freeze([entry, metadata])});

function finding(overrides = {}) {
    return {
        axis: 'tooling-style',
        lensId: 'core.tooling-style',
        classification: 'BLOCKING',
        path: 'src/example.js',
        side: 'head',
        line: 2,
        summary: 'The changed assignment breaks the runtime.',
        evidence: 'new value',
        causality: 'The changed value reaches the runtime branch.',
        relevance: 'The reviewed change introduced this assignment.',
        workflowImpact: 'The runtime returns an incorrect result.',
        ...overrides,
    };
}

const context = {
    snapshot,
    axis: 'tooling-style',
    lensIds: ['core.tooling-style', 'core.readability'],
};

test('normalizes a finding anchored to immutable changed source', () => {
    const normalized = validateFindingAnchor(finding(), context);

    assert.equal(normalized.changedLine, true);
    assert.match(normalized.fingerprint, /^[0-9a-f]{64}$/);
    assert.equal(normalized.entryDigest, entry.entryDigest);
});

test('permits advisory context but requires a changed-flow explanation for contextual Blocking', () => {
    const advisory = validateFindingAnchor(finding({
        classification: 'ADVISORY',
        line: 3,
        evidence: 'context',
        causality: null,
        relevance: null,
        workflowImpact: null,
    }), context);
    assert.equal(advisory.changedLine, false);

    assert.throws(() => validateFindingAnchor(finding({
        line: 3,
        evidence: 'context',
        causality: 'General concern without a changed anchor.',
    }), context), /changed data flow/i);
    assert.throws(() => validateFindingAnchor(finding({
        line: 3,
        evidence: 'context',
        causality: 'Changed data flow from head line 2 reaches this context.',
    }), context), /changed data flow/i);
    assert.doesNotThrow(() => validateFindingAnchor(finding({
        line: 3,
        evidence: 'context',
        causality: 'Changed data flow from head line 2 to head line 3.',
    }), context));
});

test('does not treat metadata-only rename content as changed', () => {
    const renamedEntry = Object.freeze({
        ...entry,
        status: 'R',
        oldPath: 'src/old.js',
        newPath: 'src/new.js',
        baseText: 'first\nsame value\ncontext\n',
        headText: 'first\nsame value\ncontext\n',
        hunks: Object.freeze([]),
    });

    assert.throws(() => validateFindingAnchor(finding({
        path: 'src/new.js',
        evidence: 'same value',
        causality: 'The file was renamed without a source change.',
    }), {...context, snapshot: {entries: [renamedEntry, metadata]}}), /changed data flow/i);
});

test('binds contextual Blocking explanations to the anchored side', () => {
    const movedEntry = Object.freeze({
        ...entry,
        headText: 'first\ninserted\nnew value\ncontext\n',
        headLineStarts: Object.freeze([0, 6, 15, 25, 33]),
        hunks: Object.freeze([Object.freeze({oldStart: 2, oldLines: 1, newStart: 3, newLines: 1})]),
    });
    assert.throws(() => validateFindingAnchor(finding({
        line: 4,
        evidence: 'context',
        causality: 'Changed data flow from line 2 reaches this context.',
    }), {...context, snapshot: {entries: [movedEntry, metadata]}}), /changed data flow/i);
});

test('rejects an ambiguous base-side copy anchor', () => {
    const firstCopy = Object.freeze({
        ...entry,
        status: 'C',
        oldPath: 'src/source.js',
        newPath: 'src/first.js',
    });
    const secondCopy = Object.freeze({
        ...firstCopy,
        entryDigest: 'c'.repeat(64),
        newPath: 'src/second.js',
    });

    assert.throws(() => validateFindingAnchor(finding({
        path: 'src/source.js',
        side: 'base',
        evidence: 'old value',
    }), {...context, snapshot: {entries: [firstCopy, secondCopy]}}), /ambiguous/);
});

test('rejects stale paths, wrong sides, invalid lines, snippets, and metadata anchors', () => {
    const invalid = [
        finding({path: 'src/missing.js'}),
        finding({side: 'base', path: 'new-only.js'}),
        finding({line: 0}),
        finding({line: 99}),
        finding({evidence: 'not in the line'}),
        finding({path: 'asset.bin', side: 'head', line: 1, evidence: 'asset'}),
        finding({evidence: 'x'.repeat(1025)}),
    ];
    for (const candidate of invalid) {
        assert.throws(() => validateFindingAnchor(candidate, context));
    }
});

test('requires exact finding fields and Blocking causal evidence', () => {
    assert.throws(() => validateFindingAnchor({...finding(), invented: true}, context));
    for (const key of ['causality', 'relevance', 'workflowImpact']) {
        assert.throws(() => validateFindingAnchor(finding({[key]: ''}), context), undefined, key);
    }
    assert.throws(() => validateFindingAnchor(finding({classification: 'ADVISORY'}), context));
    assert.doesNotThrow(() => validateFindingAnchor(finding({
        classification: 'SUGGESTED',
        causality: null,
        relevance: null,
        workflowImpact: null,
    }), context));
});

test('fingerprints include axis, lens, anchor, class, and summary and reject duplicates', () => {
    const first = validateFindingAnchor(finding(), context);
    for (const replacement of [
        {axis: 'structural-smells'},
        {lensId: 'core.readability'},
        {side: 'base', evidence: 'old value'},
        {line: 3, evidence: 'context', classification: 'ADVISORY', causality: null, relevance: null, workflowImpact: null},
        {summary: 'A different summary.'},
    ]) {
        const alternateContext = replacement.axis === undefined
            ? context
            : {...context, axis: replacement.axis, lensIds: ['core.tooling-style']};
        const changed = validateFindingAnchor(finding(replacement), alternateContext);
        assert.notEqual(changed.fingerprint, first.fingerprint);
    }
    assert.throws(() => normalizeFindings([finding(), finding()], context), /duplicate/i);
});

test('validates closed repair closure proposals and dispositions', () => {
    const proposal = {
        schemaVersion: 1,
        closures: [{
            fingerprint: 'f'.repeat(64),
            evidence: 'The focused regression now passes.',
            tests: [{path: 'tests/Node/example.test.js', gateId: 'php-web.node-tests'}],
        }],
    };
    const normalized = validateClosureProposal(proposal);
    assert.deepEqual(normalized, proposal);
    const outputSchema = closureSubmissionSchema([proposal.closures[0].fingerprint]);
    assert.equal(outputSchema.additionalProperties, false);
    assert.deepEqual(outputSchema.properties.dispositions.items.properties.disposition.enum,
        ['CONFIRMED', 'REJECTED', 'NEEDS_CONTEXT', 'INVALID_LOCATION']);
    const submission = {
        schemaVersion: 1,
        dispositions: [{
            fingerprint: proposal.closures[0].fingerprint,
            disposition: 'CONFIRMED',
            rationale: 'The repair removes the previously reachable failure.',
        }],
    };
    assert.deepEqual(validateClosureSubmission(submission, normalized.closures), submission);

    for (const mutation of [
        (value) => { value.invented = true; },
        (value) => { value.closures[0].fingerprint = 'invalid'; },
        (value) => { value.closures[0].tests[0].path = '/tmp/example.test.js'; },
        (value) => { value.closures[0].tests[0].gateId = 'Unknown Gate'; },
        (value) => { value.closures.push(structuredClone(value.closures[0])); },
    ]) {
        const copy = structuredClone(proposal);
        mutation(copy);
        assert.throws(() => validateClosureProposal(copy));
    }
    for (const disposition of ['REJECTED', 'NEEDS_CONTEXT', 'INVALID_LOCATION']) {
        const copy = structuredClone(submission);
        copy.dispositions[0].disposition = disposition;
        assert.doesNotThrow(() => validateClosureSubmission(copy, normalized.closures));
    }
    const missing = structuredClone(submission);
    missing.dispositions = [];
    assert.throws(() => validateClosureSubmission(missing, normalized.closures));
});

test('validates exact verifier dispositions for every supplied fingerprint', () => {
    const findings = normalizeFindings([finding(), finding({
        classification: 'ADVISORY',
        summary: 'Context could be clearer.',
        causality: null,
        relevance: null,
        workflowImpact: null,
    })], context);
    const submission = {
        schemaVersion: 1,
        dispositions: [
            {fingerprint: findings[0].fingerprint, disposition: 'CONFIRMED', rationale: 'Confirmed.', duplicateOf: null},
            {fingerprint: findings[1].fingerprint, disposition: 'REJECTED', rationale: 'Not reproducible.', duplicateOf: null},
        ],
    };

    assert.deepEqual(validateVerifierSubmission(submission, findings), submission);
    for (const mutation of [
        (value) => { value.dispositions.pop(); },
        (value) => { value.dispositions[0].disposition = 'MAYBE'; },
        (value) => { value.dispositions.push({...value.dispositions[0]}); },
        (value) => { value.dispositions[0].duplicateOf = findings[1].fingerprint; },
        (value) => { value.extra = true; },
    ]) {
        const copy = structuredClone(submission);
        mutation(copy);
        assert.throws(() => validateVerifierSubmission(copy, findings));
    }
    const severityPromotion = structuredClone(submission);
    severityPromotion.dispositions[0] = {
        fingerprint: findings[0].fingerprint,
        disposition: 'DUPLICATE',
        rationale: 'Claims to duplicate a lower severity.',
        duplicateOf: findings[1].fingerprint,
    };
    assert.throws(() => validateVerifierSubmission(severityPromotion, findings));
});

// vim: ft=javascript sts=4 sw=4 ts=4 et :
