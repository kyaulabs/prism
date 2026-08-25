// $KYAULabs: bootstrap-release-provider.js kyau@aura.kyaulabs 2026/08/25 -0700 Exp $

'use strict';

const path = require('node:path');
const {validateNormalizedProjectMetadata} = require('./bootstrap-metadata');
const {
    readCoreManifest,
    readRegular,
    writeCandidate,
} = require('./bootstrap-providers');
const {validateBootstrapSource} = require('./bootstrap-source');
const {renderReleaseCapabilityFiles} = require('./package-release');

const REPOSITORY_TOKEN = '{{REPOSITORY_COORDINATE}}';
const RELEASE_MANAGEMENT_OUTPUTS = Object.freeze([
    'CHANGELOG.md',
    'cliff.toml',
    '.github/workflows/release.yml',
    '.prism/release.json',
]);

function validateRequest(request) {
    if (
        request === null ||
        typeof request !== 'object' ||
        Array.isArray(request) ||
        request.schemaVersion !== 1 ||
        !Array.isArray(request.capabilities) ||
        !request.capabilities.includes('release-management')
    ) {
        throw new Error('release management provider request is invalid');
    }
    validateBootstrapSource(request.source);
    validateNormalizedProjectMetadata({
        metadata: request.metadata,
        capabilities: request.capabilities,
    });
}

function changelogContents() {
    return Buffer.from(
        '# 📜 Changelog\n\n' +
        'All notable changes to this project will be documented in this file.\n' +
        'See [Conventional Commits](https://conventionalcommits.org) for commit guidelines\n' +
        'and [Semantic Versioning](https://semver.org/spec/v2.0.0.html) for versioning.\n',
        'utf8'
    );
}

function cliffContents(coreRoot, repository) {
    const template = readRegular(
        path.join(coreRoot, 'config', 'bootstrap', 'release', 'cliff.toml'),
        'release management cliff template'
    ).toString('utf8');
    if (!template.includes(REPOSITORY_TOKEN) || template.includes('kyaulabs/prism')) {
        throw new Error('release management cliff template is invalid');
    }
    return Buffer.from(template.replaceAll(REPOSITORY_TOKEN, repository), 'utf8');
}

function renderReleaseManagementProvider({coreRoot, candidateRoot, packageRoot, request}) {
    validateRequest(request);
    const coreVersion = readCoreManifest(coreRoot).version;
    const repository = request.metadata.capabilityMetadata['release-management'].repository;
    const release = renderReleaseCapabilityFiles({projectRoot: packageRoot, coreRoot});
    const contents = new Map([
        ['CHANGELOG.md', changelogContents()],
        ['cliff.toml', cliffContents(coreRoot, repository)],
        ['.github/workflows/release.yml', release.files['.github/workflows/release.yml']],
        ['.prism/release.json', release.files['.prism/release.json']],
    ]);
    const provider = Object.freeze({
        id: 'release-management',
        packageName: '@kyaulabs/prism-core',
        packageVersion: coreVersion,
        protocolVersion: 1,
    });
    return Object.freeze({
        schemaVersion: 1,
        provider,
        status: 'GO',
        outputs: Object.freeze(RELEASE_MANAGEMENT_OUTPUTS.map((outputPath) =>
            writeCandidate(candidateRoot, outputPath, contents.get(outputPath), 0o644)
        )),
        effects: Object.freeze([]),
        checks: Object.freeze([Object.freeze({
            id: 'release-management-render',
            status: 'PASS',
            message: 'Release management candidate files were rendered',
        })]),
        verification: Object.freeze([Object.freeze({
            id: 'release-management-inventory',
            command: 'setup project validate',
        })]),
    });
}

module.exports = {
    RELEASE_MANAGEMENT_OUTPUTS,
    renderReleaseManagementProvider,
};

// vim: ft=javascript sts=4 sw=4 ts=4 et :
