// $KYAULabs: legacy-review-chain.js kyau@aura.kyaulabs 2026/09/08 -0700 Exp $

'use strict';

const crypto = require('node:crypto');

const SHA_RE = /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/;
const BRANCH_RE = /^[A-Za-z0-9][A-Za-z0-9._/-]*$/;
const FINGERPRINT_RE = /^[0-9a-f]{64}$/;
const AXES = Object.freeze(['tooling', 'standards', 'spec', 'sast']);
const AXIS_STATUS = new Set(['COMPLETE', 'COMPLETE_NO_SPEC']);
const CLASSIFICATION = new Set(['BLOCKING', 'ADVISORY']);

class ReviewChainError extends Error {}

function hasControl(value) {
    return [...value].some((character) => {
        const code = character.charCodeAt(0);
        return code < 32 && code !== 9 && code !== 10 && code !== 13 || code === 127;
    });
}

function text(value, label, limit = 1024) {
    if (typeof value !== 'string' || value.length === 0 || Buffer.byteLength(value) > limit || hasControl(value)) {
        throw new ReviewChainError(`${label} is invalid`);
    }
    return value;
}

function exactKeys(value, keys, label) {
    if (value === null || Array.isArray(value) || typeof value !== 'object' ||
        Object.keys(value).sort().join(',') !== [...keys].sort().join(',')) {
        throw new ReviewChainError(`${label} schema is invalid`);
    }
}

function findingFingerprint(finding) {
    return crypto.createHash('sha256').update([
        finding.axis,
        finding.path,
        String(finding.line),
        finding.summary,
    ].join('\n')).digest('hex');
}

function validateAxes(value) {
    exactKeys(value, AXES, 'review axes');
    for (const axis of AXES) {
        const exempt = axis === 'tooling' && value[axis] === 'COMPLETE_NO_OCR';
        if (!AXIS_STATUS.has(value[axis]) && !exempt) {
            throw new ReviewChainError('review axis is incomplete');
        }
    }
    return {...value};
}

function validateFinding(value) {
    const common = ['axis', 'path', 'line', 'summary', 'classification'];
    const blocking = [...common, 'causality', 'impact', 'evidence'];
    if (value?.classification === 'BLOCKING') exactKeys(value, blocking, 'Blocking finding');
    else exactKeys(value, common, 'Advisory finding');
    if (!AXES.includes(value.axis) || !CLASSIFICATION.has(value.classification)) {
        throw new ReviewChainError('finding classification is invalid');
    }
    if (!Number.isInteger(value.line) || value.line < 0) throw new ReviewChainError('finding line is invalid');
    const finding = {
        axis: value.axis,
        path: text(value.path, 'finding path', 1024),
        line: value.line,
        summary: text(value.summary, 'finding summary', 2048),
        classification: value.classification,
    };
    if (value.classification === 'BLOCKING') {
        finding.causality = text(value.causality, 'finding causality', 2048);
        finding.impact = text(value.impact, 'finding impact', 2048);
        finding.evidence = text(value.evidence, 'finding evidence', 4096);
    }
    finding.fingerprint = findingFingerprint(finding);
    return finding;
}

function validateStoredFinding(value) {
    const common = ['state', 'fingerprint', 'axis', 'path', 'line', 'summary', 'classification'];
    const blocking = [...common, 'causality', 'impact', 'evidence'];
    const keys = value?.classification === 'BLOCKING' ? blocking : common;
    if (value?.state === 'CLOSED') keys.push('closureEvidence');
    exactKeys(value, keys, 'stored finding');
    if (!['OPEN', 'CLOSED'].includes(value.state) || !FINGERPRINT_RE.test(value.fingerprint)) {
        throw new ReviewChainError('stored finding state is invalid');
    }
    const {state, fingerprint, closureEvidence, ...input} = value;
    const finding = validateFinding(input);
    if (finding.fingerprint !== fingerprint) throw new ReviewChainError('stored finding fingerprint is invalid');
    if (state === 'CLOSED') text(closureEvidence, 'closure evidence', 4096);
    return value;
}

function validateStoredSegmentFinding(value) {
    if (value === null || Array.isArray(value) || typeof value !== 'object' || !FINGERPRINT_RE.test(value.fingerprint)) {
        throw new ReviewChainError('stored segment finding is invalid');
    }
    const {fingerprint, ...input} = value;
    const finding = validateFinding(input);
    if (finding.fingerprint !== fingerprint) throw new ReviewChainError('stored segment finding fingerprint is invalid');
    return value;
}

function validateStoredSegment(segment) {
    exactKeys(segment, [
        'schemaVersion', 'kind', 'branch', 'baseRef', 'baseSha', 'from', 'to',
        'axes', 'findings', 'closures',
    ], 'stored review segment');
    if (segment.schemaVersion !== 1 || !['initial', 'repair'].includes(segment.kind) ||
        !BRANCH_RE.test(segment.branch) || !/^origin\/(?:develop|main)$/.test(segment.baseRef) ||
        !SHA_RE.test(segment.baseSha) || !SHA_RE.test(segment.from) || !SHA_RE.test(segment.to) ||
        !Array.isArray(segment.findings) || !Array.isArray(segment.closures)) {
        throw new ReviewChainError('stored review segment is invalid');
    }
    validateAxes(segment.axes);
    segment.findings.forEach(validateStoredSegmentFinding);
    segment.closures.forEach((closure) => {
        exactKeys(closure, ['fingerprint', 'evidence'], 'stored finding closure');
        if (!FINGERPRINT_RE.test(closure.fingerprint)) throw new ReviewChainError('stored closure fingerprint is invalid');
        text(closure.evidence, 'stored closure evidence', 4096);
    });
    return segment;
}

function replayStoredSegments(record) {
    let prior = record.baseSha;
    let findings = [];
    const fingerprints = new Set();
    for (const [index, segmentValue] of record.segments.entries()) {
        const segment = validateStoredSegment(segmentValue);
        const expectedKind = index === 0 ? 'initial' : 'repair';
        if (segment.kind !== expectedKind || segment.branch !== record.branch ||
            segment.baseRef !== record.baseRef || segment.baseSha !== record.baseSha ||
            segment.from !== prior || index === 0 && segment.from !== record.baseSha) {
            throw new ReviewChainError('stored review history is discontinuous');
        }
        const closures = new Map();
        for (const closure of segment.closures) {
            if (segment.kind !== 'repair' || closures.has(closure.fingerprint) ||
                !findings.some(({fingerprint, state}) => fingerprint === closure.fingerprint && state === 'OPEN')) {
                throw new ReviewChainError('stored finding closure is invalid');
            }
            closures.set(closure.fingerprint, closure.evidence);
        }
        findings = findings.map((finding) => closures.has(finding.fingerprint)
            ? {...finding, state: 'CLOSED', closureEvidence: closures.get(finding.fingerprint)}
            : finding);
        for (const finding of segment.findings) {
            if (fingerprints.has(finding.fingerprint)) {
                throw new ReviewChainError('stored finding fingerprints contain duplicates');
            }
            fingerprints.add(finding.fingerprint);
            findings.push({state: 'OPEN', ...finding});
        }
        prior = segment.to;
    }
    if (record.segments.length === 0 || prior !== record.headSha) {
        throw new ReviewChainError('stored review history is discontinuous');
    }
    return findings;
}

function validateRecordShape(record) {
    exactKeys(record, [
        'schemaVersion', 'branch', 'baseRef', 'baseSha', 'headSha', 'segments',
        'findings', 'openBlocking',
    ], 'review chain');
    if (record.schemaVersion !== 1 || !BRANCH_RE.test(record.branch) ||
        !/^origin\/(?:develop|main)$/.test(record.baseRef) || !SHA_RE.test(record.baseSha) ||
        !SHA_RE.test(record.headSha) || !Array.isArray(record.segments) ||
        !Array.isArray(record.findings) || !Array.isArray(record.openBlocking)) {
        throw new ReviewChainError('review chain schema is invalid');
    }
    const findings = record.findings.map(validateStoredFinding);
    const replayed = replayStoredSegments(record);
    if (JSON.stringify(replayed) !== JSON.stringify(findings)) {
        throw new ReviewChainError('review chain findings are inconsistent');
    }
    const openBlocking = findings
        .filter(({classification, state}) => classification === 'BLOCKING' && state === 'OPEN')
        .map(({fingerprint}) => fingerprint);
    if (JSON.stringify(openBlocking) !== JSON.stringify(record.openBlocking)) {
        throw new ReviewChainError('review chain blocking state is inconsistent');
    }
}

module.exports = {validateRecordShape};

// vim: ft=javascript sts=4 sw=4 ts=4 et :
