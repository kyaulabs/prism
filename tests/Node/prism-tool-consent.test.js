// $KYAULabs: prism-tool-consent.test.js kyau@aura.kyaulabs 2026/09/08 -0700 Exp $

'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const {makeTempDir} = require('./helpers');
const {consentCommand, requireWebConsent, resolveConsentPath} =
    require('../../packages/prism-core/scripts/prism-tool/consent');

function fixture(t) {
    const directory = makeTempDir();
    t.after(() => fs.rmSync(directory, {recursive: true, force: true}));
    return {consentPath: path.join(directory, 'prism-consent.json')};
}

function command(args, context) {
    let stdout = '';
    let stderr = '';
    const out = process.stdout.write;
    const err = process.stderr.write;
    process.stdout.write = (chunk) => { stdout += chunk; return true; };
    process.stderr.write = (chunk) => { stderr += chunk; return true; };
    try { return {status: consentCommand(args, context), stdout, stderr}; }
    finally { process.stdout.write = out; process.stderr.write = err; }
}

function write(context, value, mode = 0o600) {
    fs.writeFileSync(context.consentPath, JSON.stringify(value), {mode});
    fs.chmodSync(context.consentPath, mode);
}

test('web grant publishes schema three privately and revoke is idempotent', (t) => {
    const context = fixture(t);
    assert.throws(() => requireWebConsent(context), /standing web-access consent/);
    assert.equal(command(['grant-web', '--approval=yes'], context).status, 0);
    assert.deepEqual(JSON.parse(fs.readFileSync(context.consentPath)), {schemaVersion: 3, webAccess: true});
    assert.equal(fs.statSync(context.consentPath).mode & 0o777, 0o600);
    assert.equal(requireWebConsent(context).state, 'GRANTED');
    assert.deepEqual(JSON.parse(command(['status', '--json'], context).stdout), {
        schemaVersion: 3, command: 'consent status', status: 'GRANTED', webAccess: true, legacy: false,
    });
    assert.equal(command(['revoke-web'], context).status, 0);
    assert.equal(command(['revoke-web'], context).status, 0);
    assert.equal(fs.existsSync(context.consentPath), false);
});

test('both legacy schemas preserve web choice until explicitly migrated', (t) => {
    for (const record of [
        {schemaVersion: 1, ocr: true}, {schemaVersion: 1, ocr: false},
        {schemaVersion: 2, ocr: true, webAccess: true},
        {schemaVersion: 2, ocr: false, webAccess: true},
        {schemaVersion: 2, ocr: true, webAccess: false},
    ]) {
        const context = fixture(t);
        write(context, record);
        const bytes = fs.readFileSync(context.consentPath);
        const status = JSON.parse(command(['status', '--json'], context).stdout);
        assert.equal(status.legacy, true);
        assert.equal(status.webAccess, record.webAccess === true);
        if (record.webAccess) assert.equal(requireWebConsent(context).state, 'GRANTED');
        else assert.throws(() => requireWebConsent(context));
        for (const args of [['migrate'], ['migrate', '--approval=no'], ['grant-web', '--approval=yes'], ['revoke-web']]) {
            assert.notEqual(command(args, context).status, 0);
            assert.deepEqual(fs.readFileSync(context.consentPath), bytes);
        }
        assert.equal(command(['migrate', '--approval=yes'], context).status, 0);
        if (record.webAccess) {
            assert.deepEqual(JSON.parse(fs.readFileSync(context.consentPath)), {schemaVersion: 3, webAccess: true});
        } else assert.equal(fs.existsSync(context.consentPath), false);
    }
});

test('closed grammar requires literal single approval and rejects retired capabilities', (t) => {
    const context = fixture(t);
    for (const args of [['grant-web'], ['grant-web', '--approval=no'],
        ['grant-web', '--approval=yes', '--approval=yes'], ['grant-ocr', '--approval=yes'],
        ['revoke-ocr'], ['migrate', '--approval=yes', 'extra']]) {
        assert.equal(command(args, context).status, 2);
        assert.equal(fs.existsSync(context.consentPath), false);
    }
});

test('unsafe schema and permissions disable optional web access and are never mutated', (t) => {
    for (const [record, mode] of [[{schemaVersion: 3, webAccess: true, extra: true}, 0o600],
        [{schemaVersion: 3, webAccess: 'true'}, 0o600], [{schemaVersion: 4, webAccess: true}, 0o600],
        [{schemaVersion: 3, webAccess: true}, 0o644], [{schemaVersion: 2, ocr: true}, 0o600]]) {
        const context = fixture(t);
        write(context, record, mode);
        const bytes = fs.readFileSync(context.consentPath);
        assert.equal(JSON.parse(command(['status', '--json'], context).stdout).status, 'UNSAFE');
        assert.throws(() => requireWebConsent(context));
        for (const args of [['migrate', '--approval=yes'], ['grant-web', '--approval=yes'], ['revoke-web']]) {
            assert.equal(command(args, context).status, 5);
            assert.deepEqual(fs.readFileSync(context.consentPath), bytes);
        }
    }
});

test('symlink consent is never followed or replaced', (t) => {
    const context = fixture(t);
    const target = path.join(path.dirname(context.consentPath), 'target');
    fs.writeFileSync(target, '{"schemaVersion":3,"webAccess":true}', {mode: 0o600});
    fs.symlinkSync(target, context.consentPath);
    assert.throws(() => requireWebConsent(context));
    assert.equal(command(['migrate', '--approval=yes'], context).status, 5);
    assert.equal(fs.lstatSync(context.consentPath).isSymbolicLink(), true);
});

test('migration publication failure preserves the legacy record', (t) => {
    const context = fixture(t);
    write(context, {schemaVersion: 2, ocr: true, webAccess: true});
    const before = fs.readFileSync(context.consentPath);
    let links = 0;
    const failingFs = new Proxy(fs, {get(target, key) {
        if (key === 'linkSync') return (...args) => {
            if (++links === 2) throw new Error('CANARY');
            return target.linkSync(...args);
        };
        return target[key];
    }});
    const result = command(['migrate', '--approval=yes'], {...context, fs: failingFs});
    assert.equal(result.status, 5);
    assert.doesNotMatch(result.stderr, /CANARY/);
    assert.deepEqual(fs.readFileSync(context.consentPath), before);
});

test('path resolution respects explicit and Pi-owned directories', () => {
    assert.equal(resolveConsentPath({consentPath: '/fixture/consent.json'}), '/fixture/consent.json');
    assert.equal(resolveConsentPath({env: {PI_CODING_AGENT_DIR: '/fixture/agent'}}), '/fixture/agent/prism-consent.json');
});

// vim: ft=javascript sts=4 sw=4 ts=4 et :
