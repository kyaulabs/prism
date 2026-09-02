// $KYAULabs: canonical-json.js kyau@aura.kyaulabs 2026/09/02 -0700 Exp $

'use strict';

const crypto = require('node:crypto');

function canonicalize(value) {
    if (value === null) return 'null';
    if (typeof value === 'string' || typeof value === 'boolean') return JSON.stringify(value);
    if (typeof value === 'number') {
        if (!Number.isFinite(value) || !Number.isSafeInteger(value)) {
            throw new Error('canonical JSON number is invalid');
        }
        return JSON.stringify(value);
    }
    if (Array.isArray(value)) {
        if (value.some((_entry, index) => !Object.hasOwn(value, index)) ||
            value.length !== Object.keys(value).length) {
            throw new Error('canonical JSON array is unsupported');
        }
        return `[${value.map((entry) => canonicalize(entry)).join(',')}]`;
    }
    if (typeof value !== 'object' || Object.getPrototypeOf(value) !== Object.prototype) {
        throw new Error('canonical JSON value is unsupported');
    }
    const entries = Object.keys(value).sort().map((key) => {
        if (value[key] === undefined) throw new Error('canonical JSON value is unsupported');
        return `${JSON.stringify(key)}:${canonicalize(value[key])}`;
    });
    return `{${entries.join(',')}}`;
}

function digestJson(value) {
    return crypto.createHash('sha256').update(canonicalize(value), 'utf8').digest('hex');
}

module.exports = {canonicalize, digestJson};

// vim: ft=javascript sts=4 sw=4 ts=4 et :
