// $KYAULabs: bootstrap-metadata.js kyau@aura.kyaulabs 2026/08/25 -0700 Exp $

'use strict';

const fs = require('node:fs');
const path = require('node:path');
const {URL} = require('node:url');
const {TextDecoder} = require('node:util');
const {PROJECT_CAPABILITIES} = require('./bootstrap-capabilities');

const DISPLAY_NAME_MAXIMUM = 100;
const INPUT_MAXIMUM = 16384;
const SUMMARY_MAXIMUM = 240;
const HOLDER_MAXIMUM = 200;
const CONTACT_MAXIMUM = 2048;
const OWNER_PATTERN_MAXIMUM = 256;
const SUPPORT_LABEL_MAXIMUM = 80;
const SUPPORT_DESCRIPTION_MAXIMUM = 160;
const FUNDING_VALUE_MAXIMUM = 200;
const REPOSITORY_COORDINATE_MAXIMUM = 140;
const VERSION_LABEL_MAXIMUM = 64;
const SPDX_IDS = Object.freeze(['AGPL-3.0-only', 'MIT']);
const SECURITY_POLICIES = Object.freeze([
    'current-development',
    'latest-release',
    'latest-major-line',
    'custom',
]);
const FUNDING_PROVIDERS = Object.freeze([
    'github',
    'patreon',
    'open_collective',
    'ko_fi',
    'tidelift',
    'community_bridge',
    'liberapay',
    'issuehunt',
    'lfx_crowdfunding',
    'polar',
    'thanks_dev',
    'custom',
]);

function isRecord(value) {
    return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function hasExactKeys(value, expected) {
    const actual = Object.keys(value).sort();
    const sorted = [...expected].sort();
    return actual.length === sorted.length && actual.every((key, index) => key === sorted[index]);
}

function containsLineControl(value) {
    return [...value].some((character) => {
        const code = character.charCodeAt(0);
        return code <= 0x1f || code >= 0x7f && code <= 0x9f || [0x2028, 0x2029].includes(code);
    });
}

function normalizeSingleLine(value, maximum, label) {
    if (
        typeof value !== 'string' ||
        value.length === 0 ||
        Buffer.byteLength(value) > maximum ||
        value !== value.trim() ||
        value !== value.normalize('NFC') ||
        containsLineControl(value)
    ) {
        throw new Error(`${label} is invalid`);
    }
    return value;
}

function normalizeSentence(value) {
    const normalized = normalizeSingleLine(value, SUMMARY_MAXIMUM, 'project summary');
    if (!/^[^.!?]+[.!?]$/u.test(normalized)) {
        throw new Error('project summary is invalid');
    }
    return normalized;
}

function assertUniqueTopLevelKeys(text) {
    const keys = new Set();
    let depth = 0;
    let escaped = false;
    let previous = '';
    for (let index = 0; index < text.length; index += 1) {
        const character = text[index];
        if (character === '"' && !escaped) {
            const startsKey = depth === 1 && (previous === '{' || previous === ',');
            let end = index + 1;
            let stringEscaped = false;
            while (end < text.length) {
                const next = text[end];
                if (next === '"' && !stringEscaped) break;
                if (next === '\\' && !stringEscaped) stringEscaped = true;
                else stringEscaped = false;
                end += 1;
            }
            if (end >= text.length) throw new Error('project metadata input is invalid');
            if (startsKey) {
                let colon = end + 1;
                while (/\s/u.test(text[colon] ?? '')) colon += 1;
                if (text[colon] === ':') {
                    const key = JSON.parse(text.slice(index, end + 1));
                    if (keys.has(key)) throw new Error('project metadata input is invalid');
                    keys.add(key);
                }
            }
            index = end;
            previous = '"';
            escaped = false;
            continue;
        }
        escaped = character === '\\' && !escaped;
        if (!escaped) {
            if (character === '{' || character === '[') depth += 1;
            else if (character === '}' || character === ']') depth -= 1;
        }
        if (!/\s/u.test(character)) previous = character;
    }
}

function validCapabilities(capabilities) {
    return Array.isArray(capabilities) &&
        new Set(capabilities).size === capabilities.length &&
        capabilities.every((capability) => PROJECT_CAPABILITIES.includes(capability)) &&
        PROJECT_CAPABILITIES.filter((capability) => capabilities.includes(capability))
            .every((capability, index) => capability === capabilities[index]);
}

function parseMetadataInput(input, capabilities) {
    const contents = Buffer.isBuffer(input) ? input : Buffer.from(input ?? '', 'utf8');
    if (contents.length === 0 || contents.length > INPUT_MAXIMUM || contents[0] === 0xef) {
        throw new Error('project metadata input is invalid');
    }
    let text;
    try {
        text = new TextDecoder('utf-8', {fatal: true}).decode(contents);
    } catch {
        throw new Error('project metadata input is invalid');
    }
    if (!text.startsWith('{') || !text.endsWith('}')) {
        throw new Error('project metadata input is invalid');
    }
    assertUniqueTopLevelKeys(text);
    let value;
    try {
        value = JSON.parse(text);
    } catch {
        throw new Error('project metadata input is invalid');
    }
    const expected = capabilities.length === 0
        ? ['schemaVersion', 'displayName', 'summary']
        : ['schemaVersion', 'displayName', 'summary', 'capabilityMetadata'];
    if (!isRecord(value) || !hasExactKeys(value, expected)) {
        throw new Error('project metadata input is invalid');
    }
    return value;
}

function normalizeEmailOrHttps(value, label) {
    const normalized = normalizeSingleLine(value, CONTACT_MAXIMUM, label);
    if (/^(?:[A-Za-z0-9!#$%&'*+/=?^_`{|}~-]+(?:\.[A-Za-z0-9!#$%&'*+/=?^_`{|}~-]+)*)@(?:[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?\.)+[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?$/u.test(normalized)) {
        return Object.freeze({kind: 'email', value: normalized});
    }
    let destination;
    try {
        destination = new URL(normalized);
    } catch {
        throw new Error(`${label} is invalid`);
    }
    if (
        destination.protocol !== 'https:' ||
        destination.username !== '' ||
        destination.password !== '' ||
        destination.origin === 'null'
    ) {
        throw new Error(`${label} is invalid`);
    }
    return Object.freeze({kind: 'https', value: destination.href});
}

function normalizeConductContact(value) {
    return normalizeEmailOrHttps(value, 'conduct contact');
}

function normalizeHttpsDestination(value, label) {
    const normalized = normalizeSingleLine(value, CONTACT_MAXIMUM, label);
    let destination;
    try {
        destination = new URL(normalized);
    } catch {
        throw new Error(`${label} is invalid`);
    }
    if (
        destination.protocol !== 'https:' ||
        destination.username !== '' ||
        destination.password !== '' ||
        destination.origin === 'null'
    ) {
        throw new Error(`${label} is invalid`);
    }
    return destination.href;
}

function normalizeSecurityMetadata(value) {
    const allowed = [
        'reportingContact',
        'supportedVersionPolicy',
        'supportedVersionRows',
        'acknowledgementHours',
    ];
    if (
        !isRecord(value) ||
        !Object.hasOwn(value, 'reportingContact') ||
        !Object.hasOwn(value, 'supportedVersionPolicy') ||
        Object.keys(value).some((key) => !allowed.includes(key)) ||
        !SECURITY_POLICIES.includes(value.supportedVersionPolicy)
    ) {
        throw new Error('security disclosure metadata is invalid');
    }
    const custom = value.supportedVersionPolicy === 'custom';
    if (custom !== Object.hasOwn(value, 'supportedVersionRows')) {
        throw new Error('security disclosure metadata is invalid');
    }
    let rows = [];
    if (custom) {
        if (
            !Array.isArray(value.supportedVersionRows) ||
            value.supportedVersionRows.length < 1 ||
            value.supportedVersionRows.length > 20
        ) {
            throw new Error('security disclosure metadata is invalid');
        }
        rows = value.supportedVersionRows.map((row) => {
            if (
                !isRecord(row) ||
                !hasExactKeys(row, ['version', 'status']) ||
                !['supported', 'unsupported'].includes(row.status)
            ) {
                throw new Error('security disclosure metadata is invalid');
            }
            return Object.freeze({
                version: normalizeSingleLine(
                    row.version,
                    VERSION_LABEL_MAXIMUM,
                    'supported version label'
                ),
                status: row.status,
            });
        });
        if (new Set(rows.map(({version}) => version)).size !== rows.length) {
            throw new Error('security disclosure metadata is invalid');
        }
    }
    if (
        Object.hasOwn(value, 'acknowledgementHours') &&
        (
            !Number.isSafeInteger(value.acknowledgementHours) ||
            value.acknowledgementHours < 1 ||
            value.acknowledgementHours > 8760
        )
    ) {
        throw new Error('security disclosure metadata is invalid');
    }
    return Object.freeze({
        reportingContact: normalizeEmailOrHttps(
            value.reportingContact,
            'security reporting contact'
        ),
        supportedVersions: Object.freeze({
            policy: value.supportedVersionPolicy,
            rows: Object.freeze(rows),
        }),
        ...(Object.hasOwn(value, 'acknowledgementHours') ? {
            acknowledgementHours: value.acknowledgementHours,
        } : {}),
    });
}

function normalizeOwner(value) {
    const normalized = normalizeSingleLine(value, 140, 'repository owner');
    if (!/^@[A-Za-z0-9](?:[A-Za-z0-9-]{0,37}[A-Za-z0-9])?(?:\/[A-Za-z0-9](?:[A-Za-z0-9_-]{0,98}[A-Za-z0-9])?)?$/u.test(normalized)) {
        throw new Error('repository owner is invalid');
    }
    return normalized.toLowerCase();
}

function normalizeOwnerList(value) {
    if (!Array.isArray(value) || value.length < 1 || value.length > 20) {
        throw new Error('repository owner list is invalid');
    }
    const owners = value.map(normalizeOwner);
    if (new Set(owners).size !== owners.length) {
        throw new Error('repository owner list is invalid');
    }
    return Object.freeze(owners);
}

function normalizeOwnerPattern(value) {
    const normalized = normalizeSingleLine(value, OWNER_PATTERN_MAXIMUM, 'ownership pattern');
    if (
        !normalized.startsWith('/') ||
        normalized === '/' ||
        normalized.includes('\\') ||
        normalized.includes('//') ||
        /[\s!#]/u.test(normalized) ||
        !/^\/[A-Za-z0-9._*?/-]+$/u.test(normalized) ||
        normalized.split('/').includes('..') ||
        path.posix.normalize(normalized) !== normalized
    ) {
        throw new Error('ownership pattern is invalid');
    }
    return normalized;
}

function normalizeRepositoryOwnershipMetadata(value) {
    if (!isRecord(value) || !Object.hasOwn(value, 'owners')) {
        throw new Error('repository ownership metadata is invalid');
    }
    const allowed = ['owners', 'rules'];
    if (Object.keys(value).some((key) => !allowed.includes(key))) {
        throw new Error('repository ownership metadata is invalid');
    }
    const owners = normalizeOwnerList(value.owners);
    const rawRules = Object.hasOwn(value, 'rules') ? value.rules : [];
    if (!Array.isArray(rawRules) || rawRules.length > 50) {
        throw new Error('repository ownership metadata is invalid');
    }
    const rules = rawRules.map((rule) => {
        if (!isRecord(rule) || !hasExactKeys(rule, ['pattern', 'owners'])) {
            throw new Error('repository ownership metadata is invalid');
        }
        return Object.freeze({
            pattern: normalizeOwnerPattern(rule.pattern),
            owners: normalizeOwnerList(rule.owners),
        });
    });
    if (new Set(rules.map(({pattern}) => pattern)).size !== rules.length) {
        throw new Error('repository ownership metadata is invalid');
    }
    return Object.freeze({owners, rules: Object.freeze(rules)});
}

function normalizeSupportRoutingMetadata(value) {
    const allowed = ['destination', 'displayLabel', 'description'];
    if (
        !isRecord(value) ||
        !Object.hasOwn(value, 'destination') ||
        Object.keys(value).some((key) => !allowed.includes(key))
    ) {
        throw new Error('support routing metadata is invalid');
    }
    return Object.freeze({
        destination: normalizeHttpsDestination(value.destination, 'support destination'),
        displayLabel: Object.hasOwn(value, 'displayLabel')
            ? normalizeSingleLine(value.displayLabel, SUPPORT_LABEL_MAXIMUM, 'support display label')
            : 'Support',
        description: Object.hasOwn(value, 'description')
            ? normalizeSingleLine(
                value.description,
                SUPPORT_DESCRIPTION_MAXIMUM,
                'support description'
            )
            : 'Get help with this project.',
    });
}

function normalizeFundingAccount(value) {
    const normalized = normalizeSingleLine(value, FUNDING_VALUE_MAXIMUM, 'funding account');
    if (
        !/^[A-Za-z0-9](?:[A-Za-z0-9._/-]{0,198}[A-Za-z0-9])?$/u.test(normalized) ||
        normalized.includes('..') ||
        normalized.includes('//')
    ) {
        throw new Error('funding account is invalid');
    }
    return normalized;
}

function normalizeFundingMetadata(value) {
    if (!isRecord(value) || !hasExactKeys(value, ['records'])) {
        throw new Error('funding metadata is invalid');
    }
    if (!Array.isArray(value.records) || value.records.length < 1 || value.records.length > 15) {
        throw new Error('funding metadata is invalid');
    }
    const records = value.records.map((record) => {
        if (!isRecord(record) || !FUNDING_PROVIDERS.includes(record.provider)) {
            throw new Error('funding metadata is invalid');
        }
        const custom = record.provider === 'custom';
        if (!hasExactKeys(record, custom ? ['provider', 'destination'] : ['provider', 'account'])) {
            throw new Error('funding metadata is invalid');
        }
        return Object.freeze({
            provider: record.provider,
            value: custom
                ? normalizeHttpsDestination(record.destination, 'custom funding destination')
                : normalizeFundingAccount(record.account),
        });
    });
    if (new Set(records.map(({provider, value: entry}) => `${provider}\0${entry}`)).size !== records.length) {
        throw new Error('funding metadata is invalid');
    }
    for (const provider of FUNDING_PROVIDERS) {
        const count = records.filter((record) => record.provider === provider).length;
        if (count > (['github', 'custom'].includes(provider) ? 4 : 1)) {
            throw new Error('funding metadata is invalid');
        }
    }
    return Object.freeze({
        records: Object.freeze([...records].sort((left, right) =>
            FUNDING_PROVIDERS.indexOf(left.provider) - FUNDING_PROVIDERS.indexOf(right.provider)
        )),
    });
}

function normalizeReleaseManagementMetadata(value) {
    if (!isRecord(value) || !hasExactKeys(value, ['repository'])) {
        throw new Error('release management metadata is invalid');
    }
    const repository = normalizeSingleLine(
        value.repository,
        REPOSITORY_COORDINATE_MAXIMUM,
        'release repository'
    );
    const match = repository.match(
        /^([A-Za-z0-9](?:[A-Za-z0-9-]{0,37}[A-Za-z0-9])?)\/([A-Za-z0-9](?:[A-Za-z0-9._-]{0,98}[A-Za-z0-9])?)$/u
    );
    if (match === null || match[2].toLowerCase().endsWith('.git')) {
        throw new Error('release management metadata is invalid');
    }
    return Object.freeze({repository: repository.toLowerCase()});
}

function normalizeCapabilityMetadata(value, capabilities, currentYear) {
    if (!isRecord(value) || !hasExactKeys(value, capabilities)) {
        throw new Error('capability metadata is invalid');
    }
    const normalized = {};
    for (const capability of capabilities) {
        const metadata = value[capability];
        if (capability === 'licensing') {
            if (
                !isRecord(metadata) ||
                !hasExactKeys(metadata, ['spdxId', 'copyrightHolder']) ||
                !SPDX_IDS.includes(metadata.spdxId) ||
                !Number.isSafeInteger(currentYear) ||
                currentYear < 1970 ||
                currentYear > 9999
            ) {
                throw new Error('licensing metadata is invalid');
            }
            normalized[capability] = Object.freeze({
                spdxId: metadata.spdxId,
                year: currentYear,
                copyrightHolder: normalizeSingleLine(
                    metadata.copyrightHolder,
                    HOLDER_MAXIMUM,
                    'copyright holder'
                ),
            });
        } else if (capability === 'community-governance') {
            if (!isRecord(metadata) || !hasExactKeys(metadata, ['conductContact'])) {
                throw new Error('community governance metadata is invalid');
            }
            normalized[capability] = Object.freeze({
                conductContact: normalizeConductContact(metadata.conductContact),
            });
        } else if (capability === 'security-disclosure') {
            normalized[capability] = normalizeSecurityMetadata(metadata);
        } else if (capability === 'repository-ownership') {
            normalized[capability] = normalizeRepositoryOwnershipMetadata(metadata);
        } else if (capability === 'support-routing') {
            normalized[capability] = normalizeSupportRoutingMetadata(metadata);
        } else if (capability === 'funding') {
            normalized[capability] = normalizeFundingMetadata(metadata);
        } else if (capability === 'release-management') {
            normalized[capability] = normalizeReleaseManagementMetadata(metadata);
        } else if (!isRecord(metadata) || !hasExactKeys(metadata, [])) {
            throw new Error('GitHub collaboration metadata is invalid');
        } else {
            normalized[capability] = Object.freeze({});
        }
    }
    return Object.freeze(normalized);
}

function validateNormalizedProjectMetadata({metadata, capabilities}) {
    if (!validCapabilities(capabilities) || !isRecord(metadata)) {
        throw new Error('project metadata is invalid');
    }
    const keys = Object.keys(metadata);
    const expected = ['schemaVersion', 'displayName', 'summary'];
    if (capabilities.length > 0) expected.push('capabilityMetadata');
    if (keys.includes('suggestedDisplayName')) expected.push('suggestedDisplayName');
    if (!hasExactKeys(metadata, expected) || metadata.schemaVersion !== 1) {
        throw new Error('project metadata is invalid');
    }
    normalizeSingleLine(metadata.displayName, DISPLAY_NAME_MAXIMUM, 'display name');
    normalizeSentence(metadata.summary);
    if (
        Object.hasOwn(metadata, 'suggestedDisplayName') &&
        typeof metadata.suggestedDisplayName !== 'string'
    ) {
        throw new Error('project metadata is invalid');
    }
    if (capabilities.length === 0) return Object.freeze({...metadata});
    const capabilityMetadata = normalizeCapabilityMetadata(
        Object.fromEntries(Object.entries(metadata.capabilityMetadata).map(([id, value]) => [
            id,
            id === 'licensing' ? {
                spdxId: value.spdxId,
                copyrightHolder: value.copyrightHolder,
            } : id === 'community-governance' ? {
                conductContact: value.conductContact?.value,
            } : id === 'security-disclosure' ? {
                reportingContact: value.reportingContact?.value,
                supportedVersionPolicy: value.supportedVersions?.policy,
                ...(value.supportedVersions?.policy === 'custom' ? {
                    supportedVersionRows: value.supportedVersions.rows,
                } : {}),
                ...(Object.hasOwn(value, 'acknowledgementHours') ? {
                    acknowledgementHours: value.acknowledgementHours,
                } : {}),
            } : id === 'funding' ? {
                records: Array.isArray(value.records) ? value.records.map((record) =>
                    record.provider === 'custom'
                        ? {provider: record.provider, destination: record.value}
                        : {provider: record.provider, account: record.value}
                ) : value.records,
            } : id === 'release-management' ? {
                repository: value.repository,
            } : value,
        ])),
        capabilities,
        metadata.capabilityMetadata.licensing?.year ?? new Date().getUTCFullYear()
    );
    if (JSON.stringify(capabilityMetadata) !== JSON.stringify(metadata.capabilityMetadata)) {
        throw new Error('project metadata is invalid');
    }
    return Object.freeze({...metadata, capabilityMetadata});
}

function inspectMinimalMetadata({projectRoot}) {
    const canonicalRoot = fs.realpathSync(projectRoot);
    return Object.freeze({
        schemaVersion: 1,
        fields: Object.freeze([
            Object.freeze({
                id: 'displayName',
                required: true,
                suggestedValue: path.basename(canonicalRoot),
                maximumLength: DISPLAY_NAME_MAXIMUM,
            }),
            Object.freeze({
                id: 'summary',
                required: true,
                suggestedValue: null,
                maximumLength: SUMMARY_MAXIMUM,
            }),
        ]),
    });
}

function normalizeProjectMetadata({
    projectRoot,
    input,
    capabilities = [],
    currentYear = new Date().getUTCFullYear(),
}) {
    if (!validCapabilities(capabilities)) throw new Error('capability selection is invalid');
    const value = parseMetadataInput(input, capabilities);
    if (value.schemaVersion !== 1) throw new Error('project metadata schema is unsupported');
    const metadata = Object.freeze({
        schemaVersion: 1,
        displayName: normalizeSingleLine(value.displayName, DISPLAY_NAME_MAXIMUM, 'display name'),
        summary: normalizeSentence(value.summary),
        suggestedDisplayName: path.basename(fs.realpathSync(projectRoot)),
        ...(capabilities.length === 0 ? {} : {
            capabilityMetadata: normalizeCapabilityMetadata(
                value.capabilityMetadata,
                capabilities,
                currentYear
            ),
        }),
    });
    validateNormalizedProjectMetadata({metadata, capabilities});
    return metadata;
}

module.exports = {
    inspectMinimalMetadata,
    normalizeProjectMetadata,
    validateNormalizedProjectMetadata,
};

// vim: ft=javascript sts=4 sw=4 ts=4 et :
