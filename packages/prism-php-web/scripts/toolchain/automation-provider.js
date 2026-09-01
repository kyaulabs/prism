// $KYAULabs: automation-provider.js kyau@aura.kyaulabs 2026/09/01 -0700 Exp $

'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const {
    AUTOMATION_OUTPUTS,
    renderAutomationOutput,
} = require('./bootstrap-scaffold');

function packageVersion(packageRoot) {
    const manifest = JSON.parse(fs.readFileSync(path.join(packageRoot, 'package.json'), 'utf8'));
    if (manifest?.name !== '@kyaulabs/prism-php-web' || typeof manifest.version !== 'string') {
        throw new Error('PHP/web automation package identity is invalid');
    }
    return manifest.version;
}

function validateContract(contract) {
    if (contract?.package !== '@kyaulabs/prism-php-web') {
        throw new Error('PHP/web automation contract is invalid');
    }
}

function providerIdentity(packageRoot, contract) {
    validateContract(contract);
    return Object.freeze({
        id: 'php-web-quality',
        packageName: contract.package,
        packageVersion: packageVersion(packageRoot),
        protocolVersion: 1,
    });
}

function ensureParent(candidateRoot, outputPath) {
    let current = candidateRoot;
    for (const segment of outputPath.split('/').slice(0, -1)) {
        current = path.join(current, segment);
        const existing = fs.lstatSync(current, {throwIfNoEntry: false});
        if (existing === undefined) fs.mkdirSync(current, {mode: 0o700});
        const stat = fs.lstatSync(current);
        const relation = path.relative(candidateRoot, fs.realpathSync(current));
        if (
            stat.isSymbolicLink() ||
            !stat.isDirectory() ||
            relation.startsWith('..') ||
            path.isAbsolute(relation)
        ) {
            throw new Error('PHP/web automation candidate parent is invalid');
        }
    }
}

function descriptor(packageRoot, contract) {
    return Object.freeze({
        schemaVersion: 1,
        provider: providerIdentity(packageRoot, contract),
        outputs: Object.freeze([...AUTOMATION_OUTPUTS]),
        effects: Object.freeze([]),
        checks: Object.freeze([Object.freeze({
            id: 'php-web-quality-render',
            status: 'PASS',
            message: 'PHP/web quality automation candidate files were rendered',
        })]),
        verification: Object.freeze([Object.freeze({
            id: 'php-web-quality-inventory',
            command: 'automation verify',
        })]),
    });
}

function describeAutomation({packageRoot, contract}) {
    return descriptor(packageRoot, contract);
}

function prepareAutomation({packageRoot, candidateRoot, contract}) {
    const root = fs.realpathSync(candidateRoot);
    const declaration = descriptor(packageRoot, contract);
    const outputs = declaration.outputs.map((outputPath) => {
        const rendered = renderAutomationOutput({
            packageRoot,
            packageVersion: declaration.provider.packageVersion,
            outputPath,
        });
        ensureParent(root, outputPath);
        const candidatePath = path.join(root, ...outputPath.split('/'));
        fs.writeFileSync(candidatePath, rendered.contents, {
            flag: 'wx',
            mode: rendered.mode,
        });
        fs.chmodSync(candidatePath, rendered.mode);
        return Object.freeze({
            path: outputPath,
            kind: 'file',
            mode: rendered.mode,
            sha256: crypto.createHash('sha256').update(rendered.contents).digest('hex'),
            candidatePath,
        });
    });
    return Object.freeze({
        schemaVersion: 1,
        provider: declaration.provider,
        status: 'GO',
        outputs: Object.freeze(outputs),
        effects: declaration.effects,
        checks: declaration.checks,
        verification: declaration.verification,
    });
}

function verifyAutomation({packageRoot, projectRoot, candidateRoot, contract}) {
    try {
        const root = fs.realpathSync(projectRoot ?? candidateRoot);
        const identity = providerIdentity(packageRoot, contract);
        for (const outputPath of AUTOMATION_OUTPUTS) {
            const expected = renderAutomationOutput({
                packageRoot,
                packageVersion: identity.packageVersion,
                outputPath,
            });
            const filePath = path.join(root, ...outputPath.split('/'));
            const stat = fs.lstatSync(filePath);
            if (
                stat.isSymbolicLink() ||
                !stat.isFile() ||
                (stat.mode & 0o777) !== expected.mode ||
                !fs.readFileSync(filePath).equals(expected.contents)
            ) {
                throw new Error('PHP/web automation output changed');
            }
        }
        return Object.freeze({
            status: 'GO',
            checks: Object.freeze([Object.freeze({
                id: 'php-web-quality-inventory',
                status: 'PASS',
                message: 'PHP/web quality automation inventory verified',
            })]),
        });
    } catch {
        return Object.freeze({
            status: 'NO-GO',
            checks: Object.freeze([Object.freeze({
                id: 'php-web-quality-inventory',
                status: 'FAIL',
                message: 'PHP/web quality automation inventory verification failed',
            })]),
        });
    }
}

module.exports = {describeAutomation, prepareAutomation, verifyAutomation};

// vim: ft=javascript sts=4 sw=4 ts=4 et :
