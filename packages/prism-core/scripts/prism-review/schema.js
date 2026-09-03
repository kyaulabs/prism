// $KYAULabs: schema.js kyau@aura.kyaulabs 2026/09/03 -0700 Exp $

'use strict';

const path = require('node:path');
const {AXES} = require('./constants');

const ID = /^[a-z0-9]+(?:[.-][a-z0-9]+)*$/;
const PACKAGE = /^(?:@[a-z0-9][a-z0-9._-]*\/)?[a-z0-9][a-z0-9._-]*$/;
const HEX_40 = /^[0-9a-f]{40}$/;
const HEX_64 = /^[0-9a-f]{64}$/;
const SOURCE_LICENSES = new Set(['CC0-1.0', 'CC-BY-SA-4.0']);
const EXEMPTION_KINDS = new Set(['binary', 'symlink', 'gitlink', 'unsupported-mode']);
const PATTERN_SYNTAX = /[*?[\]{}()|+^$\\]/;

function fail(label) {
    throw new Error(`${label} is invalid`);
}

function object(value, keys, label) {
    if (value === null || typeof value !== 'object' || Array.isArray(value) ||
        Object.getPrototypeOf(value) !== Object.prototype) fail(label);
    const actual = Object.keys(value);
    if (actual.some((key) => !keys.includes(key))) fail(label);
    return value;
}

function exactKeys(value, required, optional, label) {
    object(value, [...required, ...optional], label);
    if (required.some((key) => !Object.hasOwn(value, key))) fail(label);
}

function boundedText(value, label, maximum = 4096) {
    if (typeof value !== 'string' || value.length === 0 || /[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/.test(value) ||
        Buffer.byteLength(value, 'utf8') > maximum) fail(label);
    return value;
}

function id(value, label) {
    if (typeof value !== 'string' || Buffer.byteLength(value, 'utf8') > 128 || !ID.test(value)) {
        fail(label);
    }
    return value;
}

function unique(values, label) {
    if (new Set(values).size !== values.length) fail(label);
}

function sortedUnique(values, validate, label) {
    if (!Array.isArray(values) || values.length === 0) fail(label);
    values.forEach((value) => validate(value, label));
    unique(values, label);
    if (values.some((value, index) => index > 0 && values[index - 1] > value)) fail(label);
}

function safeRelativePath(value, label = 'resource path') {
    if (typeof value !== 'string' || value.length === 0 || Buffer.byteLength(value, 'utf8') > 1024 ||
        /[\x00-\x1f\x7f\\]/.test(value) || path.posix.isAbsolute(value) ||
        value.split('/').some((part) => part === '' || part === '.' || part === '..') ||
        PATTERN_SYNTAX.test(value) || path.posix.normalize(value) !== value) fail(label);
    return value;
}

function literalPart(value, label) {
    boundedText(value, label, 256);
    if (PATTERN_SYNTAX.test(value)) fail(label);
}

function trigger(value, label) {
    object(value, ['mode', 'suffixes', 'prefixes', 'basenames'], label);
    if (value.mode === 'always') {
        if (Object.keys(value).length !== 1) fail(label);
        return value;
    }
    if (value.mode !== 'paths') fail(label);
    const present = ['suffixes', 'prefixes', 'basenames'].filter((key) => Object.hasOwn(value, key));
    if (present.length === 0) fail(label);
    for (const key of present) {
        if (key === 'suffixes') {
            sortedUnique(value[key], (entry) => {
                literalPart(entry, label);
                if (!entry.startsWith('.') || entry.includes('/')) fail(label);
            }, label);
        } else if (key === 'prefixes') {
            sortedUnique(value[key], (entry) => {
                literalPart(entry, label);
                if (entry.startsWith('/') || !entry.endsWith('/') ||
                    entry.slice(0, -1).split('/').some((part) => !part || part === '.' || part === '..')) {
                    fail(label);
                }
            }, label);
        } else {
            sortedUnique(value[key], (entry) => {
                literalPart(entry, label);
                if (entry.includes('/')) fail(label);
            }, label);
        }
    }
    return value;
}

function source(value) {
    exactKeys(
        value,
        ['repository', 'revision', 'path', 'sha256', 'license', 'changes'],
        [],
        'resource source'
    );
    let url;
    try {
        url = new URL(value.repository);
    } catch {
        fail('resource source');
    }
    if (url.protocol !== 'https:' || url.hostname !== 'github.com' || url.port ||
        url.username || url.password || url.search || url.hash ||
        !/^\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(url.pathname) ||
        !HEX_40.test(value.revision) || !HEX_64.test(value.sha256) ||
        !SOURCE_LICENSES.has(value.license)) fail('resource source');
    safeRelativePath(value.path, 'resource source path');
    boundedText(value.changes, 'resource source changes', 4096);
    return value;
}

function resource(value) {
    exactKeys(value, ['id', 'path', 'license'], ['source'], 'resource');
    id(value.id, 'resource id');
    safeRelativePath(value.path);
    boundedText(value.license, 'resource license', 128);
    const adapted = SOURCE_LICENSES.has(value.license);
    if (value.license !== 'AGPL-3.0-only' && !adapted) fail('resource license');
    if (adapted !== (value.source !== undefined)) fail('resource provenance');
    if (value.source !== undefined) {
        source(value.source);
        if (value.source.license !== value.license) fail('resource provenance');
    }
    return value;
}

function lens(value) {
    exactKeys(value, ['id', 'skill', 'trigger'], [], 'lens');
    id(value.id, 'lens id');
    id(value.skill, 'lens skill');
    trigger(value.trigger, 'lens trigger');
    return value;
}

function axis(value) {
    exactKeys(value, ['id', 'lenses'], [], 'axis');
    if (!AXES.includes(value.id) || !Array.isArray(value.lenses) || value.lenses.length === 0) {
        fail('axis');
    }
    value.lenses.forEach(lens);
    unique(value.lenses.map((entry) => entry.id), 'lens ids');
    return value;
}

function exemption(value) {
    exactKeys(value, ['id', 'axes', 'kind', 'trigger', 'reason'], [], 'exemption');
    id(value.id, 'exemption id');
    if (!EXEMPTION_KINDS.has(value.kind) || value.id !== `metadata.${value.kind}`) fail('exemption');
    if (!Array.isArray(value.axes) || value.axes.length === 0 ||
        value.axes.some((axisId) => !AXES.includes(axisId))) fail('exemption axes');
    unique(value.axes, 'exemption axes');
    const positions = value.axes.map((axisId) => AXES.indexOf(axisId));
    if (positions.some((position, index) => index > 0 && positions[index - 1] >= position)) {
        fail('exemption axes');
    }
    trigger(value.trigger, 'exemption trigger');
    boundedText(value.reason, 'exemption reason', 1024);
    return value;
}

function validateProfile(value, expectedRole, expectedPackage) {
    const coreKeys = ['schemaVersion', 'package', 'role', 'resources', 'sessionSkill',
        'verifierSkills', 'exemptions', 'axes'];
    const adapterKeys = ['schemaVersion', 'package', 'role', 'resources', 'exemptions', 'axes'];
    exactKeys(
        value,
        expectedRole === 'core' ? coreKeys : adapterKeys,
        [],
        'review profile'
    );
    if (value.schemaVersion !== 1 || value.role !== expectedRole || value.package !== expectedPackage ||
        !PACKAGE.test(value.package) || !Array.isArray(value.resources) ||
        !Array.isArray(value.exemptions) || !Array.isArray(value.axes)) fail('review profile');
    if (value.resources.length === 0) fail('review resources');
    value.resources.forEach(resource);
    unique(value.resources.map((entry) => entry.id), 'resource ids');
    unique(value.resources.map((entry) => entry.path), 'resource paths');
    const resourceIds = new Set(value.resources.map((entry) => entry.id));
    value.exemptions.forEach(exemption);
    unique(value.exemptions.map((entry) => entry.id), 'exemption ids');
    value.axes.forEach(axis);
    unique(value.axes.map((entry) => entry.id), 'axis ids');
    unique(value.axes.flatMap((entry) => entry.lenses.map((item) => item.id)), 'lens ids');
    if (value.axes.some((entry) => entry.lenses.some((item) => !resourceIds.has(item.skill)))) {
        fail('lens skill');
    }
    const expectedAxes = expectedRole === 'core'
        ? AXES
        : AXES.filter((axisId) => value.axes.some((entry) => entry.id === axisId));
    if (value.axes.length === 0 || value.axes.length !== expectedAxes.length ||
        value.axes.some((entry, index) => entry.id !== expectedAxes[index])) {
        fail('axis order');
    }
    if (expectedRole === 'core') {
        id(value.sessionSkill, 'session skill');
        if (!resourceIds.has(value.sessionSkill) || !Array.isArray(value.verifierSkills) ||
            value.verifierSkills.length === 0) fail('review controls');
        value.verifierSkills.forEach((entry) => id(entry, 'verifier skill'));
        unique(value.verifierSkills, 'verifier skills');
        if (value.verifierSkills.some((entry) => !resourceIds.has(entry))) fail('review controls');
    }
    return value;
}

function validateSchemaNode(value, label) {
    if (value === null || typeof value !== 'object' || Array.isArray(value) ||
        Object.getPrototypeOf(value) !== Object.prototype) fail(label);
    if (value.type === 'object') {
        object(value, ['type', 'additionalProperties', 'properties', 'required', 'description'], label);
        if (value.additionalProperties !== false) fail(label);
        object(value.properties, Object.keys(value.properties ?? {}), label);
        if (!Array.isArray(value.required) ||
            value.required.some((key) => typeof key !== 'string' || !Object.hasOwn(value.properties, key))) {
            fail(label);
        }
        unique(value.required, label);
        Object.values(value.properties).forEach((entry) => validateSchemaNode(entry, label));
    } else if (value.type === 'array') {
        object(value, ['type', 'items', 'minItems', 'maxItems', 'description'], label);
        validateSchemaNode(value.items, label);
    } else {
        object(value, ['type', 'enum', 'const', 'minimum', 'maximum', 'pattern', 'description'], label);
        const types = Array.isArray(value.type) ? value.type : [value.type];
        const supported = new Set(['boolean', 'integer', 'null', 'number', 'string']);
        if (types.length === 0 || types.some((type) => !supported.has(type))) fail(label);
        unique(types, label);
    }
}

function validateClosedJsonSchema(value, label = 'tool schema') {
    object(value, ['type', 'additionalProperties', 'properties', 'required'], label);
    if (value.type !== 'object') fail(label);
    validateSchemaNode(value, label);
    return value;
}

function closedObjectSchema(properties, required) {
    const schema = {
        type: 'object',
        additionalProperties: false,
        properties,
        required,
    };
    validateClosedJsonSchema(schema);
    return deepFreezeJson(schema, 'tool schema');
}

function matchesSchemaType(value, type) {
    if (type === 'null') return value === null;
    if (type === 'array') return Array.isArray(value);
    if (type === 'object') {
        return value !== null && typeof value === 'object' && !Array.isArray(value) &&
            Object.getPrototypeOf(value) === Object.prototype;
    }
    if (type === 'integer') return Number.isSafeInteger(value);
    if (type === 'number') return typeof value === 'number' && Number.isFinite(value);
    return typeof value === type;
}

function validateSchemaValue(value, schema, label) {
    const types = Array.isArray(schema.type) ? schema.type : [schema.type];
    if (!types.some((type) => matchesSchemaType(value, type))) fail(label);
    if (Object.hasOwn(schema, 'const') && !Object.is(value, schema.const)) fail(label);
    if (schema.enum !== undefined && !schema.enum.some((entry) => Object.is(value, entry))) fail(label);
    if (typeof value === 'string' && schema.pattern !== undefined && !new RegExp(schema.pattern, 'u').test(value)) {
        fail(label);
    }
    if (typeof value === 'number' &&
        ((schema.minimum !== undefined && value < schema.minimum) ||
        (schema.maximum !== undefined && value > schema.maximum))) fail(label);
    if (Array.isArray(value)) {
        if ((schema.minItems !== undefined && value.length < schema.minItems) ||
            (schema.maxItems !== undefined && value.length > schema.maxItems)) fail(label);
        value.forEach((entry) => validateSchemaValue(entry, schema.items, label));
    } else if (types.includes('object') && value !== null && typeof value === 'object') {
        const keys = Reflect.ownKeys(value);
        if (keys.some((key) => {
            const descriptor = typeof key === 'string' ? Object.getOwnPropertyDescriptor(value, key) : undefined;
            return descriptor === undefined || !descriptor.enumerable || !Object.hasOwn(descriptor, 'value') ||
                !Object.hasOwn(schema.properties, key);
        }) || schema.required.some((key) => !Object.hasOwn(value, key))) fail(label);
        for (const key of keys) validateSchemaValue(value[key], schema.properties[key], label);
    }
}

function validateJsonSchemaValue(value, schema, label = 'tool arguments') {
    validateClosedJsonSchema(schema);
    validateSchemaValue(value, schema, label);
    return value;
}

function deepFreezeJson(value, label = 'JSON value') {
    if (value === null || typeof value === 'string' || typeof value === 'boolean') return value;
    if (typeof value === 'number') {
        if (!Number.isFinite(value)) fail(label);
        return value;
    }
    if (Array.isArray(value)) return Object.freeze(value.map((entry) => deepFreezeJson(entry, label)));
    object(value, Object.keys(value), label);
    const copy = {};
    for (const [key, entry] of Object.entries(value)) {
        Object.defineProperty(copy, key, {
            value: deepFreezeJson(entry, label),
            enumerable: true,
            configurable: true,
            writable: true,
        });
    }
    return Object.freeze(copy);
}

function findingProperties() {
    return {
        axis: {type: 'string'},
        lensId: {type: 'string'},
        classification: {type: 'string', enum: ['BLOCKING', 'ADVISORY', 'SUGGESTED']},
        path: {type: 'string'},
        side: {type: 'string', enum: ['base', 'head']},
        line: {type: 'integer', minimum: 1},
        summary: {type: 'string'},
        evidence: {type: 'string'},
        causality: {type: ['string', 'null']},
        relevance: {type: ['string', 'null']},
        workflowImpact: {type: ['string', 'null']},
    };
}

function axisSubmissionSchema(axisId, lensIds) {
    return {
        type: 'object',
        additionalProperties: false,
        properties: {
            schemaVersion: {type: 'integer', const: 1},
            axis: {type: 'string', const: axisId},
            outcome: {type: 'string', enum: ['PASS', 'BLOCKING', 'INCONCLUSIVE']},
            lenses: {
                type: 'array',
                minItems: lensIds.length,
                maxItems: lensIds.length,
                items: {
                    type: 'object',
                    additionalProperties: false,
                    properties: {
                        id: {type: 'string', enum: lensIds},
                        status: {type: 'string', enum: ['COMPLETE', 'INCONCLUSIVE']},
                    },
                    required: ['id', 'status'],
                },
            },
            findings: {
                type: 'array',
                maxItems: 64,
                items: {
                    type: 'object',
                    additionalProperties: false,
                    properties: findingProperties(),
                    required: ['axis', 'lensId', 'classification', 'path', 'side', 'line',
                        'summary', 'evidence', 'causality', 'relevance', 'workflowImpact'],
                },
            },
            notes: {type: 'array', maxItems: 16, items: {type: 'string'}},
        },
        required: ['schemaVersion', 'axis', 'outcome', 'lenses', 'findings', 'notes'],
    };
}

function closureSubmissionSchema(fingerprints) {
    return {
        type: 'object',
        additionalProperties: false,
        properties: {
            schemaVersion: {type: 'integer', const: 1},
            dispositions: {
                type: 'array',
                minItems: fingerprints.length,
                maxItems: fingerprints.length,
                items: {
                    type: 'object',
                    additionalProperties: false,
                    properties: {
                        fingerprint: {type: 'string', enum: fingerprints},
                        disposition: {type: 'string', enum: [
                            'CONFIRMED', 'REJECTED', 'NEEDS_CONTEXT', 'INVALID_LOCATION',
                        ]},
                        rationale: {type: 'string'},
                    },
                    required: ['fingerprint', 'disposition', 'rationale'],
                },
            },
        },
        required: ['schemaVersion', 'dispositions'],
    };
}

function verifierSubmissionSchema(fingerprints) {
    return {
        type: 'object',
        additionalProperties: false,
        properties: {
            schemaVersion: {type: 'integer', const: 1},
            dispositions: {
                type: 'array',
                minItems: fingerprints.length,
                maxItems: fingerprints.length,
                items: {
                    type: 'object',
                    additionalProperties: false,
                    properties: {
                        fingerprint: {type: 'string', enum: fingerprints},
                        disposition: {type: 'string', enum: [
                            'CONFIRMED', 'REJECTED', 'NEEDS_CONTEXT', 'INVALID_LOCATION', 'DUPLICATE',
                        ]},
                        rationale: {type: 'string'},
                        duplicateOf: {type: ['string', 'null']},
                    },
                    required: ['fingerprint', 'disposition', 'rationale', 'duplicateOf'],
                },
            },
        },
        required: ['schemaVersion', 'dispositions'],
    };
}

function triggerMatches(value, changedPath) {
    if (value.mode === 'always') return true;
    const basename = path.posix.basename(changedPath);
    return (value.suffixes ?? []).some((suffix) => changedPath.endsWith(suffix)) ||
        (value.prefixes ?? []).some((prefix) => changedPath.startsWith(prefix)) ||
        (value.basenames ?? []).includes(basename);
}

module.exports = {
    axisSubmissionSchema,
    closureSubmissionSchema,
    closedObjectSchema,
    deepFreezeJson,
    safeRelativePath,
    triggerMatches,
    validateClosedJsonSchema,
    validateJsonSchemaValue,
    validateProfile,
    verifierSubmissionSchema,
};

// vim: ft=javascript sts=4 sw=4 ts=4 et :
