// $KYAULabs: template-source-validation.js kyau@aura.kyaulabs 2026/08/24 -0700 Exp $

'use strict';

const crypto = require('node:crypto');
const {TextDecoder} = require('node:util');
const {TemplateSourceError} = require('./template-source-http');

const LIMITS = Object.freeze({
    treeEntries: 1024,
    pathBytes: 4096,
    blobBytes: 4194304,
    aggregateBlobBytes: 67108864,
    manifestBytes: 262144,
});
const MANIFEST_PATH = '.prism/template-manifest.json';
const BRANCH_PATTERN = /^(?!\.)(?!.*\.\.)(?!.*\.lock$)[A-Za-z0-9](?:[A-Za-z0-9._-]{0,126}[A-Za-z0-9_-])?$/;
const SHA_PATTERN = /^[0-9a-f]{40}$/;

function fail(code) {
    throw new TemplateSourceError(code);
}

function isRecord(value) {
    return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function digestJson(value) {
    return crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

function validateRepository(value) {
    if (!isRecord(value) || value.full_name !== 'kyaulabs/template') fail('SOURCE_IDENTITY_INVALID');
    if (value.private !== false || value.visibility !== 'public') fail('SOURCE_IDENTITY_INVALID');
    if (
        typeof value.default_branch !== 'string' ||
        !value.default_branch.isWellFormed() ||
        Buffer.byteLength(value.default_branch) > 128 ||
        !BRANCH_PATTERN.test(value.default_branch)
    ) {
        fail('DEFAULT_BRANCH_INVALID');
    }
    return {defaultBranch: value.default_branch};
}

function validateCommit(value) {
    if (!isRecord(value) || !SHA_PATTERN.test(value.sha)) fail('COMMIT_INVALID');
    const treeSha = value.commit?.tree?.sha;
    if (!SHA_PATTERN.test(treeSha)) fail('COMMIT_INVALID');
    return {commitSha: value.sha, treeSha};
}

function validateTree(value, expectedTreeSha) {
    if (!isRecord(value) || value.sha !== expectedTreeSha || value.truncated !== false) {
        fail('TREE_INVALID');
    }
    if (!Array.isArray(value.tree)) fail('TREE_INVALID');
    const entries = value.tree.map((entry) => ({
        path: entry.path,
        mode: entry.mode,
        type: entry.type,
        sha: entry.sha,
        size: entry.size,
    }));
    const manifest = entries.find((entry) => entry.path === MANIFEST_PATH);
    if (!manifest) fail('TREE_INVALID');
    const blobs = entries.filter((entry) => entry.type === 'blob');
    return {blobs, entries, manifest};
}

function gitBlobSha(bytes) {
    return crypto.createHash('sha1')
        .update(Buffer.from(`blob ${bytes.length}\0`, 'utf8'))
        .update(bytes)
        .digest('hex');
}

function validateManifestBlob(value, manifestTreeEntry) {
    if (!isRecord(value) || value.sha !== manifestTreeEntry.sha) fail('MANIFEST_BLOB_INVALID');
    if (value.size !== manifestTreeEntry.size || value.encoding !== 'base64') {
        fail('MANIFEST_BLOB_INVALID');
    }
    if (typeof value.content !== 'string') fail('MANIFEST_BLOB_INVALID');
    const bytes = Buffer.from(value.content.replace(/\n/g, ''), 'base64');
    if (bytes.length !== value.size || gitBlobSha(bytes) !== value.sha) {
        fail('MANIFEST_BLOB_INVALID');
    }
    return {
        bytes,
        sha256: crypto.createHash('sha256').update(bytes).digest('hex'),
    };
}

function validateManifest(bytes, tree) {
    let value;
    try {
        value = JSON.parse(new TextDecoder('utf-8', {fatal: true}).decode(bytes));
    } catch {
        fail('MANIFEST_INVALID');
    }
    if (!isRecord(value) || value.schemaVersion !== 1) fail('MANIFEST_INVALID');
    if (value.templateId !== 'kyaulabs/template' || value.bootstrapProtocol !== 1) {
        fail('MANIFEST_INVALID');
    }
    if (!Array.isArray(value.entries)) fail('MANIFEST_INVALID');
    const treeBlobs = new Map(tree.blobs
        .filter(({path}) => path !== MANIFEST_PATH)
        .map((entry) => [entry.path, entry]));
    const entries = value.entries.map((entry) => {
        const source = treeBlobs.get(entry.path);
        if (!source || source.sha !== entry.blobSha || source.size !== entry.size) {
            fail('MANIFEST_TREE_MISMATCH');
        }
        return {
            path: entry.path,
            blobSha: entry.blobSha,
            size: entry.size,
            class: entry.class,
            capability: entry.capability,
            provider: entry.provider,
            disposition: entry.disposition,
        };
    }).sort((left, right) => left.path.localeCompare(right.path));
    return {
        catalogue: {
            schemaVersion: 1,
            bootstrapProtocol: 1,
            entries,
        },
        classificationSha256: digestJson({
            schemaVersion: 1,
            bootstrapProtocol: 1,
            entries,
        }),
    };
}

module.exports = {
    LIMITS,
    MANIFEST_PATH,
    digestJson,
    validateCommit,
    validateManifest,
    validateManifestBlob,
    validateRepository,
    validateTree,
};

// vim: ft=javascript sts=4 sw=4 ts=4 et :
