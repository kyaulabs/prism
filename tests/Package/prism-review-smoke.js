// $KYAULabs: prism-review-smoke.js kyau@aura.kyaulabs 2026/09/08 -0700 Exp $

'use strict';

const childProcess = require('node:child_process');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const root = path.resolve(__dirname, '../..');
const args = process.argv.slice(2);
assert.equal(args.length, 3);
assert.equal(args[0], '--sdk');
assert.ok(['0.84.1', '0.85.1', 'latest'].includes(args[1]));
assert.equal(args[2], '--network-approved=yes');
const work = fs.mkdtempSync(path.join(os.tmpdir(), 'prism-sdk-smoke-'));
fs.chmodSync(work, 0o700);
const home = path.join(work, 'home');
const install = path.join(work, 'install');
const consumer = path.join(work, 'consumer');
for (const dir of [home, install, consumer]) fs.mkdirSync(dir, {mode: 0o700});
const env = {PATH: process.env.PATH, HOME: home, TMPDIR: work, PI_OFFLINE: '1',
    npm_config_cache: path.join(work, 'npm-cache'), npm_config_globalconfig: '/dev/null',
    npm_config_userconfig: path.join(work, 'empty-npmrc'), GIT_CONFIG_NOSYSTEM: '1',
    GIT_CONFIG_GLOBAL: '/dev/null'};
fs.writeFileSync(env.npm_config_userconfig, '', {mode: 0o600});
const guard = path.join(work, 'credential-guard.cjs');
const guardLog = path.join(work, 'credential-guard-result.json');
fs.copyFileSync(path.join(__dirname, 'prism-review-credential-guard.cjs'), guard);

function run(command, argv, cwd = work, extra = {}) {
    const node = command === process.execPath;
    if (node) fs.rmSync(guardLog, {force: true});
    const actual = node ? ['--require', guard, ...argv] : argv;
    const result = childProcess.spawnSync(command, actual, {cwd,
        env: {...env, ...extra, ...(node ? {PRISM_TEST_GUARD_LOG: guardLog} : {})},
        encoding: 'utf8', timeout: 180000, maxBuffer: 1048576});
    if (result.error) throw result.error;
    if (node) {
        const evidence = JSON.parse(fs.readFileSync(guardLog, 'utf8'));
        assert.deepEqual(evidence, {loaded: true, denied: false}, 'credential guard must stay active without denied reads');
    }
    return result;
}

function ok(command, argv, cwd = work, extra = {}) {
    const result = run(command, argv, cwd, extra);
    assert.equal(result.status, 0, `${command} failed: ${result.stderr}`);
    return result.stdout;
}

function pack(packagePath) {
    const output = JSON.parse(ok('npm', ['pack', packagePath, '--json', '--ignore-scripts',
        '--pack-destination', work], work));
    const entries = Array.isArray(output) ? output : Object.values(output);
    assert.equal(entries.length, 1);
    return {file: path.join(work, entries[0].filename), files: entries[0].files};
}

try {
    let version = args[1];
    if (version === 'latest') {
        const versions = JSON.parse(ok('npm', ['view',
            '@earendil-works/pi-coding-agent@latest', 'version', '--json']));
        const candidates = (Array.isArray(versions) ? versions : [versions])
            .filter(value => typeof value === 'string' && /^\d+\.\d+\.\d+$/.test(value));
        candidates.sort((a, b) => {
            const x = a.split('.').map(Number), y = b.split('.').map(Number);
            return x[0] - y[0] || x[1] - y[1] || x[2] - y[2];
        });
        assert.ok(candidates.length > 0, 'no stable in-range SDK is available; compatibility lane is not verified');
        version = candidates.at(-1);
    }
    console.log(JSON.stringify({lane: args[1], sdkVersion: version}));
    const coreArchive = pack(path.join(root, 'packages/prism-core'));
    const adapterArchive = pack(path.join(root, 'packages/prism-php-web'));
    assert.ok(coreArchive.files.some(file => file.path === 'scripts/prism-review.js'));
    assert.ok(adapterArchive.files.some(file => file.path === 'scripts/prism-tool-adapter.js'));
    assert.equal(coreArchive.files.some(file => file.path === 'prompts/handoff.md'), false);
    fs.copyFileSync(coreArchive.file, path.join(install, 'core.tgz'));
    fs.writeFileSync(path.join(install, 'package.json'), JSON.stringify({private: true,
        dependencies: {'@kyaulabs/prism-core': 'file:./core.tgz'},
        overrides: {'@earendil-works/pi-coding-agent': version}}), {mode: 0o600});
    ok('npm', ['install', '--legacy-peer-deps', '--ignore-scripts', '--no-audit', '--no-fund'], install);
    const lock = fs.readFileSync(path.join(install, 'package-lock.json'), 'utf8');
    assert.ok(lock.includes('node_modules/@earendil-works/pi-coding-agent'));
    ok('npm', ['ci', '--legacy-peer-deps', '--ignore-scripts', '--no-audit', '--no-fund', '--offline'], install);
    assert.equal(fs.readFileSync(path.join(install, 'package-lock.json'), 'utf8'), lock);
    for (const directory of [path.join(root, '.pi'), path.join(root, '.pi/tmp')]) {
        if (!fs.existsSync(directory)) fs.mkdirSync(directory, {mode: 0o700});
        const identity = fs.lstatSync(directory);
        assert.ok(identity.isDirectory() && !identity.isSymbolicLink());
    }
    const artifacts = fs.mkdtempSync(path.join(root, '.pi/tmp/package-smoke-'));
    fs.chmodSync(artifacts, 0o700);
    for (const name of ['package.json', 'package-lock.json', 'core.tgz']) {
        fs.copyFileSync(path.join(install, name), path.join(artifacts, name));
        fs.chmodSync(path.join(artifacts, name), 0o600);
    }
    fs.writeFileSync(path.join(artifacts, 'version.json'), JSON.stringify({lane: args[1], sdkVersion: version}), {mode: 0o600});
    console.log(JSON.stringify({replayDirectory: artifacts}));
    ok('git', ['init', '--initial-branch=develop'], consumer);
    const core = path.join(install, 'node_modules/@kyaulabs/prism-core');
    const cli = path.join(core, 'scripts/prism-review.js');
    const sdkReport = JSON.parse(ok(process.execPath, [cli, 'sdk', '--json'], consumer));
    assert.equal(sdkReport.status, 'GO');
    assert.equal(sdkReport.sdk.version, version);
    fs.copyFileSync(path.join(__dirname, 'prism-review-model.mjs'), path.join(install, 'fixture-model.mjs'));
    const model = JSON.parse(ok(process.execPath, [path.join(install, 'fixture-model.mjs')], install));
    const doctor = JSON.parse(ok(process.execPath, [cli, 'doctor', '--json'], consumer, model));
    assert.equal(doctor.status, 'GO');
    assert.equal(doctor.sourceClass, 'INSTALLED_EXTERNAL');
    assert.equal(doctor.model.authentication, 'UNKNOWN');
    assert.equal(doctor.authority.adapter, null);
    assert.equal(doctor.checks.find(check => check.id === 'sdk-isolation').status, 'PASS');
    const sdkRoot = path.join(install, 'node_modules/@earendil-works/pi-coding-agent');
    const parked = path.join(work, 'parked-sdk');
    fs.renameSync(sdkRoot, parked);
    const missing = run(process.execPath, [cli, 'sdk', '--json'], consumer);
    assert.equal(missing.status, 3);
    assert.equal(JSON.parse(missing.stdout).reason, 'SDK_MISSING');
    fs.mkdirSync(path.join(sdkRoot, 'dist'), {recursive: true, mode: 0o700});
    const fakeManifest = {name: '@earendil-works/pi-coding-agent', version: '0.85.1',
        type: 'module', exports: {'.': {import: './dist/index.js'}}};
    fs.writeFileSync(path.join(sdkRoot, 'package.json'), JSON.stringify(fakeManifest), {mode: 0o600});
    fs.writeFileSync(path.join(sdkRoot, 'dist/index.js'), 'export const ModelRuntime = {};\n', {mode: 0o600});
    const incompatible = run(process.execPath, [cli, 'sdk', '--json'], consumer);
    assert.equal(incompatible.status, 3);
    assert.equal(JSON.parse(incompatible.stdout).reason, 'SDK_API_UNSUPPORTED');
    fakeManifest.version = '5.0.1';
    fs.writeFileSync(path.join(sdkRoot, 'package.json'), JSON.stringify(fakeManifest), {mode: 0o600});
    const unsupported = run(process.execPath, [cli, 'sdk', '--json'], consumer);
    assert.equal(unsupported.status, 3);
    assert.equal(JSON.parse(unsupported.stdout).reason, 'SDK_API_UNSUPPORTED');
    fs.rmSync(sdkRoot, {recursive: true});
    fs.renameSync(parked, sdkRoot);
    const observedManifest = JSON.parse(fs.readFileSync(path.join(sdkRoot, 'package.json'), 'utf8'));
    observedManifest.version = '99.0.0-development';
    fs.writeFileSync(path.join(sdkRoot, 'package.json'), JSON.stringify(observedManifest), {mode: 0o600});
    const observed = JSON.parse(ok(process.execPath, [cli, 'sdk', '--json'], consumer));
    assert.equal(observed.status, 'GO');
    assert.equal(observed.sdk.version, '99.0.0-development');
    console.log(JSON.stringify({lane: args[1], sdkVersion: version, packageSmoke: 'PASS'}));
} finally {
    fs.rmSync(work, {recursive: true, force: true});
}

// vim: ft=javascript sts=4 sw=4 ts=4 et :
