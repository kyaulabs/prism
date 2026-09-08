// $KYAULabs: established-project-provider.js kyau@aura.kyaulabs 2026/09/04 -0700 Exp $

'use strict';

const {readCoreManifest, writeCandidate} = require('./bootstrap-providers');
const {renderProjectManifest} = require('./project-manifest');

function renderEstablishedProjectProvider({
    coreRoot,
    candidateRoot,
    metadata,
    capabilities,
    adapter,
    schemaVersion = 2,
    source = {mode: 'ESTABLISHED', evidence: null},
}) {
    const manifest = readCoreManifest(coreRoot);
    const output = writeCandidate(
        candidateRoot,
        '.prism/project.json',
        renderProjectManifest({
            schemaVersion,
            source,
            capabilities,
            metadata,
            coreVersion: manifest.version,
            adapter,
        }),
        0o644
    );
    return Object.freeze({
        schemaVersion: 1,
        provider: Object.freeze({
            id: 'core-project-manifest',
            packageName: '@kyaulabs/prism-core',
            packageVersion: manifest.version,
            protocolVersion: 1,
        }),
        status: 'GO',
        outputs: Object.freeze([output]),
        effects: Object.freeze([]),
        checks: Object.freeze([Object.freeze({
            id: 'core-project-manifest-render',
            status: 'PASS',
            message: 'established project manifest candidate was rendered',
        })]),
        verification: Object.freeze([]),
    });
}

module.exports = {renderEstablishedProjectProvider};

// vim: ft=javascript sts=4 sw=4 ts=4 et :
