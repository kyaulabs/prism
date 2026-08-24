// $KYAULabs: bootstrap-metadata.js kyau@aura.kyaulabs 2026/08/24 -0700 Exp $

'use strict';

const fs = require('node:fs');
const path = require('node:path');

const DISPLAY_NAME_MAXIMUM = 100;
const INPUT_MAXIMUM = 16384;
const SUMMARY_MAXIMUM = 240;

function isRecord(value) {
    return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function hasExactKeys(value, expected) {
    const actual = Object.keys(value).sort();
    const sorted = [...expected].sort();
    return actual.length === sorted.length && actual.every((key, index) => key === sorted[index]);
}

function normalizeSingleLine(value, maximum, label) {
    if (
        typeof value !== 'string' ||
        value.length === 0 ||
        Buffer.byteLength(value) > maximum ||
        value !== value.trim() ||
        value !== value.normalize('NFC') ||
        /[\u0000-\u001f\u007f-\u009f\u2028\u2029]/u.test(value)
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

function parseMetadataInput(input) {
    const contents = Buffer.isBuffer(input) ? input : Buffer.from(input ?? '', 'utf8');
    if (contents.length === 0 || contents.length > INPUT_MAXIMUM || contents[0] === 0xef) {
        throw new Error('project metadata input is invalid');
    }
    const text = contents.toString('utf8');
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
    if (!isRecord(value) || !hasExactKeys(value, ['schemaVersion', 'displayName', 'summary'])) {
        throw new Error('project metadata input is invalid');
    }
    return value;
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

function normalizeProjectMetadata({projectRoot, input}) {
    const value = parseMetadataInput(input);
    if (value.schemaVersion !== 1) throw new Error('project metadata schema is unsupported');
    return Object.freeze({
        schemaVersion: 1,
        displayName: normalizeSingleLine(value.displayName, DISPLAY_NAME_MAXIMUM, 'display name'),
        summary: normalizeSentence(value.summary),
        suggestedDisplayName: path.basename(fs.realpathSync(projectRoot)),
    });
}

module.exports = {inspectMinimalMetadata, normalizeProjectMetadata};

// vim: ft=javascript sts=4 sw=4 ts=4 et :
