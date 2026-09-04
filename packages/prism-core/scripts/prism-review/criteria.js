// $KYAULabs: criteria.js kyau@aura.kyaulabs 2026/09/03 -0700 Exp $

'use strict';

const childProcess = require('node:child_process');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {TextDecoder} = require('node:util');
const {digestJson} = require('./canonical-json');
const {LIMIT} = require('./constants');
const {
    REVIEW_STATE,
    inspectAuthorityRecord,
    publishAuthorityRecord,
} = require('./review-state');
const {safeRelativePath} = require('./schema');
const {
    loadAdditionalSensitivePaths,
    sensitivePathMatch,
} = require('../sensitive-path-policy');

const BRANCH = /^[A-Za-z0-9][A-Za-z0-9._/-]*$/;
const OBJECT_ID = /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/;
const ROLE = new Set(['SPEC', 'PLAN', 'ISSUE', 'CONTEXT']);
const FILE_LIMIT = 131072;
const SOURCE_LIMIT = LIMIT.FILE_BYTES;
const decoder = new TextDecoder('utf-8', {fatal: true});

function exact(value, keys, label) {
    if (value === null || typeof value !== 'object' || Array.isArray(value) ||
        Object.getPrototypeOf(value) !== Object.prototype ||
        Object.keys(value).sort().join(',') !== [...keys].sort().join(',')) {
        throw new Error(`${label} is invalid`);
    }
}

function repositoryRoot(context) {
    return fs.realpathSync(context.projectRoot ?? context.cwd ?? process.cwd());
}

function runGit(context, args, maximum = 1048576) {
    const result = (context.run ?? childProcess.spawnSync)('git', args, {
        cwd: repositoryRoot(context),
        env: context.env ?? process.env,
        encoding: null,
        maxBuffer: maximum,
        timeout: 30000,
    });
    const stdout = Buffer.isBuffer(result.stdout) ? result.stdout : Buffer.from(result.stdout ?? '');
    if (result.error || result.status !== 0 || stdout.length > maximum) {
        throw new Error('criteria Git evidence is unavailable');
    }
    return stdout;
}

function decode(bytes, label) {
    try {
        return decoder.decode(bytes);
    } catch (error) {
        throw new Error(`${label} is not valid UTF-8`, {cause: error});
    }
}

function textOutput(context, args, label) {
    const value = decode(runGit(context, args), label).trim();
    if (value === '' || /[\x00-\x1f\x7f]/.test(value)) throw new Error(`${label} is invalid`);
    return value;
}

function currentBranch(context) {
    const branch = textOutput(context, ['symbolic-ref', '--quiet', '--short', 'HEAD'], 'criteria branch');
    if (!BRANCH.test(branch)) throw new Error('criteria branch is invalid');
    return branch;
}

function sha256(bytes) {
    return crypto.createHash('sha256').update(bytes).digest('hex');
}

function validateSource(value) {
    exact(value, ['role', 'commit', 'path', 'blobOid', 'byteCount', 'sha256'], 'criteria source');
    if (!ROLE.has(value.role) || !OBJECT_ID.test(value.commit) || !OBJECT_ID.test(value.blobOid) ||
        !Number.isSafeInteger(value.byteCount) || value.byteCount < 1 || value.byteCount > SOURCE_LIMIT ||
        !/^[0-9a-f]{64}$/.test(value.sha256)) {
        throw new Error('criteria source is invalid');
    }
    safeRelativePath(value.path, 'criteria source path');
    return {...value};
}

function parseCriteria(value) {
    exact(value, ['schemaVersion', 'kind', 'branch', 'disposition', 'sources'], 'criteria record');
    if (value.schemaVersion !== 1 || value.kind !== 'criteria' || !BRANCH.test(value.branch) ||
        !['DECLARED', 'NONE_DECLARED'].includes(value.disposition) ||
        !Array.isArray(value.sources) || value.sources.length > 16) {
        throw new Error('criteria record is invalid');
    }
    const sources = value.sources.map(validateSource);
    if ((value.disposition === 'DECLARED') !== (sources.length > 0)) {
        throw new Error('criteria disposition is invalid');
    }
    const keys = sources.map(({role, path: sourcePath}) => `${role}\0${sourcePath}`);
    if (new Set(keys).size !== keys.length ||
        new Set(sources.map(({path: sourcePath}) => sourcePath)).size !== sources.length ||
        keys.some((key, index) => index > 0 && keys[index - 1] > key)) {
        throw new Error('criteria source order is invalid');
    }
    if (sources.reduce((total, source) => total + source.byteCount, 0) > LIMIT.INPUT_BYTES) {
        throw new Error('criteria sources exceed limit');
    }
    return {...value, sources};
}

function criteriaDigest(record) {
    return digestJson(parseCriteria(record));
}

function inspectCriteria(context = {}) {
    return inspectAuthorityRecord({
        projectRoot: repositoryRoot(context),
        filename: 'criteria.json',
        limit: FILE_LIMIT,
        parse: parseCriteria,
    }, context);
}

function resolveCommit(context, revision) {
    if (!OBJECT_ID.test(revision)) throw new Error('criteria revision is invalid');
    const commit = textOutput(context, ['rev-parse', '--verify', `${revision}^{commit}`], 'criteria revision');
    if (!OBJECT_ID.test(commit)) throw new Error('criteria revision is invalid');
    runGit(context, ['merge-base', '--is-ancestor', commit, 'HEAD']);
    return commit;
}

function assertSafePath(context, sourcePath) {
    const root = repositoryRoot(context);
    const policy = {
        projectDir: root,
        home: context.home ?? os.homedir(),
        extraPaths: loadAdditionalSensitivePaths(
            context.sensitivePaths ?? (context.env ?? process.env).PRISM_SENSITIVE_PATHS
        ),
    };
    if (sensitivePathMatch(path.join(root, sourcePath), policy) !== null) {
        throw new Error('criteria source is sensitive');
    }
}

function treeIdentity(context, commit, sourcePath) {
    const bytes = runGit(context, ['ls-tree', '-z', commit, '--', sourcePath]);
    const match = decode(bytes, 'criteria tree').match(/^(100644|100755) blob ([0-9a-f]{40}|[0-9a-f]{64})\t([^\0]+)\0$/);
    if (match === null || match[3] !== sourcePath) throw new Error('criteria source is unavailable');
    return match[2];
}

function readBlob(context, blobOid) {
    const bytes = runGit(context, ['cat-file', 'blob', blobOid], SOURCE_LIMIT + 1);
    if (bytes.length === 0 || bytes.length > SOURCE_LIMIT) throw new Error('criteria source exceeds limit');
    const text = decode(bytes, 'criteria source');
    if (text.includes('\0')) throw new Error('criteria source is invalid');
    return {bytes, text};
}

function sourceIdentity(input, context) {
    exact(input, ['role', 'commit', 'path'], 'criteria source request');
    if (!ROLE.has(input.role)) throw new Error('criteria source role is invalid');
    safeRelativePath(input.path, 'criteria source path');
    assertSafePath(context, input.path);
    const commit = resolveCommit(context, input.commit);
    const blobOid = treeIdentity(context, commit, input.path);
    const {bytes} = readBlob(context, blobOid);
    return {
        role: input.role,
        commit,
        path: input.path,
        blobOid,
        byteCount: bytes.length,
        sha256: sha256(bytes),
    };
}

function repositoryIdentity(context) {
    const head = textOutput(context, ['rev-parse', '--verify', 'HEAD^{commit}'], 'criteria HEAD');
    if (!OBJECT_ID.test(head)) throw new Error('criteria HEAD is invalid');
    return {branch: currentBranch(context), head};
}

function assertRepositoryIdentity(expected, context) {
    const current = repositoryIdentity(context);
    if (current.branch !== expected.branch || current.head !== expected.head) {
        throw new Error('criteria repository changed');
    }
}

function recordCriteria(input, context = {}) {
    exact(input, ['disposition', 'sources'], 'criteria request');
    if (!['DECLARED', 'NONE_DECLARED'].includes(input.disposition) ||
        !Array.isArray(input.sources) || input.sources.length > 16 ||
        (input.disposition === 'DECLARED') !== (input.sources.length > 0)) {
        throw new Error('criteria request is invalid');
    }
    const repository = repositoryIdentity(context);
    const sources = input.sources.map((source) => sourceIdentity(source, context))
        .sort((left, right) => {
            const leftKey = `${left.role}\0${left.path}`;
            const rightKey = `${right.role}\0${right.path}`;
            return leftKey < rightKey ? -1 : leftKey > rightKey ? 1 : 0;
        });
    const record = parseCriteria({
        schemaVersion: 1,
        kind: 'criteria',
        branch: repository.branch,
        disposition: input.disposition,
        sources,
    });
    assertRepositoryIdentity(repository, context);
    const current = inspectCriteria(context);
    if (current.state === REVIEW_STATE.VALID && current.record.branch === record.branch) {
        if (JSON.stringify(current.record) !== JSON.stringify(record)) {
            throw new Error('criteria record is immutable');
        }
        assertRepositoryIdentity(repository, context);
        return {...current.record, path: current.path, digest: criteriaDigest(current.record)};
    }
    if (![REVIEW_STATE.ABSENT, REVIEW_STATE.VALID].includes(current.state)) {
        throw new Error('criteria record is unsafe');
    }
    const published = publishAuthorityRecord({
        projectRoot: repositoryRoot(context),
        filename: 'criteria.json',
        expectedRecord: current.state === REVIEW_STATE.ABSENT ? null : current.record,
        limit: FILE_LIMIT,
        record,
        parse: parseCriteria,
    }, context);
    assertRepositoryIdentity(repository, context);
    return {...published.record, path: published.path, digest: criteriaDigest(published.record)};
}

function verifyCriteria(expected, context = {}) {
    exact(expected, Object.hasOwn(expected, 'digest') ? ['branch', 'digest'] : ['branch'], 'criteria expectation');
    if (!BRANCH.test(expected.branch) ||
        (expected.digest !== undefined && !/^[0-9a-f]{64}$/.test(expected.digest))) {
        throw new Error('criteria expectation is invalid');
    }
    const repository = repositoryIdentity(context);
    const inspected = inspectCriteria(context);
    if (repository.branch !== expected.branch || inspected.state !== REVIEW_STATE.VALID ||
        inspected.record.branch !== expected.branch) {
        throw new Error('criteria record is unavailable');
    }
    const digest = criteriaDigest(inspected.record);
    if (expected.digest !== undefined && digest !== expected.digest) {
        throw new Error('criteria record is stale');
    }
    const blobs = inspected.record.sources.map((source) => {
        assertSafePath(context, source.path);
        const commit = resolveCommit(context, source.commit);
        const blobOid = treeIdentity(context, commit, source.path);
        const loaded = readBlob(context, blobOid);
        if (blobOid !== source.blobOid || loaded.bytes.length !== source.byteCount ||
            sha256(loaded.bytes) !== source.sha256) {
            throw new Error('criteria source identity is stale');
        }
        return {...source, text: loaded.text};
    });
    assertRepositoryIdentity(repository, context);
    return {record: inspected.record, digest, blobs};
}

module.exports = {
    criteriaDigest,
    inspectCriteria,
    recordCriteria,
    verifyCriteria,
};

// vim: ft=javascript sts=4 sw=4 ts=4 et :
