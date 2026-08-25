// $KYAULabs: bootstrap-status.js kyau@aura.kyaulabs 2026/08/25 -0700 Exp $

'use strict';

const fs = require('node:fs');
const path = require('node:path');
const {inspectProvisionedBootstrapAttempt} = require('./bootstrap-adapter');
const {readBootstrapJournal} = require('./bootstrap-journal');

const ATTEMPT_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const BASE_ATTEMPT_ENTRIES = Object.freeze([
    'candidate',
    'journal.json',
    'plan',
    'reports',
]);

function noActiveBootstrap(projectRoot) {
    return {
        schemaVersion: 1,
        command: 'setup project status',
        status: 'GO',
        disposition: 'NO_ACTIVE_BOOTSTRAP',
        projectRoot,
        checks: [{
            id: 'bootstrap-status',
            status: 'PASS',
            message: 'no active empty-project bootstrap attempt exists',
        }],
        data: null,
    };
}

function recoveryRequired(projectRoot) {
    return {
        schemaVersion: 1,
        command: 'setup project status',
        status: 'NO-GO',
        disposition: 'RECOVERY_REQUIRED',
        projectRoot,
        checks: [{
            id: 'bootstrap-status',
            status: 'FAIL',
            message: 'active empty-project bootstrap state is ambiguous or unsafe',
        }],
        data: {
            attempt: null,
            source: null,
            adapter: null,
            planDigest: null,
            phase: 'UNKNOWN',
            resumePhase: 'MANUAL_RECOVERY',
            retainedState: 'ambiguous bootstrap operational state',
            blockingCondition: 'ACTIVE_BOOTSTRAP_STATE_INVALID',
            nextAction: 'Inspect the retained .pi/prism-tool/bootstrap state before rerunning setup.',
        },
    };
}

function activeReport({projectRoot, disposition, data, message}) {
    return {
        schemaVersion: 1,
        command: 'setup project status',
        status: 'GO',
        disposition,
        projectRoot,
        checks: [{id: 'bootstrap-status', status: 'PASS', message}],
        data,
    };
}

function inspectAttemptRoot(bootstrapRoot) {
    const root = fs.lstatSync(bootstrapRoot);
    if (root.isSymbolicLink() || !root.isDirectory()) {
        throw new Error('bootstrap status root is invalid');
    }
    const entries = fs.readdirSync(bootstrapRoot, {withFileTypes: true});
    if (
        entries.length !== 1 ||
        !ATTEMPT_ID.test(entries[0].name) ||
        entries[0].isSymbolicLink() ||
        !entries[0].isDirectory()
    ) {
        throw new Error('bootstrap status attempt is ambiguous');
    }
    return entries[0].name;
}

function inspectBootstrapStatus({projectRoot: requestedRoot, coreRoot}) {
    let projectRoot;
    try {
        projectRoot = fs.realpathSync(requestedRoot);
    } catch {
        return recoveryRequired(path.resolve(requestedRoot));
    }
    const bootstrapRoot = path.join(projectRoot, '.pi', 'prism-tool', 'bootstrap');
    try {
        if (fs.lstatSync(bootstrapRoot, {throwIfNoEntry: false}) === undefined) {
            return noActiveBootstrap(projectRoot);
        }
    } catch {
        return recoveryRequired(projectRoot);
    }
    try {
        const attemptId = inspectAttemptRoot(bootstrapRoot);
        const attemptRoot = path.join(bootstrapRoot, attemptId);
        const entries = fs.readdirSync(attemptRoot).sort();
        if (entries.join(',') === 'adapter.json') {
            const selected = inspectProvisionedBootstrapAttempt({
                projectRoot,
                coreRoot,
                attemptId,
            });
            return activeReport({
                projectRoot,
                disposition: 'ADAPTER_PROVISIONED',
                message: 'one provisional bootstrap adapter attempt is resumable',
                data: {
                    attempt: {id: attemptId},
                    source: selected.receipt.source,
                    adapter: selected.adapter,
                    planDigest: null,
                    phase: 'PROVISIONED',
                    resumePhase: 'SOURCE_INSPECTION',
                    retainedState: 'provisional adapter package and project-local activation',
                    blockingCondition: null,
                    nextAction: 'Continue strict-empty source and metadata selection.',
                },
            });
        }
        if (!entries.includes('journal.json')) {
            throw new Error('bootstrap status attempt is unsupported');
        }
        const journal = readBootstrapJournal({projectRoot, attemptId});
        const expectedEntries = [...BASE_ATTEMPT_ENTRIES];
        if (journal.adapter !== null) expectedEntries.push('adapter.json');
        if (journal.seed !== null) expectedEntries.push('seed-attestation.json');
        if (
            entries.length !== expectedEntries.length ||
            entries.some((entry) => !expectedEntries.includes(entry))
        ) {
            throw new Error('bootstrap status attempt is unsupported');
        }
        if (
            journal.status === 'RECOVERY_REQUIRED' &&
            journal.resumePhase === 'MANUAL_RECOVERY'
        ) {
            return {
                schemaVersion: 1,
                command: 'setup project status',
                status: 'NO-GO',
                disposition: 'RECOVERY_REQUIRED',
                projectRoot,
                checks: [{
                    id: 'bootstrap-status',
                    status: 'FAIL',
                    message: 'one bootstrap attempt requires manual recovery',
                }],
                data: {
                    attempt: {id: attemptId},
                    source: journal.source.mode,
                    adapter: journal.adapter,
                    planDigest: journal.planDigest,
                    phase: journal.phase,
                    resumePhase: journal.resumePhase,
                    retainedState: 'project and bootstrap attempt evidence retained for inspection',
                    blockingCondition: journal.reason,
                    nextAction: 'Inspect the retained project and bootstrap attempt state before retrying setup.',
                },
            };
        }
        if (
            journal.phase === 'PREPARED' &&
            journal.status === 'ACTIVE' &&
            journal.resumePhase === 'PROJECT_APPLICATION'
        ) {
            return activeReport({
                projectRoot,
                disposition: 'PLAN_READY',
                message: 'one prepared bootstrap project plan is resumable',
                data: {
                    attempt: {id: attemptId},
                    source: journal.source.mode,
                    adapter: journal.adapter,
                    planDigest: journal.planDigest,
                    phase: journal.phase,
                    resumePhase: journal.resumePhase,
                    retainedState: 'private candidate plan and strict-empty transaction state',
                    blockingCondition: null,
                    nextAction: 'Revalidate and display the retained plan before requesting approval.',
                },
            });
        }
        if (
            journal.phase === 'DURABLE' &&
            journal.status === 'ACTIVE' &&
            (
                ['BOOTSTRAP_DEPENDENCIES', 'BOOTSTRAP_VERIFICATION'].includes(
                    journal.resumePhase
                ) ||
                /^PROVIDER_(?:EFFECT|VERIFICATION):[a-z0-9][a-z0-9-]*$/.test(
                    journal.resumePhase
                )
            )
        ) {
            return activeReport({
                projectRoot,
                disposition: 'PROJECT_DURABLE',
                message: 'one durable bootstrap project has a resumable post-application phase',
                data: {
                    attempt: {id: attemptId},
                    source: journal.source.mode,
                    adapter: journal.adapter,
                    planDigest: journal.planDigest,
                    phase: journal.phase,
                    resumePhase: journal.resumePhase,
                    retainedState: 'complete durable project with pending post-application effects',
                    blockingCondition: null,
                    nextAction: 'Resume the exact retained phase through bootstrap project application.',
                },
            });
        }
        if (
            journal.phase === 'DURABLE' &&
            journal.status === 'ACTIVE' &&
            journal.resumePhase === 'REPOSITORY_BOOTSTRAP'
        ) {
            return activeReport({
                projectRoot,
                disposition: 'PROJECT_DURABLE',
                message: 'one durable bootstrap project is ready for repository creation',
                data: {
                    attempt: {id: attemptId},
                    source: journal.source.mode,
                    adapter: journal.adapter,
                    planDigest: journal.planDigest,
                    phase: journal.phase,
                    resumePhase: journal.resumePhase,
                    retainedState: 'complete durable project without repository state',
                    blockingCondition: null,
                    nextAction: 'Create the deterministic local repository for this bootstrap attempt.',
                },
            });
        }
        if (
            journal.phase === 'POST_APPLICATION' &&
            journal.status === 'ACTIVE' &&
            journal.resumePhase === 'HOOK_ACTIVATION'
        ) {
            return activeReport({
                projectRoot,
                disposition: 'REPOSITORY_CREATED',
                message: 'one bootstrap repository is ready for hook activation',
                data: {
                    attempt: {id: attemptId},
                    source: journal.source.mode,
                    adapter: journal.adapter,
                    planDigest: journal.planDigest,
                    phase: journal.phase,
                    resumePhase: journal.resumePhase,
                    retainedState: 'durable project with a fresh unborn develop repository',
                    blockingCondition: null,
                    nextAction: 'Inspect and separately approve canonical hook activation.',
                },
            });
        }
        if (
            journal.phase === 'POST_APPLICATION' &&
            journal.status === 'ACTIVE' &&
            journal.resumePhase === 'ROOT_SEED_PREPARATION'
        ) {
            return activeReport({
                projectRoot,
                disposition: 'HOOKS_ACTIVE',
                message: 'one bootstrap repository is ready for root-seed preparation',
                data: {
                    attempt: {id: attemptId},
                    source: journal.source.mode,
                    adapter: journal.adapter,
                    planDigest: journal.planDigest,
                    phase: journal.phase,
                    resumePhase: journal.resumePhase,
                    retainedState: 'durable project with active canonical hooks',
                    blockingCondition: null,
                    nextAction: 'Prepare and verify the exact staged root-seed inventory.',
                },
            });
        }
        if (
            journal.phase === 'POST_APPLICATION' &&
            journal.status === 'ACTIVE' &&
            journal.resumePhase === 'ROOT_SEED_COMMIT'
        ) {
            return activeReport({
                projectRoot,
                disposition: 'SEED_READY',
                message: 'one bootstrap root seed is ready for exclusive commit creation',
                data: {
                    attempt: {id: attemptId},
                    source: journal.source.mode,
                    adapter: journal.adapter,
                    planDigest: journal.planDigest,
                    phase: journal.phase,
                    resumePhase: journal.resumePhase,
                    retainedState: 'verified staged inventory and one-use seed attestation',
                    blockingCondition: null,
                    nextAction: 'Create the exclusive signed root seed without retrying on failure.',
                },
            });
        }
        throw new Error('bootstrap status phase is unsupported');
    } catch {
        return recoveryRequired(projectRoot);
    }
}

module.exports = {inspectBootstrapStatus};

// vim: ft=javascript sts=4 sw=4 ts=4 et :
