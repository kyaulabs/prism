// $KYAULabs: lean-installer.test.js kyau@aura.kyaulabs 2026/09/09 -0700 Exp $

'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {spawnSync} = require('node:child_process');

const installer = path.resolve(__dirname, '../../packages/prism-core/scripts/install-global.sh');

function fixture(t) {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'prism-lean-install-'));
    t.after(() => fs.rmSync(root, {recursive: true, force: true}));
    const source = path.join(root, 'core');
    const agent = path.join(root, 'agent');
    const bin = path.join(root, 'bin');
    for (const directory of [source, agent, bin]) fs.mkdirSync(directory, {mode: 0o700});
    fs.writeFileSync(path.join(source, 'package.json'), JSON.stringify({name: '@kyaulabs/prism-core'}));
    fs.writeFileSync(path.join(source, 'AGENTS.md'), '# Core instructions\n');
    fs.writeFileSync(path.join(source, 'APPEND_SYSTEM.md'), '# Core reminder\n');
    fs.writeFileSync(path.join(agent, 'AGENTS.md'), '# User instructions\n');
    fs.writeFileSync(path.join(bin, 'pi'), `#!${process.execPath}\nconst fs=require('node:fs'); const path=require('node:path'); fs.writeFileSync(path.join(process.env.PI_CODING_AGENT_DIR,'settings.json'),JSON.stringify({packages:[process.argv[3]],theme:'custom'}));\n`, {mode: 0o755});
    return {root, source, agent, run: (overrides = {}, script = installer) => spawnSync('bash', [script], {
        encoding: 'utf8',
        env: {...process.env, HOME: root, PI_CODING_AGENT_DIR: agent, PRISM_CORE_SOURCE: source,
            PRISM_BIN_DIR: path.join(root, 'launchers'), PATH: `${bin}:/usr/bin:/bin`, ...overrides},
    })};
}

test('installs a plain Pi Core package without reviewer or toolchain readiness', (t) => {
    const target = fixture(t);
    const result = target.run();
    assert.equal(result.status, 0, result.stderr + result.stdout);
    const instructions = fs.readFileSync(path.join(target.agent, 'AGENTS.md'), 'utf8');
    assert.ok(instructions.startsWith('# User instructions\n'));
    assert.match(instructions, /# Core instructions/);
    assert.equal(fs.existsSync(path.join(target.root, 'launchers')), false);
    assert.equal(JSON.parse(fs.readFileSync(path.join(target.agent, 'settings.json'), 'utf8')).theme, 'custom');
});

test('reinstallation replaces only the marked context block', (t) => {
    const target = fixture(t);
    assert.equal(target.run().status, 0);
    const file = path.join(target.agent, 'AGENTS.md');
    fs.appendFileSync(file, '# User tail\n');
    fs.writeFileSync(path.join(target.source, 'AGENTS.md'), '# Updated Core\n');
    const result = target.run();
    assert.equal(result.status, 0, result.stderr + result.stdout);
    const output = fs.readFileSync(file, 'utf8');
    assert.ok(output.startsWith('# User instructions\n'));
    assert.ok(output.endsWith('# User tail\n'));
    assert.match(output, /# Updated Core/);
    assert.doesNotMatch(output, /# Core instructions/);
    assert.equal(output.match(/prism-core:begin/g)?.length, 1);
});

test('malformed managed markers leave both context files unchanged', (t) => {
    const target = fixture(t);
    const append = path.join(target.agent, 'APPEND_SYSTEM.md');
    const malformed = '<!-- prism-core:begin APPEND_SYSTEM.md do not edit; managed by install-global.sh -->\nUser text without closing marker\n';
    fs.writeFileSync(append, malformed);
    assert.notEqual(target.run().status, 0);
    assert.equal(fs.readFileSync(append, 'utf8'), malformed);
    assert.equal(fs.readFileSync(path.join(target.agent, 'AGENTS.md'), 'utf8'), '# User instructions\n');
});

test('context deployment rejects symlinks without changing their targets', (t) => {
    const target = fixture(t);
    const contextFile = path.join(target.agent, 'AGENTS.md');
    const unrelated = path.join(target.root, 'unrelated.md');
    fs.writeFileSync(unrelated, 'User-owned text\n');
    fs.unlinkSync(contextFile);
    fs.symlinkSync(unrelated, contextFile);
    assert.notEqual(target.run().status, 0);
    assert.equal(fs.readFileSync(unrelated, 'utf8'), 'User-owned text\n');
    assert.equal(fs.lstatSync(contextFile).isSymbolicLink(), true);
});

test('a failed context replacement preserves the existing file', (t) => {
    const target = fixture(t);
    const {deployContext} = require('../../packages/prism-core/scripts/deploy-context');
    t.mock.method(fs, 'renameSync', () => { throw new Error('simulated replacement failure'); });
    assert.throws(() => deployContext(target.source, target.agent), /simulated replacement failure/);
    assert.equal(fs.readFileSync(path.join(target.agent, 'AGENTS.md'), 'utf8'), '# User instructions\n');
    assert.deepEqual(fs.readdirSync(target.agent), ['AGENTS.md']);
});

test('npm installation uses the installed package context without an approval flag', (t) => {
    const target = fixture(t);
    const installed = path.join(target.agent, 'npm/node_modules/@kyaulabs/prism-core');
    fs.mkdirSync(path.dirname(installed), {recursive: true});
    fs.cpSync(target.source, installed, {recursive: true});
    fs.writeFileSync(path.join(installed, 'AGENTS.md'), '# Selected npm Core\n');
    const result = target.run({PRISM_CORE_SOURCE: 'npm:@kyaulabs/prism-core'});
    assert.equal(result.status, 0, result.stderr + result.stdout);
    assert.match(fs.readFileSync(path.join(target.agent, 'AGENTS.md'), 'utf8'), /# Selected npm Core/);
    assert.deepEqual(JSON.parse(fs.readFileSync(path.join(target.agent, 'settings.json'), 'utf8')).packages,
        ['npm:@kyaulabs/prism-core']);
});

test('refreshing an installed package preserves its npm registration', (t) => {
    const target = fixture(t);
    const installed = path.join(target.agent, 'npm/node_modules/@kyaulabs/prism-core');
    fs.mkdirSync(path.dirname(installed), {recursive: true});
    fs.cpSync(target.source, installed, {recursive: true});
    fs.mkdirSync(path.join(installed, 'scripts'));
    for (const name of ['install-global.sh', 'deploy-context.js', 'reconcile-core-source.js']) {
        fs.copyFileSync(path.join(path.dirname(installer), name), path.join(installed, 'scripts', name));
    }
    const settings = {packages: ['npm:@kyaulabs/prism-core'], theme: 'custom'};
    fs.writeFileSync(path.join(target.agent, 'settings.json'), JSON.stringify(settings));
    const result = target.run({PRISM_CORE_SOURCE: ''}, path.join(installed, 'scripts/install-global.sh'));
    assert.equal(result.status, 0, result.stderr + result.stdout);
    assert.deepEqual(JSON.parse(fs.readFileSync(path.join(target.agent, 'settings.json'), 'utf8')), settings);
});

// vim: ft=javascript sts=4 sw=4 ts=4 et :
