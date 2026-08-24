// $KYAULabs: prism-tool-adapter.js kyau@aura.kyaulabs 2026/08/24 -0700 Exp $

'use strict';

const {inspect, resolveTool} = require('./toolchain/project');
const {
    applyCandidate,
    resolveCandidate,
    verifyInstalledProject,
} = require('./toolchain/transaction');
const {recoverWorkspace} = require('./toolchain/workspace');

const bootstrapProtocol = 1;

function apply(options) {
    if (options.approved !== true) {
        recoverWorkspace({projectRoot: options.projectRoot, adapter: options.contract.package});
        return {
            status: 'NO-GO',
            checks: [{id: 'candidate-application', status: 'FAIL', message: 'mutation approval required'}],
            data: {reason: 'approval required'},
        };
    }
    return applyCandidate(options);
}

function resolve(options) {
    return resolveCandidate(options);
}

function verify(options) {
    return verifyInstalledProject(options);
}

module.exports = {apply, bootstrapProtocol, inspect, resolve, resolveTool, verify};

// vim: ft=javascript sts=4 sw=4 ts=4 et :
