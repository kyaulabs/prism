// $KYAULabs: prism-review-findings.test.js kyau@aura.kyaulabs 2026/09/02 -0700 Exp $

'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const {
    normalizeFindings,
    validateFindingAnchor,
    validateVerifierSubmission,
} = require('../../packages/prism-core/scripts/prism-review/findings');

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
    assert.doesNotThrow(() => validateFindingAnchor(finding({
        line: 3,
        evidence: 'context',
        causality: 'Changed data flow from line 2 reaches this context.',
    }), context));
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
