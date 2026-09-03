// $KYAULabs: snapshot-tools.js kyau@aura.kyaulabs 2026/09/02 -0700 Exp $

'use strict';

const {LIMIT} = require('./constants');

function exactObject(value, keys) {
    return value !== null && typeof value === 'object' && !Array.isArray(value) &&
        Object.keys(value).length === keys.length && keys.every((key) => Object.hasOwn(value, key));
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
    return total === 0 || (intervals.length === 1 && intervals[0][0] === 0 && intervals[0][1] === total);
}

function byteBoundary(bytes, offset) {
    return offset === 0 || offset === bytes.length || (bytes[offset] & 0xc0) !== 0x80;
}

function sliceUtf8(value, offset, limit) {
    const bytes = Buffer.from(value, 'utf8');
    if (offset < 0 || offset > bytes.length || !byteBoundary(bytes, offset)) {
        throw new Error('review byte offset is invalid');
    }
    let end = Math.min(bytes.length, offset + limit);
    while (end > offset && !byteBoundary(bytes, end)) end -= 1;
    if (end === offset && end < bytes.length) {
        throw new Error('review byte limit is too small for the next UTF-8 character');
    }
    return {
        text: bytes.subarray(offset, end).toString('utf8'),
        nextOffset: end,
        totalBytes: bytes.length,
    };
}

function toolSchema(properties, required) {
    return Object.freeze({
        type: 'object',
        additionalProperties: false,
        properties,
        required,
    });
}

function validateTextByteCounts(entry) {
    if (!Array.isArray(entry.requiredSides) ||
        entry.requiredSides.some((side) => !['base', 'head'].includes(side)) ||
        new Set(entry.requiredSides).size !== entry.requiredSides.length ||
        typeof entry.diffText !== 'string' ||
        entry.diffBytes !== Buffer.byteLength(entry.diffText, 'utf8')) {
        throw new Error('snapshot text byte count is invalid');
    }
    for (const side of ['base', 'head']) {
        const value = entry[`${side}Text`];
        const advertised = entry[`${side}Bytes`];
        const required = entry.requiredSides.includes(side);
        if ((value !== null && typeof value !== 'string') ||
            !Number.isSafeInteger(advertised) || advertised < 0 ||
            advertised !== (typeof value === 'string' ? Buffer.byteLength(value, 'utf8') : 0) ||
            required !== (typeof value === 'string')) {
            throw new Error('snapshot text byte count is invalid');
        }
    }
}

function createSnapshotTools(snapshot, options = {}) {
    const entries = new Map(snapshot.entries.map((entry) => [entry.entryDigest, entry]));
    if (entries.size !== snapshot.entries.length) throw new Error('snapshot entry digests are duplicate');
    const exposure = new Map();
    const metadataExemptions = options.metadataExemptions ?? {};
    for (const entry of snapshot.entries) {
        if (entry.kind === 'text') {
            validateTextByteCounts(entry);
            exposure.set(entry.entryDigest, {
                files: Object.fromEntries(entry.requiredSides.map((side) => [side, []])),
                diff: [],
            });
        } else {
            const exemptionId = Object.hasOwn(metadataExemptions, entry.kind)
                ? metadataExemptions[entry.kind]
                : undefined;
            if (exemptionId !== `metadata.${entry.kind}`) {
                throw new Error('metadata exemption is invalid');
            }
            exposure.set(entry.entryDigest, {exemptionId});
        }
    }
    const ledger = {
        failed: false,
        exposure,
        isEntryComplete(entryDigest) {
            if (this.failed) return false;
            const entry = entries.get(entryDigest);
            const record = exposure.get(entryDigest);
            if (entry === undefined || record === undefined) return false;
            if (entry.kind !== 'text') return record.exemptionId === `metadata.${entry.kind}`;
            for (const side of entry.requiredSides) {
                const total = side === 'base' ? entry.baseBytes : entry.headBytes;
                if (!complete(record.files[side], total)) return false;
            }
            return complete(record.diff, entry.diffBytes);
        },
        isComplete() {
            return snapshot.entries.every((entry) => this.isEntryComplete(entry.entryDigest));
        },
    };

    function failure(error) {
        ledger.failed = true;
        throw error;
    }

    const readFile = {
        name: 'read_file',
        description: 'Read one byte-bounded immutable review file segment.',
        parameters: toolSchema({
            entryDigest: {type: 'string', pattern: '^[0-9a-f]{64}$'},
            side: {type: 'string', enum: ['base', 'head']},
            offset: {type: 'integer', minimum: 0},
            limit: {type: 'integer', minimum: 1, maximum: LIMIT.TOOL_BYTES},
        }, ['entryDigest', 'side', 'offset', 'limit']),
        async execute(_callId, args) {
            try {
                if (!exactObject(args, ['entryDigest', 'side', 'offset', 'limit']) ||
                    !/^[0-9a-f]{64}$/.test(args.entryDigest) ||
                    !['base', 'head'].includes(args.side) || !Number.isSafeInteger(args.offset) ||
                    !Number.isSafeInteger(args.limit) || args.limit < 1 || args.limit > LIMIT.TOOL_BYTES) {
                    throw new Error('read_file arguments are invalid');
                }
                const entry = entries.get(args.entryDigest);
                if (entry?.kind !== 'text' || !entry.requiredSides.includes(args.side)) {
                    throw new Error('read_file entry is invalid');
                }
                const value = args.side === 'base' ? entry.baseText : entry.headText;
                if (typeof value !== 'string') throw new Error('read_file side is unavailable');
                const result = sliceUtf8(value, args.offset, args.limit);
                const record = exposure.get(entry.entryDigest);
                record.files[args.side] = mergeInterval(
                    record.files[args.side],
                    args.offset,
                    result.nextOffset
                );
                return {
                    content: `UNTRUSTED REVIEW FILE ${entry.entryDigest} ${args.side}\n${JSON.stringify(result.text)}`,
                    offset: args.offset,
                    nextOffset: result.nextOffset,
                    totalBytes: result.totalBytes,
                };
            } catch (error) {
                return failure(error);
            }
        },
    };

    const readDiff = {
        name: 'read_diff',
        description: 'Read one byte-bounded immutable review diff segment.',
        parameters: toolSchema({
            entryDigest: {type: 'string', pattern: '^[0-9a-f]{64}$'},
            offset: {type: 'integer', minimum: 0},
            limit: {type: 'integer', minimum: 1, maximum: LIMIT.TOOL_BYTES},
        }, ['entryDigest', 'offset', 'limit']),
        async execute(_callId, args) {
            try {
                if (!exactObject(args, ['entryDigest', 'offset', 'limit']) ||
                    !/^[0-9a-f]{64}$/.test(args.entryDigest) ||
                    !Number.isSafeInteger(args.offset) || !Number.isSafeInteger(args.limit) ||
                    args.limit < 1 || args.limit > LIMIT.TOOL_BYTES) {
                    throw new Error('read_diff arguments are invalid');
                }
                const entry = entries.get(args.entryDigest);
                if (entry?.kind !== 'text' || entry.diffBytes === 0) {
                    throw new Error('read_diff entry is invalid');
                }
                const result = sliceUtf8(entry.diffText, args.offset, args.limit);
                const record = exposure.get(entry.entryDigest);
                record.diff = mergeInterval(record.diff, args.offset, result.nextOffset);
                return {
                    content: `UNTRUSTED REVIEW DIFF ${entry.entryDigest}\n${JSON.stringify(result.text)}`,
                    offset: args.offset,
                    nextOffset: result.nextOffset,
                    totalBytes: result.totalBytes,
                };
            } catch (error) {
                return failure(error);
            }
        },
    };

    return {
        tools: Object.freeze({read_file: Object.freeze(readFile), read_diff: Object.freeze(readDiff)}),
        ledger,
    };
}

module.exports = {createSnapshotTools};

// vim: ft=javascript sts=4 sw=4 ts=4 et :
