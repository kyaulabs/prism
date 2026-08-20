// $KYAULabs: prism-tool-consent.test.js kyau@aura.kyaulabs 2026/08/19 -0700 Exp $

'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const {main} = require('../../packages/prism-core/scripts/prism-tool/cli');
const {inspectConsent, requireOcrConsent, resolveConsentPath} = require('../../packages/prism-core/scripts/prism-tool/consent');

function capture(callback) {
    let stdout = '';
    let stderr = '';
    const stdoutWrite = process.stdout.write;
    const stderrWrite = process.stderr.write;
    process.stdout.write = (chunk) => { stdout += String(chunk); return true; };
    process.stderr.write = (chunk) => { stderr += String(chunk); return true; };
    try {
        return {status: callback(), stderr, stdout};
    } finally {
        process.stdout.write = stdoutWrite;
        process.stderr.write = stderrWrite;
    }
}

function fixture(t) {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'prism-consent-test-'));
    t.after(() => fs.rmSync(root, {recursive: true, force: true}));
    return {
        consentPath: path.join(root, 'agent', 'prism-consent.json'),
        parent: path.join(root, 'agent'),
        root,
    };
}

function writeRecord(consentPath, content, mode = 0o600) {
    fs.mkdirSync(path.dirname(consentPath), {mode: 0o700, recursive: true});
    fs.writeFileSync(consentPath, content, {mode});
    fs.chmodSync(consentPath, mode);
}

function withWrongOwner(method, selected = () => true) {
    return {
        ...fs,
        [method](...args) {
            const stat = fs[method](...args);
            if (!selected(...args)) return stat;
            return new Proxy(stat, {
                get(target, property) {
                    if (property === 'uid') return target.uid + 1;
                    const value = Reflect.get(target, property, target);
                    return typeof value === 'function' ? value.bind(target) : value;
                },
            });
        },
    };
}

test('grant writes the exact private schema and status reports granted', (t) => {
    const target = fixture(t);
    const granted = capture(() => main([
        'consent', 'grant-ocr', '--approval=yes',
    ], {consentPath: target.consentPath}));

    assert.equal(granted.status, 0);
    assert.equal(granted.stderr, '');
    assert.deepEqual(JSON.parse(fs.readFileSync(target.consentPath, 'utf8')), {
        schemaVersion: 1,
        ocr: true,
    });
    assert.equal(fs.statSync(target.parent).mode & 0o777, 0o700);
    assert.equal(fs.statSync(target.consentPath).mode & 0o777, 0o600);
    const status = capture(() => main([
        'consent', 'status', '--json',
    ], {consentPath: target.consentPath}));
    assert.equal(status.status, 0);
    assert.deepEqual(JSON.parse(status.stdout), {
        schemaVersion: 1,
        command: 'consent status',
        status: 'GRANTED',
        ocr: true,
    });
});

test('status distinguishes absent consent from unsafe consent', (t) => {
    const target = fixture(t);
    const absent = capture(() => main([
        'consent', 'status', '--json',
    ], {consentPath: target.consentPath}));
    assert.deepEqual(JSON.parse(absent.stdout), {
        schemaVersion: 1,
        command: 'consent status',
        status: 'ABSENT',
        ocr: false,
    });

    writeRecord(target.consentPath, '{"schemaVersion":1,"ocr":false}\n');
    assert.equal(inspectConsent({consentPath: target.consentPath}).state, 'ABSENT');
});

test('grant requires one literal approval control', (t) => {
    const target = fixture(t);
    for (const args of [
        ['consent', 'grant-ocr'],
        ['consent', 'grant-ocr', '--approval=no'],
        ['consent', 'grant-ocr', '--approval=yes', '--approval=yes'],
        ['consent', 'grant-ocr', '--approval=yes', '--other=value'],
    ]) {
        const result = capture(() => main(args, {consentPath: target.consentPath}));
        assert.equal(result.status, 2, args.join(' '));
        assert.equal(fs.existsSync(target.consentPath), false);
    }
});

test('exact schema, private mode, ownership, and no-follow rules fail closed', (t) => {
    const cases = [
        ['unknown key', '{"schemaVersion":1,"ocr":true,"extra":true}\n', 0o600, {}],
        ['bad schema', '{"schemaVersion":2,"ocr":true}\n', 0o600, {}],
        ['malformed json', '{CANARY-CONTENT', 0o600, {}],
        ['oversized', ' '.repeat(4097), 0o600, {}],
        ['public mode', '{"schemaVersion":1,"ocr":true}\n', 0o644, {}],
        ['wrong owner', '{"schemaVersion":1,"ocr":true}\n', 0o600, {fs: withWrongOwner('fstatSync')}],
    ];
    for (const [name, content, mode, extra] of cases) {
        const target = fixture(t);
        writeRecord(target.consentPath, content, mode);
        const result = capture(() => main([
            'consent', 'status', '--json',
        ], {consentPath: target.consentPath, ...extra}));
        assert.equal(result.status, 0, name);
        assert.equal(JSON.parse(result.stdout).status, 'UNSAFE', name);
        assert.doesNotMatch(`${result.stdout}${result.stderr}`, /CANARY-CONTENT/, name);
    }

    const linkTarget = fixture(t);
    const foreign = path.join(linkTarget.root, 'foreign.json');
    fs.writeFileSync(foreign, '{"schemaVersion":1,"ocr":true}\n', {mode: 0o600});
    fs.mkdirSync(linkTarget.parent, {mode: 0o700});
    fs.symlinkSync(foreign, linkTarget.consentPath);
    assert.equal(inspectConsent({consentPath: linkTarget.consentPath}).state, 'UNSAFE');
});

test('unsafe parent ownership, modes, symlinks, and path types fail closed', (t) => {
    const ancestorTarget = fixture(t);
    const shared = path.join(ancestorTarget.root, 'shared');
    const nested = path.join(shared, 'agent');
    fs.mkdirSync(nested, {mode: 0o700, recursive: true});
    fs.chmodSync(shared, 0o770);
    assert.equal(inspectConsent({
        consentPath: path.join(nested, 'prism-consent.json'),
    }).state, 'UNSAFE');

    const writableTarget = fixture(t);
    fs.mkdirSync(writableTarget.parent, {mode: 0o700});
    fs.chmodSync(writableTarget.parent, 0o770);
    assert.equal(inspectConsent({consentPath: writableTarget.consentPath}).state, 'UNSAFE');

    const ownerTarget = fixture(t);
    fs.mkdirSync(ownerTarget.parent, {mode: 0o700});
    const ownerFs = withWrongOwner('lstatSync', (candidate) => candidate === ownerTarget.parent);
    assert.equal(inspectConsent({consentPath: ownerTarget.consentPath, fs: ownerFs}).state, 'UNSAFE');

    const symlinkTarget = fixture(t);
    const foreign = path.join(symlinkTarget.root, 'foreign');
    fs.mkdirSync(foreign, {mode: 0o700});
    fs.symlinkSync(foreign, symlinkTarget.parent);
    assert.equal(inspectConsent({consentPath: symlinkTarget.consentPath}).state, 'UNSAFE');

    const missingHierarchy = fixture(t);
    const nestedConsent = path.join(missingHierarchy.root, 'missing', 'agent', 'prism-consent.json');
    assert.equal(inspectConsent({consentPath: nestedConsent}).state, 'UNSAFE');
    assert.equal(capture(() => main([
        'consent', 'grant-ocr', '--approval=yes',
    ], {consentPath: nestedConsent})).status, 5);
    assert.equal(fs.existsSync(path.join(missingHierarchy.root, 'missing')), false);

    const invalidTarget = fixture(t);
    fs.writeFileSync(invalidTarget.parent, 'not a directory');
    assert.equal(inspectConsent({consentPath: invalidTarget.consentPath}).state, 'UNSAFE');
});

test('unsafe records are never overwritten or removed automatically', (t) => {
    const target = fixture(t);
    const unsafe = '{"schemaVersion":1,"ocr":true,"CANARY":"preserve"}\n';
    writeRecord(target.consentPath, unsafe, 0o600);

    const grant = capture(() => main([
        'consent', 'grant-ocr', '--approval=yes',
    ], {consentPath: target.consentPath}));
    const revoke = capture(() => main([
        'consent', 'revoke-ocr',
    ], {consentPath: target.consentPath}));

    assert.equal(grant.status, 5);
    assert.equal(revoke.status, 5);
    assert.equal(fs.readFileSync(target.consentPath, 'utf8'), unsafe);
    assert.doesNotMatch(`${grant.stderr}${revoke.stderr}`, /CANARY/);
});

test('revoke removes only a valid owned record and absent revoke is idempotent', (t) => {
    const target = fixture(t);
    assert.equal(capture(() => main([
        'consent', 'grant-ocr', '--approval=yes',
    ], {consentPath: target.consentPath})).status, 0);
    assert.equal(capture(() => main([
        'consent', 'revoke-ocr',
    ], {consentPath: target.consentPath})).status, 0);
    assert.equal(fs.existsSync(target.consentPath), false);
    assert.equal(capture(() => main([
        'consent', 'revoke-ocr',
    ], {consentPath: target.consentPath})).status, 0);

    writeRecord(target.consentPath, '{"schemaVersion":1,"ocr":true}\n');
    const guarded = capture(() => main([
        'consent', 'revoke-ocr',
    ], {consentPath: target.consentPath, fs: withWrongOwner('fstatSync')}));
    assert.equal(guarded.status, 5);
    assert.equal(fs.existsSync(target.consentPath), true);
});

test('directory sync failure reports non-success with a convergent consent state', (t) => {
    const target = fixture(t);
    fs.mkdirSync(target.parent, {mode: 0o700});
    const failingSyncFs = {
        ...fs,
        fsyncSync(descriptor) {
            if (fs.fstatSync(descriptor).isDirectory()) throw new Error('sync CANARY');
            return fs.fsyncSync(descriptor);
        },
    };

    const grant = capture(() => main([
        'consent', 'grant-ocr', '--approval=yes',
    ], {consentPath: target.consentPath, fs: failingSyncFs}));
    assert.equal(grant.status, 5);
    assert.doesNotMatch(grant.stderr, /CANARY/);
    assert.equal(inspectConsent({consentPath: target.consentPath}).state, 'GRANTED');

    const revoke = capture(() => main([
        'consent', 'revoke-ocr',
    ], {consentPath: target.consentPath, fs: failingSyncFs}));
    assert.equal(revoke.status, 5);
    assert.doesNotMatch(revoke.stderr, /CANARY/);
    assert.equal(inspectConsent({consentPath: target.consentPath}).state, 'ABSENT');
});

test('grant never overwrites a final path created during publication', (t) => {
    const target = fixture(t);
    const racingFs = {
        ...fs,
        linkSync(source, destination) {
            fs.writeFileSync(destination, '{"schemaVersion":1,"ocr":true,"raced":true}\n', {mode: 0o600});
            return fs.linkSync(source, destination);
        },
    };

    const result = capture(() => main([
        'consent', 'grant-ocr', '--approval=yes',
    ], {consentPath: target.consentPath, fs: racingFs}));

    assert.equal(result.status, 5);
    assert.deepEqual(JSON.parse(fs.readFileSync(target.consentPath, 'utf8')), {
        schemaVersion: 1,
        ocr: true,
        raced: true,
    });
    assert.deepEqual(fs.readdirSync(target.parent), ['prism-consent.json']);
});

test('path resolution and requireOcrConsent expose only the supported contract', (t) => {
    const target = fixture(t);
    assert.equal(resolveConsentPath({consentPath: target.consentPath}), target.consentPath);
    assert.throws(() => requireOcrConsent({consentPath: target.consentPath}), /standing OCR consent/);
    assert.equal(capture(() => main([
        'consent', 'grant-ocr', '--approval=yes',
    ], {consentPath: target.consentPath})).status, 0);
    assert.deepEqual(requireOcrConsent({consentPath: target.consentPath}), {
        state: 'GRANTED',
        path: target.consentPath,
    });
});

// vim: ft=javascript sts=4 sw=4 ts=4 et :
