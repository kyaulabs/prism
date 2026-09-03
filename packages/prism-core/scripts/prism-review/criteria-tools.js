// $KYAULabs: criteria-tools.js kyau@aura.kyaulabs 2026/09/03 -0700 Exp $

'use strict';

const crypto = require('node:crypto');
const {LIMIT} = require('./constants');
const {closedObjectSchema, safeRelativePath} = require('./schema');

const OBJECT_ID = /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/;
const SHA256 = /^[0-9a-f]{64}$/;
const ROLES = new Set(['SPEC', 'PLAN', 'ISSUE', 'CONTEXT']);

function exact(value, keys, label) {
    if (value === null || typeof value !== 'object' || Array.isArray(value) ||
        Object.getPrototypeOf(value) !== Object.prototype || Object.keys(value).length !== keys.length ||
        keys.some((key) => !Object.hasOwn(value, key))) {
        throw new Error(`${label} is invalid`);
    }
}

function sourceIdentity(value, label = 'criteria source') {
    exact(value, ['role', 'commit', 'path', 'blobOid', 'byteCount', 'sha256'], label);
    if (!ROLES.has(value.role) || !OBJECT_ID.test(value.commit) ||
        !OBJECT_ID.test(value.blobOid) || !Number.isSafeInteger(value.byteCount) ||
        value.byteCount < 1 || value.byteCount > LIMIT.FILE_BYTES || !SHA256.test(value.sha256)) {
        throw new Error(`${label} is invalid`);
    }
    safeRelativePath(value.path, `${label} path`);
    return {...value};
}

function mergeInterval(intervals, start, end) {
    const merged = [];
    let nextStart = start;
    let nextEnd = end;
    for (const [currentStart, currentEnd] of intervals) {
        if (currentEnd < nextStart) {
            merged.push([currentStart, currentEnd]);
        } else if (nextEnd < currentStart) {
            merged.push([nextStart, nextEnd]);
            nextStart = currentStart;
            nextEnd = currentEnd;
        } else {
            nextStart = Math.min(nextStart, currentStart);
            nextEnd = Math.max(nextEnd, currentEnd);
        }
    }
    merged.push([nextStart, nextEnd]);
    return merged;
}

function complete(intervals, total) {
    return intervals.length === 1 && intervals[0][0] === 0 && intervals[0][1] === total;
}

function byteBoundary(bytes, offset) {
    return offset === 0 || offset === bytes.length || (bytes[offset] & 0xc0) !== 0x80;
}

function sliceUtf8(text, offset, limit) {
    const bytes = Buffer.from(text, 'utf8');
    if (offset < 0 || offset >= bytes.length || !byteBoundary(bytes, offset)) {
        throw new Error('criteria byte range is invalid');
    }
    let end = Math.min(bytes.length, offset + limit);
    while (end > offset && !byteBoundary(bytes, end)) end -= 1;
    if (end === offset) throw new Error('criteria byte range is invalid');
    return {
        text: bytes.subarray(offset, end).toString('utf8'),
        nextOffset: end,
        totalBytes: bytes.length,
    };
}

function validatedCriteria(criteria) {
    exact(criteria, ['record', 'digest', 'blobs'], 'verified criteria');
    if (!SHA256.test(criteria.digest) || !Array.isArray(criteria.blobs)) {
        throw new Error('verified criteria is invalid');
    }
    exact(criteria.record, ['schemaVersion', 'kind', 'branch', 'disposition', 'sources'], 'criteria record');
    if (criteria.record.schemaVersion !== 1 || criteria.record.kind !== 'criteria' ||
        !['DECLARED', 'NONE_DECLARED'].includes(criteria.record.disposition) ||
        !Array.isArray(criteria.record.sources) ||
        (criteria.record.disposition === 'DECLARED') !== (criteria.record.sources.length > 0) ||
        criteria.record.sources.length !== criteria.blobs.length) {
        throw new Error('criteria record is invalid');
    }
    const sources = criteria.record.sources.map((source) => sourceIdentity(source));
    const blobs = criteria.blobs.map((blob, index) => {
        exact(blob, ['role', 'commit', 'path', 'blobOid', 'byteCount', 'sha256', 'text'], 'criteria blob');
        const identity = sourceIdentity({
            role: blob.role,
            commit: blob.commit,
            path: blob.path,
            blobOid: blob.blobOid,
            byteCount: blob.byteCount,
            sha256: blob.sha256,
        }, 'criteria blob');
        if (typeof blob.text !== 'string') throw new Error('criteria blob is invalid');
        const textBytes = Buffer.from(blob.text, 'utf8');
        if (textBytes.length !== identity.byteCount ||
            crypto.createHash('sha256').update(textBytes).digest('hex') !== identity.sha256 ||
            JSON.stringify(identity) !== JSON.stringify(sources[index])) {
            throw new Error('criteria blob is invalid');
        }
        return {...identity, text: blob.text};
    });
    if (new Set(blobs.map(({sha256}) => sha256)).size !== blobs.length) {
        throw new Error('criteria source digests are duplicate');
    }
    return {record: {...criteria.record, sources}, digest: criteria.digest, blobs};
}

function createCriteriaTools(verifiedCriteria) {
    const criteria = validatedCriteria(verifiedCriteria);
    const blobs = new Map(criteria.blobs.map((blob) => [blob.sha256, blob]));
    const intervals = new Map(criteria.blobs.map((blob) => [blob.sha256, []]));
    const ledger = {
        failed: false,
        isSourceComplete(sourceDigest) {
            const source = blobs.get(sourceDigest);
            return !this.failed && source !== undefined &&
                complete(intervals.get(sourceDigest), source.byteCount);
        },
        isComplete() {
            return !this.failed && criteria.blobs.every((blob) => this.isSourceComplete(blob.sha256));
        },
        rows() {
            return criteria.record.sources.map((source) => ({
                ...source,
                status: this.isSourceComplete(source.sha256) ? 'EXPOSED' : 'INCOMPLETE',
            }));
        },
        report() {
            return {
                disposition: criteria.record.disposition,
                status: criteria.record.disposition === 'NONE_DECLARED'
                    ? 'NONE_DECLARED'
                    : (this.isComplete() ? 'EXPOSED' : 'INCOMPLETE'),
                sources: criteria.record.sources.map((source) => ({...source})),
            };
        },
    };
    const readCriteria = {
        name: 'read_criteria',
        description: 'Read one byte-bounded immutable criteria source segment.',
        parameters: closedObjectSchema({
            sourceDigest: {type: 'string', pattern: '^[0-9a-f]{64}$'},
            offset: {type: 'integer', minimum: 0},
            limit: {type: 'integer', minimum: 1, maximum: LIMIT.TOOL_BYTES},
        }, ['sourceDigest', 'offset', 'limit']),
        async execute(_callId, args) {
            try {
                exact(args, ['sourceDigest', 'offset', 'limit'], 'read_criteria arguments');
                if (!SHA256.test(args.sourceDigest) || !Number.isSafeInteger(args.offset) ||
                    !Number.isSafeInteger(args.limit) || args.limit < 1 || args.limit > LIMIT.TOOL_BYTES) {
                    throw new Error('read_criteria arguments are invalid');
                }
                const blob = blobs.get(args.sourceDigest);
                if (blob === undefined) throw new Error('criteria source is unavailable');
                const result = sliceUtf8(blob.text, args.offset, args.limit);
                intervals.set(blob.sha256, mergeInterval(
                    intervals.get(blob.sha256), args.offset, result.nextOffset
                ));
                return {
                    content: `UNTRUSTED REVIEW CRITERIA ${blob.sha256}\n${JSON.stringify(result.text)}`,
                    offset: args.offset,
                    nextOffset: result.nextOffset,
                    totalBytes: result.totalBytes,
                };
            } catch (error) {
                ledger.failed = true;
                throw error;
            }
        },
    };
    return {
        tools: Object.freeze({read_criteria: Object.freeze(readCriteria)}),
        ledger,
        disposition: criteria.record.disposition,
    };
}

module.exports = {createCriteriaTools};

// vim: ft=javascript sts=4 sw=4 ts=4 et :
