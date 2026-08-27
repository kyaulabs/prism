// $KYAULabs: template-source.js kyau@aura.kyaulabs 2026/08/25 -0700 Exp $

'use strict';

const crypto = require('node:crypto');

const COMMIT_SHA = 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';
const TREE_SHA = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';

const SOURCE_ENTRIES = Object.freeze([
    Object.freeze({
        path: 'README.md',
        blobSha: '1111111111111111111111111111111111111111',
        size: 128,
        class: 'core-baseline',
        capability: 'project-readme',
        provider: Object.freeze({scope: 'core', id: 'project-readme'}),
        disposition: 'render',
    }),
    Object.freeze({
        path: '.gitignore',
        blobSha: '2222222222222222222222222222222222222222',
        size: 64,
        class: 'adapter-owned',
        capability: 'adapter-scaffold',
        provider: Object.freeze({scope: 'adapter', id: 'adapter-scaffold'}),
        disposition: 'render',
    }),
    Object.freeze({
        path: 'LICENSE',
        blobSha: '3333333333333333333333333333333333333333',
        size: 256,
        class: 'optional-profile',
        capability: 'licensing',
        provider: Object.freeze({scope: 'core', id: 'licensing'}),
        disposition: 'render',
    }),
    Object.freeze({
        path: '.github/media/git-flow.svg',
        blobSha: '4444444444444444444444444444444444444444',
        size: 512,
        class: 'template-maintenance-only',
        capability: 'template-maintenance',
        provider: null,
        disposition: 'exclude',
    }),
    Object.freeze({
        path: '.github/hooks/pre-commit',
        blobSha: '8888888888888888888888888888888888888888',
        size: 96,
        class: 'core-baseline',
        capability: 'core-hooks',
        provider: Object.freeze({scope: 'core', id: 'core-hooks'}),
        disposition: 'render',
    }),
    Object.freeze({
        path: 'commitlint.config.cjs',
        blobSha: '9999999999999999999999999999999999999999',
        size: 80,
        class: 'core-baseline',
        capability: 'commit-policy',
        provider: Object.freeze({scope: 'core', id: 'commit-policy'}),
        disposition: 'render',
    }),
]);

function gitBlobSha(bytes) {
    return crypto.createHash('sha1')
        .update(Buffer.from(`blob ${bytes.length}\0`, 'utf8'))
        .update(bytes)
        .digest('hex');
}

function deepClone(value) {
    return globalThis.structuredClone(value);
}

function streamResponse(body, {redirected = false, status = 200} = {}) {
    const bytes = Buffer.isBuffer(body) ? body : Buffer.from(body, 'utf8');
    return {
        status,
        redirected,
        body: new globalThis.ReadableStream({
            start(controller) {
                controller.enqueue(bytes);
                controller.close();
            },
        }),
    };
}

function createTemplateFixture({mutate, mutateManifest, transformManifestBytes, transport = {}} = {}) {
    const manifest = {
        schemaVersion: 1,
        templateId: 'kyaulabs/template',
        bootstrapProtocol: 1,
        entries: deepClone(SOURCE_ENTRIES),
    };
    if (mutateManifest) mutateManifest(manifest);
    let manifestBytes = Buffer.from(`${JSON.stringify(manifest)}\n`, 'utf8');
    if (transformManifestBytes) manifestBytes = Buffer.from(transformManifestBytes(manifestBytes));
    const manifestSha = gitBlobSha(manifestBytes);
    const tree = {
        sha: TREE_SHA,
        truncated: false,
        tree: [
            {path: '.github', mode: '040000', type: 'tree', sha: '5555555555555555555555555555555555555555'},
            {path: '.github/hooks', mode: '040000', type: 'tree', sha: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaab'},
            {path: '.github/media', mode: '040000', type: 'tree', sha: '6666666666666666666666666666666666666666'},
            {path: '.prism', mode: '040000', type: 'tree', sha: '7777777777777777777777777777777777777777'},
            ...SOURCE_ENTRIES.map((entry) => ({
                path: entry.path,
                mode: '100644',
                type: 'blob',
                sha: entry.blobSha,
                size: entry.size,
            })),
            {
                path: '.prism/template-manifest.json',
                mode: '100644',
                type: 'blob',
                sha: manifestSha,
                size: manifestBytes.length,
            },
        ],
    };
    const responses = {
        repository: {
            full_name: 'kyaulabs/template',
            private: false,
            visibility: 'public',
            default_branch: 'develop',
        },
        commit: {
            sha: COMMIT_SHA,
            commit: {tree: {sha: TREE_SHA}},
        },
        tree,
        manifestBlob: {
            sha: manifestSha,
            size: manifestBytes.length,
            encoding: 'base64',
            content: manifestBytes.toString('base64'),
        },
    };
    if (mutate) mutate(responses);

    const urls = [
        'https://api.github.com/repos/kyaulabs/template',
        'https://api.github.com/repos/kyaulabs/template/commits/develop',
        `https://api.github.com/repos/kyaulabs/template/git/trees/${TREE_SHA}?recursive=1`,
        `https://api.github.com/repos/kyaulabs/template/git/blobs/${manifestSha}`,
    ];
    const queue = [responses.repository, responses.commit, responses.tree, responses.manifestBlob];
    const calls = [];
    const fetch = async (url, options) => {
        calls.push({url, options});
        const index = calls.length - 1;
        if (index >= queue.length) throw new Error('unexpected template request');
        if (transport.rejectIndex === index) throw new Error('fixture network failure');
        if (transport.responseIndex === index) {
            const body = Object.prototype.hasOwnProperty.call(transport, 'rawBody')
                ? transport.rawBody
                : JSON.stringify(queue[index]);
            return streamResponse(body, {
                redirected: transport.redirected,
                status: transport.status,
            });
        }
        return streamResponse(JSON.stringify(queue[index]));
    };

    return {
        calls,
        commitSha: COMMIT_SHA,
        fetch,
        manifest,
        manifestSha,
        responses,
        tree,
        treeSha: TREE_SHA,
        urls,
    };
}

module.exports = {createTemplateFixture};

// vim: ft=javascript sts=4 sw=4 ts=4 et :
