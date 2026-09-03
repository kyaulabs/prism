// $KYAULabs: orchestrator.js kyau@aura.kyaulabs 2026/09/03 -0700 Exp $

'use strict';

const {AXES, LIMIT, OUTCOME} = require('./constants');
const {createCriteriaTools} = require('./criteria-tools');
const {assertFresh: snapshotIsFresh} = require('./git-snapshot');
const {normalizeFindings, validateVerifierSubmission} = require('./findings');
const {axisSubmissionSchema, verifierSubmissionSchema} = require('./schema');
const {runIsolatedSession} = require('./session-runner');
const {createSnapshotTools} = require('./snapshot-tools');

const AXIS_KEYS = Object.freeze(['schemaVersion', 'axis', 'outcome', 'lenses', 'findings', 'notes']);
const AUTHORITATIVE = Symbol('authoritative review');

function exact(value, keys, label) {
    if (value === null || typeof value !== 'object' || Array.isArray(value) ||
        Object.getPrototypeOf(value) !== Object.prototype || Object.keys(value).length !== keys.length ||
        keys.some((key) => !Object.hasOwn(value, key))) throw new Error(`${label} is invalid`);
}

function boundedNote(value) {
    return typeof value === 'string' && Buffer.byteLength(value, 'utf8') <= 2048 &&
        !/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/.test(value);
}

function validateAxisSubmission(value, axis, snapshot) {
    exact(value, AXIS_KEYS, 'axis submission');
    if (value.schemaVersion !== 1 || value.axis !== axis.id ||
        !Object.values(OUTCOME).includes(value.outcome) || !Array.isArray(value.lenses) ||
        value.lenses.length !== axis.lenses.length || !Array.isArray(value.findings) ||
        value.findings.length > LIMIT.AXIS_FINDINGS || !Array.isArray(value.notes) ||
        value.notes.length > 16 || value.notes.some((note) => !boundedNote(note))) {
        throw new Error('axis submission is invalid');
    }
    const expected = new Set(axis.lenses.map(({id}) => id));
    const seen = new Set();
    for (const lens of value.lenses) {
        exact(lens, ['id', 'status'], 'lens status');
        if (!expected.has(lens.id) || seen.has(lens.id) ||
            !['COMPLETE', 'INCONCLUSIVE'].includes(lens.status)) throw new Error('lens status is invalid');
        seen.add(lens.id);
    }
    const findings = normalizeFindings(value.findings, {
        snapshot,
        axis: axis.id,
        lensIds: axis.lenses.map(({id}) => id),
    });
    const hasBlocking = findings.some(({classification}) => classification === 'BLOCKING');
    const hasIncompleteLens = value.lenses.some(({status}) => status === 'INCONCLUSIVE');
    if ((value.outcome === 'BLOCKING') !== hasBlocking ||
        (hasIncompleteLens && value.outcome !== 'INCONCLUSIVE') ||
        (value.outcome === 'INCONCLUSIVE' && !hasIncompleteLens)) {
        throw new Error('axis outcome is invalid');
    }
    return findings;
}

function metadataExemptions(plan, snapshot) {
    const mapping = {};
    for (const entry of snapshot.entries.filter(({kind}) => kind !== 'text')) {
        const exemption = plan.exemptions.find((candidate) => candidate.kind === entry.kind &&
            candidate.oldPath === entry.oldPath && candidate.newPath === entry.newPath &&
            AXES.every((axis) => candidate.axes.includes(axis)));
        if (exemption === undefined || exemption.id !== `metadata.${entry.kind}`) {
            throw new Error('metadata exemption is missing');
        }
        mapping[entry.kind] = exemption.id;
    }
    return mapping;
}

function resourceIndex(resources) {
    if (!Array.isArray(resources)) throw new Error('review resources are invalid');
    const index = new Map();
    for (const resource of resources) {
        if (index.has(resource.id) || typeof resource.text !== 'string') {
            throw new Error('review resources are invalid');
        }
        index.set(resource.id, {id: resource.id, text: resource.text});
    }
    return index;
}

function selectResources(index, ids) {
    const selected = [];
    const seen = new Set();
    for (const id of ids) {
        if (seen.has(id)) continue;
        const resource = index.get(id);
        if (resource === undefined) throw new Error('selected review resource is missing');
        seen.add(id);
        selected.push(resource);
    }
    return selected;
}

function sourceBytes(snapshot) {
    return snapshot.entries.reduce((total, entry) => total + entry.byteCount, 0);
}

function exposureRows(snapshot, axisLedgers) {
    return snapshot.entries.map((entry) => {
        const axes = {};
        for (const axis of AXES) {
            const record = axisLedgers.find((candidate) => candidate.axis === axis);
            if (record === undefined) {
                axes[axis] = 'NOT_RUN';
                continue;
            }
            const complete = record.ledger.isEntryComplete(entry.entryDigest);
            axes[axis] = entry.kind === 'text'
                ? (complete ? 'EXPOSED' : 'INCOMPLETE')
                : (complete ? 'EXEMPTED' : 'INCOMPLETE');
        }
        return {
            entryDigest: entry.entryDigest,
            status: entry.status,
            path: entry.path,
            kind: entry.kind,
            oldObjectId: entry.oldObjectId,
            newObjectId: entry.newObjectId,
            diffDigest: entry.diffDigest,
            axes,
        };
    });
}

function findingOrder(left, right) {
    const leftKey = [left.axis, left.path, left.side, String(left.line).padStart(12, '0'),
        left.lensId, left.fingerprint].join('\0');
    const rightKey = [right.axis, right.path, right.side, String(right.line).padStart(12, '0'),
        right.lensId, right.fingerprint].join('\0');
    return leftKey < rightKey ? -1 : leftKey > rightKey ? 1 : 0;
}

function safelyFresh(assertFresh, snapshot) {
    try {
        return assertFresh(snapshot) === true;
    } catch {
        return false;
    }
}

function subsetSnapshot(snapshot, findings) {
    const digests = new Set(findings.map(({entryDigest}) => entryDigest));
    return Object.freeze({
        ...snapshot,
        entries: Object.freeze(snapshot.entries.filter(({entryDigest}) => digests.has(entryDigest))),
        manifest: Object.freeze(snapshot.manifest.filter(({entryDigest}) => digests.has(entryDigest))),
    });
}

function sessionTimeout(requested, remaining) {
    const timeout = requested ?? LIMIT.SESSION_TIMEOUT_MS;
    if (!Number.isSafeInteger(timeout) || timeout < 1 || timeout > LIMIT.SESSION_TIMEOUT_MS) {
        throw new Error('session timeout is invalid');
    }
    if (remaining <= 0) return null;
    return Math.min(timeout, remaining);
}

async function verifyFindings(options) {
    if (options.findings.length === 0) {
        return {complete: true, uncertainBlocking: false, findings: [], chunks: 0, dispositions: []};
    }
    const sorted = [...options.findings].sort(findingOrder);
    const dispositions = [];
    let model = options.model;
    for (let offset = 0; offset < sorted.length; offset += LIMIT.VERIFIER_FINDINGS) {
        const remaining = options.remaining();
        if (remaining <= 0 || !safelyFresh(options.assertFresh, options.snapshot)) {
            return {complete: false, uncertainBlocking: true, findings: [], chunks: dispositions.length, dispositions, model};
        }
        const chunk = sorted.slice(offset, offset + LIMIT.VERIFIER_FINDINGS);
        const relevant = subsetSnapshot(options.snapshot, chunk);
        const toolSet = createSnapshotTools(relevant, {metadataExemptions: options.metadataExemptions});
        const schema = verifierSubmissionSchema(chunk.map(({fingerprint}) => fingerprint));
        const resources = selectResources(options.resourceIndex, [options.sessionSkill, ...options.verifierSkills]);
        const timeoutMs = sessionTimeout(options.timeoutMs, options.remaining());
        if (timeoutMs === null) {
            return {complete: false, uncertainBlocking: true, findings: [], chunks: dispositions.length, dispositions, model};
        }
        let result;
        try {
            result = await options.runSession({
                sessionType: 'verifier',
                axis: 'verifier',
                findings: chunk,
                snapshot: relevant,
                resources,
                evidence: {
                    schemaVersion: 1,
                    findings: chunk,
                    manifest: relevant.manifest,
                    exposure: options.exposure,
                },
                outputSchema: schema,
                tools: Object.values(toolSet.tools),
                submitToolName: 'submit_verification',
                validateSubmission: (value) => validateVerifierSubmission(value, chunk),
                validateSubmissionPrerequisites: () => {
                    if (!toolSet.ledger.isComplete()) {
                        throw new Error('verifier byte exposure is incomplete');
                    }
                },
                sourceBytes: sourceBytes(relevant),
                repositoryRoot: options.repositoryRoot,
                tempRoot: options.tempRoot,
                env: options.env,
                loadSdk: options.loadSdk,
                timeoutMs,
                active: options.active,
            });
        } catch {
            return {complete: false, uncertainBlocking: true, findings: [], chunks: Math.ceil((offset + 1) / LIMIT.VERIFIER_FINDINGS), dispositions, model};
        }
        if (result?.ok !== true || !toolSet.ledger.isComplete()) {
            return {complete: false, uncertainBlocking: true, findings: [], chunks: Math.ceil((offset + 1) / LIMIT.VERIFIER_FINDINGS), dispositions, model};
        }
        try {
            validateVerifierSubmission(result.submission, chunk);
        } catch {
            return {complete: false, uncertainBlocking: true, findings: [], chunks: Math.ceil((offset + 1) / LIMIT.VERIFIER_FINDINGS), dispositions, model};
        }
        for (const finding of chunk) {
            dispositions.push(result.submission.dispositions.find(
                ({fingerprint}) => fingerprint === finding.fingerprint
            ));
        }
        model ??= result.model;
    }
    const dispositionByFingerprint = new Map(dispositions.map((item) => [item.fingerprint, item]));
    let uncertainBlocking = false;
    const confirmed = [];
    for (const finding of sorted) {
        const disposition = dispositionByFingerprint.get(finding.fingerprint);
        if (disposition.disposition === 'CONFIRMED') {
            confirmed.push(finding);
        } else if (['NEEDS_CONTEXT', 'INVALID_LOCATION'].includes(disposition.disposition) &&
            finding.classification === 'BLOCKING') {
            uncertainBlocking = true;
        } else if (disposition.disposition === 'DUPLICATE') {
            const visited = new Set([finding.fingerprint]);
            let target = disposition.duplicateOf;
            while (!visited.has(target) && dispositionByFingerprint.get(target)?.disposition === 'DUPLICATE') {
                visited.add(target);
                target = dispositionByFingerprint.get(target).duplicateOf;
            }
            if ((visited.has(target) || dispositionByFingerprint.get(target)?.disposition !== 'CONFIRMED') &&
                finding.classification === 'BLOCKING') {
                uncertainBlocking = true;
            }
        }
    }
    return {
        complete: true,
        uncertainBlocking,
        findings: confirmed.sort(findingOrder),
        chunks: Math.ceil(sorted.length / LIMIT.VERIFIER_FINDINGS),
        dispositions,
        model,
    };
}

function scopeValue(snapshot) {
    return {
        mode: snapshot.mode,
        baseCommit: snapshot.baseCommit,
        headCommit: snapshot.headCommit,
        ...(snapshot.path === undefined ? {} : {path: snapshot.path}),
    };
}

function reportValue(options, state) {
    const axes = AXES.map((axisId) => state.axes.find(({id}) => id === axisId) ?? {
        id: axisId,
        status: 'NOT_RUN',
        outcome: 'INCONCLUSIVE',
        reason: 'PRIOR_AXIS_INCONCLUSIVE',
    });
    const lenses = options.plan.axes.flatMap((axis) => axis.lenses.map((lens) =>
        state.lenses.find((record) => record.axis === axis.id && record.id === lens.id) ?? {
            axis: axis.id,
            id: lens.id,
            package: lens.package,
            status: 'INCONCLUSIVE',
        }));
    const report = {
        schemaVersion: 1,
        command: options.command,
        authoritative: state.authoritative,
        sourceClass: options.sourceClass,
        outcome: state.outcome,
        scope: scopeValue(options.snapshot),
        model: state.model ?? null,
        policyDigest: options.plan.policyDigest,
        planDigest: options.plan.planDigest,
        manifestDigest: options.snapshot.manifestDigest,
        axes,
        byteExposure: exposureRows(options.snapshot, state.axisLedgers),
        lenses,
        exemptions: options.plan.exemptions,
        findings: state.findings,
        verifier: state.verifier,
        limits: LIMIT,
    };
    if (state.authoritative) report.criteriaExposure = state.criteriaSet.ledger.report();
    return report;
}

function criteriaEvidence(criteriaSet) {
    const report = criteriaSet.ledger.report();
    return {
        disposition: report.disposition,
        sources: report.sources,
    };
}

function criteriaIncompleteReason(axisId, toolSet, criteriaSet) {
    return axisId === 'requirement-coverage' && criteriaSet !== null &&
        toolSet.ledger.isComplete() && !criteriaSet.ledger.isComplete()
        ? 'CRITERIA_EXPOSURE_INCOMPLETE'
        : null;
}

function axisIncompleteReason(axisId, toolSet, criteriaSet) {
    if (!toolSet.ledger.isComplete()) return 'BYTE_EXPOSURE_INCOMPLETE';
    return criteriaIncompleteReason(axisId, toolSet, criteriaSet);
}

async function runReviewAttempt(options, authority = null) {
    if (options.authoritative === true && authority !== AUTHORITATIVE) {
        throw new Error('authoritative review interface is required');
    }
    const runSession = options.runSession ?? runIsolatedSession;
    const assertFresh = options.assertFresh ?? snapshotIsFresh;
    const now = options.now ?? Date.now;
    const reviewTimeoutMs = options.reviewTimeoutMs ?? LIMIT.REVIEW_TIMEOUT_MS;
    if (!Number.isSafeInteger(reviewTimeoutMs) || reviewTimeoutMs < 1 ||
        reviewTimeoutMs > LIMIT.REVIEW_TIMEOUT_MS) {
        throw new Error('review timeout is invalid');
    }
    const deadline = now() + reviewTimeoutMs;
    const remaining = () => deadline - now();
    const authoritative = options.authoritative === true;
    if (authoritative && options.criteria === undefined) {
        throw new Error('authoritative criteria are required');
    }
    const criteriaSet = authoritative ? createCriteriaTools(options.criteria) : null;
    const state = {
        outcome: 'INCONCLUSIVE',
        authoritative,
        criteriaSet,
        model: options.model ?? null,
        axes: [],
        axisLedgers: [],
        lenses: [],
        findings: [],
        verifier: {complete: false, chunks: 0, dispositions: []},
    };
    let index;
    let exemptions;
    try {
        index = resourceIndex(options.resources);
        exemptions = metadataExemptions(options.plan, options.snapshot);
    } catch {
        return reportValue(options, state);
    }
    const proposed = [];
    for (const axisId of AXES) {
        const axis = options.plan.axes.find(({id}) => id === axisId);
        const remainingMs = remaining();
        if (remainingMs <= 0 || axis === undefined || !safelyFresh(assertFresh, options.snapshot)) {
            state.axes.push({
                id: axisId,
                status: 'INCONCLUSIVE',
                outcome: 'INCONCLUSIVE',
                reason: remainingMs <= 0 ? 'REVIEW_TIMEOUT' : 'SNAPSHOT_STALE',
            });
            return reportValue(options, state);
        }
        const toolSet = createSnapshotTools(options.snapshot, {metadataExemptions: exemptions});
        const requirementCriteria = axisId === 'requirement-coverage' ? criteriaSet : null;
        const timeoutMs = sessionTimeout(options.timeoutMs, remaining());
        if (timeoutMs === null) {
            state.axes.push({
                id: axisId,
                status: 'INCONCLUSIVE',
                outcome: 'INCONCLUSIVE',
                reason: 'REVIEW_TIMEOUT',
            });
            return reportValue(options, state);
        }
        let result;
        try {
            const schema = axisSubmissionSchema(axis.id, axis.lenses.map(({id}) => id));
            result = await runSession({
                sessionType: 'axis',
                axis: axis.id,
                lenses: axis.lenses,
                snapshot: options.snapshot,
                resources: selectResources(index, [options.sessionSkill, ...axis.lenses.map(({skill}) => skill)]),
                evidence: {
                    schemaVersion: 1,
                    axis: axis.id,
                    lenses: axis.lenses,
                    manifest: options.snapshot.manifest,
                    ...(requirementCriteria === null
                        ? {}
                        : {criteria: criteriaEvidence(requirementCriteria)}),
                },
                outputSchema: schema,
                tools: [
                    ...Object.values(toolSet.tools),
                    ...(requirementCriteria === null
                        ? []
                        : Object.values(requirementCriteria.tools)),
                ],
                submitToolName: 'submit_review',
                validateSubmission: (value) => validateAxisSubmission(value, axis, options.snapshot),
                validateSubmissionPrerequisites: () => {
                    if (!toolSet.ledger.isComplete()) throw new Error('axis byte exposure is incomplete');
                    if (requirementCriteria !== null && !requirementCriteria.ledger.isComplete()) {
                        throw new Error('criteria exposure is incomplete');
                    }
                },
                sourceBytes: sourceBytes(options.snapshot) + (requirementCriteria === null
                    ? 0
                    : requirementCriteria.ledger.report().sources.reduce(
                        (total, source) => total + source.byteCount,
                        0
                    )),
                repositoryRoot: options.repositoryRoot,
                tempRoot: options.tempRoot,
                env: options.env,
                loadSdk: options.loadSdk,
                timeoutMs,
                active: options.active,
            });
        } catch {
            const reason = criteriaIncompleteReason(axisId, toolSet, criteriaSet) ?? 'AXIS_SESSION_FAILED';
            state.axes.push({id: axisId, status: 'INCONCLUSIVE', outcome: 'INCONCLUSIVE', reason});
            state.axisLedgers.push({axis: axisId, ledger: toolSet.ledger});
            return reportValue(options, state);
        }
        if (result?.ok !== true) {
            state.axes.push({
                id: axisId,
                status: 'INCONCLUSIVE',
                outcome: 'INCONCLUSIVE',
                reason: criteriaIncompleteReason(axisId, toolSet, criteriaSet) ??
                    result?.reason ?? 'AXIS_SESSION_FAILED',
            });
            state.axisLedgers.push({axis: axisId, ledger: toolSet.ledger});
            return reportValue(options, state);
        }
        if (!safelyFresh(assertFresh, options.snapshot)) {
            state.axes.push({
                id: axisId,
                status: 'INCONCLUSIVE',
                outcome: 'INCONCLUSIVE',
                reason: 'SNAPSHOT_STALE',
            });
            state.axisLedgers.push({axis: axisId, ledger: toolSet.ledger});
            return reportValue(options, state);
        }
        state.model ??= result.model;
        let normalized;
        try {
            normalized = validateAxisSubmission(result.submission, axis, options.snapshot);
        } catch {
            state.axes.push({id: axisId, status: 'INCONCLUSIVE', outcome: 'INCONCLUSIVE', reason: 'AXIS_SUBMISSION_INVALID'});
            state.axisLedgers.push({axis: axisId, ledger: toolSet.ledger});
            return reportValue(options, state);
        }
        const incompleteReason = axisIncompleteReason(axisId, toolSet, criteriaSet);
        state.axisLedgers.push({axis: axisId, ledger: toolSet.ledger});
        if (incompleteReason !== null) {
            state.axes.push({id: axisId, status: 'INCONCLUSIVE', outcome: 'INCONCLUSIVE', reason: incompleteReason});
            return reportValue(options, state);
        }
        for (const selected of axis.lenses) {
            const lens = result.submission.lenses.find(({id}) => id === selected.id);
            state.lenses.push({axis: axisId, id: selected.id, package: selected.package, status: lens.status});
        }
        state.axes.push({id: axisId, status: 'COMPLETE', outcome: result.submission.outcome, reason: null});
        proposed.push(...normalized);
        if (result.submission.outcome === 'INCONCLUSIVE') return reportValue(options, state);
        if (proposed.length > LIMIT.REVIEW_FINDINGS ||
            Buffer.byteLength(JSON.stringify(proposed), 'utf8') > LIMIT.OUTPUT_BYTES) {
            state.axes[state.axes.length - 1] = {
                id: axisId, status: 'INCONCLUSIVE', outcome: 'INCONCLUSIVE', reason: 'FINDING_LIMIT_EXCEEDED',
            };
            return reportValue(options, state);
        }
    }
    const exposure = exposureRows(options.snapshot, state.axisLedgers);
    let verified;
    try {
        verified = await verifyFindings({
            findings: proposed,
            snapshot: options.snapshot,
            exposure,
            resourceIndex: index,
            sessionSkill: options.sessionSkill,
            verifierSkills: options.verifierSkills,
            metadataExemptions: exemptions,
            runSession,
            assertFresh,
            repositoryRoot: options.repositoryRoot,
            tempRoot: options.tempRoot,
            env: options.env,
            loadSdk: options.loadSdk,
            timeoutMs: options.timeoutMs,
            active: options.active,
            model: state.model,
            remaining,
        });
    } catch {
        return reportValue(options, state);
    }
    state.model ??= verified.model;
    state.verifier = {
        complete: verified.complete,
        chunks: verified.chunks,
        dispositions: verified.dispositions,
    };
    state.findings = verified.findings;
    if (!verified.complete || verified.uncertainBlocking || remaining() <= 0 ||
        !safelyFresh(assertFresh, options.snapshot)) {
        state.outcome = 'INCONCLUSIVE';
    } else {
        state.outcome = state.findings.some(({classification}) => classification === 'BLOCKING')
            ? 'BLOCKING'
            : 'PASS';
    }
    return reportValue(options, state);
}

function runAuthoritativeAttempt(options) {
    return runReviewAttempt({...options, authoritative: true}, AUTHORITATIVE);
}

module.exports = {runAuthoritativeAttempt, runReviewAttempt, validateAxisSubmission, verifyFindings};

// vim: ft=javascript sts=4 sw=4 ts=4 et :
