// $KYAULabs: review-chain-v2.js kyau@aura.kyaulabs 2026/09/03 -0700 Exp $

'use strict';

const childProcess = require('node:child_process');
const {AXES, LIMIT} = require('./constants');
const {safeRelativePath} = require('./schema');
const {
    REVIEW_STATE,
    inspectAuthorityRecord,
    publishAuthorityRecord,
} = require('./review-state');
const {validateRecordShape: validateVersionOneRecord} = require('../prism-tool/review-chain');

const FILE_LIMIT = 131072;
const SHA = /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/;
const DIGEST = /^[0-9a-f]{64}$/;
const BRANCH = /^[A-Za-z0-9][A-Za-z0-9._/-]*$/;
const ID = /^[a-z0-9]+(?:[._/-][a-z0-9]+)*$/;
const CONTROL_ID = /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,127}$/;
const PACKAGE = /^(?:@[a-z0-9][a-z0-9._-]*\/)?[a-z0-9][a-z0-9._-]*$/;
const OUTCOMES = new Set(['PASS', 'BLOCKING']);
const ENTRY_STATUSES = new Set(['A', 'B', 'C', 'D', 'M', 'R', 'T', 'U', 'X']);
const CLASSES = new Set(['BLOCKING', 'ADVISORY', 'SUGGESTED']);
const CLOSURE_DISPOSITIONS = new Set(['CONFIRMED', 'REJECTED', 'NEEDS_CONTEXT', 'INVALID_LOCATION']);
const REASONING = new Set(['off', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max']);
const SOURCE_CLASSES = new Set(['INSTALLED_EXTERNAL']);

class ReviewChainV2Error extends Error {}

function exact(value, keys, label) {
    if (value === null || typeof value !== 'object' || Array.isArray(value) ||
        Object.getPrototypeOf(value) !== Object.prototype || Object.keys(value).length !== keys.length ||
        keys.some((key) => !Object.hasOwn(value, key))) {
        throw new ReviewChainV2Error(`${label} is invalid`);
    }
}

function bounded(value, label, maximum = 2048, empty = false) {
    if (typeof value !== 'string' || (!empty && value.length === 0) ||
        Buffer.byteLength(value, 'utf8') > maximum || /[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/.test(value)) {
        throw new ReviewChainV2Error(`${label} is invalid`);
    }
    return value;
}

function digest(value, label) {
    if (!DIGEST.test(value)) throw new ReviewChainV2Error(`${label} is invalid`);
    return value;
}

function objectId(value, label, nullable = false) {
    if (nullable && value === null) return value;
    if (!SHA.test(value)) throw new ReviewChainV2Error(`${label} is invalid`);
    return value;
}

function validateFinding(value) {
    exact(value, [
        'axis', 'lensId', 'classification', 'path', 'side', 'line', 'summary', 'evidence',
        'causality', 'relevance', 'workflowImpact', 'entryDigest', 'changedLine', 'fingerprint',
    ], 'review finding');
    if (!AXES.includes(value.axis) || !ID.test(value.lensId) || !CLASSES.has(value.classification) ||
        !['base', 'head'].includes(value.side) || !Number.isSafeInteger(value.line) || value.line < 1 ||
        typeof value.changedLine !== 'boolean') {
        throw new ReviewChainV2Error('review finding is invalid');
    }
    safeRelativePath(value.path, 'review finding path');
    bounded(value.summary, 'review finding summary', 512);
    bounded(value.evidence, 'review finding evidence', 1024);
    digest(value.entryDigest, 'review finding entry digest');
    digest(value.fingerprint, 'review finding fingerprint');
    const blocking = value.classification === 'BLOCKING';
    for (const key of ['causality', 'relevance', 'workflowImpact']) {
        if (blocking) bounded(value[key], `review finding ${key}`, 2048);
        else if (value[key] !== null) throw new ReviewChainV2Error(`review finding ${key} is invalid`);
    }
    return {...value};
}

function validateAxes(value) {
    if (!Array.isArray(value) || value.length !== AXES.length) {
        throw new ReviewChainV2Error('review axes are invalid');
    }
    return value.map((axis, index) => {
        exact(axis, ['id', 'status', 'outcome', 'reason'], 'review axis');
        if (axis.id !== AXES[index] || axis.status !== 'COMPLETE' || !OUTCOMES.has(axis.outcome) ||
            axis.reason !== null) throw new ReviewChainV2Error('review axis is incomplete');
        return {...axis};
    });
}

function validateExposure(value, requireComplete = true) {
    if (!Array.isArray(value) || value.length > LIMIT.CHANGED_PATHS) {
        throw new ReviewChainV2Error('review byte exposure is invalid');
    }
    const seen = new Set();
    return value.map((row) => {
        exact(row, [
            'entryDigest', 'status', 'path', 'kind', 'oldObjectId', 'newObjectId', 'diffDigest', 'axes',
        ], 'review byte exposure');
        digest(row.entryDigest, 'review entry digest');
        digest(row.diffDigest, 'review diff digest');
        if (seen.has(row.entryDigest) || !['text', 'binary', 'symlink', 'gitlink', 'unsupported-mode'].includes(row.kind)) {
            throw new ReviewChainV2Error('review byte exposure is invalid');
        }
        seen.add(row.entryDigest);
        if (!ENTRY_STATUSES.has(row.status)) {
            throw new ReviewChainV2Error('review entry status is invalid');
        }
        safeRelativePath(row.path, 'review entry path');
        objectId(row.oldObjectId, 'review old object', true);
        objectId(row.newObjectId, 'review new object', true);
        exact(row.axes, AXES, 'review entry axes');
        const expected = row.kind === 'text' ? 'EXPOSED' : 'EXEMPTED';
        const allowed = new Set([expected, 'INCOMPLETE', 'NOT_RUN']);
        if (AXES.some((axis) => requireComplete
            ? row.axes[axis] !== expected
            : !allowed.has(row.axes[axis]))) {
            throw new ReviewChainV2Error('review byte exposure is incomplete');
        }
        return {...row, axes: {...row.axes}};
    });
}

function validateCriteriaExposure(value, requireComplete = true) {
    exact(value, ['disposition', 'status', 'sources'], 'criteria exposure');
    if (!['DECLARED', 'NONE_DECLARED'].includes(value.disposition) || !Array.isArray(value.sources) ||
        value.sources.length > 16) throw new ReviewChainV2Error('criteria exposure is invalid');
    if (value.disposition === 'NONE_DECLARED') {
        if (value.status !== 'NONE_DECLARED' || value.sources.length !== 0) {
            throw new ReviewChainV2Error('criteria exposure is incomplete');
        }
    } else if ((requireComplete ? value.status !== 'EXPOSED' :
        !['EXPOSED', 'INCOMPLETE'].includes(value.status)) || value.sources.length === 0) {
        throw new ReviewChainV2Error('criteria exposure is incomplete');
    }
    const keys = new Set();
    const sources = value.sources.map((source) => {
        exact(source, ['role', 'commit', 'path', 'blobOid', 'byteCount', 'sha256'], 'criteria exposure source');
        if (!['SPEC', 'PLAN', 'ISSUE', 'CONTEXT'].includes(source.role) ||
            !Number.isSafeInteger(source.byteCount) || source.byteCount < 1 || source.byteCount > LIMIT.FILE_BYTES) {
            throw new ReviewChainV2Error('criteria exposure source is invalid');
        }
        objectId(source.commit, 'criteria source commit');
        objectId(source.blobOid, 'criteria source blob');
        digest(source.sha256, 'criteria source digest');
        safeRelativePath(source.path, 'criteria source path');
        const key = `${source.role}\0${source.path}`;
        if (keys.has(key)) throw new ReviewChainV2Error('criteria exposure source is duplicate');
        keys.add(key);
        return {...source};
    });
    return {...value, sources};
}

function validateLenses(value, requireComplete = true) {
    if (!Array.isArray(value) || value.length === 0 || value.length > 128) {
        throw new ReviewChainV2Error('review lenses are invalid');
    }
    const seen = new Set();
    const axes = new Set();
    const lenses = value.map((lens) => {
        exact(lens, ['axis', 'id', 'package', 'status'], 'review lens');
        if (!AXES.includes(lens.axis) || !ID.test(lens.id) || !PACKAGE.test(lens.package) ||
            (requireComplete ? lens.status !== 'COMPLETE' :
                !['COMPLETE', 'INCONCLUSIVE'].includes(lens.status)) || seen.has(lens.id)) {
            throw new ReviewChainV2Error('review lens is incomplete');
        }
        seen.add(lens.id);
        axes.add(lens.axis);
        return {...lens};
    });
    if (AXES.some((axis) => !axes.has(axis))) throw new ReviewChainV2Error('review lens is incomplete');
    return lenses;
}

function validateExemptions(value) {
    if (!Array.isArray(value) || value.length > LIMIT.CHANGED_PATHS) {
        throw new ReviewChainV2Error('review exemptions are invalid');
    }
    return value.map((exemption) => {
        exact(exemption, ['id', 'kind', 'axes', 'oldPath', 'newPath'], 'review exemption');
        if (!ID.test(exemption.id) || exemption.id !== `metadata.${exemption.kind}` ||
            !['binary', 'symlink', 'gitlink', 'unsupported-mode'].includes(exemption.kind) ||
            !Array.isArray(exemption.axes) || JSON.stringify(exemption.axes) !== JSON.stringify(AXES) ||
            (exemption.oldPath === null && exemption.newPath === null)) {
            throw new ReviewChainV2Error('review exemption is invalid');
        }
        if (exemption.oldPath !== null) safeRelativePath(exemption.oldPath, 'review exemption path');
        if (exemption.newPath !== null) safeRelativePath(exemption.newPath, 'review exemption path');
        return {...exemption, axes: [...exemption.axes]};
    });
}

function validateVerifier(value, findings, requireComplete = true) {
    exact(value, ['complete', 'chunks', 'dispositions'], 'review verifier');
    if ((requireComplete ? value.complete !== true : typeof value.complete !== 'boolean') ||
        !Number.isSafeInteger(value.chunks) || value.chunks < 0 ||
        !Array.isArray(value.dispositions) || value.dispositions.length > LIMIT.REVIEW_FINDINGS) {
        throw new ReviewChainV2Error('review verifier is incomplete');
    }
    const expected = new Set(findings.map(({fingerprint}) => fingerprint));
    const dispositions = new Map();
    const rows = value.dispositions.map((row) => {
        exact(row, ['fingerprint', 'disposition', 'rationale', 'duplicateOf'], 'review verifier disposition');
        digest(row.fingerprint, 'verifier fingerprint');
        if (!expected.has(row.fingerprint) ||
            !['CONFIRMED', 'REJECTED', 'NEEDS_CONTEXT', 'INVALID_LOCATION', 'DUPLICATE'].includes(row.disposition) ||
            dispositions.has(row.fingerprint)) throw new ReviewChainV2Error('review verifier disposition is invalid');
        bounded(row.rationale, 'verifier rationale', 2048);
        if (row.disposition === 'DUPLICATE') {
            digest(row.duplicateOf, 'verifier duplicate target');
            if (row.duplicateOf === row.fingerprint) throw new ReviewChainV2Error('review verifier duplicate is invalid');
        } else if (row.duplicateOf !== null) {
            throw new ReviewChainV2Error('review verifier duplicate target is invalid');
        }
        dispositions.set(row.fingerprint, row);
        return {...row};
    });
    const expectedChunks = rows.length === 0 ? 0 : Math.ceil(rows.length / LIMIT.VERIFIER_FINDINGS);
    if (requireComplete && value.chunks !== expectedChunks) {
        throw new ReviewChainV2Error('review verifier is incomplete');
    }
    for (const row of rows.filter(({disposition}) => disposition === 'DUPLICATE')) {
        const visited = new Set([row.fingerprint]);
        let target = row.duplicateOf;
        while (dispositions.get(target)?.disposition === 'DUPLICATE') {
            if (visited.has(target)) throw new ReviewChainV2Error('review verifier duplicate is invalid');
            visited.add(target);
            target = dispositions.get(target).duplicateOf;
        }
        if (dispositions.get(target)?.disposition !== 'CONFIRMED') {
            throw new ReviewChainV2Error('review verifier duplicate is invalid');
        }
    }
    if (requireComplete && findings.some((finding) =>
        dispositions.get(finding.fingerprint)?.disposition !== 'CONFIRMED')) {
        throw new ReviewChainV2Error('confirmed review finding is invalid');
    }
    return {complete: true, chunks: value.chunks, dispositions: rows};
}

function validateModel(value) {
    exact(value, ['provider', 'id', 'reasoningLevel', 'contextWindow'], 'review model');
    if (!CONTROL_ID.test(value.provider) || !CONTROL_ID.test(value.id) ||
        !REASONING.has(value.reasoningLevel) ||
        !Number.isSafeInteger(value.contextWindow) || value.contextWindow < 1) {
        throw new ReviewChainV2Error('review model is invalid');
    }
    return {...value};
}

function validatePackage(value, adapter = false) {
    if (value === null && adapter) return null;
    exact(value, adapter
        ? ['name', 'version', 'digest', 'sourceClass', 'providerId', 'protocolVersion']
        : ['name', 'version', 'digest', 'sourceClass'], 'review package');
    if (!PACKAGE.test(value.name) || !/^\d+\.\d+\.\d+$/.test(value.version) ||
        !SOURCE_CLASSES.has(value.sourceClass)) throw new ReviewChainV2Error('review package is invalid');
    digest(value.digest, 'review package digest');
    if (adapter && (!ID.test(value.providerId) || value.protocolVersion !== 1)) {
        throw new ReviewChainV2Error('review adapter is invalid');
    }
    return {...value};
}

function validateClosure(value) {
    exact(value, ['fingerprint', 'evidence', 'tests', 'disposition', 'rationale'], 'review closure');
    digest(value.fingerprint, 'closure fingerprint');
    bounded(value.evidence, 'closure evidence', 4096);
    bounded(value.rationale, 'closure rationale', 2048);
    if (!CLOSURE_DISPOSITIONS.has(value.disposition) || !Array.isArray(value.tests) ||
        value.tests.length === 0 || value.tests.length > 32) throw new ReviewChainV2Error('review closure is invalid');
    const tests = value.tests.map((item) => {
        exact(item, ['path', 'gateId'], 'closure test');
        safeRelativePath(item.path, 'closure test path');
        if (!ID.test(item.gateId)) throw new ReviewChainV2Error('closure test gate is invalid');
        return {...item};
    });
    return {...value, tests};
}

function validateReportEnvelope(report, input) {
    exact(report, [
        'schemaVersion', 'command', 'authoritative', 'sourceClass', 'outcome', 'scope', 'model',
        'policyDigest', 'planDigest', 'manifestDigest', 'axes', 'byteExposure', 'lenses',
        'exemptions', 'findings', 'verifier', 'limits', 'criteriaExposure',
    ], 'engine review report');
    exact(report.scope, ['mode', 'baseCommit', 'headCommit'], 'review scope');
    if (report.schemaVersion !== 1 || report.authoritative !== true || report.scope.mode !== 'branch' ||
        !['PASS', 'BLOCKING', 'INCONCLUSIVE'].includes(report.outcome) ||
        !SOURCE_CLASSES.has(report.sourceClass) || report.scope.baseCommit !== input.fromSha ||
        report.scope.headCommit !== input.check.headSha ||
        report.manifestDigest !== input.snapshot.manifestDigest ||
        JSON.stringify(report.limits) !== JSON.stringify(LIMIT)) {
        throw new ReviewChainV2Error('engine review report is invalid');
    }
    bounded(report.command, 'review command', 128);
    digest(report.policyDigest, 'review policy digest');
    digest(report.planDigest, 'review plan digest');
    digest(report.manifestDigest, 'review manifest digest');
    objectId(report.scope.baseCommit, 'review base commit');
    objectId(report.scope.headCommit, 'review head commit');
}

function validateAxisFindingOutcomes(axes, findings) {
    for (const axis of axes) {
        const hasBlocking = findings.some((finding) =>
            finding.axis === axis.id && finding.classification === 'BLOCKING');
        if ((axis.outcome === 'BLOCKING') !== hasBlocking) {
            throw new ReviewChainV2Error('review axis outcome is invalid');
        }
    }
}

function validateReportModel(value, nullable = false) {
    if (nullable && value === null) return null;
    exact(value, ['provider', 'id', 'reasoningLevel', 'contextWindow', 'authentication'], 'review report model');
    if (value.authentication !== 'UNKNOWN') throw new ReviewChainV2Error('review report model is invalid');
    return validateModel({
        provider: value.provider,
        id: value.id,
        reasoningLevel: value.reasoningLevel,
        contextWindow: value.contextWindow,
    });
}

function validateReport(report, input) {
    validateReportEnvelope(report, input);
    if (!OUTCOMES.has(report.outcome)) throw new ReviewChainV2Error('engine review report is incomplete');
    const model = validateReportModel(report.model);
    if (!Array.isArray(report.findings)) throw new ReviewChainV2Error('review findings are invalid');
    const findings = report.findings.map(validateFinding);
    if (findings.length > LIMIT.REVIEW_FINDINGS ||
        new Set(findings.map(({fingerprint}) => fingerprint)).size !== findings.length) {
        throw new ReviewChainV2Error('review findings are invalid');
    }
    const hasBlocking = findings.some(({classification}) => classification === 'BLOCKING');
    if ((report.outcome === 'BLOCKING') !== hasBlocking) throw new ReviewChainV2Error('review outcome is invalid');
    const axes = validateAxes(report.axes);
    if ((report.outcome === 'BLOCKING') !== axes.some(({outcome}) => outcome === 'BLOCKING')) {
        throw new ReviewChainV2Error('review outcome is invalid');
    }
    validateAxisFindingOutcomes(axes, findings);
    return {
        axes,
        byteExposure: validateExposure(report.byteExposure),
        criteriaExposure: validateCriteriaExposure(report.criteriaExposure),
        lenses: validateLenses(report.lenses),
        exemptions: validateExemptions(report.exemptions),
        findings,
        verifier: validateVerifier(report.verifier, findings),
        model,
        outcome: report.outcome,
        planDigest: report.planDigest,
        policyDigest: report.policyDigest,
    };
}

function validateInconclusiveReport(report, input) {
    validateReportEnvelope(report, input);
    if (report.outcome !== 'INCONCLUSIVE' || !Array.isArray(report.axes) ||
        report.axes.length !== AXES.length || !Array.isArray(report.findings)) {
        throw new ReviewChainV2Error('engine review report is invalid');
    }
    report.axes.forEach((axis, index) => {
        exact(axis, ['id', 'status', 'outcome', 'reason'], 'review axis');
        if (axis.id !== AXES[index] || !['COMPLETE', 'INCONCLUSIVE', 'NOT_RUN'].includes(axis.status) ||
            !['PASS', 'BLOCKING', 'INCONCLUSIVE'].includes(axis.outcome) ||
            (axis.reason !== null && typeof axis.reason !== 'string')) {
            throw new ReviewChainV2Error('review axis is invalid');
        }
        if (axis.reason !== null) bounded(axis.reason, 'review axis reason', 128);
    });
    const findings = report.findings.map(validateFinding);
    if (findings.length > LIMIT.REVIEW_FINDINGS ||
        new Set(findings.map(({fingerprint}) => fingerprint)).size !== findings.length) {
        throw new ReviewChainV2Error('review findings are invalid');
    }
    validateExposure(report.byteExposure, false);
    validateCriteriaExposure(report.criteriaExposure, false);
    validateLenses(report.lenses, false);
    validateExemptions(report.exemptions);
    validateVerifier(report.verifier, findings, false);
    validateReportModel(report.model, true);
}

function validateSnapshot(value) {
    exact(value, ['manifestDigest', 'diffDigest'], 'review snapshot');
    digest(value.manifestDigest, 'review manifest digest');
    digest(value.diffDigest, 'review diff digest');
    return {...value};
}

function validateCheck(value) {
    exact(value, ['digest', 'headSha'], 'review check');
    digest(value.digest, 'review check digest');
    objectId(value.headSha, 'review check HEAD');
    return {...value};
}

function validatePlan(value) {
    exact(value, ['planDigest', 'profileDigest', 'policyDigest', 'resourceDigest', 'skillDigest'], 'review plan identity');
    for (const [key, item] of Object.entries(value)) digest(item, `review ${key}`);
    return {...value};
}

function validateReuse(value, range, check) {
    if (value === null) return null;
    exact(value, ['headSha', 'checkDigest', 'reason'], 'review reuse');
    objectId(value.headSha, 'review reuse HEAD');
    digest(value.checkDigest, 'review reuse check digest');
    if (value.headSha !== range.to || value.checkDigest !== check.digest || value.reason !== 'EXACT_SAME_HEAD') {
        throw new ReviewChainV2Error('review reuse is invalid');
    }
    return {...value};
}

function validateSegment(value) {
    exact(value, [
        'schemaVersion', 'kind', 'range', 'snapshot', 'criteriaDigest', 'check', 'core', 'adapter',
        'plan', 'model', 'axes', 'byteExposure', 'criteriaExposure', 'lenses', 'exemptions',
        'findings', 'verifier', 'closures', 'reuse',
    ], 'review segment');
    exact(value.range, ['from', 'to'], 'review range');
    if (value.schemaVersion !== 2 || !['initial', 'repair'].includes(value.kind)) {
        throw new ReviewChainV2Error('review segment is invalid');
    }
    objectId(value.range.from, 'review range start');
    objectId(value.range.to, 'review range end');
    const check = validateCheck(value.check);
    if (check.headSha !== value.range.to) throw new ReviewChainV2Error('review check is stale');
    digest(value.criteriaDigest, 'criteria digest');
    if (!Array.isArray(value.findings) || !Array.isArray(value.closures)) {
        throw new ReviewChainV2Error('review segment is invalid');
    }
    const findings = value.findings.map(validateFinding);
    if (findings.length > LIMIT.REVIEW_FINDINGS ||
        new Set(findings.map(({fingerprint}) => fingerprint)).size !== findings.length) {
        throw new ReviewChainV2Error('review findings are invalid');
    }
    const axes = validateAxes(value.axes);
    validateAxisFindingOutcomes(axes, findings);
    const closures = value.closures.map(validateClosure);
    if (new Set(closures.map(({fingerprint}) => fingerprint)).size !== closures.length) {
        throw new ReviewChainV2Error('review closures are duplicate');
    }
    return {
        ...value,
        range: {...value.range},
        snapshot: validateSnapshot(value.snapshot),
        check,
        core: validatePackage(value.core),
        adapter: validatePackage(value.adapter, true),
        plan: validatePlan(value.plan),
        model: validateModel(value.model),
        axes,
        byteExposure: validateExposure(value.byteExposure),
        criteriaExposure: validateCriteriaExposure(value.criteriaExposure),
        lenses: validateLenses(value.lenses),
        exemptions: validateExemptions(value.exemptions),
        findings,
        verifier: validateVerifier(value.verifier, findings),
        closures,
        reuse: validateReuse(value.reuse, value.range, check),
    };
}

function storedFinding(value) {
    exact(value, [
        'state', 'axis', 'lensId', 'classification', 'path', 'side', 'line', 'summary', 'evidence',
        'causality', 'relevance', 'workflowImpact', 'entryDigest', 'changedLine', 'fingerprint', 'closure',
    ], 'stored review finding');
    if (!['OPEN', 'CLOSED'].includes(value.state) ||
        (value.state === 'OPEN') !== (value.closure === null)) {
        throw new ReviewChainV2Error('stored review finding is invalid');
    }
    const {state, closure, ...candidate} = value;
    const finding = validateFinding(candidate);
    if (closure !== null) validateClosure(closure);
    return {state, ...finding, closure: closure === null ? null : validateClosure(closure)};
}

function replay(record) {
    let prior = record.baseSha;
    let findings = [];
    const allFingerprints = new Set();
    for (const [index, candidate] of record.segments.entries()) {
        const segment = validateSegment(candidate);
        if (segment.kind !== (index === 0 ? 'initial' : 'repair') || segment.range.from !== prior ||
            (index === 0 && segment.range.from !== record.baseSha) ||
            segment.criteriaDigest !== record.criteriaDigest) {
            throw new ReviewChainV2Error('review history is discontinuous');
        }
        if (segment.kind === 'initial' && segment.closures.length !== 0) {
            throw new ReviewChainV2Error('initial review closures are invalid');
        }
        for (const closure of segment.closures) {
            const target = findings.find((item) => item.fingerprint === closure.fingerprint);
            if (target === undefined || target.state !== 'OPEN' || target.classification !== 'BLOCKING') {
                throw new ReviewChainV2Error('review closure target is invalid');
            }
            if (closure.disposition === 'CONFIRMED') {
                target.state = 'CLOSED';
                target.closure = closure;
            }
        }
        for (const finding of segment.findings) {
            if (allFingerprints.has(finding.fingerprint)) {
                throw new ReviewChainV2Error('review finding fingerprints are duplicate');
            }
            allFingerprints.add(finding.fingerprint);
            findings.push({state: 'OPEN', ...finding, closure: null});
        }
        prior = segment.range.to;
    }
    if (record.segments.length === 0 || prior !== record.headSha) {
        throw new ReviewChainV2Error('review history is discontinuous');
    }
    return findings;
}

function parseReviewChainV2(record) {
    exact(record, [
        'schemaVersion', 'kind', 'branch', 'baseRef', 'baseSha', 'headSha',
        'criteriaDigest', 'segments', 'findings', 'openBlocking',
    ], 'review chain');
    if (record.schemaVersion !== 2 || record.kind !== 'review-chain' || !BRANCH.test(record.branch) ||
        !/^origin\/(?:develop|main)$/.test(record.baseRef) || !Array.isArray(record.segments) ||
        !Array.isArray(record.findings) || !Array.isArray(record.openBlocking) || record.segments.length > 64) {
        throw new ReviewChainV2Error('review chain is invalid');
    }
    objectId(record.baseSha, 'review base SHA');
    objectId(record.headSha, 'review HEAD');
    digest(record.criteriaDigest, 'criteria digest');
    const segments = record.segments.map(validateSegment);
    const replayed = replay({...record, segments});
    const findings = record.findings.map(storedFinding);
    if (JSON.stringify(findings) !== JSON.stringify(replayed)) {
        throw new ReviewChainV2Error('review findings are inconsistent');
    }
    const openBlocking = replayed.filter(({state, classification}) =>
        state === 'OPEN' && classification === 'BLOCKING').map(({fingerprint}) => fingerprint);
    if (JSON.stringify(openBlocking) !== JSON.stringify(record.openBlocking)) {
        throw new ReviewChainV2Error('review Blocking state is inconsistent');
    }
    return {...record, segments, findings};
}

function parseAny(record) {
    if (record?.schemaVersion === 1) {
        validateVersionOneRecord(record);
        return record;
    }
    return parseReviewChainV2(record);
}

function repositoryRoot(context) {
    return context.projectRoot ?? context.cwd ?? process.cwd();
}

function runGit(context, args) {
    const result = (context.run ?? childProcess.spawnSync)('git', args, {
        cwd: repositoryRoot(context),
        env: context.env ?? process.env,
        encoding: 'utf8',
        maxBuffer: LIMIT.INPUT_BYTES,
        timeout: 30000,
    });
    if (result.error || result.status !== 0) throw new ReviewChainV2Error('review history is unavailable');
}

function validateAncestry(record, context) {
    for (const segment of record.segments) {
        runGit(context, ['merge-base', '--is-ancestor', segment.range.from, segment.range.to]);
    }
}

function inspectReviewChainV2(context = {}) {
    const inspected = inspectAuthorityRecord({
        projectRoot: repositoryRoot(context),
        filename: 'review-chain.json',
        limit: FILE_LIMIT,
        parse: parseAny,
    }, context);
    if (inspected.state !== REVIEW_STATE.VALID) return inspected;
    if (inspected.record.schemaVersion === 1) {
        return {...inspected, state: REVIEW_STATE.LEGACY, version: 1};
    }
    try {
        validateAncestry(inspected.record, context);
        return {...inspected, state: REVIEW_STATE.VALID, version: 2};
    } catch {
        return {path: inspected.path, state: REVIEW_STATE.UNSAFE};
    }
}

function selectReviewChainVersion(context = {}) {
    const inspected = inspectReviewChainV2(context);
    return {
        state: inspected.state,
        version: inspected.state === REVIEW_STATE.VALID ? 2 :
            inspected.state === REVIEW_STATE.LEGACY ? 1 : null,
        ...(inspected.record === undefined ? {} : {record: inspected.record}),
    };
}

function publishDiagnostic(input, context) {
    const record = {
        schemaVersion: 1,
        kind: 'review-attempt',
        status: 'INCONCLUSIVE',
        branch: input.branch,
        baseRef: input.baseRef,
        baseSha: input.baseSha,
        headSha: input.check.headSha,
        criteriaDigest: input.criteriaDigest,
        reason: 'REVIEW_INCONCLUSIVE',
    };
    const parse = (value) => {
        exact(value, Object.keys(record), 'review attempt');
        if (JSON.stringify(value) !== JSON.stringify(record)) throw new ReviewChainV2Error('review attempt is invalid');
        return {...value};
    };
    publishAuthorityRecord({
        projectRoot: repositoryRoot(context),
        filename: 'review-attempt.json',
        limit: 131072,
        record,
        parse,
    }, context);
    return record;
}

function validateAttemptIdentity(input) {
    exact(input, [
        'operation', 'branch', 'baseRef', 'baseSha', 'fromSha', 'criteriaDigest', 'check', 'core', 'adapter',
        'profileDigest', 'resourceDigest', 'skillDigest', 'snapshot', 'report', 'closures', 'newInitial',
    ], 'review attempt');
    if (!['initial', 'repair'].includes(input.operation) || !BRANCH.test(input.branch) ||
        !/^origin\/(?:develop|main)$/.test(input.baseRef) || typeof input.newInitial !== 'boolean' ||
        !Array.isArray(input.closures)) throw new ReviewChainV2Error('review attempt is invalid');
    objectId(input.baseSha, 'review base SHA');
    objectId(input.fromSha, 'review range start');
    digest(input.criteriaDigest, 'criteria digest');
    validateCheck(input.check);
    validatePackage(input.core);
    validatePackage(input.adapter, true);
    validateSnapshot(input.snapshot);
    digest(input.profileDigest, 'review profile digest');
    digest(input.resourceDigest, 'review resource digest');
    digest(input.skillDigest, 'review skill digest');
    if (input.report === null || typeof input.report !== 'object' || Array.isArray(input.report) ||
        input.report.authoritative !== true || input.report.scope?.baseCommit !== input.fromSha ||
        input.report.scope?.headCommit !== input.check.headSha) {
        throw new ReviewChainV2Error('engine review report is invalid');
    }
}

function segmentFromAttempt(input) {
    const report = validateReport(input.report, input);
    const closures = input.closures.map(validateClosure);
    const segment = {
        schemaVersion: 2,
        kind: input.operation,
        range: {from: input.report.scope.baseCommit, to: input.report.scope.headCommit},
        snapshot: validateSnapshot(input.snapshot),
        criteriaDigest: input.criteriaDigest,
        check: validateCheck(input.check),
        core: validatePackage(input.core),
        adapter: validatePackage(input.adapter, true),
        plan: {
            planDigest: report.planDigest,
            profileDigest: input.profileDigest,
            policyDigest: report.policyDigest,
            resourceDigest: input.resourceDigest,
            skillDigest: input.skillDigest,
        },
        model: report.model,
        axes: report.axes,
        byteExposure: report.byteExposure,
        criteriaExposure: report.criteriaExposure,
        lenses: report.lenses,
        exemptions: report.exemptions,
        findings: report.findings,
        verifier: report.verifier,
        closures,
        reuse: null,
    };
    return validateSegment(segment);
}

function recordReviewAttempt(input, context = {}) {
    validateAttemptIdentity(input);
    if (input.report.outcome === 'INCONCLUSIVE') {
        validateInconclusiveReport(input.report, input);
        return {status: 'INCONCLUSIVE', diagnostic: publishDiagnostic(input, context)};
    }
    const segment = segmentFromAttempt(input);
    const current = inspectReviewChainV2(context);
    let segments;
    if (input.operation === 'initial') {
        if (segment.range.from !== input.baseSha || segment.closures.length !== 0 ||
            !([REVIEW_STATE.ABSENT].includes(current.state) ||
                current.state === REVIEW_STATE.LEGACY && input.newInitial)) {
            throw new ReviewChainV2Error('initial review chain state is invalid');
        }
        segments = [segment];
    } else {
        if (input.newInitial || current.state !== REVIEW_STATE.VALID ||
            current.record.branch !== input.branch || current.record.baseRef !== input.baseRef ||
            current.record.baseSha !== input.baseSha || current.record.criteriaDigest !== input.criteriaDigest ||
            current.record.headSha !== segment.range.from) {
            throw new ReviewChainV2Error('repair review chain is discontinuous');
        }
        segments = [...current.record.segments, segment];
    }
    const provisional = {
        schemaVersion: 2,
        kind: 'review-chain',
        branch: input.branch,
        baseRef: input.baseRef,
        baseSha: input.baseSha,
        headSha: segment.range.to,
        criteriaDigest: input.criteriaDigest,
        segments,
        findings: [],
        openBlocking: [],
    };
    const findings = replay({...provisional, findings: [], openBlocking: []});
    const record = parseReviewChainV2({
        ...provisional,
        findings,
        openBlocking: findings.filter(({state, classification}) =>
            state === 'OPEN' && classification === 'BLOCKING').map(({fingerprint}) => fingerprint),
    });
    validateAncestry(record, context);
    const published = publishAuthorityRecord({
        projectRoot: repositoryRoot(context),
        filename: 'review-chain.json',
        limit: FILE_LIMIT,
        record,
        parse: parseAny,
    }, context);
    if (published.record.schemaVersion !== 2) throw new ReviewChainV2Error('review chain publication failed');
    return published.record;
}

function verifyReviewChainV2(expected, context = {}) {
    exact(expected, ['branch', 'baseRef', 'baseSha', 'headSha', 'criteriaDigest', 'checkDigest'], 'review chain expectation');
    const inspected = inspectReviewChainV2(context);
    if (inspected.state !== REVIEW_STATE.VALID) throw new ReviewChainV2Error('review chain is unavailable');
    const record = inspected.record;
    for (const key of ['branch', 'baseRef', 'baseSha', 'headSha', 'criteriaDigest']) {
        if (record[key] !== expected[key]) throw new ReviewChainV2Error('review chain identity is stale');
    }
    digest(expected.checkDigest, 'expected check digest');
    if (record.segments.at(-1).check.digest !== expected.checkDigest) {
        throw new ReviewChainV2Error('review check identity is stale');
    }
    if (record.openBlocking.length !== 0) {
        throw new ReviewChainV2Error('review chain has unresolved Blocking findings');
    }
    return {
        record,
        advisoryFindings: record.findings.filter(({classification}) => classification === 'ADVISORY'),
    };
}

module.exports = {
    ReviewChainV2Error,
    inspectReviewChainV2,
    parseReviewChainV2,
    recordReviewAttempt,
    selectReviewChainVersion,
    verifyReviewChainV2,
};

// vim: ft=javascript sts=4 sw=4 ts=4 et :
