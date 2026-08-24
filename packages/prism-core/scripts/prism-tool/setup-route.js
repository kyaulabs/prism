// $KYAULabs: setup-route.js kyau@aura.kyaulabs 2026/08/24 -0700 Exp $

'use strict';

const {DISPOSITION, classifySetupEntry} = require('./setup-entry');

const ROUTE = Object.freeze({
    SELECT_SOURCE: 'SELECT_SOURCE',
    ESTABLISHED_SETUP: 'ESTABLISHED_SETUP',
    STOP: 'STOP',
});

const MESSAGES = Object.freeze({
    EMPTY_ROOT: 'canonical project root is strictly empty',
    NON_EMPTY_ROOT: 'canonical project root contains established project entries',
    EXISTING_REPOSITORY: 'canonical project root contains existing repository state',
    CONTAINING_WORKTREE: 'canonical project root belongs to a containing worktree',
    UNSAFE_ROOT: 'project root path kind is unsafe',
    UNSAFE_GIT_STATE: 'Git state path kind is unsafe',
    INDETERMINATE: 'project root state is indeterminate',
});

function inspectSetupRoute({projectRoot}) {
    const entry = classifySetupEntry({projectRoot});
    const conflict = entry.disposition === DISPOSITION.CONFLICT;
    const route = entry.disposition === DISPOSITION.STRICT_EMPTY
        ? ROUTE.SELECT_SOURCE
        : entry.disposition === DISPOSITION.ESTABLISHED
            ? ROUTE.ESTABLISHED_SETUP
            : ROUTE.STOP;
    return {
        schemaVersion: 1,
        command: 'setup route',
        status: conflict ? 'NO-GO' : 'GO',
        disposition: entry.disposition,
        source: null,
        route,
        reason: entry.reason,
        projectRoot: entry.projectRoot,
        checks: [{
            id: 'setup-entry',
            status: conflict ? 'FAIL' : 'PASS',
            message: MESSAGES[entry.reason],
        }],
    };
}

module.exports = {ROUTE, inspectSetupRoute};

// vim: ft=javascript sts=4 sw=4 ts=4 et :
