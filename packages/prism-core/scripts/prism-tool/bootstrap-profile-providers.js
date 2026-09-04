// $KYAULabs: bootstrap-profile-providers.js kyau@aura.kyaulabs 2026/09/01 -0700 Exp $

'use strict';

const path = require('node:path');
const {PROJECT_CAPABILITIES} = require('./bootstrap-capabilities');
const {validateNormalizedProjectMetadata} = require('./bootstrap-metadata');
const {
    readCoreManifest,
    readRegular,
    writeCandidate,
} = require('./bootstrap-providers');
const {validateBootstrapSource} = require('./bootstrap-source');

const PROFILE_OUTPUTS = Object.freeze({
    licensing: Object.freeze(['LICENSE']),
    'community-governance': Object.freeze(['CODE_OF_CONDUCT.md', 'CONTRIBUTING.md']),
    'github-collaboration': Object.freeze([
        '.github/ISSUE_TEMPLATE/bug_report.yml',
        '.github/ISSUE_TEMPLATE/feature_request.yml',
        '.github/pull_request_template.md',
    ]),
    'security-disclosure': Object.freeze(['SECURITY.md']),
    'repository-ownership': Object.freeze(['.github/CODEOWNERS']),
    'support-routing': Object.freeze(['.github/ISSUE_TEMPLATE/config.yml']),
    funding: Object.freeze(['.github/FUNDING.yml']),
    'release-management': Object.freeze([
        'CHANGELOG.md',
        'cliff.toml',
        '.github/workflows/release.yml',
    ]),
});

function profileCheck(capability) {
    const display = {
        licensing: 'Licensing',
        'community-governance': 'Community governance',
        'github-collaboration': 'GitHub collaboration',
        'security-disclosure': 'Security disclosure',
        'repository-ownership': 'Repository ownership',
        'support-routing': 'Support routing',
        funding: 'Funding',
        'release-management': 'Release management',
    }[capability];
    return Object.freeze({
        id: `${capability}-render`,
        status: 'PASS',
        message: `${display} candidate files were rendered`,
    });
}

function profileVerification(capability) {
    return Object.freeze({
        id: `${capability}-inventory`,
        command: 'setup project validate',
    });
}

function loadCoreProfileProviderDescriptors({coreRoot, capabilities}) {
    if (
        !Array.isArray(capabilities) ||
        new Set(capabilities).size !== capabilities.length ||
        JSON.stringify(capabilities) !== JSON.stringify(
            PROJECT_CAPABILITIES.filter((capability) => capabilities.includes(capability))
        )
    ) {
        throw new Error('profile provider selection is invalid');
    }
    const coreVersion = readCoreManifest(coreRoot).version;
    return Object.freeze(capabilities.map((capability) => Object.freeze({
        id: capability,
        displayName: capability,
        packageName: '@kyaulabs/prism-core',
        packageVersion: coreVersion,
        protocolVersion: 1,
        outputs: PROFILE_OUTPUTS[capability],
        effects: Object.freeze([]),
        checks: Object.freeze([profileCheck(capability)]),
        verification: Object.freeze([profileVerification(capability)]),
    })));
}

function validateRequest(request) {
    if (
        request === null ||
        typeof request !== 'object' ||
        Array.isArray(request) ||
        request.schemaVersion !== 1 ||
        !Array.isArray(request.capabilities)
    ) {
        throw new Error('profile provider request is invalid');
    }
    validateBootstrapSource(request.source);
    validateNormalizedProjectMetadata({
        metadata: request.metadata,
        capabilities: request.capabilities,
    });
}

function providerIdentity(coreVersion, capability) {
    return Object.freeze({
        id: capability,
        packageName: '@kyaulabs/prism-core',
        packageVersion: coreVersion,
        protocolVersion: 1,
    });
}

function licensingContents(coreRoot, metadata) {
    const licensing = metadata.capabilityMetadata.licensing;
    const resource = readRegular(
        path.join(coreRoot, 'config', 'bootstrap', 'licenses', `${licensing.spdxId}.txt`),
        'license resource'
    ).toString('utf8');
    const token = '{{COPYRIGHT_NOTICE}}';
    if (resource.split(token).length !== 2) throw new Error('license resource is invalid');
    return Buffer.from(resource.replace(
        token,
        `Copyright (c) ${licensing.year} ${licensing.copyrightHolder}`
    ), 'utf8');
}

function markdownLabel(value) {
    return value.replace(/[\\[\]]/gu, '\\$&');
}

function conductContactLink(contact) {
    const label = markdownLabel(contact.value);
    return contact.kind === 'email'
        ? `[${label}](mailto:${contact.value})`
        : `[${label}](<${contact.value}>)`;
}

function communityContents(coreRoot, metadata) {
    const resource = readRegular(
        path.join(
            coreRoot,
            'config',
            'bootstrap',
            'community',
            'contributor-covenant-2.1.md'
        ),
        'community governance resource'
    ).toString('utf8');
    const token = '{{CONDUCT_CONTACT}}';
    if (resource.split(token).length !== 2) {
        throw new Error('community governance resource is invalid');
    }
    return Buffer.from(resource.replace(
        token,
        conductContactLink(metadata.capabilityMetadata['community-governance'].conductContact)
    ), 'utf8');
}

function contributingContents() {
    return Buffer.from(
        '# Contributing\n\n' +
        'Thank you for contributing. All changes follow the Prism engineering pipeline.\n\n' +
        '## Development workflow\n\n' +
        '1. Create a work branch from `develop`.\n' +
        '2. Implement each behavior with Red → Green → Refactor.\n' +
        '3. Run the project verification and check gates.\n' +
        '4. Create signed Conventional Commits through `prism-tool commit create`.\n' +
        '5. Prepare a pull request targeting `develop`.\n\n' +
        'Humans push work branches and merge pull requests. Agents never push or merge.\n',
        'utf8'
    );
}

function renderLicensing({coreRoot, candidateRoot, request, coreVersion}) {
    const provider = providerIdentity(coreVersion, 'licensing');
    return Object.freeze({
        schemaVersion: 1,
        provider,
        status: 'GO',
        outputs: Object.freeze([writeCandidate(
            candidateRoot,
            'LICENSE',
            licensingContents(coreRoot, request.metadata),
            0o644
        )]),
        effects: Object.freeze([]),
        checks: Object.freeze([profileCheck('licensing')]),
        verification: Object.freeze([profileVerification('licensing')]),
    });
}

function renderCommunityGovernance({coreRoot, candidateRoot, request, coreVersion}) {
    const provider = providerIdentity(coreVersion, 'community-governance');
    const contents = new Map([
        ['CODE_OF_CONDUCT.md', communityContents(coreRoot, request.metadata)],
        ['CONTRIBUTING.md', contributingContents()],
    ]);
    return Object.freeze({
        schemaVersion: 1,
        provider,
        status: 'GO',
        outputs: Object.freeze(PROFILE_OUTPUTS['community-governance'].map((outputPath) =>
            writeCandidate(candidateRoot, outputPath, contents.get(outputPath), 0o644)
        )),
        effects: Object.freeze([]),
        checks: Object.freeze([profileCheck('community-governance')]),
        verification: Object.freeze([profileVerification('community-governance')]),
    });
}

function collaborationContents() {
    return new Map([
        ['.github/ISSUE_TEMPLATE/bug_report.yml', Buffer.from(
            'name: Bug report\n' +
            'description: Report reproducible unexpected behavior\n' +
            'body:\n' +
            '  - type: textarea\n' +
            '    id: summary\n' +
            '    attributes:\n' +
            '      label: Summary\n' +
            '    validations:\n' +
            '      required: true\n' +
            '  - type: textarea\n' +
            '    id: reproduction\n' +
            '    attributes:\n' +
            '      label: Reproduction steps\n' +
            '    validations:\n' +
            '      required: true\n' +
            '  - type: textarea\n' +
            '    id: expected\n' +
            '    attributes:\n' +
            '      label: Expected behavior\n' +
            '    validations:\n' +
            '      required: true\n',
            'utf8'
        )],
        ['.github/ISSUE_TEMPLATE/feature_request.yml', Buffer.from(
            'name: Feature request\n' +
            'description: Propose a new capability or improvement\n' +
            'body:\n' +
            '  - type: textarea\n' +
            '    id: problem\n' +
            '    attributes:\n' +
            '      label: Problem\n' +
            '    validations:\n' +
            '      required: true\n' +
            '  - type: textarea\n' +
            '    id: outcome\n' +
            '    attributes:\n' +
            '      label: Desired outcome\n' +
            '    validations:\n' +
            '      required: true\n' +
            '  - type: textarea\n' +
            '    id: acceptance\n' +
            '    attributes:\n' +
            '      label: Acceptance criteria\n' +
            '    validations:\n' +
            '      required: true\n',
            'utf8'
        )],
        ['.github/pull_request_template.md', Buffer.from(
            '## Summary\n\n' +
            'Describe the change and why it is needed.\n\n' +
            '## Changes\n\n' +
            '- Describe each material change.\n\n' +
            '## Verification\n\n' +
            '- List the commands and outcomes used to verify the change.\n\n' +
            '## Checklist\n\n' +
            '- [ ] Tests cover the changed behavior.\n' +
            '- [ ] Documentation is current.\n' +
            '- [ ] No credentials or unrelated files are included.\n',
            'utf8'
        )],
    ]);
}

function securityContactLink(contact) {
    const label = markdownLabel(contact.value);
    return contact.kind === 'email'
        ? `[${label}](mailto:${contact.value})`
        : `[${label}](<${contact.value}>)`;
}

function supportedVersionsContents(supportedVersions) {
    const wording = {
        'current-development': 'Security fixes are provided for the current development branch.',
        'latest-release': 'Security fixes are provided for the latest released version.',
        'latest-major-line': 'Security fixes are provided for the latest major release line.',
    };
    if (supportedVersions.policy !== 'custom') return `${wording[supportedVersions.policy]}\n`;
    const rows = supportedVersions.rows.map(({version, status}) =>
        `| ${version.replace(/[\\|]/gu, '\\$&')} | ${status === 'supported' ? 'Yes' : 'No'} |`
    );
    return '| Version | Supported |\n| --- | --- |\n' + `${rows.join('\n')}\n`;
}

function renderSecurityDisclosure({candidateRoot, request, coreVersion}) {
    const provider = providerIdentity(coreVersion, 'security-disclosure');
    const security = request.metadata.capabilityMetadata['security-disclosure'];
    const acknowledgement = Object.hasOwn(security, 'acknowledgementHours')
        ? `\nWe aim to acknowledge complete vulnerability reports within ${security.acknowledgementHours} hours.\n`
        : '';
    const contents = Buffer.from(
        '# Security Policy\n\n' +
        '## Supported versions\n\n' +
        supportedVersionsContents(security.supportedVersions) +
        '\n## Reporting a vulnerability\n\n' +
        `Report vulnerabilities privately through ${securityContactLink(security.reportingContact)}.\n` +
        acknowledgement,
        'utf8'
    );
    return Object.freeze({
        schemaVersion: 1,
        provider,
        status: 'GO',
        outputs: Object.freeze([writeCandidate(
            candidateRoot,
            'SECURITY.md',
            contents,
            0o644
        )]),
        effects: Object.freeze([]),
        checks: Object.freeze([profileCheck('security-disclosure')]),
        verification: Object.freeze([profileVerification('security-disclosure')]),
    });
}

function renderRepositoryOwnership({candidateRoot, request, coreVersion}) {
    const provider = providerIdentity(coreVersion, 'repository-ownership');
    const ownership = request.metadata.capabilityMetadata['repository-ownership'];
    const lines = [
        `*\t${ownership.owners.join(' ')}`,
        ...ownership.rules.map(({pattern, owners}) => `${pattern}\t${owners.join(' ')}`),
    ];
    return Object.freeze({
        schemaVersion: 1,
        provider,
        status: 'GO',
        outputs: Object.freeze([writeCandidate(
            candidateRoot,
            '.github/CODEOWNERS',
            Buffer.from(`${lines.join('\n')}\n`, 'utf8'),
            0o644
        )]),
        effects: Object.freeze([]),
        checks: Object.freeze([profileCheck('repository-ownership')]),
        verification: Object.freeze([profileVerification('repository-ownership')]),
    });
}

function yamlString(value) {
    return JSON.stringify(value);
}

function renderSupportRouting({candidateRoot, request, coreVersion}) {
    const provider = providerIdentity(coreVersion, 'support-routing');
    const support = request.metadata.capabilityMetadata['support-routing'];
    const blankIssues = request.capabilities.includes('github-collaboration') ? 'false' : 'true';
    const contents = Buffer.from(
        `blank_issues_enabled: ${blankIssues}\n` +
        'contact_links:\n' +
        `  - name: ${yamlString(support.displayLabel)}\n` +
        `    url: ${yamlString(support.destination)}\n` +
        `    about: ${yamlString(support.description)}\n`,
        'utf8'
    );
    return Object.freeze({
        schemaVersion: 1,
        provider,
        status: 'GO',
        outputs: Object.freeze([writeCandidate(
            candidateRoot,
            '.github/ISSUE_TEMPLATE/config.yml',
            contents,
            0o644
        )]),
        effects: Object.freeze([]),
        checks: Object.freeze([profileCheck('support-routing')]),
        verification: Object.freeze([profileVerification('support-routing')]),
    });
}

function renderFunding({candidateRoot, request, coreVersion}) {
    const provider = providerIdentity(coreVersion, 'funding');
    const grouped = new Map();
    for (const {provider: providerId, value} of request.metadata.capabilityMetadata.funding.records) {
        if (!grouped.has(providerId)) grouped.set(providerId, []);
        grouped.get(providerId).push(value);
    }
    const lines = [...grouped.entries()].map(([providerId, values]) =>
        ['github', 'custom'].includes(providerId)
            ? `${providerId}: ${JSON.stringify(values)}`
            : `${providerId}: ${yamlString(values[0])}`
    );
    return Object.freeze({
        schemaVersion: 1,
        provider,
        status: 'GO',
        outputs: Object.freeze([writeCandidate(
            candidateRoot,
            '.github/FUNDING.yml',
            Buffer.from(`${lines.join('\n')}\n`, 'utf8'),
            0o644
        )]),
        effects: Object.freeze([]),
        checks: Object.freeze([profileCheck('funding')]),
        verification: Object.freeze([profileVerification('funding')]),
    });
}

function renderGithubCollaboration({candidateRoot, coreVersion}) {
    const provider = providerIdentity(coreVersion, 'github-collaboration');
    const contents = collaborationContents();
    return Object.freeze({
        schemaVersion: 1,
        provider,
        status: 'GO',
        outputs: Object.freeze(PROFILE_OUTPUTS['github-collaboration'].map((outputPath) =>
            writeCandidate(candidateRoot, outputPath, contents.get(outputPath), 0o644)
        )),
        effects: Object.freeze([]),
        checks: Object.freeze([profileCheck('github-collaboration')]),
        verification: Object.freeze([profileVerification('github-collaboration')]),
    });
}

function renderCoreProfileProviders({
    coreRoot,
    candidateRoot,
    packageRoot = candidateRoot,
    request,
}) {
    validateRequest(request);
    const coreVersion = readCoreManifest(coreRoot).version;
    return Object.freeze(request.capabilities.map((capability) => {
        if (!Object.hasOwn(PROFILE_OUTPUTS, capability)) {
            throw new Error('profile provider capability is invalid');
        }
        if (capability === 'licensing') {
            return renderLicensing({coreRoot, candidateRoot, request, coreVersion});
        }
        if (capability === 'community-governance') {
            return renderCommunityGovernance({
                coreRoot,
                candidateRoot,
                request,
                coreVersion,
            });
        }
        if (capability === 'github-collaboration') {
            return renderGithubCollaboration({candidateRoot, coreVersion});
        }
        if (capability === 'security-disclosure') {
            return renderSecurityDisclosure({candidateRoot, request, coreVersion});
        }
        if (capability === 'repository-ownership') {
            return renderRepositoryOwnership({candidateRoot, request, coreVersion});
        }
        if (capability === 'support-routing') {
            return renderSupportRouting({candidateRoot, request, coreVersion});
        }
        if (capability === 'funding') {
            return renderFunding({candidateRoot, request, coreVersion});
        }
        if (capability === 'release-management') {
            return require('./bootstrap-release-provider').renderReleaseManagementProvider({
                coreRoot,
                candidateRoot,
                packageRoot,
                request,
            });
        }
        throw new Error('profile provider is unavailable');
    }));
}

module.exports = {
    PROFILE_OUTPUTS,
    loadCoreProfileProviderDescriptors,
    renderCoreProfileProviders,
};

// vim: ft=javascript sts=4 sw=4 ts=4 et :
