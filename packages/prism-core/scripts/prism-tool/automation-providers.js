// $KYAULabs: automation-providers.js kyau@aura.kyaulabs 2026/09/01 -0700 Exp $

'use strict';

const path = require('node:path');
const {renderRepositoryReleaseProvider} = require('./bootstrap-release-provider');
const {
    readCoreManifest,
    readRegular,
    writeCandidate,
} = require('./bootstrap-providers');

const BACK_MERGE_PATH = '.github/workflows/back-merge.yml';

function renderCoreAutomationProvider({coreRoot, candidateRoot}) {
    const manifest = readCoreManifest(coreRoot);
    const contents = readRegular(
        path.join(coreRoot, 'config', 'automation', 'back-merge.yml'),
        'back-merge workflow',
        0o644
    );
    const output = writeCandidate(candidateRoot, BACK_MERGE_PATH, contents, 0o644);
    return Object.freeze({
        schemaVersion: 1,
        provider: Object.freeze({
            id: 'core-repository-automation',
            packageName: '@kyaulabs/prism-core',
            packageVersion: manifest.version,
            protocolVersion: 1,
        }),
        status: 'GO',
        outputs: Object.freeze([output]),
        effects: Object.freeze([]),
        checks: Object.freeze([Object.freeze({
            id: 'core-repository-automation-render',
            status: 'PASS',
            message: 'Core repository automation candidate files were rendered',
        })]),
        verification: Object.freeze([Object.freeze({
            id: 'core-repository-automation-inventory',
            command: 'setup project validate',
        })]),
    });
}

function renderCoreReleaseProvider({coreRoot, candidateRoot, repository}) {
    return renderRepositoryReleaseProvider({
        coreRoot,
        candidateRoot,
        repository,
        providerId: 'core-repository-release',
    });
}

module.exports = {renderCoreAutomationProvider, renderCoreReleaseProvider};

// vim: ft=javascript sts=4 sw=4 ts=4 et :
