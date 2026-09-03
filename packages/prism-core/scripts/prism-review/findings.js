// $KYAULabs: findings.js kyau@aura.kyaulabs 2026/09/02 -0700 Exp $

'use strict';

const {AXES, FINDING_CLASS} = require('./constants');
const {digestJson} = require('./canonical-json');

const FINDING_KEYS = Object.freeze([
    'axis', 'lensId', 'classification', 'path', 'side', 'line', 'summary', 'evidence',
    'causality', 'relevance', 'workflowImpact',
]);
const DISPOSITIONS = new Set(['CONFIRMED', 'REJECTED', 'NEEDS_CONTEXT', 'INVALID_LOCATION', 'DUPLICATE']);

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

module.exports = {normalizeFindings, validateFindingAnchor, validateVerifierSubmission};

// vim: ft=javascript sts=4 sw=4 ts=4 et :
