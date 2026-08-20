// $KYAULabs: reconcile-core-source.test.js kyau@aura.kyaulabs 2026/08/20 -0700 Exp $

'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {spawnSync} = require('node:child_process');
const test = require('node:test');
const {makeTempDir, writeJson} = require('./helpers');
const {reconcileCoreSource} = require('../../packages/prism-core/scripts/reconcile-core-source');

const CORE_NAME = '@kyaulabs/prism-core';

function packageRoot(root, name, packageName = CORE_NAME) {
    const target = path.join(root, name);
    writeJson(path.join(target, 'package.json'), {name: packageName});
    return fs.realpathSync(target);
}

test('selecting a local core source removes stale npm and local registrations', () => {
    const root = makeTempDir();
    const piDir = path.join(root, 'pi-agent');
    const selected = packageRoot(root, 'selected-core');
    const stale = packageRoot(root, 'stale-core');
    const settingsPath = path.join(piDir, 'settings.json');
    writeJson(settingsPath, {
        theme: 'dark',
        packages: [
            'npm:@kyaulabs/prism-core',
            stale,
            selected,
            {source: selected, prompts: []},
            'npm:unrelated',
        ],
    });

    const result = reconcileCoreSource(settingsPath, selected);
    const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));

    assert.deepEqual(result, {removed: 3, retained: selected});
    assert.deepEqual(settings.packages, [selected, 'npm:unrelated']);
    assert.equal(settings.theme, 'dark');
});

test('selecting an npm core source removes local registrations and preserves its object entry', () => {
    const root = makeTempDir();
    const piDir = path.join(root, 'pi-agent');
    const stale = packageRoot(root, 'stale-core');
    const settingsPath = path.join(piDir, 'settings.json');
    const selected = {source: 'npm:@kyaulabs/prism-core', prompts: ['prompts/release.md']};
    writeJson(settingsPath, {
        packages: [stale, selected, 'npm:@kyaulabs/prism-core', 'npm:unrelated'],
    });

    const result = reconcileCoreSource(settingsPath, selected.source);
    const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));

    assert.deepEqual(result, {removed: 2, retained: selected.source});
    assert.deepEqual(settings.packages, [selected, 'npm:unrelated']);
});

test('refuses to replace settings in a group-writable directory', () => {
    const root = makeTempDir();
    const piDir = path.join(root, 'pi-agent');
    const selected = packageRoot(root, 'selected-core');
    const settingsPath = path.join(piDir, 'settings.json');
    writeJson(settingsPath, {packages: [selected]});
    fs.chmodSync(piDir, 0o770);
    const before = fs.readFileSync(settingsPath);

    assert.throws(
        () => reconcileCoreSource(settingsPath, selected),
        /settings reconciliation failed/
    );
    assert.deepEqual(fs.readFileSync(settingsPath), before);
});

test('rename failure leaves the original settings bytes unchanged', () => {
    const root = makeTempDir();
    const piDir = path.join(root, 'pi-agent');
    const selected = packageRoot(root, 'selected-core');
    const settingsPath = path.join(piDir, 'settings.json');
    writeJson(settingsPath, {
        packages: ['npm:@kyaulabs/prism-core', selected],
    });
    const before = fs.readFileSync(settingsPath);
    const failingFs = new Proxy(fs, {
        get(target, property) {
            if (property === 'renameSync') return () => { throw new Error('rename failed'); };
            return Reflect.get(target, property);
        },
    });

    assert.throws(
        () => reconcileCoreSource(settingsPath, selected, {fs: failingFs}),
        /settings reconciliation failed/
    );
    assert.deepEqual(fs.readFileSync(settingsPath), before);
});

test('malformed settings fail without changing the original bytes', () => {
    const root = makeTempDir();
    const piDir = path.join(root, 'pi-agent');
    fs.mkdirSync(piDir, {recursive: true, mode: 0o700});
    const settingsPath = path.join(piDir, 'settings.json');
    fs.writeFileSync(settingsPath, '{invalid\n', {mode: 0o600});
    const before = fs.readFileSync(settingsPath);

    assert.throws(
        () => reconcileCoreSource(settingsPath, 'npm:@kyaulabs/prism-core'),
        /settings reconciliation failed/
    );
    assert.deepEqual(fs.readFileSync(settingsPath), before);
});

test('a symlinked settings file is rejected without touching its target', () => {
    const root = makeTempDir();
    const piDir = path.join(root, 'pi-agent');
    fs.mkdirSync(piDir, {recursive: true, mode: 0o700});
    const target = path.join(root, 'target.json');
    writeJson(target, {packages: ['npm:@kyaulabs/prism-core']});
    const settingsPath = path.join(piDir, 'settings.json');
    fs.symlinkSync(target, settingsPath);
    const before = fs.readFileSync(target);

    assert.throws(
        () => reconcileCoreSource(settingsPath, 'npm:@kyaulabs/prism-core'),
        /settings reconciliation failed/
    );
    assert.deepEqual(fs.readFileSync(target), before);
});

test('an absent selected registration fails without removing the working source', () => {
    const root = makeTempDir();
    const piDir = path.join(root, 'pi-agent');
    const selected = packageRoot(root, 'selected-core');
    const settingsPath = path.join(piDir, 'settings.json');
    writeJson(settingsPath, {packages: ['npm:@kyaulabs/prism-core']});
    const before = fs.readFileSync(settingsPath);

    assert.throws(
        () => reconcileCoreSource(settingsPath, selected),
        /settings reconciliation failed/
    );
    assert.deepEqual(fs.readFileSync(settingsPath), before);
});

test('local packages with another name remain registered', () => {
    const root = makeTempDir();
    const piDir = path.join(root, 'pi-agent');
    const selected = packageRoot(root, 'selected-core');
    const unrelated = packageRoot(root, 'unrelated', '@example/unrelated');
    const settingsPath = path.join(piDir, 'settings.json');
    writeJson(settingsPath, {packages: [unrelated, selected]});

    reconcileCoreSource(settingsPath, selected);
    const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));

    assert.deepEqual(settings.packages, [unrelated, selected]);
});

test('oversized settings fail without changing the original bytes', () => {
    const root = makeTempDir();
    const piDir = path.join(root, 'pi-agent');
    fs.mkdirSync(piDir, {recursive: true, mode: 0o700});
    const settingsPath = path.join(piDir, 'settings.json');
    fs.writeFileSync(settingsPath, 'x'.repeat(1024 * 1024 + 1), {mode: 0o600});
    const before = fs.readFileSync(settingsPath);

    assert.throws(
        () => reconcileCoreSource(settingsPath, 'npm:@kyaulabs/prism-core'),
        /settings reconciliation failed/
    );
    assert.deepEqual(fs.readFileSync(settingsPath), before);
});

test('a selected local source must declare the exact core package name', () => {
    const root = makeTempDir();
    const piDir = path.join(root, 'pi-agent');
    const selected = packageRoot(root, 'wrong-package', '@example/wrong');
    const settingsPath = path.join(piDir, 'settings.json');
    writeJson(settingsPath, {packages: [selected]});
    const before = fs.readFileSync(settingsPath);

    assert.throws(
        () => reconcileCoreSource(settingsPath, selected),
        /settings reconciliation failed/
    );
    assert.deepEqual(fs.readFileSync(settingsPath), before);
});

test('the CLI reports only its generic failure diagnostic', () => {
    const script = path.resolve(__dirname, '../../packages/prism-core/scripts/reconcile-core-source.js');
    const result = spawnSync(process.execPath, [script, 'missing-settings', 'invalid-source'], {
        encoding: 'utf8',
    });

    assert.equal(result.status, 1);
    assert.equal(result.stdout, '');
    assert.equal(result.stderr, '✗ Prism Core settings reconciliation failed.\n');
});

// vim: ft=javascript sts=4 sw=4 ts=4 et :
