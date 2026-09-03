// $KYAULabs: trust.js kyau@aura.kyaulabs 2026/09/02 -0700 Exp $

'use strict';

const fs = require('node:fs');
const path = require('node:path');

function canonicalDirectory(requested) {
    if (typeof requested !== 'string' || requested === '') {
        throw new Error('review trust root is invalid');
    }
    const before = fs.lstatSync(requested);
    if (before.isSymbolicLink() || !before.isDirectory()) {
        throw new Error('review trust root is invalid');
    }
    const canonical = fs.realpathSync(requested);
    const after = fs.lstatSync(requested);
    const target = fs.lstatSync(canonical);
    if (after.isSymbolicLink() || !after.isDirectory() || !target.isDirectory() ||
        before.dev !== after.dev || before.ino !== after.ino ||
        after.dev !== target.dev || after.ino !== target.ino) {
        throw new Error('review trust root changed');
    }
    return canonical;
}

function contains(root, candidate) {
    const relation = path.relative(root, candidate);
    return relation === '' || (!relation.startsWith('..') && !path.isAbsolute(relation));
}

function classifyTrustRoot(coreRoot, repositoryRoot) {
    const core = canonicalDirectory(coreRoot);
    const repository = canonicalDirectory(repositoryRoot);
    const reviewed = contains(repository, core);
    return Object.freeze({
        eligibleForAuthority: !reviewed,
        sourceClass: reviewed ? 'REVIEWED_WORKTREE' : 'INSTALLED_EXTERNAL',
    });
}

module.exports = {classifyTrustRoot};

// vim: ft=javascript sts=4 sw=4 ts=4 et :
