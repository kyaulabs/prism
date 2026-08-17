// $KYAULabs: preflight.js kyau@aura.kyaulabs 2026/08/16 -0700 Exp $









'use strict';

const fs = require('node:fs');
const path = require('node:path');
const {compareStableVersions} = require('./contract');
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
    const source = component.id === 'semgrep'
        ? `^(${STABLE_VERSION_SOURCE})\\s*$`
        : `^open-code-review v(${STABLE_VERSION_SOURCE})(?=\\s|$)`;
    const pattern = new RegExp(source, 'gm');
    const versions = [...output.matchAll(pattern)].map((match) => match[1]);
    return versions.length === 1 ? versions[0] : null;
}

function versionMatches(component, actual) {
    if (component.version) return actual === component.version;
    return (
        compareStableVersions(actual, component.versionRequirement.minimum) >= 0 &&
        compareStableVersions(actual, component.versionRequirement.maximumExclusive) < 0
    );
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
                const matches = versionMatches(component, actual);
                let message = 'version mismatch';
                if (matches) message = component.version ? 'exact version' : 'compatible version';
                return {
                    id: component.id,
                    status: matches ? 'PASS' : 'FAIL',
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
                status: 'FAIL',
                expected,
                message,
            };
        });
}

function testOcrConnectivity({approved, run}) {
    if (approved !== 'yes') {
        return {
            id: 'ocr-connectivity',
            status: 'FAIL',
            message: 'approval required',
        };
    }
    const result = run('ocr', ['llm', 'test'], {maxBuffer: 1048576, timeout: 30000});
    if (result.status === 0 && !result.error) {
        return {
            id: 'ocr-connectivity',
            status: 'PASS',
            message: 'connectivity verified',
        };
    }
    let message = 'malformed';
    if (Number.isInteger(result.status) && result.status !== 0 && !result.error) message = 'non-zero';
    if (result.error?.code === 'ENOBUFS') message = 'output-limit';
    if (result.timedOut) message = 'timeout';
    return {
        id: 'ocr-connectivity',
        status: 'FAIL',
        message,
    };
}

module.exports = {checkExternalTools, resolveExecutable, testOcrConnectivity};









// vim: ft=javascript sts=4 sw=4 ts=4 et :
