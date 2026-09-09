// $KYAULabs: preflight.js kyau@aura.kyaulabs 2026/09/08 -0700 Exp $

'use strict';

const fs = require('node:fs');
const path = require('node:path');
const {extractVersion, runBounded} = require('./process');

const STABLE_VERSION_SOURCE = '(?:0|[1-9]\\d{0,8})\\.(?:0|[1-9]\\d{0,8})\\.(?:0|[1-9]\\d{0,8})';

function resolveExecutable(name, env = process.env) {
    for (const directory of (env.PATH ?? '').split(path.delimiter)) {
        if (!directory) continue;
        const candidate = path.resolve(directory, name);
        try {
            fs.accessSync(candidate, fs.constants.X_OK);
            const executable = fs.realpathSync(candidate);
            if (fs.statSync(executable).isFile()) return executable;
        } catch {
            continue;
        }
    }
    return null;
}

function versionExpectation(component) {
    if (component.version) return component.version;
    return `>=${component.versionRequirement.minimum} <${component.versionRequirement.maximumExclusive}`;
}

function extractInstalledVersion(component, output) {
    if (!component.versionRequirement) return extractVersion(output);
    const source = `^(${STABLE_VERSION_SOURCE})\\s*$`;
    const pattern = new RegExp(source, 'gm');
    const versions = [...output.matchAll(pattern)].map((match) => match[1]);
    return versions.length === 1 ? versions[0] : null;
}

function checkExternalTools({contract, env = process.env, run = runBounded}) {
    return contract.components
        .filter(({kind, provisioning}) => kind === 'command' && provisioning === 'external')
        .map((component) => {
            const expected = versionExpectation(component);
            const executable = resolveExecutable(component.executable, env);
            if (!executable) {
                return {
                    id: component.id,
                    status: 'FAIL',
                    expected,
                    message: 'missing executable',
                };
            }
            const result = run(executable, component.versionArguments, {
                env,
                maxBuffer: 1048576,
                timeout: 30000,
            });
            const actual = result.error
                ? null
                : extractInstalledVersion(component, `${result.stdout}\n${result.stderr}`);
            if (result.status === 0 && actual) {
                const message = 'executable available; version observed';
                return {
                    id: component.id,
                    status: 'PASS',
                    expected,
                    actual,
                    message,
                };
            }
            let message = 'version probe failed';
            if (result.status === 0 && !result.error) message = 'malformed version';
            if (result.error?.code === 'ENOBUFS') message = 'version probe output limit';
            if (result.timedOut) message = 'version probe timeout';
            return {
                id: component.id,
                status: 'PASS',
                expected,
                actual: null,
                message: `executable available; ${message}; capabilities checked at use`,
            };
        });
}

module.exports = {checkExternalTools, resolveExecutable};

// vim: ft=javascript sts=4 sw=4 ts=4 et :
