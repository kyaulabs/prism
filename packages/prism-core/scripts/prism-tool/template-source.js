// $KYAULabs: template-source.js kyau@aura.kyaulabs 2026/08/25 -0700 Exp $

'use strict';

const fs = require('node:fs');
const {URL} = require('node:url');
const {inspectSetupRoute} = require('./setup-route');
const {TemplateSourceError, requestTemplateJson} = require('./template-source-http');
const {
    MANIFEST_PATH,
    validateCommit,
    validateManifest,
    validateManifestBlob,
    validateRepository,
    validateTree,
} = require('./template-source-validation');

const API_ROOT = new URL('https://api.github.com/');
const REPOSITORY_PATH = 'repos/kyaulabs/template';
const RESPONSE_LIMITS = Object.freeze({
    repository: 65536,
    commit: 262144,
    tree: 4194304,
    manifestBlob: 524288,
});

function apiUrl(suffix = '') {
    return new URL(`${REPOSITORY_PATH}${suffix}`, API_ROOT).href;
}

function sourceReport({projectRoot, source, status, disposition, reason, data}) {
    return {
        schemaVersion: 1,
        command: 'setup source',
        status,
        disposition,
        source,
        reason,
        projectRoot,
        checks: [{
            id: 'setup-source',
            status: status === 'GO' ? 'PASS' : 'FAIL',
            message: status === 'GO' ? 'setup source is valid' : 'setup source is unavailable',
        }],
        data,
    };
}

function stoppedReport(route, source) {
    return sourceReport({
        projectRoot: route.projectRoot,
        source,
        status: 'NO-GO',
        disposition: 'STOP',
        reason: route.reason,
        data: null,
    });
}

function blankReport(projectRoot) {
    return sourceReport({
        projectRoot,
        source: 'BLANK',
        status: 'GO',
        disposition: 'SOURCE_READY',
        reason: 'BLANK_SELECTED',
        data: {
            attestation: {
                schemaVersion: 1,
                source: 'BLANK',
                template: null,
            },
            catalogue: null,
        },
    });
}

async function acquireTemplateSource({fetchImpl, projectRoot}) {
    const repository = validateRepository(await requestTemplateJson({
        fetchImpl,
        url: apiUrl(),
        maxBytes: RESPONSE_LIMITS.repository,
    }));
    const commit = validateCommit(await requestTemplateJson({
        fetchImpl,
        url: apiUrl(`/commits/${encodeURIComponent(repository.defaultBranch)}`),
        maxBytes: RESPONSE_LIMITS.commit,
    }));
    const tree = validateTree(await requestTemplateJson({
        fetchImpl,
        url: apiUrl(`/git/trees/${commit.treeSha}?recursive=1`),
        maxBytes: RESPONSE_LIMITS.tree,
    }), commit.treeSha);
    const manifestBlob = validateManifestBlob(await requestTemplateJson({
        fetchImpl,
        url: apiUrl(`/git/blobs/${tree.manifest.sha}`),
        maxBytes: RESPONSE_LIMITS.manifestBlob,
    }), tree.manifest);
    const manifest = validateManifest(manifestBlob.bytes, tree);

    return sourceReport({
        projectRoot,
        source: 'TEMPLATE',
        status: 'GO',
        disposition: 'SOURCE_READY',
        reason: 'TEMPLATE_VALID',
        data: {
            attestation: {
                schemaVersion: 1,
                source: 'TEMPLATE',
                templateId: 'kyaulabs/template',
                defaultBranch: repository.defaultBranch,
                commitSha: commit.commitSha,
                treeSha: commit.treeSha,
                manifest: {
                    path: MANIFEST_PATH,
                    blobSha: tree.manifest.sha,
                    size: tree.manifest.size,
                    sha256: manifestBlob.sha256,
                },
                classificationSha256: manifest.classificationSha256,
            },
            catalogue: manifest.catalogue,
        },
    });
}

function inspectProvisionedBlankSource({projectRoot}) {
    return blankReport(fs.realpathSync(projectRoot));
}

async function inspectProvisionedTemplateSource({projectRoot, fetchImpl}) {
    const canonicalRoot = fs.realpathSync(projectRoot);
    try {
        return await acquireTemplateSource({
            fetchImpl: fetchImpl ?? globalThis.fetch,
            projectRoot: canonicalRoot,
        });
    } catch (error) {
        const reason = error instanceof TemplateSourceError ? error.code : 'NETWORK_FAILED';
        return sourceReport({
            projectRoot: canonicalRoot,
            source: 'TEMPLATE',
            status: 'NO-GO',
            disposition: 'SOURCE_UNAVAILABLE',
            reason,
            data: null,
        });
    }
}

async function inspectTemplateSource({projectRoot, source, fetchImpl}) {
    const route = inspectSetupRoute({projectRoot, source});
    if (route.status !== 'GO' || route.disposition !== 'STRICT_EMPTY') {
        return stoppedReport(route, source);
    }
    if (source === 'BLANK') return blankReport(route.projectRoot);
    try {
        return await acquireTemplateSource({
            fetchImpl: fetchImpl ?? globalThis.fetch,
            projectRoot: route.projectRoot,
        });
    } catch (error) {
        const reason = error instanceof TemplateSourceError ? error.code : 'NETWORK_FAILED';
        return sourceReport({
            projectRoot: route.projectRoot,
            source: 'TEMPLATE',
            status: 'NO-GO',
            disposition: 'SOURCE_UNAVAILABLE',
            reason,
            data: null,
        });
    }
}

module.exports = {
    acquireTemplateSource,
    inspectProvisionedBlankSource,
    inspectProvisionedTemplateSource,
    inspectTemplateSource,
};

// vim: ft=javascript sts=4 sw=4 ts=4 et :
