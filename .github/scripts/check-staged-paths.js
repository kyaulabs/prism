/* global require, process, console */
'use strict';

const os = require('node:os');
const path = require('node:path');
const {execFileSync} = require('node:child_process');
const {loadAdditionalSensitivePaths, sensitivePathMatch} = require('../../packages/prism-core/scripts/sensitive-path-policy');

try {
    const root = execFileSync('git', ['rev-parse', '--show-toplevel'], {encoding: 'utf8'}).trim();
    const files = execFileSync('git', ['diff', '--cached', '--name-only', '--diff-filter=ACMRT', '-z'], {
        encoding: 'utf8', maxBuffer: 16 * 1024 * 1024,
    }).split('\0').filter(Boolean);
    const options = {home: os.homedir(), extraPaths: loadAdditionalSensitivePaths(process.env.PRISM_SENSITIVE_PATHS)};
    if (files.some(file => sensitivePathMatch(path.resolve(root, file), options))) {
        throw new Error('Protected staged path');
    }
} catch {
    console.error('Protected staged path or failed path inspection; no staged content was checked.');
    process.exitCode = 1;
}
