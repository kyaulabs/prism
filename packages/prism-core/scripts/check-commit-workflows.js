#!/usr/bin/env node
// $KYAULabs: check-commit-workflows.js kyau@aura.kyaulabs 2026/08/18 -0700 Exp $

'use strict';

const fs = require('node:fs');
const path = require('node:path');

function collectFiles(root) {
    const files = [];
    const visit = (candidate) => {
        let stat;
        try { stat = fs.lstatSync(candidate); } catch { return; }
        if (stat.isSymbolicLink()) return;
        if (stat.isFile()) {
            if (path.basename(candidate) === 'SKILL.md' ||
                (path.extname(candidate) === '.md' && path.basename(path.dirname(candidate)) === 'prompts')) {
                files.push(candidate);
            }
            return;
        }
        if (!stat.isDirectory()) return;
        for (const entry of fs.readdirSync(candidate)) visit(path.join(candidate, entry));
    };
    visit(path.join(root, 'packages'));
    for (const relative of ['AGENTS.md', 'packages/prism-core/AGENTS.md', 'packages/prism-core/APPEND_SYSTEM.md']) {
        const candidate = path.join(root, relative);
        if (fs.existsSync(candidate)) files.push(candidate);
    }
    return [...new Set(files)].sort();
}

function checkFile(root, file) {
    const relative = path.relative(root, file).split(path.sep).join('/');
    const diagnostics = [];
    const mergeSkill = 'packages/prism-core/skills/resolve-merge-conflicts/SKILL.md';
    const lines = fs.readFileSync(file, 'utf8').split('\n');
    lines.forEach((line, index) => {
        if (/^\s*git\s+commit(?:\s|$)/.test(line) &&
            !(relative === mergeSkill && line.trim() === 'git commit -S')) {
            diagnostics.push(`${relative}:${index + 1}: direct ordinary git commit recipe`);
        }
        if (/git\s+commit[^\n]*\$'/.test(line)) {
            diagnostics.push(`${relative}:${index + 1}: ANSI-C commit-message guidance`);
        }
        if (/(?:\$\(|\bbash\s+).*resolve-(?:ocr-model|identity)\.sh/.test(line)) {
            diagnostics.push(`${relative}:${index + 1}: direct attribution resolver recipe`);
        }
    });
    return diagnostics;
}

function main(args) {
    if (args.length !== 1) {
        process.stderr.write('usage: check-commit-workflows.js ROOT\n');
        return 2;
    }
    let root;
    try { root = fs.realpathSync(args[0]); } catch {
        process.stderr.write('commit workflow root is unavailable\n');
        return 2;
    }
    const diagnostics = collectFiles(root).flatMap((file) => checkFile(root, file));
    for (const diagnostic of diagnostics) process.stdout.write(`${diagnostic}\n`);
    return diagnostics.length === 0 ? 0 : 1;
}

if (require.main === module) process.exitCode = main(process.argv.slice(2));

module.exports = {checkFile, collectFiles, main};

// vim: ft=javascript sts=4 sw=4 ts=4 et :
