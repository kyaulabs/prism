// $KYAULabs: check-peer-deps.test.js kyau@aura.kyaulabs 2026/08/16 -0700 Exp $


'use strict';

const assert = require('node:assert/strict');
const {execFileSync, spawnSync} = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const SCRIPT = path.resolve(__dirname, '../../packages/prism-core/scripts/check-peer-deps.js');

function tmpdir(t) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'peer-deps-'));
    t.after(() => fs.rmSync(dir, {recursive: true, force: true}));
    return dir;
}

function run(pkgJsonPath) {
    // execFileSync throws when the script exits non-zero — the always-exit-0
    // contract means a clean return IS the assertion of exit status 0.
    return execFileSync(process.execPath, [SCRIPT, pkgJsonPath], {encoding: 'utf8'});
}

test('missing package.json argument exits 0 with a message', () => {
    const out = execFileSync(process.execPath, [SCRIPT], {encoding: 'utf8'});
    assert.match(out, /missing package.json path argument/);
});

test('unparsable package.json exits 0 with a message', (t) => {
    const dir = tmpdir(t);
    fs.writeFileSync(path.join(dir, 'package.json'), '{ not json');
    const out = run(path.join(dir, 'package.json'));
    assert.match(out, /cannot parse package.json/);
});

test('missing extensions dir exits 0 silently', (t) => {
    const dir = tmpdir(t);
    fs.writeFileSync(path.join(dir, 'package.json'), '{}');
    assert.equal(run(path.join(dir, 'package.json')), '');
});

test('extensions path that is a file exits 0 silently (guarded statSync)', (t) => {
    const dir = tmpdir(t);
    fs.writeFileSync(path.join(dir, 'package.json'), '{}');
    fs.writeFileSync(path.join(dir, 'extensions'), 'not a dir');
    const out = run(path.join(dir, 'package.json'));
    assert.equal(out, '');
});

test('extension importing a pi core without peerDependencies reports a violation', (t) => {
    const dir = tmpdir(t);
    fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({name: 'pkg'}));
    fs.mkdirSync(path.join(dir, 'extensions'));
    fs.writeFileSync(path.join(dir, 'extensions', 'x.ts'), 'import x from "@earendil-works/pi-coding-agent";\n');
    const out = run(path.join(dir, 'package.json'));
    assert.match(out, /peerDependencies/);
});

test('stat failure other than ENOENT prints a stdout line and exits 0', (t) => {
    const dir = tmpdir(t);
    fs.writeFileSync(path.join(dir, 'package.json'), '{}');
    fs.symlinkSync('extensions', path.join(dir, 'extensions'));
    const res = spawnSync(process.execPath, [SCRIPT, path.join(dir, 'package.json')], {encoding: 'utf8'});
    assert.equal(res.status, 0);
    assert.match(res.stdout, /cannot stat extensions\//);
    assert.equal(res.stderr, '');
});

test('unscannable extensions tree exits 0 with a stdout line and no stderr', (t) => {
    if (typeof process.getuid === 'function' && process.getuid() === 0) {
        t.skip('running as root — permission denials do not apply');
        return;
    }
    const dir = tmpdir(t);
    fs.writeFileSync(path.join(dir, 'package.json'), '{}');
    fs.mkdirSync(path.join(dir, 'extensions'));
    fs.writeFileSync(path.join(dir, 'extensions', 'blocked.js'), '// x\n');
    fs.chmodSync(path.join(dir, 'extensions', 'blocked.js'), 0o000);
    const res = spawnSync(process.execPath, [SCRIPT, path.join(dir, 'package.json')], {encoding: 'utf8'});
    assert.equal(res.status, 0);
    assert.match(res.stdout, /cannot scan extensions\//);
    assert.equal(res.stderr, '');
});


// vim: ft=javascript sts=4 sw=4 ts=4 et :
