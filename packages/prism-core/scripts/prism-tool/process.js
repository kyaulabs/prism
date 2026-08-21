// $KYAULabs: process.js kyau@aura.kyaulabs 2026/08/21 -0700 Exp $

'use strict';

const {spawnSync} = require('node:child_process');

const DEFAULT_EXECUTION_TIMEOUT_MS = 30000;
const MAX_DETAIL_LENGTH = 2048;

function runBounded(command, args, options = {}) {
    const result = spawnSync(command, args, {
        cwd: options.cwd,
        encoding: Object.prototype.hasOwnProperty.call(options, 'encoding')
            ? options.encoding
            : 'utf8',
        env: options.env,
        input: options.input,
        maxBuffer: options.maxBuffer ?? 1048576,
        timeout: options.timeout ?? DEFAULT_EXECUTION_TIMEOUT_MS,
        windowsHide: true,
    });

    return {
        status: result.status,
        stdout: result.stdout ?? '',
        stderr: result.stderr ?? '',
        timedOut: result.error?.code === 'ETIMEDOUT',
        error: result.error,
    };
}

function extractVersion(output) {
    const versions = [...output.matchAll(/(?:^|[^0-9])(\d+\.\d+\.\d+)(?=$|[^0-9])/g)]
        .map((match) => match[1]);
    const unique = [...new Set(versions)];
    return unique.length === 1 ? unique[0] : null;
}

function sanitizeDetail(value) {
    const text = Buffer.isBuffer(value) ? value.toString('utf8') : String(value ?? '');
    const cleaned = text
        .replace(/\x1b\[[0-9;?]*[ -/]*[@-~]/g, '')
        .replace(/\x1b./g, '')
        .replace(/[\x00-\x08\x0b-\x1f\x7f-\x9f]/g, '')
        .trim();
    return cleaned.length > MAX_DETAIL_LENGTH ? `\u2026${cleaned.slice(-(MAX_DETAIL_LENGTH - 1))}` : cleaned;
}

module.exports = {DEFAULT_EXECUTION_TIMEOUT_MS, extractVersion, runBounded, sanitizeDetail};

// vim: ft=javascript sts=4 sw=4 ts=4 et :
