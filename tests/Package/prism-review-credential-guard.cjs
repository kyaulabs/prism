// $KYAULabs: prism-review-credential-guard.cjs kyau@aura.kyaulabs 2026/09/08 -0700 Exp $

'use strict';

const fs = require('node:fs');
const path = require('node:path');
const {fileURLToPath} = require('node:url');
const {syncBuiltinESMExports} = require('node:module');
const write = fs.writeFileSync.bind(fs);
const destination = process.env.PRISM_TEST_GUARD_LOG;
if (typeof destination !== 'string' || !path.isAbsolute(destination)) throw new Error('missing guard log');
let denied = false;

function record() {
    write(destination, JSON.stringify({loaded: true, denied}), {mode: 0o600});
}

function check(value) {
    if (typeof value === 'number') return;
    const decoded = value instanceof URL ? fileURLToPath(value) : Buffer.isBuffer(value) ? value.toString('utf8') : value;
    if (typeof decoded !== 'string') throw new Error('unsupported guard path');
    const parts = path.resolve(decoded).split(path.sep);
    const basename = parts.at(-1);
    if (['auth.json', 'mcp-auth.json', '.netrc', '.git-credentials'].includes(basename) ||
        parts.includes('.ssh') || parts.includes('.aws') ||
        (basename === '.env' || (basename.startsWith('.env.') && basename !== '.env.example'))) {
        denied = true;
        record();
        throw new Error('credential access forbidden by package test');
    }
}

for (const name of ['openSync', 'readFileSync', 'open', 'readFile', 'createReadStream']) {
    const original = fs[name].bind(fs);
    fs[name] = (target, ...args) => { check(target); return original(target, ...args); };
}
for (const name of ['open', 'readFile']) {
    const original = fs.promises[name].bind(fs.promises);
    fs.promises[name] = (target, ...args) => { check(target); return original(target, ...args); };
}
syncBuiltinESMExports();
record();

// vim: ft=javascript sts=4 sw=4 ts=4 et :
