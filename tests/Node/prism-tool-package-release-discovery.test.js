// $KYAULabs: prism-tool-package-release-discovery.test.js kyau@aura.kyaulabs 2026/08/22 -0700 Exp $

'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const {
    discoverReleasePackages,
    loadReleaseConfiguration,
} = require('../../packages/prism-core/scripts/prism-tool/package-release');
const {makeTempDir, writeJson, writePackageJson} = require('./helpers');

test('discovers the publishable root first and declared workspaces lexically', (t) => {
    const projectRoot = makeTempDir();
    t.after(() => fs.rmSync(projectRoot, {recursive: true, force: true}));
    writePackageJson(projectRoot, '.', {
        name: '@fixture/root',
        version: '1.2.3',
        workspaces: ['packages/*'],
    });
    writePackageJson(projectRoot, 'packages/zeta', {
        name: '@fixture/zeta',
        version: '1.2.3',
    });
    writePackageJson(projectRoot, 'packages/alpha', {
        name: '@fixture/alpha',
        version: '1.2.3',
    });
    writePackageJson(projectRoot, 'outside/ignored', {
        name: '@fixture/ignored',
        version: '1.2.3',
    });

    assert.deepEqual(discoverReleasePackages({projectRoot}), [
        {name: '@fixture/root', path: '.', version: '1.2.3', tagPrefix: 'root'},
        {name: '@fixture/alpha', path: 'packages/alpha', version: '1.2.3', tagPrefix: 'alpha'},
        {name: '@fixture/zeta', path: 'packages/zeta', version: '1.2.3', tagPrefix: 'zeta'},
    ]);
});

test('does not follow a release configuration replaced after validation', (t) => {
    const root = makeTempDir();
    const projectRoot = path.join(root, 'project');
    const externalConfig = path.join(root, 'external-release.json');
    const configPath = path.join(projectRoot, '.prism', 'release.json');
    t.after(() => fs.rmSync(root, {recursive: true, force: true}));
    fs.mkdirSync(projectRoot);
    writePackageJson(projectRoot, '.', {
        name: 'fixture-root',
        version: '1.0.0',
    });
    writeJson(configPath, {
        schemaVersion: 1,
        managedBy: '@kyaulabs/prism-core',
        versionPolicy: 'lockstep',
        packages: ['.'],
    });
    writeJson(externalConfig, {packages: ['.']});
    const lstatSync = fs.lstatSync;
    let replaced = false;
    t.mock.method(fs, 'lstatSync', (filePath, ...args) => {
        const stat = lstatSync(filePath, ...args);
        if (!replaced && filePath === configPath) {
            replaced = true;
            fs.rmSync(configPath);
            fs.symlinkSync(externalConfig, configPath);
        }
        return stat;
    });

    assert.throws(
        () => loadReleaseConfiguration({projectRoot, allowLegacy: true}),
        /release configuration is invalid/
    );
});

test('rejects traversal workspace patterns before expanding them', (t) => {
    const parent = makeTempDir();
    const projectRoot = path.join(parent, 'project');
    fs.mkdirSync(projectRoot);
    t.after(() => fs.rmSync(parent, {recursive: true, force: true}));
    writePackageJson(projectRoot, '.', {
        name: 'fixture-root',
        version: '1.0.0',
        workspaces: ['../outside/*'],
    });
    writePackageJson(parent, 'outside/package', {
        name: '@fixture/outside',
        version: '1.0.0',
    });

    assert.throws(() => discoverReleasePackages({projectRoot}), /workspace pattern is invalid/);
});

test('rejects unsupported keys in the workspace package object', (t) => {
    const projectRoot = makeTempDir();
    t.after(() => fs.rmSync(projectRoot, {recursive: true, force: true}));
    writePackageJson(projectRoot, '.', {
        name: 'fixture-root',
        version: '1.0.0',
        workspaces: {
            packages: ['packages/*'],
            nohoist: ['packages/private'],
        },
    });

    assert.throws(() => discoverReleasePackages({projectRoot}), /root workspaces declaration is invalid/);
});

test('rejects npm package names with a non-alphanumeric terminal character', (t) => {
    const projectRoot = makeTempDir();
    t.after(() => fs.rmSync(projectRoot, {recursive: true, force: true}));
    writePackageJson(projectRoot, '.', {
        name: 'fixture.',
        version: '1.0.0',
    });

    assert.throws(() => discoverReleasePackages({projectRoot}), /invalid name/);
});

test('rejects duplicate package tag prefixes discovered from different scopes', (t) => {
    const projectRoot = makeTempDir();
    t.after(() => fs.rmSync(projectRoot, {recursive: true, force: true}));
    writePackageJson(projectRoot, '.', {
        name: 'fixture-root',
        version: '1.0.0',
        private: true,
        workspaces: ['packages/*'],
    });
    writePackageJson(projectRoot, 'packages/one', {
        name: '@scope-one/shared',
        version: '1.0.0',
    });
    writePackageJson(projectRoot, 'packages/two', {
        name: '@scope-two/shared',
        version: '1.0.0',
    });

    assert.throws(() => discoverReleasePackages({projectRoot}), /tag prefixes contain duplicates/);
});

test('rejects symlinked package directories even when the target stays inside the project', (t) => {
    const projectRoot = makeTempDir();
    t.after(() => fs.rmSync(projectRoot, {recursive: true, force: true}));
    writePackageJson(projectRoot, '.', {
        name: 'fixture-root',
        version: '1.0.0',
        private: true,
        workspaces: ['links/real'],
    });
    writePackageJson(projectRoot, 'packages/real', {
        name: '@fixture/real',
        version: '1.0.0',
    });
    fs.mkdirSync(path.join(projectRoot, 'links'));
    fs.symlinkSync(path.join(projectRoot, 'packages', 'real'), path.join(projectRoot, 'links', 'real'));

    assert.throws(() => discoverReleasePackages({projectRoot}), /symlinked or escaping/);
});

test('loads only exact managed and explicitly allowed legacy configurations', (t) => {
    const projectRoot = makeTempDir();
    t.after(() => fs.rmSync(projectRoot, {recursive: true, force: true}));
    writePackageJson(projectRoot, '.', {name: 'fixture-root', version: '1.0.0'});
    const configPath = path.join(projectRoot, '.prism', 'release.json');
    writeJson(configPath, {
        schemaVersion: 1,
        managedBy: '@kyaulabs/prism-core',
        versionPolicy: 'lockstep',
        packages: ['.'],
    });
    assert.deepEqual(loadReleaseConfiguration({projectRoot}), {kind: 'MANAGED', packages: ['.']});

    writeJson(configPath, {packages: ['.']});
    assert.throws(() => loadReleaseConfiguration({projectRoot}), /schema is invalid/);
    assert.deepEqual(loadReleaseConfiguration({projectRoot, allowLegacy: true}), {
        kind: 'LEGACY',
        packages: ['.'],
    });
});

test('excludes private discovery candidates but rejects a configured private package', (t) => {
    const projectRoot = makeTempDir();
    t.after(() => fs.rmSync(projectRoot, {recursive: true, force: true}));
    writePackageJson(projectRoot, '.', {
        name: 'fixture-root',
        version: '1.0.0',
        private: true,
        workspaces: ['packages/*'],
    });
    writePackageJson(projectRoot, 'packages/public', {
        name: '@fixture/public',
        version: '1.0.0',
    });
    writePackageJson(projectRoot, 'packages/private', {
        name: '@fixture/private',
        version: '1.0.0',
        private: true,
    });

    assert.deepEqual(discoverReleasePackages({projectRoot}).map(({path: packagePath}) => packagePath), [
        'packages/public',
    ]);
    writeJson(path.join(projectRoot, '.prism', 'release.json'), {
        schemaVersion: 1,
        managedBy: '@kyaulabs/prism-core',
        versionPolicy: 'lockstep',
        packages: ['packages/private'],
    });
    assert.throws(() => loadReleaseConfiguration({projectRoot}), /private package/);
});

// vim: ft=javascript sts=4 sw=4 ts=4 et :
