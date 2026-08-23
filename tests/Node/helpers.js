// $KYAULabs: helpers.js kyau@aura.kyaulabs 2026/08/21 -0700 Exp $

'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

function makeTempDir() {
    return fs.mkdtempSync(path.join(os.tmpdir(), 'prism-tool-test-'));
}

function writeJson(filePath, value) {
    fs.mkdirSync(path.dirname(filePath), {recursive: true});
    fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, {mode: 0o600});
}

function writeExecutable(filePath, body) {
    fs.mkdirSync(path.dirname(filePath), {recursive: true});
    fs.writeFileSync(filePath, `#!/usr/bin/env bash\n${body}\n`, {mode: 0o755});
    fs.chmodSync(filePath, 0o755);
}

function writePackageJson(projectRoot, relativeDirectory, manifest) {
    const directory = relativeDirectory === '.'
        ? projectRoot
        : path.join(projectRoot, relativeDirectory);
    writeJson(path.join(directory, 'package.json'), manifest);
}

function sha256(value) {
    return crypto.createHash('sha256').update(value).digest('hex');
}

module.exports = {makeTempDir, sha256, writeExecutable, writeJson, writePackageJson};

// vim: ft=javascript sts=4 sw=4 ts=4 et :
