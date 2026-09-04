// $KYAULabs: setup-entry.js kyau@aura.kyaulabs 2026/09/01 -0700 Exp $

'use strict';

const fs = require('node:fs');
const path = require('node:path');

const DISPOSITION = Object.freeze({
    STRICT_EMPTY: 'STRICT_EMPTY',
    ESTABLISHED: 'ESTABLISHED',
    CONFLICT: 'CONFLICT',
});

const AUTOMATION_APPLICABILITY = Object.freeze({
    STRICT_EMPTY: 'STRICT_EMPTY',
    ESTABLISHED: 'ESTABLISHED',
    SCAFFOLD_ONLY: 'SCAFFOLD_ONLY',
});

const REASON = Object.freeze({
    EMPTY_ROOT: 'EMPTY_ROOT',
    NON_EMPTY_ROOT: 'NON_EMPTY_ROOT',
    EXISTING_REPOSITORY: 'EXISTING_REPOSITORY',
    CONTAINING_WORKTREE: 'CONTAINING_WORKTREE',
    UNSAFE_ROOT: 'UNSAFE_ROOT',
    UNSAFE_GIT_STATE: 'UNSAFE_GIT_STATE',
    INDETERMINATE: 'INDETERMINATE',
    SOURCE_REQUIRES_STRICT_EMPTY: 'SOURCE_REQUIRES_STRICT_EMPTY',
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
        let gitFile = null;
        let gitDirPath = null;
        let gitDirIdentity = null;
        if (identity.isFile()) {
            try {
                gitFile = fs.readFileSync(gitPath, 'utf8');
            } catch {
                return {kind: 'INDETERMINATE'};
            }
            const match = /^gitdir: ([^\r\n]+)\r?\n?$/.exec(gitFile);
            if (match === null) return {kind: 'UNSAFE'};
            gitDirPath = path.resolve(path.dirname(gitPath), match[1]);
            try {
                gitDirIdentity = fs.lstatSync(gitDirPath);
            } catch (error) {
                if (error?.code === 'ENOENT' || error?.code === 'ENOTDIR') return {kind: 'UNSAFE'};
                return {kind: 'INDETERMINATE'};
            }
            if (gitDirIdentity.isSymbolicLink() || !gitDirIdentity.isDirectory()) return {kind: 'UNSAFE'};
        }
        return {
            kind: current === projectRoot ? 'EXISTING' : 'CONTAINING',
            path: gitPath,
            dev: identity.dev,
            ino: identity.ino,
            mode: identity.mode,
            gitFile,
            gitDirPath,
            gitDirDev: gitDirIdentity?.dev,
            gitDirIno: gitDirIdentity?.ino,
            gitDirMode: gitDirIdentity?.mode,
        };
    }
}

function sameGitBoundary(left, right) {
    return left.kind === right.kind &&
        left.path === right.path &&
        left.dev === right.dev &&
        left.ino === right.ino &&
        left.mode === right.mode &&
        left.gitFile === right.gitFile &&
        left.gitDirPath === right.gitDirPath &&
        left.gitDirDev === right.gitDirDev &&
        left.gitDirIno === right.gitDirIno &&
        left.gitDirMode === right.gitDirMode;
}

function conflict(projectRoot, reason) {
    return {
        projectRoot,
        disposition: DISPOSITION.CONFLICT,
        automationApplicability: null,
        reason,
    };
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
                automationApplicability: AUTOMATION_APPLICABILITY.ESTABLISHED,
                reason: REASON.EXISTING_REPOSITORY,
            };
        }
        if (firstGitBoundary.kind === 'CONTAINING') {
            return {
                projectRoot: canonicalRoot,
                disposition: DISPOSITION.ESTABLISHED,
                automationApplicability: AUTOMATION_APPLICABILITY.SCAFFOLD_ONLY,
                reason: REASON.CONTAINING_WORKTREE,
            };
        }
        if (firstEntries.length > 0) {
            return {
                projectRoot: canonicalRoot,
                disposition: DISPOSITION.ESTABLISHED,
                automationApplicability: AUTOMATION_APPLICABILITY.SCAFFOLD_ONLY,
                reason: REASON.NON_EMPTY_ROOT,
            };
        }
        return {
            projectRoot: canonicalRoot,
            disposition: DISPOSITION.STRICT_EMPTY,
            automationApplicability: AUTOMATION_APPLICABILITY.STRICT_EMPTY,
            reason: REASON.EMPTY_ROOT,
        };
    } catch {
        return conflict(canonicalRoot ?? lexicalRoot, REASON.INDETERMINATE);
    }
}

module.exports = {AUTOMATION_APPLICABILITY, DISPOSITION, REASON, classifySetupEntry};

// vim: ft=javascript sts=4 sw=4 ts=4 et :
