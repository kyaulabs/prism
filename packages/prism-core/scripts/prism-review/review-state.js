// $KYAULabs: review-state.js kyau@aura.kyaulabs 2026/09/03 -0700 Exp $

'use strict';

const fs = require('node:fs');
const path = require('node:path');
const {
    STATE,
    ensureManagedDirectory,
    inspectManagedRecord,
    publishManagedRecord,
} = require('../prism-tool/managed-record');

const REVIEW_STATE = Object.freeze({
    ABSENT: 'ABSENT',
    VALID: 'VALID',
    LEGACY: 'LEGACY',
    UNSAFE: 'UNSAFE',
});
const FILENAMES = new Set([
    'criteria.json',
    'check.json',
    'review-chain.json',
    'review-attempt.json',
]);

function rootDirectory(projectRoot) {
    const requested = path.resolve(projectRoot);
    const identity = fs.lstatSync(requested);
    if (!identity.isDirectory() || identity.isSymbolicLink()) {
        throw new Error('review repository is invalid');
    }
    const canonical = fs.realpathSync(requested);
    if (canonical !== requested) throw new Error('review repository is invalid');
    return canonical;
}

function stateDirectory(projectRoot) {
    return path.join(rootDirectory(projectRoot), '.pi', 'prism-tool', 'code-review');
}

function authorityPath(projectRoot, filename) {
    if (!FILENAMES.has(filename)) throw new Error('review record name is invalid');
    return path.join(stateDirectory(projectRoot), filename);
}

function inspectDirectory(projectRoot) {
    const root = rootDirectory(projectRoot);
    const target = path.join(root, '.pi', 'prism-tool', 'code-review');
    let current = root;
    for (const segment of ['.pi', 'prism-tool', 'code-review']) {
        current = path.join(current, segment);
        let identity;
        try {
            identity = fs.lstatSync(current);
        } catch (error) {
            return error?.code === 'ENOENT' ? REVIEW_STATE.ABSENT : REVIEW_STATE.UNSAFE;
        }
        if (!identity.isDirectory() || identity.isSymbolicLink() ||
            fs.realpathSync(current) !== current ||
            (current === target && (identity.mode & 0o777) !== 0o700)) {
            return REVIEW_STATE.UNSAFE;
        }
    }
    return REVIEW_STATE.VALID;
}

function inspectAuthorityRecord(options, context = {}) {
    let managedPath;
    try {
        managedPath = authorityPath(options.projectRoot, options.filename);
        const directoryState = inspectDirectory(options.projectRoot);
        if (directoryState !== REVIEW_STATE.VALID) {
            return {path: managedPath, state: directoryState};
        }
        const inspected = inspectManagedRecord({
            context: {...context, managedPath},
            filename: options.filename,
            limit: options.limit,
            parse: options.parse,
        });
        return {
            ...inspected,
            state: inspected.state === STATE.GRANTED ? REVIEW_STATE.VALID : inspected.state,
        };
    } catch {
        return {path: managedPath ?? '', state: REVIEW_STATE.UNSAFE};
    }
}

function publishAuthorityRecord(options, context = {}) {
    const directory = stateDirectory(options.projectRoot);
    ensureManagedDirectory(directory, rootDirectory(options.projectRoot), context);
    const detail = inspectAuthorityRecord(options, context);
    if (![REVIEW_STATE.ABSENT, REVIEW_STATE.VALID].includes(detail.state)) {
        throw new Error('review record path is unsafe');
    }
    if (Object.hasOwn(options, 'expectedRecord') &&
        (options.expectedRecord === null
            ? detail.state !== REVIEW_STATE.ABSENT
            : detail.state !== REVIEW_STATE.VALID ||
                JSON.stringify(detail.record) !== JSON.stringify(options.expectedRecord))) {
        throw new Error('review record changed');
    }
    const managedPath = authorityPath(options.projectRoot, options.filename);
    publishManagedRecord({
        context: {...context, managedPath},
        detail,
        filename: options.filename,
        record: options.record,
        parse: options.parse,
        limit: options.limit,
    });
    const published = inspectAuthorityRecord(options, context);
    if (published.state !== REVIEW_STATE.VALID) throw new Error('review record publication failed');
    return published;
}

module.exports = {
    REVIEW_STATE,
    authorityPath,
    inspectAuthorityRecord,
    publishAuthorityRecord,
};

// vim: ft=javascript sts=4 sw=4 ts=4 et :
