// $KYAULabs: prism-tool-managed-record.test.js kyau@aura.kyaulabs 2026/09/03 -0700 Exp $

'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const {
    ensureManagedDirectory,
} = require('../../packages/prism-core/scripts/prism-tool/managed-record');

function fixture(t) {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'prism-managed-record-'));
    t.after(() => fs.rmSync(root, {recursive: true, force: true}));
    return root;
}

test('creates every missing contained managed directory privately', (t) => {
    const root = fixture(t);
    const target = path.join(root, 'one', 'two', 'three');

    assert.equal(ensureManagedDirectory(target, root), target);

    for (const directory of ['one', 'one/two', 'one/two/three']) {
        assert.equal(fs.statSync(path.join(root, directory)).mode & 0o777, 0o700);
    }
});

test('normalizes newly created directories under a restrictive umask', (t) => {
    const root = fixture(t);
    const target = path.join(root, 'state');
    const original = process.umask(0o177);

    try {
        assert.equal(ensureManagedDirectory(target, root), target);
    } finally {
        process.umask(original);
    }

    assert.equal(fs.statSync(target).mode & 0o777, 0o700);
});

test('rejects a writable existing intermediate directory', (t) => {
    const root = fixture(t);
    const intermediate = path.join(root, 'one');
    const target = path.join(intermediate, 'two');
    fs.mkdirSync(intermediate, {mode: 0o770});
    fs.chmodSync(intermediate, 0o770);
    fs.mkdirSync(target, {mode: 0o700});
    fs.chmodSync(target, 0o700);

    assert.throws(() => ensureManagedDirectory(target, root), /unsafe/);
    assert.equal(fs.statSync(intermediate).mode & 0o777, 0o770);
});

test('rejects an existing public final directory without changing its mode', (t) => {
    const root = fixture(t);
    const target = path.join(root, 'state');
    fs.mkdirSync(target, {mode: 0o755});
    fs.chmodSync(target, 0o755);

    assert.throws(() => ensureManagedDirectory(target, root), /unsafe/);
    assert.equal(fs.statSync(target).mode & 0o777, 0o755);
});

test('rejects destinations outside the trusted root', (t) => {
    const root = fixture(t);
    const outside = fixture(t);

    assert.throws(() => ensureManagedDirectory(outside, root), /unsafe/);
});

// vim: ft=javascript sts=4 sw=4 ts=4 et :
