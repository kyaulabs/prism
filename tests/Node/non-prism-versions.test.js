// $KYAULabs: non-prism-versions.test.js kyau@aura.kyaulabs 2026/09/08 -0700 Exp $

'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const {checkExternalTools} = require('../../packages/prism-core/scripts/prism-tool/preflight');

test('external readiness accepts a reported version outside the reference range', t => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'prism-version-test-'));
    t.after(() => fs.rmSync(root, {recursive: true, force: true}));
    fs.writeFileSync(path.join(root, 'semgrep'), '#!/bin/sh\nexit 0\n', {mode: 0o700});
    const contract = {components: [{id: 'semgrep', kind: 'command', provisioning: 'external',
        executable: 'semgrep', versionArguments: ['--version'],
        versionRequirement: {minimum: '1.173.0', maximumExclusive: '2.0.0'}}]};
    const [result] = checkExternalTools({contract, env: {PATH: root},
        run: () => ({status: 0, stdout: '9.0.0\n', stderr: ''})});
    assert.equal(result.status, 'PASS');
    assert.equal(result.actual, '9.0.0');
});

test('an unsupported version probe does not block an available executable', t => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'prism-version-test-'));
    t.after(() => fs.rmSync(root, {recursive: true, force: true}));
    fs.writeFileSync(path.join(root, 'tool'), '#!/bin/sh\nexit 0\n', {mode: 0o700});
    const contract = {components: [{id: 'tool', kind: 'command', provisioning: 'external',
        executable: 'tool', version: '1.0.0', versionArguments: ['--version']}]};
    const [result] = checkExternalTools({contract, env: {PATH: root},
        run: () => ({status: 2, stdout: '', stderr: 'unsupported argument'})});
    assert.equal(result.status, 'PASS');
    assert.equal(result.actual, null);
});

test('Pi SDK versions are observations without a compatibility range', () => {
    const {observeSdkVersion} = require('../../packages/prism-core/scripts/prism-review/sdk');
    for (const version of ['0.1.0', '99.0.0', '0.85.1-dev', 'development']) {
        assert.equal(observeSdkVersion(version), version);
    }
    assert.equal(observeSdkVersion(undefined), null);
});

test('bundled non-Prism commands resolve despite installed version drift', t => {
    const {resolveBundledComponent} = require('../../packages/prism-core/scripts/prism-tool/core-toolchain');
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'prism-version-test-'));
    t.after(() => fs.rmSync(root, {recursive: true, force: true}));
    const pkg = path.join(root, 'node_modules/example-tool');
    fs.mkdirSync(pkg, {recursive: true});
    fs.writeFileSync(path.join(pkg, 'package.json'), JSON.stringify({name: 'example-tool', version: '2.0.0', bin: 'cli.js'}));
    fs.writeFileSync(path.join(pkg, 'cli.js'), '');
    assert.equal(resolveBundledComponent(root, {id: 'example', package: 'example-tool', version: '1.0.0', executable: 'example'}),
        path.join(pkg, 'cli.js'));
});

test('PHP readiness depends on capabilities rather than a numeric floor', t => {
    const {inspect} = require('../../packages/prism-php-web/scripts/toolchain/project');
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'prism-version-test-'));
    t.after(() => fs.rmSync(root, {recursive: true, force: true}));
    for (const file of ['composer.json', 'composer.lock', 'package.json', 'package-lock.json']) fs.writeFileSync(path.join(root, file), '{}');
    const result = inspect({contract: {components: []}, projectRoot: root,
        run: () => ({status: 0, stdout: JSON.stringify({version: '7.4.0', sockets: true})})});
    assert.equal(result.status, 'GO');
});

test('unknown external versions survive check publication and verification', async t => {
    const {execFileSync} = require('node:child_process');
    const {runDeterministicCheck, verifyCheck} = require('../../packages/prism-core/scripts/prism-review/check');
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'prism-version-test-'));
    t.after(() => fs.rmSync(root, {recursive: true, force: true}));
    const env = {...process.env, GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_NOSYSTEM: '1'};
    const git = (...args) => execFileSync('git', args, {cwd: root, env, encoding: 'utf8'}).trim();
    git('init', '-q', '-b', 'fix/tester-abcd-version');
    fs.writeFileSync(path.join(root, '.gitignore'), '.pi/\n');
    git('add', '.');
    git('-c', 'core.hooksPath=/dev/null', '-c', 'commit.gpgsign=false', '-c', 'user.name=Test',
        '-c', 'user.email=test@example.test', 'commit', '-qm', 'fixture');
    const headSha = git('rev-parse', 'HEAD');
    const context = {projectRoot: root, env, hasHarness: false, execute(request) {
        return {status: request.id === 'core.conflict-markers' ? 1 : 0, stdout: '', stderr: '',
            tools: [{id: 'semgrep', version: null}], artifacts: []};
    }};
    const result = await runDeterministicCheck({baseRef: 'HEAD'}, context);
    assert.equal(result.status, 'PASS');
    assert.equal(verifyCheck({branch: 'fix/tester-abcd-version', baseRef: 'HEAD', baseSha: headSha, headSha}, context).status, 'PASS');
});

test('adapter reports accept unknown external versions without weakening provider identity', async () => {
    const {runQualityProvider} = require('../../packages/prism-php-web/scripts/toolchain/quality-provider');
    const {validateQualityReport} = require('../../packages/prism-core/scripts/prism-review/quality-provider');
    const manifest = require('../../packages/prism-php-web/package.json');
    const contract = require('../../packages/prism-php-web/toolchain.json');
    const report = await runQualityProvider({projectRoot: process.cwd(), trackedPaths: ['example.js'], packageScripts: [],
        runTool: async () => ({status: 0, stdout: '', stderr: '', tools: [{id: 'eslint', version: null}], artifacts: []}),
        runCommand() { throw new Error('unexpected command'); }, runServer() { throw new Error('unexpected server'); },
        changedLines() { return []; }, readArtifact() { throw new Error('unexpected artifact'); }, verifySnapshot() { return true; }});
    assert.equal(report.status, 'PASS');
    const expected = {...contract.qualityProvider, packageName: manifest.name, packageVersion: manifest.version};
    assert.equal(validateQualityReport(report, expected).status, 'PASS');
    assert.throws(() => validateQualityReport(report, {...expected, packageVersion: '99.0.0'}));
});

test('installed graph verification retains pins and audits without native version matching', t => {
    const {verifyInstalledProject} = require('../../packages/prism-php-web/scripts/toolchain/transaction');
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'prism-version-test-'));
    t.after(() => fs.rmSync(root, {recursive: true, force: true}));
    fs.mkdirSync(path.join(root, 'vendor/bin'), {recursive: true});
    fs.writeFileSync(path.join(root, 'vendor/bin/pest'), '#!/bin/sh\nexit 0\n', {mode: 0o700});
    fs.writeFileSync(path.join(root, 'composer.lock'), JSON.stringify({packages: [{name: 'pestphp/pest', version: '1.0.0'}]}));
    fs.writeFileSync(path.join(root, 'package-lock.json'), JSON.stringify({packages: {}}));
    const contract = {components: [{id: 'pest', kind: 'command', provisioning: 'consumer-dev', ecosystem: 'composer',
        package: 'pestphp/pest', executable: 'pest', version: '1.0.0', versionArguments: ['--version']}]};
    const run = (command, args) => ({status: 0, stdout: args.includes('--version') ? '9.0.0' : JSON.stringify(command === 'composer'
        ? {advisories: []} : {vulnerabilities: {}, metadata: {vulnerabilities: {info: 0, low: 0, moderate: 0, high: 0, critical: 0}}})});
    assert.equal(verifyInstalledProject({contract, projectRoot: root, run}).status, 'GO');
    fs.writeFileSync(path.join(root, 'composer.lock'), JSON.stringify({packages: [{name: 'pestphp/pest', version: '2.0.0'}]}));
    assert.equal(verifyInstalledProject({contract, projectRoot: root, run}).status, 'NO-GO');
});

test('Core quality reports installed bundled metadata rather than its reference pin', async t => {
    const {runCoreQuality} = require('../../packages/prism-core/scripts/prism-review/core-quality');
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'prism-version-test-'));
    t.after(() => fs.rmSync(root, {recursive: true, force: true}));
    const coreRoot = path.join(root, 'core');
    fs.mkdirSync(path.join(coreRoot, 'node_modules/markdownlint-cli2'), {recursive: true});
    for (const file of ['package.json', 'toolchain.json']) {
        fs.copyFileSync(path.resolve(__dirname, '../../packages/prism-core', file), path.join(coreRoot, file));
    }
    fs.writeFileSync(path.join(coreRoot, 'node_modules/markdownlint-cli2/package.json'),
        JSON.stringify({name: 'markdownlint-cli2', version: '99.0.0'}));
    const report = await runCoreQuality({branch: 'fixture', baseSha: '1'.repeat(40), headSha: '2'.repeat(40)}, {
        projectRoot: root, coreRoot, hasHarness: false, verifySnapshot: () => true,
        runGit: () => ({status: 0, stdout: Buffer.alloc(0)}),
        run: (_command, args) => ({status: args[0] === 'grep' ? 1 : 0, stdout: '', stderr: ''}),
    });
    assert.equal(report.status, 'PASS');
    assert.deepEqual(report.gates.find(gate => gate.id === 'core.markdown').tools,
        [{id: 'markdownlint-cli2', version: '99.0.0'}]);
});

// vim: ft=javascript sts=4 sw=4 ts=4 et :
