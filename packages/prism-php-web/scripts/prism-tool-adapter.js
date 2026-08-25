// $KYAULabs: prism-tool-adapter.js kyau@aura.kyaulabs 2026/08/24 -0700 Exp $

'use strict';

const path = require('node:path');
const {
    renderBootstrapScaffold,
    runBootstrapQuality,
    verifyBootstrapScaffold,
} = require('./toolchain/bootstrap-scaffold');
const {inspect, resolveTool} = require('./toolchain/project');
const {
    applyCandidate,
    installBootstrapDependencies,
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

function prepareBootstrapProject(options) {
    return renderBootstrapScaffold({
        packageRoot: path.resolve(__dirname, '..'),
        candidateRoot: options.candidateRoot,
        request: options.request,
        contract: options.contract,
        run: options.run,
    });
}

function resolve(options) {
    return resolveCandidate(options);
}

function verify(options) {
    return verifyInstalledProject(options);
}

function verifyBootstrapProject(options) {
    return verifyBootstrapScaffold({
        ...options,
        packageRoot: path.resolve(__dirname, '..'),
    });
}

module.exports = {
    apply,
    bootstrapProtocol,
    inspect,
    installBootstrapDependencies,
    prepareBootstrapProject,
    resolve,
    resolveTool,
    runBootstrapQuality,
    verify,
    verifyBootstrapProject,
};

// vim: ft=javascript sts=4 sw=4 ts=4 et :
