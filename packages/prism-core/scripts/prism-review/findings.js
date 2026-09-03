// $KYAULabs: findings.js kyau@aura.kyaulabs 2026/09/03 -0700 Exp $

'use strict';

const {AXES, FINDING_CLASS} = require('./constants');
const {digestJson} = require('./canonical-json');
const {safeRelativePath} = require('./schema');

const FINDING_KEYS = Object.freeze([
    'axis', 'lensId', 'classification', 'path', 'side', 'line', 'summary', 'evidence',
    'causality', 'relevance', 'workflowImpact',
]);
const DISPOSITIONS = new Set(['CONFIRMED', 'REJECTED', 'NEEDS_CONTEXT', 'INVALID_LOCATION', 'DUPLICATE']);
const CLOSURE_DISPOSITIONS = new Set(['CONFIRMED', 'REJECTED', 'NEEDS_CONTEXT', 'INVALID_LOCATION']);
const DIGEST = /^[0-9a-f]{64}$/;
const ID = /^[a-z0-9]+(?:[.-][a-z0-9]+)*$/;

function exact(value, keys, label) {
    if (value === null || typeof value !== 'object' || Array.isArray(value) ||
        Object.getPrototypeOf(value) !== Object.prototype || Object.keys(value).length !== keys.length ||
        keys.some((key) => !Object.hasOwn(value, key))) {
        throw new Error(`${label} is invalid`);
    }
}

function bounded(value, label, maximum, multiline = true) {
    if (typeof value !== 'string' || value.length === 0 ||
        /[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/.test(value) ||
        (!multiline && /[\r\n]/.test(value)) || Buffer.byteLength(value, 'utf8') > maximum) {
        throw new Error(`${label} is invalid`);
    }
    return value;
}

function anchoredEntry(finding, snapshot) {
    const matches = snapshot.entries.filter((entry) => entry.kind === 'text' && (
        (finding.side === 'base' && entry.oldPath === finding.path && typeof entry.baseText === 'string') ||
        (finding.side === 'head' && entry.newPath === finding.path && typeof entry.headText === 'string')
    ));
    if (matches.length > 1) throw new Error('finding path or side is ambiguous');
    return matches[0];
}

function sourceLine(entry, side, line) {
    const value = side === 'base' ? entry.baseText : entry.headText;
    const lines = value.split('\n');
    if (value.endsWith('\n')) lines.pop();
    if (line < 1 || line > lines.length) throw new Error('finding line is invalid');
    return lines[line - 1];
}

function changedLine(entry, side, line) {
    return entry.hunks.some((hunk) => {
        const start = side === 'base' ? hunk.oldStart : hunk.newStart;
        const length = side === 'base' ? hunk.oldLines : hunk.newLines;
        return length > 0 && line >= start && line < start + length;
    });
}

function changedFlowExplanation(entry, side, findingLine, causality) {
    const references = [...causality.matchAll(
        /changed data flow from (base|head) line (\d+) to (base|head) line (\d+)/gi
    )];
    return references.some((match) => {
        const sourceSide = match[1].toLowerCase();
        const sourceLine = Number(match[2]);
        const targetSide = match[3].toLowerCase();
        const targetLine = Number(match[4]);
        if (sourceSide !== side || targetSide !== side || targetLine !== findingLine) return false;
        return entry.hunks.some((hunk) => {
            const start = side === 'base' ? hunk.oldStart : hunk.newStart;
            const length = side === 'base' ? hunk.oldLines : hunk.newLines;
            return length > 0 && sourceLine >= start && sourceLine < start + length;
        });
    });
}

function validateFindingAnchor(value, context) {
    exact(value, FINDING_KEYS, 'finding');
    if (!AXES.includes(value.axis) || value.axis !== context.axis ||
        !Array.isArray(context.lensIds) || !context.lensIds.includes(value.lensId) ||
        !Object.values(FINDING_CLASS).includes(value.classification) ||
        !['base', 'head'].includes(value.side) || !Number.isSafeInteger(value.line) || value.line < 1) {
        throw new Error('finding anchor is invalid');
    }
    bounded(value.path, 'finding path', 1024, false);
    bounded(value.lensId, 'finding lens', 128, false);
    bounded(value.summary, 'finding summary', 512);
    bounded(value.evidence, 'finding evidence', 1024, false);
    const blocking = value.classification === FINDING_CLASS.BLOCKING;
    for (const key of ['causality', 'relevance', 'workflowImpact']) {
        if (blocking) bounded(value[key], `finding ${key}`, 2048);
        else if (value[key] !== null) throw new Error(`finding ${key} is invalid`);
    }
    const entry = anchoredEntry(value, context.snapshot);
    if (entry === undefined) throw new Error('finding path or side is stale');
    const lineText = sourceLine(entry, value.side, value.line);
    if (!lineText.includes(value.evidence)) throw new Error('finding snippet does not match immutable source');
    const isChanged = changedLine(entry, value.side, value.line);
    if (blocking && !isChanged &&
        !changedFlowExplanation(entry, value.side, value.line, value.causality)) {
        throw new Error('Blocking context lacks a changed data flow anchor');
    }
    const fingerprint = digestJson({
        axis: value.axis,
        lensId: value.lensId,
        path: value.path,
        side: value.side,
        line: value.line,
        classification: value.classification,
        summary: value.summary,
    });
    return Object.freeze({...value, entryDigest: entry.entryDigest, changedLine: isChanged, fingerprint});
}

function normalizeFindings(values, context) {
    if (!Array.isArray(values)) throw new Error('findings are invalid');
    const normalized = values.map((value) => validateFindingAnchor(value, context));
    const fingerprints = normalized.map(({fingerprint}) => fingerprint);
    if (new Set(fingerprints).size !== fingerprints.length) throw new Error('duplicate finding fingerprint');
    return Object.freeze(normalized);
}

function validateClosureProposal(value) {
    exact(value, ['schemaVersion', 'closures'], 'closure proposal');
    if (value.schemaVersion !== 1 || !Array.isArray(value.closures) || value.closures.length === 0 ||
        value.closures.length > 32) throw new Error('closure proposal is invalid');
    const fingerprints = new Set();
    const closures = value.closures.map((closure) => {
        exact(closure, ['fingerprint', 'evidence', 'tests'], 'closure proposal entry');
        if (!DIGEST.test(closure.fingerprint) || fingerprints.has(closure.fingerprint) ||
            !Array.isArray(closure.tests) || closure.tests.length === 0 || closure.tests.length > 32) {
            throw new Error('closure proposal entry is invalid');
        }
        fingerprints.add(closure.fingerprint);
        bounded(closure.evidence, 'closure evidence', 4096);
        const seen = new Set();
        const tests = closure.tests.map((item) => {
            exact(item, ['path', 'gateId'], 'closure test');
            safeRelativePath(item.path, 'closure test path');
            if (!ID.test(item.gateId ?? '') || seen.has(`${item.path}\0${item.gateId}`)) {
                throw new Error('closure test is invalid');
            }
            seen.add(`${item.path}\0${item.gateId}`);
            return {...item};
        });
        return {...closure, tests};
    });
    return {schemaVersion: 1, closures};
}

function validateClosureSubmission(value, proposals) {
    exact(value, ['schemaVersion', 'dispositions'], 'closure submission');
    if (value.schemaVersion !== 1 || !Array.isArray(proposals) || !Array.isArray(value.dispositions) ||
        value.dispositions.length !== proposals.length) throw new Error('closure submission is invalid');
    const expected = new Set(proposals.map(({fingerprint}) => fingerprint));
    const seen = new Set();
    for (const row of value.dispositions) {
        exact(row, ['fingerprint', 'disposition', 'rationale'], 'closure disposition');
        if (!expected.has(row.fingerprint) || seen.has(row.fingerprint) ||
            !CLOSURE_DISPOSITIONS.has(row.disposition)) throw new Error('closure disposition is invalid');
        seen.add(row.fingerprint);
        bounded(row.rationale, 'closure rationale', 2048);
    }
    return value;
}

function validateVerifierSubmission(value, findings) {
    exact(value, ['schemaVersion', 'dispositions'], 'verifier submission');
    if (value.schemaVersion !== 1 || !Array.isArray(value.dispositions) ||
        value.dispositions.length !== findings.length) throw new Error('verifier submission is invalid');
    const expected = new Map(findings.map((finding) => [finding.fingerprint, finding]));
    const seen = new Set();
    for (const disposition of value.dispositions) {
        exact(disposition, ['fingerprint', 'disposition', 'rationale', 'duplicateOf'], 'verifier disposition');
        if (!expected.has(disposition.fingerprint) || seen.has(disposition.fingerprint) ||
            !DISPOSITIONS.has(disposition.disposition)) {
            throw new Error('verifier disposition is invalid');
        }
        seen.add(disposition.fingerprint);
        bounded(disposition.rationale, 'verifier rationale', 2048);
        if (disposition.disposition === 'DUPLICATE') {
            const target = expected.get(disposition.duplicateOf);
            const source = expected.get(disposition.fingerprint);
            if (target === undefined || disposition.duplicateOf === disposition.fingerprint ||
                target.classification !== source.classification) {
                throw new Error('verifier duplicate is invalid');
            }
        } else if (disposition.duplicateOf !== null) {
            throw new Error('verifier duplicate target is invalid');
        }
    }
    return value;
}

module.exports = {
    normalizeFindings,
    validateClosureProposal,
    validateClosureSubmission,
    validateFindingAnchor,
    validateVerifierSubmission,
};

// vim: ft=javascript sts=4 sw=4 ts=4 et :
