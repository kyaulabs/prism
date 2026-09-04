// $KYAULabs: setup-route.js kyau@aura.kyaulabs 2026/09/01 -0700 Exp $

'use strict';

const {DISPOSITION, REASON, classifySetupEntry} = require('./setup-entry');

const SOURCE = Object.freeze({
    TEMPLATE: 'TEMPLATE',
    BLANK: 'BLANK',
    CANCEL: 'CANCEL',
});

const ROUTE = Object.freeze({
    SELECT_SOURCE: 'SELECT_SOURCE',
    BOOTSTRAP_TEMPLATE: 'BOOTSTRAP_TEMPLATE',
    BOOTSTRAP_BLANK: 'BOOTSTRAP_BLANK',
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
    SOURCE_REQUIRES_STRICT_EMPTY: 'empty-project source selection requires a strict-empty root',
});

function routeFor(source) {
    if (source === SOURCE.TEMPLATE) return ROUTE.BOOTSTRAP_TEMPLATE;
    if (source === SOURCE.BLANK) return ROUTE.BOOTSTRAP_BLANK;
    if (source === SOURCE.CANCEL) return ROUTE.STOP;
    return ROUTE.SELECT_SOURCE;
}

function report(entry, source, route) {
    const conflict = entry.disposition === DISPOSITION.CONFLICT;
    return {
        schemaVersion: 2,
        command: 'setup route',
        status: conflict ? 'NO-GO' : 'GO',
        disposition: entry.disposition,
        automationApplicability: conflict ? null : entry.automationApplicability,
        source,
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

function inspectSetupRoute({projectRoot, source = null}) {
    if (source !== null && !Object.values(SOURCE).includes(source)) {
        throw new Error('setup source is invalid');
    }
    const entry = classifySetupEntry({projectRoot});
    if (entry.disposition === DISPOSITION.CONFLICT) return report(entry, null, ROUTE.STOP);
    if (entry.disposition === DISPOSITION.ESTABLISHED) {
        if (source === null) return report(entry, null, ROUTE.ESTABLISHED_SETUP);
        return report({
            ...entry,
            disposition: DISPOSITION.CONFLICT,
            reason: REASON.SOURCE_REQUIRES_STRICT_EMPTY,
        }, null, ROUTE.STOP);
    }
    return report(entry, source, routeFor(source));
}

module.exports = {ROUTE, SOURCE, inspectSetupRoute};

// vim: ft=javascript sts=4 sw=4 ts=4 et :
