// $KYAULabs: deploy-context.js kyau@aura.kyaulabs 2026/09/09 -0700 Exp $

'use strict';

const fs = require('node:fs');
const path = require('node:path');
const {randomUUID} = require('node:crypto');

function readPlainFile(file, optional = false) {
    let stat;
    try {
        stat = fs.lstatSync(file);
    } catch (error) {
        if (optional && error.code === 'ENOENT') return '';
        throw error;
    }
    if (!stat.isFile() || stat.isSymbolicLink()) throw new Error('Expected a regular context file');
    return fs.readFileSync(file, 'utf8');
}

function deployContext(source, destination) {
    const manifest = JSON.parse(readPlainFile(path.join(source, 'package.json')));
    if (manifest.name !== '@kyaulabs/prism-core') throw new Error('Not a Core package');
    fs.mkdirSync(destination, {recursive: true, mode: 0o700});
    const outputs = ['AGENTS.md', 'APPEND_SYSTEM.md'].map(name => {
        const input = readPlainFile(path.join(source, name));
        const target = path.join(destination, name);
        const current = readPlainFile(target, true);
        const begin = `<!-- prism-core:begin ${name} do not edit; managed by install-global.sh -->`;
        const end = `<!-- prism-core:end ${name} -->`;
        const block = `${begin}\n${input.trimEnd()}\n${end}`;
        const start = current.indexOf(begin);
        const finish = current.indexOf(end);
        if ((start < 0) !== (finish < 0) || (start >= 0 && (
            finish < start || current.indexOf(begin, start + begin.length) >= 0 ||
            current.indexOf(end, finish + end.length) >= 0
        ))) throw new Error('Malformed context markers');
        const output = start < 0
            ? current + (current && !current.endsWith('\n') ? '\n' : '') + block + '\n'
            : current.slice(0, start) + block + current.slice(finish + end.length);
        return {target, output, current};
    });
    for (const {target, output, current} of outputs) {
        if (current === output) continue;
        const temp = `${target}.${randomUUID()}.tmp`;
        try {
            fs.writeFileSync(temp, output, {flag: 'wx', mode: 0o600});
            if (readPlainFile(target, true) !== current) throw new Error('Context changed during deployment');
            fs.renameSync(temp, target);
        } finally {
            fs.rmSync(temp, {force: true});
        }
    }
}

module.exports = {deployContext};

if (require.main === module) {
    try {
        deployContext(process.argv[2], process.argv[3]);
    } catch {
        console.error('Context deployment failed; inspect the selected package and context files.');
        process.exitCode = 1;
    }
}

// vim: ft=javascript sts=4 sw=4 ts=4 et :
