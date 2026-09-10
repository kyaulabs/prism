'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {inspectWebAccessConfig} = require('../../packages/prism-core/scripts/web-access/config');
const {resolveWebAccessBrowser} = require('../../packages/prism-core/scripts/web-access/browser');

test('optional web settings default locally and reject unsafe files without exposing contents', t => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'prism-web-settings-'));
    t.after(() => fs.rmSync(dir, {recursive:true, force:true}));
    const file = path.join(dir, 'prism-web-access.json');
    const context = {webAccessPath:file};
    assert.deepEqual(inspectWebAccessConfig(context).config, {browser:'auto', searxngUrl:null});
    fs.writeFileSync(file, JSON.stringify({schemaVersion:1, browser:'disabled', searxngUrl:'http://localhost:8080/'}), {mode:0o600});
    assert.deepEqual(inspectWebAccessConfig(context).config, {browser:'disabled', searxngUrl:'http://localhost:8080'});
    fs.writeFileSync(file, JSON.stringify({schemaVersion:1, searxngUrl:'https://example.com'}));
    assert.equal(inspectWebAccessConfig(context).state, 'UNSAFE');
    fs.unlinkSync(file);
    fs.symlinkSync('absent', file);
    assert.equal(inspectWebAccessConfig(context).state, 'UNSAFE');
});

test('browser discovery uses native executable paths without launching a process', t => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'prism-browser-settings-'));
    t.after(() => fs.rmSync(dir, {recursive:true, force:true}));
    const executable = path.join(dir, 'chromium');
    fs.writeFileSync(executable, '#!/bin/sh\nexit 0\n', {mode:0o700});
    const context = {platform:'linux', env:{PATH:dir}, config:{browser:'auto'}};
    assert.deepEqual(resolveWebAccessBrowser(context), {status:'AVAILABLE',family:'chromium',executable});
    assert.deepEqual(resolveWebAccessBrowser({...context, config:{browser:'disabled'}}), {status:'UNAVAILABLE'});
    assert.deepEqual(resolveWebAccessBrowser({...context, platform:'darwin'}), {status:'UNAVAILABLE'});
});
