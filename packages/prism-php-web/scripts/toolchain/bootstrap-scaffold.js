// $KYAULabs: bootstrap-scaffold.js kyau@aura.kyaulabs 2026/08/24 -0700 Exp $

'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const {normalizeComposerAudit, normalizeNpmAudit} = require('./audit');

function validateOutputPath(outputPath) {
    if (
        typeof outputPath !== 'string' ||
        outputPath.length === 0 ||
        outputPath.includes('\\') ||
        path.posix.isAbsolute(outputPath) ||
        path.posix.normalize(outputPath) !== outputPath ||
        outputPath.split('/').some((segment) => segment === '' || segment === '.' || segment === '..')
    ) {
        throw new Error('PHP/web bootstrap scaffold path is invalid');
    }
    return outputPath;
}

function overlaps(left, right) {
    return left === right || left.startsWith(`${right}/`) || right.startsWith(`${left}/`);
}

function loadManifest(packageRoot) {
    const manifestPath = path.join(packageRoot, 'config', 'bootstrap', 'scaffold.json');
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    if (
        manifest === null ||
        typeof manifest !== 'object' ||
        Array.isArray(manifest) ||
        Object.keys(manifest).sort().join(',') !== 'outputs,providerId,schemaVersion' ||
        manifest.schemaVersion !== 1 ||
        manifest.providerId !== 'php-web-scaffold' ||
        !Array.isArray(manifest.outputs) ||
        new Set(manifest.outputs).size !== manifest.outputs.length
    ) {
        throw new Error('PHP/web bootstrap scaffold manifest is invalid');
    }
    const outputs = manifest.outputs.map(validateOutputPath).sort();
    for (let index = 1; index < outputs.length; index += 1) {
        if (overlaps(outputs[index - 1], outputs[index])) {
            throw new Error('PHP/web bootstrap scaffold paths overlap');
        }
    }
    return {...manifest, outputs};
}

function ensureCandidateParent(candidateRoot, outputPath) {
    let current = candidateRoot;
    for (const segment of outputPath.split('/').slice(0, -1)) {
        current = path.join(current, segment);
        const stat = fs.lstatSync(current, {throwIfNoEntry: false});
        if (stat === undefined) fs.mkdirSync(current, {mode: 0o700});
        const actual = fs.lstatSync(current);
        const relation = path.relative(candidateRoot, fs.realpathSync(current));
        if (
            actual.isSymbolicLink() ||
            !actual.isDirectory() ||
            relation.startsWith('..') ||
            path.isAbsolute(relation)
        ) {
            throw new Error('PHP/web bootstrap candidate parent is invalid');
        }
    }
}

function npmProjectName(request) {
    const normalized = request.metadata.suggestedDisplayName
        .toLowerCase()
        .replace(/[^a-z0-9._-]+/g, '-')
        .replace(/^[._-]+|[._-]+$/g, '');
    if (!/^[a-z0-9][a-z0-9._-]{0,127}$/.test(normalized)) {
        throw new Error('PHP/web bootstrap npm project name is invalid');
    }
    return normalized;
}

function contents(outputPath, request, contract) {
    if (outputPath === 'composer.json') {
        const dependencies = Object.fromEntries(contract.components
            .filter(({ecosystem}) => ecosystem === 'composer')
            .map(({package: packageName, version}) => [packageName, version]));
        return `${JSON.stringify({
            type: 'project',
            require: {php: '^8.5'},
            'require-dev': dependencies,
            scripts: {test: 'pest', 'test:coverage': 'pest --coverage --min=80', check: '.github/scripts/check-php.sh --local'},
            config: {'sort-packages': true, 'optimize-autoloader': true, 'allow-plugins': {'pestphp/pest-plugin': true}},
        }, null, 2)}\n`;
    }
    if (outputPath === 'package.json') {
        const dependencies = Object.fromEntries(contract.components
            .filter(({ecosystem}) => ecosystem === 'npm')
            .map(({package: packageName, version}) => [packageName, version]));
        return `${JSON.stringify({name: npmProjectName(request), private: true, scripts: {check: '.github/scripts/check-php.sh --local'}, devDependencies: dependencies}, null, 2)}\n`;
    }
    if (outputPath === 'composer.lock') return '{"packages":[],"packages-dev":[]}\n';
    if (outputPath === 'package-lock.json') return '{"lockfileVersion":3,"packages":{}}\n';
    if (outputPath === 'tests/Browser/fixtures/smoke.html') return '<!doctype html><title>Prism ready</title><h1>Prism ready</h1>\n';
    if (outputPath === '.gitignore') return "/vendor/\n/node_modules/\n/tests/coverage/\n/tests/coverage.xml\n.env\n.env.*\n!.env.example\n";
    if (outputPath.endsWith('.gitkeep')) return '';
    if (outputPath.endsWith('.sh')) return '#!/usr/bin/env bash\nset -euo pipefail\n# vim: ft=sh sts=4 sw=4 ts=4 et :\n';
    if (outputPath.endsWith('.php')) return '<?php\ndeclare(strict_types=1);\n\n// vim: ft=php sts=4 sw=4 ts=4 et :\n';
    if (outputPath === 'eslint.config.mjs') return 'export default [];\n';
    if (outputPath.endsWith('.json')) return '{}\n';
    if (outputPath.endsWith('.yml')) return 'name: Verify\n';
    return `${request.metadata.displayName}\n`;
}

function renderBootstrapScaffold({packageRoot, candidateRoot, request, contract, run}) {
    const canonicalCandidate = fs.realpathSync(candidateRoot);
    const manifest = loadManifest(packageRoot);
    if (request?.schemaVersion !== 1 || request.source?.mode !== 'BLANK' ||
        request.adapter?.packageName !== contract.package || request.adapter?.bootstrapProtocol !== 1) {
        throw new Error('PHP/web bootstrap request is invalid');
    }
    const outputs = manifest.outputs.map((outputPath) => {
        const candidatePath = path.join(canonicalCandidate, ...outputPath.split('/'));
        ensureCandidateParent(canonicalCandidate, outputPath);
        const value = Buffer.from(contents(outputPath, request, contract), 'utf8');
        const mode = outputPath.endsWith('.sh') ? 0o755 : 0o644;
        fs.writeFileSync(candidatePath, value, {flag: 'wx', mode});
        fs.chmodSync(candidatePath, mode);
        return {path: outputPath, kind: 'file', mode, candidatePath};
    });
    if (typeof run === 'function') {
        for (const [command, args] of [
            ['composer', ['update', '--no-install', '--no-scripts', '--no-interaction']],
            ['npm', ['install', '--package-lock-only', '--ignore-scripts']],
        ]) {
            const result = run(command, args, {cwd: canonicalCandidate, maxBuffer: 1048576, timeout: 300000});
            if (result?.error || result?.status !== 0) {
                throw new Error('PHP/web bootstrap dependency resolution failed');
            }
        }
        const audits = [
            normalizeComposerAudit(run('composer', ['audit', '--locked', '--format=json'], {
                cwd: canonicalCandidate, maxBuffer: 1048576, timeout: 300000,
            })),
            normalizeNpmAudit(run('npm', ['audit', '--package-lock-only', '--json'], {
                cwd: canonicalCandidate, maxBuffer: 1048576, timeout: 300000,
            })),
        ];
        if (audits.some(({totals}) => Object.values(totals).some((total) => total !== 0))) {
            throw new Error('PHP/web bootstrap dependency graph has advisories');
        }
    }
    const finalOutputs = outputs.map((output) => {
        const value = fs.readFileSync(output.candidatePath);
        return Object.freeze({
            ...output,
            sha256: crypto.createHash('sha256').update(value).digest('hex'),
        });
    });
    return Object.freeze({
        schemaVersion: 1,
        provider: Object.freeze({id: manifest.providerId, packageName: contract.package, packageVersion: request.adapter.packageVersion, protocolVersion: 1}),
        status: 'GO',
        outputs: Object.freeze(finalOutputs),
        effects: Object.freeze([]),
        checks: Object.freeze([{id: 'php-web-scaffold-render', status: 'PASS', message: 'PHP/web scaffold candidate files were rendered'}]),
        verification: Object.freeze([{id: 'php-web-scaffold-inventory', command: `setup verify --adapter=${contract.package} --network-approved=yes`}]),
    });
}

module.exports = {renderBootstrapScaffold};

// vim: ft=javascript sts=4 sw=4 ts=4 et :
