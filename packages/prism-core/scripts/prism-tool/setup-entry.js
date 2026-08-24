// $KYAULabs: setup-entry.js kyau@aura.kyaulabs 2026/08/24 -0700 Exp $

'use strict';

const fs = require('node:fs');
const path = require('node:path');

const DISPOSITION = Object.freeze({
    STRICT_EMPTY: 'STRICT_EMPTY',
    ESTABLISHED: 'ESTABLISHED',
    CONFLICT: 'CONFLICT',
});

const REASON = Object.freeze({
    EMPTY_ROOT: 'EMPTY_ROOT',
    NON_EMPTY_ROOT: 'NON_EMPTY_ROOT',
    EXISTING_REPOSITORY: 'EXISTING_REPOSITORY',
    CONTAINING_WORKTREE: 'CONTAINING_WORKTREE',
    UNSAFE_ROOT: 'UNSAFE_ROOT',
    UNSAFE_GIT_STATE: 'UNSAFE_GIT_STATE',
    INDETERMINATE: 'INDETERMINATE',
});

function entryKind(entry) {
    if (entry.isFile()) return 'file';
    if (entry.isDirectory()) return 'directory';
    if (entry.isSymbolicLink()) return 'symlink';
    if (entry.isBlockDevice()) return 'block';
    if (entry.isCharacterDevice()) return 'character';
    if (entry.isFIFO()) return 'fifo';
    if (entry.isSocket()) return 'socket';
    return 'unknown';
}

function snapshotEntries(projectRoot) {
    return fs.readdirSync(projectRoot, {withFileTypes: true})
        .map((entry) => `${entry.name}\0${entryKind(entry)}`)
        .sort();
}

function sameEntries(left, right) {
    return left.length === right.length && left.every((entry, index) => entry === right[index]);
}

function sameIdentity(left, right) {
    return left.dev === right.dev && left.ino === right.ino && left.mode === right.mode;
}

function inspectGitBoundary(projectRoot) {
    let current = projectRoot;
    while (true) {
        const gitPath = path.join(current, '.git');
        let identity;
        try {
            identity = fs.lstatSync(gitPath);
        } catch (error) {
            if (error?.code !== 'ENOENT') return {kind: 'INDETERMINATE'};
            const parent = path.dirname(current);
            if (parent === current) return {kind: 'ABSENT'};
            current = parent;
            continue;
        }
        if (identity.isSymbolicLink() || (!identity.isDirectory() && !identity.isFile())) {
            return {kind: 'UNSAFE'};
        }
        return {
            kind: current === projectRoot ? 'EXISTING' : 'CONTAINING',
            path: gitPath,
            dev: identity.dev,
            ino: identity.ino,
            mode: identity.mode,
        };
    }
}

function sameGitBoundary(left, right) {
    return left.kind === right.kind &&
        left.path === right.path &&
        left.dev === right.dev &&
        left.ino === right.ino &&
        left.mode === right.mode;
}

function conflict(projectRoot, reason) {
    return {projectRoot, disposition: DISPOSITION.CONFLICT, reason};
}

function classifySetupEntry({projectRoot}) {
    const lexicalRoot = path.resolve(projectRoot);
    let canonicalRoot;
    try {
        canonicalRoot = fs.realpathSync(lexicalRoot);
        const before = fs.lstatSync(canonicalRoot);
        if (!before.isDirectory()) return conflict(canonicalRoot, REASON.UNSAFE_ROOT);
        const firstEntries = snapshotEntries(canonicalRoot);
        const firstGitBoundary = inspectGitBoundary(canonicalRoot);
        const secondGitBoundary = inspectGitBoundary(canonicalRoot);
        const secondEntries = snapshotEntries(canonicalRoot);
        const after = fs.lstatSync(canonicalRoot);
        if (
            !sameIdentity(before, after) ||
            !sameEntries(firstEntries, secondEntries) ||
            !sameGitBoundary(firstGitBoundary, secondGitBoundary)
        ) {
            return conflict(canonicalRoot, REASON.INDETERMINATE);
        }
        if (firstGitBoundary.kind === 'UNSAFE') {
            return conflict(canonicalRoot, REASON.UNSAFE_GIT_STATE);
        }
        if (firstGitBoundary.kind === 'INDETERMINATE') {
            return conflict(canonicalRoot, REASON.INDETERMINATE);
        }
        if (firstGitBoundary.kind === 'EXISTING') {
            return {
                projectRoot: canonicalRoot,
                disposition: DISPOSITION.ESTABLISHED,
                reason: REASON.EXISTING_REPOSITORY,
            };
        }
        if (firstGitBoundary.kind === 'CONTAINING') {
            return {
                projectRoot: canonicalRoot,
                disposition: DISPOSITION.ESTABLISHED,
                reason: REASON.CONTAINING_WORKTREE,
            };
        }
        if (firstEntries.length > 0) {
            return {
                projectRoot: canonicalRoot,
                disposition: DISPOSITION.ESTABLISHED,
                reason: REASON.NON_EMPTY_ROOT,
            };
        }
        return {
            projectRoot: canonicalRoot,
            disposition: DISPOSITION.STRICT_EMPTY,
            reason: REASON.EMPTY_ROOT,
        };
    } catch {
        return conflict(canonicalRoot ?? lexicalRoot, REASON.INDETERMINATE);
    }
}

module.exports = {DISPOSITION, REASON, classifySetupEntry};

// vim: ft=javascript sts=4 sw=4 ts=4 et :
