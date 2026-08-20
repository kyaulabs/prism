// $KYAULabs: process.js kyau@aura.kyaulabs 2026/08/19 -0700 Exp $

'use strict';

const {spawnSync} = require('node:child_process');

const DEFAULT_EXECUTION_TIMEOUT_MS = 30000;

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

module.exports = {DEFAULT_EXECUTION_TIMEOUT_MS, extractVersion, runBounded};

// vim: ft=javascript sts=4 sw=4 ts=4 et :
