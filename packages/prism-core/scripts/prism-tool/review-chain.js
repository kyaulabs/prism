// $KYAULabs: review-chain.js kyau@aura.kyaulabs 2026/08/23 -0700 Exp $

'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const {TextDecoder} = require('node:util');
const {runBounded} = require('./process');

const STATE = Object.freeze({ABSENT: 'ABSENT', VALID: 'VALID', UNSAFE: 'UNSAFE'});
const FILE_LIMIT = 131072;
const SHA_RE = /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/;
const BRANCH_RE = /^[A-Za-z0-9][A-Za-z0-9._/-]*$/;
const FINGERPRINT_RE = /^[0-9a-f]{64}$/;
const AXES = Object.freeze(['tooling', 'standards', 'spec', 'sast']);
const AXIS_STATUS = new Set(['COMPLETE', 'COMPLETE_NO_SPEC']);
const CLASSIFICATION = new Set(['BLOCKING', 'ADVISORY']);

class ReviewChainError extends Error {}

function closeQuietly(descriptor) {
    try { fs.closeSync(descriptor); } catch { return false; }
    return true;
}

function removeQuietly(file) {
    try { fs.rmSync(file); } catch { return false; }
    return true;
}

function resolveRoot(context = {}) {
    return fs.realpathSync(context.projectRoot ?? context.cwd ?? process.cwd());
}

function resolveReviewChainPath(context = {}) {
    return context.reviewChainPath ?? path.join(resolveRoot(context), '.pi', 'prism-tool', 'code-review', 'review-chain.json');
}

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

function command(context, args) {
    const result = (context.run ?? runBounded)('git', args, {
        cwd: resolveRoot(context),
        env: context.env ?? process.env,
        maxBuffer: 1048576,
        timeout: 30000,
    });
    if (result.error || result.status !== 0) throw new ReviewChainError('repository identity is unavailable');
    return String(result.stdout ?? '').trim();
}

function repositoryIdentity(context) {
    const branch = command(context, ['symbolic-ref', '--quiet', '--short', 'HEAD']);
    const headSha = command(context, ['rev-parse', 'HEAD']);
    if (!BRANCH_RE.test(branch) || !SHA_RE.test(headSha)) throw new ReviewChainError('repository identity is invalid');
    return {branch, headSha};
}

function assertAncestor(context, from, to) {
    const result = (context.run ?? runBounded)('git', ['merge-base', '--is-ancestor', from, to], {
        cwd: resolveRoot(context),
        env: context.env ?? process.env,
        maxBuffer: 1048576,
        timeout: 30000,
    });
    if (result.error || result.status !== 0) throw new ReviewChainError('review history is discontinuous');
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
        if (!AXIS_STATUS.has(value[axis])) throw new ReviewChainError('review axis is incomplete');
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

function validateSegment(input, context) {
    exactKeys(input, [
        'schemaVersion', 'kind', 'branch', 'baseRef', 'baseSha', 'from', 'to',
        'axes', 'findings', 'closures',
    ], 'review segment');
    if (input.schemaVersion !== 1 || !['initial', 'repair'].includes(input.kind) ||
        !BRANCH_RE.test(input.branch) || !SHA_RE.test(input.baseSha) ||
        !SHA_RE.test(input.from) || !SHA_RE.test(input.to) ||
        typeof input.baseRef !== 'string' || !/^origin\/(?:develop|main)$/.test(input.baseRef) ||
        !Array.isArray(input.findings) || input.findings.length > 256 ||
        !Array.isArray(input.closures) || input.closures.length > 256) {
        throw new ReviewChainError('review segment is invalid');
    }
    const identity = repositoryIdentity(context);
    if (identity.branch !== input.branch || identity.headSha !== input.to) {
        throw new ReviewChainError('review segment does not match current repository state');
    }
    assertAncestor(context, input.from, input.to);
    const findings = input.findings.map(validateFinding);
    if (new Set(findings.map(({fingerprint}) => fingerprint)).size !== findings.length) {
        throw new ReviewChainError('finding fingerprints contain duplicates');
    }
    const closures = input.closures.map((closure) => {
        exactKeys(closure, ['fingerprint', 'evidence'], 'finding closure');
        if (!FINGERPRINT_RE.test(closure.fingerprint)) throw new ReviewChainError('closure fingerprint is invalid');
        return {fingerprint: closure.fingerprint, evidence: text(closure.evidence, 'closure evidence', 4096)};
    });
    return {...input, axes: validateAxes(input.axes), closures, findings};
}

function ensurePrivateDirectory(directory, root) {
    const relation = path.relative(root, directory);
    if (relation.startsWith('..') || path.isAbsolute(relation)) throw new ReviewChainError('review chain path escapes project root');
    let current = root;
    for (const segment of relation.split(path.sep).filter(Boolean)) {
        current = path.join(current, segment);
        try {
            const stat = fs.lstatSync(current);
            if (!stat.isDirectory() || stat.isSymbolicLink() || (stat.mode & 0o022) !== 0) throw new Error();
        } catch (error) {
            if (error?.code !== 'ENOENT') throw new ReviewChainError('review chain path is unsafe');
            fs.mkdirSync(current, {mode: 0o700});
        }
        fs.chmodSync(current, 0o700);
    }
}

function readPrivateRecord(file) {
    let descriptor;
    try {
        if (typeof fs.constants.O_NOFOLLOW !== 'number') throw new Error();
        const pathStat = fs.lstatSync(file);
        if (!pathStat.isFile() || pathStat.isSymbolicLink() || (pathStat.mode & 0o777) !== 0o600 || pathStat.size > FILE_LIMIT) throw new Error();
        descriptor = fs.openSync(file, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW);
        const stat = fs.fstatSync(descriptor);
        if (!stat.isFile() || stat.dev !== pathStat.dev || stat.ino !== pathStat.ino || stat.size > FILE_LIMIT) throw new Error();
        const raw = fs.readFileSync(descriptor);
        fs.closeSync(descriptor);
        descriptor = undefined;
        return JSON.parse(new TextDecoder('utf-8', {fatal: true}).decode(raw));
    } catch {
        if (descriptor !== undefined) closeQuietly(descriptor);
        throw new ReviewChainError('review chain is unsafe');
    }
}

function inspectReviewChain(context = {}) {
    let file;
    try {
        file = resolveReviewChainPath(context);
        const root = resolveRoot(context);
        const parent = path.dirname(file);
        const relation = path.relative(root, parent);
        if (relation.startsWith('..') || path.isAbsolute(relation)) return {path: file, state: STATE.UNSAFE};
        fs.lstatSync(file);
        const record = readPrivateRecord(file);
        validateRecordShape(record);
        return {path: file, record, state: STATE.VALID};
    } catch (error) {
        if (error?.code === 'ENOENT') return {path: file ?? '', state: STATE.ABSENT};
        return {path: file ?? '', state: STATE.UNSAFE};
    }
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

function publish(record, context) {
    const file = resolveReviewChainPath(context);
    const root = resolveRoot(context);
    const parent = path.dirname(file);
    ensurePrivateDirectory(parent, root);
    const temporary = path.join(parent, `.review-chain-${crypto.randomBytes(16).toString('hex')}.tmp`);
    let descriptor;
    try {
        const content = `${JSON.stringify(record)}\n`;
        if (Buffer.byteLength(content) > FILE_LIMIT || typeof fs.constants.O_NOFOLLOW !== 'number') throw new Error();
        descriptor = fs.openSync(temporary, fs.constants.O_CREAT | fs.constants.O_EXCL | fs.constants.O_WRONLY | fs.constants.O_NOFOLLOW, 0o600);
        fs.writeFileSync(descriptor, content);
        fs.fchmodSync(descriptor, 0o600);
        fs.fsyncSync(descriptor);
        fs.closeSync(descriptor);
        descriptor = undefined;
        fs.renameSync(temporary, file);
        const directory = fs.openSync(parent, fs.constants.O_RDONLY | fs.constants.O_DIRECTORY | fs.constants.O_NOFOLLOW);
        fs.fsyncSync(directory);
        fs.closeSync(directory);
    } catch {
        if (descriptor !== undefined) closeQuietly(descriptor);
        throw new ReviewChainError('review chain could not be published');
    } finally {
        removeQuietly(temporary);
    }
    return file;
}

function recordReviewSegment(input, context = {}) {
    const segment = validateSegment(input, context);
    const current = inspectReviewChain(context);
    let findings;
    let segments;
    if (segment.kind === 'initial') {
        if (segment.closures.length !== 0) throw new ReviewChainError('initial review closures are invalid');
        if (current.state !== STATE.ABSENT || segment.from !== segment.baseSha) {
            throw new ReviewChainError('initial review chain state is invalid');
        }
        findings = segment.findings;
        segments = [segment];
    } else {
        if (current.state !== STATE.VALID) throw new ReviewChainError('repair review requires a valid chain');
        const record = current.record;
        if (record.branch !== segment.branch || record.baseRef !== segment.baseRef ||
            record.baseSha !== segment.baseSha || record.headSha !== segment.from) {
            throw new ReviewChainError('repair review is not continuous');
        }
        const priorFingerprints = new Set(record.findings.map(({fingerprint}) => fingerprint));
        if (segment.findings.some(({fingerprint}) => priorFingerprints.has(fingerprint))) {
            throw new ReviewChainError('repair findings contain duplicate fingerprints');
        }
        const openFingerprints = new Set(record.findings
            .filter(({state}) => state === 'OPEN')
            .map(({fingerprint}) => fingerprint));
        const closureFingerprints = new Set();
        for (const closure of segment.closures) {
            if (!openFingerprints.has(closure.fingerprint) || closureFingerprints.has(closure.fingerprint)) {
                throw new ReviewChainError('repair closure is invalid');
            }
            closureFingerprints.add(closure.fingerprint);
        }
        const closureMap = new Map(segment.closures.map((closure) => [closure.fingerprint, closure.evidence]));
        findings = record.findings.map((finding) => closureMap.has(finding.fingerprint)
            ? {...finding, closureEvidence: closureMap.get(finding.fingerprint), state: 'CLOSED'}
            : finding);
        findings.push(...segment.findings);
        segments = [...record.segments, segment];
    }
    findings = findings.map((finding) => ({state: finding.state ?? 'OPEN', ...finding}));
    const openBlocking = findings.filter(({classification, state}) => classification === 'BLOCKING' && state === 'OPEN')
        .map(({fingerprint}) => fingerprint);
    const record = {
        schemaVersion: 1,
        branch: segment.branch,
        baseRef: segment.baseRef,
        baseSha: segment.baseSha,
        headSha: segment.to,
        segments,
        findings,
        openBlocking,
    };
    const file = publish(record, context);
    return {...record, path: file};
}

function verifyReviewChain(expected, context = {}) {
    const inspected = inspectReviewChain(context);
    if (inspected.state !== STATE.VALID) throw new ReviewChainError('review chain is unavailable');
    const record = inspected.record;
    for (const key of ['branch', 'baseRef', 'baseSha', 'headSha']) {
        if (record[key] !== expected[key]) throw new ReviewChainError('review chain identity is stale');
    }
    let prior = record.baseSha;
    for (const segment of record.segments) {
        if (segment.from !== prior) throw new ReviewChainError('review history is discontinuous');
        assertAncestor(context, segment.from, segment.to);
        prior = segment.to;
    }
    if (prior !== record.headSha) throw new ReviewChainError('review history is discontinuous');
    if (record.openBlocking.length !== 0) throw new ReviewChainError('review chain has unresolved Blocking findings');
    return {
        record,
        advisoryFindings: record.findings.filter(({classification}) => classification === 'ADVISORY'),
    };
}

module.exports = {
    ReviewChainError,
    STATE,
    inspectReviewChain,
    recordReviewSegment,
    resolveReviewChainPath,
    verifyReviewChain,
};

// vim: ft=javascript sts=4 sw=4 ts=4 et :
