// $KYAULabs: bootstrap-metadata.js kyau@aura.kyaulabs 2026/08/25 -0700 Exp $

'use strict';

const fs = require('node:fs');
const path = require('node:path');
const {URL} = require('node:url');
const {TextDecoder} = require('node:util');
const {TASK_NINE_CAPABILITIES} = require('./bootstrap-capabilities');

const DISPLAY_NAME_MAXIMUM = 100;
const INPUT_MAXIMUM = 16384;
const SUMMARY_MAXIMUM = 240;
const HOLDER_MAXIMUM = 200;
const CONTACT_MAXIMUM = 2048;
const SPDX_IDS = Object.freeze(['AGPL-3.0-only', 'MIT']);

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
        capabilities.every((capability) => TASK_NINE_CAPABILITIES.includes(capability)) &&
        TASK_NINE_CAPABILITIES.filter((capability) => capabilities.includes(capability))
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

function normalizeConductContact(value) {
    const normalized = normalizeSingleLine(value, CONTACT_MAXIMUM, 'conduct contact');
    if (/^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+$/u.test(normalized)) {
        return Object.freeze({kind: 'email', value: normalized});
    }
    let destination;
    try {
        destination = new URL(normalized);
    } catch {
        throw new Error('conduct contact is invalid');
    }
    if (
        destination.protocol !== 'https:' ||
        destination.username !== '' ||
        destination.password !== '' ||
        destination.origin === 'null'
    ) {
        throw new Error('conduct contact is invalid');
    }
    return Object.freeze({kind: 'https', value: destination.href});
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
