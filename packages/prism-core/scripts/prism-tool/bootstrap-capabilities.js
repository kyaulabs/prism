// $KYAULabs: bootstrap-capabilities.js kyau@aura.kyaulabs 2026/08/25 -0700 Exp $

'use strict';

const fs = require('node:fs');
const path = require('node:path');

const TASK_NINE_CAPABILITIES = Object.freeze([
    'licensing',
    'community-governance',
    'github-collaboration',
]);

function normalizeCapabilitySelection(value) {
    if (value === '') return Object.freeze([]);
    if (typeof value !== 'string' || value.length === 0) {
        throw new Error('capability selection is invalid');
    }
    const selected = value.split(',');
    if (
        selected.some((capability) => !TASK_NINE_CAPABILITIES.includes(capability)) ||
        new Set(selected).size !== selected.length
    ) {
        throw new Error('capability selection is invalid');
    }
    return Object.freeze(TASK_NINE_CAPABILITIES.filter((capability) => selected.includes(capability)));
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
    return Object.freeze({
        schemaVersion: 1,
        fields: Object.freeze(fields),
        publications: Object.freeze(publications),
    });
}

module.exports = {
    TASK_NINE_CAPABILITIES,
    inspectCapabilityMetadata,
    normalizeCapabilitySelection,
};

// vim: ft=javascript sts=4 sw=4 ts=4 et :
