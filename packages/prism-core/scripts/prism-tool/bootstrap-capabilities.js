// $KYAULabs: bootstrap-capabilities.js kyau@aura.kyaulabs 2026/09/01 -0700 Exp $

'use strict';

const fs = require('node:fs');
const path = require('node:path');

const PROJECT_CAPABILITIES = Object.freeze([
    'licensing',
    'community-governance',
    'github-collaboration',
    'security-disclosure',
    'repository-ownership',
    'support-routing',
    'funding',
    'release-management',
]);

function normalizeCapabilitySelection(value) {
    if (value === '') return Object.freeze([]);
    if (typeof value !== 'string' || value.length === 0) {
        throw new Error('capability selection is invalid');
    }
    const selected = value.split(',');
    if (
        selected.some((capability) => !PROJECT_CAPABILITIES.includes(capability)) ||
        new Set(selected).size !== selected.length
    ) {
        throw new Error('capability selection is invalid');
    }
    return Object.freeze(PROJECT_CAPABILITIES.filter((capability) => selected.includes(capability)));
}

function inspectCapabilityMetadata({projectRoot, capabilities}) {
    const canonicalRoot = fs.realpathSync(projectRoot);
    const fields = [
        Object.freeze({
            id: 'displayName',
            required: true,
            suggestedValue: path.basename(canonicalRoot),
            maximumLength: 100,
        }),
        Object.freeze({
            id: 'summary',
            required: true,
            suggestedValue: null,
            maximumLength: 240,
        }),
    ];
    const publications = [];
    if (capabilities.includes('licensing')) {
        fields.push(
            Object.freeze({
                id: 'licensing.spdxId',
                required: true,
                choices: Object.freeze(['AGPL-3.0-only', 'MIT']),
            }),
            Object.freeze({
                id: 'licensing.copyrightHolder',
                required: true,
                suggestedValue: null,
                maximumLength: 200,
            })
        );
        publications.push(Object.freeze({
            capability: 'licensing',
            field: 'licensing.copyrightHolder',
            outputs: Object.freeze(['LICENSE']),
        }));
    }
    if (capabilities.includes('community-governance')) {
        fields.push(Object.freeze({
            id: 'community-governance.conductContact',
            required: true,
            suggestedValue: null,
            maximumLength: 2048,
        }));
        publications.push(Object.freeze({
            capability: 'community-governance',
            field: 'community-governance.conductContact',
            outputs: Object.freeze(['CODE_OF_CONDUCT.md', 'CONTRIBUTING.md']),
        }));
    }
    if (capabilities.includes('github-collaboration')) {
        publications.push(Object.freeze({
            capability: 'github-collaboration',
            field: null,
            outputs: Object.freeze([
                '.github/ISSUE_TEMPLATE/bug_report.yml',
                '.github/ISSUE_TEMPLATE/feature_request.yml',
                '.github/pull_request_template.md',
            ]),
        }));
    }
    if (capabilities.includes('security-disclosure')) {
        fields.push(
            Object.freeze({
                id: 'security-disclosure.reportingContact',
                required: true,
                suggestedValue: null,
                maximumLength: 2048,
            }),
            Object.freeze({
                id: 'security-disclosure.supportedVersionPolicy',
                required: true,
                choices: Object.freeze([
                    'current-development',
                    'latest-release',
                    'latest-major-line',
                    'custom',
                ]),
            }),
            Object.freeze({
                id: 'security-disclosure.supportedVersionRows',
                required: false,
                maximumItems: 20,
            }),
            Object.freeze({
                id: 'security-disclosure.acknowledgementHours',
                required: false,
                minimum: 1,
                maximum: 8760,
            })
        );
        publications.push(Object.freeze({
            capability: 'security-disclosure',
            field: 'security-disclosure.reportingContact',
            outputs: Object.freeze(['SECURITY.md']),
        }));
    }
    if (capabilities.includes('repository-ownership')) {
        fields.push(
            Object.freeze({
                id: 'repository-ownership.owners',
                required: true,
                minimumItems: 1,
                maximumItems: 20,
            }),
            Object.freeze({
                id: 'repository-ownership.rules',
                required: false,
                maximumItems: 50,
            })
        );
        publications.push(Object.freeze({
            capability: 'repository-ownership',
            field: 'repository-ownership.owners',
            outputs: Object.freeze(['.github/CODEOWNERS']),
        }));
    }
    if (capabilities.includes('support-routing')) {
        fields.push(
            Object.freeze({
                id: 'support-routing.destination',
                required: true,
                suggestedValue: null,
                maximumLength: 2048,
            }),
            Object.freeze({
                id: 'support-routing.displayLabel',
                required: false,
                suggestedValue: 'Support',
                maximumLength: 80,
            }),
            Object.freeze({
                id: 'support-routing.description',
                required: false,
                suggestedValue: 'Get help with this project.',
                maximumLength: 160,
            })
        );
        publications.push(Object.freeze({
            capability: 'support-routing',
            field: 'support-routing.destination',
            outputs: Object.freeze(['.github/ISSUE_TEMPLATE/config.yml']),
        }));
    }
    if (capabilities.includes('funding')) {
        fields.push(Object.freeze({
            id: 'funding.records',
            required: true,
            minimumItems: 1,
            maximumItems: 15,
        }));
        publications.push(Object.freeze({
            capability: 'funding',
            field: 'funding.records',
            outputs: Object.freeze(['.github/FUNDING.yml']),
        }));
    }
    if (capabilities.includes('release-management')) {
        fields.push(Object.freeze({
            id: 'release-management.repository',
            required: true,
            suggestedValue: null,
            maximumLength: 140,
        }));
        publications.push(Object.freeze({
            capability: 'release-management',
            field: 'release-management.repository',
            outputs: Object.freeze([
                'CHANGELOG.md',
                'cliff.toml',
                '.github/workflows/release.yml',
            ]),
        }));
    }
    return Object.freeze({
        schemaVersion: 1,
        fields: Object.freeze(fields),
        publications: Object.freeze(publications),
    });
}

module.exports = {
    PROJECT_CAPABILITIES,
    inspectCapabilityMetadata,
    normalizeCapabilitySelection,
};

// vim: ft=javascript sts=4 sw=4 ts=4 et :
