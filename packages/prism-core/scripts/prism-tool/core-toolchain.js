// $KYAULabs: core-toolchain.js kyau@aura.kyaulabs 2026/08/26 -0700 Exp $

'use strict';

const fs = require('node:fs');
const path = require('node:path');
const {assertPackageParity, loadContract} = require('./contract');

function packageRootFor(packageName, coreRoot) {
    let current = fs.realpathSync(coreRoot);
    while (true) {
        const candidate = path.join(current, 'node_modules', packageName);
        const manifestPath = path.join(candidate, 'package.json');
        if (fs.existsSync(manifestPath)) {
            const root = fs.realpathSync(candidate);
            const manifest = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
            if (manifest.name === packageName) return {manifest, root};
        }
        const parent = path.dirname(current);
        if (parent === current) break;
        current = parent;
    }
    throw new Error(`package root not found for ${packageName}`);
}

function resolveBundledComponent(coreRoot, component) {
    const resolved = packageRootFor(component.package, coreRoot);
    if (resolved.manifest.version !== component.version) {
        throw new Error(`package version drift for ${component.id}`);
    }
    const bin = resolved.manifest.bin;
    const relative = typeof bin === 'string' ? bin : bin?.[component.executable];
    if (typeof relative !== 'string') throw new Error(`package bin missing for ${component.id}`);
    const executable = fs.realpathSync(path.resolve(resolved.root, relative));
    const relation = path.relative(resolved.root, executable);
    if (relation.startsWith('..') || path.isAbsolute(relation)) {
        throw new Error(`package bin escapes root for ${component.id}`);
    }
    return executable;
}

function loadCoreContract(coreRoot) {
    const contract = loadContract(path.join(coreRoot, 'toolchain.json'));
    const packageJson = JSON.parse(fs.readFileSync(path.join(coreRoot, 'package.json'), 'utf8'));
    assertPackageParity(contract, packageJson);
    return contract;
}

module.exports = {loadCoreContract, packageRootFor, resolveBundledComponent};

// vim: ft=javascript sts=4 sw=4 ts=4 et :
