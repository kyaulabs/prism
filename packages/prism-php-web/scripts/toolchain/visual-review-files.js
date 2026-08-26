// $KYAULabs: visual-review-files.js kyau@aura.kyaulabs 2026/08/25 -0700 Exp $

'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const VISUAL_REVIEW_FILES = Object.freeze([
    'visual_review.example.json',
    'visual_review.mjs',
    'visual_review.spec.mjs',
]);

function sha256(content) {
    return crypto.createHash('sha256').update(content).digest('hex');
}

function readCanonicalVisualReviewFiles(packageRoot) {
    return new Map(VISUAL_REVIEW_FILES.map((name) => {
        const source = path.join(packageRoot, 'config', 'bootstrap', 'visual-review', name);
        const stat = fs.lstatSync(source);
        if (
            stat.isSymbolicLink() ||
            !stat.isFile() ||
            stat.size > 1048576
        ) {
            throw new Error('canonical visual review file is invalid');
        }
        const content = fs.readFileSync(source);
        return [name, Object.freeze({content, sha256: sha256(content), mode: 0o644})];
    }));
}

module.exports = {VISUAL_REVIEW_FILES, readCanonicalVisualReviewFiles};

// vim: ft=javascript sts=4 sw=4 ts=4 et :
