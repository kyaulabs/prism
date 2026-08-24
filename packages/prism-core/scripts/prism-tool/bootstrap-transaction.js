// $KYAULabs: bootstrap-transaction.js kyau@aura.kyaulabs 2026/08/24 -0700 Exp $

'use strict';

const fs = require('node:fs');
const path = require('node:path');
const {
    readBootstrapJournal,
    transitionBootstrapJournal,
} = require('./bootstrap-journal');
const {validateBootstrapProjectPlan} = require('./bootstrap-plan');

function assertOwnedDirectory(directoryPath, expectedMode = 0o700) {
    const stat = fs.lstatSync(directoryPath);
    if (
        stat.isSymbolicLink() ||
        !stat.isDirectory() ||
        (stat.mode & 0o777) !== expectedMode ||
        fs.realpathSync(directoryPath) !== directoryPath
    ) {
        throw new Error('bootstrap attempt directory is invalid');
    }
    return {dev: stat.dev, ino: stat.ino};
}

function removePreparedAttempt(projectRoot, attemptId) {
    const piRoot = path.join(projectRoot, '.pi');
    const prismRoot = path.join(piRoot, 'prism-tool');
    const bootstrapRoot = path.join(prismRoot, 'bootstrap');
    const attemptRoot = path.join(bootstrapRoot, attemptId);
    if (
        fs.readdirSync(projectRoot).join(',') !== '.pi' ||
        fs.readdirSync(piRoot).join(',') !== 'prism-tool' ||
        fs.readdirSync(prismRoot).join(',') !== 'bootstrap' ||
        fs.readdirSync(bootstrapRoot).join(',') !== attemptId
    ) {
        throw new Error('bootstrap project root changed');
    }
    const identities = [
        [piRoot, assertOwnedDirectory(piRoot)],
        [prismRoot, assertOwnedDirectory(prismRoot)],
        [bootstrapRoot, assertOwnedDirectory(bootstrapRoot)],
        [attemptRoot, assertOwnedDirectory(attemptRoot)],
    ];
    for (const [directoryPath, identity] of identities) {
        const current = fs.lstatSync(directoryPath);
        if (current.dev !== identity.dev || current.ino !== identity.ino) {
            throw new Error('bootstrap attempt directory changed');
        }
    }
    fs.rmSync(attemptRoot, {recursive: true});
    fs.rmdirSync(bootstrapRoot);
    fs.rmdirSync(prismRoot);
    fs.rmdirSync(piRoot);
    if (fs.readdirSync(projectRoot).length !== 0) {
        throw new Error('bootstrap project root is not empty');
    }
}

function recoverBootstrapProject({projectRoot: requestedRoot, coreRoot, attemptId, planDigest}) {
    const projectRoot = fs.realpathSync(requestedRoot);
    const journal = readBootstrapJournal({projectRoot, attemptId});
    if (journal.planDigest !== planDigest) throw new Error('bootstrap journal is stale');
    try {
        validateBootstrapProjectPlan({projectRoot, coreRoot, attemptId, planDigest});
        removePreparedAttempt(projectRoot, attemptId);
    } catch (error) {
        transitionBootstrapJournal({
            projectRoot,
            attemptId,
            expectedPhase: 'PREPARED',
            next: {
                ...journal,
                status: 'RECOVERY_REQUIRED',
                reason: 'ROOT_STATE_CHANGED',
                resumePhase: 'MANUAL_RECOVERY',
            },
        });
        throw error;
    }
    return Object.freeze({
        status: 'GO',
        disposition: 'ROOT_RESTORED',
        checks: Object.freeze([Object.freeze({
            id: 'bootstrap-project-recovery',
            status: 'PASS',
            message: 'prepared bootstrap project state was removed',
        })]),
        data: Object.freeze({
            attempt: Object.freeze({id: attemptId}),
            resumePhase: null,
        }),
    });
}

module.exports = {recoverBootstrapProject};

// vim: ft=javascript sts=4 sw=4 ts=4 et :
